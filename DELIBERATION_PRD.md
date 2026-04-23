# Deliberation — Product Requirements Document

## Overview

**Deliberation** is a web application that orchestrates structured multi-model AI discussions. You provide a topic, question, or document — multiple LLMs independently analyze it, debate each other's findings in a configurable round table format, vote on a consensus, and produce a single resolution document.

Think of it as a boardroom where the analysts are frontier AI models, and you are the chairperson.

---

## Tech Stack

- **Framework**: Next.js 14+ (App Router, Server Actions, Route Handlers)
- **Database**: Supabase (Postgres + Realtime subscriptions + Storage for file uploads)
- **LLM Gateway**: OpenRouter (single API key, unified interface to all models)
- **Deployment**: Vercel
- **Styling**: Tailwind CSS
- **PDF Generation**: `@react-pdf/renderer` or `puppeteer` (for final document export)
- **Markdown Rendering**: `react-markdown` with `remark-gfm`
- **Streaming**: Server-Sent Events (SSE) via Next.js Route Handlers

---

## Models (via OpenRouter)

Default roster (user can change per session):

| Model | OpenRouter ID | Input/Output per MTok |
|---|---|---|
| Claude Opus 4.7 | `anthropic/claude-opus-4-7` | $5 / $25 |
| GPT-5.4 | `openai/gpt-5.4` | $2.50 / $15 |
| Gemini 3.1 Pro | `google/gemini-3.1-pro-preview` | $2 / $12 |

The model roster is fully configurable. Users can:
- Pick 2–7+ models from any OpenRouter-supported model
- Add the **same model multiple times** with different system prompts (e.g., "Risk Analyst GPT" and "Opportunity Analyst GPT" both backed by `gpt-5.4`)
- Each panelist gets a display name, avatar color, and system prompt

---

## Core Concepts

### Panelist
A configured instance of a model with a display name, system prompt (persona), and avatar. Multiple panelists can share the same underlying model.

### Session
A complete deliberation lifecycle: briefing → analysis → discussion → drafting → voting → resolution. Sessions are persisted and replayable.

### Round
A single exchange within a phase. Discussion has multiple rounds. Each round produces one contribution per panelist.

### Contribution
A single model's output within a round — their analysis, discussion comment, draft, or vote.

### Resolution
The final approved document, in Markdown. Always accompanied by a generated PDF.

---

## The Deliberation Pipeline

### Phase 1: Briefing

The user provides the material for deliberation:

- **Text input** (free-form question, topic, or prompt)
- **File uploads** (PDF, DOCX, images — stored in Supabase Storage, contents extracted and included in context)
- **URLs** (fetched server-side, content extracted and included)
- **Images** (sent as base64 to models that support vision)

Multiple input types can be combined in a single briefing.

### Phase 2: Independent Analysis

All panelists receive the briefing simultaneously and produce their independent analysis.

**Configurable per session:**
- **Blind analysis** (default): Panelists do NOT see each other's work. True independent analysis.
- **Open analysis**: Panelists can see each other's analysis as it comes in (collaborative from the start).

System prompt for this phase (default, editable):
```
You are an independent analyst participating in a structured deliberation.
Read the briefing material carefully and produce a thorough analysis.
Identify key issues, risks, opportunities, and recommendations.
Be specific and evidence-based. You will later discuss your findings
with other analysts and must be prepared to defend your positions.
```

All analyses are stored as contributions and displayed to the user in real-time (streamed).

### Phase 3: Round Table Discussion

This is the core of the product. Panelists engage in structured debate.

**Turn order (configurable per session):**
- **Simultaneous** (default): All panelists respond to the same prompt at once. After all responses are in, everyone sees everyone's response. Next round begins.
- **Sequential**: Panelists take turns in a fixed order. Each sees all previous speakers' responses in the current round before responding.

**Round mechanics:**
- User sets a **suggested round count** before launch (default: 3).
- Panelists can **finish early**: if a model's response indicates consensus has been reached (detected via structured output — the model explicitly states "I believe we have reached consensus"), the system flags this.
- Panelists can **request more rounds**: if a model says "I believe we need further discussion because [reason]", the system surfaces this to the user as a notification: *"Analyst [name] is requesting additional discussion time: [reason]"*. The user can approve or deny.
- There is a **hard cap** (configurable, default: 10 rounds) to prevent runaway costs.

Each round's system prompt (default, editable):
```
You are participating in round {N} of a structured deliberation.

Here is the original briefing:
{briefing}

Here are all analysts' independent analyses:
{analyses}

Here is the discussion so far:
{discussion_transcript}

Respond to the other analysts' points. Identify where you agree,
where you disagree, and why. Propose specific amendments or compromises
where possible. If you believe consensus has been reached, say so
explicitly. If you believe more discussion is needed, explain why.

Be direct and substantive. Avoid pleasantries.
```

### Phase 4: Drafting

One panelist is designated the "drafter" and synthesizes the full discussion into a single resolution document.

**Drafter selection:**
1. If the user pre-assigned a drafter before session launch → that model drafts.
2. Panelists also vote on who should draft (structured output: each names their pick + reason).
3. If the user's pre-assigned drafter and the panelists' elected drafter are **different** → **two drafts are produced** (one by each). Both are presented side-by-side. This is a calibration feature — can be removed later.
4. If no pre-assignment → panelists' vote determines the drafter.

The drafter receives the full transcript and a prompt:
```
You have been selected to draft the resolution document for this deliberation.

Here is the complete record:
- Briefing: {briefing}
- Independent analyses: {analyses}
- Discussion transcript: {discussion}

Synthesize all perspectives into a single, coherent document.
The format should match the content — use whatever structure best
serves the topic (executive summary, sections, recommendations, etc.).
Where consensus exists, state it clearly. Where disagreement remains,
note the competing positions fairly.

Produce the document in Markdown.
```

### Phase 5: Voting

All panelists (including the drafter) review the draft and vote:

- **Approve**: No changes needed.
- **Approve with amendments**: Approve but suggest specific changes (must provide amendment text).
- **Reject**: Fundamental disagreement (must provide reasoning).

Structured output format for votes:
```json
{
  "verdict": "approve" | "approve_with_amendments" | "reject",
  "amendments": "string or null",
  "reasoning": "string"
}
```

**Approval threshold**: Configurable per session. Options:
- Simple majority
- Supermajority (2/3)
- Unanimous
- Custom ratio (e.g., 4 of 5)

**On rejection/amendments (configurable per session):**
- **Iterate**: Drafter incorporates amendments, produces v2, panelists vote again. Loop until threshold is met or hard cap (default: 3 drafting iterations).
- **Minority report**: After max iterations, force-approve with a "Dissenting Opinions" section appended to the document containing the minority's reasoning.

### Phase 6: Resolution

Final output:
- **Markdown document** rendered in-app with full formatting
- **PDF export** generated automatically
- Both stored in Supabase Storage and linked to the session

---

## User Intervention System

The deliberation runs autonomously by default, but the user can intervene at any point:

- **Pause**: Halts the pipeline after the current contribution finishes. Resume when ready.
- **Nudge**: Inject a directive that gets prepended to the next round's prompt for all panelists (e.g., "Focus more on the financial risks" or "You're going in circles — try to find compromise on point 3").
- **Inject as participant** (if participant mode is enabled): The user's input is treated as a contribution from a human panelist named "Chair" — models see it alongside other panelists' contributions.
- **Force-advance**: Skip remaining discussion rounds and move to drafting.
- **Force-approve**: Accept the current draft regardless of vote outcomes.

**Participant mode** (configurable per session):
- **Observer mode** (default): User can pause, nudge, and force-advance but is not a formal panelist.
- **Participant mode**: User is a panelist. They contribute analysis, participate in discussion rounds, and vote.

---

## Session Configuration

Before launching a deliberation, the user configures:

| Setting | Default | Options |
|---|---|---|
| Panelists | Claude Opus 4.7, GPT-5.4, Gemini 3.1 Pro | Pick 2–7+ from roster, add custom personas |
| Persona prompts | Neutral defaults | Editable per panelist |
| Analysis mode | Blind | Blind / Open |
| Discussion turn order | Simultaneous | Simultaneous / Sequential |
| Suggested rounds | 3 | 1–10 |
| Hard round cap | 10 | 1–20 |
| Pre-assigned drafter | None | Any panelist or none |
| Approval threshold | Simple majority | Majority / Supermajority / Unanimous / Custom |
| Disagreement handling | Iterate then minority report | Iterate / Minority report / Both |
| Max draft iterations | 3 | 1–5 |
| User role | Observer | Observer / Participant |

These settings can be saved as **presets** for reuse.

---

## Session Library & Chaining

All sessions are persisted with full transcripts, contributions, votes, and final documents.

**Library features:**
- List view with status, date, panelist count, cost, tags
- Search by title, briefing content, resolution content
- Tags (user-defined, e.g., "investment", "technical", "strategy")
- Filter by status (in-progress, completed, abandoned)
- **Fork**: Clone a session's configuration and re-run with different models, prompts, or briefing
- **Chain**: Link sessions so that the resolution of Session A automatically becomes the briefing for Session B. Chains are displayed as a linked sequence in the library.

---

## Cost Tracking

Every API call logs token usage (input, output, cached) and cost estimates via OpenRouter's response headers.

**Per-session view:**
- Total cost
- Cost per panelist
- Cost per phase (analysis, discussion, drafting, voting)
- Cost per round
- Token breakdown (input/output/thinking)

**Dashboard view:**
- Total historical spend
- Spend over time (chart)
- Spend by model
- Spend by session
- Average cost per deliberation
- Most expensive sessions

---

## Streaming & Thinking Tokens

All model outputs are streamed to the UI via SSE.

- **Default view**: Live token-by-token streaming with the model's name and avatar
- **Alternative view**: Progress indicator, full contribution revealed when complete
- **Toggle**: User can switch between views at any time

**Thinking/reasoning tokens** are surfaced when available:
- Claude's extended thinking blocks → rendered in a collapsible "Thinking" section above the response
- GPT-5.4's reasoning tokens → same treatment
- Gemini's thinking content → same treatment

These are displayed in a visually distinct style (muted text, monospace, collapsible by default).

---

## Database Schema (Supabase)

```sql
-- Saved configuration presets
create table presets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  config jsonb not null, -- full session config object
  created_at timestamptz default now()
);

-- A deliberation session
create table sessions (
  id uuid primary key default gen_random_uuid(),
  title text,
  status text not null default 'configuring',
    -- configuring | briefing | analyzing | discussing | drafting | voting | completed | abandoned
  config jsonb not null, -- panelists, thresholds, modes, etc.
  briefing_text text,
  briefing_urls text[], -- fetched URLs
  chain_parent_id uuid references sessions(id), -- for chained sessions
  tags text[],
  total_cost_cents integer default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- File attachments for briefings
create table session_files (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions(id) on delete cascade,
  file_name text not null,
  file_type text not null, -- pdf, docx, image, etc.
  storage_path text not null, -- Supabase Storage path
  extracted_text text, -- extracted content for context
  created_at timestamptz default now()
);

-- Panelist configurations per session
create table panelists (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions(id) on delete cascade,
  display_name text not null,
  model_id text not null, -- OpenRouter model ID
  system_prompt text,
  avatar_color text, -- hex color for UI
  is_human boolean default false, -- true if this is the user in participant mode
  sort_order integer not null,
  created_at timestamptz default now()
);

-- Rounds within a session
create table rounds (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions(id) on delete cascade,
  phase text not null, -- analysis | discussion | drafting | voting | drafter_election
  round_number integer not null,
  created_at timestamptz default now()
);

-- Individual model contributions
create table contributions (
  id uuid primary key default gen_random_uuid(),
  round_id uuid references rounds(id) on delete cascade,
  panelist_id uuid references panelists(id) on delete cascade,
  content text not null,
  thinking_content text, -- extended thinking / reasoning tokens
  token_usage jsonb, -- { input, output, thinking, cached }
  cost_cents integer,
  vote_data jsonb, -- for voting phase: { verdict, amendments, reasoning }
  drafter_vote text, -- for drafter election: panelist_id of their pick
  meta jsonb, -- any additional structured data
  created_at timestamptz default now()
);

-- User interventions (nudges, pauses, injections)
create table interventions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions(id) on delete cascade,
  type text not null, -- pause | resume | nudge | inject | force_advance | force_approve
  content text, -- nudge text or injection content
  applied_before_round integer, -- which round this was applied before
  created_at timestamptz default now()
);

-- Final resolution documents
create table resolutions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions(id) on delete cascade,
  version integer not null default 1,
  drafter_panelist_id uuid references panelists(id),
  draft_type text not null default 'elected', -- elected | assigned (for dual-draft)
  content_markdown text not null,
  pdf_storage_path text,
  status text not null default 'draft', -- draft | approved | rejected
  created_at timestamptz default now()
);

-- Cost tracking aggregates (materialized by triggers or cron)
create table cost_log (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions(id) on delete cascade,
  panelist_id uuid references panelists(id),
  phase text not null,
  round_number integer,
  model_id text not null,
  input_tokens integer,
  output_tokens integer,
  thinking_tokens integer,
  cached_tokens integer,
  cost_cents integer,
  created_at timestamptz default now()
);
```

---

## API Architecture

### OpenRouter Integration

Single endpoint: `https://openrouter.ai/api/v1/chat/completions`

All calls go through a server-side utility:
```typescript
async function callModel({
  modelId: string,
  messages: Message[],
  systemPrompt: string,
  stream: boolean,
  // OpenRouter-specific
  transforms?: string[],
  route?: string,
}) => AsyncGenerator<StreamChunk> | ModelResponse
```

Key OpenRouter features to use:
- **Streaming**: `stream: true` for live output
- **Provider routing**: Let OpenRouter handle failover
- **Usage tracking**: Parse `x-openrouter-*` response headers for token counts and costs
- **Thinking tokens**: Pass through provider-specific params (`anthropic.thinking`, `openai.reasoning_effort`, etc.) via OpenRouter's provider-specific fields

### Server-Side Orchestration

The deliberation pipeline runs as a **server-side state machine** managed by a Next.js Route Handler. It:

1. Reads session config from Supabase
2. Executes the current phase (fan-out parallel calls for simultaneous mode, sequential for sequential mode)
3. Streams results to the client via SSE
4. Writes contributions to Supabase as they complete
5. Checks for consensus signals, extension requests, and intervention flags
6. Advances to the next phase when conditions are met

The SSE endpoint is `GET /api/sessions/[id]/stream`. The client connects on session launch and receives events:

```typescript
type SSEEvent =
  | { type: 'phase_change'; phase: string }
  | { type: 'round_start'; round: number; phase: string }
  | { type: 'contribution_start'; panelistId: string }
  | { type: 'contribution_chunk'; panelistId: string; text: string; isThinking: boolean }
  | { type: 'contribution_end'; panelistId: string; tokenUsage: TokenUsage }
  | { type: 'extension_request'; panelistId: string; reason: string }
  | { type: 'consensus_signal'; panelistId: string }
  | { type: 'vote_result'; panelistId: string; verdict: string }
  | { type: 'intervention_prompt'; message: string } // system asking user something
  | { type: 'session_complete'; resolutionId: string }
  | { type: 'error'; message: string }
```

User interventions are sent via `POST /api/sessions/[id]/intervene` and picked up by the orchestrator between rounds.

---

## UI Pages

### 1. Home / Library (`/`)
- List of all sessions (card layout)
- Search, filter by status/tags
- "New Session" button
- Chain view for linked sessions
- Quick stats: total sessions, total spend

### 2. New Session (`/new`)
- Briefing input area (text field, file upload dropzone, URL input)
- Panelist configuration panel (add/remove/configure panelists)
- Session settings (all configurable options from the table above)
- Preset selector (load saved configs)
- "Launch Deliberation" button
- Estimated cost indicator (rough estimate based on panelist count and round count)

### 3. Session View (`/session/[id]`)
- **Header**: Session title, status badge, cost so far, elapsed time
- **Phase indicator**: Visual pipeline showing current phase (briefing → analysis → discussion → drafting → voting → done)
- **Main area**: Contributions feed
  - Each contribution shows: panelist avatar/color, name, model badge, content (streamed), collapsible thinking section
  - Round dividers between discussion rounds
  - Visual indicators for agreement/disagreement (can be simple tags initially)
- **Sidebar / bottom bar**: Intervention controls
  - Pause / Resume button
  - Nudge text input
  - Force Advance button
  - Inject as Chair (if participant mode)
- **Notification area**: Extension requests from panelists, consensus signals

### 4. Resolution View (`/session/[id]/resolution`)
- Side-by-side drafts (if dual-drafter scenario)
- Vote summary per panelist
- Final approved document in rendered Markdown
- Export buttons: Download Markdown, Download PDF
- "Iterate" button (send back for another round)
- "Chain → New Session" button (use this resolution as briefing for a new session)

### 5. Cost Dashboard (`/costs`)
- Total spend (all time, last 30 days, last 7 days)
- Spend over time line chart
- Spend by model (bar chart)
- Session cost table (sortable)
- Per-session drill-down

---

## MVP Scope (Phase 1)

Build these first to get a working product:

1. ✅ Session creation with text briefing and panelist configuration
2. ✅ Independent analysis phase (blind mode only)
3. ✅ Discussion phase (simultaneous mode only, fixed round count)
4. ✅ Single drafter (elected by panelists)
5. ✅ Voting with simple majority
6. ✅ Resolution display with Markdown rendering
7. ✅ Basic streaming (contribution-level, not token-level)
8. ✅ Session persistence and basic library
9. ✅ Per-session cost tracking

### Phase 2 Additions
- Token-level streaming with thinking blocks
- File uploads and URL fetching
- Sequential turn mode
- User intervention (pause/nudge/inject)
- Participant mode
- Dual-drafter mechanic
- PDF export
- Session presets

### Phase 3 Additions
- Session chaining
- Fork/re-run
- Full cost dashboard
- Open analysis mode
- Extension requests and consensus detection
- Configurable approval thresholds
- Minority report mechanic
- Rich UI (avatars, agreement indicators, timeline)

---

## Non-Functional Requirements

- **No auth**: Single user app. No login, no user table.
- **Error handling**: If a model call fails (rate limit, timeout), retry up to 3 times with exponential backoff. If still failing, mark that panelist's contribution as "unavailable" and continue the deliberation with remaining panelists.
- **Cost safety**: Hard cap per session (configurable, default $20). Pipeline halts if exceeded.
- **Context management**: As discussions grow long, the system must be aware of context limits. If the accumulated transcript approaches model context limits, summarize earlier rounds before sending to the next round.

---

## Environment Variables

```
OPENROUTER_API_KEY=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

---

## File Structure

```
deliberation/
├── app/
│   ├── layout.tsx
│   ├── page.tsx                          # Home / Library
│   ├── new/
│   │   └── page.tsx                      # New Session
│   ├── session/
│   │   └── [id]/
│   │       ├── page.tsx                  # Session View (live deliberation)
│   │       └── resolution/
│   │           └── page.tsx              # Resolution View
│   ├── costs/
│   │   └── page.tsx                      # Cost Dashboard
│   └── api/
│       ├── sessions/
│       │   ├── route.ts                  # POST: create session
│       │   └── [id]/
│       │       ├── stream/
│       │       │   └── route.ts          # GET: SSE stream
│       │       ├── intervene/
│       │       │   └── route.ts          # POST: user intervention
│       │       └── launch/
│       │           └── route.ts          # POST: start deliberation
│       └── openrouter/
│           └── route.ts                  # proxy/utility for OpenRouter calls
├── lib/
│   ├── supabase/
│   │   ├── client.ts                     # browser client
│   │   ├── server.ts                     # server client
│   │   └── types.ts                      # generated types
│   ├── openrouter/
│   │   ├── client.ts                     # OpenRouter API wrapper
│   │   ├── models.ts                     # model registry and defaults
│   │   └── types.ts
│   ├── deliberation/
│   │   ├── engine.ts                     # state machine / orchestrator
│   │   ├── phases/
│   │   │   ├── analysis.ts
│   │   │   ├── discussion.ts
│   │   │   ├── drafting.ts
│   │   │   └── voting.ts
│   │   ├── prompts.ts                    # default system prompts
│   │   ├── consensus.ts                  # consensus detection logic
│   │   └── context-manager.ts            # context window management
│   ├── costs/
│   │   └── tracker.ts                    # cost calculation and logging
│   └── files/
│       ├── extractor.ts                  # PDF/DOCX text extraction
│       └── url-fetcher.ts                # URL content fetching
├── components/
│   ├── session/
│   │   ├── BriefingInput.tsx
│   │   ├── PanelistConfig.tsx
│   │   ├── SessionSettings.tsx
│   │   ├── ContributionFeed.tsx
│   │   ├── ContributionCard.tsx
│   │   ├── ThinkingBlock.tsx
│   │   ├── PhaseIndicator.tsx
│   │   ├── InterventionBar.tsx
│   │   └── VoteSummary.tsx
│   ├── resolution/
│   │   ├── ResolutionView.tsx
│   │   ├── DualDraftComparison.tsx
│   │   └── ExportButtons.tsx
│   ├── library/
│   │   ├── SessionCard.tsx
│   │   ├── SessionList.tsx
│   │   └── ChainView.tsx
│   ├── costs/
│   │   ├── CostDashboard.tsx
│   │   ├── SpendChart.tsx
│   │   └── SessionCostTable.tsx
│   └── ui/
│       ├── Badge.tsx
│       ├── Button.tsx
│       ├── Card.tsx
│       ├── Input.tsx
│       └── ... (basic UI primitives)
├── supabase/
│   └── migrations/
│       └── 001_initial_schema.sql
├── package.json
├── tailwind.config.ts
├── tsconfig.json
└── .env.local
```
