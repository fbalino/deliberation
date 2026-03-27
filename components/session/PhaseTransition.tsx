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
      {/* Spinner */}
      <div className="relative w-8 h-8">
        <div className="absolute inset-0 rounded-full border-2 border-gray-200" />
        <div className="absolute inset-0 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
      </div>
      <div>
        <p className="text-sm font-medium text-gray-700">{message}</p>
        <p className="text-xs text-gray-400 mt-0.5">This may take a moment</p>
      </div>
    </div>
  );
}
