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
  buildAudioOptimizationFilter,
  decideAudioOptimization,
  parseAudioQualityMetrics
} = loadModule("apps/worker/dist/lib/transcription/audio-preflight.js");
const {
  calculateWordErrorRate,
  evaluateTranscriptFidelity,
  normalizeTranscriptForComparison
} = loadModule("apps/worker/dist/lib/transcription/fidelity.js");

let passed = 0;

{
  const metrics = parseAudioQualityMetrics(
    "[Parsed_volumedetect_0] mean_volume: -38.5 dB\n[Parsed_volumedetect_0] max_volume: -8.1 dB",
    {
      quietMeanThresholdDb: -32,
      clippingPeakThresholdDb: -1
    }
  );
  assert.equal(metrics.meanVolumeDb, -38.5);
  assert.equal(metrics.maxVolumeDb, -8.1);
  assert.equal(metrics.isLikelyTooQuiet, true);
  assert.equal(metrics.hasClippingRisk, false);
  passed++;
  console.log("  ✓ audio metrics detect quiet audio");
}

{
  const metrics = parseAudioQualityMetrics(
    "[Parsed_volumedetect_0] mean_volume: -16.2 dB\n[Parsed_volumedetect_0] max_volume: -0.2 dB",
    {
      quietMeanThresholdDb: -32,
      clippingPeakThresholdDb: -1
    }
  );
  const decision = decideAudioOptimization(metrics);
  assert.equal(metrics.hasClippingRisk, true);
  assert.ok(decision.shouldOptimize);
  assert.deepEqual(decision.reasons, ["clipping_risk"]);
  passed++;
  console.log("  ✓ audio decision records clipping risk");
}

{
  const filter = buildAudioOptimizationFilter({
    targetMeanVolumeDb: -18,
    highpassHz: 80,
    lowpassHz: 7600
  });
  assert.match(filter, /highpass=f=80/);
  assert.match(filter, /lowpass=f=7600/);
  assert.match(filter, /dynaudnorm/);
  assert.match(filter, /loudnorm=I=-18/);
  passed++;
  console.log("  ✓ audio optimization filter includes speech-focused stages");
}

{
  const normalized = normalizeTranscriptForComparison("Olá, Voxora! Transcrição 100% fiel.");
  assert.equal(normalized, "ola voxora transcricao 100 fiel");
  passed++;
  console.log("  ✓ transcript fidelity normalization removes punctuation and accents");
}

{
  const wer = calculateWordErrorRate(
    "eu copiei esse link mas nao consegui abrir",
    "eu copiei esse link mas consegui abrir"
  );
  assert.equal(Number(wer.toFixed(3)), 0.125);
  passed++;
  console.log("  ✓ word error rate catches one deletion");
}

{
  const result = evaluateTranscriptFidelity({
    referenceText: "a reuniao comecou as nove horas e terminou com proximos passos claros",
    hypothesisText: "a reuniao comecou as nove horas e terminou com proximos passos",
    maxWordErrorRate: 0.2
  });
  assert.equal(result.passed, true);
  assert.ok(result.similarity >= 0.8);
  assert.equal(result.referenceWordCount, 12);
  passed++;
  console.log("  ✓ transcript fidelity passes within configured threshold");
}

console.log(`\n[test:transcription-quality] All ${passed} tests passed.`);
