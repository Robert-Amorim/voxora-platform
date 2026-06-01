import type { WhisperSegment } from "./provider-openai";
import { applyDiarizationToSegments, callDiarizerService } from "../diarizer";

export async function applyExternalDiarization(params: {
  diarizerUrl?: string;
  timeoutMs: number;
  audioBuffer: Buffer;
  fileName: string;
  segments: WhisperSegment[];
}) {
  if (!params.diarizerUrl || params.segments.length === 0) {
    return {
      segments: params.segments,
      speakerMode: "none" as const,
      speakersDetected: 0
    };
  }

  const diarization = await callDiarizerService({
    serviceUrl: params.diarizerUrl,
    audioBuffer: params.audioBuffer,
    fileName: params.fileName,
    timeoutMs: params.timeoutMs
  });

  return {
    segments: applyDiarizationToSegments(params.segments, diarization),
    speakerMode: "external" as const,
    speakersDetected: new Set(diarization.map((entry) => entry.speaker)).size
  };
}
