import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun
} from "docx";
import type { OrganizedTranscriptDocument } from "./transcript-organization";

export type TranscriptArtifactSegment = {
  segmentIndex: number;
  startSec: number | null;
  endSec: number | null;
  text: string;
  speakerLabel?: string | null;
};

function normalizePdfText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[^\x20-\x7E\u00A0-\u00FF]/g, "?")
    .replace(/\s+/g, " ")
    .trim();
}

function wrapText(value: string, maxChars = 88) {
  const words = value.split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return [""];
  }

  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }

  if (current) {
    lines.push(current);
  }

  return lines;
}

export function formatSrtTimestamp(seconds: number) {
  const totalMs = Math.max(0, Math.round(seconds * 1000));
  const hours = Math.floor(totalMs / 3600000);
  const minutes = Math.floor((totalMs % 3600000) / 60000);
  const secs = Math.floor((totalMs % 60000) / 1000);
  const millis = totalMs % 1000;
  return `${hours.toString().padStart(2, "0")}:${minutes
    .toString()
    .padStart(2, "0")}:${secs.toString().padStart(2, "0")},${millis
    .toString()
    .padStart(3, "0")}`;
}

function formatDuration(seconds: number | null) {
  if (seconds === null || !Number.isFinite(seconds)) {
    return "unknown";
  }

  const total = Math.max(0, Math.floor(seconds));
  const hh = Math.floor(total / 3600).toString().padStart(2, "0");
  const mm = Math.floor((total % 3600) / 60).toString().padStart(2, "0");
  const ss = Math.floor(total % 60).toString().padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function joinSegmentsAsProse(segments: TranscriptArtifactSegment[]) {
  const parts: string[] = [];

  for (const segment of segments) {
    const text = segment.text.trim();
    if (!text) {
      continue;
    }

    if (parts.length === 0) {
      parts.push(text);
      continue;
    }

    const previous = parts[parts.length - 1];
    const previousEndsWithHyphen = /[-\u2013\u2014]$/.test(previous);
    const previousEndsWithOpenPunctuation = /[(["']$/.test(previous);
    const currentStartsWithPunctuation = /^[,.;:!?)]/.test(text);

    if (previousEndsWithHyphen) {
      parts[parts.length - 1] = `${previous.slice(0, -1)}${text}`;
      continue;
    }

    if (previousEndsWithOpenPunctuation || currentStartsWithPunctuation) {
      parts[parts.length - 1] = `${previous}${text}`;
      continue;
    }

    parts.push(text);
  }

  return parts.join(" ").replace(/\s+/g, " ").trim();
}

function docxText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function metadataParagraph(label: string, value: string) {
  return new Paragraph({
    spacing: { after: 90 },
    children: [
      new TextRun({ text: `${label}: `, bold: true }),
      new TextRun(value)
    ]
  });
}

function addDocxBodyParagraphs(children: Paragraph[], body: string) {
  const lines = body
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  for (const line of lines) {
    const bulletMatch = line.match(/^[-*]\s+(.+)/);
    children.push(
      new Paragraph({
        spacing: { after: 110 },
        bullet: bulletMatch ? { level: 0 } : undefined,
        children: [new TextRun(bulletMatch ? bulletMatch[1] : line)]
      })
    );
  }
}

function addRevisedTranscriptParagraphs(
  children: Paragraph[],
  document: OrganizedTranscriptDocument
) {
  for (const paragraph of document.paragraphs) {
    const start = paragraph.startSec !== null ? formatDuration(paragraph.startSec) : null;
    const end = paragraph.endSec !== null ? formatDuration(paragraph.endSec) : null;
    const range = start && end ? `${start} - ${end}` : null;
    const header = [paragraph.speakerLabel, range].filter(Boolean).join(" · ");

    if (header) {
      children.push(
        new Paragraph({
          spacing: { before: 140, after: 60 },
          children: [
            new TextRun({
              text: header,
              bold: true,
              color: "1D4ED8"
            })
          ]
        })
      );
    }

    addDocxBodyParagraphs(children, paragraph.body);
  }
}

export function renderTranscriptText(params: {
  id: string;
  sourceObjectKey: string;
  language: string;
  variantLabel: string;
  durationSeconds: number | null;
  segments: TranscriptArtifactSegment[];
}) {
  const header = [
    `Job: ${params.id}`,
    `Variant: ${params.variantLabel}`,
    `Language: ${params.language}`,
    `Source: ${params.sourceObjectKey}`,
    `Duration: ${formatDuration(params.durationSeconds)}`,
    ""
  ];
  const prose = joinSegmentsAsProse(params.segments);

  const lines = params.segments.map((segment) => {
    const start =
      segment.startSec !== null ? `${segment.startSec.toFixed(3)}s` : "unknown";
    const end = segment.endSec !== null ? `${segment.endSec.toFixed(3)}s` : "unknown";
    const speaker = segment.speakerLabel ? `${segment.speakerLabel}: ` : "";
    return `[${start} - ${end}] ${speaker}${segment.text.trim()}`;
  });

  const body = prose.length > 0
    ? ["--- Transcricao Corrida ---", prose, "", "--- Segmentos ---", ...lines, ""]
    : ["--- Segmentos ---", ...lines, ""];

  return [...header, ...body].join("\n");
}

export function renderSrtText(segments: TranscriptArtifactSegment[]) {
  return segments
    .map((segment, index) => {
      const previous = index > 0 ? segments[index - 1] : null;
      const fallbackStart = previous?.endSec ?? index * 5;
      const start = segment.startSec ?? fallbackStart;
      const end =
        segment.endSec ??
        (segment.startSec !== null ? segment.startSec + 5 : fallbackStart + 5);
      const speakerPrefix = segment.speakerLabel ? `${segment.speakerLabel}: ` : "";

      return [
        String(index + 1),
        `${formatSrtTimestamp(start)} --> ${formatSrtTimestamp(Math.max(end, start + 0.5))}`,
        `${speakerPrefix}${segment.text.trim()}`,
        ""
      ].join("\n");
    })
    .join("\n");
}

export async function renderPdfBuffer(params: {
  title: string;
  variantLabel: string;
  language: string;
  durationSeconds: number | null;
  segments: TranscriptArtifactSegment[];
}) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdf.embedFont(StandardFonts.HelveticaBold);

  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const margin = 44;
  const lineHeight = 15;

  let page = pdf.addPage([pageWidth, pageHeight]);
  let cursorY = pageHeight - margin;

  const ensureSpace = (requiredHeight: number) => {
    if (cursorY - requiredHeight > margin) {
      return;
    }
    page = pdf.addPage([pageWidth, pageHeight]);
    cursorY = pageHeight - margin;
  };

  const drawLine = (text: string, fontSize = 11, useBold = false, color = rgb(0.15, 0.23, 0.31)) => {
    ensureSpace(lineHeight + 2);
    page.drawText(normalizePdfText(text), {
      x: margin,
      y: cursorY,
      size: fontSize,
      font: useBold ? boldFont : font,
      color
    });
    cursorY -= lineHeight;
  };

  drawLine(params.title, 18, true, rgb(0.1, 0.16, 0.23));
  cursorY -= 4;
  drawLine(`Variante: ${params.variantLabel}`, 10, false, rgb(0.37, 0.45, 0.55));
  drawLine(`Idioma: ${params.language}`, 10, false, rgb(0.37, 0.45, 0.55));
  drawLine(`Duracao: ${formatDuration(params.durationSeconds)}`, 10, false, rgb(0.37, 0.45, 0.55));
  cursorY -= 8;

  for (const segment of params.segments) {
    const start =
      segment.startSec !== null ? formatDuration(segment.startSec) : "--:--:--";
    const end = segment.endSec !== null ? formatDuration(segment.endSec) : "--:--:--";
    const prefix = segment.speakerLabel ? `${segment.speakerLabel} · ${start} - ${end}` : `${start} - ${end}`;
    drawLine(prefix, 10, true, rgb(0.13, 0.36, 0.74));

    for (const line of wrapText(segment.text.trim())) {
      drawLine(line, 10, false, rgb(0.15, 0.23, 0.31));
    }
    cursorY -= 6;
  }

  return Buffer.from(await pdf.save());
}

export async function renderDocxBuffer(params: {
  title: string;
  sourceObjectKey?: string;
  variantLabel: string;
  language: string;
  durationSeconds: number | null;
  segments: TranscriptArtifactSegment[];
  organizedDocument?: OrganizedTranscriptDocument | null;
}) {
  const prose = joinSegmentsAsProse(params.segments);
  const children: Paragraph[] = [
    new Paragraph({
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: { after: 220 },
      children: [new TextRun(params.title)]
    }),
    metadataParagraph("Variante", params.variantLabel),
    metadataParagraph("Idioma", params.language),
    metadataParagraph("Duracao", formatDuration(params.durationSeconds))
  ];

  if (params.sourceObjectKey) {
    children.push(metadataParagraph("Arquivo de origem", params.sourceObjectKey));
  }

  if (params.organizedDocument && params.organizedDocument.paragraphs.length > 0) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 280, after: 120 },
        children: [new TextRun("Transcricao revisada para leitura")]
      }),
      new Paragraph({
        spacing: { after: 180 },
        children: [
          new TextRun({
            text:
              "Esta secao corrige pontuacao, paragrafos e organizacao das falas sem resumir, comentar ou adicionar informacoes. Use a transcricao fiel abaixo para conferencia.",
            italics: true,
            color: "64748B"
          })
        ]
      })
    );

    addRevisedTranscriptParagraphs(children, params.organizedDocument);
  }

  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 280, after: 160 },
      children: [new TextRun("Transcricao corrida")]
    }),
    new Paragraph({
      spacing: { after: 220 },
      children: [
        new TextRun(
          prose || "Nao ha texto corrido disponivel para esta transcricao."
        )
      ]
    }),
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 260, after: 160 },
      children: [new TextRun("Segmentos com horarios")]
    })
  );

  for (const segment of params.segments) {
    const start = segment.startSec !== null ? formatDuration(segment.startSec) : "--:--:--";
    const end = segment.endSec !== null ? formatDuration(segment.endSec) : "--:--:--";
    const speaker = segment.speakerLabel ?? `Segmento ${segment.segmentIndex + 1}`;
    children.push(
      new Paragraph({
        spacing: { before: 140, after: 70 },
        children: [
          new TextRun({
            text: `${speaker} · ${start} - ${end}`,
            bold: true,
            color: "1D4ED8"
          })
        ]
      }),
      new Paragraph({
        spacing: { after: 100 },
        children: [new TextRun(docxText(segment.text))]
      })
    );
  }

  const document = new Document({
    creator: "Voxora",
    description: "Transcricao exportada pela Voxora",
    title: params.title,
    sections: [
      {
        properties: {},
        children
      }
    ]
  });

  return Packer.toBuffer(document);
}
