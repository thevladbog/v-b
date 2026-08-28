import { describe, expect, it } from "vitest";
import { unzipSync, strFromU8 } from "fflate";
import { buildDocx, DOC_TYPE_LABEL } from "../src/tools/doc-forge/docx-factory.js";

// 1x1 прозрачный PNG
const PX =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

// docx дедуплицирует одинаковые байты картинок — делаем фикстуры различными,
// добавляя хвостовые байты после IEND (PNG остаётся валидным)
const distinct = (b64: string, n: number) => btoa(atob(b64) + " ".repeat(n));

const META = {
  docId: "DOC-2026-042",
  title: "Тестовая спецификация",
  author: "Влад Богатырев",
  date: "28.08.2026",
  status: "draft" as const,
  type: "spec" as const,
};

describe("doc-forge docx factory", () => {
  it("выдаёт валидный zip с полями документа", async () => {
    const buf = await buildDocx(META, { dashPng: PX, barcodePng: PX });
    expect(buf[0]).toBe(0x50); // 'P'
    expect(buf[1]).toBe(0x4b); // 'K'
    const files = unzipSync(buf);
    const xml = strFromU8(files["word/document.xml"]);
    expect(xml).toContain("DOC-2026-042");
    expect(xml).toContain("Тестовая спецификация");
    expect(xml).toContain("Влад Богатырев");
    expect(xml).toContain(DOC_TYPE_LABEL.spec);
  });

  it("с печатью и подписью в архиве появляются media-файлы", async () => {
    const plain = await buildDocx(META, { dashPng: PX, barcodePng: distinct(PX, 1) });
    const signed = await buildDocx(META, {
      dashPng: PX, barcodePng: distinct(PX, 1), sealPng: distinct(PX, 2), signaturePng: distinct(PX, 3),
    });
    const mediaCount = (b: Uint8Array) =>
      Object.keys(unzipSync(b)).filter((n) => n.startsWith("word/media/")).length;
    expect(mediaCount(signed)).toBe(mediaCount(plain) + 2);
  });
});
