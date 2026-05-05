import { sql } from '@vercel/postgres';

const sessions = await sql`
  SELECT id, title, status, created_at, total_cost_cents, config
  FROM sessions
  WHERE created_at >= NOW() - INTERVAL '4 days'
  ORDER BY created_at DESC
  LIMIT 30`;
console.log('=== Recent sessions ===');
for (const s of sessions.rows) {
  console.log(`${s.created_at.toISOString()} | ${s.id.slice(0,8)} | ${String(s.status).padEnd(18)} | $${(s.total_cost_cents/100).toFixed(2).padStart(7)} | ${s.title}`);
}

console.log('\n=== Total cost last 3 days (cost_log) ===');
const total = await sql`
  SELECT COALESCE(SUM(cost_cents), 0)::int AS total_cents,
         COUNT(*)::int AS rows
  FROM cost_log
  WHERE created_at >= NOW() - INTERVAL '3 days'`;
console.log(`$${(total.rows[0].total_cents/100).toFixed(2)}  across ${total.rows[0].rows} log rows`);

console.log('\n=== Per-session cost log breakdown ===');
const breakdown = await sql`
  SELECT session_id, COUNT(*)::int AS calls,
         SUM(cost_cents)::int AS total_cents,
         SUM(input_tokens)::int AS in_tok,
         SUM(output_tokens)::int AS out_tok,
         MIN(created_at) AS first,
         MAX(created_at) AS last
  FROM cost_log
  WHERE created_at >= NOW() - INTERVAL '3 days'
  GROUP BY session_id
  ORDER BY total_cents DESC`;
for (const r of breakdown.rows) {
  console.log(`${String(r.session_id).slice(0,8)} | calls=${String(r.calls).padStart(3)} | $${(r.total_cents/100).toFixed(2).padStart(7)} | in=${r.in_tok} out=${r.out_tok} | ${r.first?.toISOString()} → ${r.last?.toISOString()}`);
}
