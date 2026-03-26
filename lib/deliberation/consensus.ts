export interface ConsensusResult {
  consensusSignal: boolean;
  extensionRequest: boolean;
  extensionReason: string | null;
}

const CONSENSUS_PATTERNS = [
  /\b(?:I believe|it seems|we appear to have|I think)\s+(?:we have|we've)\s+reached\s+(?:a\s+)?consensus/i,
  /\bconsensus has been reached\b/i,
  /\bwe are (?:now )?in agreement\b/i,
  /\bI agree with the consensus\b/i,
  /\bI concur with (?:all|the other|my fellow) (?:analysts|panelists)\b/i,
];

const NEGATIVE_CONSENSUS_PATTERNS = [
  /\b(?:not|no|haven't|have not|hasn't|don't)\b[^.]{0,40}\bconsensus\b/i,
  /\bconsensus\b[^.]{0,40}\b(?:not|no|hasn't|haven't)\b/i,
];

const EXTENSION_PATTERNS = [
  /\bI believe we need (?:further|more|additional) discussion\b/i,
  /\bmore discussion is needed\b/i,
  /\badditional rounds? (?:would be|are) (?:beneficial|necessary|needed)\b/i,
  /\bwe should continue (?:the )?discussion\b/i,
  /\bI request (?:an )?additional round/i,
];

export function detectConsensus(content: string): ConsensusResult {
  // Check for extension requests first
  let extensionRequest = false;
  let extensionReason: string | null = null;

  for (const pattern of EXTENSION_PATTERNS) {
    const match = content.match(pattern);
    if (match) {
      extensionRequest = true;
      // Extract the sentence containing the match
      const sentenceStart = content.lastIndexOf('.', match.index || 0) + 1;
      const sentenceEnd = content.indexOf('.', (match.index || 0) + match[0].length);
      extensionReason = content
        .slice(sentenceStart, sentenceEnd > 0 ? sentenceEnd + 1 : undefined)
        .trim()
        .slice(0, 200);
      break;
    }
  }

  // Check for consensus signals, but exclude negative patterns
  let consensusSignal = false;

  const hasNegative = NEGATIVE_CONSENSUS_PATTERNS.some((p) => p.test(content));

  if (!hasNegative) {
    consensusSignal = CONSENSUS_PATTERNS.some((p) => p.test(content));
  }

  return { consensusSignal, extensionRequest, extensionReason };
}
