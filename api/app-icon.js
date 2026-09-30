// Ícone de reserva da app das clientes: as iniciais da marca na cor dela
// (SVG). Só se usa quando a marca não tem ícone próprio nem logótipo.
import { loadBrand, escapeHtml } from "./_brand.js";

export default async function handler(req, res) {
  const brand = await loadBrand(String(req.query.slug || "")).catch(() => null);
  const name = brand?.name || "App";
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");
  const bg = /^#[0-9a-f]{3,8}$/i.test(brand?.accent || "") ? brand.accent : "#7C52A8";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="${bg}"/><text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle" font-family="Georgia, serif" font-size="220" fill="#fff">${escapeHtml(initials)}</text></svg>`;
  res.setHeader("Content-Type", "image/svg+xml");
  res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=3600");
  res.status(200).send(svg);
}
