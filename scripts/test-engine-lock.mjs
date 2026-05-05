// Validate the engine lock + heartbeat + paused-state machinery without
// spending any LLM money. Creates a temporary session, hammers the lock
// in three scenarios, and cleans up.
import { sql } from '@vercel/postgres';

function ok(label, cond) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`);
  if (!cond) process.exitCode = 1;
}

const STALE_AFTER_SECONDS = 60;

async function tryAcquire(id) {
  const { rows } = await sql`
    UPDATE sessions
       SET engine_status = 'running',
           engine_started_at = NOW(),
           engine_heartbeat_at = NOW(),
           engine_error = NULL
     WHERE id = ${id}
       AND (engine_status = 'idle'
            OR engine_heartbeat_at IS NULL
            OR engine_heartbeat_at < NOW() - (${STALE_AFTER_SECONDS} || ' seconds')::interval)
    RETURNING id`;
  return rows.length > 0;
}

// ---- Setup ----
const { rows: created } = await sql`
  INSERT INTO sessions (title, status, config, briefing_text)
  VALUES (
    'TEST: lock-machinery (safe to delete)',
    'briefing',
    '{"cost_cap_cents":1,"suggested_rounds":1,"hard_round_cap":1,"max_draft_iterations":1,"approval_threshold":"simple_majority","disagreement_handling":"both","analysis_mode":"blind","turn_order":"simultaneous","user_role":"observer","pre_assigned_drafter_id":null}'::jsonb,
    'test'
  )
  RETURNING id`;
const id = created[0].id;
console.log(`Test session: ${id}\n`);

try {
  // ---- 1. Idle → first acquire succeeds ----
  ok('first acquire on idle session succeeds', await tryAcquire(id));

  // ---- 2. Already running → second acquire fails (heartbeat fresh) ----
  ok('second acquire while running fails', !(await tryAcquire(id)));

  // ---- 3. Stale heartbeat (older than 60s) → takeover succeeds ----
  await sql`UPDATE sessions SET engine_heartbeat_at = NOW() - INTERVAL '120 seconds' WHERE id = ${id}`;
  ok('stale-heartbeat takeover succeeds', await tryAcquire(id));

  // ---- 4. setEngineHeartbeat updates timestamp ----
  await sql`UPDATE sessions SET engine_heartbeat_at = NOW() - INTERVAL '50 seconds' WHERE id = ${id}`;
  await sql`UPDATE sessions SET engine_heartbeat_at = NOW() WHERE id = ${id} AND engine_status = 'running'`;
  const { rows: hb } = await sql`SELECT engine_heartbeat_at FROM sessions WHERE id = ${id}`;
  const hbAge = Date.now() - new Date(hb[0].engine_heartbeat_at).getTime();
  ok(`heartbeat refresh leaves age <2s (got ${hbAge}ms)`, hbAge < 2000);

  // ---- 5. setEnginePaused preserves work, blocks new acquire (status != idle) ----
  await sql`UPDATE sessions SET engine_status = 'paused', engine_error = 'simulated timeout' WHERE id = ${id}`;
  ok('after pause: acquire blocked', !(await tryAcquire(id)));
  const { rows: paused } = await sql`SELECT engine_status, engine_error FROM sessions WHERE id = ${id}`;
  ok(`paused state recorded`, paused[0].engine_status === 'paused' && paused[0].engine_error === 'simulated timeout');

  // ---- 6. setEngineIdle (resume) → acquire succeeds again ----
  await sql`UPDATE sessions SET engine_status = 'idle', engine_error = NULL WHERE id = ${id}`;
  ok('after resume (idle): acquire succeeds', await tryAcquire(id));
} finally {
  await sql`DELETE FROM sessions WHERE id = ${id}`;
  console.log(`\nCleaned up test session ${id}`);
}
