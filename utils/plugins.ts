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
  | 'experimental'
  | 'files'
  | 'adult'
  | 'ebooks';

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

  // ── Files ─────────────────────────────────────────────────────
  {
    id: 'pdf-analyzer',
    name: 'PDF Analyzer',
    author: 'Nexus Official',
    version: '1.3.0',
    description: 'Extract text, tables, and metadata from any PDF.',
    longDescription:
      'Upload any PDF and ask questions about it. Extracts raw text, tables, embedded images, form fields, and document metadata. Handles scanned PDFs with on-device OCR. Works entirely offline — nothing leaves your device.',
    category: 'files',
    icon: '📑',
    tags: ['pdf', 'ocr', 'extract', 'documents', 'tables'],
    rating: 4.7,
    downloads: 22400,
    size: '34 KB',
    permissions: ['storage'],
    changelog: [
      { version: '1.3.0', notes: 'Table extraction with markdown output' },
      { version: '1.2.0', notes: 'Scanned PDF OCR support' },
      { version: '1.0.0', notes: 'Initial release' },
    ],
    featured: true,
    official: true,
  },
  {
    id: 'csv-processor',
    name: 'CSV & Spreadsheet',
    author: 'DataTools',
    version: '1.1.2',
    description: 'Load CSV, XLSX, and TSV files — query and visualize data.',
    longDescription:
      'Import CSV, XLSX, TSV, or JSON files up to 50 MB. Ask the AI to filter rows, compute statistics, generate charts, write formulas, and export cleaned data. Supports multi-sheet Excel workbooks.',
    category: 'files',
    icon: '📊',
    tags: ['csv', 'excel', 'spreadsheet', 'data', 'analysis'],
    rating: 4.6,
    downloads: 14900,
    size: '26 KB',
    permissions: ['storage'],
    changelog: [
      { version: '1.1.2', notes: 'Multi-sheet XLSX support' },
      { version: '1.1.0', notes: 'Chart generation added' },
    ],
    official: true,
  },
  {
    id: 'file-converter',
    name: 'File Converter',
    author: 'UtilityLabs',
    version: '1.0.1',
    description: 'Convert between PDF, DOCX, Markdown, HTML, and plain text.',
    longDescription:
      'On-device file conversion — no upload to third-party servers. Converts PDF ↔ DOCX ↔ Markdown ↔ HTML ↔ TXT. Preserves headings, lists, tables, and basic formatting. Batch convert multiple files at once.',
    category: 'files',
    icon: '🔄',
    tags: ['convert', 'pdf', 'docx', 'markdown', 'html'],
    rating: 4.3,
    downloads: 9800,
    size: '18 KB',
    permissions: ['storage'],
    changelog: [
      { version: '1.0.1', notes: 'Batch conversion support' },
      { version: '1.0.0', notes: 'Initial release' },
    ],
    new: true,
  },
  {
    id: 'audio-transcriber',
    name: 'Audio Transcriber',
    author: 'Nexus Official',
    version: '1.1.0',
    description: 'Transcribe MP3, WAV, and M4A files with Whisper on-device.',
    longDescription:
      'Upload any audio file and get a full transcript with speaker labels and timestamps. Runs Whisper locally — no audio ever leaves your device. Supports 99 languages. Export as SRT, VTT, or plain text.',
    category: 'files',
    icon: '🎙️',
    tags: ['audio', 'transcribe', 'whisper', 'speech', 'subtitles'],
    rating: 4.8,
    downloads: 18300,
    size: '22 KB',
    permissions: ['storage', 'microphone'],
    changelog: [
      { version: '1.1.0', notes: 'Speaker diarization, SRT/VTT export' },
      { version: '1.0.0', notes: 'Initial release' },
    ],
    official: true,
  },
  {
    id: 'image-batch',
    name: 'Image Batch Processor',
    author: 'MediaTools',
    version: '0.9.0',
    description: 'Resize, convert, tag, and describe batches of images with AI.',
    longDescription:
      'Process multiple images at once — resize, crop, convert format (PNG/JPEG/WebP), strip EXIF data, or run AI description/tagging on each. Useful for preparing datasets or organising a photo library. All processing is on-device.',
    category: 'files',
    icon: '🖼️',
    tags: ['image', 'batch', 'resize', 'convert', 'tagging'],
    rating: 4.2,
    downloads: 6700,
    size: '14 KB',
    permissions: ['storage'],
    changelog: [{ version: '0.9.0', notes: 'AI auto-tagging added' }],
    new: true,
  },
  {
    id: 'archive-explorer',
    name: 'Archive Explorer',
    author: 'UtilityLabs',
    version: '1.0.0',
    description: 'Browse, extract, and analyze ZIP, TAR, and 7z archives.',
    longDescription:
      'Open compressed archives without extracting everything first. Browse the file tree, preview text files inside, selectively extract, and ask the AI to summarize the contents. Supports ZIP, TAR.GZ, TAR.BZ2, and 7z.',
    category: 'files',
    icon: '🗜️',
    tags: ['zip', 'archive', 'tar', 'extract', 'compress'],
    rating: 4.4,
    downloads: 5100,
    size: '11 KB',
    permissions: ['storage'],
    changelog: [{ version: '1.0.0', notes: 'Initial release' }],
    new: true,
  },

  // ── Ebooks ────────────────────────────────────────────────────
  {
    id: 'epub-reader',
    name: 'EPUB Reader',
    author: 'Nexus Official',
    version: '1.2.0',
    description: 'Read EPUB ebooks in-app with AI chat about the content.',
    longDescription:
      'Open and read any EPUB file directly in the app. Full-featured reader with adjustable font size, night mode, bookmarks, highlights, and per-chapter notes. Ask the AI questions about what you\'re reading — plot summaries, character analysis, definitions — without ever leaving the page. Sideloaded books are stored locally.',
    category: 'ebooks',
    icon: '📚',
    tags: ['epub', 'ebook', 'reader', 'books', 'reading'],
    rating: 4.8,
    downloads: 27600,
    size: '38 KB',
    permissions: ['storage'],
    changelog: [
      { version: '1.2.0', notes: 'AI in-page chat overlay, chapter Q&A' },
      { version: '1.1.0', notes: 'Highlights and notes sync' },
      { version: '1.0.0', notes: 'Initial release' },
    ],
    featured: true,
    official: true,
  },
  {
    id: 'kindle-sync',
    name: 'Kindle Sync',
    author: 'Nexus Official',
    version: '1.0.2',
    description: 'Import Kindle highlights, notes, and clippings — chat with them.',
    longDescription:
      'Connect your Amazon Kindle account or import a My Clippings.txt file. All your highlights and notes are indexed locally so you can ask the AI to find quotes, summarise a book\'s key ideas, or generate flashcards from your annotations. Nothing is sent to Amazon — sync pulls data to your device only.',
    category: 'ebooks',
    icon: '📖',
    tags: ['kindle', 'amazon', 'highlights', 'clippings', 'notes'],
    rating: 4.6,
    downloads: 19100,
    size: '20 KB',
    permissions: ['network', 'storage'],
    changelog: [
      { version: '1.0.2', notes: 'My Clippings.txt manual import' },
      { version: '1.0.0', notes: 'Initial Kindle account sync' },
    ],
    official: true,
  },
  {
    id: 'ebook-converter',
    name: 'Ebook Converter',
    author: 'ReadTools',
    version: '1.1.0',
    description: 'Convert between EPUB, MOBI, AZW3, PDF, and plain text.',
    longDescription:
      'On-device ebook format conversion powered by Calibre-compatible libraries. Convert EPUB ↔ MOBI ↔ AZW3 ↔ PDF ↔ TXT ↔ HTML. Strip DRM from books you own (check your local laws). Batch convert entire libraries. Preserves cover images, chapter structure, and metadata.',
    category: 'ebooks',
    icon: '🔀',
    tags: ['epub', 'mobi', 'azw3', 'convert', 'calibre'],
    rating: 4.5,
    downloads: 13400,
    size: '42 KB',
    permissions: ['storage'],
    changelog: [
      { version: '1.1.0', notes: 'AZW3 output support, batch mode' },
      { version: '1.0.0', notes: 'Initial release' },
    ],
    new: true,
  },
  {
    id: 'ebook-library',
    name: 'Ebook Library',
    author: 'ReadTools',
    version: '1.0.0',
    description: 'Organise your ebook collection with AI-generated metadata.',
    longDescription:
      'Scan a folder of EPUB, MOBI, PDF, or AZW3 files and build a searchable library. The AI fills in missing titles, authors, genres, and summaries by reading the actual content. Filter by genre, author, or series. Track reading progress across all your books in one place.',
    category: 'ebooks',
    icon: '🗂️',
    tags: ['library', 'organize', 'epub', 'metadata', 'catalog'],
    rating: 4.4,
    downloads: 8700,
    size: '24 KB',
    permissions: ['storage'],
    changelog: [{ version: '1.0.0', notes: 'Initial release' }],
    new: true,
  },
  {
    id: 'book-summarizer',
    name: 'Book Summarizer',
    author: 'AcademicAI',
    version: '1.1.0',
    description: 'Generate chapter summaries, flashcards, and study guides from ebooks.',
    longDescription:
      'Load any EPUB or PDF and generate a structured chapter-by-chapter summary, a set of Q&A flashcards, a vocabulary list, or a full study guide. Great for textbooks, non-fiction, or academic papers. Exports to Markdown, PDF, or Anki deck format.',
    category: 'ebooks',
    icon: '🧾',
    tags: ['summary', 'flashcards', 'study', 'epub', 'anki'],
    rating: 4.7,
    downloads: 11200,
    size: '16 KB',
    permissions: ['storage'],
    changelog: [
      { version: '1.1.0', notes: 'Anki deck export, vocabulary lists' },
      { version: '1.0.0', notes: 'Initial release' },
    ],
    official: true,
  },
  {
    id: 'gutenberg-browser',
    name: 'Project Gutenberg',
    author: 'KnowledgeTools',
    version: '1.0.0',
    description: 'Browse and download 70,000+ free public domain books.',
    longDescription:
      'Search and download the entire Project Gutenberg library — over 70,000 free ebooks. Books open directly in the built-in EPUB reader. Includes offline access for downloaded titles and an AI-powered recommendation engine based on your reading history.',
    category: 'ebooks',
    icon: '🏛️',
    tags: ['gutenberg', 'free', 'public-domain', 'classics', 'download'],
    rating: 4.6,
    downloads: 16800,
    size: '12 KB',
    permissions: ['network', 'storage'],
    changelog: [{ version: '1.0.0', notes: 'Initial release' }],
  },

  // ── Adult (NSFW) ──────────────────────────────────────────────
  {
    id: 'nsfw-content',
    name: 'Adult Content',
    author: 'Nexus Labs',
    version: '1.0.0',
    description: 'Unlock adult / NSFW text and image generation. Requires Venice backend.',
    longDescription:
      'Removes content filters for text generation and enables NSFW image generation via Stable Diffusion. Requires a connected Venice private LLM backend running an uncensored model (e.g. dolphin-mistral, hermes3). All content is generated on your own server — nothing is sent to third-party APIs. You are responsible for complying with the laws of your jurisdiction. This plugin is restricted to users 18+.',
    category: 'adult',
    icon: '🔞',
    tags: ['nsfw', 'adult', 'uncensored', 'venice', 'image-gen'],
    rating: 4.1,
    downloads: 3800,
    size: '9 KB',
    permissions: ['network', 'storage'],
    changelog: [{ version: '1.0.0', notes: 'Initial release — Venice backend required' }],
  },
  {
    id: 'nsfw-image-gen',
    name: 'Adult Image Generator',
    author: 'Nexus Labs',
    version: '0.8.0',
    description: 'Generate unrestricted images via your own ComfyUI / A1111 server.',
    longDescription:
      'Connects to your self-hosted ComfyUI or Automatic1111 instance to generate adult images. Supports LoRA loading, negative prompts, aspect ratios, and inpainting. No prompts or images leave your server. Requires self-hosted Stable Diffusion — no cloud API is used. 18+ only.',
    category: 'adult',
    icon: '🎭',
    tags: ['nsfw', 'adult', 'stable-diffusion', 'comfyui', 'a1111'],
    rating: 4.0,
    downloads: 2900,
    size: '12 KB',
    permissions: ['network', 'storage'],
    changelog: [
      { version: '0.8.0', notes: 'LoRA support, inpainting' },
      { version: '0.7.0', notes: 'Initial release' },
    ],
  },
  {
    id: 'roleplay-personas',
    name: 'Roleplay Personas',
    author: 'NexusApps',
    version: '1.0.0',
    description: 'Custom AI personas with no character limits. Venice backend recommended.',
    longDescription:
      'Create persistent AI personas with custom names, personalities, and backstories. Personas have no built-in content restrictions when used with a Venice uncensored backend. Save and switch between multiple personas in any conversation. All persona data is stored locally.',
    category: 'adult',
    icon: '🎪',
    tags: ['roleplay', 'persona', 'character', 'uncensored', 'fiction'],
    rating: 4.5,
    downloads: 5200,
    size: '8 KB',
    permissions: ['storage'],
    changelog: [{ version: '1.0.0', notes: 'Initial release' }],
    new: true,
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
  { id: 'files',        label: 'Files',        icon: '📁' },
  { id: 'ebooks',       label: 'Ebooks',       icon: '📚' },
  { id: 'adult',        label: 'Adult (18+)',  icon: '🔞' },
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
