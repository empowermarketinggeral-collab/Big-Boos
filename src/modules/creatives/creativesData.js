import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabaseClient.js";
import { IMAGE_TYPES, MAX_FILE_BYTES, VIDEO_TYPES, MAX_VIDEO_BYTES } from "./creativesKinds.js";

const BUCKET = "creatives";
const URL_TTL = 3600;

export function useCreativeProjects(brandId) {
  return useQuery({
    queryKey: ["creative_projects", brandId],
    enabled: !!brandId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("creative_projects")
        .select("id, brand_id, kind, title, position, created_at")
        .eq("brand_id", brandId)
        .order("position", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}

export function useCreativeOptions(projectId) {
  return useQuery({
    queryKey: ["creative_options", projectId],
    enabled: !!projectId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("creative_options")
        .select("id, project_id, brand_id, title, status, position, decided_at, decided_by_name, final_files, created_at")
        .eq("project_id", projectId)
        .order("position", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}

// Todas as versões das opções de um trabalho (para a grelha e para o detalhe).
export function useCreativeVersions(optionIds) {
  const key = [...optionIds].sort().join(",");
  return useQuery({
    queryKey: ["creative_versions", key],
    enabled: optionIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("creative_versions")
        .select("id, option_id, version, note, content, created_at")
        .in("option_id", optionIds)
        .order("version", { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}

export function useCreativeComments(optionId) {
  return useQuery({
    queryKey: ["creative_comments", optionId],
    enabled: !!optionId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("creative_comments")
        .select("id, version, author_name, from_client, body, target, created_at")
        .eq("option_id", optionId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}

export function useShareLink(projectId) {
  return useQuery({
    queryKey: ["creative_share_link", projectId],
    enabled: !!projectId,
    queryFn: async () => {
      const { data, error } = await supabase.from("creative_share_links").select("token").eq("project_id", projectId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

// Links temporários (1 hora) para ficheiros do bucket privado.
export function useSignedUrls(paths) {
  const unique = [...new Set(paths.filter(Boolean))].sort();
  return useQuery({
    queryKey: ["creative_urls", unique.join("|")],
    enabled: unique.length > 0,
    staleTime: (URL_TTL - 600) * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(unique, URL_TTL);
      if (error) throw error;
      const map = {};
      for (const item of data || []) if (item.path && item.signedUrl) map[item.path] = item.signedUrl;
      return map;
    },
  });
}

export async function signedDownloadUrl(path, filename) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, URL_TTL, { download: filename });
  if (error) throw error;
  return data.signedUrl;
}

const safeName = (name) =>
  String(name || "ficheiro")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^[-.]+/, "").slice(-80) || "ficheiro";

// O primeiro segmento do caminho é o id da marca (as políticas de storage verificam isso).
export async function uploadCreativeFile(brandId, projectId, file, { imageOnly = true, allowVideo = false } = {}) {
  const isVideo = VIDEO_TYPES.includes(file.type);
  if (isVideo && !allowVideo) throw new Error(`${file.name}: aqui só são aceites imagens.`);
  if (imageOnly && !isVideo && !IMAGE_TYPES.includes(file.type)) {
    throw new Error(allowVideo ? `${file.name}: só são aceites imagens (PNG, JPG, WebP, GIF, SVG) ou vídeos (MP4, MOV, WebM).` : `${file.name}: só são aceites imagens PNG, JPG, WebP, GIF ou SVG.`);
  }
  if (isVideo && file.size > MAX_VIDEO_BYTES) throw new Error(`${file.name}: o vídeo passa os 50 MB. Exporta-o mais leve (ex: 1080p, H.264).`);
  if (!isVideo && file.size > MAX_FILE_BYTES) throw new Error(`${file.name}: o ficheiro passa os 25 MB.`);
  let name = safeName(file.name);
  // O vídeo é reconhecido pela extensão: garante que o caminho a tem.
  const videoExt = { "video/mp4": ".mp4", "video/quicktime": ".mov", "video/webm": ".webm" }[file.type];
  if (videoExt && !/\.(mp4|mov|m4v|webm)$/i.test(name)) name += videoExt;
  const path = `${brandId}/${projectId}/${crypto.randomUUID()}-${name}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type || "application/octet-stream" });
  if (error) throw new Error(`Não foi possível carregar ${file.name}.`);
  return path;
}

export async function removeCreativeFiles(paths) {
  if (!paths.length) return;
  await supabase.storage.from(BUCKET).remove(paths);
}

export function useInvalidateCreatives() {
  const qc = useQueryClient();
  return (...parts) => Promise.all(parts.map((p) => qc.invalidateQueries({ queryKey: [p] })));
}
