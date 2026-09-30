// Peças partilhadas das funções da app das clientes (Vercel).
// Lê a marca pela mesma função pública da página de marcação
// (booking_public_page, anon) — nada que a página pública já não mostre.

export async function loadBrand(slug) {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key || !/^[a-z0-9-]{1,80}$/i.test(slug || "")) return null;
  const res = await fetch(`${url}/rest/v1/rpc/booking_public_page`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ p_slug: slug }),
  });
  if (!res.ok) return null;
  const page = await res.json();
  if (!page?.brand?.client_app_enabled) return null;
  const style = page.brand.style || {};
  return {
    slug,
    name: page.brand.name || "App",
    // Ícone da app: o próprio (quadrado, PNG) ou o logótipo da marca.
    icon: style.appIconUrl || style.logoUrl || page.brand.logo_url || null,
    hasAppIcon: !!style.appIconUrl,
    background: style.background || "#FFFFFF",
    surface: style.surface || style.background || "#FFFFFF",
    accent: style.accentColor || "#7C52A8",
  };
}

export const isHttpUrl = (v) => typeof v === "string" && /^https?:\/\//i.test(v);

export const escapeHtml = (v) =>
  String(v).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function iconType(url) {
  const u = String(url || "").toLowerCase().split("?")[0];
  if (u.endsWith(".svg")) return "image/svg+xml";
  if (u.endsWith(".jpg") || u.endsWith(".jpeg")) return "image/jpeg";
  if (u.endsWith(".webp")) return "image/webp";
  return "image/png";
}
