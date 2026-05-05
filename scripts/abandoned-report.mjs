/*
 * abandoned-report.mjs
 *
 * Surfaces sessions that were either explicitly marked `abandoned` or that
 * appear stalled (non-terminal status, no contributions in the last 30 minutes)
 * within a rolling window. Helps catch token burn from stuck engines.
 *
 * Run:
 *   node --env-file=.env.local scripts/abandoned-report.mjs        # last 7 days
 *   node --env-file=.env.local scripts/abandoned-report.mjs 14     # last 14 days
 */

import { sql } from '@vercel/postgres';

const DAYS = Math.max(1, Number(process.argv[2]) || 7);
const STALL_MINUTES = 30;

const fmtMoney = (cents) => `$${((cents || 0) / 100).toFixed(2)}`;
const fmtIso = (d) => (d ? new Date(d).toISOString().replace('T', ' ').slice(0, 19) : '—'.padEnd(19));
const shortId = (id) => String(id).slice(0, 8);

// One query: sessions in window, with last contribution time, last phase reached,
// and panelist count. Avoids N+1 by joining rounds → contributions and aggregating.
const { rows } = await sql`
  WITH last_activity AS (
    SELECT
      r.session_id,
      MAX(c.created_at)                              AS last_contrib_at,
      (ARRAY_AGG(r.phase ORDER BY c.created_at DESC))[1] AS last_phase
    FROM rounds r
    JOIN contributions c ON c.round_id = r.id
    GROUP BY r.session_id
  ),
  last_round AS (
    SELECT session_id,
           (ARRAY_AGG(phase ORDER BY round_number DESC, created_at DESC))[1] AS last_phase
    FROM rounds
    GROUP BY session_id
  ),
  panelist_counts AS (
    SELECT session_id, COUNT(*)::int AS panelist_count
    FROM panelists
    GROUP BY session_id
  )
  SELECT
    s.id,
    s.title,
    s.status,
    s.total_cost_cents,
    s.created_at,
    la.last_contrib_at,
    COALESCE(la.last_phase, lr.last_phase) AS last_phase,
    COALESCE(pc.panelist_count, 0)         AS panelist_count
  FROM sessions s
  LEFT JOIN last_activity   la ON la.session_id = s.id
  LEFT JOIN last_round      lr ON lr.session_id = s.id
  LEFT JOIN panelist_counts pc ON pc.session_id = s.id
  WHERE s.created_at >= NOW() - (${DAYS} || ' days')::interval
  ORDER BY s.created_at DESC`;

const TERMINAL = new Set(['completed', 'abandoned', 'configuring']);
const stallCutoff = Date.now() - STALL_MINUTES * 60 * 1000;

const abandoned = [];
const stalled = [];

for (const r of rows) {
  if (r.status === 'abandoned') {
    abandoned.push(r);
    continue;
  }
  if (TERMINAL.has(r.status)) continue;
  const lastTs = r.last_contrib_at ? new Date(r.last_contrib_at).getTime() : new Date(r.created_at).getTime();
  if (lastTs < stallCutoff) stalled.push(r);
}

const totalWindowCents = rows.reduce((sum, r) => sum + (r.total_cost_cents || 0), 0);
const lostCents =
  abandoned.reduce((s, r) => s + (r.total_cost_cents || 0), 0) +
  stalled.reduce((s, r) => s + (r.total_cost_cents || 0), 0);
const pct = totalWindowCents > 0 ? (lostCents / totalWindowCents) * 100 : 0;

// Column widths chosen for monospace alignment.
const HEADER =
  'id       | cost     | created             | last activity       | phase              | pnl | title';
const RULE = '-'.repeat(HEADER.length);

function printRow(r) {
  const cost = fmtMoney(r.total_cost_cents).padStart(8);
  const created = fmtIso(r.created_at);
  const last = fmtIso(r.last_contrib_at);
  const phase = String(r.last_phase || '—').padEnd(18);
  const pnl = String(r.panelist_count).padStart(3);
  const title = (r.title || '(untitled)').replace(/\s+/g, ' ').slice(0, 60);
  console.log(`${shortId(r.id)} | ${cost} | ${created} | ${last} | ${phase} | ${pnl} | ${title}`);
}

function printSection(label, list) {
  console.log(`\n=== ${label} (${list.length}) ===`);
  if (list.length === 0) {
    console.log('  (none)');
    return;
  }
  console.log(HEADER);
  console.log(RULE);
  for (const r of list) printRow(r);
}

console.log(`Deliberation abandoned/stalled report — window: last ${DAYS} day(s)`);
console.log(`Stall threshold: no contributions in ${STALL_MINUTES} min and status not in {completed, abandoned, configuring}`);

printSection('Abandoned sessions', abandoned);
printSection('Stalled sessions', stalled);

console.log('\n=== Totals ===');
console.log(`Sessions in window:     ${rows.length}`);
console.log(`Total cost in window:   ${fmtMoney(totalWindowCents)}`);
console.log(`Abandoned + stalled:    ${fmtMoney(lostCents)}  (${pct.toFixed(1)}% of window)`);
console.log(`  abandoned:            ${fmtMoney(abandoned.reduce((s, r) => s + (r.total_cost_cents || 0), 0))}  across ${abandoned.length}`);
console.log(`  stalled:              ${fmtMoney(stalled.reduce((s, r) => s + (r.total_cost_cents || 0), 0))}  across ${stalled.length}`);
