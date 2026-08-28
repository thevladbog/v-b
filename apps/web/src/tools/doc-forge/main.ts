import { barcodeSvg, drawBarcode } from "./barcode.js";
import { buildDocx, DOC_TYPE_LABEL, type DocMeta, type DocType } from "./docx-factory.js";
import { dashPillPngBase64, docxFileName, suggestNextDocId } from "./meta.js";

const LS_AUTHOR = "vb-doc-forge:author";
const LS_IDS = "vb-doc-forge:issued-ids";

interface PrivateAssets { sealPng?: string; signaturePng?: string }

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, html = "") {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (html) n.innerHTML = html;
  return n;
}

function download(name: string, data: Uint8Array | string, mime: string) {
  const blob = typeof data === "string" ? new Blob([data], { type: mime }) : new Blob([data as BlobPart], { type: mime });
  const a = el("a", { href: URL.createObjectURL(blob), download: name });
  a.click();
  URL.revokeObjectURL(a.getAttribute("href")!);
}

function readIssued(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(LS_IDS) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

(globalThis as Record<string, unknown>).vbDocForgeInit = (root: HTMLElement, priv: PrivateAssets) => {
  const year = new Date().getFullYear();
  const today = new Date().toLocaleDateString("ru-RU");
  const hasPrivate = Boolean(priv.sealPng && priv.signaturePng);

  root.innerHTML = `
    <div class="df-grid">
      <form class="df-form" autocomplete="off">
        <label>Тип документа
          <select name="type">${(Object.keys(DOC_TYPE_LABEL) as DocType[])
            .map((t) => `<option value="${t}">${DOC_TYPE_LABEL[t]}</option>`).join("")}</select>
        </label>
        <label>DOC-ID <input name="docId" required></label>
        <label>Название <input name="title" required placeholder="Название документа"></label>
        <label>Автор <input name="author" required></label>
        <label>Дата <input name="date" required></label>
        <label>Статус
          <select name="status"><option value="draft">draft</option><option value="final">final</option></select>
        </label>
        ${hasPrivate ? `<label class="df-check"><input type="checkbox" name="signed"> Печать + подпись</label>` : ""}
        <div class="df-actions">
          <button type="submit" class="df-primary">Скачать .docx</button>
          <button type="button" data-dl="png">Баркод PNG</button>
          <button type="button" data-dl="svg">Баркод SVG</button>
        </div>
      </form>
      <div class="df-preview">
        <div class="df-doc">
          <div class="df-eyebrow"></div>
          <div class="df-title"></div>
          <div class="df-meta"></div>
          <canvas class="df-bc" height="40"></canvas>
        </div>
      </div>
    </div>`;

  const form = root.querySelector("form")!;
  const f = (n: string) => form.elements.namedItem(n) as HTMLInputElement | HTMLSelectElement;
  f("docId").value = suggestNextDocId(readIssued(), year);
  f("author").value = localStorage.getItem(LS_AUTHOR) ?? "Влад Богатырев";
  f("date").value = today;

  const seed = () => `${f("docId").value.trim()} ${f("title").value.trim()}`.trim();
  const meta = (): DocMeta => ({
    docId: f("docId").value.trim(),
    title: f("title").value.trim(),
    author: f("author").value.trim(),
    date: f("date").value.trim(),
    status: f("status").value as DocMeta["status"],
    type: f("type").value as DocType,
  });

  const refresh = () => {
    const m = meta();
    root.querySelector(".df-eyebrow")!.textContent = `${DOC_TYPE_LABEL[m.type]} · ${m.docId}`;
    root.querySelector(".df-title")!.textContent = m.title || "Название документа";
    root.querySelector(".df-meta")!.textContent = `${m.docId} · ${m.author} · ${m.date} · ${m.status}`;
    drawBarcode(root.querySelector<HTMLCanvasElement>(".df-bc")!, seed(), { light: false });
  };
  form.addEventListener("input", refresh);
  refresh();

  root.querySelectorAll<HTMLButtonElement>("[data-dl]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const m = meta();
      if (btn.dataset.dl === "svg") {
        download(`${m.docId}-barcode.svg`, barcodeSvg(seed(), { height: 60 }), "image/svg+xml");
      } else {
        const c = document.createElement("canvas");
        c.height = 120;
        drawBarcode(c, seed());
        // canvas.toBlob асинхронный: используем dataURL — проще и синхронно
        const a = el("a", { href: c.toDataURL("image/png"), download: `${m.docId}-barcode.png` });
        a.click();
      }
    }),
  );

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const m = meta();
    localStorage.setItem(LS_AUTHOR, m.author);
    localStorage.setItem(LS_IDS, JSON.stringify([...new Set([...readIssued(), m.docId])]));
    const bcCanvas = document.createElement("canvas");
    bcCanvas.height = 120;
    drawBarcode(bcCanvas, seed());
    const signed = hasPrivate && (f("signed") as HTMLInputElement).checked;
    const buf = await buildDocx(m, {
      dashPng: dashPillPngBase64(),
      barcodePng: bcCanvas.toDataURL("image/png").split(",")[1],
      sealPng: signed ? priv.sealPng : undefined,
      signaturePng: signed ? priv.signaturePng : undefined,
    });
    download(docxFileName(m.docId, m.title), buf,
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  });
};
