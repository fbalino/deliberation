'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ThinkingBlock } from './ThinkingBlock';

interface Props {
  panelistName: string;
  panelistColor: string;
  modelId?: string;
  content: string;
  thinkingContent?: string;
  isStreaming?: boolean;
  isThinkingStreaming?: boolean;
}

export function ContributionCard({
  panelistName,
  panelistColor,
  modelId,
  content,
  thinkingContent,
  isStreaming,
  isThinkingStreaming,
}: Props) {
  const initial = panelistName.charAt(0).toUpperCase();

  return (
    <div className="flex gap-3 py-4">
      {/* Avatar */}
      <div
        className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0"
        style={{ backgroundColor: panelistColor }}
      >
        {initial}
      </div>

      <div className="flex-1 min-w-0">
        {/* Header */}
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-semibold text-gray-900">{panelistName}</span>
          {modelId && (
            <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
              {modelId.split('/').pop()}
            </span>
          )}
          {isStreaming && (
            <span className="inline-block w-2 h-4 bg-indigo-500 animate-pulse rounded-sm" />
          )}
        </div>

        {/* Thinking block */}
        {thinkingContent && (
          <ThinkingBlock content={thinkingContent} isStreaming={isThinkingStreaming} />
        )}

        {/* Content */}
        <div className="prose prose-sm max-w-none text-gray-700">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content || ''}</ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
