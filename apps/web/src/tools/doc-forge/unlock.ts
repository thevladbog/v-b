import { decryptPayload } from "./payload-crypto.js";

const SS_KEY = "vb-doc-forge:pw";

interface Payload {
  js: string;
  sealPng?: string;
  signaturePng?: string;
}

export async function tryUnlock(password: string, root: HTMLElement): Promise<boolean> {
  const res = await fetch("/tools/doc-payload.bin");
  if (!res.ok) throw new Error("no-payload");
  const blob = new Uint8Array(await res.arrayBuffer());
  let plain: Uint8Array;
  try {
    plain = await decryptPayload(password, blob);
  } catch {
    return false;
  }
  const payload: Payload = JSON.parse(new TextDecoder().decode(plain));
  sessionStorage.setItem(SS_KEY, password);
  // Инлайновый script, а не blob:-URL: CSP сайта разрешает 'unsafe-inline',
  // но не blob: в script-src — загрузка по blob-ссылке блокируется браузером.
  // Инлайн выполняется синхронно при вставке в DOM, промис не нужен.
  const script = document.createElement("script");
  script.textContent = payload.js;
  try {
    document.head.append(script);
  } finally {
    script.remove();
  }
  const init = (globalThis as Record<string, unknown>).vbDocForgeInit as (
    r: HTMLElement,
    p: { sealPng?: string; signaturePng?: string },
  ) => void;
  // CSP блокирует выполнение молча (без исключения) — ловим по отсутствию контракта
  if (typeof init !== "function") throw new Error("payload-exec");
  init(root, { sealPng: payload.sealPng, signaturePng: payload.signaturePng });
  return true;
}

export function savedPassword(): string | null {
  return sessionStorage.getItem(SS_KEY);
}
