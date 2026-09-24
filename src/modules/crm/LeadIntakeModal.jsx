import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabaseClient.js";
import { c, sans, Modal, inputStyle, btnPrimary, btnGhost } from "../../shared/theme.jsx";
import { Copy, Check, RefreshCw } from "lucide-react";

/* ---------------------------------------------------------
   ENTRADA DE LEADS — endereço público que as landing pages externas
   chamam para criar contactos neste CRM. Só a equipa da agência
   configura (a tabela brand_lead_webhooks só deixa a equipa ler/escrever).
--------------------------------------------------------- */

const ENDPOINT = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/lead-intake`;

function useLeadWebhook(brandId) {
  return useQuery({
    queryKey: ["lead_webhook", brandId],
    enabled: !!brandId,
    queryFn: async () => {
      // Cria a linha (com token gerado pela base de dados) na primeira vez.
      const { error: upsertError } = await supabase
        .from("brand_lead_webhooks")
        .upsert({ brand_id: brandId }, { onConflict: "brand_id", ignoreDuplicates: true });
      if (upsertError) throw upsertError;
      const { data, error } = await supabase.from("brand_lead_webhooks").select("*").eq("brand_id", brandId).single();
      if (error) throw error;
      return data;
    },
  });
}

function useBrandTags(brandId) {
  return useQuery({
    queryKey: ["lead_webhook_tags", brandId],
    enabled: !!brandId,
    queryFn: async () => {
      const { data, error } = await supabase.from("tags").select("id, name, color").eq("brand_id", brandId).order("name");
      if (error) throw error;
      return data;
    },
  });
}

function useSaveLeadWebhook(brandId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch) => {
      const { error } = await supabase.from("brand_lead_webhooks").update(patch).eq("brand_id", brandId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["lead_webhook", brandId] }),
  });
}

function useRotateToken(brandId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("rotate_lead_webhook_token", { p_brand_id: brandId });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["lead_webhook", brandId] }),
  });
}

function CopyRow({ label, value }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // sem permissão de clipboard: o texto continua selecionável
    }
  };
  return (
    <div>
      <div style={{ ...sans, fontSize: 11.5, color: c.mist, marginBottom: 5 }}>{label}</div>
      <div style={{ display: "flex", gap: 6 }}>
        <input readOnly style={{ ...inputStyle, fontSize: 12, fontFamily: "monospace", minWidth: 0 }} value={value} onFocus={(e) => e.target.select()} />
        <button onClick={copy} style={btnGhost} aria-label={`Copiar ${label}`}>
          {copied ? <Check size={13} /> : <Copy size={13} />}
        </button>
      </div>
    </div>
  );
}

export default function LeadIntakeModal({ brand, onClose }) {
  const webhookQuery = useLeadWebhook(brand.id);
  const tagsQuery = useBrandTags(brand.id);
  const save = useSaveLeadWebhook(brand.id);
  const rotate = useRotateToken(brand.id);
  const [confirmRotate, setConfirmRotate] = useState(false);
  const [error, setError] = useState("");
  const hook = webhookQuery.data;

  const run = async (fn) => {
    setError("");
    try {
      await fn();
    } catch (err) {
      setError(err.message || "Não foi possível guardar.");
    }
  };

  const toggleTag = (tagId) => {
    const current = new Set(hook.default_tag_ids || []);
    if (current.has(tagId)) current.delete(tagId);
    else current.add(tagId);
    run(() => save.mutateAsync({ default_tag_ids: [...current] }));
  };

  const example = hook
    ? `curl -X POST "${ENDPOINT}" \\
  -H "x-lead-token: ${hook.token}" \\
  -H "Content-Type: application/json" \\
  -d '{"name":"Ana Silva","email":"ana@exemplo.com","phone":"912345678",
       "consent":true,"tags":["Lead_LandingPage"],
       "cf_curso_interesse":"Podologia"}'`
    : "";

  return (
    <Modal title="Entrada de leads" onClose={onClose} width={560}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ ...sans, fontSize: 12.5, color: c.mist, lineHeight: 1.6 }}>
          Liga as landing pages externas (Webflow, Elementor, WordPress, Zapier…) a este CRM: cada envio cria — ou atualiza — um contacto de <b>{brand.name}</b>, aplica as tags e dispara as automações.
        </div>

        {webhookQuery.isLoading && <div style={{ ...sans, fontSize: 13, color: c.mist }}>A carregar…</div>}
        {webhookQuery.isError && (
          <div style={{ ...sans, fontSize: 12.5, color: c.rose }}>
            Não foi possível abrir a configuração. Só a equipa da agência pode gerir a entrada de leads.
          </div>
        )}

        {hook && (
          <>
            <label style={{ ...sans, fontSize: 12.5, color: c.ink, display: "flex", alignItems: "center", gap: 7 }}>
              <input
                type="checkbox"
                checked={hook.enabled}
                onChange={(e) => run(() => save.mutateAsync({ enabled: e.target.checked }))}
              />
              Entrada de leads ligada
            </label>

            <CopyRow label="Endereço (URL)" value={ENDPOINT} />
            <CopyRow label="Token (cabeçalho x-lead-token)" value={hook.token} />
            <CopyRow label="URL com token — para plataformas que só aceitam um endereço" value={`${ENDPOINT}?token=${hook.token}`} />

            <div style={{ ...sans, fontSize: 11.5, color: c.mist, lineHeight: 1.6 }}>
              Quem tiver o token pode criar leads nesta marca (não consegue ler nada). Se ficar exposto, gera um novo — o antigo deixa de funcionar logo.
            </div>
            {confirmRotate ? (
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ ...sans, fontSize: 12, color: c.ink }}>As landing pages ligadas vão parar até atualizares o token.</span>
                <button
                  onClick={() => run(async () => { await rotate.mutateAsync(); setConfirmRotate(false); })}
                  disabled={rotate.isPending}
                  style={{ ...btnPrimary, background: c.rose }}
                >
                  {rotate.isPending ? "A gerar…" : "Gerar novo token"}
                </button>
                <button onClick={() => setConfirmRotate(false)} style={btnGhost}>Cancelar</button>
              </div>
            ) : (
              <button onClick={() => setConfirmRotate(true)} style={{ ...btnGhost, alignSelf: "flex-start" }}>
                <RefreshCw size={13} /> Gerar novo token
              </button>
            )}

            <div>
              <div style={{ ...sans, fontSize: 11.5, color: c.mist, marginBottom: 6 }}>Tags aplicadas a todos os leads que entram por aqui</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {(tagsQuery.data || []).map((tag) => {
                  const active = (hook.default_tag_ids || []).includes(tag.id);
                  return (
                    <button
                      key={tag.id}
                      onClick={() => toggleTag(tag.id)}
                      style={{
                        ...sans, fontSize: 11.5, fontWeight: 600, padding: "5px 10px", borderRadius: 999, cursor: "pointer",
                        border: `1px solid ${active ? tag.color : c.line}`,
                        color: active ? "#fff" : c.mist,
                        background: active ? tag.color : "#fff",
                      }}
                    >
                      {tag.name}
                    </button>
                  );
                })}
                {!tagsQuery.data?.length && <span style={{ ...sans, fontSize: 11.5, color: c.mist }}>Ainda não há tags nesta marca.</span>}
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
              <div>
                <div style={{ ...sans, fontSize: 11.5, color: c.mist, marginBottom: 5 }}>Origem por omissão</div>
                <input
                  style={inputStyle}
                  defaultValue={hook.default_source}
                  maxLength={40}
                  onBlur={(e) => {
                    const v = e.target.value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "") || "landing_page";
                    e.target.value = v;
                    if (v !== hook.default_source) run(() => save.mutateAsync({ default_source: v }));
                  }}
                />
              </div>
              <div>
                <div style={{ ...sans, fontSize: 11.5, color: c.mist, marginBottom: 5 }}>Indicativo por omissão (telefones com 9 dígitos)</div>
                <input
                  style={inputStyle}
                  defaultValue={hook.default_country_code}
                  inputMode="numeric"
                  maxLength={4}
                  onBlur={(e) => {
                    const v = e.target.value.replace(/\D/g, "") || "351";
                    e.target.value = v;
                    if (v !== hook.default_country_code) run(() => save.mutateAsync({ default_country_code: v }));
                  }}
                />
              </div>
            </div>

            <div>
              <div style={{ ...sans, fontSize: 11.5, color: c.mist, marginBottom: 5 }}>Exemplo</div>
              <pre style={{ ...sans, fontFamily: "monospace", fontSize: 11, background: c.bossSoft, color: c.ink, borderRadius: 8, padding: 10, margin: 0, overflowX: "auto", whiteSpace: "pre" }}>{example}</pre>
              <div style={{ ...sans, fontSize: 11.5, color: c.mist, marginTop: 8, lineHeight: 1.6 }}>
                Campos: <code>name</code>, <code>email</code>, <code>phone</code> (é preciso email ou telefone), <code>birth_date</code>, <code>source</code>, <code>tags</code>, <code>consent</code> (ou <code>consent_whatsapp</code> / <code>consent_email</code> / <code>consent_sms</code>), <code>cf_&lt;campo&gt;</code> para campos personalizados, <code>referrer_email</code> / <code>referrer_phone</code> para indicações. Sem consentimento marcado, o lead entra sem autorização de envio.
              </div>
            </div>
          </>
        )}

        {error && <div style={{ ...sans, fontSize: 12.5, color: c.rose }}>{error}</div>}

        <button onClick={onClose} style={{ ...btnGhost, alignSelf: "flex-start" }}>Fechar</button>
      </div>
    </Modal>
  );
}
