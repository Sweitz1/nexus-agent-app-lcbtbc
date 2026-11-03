import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { eq } from 'drizzle-orm';
import * as schema from '../db/schema/schema.js';
import type { App } from '../index.js';

export function register(app: App, fastify: FastifyInstance) {
  const requireAuth = app.requireAuth();

  fastify.get('/api/permissions', {
    schema: {
      description: 'Get user permissions',
      tags: ['permissions'],
      response: {
        200: {
          type: 'object',
          properties: {
            user_id: { type: 'string' },
            allow_file_read: { type: 'boolean' },
            allow_file_write: { type: 'boolean' },
            allow_file_delete: { type: 'boolean' },
            allow_github_read: { type: 'boolean' },
            allow_github_write: { type: 'boolean' },
            allow_web_access: { type: 'boolean' },
            allow_custom_apis: { type: 'boolean' },
            require_confirmation_for_risky: { type: 'boolean' },
            api_budget_usd_monthly: { type: 'string' },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const session = await requireAuth(request, reply);
    if (!session) return;

    app.logger.info({ userId: session.user.id }, 'Fetching permissions');

    let perms = await app.db.query.permissions.findFirst({
      where: eq(schema.permissions.userId, session.user.id),
    });

    if (!perms) {
      const [created] = await app.db
        .insert(schema.permissions)
        .values({ userId: session.user.id })
        .returning();
      perms = created;
    }

    return {
      user_id: perms.userId,
      allow_file_read: perms.allowFileRead,
      allow_file_write: perms.allowFileWrite,
      allow_file_delete: perms.allowFileDelete,
      allow_github_read: perms.allowGithubRead,
      allow_github_write: perms.allowGithubWrite,
      allow_web_access: perms.allowWebAccess,
      allow_custom_apis: perms.allowCustomApis,
      require_confirmation_for_risky: perms.requireConfirmationForRisky,
      api_budget_usd_monthly: perms.apiBudgetUsdMonthly.toString(),
    };
  });

  fastify.put('/api/permissions', {
    schema: {
      description: 'Update user permissions',
      tags: ['permissions'],
      body: {
        type: 'object',
        properties: {
          allow_file_read: { type: 'boolean' },
          allow_file_write: { type: 'boolean' },
          allow_file_delete: { type: 'boolean' },
          allow_github_read: { type: 'boolean' },
          allow_github_write: { type: 'boolean' },
          allow_web_access: { type: 'boolean' },
          allow_custom_apis: { type: 'boolean' },
          require_confirmation_for_risky: { type: 'boolean' },
          api_budget_usd_monthly: { type: 'string' },
        },
      },
      response: {
        200: { type: 'object' },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const session = await requireAuth(request, reply);
    if (!session) return;

    const body = request.body as any;
    app.logger.info({ userId: session.user.id }, 'Updating permissions');

    const updateData: any = {};
    if (body.allow_file_read !== undefined) updateData.allowFileRead = body.allow_file_read;
    if (body.allow_file_write !== undefined) updateData.allowFileWrite = body.allow_file_write;
    if (body.allow_file_delete !== undefined) updateData.allowFileDelete = body.allow_file_delete;
    if (body.allow_github_read !== undefined) updateData.allowGithubRead = body.allow_github_read;
    if (body.allow_github_write !== undefined) updateData.allowGithubWrite = body.allow_github_write;
    if (body.allow_web_access !== undefined) updateData.allowWebAccess = body.allow_web_access;
    if (body.allow_custom_apis !== undefined) updateData.allowCustomApis = body.allow_custom_apis;
    if (body.require_confirmation_for_risky !== undefined) updateData.requireConfirmationForRisky = body.require_confirmation_for_risky;
    if (body.api_budget_usd_monthly !== undefined) updateData.apiBudgetUsdMonthly = body.api_budget_usd_monthly;
    updateData.updatedAt = new Date();

    const [updated] = await app.db
      .insert(schema.permissions)
      .values({ userId: session.user.id, ...updateData })
      .onConflictDoUpdate({
        target: schema.permissions.userId,
        set: updateData,
      })
      .returning();

    return {
      user_id: updated.userId,
      allow_file_read: updated.allowFileRead,
      allow_file_write: updated.allowFileWrite,
      allow_file_delete: updated.allowFileDelete,
      allow_github_read: updated.allowGithubRead,
      allow_github_write: updated.allowGithubWrite,
      allow_web_access: updated.allowWebAccess,
      allow_custom_apis: updated.allowCustomApis,
      require_confirmation_for_risky: updated.requireConfirmationForRisky,
      api_budget_usd_monthly: updated.apiBudgetUsdMonthly.toString(),
    };
  });
}
