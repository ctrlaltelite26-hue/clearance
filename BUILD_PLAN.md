# Clearance — Build Plan (start → finish)

**Track:** Qwen Cloud Hackathon — **Track 4: Autopilot Agent**  
**Product:** Real support inbox on AgentMail + Qwen autopilot + external tools + human-in-the-loop  
**Deadline:** Jul 9, 2026

Related docs: [`.stitch/DESIGN.md`](.stitch/DESIGN.md) (UI), [README.md](README.md) (local dev)

---

## North star (5-minute demo)

1. Customer emails `support@agentmail.to` (user-created inbox).
2. Thread appears in **Inbox**; **Autopilot panel** shows intent + action plan.
3. Worker runs tools: `knowledge.search` → `user.lookup` → `ticket.create` → `access.propose`.
4. **Approvals** — human approves `access.grant`.
5. **Draft Review** + **Execution Logs** — human **Confirm & Send** via AgentMail.
6. Show **live demo** (Vercel UI → Alibaba backend) + **Alibaba deployment proof** + architecture diagram.

---

## Architecture

**Hosting (hybrid — satisfies hackathon + fast iteration):**

| Layer | Where | Why |
|-------|-------|-----|
| **Frontend** | **Vercel** (`apps/web`) | Fast Next.js deploy, great DX |
| **Backend** | **Alibaba Cloud** (`apps/api` + `apps/worker`) | **Required** for submission proof |
| **Database** | **Supabase** Postgres + pgvector | Free tier, same schema dev/prod |
| **AI** | **DashScope / Qwen Cloud** | Alibaba API — counts toward submission |
| **Knowledge files** | **Alibaba OSS** | Alibaba API — submission proof in code |
| **Email** | **AgentMail** | Inbound/outbound support inbox |

```
Inbound email (AgentMail @agentmail.to)
       ↓ webhook
  Alibaba Cloud — API + Worker (apps/api, apps/worker)
    ├─ POST /webhooks/agentmail   enqueue agent job
    ├─ Worker loop                step-scoped jobs (see below)
    └─ REST                       auth, inbox, knowledge, approvals
       ↓                    ↓                    ↓
  Supabase Postgres    DashScope (Qwen +      Alibaba OSS
  + pgvector           embeddings)           knowledge PDFs
       ↑
  Vercel — Next.js (apps/web)
    └─ UI only; calls Alibaba API_URL (not Vercel /api for agent/webhooks)
```

**Local dev:** `pnpm dev` — all services locally, Supabase as DB.  
**Production:** AgentMail webhook → **Alibaba API URL** (not Vercel). Vercel serves UI only.

### Worker pipeline (step-scoped jobs)

Inbound email enqueues a single `process_thread` job. The worker splits autopilot into **bounded phases** so one slow tool (e.g. `knowledge.search`) cannot block the entire run for 15+ minutes.

```
AgentMail ingest / webhook
       ↓
  jobs: process_thread          bootstrap → analyze → plan → enqueue next
       ↓
  jobs: run_action (×N)         one plan step per job (heartbeat per step)
       ↓
  jobs: finalize_draft          Qwen draft + agentmail.draft.create
       ↓
  jobs: execute_risky           after human approval (unchanged)
```

| Job type | Responsibility |
|----------|----------------|
| `process_thread` | Bootstrap context, Qwen analyze, create plan, enqueue first `run_action` or `finalize_draft` |
| `run_action` | Execute **one** safe/risky-gated plan step (`payload.actionId`) |
| `finalize_draft` | Generate reply + persist AgentMail draft |
| `execute_risky` | Post-approval risky tools (unchanged) |
| `ingest_knowledge` | Knowledge indexing (unchanged) |

Poll priority: `process_thread` → `run_action` (up to 3) → `finalize_draft` → `execute_risky` → other jobs.

Queue repair (`packages/integrations/agentmail/src/queue-repair.ts`) fails stale running jobs for **all** autopilot types and can resume `EXECUTING_SAFE` threads by re-enqueueing the next `run_action` or `finalize_draft`.

Key env: `STALE_PROCESS_THREAD_MS=120000`, `QUEUED_STALE_MS=30000`, `KNOWLEDGE_SEARCH_TIMEOUT_MS=45000`.

**Development only:** [AgentMail MCP](https://docs.agentmail.to/integrations/mcp) in Cursor — not production runtime.

---

## AgentMail rules (locked)

| Rule | Detail |
|------|--------|
| Inbox creation | Each org creates inbox in **onboarding step 2** via `inboxes.create` |
| Primary key | Store **`agentmail_inbox_id`** from API — use on every AgentMail call |
| Email display | Store **`email_address`** from API response — never guess |
| Free tier domain | Default **`@agentmail.to`** (preview `{username}@agentmail.to` until API responds) |
| Custom domain | Paid — settings stretch goal |
| Outbound | Never auto-send — `create_draft` → Draft Review → human → `send_draft` |
| Idempotency | `client_id` on inbox create; idempotency keys on grants/sends |

---

## Onboarding (4 steps, shared wizard shell)

| Step | Screen | Backend |
|------|--------|---------|
| 1 | Account (sign up) | `POST /auth/signup` |
| 2 | Inbox setup | `POST /onboarding/inbox` → AgentMail `inboxes.create` |
| 3 | Knowledge base | `POST /onboarding/knowledge` (upload/paste) |
| 4 | Review & go live | Summary + copyable `@agentmail.to` address |

Login is separate for returning users. Steps 2–4 share sidebar + progress bar (see `.stitch/DESIGN.md`).

---

## UI screens (Stitch → Next.js)

| Route | Stitch reference |
|-------|------------------|
| `/onboarding/account` | sign_up + wizard chrome |
| `/onboarding/inbox` | `onboarding_step_2` |
| `/onboarding/knowledge` | `onboarding_step_3_knowledge_training` |
| `/onboarding/complete` | `success_inbox_live` |
| `/inbox` | `inbox_superhuman_style` |
| `/inbox/[threadId]` | `conversation_view_autopilot_panel` |
| `/inbox/[threadId]/review` | `draft_review_split_view` |
| `/approvals` | `approvals_pending_reviews` |
| `/settings/inboxes` | `settings_inboxes_list` |
| `/settings/policies` | `policies_governance_controls` |

**Conversation view** = triage + agent reasoning. **Draft review** = edit + confirm send (different purpose).

---

## Tool registry (Track 4: external tools)

| Tool | Risk | Notes |
|------|------|-------|
| `agentmail.thread.get` | safe | Load thread after webhook |
| `knowledge.search` | safe | RAG + citations in UI |
| `user.lookup` | safe | Mock IdP |
| `ticket.create` / `ticket.update` | safe | Mock ticketing |
| `access.propose` | risky | → Approvals |
| `access.grant` | risky | After human approve |
| `agentmail.draft.create` | safe | Draft only |
| `agentmail.draft.send` | risky | Draft Review confirm |
| `agentmail.thread.label` | safe | Triage labels |

Every call → `actions` table + `audit_events` + **Execution Logs** in UI.

---

## Phase 0 — Setup (Day 1)

- [ ] Devpost register + Qwen Cloud hackathon credits
- [ ] **Alibaba Cloud** account (free trial) — SAE or Simple Application Server for backend
- [ ] AgentMail account + API key (`console.agentmail.to`)
- [ ] **Supabase** project (free tier): enable **`vector`** extension in SQL editor
- [ ] **Vercel** project linked to repo (`apps/web` as root, UI only)
- [ ] **Alibaba OSS** bucket for knowledge uploads (submission API proof)
- [ ] Optional: AgentMail MCP in Cursor for dev testing
- [ ] Public GitHub repo (MIT)
- [ ] `.env` from `.env.example`

---

## Phase 1 — Data model & tools (Days 2–4)

### Database (`packages/db`)

Tables: `organizations`, `users`, `inboxes` (with `agentmail_inbox_id`, `email_address`), `threads`, `messages`, `agent_runs`, `actions`, `approvals`, `audit_events`, `knowledge_sources`, `knowledge_chunks`, `jobs`.

### Agent (`packages/agent`)

- Tool definitions (Zod schemas, risk, `requiresApproval`)
- Executors for mocks + AgentMail wrappers
- Plan-then-execute loop (keep; optional Qwen function-calling for read-only disambiguation later)

### Policy (`packages/policy`)

- Blocked roles, confidence threshold, draft-send gate

**Done when:** CLI demo runs a plan against mocks and logs actions.

---

## Phase 2 — AgentMail (Days 5–8)

- [x] `packages/integrations/agentmail` — SDK client
- [x] `POST /onboarding/inbox` → `create` → persist `inbox_id` + address
- [x] `POST /webhooks/agentmail` — verify signature, upsert thread, enqueue job
- [x] Local dev: **WebSockets** in worker (no ngrok)
- [x] Draft pipeline: create → review → send (`/threads/:id/drafts*`)

**Done when:** Real email to `@agentmail.to` inbox triggers webhook + DB row.

---

## Phase 3 — Qwen agent loop (Days 9–12)

Worker per inbound message (**step-scoped jobs** — see Architecture):

1. **`process_thread`:** `agentmail.thread.get` → Qwen analyze → `knowledge.search` (bootstrap) → Qwen plan
2. **`run_action` (per step):** Execute one plan step (safe tools; risky steps pause → approvals)
3. **`finalize_draft`:** Qwen draft (with citations) → `agentmail.draft.create`
4. **`execute_risky`:** After human approval — risky tools + optional send

Keep stub mode without `DASHSCOPE_API_KEY`.

**Done when:** One email → analysis + 3+ tool rows + AgentMail draft id.

---

## Phase 4 — Knowledge / RAG (Days 13–16)

### Where we index (free stack)

| Layer | Choice | Cost |
|-------|--------|------|
| **Vector store** | **Supabase Postgres + `pgvector`** | $0 on free tier |
| **Embeddings (primary)** | **DashScope `text-embedding-v4`** (1024-dim) | Hackathon / Model Studio trial credits (~1M tokens) |
| **Embeddings (fallback)** | **Local `@xenova/transformers`** in worker (`all-MiniLM-L6-v2`, 384-dim) | $0 — no API calls; fine for demo-scale docs |
| **Keyword fallback** | Postgres **`tsvector`** on `knowledge_chunks.content` | $0 — use if credits run out or offline demo |
| **Raw files** | **Alibaba OSS** `knowledge/{org_id}/` | Hackathon credits / free tier; **submission API proof** |

No Pinecone, Chroma server, or paid vector DB. Supabase is the only datastore.

### Supabase setup (one-time)

```sql
-- SQL Editor → Extensions (or run manually)
create extension if not exists vector;
```

Use the **connection pooler** URL (port `6543`, `?pgbouncer=true`) in Vercel env for API routes. Use the **direct** URL (port `5432`) locally for `pnpm db:push` / migrations.

### How indexing works

```
Upload / paste (onboarding step 3 or Settings)
  → API saves file + row in knowledge_sources (status: pending)
  → Worker job: ingest
      1. Extract text (pdf-parse, mammoth for DOCX, raw MD)
      2. Chunk (~600 tokens, 80-token overlap, split on paragraphs)
      3. Embed each chunk (batch ≤10 per DashScope call, text_type=document)
      4. INSERT knowledge_chunks (content, source_id, inbox_id, embedding)
      5. UPDATE knowledge_sources (status: indexed, chunk_count)
```

**Scope:** every chunk is tagged with `organization_id` + `inbox_id`. `knowledge.search` always filters by the thread’s inbox so tenants never cross-read.

### Schema (add to Phase 1)

```sql
-- knowledge_sources: one row per uploaded file or pasted FAQ
-- knowledge_chunks: one row per chunk; embedding vector(1024) or vector(384) if local model

CREATE EXTENSION IF NOT EXISTS vector;

-- HNSW index for fast cosine search (free, in-Postgres)
CREATE INDEX ON knowledge_chunks
  USING hnsw (embedding vector_cosine_ops);
```

Drizzle: `packages/db` tables `knowledge_sources`, `knowledge_chunks`; new package `packages/knowledge` for ingest + search.

### How the agent uses it

1. Worker step after `analyze`, before `plan`: call `knowledge.search({ query: thread_subject + last_message, top_k: 5 })`.
2. Tool embeds query (`text_type=query` on DashScope) → pgvector `<=>` cosine → returns chunks + `source_title` + `chunk_id`.
3. Chunks injected into Qwen system context; citations stored on `agent_runs` / `actions` for UI.
4. Autopilot panel + Execution Logs show: “Used: Refund Policy §2 (chunk abc123)”.

### Env vars

```bash
# Primary (uses hackathon credits — same key as Qwen chat)
DASHSCOPE_API_KEY=
EMBEDDING_MODEL=text-embedding-v4
EMBEDDING_DIMENSIONS=1024

# Fallback — set to "local" to skip DashScope for embeddings entirely
EMBEDDING_PROVIDER=local   # or dashscope (default)
```

### Tasks

- [x] Upload API (PDF/DOCX/MD as base64) + paste text
- [x] `pgvector` extension + migration on Supabase
- [x] Ingest worker job (extract → chunk → embed → store)
- [x] `knowledge.search` tool in `packages/agent`
- [x] Citations in Execution Logs / action rows
- [ ] Onboarding step 3 UI

**Done when:** Upload policy doc → billing email draft cites it.

---

## Phase 5 — API (Days 17–19)

Routes: auth, onboarding, threads, autopilot trace, approvals, drafts, knowledge, webhooks, health.

Minimal auth: email + password + session/JWT.

**Done when:** curl/Postman happy path documented.

---

## Phase 6 — Frontend (Days 20–28)

Order: shell → onboarding 1–4 → inbox → conversation → draft review → approvals → settings.

Wire polling/SSE after webhook. Execution Logs from `actions`.

**Done when:** Full browser flow without paste-inbox.

---

## Phase 7 — Deploy (Days 29–33)

### 7a — Alibaba backend (required for submission)

- [ ] Deploy `apps/api` + `apps/worker` to **Alibaba SAE** or **Simple Application Server**
- [ ] Env on Alibaba: `DATABASE_URL`, `DASHSCOPE_API_KEY`, `AGENTMAIL_API_KEY`, `OSS_*`
- [ ] AgentMail webhook → `https://<alibaba-api>/webhooks/agentmail`
- [ ] Add `packages/integrations/alibaba/oss.ts` — upload/download knowledge files via OSS SDK
- [ ] Health check public: `GET /health` returns `{ ok: true, region: "..." }`
- [ ] **Proof recording** (~30s): screen capture of Alibaba console showing running service + `curl /health`

**Alibaba code files for Devpost link** (pick at least one):

- `packages/agent/src/qwen.ts` — DashScope chat API
- `packages/knowledge/src/embed.ts` — DashScope embeddings
- `packages/integrations/alibaba/oss.ts` — OSS putObject / getObject

### 7b — Vercel frontend

- [ ] Vercel: root `apps/web`, `NEXT_PUBLIC_API_URL=https://<alibaba-api>`
- [ ] No agent logic on Vercel — UI calls Alibaba API only
- [ ] Public demo URL for Devpost

**Done when:** Email webhook hits Alibaba → worker runs → UI on Vercel shows result.

---

## Phase 8 — Submission (Days 34–36)

Match [Devpost “What to Submit”](https://qwencloud-hackathon.devpost.com/):

| Deliverable | What we provide |
|-------------|-----------------|
| **Code repo** | Public GitHub + MIT license in repo About |
| **Alibaba deployment proof** | Short screen recording (separate from demo): Alibaba console + live backend |
| **Alibaba code link** | Direct link to `packages/integrations/alibaba/oss.ts` or `packages/agent/src/qwen.ts` |
| **Architecture diagram** | Vercel UI → Alibaba API/worker → Supabase + DashScope + OSS + AgentMail |
| **Demo video** | ~3 min, public YouTube/Vimeo — full product flow |
| **Text description** | Features, Track 4 tools, HITL, knowledge citations |
| **Track** | **Track 4: Autopilot Agent** |
| **Optional** | Blog/social post for Blog Post Prize |

### Checklist

- [ ] Architecture diagram (export PNG/SVG to `docs/architecture.png`)
- [ ] Alibaba proof video uploaded (unlisted YouTube OK)
- [ ] Main demo video (~3 min)
- [ ] Devpost: repo URL, Alibaba proof URL, code file URL, diagram, Track 4
- [ ] Optional blog post

### Video script (~4:30)

| Time | Beat |
|------|------|
| 0:00 | Problem: ambiguous support email |
| 0:30 | Onboarding: inbox `@agentmail.to` + knowledge |
| 1:00 | Send real email |
| 1:30 | Inbox + Autopilot plan + tools |
| 2:30 | Execution Logs |
| 3:00 | Approvals |
| 3:30 | Draft Review → Send |
| 4:00 | Alibaba backend proof + audit trail |
| 4:20 | Track 4 recap |

---

## Master checklist

```
Phase 0  [ ] Devpost  [ ] AgentMail  [ ] Qwen  [ ] Alibaba  [ ] Supabase  [ ] Vercel  [ ] GitHub
Phase 1  [ ] Schema  [ ] Tools  [ ] Policy
Phase 2  [ ] create_inbox  [ ] Webhook  [ ] Drafts
Phase 3  [ ] Worker + Qwen  [ ] Actions logged
Phase 4  [ ] Knowledge  [ ] Citations
Phase 5  [ ] API  [ ] Auth
Phase 6  [ ] UI all screens
Phase 7  [ ] Deploy
Phase 8  [ ] Video  [ ] Submit
```

---

## If behind — cut order

1. Dashboard, mobile, custom domain UI  
2. Knowledge URL fetch  
3. Real IdP (keep mocks)  
4. Extra optional integrations

**Never cut:** AgentMail in/out, 3+ logged tools, knowledge search, approvals, draft review, **Alibaba backend deploy + proof**.

---

## Week map

| Week | Focus |
|------|--------|
| 1 | Phase 0–1 |
| 2 | Phase 2–3 |
| 3 | Phase 4–5 |
| 4 | Phase 6 |
| 5 | Phase 7–8 |

---

## Current repo status

| Done | Not done |
|------|----------|
| **Phase 2:** AgentMail SDK, onboarding inbox, webhooks, drafts API | ngrok webhook guide |
| **Phase 1:** thread-centric DB, tool registry, agent_runs | Production Next.js app |
| **Phase 3:** Worker runs Qwen loop on inbound threads, preloads `agentmail.thread.get`, persists final `agentmail.draft.create` | Production Next.js app |
| **Phase 4:** Knowledge ingest API + worker indexing + pgvector retrieval + citations on `actions` | Onboarding step 3 UI |
| **Phase 5:** Clerk auth (`/auth/me`), org-scoped API access, `/threads/:id/trace`, documented curl happy path | Full production auth UX in Next.js |
| Stitch UIs + screenshots | Alibaba backend deploy + OSS integration |
| `.stitch/DESIGN.md`, `PROMPTS.md` | |

**Next step:** Phase 6/7 — wire production UI screens and deploy API/worker to Alibaba.

---

## Post-demo hardening backlog

Logged after the Jun 2026 codebase review. **Do not start until the demo is recorded/submitted** — these touch worker orchestration and DB schema and carry regression risk. Safe fixes (SDK send signature, Qwen parse hardening, schema null-safety, grounding guards, draft-on-failure status, approval IDOR, review-page edit-wipe, fail-closed webhook/Clerk auth, atomic action claim, auto-send idempotency code, automation-rule consolidation) are **already applied**.

### P1 — Worker orchestration (deferred from review; highest value)

- [ ] **`execute_risky` runs all pending risky steps on one approval** — `apps/worker/src/index.ts` (`executeRisky`). One approval + one `execute_risky` job executes every pending risky action, bypassing per-step approval. Fix: execute only `payload.approvalId`'s action, or require approval per risky step.
- [ ] **`execute_risky` has no completion path in some branches** — when `autoDraftOnInbound` is false / draft already handled / finalize skipped, the thread stays `EXECUTING_RISKY`. Mirror `finalizeDraft` completion logic for all branches.
- [ ] **Overlapping `process_thread` runs on one thread** — ingest/API can enqueue a new run while one is active; both mutate `analysisJson`/`planJson`/status. Guard with `hasActiveAutopilotJobs` / row lock before processing.
- [ ] **Stale job binds to latest inbound** — `getThreadRawInput` always loads the newest message; an older `process_thread` can analyze a newer reply. Bind `agentmailMessageId` from job payload through the pipeline.
- [ ] **`finalize_draft` stuck-state repair** — `queue-repair.ts` doesn't fail stuck `finalize_draft` persist/send actions or reset thread status; `execute_risky` isn't in `AUTOPILOT_JOB_TYPES` and has no heartbeat. Add to stale-job repair + add `touchJob` heartbeat.
- [ ] **Global job-failure catch clobbers good state** — `processJob` catch sets thread `FAILED` using stale `job.agentRunId` even when state was `AWAITING_APPROVAL`/`COMPLETED`/`SENT`. Track resolved `agentRunId`; only fail in-progress states.
- [ ] **Non-atomic `persistPlan`** — delete + per-step insert not in a transaction; wrap in `db.transaction()`.

### P1 — Activate DB-level auto-send idempotency

- [ ] **Push the `actions_send_once_uidx` index** — already defined in `packages/db/src/schema.ts`; run `pnpm --filter @clearance/db push` to activate the DB-level guarantee. **First remove any existing duplicate `agentmail.draft.send` rows** or the push will fail. Code already guards in the app layer, so this is additive.

### P2 — Security / deployment hardening (review findings)

- [ ] **Role-based authorization** — every org member can PATCH policies, decide approvals, send drafts, delete knowledge, provision inboxes. Enforce roles on sensitive routes (`users.role` is always `member`).
- [ ] **`POST /agentmail/sync` is global** — scope to caller's org/inbox instead of syncing all tenants.
- [ ] **Scope cross-tenant queries in SQL** — `GET /approvals`, `getThreadDetail` child queries, `cancelPendingKnowledgeJobs` filter in JS / by id only; add org joins for defense-in-depth.
- [ ] **Input limits & validation** — add `.max()` to `rawInput`/`base64Content`/`comment`; validate `:id` route params as UUIDs; central error handler that doesn't leak internal messages.
- [ ] **Webhook setup secret** — `routes/agentmail.ts` returns the signing secret in the API response; store server-side only.
- [ ] **`decidedBy` from auth** — currently client-supplied (defaults `approver@corp.com`); bind to `request.auth.email`.

### P2 — Knowledge / DB robustness (review findings)

- [ ] **PDF/DOCX extraction is a no-op** — `knowledge/src/index.ts` runs whitespace cleanup on binary; wire `pdf-parse` / `mammoth` or reject unsupported types.
- [ ] **Non-transactional re-index** — delete-then-insert can wipe a KB on mid-loop failure; wrap in a transaction and set source `failed` on error.
- [ ] **Set `statement_timeout`** — `db/src/client.ts` never sets one; add an `onconnect` `SET statement_timeout`. Search/ping timeouts don't cancel the query (orphan connections).
- [ ] **Embedding dimension coupling** — `EMBEDDING_DIMENSIONS` is env-configurable but `vector(1024)` is hardcoded; validate at startup.

### P3 — Web client (review findings)

- [ ] **Background fetch single-flight + ordering** — `useThreadDetail` background polls can overlap; a slow older response can overwrite newer state. Add request sequencing.
- [ ] **Hydration-safe cache reads** — `thread-detail.tsx`/`thread-cache.ts` read `sessionStorage` in `useState` initializers (SSR mismatch risk); move to `useEffect`.
- [ ] **Validate cached previews** — `thread-cache.ts` casts JSON without shape checks; drop invalid entries.
- [ ] **Poll when initial load fails** — `loadedOnceRef` only set on success, so a failed first load never self-heals via the interval.

> Full detail in the Jun 2026 review threads (worker / API / web / packages). Items above are the actionable subset; pick P1 first.

---

## Version

- v1.3 — Jun 2026 — post-demo hardening backlog logged; applied safe review fixes (auth fail-closed, atomic claim, auto-send idempotency, rule consolidation)
- v1.2 — May 2026 — hybrid deploy: Vercel UI + Alibaba backend (submission requirement)
- v1.1 — May 2026 — Supabase + Vercel hosting; pgvector RAG on Supabase Postgres
- v1.0 — May/Jun 2026 — initial plan with AgentMail `@agentmail.to`, knowledge, external tools
