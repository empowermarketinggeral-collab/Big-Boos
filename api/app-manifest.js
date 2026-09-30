// Manifesto de instalação da app das clientes de UMA marca
// (/api/app-manifest?slug=dreams-studio). É o que o telemóvel lê em
// "Adicionar ao ecrã principal": nome, ícone e cores da marca, e abre
// sempre em /app/<slug> — nunca na Big Boss.
import { loadBrand, isHttpUrl, iconType } from "./_brand.js";

export default async function handler(req, res) {
  const slug = String(req.query.slug || "");
  const brand = await loadBrand(slug).catch(() => null);
  if (!brand) {
    res.status(404).json({ error: "App não encontrada." });
    return;
  }
  const base = `/app/${brand.slug}`;
  const icons = [];
  if (isHttpUrl(brand.icon)) {
    const type = iconType(brand.icon);
    // O ícone próprio da app é quadrado (512×512); o logótipo pode ter
    // qualquer tamanho, por isso vai como "any".
    const sizes = brand.hasAppIcon && type === "image/png" ? "512x512" : "any";
    icons.push({ src: brand.icon, sizes, type, purpose: "any" });
  }
  icons.push({ src: `/api/app-icon?slug=${encodeURIComponent(brand.slug)}`, sizes: "any", type: "image/svg+xml", purpose: "any" });

  res.setHeader("Content-Type", "application/manifest+json; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=300, s-maxage=300");
  res.status(200).send(JSON.stringify({
    id: base,
    name: brand.name,
    // Nome curto debaixo do ícone: o nome todo se couber, senão a primeira palavra.
    short_name: brand.name.length <= 15 ? brand.name : brand.name.split(/\s+/)[0],
    lang: "pt",
    start_url: base,
    scope: `${base}`,
    display: "standalone",
    background_color: brand.background,
    theme_color: brand.surface,
    icons,
  }));
}
