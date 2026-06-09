import { eq, and } from 'drizzle-orm';
import * as schema from '../db/schema/schema.js';
import { toolRegistry } from './tools.js';
import { decrypt } from './encryption.js';
import type { App } from '../index.js';

async function callLLM(prompt: string, provider: any | null, maxTokens = 2048): Promise<string> {
  if (!provider || provider.providerType === 'google') {
    const key = provider ? decrypt(provider.apiKeyEncrypted) : (process.env.GOOGLE_API_KEY || '');
    const model = provider?.defaultModel || 'gemini-2.5-flash';
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: maxTokens },
        }),
      }
    );
    if (!res.ok) throw new Error(`Google API error: ${res.status}`);
    const d = await res.json() as any;
    return d.candidates?.[0]?.content?.parts?.[0]?.text || '';
  }

  if (provider.providerType === 'openai' || provider.providerType === 'openai_compatible') {
    const key = decrypt(provider.apiKeyEncrypted);
    const baseUrl = (provider.baseUrl || 'https://api.openai.com').replace(/\/$/, '');
    const res = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: provider.defaultModel,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: maxTokens,
        temperature: 0.7,
      }),
    });
    if (!res.ok) throw new Error(`OpenAI API error: ${res.status}`);
    const d = await res.json() as any;
    return d.choices?.[0]?.message?.content || '';
  }

  if (provider.providerType === 'anthropic') {
    const key = decrypt(provider.apiKeyEncrypted);
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: provider.defaultModel,
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!res.ok) throw new Error(`Anthropic API error: ${res.status}`);
    const d = await res.json() as any;
    return d.content?.[0]?.text || '';
  }

  throw new Error(`Unsupported provider type: ${provider?.providerType}`);
}

export async function runAgentLoop(taskId: string, userId: string, app: App): Promise<void> {
  try {
    const task = await app.db.query.tasks.findFirst({
      where: eq(schema.tasks.id, taskId),
    });

    if (!task || task.userId !== userId) {
      app.logger.error({ taskId, userId }, 'Task not found or unauthorized');
      return;
    }

    const perms = await app.db.query.permissions.findFirst({
      where: eq(schema.permissions.userId, userId),
    });
    let permissions = perms;
    if (!permissions) {
      const [created] = await app.db.insert(schema.permissions).values({ userId }).returning();
      permissions = created;
    }

    let provider = null;
    if (task.modelProviderId) {
      provider = await app.db.query.modelProviders.findFirst({
        where: eq(schema.modelProviders.id, task.modelProviderId),
      });
    }

    // Load existing steps to detect resume scenario
    const existingSteps = await app.db
      .select()
      .from(schema.taskSteps)
      .where(eq(schema.taskSteps.taskId, taskId))
      .orderBy((s) => s.stepIndex);

    const planStep = existingSteps.find((s) => s.stepType === 'plan');
    const approvedStep = existingSteps.find(
      (s) => s.stepType === 'approval_request' && s.status === 'approved'
    );

    let plan: { steps: Array<{ thought: string; tool: string | null; input: any }>; summary: string };
    let resumeFromPlanIndex = 0;
    let stepIndex = existingSteps.length > 0
      ? Math.max(...existingSteps.map((s) => s.stepIndex)) + 1
      : 1;

    if (planStep && approvedStep) {
      // Resume after user approval — load the stored plan, execute the approved tool
      plan = (planStep.toolOutput as any) || { steps: [], summary: '' };
      const approvalInput = approvedStep.toolInput as any;
      const planItemIndex: number = approvalInput?.plan_item_index ?? 0;
      const toolName: string = approvalInput?.tool_name;
      const toolInput: any = approvalInput?.tool_input || {};

      await app.db
        .update(schema.tasks)
        .set({ status: 'running' })
        .where(eq(schema.tasks.id, taskId));

      if (toolName) {
        try {
          const toolFunc = toolRegistry[toolName as keyof typeof toolRegistry];
          if (toolFunc) {
            const toolResult = await toolFunc(userId, toolInput, permissions, app);
            await app.db.insert(schema.taskSteps).values({
              taskId,
              stepIndex: stepIndex++,
              stepType: 'tool_call',
              content: `Calling ${toolName}`,
              toolName,
              toolInput,
              status: 'completed',
            });
            await app.db.insert(schema.taskSteps).values({
              taskId,
              stepIndex: stepIndex++,
              stepType: 'tool_result',
              content: JSON.stringify(toolResult),
              toolOutput: toolResult,
              status: 'completed',
            });
          }
        } catch (toolErr) {
          app.logger.error({ err: toolErr, taskId, toolName }, 'Approved tool failed');
          await app.db.insert(schema.logs).values({
            userId,
            taskId,
            level: 'error',
            message: `Tool ${toolName} failed: ${(toolErr as Error).message}`,
            metadata: { toolName, error: (toolErr as Error).message },
          });
        }
      }
      resumeFromPlanIndex = planItemIndex + 1;
    } else {
      // Fresh run — plan the task
      await app.db.update(schema.tasks).set({ status: 'planning' }).where(eq(schema.tasks.id, taskId));

      const recentMemory = await app.db
        .select()
        .from(schema.memory)
        .where(eq(schema.memory.userId, userId))
        .orderBy((m) => m.importanceScore)
        .limit(10);

      const memorySummary = recentMemory.map((m) => `[${m.memoryType}] ${m.content}`).join('\n');
      const toolsAllowed = (task.toolsAllowed as any) || [];
      const toolList = Array.isArray(toolsAllowed) && toolsAllowed.length > 0
        ? toolsAllowed.join(', ')
        : 'web_fetch, file_read, file_write, memory_search, memory_write, github_read, github_list, github_write, custom_api_call';

      const plannerPrompt = `You are an autonomous AI agent. Your goal is: ${task.userGoal}

Available tools: ${toolList}

Recent memory context:
${memorySummary || '(no memory)'}

Create a detailed execution plan. Respond with ONLY valid JSON in this exact format:
{
  "steps": [
    { "thought": "why I'm doing this", "tool": "tool_name_or_null", "input": { "param": "value" } }
  ],
  "summary": "brief plan summary"
}

Tool names: web_fetch, github_read, github_list, github_write, custom_api_call, memory_search, memory_write, file_read, file_write, file_delete
Set tool to null if no tool is needed. Keep plan to 3-7 steps.`;

      plan = { steps: [], summary: '' };
      try {
        const text = await callLLM(plannerPrompt, provider);
        const match = text.match(/\{[\s\S]*\}/);
        if (match) plan = JSON.parse(match[0]);
      } catch (err) {
        app.logger.error({ err, taskId }, 'AI planning failed');
      }

      await app.db.insert(schema.taskSteps).values({
        taskId,
        stepIndex: 0,
        stepType: 'plan',
        content: plan.summary || 'Plan created',
        toolOutput: plan as any,
        status: 'completed',
      });

      await app.db.update(schema.tasks).set({ status: 'running' }).where(eq(schema.tasks.id, taskId));
      stepIndex = 1;
    }

    // Execute plan steps
    for (let i = resumeFromPlanIndex; i < (plan.steps || []).length; i++) {
      const planItem = plan.steps[i];

      await app.db.insert(schema.taskSteps).values({
        taskId,
        stepIndex: stepIndex++,
        stepType: 'thought',
        content: planItem.thought || '',
        status: 'completed',
      });

      if (!planItem.tool) continue;

      const toolName = planItem.tool;
      const toolInput = planItem.input || {};

      const needsApproval =
        toolName === 'file_delete' ||
        toolName === 'github_write' ||
        (permissions.requireConfirmationForRisky &&
          ['file_write', 'file_delete', 'github_write'].includes(toolName));

      if (needsApproval && task.requiresUserApproval) {
        await app.db.insert(schema.taskSteps).values({
          taskId,
          stepIndex: stepIndex++,
          stepType: 'approval_request',
          content: `Approval required for: ${toolName}\nInput: ${JSON.stringify(toolInput, null, 2)}`,
          toolName,
          toolInput: { tool_name: toolName, tool_input: toolInput, plan_item_index: i },
          status: 'awaiting_approval',
        });

        await app.db
          .update(schema.tasks)
          .set({ status: 'waiting_for_approval', currentStepIndex: stepIndex - 1 })
          .where(eq(schema.tasks.id, taskId));

        app.logger.info({ taskId, planItemIndex: i, toolName }, 'Waiting for approval');
        return;
      }

      try {
        const toolFunc = toolRegistry[toolName as keyof typeof toolRegistry];
        if (!toolFunc) throw new Error(`Unknown tool: ${toolName}`);

        const toolResult = await toolFunc(userId, toolInput, permissions, app);

        if (toolResult.needs_approval && task.requiresUserApproval) {
          await app.db.insert(schema.taskSteps).values({
            taskId,
            stepIndex: stepIndex++,
            stepType: 'approval_request',
            content: `Approval required for: ${toolName}\nInput: ${JSON.stringify(toolInput, null, 2)}`,
            toolName,
            toolInput: { tool_name: toolName, tool_input: toolInput, plan_item_index: i },
            status: 'awaiting_approval',
          });

          await app.db
            .update(schema.tasks)
            .set({ status: 'waiting_for_approval', currentStepIndex: stepIndex - 1 })
            .where(eq(schema.tasks.id, taskId));

          return;
        }

        await app.db.insert(schema.taskSteps).values({
          taskId,
          stepIndex: stepIndex++,
          stepType: 'tool_call',
          content: `Calling ${toolName}`,
          toolName,
          toolInput,
          status: 'completed',
        });

        await app.db.insert(schema.taskSteps).values({
          taskId,
          stepIndex: stepIndex++,
          stepType: 'tool_result',
          content: JSON.stringify(toolResult),
          toolOutput: toolResult,
          status: 'completed',
        });

        app.logger.info({ taskId, toolName, planItemIndex: i }, 'Tool executed');
      } catch (toolErr) {
        app.logger.error({ err: toolErr, taskId, toolName }, 'Tool failed');
        await app.db.insert(schema.logs).values({
          userId,
          taskId,
          level: 'error',
          message: `Tool ${toolName} failed: ${(toolErr as Error).message}`,
          metadata: { toolName, error: (toolErr as Error).message },
        });
      }
    }

    // Reflection
    const [reflectionStep] = await app.db
      .insert(schema.taskSteps)
      .values({
        taskId,
        stepIndex: stepIndex++,
        stepType: 'reflection',
        content: 'Analyzing results...',
        status: 'pending',
      })
      .returning();

    let finalAnswer = 'Task completed.';
    try {
      const allSteps = await app.db
        .select()
        .from(schema.taskSteps)
        .where(eq(schema.taskSteps.taskId, taskId));

      const toolResults = allSteps
        .filter((s) => s.stepType === 'tool_result')
        .map((s) => s.content)
        .join('\n\n');

      const reflectionPrompt = `You completed the task: "${task.userGoal}"

Tool results:
${toolResults || '(no tool results — plan required no external tools)'}

Write a concise final summary of what was accomplished and any key findings.`;

      finalAnswer = await callLLM(reflectionPrompt, provider, 512);
    } catch (err) {
      app.logger.warn({ err, taskId }, 'Reflection failed');
    }

    await app.db
      .update(schema.taskSteps)
      .set({ content: finalAnswer, status: 'completed' })
      .where(eq(schema.taskSteps.id, reflectionStep.id));

    await app.db.insert(schema.taskSteps).values({
      taskId,
      stepIndex: stepIndex++,
      stepType: 'final',
      content: finalAnswer,
      status: 'completed',
    });

    await app.db
      .update(schema.tasks)
      .set({ status: 'completed', output: finalAnswer, updatedAt: new Date() })
      .where(eq(schema.tasks.id, taskId));

    await app.db.insert(schema.memory).values({
      userId,
      memoryType: 'task',
      content: `Completed: ${task.userGoal}. Result: ${finalAnswer.substring(0, 500)}`,
      taskId,
      importanceScore: '0.7',
      source: 'agent',
    });

    app.logger.info({ taskId }, 'Task completed successfully');
  } catch (err) {
    app.logger.error({ err, taskId }, 'Agent loop failed');

    await app.db
      .update(schema.tasks)
      .set({ status: 'failed', errorLog: (err as Error).message, updatedAt: new Date() })
      .where(eq(schema.tasks.id, taskId));

    await app.db.insert(schema.logs).values({
      userId,
      taskId,
      level: 'error',
      message: `Agent loop failed: ${(err as Error).message}`,
      metadata: {},
    });
  }
}
