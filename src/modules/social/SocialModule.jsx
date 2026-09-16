import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase, invokeFunction } from "../../lib/supabaseClient.js";
import { c, sans, serif, Eyebrow, Modal, inputStyle, btnPrimary, btnGhost } from "../../shared/theme.jsx";
import { ArrowLeft, Plus, Trash2, Instagram, Facebook, Music2, Linkedin, Send, AlertCircle, BarChart3 } from "lucide-react";

/* ---------------------------------------------------------
   SOCIAL MEDIA — calendário/publicação + estatísticas manuais.
   Módulo do EMPOWER OS. Ver docs/EMPOWER_OS_ARCHITECTURE_STRATEGY.md
   (secção 16). Instagram e Facebook publicam de verdade via Meta
   Graph API (Edge Function social-publish, agendada por pg_cron).
   TikTok/LinkedIn/Threads não têm API oficial de publicação para
   apps de terceiros — os posts dessas ficam sempre "manual_only":
   preparados aqui, publicados à mão fora do sistema. Nunca simulamos
   uma publicação que não aconteceu.

   "Comentários" e "Escuta Social" (visíveis em ferramentas como a
   HighLevel) ficam de fora desta primeira versão — exigem
   permissões adicionais da Meta (gestão de comentários) que ainda
   não pedimos; ver docs/GUIA_WHATSAPP_META.md para o mesmo tipo de
   pedido de acesso, se vier a fazer sentido mais tarde.

   As estatísticas por post (alcance, impressões, etc.) ainda não são
   recolhidas automaticamente da Instagram Insights API — por agora
   só é possível registá-las manualmente aqui, para não fingir uma
   automação que ainda não existe.
--------------------------------------------------------- */

const PLATFORMS = [
  { value: "instagram", label: "Instagram", icon: Instagram, publishable: true },
  { value: "facebook", label: "Facebook", icon: Facebook, publishable: true },
  { value: "tiktok", label: "TikTok", icon: Music2, publishable: false },
  { value: "linkedin", label: "LinkedIn", icon: Linkedin, publishable: false },
];
const PLATFORM_ICON = Object.fromEntries(PLATFORMS.map((p) => [p.value, p.icon]));
const PLATFORM_LABEL = Object.fromEntries(PLATFORMS.map((p) => [p.value, p.label]));

const STATUS_LABEL = {
  draft: "Rascunho", pending_approval: "A aguardar aprovação", scheduled: "Agendado",
  publishing: "A publicar…", published: "Publicado", failed: "Falhou", manual_only: "Publicar manualmente",
};
const STATUS_COLOR = {
  draft: c.mist, pending_approval: c.amber, scheduled: "#3B5FC2", publishing: c.amber,
  published: c.sage, failed: c.rose, manual_only: c.amber,
};

/* ---------------------------------------------------------
   DATA
--------------------------------------------------------- */
function useAccounts(brandId) {
  return useQuery({
    queryKey: ["social_accounts", brandId],
    enabled: !!brandId,
    queryFn: async () => {
      const { data, error } = await supabase.from("social_accounts").select("id, platform, external_account_id, display_name, status").eq("brand_id", brandId).order("platform");
      if (error) throw error;
      return data;
    },
  });
}

function useConnectAccount(brandId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ platform, externalAccountId, displayName, accessToken }) =>
      invokeFunction("social-connect", { brandId, platform, externalAccountId, displayName, accessToken }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["social_accounts", brandId] }),
  });
}

function useDeleteAccount(brandId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from("social_accounts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["social_accounts", brandId] }),
  });
}

function usePosts(brandId) {
  return useQuery({
    queryKey: ["social_posts", brandId],
    enabled: !!brandId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("social_posts")
        .select("*, social_accounts(platform, display_name)")
        .eq("brand_id", brandId)
        .order("scheduled_at", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

function useCreatePost(brandId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (post) => {
      const { error } = await supabase.from("social_posts").insert({ brand_id: brandId, ...post });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["social_posts", brandId] }),
  });
}

function useDeletePost(brandId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from("social_posts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["social_posts", brandId] }),
  });
}

function useMetrics(postId) {
  return useQuery({
    queryKey: ["social_post_metrics", postId],
    enabled: !!postId,
    queryFn: async () => {
      const { data, error } = await supabase.from("social_post_metrics").select("*").eq("social_post_id", postId).order("captured_at", { ascending: false }).limit(1).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

function useAddMetrics(postId, brandId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (metrics) => {
      const { error } = await supabase.from("social_post_metrics").insert({ brand_id: brandId, social_post_id: postId, ...metrics });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["social_post_metrics", postId] }),
  });
}

/* ---------------------------------------------------------
   LIGAR CONTA
--------------------------------------------------------- */
function ConnectAccountModal({ brandId, onClose }) {
  const [platform, setPlatform] = useState(PLATFORMS[0].value);
  const [externalAccountId, setExternalAccountId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [error, setError] = useState("");
  const connect = useConnectAccount(brandId);
  const platformInfo = PLATFORMS.find((p) => p.value === platform);

  const save = async () => {
    setError("");
    if (!displayName.trim()) { setError("Dá um nome a esta conta (ex: @marca)."); return; }
    if (platformInfo.publishable && (!externalAccountId.trim() || !accessToken.trim())) {
      setError("Instagram/Facebook precisam do ID da conta e do token de acesso.");
      return;
    }
    try {
      await connect.mutateAsync({ platform, externalAccountId: externalAccountId.trim(), displayName: displayName.trim(), accessToken: accessToken.trim() });
      onClose();
    } catch (err) {
      setError(err.message || "Não foi possível ligar a conta.");
    }
  };

  return (
    <Modal title="Ligar conta social" onClose={onClose} width={420}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
          <div style={{ ...sans, fontSize: 11.5, color: c.mist, marginBottom: 5 }}>Plataforma</div>
          <select style={inputStyle} value={platform} onChange={(e) => setPlatform(e.target.value)}>
            {PLATFORMS.map((p) => <option key={p.value} value={p.value}>{p.label}{!p.publishable ? " — publicação manual" : ""}</option>)}
          </select>
        </div>
        <div>
          <div style={{ ...sans, fontSize: 11.5, color: c.mist, marginBottom: 5 }}>Nome/identificador da conta</div>
          <input style={inputStyle} value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="@marca" />
        </div>
        {platformInfo.publishable && (
          <>
            <div>
              <div style={{ ...sans, fontSize: 11.5, color: c.mist, marginBottom: 5 }}>{platform === "instagram" ? "Instagram Business Account ID" : "Facebook Page ID"}</div>
              <input style={inputStyle} value={externalAccountId} onChange={(e) => setExternalAccountId(e.target.value)} />
            </div>
            <div>
              <div style={{ ...sans, fontSize: 11.5, color: c.mist, marginBottom: 5 }}>Token de acesso (Page Access Token, longa duração)</div>
              <input style={inputStyle} type="password" value={accessToken} onChange={(e) => setAccessToken(e.target.value)} />
            </div>
          </>
        )}
        {!platformInfo.publishable && (
          <div style={{ ...sans, fontSize: 11.5, color: c.mist, lineHeight: 1.5 }}>
            Esta plataforma não tem API oficial de publicação para apps de terceiros — os posts ficam prontos aqui, mas publicas manualmente na app da plataforma.
          </div>
        )}
        {error && <div style={{ ...sans, fontSize: 12.5, color: c.rose }}>{error}</div>}
        <button onClick={save} disabled={connect.isPending} style={{ ...btnPrimary, width: "fit-content" }}>
          {connect.isPending ? "A ligar…" : "Ligar conta"}
        </button>
      </div>
    </Modal>
  );
}

/* ---------------------------------------------------------
   NOVO POST
--------------------------------------------------------- */
function NewPostModal({ brandId, accounts, onClose }) {
  const [accountId, setAccountId] = useState(accounts[0]?.id || "");
  const [caption, setCaption] = useState("");
  const [mediaUrl, setMediaUrl] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [error, setError] = useState("");
  const createPost = useCreatePost(brandId);

  const account = accounts.find((a) => a.id === accountId);
  const publishable = PLATFORMS.find((p) => p.value === account?.platform)?.publishable;

  const save = async (mode) => {
    setError("");
    if (!accountId) { setError("Escolhe uma conta."); return; }
    if (!caption.trim() && !mediaUrl.trim()) { setError("Escreve uma legenda ou adiciona uma imagem."); return; }
    let status = "draft";
    let scheduled_at = null;
    if (mode === "schedule") {
      if (!publishable) { setError("Esta plataforma não publica automaticamente — grava como rascunho e publica manualmente."); return; }
      if (!scheduledAt) { setError("Escolhe a data/hora."); return; }
      status = "scheduled";
      scheduled_at = new Date(scheduledAt).toISOString();
    } else if (mode === "manual") {
      status = "manual_only";
    }
    try {
      await createPost.mutateAsync({
        social_account_id: accountId, caption: caption.trim(), media_urls: mediaUrl.trim() ? [mediaUrl.trim()] : [], status, scheduled_at,
      });
      onClose();
    } catch (err) {
      setError(err.message || "Não foi possível criar o post.");
    }
  };

  return (
    <Modal title="Novo post" onClose={onClose} width={440}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
          <div style={{ ...sans, fontSize: 11.5, color: c.mist, marginBottom: 5 }}>Conta</div>
          <select style={inputStyle} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            {accounts.map((a) => <option key={a.id} value={a.id}>{PLATFORM_LABEL[a.platform]} — {a.display_name}</option>)}
          </select>
        </div>
        <div>
          <div style={{ ...sans, fontSize: 11.5, color: c.mist, marginBottom: 5 }}>Legenda</div>
          <textarea rows={4} style={{ ...inputStyle, resize: "vertical" }} value={caption} onChange={(e) => setCaption(e.target.value)} />
        </div>
        <div>
          <div style={{ ...sans, fontSize: 11.5, color: c.mist, marginBottom: 5 }}>Imagem (link, opcional)</div>
          <input style={inputStyle} value={mediaUrl} onChange={(e) => setMediaUrl(e.target.value)} placeholder="https://…" />
        </div>
        {publishable && (
          <div>
            <div style={{ ...sans, fontSize: 11.5, color: c.mist, marginBottom: 5 }}>Agendar para</div>
            <input type="datetime-local" style={inputStyle} value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
          </div>
        )}
        {error && <div style={{ ...sans, fontSize: 12.5, color: c.rose }}>{error}</div>}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={() => save("draft")} disabled={createPost.isPending} style={btnGhost}>Guardar rascunho</button>
          {publishable ? (
            <button onClick={() => save("schedule")} disabled={createPost.isPending} style={btnPrimary}>
              <Send size={13} /> Agendar publicação
            </button>
          ) : (
            <button onClick={() => save("manual")} disabled={createPost.isPending} style={btnPrimary}>Marcar pronto a publicar</button>
          )}
        </div>
      </div>
    </Modal>
  );
}

/* ---------------------------------------------------------
   MÉTRICAS
--------------------------------------------------------- */
function MetricsModal({ postId, brandId, onClose }) {
  const metricsQuery = useMetrics(postId);
  const addMetrics = useAddMetrics(postId, brandId);
  const [reach, setReach] = useState(metricsQuery.data?.reach ?? "");
  const [impressions, setImpressions] = useState(metricsQuery.data?.impressions ?? "");
  const [likes, setLikes] = useState(metricsQuery.data?.likes ?? "");
  const [comments, setComments] = useState(metricsQuery.data?.comments ?? "");
  const [shares, setShares] = useState(metricsQuery.data?.shares ?? "");
  const [saves, setSaves] = useState(metricsQuery.data?.saves ?? "");

  const save = async () => {
    await addMetrics.mutateAsync({
      reach: reach === "" ? null : Number(reach), impressions: impressions === "" ? null : Number(impressions),
      likes: likes === "" ? null : Number(likes), comments: comments === "" ? null : Number(comments),
      shares: shares === "" ? null : Number(shares), saves: saves === "" ? null : Number(saves),
    });
    onClose();
  };

  const field = (label, value, setValue) => (
    <div>
      <div style={{ ...sans, fontSize: 11.5, color: c.mist, marginBottom: 5 }}>{label}</div>
      <input type="number" style={inputStyle} value={value} onChange={(e) => setValue(e.target.value)} />
    </div>
  );

  return (
    <Modal title="Registar estatísticas" onClose={onClose} width={380}>
      <div style={{ ...sans, fontSize: 11.5, color: c.mist, marginBottom: 12, lineHeight: 1.5 }}>
        Ainda não recolhemos isto automaticamente da plataforma — copia os números do painel de estatísticas do post.
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {field("Alcance", reach, setReach)}
        {field("Impressões", impressions, setImpressions)}
        {field("Gostos", likes, setLikes)}
        {field("Comentários", comments, setComments)}
        {field("Partilhas", shares, setShares)}
        {field("Guardados", saves, setSaves)}
      </div>
      <button onClick={save} disabled={addMetrics.isPending} style={{ ...btnPrimary, marginTop: 14 }}>
        {addMetrics.isPending ? "A guardar…" : "Guardar"}
      </button>
    </Modal>
  );
}

/* ---------------------------------------------------------
   MÓDULO
--------------------------------------------------------- */
export default function SocialModule({ brand, onBack }) {
  const accountsQuery = useAccounts(brand.id);
  const postsQuery = usePosts(brand.id);
  const deleteAccount = useDeleteAccount(brand.id);
  const deletePost = useDeletePost(brand.id);
  const [showConnect, setShowConnect] = useState(false);
  const [showNewPost, setShowNewPost] = useState(false);
  const [metricsFor, setMetricsFor] = useState(null);
  const [confirmDeletePost, setConfirmDeletePost] = useState(null);

  const accounts = accountsQuery.data || [];
  const posts = postsQuery.data || [];

  return (
    <div className="bb-page" style={{ padding: "8px 40px 60px", maxWidth: 1040 }}>
      <button onClick={onBack} style={{ ...sans, display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: c.mist, background: "none", border: "none", cursor: "pointer", marginBottom: 20 }}>
        <ArrowLeft size={14} /> Voltar à marca
      </button>

      <Eyebrow>Social Media</Eyebrow>
      <h1 style={{ ...serif, fontSize: 24, color: c.ink, margin: "0 0 16px" }}>Planeador</h1>

      <div style={{ background: "#fff", border: `1px solid ${c.line}`, borderRadius: 14, padding: 18, marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div style={{ ...sans, fontSize: 12.5, fontWeight: 700, color: c.ink }}>Contas ligadas</div>
          <button onClick={() => setShowConnect(true)} style={{ ...btnGhost, padding: "6px 12px" }}>
            <Plus size={12} /> Ligar conta
          </button>
        </div>
        {accounts.length === 0 ? (
          <div style={{ ...sans, fontSize: 12.5, color: c.mistLight }}>Nenhuma conta ligada ainda.</div>
        ) : (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {accounts.map((a) => {
              const Icon = PLATFORM_ICON[a.platform];
              return (
                <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 7, background: c.paper, borderRadius: 999, padding: "6px 6px 6px 12px" }}>
                  <Icon size={13} color={c.boss} />
                  <span style={{ ...sans, fontSize: 12, color: c.ink }}>{a.display_name}</span>
                  <button onClick={() => deleteAccount.mutate(a.id)} style={{ background: "none", border: "none", cursor: "pointer", color: c.mist, padding: 4 }}>
                    <Trash2 size={11} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{ ...serif, fontSize: 17, color: c.ink }}>Posts</div>
        <button onClick={() => setShowNewPost(true)} disabled={accounts.length === 0} style={btnPrimary}>
          <Plus size={14} /> Novo post
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {posts.map((p) => {
          const Icon = PLATFORM_ICON[p.social_accounts?.platform] || Instagram;
          return (
            <div key={p.id} style={{ display: "flex", alignItems: "flex-start", gap: 14, background: "#fff", border: `1px solid ${c.line}`, borderRadius: 12, padding: "14px 18px" }}>
              <div style={{ width: 34, height: 34, borderRadius: 9, background: c.bossSoft, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Icon size={16} color={c.boss} strokeWidth={1.8} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ ...sans, fontSize: 13, color: c.ink, lineHeight: 1.4 }}>{p.caption || <em style={{ color: c.mistLight }}>Sem legenda</em>}</div>
                <div style={{ ...sans, fontSize: 11, color: c.mist, marginTop: 4 }}>
                  {p.social_accounts?.display_name} {p.scheduled_at && `· ${new Date(p.scheduled_at).toLocaleString("pt-PT")}`}
                </div>
                {p.status === "failed" && p.failure_reason && (
                  <div style={{ ...sans, fontSize: 11, color: c.rose, marginTop: 4, display: "flex", alignItems: "center", gap: 4 }}>
                    <AlertCircle size={11} /> {p.failure_reason}
                  </div>
                )}
              </div>
              <span style={{ ...sans, fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", borderRadius: 999, padding: "4px 10px", color: STATUS_COLOR[p.status], background: c.paper, flexShrink: 0 }}>
                {STATUS_LABEL[p.status]}
              </span>
              <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
                {p.status === "published" && (
                  <button onClick={() => setMetricsFor(p.id)} style={{ background: "none", border: "none", cursor: "pointer", color: c.mist, padding: 5 }} title="Registar estatísticas">
                    <BarChart3 size={14} />
                  </button>
                )}
                <button onClick={() => setConfirmDeletePost(p)} style={{ background: "none", border: "none", cursor: "pointer", color: c.mist, padding: 5 }}>
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          );
        })}
        {!postsQuery.isLoading && posts.length === 0 && (
          <div style={{ ...sans, fontSize: 13, color: c.mistLight, textAlign: "center", padding: "40px 0" }}>
            {accounts.length === 0 ? "Liga uma conta social para começares." : "Ainda não há posts."}
          </div>
        )}
      </div>

      {showConnect && <ConnectAccountModal brandId={brand.id} onClose={() => setShowConnect(false)} />}
      {showNewPost && <NewPostModal brandId={brand.id} accounts={accounts} onClose={() => setShowNewPost(false)} />}
      {metricsFor && <MetricsModal postId={metricsFor} brandId={brand.id} onClose={() => setMetricsFor(null)} />}

      {confirmDeletePost && (
        <Modal title="Eliminar post" onClose={() => setConfirmDeletePost(null)} width={360}>
          <div style={{ ...sans, fontSize: 13, color: c.ink, marginBottom: 16 }}>Tens a certeza? Esta ação não pode ser desfeita.</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => deletePost.mutate(confirmDeletePost.id, { onSuccess: () => setConfirmDeletePost(null) })} style={{ ...btnPrimary, background: c.rose }}>Eliminar</button>
            <button onClick={() => setConfirmDeletePost(null)} style={btnGhost}>Cancelar</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
