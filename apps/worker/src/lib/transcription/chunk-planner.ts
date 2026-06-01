import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ChunkWindow } from "./segment-merge";

const execFileAsync = promisify(execFile);
const DEFAULT_SILENCE_SEARCH_WINDOW_SECONDS = 12;
const MIN_SILENCE_DURATION_SECONDS = 0.35;
const SILENCE_NOISE_THRESHOLD = "-30dB";

type SilenceRange = {
  startSec: number;
  endSec: number;
};

function parseSilenceRanges(stderr: string) {
  const ranges: SilenceRange[] = [];
  const silenceStarts: number[] = [];

  for (const line of stderr.split("\n")) {
    const startMatch = line.match(/silence_start:\s*([0-9.]+)/);
    if (startMatch) {
      silenceStarts.push(Number.parseFloat(startMatch[1]));
    }

    const endMatch = line.match(/silence_end:\s*([0-9.]+)/);
    if (endMatch) {
      const endSec = Number.parseFloat(endMatch[1]);
      const startSec = silenceStarts.shift();
      if (typeof startSec === "number" && Number.isFinite(startSec) && Number.isFinite(endSec) && endSec >= startSec) {
        ranges.push({ startSec, endSec });
      }
    }
  }

  return ranges;
}

async function findNearestSilenceBoundary(params: {
  sourceFilePath: string;
  targetSec: number;
  durationSeconds: number;
  searchWindowSeconds: number;
}) {
  const searchStart = Math.max(0, params.targetSec - params.searchWindowSeconds / 2);
  const searchEnd = Math.min(params.durationSeconds, params.targetSec + params.searchWindowSeconds / 2);
  const searchDuration = Math.max(0.5, searchEnd - searchStart);

  try {
    const { stderr } = await execFileAsync(
      "ffmpeg",
      [
        "-hide_banner",
        "-nostats",
        "-v",
        "info",
        "-ss",
        searchStart.toFixed(3),
        "-t",
        searchDuration.toFixed(3),
        "-i",
        params.sourceFilePath,
        "-af",
        `silencedetect=noise=${SILENCE_NOISE_THRESHOLD}:d=${MIN_SILENCE_DURATION_SECONDS.toFixed(2)}`,
        "-f",
        "null",
        "-"
      ],
      { windowsHide: true }
    );

    const silenceRanges = parseSilenceRanges(stderr);
    if (silenceRanges.length === 0) {
      return null;
    }

    let bestBoundary: number | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const range of silenceRanges) {
      const midpoint = searchStart + (range.startSec + range.endSec) / 2;
      const distance = Math.abs(midpoint - params.targetSec);
      if (distance < bestDistance) {
        bestBoundary = midpoint;
        bestDistance = distance;
      }
    }

    return bestBoundary;
  } catch {
    return null;
  }
}

export async function buildAudioChunkWindows(params: {
  sourceFilePath: string;
  durationSeconds: number;
  targetSeconds: number;
  overlapSeconds: number;
  silenceSearchWindowSeconds?: number;
}): Promise<ChunkWindow[]> {
  const duration = Math.max(1, params.durationSeconds);
  const target = Math.max(1, params.targetSeconds);
  const overlap = Math.max(0, Math.min(params.overlapSeconds, target / 3));
  const searchWindow = params.silenceSearchWindowSeconds ?? DEFAULT_SILENCE_SEARCH_WINDOW_SECONDS;

  const windows: ChunkWindow[] = [];
  let cursor = 0;
  let index = 0;

  while (cursor < duration) {
    const rawBoundary = Math.min(duration, cursor + target);
    let boundary = rawBoundary;

    if (rawBoundary < duration) {
      const silenceBoundary = await findNearestSilenceBoundary({
        sourceFilePath: params.sourceFilePath,
        targetSec: rawBoundary,
        durationSeconds: duration,
        searchWindowSeconds: searchWindow
      });

      if (
        typeof silenceBoundary === "number" &&
        Number.isFinite(silenceBoundary) &&
        silenceBoundary > cursor + Math.min(15, target / 4) &&
        silenceBoundary < duration
      ) {
        boundary = silenceBoundary;
      }
    }

    if (boundary <= cursor) {
      boundary = rawBoundary;
    }

    const isFirst = index === 0;
    const startSec = isFirst ? 0 : Math.max(0, cursor - overlap);
    const endSec = Math.min(duration, boundary);
    const trimOverlapSec = isFirst ? 0 : Math.min(overlap, endSec - startSec);
    windows.push({
      index,
      startSec,
      endSec,
      trimOverlapSec
    });

    if (endSec >= duration) {
      break;
    }

    cursor = endSec;
    index += 1;
  }

  return windows;
}
