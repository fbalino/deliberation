import { sql } from '@vercel/postgres';

const ids = ['82de3f1c', '9fc479ab', 'f7bf0a1f'];

console.log('=== Looking for failure markers in contribution content ===');
const { rows: badRows } = await sql`
  SELECT s.id::text AS sid, p.display_name, r.phase, r.round_number,
         LEFT(c.content, 300) AS preview, c.created_at
  FROM contributions c
  JOIN rounds r ON c.round_id = r.id
  JOIN sessions s ON r.session_id = s.id
  JOIN panelists p ON c.panelist_id = p.id
  WHERE s.created_at >= NOW() - INTERVAL '4 days'
    AND (c.content ILIKE '%unavailable%' OR c.content ILIKE '%error%' OR c.content ILIKE '%429%' OR c.content ILIKE '%529%' OR c.content ILIKE '%rate limit%' OR c.content ILIKE '%timeout%' OR LENGTH(c.content) < 200)
  ORDER BY c.created_at`;
for (const r of badRows) {
  console.log(`${r.created_at.toISOString()} | ${r.sid.slice(0,8)} | r${r.round_number} ${r.phase} | ${r.display_name}`);
  console.log(`  ${r.preview.replace(/\n/g, ' ')}`);
}

console.log('\n=== Session_files attached ===');
for (const short of ids) {
  const { rows: srows } = await sql`SELECT id FROM sessions WHERE id::text LIKE ${short + '%'}`;
  if (!srows[0]) continue;
  const { rows: files } = await sql`SELECT file_name, file_type, LENGTH(extracted_text) AS textlen FROM session_files WHERE session_id = ${srows[0].id}`;
  console.log(`${short}: ${files.length} files`);
  for (const f of files) console.log(`  ${f.file_name} | ${f.file_type} | text=${f.textlen}`);
}

console.log('\n=== Briefing length and config detail ===');
for (const short of ids) {
  const { rows } = await sql`SELECT id, status, total_cost_cents, LENGTH(briefing_text) AS blen, config FROM sessions WHERE id::text LIKE ${short + '%'}`;
  if (!rows[0]) continue;
  const r = rows[0];
  console.log(`${short}: status=${r.status} cost_cents=${r.total_cost_cents} briefing_len=${r.blen}`);
  console.log(`  config:`, JSON.stringify(r.config));
}

console.log('\n=== Cost log per phase (look for stalls / repeats) ===');
for (const short of ids) {
  const { rows: srows } = await sql`SELECT id FROM sessions WHERE id::text LIKE ${short + '%'}`;
  if (!srows[0]) continue;
  const { rows: cl } = await sql`
    SELECT created_at, phase, round_number, model_id, input_tokens, output_tokens, cost_cents
    FROM cost_log WHERE session_id = ${srows[0].id} ORDER BY created_at`;
  console.log(`-- ${short} (${cl.length} log rows) --`);
  for (const r of cl) {
    console.log(`  ${r.created_at.toISOString()} | r${r.round_number} ${r.phase.padEnd(18)} | ${r.model_id.padEnd(24)} | in=${String(r.input_tokens).padStart(6)} out=${String(r.output_tokens).padStart(5)} | $${(r.cost_cents/100).toFixed(3)}`);
  }
}

console.log('\n=== Cross-check timing: any overlapping time windows across the three sessions? ===');
const merged = await sql`
  SELECT s.id::text AS sid, c.created_at, p.display_name, r.phase, r.round_number, c.cost_cents
  FROM contributions c
  JOIN rounds r ON c.round_id = r.id
  JOIN sessions s ON r.session_id = s.id
  JOIN panelists p ON c.panelist_id = p.id
  WHERE s.id::text LIKE ANY(${[ids[0]+'%', ids[1]+'%', ids[2]+'%']})
  ORDER BY c.created_at`;
for (const r of merged.rows) {
  console.log(`${r.created_at.toISOString()} | ${r.sid.slice(0,8)} | r${r.round_number} ${r.phase.padEnd(18)} | ${r.display_name.padEnd(15)} | $${(r.cost_cents/100).toFixed(3)}`);
}
