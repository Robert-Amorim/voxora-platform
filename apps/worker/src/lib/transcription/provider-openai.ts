import { extname } from "node:path";
import type { OpenAiModelCapability } from "./strategy-selector";

export type WhisperSegment = {
  chunkIndex: number;
  startSec: number | null;
  endSec: number | null;
  text: string;
  speakerLabel?: string | null;
};

export type TranscriptionProviderResult = {
  text: string;
  durationSeconds: number | null;
  segments: WhisperSegment[];
  timingMode: "none" | "segment";
  speakerMode: "none" | "native" | "external";
  rawFormat: "text" | "json" | "verbose_json" | "diarized_json";
};

type OpenAiTranscriptionOptions = {
  apiKey: string;
  baseUrl: string;
  capability: OpenAiModelCapability;
  fileName: string;
  language?: string;
  prompt?: string;
  audioBuffer: Buffer;
  timeoutMs: number;
};

type OpenAiVerboseResponse = {
  text?: string;
  duration?: number;
  segments?: Array<{
    id?: number;
    start?: number;
    end?: number;
    text?: string;
  }>;
};

type OpenAiDiarizedResponse = {
  text?: string;
  segments?: Array<{
    speaker?: string;
    start?: number;
    end?: number;
    text?: string;
  }>;
};

function inferAudioMimeType(fileName: string) {
  switch (extname(fileName).toLowerCase()) {
    case ".mp3":
    case ".mpeg":
      return "audio/mpeg";
    case ".m4a":
      return "audio/mp4";
    case ".wav":
      return "audio/wav";
    case ".mp4":
      return "video/mp4";
    case ".webm":
      return "audio/webm";
    case ".ogg":
      return "audio/ogg";
    default:
      return "application/octet-stream";
  }
}

function normalizeVerboseSegments(rawSegments: OpenAiVerboseResponse["segments"]): WhisperSegment[] {
  if (!Array.isArray(rawSegments) || rawSegments.length === 0) {
    return [];
  }

  const segments: WhisperSegment[] = [];
  for (const raw of rawSegments) {
    const text = (raw.text ?? "").trim();
    if (!text) {
      continue;
    }

    segments.push({
      chunkIndex: segments.length,
      startSec: typeof raw.start === "number" && Number.isFinite(raw.start) ? raw.start : null,
      endSec: typeof raw.end === "number" && Number.isFinite(raw.end) ? raw.end : null,
      text
    });
  }
  return segments;
}

function normalizeDiarizedSegments(rawSegments: OpenAiDiarizedResponse["segments"]) {
  if (!Array.isArray(rawSegments) || rawSegments.length === 0) {
    return [];
  }

  const speakerMap = new Map<string, string>();
  const segments: WhisperSegment[] = [];
  for (const raw of rawSegments) {
    const text = (raw.text ?? "").trim();
    if (!text) {
      continue;
    }

    const apiSpeaker = (raw.speaker ?? "").trim();
    if (apiSpeaker && !speakerMap.has(apiSpeaker)) {
      speakerMap.set(apiSpeaker, `Falante ${speakerMap.size + 1}`);
    }

    segments.push({
      chunkIndex: segments.length,
      startSec: typeof raw.start === "number" && Number.isFinite(raw.start) ? raw.start : null,
      endSec: typeof raw.end === "number" && Number.isFinite(raw.end) ? raw.end : null,
      text,
      speakerLabel: apiSpeaker ? (speakerMap.get(apiSpeaker) ?? null) : null
    });
  }

  return segments;
}

function resolveDurationSeconds(rawDuration: unknown, segments: WhisperSegment[]) {
  if (typeof rawDuration === "number" && Number.isFinite(rawDuration) && rawDuration > 0) {
    return rawDuration;
  }

  const ends = segments
    .map((segment) => segment.endSec)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (ends.length === 0) {
    return null;
  }

  return Math.max(...ends);
}

export function isDiarizeModel(model: string) {
  return model === "gpt-4o-transcribe-diarize";
}

export async function transcribeWithOpenAi(
  options: OpenAiTranscriptionOptions
): Promise<TranscriptionProviderResult> {
  const url = `${options.baseUrl.replace(/\/+$/, "")}/audio/transcriptions`;
  const fileBytes = Uint8Array.from(options.audioBuffer);
  const file = new File([fileBytes], options.fileName, {
    type: inferAudioMimeType(options.fileName)
  });

  const formData = new FormData();
  formData.append("file", file);
  formData.append("model", options.capability.model);

  if (options.capability.rawFormat === "diarized_json") {
    formData.append("response_format", "diarized_json");
    formData.append("chunking_strategy", "auto");
    if (options.language && options.language.trim().length > 0) {
      formData.append("language", options.language);
    }
  } else if (options.capability.rawFormat === "text") {
    formData.append("response_format", "text");
    if (options.language && options.language.trim().length > 0) {
      formData.append("language", options.language);
    }
    if (options.prompt && options.prompt.trim().length > 0) {
      formData.append("prompt", options.prompt.trim());
    }
  } else {
    formData.append("response_format", "verbose_json");
    formData.append("temperature", "0");
    formData.append("timestamp_granularities[]", "segment");
    if (options.language && options.language.trim().length > 0) {
      formData.append("language", options.language);
    }
    if (options.prompt && options.prompt.trim().length > 0) {
      formData.append("prompt", options.prompt.trim());
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${options.apiKey}`
      },
      body: formData,
      signal: controller.signal
    });

    if (!response.ok) {
      const rawBody = await response.text().catch(() => "");
      throw new Error(
        `OpenAI transcription request failed (${response.status}): ${rawBody || response.statusText}`
      );
    }

    if (options.capability.rawFormat === "text") {
      const text = (await response.text()).trim();
      return {
        text,
        durationSeconds: null,
        segments: [],
        timingMode: "none",
        speakerMode: "none",
        rawFormat: "text"
      };
    }

    if (options.capability.rawFormat === "diarized_json") {
      const payload = (await response.json()) as OpenAiDiarizedResponse;
      const text = (payload.text ?? "").trim();
      const segments = normalizeDiarizedSegments(payload.segments);
      return {
        text,
        durationSeconds: resolveDurationSeconds(null, segments),
        segments,
        timingMode: "segment",
        speakerMode: "native",
        rawFormat: "diarized_json"
      };
    }

    const payload = (await response.json()) as OpenAiVerboseResponse;
    const text = (payload.text ?? "").trim();
    const segments = normalizeVerboseSegments(payload.segments);
    return {
      text,
      durationSeconds: resolveDurationSeconds(payload.duration, segments),
      segments,
      timingMode: "segment",
      speakerMode: "none",
      rawFormat: "verbose_json"
    };
  } finally {
    clearTimeout(timeout);
  }
}
