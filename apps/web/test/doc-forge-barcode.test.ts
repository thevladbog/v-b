import { describe, expect, it } from "vitest";
import { barcodeModel, barcodeSvg } from "../src/tools/doc-forge/barcode.js";

describe("doc-forge barcode", () => {
  it("детерминирован: одинаковый сид — одинаковая модель", () => {
    expect(barcodeModel("DOC-2026-001 Тест")).toEqual(barcodeModel("DOC-2026-001 Тест"));
  });

  it("разные сиды дают разные модели", () => {
    expect(barcodeModel("DOC-2026-001 A")).not.toEqual(barcodeModel("DOC-2026-002 B"));
  });

  it("модель соответствует фирменному алгоритму (снапшот эталонного сида)", () => {
    const bars = barcodeModel("V-B.TECH REFERENCE");
    expect(bars.length).toBeGreaterThanOrEqual(34);
    expect(bars.length).toBeLessThanOrEqual(44);
    expect(bars.filter((b) => b.amber)).toHaveLength(1);
    for (const b of bars) expect([2, 3, 5, 8, 12]).toContain(b.w);
    expect(bars).toMatchSnapshot();
  });

  it("SVG содержит один янтарный штрих и корректный viewBox", () => {
    const svg = barcodeSvg("DOC-2026-001 Тест", { height: 40 });
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg.match(/#F5A623/g)).toHaveLength(1);
  });
});
