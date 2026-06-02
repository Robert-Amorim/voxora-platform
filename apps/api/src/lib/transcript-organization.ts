export type TranscriptOrganizationSegment = {
  segmentIndex: number;
  startSec: number | null;
  endSec: number | null;
  text: string;
  speakerLabel?: string | null;
};

export type OrganizedTranscriptDocument = {
  title: string | null;
  sections: Array<{
    heading: string;
    body: string;
  }>;
};

export type TranscriptOrganizationOptions = {
  enabled: boolean;
  apiKey: string | null;
  baseUrl: string;
  model: string;
  timeoutMs: number;
  variantLabel: string;
  language: string;
  segments: TranscriptOrganizationSegment[];
};

const MAX_BATCH_CHARS = 12000;

function formatSeconds(seconds: number | null) {
  if (seconds === null || !Number.isFinite(seconds)) {
    return "--:--:--";
  }

  const total = Math.max(0, Math.floor(seconds));
  const hh = Math.floor(total / 3600).toString().padStart(2, "0");
  const mm = Math.floor((total % 3600) / 60).toString().padStart(2, "0");
  const ss = Math.floor(total % 60).toString().padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function segmentToLine(segment: TranscriptOrganizationSegment) {
  const speaker = segment.speakerLabel ? `${segment.speakerLabel} ` : "";
  const range = `${formatSeconds(segment.startSec)}-${formatSeconds(segment.endSec)}`;
  return `[${range}] ${speaker}${segment.text.trim()}`.trim();
}

function splitIntoBatches(segments: TranscriptOrganizationSegment[]) {
  const batches: TranscriptOrganizationSegment[][] = [];
  let current: TranscriptOrganizationSegment[] = [];
  let currentChars = 0;

  for (const segment of segments) {
    const lineLength = segmentToLine(segment).length + 1;
    if (current.length > 0 && currentChars + lineLength > MAX_BATCH_CHARS) {
      batches.push(current);
      current = [];
      currentChars = 0;
    }

    current.push(segment);
    currentChars += lineLength;
  }

  if (current.length > 0) {
    batches.push(current);
  }

  return batches;
}

function extractJsonObject(raw: string) {
  const trimmed = raw.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }

  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first >= 0 && last > first) {
    return trimmed.slice(first, last + 1);
  }

  throw new Error("OpenAI organization response did not contain a JSON object.");
}

function normalizeOrganization(payload: unknown) {
  const value = payload as {
    title?: unknown;
    sections?: Array<{ heading?: unknown; body?: unknown }>;
  };

  const sections = Array.isArray(value.sections)
    ? value.sections
        .map((section) => ({
          heading: typeof section.heading === "string" ? section.heading.trim() : "",
          body: typeof section.body === "string" ? section.body.trim() : ""
        }))
        .filter((section) => section.heading.length > 0 && section.body.length > 0)
    : [];

  return {
    title: typeof value.title === "string" && value.title.trim().length > 0
      ? value.title.trim()
      : null,
    sections
  };
}

async function organizeBatch(options: TranscriptOrganizationOptions, batch: TranscriptOrganizationSegment[]) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);

  try {
    const response = await fetch(`${options.baseUrl.replace(/\/+$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${options.apiKey}`
      },
      body: JSON.stringify({
        model: options.model,
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "Voce organiza transcricoes para documentos DOCX. Preserve todos os fatos, nomes, numeros, datas e a ordem das ideias. Nao invente informacoes, nao resuma de forma que remova conteudo importante e nao altere o sentido. Corrija apenas pontuacao, paragrafos, repeticoes leves e quebras de assunto. Retorne somente JSON no formato {\"title\":string,\"sections\":[{\"heading\":string,\"body\":string}]}."
          },
          {
            role: "user",
            content: JSON.stringify({
              variant: options.variantLabel,
              language: options.language,
              transcript: batch.map(segmentToLine).join("\n")
            })
          }
        ]
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`OpenAI organization request failed with status ${response.status}.`);
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("OpenAI organization response was empty.");
    }

    const parsed = normalizeOrganization(JSON.parse(extractJsonObject(content)));
    if (parsed.sections.length === 0) {
      throw new Error("OpenAI organization response did not include sections.");
    }

    return parsed;
  } finally {
    clearTimeout(timer);
  }
}

export async function organizeTranscriptForDocument(
  options: TranscriptOrganizationOptions
): Promise<OrganizedTranscriptDocument | null> {
  if (!options.enabled || !options.apiKey || options.segments.length === 0) {
    return null;
  }

  const batches = splitIntoBatches(options.segments);
  const organizedBatches = [];
  for (const batch of batches) {
    organizedBatches.push(await organizeBatch(options, batch));
  }

  const singleBatch = organizedBatches.length === 1;
  return {
    title: organizedBatches[0]?.title ?? null,
    sections: organizedBatches.flatMap((batch, index) =>
      batch.sections.map((section) => ({
        heading: singleBatch ? section.heading : `Parte ${index + 1} - ${section.heading}`,
        body: section.body
      }))
    )
  };
}
