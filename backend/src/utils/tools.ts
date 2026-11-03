import { eq, and } from 'drizzle-orm';
import * as schema from '../db/schema/schema.js';
import { decrypt } from './encryption.js';
import type { App } from '../index.js';

const CONTENT_MAX_SIZE = 50 * 1024;

function isInternalIP(hostname: string): boolean {
  if (hostname === 'localhost' || hostname === '::1' || hostname === '[::1]') return true;
  if (/^127\./.test(hostname)) return true;
  if (/^10\./.test(hostname)) return true;
  if (/^192\.168\./.test(hostname)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(hostname)) return true;
  return false;
}

export async function webFetch(userId: string, params: any, permissions: any, app: App): Promise<any> {
  if (!permissions.allowWebAccess) throw new Error('Web access not permitted');

  const { url } = params;
  if (!url || typeof url !== 'string') throw new Error('URL parameter required');

  let urlObj: URL;
  try {
    urlObj = new URL(url);
  } catch {
    throw new Error('Invalid URL');
  }
  if (isInternalIP(urlObj.hostname)) throw new Error('Access to internal addresses is blocked');

  const response = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(15000) });
  let content = await response.text();
  if (content.length > CONTENT_MAX_SIZE) content = content.substring(0, CONTENT_MAX_SIZE);

  return { content, url, status_code: response.status };
}

export async function githubRead(userId: string, params: any, permissions: any, app: App): Promise<any> {
  if (!permissions.allowGithubRead) throw new Error('GitHub read not permitted');

  const { owner, repo, path } = params;
  if (!owner || !repo || !path) throw new Error('owner, repo, path parameters required');

  const account = await app.db.query.githubAccounts.findFirst({
    where: eq(schema.githubAccounts.userId, userId),
  });
  if (!account) throw new Error('GitHub not connected');

  const pat = decrypt(account.patEncrypted);
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
  const response = await fetch(apiUrl, {
    headers: { Authorization: `token ${pat}`, 'User-Agent': 'nexus-agent' },
  });
  if (!response.ok) throw new Error(`GitHub API error: ${response.status}`);

  const data = await response.json() as any;
  const content = Buffer.from(data.content, 'base64').toString('utf-8');
  return { content, path, url: apiUrl, sha: data.sha };
}

export async function githubList(userId: string, params: any, permissions: any, app: App): Promise<any> {
  if (!permissions.allowGithubRead) throw new Error('GitHub read not permitted');

  const { owner, repo } = params;
  if (!owner || !repo) throw new Error('owner, repo parameters required');

  const account = await app.db.query.githubAccounts.findFirst({
    where: eq(schema.githubAccounts.userId, userId),
  });
  if (!account) throw new Error('GitHub not connected');

  const pat = decrypt(account.patEncrypted);
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/HEAD?recursive=1`;
  const response = await fetch(apiUrl, {
    headers: { Authorization: `token ${pat}`, 'User-Agent': 'nexus-agent' },
  });
  if (!response.ok) throw new Error(`GitHub API error: ${response.status}`);

  const data = await response.json() as any;
  return { files: data.tree || [] };
}

export async function githubWrite(userId: string, params: any, permissions: any, app: App): Promise<any> {
  if (!permissions.allowGithubWrite) throw new Error('GitHub write not permitted');

  const { owner, repo, path: filePath, content, message, branch } = params;
  if (!owner || !repo || !filePath || !content || !message) {
    throw new Error('owner, repo, path, content, message parameters required');
  }

  const account = await app.db.query.githubAccounts.findFirst({
    where: eq(schema.githubAccounts.userId, userId),
  });
  if (!account) throw new Error('GitHub not connected');

  const pat = decrypt(account.patEncrypted);

  // Fetch current SHA for update
  let sha: string | undefined;
  try {
    const getRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`,
      { headers: { Authorization: `token ${pat}`, 'User-Agent': 'nexus-agent' } }
    );
    if (getRes.ok) {
      const existing = await getRes.json() as any;
      sha = existing.sha;
    }
  } catch {}

  const body: any = {
    message,
    content: Buffer.from(content).toString('base64'),
  };
  if (sha) body.sha = sha;
  if (branch) body.branch = branch;

  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`,
    {
      method: 'PUT',
      headers: {
        Authorization: `token ${pat}`,
        'User-Agent': 'nexus-agent',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`GitHub write failed: ${response.status} — ${err}`);
  }

  const data = await response.json() as any;
  return { ok: true, sha: data.content?.sha, url: data.content?.html_url };
}

export async function customApiCall(userId: string, params: any, permissions: any, app: App): Promise<any> {
  if (!permissions.allowCustomApis) throw new Error('Custom API access not permitted');

  const { endpoint_id, params: callParams } = params;
  if (!endpoint_id) throw new Error('endpoint_id parameter required');

  const endpoint = await app.db.query.customApiEndpoints.findFirst({
    where: eq(schema.customApiEndpoints.id, endpoint_id),
  });
  if (!endpoint) throw new Error('Endpoint not found');

  const api = await app.db.query.customApis.findFirst({
    where: eq(schema.customApis.id, endpoint.apiId),
  });
  if (!api || api.userId !== userId) throw new Error('API not found or unauthorized');

  if (endpoint.requiresConfirmation || api.sensitive) {
    return { needs_approval: true, endpoint_id };
  }

  let headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (api.defaultHeaders && typeof api.defaultHeaders === 'object') {
    headers = { ...headers, ...api.defaultHeaders };
  }

  if (api.authType === 'api_key' && api.authSecretEncrypted) {
    headers[api.authHeaderName || 'X-API-Key'] = decrypt(api.authSecretEncrypted);
  } else if (api.authType === 'bearer' && api.authSecretEncrypted) {
    headers['Authorization'] = `Bearer ${decrypt(api.authSecretEncrypted)}`;
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

export async function memorySearch(userId: string, params: any, permissions: any, app: App): Promise<any> {
  const { query, type } = params;
  if (!query) throw new Error('query parameter required');

  const conditions = [eq(schema.memory.userId, userId)];
  if (type) conditions.push(eq(schema.memory.memoryType, type));

  const results = await app.db
    .select()
    .from(schema.memory)
    .where(conditions.length > 1 ? and(...conditions) : conditions[0])
    .orderBy((m) => m.importanceScore)
    .limit(10);

  return results.map((m) => ({
    id: m.id,
    type: m.memoryType,
    content: m.content,
    tags: m.tags,
    importance: m.importanceScore,
    created_at: m.createdAt,
  }));
}

export async function memoryWrite(userId: string, params: any, permissions: any, app: App): Promise<any> {
  const { memory_type, content, tags, importance_score } = params;
  if (!memory_type || !content) throw new Error('memory_type and content parameters required');

  const [created] = await app.db
    .insert(schema.memory)
    .values({
      userId,
      memoryType: memory_type as any,
      content,
      tags: tags || [],
      importanceScore: importance_score?.toString() || '0.5',
      source: 'agent',
    })
    .returning();

  return created;
}

export async function fileRead(userId: string, params: any, permissions: any, app: App): Promise<any> {
  if (!permissions.allowFileRead) throw new Error('File read not permitted');

  const { path: filePath } = params;
  if (!filePath || typeof filePath !== 'string') throw new Error('path parameter required');
  if (filePath.includes('..') || filePath.startsWith('/')) throw new Error('Invalid path: relative paths only');

  const fs = await import('fs/promises');
  const path = await import('path');
  const basePath = `/tmp/agents/${userId}`;
  const fullPath = path.join(basePath, filePath);
  if (!fullPath.startsWith(basePath)) throw new Error('Path traversal blocked');

  let content = await fs.readFile(fullPath, 'utf-8');
  if (content.length > CONTENT_MAX_SIZE) content = content.substring(0, CONTENT_MAX_SIZE);
  return { content, path: filePath };
}

export async function fileWrite(userId: string, params: any, permissions: any, app: App): Promise<any> {
  if (!permissions.allowFileWrite) throw new Error('File write not permitted');

  const { path: filePath, content } = params;
  if (!filePath || !content) throw new Error('path and content parameters required');
  if (filePath.includes('..') || filePath.startsWith('/')) throw new Error('Invalid path: relative paths only');

  const fs = await import('fs/promises');
  const path = await import('path');
  const basePath = `/tmp/agents/${userId}`;
  const fullPath = path.join(basePath, filePath);
  if (!fullPath.startsWith(basePath)) throw new Error('Path traversal blocked');

  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, content, 'utf-8');
  return { ok: true, path: filePath };
}

export async function fileDelete(userId: string, params: any, permissions: any, app: App): Promise<any> {
  if (!permissions.allowFileDelete) throw new Error('File delete not permitted');

  const { path: filePath } = params;
  if (!filePath || typeof filePath !== 'string') throw new Error('path parameter required');
  if (filePath.includes('..') || filePath.startsWith('/')) throw new Error('Invalid path: relative paths only');

  const fs = await import('fs/promises');
  const path = await import('path');
  const basePath = `/tmp/agents/${userId}`;
  const fullPath = path.join(basePath, filePath);
  if (!fullPath.startsWith(basePath)) throw new Error('Path traversal blocked');

  await fs.unlink(fullPath);
  return { ok: true, path: filePath };
}

export async function shell(userId: string, params: any, permissions: any, app: App): Promise<any> {
  if (!permissions.allowShell) {
    return { error: 'Shell execution is disabled. Enable it in permissions settings.' };
  }
  // Shell is a sensitive capability — always requires approval
  return {
    needs_approval: true,
    reason: 'Shell execution requires explicit user approval for each command.',
  };
}

export const toolRegistry = {
  web_fetch: webFetch,
  github_read: githubRead,
  github_list: githubList,
  github_write: githubWrite,
  custom_api_call: customApiCall,
  memory_search: memorySearch,
  memory_write: memoryWrite,
  file_read: fileRead,
  file_write: fileWrite,
  file_delete: fileDelete,
  shell,
};
