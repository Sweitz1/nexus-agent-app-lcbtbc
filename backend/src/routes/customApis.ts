import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { eq } from 'drizzle-orm';
import * as schema from '../db/schema/schema.js';
import { encrypt, decrypt } from '../utils/encryption.js';
import type { App } from '../index.js';

export function register(app: App, fastify: FastifyInstance) {
  const requireAuth = app.requireAuth();

  fastify.get('/api/custom-apis', {
    schema: {
      description: 'Get all custom APIs for the user',
      tags: ['custom-apis'],
      response: {
        200: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              base_url: { type: 'string' },
              auth_type: { type: 'string' },
              has_secret: { type: 'boolean' },
              endpoints: { type: 'array' },
            },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const session = await requireAuth(request, reply);
    if (!session) return;

    app.logger.info({ userId: session.user.id }, 'Fetching custom APIs');

    const apis = await app.db
      .select()
      .from(schema.customApis)
      .where(eq(schema.customApis.userId, session.user.id));

    const result = [];
    for (const api of apis) {
      const endpoints = await app.db
        .select()
        .from(schema.customApiEndpoints)
        .where(eq(schema.customApiEndpoints.apiId, api.id));

      result.push({
        id: api.id,
        name: api.name,
        base_url: api.baseUrl,
        auth_type: api.authType,
        has_secret: !!api.authSecretEncrypted,
        enabled: api.enabled,
        sensitive: api.sensitive,
        endpoints: endpoints.map((e) => ({
          id: e.id,
          name: e.name,
          method: e.method,
          path: e.path,
          description: e.description,
          requires_confirmation: e.requiresConfirmation,
          enabled: e.enabled,
        })),
      });
    }

    app.logger.info({ userId: session.user.id, count: result.length }, 'Custom APIs fetched');
    return result;
  });

  fastify.post('/api/custom-apis', {
    schema: {
      description: 'Create a new custom API',
      tags: ['custom-apis'],
      body: {
        type: 'object',
        required: ['name', 'base_url', 'auth_type'],
        properties: {
          name: { type: 'string' },
          base_url: { type: 'string' },
          auth_type: { type: 'string', enum: ['none', 'api_key', 'bearer'] },
          auth_header_name: { type: 'string' },
          auth_secret: { type: 'string' },
          default_headers: { type: 'object' },
          sensitive: { type: 'boolean' },
        },
      },
      response: {
        201: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            base_url: { type: 'string' },
            auth_type: { type: 'string' },
            has_secret: { type: 'boolean' },
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
    const { name, base_url, auth_type, auth_header_name, auth_secret, default_headers, sensitive } = body;

    if (!name || !base_url || !auth_type) {
      return reply.status(400).send({ error: 'Missing required fields' });
    }

    app.logger.info({ userId: session.user.id, name }, 'Creating custom API');

    const [created] = await app.db
      .insert(schema.customApis)
      .values({
        userId: session.user.id,
        name,
        baseUrl: base_url,
        authType: auth_type as any,
        authHeaderName: auth_header_name,
        authSecretEncrypted: auth_secret ? encrypt(auth_secret) : null,
        defaultHeaders: default_headers || {},
        sensitive: sensitive === true,
      })
      .returning();

    app.logger.info({ userId: session.user.id, apiId: created.id }, 'Custom API created');

    return reply.status(201).send({
      id: created.id,
      name: created.name,
      base_url: created.baseUrl,
      auth_type: created.authType,
      has_secret: !!created.authSecretEncrypted,
      created_at: created.createdAt.toISOString(),
    });
  });

  fastify.patch('/api/custom-apis/:id', {
    schema: {
      description: 'Update a custom API',
      tags: ['custom-apis'],
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
          auth_type: { type: 'string', enum: ['none', 'api_key', 'bearer'] },
          auth_header_name: { type: 'string' },
          auth_secret: { type: 'string' },
          default_headers: { type: 'object' },
          enabled: { type: 'boolean' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            base_url: { type: 'string' },
            has_secret: { type: 'boolean' },
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

    const api = await app.db.query.customApis.findFirst({
      where: eq(schema.customApis.id, id),
    });

    if (!api) {
      return reply.status(404).send({ error: 'API not found' });
    }

    if (api.userId !== session.user.id) {
      return reply.status(403).send({ error: 'Forbidden' });
    }

    const updateData: any = {};
    if (body.name) updateData.name = body.name;
    if (body.base_url) updateData.baseUrl = body.base_url;
    if (body.auth_type) updateData.authType = body.auth_type;
    if (body.auth_header_name) updateData.authHeaderName = body.auth_header_name;
    if (body.auth_secret) updateData.authSecretEncrypted = encrypt(body.auth_secret);
    if (body.default_headers) updateData.defaultHeaders = body.default_headers;
    if (body.enabled !== undefined) updateData.enabled = body.enabled;

    app.logger.info({ userId: session.user.id, apiId: id }, 'Updating custom API');

    const [updated] = await app.db
      .update(schema.customApis)
      .set(updateData)
      .where(eq(schema.customApis.id, id))
      .returning();

    return {
      id: updated.id,
      name: updated.name,
      base_url: updated.baseUrl,
      has_secret: !!updated.authSecretEncrypted,
    };
  });

  fastify.delete('/api/custom-apis/:id', {
    schema: {
      description: 'Delete a custom API',
      tags: ['custom-apis'],
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
    const api = await app.db.query.customApis.findFirst({
      where: eq(schema.customApis.id, id),
    });

    if (!api) {
      return reply.status(404).send({ error: 'API not found' });
    }

    if (api.userId !== session.user.id) {
      return reply.status(403).send({ error: 'Forbidden' });
    }

    app.logger.info({ userId: session.user.id, apiId: id }, 'Deleting custom API');

    await app.db.delete(schema.customApis).where(eq(schema.customApis.id, id));

    return reply.status(204).send();
  });

  fastify.post('/api/custom-apis/:api_id/endpoints', {
    schema: {
      description: 'Create a custom API endpoint',
      tags: ['custom-apis'],
      params: {
        type: 'object',
        required: ['api_id'],
        properties: { api_id: { type: 'string', format: 'uuid' } },
      },
      body: {
        type: 'object',
        required: ['name', 'method', 'path'],
        properties: {
          name: { type: 'string' },
          method: { type: 'string' },
          path: { type: 'string' },
          description: { type: 'string' },
          input_schema: { type: 'object' },
          output_schema: { type: 'object' },
          requires_confirmation: { type: 'boolean' },
        },
      },
      response: {
        201: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            method: { type: 'string' },
            path: { type: 'string' },
          },
        },
        400: { type: 'object', properties: { error: { type: 'string' } } },
        404: { type: 'object', properties: { error: { type: 'string' } } },
        403: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
  }, async (request: FastifyRequest<{ Params: { api_id: string } }>, reply: FastifyReply) => {
    const session = await requireAuth(request, reply);
    if (!session) return;

    const { api_id } = request.params;
    const body = request.body as any;

    const api = await app.db.query.customApis.findFirst({
      where: eq(schema.customApis.id, api_id),
    });

    if (!api) {
      return reply.status(404).send({ error: 'API not found' });
    }

    if (api.userId !== session.user.id) {
      return reply.status(403).send({ error: 'Forbidden' });
    }

    if (!body.name || !body.method || !body.path) {
      return reply.status(400).send({ error: 'Missing required fields' });
    }

    const [created] = await app.db
      .insert(schema.customApiEndpoints)
      .values({
        apiId: api_id,
        name: body.name,
        method: body.method,
        path: body.path,
        description: body.description,
        inputSchema: body.input_schema || {},
        outputSchema: body.output_schema || {},
        requiresConfirmation: body.requires_confirmation === true,
      })
      .returning();

    app.logger.info({ userId: session.user.id, endpointId: created.id }, 'Endpoint created');

    return reply.status(201).send({
      id: created.id,
      name: created.name,
      method: created.method,
      path: created.path,
    });
  });

  fastify.patch('/api/custom-apis/:api_id/endpoints/:endpoint_id', {
    schema: {
      description: 'Update a custom API endpoint',
      tags: ['custom-apis'],
      params: {
        type: 'object',
        required: ['api_id', 'endpoint_id'],
        properties: {
          api_id: { type: 'string', format: 'uuid' },
          endpoint_id: { type: 'string', format: 'uuid' },
        },
      },
      body: { type: 'object' },
      response: {
        200: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            method: { type: 'string' },
            path: { type: 'string' },
          },
        },
        404: { type: 'object', properties: { error: { type: 'string' } } },
        403: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
  }, async (request: FastifyRequest<{ Params: { api_id: string; endpoint_id: string } }>, reply: FastifyReply) => {
    const session = await requireAuth(request, reply);
    if (!session) return;

    const { api_id, endpoint_id } = request.params;
    const body = request.body as any;

    const api = await app.db.query.customApis.findFirst({
      where: eq(schema.customApis.id, api_id),
    });

    if (!api || api.userId !== session.user.id) {
      return reply.status(403).send({ error: 'Forbidden' });
    }

    const endpoint = await app.db.query.customApiEndpoints.findFirst({
      where: eq(schema.customApiEndpoints.id, endpoint_id),
    });

    if (!endpoint) {
      return reply.status(404).send({ error: 'Endpoint not found' });
    }

    const updateData: any = {};
    if (body.name) updateData.name = body.name;
    if (body.method) updateData.method = body.method;
    if (body.path) updateData.path = body.path;
    if (body.description) updateData.description = body.description;
    if (body.input_schema) updateData.inputSchema = body.input_schema;
    if (body.output_schema) updateData.outputSchema = body.output_schema;
    if (body.requires_confirmation !== undefined) updateData.requiresConfirmation = body.requires_confirmation;
    if (body.enabled !== undefined) updateData.enabled = body.enabled;

    const [updated] = await app.db
      .update(schema.customApiEndpoints)
      .set(updateData)
      .where(eq(schema.customApiEndpoints.id, endpoint_id))
      .returning();

    return {
      id: updated.id,
      name: updated.name,
      method: updated.method,
      path: updated.path,
    };
  });

  fastify.delete('/api/custom-apis/:api_id/endpoints/:endpoint_id', {
    schema: {
      description: 'Delete a custom API endpoint',
      tags: ['custom-apis'],
      params: {
        type: 'object',
        required: ['api_id', 'endpoint_id'],
        properties: {
          api_id: { type: 'string', format: 'uuid' },
          endpoint_id: { type: 'string', format: 'uuid' },
        },
      },
      response: {
        204: { type: 'null' },
        403: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
  }, async (request: FastifyRequest<{ Params: { api_id: string; endpoint_id: string } }>, reply: FastifyReply) => {
    const session = await requireAuth(request, reply);
    if (!session) return;

    const { api_id, endpoint_id } = request.params;

    const api = await app.db.query.customApis.findFirst({
      where: eq(schema.customApis.id, api_id),
    });

    if (!api || api.userId !== session.user.id) {
      return reply.status(403).send({ error: 'Forbidden' });
    }

    await app.db.delete(schema.customApiEndpoints).where(eq(schema.customApiEndpoints.id, endpoint_id));

    return reply.status(204).send();
  });

  fastify.post('/api/custom-apis/:api_id/test', {
    schema: {
      description: 'Test custom API connection',
      tags: ['custom-apis'],
      params: {
        type: 'object',
        required: ['api_id'],
        properties: { api_id: { type: 'string', format: 'uuid' } },
      },
      response: {
        200: { type: 'object', properties: { ok: { type: 'boolean' }, status: { type: 'number' }, message: { type: 'string' } } },
        403: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
  }, async (request: FastifyRequest<{ Params: { api_id: string } }>, reply: FastifyReply) => {
    const session = await requireAuth(request, reply);
    if (!session) return;

    const { api_id } = request.params;

    const api = await app.db.query.customApis.findFirst({
      where: eq(schema.customApis.id, api_id),
    });

    if (!api || api.userId !== session.user.id) {
      return reply.status(403).send({ error: 'Forbidden' });
    }

    try {
      let headers: Record<string, string> = {};

      if (api.authType === 'api_key' && api.authSecretEncrypted) {
        const secret = decrypt(api.authSecretEncrypted);
        headers[api.authHeaderName || 'X-API-Key'] = secret;
      } else if (api.authType === 'bearer' && api.authSecretEncrypted) {
        const secret = decrypt(api.authSecretEncrypted);
        headers['Authorization'] = `Bearer ${secret}`;
      }

      const response = await fetch(api.baseUrl, { headers });
      return {
        ok: true,
        status: response.status,
        message: 'Connection successful',
      };
    } catch (err) {
      return {
        ok: false,
        status: 0,
        message: (err as Error).message,
      };
    }
  });
}
