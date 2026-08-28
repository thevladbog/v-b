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
  const url = URL.createObjectURL(new Blob([payload.js], { type: "text/javascript" }));
  await import(/* @vite-ignore */ url);
  const init = (globalThis as Record<string, unknown>).vbDocForgeInit as (
    r: HTMLElement,
    p: { sealPng?: string; signaturePng?: string },
  ) => void;
  init(root, { sealPng: payload.sealPng, signaturePng: payload.signaturePng });
  return true;
}

export function savedPassword(): string | null {
  return sessionStorage.getItem(SS_KEY);
}
