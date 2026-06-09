# Google Play Data Safety

This document provides the answers to fill in the **Data Safety** section of the Google Play Console for Nexus Agent. Use the tables below to complete each question in the form.

---

## Section 1: Data Collection and Security

| Question | Answer |
|----------|--------|
| Does your app collect or share any of the required user data types? | **Yes** |
| Is all of the user data collected by your app encrypted in transit? | **Yes** — all data is transmitted over TLS/HTTPS |
| Do you provide a way for users to request that their data is deleted? | **Yes** — Settings → Danger Zone → Delete Account |

---

## Section 2: Data Types Collected and Shared

### Personal Info

| Data type | Collected? | Shared with third parties? | Required or optional? | Purpose |
|-----------|-----------|---------------------------|----------------------|---------|
| **Email address** | Yes | No | Required | Account creation, authentication, transactional email |
| **Name / display name** | No | No | — | — |
| **Phone number** | No | No | — | — |
| **Other personal info** | No | No | — | — |

### Financial Info

| Data type | Collected? | Shared with third parties? | Required or optional? | Purpose |
|-----------|-----------|---------------------------|----------------------|---------|
| **Purchase history** | No | No | — | — |
| **Credit card / payment info** | No | No | — | — |

### Health and Fitness

| Data type | Collected? | Shared with third parties? | Required or optional? | Purpose |
|-----------|-----------|---------------------------|----------------------|---------|
| **Health info** | No | No | — | — |
| **Fitness info** | No | No | — | — |

### Messages

| Data type | Collected? | Shared with third parties? | Required or optional? | Purpose |
|-----------|-----------|---------------------------|----------------------|---------|
| **Emails** | No | No | — | — |
| **SMS or MMS** | No | No | — | — |
| **Other in-app messages** | No | No | — | — |

### Photos and Videos

| Data type | Collected? | Shared with third parties? | Required or optional? | Purpose |
|-----------|-----------|---------------------------|----------------------|---------|
| **Photos** | No | No | — | — |
| **Videos** | No | No | — | — |

### Audio Files

| Data type | Collected? | Shared with third parties? | Required or optional? | Purpose |
|-----------|-----------|---------------------------|----------------------|---------|
| **Voice or sound recordings** | No | No | — | — |
| **Music files** | No | No | — | — |
| **Other audio files** | No | No | — | — |

### Files and Docs

| Data type | Collected? | Shared with third parties? | Required or optional? | Purpose |
|-----------|-----------|---------------------------|----------------------|---------|
| **Files and docs** | No | No | — | — |

### Calendar

| Data type | Collected? | Shared with third parties? | Required or optional? | Purpose |
|-----------|-----------|---------------------------|----------------------|---------|
| **Calendar events** | No | No | — | — |

### Contacts

| Data type | Collected? | Shared with third parties? | Required or optional? | Purpose |
|-----------|-----------|---------------------------|----------------------|---------|
| **Contacts** | No | No | — | — |

### App Activity

| Data type | Collected? | Shared with third parties? | Required or optional? | Purpose |
|-----------|-----------|---------------------------|----------------------|---------|
| **App interactions** | Yes | No | Required | Debugging, reliability improvements |
| **In-app search history** | No | No | — | — |
| **Installed apps** | No | No | — | — |
| **Other user-generated content** | Yes | No (see note) | Required | Task goals, memory entries, agent logs stored to provide the service |
| **Other actions** | No | No | — | — |

> **Note on "Shared with third parties":** Task content (goals, tool inputs/outputs) is sent to the AI provider API whose key the user has configured (e.g. OpenAI, Anthropic, Google). This is user-directed sharing — the user explicitly connects these services. Mark this as "Shared" and select "At user's discretion" when the Play Console form asks for the sharing condition.

### Web Browsing

| Data type | Collected? | Shared with third parties? | Required or optional? | Purpose |
|-----------|-----------|---------------------------|----------------------|---------|
| **Web browsing history** | No | No | — | — |

### App Info and Performance

| Data type | Collected? | Shared with third parties? | Required or optional? | Purpose |
|-----------|-----------|---------------------------|----------------------|---------|
| **Crash logs** | Yes | No | Required | Bug fixing and stability |
| **Diagnostics** | Yes | No | Required | Performance monitoring |
| **Other app performance data** | No | No | — | — |

### Device or Other IDs

| Data type | Collected? | Shared with third parties? | Required or optional? | Purpose |
|-----------|-----------|---------------------------|----------------------|---------|
| **Device or other IDs** | No | No | — | — |

---

## Section 3: Data Handling Practices

| Practice | Answer |
|----------|--------|
| Is the data collected limited to what is required for the features you described? | **Yes** |
| Is data retained only as long as necessary? | **Yes** — deleted immediately on account deletion; crash logs purged after 90 days |
| Do you follow the Families Policy requirements? | **No** — app is not directed at children |

---

## Notes for the Play Console Form

- When asked about **data sharing with third parties**, select "At user's discretion" for task/user content data — the user explicitly connects AI providers and custom APIs.
- When asked about **data security practices**, check: "Data is encrypted in transit" and "You provide a way for users to request data deletion."
- The app does **not** use advertising SDKs, analytics SDKs that share data with ad networks, or any cross-app tracking.
