// Фирменный детерминированный баркод v-b.tech: FNV-1a -> mulberry32.
// Алгоритм обязан бить байт-в-байт с прототипом сайта и печатями.

export interface BarcodeBar {
  w: number;
  short: boolean;
  amber: boolean;
}

const WIDTHS = [2, 3, 5, 8, 12] as const;
export const AMBER = "#F5A623";
const DARK = "#1B1F23";
const LIGHT = "#E8EAEC";

function fnv1a(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function barcodeModel(seed: string): BarcodeBar[] {
  const rnd = mulberry32(fnv1a(seed));
  const n = Math.floor(34 + rnd() * 10);
  const amberAt = Math.floor(rnd() * n);
  const bars: BarcodeBar[] = [];
  for (let i = 0; i < n; i++) {
    const w = WIDTHS[Math.floor(rnd() * 5)];
    const short = rnd() < 0.14;
    bars.push({ w, short, amber: i === amberAt });
  }
  return bars;
}

const GAP = 3;

export function barcodeSvg(seed: string, opts: { height?: number; light?: boolean } = {}): string {
  const h = opts.height ?? 40;
  const ink = opts.light ? LIGHT : DARK;
  const bars = barcodeModel(seed);
  let x = 0;
  const rects = bars
    .map((b) => {
      const bh = b.short ? Math.round(h * 0.72) : h;
      const r = `<rect x="${x}" y="${h - bh}" width="${b.w}" height="${bh}" rx="1" fill="${b.amber ? AMBER : ink}"/>`;
      x += b.w + GAP;
      return r;
    })
    .join("");
  const w = x - GAP;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${rects}</svg>`;
}

export function drawBarcode(
  canvas: HTMLCanvasElement,
  seed: string,
  opts: { light?: boolean } = {},
): void {
  const bars = barcodeModel(seed);
  const scale = 3; // ретина/печать
  const h = canvas.height;
  const totalW = bars.reduce((s, b) => s + b.w + GAP, -GAP);
  canvas.width = totalW * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  let x = 0;
  for (const b of bars) {
    const bh = b.short ? Math.round(h * 0.72) : h;
    ctx.fillStyle = b.amber ? AMBER : opts.light ? LIGHT : DARK;
    ctx.beginPath();
    ctx.roundRect(x * scale, h - bh, b.w * scale, bh, 2);
    ctx.fill();
    x += b.w + GAP;
  }
}
