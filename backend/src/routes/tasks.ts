import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { eq, and } from 'drizzle-orm';
import * as schema from '../db/schema/schema.js';
import { runAgentLoop } from '../utils/agentLoop.js';
import type { App } from '../index.js';

export function register(app: App, fastify: FastifyInstance) {
  const requireAuth = app.requireAuth();

  fastify.post('/api/tasks', {
    schema: {
      description: 'Create a new task',
      tags: ['tasks'],
      body: {
        type: 'object',
        required: ['user_goal'],
        properties: {
          user_goal: { type: 'string' },
          model_provider_id: { type: 'string', format: 'uuid' },
          tools_allowed: { type: 'array', items: { type: 'string' } },
          requires_user_approval: { type: 'boolean' },
          priority: { type: 'integer' },
        },
      },
      response: {
        201: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            user_goal: { type: 'string' },
            status: { type: 'string' },
            priority: { type: 'integer' },
            created_at: { type: 'string' },
            updated_at: { type: 'string' },
          },
        },
        400: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const session = await requireAuth(request, reply);
    if (!session) return;

    const body = request.body as any;
    const { user_goal, model_provider_id, tools_allowed, requires_user_approval, priority } = body;

    if (!user_goal || user_goal.trim().length === 0) {
      return reply.status(400).send({ error: 'user_goal is required' });
    }

    if (model_provider_id) {
      const provider = await app.db.query.modelProviders.findFirst({
        where: eq(schema.modelProviders.id, model_provider_id),
      });
      if (!provider || provider.userId !== session.user.id) {
        return reply.status(400).send({ error: 'Invalid model provider' });
      }
    }

    app.logger.info({ userId: session.user.id, goal: user_goal }, 'Creating task');

    const [created] = await app.db
      .insert(schema.tasks)
      .values({
        userId: session.user.id,
        userGoal: user_goal,
        status: 'pending',
        modelProviderId: model_provider_id,
        toolsAllowed: tools_allowed || [],
        requiresUserApproval: requires_user_approval !== false,
        priority: priority || 0,
      })
      .returning();

    app.logger.info({ userId: session.user.id, taskId: created.id }, 'Task created, starting agent loop');

    runAgentLoop(created.id, session.user.id, app).catch((err) => {
      app.logger.error({ err, taskId: created.id }, 'Agent loop error');
    });

    app.logger.info({ userId: session.user.id, taskId: created.id }, 'Task response sent');

    return reply.status(201).send({
      id: created.id,
      user_goal: created.userGoal,
      status: created.status,
      priority: created.priority,
      created_at: created.createdAt.toISOString(),
      updated_at: created.updatedAt.toISOString(),
    });
  });

  fastify.get('/api/tasks', {
    schema: {
      description: 'List user tasks',
      tags: ['tasks'],
      querystring: {
        type: 'object',
        properties: {
          status: { type: 'string' },
          limit: { type: 'integer', default: 20 },
          offset: { type: 'integer', default: 0 },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            tasks: { type: 'array' },
            total: { type: 'integer' },
            limit: { type: 'integer' },
            offset: { type: 'integer' },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const session = await requireAuth(request, reply);
    if (!session) return;

    const qs = request.query as any;
    const limit = Math.min(Math.max(1, parseInt(qs.limit) || 20), 100);
    const offset = Math.max(0, parseInt(qs.offset) || 0);

    app.logger.info({ userId: session.user.id, status: qs.status, limit, offset }, 'Fetching tasks');

    let whereCondition = eq(schema.tasks.userId, session.user.id);
    if (qs.status) {
      whereCondition = and(whereCondition, eq(schema.tasks.status, qs.status));
    }

    const tasks = await app.db
      .select()
      .from(schema.tasks)
      .where(whereCondition)
      .orderBy((t) => t.createdAt)
      .limit(limit)
      .offset(offset);

    const countResult = await app.db
      .select({ count: schema.tasks.id })
      .from(schema.tasks)
      .where(whereCondition);

    const total = countResult.length;

    return {
      tasks: tasks.map((t) => ({
        id: t.id,
        user_goal: t.userGoal,
        status: t.status,
        priority: t.priority,
        output: t.output,
        created_at: t.createdAt.toISOString(),
        updated_at: t.updatedAt.toISOString(),
      })),
      total,
      limit,
      offset,
    };
  });

  fastify.get('/api/tasks/:id', {
    schema: {
      description: 'Get task details with steps',
      tags: ['tasks'],
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', format: 'uuid' } },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            user_goal: { type: 'string' },
            status: { type: 'string' },
            priority: { type: 'integer' },
            output: { type: ['string', 'null'] },
            error_log: { type: ['string', 'null'] },
            current_step_index: { type: 'integer' },
            created_at: { type: 'string' },
            updated_at: { type: 'string' },
            steps: { type: 'array' },
          },
        },
        404: { type: 'object', properties: { error: { type: 'string' } } },
        403: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
  }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const session = await requireAuth(request, reply);
    if (!session) return;

    const { id } = request.params;
    const task = await app.db.query.tasks.findFirst({
      where: eq(schema.tasks.id, id),
    });

    if (!task) {
      return reply.status(404).send({ error: 'Task not found' });
    }

    if (task.userId !== session.user.id) {
      return reply.status(403).send({ error: 'Forbidden' });
    }

    const steps = await app.db
      .select()
      .from(schema.taskSteps)
      .where(eq(schema.taskSteps.taskId, id))
      .orderBy((s) => s.stepIndex);

    return {
      id: task.id,
      user_goal: task.userGoal,
      status: task.status,
      priority: task.priority,
      output: task.output,
      error_log: task.errorLog,
      current_step_index: task.currentStepIndex,
      created_at: task.createdAt.toISOString(),
      updated_at: task.updatedAt.toISOString(),
      steps: steps.map((s) => ({
        id: s.id,
        step_index: s.stepIndex,
        step_type: s.stepType,
        content: s.content,
        tool_name: s.toolName,
        status: s.status,
        created_at: s.createdAt.toISOString(),
      })),
    };
  });

  fastify.post('/api/tasks/:id/cancel', {
    schema: {
      description: 'Cancel a task',
      tags: ['tasks'],
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', format: 'uuid' } },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            status: { type: 'string' },
            updated_at: { type: 'string' },
          },
        },
        404: { type: 'object', properties: { error: { type: 'string' } } },
        403: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
  }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const session = await requireAuth(request, reply);
    if (!session) return;

    const { id } = request.params;
    const task = await app.db.query.tasks.findFirst({
      where: eq(schema.tasks.id, id),
    });

    if (!task) {
      return reply.status(404).send({ error: 'Task not found' });
    }

    if (task.userId !== session.user.id) {
      return reply.status(403).send({ error: 'Forbidden' });
    }

    if (!['completed', 'failed', 'cancelled'].includes(task.status)) {
      app.logger.info({ userId: session.user.id, taskId: id }, 'Cancelling task');

      const [updated] = await app.db
        .update(schema.tasks)
        .set({ status: 'cancelled', updatedAt: new Date() })
        .where(eq(schema.tasks.id, id))
        .returning();

      return {
        id: updated.id,
        status: updated.status,
        updated_at: updated.updatedAt.toISOString(),
      };
    }

    return {
      id: task.id,
      status: task.status,
      updated_at: task.updatedAt.toISOString(),
    };
  });

  fastify.post('/api/tasks/:id/approve', {
    schema: {
      description: 'Approve a task step waiting for approval',
      tags: ['tasks'],
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', format: 'uuid' } },
      },
      body: {
        type: 'object',
        required: ['step_id', 'approved'],
        properties: {
          step_id: { type: 'string', format: 'uuid' },
          approved: { type: 'boolean' },
          note: { type: 'string' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            ok: { type: 'boolean' },
            task_status: { type: 'string' },
          },
        },
        404: { type: 'object', properties: { error: { type: 'string' } } },
        403: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
  }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const session = await requireAuth(request, reply);
    if (!session) return;

    const { id } = request.params;
    const body = request.body as any;

    const task = await app.db.query.tasks.findFirst({
      where: eq(schema.tasks.id, id),
    });

    if (!task) {
      return reply.status(404).send({ error: 'Task not found' });
    }

    if (task.userId !== session.user.id) {
      return reply.status(403).send({ error: 'Forbidden' });
    }

    const step = await app.db.query.taskSteps.findFirst({
      where: eq(schema.taskSteps.id, body.step_id),
    });

    if (!step || step.taskId !== id) {
      return reply.status(404).send({ error: 'Step not found' });
    }

    app.logger.info(
      { userId: session.user.id, taskId: id, stepId: body.step_id, approved: body.approved },
      'Approving task step'
    );

    const newStatus = body.approved ? 'approved' : 'rejected';

    await app.db
      .update(schema.taskSteps)
      .set({ status: newStatus })
      .where(eq(schema.taskSteps.id, body.step_id));

    const responseStepIndex = (step.stepIndex || 0) + 1;

    await app.db
      .insert(schema.taskSteps)
      .values({
        taskId: id,
        stepIndex: responseStepIndex,
        stepType: 'approval_response',
        content: `User ${body.approved ? 'approved' : 'rejected'}: ${body.note || ''}`,
        status: 'completed',
      });

    await app.db
      .update(schema.tasks)
      .set({ status: 'running', currentStepIndex: responseStepIndex })
      .where(eq(schema.tasks.id, id));

    runAgentLoop(id, session.user.id, app).catch((err) => {
      app.logger.error({ err, taskId: id }, 'Agent loop error after approval');
    });

    return {
      ok: true,
      task_status: 'running',
    };
  });

  fastify.delete('/api/tasks/:id', {
    schema: {
      description: 'Delete a task',
      tags: ['tasks'],
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', format: 'uuid' } },
      },
      response: {
        204: { type: 'null' },
        404: { type: 'object', properties: { error: { type: 'string' } } },
        403: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
  }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const session = await requireAuth(request, reply);
    if (!session) return;

    const { id } = request.params;
    const task = await app.db.query.tasks.findFirst({
      where: eq(schema.tasks.id, id),
    });

    if (!task) {
      return reply.status(404).send({ error: 'Task not found' });
    }

    if (task.userId !== session.user.id) {
      return reply.status(403).send({ error: 'Forbidden' });
    }

    app.logger.info({ userId: session.user.id, taskId: id }, 'Deleting task');

    await app.db.delete(schema.tasks).where(eq(schema.tasks.id, id));

    return reply.status(204).send();
  });
}
