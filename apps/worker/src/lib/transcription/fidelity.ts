export type TranscriptFidelityResult = {
  wordErrorRate: number;
  similarity: number;
  passed: boolean;
  referenceWordCount: number;
  hypothesisWordCount: number;
};

export function normalizeTranscriptForComparison(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value: string) {
  const normalized = normalizeTranscriptForComparison(value);
  return normalized.length > 0 ? normalized.split(" ") : [];
}

export function calculateWordErrorRate(reference: string, hypothesis: string) {
  const referenceWords = tokenize(reference);
  const hypothesisWords = tokenize(hypothesis);

  if (referenceWords.length === 0) {
    return hypothesisWords.length === 0 ? 0 : 1;
  }

  const distances: number[][] = Array.from({ length: referenceWords.length + 1 }, () =>
    Array.from({ length: hypothesisWords.length + 1 }, () => 0)
  );

  for (let i = 0; i <= referenceWords.length; i += 1) {
    distances[i][0] = i;
  }
  for (let j = 0; j <= hypothesisWords.length; j += 1) {
    distances[0][j] = j;
  }

  for (let i = 1; i <= referenceWords.length; i += 1) {
    for (let j = 1; j <= hypothesisWords.length; j += 1) {
      const substitutionCost = referenceWords[i - 1] === hypothesisWords[j - 1] ? 0 : 1;
      distances[i][j] = Math.min(
        distances[i - 1][j] + 1,
        distances[i][j - 1] + 1,
        distances[i - 1][j - 1] + substitutionCost
      );
    }
  }

  return distances[referenceWords.length][hypothesisWords.length] / referenceWords.length;
}

export function evaluateTranscriptFidelity(params: {
  referenceText: string;
  hypothesisText: string;
  maxWordErrorRate: number;
}): TranscriptFidelityResult {
  const referenceWordCount = tokenize(params.referenceText).length;
  const hypothesisWordCount = tokenize(params.hypothesisText).length;
  const wordErrorRate = calculateWordErrorRate(params.referenceText, params.hypothesisText);
  const similarity = Math.max(0, 1 - wordErrorRate);

  return {
    wordErrorRate,
    similarity,
    passed: wordErrorRate <= params.maxWordErrorRate,
    referenceWordCount,
    hypothesisWordCount
  };
}
