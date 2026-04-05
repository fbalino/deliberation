'use client';

import { useRef } from 'react';

interface Props {
  content: string;
  isStreaming?: boolean;
}

export function ThinkingBlock({ content, isStreaming }: Props) {
  const detailsRef = useRef<HTMLDetailsElement>(null);

  if (!content) return null;

  return (
    <details ref={detailsRef} className="mb-2 group">
      <summary
        className="flex items-center gap-1.5 text-xs hover:opacity-80 transition-opacity cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden"
        style={{ color: 'var(--text-tertiary)' }}
      >
        <svg
          className="w-3 h-3 transition-transform group-open:rotate-90"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
        </svg>
        {isStreaming ? (
          <span className="flex items-center gap-1">
            Thinking
            <span className="inline-flex gap-0.5">
              <span className="w-1 h-1 rounded-full animate-bounce [animation-delay:0ms]" style={{ background: 'var(--text-tertiary)' }} />
              <span className="w-1 h-1 rounded-full animate-bounce [animation-delay:150ms]" style={{ background: 'var(--text-tertiary)' }} />
              <span className="w-1 h-1 rounded-full animate-bounce [animation-delay:300ms]" style={{ background: 'var(--text-tertiary)' }} />
            </span>
          </span>
        ) : (
          `Thinking (${content.length > 1000 ? `${Math.round(content.length / 1000)}k chars` : `${content.length} chars`})`
        )}
      </summary>
      <div
        className="mt-1 p-3 text-xs font-mono whitespace-pre-wrap max-h-60 overflow-y-auto leading-relaxed"
        style={{
          background: 'var(--surface-inset)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)',
          color: 'var(--text-tertiary)',
        }}
      >
        {content}
      </div>
    </details>
  );
}
