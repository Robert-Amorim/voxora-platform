export type TranscriptOrganizationSegment = {
  segmentIndex: number;
  startSec: number | null;
  endSec: number | null;
  text: string;
  speakerLabel?: string | null;
};

export type OrganizedTranscriptDocument = {
  paragraphs: Array<{
    speakerLabel: string | null;
    startSec: number | null;
    endSec: number | null;
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

function segmentToPayload(segment: TranscriptOrganizationSegment) {
  return {
    segmentIndex: segment.segmentIndex,
    speakerLabel: segment.speakerLabel ?? null,
    startSec: segment.startSec,
    endSec: segment.endSec,
    timeRange: `${formatSeconds(segment.startSec)}-${formatSeconds(segment.endSec)}`,
    text: segment.text.trim()
  };
}

function splitIntoBatches(segments: TranscriptOrganizationSegment[]) {
  const batches: TranscriptOrganizationSegment[][] = [];
  let current: TranscriptOrganizationSegment[] = [];
  let currentChars = 0;

  for (const segment of segments) {
    const lineLength = segment.text.length + 80;
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
    paragraphs?: Array<{
      speakerLabel?: unknown;
      startSec?: unknown;
      endSec?: unknown;
      text?: unknown;
      body?: unknown;
    }>;
  };

  const paragraphs = Array.isArray(value.paragraphs)
    ? value.paragraphs
        .map((paragraph) => ({
          speakerLabel: typeof paragraph.speakerLabel === "string" && paragraph.speakerLabel.trim().length > 0
            ? paragraph.speakerLabel.trim()
            : null,
          startSec: typeof paragraph.startSec === "number" && Number.isFinite(paragraph.startSec)
            ? paragraph.startSec
            : null,
          endSec: typeof paragraph.endSec === "number" && Number.isFinite(paragraph.endSec)
            ? paragraph.endSec
            : null,
          body:
            typeof paragraph.body === "string"
              ? paragraph.body.trim()
              : typeof paragraph.text === "string"
                ? paragraph.text.trim()
                : ""
        }))
        .filter((paragraph) => paragraph.body.length > 0)
    : [];

  return { paragraphs };
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
              "Voce revisa transcricoes para leitura fiel em DOCX. Nao faca resumo, comentario, analise, conclusao, titulo opinativo ou explicacao. Nao adicione informacoes. Mantenha tudo que foi dito, preserve fatos, nomes, numeros, datas e ordem das ideias. Corrija somente pontuacao, capitalizacao, quebras de paragrafo e organizacao de falas. Remova apenas repeticoes muito leves ou vicios de linguagem quando isso nao alterar o sentido. Retorne somente JSON no formato {\"paragraphs\":[{\"speakerLabel\":string|null,\"startSec\":number|null,\"endSec\":number|null,\"text\":string}]}."
          },
          {
            role: "user",
            content: JSON.stringify({
              variant: options.variantLabel,
              language: options.language,
              instructions: [
                "Corrigir pontuacao.",
                "Quebrar em paragrafos.",
                "Organizar falas.",
                "Remover repeticoes muito leves quando nao mudam o sentido.",
                "Manter tudo que foi dito.",
                "Nao adicionar conclusoes, titulos opinativos, comentarios ou explicacoes."
              ],
              segments: batch.map(segmentToPayload)
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
    if (parsed.paragraphs.length === 0) {
      throw new Error("OpenAI organization response did not include paragraphs.");
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

  return {
    paragraphs: organizedBatches.flatMap((batch) => batch.paragraphs)
  };
}
