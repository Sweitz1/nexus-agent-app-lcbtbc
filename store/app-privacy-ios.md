# Apple App Privacy — Nutrition Label

This document provides the answers to fill in the **App Privacy** section of App Store Connect for Nexus Agent. Use the tables below to complete each privacy question in the form.

---

## Overview

| Question | Answer |
|----------|--------|
| Does this app collect data from users? | **Yes** |

---

## Data Types and Practices

### Contact Info

| Data type | Collected? | Linked to user identity? | Used for tracking? | Purpose(s) |
|-----------|-----------|--------------------------|-------------------|------------|
| **Email Address** | Yes | Yes | No | App functionality (account authentication), Developer's advertising or marketing (transactional only — no ad targeting) |
| **Name** | No | — | — | — |
| **Phone Number** | No | — | — | — |
| **Physical Address** | No | — | — | — |
| **Other Contact Info** | No | — | — | — |

### Health & Fitness

| Data type | Collected? | Linked to user identity? | Used for tracking? | Purpose(s) |
|-----------|-----------|--------------------------|-------------------|------------|
| **Health** | No | — | — | — |
| **Fitness** | No | — | — | — |

### Financial Info

| Data type | Collected? | Linked to user identity? | Used for tracking? | Purpose(s) |
|-----------|-----------|--------------------------|-------------------|------------|
| **Payment Info** | No | — | — | — |
| **Credit Info** | No | — | — | — |
| **Other Financial Info** | No | — | — | — |

### Location

| Data type | Collected? | Linked to user identity? | Used for tracking? | Purpose(s) |
|-----------|-----------|--------------------------|-------------------|------------|
| **Precise Location** | No | — | — | — |
| **Coarse Location** | No | — | — | — |

### Sensitive Info

| Data type | Collected? | Linked to user identity? | Used for tracking? | Purpose(s) |
|-----------|-----------|--------------------------|-------------------|------------|
| **Sensitive Info** | No | — | — | — |

### Contacts

| Data type | Collected? | Linked to user identity? | Used for tracking? | Purpose(s) |
|-----------|-----------|--------------------------|-------------------|------------|
| **Contacts** | No | — | — | — |

### User Content

| Data type | Collected? | Linked to user identity? | Used for tracking? | Purpose(s) |
|-----------|-----------|--------------------------|-------------------|------------|
| **Emails or Text Messages** | No | — | — | — |
| **Photos or Videos** | No | — | — | — |
| **Audio Data** | No | — | — | — |
| **Gameplay Content** | No | — | — | — |
| **Customer Support** | No | — | — | — |
| **Other User Content** | Yes | Yes | No | App functionality — task goals, memory entries, agent execution logs are stored to provide the core service |

### Browsing History

| Data type | Collected? | Linked to user identity? | Used for tracking? | Purpose(s) |
|-----------|-----------|--------------------------|-------------------|------------|
| **Browsing History** | No | — | — | — |

### Search History

| Data type | Collected? | Linked to user identity? | Used for tracking? | Purpose(s) |
|-----------|-----------|--------------------------|-------------------|------------|
| **Search History** | No | — | — | — |

### Identifiers

| Data type | Collected? | Linked to user identity? | Used for tracking? | Purpose(s) |
|-----------|-----------|--------------------------|-------------------|------------|
| **User ID** | Yes | Yes | No | App functionality — internal account identifier used to scope all user data |
| **Device ID** | No | — | — | — |

### Purchases

| Data type | Collected? | Linked to user identity? | Used for tracking? | Purpose(s) |
|-----------|-----------|--------------------------|-------------------|------------|
| **Purchase History** | No | — | — | — |

### Usage Data

| Data type | Collected? | Linked to user identity? | Used for tracking? | Purpose(s) |
|-----------|-----------|--------------------------|-------------------|------------|
| **Product Interaction** | Yes | Yes | No | App functionality, analytics — agent action logs used for debugging and reliability |
| **Advertising Data** | No | — | — | — |
| **Other Usage Data** | No | — | — | — |

### Diagnostics

| Data type | Collected? | Linked to user identity? | Used for tracking? | Purpose(s) |
|-----------|-----------|--------------------------|-------------------|------------|
| **Crash Data** | Yes | No | No | App functionality — anonymized crash reports used to fix bugs |
| **Performance Data** | Yes | No | No | App functionality — anonymized performance metrics |
| **Other Diagnostic Data** | No | — | — | — |

---

## Tracking

| Question | Answer |
|----------|--------|
| Does this app use data to track users? | **No** |
| Does this app use data for third-party advertising? | **No** |
| Does this app use data for developer's advertising or marketing? | **No** (transactional email only, no ad targeting) |

---

## Notes for App Store Connect

- **"Linked to user identity"** means the data is associated with your account (email, user ID, task content). Crash data is anonymized and therefore not linked.
- **"Used for tracking"** means combining data with data from other companies' apps or websites for advertising. Nexus Agent does **not** do this.
- The app uses **Sign in with Apple** — Apple's guidelines require that you do not collect additional data beyond what Sign in with Apple provides without user consent.
- There are **no advertising SDKs**, **no analytics SDKs that share data with ad networks**, and **no third-party tracking frameworks** in this app.
- Task content sent to AI provider APIs (OpenAI, Anthropic, Google) is **user-directed** — the user explicitly connects these services. This is not "sharing with third parties" in Apple's tracking sense; it is the core function of the app.
