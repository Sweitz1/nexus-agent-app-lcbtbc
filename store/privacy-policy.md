# Privacy Policy

**Nexus Agent**
Last updated: 2025-07-14

---

## 1. Introduction

This Privacy Policy describes how Nexus Agent ("we", "us", or "our") collects, uses, stores, and shares information when you use the Nexus Agent mobile application (the "App"). By using the App you agree to the practices described in this policy. If you do not agree, do not use the App.

---

## 2. Information We Collect

### 2.1 Account Information

When you create an account we collect:

- **Email address** — used to identify your account and send transactional messages (password reset, verification).
- **Display name** — optional, used within the App.
- **OAuth tokens** — if you sign in with Google or Apple, we receive an OAuth identity token from that provider. We store only the information needed to link your account (provider ID and email). We do not store your Google or Apple password.
- **Hashed password** — if you use email/password sign-in, your password is hashed using a strong one-way algorithm before storage. We never store plaintext passwords.

### 2.2 User-Supplied API Keys and Secrets

You may add API keys and tokens for third-party AI providers (OpenAI, Anthropic, Google Gemini) and custom REST APIs. These secrets are:

- Encrypted at rest using **AES-256-GCM** before being written to our database.
- **Never returned in API responses** — the App only receives a boolean flag indicating whether a key is present.
- Used solely to authenticate requests on your behalf when the agent calls the corresponding service.

### 2.3 Task Data and Agent Content

When you create and run tasks we store:

- **Task goals** — the natural-language instructions you provide.
- **Task steps and execution logs** — the agent's plan, intermediate thoughts, tool calls, tool results, and final answers.
- **Memory entries** — content you or the agent explicitly writes to the persistent memory store.
- **Custom API definitions** — endpoint URLs, authentication configuration, and permission settings you register.

### 2.4 Usage and Diagnostic Data

We may collect:

- **App activity logs** — records of agent actions taken within the App, used for debugging and improving reliability.
- **Crash reports** — anonymized crash and error data to help us identify and fix bugs.

We do **not** collect advertising identifiers, precise device location, contacts, photos, or any data unrelated to the App's core function.

---

## 3. How We Use Your Information

| Purpose | Data used |
|---------|-----------|
| Providing and operating the App | Account info, task data, API keys, memory |
| Authenticating you and securing your account | Email, hashed password, OAuth tokens |
| Executing agent tasks on your behalf | Task goals, API keys (injected at call time), memory |
| Debugging and improving the App | Crash reports, app activity logs |
| Communicating with you | Email (transactional only — no marketing without consent) |
| Complying with legal obligations | Any data required by applicable law |

We do **not** sell your personal data. We do not use your data to train AI models.

---

## 4. Third-Party Services Your Data May Flow To

Nexus Agent is a tool that connects to services **you choose and configure**. When the agent executes a task it may send data to:

- **OpenAI** (if you add an OpenAI API key) — task content and tool inputs are sent to OpenAI's API. OpenAI's privacy policy applies: https://openai.com/policies/privacy-policy
- **Anthropic** (if you add an Anthropic API key) — same as above. Anthropic's privacy policy: https://www.anthropic.com/legal/privacy
- **Google (Gemini)** (if you add a Google API key) — same as above. Google's privacy policy: https://policies.google.com/privacy
- **GitHub** (if you connect a GitHub account) — the agent may read repository contents and file listings using your GitHub credentials. GitHub's privacy policy: https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement
- **Custom APIs you register** — any endpoint you add to the App may receive task data when the agent calls it. You are responsible for reviewing the privacy practices of services you connect.

**You control all of these connections.** We do not send your data to any AI provider or external service unless you have explicitly added the corresponding API key or account. Removing a key or account from the App stops all future data flow to that service.

We use the following infrastructure sub-processors to operate the App:

- Cloud hosting and database provider (stores encrypted account and task data)
- Authentication service (manages sign-in sessions)

We maintain data processing agreements with our sub-processors as required by applicable law.

---

## 5. Data Retention

- **Active accounts:** We retain your data for as long as your account exists.
- **Deleted accounts:** When you delete your account (Settings → Danger Zone → Delete Account), all server-side data associated with your account — including task history, memory entries, API keys, logs, and account credentials — is permanently deleted. This action is irreversible.
- **Crash and diagnostic logs:** Retained for up to 90 days, then automatically purged.

---

## 6. Data Security

We implement industry-standard security measures including:

- AES-256-GCM encryption for secrets at rest.
- TLS encryption for all data in transit.
- Access controls limiting which systems and personnel can access production data.
- Regular security reviews.

No method of transmission or storage is 100% secure. We cannot guarantee absolute security, but we are committed to protecting your data using reasonable and appropriate measures.

---

## 7. Your Rights

Depending on your jurisdiction you may have the right to:

- **Access** the personal data we hold about you.
- **Correct** inaccurate data.
- **Delete** your data (use the in-app Delete Account flow for immediate deletion, or contact us).
- **Port** your data to another service.
- **Object** to or restrict certain processing.
- **Withdraw consent** at any time where processing is based on consent.

To exercise any of these rights, contact us at privacy@nexusagent.app.

---

## 8. Children's Privacy

Nexus Agent is not directed at children under the age of 13. We do not knowingly collect personal information from children under 13. If you believe a child under 13 has provided us with personal information, please contact us at privacy@nexusagent.app and we will delete it promptly.

---

## 9. International Data Transfers

Your data may be processed in countries other than your own. Where we transfer data internationally we use appropriate safeguards (such as Standard Contractual Clauses) to ensure your data receives an adequate level of protection.

---

## 10. Changes to This Policy

We may update this Privacy Policy from time to time. We will notify you of material changes by updating the "Last updated" date at the top of this document and, where appropriate, by sending a notification through the App. Your continued use of the App after changes are posted constitutes your acceptance of the updated policy.

---

## 11. Contact

If you have questions or concerns about this Privacy Policy or our data practices, please contact us:

**Email:** privacy@nexusagent.app

We aim to respond to all privacy inquiries within 30 days.
