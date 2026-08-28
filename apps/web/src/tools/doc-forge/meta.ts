export function suggestNextDocId(existing: string[], year: number): string {
  const re = new RegExp(`^DOC-${year}-(\\d{3,})$`);
  let max = 0;
  for (const id of existing) {
    const m = re.exec(id.trim());
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `DOC-${year}-${String(max + 1).padStart(3, "0")}`;
}

export function docxFileName(docId: string, title: string): string {
  const clean = title
    .replace(/[<>:"/\\|?*]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return `${docId} — ${clean}.docx`;
}

// Пилюля-тире по пропорциям бренда: канва 1em, пилюля 0.52x0.16em,
// центр на 0.26em над нижним краем-базлайном. Browser-only.
export function dashPillPngBase64(): string {
  const em = 100;
  const canvas = document.createElement("canvas");
  canvas.width = 68;
  canvas.height = em;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#F5A623";
  const pw = 52, ph = 16;
  const x = (68 - pw) / 2;
  const y = em - 18 - ph;
  ctx.beginPath();
  ctx.roundRect(x, y, pw, ph, ph / 2);
  ctx.fill();
  return canvas.toDataURL("image/png").split(",")[1];
}
