import { PUBLIC_ROUTES } from "../lib/route-inventory.js";

export const prerender = true;

const productionOrigin = "https://v-b.tech";

const escapeXml = (value: string): string =>
  value.replace(/[<>&'\"]/g, (character) => {
    const entities: Record<string, string> = {
      "<": "&lt;",
      ">": "&gt;",
      "&": "&amp;",
      "'": "&apos;",
      '\"': "&quot;",
    };
    return entities[character] ?? character;
  });

const locations = PUBLIC_ROUTES.map(
  (path) => `  <url><loc>${escapeXml(new URL(path, productionOrigin).toString())}</loc></url>`,
).join("\n");

const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${locations}\n</urlset>\n`;

export function GET(): Response {
  return new Response(body, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
}
