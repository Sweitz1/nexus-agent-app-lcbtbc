import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { eq } from 'drizzle-orm';
import * as schema from '../db/schema/schema.js';
import { encrypt, decrypt } from '../utils/encryption.js';
import type { App } from '../index.js';

export function register(app: App, fastify: FastifyInstance) {
  const requireAuth = app.requireAuth();

  fastify.get('/api/providers', {
    schema: {
      description: 'Get all model providers for the user',
      tags: ['providers'],
      response: {
        200: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              name: { type: 'string' },
              provider_type: { type: 'string' },
              base_url: { type: ['string', 'null'] },
              default_model: { type: 'string' },
              supports_tools: { type: 'boolean' },
              supports_vision: { type: 'boolean' },
              enabled: { type: 'boolean' },
              has_key: { type: 'boolean' },
              created_at: { type: 'string', format: 'date-time' },
            },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const session = await requireAuth(request, reply);
    if (!session) return;

    app.logger.info({ userId: session.user.id }, 'Fetching providers');

    const providers = await app.db
      .select()
      .from(schema.modelProviders)
      .where(eq(schema.modelProviders.userId, session.user.id));

    const result = providers.map((p) => ({
      id: p.id,
      name: p.name,
      provider_type: p.providerType,
      base_url: p.baseUrl,
      default_model: p.defaultModel,
      supports_tools: p.supportsTools,
      supports_vision: p.supportsVision,
      enabled: p.enabled,
      has_key: !!p.apiKeyEncrypted,
      created_at: p.createdAt.toISOString(),
    }));

    app.logger.info({ userId: session.user.id, count: result.length }, 'Providers fetched');
    return result;
  });

  fastify.post('/api/providers', {
    schema: {
      description: 'Create a new model provider',
      tags: ['providers'],
      body: {
        type: 'object',
        required: ['name', 'provider_type', 'api_key', 'default_model'],
        properties: {
          name: { type: 'string' },
          provider_type: { type: 'string', enum: ['openai', 'anthropic', 'google', 'openai_compatible', 'custom_rest'] },
          api_key: { type: 'string' },
          base_url: { type: 'string' },
          default_model: { type: 'string' },
          supports_tools: { type: 'boolean' },
          supports_vision: { type: 'boolean' },
        },
      },
      response: {
        201: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            provider_type: { type: 'string' },
            has_key: { type: 'boolean' },
          },
        },
        400: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const session = await requireAuth(request, reply);
    if (!session) return;

    const body = request.body as any;
    const { name, provider_type, api_key, base_url, default_model, supports_tools, supports_vision } = body;

    if (!name || !provider_type || !api_key || !default_model) {
      return reply.status(400).send({ error: 'Missing required fields' });
    }

    app.logger.info({ userId: session.user.id, name }, 'Creating provider');

    const [created] = await app.db
      .insert(schema.modelProviders)
      .values({
        userId: session.user.id,
        name,
        providerType: provider_type as any,
        apiKeyEncrypted: encrypt(api_key),
        baseUrl: base_url,
        defaultModel: default_model,
        supportsTools: supports_tools !== false,
        supportsVision: supports_vision === true,
      })
      .returning();

    app.logger.info({ userId: session.user.id, providerId: created.id }, 'Provider created');

    return reply.status(201).send({
      id: created.id,
      name: created.name,
      provider_type: created.providerType,
      default_model: created.defaultModel,
      has_key: true,
      created_at: created.createdAt.toISOString(),
    });
  });

  fastify.patch('/api/providers/:id', {
    schema: {
      description: 'Update a model provider',
      tags: ['providers'],
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', format: 'uuid' } },
      },
      body: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          base_url: { type: 'string' },
          default_model: { type: 'string' },
          api_key: { type: 'string' },
          supports_tools: { type: 'boolean' },
          supports_vision: { type: 'boolean' },
          enabled: { type: 'boolean' },
        },
      },
      response: {
        200: { type: 'object' },
        404: { type: 'object', properties: { error: { type: 'string' } } },
        403: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
  }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const session = await requireAuth(request, reply);
    if (!session) return;

    const { id } = request.params;
    const body = request.body as any;
    const provider = await app.db.query.modelProviders.findFirst({
      where: eq(schema.modelProviders.id, id),
    });

    if (!provider) {
      return reply.status(404).send({ error: 'Provider not found' });
    }

    if (provider.userId !== session.user.id) {
      return reply.status(403).send({ error: 'Forbidden' });
    }

    const updateData: any = {};
    if (body.name) updateData.name = body.name;
    if (body.base_url) updateData.baseUrl = body.base_url;
    if (body.default_model) updateData.defaultModel = body.default_model;
    if (body.api_key) updateData.apiKeyEncrypted = encrypt(body.api_key);
    if (body.supports_tools !== undefined) updateData.supportsTools = body.supports_tools;
    if (body.supports_vision !== undefined) updateData.supportsVision = body.supports_vision;
    if (body.enabled !== undefined) updateData.enabled = body.enabled;

    app.logger.info({ userId: session.user.id, providerId: id }, 'Updating provider');

    const [updated] = await app.db
      .update(schema.modelProviders)
      .set(updateData)
      .where(eq(schema.modelProviders.id, id))
      .returning();

    return {
      id: updated.id,
      name: updated.name,
      provider_type: updated.providerType,
      base_url: updated.baseUrl,
      default_model: updated.defaultModel,
      has_key: !!updated.apiKeyEncrypted,
    };
  });

  fastify.delete('/api/providers/:id', {
    schema: {
      description: 'Delete a model provider',
      tags: ['providers'],
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
    const provider = await app.db.query.modelProviders.findFirst({
      where: eq(schema.modelProviders.id, id),
    });

    if (!provider) {
      return reply.status(404).send({ error: 'Provider not found' });
    }

    if (provider.userId !== session.user.id) {
      return reply.status(403).send({ error: 'Forbidden' });
    }

    app.logger.info({ userId: session.user.id, providerId: id }, 'Deleting provider');

    await app.db.delete(schema.modelProviders).where(eq(schema.modelProviders.id, id));

    return reply.status(204).send();
  });

  fastify.post('/api/providers/:id/test', {
    schema: {
      description: 'Test provider API connection',
      tags: ['providers'],
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', format: 'uuid' } },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            ok: { type: 'boolean' },
            message: { type: 'string' },
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
    const provider = await app.db.query.modelProviders.findFirst({
      where: eq(schema.modelProviders.id, id),
    });

    if (!provider) {
      return reply.status(404).send({ error: 'Provider not found' });
    }

    if (provider.userId !== session.user.id) {
      return reply.status(403).send({ error: 'Forbidden' });
    }

    app.logger.info({ userId: session.user.id, providerId: id, type: provider.providerType }, 'Testing provider');

    try {
      const key = decrypt(provider.apiKeyEncrypted);

      if (provider.providerType === 'openai' || provider.providerType === 'openai_compatible') {
        const baseUrl = provider.baseUrl || 'https://api.openai.com';
        const response = await fetch(`${baseUrl}/v1/models`, {
          headers: { Authorization: `Bearer ${key}` },
        });
        if (response.ok) {
          return { ok: true, message: 'Connection successful' };
        }
        return { ok: false, message: `API returned ${response.status}` };
      }

      if (provider.providerType === 'anthropic') {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': key,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model: provider.defaultModel,
            max_tokens: 10,
            messages: [{ role: 'user', content: 'test' }],
          }),
        });
        if (response.ok || response.status === 400) {
          return { ok: true, message: 'Connection successful' };
        }
        return { ok: false, message: `API returned ${response.status}` };
      }

      if (provider.providerType === 'google') {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1/models?key=${key}`);
        if (response.ok) {
          return { ok: true, message: 'Connection successful' };
        }
        return { ok: false, message: `API returned ${response.status}` };
      }

      if (provider.providerType === 'custom_rest') {
        const baseUrl = provider.baseUrl || '';
        const response = await fetch(baseUrl, {
          headers: { Authorization: `Bearer ${key}` },
        });
        return { ok: true, message: `Connection returned ${response.status}` };
      }

      return { ok: false, message: 'Unknown provider type' };
    } catch (err) {
      app.logger.error({ err, providerId: id }, 'Provider test failed');
      return { ok: false, message: (err as Error).message };
    }
  });
}
