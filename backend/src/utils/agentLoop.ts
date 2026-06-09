import { eq } from 'drizzle-orm';
import * as schema from '../db/schema/schema.js';
import { toolRegistry } from './tools.js';
import type { App } from '../index.js';

export async function runAgentLoop(taskId: string, userId: string, app: App): Promise<void> {
  try {
    const task = await app.db.query.tasks.findFirst({
      where: eq(schema.tasks.id, taskId),
    });

    if (!task) {
      app.logger.error({ taskId }, 'Task not found');
      return;
    }

    if (task.userId !== userId) {
      app.logger.error({ taskId, userId }, 'Unauthorized access to task');
      return;
    }

    await app.db
      .update(schema.tasks)
      .set({ status: 'planning' })
      .where(eq(schema.tasks.id, taskId));

    const perms = await app.db.query.permissions.findFirst({
      where: eq(schema.permissions.userId, userId),
    });

    let permissions = perms;
    if (!permissions) {
      const [created] = await app.db
        .insert(schema.permissions)
        .values({ userId })
        .returning();
      permissions = created;
    }

    const recentMemory = await app.db
      .select()
      .from(schema.memory)
      .where(eq(schema.memory.userId, userId))
      .orderBy((memory) => memory.importanceScore)
      .limit(10);

    let provider = null;
    if (task.modelProviderId) {
      provider = await app.db.query.modelProviders.findFirst({
        where: eq(schema.modelProviders.id, task.modelProviderId),
      });
    }

    const memorySummary = recentMemory.map((m) => `[${m.memoryType}] ${m.content}`).join('\n');
    const toolsAllowed = (task.toolsAllowed as any) || [];

    const plannerPrompt = `You are an autonomous AI agent. Your goal is: ${task.userGoal}

Available tools: ${Array.isArray(toolsAllowed) && toolsAllowed.length > 0 ? toolsAllowed.join(', ') : 'none'}

Recent memory context:
${memorySummary || '(no memory)'}

Create a detailed execution plan. Respond with ONLY valid JSON in this exact format:
{
  "steps": [
    { "thought": "why I'm doing this", "tool": "tool_name_or_null", "input": { "param": "value" } }
  ],
  "summary": "brief plan summary"
}

Available tool names: web_fetch, github_read, github_list, custom_api_call, memory_search, memory_write, file_read, file_write, file_delete
If no tool is needed for a step, set tool to null.
Keep the plan to 3-7 steps maximum.`;

    const [planStep] = await app.db
      .insert(schema.taskSteps)
      .values({
        taskId,
        stepIndex: 0,
        stepType: 'plan',
        content: 'Starting planning...',
        status: 'pending',
      })
      .returning();

    let plan: any = { steps: [] };
    try {
      const aiResponse = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': process.env.GOOGLE_API_KEY || '',
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: plannerPrompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 1024 },
        }),
      });

      if (aiResponse.ok) {
        const aiData = await aiResponse.json() as any;
        const textContent = aiData.candidates?.[0]?.content?.parts?.[0]?.text || '';
        try {
          const jsonMatch = textContent.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            plan = JSON.parse(jsonMatch[0]);
          }
        } catch {
          app.logger.warn({ taskId }, 'Failed to parse plan JSON');
        }
      }
    } catch (err) {
      app.logger.error({ err, taskId }, 'AI planning failed');
    }

    await app.db
      .update(schema.taskSteps)
      .set({ content: plan.summary || 'Plan created', status: 'completed' })
      .where(eq(schema.taskSteps.id, planStep.id));

    await app.db
      .update(schema.tasks)
      .set({ status: 'running' })
      .where(eq(schema.tasks.id, taskId));

    let stepIndex = 1;
    for (const planItem of plan.steps || []) {
      const [thoughtStep] = await app.db
        .insert(schema.taskSteps)
        .values({
          taskId,
          stepIndex,
          stepType: 'thought',
          content: planItem.thought || '',
          status: 'completed',
        })
        .returning();

      stepIndex++;

      if (!planItem.tool) {
        continue;
      }

      const toolName = planItem.tool;
      const toolInput = planItem.input || {};

      const needsApproval =
        toolName === 'file_delete' ||
        toolName === 'github_write' ||
        (toolName === 'custom_api_call' && toolInput.endpoint_id) ||
        (permissions.requireConfirmationForRisky &&
          ['file_write', 'file_delete', 'github_write'].includes(toolName));

      if (needsApproval && task.requiresUserApproval) {
        const [approvalStep] = await app.db
          .insert(schema.taskSteps)
          .values({
            taskId,
            stepIndex,
            stepType: 'approval_request',
            content: `Approval required for tool: ${toolName} with input: ${JSON.stringify(toolInput)}`,
            toolName,
            toolInput,
            status: 'awaiting_approval',
          })
          .returning();

        await app.db
          .update(schema.tasks)
          .set({ status: 'waiting_for_approval', currentStepIndex: stepIndex })
          .where(eq(schema.tasks.id, taskId));

        app.logger.info(
          { taskId, stepIndex, toolName },
          'Task waiting for user approval'
        );
        return;
      }

      try {
        const toolFunc = toolRegistry[toolName as keyof typeof toolRegistry];
        if (!toolFunc) {
          throw new Error(`Unknown tool: ${toolName}`);
        }

        const toolResult = await toolFunc(userId, toolInput, permissions, app);

        if (toolResult.needs_approval && task.requiresUserApproval) {
          const [approvalStep] = await app.db
            .insert(schema.taskSteps)
            .values({
              taskId,
              stepIndex,
              stepType: 'approval_request',
              content: `Approval required for tool: ${toolName} with input: ${JSON.stringify(toolInput)}`,
              toolName,
              toolInput,
              status: 'awaiting_approval',
            })
            .returning();

          await app.db
            .update(schema.tasks)
            .set({ status: 'waiting_for_approval', currentStepIndex: stepIndex })
            .where(eq(schema.tasks.id, taskId));

          return;
        }

        const [callStep] = await app.db
          .insert(schema.taskSteps)
          .values({
            taskId,
            stepIndex: stepIndex + 1,
            stepType: 'tool_call',
            content: `Calling ${toolName}`,
            toolName,
            toolInput,
            status: 'completed',
          })
          .returning();

        const [resultStep] = await app.db
          .insert(schema.taskSteps)
          .values({
            taskId,
            stepIndex: stepIndex + 2,
            stepType: 'tool_result',
            content: JSON.stringify(toolResult),
            toolOutput: toolResult,
            status: 'completed',
          })
          .returning();

        app.logger.info(
          { taskId, toolName, stepIndex },
          'Tool executed successfully'
        );

        stepIndex += 3;
      } catch (toolErr) {
        app.logger.error(
          { err: toolErr, taskId, toolName },
          'Tool execution failed'
        );

        await app.db.insert(schema.logs).values({
          userId,
          taskId,
          level: 'error',
          message: `Tool ${toolName} failed: ${(toolErr as Error).message}`,
          metadata: { toolName, error: (toolErr as Error).message },
        });

        stepIndex++;
      }
    }

    const [reflectionStep] = await app.db
      .insert(schema.taskSteps)
      .values({
        taskId,
        stepIndex,
        stepType: 'reflection',
        content: 'Analyzing results...',
        status: 'pending',
      })
      .returning();

    stepIndex++;

    let finalAnswer = 'Task completed.';
    try {
      const steps = await app.db
        .select()
        .from(schema.taskSteps)
        .where(eq(schema.taskSteps.taskId, taskId));

      const toolResults = steps
        .filter((s) => s.stepType === 'tool_result')
        .map((s) => s.content)
        .join('\n\n');

      const reflectionPrompt = `Based on the execution of the task "${task.userGoal}", here are the results:

${toolResults || '(no tool results)'}

Provide a final summary of what was accomplished.`;

      const aiResponse = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': process.env.GOOGLE_API_KEY || '',
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: reflectionPrompt }] }],
          generationConfig: { temperature: 0.5, maxOutputTokens: 512 },
        }),
      });

      if (aiResponse.ok) {
        const aiData = await aiResponse.json() as any;
        finalAnswer = aiData.candidates?.[0]?.content?.parts?.[0]?.text || finalAnswer;
      }
    } catch (err) {
      app.logger.warn({ err, taskId }, 'AI reflection failed');
    }

    await app.db
      .update(schema.taskSteps)
      .set({ content: finalAnswer, status: 'completed' })
      .where(eq(schema.taskSteps.id, reflectionStep.id));

    const [finalStep] = await app.db
      .insert(schema.taskSteps)
      .values({
        taskId,
        stepIndex,
        stepType: 'final',
        content: finalAnswer,
        status: 'completed',
      })
      .returning();

    await app.db
      .update(schema.tasks)
      .set({ status: 'completed', output: finalAnswer, updatedAt: new Date() })
      .where(eq(schema.tasks.id, taskId));

    await app.db.insert(schema.memory).values({
      userId,
      memoryType: 'task',
      content: `Completed task: ${task.userGoal}. Result: ${finalAnswer}`,
      taskId,
      importanceScore: '0.7',
      source: 'manual',
    });

    app.logger.info({ taskId }, 'Task completed successfully');
  } catch (err) {
    app.logger.error({ err, taskId }, 'Agent loop failed');

    await app.db
      .update(schema.tasks)
      .set({
        status: 'failed',
        errorLog: (err as Error).message,
        updatedAt: new Date(),
      })
      .where(eq(schema.tasks.id, taskId));

    await app.db.insert(schema.logs).values({
      userId,
      taskId,
      level: 'error',
      message: `Agent loop failed: ${(err as Error).message}`,
    });
  }
}
