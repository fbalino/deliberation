export function analysisPrompt(params: {
  briefing: string;
  panelistSystemPrompt?: string;
  previousAnalyses?: string;
}): { system: string; user: string } {
  const system = params.panelistSystemPrompt ||
    `You are an independent analyst participating in a structured deliberation.
Read the briefing material carefully and produce a thorough analysis.
Identify key issues, risks, opportunities, and recommendations.
Be specific and evidence-based. You will later discuss your findings
with other analysts and must be prepared to defend your positions.`;

  let user = `Here is the briefing material for your analysis:\n\n${params.briefing}`;

  if (params.previousAnalyses) {
    user += `\n\nThe following panelists have already submitted their analyses:\n${params.previousAnalyses}\n\nYou may reference, build on, or challenge their work.`;
  }

  return { system, user };
}

export function discussionPrompt(params: {
  briefing: string;
  analyses: string;
  discussionTranscript: string;
  roundNumber: number;
  nudge?: string;
  panelistSystemPrompt?: string;
}): { system: string; user: string } {
  const system = params.panelistSystemPrompt ||
    'You are participating in a structured deliberation with other analysts.';

  let user = `You are participating in round ${params.roundNumber} of a structured deliberation.

Here is the original briefing:
${params.briefing}

Here are all analysts' independent analyses:
${params.analyses}`;

  if (params.discussionTranscript) {
    user += `\n\nHere is the discussion so far:\n${params.discussionTranscript}`;
  }

  user += `\n\nRespond to the other analysts' points. Identify where you agree,
where you disagree, and why. Propose specific amendments or compromises
where possible. If you believe consensus has been reached, say so
explicitly. If you believe more discussion is needed, explain why.

Be direct and substantive. Avoid pleasantries.`;

  if (params.nudge) {
    user += `\n\n[Chair's directive]: ${params.nudge}`;
  }

  return { system, user };
}

export function drafterElectionPrompt(params: {
  briefing: string;
  analyses: string;
  discussionTranscript: string;
  panelistNames: string[];
}): { system: string; user: string } {
  const system = 'You are voting on which analyst should draft the resolution document.';

  const nameList = params.panelistNames.map((n) => `- ${n}`).join('\n');

  const user = `The deliberation is moving to the drafting phase. You must vote on which analyst should draft the final resolution document.

Here is a summary of the deliberation:
- Briefing: ${params.briefing.slice(0, 500)}...
- Discussion rounds completed

The panelists are:
${nameList}

Choose the analyst who demonstrated the best synthesis of all perspectives and the clearest writing.

RESPOND ONLY WITH THE FOLLOWING JSON OBJECT, NO OTHER TEXT:
{"pick": "<panelist_name>", "reason": "brief explanation"}`;

  return { system, user };
}

export function draftingPrompt(params: {
  briefing: string;
  analyses: string;
  discussionTranscript: string;
}): { system: string; user: string } {
  const system = 'You have been selected to draft the resolution document for this deliberation.';

  const user = `Here is the complete record:

Briefing:
${params.briefing}

Independent analyses:
${params.analyses}

Discussion transcript:
${params.discussionTranscript}

Synthesize all perspectives into a single, coherent document.
The format should match the content — use whatever structure best
serves the topic (executive summary, sections, recommendations, etc.).
Where consensus exists, state it clearly. Where disagreement remains,
note the competing positions fairly.

Produce the document in Markdown.`;

  return { system, user };
}

export function votingPrompt(params: {
  briefing: string;
  analyses: string;
  discussionTranscript: string;
  draftContent: string;
}): { system: string; user: string } {
  const system = 'You are reviewing a draft resolution document and casting your vote.';

  const user = `Review the following draft resolution:

${params.draftContent}

This draft was produced after the following deliberation:
- Briefing: ${params.briefing.slice(0, 300)}...
- Analyses and discussion were conducted across multiple rounds.

Cast your vote on this draft. Your options:
- "approve": The draft accurately represents the deliberation and needs no changes.
- "approve_with_amendments": The draft is acceptable but needs specific changes (you MUST provide amendment text).
- "reject": The draft has fundamental issues (you MUST explain why).

RESPOND ONLY WITH THE FOLLOWING JSON OBJECT, NO OTHER TEXT:
{"verdict": "approve", "amendments": null, "reasoning": "Your explanation here"}

Example for amendments:
{"verdict": "approve_with_amendments", "amendments": "Section 2 should include...", "reasoning": "The draft omits..."}`;

  return { system, user };
}
