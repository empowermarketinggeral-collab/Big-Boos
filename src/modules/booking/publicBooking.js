/* ---------------------------------------------------------
   Peças partilhadas da página pública de marcação e da app das
   clientes: dados públicos da marca, preços e o TEMA DA MARCA.

   O tema vem de brands.booking_style (definido no Agendamento, em
   "Aparência"): accentColor (botões), accentInk (texto sobre os botões),
   background (fundo), surface (cartões), ink (texto), titleFont, font,
   logoUrl, tagline, contactPhone. O que a marca não definir usa os
   tokens do Big Boss. Os componentes só usam as variáveis --app-*.
--------------------------------------------------------- */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../lib/supabaseClient.js";
import { c, DEFAULT_PAGE_STYLE } from "../../shared/theme.jsx";

// App com endereço próprio (projeto Vercel à parte, ver vite.config.js):
// a raiz "/" é a app desta marca e "/agendar" a página de marcação.
export const STANDALONE_SLUG = String(import.meta.env.VITE_CLIENT_APP_SLUG || "").trim();
export const appPath = (slug) => (STANDALONE_SLUG ? "/" : `/app/${slug}`);
export const bookingPath = (slug) => (STANDALONE_SLUG ? "/agendar" : `/agendar/${slug}`);

export function usePublicBookingPage(slug) {
  return useQuery({
    queryKey: ["booking_public_page", slug],
    enabled: !!slug,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("booking_public_page", { p_slug: slug });
      if (error) throw error;
      return data;
    },
  });
}

const fmt = (v) =>
  new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR", minimumFractionDigits: Number.isInteger(Number(v)) ? 0 : 2 }).format(v);

export const money = (v) => (v == null || v === "" ? "" : fmt(v));

// "25 €", "25 € a 44 €", "Gratuito"
export function priceLabel(service) {
  if (service.price == null) return "";
  if (Number(service.price) === 0 && !service.price_max) return "Gratuito";
  if (service.price_max && Number(service.price_max) > Number(service.price)) return `${fmt(service.price)} a ${fmt(service.price_max)}`;
  return fmt(service.price);
}

export function durationLabel(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

// Pack que ainda serve para este serviço (sessões, validade, serviços incluídos).
export function packFitsService(pack, serviceId) {
  const left = pack.sessions_total - pack.sessions_used;
  const valid = !pack.expires_at || new Date(pack.expires_at) > new Date();
  const ids = pack.service_ids || [];
  return left > 0 && valid && (ids.length === 0 || ids.includes(serviceId));
}

export const capitalize = (t) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t);

// Variáveis CSS do tema da marca — aplicar no elemento raiz da página.
export function brandThemeVars(rawStyle) {
  const s = { ...DEFAULT_PAGE_STYLE, ...(rawStyle || {}) };
  const title = s.titleFont || s.font;
  return {
    "--app-bg": s.background || c.paper,
    "--app-surface": s.surface || c.folha,
    "--app-ink": s.ink || c.ink,
    "--app-muted": "color-mix(in srgb, var(--app-ink) 64%, var(--app-surface))",
    "--app-faint": "color-mix(in srgb, var(--app-ink) 46%, var(--app-surface))",
    "--app-line": "color-mix(in srgb, var(--app-ink) 13%, var(--app-surface))",
    "--app-soft": "color-mix(in srgb, var(--app-ink) 5%, var(--app-surface))",
    "--app-accent": s.accentColor,
    "--app-on-accent": s.accentInk || c.onBoss,
    "--app-accent-soft": "color-mix(in srgb, var(--app-accent) 16%, var(--app-surface))",
    "--app-title": `'${title}', var(--bb-font-sub)`,
    "--app-font": `'${s.font}', var(--bb-font-corpo)`,
    background: "var(--app-bg)",
    color: "var(--app-ink)",
    fontFamily: "var(--app-font)",
    fontWeight: 400,
  };
}

// Atalhos para usar nos estilos inline.
export const T = {
  bg: "var(--app-bg)",
  surface: "var(--app-surface)",
  ink: "var(--app-ink)",
  muted: "var(--app-muted)",
  faint: "var(--app-faint)",
  line: "var(--app-line)",
  soft: "var(--app-soft)",
  accent: "var(--app-accent)",
  onAccent: "var(--app-on-accent)",
  accentSoft: "var(--app-accent-soft)",
  // Títulos cheios: peso 700 e tamanho ótico baixo. Com a Bodoni Moda em
  // tamanho ótico automático, os títulos grandes ficavam com traços finos
  // demais para ler (sobretudo no telemóvel). Letras sem eixo "opsz" ignoram.
  title: { fontFamily: "var(--app-title)", fontWeight: 700, fontVariationSettings: "'opsz' 11", letterSpacing: "-0.005em" },
  body: { fontFamily: "var(--app-font)", fontWeight: 400 },
};

export function brandStyle(rawStyle) {
  return { ...DEFAULT_PAGE_STYLE, ...(rawStyle || {}) };
}
