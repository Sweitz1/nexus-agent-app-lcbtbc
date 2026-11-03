import {
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
  numeric,
} from 'drizzle-orm/pg-core';
import { user } from './auth-schema.js';

export const providerTypeEnum = pgEnum('provider_type', [
  'openai',
  'anthropic',
  'google',
  'openai_compatible',
  'custom_rest',
]);

export const authTypeEnum = pgEnum('auth_type', [
  'none',
  'api_key',
  'bearer',
]);

export const taskStatusEnum = pgEnum('task_status', [
  'pending',
  'planning',
  'running',
  'waiting_for_approval',
  'completed',
  'failed',
  'cancelled',
]);

export const taskStepTypeEnum = pgEnum('task_step_type', [
  'plan',
  'thought',
  'tool_call',
  'tool_result',
  'reflection',
  'final',
  'approval_request',
  'approval_response',
]);

export const taskStepStatusEnum = pgEnum('task_step_status', [
  'pending',
  'awaiting_approval',
  'approved',
  'rejected',
  'completed',
  'failed',
]);

export const memoryTypeEnum = pgEnum('memory_type', [
  'short_term',
  'long_term',
  'task',
  'project',
  'conversation',
  'tool_result',
  'user_preference',
]);

export const logLevelEnum = pgEnum('log_level', [
  'info',
  'warn',
  'error',
]);

export const modelProviders = pgTable('model_providers', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull().references(() => user.id),
  name: text('name').notNull(),
  providerType: providerTypeEnum('provider_type').notNull(),
  apiKeyEncrypted: text('api_key_encrypted').notNull(),
  baseUrl: text('base_url'),
  defaultModel: text('default_model').notNull(),
  supportsTools: boolean('supports_tools').default(true).notNull(),
  supportsVision: boolean('supports_vision').default(false).notNull(),
  enabled: boolean('enabled').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const customApis = pgTable('custom_apis', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull().references(() => user.id),
  name: text('name').notNull(),
  baseUrl: text('base_url').notNull(),
  authType: authTypeEnum('auth_type').notNull(),
  authHeaderName: text('auth_header_name'),
  authSecretEncrypted: text('auth_secret_encrypted'),
  defaultHeaders: jsonb('default_headers').default({}).notNull(),
  enabled: boolean('enabled').default(true).notNull(),
  sensitive: boolean('sensitive').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const customApiEndpoints = pgTable('custom_api_endpoints', {
  id: uuid('id').primaryKey().defaultRandom(),
  apiId: uuid('api_id').notNull().references(() => customApis.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  method: text('method').notNull(),
  path: text('path').notNull(),
  description: text('description'),
  inputSchema: jsonb('input_schema').default({}).notNull(),
  outputSchema: jsonb('output_schema').default({}).notNull(),
  requiresConfirmation: boolean('requires_confirmation').default(false).notNull(),
  enabled: boolean('enabled').default(true).notNull(),
});

export const permissions = pgTable('permissions', {
  userId: text('user_id').primaryKey().references(() => user.id),
  allowFileRead: boolean('allow_file_read').default(true).notNull(),
  allowFileWrite: boolean('allow_file_write').default(true).notNull(),
  allowFileDelete: boolean('allow_file_delete').default(false).notNull(),
  allowGithubRead: boolean('allow_github_read').default(true).notNull(),
  allowGithubWrite: boolean('allow_github_write').default(false).notNull(),
  allowWebAccess: boolean('allow_web_access').default(true).notNull(),
  allowCustomApis: boolean('allow_custom_apis').default(true).notNull(),
  requireConfirmationForRisky: boolean('require_confirmation_for_risky').default(true).notNull(),
  apiBudgetUsdMonthly: numeric('api_budget_usd_monthly', { precision: 10, scale: 2 }).default('10').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const tasks = pgTable('tasks', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull().references(() => user.id),
  userGoal: text('user_goal').notNull(),
  status: taskStatusEnum('status').default('pending').notNull(),
  priority: integer('priority').default(0).notNull(),
  modelProviderId: uuid('model_provider_id').references(() => modelProviders.id),
  toolsAllowed: jsonb('tools_allowed').default([]).notNull(),
  output: text('output'),
  errorLog: text('error_log'),
  requiresUserApproval: boolean('requires_user_approval').default(true).notNull(),
  currentStepIndex: integer('current_step_index').default(0).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const taskSteps = pgTable('task_steps', {
  id: uuid('id').primaryKey().defaultRandom(),
  taskId: uuid('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  stepIndex: integer('step_index').notNull(),
  stepType: taskStepTypeEnum('step_type').notNull(),
  content: text('content').notNull(),
  toolName: text('tool_name'),
  toolInput: jsonb('tool_input'),
  toolOutput: jsonb('tool_output'),
  status: taskStepStatusEnum('status').default('pending').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const memory = pgTable('memory', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull().references(() => user.id),
  memoryType: memoryTypeEnum('memory_type').notNull(),
  content: text('content').notNull(),
  source: text('source').default('manual').notNull(),
  taskId: uuid('task_id').references(() => tasks.id, { onDelete: 'cascade' }),
  tags: text('tags').array().default([]).notNull(),
  importanceScore: numeric('importance_score', { precision: 3, scale: 2 }).default('0.5').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const logs = pgTable('logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull().references(() => user.id),
  taskId: uuid('task_id').references(() => tasks.id, { onDelete: 'cascade' }),
  level: logLevelEnum('level').default('info').notNull(),
  message: text('message').notNull(),
  metadata: jsonb('metadata').default({}).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const githubAccounts = pgTable('github_accounts', {
  userId: text('user_id').primaryKey().references(() => user.id),
  patEncrypted: text('pat_encrypted').notNull(),
  username: text('username').notNull(),
  connectedAt: timestamp('connected_at', { withTimezone: true }).defaultNow().notNull(),
});
