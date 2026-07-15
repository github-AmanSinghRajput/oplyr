# Oplyr Monetization & Licensing Plan

**Date:** 2026-07-13
**Status:** Plan only — applies to **v1.0 and later, NOT the beta.** No code yet. Beta stays 100% free.
**Purpose:** capture the pricing + licensing design *and the ethics* so v1.0 monetization is deliberate and clean.

---

## 1. Is this ethical? Yes — and you've earned it.

Charging for software you built is normal, fair, and necessary to keep building it. "Free beta → paid v1.0" is one of the most common and respected models in software. You are not doing anything wrong. A tiny sustainable price funds continued development, which is *good* for users.

The **one** thing that can feel like a "rug pull" is silently taking away a feature beta users had for free. So we do it the right way — these principles are non-negotiable in the plan:

1. **Advance, honest notice.** Well before v1.0, tell beta users (in-app + email) exactly what becomes paid, what stays free, and when.
2. **Grandfather the early users.** Reward beta testers — a free Pro period and/or a lifetime discount. This turns "they took it away" into "they looked after me." Cheap goodwill, huge loyalty.
3. **Keep a genuinely generous free tier.** The entire core cockpit stays free forever, with **no account and the local-first promise intact.**
4. **No dark patterns.** Clear pricing, one-click cancel, honest free/paid boundaries, no nagging.

**Verdict: ethically sound, with the guardrails above baked in.** Charge with a clear conscience.

---

## 2. Free vs Pro

**Free — forever, no account, nothing leaves the Mac:**
- Voice + text control of coding agents; one active agent at a time
- **Project-scoped memory** (the this-project brain)
- Codebase map, diff review + approvals, terminal, docs viewer
- The whole everyday cockpit. No sign-up. No telemetry.

**Pro — ~$5/mo, v1.0+:**
- **Global / cross-project memory** (the headline brain magic — memory that follows you across every project)
- **Multi-agent room + capped debate** (once built)
- Candidates: raw-archive history, advanced recall tuning, priority support

**Rationale:** gate the cross-cutting "wow" features that took the most work and deliver the most leverage; keep everyday, single-project use free and excellent.

---

## 3. Privacy reconciliation (this is the brand — get it right)

The tension: Oplyr's identity is "local-first, no account, no telemetry." Monetization needs *some* license check. Resolve it cleanly:

- **Free tier: unchanged.** No account, no telemetry, everything local. "Nothing leaves your Mac" stays 100% true.
- **Pro tier:** the user **opts into** a paid relationship, so a lightweight license check is expected and acceptable. Mechanics: email + license key, validated online periodically with a **generous offline grace period** (e.g. 7–14 days). **Only the license *status* is ever checked online — memory and code never leave the Mac, even for Pro.** So "your memories stay local" remains true for everyone; only "is your subscription active?" pings a server.

State this explicitly on the pricing page and in-app so it's a feature, not a compromise.

---

## 4. Licensing architecture

- **Payments + tax: use a Merchant of Record — LemonSqueezy or Paddle** (not raw Stripe). They handle worldwide sales tax (VAT/GST), subscriptions, dunning, *and* issue license keys. For a solo founder this removes global tax liability entirely — worth the slightly higher cut.
- **Flow:** user subscribes on the site → MoR issues a license key + fires a webhook → your backend (`vocod-website` + Postgres) records the license/subscription → the app validates the key (online, cached, offline-grace) → **entitlement** flips to Pro → feature flags unlock.
- **In-app gating:** a single `entitlements` object (`{ tier: 'free' | 'pro' }`) drives everything; Pro features check `entitlements.tier === 'pro'` and otherwise render an Upgrade CTA.
- **Reuse existing infra:** `vocod-website` already models leads / invite codes / status / admin / Resend email. Extend the same system with `licenses` / `subscriptions` / `entitlements`. The gate that grants beta access becomes the gate that grants Pro — one system, not two.

---

## 5. Beta → v1.0 transition (the "lose access on update" part, done right)

- **Beta (now):** everything free, no gating, no account.
- **Before v1.0:** email + in-app banner — *"Global memory & the multi-agent room become Pro at v1.0. Here's what stays free forever. As a beta tester, you get [X months Pro free / Y% off for life] — thank you."*
- **At v1.0:** the entitlement check ships. On update:
  - **Free entitlement →** Pro features (global memory, multi-agent room) gate behind an **Upgrade** screen. Data is **not deleted** — global memory is simply gated and re-unlocks on upgrade.
  - **Grandfathered beta users →** flagged in the license DB → Pro unlocked (free period / discount) automatically.

This is the honest version of "beta users lose the special features on update": they lose them *with notice, with a thank-you offer, and without losing their data.*

---

## 6. Timing

- **Beta (now → v1.0):** 100% free, no gating, no account. Optimize for adoption + feedback.
- **v1.0:** introduce Pro ($5/mo), the entitlement layer, the upgrade UI, and honor the beta grandfather grant.

---

## 7. What to build at v1.0 (later — NOT now)

1. Merchant-of-Record account (LemonSqueezy/Paddle) + product + $5/mo subscription.
2. License webhook + `licenses`/`entitlements` tables in `vocod-website` (Postgres).
3. In-app entitlement check: license key → online validate → offline-grace cache.
4. Feature-flag gate (free/pro) wrapping the Pro features (start with global/cross-project memory).
5. Upgrade screen + "manage subscription" link (to the MoR customer portal).
6. Beta grandfather grant + the advance-notice comms (email + in-app banner).

**Nothing here ships in beta.** This doc exists so v1.0 monetization is intentional, ethical, and privacy-preserving.
