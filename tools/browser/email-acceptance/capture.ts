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
const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
const evidenceDirectory = path.join(
  repositoryRoot,
  ".superpowers/sdd/2026-08-20-vbtech-contact-pipeline/task-7-evidence",
);

const kindsBySubject = {
  "New v-b.tech enquiry": "en-notification",
  "We received your v-b.tech enquiry": "en-confirmation",
  "Новое обращение с v-b.tech": "ru-notification",
  "Ваше обращение с v-b.tech получено": "ru-confirmation",
} as const;

type MessageKind = (typeof kindsBySubject)[keyof typeof kindsBySubject];
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

export interface EmailAcceptanceCapture {
  kind: MessageKind;
  part: MessagePart;
  size: PreviewSize;
  mode: PreviewMode;
  file: string;
  viewport: { width: number; height: number };
  requestId: string;
  links: string[];
  contentSha256: string;
  pixelSha256: string;
  modeApplied: boolean;
  minimumContrast: number;
}

export interface EmailAcceptanceResult {
  generatorVersion: string;
  previewStrategy: string;
  mailpitLabel: string;
  mailpitVersion: string;
  kinds: MessageKind[];
  captures: EmailAcceptanceCapture[];
  externalRequests: string[];
  contactSheet: string;
}

const sha256 = (value: string | Uint8Array): string =>
  createHash("sha256").update(value).digest("hex");

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
  return await response.json() as T;
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
    const kind = kindsBySubject[summary.Subject as keyof typeof kindsBySubject];
    if (!kind || messages.has(kind)) throw new Error(`mailpit_task7_subject_matrix_invalid:${summary.Subject}`);
    const detail = await fetchJson<MailpitMessage>(baseUrl, `/api/v1/message/${summary.ID}`);
    if (typeof detail.HTML !== "string" || typeof detail.Text !== "string") {
      throw new Error("mailpit_message_body_invalid");
    }
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
    [data-vbtech-email-header] p { color: #ffffff !important; }
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
      [colour("[data-vbtech-email-header] p"), background("[data-vbtech-email-header] td")],
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
): Promise<{ file: string; sha256: string }> => {
  const page = await browser.newPage({ viewport: { width: 1120, height: 900 } });
  try {
    const figures: string[] = [];
    for (const capture of captures) {
      const bytes = await readFile(path.join(evidenceDirectory, capture.file));
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
    await page.screenshot({ path: target, fullPage: true });
    return { file, sha256: sha256(await readFile(target)) };
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
  const mailpitVersion = await verifyDedicatedMailpit(baseUrl);
  const messages = await loadMessages(baseUrl);
  await rm(evidenceDirectory, { recursive: true, force: true });
  await mkdir(evidenceDirectory, { recursive: true });

  const viewports = {
    desktop: { width: 1280, height: 900 },
    mobile: { width: 390, height: 844 },
  } as const;
  const captures: EmailAcceptanceCapture[] = [];
  const externalRequests = new Set<string>();

  for (const [kind, message] of [...messages.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const requestId = extractRequestId(message);
    const links = extractLinks(message.HTML);
    assertLinks(kind, links);
    for (const part of ["html", "text"] as const) {
      const content = part === "html" ? message.HTML : message.Text;
      for (const [size, viewport] of Object.entries(viewports) as Array<[PreviewSize, typeof viewports[PreviewSize]]>) {
        for (const mode of ["light", "dark"] as const) {
          const page = await browser.newPage({ viewport });
          const requests: string[] = [];
          page.on("request", (request) => requests.push(request.url()));
          await page.route("**/*", (route) => route.abort());
          try {
            if (part === "html") await prepareHtmlPreview(page, content, mode);
            else await prepareTextPreview(page, content, mode);
            await page.emulateMedia({ colorScheme: mode });
            const measured = await measurePreview(page, part, mode);
            const file = `${kind}-${part}-${size}-${mode}.png`;
            const target = path.join(evidenceDirectory, file);
            await page.screenshot({ path: target, fullPage: true });
            const pixelSha256 = sha256(await readFile(target));
            captures.push({
              kind,
              part,
              size,
              mode,
              file,
              viewport,
              requestId,
              links,
              contentSha256: sha256(content),
              pixelSha256,
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

  const contactSheet = await buildContactSheet(browser, captures);
  const result: EmailAcceptanceResult = {
    generatorVersion: GENERATOR_VERSION,
    previewStrategy: DARK_STRATEGY,
    mailpitLabel: MAILPIT_LABEL,
    mailpitVersion,
    kinds: [...messages.keys()].sort(),
    captures,
    externalRequests: [...externalRequests].sort(),
    contactSheet: contactSheet.file,
  };
  await writeFile(
    path.join(evidenceDirectory, "manifest.json"),
    `${JSON.stringify({ ...result, contactSheetSha256: contactSheet.sha256 }, null, 2)}\n`,
    "utf8",
  );
  return result;
};
