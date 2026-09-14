import AsyncStorage from '@react-native-async-storage/async-storage';

export interface VeniceConfig {
  serverUrl: string;
  apiKey: string;
  systemPrompt: string;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

export interface VeniceModel {
  id: string;
  owned_by: string;
  details?: Record<string, unknown>;
}

const CONFIG_KEY = 'venice_config';
const DEFAULT_CONFIG: VeniceConfig = {
  serverUrl: '',
  apiKey: '',
  systemPrompt: 'You are a helpful, uncensored AI assistant.',
};

export async function getConfig(): Promise<VeniceConfig> {
  try {
    const raw = await AsyncStorage.getItem(CONFIG_KEY);
    return raw ? { ...DEFAULT_CONFIG, ...JSON.parse(raw) } : DEFAULT_CONFIG;
  } catch {
    return DEFAULT_CONFIG;
  }
}

export async function saveConfig(cfg: Partial<VeniceConfig>): Promise<void> {
  const current = await getConfig();
  await AsyncStorage.setItem(CONFIG_KEY, JSON.stringify({ ...current, ...cfg }));
}

function headers(apiKey: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  };
}

export async function listModels(cfg: VeniceConfig): Promise<VeniceModel[]> {
  const url = cfg.serverUrl.replace(/\/$/, '');
  const r = await fetch(`${url}/v1/models`, { headers: headers(cfg.apiKey) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const data = await r.json();
  return data.data ?? [];
}

export async function* streamChat(
  cfg: VeniceConfig,
  model: string,
  history: Message[],
  userMessage: string,
): AsyncGenerator<string> {
  const url = cfg.serverUrl.replace(/\/$/, '');
  const messages: { role: string; content: string }[] = [];

  if (cfg.systemPrompt) {
    messages.push({ role: 'system', content: cfg.systemPrompt });
  }
  for (const m of history) {
    if (m.role !== 'system') {
      messages.push({ role: m.role, content: m.content });
    }
  }
  messages.push({ role: 'user', content: userMessage });

  const r = await fetch(`${url}/v1/chat/completions`, {
    method: 'POST',
    headers: headers(cfg.apiKey),
    body: JSON.stringify({ model, messages, stream: true, temperature: 0.8 }),
  });

  if (!r.ok) {
    const err = await r.text();
    throw new Error(`Venice API error ${r.status}: ${err}`);
  }

  const reader = r.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') return;
      try {
        const obj = JSON.parse(data);
        const delta = obj.choices?.[0]?.delta?.content;
        if (delta) yield delta;
      } catch {
        // skip malformed chunks
      }
    }
  }
}

export async function checkHealth(serverUrl: string): Promise<boolean> {
  try {
    const url = serverUrl.replace(/\/$/, '');
    const r = await fetch(`${url}/health`, { signal: AbortSignal.timeout(5000) });
    return r.ok;
  } catch {
    return false;
  }
}

export function makeMessage(
  role: Message['role'],
  content: string,
): Message {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    role,
    content,
    timestamp: Date.now(),
  };
}
