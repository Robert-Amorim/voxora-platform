import type { WhisperSegment } from "./provider-openai";
import { normalizeComparisonText } from "./quality-guards";

export type ChunkWindow = {
  index: number;
  startSec: number;
  endSec: number;
  trimOverlapSec: number;
};

function textSimilarity(left: string, right: string) {
  if (!left || !right) {
    return 0;
  }
  if (left === right) {
    return 1;
  }
  if (left.includes(right) || right.includes(left)) {
    return 0.9;
  }

  const leftTokens = new Set(left.split(" ").filter(Boolean));
  const rightTokens = new Set(right.split(" ").filter(Boolean));
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const union = new Set([...leftTokens, ...rightTokens]).size;
  return union === 0 ? 0 : intersection / union;
}

function shouldDeduplicate(previous: WhisperSegment, next: WhisperSegment) {
  const previousStart = previous.startSec ?? previous.endSec ?? 0;
  const previousEnd = previous.endSec ?? previous.startSec ?? previousStart;
  const nextStart = next.startSec ?? next.endSec ?? previousEnd;
  const nextEnd = next.endSec ?? next.startSec ?? nextStart;

  const overlapsInTime =
    Math.abs(previousEnd - nextStart) <= 1.5 ||
    Math.abs(previousStart - nextStart) <= 1.5 ||
    (nextStart <= previousEnd && nextEnd >= previousStart);
  if (!overlapsInTime) {
    return false;
  }

  const similarity = textSimilarity(
    normalizeComparisonText(previous.text),
    normalizeComparisonText(next.text)
  );
  return similarity >= 0.72;
}

export function mergeChunkSegments(params: {
  existingSegments: WhisperSegment[];
  chunkSegments: WhisperSegment[];
  chunkWindow: ChunkWindow;
}) {
  const merged = params.existingSegments.slice();

  for (const segment of params.chunkSegments) {
    const normalizedStart =
      segment.startSec !== null ? Math.max(segment.startSec, params.chunkWindow.trimOverlapSec) : null;
    const normalizedEnd =
      segment.endSec !== null ? Math.max(segment.endSec, params.chunkWindow.trimOverlapSec) : null;
    const candidate: WhisperSegment = {
      chunkIndex: merged.length,
      startSec:
        normalizedStart !== null
          ? Number((normalizedStart + params.chunkWindow.startSec).toFixed(3))
          : null,
      endSec:
        normalizedEnd !== null
          ? Number((normalizedEnd + params.chunkWindow.startSec).toFixed(3))
          : null,
      text: segment.text.trim(),
      speakerLabel: segment.speakerLabel ?? null
    };

    const previous = merged.length > 0 ? merged[merged.length - 1] : null;
    if (!previous) {
      merged.push(candidate);
      continue;
    }

    if (!shouldDeduplicate(previous, candidate)) {
      merged.push(candidate);
      continue;
    }

    const previousText = normalizeComparisonText(previous.text);
    const candidateText = normalizeComparisonText(candidate.text);
    if (candidateText.length > previousText.length) {
      merged[merged.length - 1] = {
        ...candidate,
        chunkIndex: previous.chunkIndex
      };
    }
  }

  return merged.map((segment, index) => ({
    ...segment,
    chunkIndex: index
  }));
}
