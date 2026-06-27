# Clearance API Happy Path (Phase 5)

This is a curl-first end-to-end flow for local verification.

## 0) Prereqs

- API + worker running (`pnpm dev`)
- Clerk enabled in `.env.local`:
  - `CLERK_PUBLISHABLE_KEY`
  - `CLERK_SECRET_KEY`
- Bearer token from Clerk frontend/session:
  - export as `TOKEN`

```bash
export API_URL=http://localhost:3001
export TOKEN="<clerk_jwt>"
```

## 1) Health (public)

```bash
curl "$API_URL/health"
```

## 2) Who am I (auth)

```bash
curl "$API_URL/auth/me" \
  -H "Authorization: Bearer $TOKEN"
```

## 3) Provision AgentMail inbox (auth)

```bash
curl -X POST "$API_URL/onboarding/inbox" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"displayName":"Support","username":"clearance-demo"}'
```

## 4) Add knowledge source (auth)

```bash
curl -X POST "$API_URL/onboarding/knowledge" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Refund Policy","text":"Refunds are allowed within 30 days with proof of purchase."}'
```

Monitor index status:

```bash
curl "$API_URL/knowledge/sources" \
  -H "Authorization: Bearer $TOKEN"
```

## 5) Create a thread/case (auth)

```bash
curl -X POST "$API_URL/cases" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"rawInput":"Customer asks for a refund and references policy."}'
```

Copy `case.id` as `THREAD_ID`.

## 6) Inspect trace (auth)

```bash
curl "$API_URL/threads/$THREAD_ID/trace" \
  -H "Authorization: Bearer $TOKEN"
```

Expect:

- `thread.analysisJson` and `thread.planJson` populated
- actions include `knowledge.search`
- citations present on action rows (if indexed chunks match)
- final draft action (`agentmail.draft.create`) in successful runs

## 7) Approvals (auth)

List pending:

```bash
curl "$API_URL/approvals" \
  -H "Authorization: Bearer $TOKEN"
```

Approve one:

```bash
curl -X POST "$API_URL/approvals/<approval-id>/decide" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"decision":"approved","comment":"Looks good"}'
```

## 8) Draft review/send (auth)

Get draft:

```bash
curl "$API_URL/threads/$THREAD_ID/draft" \
  -H "Authorization: Bearer $TOKEN"
```

Update draft:

```bash
curl -X POST "$API_URL/threads/$THREAD_ID/drafts" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"subject":"Re: update","body":"Thanks, here is the final reply."}'
```

Send draft:

```bash
curl -X POST "$API_URL/threads/$THREAD_ID/drafts/<draft-id>/send" \
  -H "Authorization: Bearer $TOKEN"
```
