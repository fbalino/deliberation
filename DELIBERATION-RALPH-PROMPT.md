# Deliberation — Ralph Loop Build Prompt

You are building **Deliberation** from scratch — a web app that orchestrates structured multi-model AI discussions via OpenRouter. The full PRD is at `DELIBERATION_PRD.md` in this repo. Read it at the start of every iteration for the complete specification.

## How This Loop Works

Each iteration:

1. Read `DELIBERATION_PRD.md` for the full product spec (schema, API, UI, pipeline, file structure)
2. Read `RALPH-PROGRESS.md` (create it on first run) to see what's already done
3. Work through as many uncompleted items as you can from the checklist below
4. After each logical unit, verify it compiles and (if tests exist) passes, then commit
5. Update `RALPH-PROGRESS.md` marking completed items with a short note
6. When ALL items are complete (or documented as BLOCKED with reason), output `<promise>DONE</promise>`

Do NOT output `<promise>DONE</promise>` until every item is done or BLOCKED. Do not lie to exit the loop. If stuck on something, mark it BLOCKED in `RALPH-PROGRESS.md` with the reason, skip it, and keep going.

## Verification

Run after every change:

```bash
npx tsc --noEmit          # must pass — zero type errors
npm run build             # must succeed
npm test                  # if tests exist, must pass
```

Do not commit code that doesn't compile.

## Stack (from PRD)

- Next.js 14+ (App Router, Server Actions, Route Handlers)
- Supabase (Postgres + Realtime + Storage)
- OpenRouter (single API key, all models)
- Tailwind CSS
- Vercel deployment target
- SSE for streaming
- `react-markdown` + `remark-gfm` for rendering
- No auth — single user app

## Environment Variables

```
OPENROUTER_API_KEY=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

---

## The Checklist

Work top to bottom. Each section builds on the previous one. The PRD has the full spec for every item — reference it for schema definitions, prompt templates, API shapes, and UI layouts.

### Foundation

- [ ] **FOUND-01**: Initialize Next.js project with TypeScript, Tailwind CSS, App Router. Set up `tsconfig.json`, `tailwind.config.ts`, `.env.local` template. Install dependencies: `react-markdown`, `remark-gfm`, `@supabase/supabase-js`, `@supabase/ssr`. Follow the file structure from the PRD.
- [ ] **FOUND-02**: Set up Supabase client utilities — `lib/supabase/client.ts` (browser), `lib/supabase/server.ts` (server), `lib/supabase/types.ts`.
- [ ] **FOUND-03**: Create the full database migration (`supabase/migrations/001_initial_schema.sql`) with ALL tables from the PRD: `presets`, `sessions`, `session_files`, `panelists`, `rounds`, `contributions`, `interventions`, `resolutions`, `cost_log`. Copy the exact schema from the PRD.
- [ ] **FOUND-04**: Build basic UI primitives in `components/ui/` — Button, Card, Input, Badge, and a basic app layout in `app/layout.tsx` with Tailwind. Keep it clean and minimal.
- [ ] **FOUND-05**: Create the OpenRouter client at `lib/openrouter/client.ts` — the `callModel()` function from the PRD spec. Must support both streaming (SSE/AsyncGenerator) and non-streaming modes. Parse `x-openrouter-*` headers for token usage and cost. Include retry logic (3 attempts, exponential backoff).
- [ ] **FOUND-06**: Create the model registry at `lib/openrouter/models.ts` — default roster (Claude Opus 4.6, GPT-5.4, Gemini 3.1 Pro) with OpenRouter IDs and pricing. Export types for panelist configuration.
- [ ] **FOUND-07**: Create the cost tracker at `lib/costs/tracker.ts` — log token usage and cost per API call to the `cost_log` table. Calculate cost from token counts and model pricing.
- [ ] **FOUND-08**: Create default prompt templates at `lib/deliberation/prompts.ts` — analysis prompt, discussion round prompt, drafting prompt, voting prompt, drafter election prompt. Use the exact templates from the PRD with `{briefing}`, `{analyses}`, `{discussion_transcript}` placeholders.

### Deliberation Engine (server-side orchestrator)

- [ ] **ENGINE-01**: Build the core state machine at `lib/deliberation/engine.ts`. It reads session config from Supabase, manages phase transitions (configuring → briefing → analyzing → discussing → drafting → voting → completed), and orchestrates the full pipeline. Each phase is a separate function call. The engine writes contributions to Supabase as they complete and tracks cost.
- [ ] **ENGINE-02**: Build `lib/deliberation/phases/analysis.ts` — fan out parallel calls to all panelists with the briefing + analysis system prompt. Store each contribution. Blind mode only for MVP (panelists don't see each other's work).
- [ ] **ENGINE-03**: Build `lib/deliberation/phases/discussion.ts` — simultaneous mode for MVP. Each round: send all panelists the briefing + all analyses + discussion transcript so far. Collect responses. Repeat for configured number of rounds. Detect consensus signals and extension requests from structured output.
- [ ] **ENGINE-04**: Build drafter election logic — after discussion, each panelist votes on who should draft (structured output: pick + reason). Tally votes. If user pre-assigned a drafter and panelists elected someone different, flag for dual-draft (Phase 2 — for MVP just use the elected drafter).
- [ ] **ENGINE-05**: Build `lib/deliberation/phases/drafting.ts` — send the elected drafter the full transcript (briefing + analyses + discussion) with the drafting prompt. Store the draft as a resolution (version 1, status: draft).
- [ ] **ENGINE-06**: Build `lib/deliberation/phases/voting.ts` — send all panelists the draft with the voting prompt. Require structured JSON output: `{ verdict, amendments, reasoning }`. Tally votes against the configured threshold (simple majority for MVP). If approved → mark resolution approved. If rejected → send amendments back to drafter for revision (up to max draft iterations, default 3). After max iterations with no approval → force-approve with dissenting opinions appended.
- [ ] **ENGINE-07**: Build `lib/deliberation/consensus.ts` — detect consensus signals ("I believe we have reached consensus") and extension requests ("I believe we need further discussion because...") from model output. Return structured flags.
- [ ] **ENGINE-08**: Build `lib/deliberation/context-manager.ts` — track accumulated transcript size against model context limits. When approaching the limit, summarize earlier rounds before sending to the next round.

### API Routes

- [ ] **API-01**: `POST /api/sessions/route.ts` — create a new session. Accept title, briefing text, panelist configs, session settings. Insert into `sessions` + `panelists` tables. Return session ID.
- [ ] **API-02**: `POST /api/sessions/[id]/launch/route.ts` — start the deliberation pipeline. Kick off the engine. The engine runs server-side and streams events.
- [ ] **API-03**: `GET /api/sessions/[id]/stream/route.ts` — SSE endpoint. Client connects here to receive real-time events: `phase_change`, `round_start`, `contribution_start`, `contribution_chunk`, `contribution_end`, `vote_result`, `session_complete`, `error`. Follow the SSEEvent types from the PRD.
- [ ] **API-04**: `POST /api/sessions/[id]/intervene/route.ts` — handle user interventions: pause, resume, nudge, force_advance, force_approve. Store in `interventions` table. Engine checks for pending interventions between rounds.
- [ ] **API-05**: `GET /api/sessions/route.ts` — list all sessions for the library. Return id, title, status, panelist count, total cost, tags, created_at. Support search and status filter.
- [ ] **API-06**: `GET /api/sessions/[id]/route.ts` — get full session detail including panelists, all rounds, all contributions, interventions, resolutions.

### UI Pages

- [ ] **UI-01**: Home / Library page (`app/page.tsx`) — list all sessions as cards showing title, status badge, panelist count, cost, date. "New Session" button. Search and filter by status/tags.
- [ ] **UI-02**: New Session page (`app/new/page.tsx`) — briefing text input (large textarea), panelist configuration panel (add/remove panelists, pick model from registry, set display name, avatar color, system prompt), session settings (rounds, approval threshold, etc.), "Launch Deliberation" button. Rough cost estimate based on panelist count × round count.
- [ ] **UI-03**: `components/session/PanelistConfig.tsx` — add/remove panelists, select model from dropdown, edit display name, avatar color picker, system prompt textarea. Support adding the same model multiple times with different personas.
- [ ] **UI-04**: `components/session/SessionSettings.tsx` — all configurable options from the PRD settings table: analysis mode, turn order, round count, hard cap, drafter assignment, approval threshold, disagreement handling, user role.
- [ ] **UI-05**: Session View page (`app/session/[id]/page.tsx`) — the main deliberation view. Header with title, status badge, cost, elapsed time. Phase indicator showing pipeline progress (briefing → analysis → discussion → drafting → voting → done). Main area: contribution feed. Sidebar/bottom: intervention controls.
- [ ] **UI-06**: `components/session/PhaseIndicator.tsx` — visual pipeline showing current phase with completed/active/pending states.
- [ ] **UI-07**: `components/session/ContributionFeed.tsx` + `ContributionCard.tsx` — render contributions with panelist avatar/color, name, model badge, content (streamed via SSE), collapsible thinking section. Round dividers between discussion rounds.
- [ ] **UI-08**: `components/session/InterventionBar.tsx` — pause/resume button, nudge text input + send, force advance button. Wire to the intervene API endpoint.
- [ ] **UI-09**: `components/session/VoteSummary.tsx` — display each panelist's vote (approve/amend/reject) with their reasoning. Show approval tally.
- [ ] **UI-10**: Resolution View page (`app/session/[id]/resolution/page.tsx`) — render the final approved Markdown document with `react-markdown` + `remark-gfm`. Show vote summary. Download Markdown button. "Chain → New Session" button that pre-fills a new session with the resolution as briefing.
- [ ] **UI-11**: Cost Dashboard page (`app/costs/page.tsx`) — total spend (all time, 30d, 7d), spend by model (bar chart or table), session cost table (sortable). Per-session drill-down.

### Polish & Integration

- [ ] **POLISH-01**: Wire SSE streaming end-to-end — the session view page connects to the stream endpoint on mount, renders contributions in real time as chunks arrive, and updates the phase indicator as phases change.
- [ ] **POLISH-02**: Session persistence — ensure the session view page works both live (streaming) AND for completed sessions (load all contributions from Supabase and render the full transcript).
- [ ] **POLISH-03**: Cost tracking end-to-end — every OpenRouter call logs to `cost_log`, session `total_cost_cents` is updated, cost is visible in session header and library cards.
- [ ] **POLISH-04**: Error handling — if a model call fails after 3 retries, mark that panelist's contribution as "unavailable" and continue the deliberation with remaining panelists. Show error state in UI.
- [ ] **POLISH-05**: Cost safety — implement hard cap per session (default $20). Engine halts if exceeded. Show warning in UI when approaching limit.
- [ ] **POLISH-06**: Session presets — save/load panelist configs and settings as presets in the `presets` table. Preset selector on the new session page.
- [ ] **POLISH-07**: Responsive layout — the app should work on desktop (sidebar intervention bar) and tablet. Mobile is nice-to-have.

---

## Rules

- Work through as many items as you can each iteration. Do not artificially limit yourself.
- Commit after each logical unit of work.
- Always verify with `npx tsc --noEmit` before committing.
- Update `RALPH-PROGRESS.md` as you go.
- Reference `DELIBERATION_PRD.md` for exact schema, prompts, API shapes, and UI specs — don't invent, follow the PRD.
- If stuck on an item, mark BLOCKED with reason and keep going.
- Output `<promise>DONE</promise>` ONLY when every item is complete or documented as BLOCKED.
