-- 002_engine_lifecycle.sql
--
-- Engine health tracking. Distinguishes "what phase is this session in"
-- (sessions.status) from "is the engine actually running, paused, or idle"
-- (sessions.engine_status). Required for safe parallel runs:
--   - heartbeat lets us detect stalled engines
--   - engine_status=paused preserves work after a transient failure
--   - engine_started_at + heartbeat give us a stale-lock takeover

ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS engine_status text NOT NULL DEFAULT 'idle',
  ADD COLUMN IF NOT EXISTS engine_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS engine_heartbeat_at timestamptz,
  ADD COLUMN IF NOT EXISTS engine_error text;

CREATE INDEX IF NOT EXISTS idx_sessions_engine_status
  ON sessions(engine_status);

-- Backfill: existing terminal sessions are 'idle'; any session left in a
-- non-terminal status without engine info is also idle (no live engine).
UPDATE sessions
   SET engine_status = 'idle'
 WHERE engine_status IS NULL;
