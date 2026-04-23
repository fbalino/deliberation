# UI Audit And Mockups

Date: 2026-04-23

## Goal

Understand how the Deliberation app works, identify UI improvements, and create runnable mockups the user can inspect in the browser.

## Codebase Read

- Next.js app router with the main product routes in `app/`.
- Shared visual primitives live in `components/ui/`.
- Session creation is in `app/new/page.tsx`.
- Session monitoring is in `app/session/[id]/page.tsx` and `components/session/`.
- Library and cost views are in `app/page.tsx`, `components/library/`, and `app/costs/page.tsx`.
- App data uses Vercel Postgres helpers under `lib/db/`.
- Live session updates arrive through server-sent events from `app/api/sessions/[id]/stream/route.ts`.

## Current UI Issues

- The Library page is clean, but it does not give a quick "today's work" summary, recent activity context, or enough help choosing what to open next.
- The New Session page is a long form. It asks for all setup details at once, which is heavy for non-technical users.
- Panelist setup exposes model and prompt mechanics before explaining the practical outcome of each choice.
- The live Session page is dense. Phase status, session controls, panelist streams, votes, and final resolution all compete for attention.
- Destructive actions use browser confirms instead of integrated confirmation UI.
- Cost information exists, but it is not consistently tied to the launch decision and live session confidence.
- Mobile behavior exists, but the live panelist columns are better suited to a desktop monitoring layout and need a mobile-specific mode.

## Mockup Directions

- `Command Center`: make the library a calmer home base with status summaries, suggested next actions, and a stronger recent-session list.
- `Guided Builder`: turn session creation into a step-by-step setup flow with a plain-language readiness panel.
- `Live Room`: make the deliberation screen easier to watch by separating phase status, panelist work, votes, intervention, and resolution preview.

## Deliverables

- Add a standalone `/mockups` route.
- Include three interactive redesign directions.
- Keep the mockup route separate for review before production changes.
- Launch the app locally and verify the route in browser.

## Follow-up Implementation

- Apply the concept-board direction to the production Library, New Session, and Live Session screens.
- Make model identity private by default: deliberators see display names only, while the user can still see the backing model in configuration and admin UI.
- Replace model-name defaults with editable human-style deliberator names.
- Preserve model IDs for API routing, cost logs, and private user-facing metadata.
