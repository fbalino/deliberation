'use client';

const TRANSITION_MESSAGES: Record<string, string> = {
  analyzing: 'Models are independently analyzing the briefing...',
  discussing: 'Models are deliberating — round in progress...',
  drafter_election: 'Models are voting on who should draft the resolution...',
  drafting: 'Elected drafter is synthesizing the discussion into a resolution...',
  voting: 'Models are reviewing and voting on the draft...',
};

interface Props {
  phase: string;
  isTransitioning: boolean;
}

export function PhaseTransition({ phase, isTransitioning }: Props) {
  if (!isTransitioning) return null;

  const message = TRANSITION_MESSAGES[phase] || 'Processing...';

  return (
    <div className="flex items-center justify-center gap-3 py-6">
      <div className="relative w-8 h-8">
        <div className="absolute inset-0 rounded-full border-2" style={{ borderColor: 'var(--border)' }} />
        <div className="absolute inset-0 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
      </div>
      <div>
        <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>{message}</p>
        <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>This may take a moment</p>
      </div>
    </div>
  );
}
