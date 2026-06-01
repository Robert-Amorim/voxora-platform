import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const require = createRequire(import.meta.url);

function loadModule(path) {
  try {
    return require(resolve(path));
  } catch (error) {
    throw new Error(
      `Failed to load ${path}. Run npm run build before the unit tests.\n${error instanceof Error ? error.message : String(error)}`
    );
  }
}

const {
  assertManualSegmentMergeCompatible,
  resolveOpenAiModelCapability,
  selectTranscriptionStrategy
} = loadModule("apps/worker/dist/lib/transcription/strategy-selector.js");
const { buildChunkPrompt } = loadModule("apps/worker/dist/lib/transcription/prompt-policy.js");
const { mergeChunkSegments } = loadModule("apps/worker/dist/lib/transcription/segment-merge.js");
const { renderTranscriptText } = loadModule("apps/worker/dist/lib/transcript-artifacts.js");

let passed = 0;

{
  const selected = selectTranscriptionStrategy({
    audioBytes: 10 * 1024 * 1024,
    maxFileBytes: 25 * 1024 * 1024,
    diarizationEnabled: false,
    models: {
      directTranscriptModel: "gpt-4o-transcribe",
      directDiarizeModel: "gpt-4o-transcribe-diarize",
      chunkedTranscriptModel: "whisper-1"
    }
  });
  assert.equal(selected.strategy, "direct_transcript");
  assert.equal(selected.model, "gpt-4o-transcribe");
  passed++;
  console.log("  ✓ short audio without diarization selects direct_transcript");
}

{
  const selected = selectTranscriptionStrategy({
    audioBytes: 10 * 1024 * 1024,
    maxFileBytes: 25 * 1024 * 1024,
    diarizationEnabled: true,
    models: {
      directTranscriptModel: "gpt-4o-transcribe",
      directDiarizeModel: "gpt-4o-transcribe-diarize",
      chunkedTranscriptModel: "whisper-1"
    }
  });
  assert.equal(selected.strategy, "direct_diarized");
  assert.equal(selected.model, "gpt-4o-transcribe-diarize");
  passed++;
  console.log("  ✓ short audio with diarization selects direct_diarized");
}

{
  const selected = selectTranscriptionStrategy({
    audioBytes: 40 * 1024 * 1024,
    maxFileBytes: 25 * 1024 * 1024,
    diarizationEnabled: false,
    models: {
      directTranscriptModel: "gpt-4o-transcribe",
      directDiarizeModel: "gpt-4o-transcribe-diarize",
      chunkedTranscriptModel: "whisper-1"
    }
  });
  assert.equal(selected.strategy, "chunked_transcript");
  assert.equal(selected.model, "whisper-1");
  passed++;
  console.log("  ✓ large audio selects chunked_transcript");
}

{
  const selected = selectTranscriptionStrategy({
    audioBytes: 40 * 1024 * 1024,
    maxFileBytes: 25 * 1024 * 1024,
    diarizationEnabled: true,
    models: {
      directTranscriptModel: "gpt-4o-transcribe",
      directDiarizeModel: "gpt-4o-transcribe-diarize",
      chunkedTranscriptModel: "whisper-1"
    }
  });
  assert.equal(selected.strategy, "chunked_diarized");
  assert.equal(selected.model, "whisper-1");
  passed++;
  console.log("  ✓ large audio with diarization selects chunked_diarized");
}

{
  assert.throws(
    () => assertManualSegmentMergeCompatible(resolveOpenAiModelCapability("gpt-4o-transcribe")),
    /incompatible with manual chunk merging/
  );
  passed++;
  console.log("  ✓ models without timestamps are blocked from manual merge");
}

{
  const prompt = buildChunkPrompt({
    capability: resolveOpenAiModelCapability("whisper-1"),
    transcriptionHints: "Voxora OpenAI BullMQ diarizacao mercado pago Oracle Cloud Integrar Tech",
    previousTranscriptText:
      "Na reuniao anterior discutimos o fallback para chunking manual com overlap e deduplicacao de segmentos."
  });
  assert.ok(prompt);
  assert.ok(prompt.includes("Voxora"));
  assert.ok(prompt.split(", ").length <= 180);
  passed++;
  console.log("  ✓ whisper chunk prompt keeps a compact keyword list");
}

{
  const merged = mergeChunkSegments({
    existingSegments: [
      {
        chunkIndex: 0,
        startSec: 0,
        endSec: 4.8,
        text: "Bom dia pessoal, vamos revisar o pipeline de transcricao."
      }
    ],
    chunkSegments: [
      {
        chunkIndex: 0,
        startSec: 0.2,
        endSec: 5.0,
        text: "Bom dia pessoal, vamos revisar o pipeline de transcricao e a deduplicacao."
      },
      {
        chunkIndex: 1,
        startSec: 5.1,
        endSec: 8.0,
        text: "Depois seguimos para o rollout."
      }
    ],
    chunkWindow: {
      index: 1,
      startSec: 4.0,
      endSec: 9.0,
      trimOverlapSec: 0
    }
  });
  assert.equal(merged.length, 2);
  assert.match(merged[0].text, /deduplicacao/);
  assert.match(merged[1].text, /rollout/);
  passed++;
  console.log("  ✓ overlap merge deduplicates similar boundary segments");
}

{
  const text = renderTranscriptText({
    id: "job-1",
    sourceObjectKey: "uploads/audio.mp3",
    language: "pt-BR",
    variantLabel: "Original",
    durationSeconds: 12,
    segments: [
      { segmentIndex: 0, startSec: 0, endSec: 2, text: "Eu copiei esse", speakerLabel: null },
      { segmentIndex: 1, startSec: 2, endSec: 3, text: "link...", speakerLabel: null },
      { segmentIndex: 2, startSec: 3, endSec: 5, text: "mas eu nao consegui.", speakerLabel: null }
    ]
  });
  assert.match(text, /--- Transcricao Corrida ---/);
  assert.match(text, /Eu copiei esse link\.\.\. mas eu nao consegui\./);
  assert.match(text, /--- Segmentos ---/);
  passed++;
  console.log("  ✓ txt artifact includes continuous prose before segmented lines");
}

console.log(`\n[test:transcription-refactor] All ${passed} tests passed.`);
