# Nexus Agent — Support

## Getting Help

If you run into an issue or have a question that isn't answered below, email us at:

**support@nexusagent.app**

We aim to respond within 2 business days. When writing in, please include:

- The device model and OS version you're using
- The version of Nexus Agent (visible in Settings)
- A brief description of what you were trying to do and what happened instead
- Any error messages shown in the App

---

## Frequently Asked Questions

### Where are my API keys stored?

Your API keys are encrypted using AES-256-GCM before they are written to our servers. The encryption key is managed by our backend infrastructure and is never exposed to the App or to you directly. When you view your provider settings, the App only shows whether a key is present — it never displays the key itself. This means that even if someone gained access to the database, they would see only ciphertext, not your actual keys.

To remove a key at any time, go to **Settings → Model Providers**, select the provider, and delete the key. The key is immediately removed from our servers.

---

### Does Nexus Agent send my code or task data to third parties?

Only to the AI provider you have explicitly connected. When you run a task, the agent's inputs (your goal, intermediate results, tool outputs) are sent to whichever AI provider's API key you have configured — for example, OpenAI's API if you added an OpenAI key. We do not send your data to any provider you have not connected, and we do not use your task data to train our own models.

If you connect a custom REST API as an agent tool, the agent may send task-relevant data to that endpoint when it calls it. You control which endpoints are registered and which ones require your approval before being called.

---

### How do I delete my account?

1. Open the App and go to **Settings**.
2. Scroll to the **Danger Zone** section at the bottom.
3. Tap **Delete Account**.
4. Confirm the deletion when prompted.

Deleting your account permanently removes all server-side data associated with your account: task history, memory entries, API keys, logs, custom API configurations, and your account credentials. This action cannot be undone.

---

### Why does the agent ask for approval before taking certain actions?

Nexus Agent includes an approval gate system designed to keep you in control of actions that could have significant or irreversible consequences — for example, calling an external API, writing or deleting a file, or submitting data to a service.

When the agent reaches a step that requires approval, it pauses and shows you exactly what it intends to do. You can:

- **Approve** — the agent proceeds with the action as described.
- **Reject** — the agent skips the action and continues planning around it.
- **Edit** — modify the action parameters before approving.

You can configure which tool types always require approval in **Settings → Permissions**.

---

### What happens if a task fails?

If the agent encounters an error during a task — for example, an API call returns an error, a file cannot be found, or the model produces an unusable response — it will:

1. Log the error in the task's step history.
2. Attempt to reflect on the failure and adjust its plan.
3. If it cannot recover, mark the task as failed and show you the last known state.

You can view the full step-by-step log for any task by opening it in the **Tasks** tab. The log shows every thought, tool call, tool result, and reflection the agent produced, which makes it easier to understand what went wrong.

If a task fails repeatedly on the same step, try:

- Checking that your API key for the relevant provider is valid and has sufficient quota.
- Simplifying the task goal into smaller sub-goals.
- Reviewing the tool permissions to ensure the agent has access to the tools it needs.

---

## Known Limitations

### Shell execution is not available in this release

Arbitrary shell command execution is **blocked at the safety layer** in this version of Nexus Agent. The agent cannot run terminal commands, execute scripts, install software, or interact with your device's operating system. This is an intentional safety decision for the initial release.

If you attempt to create a task that requires shell access, the agent will inform you that the shell tool is unavailable and will attempt to complete the goal using the available tools (web fetch, file operations, custom APIs, etc.).

Shell execution may be introduced in a future release with additional safety controls.

### No real-time streaming

Agent responses are delivered when each step completes, not streamed token-by-token. For long-running tasks, the App will show a progress indicator while the agent is working.

### Custom API OAuth support

OAuth-authenticated custom APIs require manual token management in this release. The App does not perform the OAuth authorization code flow automatically — you must obtain a bearer token from your OAuth provider and enter it manually.

### GitHub write operations

GitHub integration in this release supports read operations only (reading file contents, listing repository files). Creating commits, opening pull requests, and other write operations are not available.

---

## Privacy Policy and Terms of Service

- Privacy Policy: *(insert hosted URL)*
- Terms of Service: *(insert hosted URL)*
