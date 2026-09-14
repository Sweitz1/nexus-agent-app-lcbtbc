import AsyncStorage from '@react-native-async-storage/async-storage';

export type PluginCategory =
  | 'productivity'
  | 'coding'
  | 'ai'
  | 'search'
  | 'media'
  | 'data'
  | 'security'
  | 'utilities'
  | 'experimental';

export interface Plugin {
  id: string;
  name: string;
  author: string;
  version: string;
  description: string;
  longDescription: string;
  category: PluginCategory;
  icon: string;          // emoji
  tags: string[];
  rating: number;        // 0–5
  downloads: number;
  size: string;          // e.g. "12 KB"
  permissions: string[]; // what the plugin needs access to
  changelog: { version: string; notes: string }[];
  featured?: boolean;
  new?: boolean;
  official?: boolean;
}

export interface InstalledPlugin extends Plugin {
  installedAt: number;
  enabled: boolean;
  config: Record<string, string>;
}

const INSTALLED_KEY = 'nexus_plugins_installed';

// ── Registry ──────────────────────────────────────────────────────
export const PLUGIN_REGISTRY: Plugin[] = [
  // ── Featured ──────────────────────────────────────────────────
  {
    id: 'web-search',
    name: 'Web Search',
    author: 'Nexus Official',
    version: '2.1.0',
    description: 'Give the AI real-time web search using DuckDuckGo.',
    longDescription:
      'Enables the AI to search the web in real time. Supports DuckDuckGo, Brave Search, and SearXNG self-hosted instances. Automatically extracts page content and cites sources in responses.',
    category: 'search',
    icon: '🔍',
    tags: ['search', 'web', 'real-time', 'rag'],
    rating: 4.8,
    downloads: 48200,
    size: '18 KB',
    permissions: ['network'],
    changelog: [
      { version: '2.1.0', notes: 'Added Brave Search support' },
      { version: '2.0.0', notes: 'Rewritten with streaming support' },
    ],
    featured: true,
    official: true,
  },
  {
    id: 'code-executor',
    name: 'Code Executor',
    author: 'Nexus Official',
    version: '1.4.2',
    description: 'Run Python, JS, Bash, and more in a sandboxed environment.',
    longDescription:
      'Execute code snippets directly in chat. Supports Python 3, JavaScript (Node), Bash, Ruby, and Go. Code runs in an isolated sandbox — no access to your device files.',
    category: 'coding',
    icon: '⚡',
    tags: ['code', 'execute', 'python', 'javascript', 'sandbox'],
    rating: 4.9,
    downloads: 62100,
    size: '24 KB',
    permissions: ['sandboxed-execution'],
    changelog: [
      { version: '1.4.2', notes: 'Go and Ruby support added' },
      { version: '1.4.0', notes: 'Streaming output support' },
    ],
    featured: true,
    official: true,
  },
  {
    id: 'image-gen',
    name: 'Image Generator',
    author: 'Nexus Official',
    version: '1.2.0',
    description: 'Generate images from text using Stable Diffusion or FLUX.',
    longDescription:
      'Creates images from natural language prompts. Connects to your own ComfyUI / Automatic1111 instance or uses the FLUX API. Supports negative prompts, aspect ratios, and style presets.',
    category: 'ai',
    icon: '🎨',
    tags: ['image', 'stable-diffusion', 'flux', 'generative', 'art'],
    rating: 4.6,
    downloads: 31400,
    size: '16 KB',
    permissions: ['network', 'storage'],
    changelog: [
      { version: '1.2.0', notes: 'FLUX model support added' },
    ],
    featured: true,
    official: true,
  },

  // ── Coding ────────────────────────────────────────────────────
  {
    id: 'github-integration',
    name: 'GitHub',
    author: 'Nexus Official',
    version: '1.0.3',
    description: 'Browse repos, read files, and create PRs from chat.',
    longDescription:
      'Full GitHub integration — search code, read files, list issues, create pull requests, and review diffs directly in conversation.',
    category: 'coding',
    icon: '🐙',
    tags: ['github', 'git', 'code', 'pr', 'repos'],
    rating: 4.7,
    downloads: 19800,
    size: '22 KB',
    permissions: ['network'],
    changelog: [{ version: '1.0.3', notes: 'Added PR creation support' }],
    official: true,
  },
  {
    id: 'sql-runner',
    name: 'SQL Runner',
    author: 'DataTools',
    version: '0.9.1',
    description: 'Run SQL queries and visualize results inline.',
    longDescription:
      'Connect to PostgreSQL, MySQL, or SQLite. Run SELECT queries, view results as tables, and ask the AI to help write and optimize SQL.',
    category: 'data',
    icon: '🗄️',
    tags: ['sql', 'database', 'postgres', 'mysql', 'data'],
    rating: 4.3,
    downloads: 8900,
    size: '20 KB',
    permissions: ['network'],
    changelog: [{ version: '0.9.1', notes: 'SQLite file support' }],
  },
  {
    id: 'regex-tester',
    name: 'Regex Tester',
    author: 'DevUtils',
    version: '1.1.0',
    description: 'Test and explain regular expressions with live highlighting.',
    longDescription:
      'Paste a regex and test string — highlights matches, groups, and explains what each part of the pattern means in plain English.',
    category: 'coding',
    icon: '🔤',
    tags: ['regex', 'developer', 'testing', 'patterns'],
    rating: 4.5,
    downloads: 7200,
    size: '8 KB',
    permissions: [],
    changelog: [{ version: '1.1.0', notes: 'Named group support' }],
    new: true,
  },

  // ── AI ────────────────────────────────────────────────────────
  {
    id: 'memory-store',
    name: 'Long-term Memory',
    author: 'Nexus Official',
    version: '1.3.0',
    description: 'Persist facts and preferences across conversations.',
    longDescription:
      'The AI remembers things you tell it across sessions. Stores preferences, facts, and context in a local vector database. Review and edit memories anytime.',
    category: 'ai',
    icon: '🧠',
    tags: ['memory', 'persistence', 'context', 'rag'],
    rating: 4.7,
    downloads: 24600,
    size: '30 KB',
    permissions: ['storage'],
    changelog: [{ version: '1.3.0', notes: 'Memory editing UI' }],
    official: true,
  },
  {
    id: 'rag-documents',
    name: 'Document RAG',
    author: 'Nexus Official',
    version: '1.1.0',
    description: 'Upload PDFs and docs — chat with your own documents.',
    longDescription:
      'Upload PDF, DOCX, TXT, or Markdown files. The AI indexes them locally and answers questions using your content as context. Everything stays on your device.',
    category: 'ai',
    icon: '📄',
    tags: ['rag', 'pdf', 'documents', 'search', 'local'],
    rating: 4.6,
    downloads: 17300,
    size: '28 KB',
    permissions: ['storage'],
    changelog: [{ version: '1.1.0', notes: 'DOCX and Markdown support' }],
    official: true,
  },
  {
    id: 'voice-input',
    name: 'Voice Input',
    author: 'Nexus Official',
    version: '1.0.0',
    description: 'Speak your messages using on-device speech recognition.',
    longDescription:
      'Use your microphone to dictate messages. Transcription runs on-device via Whisper — no audio leaves your phone.',
    category: 'ai',
    icon: '🎤',
    tags: ['voice', 'speech', 'whisper', 'microphone', 'accessibility'],
    rating: 4.4,
    downloads: 13800,
    size: '12 KB',
    permissions: ['microphone'],
    changelog: [{ version: '1.0.0', notes: 'Initial release' }],
    new: true,
    official: true,
  },

  // ── Productivity ──────────────────────────────────────────────
  {
    id: 'calendar',
    name: 'Calendar & Reminders',
    author: 'NexusApps',
    version: '1.2.1',
    description: 'Ask the AI to schedule events and set reminders.',
    longDescription:
      'Read and write to your device calendar. Ask the AI to schedule meetings, check your schedule, or set reminders using natural language.',
    category: 'productivity',
    icon: '📅',
    tags: ['calendar', 'reminders', 'schedule', 'productivity'],
    rating: 4.5,
    downloads: 11200,
    size: '14 KB',
    permissions: ['calendar', 'notifications'],
    changelog: [{ version: '1.2.1', notes: 'Recurring events support' }],
  },
  {
    id: 'clipboard-manager',
    name: 'Clipboard History',
    author: 'UtilityLabs',
    version: '0.8.0',
    description: 'Access clipboard history and paste anything into chat.',
    longDescription:
      'Keeps a local history of copied text. Quickly paste recent clipboard items into your message. Useful for sharing code snippets or long URLs.',
    category: 'utilities',
    icon: '📋',
    tags: ['clipboard', 'paste', 'history', 'utility'],
    rating: 4.1,
    downloads: 5600,
    size: '6 KB',
    permissions: ['clipboard'],
    changelog: [{ version: '0.8.0', notes: 'Initial beta' }],
  },
  {
    id: 'note-taker',
    name: 'Smart Notes',
    author: 'NexusApps',
    version: '1.0.0',
    description: 'Save AI responses as notes, organize with tags.',
    longDescription:
      'Tap any message to save it as a note. Notes are stored locally, searchable, and can be tagged. Ask the AI to find and recall your saved notes.',
    category: 'productivity',
    icon: '📝',
    tags: ['notes', 'save', 'organize', 'tags'],
    rating: 4.6,
    downloads: 9400,
    size: '10 KB',
    permissions: ['storage'],
    changelog: [{ version: '1.0.0', notes: 'Initial release' }],
    new: true,
  },

  // ── Media ─────────────────────────────────────────────────────
  {
    id: 'youtube-summary',
    name: 'YouTube Summary',
    author: 'MediaTools',
    version: '1.1.0',
    description: 'Paste a YouTube URL — get a summary and key points.',
    longDescription:
      'Fetches the transcript of any YouTube video and summarizes it. Ask follow-up questions about the video content.',
    category: 'media',
    icon: '▶️',
    tags: ['youtube', 'video', 'summary', 'transcript'],
    rating: 4.4,
    downloads: 14700,
    size: '10 KB',
    permissions: ['network'],
    changelog: [{ version: '1.1.0', notes: 'Chapter summaries added' }],
  },

  // ── Search ────────────────────────────────────────────────────
  {
    id: 'wikipedia',
    name: 'Wikipedia',
    author: 'KnowledgeTools',
    version: '1.0.2',
    description: 'Instant Wikipedia lookups with source citations.',
    longDescription:
      'Search Wikipedia directly from chat. Returns summaries with source links. Works offline with cached articles.',
    category: 'search',
    icon: '📖',
    tags: ['wikipedia', 'knowledge', 'reference', 'search'],
    rating: 4.6,
    downloads: 21300,
    size: '8 KB',
    permissions: ['network'],
    changelog: [{ version: '1.0.2', notes: 'Offline cache support' }],
  },
  {
    id: 'arxiv-search',
    name: 'arXiv Research',
    author: 'AcademicAI',
    version: '1.0.0',
    description: 'Search and summarize arXiv research papers.',
    longDescription:
      'Search arXiv by keyword, author, or topic. Get paper summaries, key findings, and links to full PDFs. Great for keeping up with AI research.',
    category: 'search',
    icon: '🔬',
    tags: ['arxiv', 'research', 'papers', 'science', 'ai'],
    rating: 4.7,
    downloads: 6800,
    size: '9 KB',
    permissions: ['network'],
    changelog: [{ version: '1.0.0', notes: 'Initial release' }],
    new: true,
  },

  // ── Security ─────────────────────────────────────────────────
  {
    id: 'prompt-guard',
    name: 'Prompt Guard',
    author: 'SecureAI',
    version: '1.1.0',
    description: 'Detect and block prompt injection attempts.',
    longDescription:
      'Scans incoming content for prompt injection, jailbreak attempts, and malicious instructions before they reach the model. Logs blocked attempts.',
    category: 'security',
    icon: '🛡️',
    tags: ['security', 'prompt-injection', 'protection', 'safety'],
    rating: 4.5,
    downloads: 4200,
    size: '7 KB',
    permissions: [],
    changelog: [{ version: '1.1.0', notes: 'Pattern database update' }],
  },

  // ── Experimental ─────────────────────────────────────────────
  {
    id: 'vision-analyzer',
    name: 'Vision Analyzer',
    author: 'Nexus Labs',
    version: '0.5.0',
    description: 'Analyze images — describe, OCR, and answer questions.',
    longDescription:
      'Take a photo or pick from gallery. The AI describes the image, extracts text (OCR), reads charts, and answers questions about what it sees.',
    category: 'experimental',
    icon: '👁️',
    tags: ['vision', 'ocr', 'image', 'camera', 'multimodal'],
    rating: 4.2,
    downloads: 7900,
    size: '15 KB',
    permissions: ['camera', 'storage'],
    changelog: [{ version: '0.5.0', notes: 'OCR improvements' }],
    new: true,
  },
];

// ── Category meta ─────────────────────────────────────────────────
export const CATEGORIES: { id: PluginCategory | 'all'; label: string; icon: string }[] = [
  { id: 'all',           label: 'All',          icon: '🏪' },
  { id: 'ai',            label: 'AI',           icon: '🤖' },
  { id: 'coding',        label: 'Coding',       icon: '💻' },
  { id: 'search',        label: 'Search',       icon: '🔍' },
  { id: 'productivity',  label: 'Productivity', icon: '📅' },
  { id: 'data',          label: 'Data',         icon: '📊' },
  { id: 'media',         label: 'Media',        icon: '🎬' },
  { id: 'security',      label: 'Security',     icon: '🛡️' },
  { id: 'utilities',     label: 'Utilities',    icon: '🔧' },
  { id: 'experimental',  label: 'Labs',         icon: '🧪' },
];

// ── Persistence ───────────────────────────────────────────────────
export async function getInstalledPlugins(): Promise<InstalledPlugin[]> {
  try {
    const raw = await AsyncStorage.getItem(INSTALLED_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function installPlugin(plugin: Plugin): Promise<void> {
  const installed = await getInstalledPlugins();
  if (installed.find(p => p.id === plugin.id)) return;
  const entry: InstalledPlugin = {
    ...plugin,
    installedAt: Date.now(),
    enabled: true,
    config: {},
  };
  await AsyncStorage.setItem(INSTALLED_KEY, JSON.stringify([...installed, entry]));
}

export async function uninstallPlugin(pluginId: string): Promise<void> {
  const installed = await getInstalledPlugins();
  await AsyncStorage.setItem(
    INSTALLED_KEY,
    JSON.stringify(installed.filter(p => p.id !== pluginId)),
  );
}

export async function togglePlugin(pluginId: string, enabled: boolean): Promise<void> {
  const installed = await getInstalledPlugins();
  await AsyncStorage.setItem(
    INSTALLED_KEY,
    JSON.stringify(installed.map(p => p.id === pluginId ? { ...p, enabled } : p)),
  );
}

export async function updatePluginConfig(
  pluginId: string,
  config: Record<string, string>,
): Promise<void> {
  const installed = await getInstalledPlugins();
  await AsyncStorage.setItem(
    INSTALLED_KEY,
    JSON.stringify(installed.map(p => p.id === pluginId ? { ...p, config: { ...p.config, ...config } } : p)),
  );
}

export function isInstalled(pluginId: string, installed: InstalledPlugin[]): boolean {
  return installed.some(p => p.id === pluginId);
}

export function formatDownloads(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}
