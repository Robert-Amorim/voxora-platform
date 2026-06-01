export type TranscriptionStrategy =
  | "direct_transcript"
  | "direct_diarized"
  | "chunked_transcript"
  | "chunked_diarized";

export type OpenAiModelCapability = {
  model: string;
  timingMode: "none" | "segment";
  speakerMode: "none" | "native";
  promptMode: "free_text" | "keyword_list" | "none";
  rawFormat: "text" | "json" | "verbose_json" | "diarized_json";
};

export type StrategyModels = {
  directTranscriptModel: string;
  directDiarizeModel: string;
  chunkedTranscriptModel: string;
};

export type SelectedTranscriptionStrategy = {
  strategy: TranscriptionStrategy;
  model: string;
  capability: OpenAiModelCapability;
};

export function resolveOpenAiModelCapability(model: string): OpenAiModelCapability {
  switch (model) {
    case "gpt-4o-transcribe-diarize":
      return {
        model,
        timingMode: "segment",
        speakerMode: "native",
        promptMode: "none",
        rawFormat: "diarized_json"
      };
    case "gpt-4o-transcribe":
    case "gpt-4o-mini-transcribe":
      return {
        model,
        timingMode: "none",
        speakerMode: "none",
        promptMode: "free_text",
        rawFormat: "text"
      };
    case "whisper-1":
    default:
      return {
        model,
        timingMode: "segment",
        speakerMode: "none",
        promptMode: "keyword_list",
        rawFormat: "verbose_json"
      };
  }
}

export function selectTranscriptionStrategy(params: {
  audioBytes: number;
  maxFileBytes: number;
  diarizationEnabled: boolean;
  models: StrategyModels;
}): SelectedTranscriptionStrategy {
  const requiresChunking = params.audioBytes > params.maxFileBytes;

  if (requiresChunking) {
    const model = params.models.chunkedTranscriptModel;
    return {
      strategy: params.diarizationEnabled ? "chunked_diarized" : "chunked_transcript",
      model,
      capability: resolveOpenAiModelCapability(model)
    };
  }

  if (params.diarizationEnabled) {
    const model = params.models.directDiarizeModel;
    return {
      strategy: "direct_diarized",
      model,
      capability: resolveOpenAiModelCapability(model)
    };
  }

  const model = params.models.directTranscriptModel;
  return {
    strategy: "direct_transcript",
    model,
    capability: resolveOpenAiModelCapability(model)
  };
}

export function assertManualSegmentMergeCompatible(capability: OpenAiModelCapability) {
  if (capability.timingMode !== "segment") {
    throw new Error(
      `Model ${capability.model} is incompatible with manual chunk merging because it does not return segment timestamps.`
    );
  }
}
