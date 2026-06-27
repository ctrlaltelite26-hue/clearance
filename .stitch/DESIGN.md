# Clearance — Stitch Design System

Reference for all Google Stitch UI generation sessions. **Paste the "Stitch prefix" block into every prompt** so screens stay consistent.

**Product:** Clearance — AI autopilot for real support inboxes (AgentMail + Qwen Cloud).  
**Platform:** Desktop web app primary (1440px); optional mobile 390px for inbox.  
**Track:** Qwen Cloud Hackathon — Autopilot Agent (human-in-the-loop on real email).

---

## Stitch prefix (copy into every prompt)

```
Product: Clearance — B2B SaaS AI autopilot for real support email inboxes.

Match this design system exactly:
- Theme: Refined dark SaaS (Linear + Superhuman inspired)
- Background: #0B0F14
- Surface / cards: #141A22
- Border: #243044
- Text primary: #E8EDF4
- Text muted: #8B9CB3
- Accent (primary CTA, active nav, links): #2DD4BF (teal) with dark text #0B0F14 on buttons
- Warning / pending approval: #F59E0B
- Danger / reject: #EF4444
- Success / sent / resolved: #22C55E
- Typography: Geist-like clean sans-serif; monospace for IDs (INC-1042, thread IDs)
- Layout: 8px grid, 1px borders, minimal shadows, generous but dense email-client spacing
- Avoid: purple gradients, generic AI aesthetics, stock photos, 3D illustrations, glassmorphism
- Components: sidebar nav, thread rows, agent status pills, Safe/Risky badges, approval cards with left accent border when pending
```

---

## Brand

| Item | Value |
|------|--------|
| Name | Clearance |
| Tagline | Your inbox, on autopilot. |
| Subline | Real inboxes. Real email. Autopilot when you want it. |
| Tone | Professional, trustworthy, calm urgency — not alarmist |

---

## Color tokens

| Token | Hex | Usage |
|-------|-----|--------|
| `bg-app` | `#0B0F14` | Page background |
| `bg-surface` | `#141A22` | Cards, panels, sidebar |
| `bg-elevated` | `#1A2332` | Hover, selected row |
| `border` | `#243044` | Dividers, inputs |
| `text-primary` | `#E8EDF4` | Headings, body |
| `text-muted` | `#8B9CB3` | Timestamps, meta, hints |
| `accent` | `#2DD4BF` | Primary actions, active nav, agent live |
| `accent-text` | `#0B0F14` | Text on accent buttons |
| `warning` | `#F59E0B` | Awaiting approval, risky |
| `danger` | `#EF4444` | Reject, blocked, errors |
| `success` | `#22C55E` | Sent, auto-handled, verified |

---

## Typography

| Role | Size | Weight | Notes |
|------|------|--------|-------|
| H1 | 28–32px | 600 | Page titles |
| H2 | 20–24px | 600 | Section headers |
| H3 | 16–18px | 600 | Card titles |
| Body | 14–15px | 400 | Email body, forms |
| Caption | 12–13px | 400 | Meta, labels |
| Mono | 13px | 400 | Ticket IDs, API ids |

---

## Spacing & layout

- **Grid:** 8px base unit
- **Sidebar:** 240–260px (nav + inbox switcher)
- **Agent panel:** 360–400px (right sidebar on thread detail)
- **Thread list row height:** 56–72px
- **Border radius:** 6px buttons/inputs, 8px cards
- **Max content width (marketing):** 1200px centered

---

## Components

### Navigation (app shell)

- Left sidebar: logo, inbox switcher dropdown, nav items (Inbox, Approvals, Activity, Settings)
- Active item: teal left border or teal text + subtle `bg-elevated`
- Approvals nav badge: orange count pill
- Bottom: user avatar + name + logout

### Thread list row

- Sender name (bold if unread) + email muted
- Subject line
- One-line preview (muted, truncated)
- Right: relative time, agent label chip, optional confidence %, unread dot

### Agent label chips

Examples: `Access request`, `Incident`, `How-to`, `Unknown`, `Needs info`  
Style: small pill, muted background, 12px caption text

### Status badges

| Badge | Color | Meaning |
|-------|-------|---------|
| Safe | green tint | Auto-executed action |
| Risky | orange tint | Needs approval |
| Awaiting approval | orange border-left on card | Pending human |
| Auto-handled | green | Agent completed without human |
| Needs info | blue-gray | Clarification required |
| Blocked | red | Policy denied |

### Agent sidebar panel ("Autopilot")

Sections (top to bottom):

1. Status header — "Agent active" pulse dot or "Paused"
2. Analysis — intent, urgency, confidence meter (0–100%)
3. Entities — extracted names, roles, apps
4. Action plan — checklist with tool names (`user.lookup`, `ticket.create`, etc.)
5. Actions — View approval · Edit draft

### Approval card

- Left border `warning` when pending
- Risk badge, action type, thread subject snippet
- Agent rationale (2 lines max in list view)
- Confidence %, linked ticket ID
- Buttons: Approve (teal) · Reject (outline) · Open thread

### Buttons

| Variant | Style |
|---------|--------|
| Primary | `accent` bg, `accent-text` label |
| Secondary | transparent, `border` outline |
| Ghost | text only, muted |
| Danger | `danger` bg or outline for reject |

### Forms

- Dark input bg `#0B0F14`, border `#243044`, focus ring teal
- Labels: caption muted above field
- Copyable chips for email addresses (inbox address with copy icon)

### Empty states

- Minimal line icon (no illustration clutter)
- Short headline + one sentence helper
- Single teal CTA (e.g. "Send a test email")

---

## Screen inventory & batch map

Use with Stitch prompts in project docs. Generate **Batch 0 first**.

| Batch | Screens | Stitch file slug |
|-------|---------|------------------|
| 0 | Design system sheet | `00-design-system` |
| 1 | Landing, How it works section | `01-landing`, `01-how-it-works` |
| 2 | Sign up, Log in, Create inbox, **Knowledge base (AI Training)**, Onboarding success | `02-signup`, `02-login`, `02-create-inbox`, `02-knowledge-base`, `02-onboarding-success` |
| 3 | Thread list, Thread detail + agent panel, Compose modal | `03-inbox`, `03-thread-detail`, `03-compose` |
| 4 | Agent trace panel, Home dashboard | `04-agent-trace`, `04-dashboard` |
| 5 | Approvals queue, Approval drawer, Draft review | `05-approvals`, `05-approval-drawer`, `05-draft-review` |
| 6 | Inboxes settings, Agent rules, **Knowledge library (settings)**, Custom domain | `06-inboxes`, `06-agent-rules`, `06-knowledge-library`, `06-custom-domain` |
| 7 | Empty states sheet, Mobile inbox (optional) | `07-empty-states`, `07-mobile-inbox` |

### Onboarding flow (canonical — fix Stitch inconsistency)

Sidebar and progress must match. **4 steps:**

1. **Account** — sign up / log in (done before wizard)
2. **Inbox setup** — display name, **username** (optional), autopilot mode → **AgentMail `POST /inboxes`**
3. **Knowledge base** — upload docs, paste FAQ, optional URL crawl *(required for credible drafts)*
4. **Review & go live** — summary + copyable address + send test email

Do **not** mix "Step 2 of 3" with a 4-item sidebar. Success screen = step 4 complete.

### AgentMail inbox (free tier — product rule)

- **Users create their own inbox** during onboarding (step 2). Clearance does not ship a shared/hardcoded inbox.
- On submit, backend calls AgentMail **`inboxes.create`** with:
  - `username` — from UI slug (optional; AgentMail may assign if omitted)
  - `display_name` — from “Inbox display name”
  - `client_id` — idempotent key e.g. `clearance-{orgId}-inbox-v1`
- **AgentMail returns `inbox_id`** — store this on every thread/tool/webhook call. This is the primary foreign key to AgentMail, not the email string.
- **Free plan default domain:** addresses use **`@agentmail.to`** — **always display the address returned by the API**, never guess.
- Custom domains are **paid** — settings UI is stretch; onboarding preview shows `{username}@agentmail.to` until API responds.
- **Never hardcode** `support@acme.clearance.app` in app logic or copy.

**DB `inboxes` table (minimum):**

| Column | Source |
|--------|--------|
| `agentmail_inbox_id` | API response `inbox_id` |
| `email_address` | API response (full address) |
| `display_name` | User input |
| `username` | User slug (if used) |
| `organization_id` | Clearance org |
| `autopilot_mode` | draft / auto-label / full |

**Onboarding step 2 UI:** preview `support@agentmail.to` (example); after create, show **actual** address from API on step 4.

### Knowledge base (product requirement)

Companies must teach the agent **before** autopilot drafts replies. Surfaces:

| Surface | Purpose |
|---------|---------|
| Onboarding step 3 | First upload — drag-drop PDF/DOCX/MD, paste FAQ text, add help-center URL |
| Settings → Knowledge | Manage sources per inbox, re-index, view chunk count / last synced |
| Thread agent panel | Show **citations** — which knowledge chunks informed the draft |

Supported source types (UI labels): PDF, DOCX, Markdown, CSV (FAQ), public URL, pasted text.

Export assets to: `.stitch/designs/{slug}/`

---

## Sample content (use in mocks)

**Inbox address (demo):** `support@agentmail.to` *(example — use API-returned address in prod)*  
**Inbox name:** Acme Support  
**Sample thread subject:** "Access to billing dashboard for Sarah"  
**Sample sender:** `jamie@clientco.com`  
**Ticket ID:** `INC-1042`  
**Proposed role:** `billing-reader`  
**User:** `sarah.chen@corp.com`  
**Confidence:** 62%  
**Approver:** `approver@corp.com`

---

## UI → product mapping

| Screen | Real backend |
|--------|----------------|
| Create inbox | AgentMail `inboxes.create` → persist `inbox_id` + email address |
| Knowledge upload | Alibaba OSS + pgvector index in Supabase Postgres (per org / inbox) |
| Thread list / detail | AgentMail Threads + Messages |
| Inbound mail | AgentMail webhooks / WebSockets |
| Draft review | AgentMail Drafts → Send Draft |
| Labels on threads | AgentMail Labels |
| Custom domain | AgentMail Domains + DNS verify |
| Agent plan / audit | Qwen Cloud + app database |
| Approvals | App policy engine + HITL |

---

## Stitch refinement prompts (one change each)

```
Change all primary buttons to teal #2DD4BF with dark text #0B0F14.
```

```
Add a subtle teal left border on the active sidebar nav item.
```

```
Increase thread row padding and use #1A2332 for the selected row background.
```

```
Add an "Agent active" teal pulse dot next to the inbox name in the sidebar.
```

```
Pending approval cards: 3px left border #F59E0B.
```

```
Reduce visual noise: remove shadows, use only 1px borders #243044.
```

---

## Accessibility

- Minimum contrast 4.5:1 for body text on surfaces
- Focus states: 2px teal outline on interactive elements
- Don't rely on color alone — pair badges with text labels
- Touch targets ≥ 44px on mobile batch

---

## Files in this folder

```
.stitch/
  DESIGN.md          ← this file (source of truth)
  designs/           ← exported HTML/screenshots from Stitch
    00-design-system/
    03-inbox/
    ...
```

---

## Version

- **v1.0** — Initial system for AgentMail real-inbox pivot (May 2026)
- Update this file when tokens or nav structure changes; re-run Batch 0 in Stitch if major rebrand
