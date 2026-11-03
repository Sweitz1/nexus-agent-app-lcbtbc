# Nexus Agent — App Store Submission Package

This directory contains every human-readable and store-listing asset needed to submit Nexus Agent to the Apple App Store and Google Play Store.

## File Index

| File | Description |
|------|-------------|
| `README.md` | This file — index and submission checklist |
| `app-info.md` | Core metadata table (app name, bundle ID, categories, pricing, supported devices) |
| `description-long.md` | Full long-form store description (~3500–4000 chars) for both stores |
| `keywords.md` | iOS keyword field, Play Store tags, and ASO long-tail phrase suggestions |
| `whats-new.md` | Version 1.0.0 "What's New" / release notes copy |
| `privacy-policy.md` | Complete privacy policy (live document — link this URL from store listings) |
| `terms-of-service.md` | Full Terms of Service |
| `support.md` | Support page content including FAQ and known limitations |
| `data-safety.md` | Google Play Data Safety form answers (structured table) |
| `app-privacy-ios.md` | Apple App Privacy "Nutrition Label" answers (App Store Connect categories) |
| `review-notes.md` | Notes for App Store / Play Store reviewers including demo account block |

---

## Submission Checklist

The following items are **not** included in this package and must be provided manually before submission.

### Screenshots & Visual Assets

- [ ] **iOS — iPhone 6.9" (iPhone 16 Pro Max):** 5–10 screenshots, 1320 × 2868 px
- [ ] **iOS — iPhone 6.7" (iPhone 14 Plus / 15 Plus):** 5–10 screenshots, 1290 × 2796 px
- [ ] **iOS — iPad Pro 13" (M4):** 5–10 screenshots, 2064 × 2752 px
- [ ] **Android — Phone:** 5–8 screenshots, minimum 1080 × 1920 px (16:9 or 9:16)
- [ ] **Android — Tablet (7" and 10"):** 5–8 screenshots each
- [ ] **App Preview / Promo Video (optional but recommended):** 15–30 s, MP4, 1080p
- [ ] **App icon — 1024 × 1024 px PNG** (no alpha, no rounded corners — stores apply their own mask)
- [ ] **Feature Graphic (Play Store only):** 1024 × 500 px JPG/PNG

### Account & Credentials

- [ ] **Demo account email** — a real, working account the reviewer can log in with
- [ ] **Demo account password** — must remain valid throughout the review period
- [ ] **Demo account pre-loaded API key** — add an OpenAI key to the demo account so reviewers can run tasks without supplying their own key
- [ ] **Demo account pre-created task** — optionally pre-create a completed task so reviewers can see the full agent loop without waiting

### Build Artifacts (EAS)

- [ ] **iOS IPA** — built with `eas build --platform ios --profile production`
- [ ] **Android AAB** — built with `eas build --platform android --profile production`
- [ ] **EAS Submit configured** — `eas.json` submit profiles set for both stores
- [ ] **Apple Distribution Certificate + Provisioning Profile** — managed or manual via EAS
- [ ] **Google Play Service Account JSON** — for automated AAB upload via EAS Submit

### Legal & Compliance

- [ ] **Privacy Policy URL** — host `privacy-policy.md` (or a rendered version) at a public URL and enter it in both store consoles
- [ ] **Terms of Service URL** — same for `terms-of-service.md`
- [ ] **Support URL** — host `support.md` or point to a support page; required by both stores
- [ ] **Replace placeholder emails** — `privacy@nexusagent.app`, `legal@nexusagent.app`, `support@nexusagent.app` must route to real inboxes before going live
- [ ] **GDPR / CCPA compliance review** — if you expect EU or California users, confirm data processing agreements with any sub-processors (OpenAI, Anthropic, Google, GitHub)

### App Store Connect (iOS-specific)

- [ ] **Apple Developer Program membership** active
- [ ] **App Store Connect app record created** with correct bundle ID
- [ ] **Age rating questionnaire** completed (see `app-info.md` for recommended answers)
- [ ] **App Privacy responses** entered in App Store Connect (see `app-privacy-ios.md`)
- [ ] **Export Compliance** — answer "No" to encryption questions if you use only standard HTTPS/TLS; answer "Yes" and provide ERN if you ship custom crypto (AES-256-GCM key storage counts — consult legal counsel)

### Google Play Console (Android-specific)

- [ ] **Google Play Developer account** active
- [ ] **Data Safety section** completed (see `data-safety.md`)
- [ ] **Target audience** set to 13+ (not directed at children)
- [ ] **Content rating questionnaire** completed (IARC)
- [ ] **App signing** configured (Play App Signing recommended)
