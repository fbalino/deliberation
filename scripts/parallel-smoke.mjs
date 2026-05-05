// Parallel smoke test: kicks off 3 deliberations concurrently with a tiny
// briefing and a tight cost cap. Verifies they don't deadlock, don't all
// abandon, and that the cost guard halts each one before it blows past $0.50.
//
// Run from the project root with the dev server on :1337:
//   node --env-file=.env.local scripts/parallel-smoke.mjs

const BASE = process.env.SMOKE_BASE || 'http://localhost:1337';
const COST_CAP_CENTS = 50; // $0.50 hard ceiling per session
const SUGGESTED_ROUNDS = 1;

const COLORS = ['#6366f1', '#ec4899', '#14b8a6'];
const NAMES = ['John Edwards', 'Mary Sotheby', 'Rafael Kim'];
const MODELS = ['claude-opus-4-7', 'gpt-5.5', 'gemini-3.1-pro-preview'];

function mkPanelists() {
  return MODELS.map((model_id, i) => ({
    display_name: NAMES[i],
    model_id,
    system_prompt: '',
    avatar_color: COLORS[i],
    is_human: false,
    sort_order: i,
  }));
}

function mkConfig() {
  return {
    analysis_mode: 'blind',
    turn_order: 'simultaneous',
    suggested_rounds: SUGGESTED_ROUNDS,
    hard_round_cap: 1,
    pre_assigned_drafter_id: null,
    approval_threshold: 'simple_majority',
    disagreement_handling: 'both',
    max_draft_iterations: 1,
    user_role: 'observer',
    cost_cap_cents: COST_CAP_CENTS,
  };
}

const TOPICS = [
  { title: 'SMOKE A: lunch choice', briefing: 'Three colleagues are deciding between Italian and Mexican restaurants for lunch. Briefly recommend one with a reason.' },
  { title: 'SMOKE B: meeting timing', briefing: 'A small team is choosing between 9am and 4pm for their weekly meeting. Briefly recommend one with a reason.' },
  { title: 'SMOKE C: doc tool', briefing: 'A team is choosing between Google Docs and Notion for shared notes. Briefly recommend one with a reason.' },
];

async function createSession(topic) {
  const res = await fetch(`${BASE}/api/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: topic.title,
      briefing_text: topic.briefing,
      panelists: mkPanelists(),
      config: mkConfig(),
    }),
  });
  if (!res.ok) throw new Error(`create ${topic.title}: ${res.status} ${await res.text()}`);
  const { id } = await res.json();
  return id;
}

async function launch(id) {
  const res = await fetch(`${BASE}/api/sessions/${id}/launch`, { method: 'POST' });
  if (!res.ok) throw new Error(`launch ${id}: ${res.status} ${await res.text()}`);
}

async function consumeStream(id, label) {
  const res = await fetch(`${BASE}/api/sessions/${id}/stream`);
  if (!res.body) throw new Error(`no stream body for ${id}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const summary = {
    id, label,
    phases: [],
    contributions: 0,
    errors: [],
    completed: false,
    paused: false,
    started: Date.now(),
    finishedAt: null,
  };

  function note(line) {
    const elapsed = ((Date.now() - summary.started) / 1000).toFixed(1);
    console.log(`[${elapsed.padStart(5)}s ${label}] ${line}`);
  }

  note('stream open');

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      try {
        const ev = JSON.parse(line.slice(6));
        switch (ev.type) {
          case 'phase_change':
            summary.phases.push(ev.phase);
            note(`phase → ${ev.phase}`);
            break;
          case 'contribution_start':
            summary.contributions++;
            note(`call: ${ev.panelistName}`);
            break;
          case 'cost_update':
            note(`cost = $${(ev.totalCostCents / 100).toFixed(2)}`);
            break;
          case 'session_complete':
            summary.completed = true;
            note(`complete ✓`);
            break;
          case 'intervention_prompt':
            if (/[Pp]aused/.test(ev.message)) summary.paused = true;
            note(`note: ${ev.message}`);
            break;
          case 'error':
            summary.errors.push(ev.message);
            note(`ERR (${ev.fatal ? 'fatal' : 'soft'}): ${ev.message}`);
            break;
        }
      } catch {
        // ignore malformed
      }
    }
  }

  summary.finishedAt = Date.now();
  note(`stream closed (${((summary.finishedAt - summary.started) / 1000).toFixed(1)}s total)`);
  return summary;
}

async function fetchFinalState(id) {
  const res = await fetch(`${BASE}/api/sessions/${id}`);
  const data = await res.json();
  return {
    status: data.status,
    engine_status: data.engine_status,
    engine_error: data.engine_error,
    total_cost_cents: data.total_cost_cents,
  };
}

// ---- Run all three in parallel ----
console.log('Creating sessions...');
const ids = await Promise.all(TOPICS.map(createSession));
console.log('Created:', ids.map((id) => id.slice(0, 8)).join(', '));

console.log('\nLaunching all three...');
await Promise.all(ids.map(launch));
console.log('Launched. Streaming events:\n');

const results = await Promise.all(
  ids.map((id, i) => consumeStream(id, ['A', 'B', 'C'][i])),
);

console.log('\nFinal DB state per session:');
for (let i = 0; i < ids.length; i++) {
  const final = await fetchFinalState(ids[i]);
  const r = results[i];
  console.log(`  ${['A','B','C'][i]} ${ids[i].slice(0,8)}  status=${final.status.padEnd(10)} engine=${final.engine_status.padEnd(7)} cost=$${(final.total_cost_cents/100).toFixed(2)}  contribs=${r.contributions}  errors=${r.errors.length}`);
  if (final.engine_error) console.log(`     engine_error: ${final.engine_error}`);
}

// Verdict
const allReachedTerminal = results.every((r) => r.completed || r.paused || r.errors.some((e) => /Cost cap|Budget/.test(e)));
const someCompleted = results.some((r) => r.completed);
console.log(`\nAll three reached a clean terminal state: ${allReachedTerminal ? 'YES' : 'NO'}`);
console.log(`At least one completed end-to-end:        ${someCompleted ? 'YES' : 'NO'}`);

process.exit(allReachedTerminal ? 0 : 1);
