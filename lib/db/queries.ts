import { sql, type TxClient } from './client';
import type {
  DbSession, DbPanelist, DbRound, DbContribution, DbIntervention,
  DbResolution, DbPreset, SessionConfig, SessionStatus, Phase,
  TokenUsage, VoteData, DraftType,
} from './types';

type Queryable = typeof sql | TxClient;

// @vercel/postgres sql tagged templates only accept Primitive types.
// Arrays must be cast to satisfy the type checker — Postgres handles them fine at runtime.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const arr = (a: unknown[]) => a as any;

// Helper to run queries on either the pool or a transaction client
function q(client: Queryable) {
  return client === sql ? sql : (client as TxClient).sql.bind(client);
}

// ============================================================
// Sessions
// ============================================================

export async function getSession(id: string, client: Queryable = sql): Promise<DbSession | null> {
  const { rows } = await q(client)`SELECT * FROM sessions WHERE id = ${id}`;
  return (rows[0] as DbSession) ?? null;
}

export async function getSessionField<K extends keyof DbSession>(
  id: string, field: K, client: Queryable = sql
): Promise<DbSession[K] | null> {
  const { rows } = await q(client)`SELECT * FROM sessions WHERE id = ${id}`;
  return rows[0] ? (rows[0] as DbSession)[field] : null;
}

export async function listSessions(
  filters?: { status?: string; search?: string },
  client: Queryable = sql
): Promise<(DbSession & { panelist_count: number })[]> {
  const run = q(client);
  if (filters?.status && filters.status !== 'all' && filters?.search) {
    const pattern = `%${filters.search}%`;
    const { rows } = await run`
      SELECT s.*, COUNT(p.id)::int AS panelist_count
      FROM sessions s
      LEFT JOIN panelists p ON p.session_id = s.id
      WHERE s.status = ${filters.status}
        AND (s.title ILIKE ${pattern} OR s.briefing_text ILIKE ${pattern})
      GROUP BY s.id
      ORDER BY s.created_at DESC`;
    return rows as (DbSession & { panelist_count: number })[];
  }
  if (filters?.status && filters.status !== 'all') {
    const { rows } = await run`
      SELECT s.*, COUNT(p.id)::int AS panelist_count
      FROM sessions s
      LEFT JOIN panelists p ON p.session_id = s.id
      WHERE s.status = ${filters.status}
      GROUP BY s.id
      ORDER BY s.created_at DESC`;
    return rows as (DbSession & { panelist_count: number })[];
  }
  if (filters?.search) {
    const pattern = `%${filters.search}%`;
    const { rows } = await run`
      SELECT s.*, COUNT(p.id)::int AS panelist_count
      FROM sessions s
      LEFT JOIN panelists p ON p.session_id = s.id
      WHERE s.title ILIKE ${pattern} OR s.briefing_text ILIKE ${pattern}
      GROUP BY s.id
      ORDER BY s.created_at DESC`;
    return rows as (DbSession & { panelist_count: number })[];
  }
  const { rows } = await run`
    SELECT s.*, COUNT(p.id)::int AS panelist_count
    FROM sessions s
    LEFT JOIN panelists p ON p.session_id = s.id
    GROUP BY s.id
    ORDER BY s.created_at DESC`;
  return rows as (DbSession & { panelist_count: number })[];
}

export async function createSession(
  data: {
    title: string;
    status?: SessionStatus;
    config: SessionConfig;
    briefing_text: string;
    briefing_urls?: string[];
    tags?: string[];
    chain_parent_id?: string | null;
  },
  client: Queryable = sql
): Promise<DbSession> {
  const { rows } = await q(client)`
    INSERT INTO sessions (title, status, config, briefing_text, briefing_urls, tags, chain_parent_id)
    VALUES (
      ${data.title},
      ${data.status ?? 'configuring'},
      ${JSON.stringify(data.config)},
      ${data.briefing_text},
      ${arr(data.briefing_urls ?? [])},
      ${arr(data.tags ?? [])},
      ${data.chain_parent_id ?? null}
    )
    RETURNING *`;
  return rows[0] as DbSession;
}

export async function updateSessionStatus(
  id: string, status: SessionStatus, client: Queryable = sql
): Promise<void> {
  await q(client)`UPDATE sessions SET status = ${status} WHERE id = ${id}`;
}

export async function updateSessionConfig(
  id: string, config: Record<string, unknown>, client: Queryable = sql
): Promise<void> {
  await q(client)`UPDATE sessions SET config = ${JSON.stringify(config)} WHERE id = ${id}`;
}

export async function updateSessionBriefing(
  id: string, briefingText: string, client: Queryable = sql
): Promise<void> {
  await q(client)`UPDATE sessions SET briefing_text = ${briefingText} WHERE id = ${id}`;
}

export async function deleteSession(id: string, client: Queryable = sql): Promise<void> {
  await q(client)`DELETE FROM sessions WHERE id = ${id}`;
}

// ============================================================
// Panelists
// ============================================================

export async function listPanelists(
  sessionId: string, client: Queryable = sql
): Promise<DbPanelist[]> {
  const { rows } = await q(client)`
    SELECT * FROM panelists
    WHERE session_id = ${sessionId}
    ORDER BY sort_order`;
  return rows as DbPanelist[];
}

export async function insertPanelist(
  data: {
    session_id: string;
    display_name: string;
    model_id: string;
    system_prompt?: string | null;
    avatar_color?: string | null;
    is_human?: boolean;
    sort_order: number;
  },
  client: Queryable = sql
): Promise<DbPanelist> {
  const { rows } = await q(client)`
    INSERT INTO panelists (session_id, display_name, model_id, system_prompt, avatar_color, is_human, sort_order)
    VALUES (
      ${data.session_id}, ${data.display_name}, ${data.model_id},
      ${data.system_prompt ?? null}, ${data.avatar_color ?? null},
      ${data.is_human ?? false}, ${data.sort_order}
    )
    RETURNING *`;
  return rows[0] as DbPanelist;
}

export async function findHumanPanelist(
  sessionId: string, client: Queryable = sql
): Promise<DbPanelist | null> {
  const { rows } = await q(client)`
    SELECT * FROM panelists
    WHERE session_id = ${sessionId} AND is_human = true
    LIMIT 1`;
  return (rows[0] as DbPanelist) ?? null;
}

export async function getPanelistBySortOrder(
  sessionId: string, sortOrder: number, client: Queryable = sql
): Promise<DbPanelist | null> {
  const { rows } = await q(client)`
    SELECT * FROM panelists
    WHERE session_id = ${sessionId} AND sort_order = ${sortOrder}
    LIMIT 1`;
  return (rows[0] as DbPanelist) ?? null;
}

// ============================================================
// Rounds
// ============================================================

export async function insertRound(
  sessionId: string, phase: Phase, roundNumber: number, client: Queryable = sql
): Promise<DbRound> {
  const { rows } = await q(client)`
    INSERT INTO rounds (session_id, phase, round_number)
    VALUES (${sessionId}, ${phase}, ${roundNumber})
    RETURNING *`;
  return rows[0] as DbRound;
}

export async function listRounds(
  sessionId: string, phases?: Phase[], client: Queryable = sql
): Promise<DbRound[]> {
  const run = q(client);
  if (phases?.length) {
    const { rows } = await run`
      SELECT * FROM rounds
      WHERE session_id = ${sessionId} AND phase = ANY(${arr(phases)})
      ORDER BY round_number`;
    return rows as DbRound[];
  }
  const { rows } = await run`
    SELECT * FROM rounds
    WHERE session_id = ${sessionId}
    ORDER BY round_number`;
  return rows as DbRound[];
}

export async function getLatestRound(
  sessionId: string, phase: Phase, client: Queryable = sql
): Promise<DbRound | null> {
  const { rows } = await q(client)`
    SELECT * FROM rounds
    WHERE session_id = ${sessionId} AND phase = ${phase}
    ORDER BY round_number DESC
    LIMIT 1`;
  return (rows[0] as DbRound) ?? null;
}

// ============================================================
// Contributions
// ============================================================

export async function insertContribution(
  data: {
    round_id: string;
    panelist_id: string;
    content: string;
    thinking_content?: string | null;
    token_usage?: TokenUsage | null;
    cost_cents?: number | null;
    vote_data?: VoteData | null;
    drafter_vote?: string | null;
    meta?: Record<string, unknown> | null;
  },
  client: Queryable = sql
): Promise<DbContribution> {
  const { rows } = await q(client)`
    INSERT INTO contributions (
      round_id, panelist_id, content, thinking_content,
      token_usage, cost_cents, vote_data, drafter_vote, meta
    )
    VALUES (
      ${data.round_id}, ${data.panelist_id}, ${data.content},
      ${data.thinking_content ?? null},
      ${data.token_usage ? JSON.stringify(data.token_usage) : null},
      ${data.cost_cents ?? null},
      ${data.vote_data ? JSON.stringify(data.vote_data) : null},
      ${data.drafter_vote ?? null},
      ${data.meta ? JSON.stringify(data.meta) : null}
    )
    RETURNING *`;
  return rows[0] as DbContribution;
}

export async function listContributionsForRounds(
  roundIds: string[], client: Queryable = sql
): Promise<(DbContribution & { panelist_display_name: string })[]> {
  if (!roundIds.length) return [];
  const { rows } = await q(client)`
    SELECT c.*, p.display_name AS panelist_display_name
    FROM contributions c
    JOIN panelists p ON c.panelist_id = p.id
    WHERE c.round_id = ANY(${arr(roundIds)})
    ORDER BY c.created_at`;
  return rows as (DbContribution & { panelist_display_name: string })[];
}

export async function listContributionsForRound(
  roundId: string, client: Queryable = sql
): Promise<DbContribution[]> {
  const { rows } = await q(client)`
    SELECT * FROM contributions WHERE round_id = ${roundId} ORDER BY created_at`;
  return rows as DbContribution[];
}

export async function listDrafterVotes(
  roundIds: string[], client: Queryable = sql
): Promise<{ drafter_vote: string | null }[]> {
  if (!roundIds.length) return [];
  const { rows } = await q(client)`
    SELECT drafter_vote FROM contributions
    WHERE round_id = ANY(${arr(roundIds)}) AND drafter_vote IS NOT NULL`;
  return rows as { drafter_vote: string | null }[];
}

// ============================================================
// Interventions
// ============================================================

export async function insertIntervention(
  data: { session_id: string; type: string; content?: string | null },
  client: Queryable = sql
): Promise<DbIntervention> {
  const { rows } = await q(client)`
    INSERT INTO interventions (session_id, type, content)
    VALUES (${data.session_id}, ${data.type}, ${data.content ?? null})
    RETURNING *`;
  return rows[0] as DbIntervention;
}

export async function getNewInterventions(
  sessionId: string, since: string, client: Queryable = sql
): Promise<DbIntervention[]> {
  const { rows } = await q(client)`
    SELECT * FROM interventions
    WHERE session_id = ${sessionId} AND created_at > ${since}
    ORDER BY created_at`;
  return rows as DbIntervention[];
}

// ============================================================
// Resolutions
// ============================================================

export async function insertResolution(
  data: {
    session_id: string;
    version: number;
    drafter_panelist_id: string | null;
    draft_type: DraftType;
    content_markdown: string;
    status?: string;
  },
  client: Queryable = sql
): Promise<DbResolution> {
  const { rows } = await q(client)`
    INSERT INTO resolutions (session_id, version, drafter_panelist_id, draft_type, content_markdown, status)
    VALUES (
      ${data.session_id}, ${data.version}, ${data.drafter_panelist_id},
      ${data.draft_type}, ${data.content_markdown}, ${data.status ?? 'draft'}
    )
    RETURNING *`;
  return rows[0] as DbResolution;
}

export async function getResolution(
  id: string, client: Queryable = sql
): Promise<DbResolution | null> {
  const { rows } = await q(client)`SELECT * FROM resolutions WHERE id = ${id}`;
  return (rows[0] as DbResolution) ?? null;
}

export async function getLatestResolution(
  sessionId: string, client: Queryable = sql
): Promise<DbResolution | null> {
  const { rows } = await q(client)`
    SELECT * FROM resolutions
    WHERE session_id = ${sessionId}
    ORDER BY version DESC
    LIMIT 1`;
  return (rows[0] as DbResolution) ?? null;
}

export async function getLatestResolutionWithDrafter(
  sessionId: string, client: Queryable = sql
): Promise<(DbResolution & { drafter_model_id: string | null; drafter_display_name: string | null }) | null> {
  const { rows } = await q(client)`
    SELECT r.*, p.model_id AS drafter_model_id, p.display_name AS drafter_display_name
    FROM resolutions r
    LEFT JOIN panelists p ON r.drafter_panelist_id = p.id
    WHERE r.session_id = ${sessionId}
    ORDER BY r.version DESC
    LIMIT 1`;
  return (rows[0] as (DbResolution & { drafter_model_id: string | null; drafter_display_name: string | null })) ?? null;
}

export async function markResolutionApproved(
  id: string, client: Queryable = sql
): Promise<void> {
  await q(client)`UPDATE resolutions SET status = 'approved' WHERE id = ${id}`;
}

export async function updateResolution(
  id: string,
  data: { content_markdown?: string; status?: string },
  client: Queryable = sql
): Promise<void> {
  if (data.content_markdown !== undefined && data.status !== undefined) {
    await q(client)`
      UPDATE resolutions
      SET content_markdown = ${data.content_markdown}, status = ${data.status}
      WHERE id = ${id}`;
  } else if (data.content_markdown !== undefined) {
    await q(client)`UPDATE resolutions SET content_markdown = ${data.content_markdown} WHERE id = ${id}`;
  } else if (data.status !== undefined) {
    await q(client)`UPDATE resolutions SET status = ${data.status} WHERE id = ${id}`;
  }
}

export async function markResolutionsRejected(
  sessionId: string, statuses: string[], client: Queryable = sql
): Promise<void> {
  await q(client)`
    UPDATE resolutions SET status = 'rejected'
    WHERE session_id = ${sessionId} AND status = ANY(${arr(statuses)})`;
}

export async function getApprovedResolution(
  sessionId: string, client: Queryable = sql
): Promise<DbResolution | null> {
  const { rows } = await q(client)`
    SELECT * FROM resolutions
    WHERE session_id = ${sessionId} AND status = 'approved'
    LIMIT 1`;
  return (rows[0] as DbResolution) ?? null;
}

export async function getLatestDraftResolution(
  sessionId: string, client: Queryable = sql
): Promise<DbResolution | null> {
  const { rows } = await q(client)`
    SELECT * FROM resolutions
    WHERE session_id = ${sessionId} AND status = 'draft'
    ORDER BY version DESC
    LIMIT 1`;
  return (rows[0] as DbResolution) ?? null;
}

// ============================================================
// Cost Log
// ============================================================

export async function insertCostLog(
  data: {
    session_id: string;
    panelist_id: string;
    phase: Phase;
    round_number: number;
    model_id: string;
    input_tokens: number;
    output_tokens: number;
    thinking_tokens: number;
    cached_tokens: number;
    cost_cents: number;
  },
  client: Queryable = sql
): Promise<void> {
  await q(client)`
    INSERT INTO cost_log (
      session_id, panelist_id, phase, round_number, model_id,
      input_tokens, output_tokens, thinking_tokens, cached_tokens, cost_cents
    )
    VALUES (
      ${data.session_id}, ${data.panelist_id}, ${data.phase}, ${data.round_number},
      ${data.model_id}, ${data.input_tokens}, ${data.output_tokens},
      ${data.thinking_tokens}, ${data.cached_tokens}, ${data.cost_cents}
    )`;
}

/** Atomic increment — no read-then-write race condition */
export async function incrementSessionCost(
  sessionId: string, cents: number, client: Queryable = sql
): Promise<void> {
  await q(client)`
    UPDATE sessions
    SET total_cost_cents = total_cost_cents + ${cents}
    WHERE id = ${sessionId}`;
}

export async function getSessionCost(
  sessionId: string, client: Queryable = sql
): Promise<number> {
  const { rows } = await q(client)`
    SELECT total_cost_cents FROM sessions WHERE id = ${sessionId}`;
  return rows[0]?.total_cost_cents ?? 0;
}

export async function listCostLogs(client: Queryable = sql) {
  const { rows } = await q(client)`
    SELECT model_id, phase, cost_cents, session_id FROM cost_log`;
  return rows as { model_id: string; phase: string; cost_cents: number | null; session_id: string }[];
}

// ============================================================
// Presets
// ============================================================

export async function listPresets(client: Queryable = sql): Promise<DbPreset[]> {
  const { rows } = await q(client)`SELECT * FROM presets ORDER BY created_at DESC`;
  return rows as DbPreset[];
}

export async function insertPreset(
  name: string, config: unknown, client: Queryable = sql
): Promise<DbPreset> {
  const { rows } = await q(client)`
    INSERT INTO presets (name, config) VALUES (${name}, ${JSON.stringify(config)})
    RETURNING *`;
  return rows[0] as DbPreset;
}

// ============================================================
// Session Files
// ============================================================

export async function insertSessionFile(
  data: {
    session_id: string;
    file_name: string;
    file_type: string;
    storage_path?: string | null;
    extracted_text?: string | null;
  },
  client: Queryable = sql
): Promise<void> {
  await q(client)`
    INSERT INTO session_files (session_id, file_name, file_type, storage_path, extracted_text)
    VALUES (
      ${data.session_id}, ${data.file_name}, ${data.file_type},
      ${data.storage_path ?? null}, ${data.extracted_text ?? null}
    )`;
}

// ============================================================
// Composite queries (for session detail / historical replay)
// ============================================================

export async function getSessionDetail(sessionId: string, client: Queryable = sql) {
  const run = q(client);

  const [sessionRes, panelistsRes, roundsRes, interventionsRes, resolutionsRes] =
    await Promise.all([
      run`SELECT * FROM sessions WHERE id = ${sessionId}`,
      run`SELECT * FROM panelists WHERE session_id = ${sessionId} ORDER BY sort_order`,
      run`SELECT * FROM rounds WHERE session_id = ${sessionId} ORDER BY round_number`,
      run`SELECT * FROM interventions WHERE session_id = ${sessionId} ORDER BY created_at`,
      run`SELECT * FROM resolutions WHERE session_id = ${sessionId} ORDER BY version`,
    ]);

  const session = sessionRes.rows[0] as DbSession | undefined;
  if (!session) return null;

  const rounds = roundsRes.rows as DbRound[];
  const roundIds = rounds.map((r) => r.id);

  let contributions: DbContribution[] = [];
  if (roundIds.length) {
    const contribRes = await run`
      SELECT * FROM contributions WHERE round_id = ANY(${arr(roundIds)}) ORDER BY created_at`;
    contributions = contribRes.rows as DbContribution[];
  }

  // Group contributions by round_id
  const contribsByRound = new Map<string, DbContribution[]>();
  for (const c of contributions) {
    const arr = contribsByRound.get(c.round_id) || [];
    arr.push(c);
    contribsByRound.set(c.round_id, arr);
  }

  return {
    ...session,
    panelists: panelistsRes.rows as DbPanelist[],
    rounds: rounds.map((r) => ({ ...r, contributions: contribsByRound.get(r.id) || [] })),
    interventions: interventionsRes.rows as DbIntervention[],
    resolutions: resolutionsRes.rows as DbResolution[],
  };
}
