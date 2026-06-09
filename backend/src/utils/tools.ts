import { eq } from 'drizzle-orm';
import * as schema from '../db/schema/schema.js';
import { decrypt } from './encryption.js';
import type { App } from '../index.js';

const CONTENT_MAX_SIZE = 50 * 1024; // 50KB

function isInternalIP(hostname: string): boolean {
  const ipPattern = hostname.match(/^([\d.]+|::1|\[::1\])$/);
  if (!ipPattern) return false;

  const ip = ipPattern[1];
  if (ip === 'localhost' || ip === '::1' || ip === '[::1]') return true;
  if (ip.startsWith('127.')) return true;
  if (ip.startsWith('10.')) return true;
  if (ip.startsWith('192.168.')) return true;
  if (ip.match(/^172\.(1[6-9]|2\d|3[01])\./)) return true;

  return false;
}

export async function webFetch(
  userId: string,
  params: any,
  permissions: any,
  app: App
): Promise<any> {
  if (!permissions.allow_web_access) {
    throw new Error('Web access not permitted');
  }

  const { url } = params;
  if (!url || typeof url !== 'string') {
    throw new Error('URL parameter required');
  }

  try {
    const urlObj = new URL(url);
    if (isInternalIP(urlObj.hostname)) {
      throw new Error('Access to internal/localhost addresses is blocked');
    }
  } catch (err) {
    if ((err as Error).message.includes('Access to internal')) throw err;
    throw new Error('Invalid URL');
  }

  const response = await fetch(url, { method: 'GET' });
  let content = await response.text();

  if (content.length > CONTENT_MAX_SIZE) {
    content = content.substring(0, CONTENT_MAX_SIZE);
  }

  return {
    content,
    url,
    status_code: response.status,
  };
}

export async function githubRead(
  userId: string,
  params: any,
  permissions: any,
  app: App
): Promise<any> {
  if (!permissions.allow_github_read) {
    throw new Error('GitHub read not permitted');
  }

  const { owner, repo, path } = params;
  if (!owner || !repo || !path) {
    throw new Error('owner, repo, path parameters required');
  }

  const account = await app.db.query.githubAccounts.findFirst({
    where: eq(schema.githubAccounts.userId, userId),
  });

  if (!account) {
    throw new Error('GitHub not connected');
  }

  const pat = decrypt(account.patEncrypted);
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;

  const response = await fetch(apiUrl, {
    headers: { Authorization: `token ${pat}`, 'User-Agent': 'nexus-agent' },
  });

  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.status}`);
  }

  const data = await response.json() as any;
  const content = Buffer.from(data.content, 'base64').toString('utf-8');

  return { content, path, url: apiUrl };
}

export async function githubList(
  userId: string,
  params: any,
  permissions: any,
  app: App
): Promise<any> {
  if (!permissions.allow_github_read) {
    throw new Error('GitHub read not permitted');
  }

  const { owner, repo } = params;
  if (!owner || !repo) {
    throw new Error('owner, repo parameters required');
  }

  const account = await app.db.query.githubAccounts.findFirst({
    where: eq(schema.githubAccounts.userId, userId),
  });

  if (!account) {
    throw new Error('GitHub not connected');
  }

  const pat = decrypt(account.patEncrypted);
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/HEAD?recursive=1`;

  const response = await fetch(apiUrl, {
    headers: { Authorization: `token ${pat}`, 'User-Agent': 'nexus-agent' },
  });

  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.status}`);
  }

  const data = await response.json() as any;
  return { files: data.tree || [] };
}

export async function customApiCall(
  userId: string,
  params: any,
  permissions: any,
  app: App
): Promise<any> {
  if (!permissions.allow_custom_apis) {
    throw new Error('Custom API access not permitted');
  }

  const { endpoint_id, params: callParams } = params;
  if (!endpoint_id) {
    throw new Error('endpoint_id parameter required');
  }

  const endpoint = await app.db.query.customApiEndpoints.findFirst({
    where: eq(schema.customApiEndpoints.id, endpoint_id),
  });

  if (!endpoint) {
    throw new Error('Endpoint not found');
  }

  const api = await app.db.query.customApis.findFirst({
    where: eq(schema.customApis.id, endpoint.apiId),
  });

  if (!api || api.userId !== userId) {
    throw new Error('API not found or unauthorized');
  }

  if (endpoint.requiresConfirmation || api.sensitive) {
    return { needs_approval: true, endpoint_id };
  }

  let headers: Record<string, string> = { 'Content-Type': 'application/json' };

  if (api.defaultHeaders && typeof api.defaultHeaders === 'object') {
    headers = { ...headers, ...api.defaultHeaders };
  }

  if (api.authType === 'api_key' && api.authSecretEncrypted) {
    const secret = decrypt(api.authSecretEncrypted);
    headers[api.authHeaderName || 'X-API-Key'] = secret;
  } else if (api.authType === 'bearer' && api.authSecretEncrypted) {
    const secret = decrypt(api.authSecretEncrypted);
    headers['Authorization'] = `Bearer ${secret}`;
  }

  const url = api.baseUrl + endpoint.path;
  const response = await fetch(url, {
    method: endpoint.method,
    headers,
    body: callParams ? JSON.stringify(callParams) : undefined,
  });

  const body = await response.text();
  return {
    status: response.status,
    body: body.length > CONTENT_MAX_SIZE ? body.substring(0, CONTENT_MAX_SIZE) : body,
  };
}

export async function memorySearch(
  userId: string,
  params: any,
  permissions: any,
  app: App
): Promise<any> {
  const { query, type } = params;
  if (!query) {
    throw new Error('query parameter required');
  }

  let queryBuilder = app.db
    .select()
    .from(schema.memory)
    .where(
      type
        ? eq(schema.memory.memoryType, type)
        : undefined
    );

  const results = await app.db
    .select()
    .from(schema.memory)
    .where(eq(schema.memory.userId, userId))
    .limit(10);

  return results;
}

export async function memoryWrite(
  userId: string,
  params: any,
  permissions: any,
  app: App
): Promise<any> {
  const { memory_type, content, tags, importance_score } = params;
  if (!memory_type || !content) {
    throw new Error('memory_type and content parameters required');
  }

  const [created] = await app.db
    .insert(schema.memory)
    .values({
      userId,
      memoryType: memory_type as any,
      content,
      tags: tags || [],
      importanceScore: importance_score?.toString() || '0.5',
      source: 'manual',
    })
    .returning();

  return created;
}

export async function fileRead(
  userId: string,
  params: any,
  permissions: any,
  app: App
): Promise<any> {
  if (!permissions.allow_file_read) {
    throw new Error('File read not permitted');
  }

  const { path: filePath } = params;
  if (!filePath || typeof filePath !== 'string') {
    throw new Error('path parameter required');
  }

  if (filePath.includes('..') || filePath.startsWith('/')) {
    throw new Error('Invalid path: relative paths only');
  }

  const fs = await import('fs/promises');
  const path = await import('path');
  const basePath = `/tmp/agents/${userId}`;
  const fullPath = path.join(basePath, filePath);

  if (!fullPath.startsWith(basePath)) {
    throw new Error('Path traversal blocked');
  }

  try {
    let content = await fs.readFile(fullPath, 'utf-8');
    if (content.length > CONTENT_MAX_SIZE) {
      content = content.substring(0, CONTENT_MAX_SIZE);
    }
    return { content, path: filePath };
  } catch (err) {
    throw new Error(`File read error: ${err.message}`);
  }
}

export async function fileWrite(
  userId: string,
  params: any,
  permissions: any,
  app: App
): Promise<any> {
  if (!permissions.allow_file_write) {
    throw new Error('File write not permitted');
  }

  const { path: filePath, content } = params;
  if (!filePath || !content) {
    throw new Error('path and content parameters required');
  }

  if (filePath.includes('..') || filePath.startsWith('/')) {
    throw new Error('Invalid path: relative paths only');
  }

  const fs = await import('fs/promises');
  const path = await import('path');
  const basePath = `/tmp/agents/${userId}`;
  const fullPath = path.join(basePath, filePath);

  if (!fullPath.startsWith(basePath)) {
    throw new Error('Path traversal blocked');
  }

  try {
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content, 'utf-8');
    return { ok: true, path: filePath };
  } catch (err) {
    throw new Error(`File write error: ${err.message}`);
  }
}

export async function fileDelete(
  userId: string,
  params: any,
  permissions: any,
  app: App
): Promise<any> {
  if (!permissions.allow_file_delete) {
    throw new Error('File delete not permitted');
  }

  return { needs_approval: true };
}

export async function shell(
  userId: string,
  params: any,
  permissions: any,
  app: App
): Promise<any> {
  return { error: 'Shell execution is not available in this runtime. Use the provided tools instead.' };
}

export const toolRegistry = {
  web_fetch: webFetch,
  github_read: githubRead,
  github_list: githubList,
  custom_api_call: customApiCall,
  memory_search: memorySearch,
  memory_write: memoryWrite,
  file_read: fileRead,
  file_write: fileWrite,
  file_delete: fileDelete,
  shell,
};
