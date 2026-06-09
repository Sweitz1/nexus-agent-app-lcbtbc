import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { eq, and, ilike } from 'drizzle-orm';
import * as schema from '../db/schema/schema.js';
import type { App } from '../index.js';

export function register(app: App, fastify: FastifyInstance) {
  const requireAuth = app.requireAuth();

  fastify.get('/api/memory', {
    schema: {
      description: 'Search user memory',
      tags: ['memory'],
      querystring: {
        type: 'object',
        properties: {
          type: { type: 'string' },
          task_id: { type: 'string', format: 'uuid' },
          q: { type: 'string' },
          limit: { type: 'integer', default: 50 },
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
    app.logger.info({ userId: session.user.id, type: qs.type, query: qs.q }, 'Searching memory');

    let whereCondition = eq(schema.memory.userId, session.user.id);

    if (qs.type) {
      whereCondition = and(whereCondition, eq(schema.memory.memoryType, qs.type));
    }

    if (qs.task_id) {
      whereCondition = and(whereCondition, eq(schema.memory.taskId, qs.task_id));
    }

    if (qs.q) {
      whereCondition = and(whereCondition, ilike(schema.memory.content, `%${qs.q}%`));
    }

    const limit = Math.min(Math.max(1, parseInt(qs.limit) || 50), 100);

    const results = await app.db
      .select()
      .from(schema.memory)
      .where(whereCondition)
      .orderBy((m) => m.importanceScore)
      .limit(limit);

    return results.map((m) => ({
      id: m.id,
      memory_type: m.memoryType,
      content: m.content,
      tags: m.tags,
      importance_score: parseFloat(m.importanceScore.toString()),
      created_at: m.createdAt.toISOString(),
    }));
  });

  fastify.post('/api/memory', {
    schema: {
      description: 'Create a memory entry',
      tags: ['memory'],
      body: {
        type: 'object',
        required: ['memory_type', 'content'],
        properties: {
          memory_type: { type: 'string', enum: ['short_term', 'long_term', 'task', 'project', 'conversation', 'tool_result', 'user_preference'] },
          content: { type: 'string' },
          tags: { type: 'array', items: { type: 'string' } },
          importance_score: { type: 'number' },
        },
      },
      response: {
        201: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            memory_type: { type: 'string' },
            content: { type: 'string' },
            tags: { type: 'array' },
            importance_score: { type: 'number' },
            created_at: { type: 'string' },
          },
        },
        400: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const session = await requireAuth(request, reply);
    if (!session) return;

    const body = request.body as any;
    const { memory_type, content, tags, importance_score } = body;

    if (!memory_type || !content) {
      return reply.status(400).send({ error: 'Missing required fields' });
    }

    app.logger.info({ userId: session.user.id, type: memory_type }, 'Creating memory');

    const [created] = await app.db
      .insert(schema.memory)
      .values({
        userId: session.user.id,
        memoryType: memory_type as any,
        content,
        tags: tags || [],
        importanceScore: (importance_score || 0.5).toString(),
        source: 'manual',
      })
      .returning();

    app.logger.info({ userId: session.user.id, memoryId: created.id }, 'Memory created');

    return reply.status(201).send({
      id: created.id,
      memory_type: created.memoryType,
      content: created.content,
      tags: created.tags,
      importance_score: parseFloat(created.importanceScore.toString()),
      created_at: created.createdAt.toISOString(),
    });
  });

  fastify.delete('/api/memory/:id', {
    schema: {
      description: 'Delete a memory entry',
      tags: ['memory'],
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
    const memEntry = await app.db.query.memory.findFirst({
      where: eq(schema.memory.id, id),
    });

    if (!memEntry) {
      return reply.status(404).send({ error: 'Memory not found' });
    }

    if (memEntry.userId !== session.user.id) {
      return reply.status(403).send({ error: 'Forbidden' });
    }

    app.logger.info({ userId: session.user.id, memoryId: id }, 'Deleting memory');

    await app.db.delete(schema.memory).where(eq(schema.memory.id, id));

    return reply.status(204).send();
  });
}
