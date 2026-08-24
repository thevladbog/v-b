import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type { Browser, Page } from "@playwright/test";

const GENERATOR_VERSION = "1.0.0";
const MAILPIT_ORIGIN = "http://127.0.0.1:58025";
const MAILPIT_LABEL = "vbtech-task7-dedicated";
const MAILPIT_TAG = "vbtech-task7";
const DARK_STRATEGY = "controlled-local-email-client-emulation-v1";
const WORDMARK_URL = "https://v-b.tech/assets/vb-wordmark-email.png";
export const MAX_MAILPIT_JSON_RESPONSE_BYTES = 1_048_576;
export const MAX_EMAIL_HTML_CHARACTERS = 32_768;
export const MAX_EMAIL_HTML_UTF8_BYTES = 65_536;
export const MAX_EMAIL_TEXT_CHARACTERS = 8_192;
export const MAX_EMAIL_TEXT_UTF8_BYTES = 16_384;
export const MAX_RENDERED_DOCUMENT_WIDTH = 1_440;
export const MAX_RENDERED_DOCUMENT_HEIGHT = 2_048;
export const MAX_CAPTURE_PNG_BYTES = 524_288;
export const MAX_TOTAL_EVIDENCE_BYTES = 8_388_608;
export const MAX_CONTACT_SHEET_WIDTH = 1_280;
export const MAX_CONTACT_SHEET_HEIGHT = 4_096;
export const MAX_CONTACT_SHEET_BYTES = 4_194_304;

export const EMAIL_EVIDENCE_LIMITS = Object.freeze({
  mailpitJsonBytes: MAX_MAILPIT_JSON_RESPONSE_BYTES,
  htmlCharacters: MAX_EMAIL_HTML_CHARACTERS,
  htmlUtf8Bytes: MAX_EMAIL_HTML_UTF8_BYTES,
  textCharacters: MAX_EMAIL_TEXT_CHARACTERS,
  textUtf8Bytes: MAX_EMAIL_TEXT_UTF8_BYTES,
  documentWidth: MAX_RENDERED_DOCUMENT_WIDTH,
  documentHeight: MAX_RENDERED_DOCUMENT_HEIGHT,
  capturePngBytes: MAX_CAPTURE_PNG_BYTES,
  totalEvidenceBytes: MAX_TOTAL_EVIDENCE_BYTES,
  contactSheetWidth: MAX_CONTACT_SHEET_WIDTH,
  contactSheetHeight: MAX_CONTACT_SHEET_HEIGHT,
  contactSheetBytes: MAX_CONTACT_SHEET_BYTES,
});
const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
const evidenceDirectory = path.join(
  repositoryRoot,
  ".superpowers/sdd/2026-08-20-vbtech-contact-pipeline/task-7-evidence",
);
export const EMAIL_EVIDENCE_DIRECTORY = evidenceDirectory;

const exactKindsBySubject = {
  "We received your v-b.tech enquiry": "en-confirmation",
  "Ваше обращение с v-b.tech получено": "ru-confirmation",
} as const;

const notificationKindsByPrefix = {
  "New v-b.tech enquiry": "en-notification",
  "Новое обращение с v-b.tech": "ru-notification",
} as const;

type MessageKind =
  | (typeof exactKindsBySubject)[keyof typeof exactKindsBySubject]
  | (typeof notificationKindsByPrefix)[keyof typeof notificationKindsByPrefix];
type MessagePart = "html" | "text";
type PreviewMode = "light" | "dark";
type PreviewSize = "desktop" | "mobile";

interface MailpitSummary {
  ID: string;
  Subject: string;
  Tags: string[];
}

interface MailpitMessage extends MailpitSummary {
  HTML: string;
  Text: string;
}

export const classifyContactEmailSubject = (subject: string): MessageKind => {
  const exact = exactKindsBySubject[subject as keyof typeof exactKindsBySubject];
  if (exact) return exact;

  for (const [prefix, kind] of Object.entries(notificationKindsByPrefix)) {
    if (subject === prefix) return kind;
    const separator = `${prefix} — `;
    if (subject.startsWith(separator)) {
      const contact = subject.slice(separator.length);
      if (contact.length >= 1 && contact.length <= 254 && !/\p{Cc}/u.test(contact)) return kind;
    }
  }
  throw new Error("email_subject_invalid");
};

export interface EmailAcceptanceCapture {
  kind: MessageKind;
  part: MessagePart;
  size: PreviewSize;
  mode: PreviewMode;
  file: string;
  viewport: { width: number; height: number };
  contentCharacters: number;
  contentUtf8Bytes: number;
  documentWidth: number;
  documentHeight: number;
  imageWidth: number;
  imageHeight: number;
  fileBytes: number;
  requestId: string;
  links: string[];
  contentSha256: string;
  pixelSha256: string;
  modeApplied: boolean;
  minimumContrast: number;
}

export interface EmailAcceptanceContactSheet {
  file: string;
  pixelSha256: string;
  documentWidth: number;
  documentHeight: number;
  imageWidth: number;
  imageHeight: number;
  fileBytes: number;
}

export interface EmailAcceptanceResult {
  generatorVersion: string;
  previewStrategy: string;
  mailpitLabel: string;
  mailpitVersion: string;
  kinds: MessageKind[];
  captures: EmailAcceptanceCapture[];
  externalRequests: string[];
  limits: typeof EMAIL_EVIDENCE_LIMITS;
  contactSheet: EmailAcceptanceContactSheet;
  totalEvidenceBytes: number;
}

const sha256 = (value: string | Uint8Array): string =>
  createHash("sha256").update(value).digest("hex");

const utf8Bytes = (value: string): number => Buffer.byteLength(value, "utf8");

const unicodeCharacters = (value: string): number => {
  let count = 0;
  for (const _character of value) count += 1;
  return count;
};

export const readBoundedJsonResponse = async (response: Response): Promise<unknown> => {
  const declaredLength = response.headers.get("content-length");
  if (declaredLength !== null) {
    const parsedLength = Number(declaredLength);
    if (!Number.isSafeInteger(parsedLength) || parsedLength < 0) {
      throw new Error("mailpit_content_length_invalid");
    }
    if (parsedLength > MAX_MAILPIT_JSON_RESPONSE_BYTES) {
      throw new Error("mailpit_json_response_too_large");
    }
  }
  if (!response.body) throw new Error("mailpit_json_invalid");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      totalBytes += next.value.byteLength;
      if (totalBytes > MAX_MAILPIT_JSON_RESPONSE_BYTES) {
        await reader.cancel();
        throw new Error("mailpit_json_response_too_large");
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks, totalBytes));
  } catch {
    throw new Error("mailpit_json_invalid");
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error("mailpit_json_invalid");
  }
};

export const assertEmailBodyBounds = (
  html: string,
  text: string,
): {
  htmlCharacters: number;
  htmlUtf8Bytes: number;
  textCharacters: number;
  textUtf8Bytes: number;
} => {
  const htmlCharacters = unicodeCharacters(html);
  if (htmlCharacters > MAX_EMAIL_HTML_CHARACTERS) {
    throw new Error("email_html_characters_exceeded");
  }
  const htmlUtf8Bytes = utf8Bytes(html);
  if (htmlUtf8Bytes > MAX_EMAIL_HTML_UTF8_BYTES) {
    throw new Error("email_html_utf8_bytes_exceeded");
  }
  const textCharacters = unicodeCharacters(text);
  if (textCharacters > MAX_EMAIL_TEXT_CHARACTERS) {
    throw new Error("email_text_characters_exceeded");
  }
  const textUtf8Bytes = utf8Bytes(text);
  if (textUtf8Bytes > MAX_EMAIL_TEXT_UTF8_BYTES) {
    throw new Error("email_text_utf8_bytes_exceeded");
  }
  return { htmlCharacters, htmlUtf8Bytes, textCharacters, textUtf8Bytes };
};

const requireDedicatedMailpitUrl = (): URL => {
  const value = process.env.VBTECH_MAILPIT_API_URL;
  if (!value) throw new Error("VBTECH_MAILPIT_API_URL is required");
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`VBTECH_MAILPIT_API_URL must be exactly ${MAILPIT_ORIGIN}/`);
  }
  if (
    parsed.origin !== MAILPIT_ORIGIN ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    (parsed.pathname !== "/" && parsed.pathname !== "")
  ) {
    throw new Error(`VBTECH_MAILPIT_API_URL must be exactly ${MAILPIT_ORIGIN}/`);
  }
  parsed.pathname = "/";
  return parsed;
};

const fetchJson = async <T>(baseUrl: URL, pathname: string): Promise<T> => {
  const url = new URL(pathname, baseUrl);
  if (url.origin !== MAILPIT_ORIGIN) throw new Error("mailpit_url_escape");
  const response = await fetch(url, { signal: AbortSignal.timeout(5_000) });
  if (!response.ok) throw new Error(`mailpit_request_failed:${response.status}`);
  return await readBoundedJsonResponse(response) as T;
};

const verifyDedicatedMailpit = async (baseUrl: URL): Promise<string> => {
  const webui = await fetchJson<{ Label?: unknown }>(baseUrl, "/api/v1/webui");
  if (webui.Label !== MAILPIT_LABEL) throw new Error("mailpit_task7_marker_mismatch");
  const info = await fetchJson<{ Version?: unknown }>(baseUrl, "/api/v1/info");
  if (typeof info.Version !== "string" || !info.Version.startsWith("v1.30.7")) {
    throw new Error("mailpit_task7_version_mismatch");
  }
  return info.Version;
};

const loadMessages = async (baseUrl: URL): Promise<Map<MessageKind, MailpitMessage>> => {
  const query = encodeURIComponent(`tag:${MAILPIT_TAG}`);
  const result = await fetchJson<{ messages?: unknown }>(
    baseUrl,
    `/api/v1/search?query=${query}&start=0&limit=50`,
  );
  if (!Array.isArray(result.messages)) throw new Error("mailpit_messages_invalid");
  const summaries = result.messages as MailpitSummary[];
  if (summaries.length !== 4) throw new Error(`mailpit_task7_expected_4_messages:${summaries.length}`);

  const messages = new Map<MessageKind, MailpitMessage>();
  for (const summary of summaries) {
    if (!summary.Tags?.includes(MAILPIT_TAG)) throw new Error("mailpit_task7_tag_missing");
    let kind: MessageKind;
    try {
      kind = classifyContactEmailSubject(summary.Subject);
    } catch {
      throw new Error(`mailpit_task7_subject_matrix_invalid:${summary.Subject}`);
    }
    if (messages.has(kind)) throw new Error(`mailpit_task7_subject_matrix_invalid:${summary.Subject}`);
    const detail = await fetchJson<MailpitMessage>(baseUrl, `/api/v1/message/${summary.ID}`);
    if (typeof detail.HTML !== "string" || typeof detail.Text !== "string") {
      throw new Error("mailpit_message_body_invalid");
    }
    assertEmailBodyBounds(detail.HTML, detail.Text);
    messages.set(kind, detail);
  }
  if (messages.size !== 4) throw new Error("mailpit_task7_message_matrix_incomplete");
  return messages;
};

const escapeHtml = (value: string): string => value
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;");

const parseRgb = (value: string): [number, number, number] => {
  const match = value.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!match) throw new Error(`unsupported_computed_colour:${value}`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
};

const luminance = ([red, green, blue]: [number, number, number]): number => {
  const channel = (value: number) => {
    const normalized = value / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue);
};

const contrast = (foreground: string, background: string): number => {
  const first = luminance(parseRgb(foreground));
  const second = luminance(parseRgb(background));
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
};

const prepareHtmlPreview = async (page: Page, html: string, mode: PreviewMode): Promise<void> => {
  await page.setContent(html, { waitUntil: "load" });
  await page.evaluate((requestedMode) => {
    document.documentElement.dataset.vbtechEmailPreviewMode = requestedMode;
    const card = [...document.querySelectorAll("table")].find(
      (table) => table.getAttribute("width") === "100%" && table.style.maxWidth === "640px",
    );
    if (!(card instanceof HTMLTableElement)) throw new Error("email_card_not_found");
    card.dataset.vbtechEmailCard = "";
    const rows = card.tBodies.item(0)?.rows;
    if (!rows || rows.length < 3) throw new Error("email_card_regions_not_found");
    rows.item(0)!.dataset.vbtechEmailHeader = "";
    rows.item(1)!.dataset.vbtechEmailMain = "";
    rows.item(2)!.dataset.vbtechEmailFooter = "";
    const wordmark = rows.item(0)!.querySelector('img[alt="v-b.tech"]');
    if (!(wordmark instanceof HTMLImageElement) || !wordmark.complete || wordmark.naturalWidth < 1) {
      throw new Error("email_wordmark_not_loaded");
    }
  }, mode);
  const colours = mode === "dark"
    ? {
        canvas: "#101214",
        card: "#202428",
        border: "#656a70",
        text: "#f6f3ed",
        footer: "#c7ccd1",
        link: "#f6b84b",
      }
    : {
        canvas: "#e8e4dc",
        card: "#f6f3ed",
        border: "#d8d1c5",
        text: "#22262a",
        footer: "#656a70",
        link: "#805000",
      };
  await page.addStyleTag({ content: `
    html, body { background: ${colours.canvas} !important; color-scheme: only ${mode}; }
    [data-vbtech-email-card] { background: ${colours.card} !important; border-color: ${colours.border} !important; }
    [data-vbtech-email-main] h1,
    [data-vbtech-email-main] p { color: ${colours.text} !important; }
    [data-vbtech-email-main] a { color: ${colours.link} !important; }
    [data-vbtech-email-footer] p { color: ${colours.footer} !important; }
    [data-vbtech-email-header] td { background: #f6f3ed !important; border-color: #d8d1c5 !important; }
  ` });
};

const prepareTextPreview = async (page: Page, text: string, mode: PreviewMode): Promise<void> => {
  const colours = mode === "dark"
    ? { canvas: "#101214", sheet: "#202428", text: "#f6f3ed", border: "#656a70" }
    : { canvas: "#e8e4dc", sheet: "#f6f3ed", text: "#22262a", border: "#d8d1c5" };
  await page.setContent(`<!doctype html><html data-vbtech-email-preview-mode="${mode}"><head><meta charset="utf-8"><style>
    html,body{margin:0;background:${colours.canvas};color-scheme:only ${mode}}
    main{box-sizing:border-box;width:min(640px,calc(100% - 24px));margin:24px auto;background:${colours.sheet};border:1px solid ${colours.border};padding:28px}
    pre{margin:0;white-space:pre-wrap;overflow-wrap:anywhere;color:${colours.text};font:16px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace}
  </style></head><body><main data-vbtech-text-preview><pre>${escapeHtml(text)}</pre></main></body></html>`);
};

const measurePreview = async (
  page: Page,
  part: MessagePart,
  mode: PreviewMode,
): Promise<{ modeApplied: boolean; minimumContrast: number }> => {
  const measured = await page.evaluate((previewPart) => {
    const colour = (selector: string) => getComputedStyle(document.querySelector(selector)!).color;
    const background = (selector: string) => getComputedStyle(document.querySelector(selector)!).backgroundColor;
    if (previewPart === "text") {
      return {
        applied: document.documentElement.dataset.vbtechEmailPreviewMode,
        pairs: [[colour("pre"), background("[data-vbtech-text-preview]")]],
      };
    }
    const pairs: string[][] = [
      [colour("[data-vbtech-email-main] h1"), background("[data-vbtech-email-card]")],
      [colour("[data-vbtech-email-main] p"), background("[data-vbtech-email-card]")],
      [colour("[data-vbtech-email-footer] p"), background("[data-vbtech-email-card]")],
    ];
    const link = document.querySelector("[data-vbtech-email-main] a");
    if (link) pairs.push([getComputedStyle(link).color, background("[data-vbtech-email-card]")]);
    return { applied: document.documentElement.dataset.vbtechEmailPreviewMode, pairs };
  }, part);
  return {
    modeApplied: measured.applied === mode,
    minimumContrast: Math.min(...measured.pairs.map(([foreground, background]) =>
      contrast(foreground!, background!))),
  };
};

export const measureRenderedDocument = async (
  page: Page,
  kind: "capture" | "contact-sheet" = "capture",
): Promise<{ width: number; height: number }> => {
  const dimensions = await page.evaluate(() => ({
    width: Math.ceil(Math.max(
      window.innerWidth,
      document.documentElement.clientWidth,
      document.documentElement.scrollWidth,
      document.body?.clientWidth ?? 0,
      document.body?.scrollWidth ?? 0,
    )),
    height: Math.ceil(Math.max(
      window.innerHeight,
      document.documentElement.clientHeight,
      document.documentElement.scrollHeight,
      document.body?.clientHeight ?? 0,
      document.body?.scrollHeight ?? 0,
    )),
  }));
  if (!Number.isSafeInteger(dimensions.width) || dimensions.width < 1) {
    throw new Error(`email_${kind === "capture" ? "document" : "contact_sheet"}_width_invalid`);
  }
  if (!Number.isSafeInteger(dimensions.height) || dimensions.height < 1) {
    throw new Error(`email_${kind === "capture" ? "document" : "contact_sheet"}_height_invalid`);
  }
  const maxWidth = kind === "capture"
    ? MAX_RENDERED_DOCUMENT_WIDTH
    : MAX_CONTACT_SHEET_WIDTH;
  const maxHeight = kind === "capture"
    ? MAX_RENDERED_DOCUMENT_HEIGHT
    : MAX_CONTACT_SHEET_HEIGHT;
  const prefix = kind === "capture" ? "email_document" : "email_contact_sheet";
  if (dimensions.width > maxWidth) throw new Error(`${prefix}_width_exceeded`);
  if (dimensions.height > maxHeight) throw new Error(`${prefix}_height_exceeded`);
  return dimensions;
};

export const inspectEvidencePng = (
  bytes: Uint8Array,
  kind: "capture" | "contact-sheet",
): { width: number; height: number; fileBytes: number } => {
  const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (
    buffer.byteLength < 24 ||
    !buffer.subarray(0, 8).equals(signature) ||
    buffer.readUInt32BE(8) !== 13 ||
    buffer.toString("ascii", 12, 16) !== "IHDR"
  ) {
    throw new Error("email_png_invalid");
  }
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  const fileBytes = buffer.byteLength;
  const prefix = kind === "capture" ? "email_capture_png" : "email_contact_sheet";
  const maxWidth = kind === "capture" ? MAX_RENDERED_DOCUMENT_WIDTH : MAX_CONTACT_SHEET_WIDTH;
  const maxHeight = kind === "capture" ? MAX_RENDERED_DOCUMENT_HEIGHT : MAX_CONTACT_SHEET_HEIGHT;
  const maxBytes = kind === "capture" ? MAX_CAPTURE_PNG_BYTES : MAX_CONTACT_SHEET_BYTES;
  if (width < 1) throw new Error(`${prefix}_width_invalid`);
  if (height < 1) throw new Error(`${prefix}_height_invalid`);
  if (width > maxWidth) throw new Error(`${prefix}_width_exceeded`);
  if (height > maxHeight) throw new Error(`${prefix}_height_exceeded`);
  if (fileBytes > maxBytes) throw new Error(`${prefix}_bytes_exceeded`);
  return { width, height, fileBytes };
};

export const assertTotalGeneratedEvidenceBytes = (bytes: number): void => {
  if (!Number.isSafeInteger(bytes) || bytes < 0) {
    throw new Error("email_total_evidence_bytes_invalid");
  }
  if (bytes > MAX_TOTAL_EVIDENCE_BYTES) {
    throw new Error("email_total_evidence_bytes_exceeded");
  }
};

export const withCleanEvidenceDirectory = async <T>(
  operation: (directory: string) => Promise<T>,
): Promise<T> => {
  await rm(evidenceDirectory, { recursive: true, force: true });
  await mkdir(evidenceDirectory, { recursive: true });
  try {
    return await operation(evidenceDirectory);
  } catch (error) {
    await rm(evidenceDirectory, { recursive: true, force: true });
    throw error;
  }
};

const extractRequestId = (message: MailpitMessage): string => {
  const values = `${message.HTML}\n${message.Text}`.match(
    /\b[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi,
  ) ?? [];
  const unique = [...new Set(values.map((value) => value.toLowerCase()))];
  if (unique.length !== 1) throw new Error("email_request_id_invalid");
  return unique[0]!;
};

const extractLinks = (html: string): string[] => [...html.matchAll(/href="([^"]+)"/g)]
  .map((match) => match[1]!)
  .sort();

const assertLinks = (kind: MessageKind, links: string[]): void => {
  const expected = kind.endsWith("confirmation")
    ? ["https://t.me/thevladbog", "mailto:hello@v-b.tech"]
    : [];
  if (JSON.stringify(links) !== JSON.stringify(expected)) {
    throw new Error(`email_links_invalid:${kind}`);
  }
};

const buildContactSheet = async (
  browser: Browser,
  captures: EmailAcceptanceCapture[],
  captureBytes: number,
): Promise<EmailAcceptanceContactSheet> => {
  const page = await browser.newPage({ viewport: { width: 1120, height: 900 } });
  try {
    const figures: string[] = [];
    for (const capture of captures) {
      const bytes = await readFile(path.join(evidenceDirectory, capture.file));
      if (bytes.byteLength !== capture.fileBytes || sha256(bytes) !== capture.pixelSha256) {
        throw new Error("email_capture_file_changed");
      }
      figures.push(`<figure><figcaption>${escapeHtml(capture.file)}</figcaption><img alt="${escapeHtml(capture.file)}" src="data:image/png;base64,${bytes.toString("base64")}"></figure>`);
    }
    await page.setContent(`<!doctype html><html><head><style>
      html,body{margin:0;background:#151719;color:#f6f3ed;font:12px/1.4 Arial,sans-serif}
      h1{margin:24px 24px 8px;font-size:24px}p{margin:0 24px 20px;color:#c7ccd1}
      main{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;padding:0 24px 24px}
      figure{margin:0;background:#202428;border:1px solid #4b5158;padding:8px;min-width:0}
      figcaption{height:34px;overflow-wrap:anywhere}img{display:block;width:100%;height:300px;object-fit:contain;object-position:top;background:#0e1012}
    </style></head><body><h1>v-b.tech contact email acceptance</h1><p>${GENERATOR_VERSION} · ${DARK_STRATEGY} · generated local evidence</p><main>${figures.join("")}</main></body></html>`);
    const file = "contact-sheet.png";
    const target = path.join(evidenceDirectory, file);
    const document = await measureRenderedDocument(page, "contact-sheet");
    const screenshot = await page.screenshot({ fullPage: true, animations: "disabled", type: "png" });
    const image = inspectEvidencePng(screenshot, "contact-sheet");
    if (image.width !== document.width || image.height !== document.height) {
      throw new Error("email_contact_sheet_dimensions_mismatch");
    }
    assertTotalGeneratedEvidenceBytes(captureBytes + image.fileBytes);
    await writeFile(target, screenshot);
    return {
      file,
      pixelSha256: sha256(screenshot),
      documentWidth: document.width,
      documentHeight: document.height,
      imageWidth: image.width,
      imageHeight: image.height,
      fileBytes: image.fileBytes,
    };
  } finally {
    await page.close();
  }
};

export const captureContactEmailAcceptance = async (
  browser: Browser,
): Promise<EmailAcceptanceResult> => {
  if (evidenceDirectory !== path.resolve(repositoryRoot, ".superpowers/sdd/2026-08-20-vbtech-contact-pipeline/task-7-evidence")) {
    throw new Error("email_evidence_path_escape");
  }
  const baseUrl = requireDedicatedMailpitUrl();
  return await withCleanEvidenceDirectory(async () => {
    const mailpitVersion = await verifyDedicatedMailpit(baseUrl);
    const messages = await loadMessages(baseUrl);
    const wordmark = await readFile(path.join(
      repositoryRoot,
      "apps/web/public/assets/vb-wordmark-email.png",
    ));
    inspectEvidencePng(wordmark, "capture");
    const viewports = {
      desktop: { width: 1280, height: 900 },
      mobile: { width: 390, height: 844 },
    } as const;
    const captures: EmailAcceptanceCapture[] = [];
    const externalRequests = new Set<string>();
    let captureBytes = 0;

    for (const [kind, message] of [...messages.entries()].sort(([left], [right]) => left.localeCompare(right))) {
      const requestId = extractRequestId(message);
      const links = extractLinks(message.HTML);
      const bodyMeasurements = assertEmailBodyBounds(message.HTML, message.Text);
      assertLinks(kind, links);
      for (const part of ["html", "text"] as const) {
        const content = part === "html" ? message.HTML : message.Text;
        const contentCharacters = part === "html"
          ? bodyMeasurements.htmlCharacters
          : bodyMeasurements.textCharacters;
        const contentUtf8Bytes = part === "html"
          ? bodyMeasurements.htmlUtf8Bytes
          : bodyMeasurements.textUtf8Bytes;
        for (const [size, viewport] of Object.entries(viewports) as Array<[PreviewSize, typeof viewports[PreviewSize]]>) {
          for (const mode of ["light", "dark"] as const) {
            const page = await browser.newPage({ viewport });
            const requests: string[] = [];
            await page.route("**/*", async (route) => {
              if (route.request().url() === WORDMARK_URL) {
                await route.fulfill({ body: wordmark, contentType: "image/png", status: 200 });
                return;
              }
              requests.push(route.request().url());
              await route.abort();
            });
            try {
              if (part === "html") await prepareHtmlPreview(page, content, mode);
              else await prepareTextPreview(page, content, mode);
              await page.emulateMedia({ colorScheme: mode });
              const measured = await measurePreview(page, part, mode);
              const document = await measureRenderedDocument(page);
              const screenshot = await page.screenshot({
                fullPage: true,
                animations: "disabled",
                type: "png",
              });
              const image = inspectEvidencePng(screenshot, "capture");
              if (image.width !== document.width || image.height !== document.height) {
                throw new Error("email_capture_dimensions_mismatch");
              }
              captureBytes += image.fileBytes;
              assertTotalGeneratedEvidenceBytes(captureBytes);
              const file = `${kind}-${part}-${size}-${mode}.png`;
              await writeFile(path.join(evidenceDirectory, file), screenshot);
              captures.push({
                kind,
                part,
                size,
                mode,
                file,
                viewport,
                contentCharacters,
                contentUtf8Bytes,
                documentWidth: document.width,
                documentHeight: document.height,
                imageWidth: image.width,
                imageHeight: image.height,
                fileBytes: image.fileBytes,
                requestId,
                links,
                contentSha256: sha256(content),
                pixelSha256: sha256(screenshot),
                modeApplied: measured.modeApplied,
                minimumContrast: Number(measured.minimumContrast.toFixed(2)),
              });
            } finally {
              await page.close();
            }
            for (const request of requests) externalRequests.add(request);
          }
        }
      }
    }

    const contactSheet = await buildContactSheet(browser, captures, captureBytes);
    const result: EmailAcceptanceResult = {
      generatorVersion: GENERATOR_VERSION,
      previewStrategy: DARK_STRATEGY,
      mailpitLabel: MAILPIT_LABEL,
      mailpitVersion,
      kinds: [...messages.keys()].sort(),
      captures,
      externalRequests: [...externalRequests].sort(),
      limits: EMAIL_EVIDENCE_LIMITS,
      contactSheet,
      totalEvidenceBytes: 0,
    };
    const binaryBytes = captureBytes + contactSheet.fileBytes;
    let manifest = "";
    for (let iteration = 0; iteration < 4; iteration += 1) {
      manifest = `${JSON.stringify(result, null, 2)}\n`;
      const nextTotal = binaryBytes + utf8Bytes(manifest);
      assertTotalGeneratedEvidenceBytes(nextTotal);
      if (result.totalEvidenceBytes === nextTotal) break;
      result.totalEvidenceBytes = nextTotal;
    }
    manifest = `${JSON.stringify(result, null, 2)}\n`;
    if (binaryBytes + utf8Bytes(manifest) !== result.totalEvidenceBytes) {
      throw new Error("email_total_evidence_bytes_unstable");
    }
    await writeFile(path.join(evidenceDirectory, "manifest.json"), manifest, "utf8");
    return result;
  });
};
