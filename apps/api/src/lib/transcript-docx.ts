import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun
} from "docx";
import type { OrganizedTranscriptDocument } from "./transcript-organization";

export type DocxTranscriptSegment = {
  segmentIndex: number;
  startSec: number | null;
  endSec: number | null;
  text: string;
  speakerLabel?: string | null;
};

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

function joinSegmentsAsProse(segments: DocxTranscriptSegment[]) {
  const parts: string[] = [];

  for (const segment of segments) {
    const text = segment.text.trim();
    if (!text) continue;

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

export async function renderTranscriptDocxBuffer(params: {
  title: string;
  sourceObjectKey?: string;
  variantLabel: string;
  language: string;
  durationSeconds: number | null;
  segments: DocxTranscriptSegment[];
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
    sections: [{ properties: {}, children }]
  });

  return Packer.toBuffer(document);
}
