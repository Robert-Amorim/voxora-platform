import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type AudioQualityMetrics = {
  meanVolumeDb: number | null;
  maxVolumeDb: number | null;
  isLikelyTooQuiet: boolean;
  hasClippingRisk: boolean;
};

export type AudioOptimizationDecision = {
  shouldOptimize: boolean;
  reasons: string[];
};

export type AudioPreflightResult = {
  audioBuffer: Buffer;
  fileName: string;
  optimized: boolean;
  metrics: AudioQualityMetrics;
  reasons: string[];
};

export type AudioPreflightOptions = {
  enabled: boolean;
  targetSampleRate: number;
  targetMeanVolumeDb: number;
  quietMeanThresholdDb: number;
  clippingPeakThresholdDb: number;
  highpassHz: number;
  lowpassHz: number;
};

function parseVolumeDb(stderr: string, label: "mean_volume" | "max_volume") {
  const match = stderr.match(new RegExp(`${label}:\\s*(-?\\d+(?:\\.\\d+)?)\\s*dB`));
  if (!match) {
    return null;
  }

  const parsed = Number.parseFloat(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseAudioQualityMetrics(stderr: string, options: Pick<
  AudioPreflightOptions,
  "quietMeanThresholdDb" | "clippingPeakThresholdDb"
>): AudioQualityMetrics {
  const meanVolumeDb = parseVolumeDb(stderr, "mean_volume");
  const maxVolumeDb = parseVolumeDb(stderr, "max_volume");

  return {
    meanVolumeDb,
    maxVolumeDb,
    isLikelyTooQuiet:
      typeof meanVolumeDb === "number" && meanVolumeDb <= options.quietMeanThresholdDb,
    hasClippingRisk:
      typeof maxVolumeDb === "number" && maxVolumeDb >= options.clippingPeakThresholdDb
  };
}

export function decideAudioOptimization(metrics: AudioQualityMetrics): AudioOptimizationDecision {
  const reasons: string[] = [];
  if (metrics.isLikelyTooQuiet) {
    reasons.push("low_mean_volume");
  }
  if (metrics.hasClippingRisk) {
    reasons.push("clipping_risk");
  }

  // Even well-behaved audio benefits from a deterministic mono/16k transcode
  // before provider upload, but reasons preserve whether quality issues existed.
  return {
    shouldOptimize: true,
    reasons
  };
}

export function buildAudioOptimizationFilter(options: Pick<
  AudioPreflightOptions,
  "targetMeanVolumeDb" | "highpassHz" | "lowpassHz"
>) {
  return [
    `highpass=f=${options.highpassHz}`,
    `lowpass=f=${options.lowpassHz}`,
    `dynaudnorm=f=150:g=15:p=0.95:m=10`,
    `loudnorm=I=${options.targetMeanVolumeDb}:TP=-1.5:LRA=11`
  ].join(",");
}

async function probeAudioQuality(sourcePath: string, options: AudioPreflightOptions) {
  const { stderr } = await execFileAsync(
    "ffmpeg",
    [
      "-hide_banner",
      "-nostats",
      "-i",
      sourcePath,
      "-af",
      "volumedetect",
      "-f",
      "null",
      "-"
    ],
    { windowsHide: true }
  );

  return parseAudioQualityMetrics(stderr, options);
}

async function optimizeAudioFile(params: {
  sourcePath: string;
  targetPath: string;
  options: AudioPreflightOptions;
}) {
  await execFileAsync(
    "ffmpeg",
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      params.sourcePath,
      "-vn",
      "-ac",
      "1",
      "-ar",
      String(params.options.targetSampleRate),
      "-af",
      buildAudioOptimizationFilter(params.options),
      "-acodec",
      "libmp3lame",
      "-b:a",
      "64k",
      "-f",
      "mp3",
      "-y",
      params.targetPath
    ],
    { windowsHide: true }
  );
}

export async function runAudioPreflight(params: {
  audioBuffer: Buffer;
  sourceObjectKey: string;
  options: AudioPreflightOptions;
}): Promise<AudioPreflightResult> {
  const originalFileName = params.sourceObjectKey.split("/").pop() || "audio.bin";
  if (!params.options.enabled) {
    return {
      audioBuffer: params.audioBuffer,
      fileName: originalFileName,
      optimized: false,
      metrics: {
        meanVolumeDb: null,
        maxVolumeDb: null,
        isLikelyTooQuiet: false,
        hasClippingRisk: false
      },
      reasons: ["disabled"]
    };
  }

  const workspaceDir = await mkdtemp(join(tmpdir(), "voxora-audio-preflight-"));
  const extension = extname(originalFileName).replace(/[^a-zA-Z0-9.]/g, "") || ".bin";
  const sourcePath = join(workspaceDir, `source-${randomUUID()}${extension}`);
  const targetPath = join(workspaceDir, "optimized.mp3");

  await writeFile(sourcePath, params.audioBuffer);
  try {
    const metrics = await probeAudioQuality(sourcePath, params.options);
    const decision = decideAudioOptimization(metrics);
    if (!decision.shouldOptimize) {
      return {
        audioBuffer: params.audioBuffer,
        fileName: originalFileName,
        optimized: false,
        metrics,
        reasons: decision.reasons
      };
    }

    await optimizeAudioFile({
      sourcePath,
      targetPath,
      options: params.options
    });

    return {
      audioBuffer: await readFile(targetPath),
      fileName: originalFileName.replace(/\.[^.]+$/, "") + ".optimized.mp3",
      optimized: true,
      metrics,
      reasons: decision.reasons
    };
  } finally {
    await rm(workspaceDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
