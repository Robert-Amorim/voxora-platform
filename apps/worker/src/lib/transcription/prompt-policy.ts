import type { OpenAiModelCapability } from "./strategy-selector";

const DEFAULT_PROMPT_TOKEN_BUDGET = 180;
const HINT_TOKEN_BUDGET = 96;
const CONTEXT_TOKEN_BUDGET = 72;

function collapseWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function takeLastWords(value: string, limit: number) {
  const words = collapseWhitespace(value).split(" ").filter(Boolean);
  return words.slice(-limit).join(" ");
}

function tokenizeKeywords(value: string) {
  return collapseWhitespace(value)
    .split(/[\s,;|/]+/)
    .map((token) => token.replace(/[^\p{L}\p{N}_.-]+/gu, "").trim())
    .filter((token) => token.length >= 2);
}

function dedupeKeywords(keywords: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const keyword of keywords) {
    const normalized = keyword.toLowerCase();
    if (seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(keyword);
  }
  return result;
}

function toWhisperKeywordPrompt(params: {
  transcriptionHints?: string;
  previousTranscriptTail?: string;
  tokenBudget: number;
}) {
  const hintTerms = tokenizeKeywords(params.transcriptionHints ?? "").slice(0, HINT_TOKEN_BUDGET);
  const contextTerms = tokenizeKeywords(params.previousTranscriptTail ?? "").slice(
    0,
    CONTEXT_TOKEN_BUDGET
  );
  const keywords = dedupeKeywords([...hintTerms, ...contextTerms]).slice(0, params.tokenBudget);
  return keywords.join(", ");
}

export function buildChunkPrompt(params: {
  capability: OpenAiModelCapability;
  transcriptionHints?: string;
  previousTranscriptText?: string;
  tokenBudget?: number;
}) {
  const tokenBudget = params.tokenBudget ?? DEFAULT_PROMPT_TOKEN_BUDGET;
  if (params.capability.promptMode === "none") {
    return undefined;
  }

  if (params.capability.promptMode === "keyword_list") {
    const prompt = toWhisperKeywordPrompt({
      transcriptionHints: params.transcriptionHints,
      previousTranscriptTail: takeLastWords(params.previousTranscriptText ?? "", CONTEXT_TOKEN_BUDGET),
      tokenBudget
    });
    return prompt.length > 0 ? prompt : undefined;
  }

  const hints = takeLastWords(params.transcriptionHints ?? "", HINT_TOKEN_BUDGET);
  const previous = takeLastWords(params.previousTranscriptText ?? "", CONTEXT_TOKEN_BUDGET);
  const sections = [
    hints.length > 0 ? `Critical terms: ${hints}` : "",
    previous.length > 0 ? `Previous tail: ${previous}` : ""
  ].filter(Boolean);
  const prompt = collapseWhitespace(sections.join(" | "));
  return prompt.length > 0 ? prompt : undefined;
}
