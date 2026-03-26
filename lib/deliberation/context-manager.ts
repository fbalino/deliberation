import { getModelById } from '@/lib/openrouter/models';

export class ContextManager {
  /** Rough estimate: ~1 token per 4 characters */
  estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  /**
   * Fit prompt content to a model's context window.
   * If the total exceeds 80% of the model's context, summarize earlier discussion rounds.
   */
  fitToContext(params: {
    systemPrompt: string;
    briefing: string;
    analyses: string;
    discussion: string;
    modelId: string;
  }): { systemPrompt: string; userMessage: string; wasTruncated: boolean } {
    const model = getModelById(params.modelId);
    const contextWindow = model?.contextWindow ?? 128000;
    const maxTokens = Math.floor(contextWindow * 0.8);

    const fullContent = params.systemPrompt + params.briefing + params.analyses + params.discussion;
    const totalTokens = this.estimateTokens(fullContent);

    if (totalTokens <= maxTokens) {
      return {
        systemPrompt: params.systemPrompt,
        userMessage: this.buildUserMessage(params.briefing, params.analyses, params.discussion),
        wasTruncated: false,
      };
    }

    // Need to truncate — summarize discussion rounds
    const truncatedDiscussion = this.truncateDiscussion(params.discussion, params.briefing, params.analyses, params.systemPrompt, maxTokens);

    return {
      systemPrompt: params.systemPrompt,
      userMessage: this.buildUserMessage(params.briefing, params.analyses, truncatedDiscussion),
      wasTruncated: true,
    };
  }

  private buildUserMessage(briefing: string, analyses: string, discussion: string): string {
    let msg = `Briefing:\n${briefing}\n\nAnalyses:\n${analyses}`;
    if (discussion) {
      msg += `\n\nDiscussion:\n${discussion}`;
    }
    return msg;
  }

  private truncateDiscussion(
    discussion: string,
    briefing: string,
    analyses: string,
    systemPrompt: string,
    maxTokens: number
  ): string {
    // Split into rounds
    const rounds = discussion.split(/(?=--- Round \d+)/);
    if (rounds.length <= 2) {
      // Can't truncate further — just trim
      return discussion.slice(0, maxTokens * 4 - this.estimateTokens(briefing + analyses + systemPrompt) * 4);
    }

    // Keep first round and last 2 rounds, summarize middle
    const firstRound = rounds[0];
    const lastTwo = rounds.slice(-2);
    const middleCount = rounds.length - 3;

    const summary = `[${middleCount} earlier discussion round${middleCount > 1 ? 's' : ''} omitted for context management. Key themes were carried forward in the retained rounds.]`;

    const truncated = firstRound + '\n\n' + summary + '\n\n' + lastTwo.join('\n');

    // Check if this fits
    const remaining = maxTokens - this.estimateTokens(briefing + analyses + systemPrompt);
    if (this.estimateTokens(truncated) > remaining) {
      // Still too long — drop the first round too
      return summary + '\n\n' + lastTwo.join('\n');
    }

    return truncated;
  }
}

export const contextManager = new ContextManager();
