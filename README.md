# Deliberation

An AI-powered deliberation platform where multiple LLM "panelists" analyze a topic, debate, and produce a consensus resolution — with human oversight at every step.

## How It Works

The deliberation process follows a structured 5-phase pipeline. Each phase builds on the previous one, with cost controls and human intervention points throughout.

```
┌─────────────────────────────────────────────────────────────┐
│                    SESSION CREATION                          │
│                                                             │
│  User provides:                                             │
│  • Briefing text (the topic/question)                       │
│  • Uploaded documents (PDF, DOCX, etc.)                     │
│  • Panel of AI models (e.g. GPT-4, Claude, Gemini)          │
│  • Configuration (rounds, thresholds, turn order, etc.)     │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│               PHASE 1: ANALYSIS                             │
│                                                             │
│  Each panelist independently analyzes the briefing.         │
│                                                             │
│  Two modes:                                                 │
│  • Blind — all panelists analyze in parallel, can't see     │
│    each other's work (prevents groupthink)                  │
│  • Open — sequential, each panelist sees previous analyses  │
│                                                             │
│  Output: One analysis per panelist                          │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼  ← User can PAUSE / NUDGE / FORCE ADVANCE
┌─────────────────────────────────────────────────────────────┐
│               PHASE 2: DISCUSSION                           │
│                                                             │
│  Multi-round debate between panelists.                      │
│                                                             │
│  Turn order modes:                                          │
│  • Simultaneous — all respond at once (can't see each       │
│    other mid-round)                                         │
│  • Sequential — one at a time, each sees prior speakers     │
│  • Hybrid — Round 1 simultaneous, Round 2+ sequential       │
│                                                             │
│  Runs for N configured rounds (default 3, max 10).          │
│  Auto-advances early if majority signals consensus.         │
│                                                             │
│  Context manager truncates history to fit model limits.     │
│                                                             │
│  Output: Multi-round discussion transcript                  │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│            PHASE 3: DRAFTER ELECTION                        │
│                                                             │
│  Panelists vote on who should write the resolution.         │
│                                                             │
│  • Each panelist picks one name from the panel              │
│  • Votes are tallied; ties broken by sort order             │
│  • Can be skipped if user pre-assigns a drafter             │
│                                                             │
│  Output: One elected drafter                                │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│               PHASE 4: DRAFTING                             │
│                                                             │
│  The elected drafter writes a resolution document           │
│  in Markdown, synthesizing the full analysis +              │
│  discussion transcript.                                     │
│                                                             │
│  Output: Resolution draft (v1)                              │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│               PHASE 5: VOTING                               │
│                                                             │
│  All panelists vote on the draft:                           │
│  • approve                                                  │
│  • approve_with_amendments                                  │
│  • reject                                                   │
│                                                             │
│  Approval thresholds:                                       │
│  • Simple majority (>50%)                                   │
│  • Supermajority (≥67%)                                     │
│  • Unanimous (100%)                                         │
│  • Custom ratio                                             │
│                                                             │
│  If rejected → amendments sent back to drafter →            │
│  new draft version → re-vote (up to N iterations).          │
│                                                             │
│  Disagreement handling:                                     │
│  • iterate — keep revising until approved                   │
│  • minority_report — approve with dissents appended         │
│  • both — iterate first, append dissents if cap reached     │
│                                                             │
│  Output: Approved resolution (with optional dissents)       │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                   SESSION COMPLETE                           │
│                                                             │
│  Final resolution stored in the database.                    │
│  Full cost breakdown available.                             │
│  Session can be chained into follow-up deliberations.       │
└─────────────────────────────────────────────────────────────┘
```

### Cross-Cutting Concerns

- **Cost Controls** — A cost cap (in cents) is checked between every phase. If exceeded, the session auto-approves the current draft and stops.
- **Human Interventions** — At any point, the user (observer or participant) can pause, resume, nudge (inject guidance), force-advance past a phase, or force-approve the current draft.
- **Real-time Streaming** — All contributions stream via SSE (Server-Sent Events) so the UI updates live as each panelist "speaks."
- **Multi-Provider** — Models are called through OpenRouter with native provider adapters for Anthropic, OpenAI, and Google (Gemini).

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js (App Router) |
| Database | Neon (PostgreSQL via Vercel Marketplace) |
| AI Models | OpenRouter (Anthropic, OpenAI, Google) |
| Styling | Tailwind CSS |
| Language | TypeScript |
| Deployment | Vercel |

## Getting Started

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.local.example .env.local
# Fill in: OPENROUTER_API_KEY, POSTGRES_URL

# Run dev server
npm run dev -- -p 1337
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `OPENROUTER_API_KEY` | OpenRouter API key for LLM calls |
| `POSTGRES_URL` | Neon/Vercel Postgres connection string |
| `OPENAI_API_KEY` | Direct OpenAI API key (optional) |
| `ANTHROPIC_API_KEY` | Direct Anthropic API key (optional) |
| `GEMINI_API_KEY` | Direct Google Gemini API key (optional) |
