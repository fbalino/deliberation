'use client';

import type { SessionConfig, PanelistConfig as PanelistConfigType } from '@/lib/supabase/types';

interface Props {
  config: SessionConfig;
  onChange: (config: SessionConfig) => void;
  panelists?: PanelistConfigType[];
}

const inputStyle: React.CSSProperties = {
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--border)',
  background: 'var(--surface)',
  color: 'var(--text)',
};

export function SessionSettings({ config, onChange, panelists }: Props) {
  function update(updates: Partial<SessionConfig>) {
    onChange({ ...config, ...updates });
  }

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Session Settings</h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Analysis Mode */}
        <div>
          <label className="block text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>Analysis Mode</label>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--text)' }}>
              <input
                type="radio"
                checked={config.analysis_mode === 'blind'}
                onChange={() => update({ analysis_mode: 'blind' })}
                style={{ accentColor: 'var(--accent)' }}
              />
              Blind
            </label>
            <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--text)' }}>
              <input
                type="radio"
                checked={config.analysis_mode === 'open'}
                onChange={() => update({ analysis_mode: 'open' })}
                style={{ accentColor: 'var(--accent)' }}
              />
              Open
            </label>
          </div>
        </div>

        {/* Turn Order */}
        <div>
          <label className="block text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>Turn Order</label>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--text)' }}>
              <input
                type="radio"
                checked={config.turn_order === 'simultaneous'}
                onChange={() => update({ turn_order: 'simultaneous' })}
                style={{ accentColor: 'var(--accent)' }}
              />
              Simultaneous
            </label>
            <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--text)' }}>
              <input
                type="radio"
                checked={config.turn_order === 'sequential'}
                onChange={() => update({ turn_order: 'sequential' })}
                style={{ accentColor: 'var(--accent)' }}
              />
              Sequential
            </label>
            <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--text)' }}>
              <input
                type="radio"
                checked={config.turn_order === 'hybrid'}
                onChange={() => update({ turn_order: 'hybrid' })}
                style={{ accentColor: 'var(--accent)' }}
              />
              Hybrid
            </label>
          </div>
          <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
            {config.turn_order === 'hybrid' && 'Round 1 simultaneous, then sequential turns'}
            {config.turn_order === 'simultaneous' && 'All models respond at once each round'}
            {config.turn_order === 'sequential' && 'Models take turns, each sees previous speakers'}
          </p>
        </div>

        {/* Suggested Rounds */}
        <div>
          <label className="block text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>Discussion Rounds</label>
          <input
            type="number"
            min={1}
            max={10}
            value={config.suggested_rounds}
            onChange={(e) => update({ suggested_rounds: parseInt(e.target.value) || 3 })}
            className="w-full px-3 py-2 text-sm"
            style={inputStyle}
          />
        </div>

        {/* Hard Round Cap */}
        <div>
          <label className="block text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>Hard Round Cap</label>
          <input
            type="number"
            min={1}
            max={20}
            value={config.hard_round_cap}
            onChange={(e) => update({ hard_round_cap: parseInt(e.target.value) || 10 })}
            className="w-full px-3 py-2 text-sm"
            style={inputStyle}
          />
        </div>

        {/* Approval Threshold */}
        <div>
          <label className="block text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>Approval Threshold</label>
          <select
            value={config.approval_threshold}
            onChange={(e) => update({ approval_threshold: e.target.value as SessionConfig['approval_threshold'] })}
            className="w-full px-3 py-2 text-sm"
            style={inputStyle}
          >
            <option value="simple_majority">Simple Majority</option>
            <option value="supermajority">Supermajority (2/3)</option>
            <option value="unanimous">Unanimous</option>
            <option value="custom">Custom</option>
          </select>
          {config.approval_threshold === 'custom' && (
            <div className="flex items-center gap-2 mt-2">
              <input
                type="number"
                min={1}
                max={20}
                value={config.custom_threshold_ratio?.required || 2}
                onChange={(e) => update({ custom_threshold_ratio: { required: parseInt(e.target.value) || 2, total: config.custom_threshold_ratio?.total || 3 } })}
                className="w-16 px-2 py-1 text-sm text-center"
                style={inputStyle}
              />
              <span className="text-sm" style={{ color: 'var(--text-tertiary)' }}>of</span>
              <input
                type="number"
                min={1}
                max={20}
                value={config.custom_threshold_ratio?.total || 3}
                onChange={(e) => update({ custom_threshold_ratio: { required: config.custom_threshold_ratio?.required || 2, total: parseInt(e.target.value) || 3 } })}
                className="w-16 px-2 py-1 text-sm text-center"
                style={inputStyle}
              />
              <span className="text-sm" style={{ color: 'var(--text-tertiary)' }}>must approve</span>
            </div>
          )}
        </div>

        {/* Disagreement Handling */}
        <div>
          <label className="block text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>Disagreement Handling</label>
          <select
            value={config.disagreement_handling}
            onChange={(e) => update({ disagreement_handling: e.target.value as SessionConfig['disagreement_handling'] })}
            className="w-full px-3 py-2 text-sm"
            style={inputStyle}
          >
            <option value="iterate">Iterate (re-draft until approved)</option>
            <option value="minority_report">Minority Report (force-approve with dissents)</option>
            <option value="both">Both (iterate, then minority report)</option>
          </select>
        </div>

        {/* Pre-assigned Drafter */}
        {panelists && panelists.length > 0 && (
          <div>
            <label className="block text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>Pre-assigned Drafter</label>
            <select
              value={config.pre_assigned_drafter_id ?? ''}
              onChange={(e) => update({ pre_assigned_drafter_id: e.target.value || null })}
              className="w-full px-3 py-2 text-sm"
              style={inputStyle}
            >
              <option value="">None (elect by vote)</option>
              {panelists.filter((p) => !p.is_human).map((p, i) => (
                <option key={i} value={String(p.sort_order)}>{p.display_name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Max Draft Iterations */}
        <div>
          <label className="block text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>Max Draft Iterations</label>
          <input
            type="number"
            min={1}
            max={5}
            value={config.max_draft_iterations}
            onChange={(e) => update({ max_draft_iterations: parseInt(e.target.value) || 3 })}
            className="w-full px-3 py-2 text-sm"
            style={inputStyle}
          />
        </div>

        {/* Cost Cap */}
        <div>
          <label className="block text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>Cost Cap ($)</label>
          <input
            type="number"
            min={1}
            step={1}
            value={config.cost_cap_cents / 100}
            onChange={(e) => update({ cost_cap_cents: Math.round(parseFloat(e.target.value) * 100) || 2000 })}
            className="w-full px-3 py-2 text-sm"
            style={inputStyle}
          />
        </div>

        {/* User Role */}
        <div>
          <label className="block text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>User Role</label>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--text)' }}>
              <input
                type="radio"
                checked={config.user_role === 'observer'}
                onChange={() => update({ user_role: 'observer' })}
                style={{ accentColor: 'var(--accent)' }}
              />
              Observer
            </label>
            <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--text)' }}>
              <input
                type="radio"
                checked={config.user_role === 'participant'}
                onChange={() => update({ user_role: 'participant' })}
                style={{ accentColor: 'var(--accent)' }}
              />
              Participant
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
