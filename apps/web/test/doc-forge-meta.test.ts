import { describe, expect, it } from "vitest";
import { docxFileName, suggestNextDocId } from "../src/tools/doc-forge/meta.js";

describe("doc-forge meta helpers", () => {
  it("первый номер года", () => {
    expect(suggestNextDocId([], 2026)).toBe("DOC-2026-001");
  });

  it("следующий за максимальным, чужие годы игнорируются", () => {
    expect(suggestNextDocId(["DOC-2026-007", "DOC-2025-099", "мусор"], 2026)).toBe("DOC-2026-008");
  });

  it("имя файла: запрещённые символы вычищены", () => {
    expect(docxFileName("DOC-2026-001", 'Спека: "ядро" <v2>?')).toBe(
      "DOC-2026-001 — Спека ядро v2.docx",
    );
  });
});
