import { sql } from '@vercel/postgres';

const ids = ['82de3f1c', '9fc479ab', 'f7bf0a1f'];

for (const short of ids) {
  const { rows: srows } = await sql`SELECT id, title, status, config, total_cost_cents, created_at FROM sessions WHERE id::text LIKE ${short + '%'}`;
  if (!srows[0]) { console.log(`No session ${short}`); continue; }
  const s = srows[0];
  const id = s.id;
  console.log(`\n========== ${short} | ${s.title} | ${s.status} | $${(s.total_cost_cents/100).toFixed(2)} ==========`);
  console.log('Created:', s.created_at.toISOString());
  console.log('Cost cap:', s.config.cost_cap_cents, 'cents, hard_round_cap:', s.config.hard_round_cap, 'rounds:', s.config.suggested_rounds, 'turn_order:', s.config.turn_order, 'analysis_mode:', s.config.analysis_mode);

  const { rows: panelists } = await sql`SELECT id, display_name, model_id, is_human FROM panelists WHERE session_id = ${id} ORDER BY sort_order`;
  console.log('Panelists:');
  for (const p of panelists) console.log(`  ${p.display_name} (${p.model_id}) human=${p.is_human}`);

  const { rows: rounds } = await sql`SELECT id, phase, round_number, created_at FROM rounds WHERE session_id = ${id} ORDER BY round_number, created_at`;
  console.log(`Rounds (${rounds.length}):`);
  for (const r of rounds) console.log(`  r${r.round_number} ${r.phase} @ ${r.created_at?.toISOString?.() ?? r.created_at}`);

  const { rows: contribs } = await sql`
    SELECT c.created_at, p.display_name AS panelist, r.phase, r.round_number, c.cost_cents, LENGTH(c.content) AS clen
    FROM contributions c
    JOIN panelists p ON c.panelist_id = p.id
    JOIN rounds r ON c.round_id = r.id
    WHERE r.session_id = ${id}
    ORDER BY c.created_at`;
  console.log(`Contributions (${contribs.length}):`);
  for (const c of contribs) console.log(`  ${c.created_at.toISOString()} | r${c.round_number} ${c.phase.padEnd(18)} | ${c.panelist.padEnd(15)} | $${((c.cost_cents||0)/100).toFixed(3)} | len=${c.clen}`);

  const { rows: ints } = await sql`SELECT type, content, created_at FROM interventions WHERE session_id = ${id} ORDER BY created_at`;
  console.log(`Interventions (${ints.length}):`);
  for (const i of ints) console.log(`  ${i.created_at.toISOString()} | ${i.type} | ${i.content || ''}`);

  const { rows: resos } = await sql`SELECT version, draft_type, status, LENGTH(content_markdown) AS clen FROM resolutions WHERE session_id = ${id} ORDER BY version`;
  console.log(`Resolutions (${resos.length}):`);
  for (const r of resos) console.log(`  v${r.version} ${r.draft_type} ${r.status} len=${r.clen}`);
}
