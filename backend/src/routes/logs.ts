import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { eq, and } from 'drizzle-orm';
import * as schema from '../db/schema/schema.js';
import type { App } from '../index.js';

export function register(app: App, fastify: FastifyInstance) {
  const requireAuth = app.requireAuth();

  fastify.get('/api/logs', {
    schema: {
      description: 'Get user logs',
      tags: ['logs'],
      querystring: {
        type: 'object',
        properties: {
          task_id: { type: 'string', format: 'uuid' },
          level: { type: 'string', enum: ['info', 'warn', 'error'] },
          limit: { type: 'integer', default: 100 },
        },
      },
      response: {
        200: {
          type: 'array',
          items: { type: 'object' },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const session = await requireAuth(request, reply);
    if (!session) return;

    const qs = request.query as any;
    app.logger.info({ userId: session.user.id, level: qs.level }, 'Fetching logs');

    let whereCondition = eq(schema.logs.userId, session.user.id);

    if (qs.task_id) {
      whereCondition = and(whereCondition, eq(schema.logs.taskId, qs.task_id));
    }

    if (qs.level) {
      whereCondition = and(whereCondition, eq(schema.logs.level, qs.level));
    }

    const limit = Math.min(Math.max(1, parseInt(qs.limit) || 100), 500);

    const results = await app.db
      .select()
      .from(schema.logs)
      .where(whereCondition)
      .orderBy((l) => l.createdAt)
      .limit(limit);

    return results.map((l) => ({
      id: l.id,
      task_id: l.taskId,
      level: l.level,
      message: l.message,
      metadata: l.metadata,
      created_at: l.createdAt.toISOString(),
    }));
  });
}
