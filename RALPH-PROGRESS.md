# Ralph Progress — Deliberation Build

## Foundation

- [x] **FOUND-01**: Next.js 16 project initialized with TypeScript, Tailwind CSS v4, App Router. Directory structure per PRD. `.env.local` template created.
- [x] **FOUND-02**: Supabase clients — `lib/supabase/server.ts` (lazy proxy with service role key), `lib/supabase/client.ts` (browser with anon key), `lib/supabase/types.ts` (all TypeScript types).
- [x] **FOUND-03**: Full database migration `supabase/migrations/001_initial_schema.sql` — all 9 tables, RLS + permissive policies, `updated_at` trigger, indexes.
- [x] **FOUND-04**: UI primitives — Button (variants/sizes/loading), Card, Input/Textarea, Badge/StatusBadge. App layout with sidebar nav.
- [x] **FOUND-05**: OpenRouter client `lib/openrouter/client.ts` — streaming (AsyncGenerator<StreamChunk>) and non-streaming modes, SSE line-by-line parsing, reasoning token handling, retry with exponential backoff.
- [x] **FOUND-06**: Model registry `lib/openrouter/models.ts` — Claude Opus 4.6, GPT-5.4, Gemini 3.1 Pro with pricing and context windows. `getModelById()`, `getDefaultPanelists()`.
- [x] **FOUND-07**: Cost tracker `lib/costs/tracker.ts` — `logCost()`, `updateSessionTotalCost()`, `getSessionCost()`, `checkCostCap()`.
- [x] **FOUND-08**: Prompt templates `lib/deliberation/prompts.ts` — analysis, discussion, drafter election, drafting, voting prompts with template parameters.

## Deliberation Engine

- [x] **ENGINE-01**: Core state machine `lib/deliberation/engine.ts` — `runDeliberation(sessionId, emit)` with sequential phase execution, intervention polling (timestamp-based), cost cap checks between phases.
- [x] **ENGINE-02**: Analysis phase `lib/deliberation/phases/analysis.ts` — parallel fan-out, streaming, contribution storage, cost logging.
- [x] **ENGINE-03**: Discussion phase `lib/deliberation/phases/discussion.ts` — multi-round simultaneous mode, intervention checks per round, consensus detection, context management, running transcript.
- [x] **ENGINE-04**: Drafter election `lib/deliberation/phases/drafter-election.ts` — JSON vote parsing with regex fallback, vote tallying, tie-breaking by sort_order.
- [x] **ENGINE-05**: Drafting phase `lib/deliberation/phases/drafting.ts` — elected drafter streams full resolution, creates resolution row.
- [x] **ENGINE-06**: Voting phase `lib/deliberation/phases/voting.ts` — iterative voting with amendment loop, tally against configurable threshold, force-approve with dissenting opinions.
- [x] **ENGINE-07**: Consensus detection `lib/deliberation/consensus.ts` — regex patterns for consensus signals and extension requests, negative pattern exclusion.
- [x] **ENGINE-08**: Context manager `lib/deliberation/context-manager.ts` — token estimation, fitToContext with round summarization.

## API Routes

- [x] **API-01**: `POST /api/sessions` — create session with panelists, validation.
- [x] **API-02**: `POST /api/sessions/[id]/launch` — validate and set status to briefing.
- [x] **API-03**: `GET /api/sessions/[id]/stream` — SSE endpoint with stream-drives-engine pattern, reconnection support, historical event replay.
- [x] **API-04**: `POST /api/sessions/[id]/intervene` — pause, resume, nudge, force_advance, force_approve.
- [x] **API-05**: `GET /api/sessions` — list sessions with search/status filter.
- [x] **API-06**: `GET /api/sessions/[id]` — full session detail with panelists, rounds, contributions, interventions, resolutions.

## UI Pages

- [x] **UI-01**: Library page — client component with search, status filter pills, session cards grid.
- [x] **UI-02**: New Session page — title, briefing, panelist config, session settings, presets, launch flow.
- [x] **UI-03**: `PanelistConfig` — add/remove, model dropdown, name, color picker, system prompt.
- [x] **UI-04**: `SessionSettings` — all PRD settings with defaults.
- [x] **UI-05**: Session View page — SSE streaming via useReducer, header with status/cost/time.
- [x] **UI-06**: `PhaseIndicator` — horizontal stepper with completed/active/pending states.
- [x] **UI-07**: `ContributionFeed` + `ContributionCard` — grouped by round, auto-scroll, markdown rendering, thinking blocks.
- [x] **UI-08**: `InterventionBar` — pause/resume, nudge input, force advance.
- [x] **UI-09**: `VoteSummary` — verdict badges, reasoning, tally bar.
- [x] **UI-10**: Resolution View page — rendered markdown, vote summary, download .md, chain-to-new.
- [x] **UI-11**: Cost Dashboard — time-period summary cards, sortable session cost table.

## Polish & Integration

- [x] **POLISH-01**: SSE streaming wired end-to-end — session view connects to stream endpoint, renders contributions in real time, updates phase indicator.
- [x] **POLISH-02**: Session persistence — completed sessions load from DB, in-progress sessions reconnect to SSE stream.
- [x] **POLISH-03**: Cost tracking end-to-end — every OpenRouter call logs to cost_log, session total_cost_cents updated, visible in session header, library cards, and cost dashboard.
- [x] **POLISH-04**: Error handling — model call failures after 3 retries mark contribution as "unavailable" and continue. Error states shown in UI via messages.
- [x] **POLISH-05**: Cost safety — hard cap check before each model call in engine, halts if exceeded. Configurable per session (default $20).
- [x] **POLISH-06**: Session presets — save/load from presets table via /api/presets. Preset selector and save form on new session page.
- [x] **POLISH-07**: Responsive layout — desktop sidebar hidden on mobile, replaced with bottom tab nav. Padding adjustments for mobile/tablet.

## Verification

- `npx tsc --noEmit` passes with zero errors
- `npm run build` succeeds with all routes compiled
- All 37 checklist items completed
