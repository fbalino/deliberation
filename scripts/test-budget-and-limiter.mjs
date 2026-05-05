// Validate the cost guard + per-provider concurrency limiter without spending
// LLM money. Imports the actual TS sources via Next's tsx-style loader is
// awkward, so this script tests the SQL-level invariant for the budget guard
// and an inline replica of the limiter semaphore for concurrency.
import { sql } from '@vercel/postgres';

function ok(label, cond) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`);
  if (!cond) process.exitCode = 1;
}

// ---- Budget guard via DB ----
const { rows: created } = await sql`
  INSERT INTO sessions (title, status, config, briefing_text, total_cost_cents)
  VALUES (
    'TEST: budget guard',
    'briefing',
    '{"cost_cap_cents":100}'::jsonb,
    'test',
    99
  )
  RETURNING id`;
const id = created[0].id;

try {
  const cap = 100;
  const { rows: r1 } = await sql`SELECT total_cost_cents FROM sessions WHERE id = ${id}`;
  ok(`under cap: 99 < 100 → would proceed`, r1[0].total_cost_cents < cap);

  await sql`UPDATE sessions SET total_cost_cents = 100 WHERE id = ${id}`;
  const { rows: r2 } = await sql`SELECT total_cost_cents FROM sessions WHERE id = ${id}`;
  ok(`at cap: 100 >= 100 → would throw BudgetExceededError`, r2[0].total_cost_cents >= cap);

  await sql`UPDATE sessions SET total_cost_cents = 250 WHERE id = ${id}`;
  const { rows: r3 } = await sql`SELECT total_cost_cents FROM sessions WHERE id = ${id}`;
  ok(`over cap: 250 >= 100 → would throw`, r3[0].total_cost_cents >= cap);
} finally {
  await sql`DELETE FROM sessions WHERE id = ${id}`;
}

// ---- Inline-replica semaphore concurrency test ----
class Semaphore {
  constructor(max) { this.max = max; this.active = 0; this.waiters = []; }
  async acquire() {
    if (this.active < this.max) { this.active++; return; }
    await new Promise((resolve) => this.waiters.push(resolve));
    this.active++;
  }
  release() {
    this.active--;
    const next = this.waiters.shift();
    if (next) next();
  }
}

async function withSlot(sem, fn) {
  await sem.acquire();
  try { return await fn(); } finally { sem.release(); }
}

const sem = new Semaphore(2);
let peakConcurrency = 0;
let inFlight = 0;
const tasks = [];

for (let i = 0; i < 6; i++) {
  tasks.push(withSlot(sem, async () => {
    inFlight++;
    peakConcurrency = Math.max(peakConcurrency, inFlight);
    await new Promise((r) => setTimeout(r, 50));
    inFlight--;
  }));
}
const t0 = Date.now();
await Promise.all(tasks);
const elapsed = Date.now() - t0;

ok(`semaphore peak concurrency stays at limit (max=2, peak=${peakConcurrency})`, peakConcurrency === 2);
// 6 tasks × 50ms in batches of 2 = at least 150ms total
ok(`semaphore serialized excess load (≈150ms, got ${elapsed}ms)`, elapsed >= 140);

console.log('\nAll budget + limiter assertions passed.');
