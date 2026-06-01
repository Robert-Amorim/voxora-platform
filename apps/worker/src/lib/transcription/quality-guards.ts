function normalizeTokenText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function isHallucinatedText(text: string): boolean {
  if (!text || text.trim().length === 0) return false;

  const tokens = normalizeTokenText(text).split(" ").filter((t) => t.length > 0);
  if (tokens.length < 8) return false;

  const freq: Record<string, number> = {};
  for (const token of tokens) {
    freq[token] = (freq[token] ?? 0) + 1;
  }

  const maxFreq = Math.max(...Object.values(freq));
  return maxFreq / tokens.length > 0.5;
}

export function normalizeComparisonText(text: string) {
  return normalizeTokenText(text);
}

export function estimateWordCount(text: string) {
  const normalized = normalizeTokenText(text);
  if (!normalized) {
    return 0;
  }
  return normalized.split(" ").filter(Boolean).length;
}
