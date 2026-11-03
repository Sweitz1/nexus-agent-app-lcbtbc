import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

export function register(app: any, fastify: FastifyInstance) {
  fastify.get('/api/runtime/status', {
    schema: {
      description: 'Get runtime status',
      tags: ['runtime'],
      response: {
        200: {
          type: 'object',
          properties: {
            ok: { type: 'boolean' },
            version: { type: 'string' },
            tools_available: { type: 'array', items: { type: 'string' } },
            capabilities: { type: 'object' },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    return {
      ok: true,
      version: 'agent-runtime-1.0',
      tools_available: [
        'web_fetch',
        'github_read',
        'github_list',
        'custom_api_call',
        'memory_search',
        'memory_write',
        'file_read',
        'file_write',
        'file_delete',
      ],
      capabilities: {
        agent_loop: true,
        approval_gates: true,
        memory: true,
        github_integration: true,
        custom_apis: true,
        file_sandbox: true,
      },
    };
  });
}
