'use client';

import type { SessionConfig } from '@/lib/supabase/types';

interface Props {
  config: SessionConfig;
  onChange: (config: SessionConfig) => void;
}

export function SessionSettings({ config, onChange }: Props) {
  function update(updates: Partial<SessionConfig>) {
    onChange({ ...config, ...updates });
  }

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-medium text-gray-700">Session Settings</h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Analysis Mode */}
        <div>
          <label className="block text-sm text-gray-600 mb-1">Analysis Mode</label>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                checked={config.analysis_mode === 'blind'}
                onChange={() => update({ analysis_mode: 'blind' })}
              />
              Blind
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                checked={config.analysis_mode === 'open'}
                onChange={() => update({ analysis_mode: 'open' })}
              />
              Open
            </label>
          </div>
        </div>

        {/* Turn Order */}
        <div>
          <label className="block text-sm text-gray-600 mb-1">Turn Order</label>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                checked={config.turn_order === 'simultaneous'}
                onChange={() => update({ turn_order: 'simultaneous' })}
              />
              Simultaneous
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                checked={config.turn_order === 'sequential'}
                onChange={() => update({ turn_order: 'sequential' })}
              />
              Sequential
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                checked={config.turn_order === 'hybrid'}
                onChange={() => update({ turn_order: 'hybrid' })}
              />
              Hybrid
            </label>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            {config.turn_order === 'hybrid' && 'Round 1 simultaneous, then sequential turns'}
            {config.turn_order === 'simultaneous' && 'All models respond at once each round'}
            {config.turn_order === 'sequential' && 'Models take turns, each sees previous speakers'}
          </p>
        </div>

        {/* Suggested Rounds */}
        <div>
          <label className="block text-sm text-gray-600 mb-1">Discussion Rounds</label>
          <input
            type="number"
            min={1}
            max={10}
            value={config.suggested_rounds}
            onChange={(e) => update({ suggested_rounds: parseInt(e.target.value) || 3 })}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </div>

        {/* Hard Round Cap */}
        <div>
          <label className="block text-sm text-gray-600 mb-1">Hard Round Cap</label>
          <input
            type="number"
            min={1}
            max={20}
            value={config.hard_round_cap}
            onChange={(e) => update({ hard_round_cap: parseInt(e.target.value) || 10 })}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </div>

        {/* Approval Threshold */}
        <div>
          <label className="block text-sm text-gray-600 mb-1">Approval Threshold</label>
          <select
            value={config.approval_threshold}
            onChange={(e) => update({ approval_threshold: e.target.value as SessionConfig['approval_threshold'] })}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="simple_majority">Simple Majority</option>
            <option value="supermajority">Supermajority (2/3)</option>
            <option value="unanimous">Unanimous</option>
          </select>
        </div>

        {/* Max Draft Iterations */}
        <div>
          <label className="block text-sm text-gray-600 mb-1">Max Draft Iterations</label>
          <input
            type="number"
            min={1}
            max={5}
            value={config.max_draft_iterations}
            onChange={(e) => update({ max_draft_iterations: parseInt(e.target.value) || 3 })}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </div>

        {/* Cost Cap */}
        <div>
          <label className="block text-sm text-gray-600 mb-1">Cost Cap ($)</label>
          <input
            type="number"
            min={1}
            step={1}
            value={config.cost_cap_cents / 100}
            onChange={(e) => update({ cost_cap_cents: Math.round(parseFloat(e.target.value) * 100) || 2000 })}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </div>

        {/* User Role */}
        <div>
          <label className="block text-sm text-gray-600 mb-1">User Role</label>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                checked={config.user_role === 'observer'}
                onChange={() => update({ user_role: 'observer' })}
              />
              Observer
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                checked={config.user_role === 'participant'}
                onChange={() => update({ user_role: 'participant' })}
              />
              Participant
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
