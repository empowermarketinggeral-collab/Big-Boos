// Página da app das clientes (/app/<slug>) servida com o nome, o ícone e o
// manifesto DA MARCA já no HTML. Assim, "Adicionar ao ecrã principal" (iOS e
// Android) instala a app da marca, e não a Big Boss. O resto é a mesma app
// React (index.html do build), que continua a desenhar a página.
import { loadBrand, isHttpUrl, escapeHtml } from "./_brand.js";

export default async function handler(req, res) {
  const slug = String(req.query.slug || "");
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  let html;
  try {
    const r = await fetch(`${proto}://${host}/index.html`);
    html = await r.text();
  } catch {
    res.status(502).send("Não foi possível abrir a app.");
    return;
  }

  const brand = await loadBrand(slug).catch(() => null);
  if (brand) {
    const name = escapeHtml(brand.name);
    const theme = escapeHtml(brand.surface);
    html = html
      .replace(/<title>[^<]*<\/title>/, `<title>${name}</title>`)
      .replace(/<link rel="manifest"[^>]*>/, `<link rel="manifest" href="/api/app-manifest?slug=${encodeURIComponent(brand.slug)}" />`)
      .replace(/<meta name="apple-mobile-web-app-title"[^>]*>/, `<meta name="apple-mobile-web-app-title" content="${name}" />`)
      .replace(/<meta name="theme-color"[^>]*>/, `<meta name="theme-color" content="${theme}" />`);
    if (isHttpUrl(brand.icon)) {
      const icon = escapeHtml(brand.icon);
      html = html
        .replace(/<link rel="apple-touch-icon"[^>]*>/, `<link rel="apple-touch-icon" href="${icon}" />`)
        .replace(/<link rel="icon" href="\/favicon\.ico"[^>]*>/, `<link rel="icon" href="${icon}" />`)
        .replace(/<link rel="icon" type="image\/svg\+xml"[^>]*>/, "");
    } else {
      html = html.replace(/<link rel="apple-touch-icon"[^>]*>/, `<link rel="apple-touch-icon" href="/api/app-icon?slug=${encodeURIComponent(brand.slug)}" />`);
    }
  }

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=0, s-maxage=60");
  res.status(200).send(html);
}
