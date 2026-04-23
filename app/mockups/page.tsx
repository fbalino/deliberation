'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';

type ConceptKey = 'command' | 'builder' | 'live';
type ThemeMode = 'system' | 'light' | 'dark';

const concepts: Array<{ key: ConceptKey; label: string; plainLabel: string; note: string }> = [
  {
    key: 'command',
    label: 'A',
    plainLabel: 'Command Center',
    note: 'A calmer home page that shows what needs attention first.',
  },
  {
    key: 'builder',
    label: 'B',
    plainLabel: 'Guided Builder',
    note: 'A step-by-step creation flow for non-technical users.',
  },
  {
    key: 'live',
    label: 'C',
    plainLabel: 'Live Room',
    note: 'A monitoring layout that separates status, discussion, votes, and output.',
  },
];

const statusItems = [
  { label: 'Active', value: '3', color: 'var(--info)' },
  { label: 'Needs review', value: '2', color: 'var(--warning)' },
  { label: 'Completed', value: '18', color: 'var(--success)' },
  { label: '30 day spend', value: '$42.80', color: 'var(--accent)' },
];

const sessions = [
  {
    title: 'Vendor contract renewal',
    status: 'Voting',
    action: 'Review amendments',
    cost: '$4.62',
    phase: 78,
    tags: ['legal', 'ops'],
  },
  {
    title: 'Q3 investment strategy',
    status: 'Discussion',
    action: 'Watch live debate',
    cost: '$7.18',
    phase: 52,
    tags: ['finance', 'strategy'],
  },
  {
    title: 'Support policy refresh',
    status: 'Complete',
    action: 'Download resolution',
    cost: '$2.41',
    phase: 100,
    tags: ['support'],
  },
];

const panelists = [
  { name: 'Claude Opus', model: 'claude-opus-4-7', color: '#6366f1', stance: 'Careful review' },
  { name: 'GPT-5.4', model: 'gpt-5.4', color: '#ec4899', stance: 'Structured plan' },
  { name: 'Gemini Pro', model: 'gemini-3.1-pro-preview', color: '#14b8a6', stance: 'Cross-check' },
];

const liveEntries = [
  {
    title: 'Claude Opus',
    color: '#6366f1',
    body: 'The strongest option is a staged rollout. It gives the team a clean control group while keeping budget risk bounded.',
    signal: 'Cites 3 briefing passages',
  },
  {
    title: 'GPT-5.4',
    color: '#ec4899',
    body: 'I agree with the staged approach, but the first milestone should include support staffing and a rollback trigger.',
    signal: 'Suggests amendment',
  },
  {
    title: 'Gemini Pro',
    color: '#14b8a6',
    body: 'The proposal still needs a clearer downside case. I would require a weekly cost checkpoint before approval.',
    signal: 'Requests safeguard',
  },
];

export default function MockupsPage() {
  const [activeConcept, setActiveConcept] = useState<ConceptKey>('command');
  const [themeMode, setThemeMode] = useState<ThemeMode>('system');
  const [builderStep, setBuilderStep] = useState(1);
  const [selectedSession, setSelectedSession] = useState(0);
  const [showTranscript, setShowTranscript] = useState(true);

  useEffect(() => {
    if (themeMode === 'system') return;
    document.documentElement.classList.toggle('dark', themeMode === 'dark');
    localStorage.setItem('theme', themeMode);
  }, [themeMode]);

  const active = useMemo(
    () => concepts.find((concept) => concept.key === activeConcept) ?? concepts[0],
    [activeConcept]
  );

  return (
    <div className="mx-auto max-w-[1500px] space-y-6">
      <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--accent)' }}>
            UI audit mockups
          </p>
          <h2 className="dl-serif mt-2 text-4xl tracking-tight md:text-5xl" style={{ color: 'var(--text)' }}>
            Make deliberation easier to start, watch, and finish.
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 md:text-base" style={{ color: 'var(--text-secondary)' }}>
            These are runnable redesign mockups based on the current app: the library, the session builder, and the live session room.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/"
            className="rounded-md px-3 py-2 text-sm font-semibold"
            style={{ color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
          >
            Current app
          </Link>
          <div className="flex rounded-md p-1" style={{ background: 'var(--surface-inset)' }} aria-label="Theme preview">
            {(['system', 'light', 'dark'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setThemeMode(mode)}
                className="rounded px-3 py-1.5 text-xs font-semibold capitalize"
                style={{
                  background: themeMode === mode ? 'var(--surface)' : 'transparent',
                  color: themeMode === mode ? 'var(--text)' : 'var(--text-tertiary)',
                  boxShadow: themeMode === mode ? 'var(--shadow-xs)' : 'none',
                }}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>
      </header>

      <section className="grid items-start gap-4 min-[1800px]:grid-cols-[1.15fr_0.85fr]">
        <Panel className="overflow-hidden" padding={false}>
          <div className="flex items-center justify-between gap-3 px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
            <div>
              <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                Design directions
              </h3>
              <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                Pick a direction to preview the working mockup.
              </p>
            </div>
            <span className="rounded-full px-2.5 py-1 text-xs font-semibold" style={{ background: 'var(--accent-subtle)', color: 'var(--accent-text)' }}>
              {active.plainLabel}
            </span>
          </div>
          <div className="grid gap-2 p-3 md:grid-cols-3">
            {concepts.map((concept) => (
              <button
                key={concept.key}
                onClick={() => setActiveConcept(concept.key)}
                className="rounded-lg p-4 text-left transition"
                style={{
                  background: activeConcept === concept.key ? 'var(--surface)' : 'transparent',
                  border: `1px solid ${activeConcept === concept.key ? 'var(--accent-muted)' : 'var(--border)'}`,
                  boxShadow: activeConcept === concept.key ? 'var(--shadow-md)' : 'none',
                }}
              >
                <span
                  className="mb-4 inline-flex h-8 w-8 items-center justify-center rounded-md text-sm font-bold"
                  style={{ background: 'var(--sidebar-bg)', color: 'var(--sidebar-text)' }}
                >
                  {concept.label}
                </span>
                <div className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                  {concept.plainLabel}
                </div>
                <p className="mt-2 text-xs leading-5" style={{ color: 'var(--text-tertiary)' }}>
                  {concept.note}
                </p>
              </button>
            ))}
          </div>
        </Panel>

        <Panel className="overflow-hidden" padding={false}>
          <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
            <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
              Audit takeaways
            </h3>
            <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              Plain-language improvements these mockups test.
            </p>
          </div>
          <div className="grid gap-2 p-4">
            {[
              'Show the next useful action before showing raw session history.',
              'Break setup into smaller steps with a visible readiness check.',
              'Tie cost, model health, and launch confidence to the decision point.',
              'Make the live room scanable by separating phase, panelists, votes, and resolution.',
            ].map((item) => (
              <div key={item} className="flex gap-3 rounded-md p-3" style={{ background: 'var(--surface-inset)' }}>
                <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ background: 'var(--accent)' }} />
                <p className="text-sm leading-5" style={{ color: 'var(--text-secondary)' }}>
                  {item}
                </p>
              </div>
            ))}
          </div>
        </Panel>
      </section>

      <section>
        {activeConcept === 'command' && (
          <CommandCenter selectedSession={selectedSession} onSelectSession={setSelectedSession} />
        )}
        {activeConcept === 'builder' && (
          <GuidedBuilder builderStep={builderStep} onStepChange={setBuilderStep} />
        )}
        {activeConcept === 'live' && (
          <LiveRoom showTranscript={showTranscript} onToggleTranscript={() => setShowTranscript((value) => !value)} />
        )}
      </section>

      <Panel className="overflow-hidden" padding={false}>
        <div className="grid gap-0 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="p-6">
            <h3 className="dl-serif text-2xl" style={{ color: 'var(--text)' }}>
              Concept board
            </h3>
            <p className="mt-2 text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>
              This image was used as the visual reference. The runnable screens above translate it into real web UI instead of shipping a static picture.
            </p>
          </div>
          <div className="relative min-h-[220px] border-t lg:border-l lg:border-t-0" style={{ borderColor: 'var(--border)' }}>
            <Image
              src="/mockups/concept-board.png"
              alt="Three UI mockup concepts for Deliberation"
              fill
              sizes="(max-width: 1024px) 100vw, 55vw"
              className="object-cover"
              priority
            />
          </div>
        </div>
      </Panel>
    </div>
  );
}

function CommandCenter({
  selectedSession,
  onSelectSession,
}: {
  selectedSession: number;
  onSelectSession: (index: number) => void;
}) {
  const session = sessions[selectedSession];

  return (
    <MockupFrame eyebrow="Concept A" title="Command Center">
      <div className="grid gap-4 min-[1800px]:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-4">
            {statusItems.map((item) => (
              <MetricCard key={item.label} {...item} />
            ))}
          </div>

          <Panel padding={false} className="overflow-hidden">
            <div className="flex flex-col gap-3 px-5 py-4 md:flex-row md:items-center md:justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
              <div>
                <h4 className="text-base font-semibold" style={{ color: 'var(--text)' }}>
                  Sessions that need attention
                </h4>
                <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                  Sorted by what you can usefully do next.
                </p>
              </div>
              <div className="flex gap-2">
                {['All', 'Active', 'Review'].map((filter) => (
                  <button
                    key={filter}
                    className="rounded-full px-3 py-1.5 text-xs font-semibold"
                    style={{
                      background: filter === 'Active' ? 'var(--accent-subtle)' : 'var(--surface-inset)',
                      color: filter === 'Active' ? 'var(--accent-text)' : 'var(--text-tertiary)',
                    }}
                  >
                    {filter}
                  </button>
                ))}
              </div>
            </div>
            <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
              {sessions.map((item, index) => (
                <button
                  key={item.title}
                  onClick={() => onSelectSession(index)}
                  className="grid w-full gap-4 p-5 text-left transition md:grid-cols-[1fr_160px_120px]"
                  style={{
                    background: selectedSession === index ? 'var(--surface-hover)' : 'transparent',
                    borderBottom: index < sessions.length - 1 ? '1px solid var(--border)' : 'none',
                  }}
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h5 className="text-base font-semibold" style={{ color: 'var(--text)' }}>
                        {item.title}
                      </h5>
                      <Pill tone={item.status === 'Complete' ? 'success' : item.status === 'Voting' ? 'warning' : 'info'}>
                        {item.status}
                      </Pill>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {item.tags.map((tag) => (
                        <span key={tag} className="rounded-full px-2 py-1 text-xs" style={{ background: 'var(--surface-inset)', color: 'var(--text-tertiary)' }}>
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--text-tertiary)' }}>
                      Next action
                    </p>
                    <p className="mt-1 text-sm font-semibold" style={{ color: 'var(--accent)' }}>
                      {item.action}
                    </p>
                  </div>
                  <div>
                    <div className="flex justify-between text-xs" style={{ color: 'var(--text-tertiary)' }}>
                      <span>Progress</span>
                      <span>{item.phase}%</span>
                    </div>
                    <div className="mt-2 h-2 rounded-full" style={{ background: 'var(--surface-inset)' }}>
                      <div className="h-full rounded-full" style={{ width: `${item.phase}%`, background: 'var(--accent)' }} />
                    </div>
                    <p className="mt-2 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                      Cost {item.cost}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </Panel>
        </div>

        <Panel>
          <p className="text-xs font-semibold uppercase tracking-[0.14em]" style={{ color: 'var(--accent)' }}>
            Selected
          </p>
          <h4 className="dl-serif mt-2 text-2xl" style={{ color: 'var(--text)' }}>
            {session.title}
          </h4>
          <p className="mt-3 text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>
            The redesigned library shows why this session matters now, not just when it was created.
          </p>
          <div className="mt-5 rounded-lg p-4" style={{ background: 'var(--surface-inset)' }}>
            <div className="flex items-center justify-between text-sm">
              <span style={{ color: 'var(--text-secondary)' }}>Recommended action</span>
              <strong style={{ color: 'var(--accent)' }}>{session.action}</strong>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              {['Phase', 'Panelists', 'Spend'].map((label, index) => (
                <div key={label} className="rounded-md p-3" style={{ background: 'var(--surface)' }}>
                  <div className="text-lg font-bold" style={{ color: 'var(--text)' }}>
                    {index === 0 ? session.status : index === 1 ? '3' : session.cost}
                  </div>
                  <div className="mt-1 text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                    {label}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <button className="mt-5 w-full rounded-md px-4 py-3 text-sm font-bold" style={{ background: 'var(--accent)', color: 'var(--text-inverse)' }}>
            Open session
          </button>
        </Panel>
      </div>
    </MockupFrame>
  );
}

function GuidedBuilder({
  builderStep,
  onStepChange,
}: {
  builderStep: number;
  onStepChange: (step: number) => void;
}) {
  const steps = ['Briefing', 'Panel', 'Rules', 'Review'];

  return (
    <MockupFrame eyebrow="Concept B" title="Guided Builder">
      <div className="grid gap-4 min-[1800px]:grid-cols-[260px_1fr_340px]">
        <Panel>
          <h4 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
            Setup steps
          </h4>
          <div className="mt-4 space-y-2">
            {steps.map((step, index) => {
              const stepNumber = index + 1;
              const active = stepNumber === builderStep;
              const done = stepNumber < builderStep;
              return (
                <button
                  key={step}
                  onClick={() => onStepChange(stepNumber)}
                  className="flex w-full items-center gap-3 rounded-md p-3 text-left"
                  style={{
                    background: active ? 'var(--accent-subtle)' : 'var(--surface-inset)',
                    color: active ? 'var(--accent-text)' : 'var(--text-secondary)',
                  }}
                >
                  <span
                    className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold"
                    style={{
                      background: done ? 'var(--success)' : active ? 'var(--accent)' : 'var(--surface)',
                      color: done || active ? '#fff' : 'var(--text-tertiary)',
                    }}
                  >
                    {done ? '✓' : stepNumber}
                  </span>
                  <span className="text-sm font-semibold">{step}</span>
                </button>
              );
            })}
          </div>
        </Panel>

        <Panel>
          <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em]" style={{ color: 'var(--accent)' }}>
                Step {builderStep} of 4
              </p>
              <h4 className="dl-serif mt-1 text-3xl" style={{ color: 'var(--text)' }}>
                {steps[builderStep - 1]}
              </h4>
            </div>
            <Pill tone="success">Ready to launch</Pill>
          </div>

          {builderStep === 1 && <BriefingStep />}
          {builderStep === 2 && <PanelStep />}
          {builderStep === 3 && <RulesStep />}
          {builderStep === 4 && <ReviewStep />}
        </Panel>

        <Panel>
          <h4 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
            Launch confidence
          </h4>
          <div className="mt-4 space-y-3">
            {[
              ['Briefing is specific enough', 'Good'],
              ['3 models connected', 'Good'],
              ['Estimated cost', '$5.40'],
              ['Approval rule', 'Majority'],
            ].map(([label, value]) => (
              <div key={label} className="flex items-center justify-between rounded-md p-3" style={{ background: 'var(--surface-inset)' }}>
                <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  {label}
                </span>
                <strong className="text-sm" style={{ color: 'var(--text)' }}>
                  {value}
                </strong>
              </div>
            ))}
          </div>
          <div className="mt-5 rounded-lg p-4" style={{ background: 'var(--sidebar-bg)', color: 'var(--sidebar-text)' }}>
            <p className="text-sm font-semibold">Plain-English summary</p>
            <p className="mt-2 text-sm leading-6" style={{ color: 'var(--sidebar-text-muted)' }}>
              This session will ask three panelists to compare rollout options, debate for three rounds, then vote on a final recommendation.
            </p>
          </div>
          <button className="mt-5 w-full rounded-md px-4 py-3 text-sm font-bold" style={{ background: 'var(--accent)', color: 'var(--text-inverse)' }}>
            Launch deliberation
          </button>
        </Panel>
      </div>
    </MockupFrame>
  );
}

function LiveRoom({
  showTranscript,
  onToggleTranscript,
}: {
  showTranscript: boolean;
  onToggleTranscript: () => void;
}) {
  return (
    <MockupFrame eyebrow="Concept C" title="Live Deliberation Room">
      <div className="grid gap-4 min-[1800px]:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <Panel padding={false} className="overflow-hidden">
            <div className="grid gap-3 p-4 md:grid-cols-[1fr_auto] md:items-center">
              <div>
                <h4 className="text-base font-semibold" style={{ color: 'var(--text)' }}>
                  Vendor contract renewal
                </h4>
                <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                  Round 2 of 3, voting expected in about 4 minutes.
                </p>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {['Analysis', 'Discuss', 'Draft', 'Vote'].map((phase, index) => (
                  <div key={phase} className="rounded-md px-3 py-2 text-center" style={{ background: index === 1 ? 'var(--accent-subtle)' : 'var(--surface-inset)' }}>
                    <div className="mx-auto mb-1 h-1.5 w-8 rounded-full" style={{ background: index < 2 ? 'var(--success)' : index === 1 ? 'var(--accent)' : 'var(--border-strong)' }} />
                    <span className="text-[11px] font-semibold" style={{ color: index === 1 ? 'var(--accent-text)' : 'var(--text-tertiary)' }}>
                      {phase}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </Panel>

          <div className="grid gap-3 lg:grid-cols-3">
            {liveEntries.map((entry) => (
              <Panel key={entry.title} className="min-h-[360px]">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold text-white" style={{ background: entry.color }}>
                    {entry.title[0]}
                  </span>
                  <div>
                    <h4 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                      {entry.title}
                    </h4>
                    <p className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                      Streaming now
                    </p>
                  </div>
                </div>
                <div className="mt-5 rounded-lg p-4" style={{ background: 'var(--surface-inset)' }}>
                  <p className="text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>
                    {entry.body}
                  </p>
                </div>
                <div className="mt-4 rounded-md px-3 py-2 text-xs font-semibold" style={{ background: 'var(--accent-subtle)', color: 'var(--accent-text)' }}>
                  {entry.signal}
                </div>
                {showTranscript && (
                  <div className="mt-4 space-y-2 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                    <p>References cost cap, support staffing, and rollback threshold.</p>
                    <p>Waiting for final counterpoint before drafter election.</p>
                  </div>
                )}
              </Panel>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <Panel>
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                Resolution preview
              </h4>
              <Pill tone="info">Draft soon</Pill>
            </div>
            <div className="mt-4 space-y-3">
              {['Staged rollout with rollback trigger', 'Weekly cost checkpoint', 'Support staffing before expansion'].map((line) => (
                <div key={line} className="rounded-md p-3 text-sm" style={{ background: 'var(--surface-inset)', color: 'var(--text-secondary)' }}>
                  {line}
                </div>
              ))}
            </div>
          </Panel>

          <Panel>
            <h4 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
              Intervene without losing context
            </h4>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {['Pause', 'Nudge', 'Add fact', 'Advance'].map((action) => (
                <button key={action} className="rounded-md px-3 py-2 text-sm font-semibold" style={{ background: 'var(--surface-inset)', color: 'var(--text-secondary)' }}>
                  {action}
                </button>
              ))}
            </div>
            <button
              onClick={onToggleTranscript}
              className="mt-4 w-full rounded-md px-3 py-2 text-sm font-semibold"
              style={{ background: 'var(--accent)', color: 'var(--text-inverse)' }}
            >
              {showTranscript ? 'Hide transcript detail' : 'Show transcript detail'}
            </button>
          </Panel>

          <Panel>
            <h4 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
              Vote readiness
            </h4>
            <div className="mt-4 h-2 rounded-full" style={{ background: 'var(--surface-inset)' }}>
              <div className="h-full w-[72%] rounded-full" style={{ background: 'var(--success)' }} />
            </div>
            <p className="mt-3 text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>
              Two of three panelists already agree on the main direction. The remaining disagreement is about guardrails.
            </p>
          </Panel>
        </div>
      </div>
    </MockupFrame>
  );
}

function BriefingStep() {
  return (
    <div className="space-y-4">
      <label className="block">
        <span className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>
          What decision should the panel make?
        </span>
        <textarea
          className="mt-2 h-40 w-full resize-none rounded-lg px-4 py-3 text-sm outline-none"
          style={{ background: 'var(--surface-inset)', color: 'var(--text)', border: '1px solid var(--border)' }}
          defaultValue="Compare three vendor renewal options and recommend the lowest-risk path for Q3."
        />
      </label>
      <div className="grid gap-3 md:grid-cols-3">
        {['Clear question', 'Decision deadline', 'Success criteria'].map((item) => (
          <div key={item} className="rounded-md p-3" style={{ background: 'var(--success-subtle)', color: 'var(--success-text)' }}>
            <span className="text-sm font-semibold">{item}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PanelStep() {
  return (
    <div className="grid gap-3">
      {panelists.map((panelist) => (
        <div key={panelist.name} className="grid gap-3 rounded-lg p-4 md:grid-cols-[auto_1fr_auto] md:items-center" style={{ background: 'var(--surface-inset)' }}>
          <span className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold text-white" style={{ background: panelist.color }}>
            {panelist.name[0]}
          </span>
          <div>
            <div className="font-semibold" style={{ color: 'var(--text)' }}>
              {panelist.name}
            </div>
            <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              {panelist.model}
            </div>
          </div>
          <Pill tone="info">{panelist.stance}</Pill>
        </div>
      ))}
    </div>
  );
}

function RulesStep() {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {[
        ['Discussion rounds', '3'],
        ['Turn order', 'Hybrid'],
        ['Approval threshold', 'Simple majority'],
        ['Cost cap', '$20'],
        ['Your role', 'Participant'],
        ['Disagreement handling', 'Iterate, then report'],
      ].map(([label, value]) => (
        <div key={label} className="rounded-lg p-4" style={{ background: 'var(--surface-inset)' }}>
          <div className="text-xs font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--text-tertiary)' }}>
            {label}
          </div>
          <div className="mt-2 text-lg font-bold" style={{ color: 'var(--text)' }}>
            {value}
          </div>
        </div>
      ))}
    </div>
  );
}

function ReviewStep() {
  return (
    <div className="space-y-4">
      <div className="rounded-lg p-5" style={{ background: 'var(--success-subtle)', color: 'var(--success-text)' }}>
        <h5 className="font-bold">Ready to launch</h5>
        <p className="mt-2 text-sm leading-6">
          The panel has enough context, three connected models, and a clear voting rule.
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {['Briefing', 'Panelists', 'Rules', 'Cost'].map((item) => (
          <div key={item} className="rounded-md p-3" style={{ background: 'var(--surface-inset)', color: 'var(--text-secondary)' }}>
            <span className="font-semibold">{item}</span> checked
          </div>
        ))}
      </div>
    </div>
  );
}

function MockupFrame({ eyebrow, title, children }: { eyebrow: string; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl p-3 md:p-4" style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)' }}>
      <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--accent)' }}>
            {eyebrow}
          </p>
          <h3 className="dl-serif text-3xl" style={{ color: 'var(--text)' }}>
            {title}
          </h3>
        </div>
        <p className="max-w-xl text-sm leading-6" style={{ color: 'var(--text-tertiary)' }}>
          This is a working mockup, not a static screenshot. Use the controls to preview the flow.
        </p>
      </div>
      {children}
    </div>
  );
}

function Panel({
  children,
  className = '',
  padding = true,
}: {
  children: React.ReactNode;
  className?: string;
  padding?: boolean;
}) {
  return (
    <div
      className={`${padding ? 'p-5' : ''} ${className}`}
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      {children}
    </div>
  );
}

function MetricCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <Panel>
      <div className="flex items-center justify-between">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--text-tertiary)' }}>
          {label}
        </span>
      </div>
      <div className="mt-4 text-3xl font-bold" style={{ color: 'var(--text)' }}>
        {value}
      </div>
    </Panel>
  );
}

function Pill({ children, tone }: { children: React.ReactNode; tone: 'success' | 'warning' | 'info' }) {
  const style = {
    success: { background: 'var(--success-subtle)', color: 'var(--success-text)' },
    warning: { background: 'var(--warning-subtle)', color: 'var(--warning-text)' },
    info: { background: 'var(--info-subtle)', color: 'var(--info-text)' },
  }[tone];

  return (
    <span className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold" style={style}>
      {children}
    </span>
  );
}
