export const prerender = true;

const body = "User-agent: *\nAllow: /\nSitemap: https://v-b.tech/sitemap.xml\n";

export function GET(): Response {
  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
