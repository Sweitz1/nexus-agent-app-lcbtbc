# Nexus Agent — Long-Form Store Description

> Use this copy for both the App Store (no character limit on long description) and Google Play (max 4000 chars). The character count is noted at the bottom of this file.

---

## Store Description

Nexus Agent puts a fully autonomous AI agent in your pocket — one that can plan multi-step tasks, call your own APIs, read and write files, search the web, and remember context across sessions, all while keeping you in control of every risky action it takes.

**What you can do**

- **Automate multi-step tasks.** Describe a goal in plain language. Nexus Agent breaks it into a plan, executes each step, reflects on the results, and adapts when something goes wrong — without you having to micromanage every action.
- **Route across multiple AI providers.** Connect OpenAI, Anthropic Claude, or Google Gemini. Switch models per task or let the agent choose. Bring your own API keys — your usage, your costs, your data.
- **Add your own REST APIs.** Register any HTTP endpoint as an agent tool. Set authentication (none, API key, bearer token, or OAuth), define which endpoints the agent is allowed to call, and require human confirmation before sensitive operations run.
- **Integrate with GitHub.** Read repository contents and list files directly from the agent loop. Useful for code review tasks, documentation generation, and repository analysis.
- **Sandboxed file operations.** The agent can read, write, and delete files within a secure sandbox. No access outside the designated workspace — your device files stay untouched.
- **Persistent memory.** The agent writes and searches a personal memory store across sessions. It remembers your preferences, past task outcomes, and context you explicitly ask it to retain.
- **Approval gates.** Before any action flagged as risky — calling an external API, writing a file, or taking an irreversible step — the agent pauses and asks for your go-ahead. You can approve, reject, or edit the proposed action before it runs.

**Built-in safety**

- **Human-in-the-loop by design.** Every tool call can be configured to require explicit approval. You decide which operations run automatically and which ones wait for your review.
- **Shell execution is blocked.** Arbitrary shell commands are disabled at the safety layer in this release. The agent cannot run system commands, install software, or access your device's OS.
- **Encrypted secrets.** API keys and tokens you add are encrypted with AES-256-GCM before storage and are never returned in API responses — not even to you. The app only ever tells you whether a key is present.
- **No credential theft surface.** The agent cannot read secrets out of its own store. Keys are injected at call time by the backend and never exposed to the agent's reasoning context.
- **SSRF protection.** The web fetch tool blocks requests to private IP ranges and internal network addresses, preventing the agent from probing your local network.

**For developers and power users**

Nexus Agent is built for people who want real automation, not a chatbot with a task list. If you work with APIs, manage code repositories, process documents, or run repetitive research workflows, this is the tool that lets you describe what you want and get it done — with full visibility into every step the agent takes and full control over what it's allowed to do. The custom API system means you can wire up any service you already use: your own backend, a SaaS product with a REST API, an internal tool — if it has an endpoint, the agent can call it.

**What's included in this release**

- Task creation with natural-language goals
- Full agent loop: plan → thought → tool call → tool result → reflection → final answer
- Five built-in tool types: web fetch, GitHub read/list, custom API call, memory search/write, sandboxed file read/write/delete
- Multi-provider model routing: OpenAI, Anthropic, Google Gemini, and custom OpenAI-compatible endpoints
- Custom REST API registration with per-endpoint permission and confirmation controls
- Persistent memory store with semantic search
- Task history with step-by-step execution logs
- Approval gate system for risky actions
- AES-256-GCM encrypted secret storage
- Sign in with email/password, Google, or Apple
- Dashboard with task status overview
- Full account deletion with server-side data wipe

**Get started in under two minutes.** Sign up, add an API key for your preferred AI provider, describe a task, and watch the agent work — pausing to ask whenever it needs your approval.

---

*Character count: see bottom of file*

---

**Character count (description body only, excluding Markdown headings and this note):** 3,847
