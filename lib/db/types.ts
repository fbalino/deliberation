// ---- Enums ----

export type SessionStatus =
  | 'configuring'
  | 'briefing'
  | 'analyzing'
  | 'discussing'
  | 'drafter_election'
  | 'drafting'
  | 'voting'
  | 'completed'
  | 'abandoned';

export type Phase =
  | 'analysis'
  | 'discussion'
  | 'drafter_election'
  | 'drafting'
  | 'voting';

export type InterventionType =
  | 'pause'
  | 'resume'
  | 'nudge'
  | 'inject'
  | 'force_advance'
  | 'force_approve';

export type VoteVerdict = 'approve' | 'approve_with_amendments' | 'reject';

export type ResolutionStatus = 'draft' | 'approved' | 'rejected';

export type DraftType = 'elected' | 'assigned';

export type ApprovalThreshold =
  | 'simple_majority'
  | 'supermajority'
  | 'unanimous'
  | 'custom';

export type AnalysisMode = 'blind' | 'open';

export type TurnOrder = 'simultaneous' | 'sequential' | 'hybrid';

export type UserRole = 'observer' | 'participant';

export type DisagreementHandling = 'iterate' | 'minority_report' | 'both';

// ---- Session Configuration (stored as JSONB in sessions.config) ----

export interface SessionConfig {
  analysis_mode: AnalysisMode;
  turn_order: TurnOrder;
  suggested_rounds: number;
  hard_round_cap: number;
  pre_assigned_drafter_id: string | null;
  approval_threshold: ApprovalThreshold;
  custom_threshold_ratio?: { required: number; total: number };
  disagreement_handling: DisagreementHandling;
  max_draft_iterations: number;
  user_role: UserRole;
  cost_cap_cents: number;
}

// ---- Token / Cost ----

export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  thinking_tokens: number;
  cached_tokens: number;
  cost_cents: number;
}

export interface VoteData {
  verdict: VoteVerdict;
  amendments: string | null;
  reasoning: string;
}

// ---- Database Row Types ----

export interface DbSession {
  id: string;
  title: string | null;
  status: SessionStatus;
  config: SessionConfig;
  briefing_text: string | null;
  briefing_urls: string[] | null;
  chain_parent_id: string | null;
  tags: string[] | null;
  total_cost_cents: number;
  created_at: string;
  updated_at: string;
}

export interface DbPanelist {
  id: string;
  session_id: string;
  display_name: string;
  model_id: string;
  system_prompt: string | null;
  avatar_color: string | null;
  is_human: boolean;
  sort_order: number;
  created_at: string;
}

export interface DbRound {
  id: string;
  session_id: string;
  phase: Phase;
  round_number: number;
  created_at: string;
}

export interface DbContribution {
  id: string;
  round_id: string;
  panelist_id: string;
  content: string;
  thinking_content: string | null;
  token_usage: TokenUsage | null;
  cost_cents: number | null;
  vote_data: VoteData | null;
  drafter_vote: string | null;
  meta: Record<string, unknown> | null;
  created_at: string;
}

export interface DbIntervention {
  id: string;
  session_id: string;
  type: InterventionType;
  content: string | null;
  applied_before_round: number | null;
  created_at: string;
}

export interface DbResolution {
  id: string;
  session_id: string;
  version: number;
  drafter_panelist_id: string | null;
  draft_type: DraftType;
  content_markdown: string;
  pdf_storage_path: string | null;
  status: ResolutionStatus;
  created_at: string;
}

export interface DbCostLog {
  id: string;
  session_id: string;
  panelist_id: string | null;
  phase: Phase;
  round_number: number | null;
  model_id: string;
  input_tokens: number | null;
  output_tokens: number | null;
  thinking_tokens: number | null;
  cached_tokens: number | null;
  cost_cents: number | null;
  created_at: string;
}

export interface DbPreset {
  id: string;
  name: string;
  config: SessionConfig;
  created_at: string;
}

export interface DbSessionFile {
  id: string;
  session_id: string;
  file_name: string;
  file_type: string;
  storage_path: string | null;
  extracted_text: string | null;
  created_at: string;
}

// ---- SSE Event Types ----

export type SSEEvent =
  | { type: 'phase_change'; phase: SessionStatus }
  | { type: 'round_start'; round: number; phase: Phase }
  | { type: 'contribution_start'; panelistId: string; panelistName: string }
  | { type: 'contribution_chunk'; panelistId: string; text: string; isThinking: boolean }
  | { type: 'contribution_end'; panelistId: string; tokenUsage: TokenUsage }
  | { type: 'extension_request'; panelistId: string; reason: string }
  | { type: 'consensus_signal'; panelistId: string }
  | { type: 'vote_result'; panelistId: string; verdict: VoteVerdict; reasoning: string }
  | { type: 'intervention_prompt'; message: string }
  | { type: 'drafter_elected'; panelistId: string; panelistName: string }
  | { type: 'cost_update'; totalCostCents: number }
  | { type: 'session_complete'; resolutionId: string }
  | { type: 'error'; message: string; fatal: boolean };

// ---- API Request/Response Types ----

export interface PanelistConfig {
  display_name: string;
  model_id: string;
  system_prompt: string;
  avatar_color: string;
  is_human: boolean;
  sort_order: number;
}

export interface CreateSessionRequest {
  title: string;
  briefing_text: string;
  briefing_urls?: string[];
  panelists: PanelistConfig[];
  config: SessionConfig;
  tags?: string[];
}

export interface CreateSessionResponse {
  id: string;
}

export interface LaunchSessionResponse {
  status: 'started' | 'error';
  message?: string;
}

export interface InterventionRequest {
  type: InterventionType;
  content?: string;
}

export interface SessionDetail extends DbSession {
  panelists: DbPanelist[];
  rounds: (DbRound & { contributions: DbContribution[] })[];
  interventions: DbIntervention[];
  resolutions: DbResolution[];
}

// ---- Default Config ----

export const DEFAULT_SESSION_CONFIG: SessionConfig = {
  analysis_mode: 'blind',
  turn_order: 'simultaneous',
  suggested_rounds: 3,
  hard_round_cap: 10,
  pre_assigned_drafter_id: null,
  approval_threshold: 'simple_majority',
  disagreement_handling: 'both',
  max_draft_iterations: 3,
  user_role: 'observer',
  cost_cap_cents: 2000,
};
