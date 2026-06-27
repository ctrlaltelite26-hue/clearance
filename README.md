# Clearance

IT support **Autopilot Agent** for the [Global AI Hackathon Series with Qwen Cloud](https://qwencloud-hackathon.devpost.com/) — **Track 4: Autopilot Agent**.

Turns ambiguous inbound support messages into audited, policy-gated actions across ticketing, identity, and customer comms.

**Stack:** Next.js on **Vercel** (UI) · **Alibaba Cloud** (API + worker) · **Supabase** (Postgres + pgvector) · **DashScope** · **OSS** · AgentMail

## Monorepo layout

```
clearance/
  apps/
    api/       Fastify REST API — **deploy to Alibaba Cloud**
    worker/    Agent loop — **deploy to Alibaba Cloud** (same host or SAE service)
    web/       Next.js UI — **Vercel deploy root** (calls Alibaba API_URL)
  packages/
    agent/     Schemas, Qwen client, tool executor
    policy/    HITL rules
    db/        Drizzle + Supabase PostgreSQL schema
  mocks/       Ticket, IdP, Notify mock APIs
```

## Prerequisites

- Node.js 20+
- [pnpm](https://pnpm.io/) 9+
- [Supabase](https://supabase.com/) project (free tier) with **`vector`** extension enabled
- [Vercel](https://vercel.com/) account (frontend)
- [Alibaba Cloud](https://www.alibabacloud.com/) account (backend — **required for hackathon submission**)

## Quick start

Requires a **Supabase** project for the database.

```bash
# 1. Install dependencies
pnpm install

# 2. Environment — Supabase URLs + keys (see .env.example)
cp .env.example .env

# 3. Push database schema to Supabase (uses DATABASE_URL_DIRECT)
pnpm db:push

# 4. Start API, worker, web UI, and mock services
pnpm dev
```

Open **http://localhost:3000** (wait until the terminal shows `Next.js` ready).

| Service | URL |
|---------|-----|
| Web UI | http://localhost:3000 |
| API | http://localhost:3001/health |
| Mocks | http://localhost:4001–4003 | — paste a fixture email, watch the case page update, approve risky access on **Approvals**.

## Qwen Cloud

Without `QWEN_CLOUD_API_KEY` (or `DASHSCOPE_API_KEY`), the worker runs in **stub mode** (deterministic demo logic). For real Qwen:

```env
QWEN_CLOUD_API_KEY=your_key
QWEN_MODEL=qwen-plus
```

Sign up via the hackathon Devpost page and request credits.

## AgentMail (Phase 2)

Add to `.env.local`:

```env
AGENTMAIL_API_KEY=your_key
```

### How inbound email reaches Clearance

| Mode | When | Public URL? |
|------|------|-------------|
| **Webhooks** | Production (Alibaba API) | Yes — AgentMail POSTs to your endpoint |
| **WebSockets** | Local dev (recommended by AgentMail) | No — worker connects outbound |
| **Paste inbox** | Demo without AgentMail | N/A — `POST /cases` |

AgentMail **does** have webhook integration — we already expose `POST /webhooks/agentmail` and can register via `POST /onboarding/inbox` when `AGENTMAIL_WEBHOOK_URL` is set. Webhooks are not a tunnel: AgentMail needs a **reachable HTTPS URL**, so localhost alone is not enough.

**Production:** point webhooks at Alibaba, not Vercel:

```env
AGENTMAIL_WEBHOOK_URL=https://<your-alibaba-api>/webhooks/agentmail
AGENTMAIL_WEBHOOK_SECRET=whsec_...
```

**Local dev (no ngrok):** the worker auto-connects via WebSocket when `AGENTMAIL_API_KEY` is set and `AGENTMAIL_WEBHOOK_URL` is empty.

```bash
pnpm dev
curl -X POST http://localhost:3001/onboarding/inbox \
  -H "Content-Type: application/json" \
  -d '{"displayName":"Support","username":"your-name"}'
# Email the returned emailAddress — worker logs [agentmail-ws] ingested ...
```

Watch the worker terminal for `[agentmail-ws] connected` and `[agentmail-ws] ingested`. Open the web UI at http://localhost:3000 to see the thread.

**Optional — test webhooks locally with ngrok:**

```bash
ngrok http 3001
# AGENTMAIL_WEBHOOK_URL=https://<subdomain>.ngrok-free.app/webhooks/agentmail
# AGENTMAIL_USE_WEBSOCKET=false
```

Without `AGENTMAIL_API_KEY`, paste-inbox demo still works via `/cases`.

## Demo fixtures

| Fixture | Expected flow |
|---------|----------------|
| Sarah / billing access | Lookup + ticket → **approval** → grant → draft |
| Login 403 | Ticket + lookup, no approval |
| Admin on production | Policy-safe path, no grant |
| "fix it pls" | `NEEDS_INFO` clarification |

## API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| GET | `/cases` | List cases |
| POST | `/cases` | Create case `{ rawInput }` |
| GET | `/cases/:id` | Case + actions + audit |
| GET | `/approvals` | Pending approvals |
| POST | `/approvals/:id/decide` | `{ decision, comment? }` |

## Auth (Phase 5 - Clerk)

Set in `.env.local`:

```env
CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
# Optional:
# CLERK_AUDIENCE=...
```

When `CLERK_SECRET_KEY` is set, API routes require `Authorization: Bearer <clerk_jwt>`
except `GET /health` and `POST /webhooks/agentmail`.

Quick check:

```bash
curl http://localhost:3001/auth/me \
  -H "Authorization: Bearer <clerk_jwt>"
```

## Hackathon submission checklist

- [ ] Public GitHub repo (MIT license in About)
- [ ] **Backend on Alibaba Cloud** (SAE or Simple Application Server)
- [ ] **Alibaba proof video** — console + live `/health` (separate from demo)
- [ ] **Code link** to Alibaba integration (`packages/integrations/alibaba/oss.ts` or Qwen client)
- [ ] Frontend on Vercel (demo URL)
- [ ] Architecture diagram (UI → Alibaba → Supabase + DashScope + OSS + AgentMail)
- [ ] Demo video (~3 min, public host)
- [ ] Track 4 selected on Devpost

**Full build plan:** see [BUILD_PLAN.md](./BUILD_PLAN.md)
**API happy path:** see [docs/API_HAPPY_PATH.md](./docs/API_HAPPY_PATH.md)

## License

MIT
