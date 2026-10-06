import { CreditCard, Globe, Palette, Share2, Shapes } from "lucide-react";

// Tipos de trabalho (as abas). O conteúdo de cada versão depende do tipo —
// ver o comentário da tabela creative_versions em supabase/78_creatives.sql.
export const KINDS = {
  business_card: { label: "Cartão de visita", short: "Cartão", icon: CreditCard, hint: "Frente e verso, com botão para virar." },
  landing_page: { label: "Landing page", short: "Landing page", icon: Globe, hint: "Pré-visualização em computador e telemóvel." },
  brand_identity: { label: "Identidade visual", short: "Identidade", icon: Palette, hint: "Logótipo, paleta de cores, tipografias e aplicações." },
  social_media: { label: "Redes sociais", short: "Redes sociais", icon: Share2, hint: "Galeria de imagens (posts, capas, stories)." },
  other: { label: "Outro", short: "Outro", icon: Shapes, hint: "Galeria de imagens para qualquer outro trabalho." },
};
export const KIND_ORDER = ["business_card", "landing_page", "brand_identity", "social_media", "other"];

export const STATUS = {
  draft: { label: "Rascunho", color: "var(--bb-tinta-2)" },
  sent: { label: "Enviada", color: "var(--bb-info)" },
  approved: { label: "Aprovada", color: "var(--bb-verde)" },
  rejected: { label: "Rejeitada", color: "var(--bb-erro)" },
};

// Todos os caminhos de ficheiros dentro do conteúdo de uma versão.
export function contentPaths(content, brandId) {
  const out = new Set();
  const walk = (value) => {
    if (typeof value === "string") {
      if (value.startsWith(`${brandId}/`)) out.add(value);
    } else if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === "object") Object.values(value).forEach(walk);
  };
  walk(content);
  return [...out];
}

// A imagem que representa a opção na grelha.
export function coverPath(kind, content) {
  if (!content) return null;
  if (kind === "business_card") return content.front || content.back || null;
  if (kind === "landing_page") return content.desktop || content.mobile || null;
  if (kind === "brand_identity") return content.logo || content.applications?.[0] || null;
  return content.images?.[0] || null;
}

// Uma versão só vale a pena guardar se tiver pelo menos alguma coisa.
export function isContentEmpty(kind, content) {
  if (!content) return true;
  if (kind === "business_card") return !content.front && !content.back;
  if (kind === "landing_page") return !content.desktop && !content.mobile && !content.url;
  if (kind === "brand_identity") return !content.logo && !(content.colors || []).length && !(content.fonts || []).length && !(content.applications || []).length;
  return !(content.images || []).length;
}

export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml"];
export const MAX_FILE_BYTES = 25 * 1024 * 1024;

export const formatBytes = (bytes) => {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export const formatWhen = (iso) => {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
};

// Só deixa links http(s) (o campo "página ao vivo" é escrito pela equipa, mas
// o cliente clica nele).
export const safeHttpUrl = (value) => {
  try {
    const u = new URL(String(value || "").trim());
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : null;
  } catch {
    return null;
  }
};

export const HEX_RE = /^#[0-9a-fA-F]{6}$/;
