import {
  AlignmentType, BorderStyle, Document, Footer, Header, ImageRun, PageNumber,
  Packer, Paragraph, TabStopType, TextRun,
} from "docx";

export type DocType = "spec" | "proposal" | "protocol" | "letter";

export interface DocMeta {
  docId: string;
  title: string;
  author: string;
  date: string;
  status: "draft" | "final";
  type: DocType;
}

export interface DocImages {
  dashPng: string;
  barcodePng: string;
  sealPng?: string;
  signaturePng?: string;
}

export const DOC_TYPE_LABEL: Record<DocType, string> = {
  spec: "СПЕЦИФИКАЦИЯ",
  proposal: "КОММЕРЧЕСКОЕ ПРЕДЛОЖЕНИЕ",
  protocol: "ПРОТОКОЛ",
  letter: "ПИСЬМО",
};

const GRAPHITE_900 = "101214";
const GRAPHITE_800 = "1B1F23";
const GRAPHITE_500 = "5A626B";
const GRAPHITE_400 = "7C858F";
const GRAPHITE_200 = "CBD0D5";
const AMBER = "F5A623";
const AMBER_TEXT = "D98E04";
const SANS = "IBM Plex Sans";
const MONO = "IBM Plex Mono";

const b64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

function wordmark(dashPng: string, size: number, dashW: number, dashH: number): TextRun[] {
  return [
    new TextRun({ text: "v", font: MONO, bold: true, size, color: GRAPHITE_900 }),
    new ImageRun({ type: "png", data: b64(dashPng), transformation: { width: dashW, height: dashH } }) as unknown as TextRun,
    new TextRun({ text: "b", font: MONO, bold: true, size, color: GRAPHITE_900 }),
    new TextRun({ text: ".tech", font: MONO, bold: true, size, color: GRAPHITE_400 }),
  ];
}

const hairline = (color: string, size: number) => ({ style: BorderStyle.SINGLE, size, color });

export async function buildDocx(meta: DocMeta, images: DocImages): Promise<Uint8Array> {
  const approvalChildren: Paragraph[] = [];
  if (images.sealPng || images.signaturePng) {
    const runs: (ImageRun | TextRun)[] = [];
    if (images.signaturePng)
      runs.push(new ImageRun({ type: "png", data: b64(images.signaturePng), transformation: { width: 170, height: 108 } }));
    if (images.sealPng)
      runs.push(new ImageRun({ type: "png", data: b64(images.sealPng), transformation: { width: 130, height: 130 } }));
    approvalChildren.push(new Paragraph({ spacing: { before: 500 }, children: runs }));
  }
  approvalChildren.push(
    new Paragraph({
      spacing: { before: images.sealPng || images.signaturePng ? 60 : 900, after: 40 },
      border: { top: hairline(GRAPHITE_500, 6) },
      children: [],
    }),
    new Paragraph({
      children: [new TextRun({
        text: `${meta.author} · v-b.tech`, font: MONO, size: 14,
        color: GRAPHITE_500, allCaps: true, characterSpacing: 20,
      })],
    }),
  );

  const doc = new Document({
    creator: meta.author,
    title: `${meta.docId} — ${meta.title}`,
    styles: {
      default: {
        document: {
          run: { font: SANS, size: 21, color: GRAPHITE_800 },
          paragraph: { spacing: { line: 330, after: 140 } },
        },
      },
    },
    sections: [{
      properties: {
        titlePage: true,
        page: { margin: { top: 1500, bottom: 1500, left: 1250, right: 1250, header: 560, footer: 480 } },
      },
      headers: {
        first: new Header({
          children: [
            new Paragraph({
              tabStops: [{ type: TabStopType.RIGHT, position: 9750 }],
              spacing: { after: 60 },
              children: [
                ...wordmark(images.dashPng, 30, 14, 20),
                new TextRun({ text: "\t" }),
                new TextRun({
                  text: "software for physical operations", font: MONO, size: 14,
                  color: GRAPHITE_400, allCaps: true, characterSpacing: 30,
                }),
              ],
            }),
            new Paragraph({ border: { bottom: hairline(GRAPHITE_900, 6) }, spacing: { after: 0 }, children: [] }),
          ],
        }),
        default: new Header({
          children: [new Paragraph({
            tabStops: [{ type: TabStopType.RIGHT, position: 9750 }],
            border: { bottom: hairline(GRAPHITE_200, 4) },
            spacing: { after: 60 },
            children: [
              ...wordmark(images.dashPng, 20, 9, 13),
              new TextRun({ text: "\t" }),
              new TextRun({
                text: meta.docId, font: MONO, size: 13, color: GRAPHITE_400,
                allCaps: true, characterSpacing: 30,
              }),
            ],
          })],
        }),
      },
      footers: {
        first: buildFooter(images.barcodePng, meta),
        default: buildFooter(images.barcodePng, meta),
      },
      children: [
        new Paragraph({
          spacing: { before: 240, after: 120 },
          children: [new TextRun({
            text: `${DOC_TYPE_LABEL[meta.type]} · ${meta.docId}`, font: MONO, size: 17,
            color: AMBER_TEXT, allCaps: true, characterSpacing: 40,
          })],
        }),
        new Paragraph({
          spacing: { after: 160, line: 240 },
          children: [new TextRun({ text: meta.title, font: SANS, size: 56, bold: true, color: GRAPHITE_900 })],
        }),
        new Paragraph({
          spacing: { after: 480 },
          children: [
            new TextRun({ text: `${meta.docId}   ·   ${meta.author}   ·   ${meta.date}   ·   `, font: MONO, size: 16, color: GRAPHITE_500 }),
            new TextRun({ text: meta.status === "draft" ? "v0.1 draft" : "final", font: MONO, size: 16, color: meta.status === "draft" ? AMBER_TEXT : GRAPHITE_500 }),
          ],
        }),
        new Paragraph({ children: [new TextRun({ text: "Текст документа начинается здесь.", color: GRAPHITE_500 })] }),
        ...approvalChildren,
      ],
    }],
  });
  const blob = await Packer.toBlob(doc);
  return new Uint8Array(await blob.arrayBuffer());
}

function buildFooter(barcodePng: string, meta: DocMeta): Footer {
  return new Footer({
    children: [
      new Paragraph({
        spacing: { before: 60, after: 80 },
        children: [new ImageRun({ type: "png", data: b64(barcodePng), transformation: { width: 500, height: 20 } })],
      }),
      new Paragraph({
        tabStops: [{ type: TabStopType.RIGHT, position: 9750 }],
        spacing: { after: 0 },
        children: [
          new TextRun({
            text: `${meta.docId} · v-b.tech`, font: MONO, size: 13, color: GRAPHITE_400,
            allCaps: true, characterSpacing: 20,
          }),
          new TextRun({ text: "\t" }),
          new TextRun({ children: ["стр. ", PageNumber.CURRENT, " / ", PageNumber.TOTAL_PAGES], font: MONO, size: 14, color: GRAPHITE_500 }),
        ],
      }),
    ],
  });
}
