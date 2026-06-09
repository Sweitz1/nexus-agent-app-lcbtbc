# App Store / Play Store Review Notes

**App name:** Nexus Agent
**Version:** 1.0.0
**Platform:** iOS and Android

These notes are intended for the App Store reviewer (Apple) and the Play Store reviewer (Google). Please read before beginning your review.

---

## Demo Account

> **USER MUST FILL IN — replace the placeholders below with real credentials before submitting for review. The demo account must remain active and the API key must remain valid for the entire review period.**

| Field | Value |
|-------|-------|
| **Email** | `REPLACE_WITH_DEMO_EMAIL@example.com` |
| **Password** | `REPLACE_WITH_DEMO_PASSWORD` |
| **Sign-in method** | Email / Password |
| **Pre-loaded API key** | An OpenAI API key has been added to this account under Settings → Model Providers → OpenAI. Reviewers do not need to supply their own key. |
| **Pre-created task** | A completed example task ("List 3 fun facts about cats") is visible in the Tasks tab to demonstrate the full agent loop without waiting for execution. |

---

## How to Test the App

Follow these steps to exercise the core functionality:

### Step 1 — Sign In

1. Open the App.
2. On the sign-in screen, enter the demo account email and password above.
3. Tap **Sign In**.

### Step 2 — Verify API Key is Present

1. Tap the **Settings** tab (bottom navigation, rightmost icon).
2. Tap **Model Providers**.
3. Confirm that **OpenAI** shows a key is configured (the field will show a masked indicator, not the actual key).

### Step 3 — Create a New Task

1. Tap the **New Task** tab (bottom navigation, second icon).
2. In the goal field, enter: `List 3 fun facts about cats`
3. Leave all other settings at their defaults.
4. Tap **Create Task** (or **Run**).

### Step 4 — Observe the Agent Loop

1. The App will navigate to the task detail view.
2. You will see the agent produce a **plan**, then execute **steps** one by one.
3. Each step shows: the agent's **thought**, the **tool call** it intends to make, the **tool result**, and a **reflection**.
4. For this simple task, no approval gate should be triggered — the agent will complete autonomously.
5. The final answer ("3 fun facts about cats") will appear when the loop completes.

### Step 5 — Inspect the Approval Gate (optional)

To see the approval gate in action:

1. Go to **Settings → Permissions**.
2. Enable "Require approval for all tool calls."
3. Create a new task with any goal.
4. When the agent reaches its first tool call, it will pause and display an approval prompt.
5. Tap **Approve** to let it proceed, or **Reject** to skip the step.
6. Reset the permission to its default after testing.

### Step 6 — View Task History

1. Tap the **Tasks** tab.
2. The pre-created example task is visible here.
3. Tap it to see the full step-by-step execution log.

### Step 7 — View Memory

1. Tap the **Memory** tab.
2. This shows persistent memory entries the agent has written across sessions.

### Step 8 — Account Deletion (optional — do not delete the demo account)

The Delete Account flow is available at **Settings → Danger Zone → Delete Account**. Please do not delete the demo account during review. If you wish to test this flow, create a separate test account first.

---

## Important Notes for Reviewers

### The app requires a user-supplied LLM API key to run tasks

Nexus Agent does not bundle any AI model or API key. To run agent tasks, a user must add their own API key for at least one supported provider (OpenAI, Anthropic, or Google Gemini). The demo account above has an OpenAI key pre-configured so reviewers do not need to supply their own.

If you choose to test with your own account instead of the demo account, you will need to add an API key in **Settings → Model Providers** before creating tasks.

### Shell execution is blocked

Arbitrary shell command execution is **disabled at the safety layer** in this release. The agent cannot run terminal commands, execute scripts, or interact with the device OS. This is intentional. If you attempt a task that would require shell access, the agent will report that the tool is unavailable.

### No third-party trackers, no ads, no payment SDKs

This app contains:

- No advertising SDKs (no AdMob, no Meta Audience Network, no AppLovin, etc.)
- No analytics SDKs that share data with ad networks (no Firebase Analytics, no Mixpanel, no Amplitude)
- No payment SDKs (no Stripe, no RevenueCat, no StoreKit — the app is free with no in-app purchases)
- No cross-app tracking frameworks

The only network calls the app makes are:

1. To our own backend (authentication, task management, encrypted secret storage).
2. To the AI provider API whose key the user has configured (OpenAI, Anthropic, or Google) — only when a task is running.
3. To GitHub's API — only if the user has connected a GitHub account and the agent uses the GitHub tool.
4. To any custom REST API endpoints the user has registered — only when the agent calls them.

### Deep-link scheme

The app uses the `nexusagent://` deep-link scheme for OAuth callback handling (Google and Apple sign-in). This is declared in the app manifest and is used only for authentication redirects.

### Encryption note (iOS Export Compliance)

The app uses AES-256-GCM to encrypt API keys at rest on the server side. All client-server communication uses standard HTTPS/TLS. If Apple's export compliance questionnaire asks about encryption, answer **Yes** to using encryption and consult your legal counsel about whether an Encryption Registration Number (ERN) is required for your jurisdiction.

---

## Contact

If you have questions during the review process, please contact:

**Email:** support@nexusagent.app
