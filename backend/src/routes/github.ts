import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { eq } from 'drizzle-orm';
import * as schema from '../db/schema/schema.js';
import { encrypt, decrypt } from '../utils/encryption.js';
import type { App } from '../index.js';

export function register(app: App, fastify: FastifyInstance) {
  const requireAuth = app.requireAuth();

  fastify.post('/api/github/connect', {
    schema: {
      description: 'Connect GitHub account',
      tags: ['github'],
      body: {
        type: 'object',
        required: ['pat'],
        properties: {
          pat: { type: 'string' },
        },
      },
      response: {
        200: { type: 'object', properties: { username: { type: 'string' } } },
        400: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const session = await requireAuth(request, reply);
    if (!session) return;

    const body = request.body as any;
    const { pat } = body;

    if (!pat) {
      return reply.status(400).send({ error: 'PAT is required' });
    }

    try {
      const response = await fetch('https://api.github.com/user', {
        headers: { Authorization: `token ${pat}`, 'User-Agent': 'nexus-agent' },
      });

      if (!response.ok) {
        return reply.status(400).send({ error: 'Invalid GitHub PAT' });
      }

      const data = await response.json() as any;
      const username = data.login;

      app.logger.info({ userId: session.user.id, username }, 'Connecting GitHub account');

      await app.db
        .insert(schema.githubAccounts)
        .values({
          userId: session.user.id,
          patEncrypted: encrypt(pat),
          username,
        })
        .onConflictDoUpdate({
          target: schema.githubAccounts.userId,
          set: { patEncrypted: encrypt(pat), username },
        });

      return { username };
    } catch (err) {
      app.logger.error({ err }, 'GitHub connection failed');
      return reply.status(400).send({ error: 'Failed to connect to GitHub' });
    }
  });

  fastify.get('/api/github/status', {
    schema: {
      description: 'Get GitHub connection status',
      tags: ['github'],
      response: {
        200: {
          type: 'object',
          properties: {
            connected: { type: 'boolean' },
            username: { type: 'string' },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const session = await requireAuth(request, reply);
    if (!session) return;

    const account = await app.db.query.githubAccounts.findFirst({
      where: eq(schema.githubAccounts.userId, session.user.id),
    });

    return {
      connected: !!account,
      username: account?.username,
    };
  });

  fastify.delete('/api/github/disconnect', {
    schema: {
      description: 'Disconnect GitHub account',
      tags: ['github'],
      response: {
        200: { type: 'object', properties: { ok: { type: 'boolean' } } },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const session = await requireAuth(request, reply);
    if (!session) return;

    app.logger.info({ userId: session.user.id }, 'Disconnecting GitHub account');

    await app.db.delete(schema.githubAccounts).where(eq(schema.githubAccounts.userId, session.user.id));

    return { ok: true };
  });

  fastify.post('/api/github/clone', {
    schema: {
      description: 'Clone GitHub repository file tree',
      tags: ['github'],
      body: {
        type: 'object',
        required: ['owner', 'repo'],
        properties: {
          owner: { type: 'string' },
          repo: { type: 'string' },
        },
      },
      response: {
        200: { type: 'object', properties: { files: { type: 'array' } } },
        400: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const session = await requireAuth(request, reply);
    if (!session) return;

    const account = await app.db.query.githubAccounts.findFirst({
      where: eq(schema.githubAccounts.userId, session.user.id),
    });

    if (!account) {
      return reply.status(400).send({ error: 'GitHub not connected' });
    }

    const body = request.body as any;
    const { owner, repo } = body;

    if (!owner || !repo) {
      return reply.status(400).send({ error: 'owner and repo are required' });
    }

    try {
      const pat = decrypt(account.patEncrypted);
      const apiUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/HEAD?recursive=1`;

      const response = await fetch(apiUrl, {
        headers: { Authorization: `token ${pat}`, 'User-Agent': 'nexus-agent' },
      });

      if (!response.ok) {
        return reply.status(400).send({ error: `GitHub API error: ${response.status}` });
      }

      const data = await response.json() as any;

      return {
        files: (data.tree || []).map((item: any) => ({
          path: item.path,
          size: item.size,
          type: item.type,
        })),
      };
    } catch (err) {
      app.logger.error({ err }, 'GitHub clone failed');
      return reply.status(400).send({ error: (err as Error).message });
    }
  });

  fastify.get('/api/github/file', {
    schema: {
      description: 'Get GitHub file content',
      tags: ['github'],
      querystring: {
        type: 'object',
        required: ['owner', 'repo', 'path'],
        properties: {
          owner: { type: 'string' },
          repo: { type: 'string' },
          path: { type: 'string' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            path: { type: 'string' },
            content: { type: 'string' },
            encoding: { type: 'string' },
            size: { type: 'integer' },
          },
        },
        400: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const session = await requireAuth(request, reply);
    if (!session) return;

    const perms = await app.db.query.permissions.findFirst({
      where: eq(schema.permissions.userId, session.user.id),
    });

    if (!perms?.allowGithubRead) {
      return reply.status(400).send({ error: 'GitHub read not permitted' });
    }

    const account = await app.db.query.githubAccounts.findFirst({
      where: eq(schema.githubAccounts.userId, session.user.id),
    });

    if (!account) {
      return reply.status(400).send({ error: 'GitHub not connected' });
    }

    const qs = request.query as any;
    const { owner, repo, path } = qs;

    if (!owner || !repo || !path) {
      return reply.status(400).send({ error: 'owner, repo, path are required' });
    }

    try {
      const pat = decrypt(account.patEncrypted);
      const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;

      const response = await fetch(apiUrl, {
        headers: { Authorization: `token ${pat}`, 'User-Agent': 'nexus-agent' },
      });

      if (!response.ok) {
        return reply.status(400).send({ error: `GitHub API error: ${response.status}` });
      }

      const data = await response.json() as any;
      const content = Buffer.from(data.content, 'base64').toString('utf-8');

      return {
        path: data.path,
        content,
        encoding: 'utf8',
        size: content.length,
      };
    } catch (err) {
      app.logger.error({ err }, 'GitHub file fetch failed');
      return reply.status(400).send({ error: (err as Error).message });
    }
  });
}
