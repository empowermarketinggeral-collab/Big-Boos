import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase, invokeFunction } from "../../lib/supabaseClient.js";
import { c, sans, serif, Eyebrow, Modal, inputStyle, btnPrimary, btnGhost } from "../../shared/theme.jsx";
import { ArrowLeft, Plus, Trash2, Mail, Send } from "lucide-react";

/* ---------------------------------------------------------
   EMAIL — campanhas via Resend, camada de abstração fina.
   Módulo do EMPOWER OS. Ver docs/EMPOWER_OS_ARCHITECTURE_STRATEGY.md
   (secção 15) e docs/GUIA_EMAIL_RESEND.md para ligar um domínio real.

   O envio passa sempre pela Edge Function email-send — a chave da
   API vive no Supabase Vault, o frontend nunca a vê. Um destinatário
   só recebe email se opted_in_email = true (consentimento no CRM).
--------------------------------------------------------- */

function useEmailDomain(brandId) {
  return useQuery({
    queryKey: ["email_domain", brandId],
    enabled: !!brandId,
    queryFn: async () => {
      const { data, error } = await supabase.from("email_domains").select("id, domain, from_name, from_email, verified").eq("brand_id", brandId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

function useConnectEmail(brandId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ domain, fromName, fromEmail, apiKey }) => {
      return invokeFunction("email-connect", { brandId, domain, fromName, fromEmail, apiKey });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["email_domain", brandId] }),
  });
}

function useCampaigns(brandId) {
  return useQuery({
    queryKey: ["email_campaigns", brandId],
    enabled: !!brandId,
    queryFn: async () => {
      const { data, error } = await supabase.from("email_campaigns").select("*").eq("brand_id", brandId).order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

function useCreateCampaign(brandId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name) => {
      const { data, error } = await supabase.from("email_campaigns").insert({ brand_id: brandId, name, subject: "", body_html: "", status: "draft" }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["email_campaigns", brandId] }),
  });
}

function useUpdateCampaign(brandId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }) => {
      const { error } = await supabase.from("email_campaigns").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["email_campaigns", brandId] }),
  });
}

function useDeleteCampaign(brandId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from("email_campaigns").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["email_campaigns", brandId] }),
  });
}

function useSendCampaign(brandId, campaignId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (contactIds) => {
      return invokeFunction("email-send", { campaignId, contactIds });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["email_campaigns", brandId] });
      qc.invalidateQueries({ queryKey: ["email_sends", campaignId] });
    },
  });
}

function useSends(campaignId) {
  return useQuery({
    queryKey: ["email_sends", campaignId],
    enabled: !!campaignId,
    queryFn: async () => {
      const { data, error } = await supabase.from("email_sends").select("status").eq("campaign_id", campaignId);
      if (error) throw error;
      return data;
    },
  });
}

// Mesmas queryKeys do CRM — cache partilhado, sem duplicar dados.
function useContacts(brandId) {
  return useQuery({
    queryKey: ["crm_contacts_light", brandId],
    enabled: !!brandId,
    queryFn: async () => {
      const { data, error } = await supabase.from("contacts").select("id, name, email, opted_in_email").eq("brand_id", brandId);
      if (error) throw error;
      return data;
    },
  });
}

function useTags(brandId) {
  return useQuery({
    queryKey: ["crm_tags", brandId],
    enabled: !!brandId,
    queryFn: async () => {
      const { data, error } = await supabase.from("tags").select("*").eq("brand_id", brandId).order("name");
      if (error) throw error;
      return data;
    },
  });
}

function useContactTagMap(brandId) {
  return useQuery({
    queryKey: ["crm_contact_tags_map", brandId],
    enabled: !!brandId,
    queryFn: async () => {
      const { data, error } = await supabase.from("contact_tags").select("contact_id, tag_id").eq("brand_id", brandId);
      if (error) throw error;
      return data;
    },
  });
}

/* ---------------------------------------------------------
   LIGAR DOMÍNIO
--------------------------------------------------------- */
function ConnectEmailForm({ brandId }) {
  const [domain, setDomain] = useState("");
  const [fromName, setFromName] = useState("");
  const [fromEmail, setFromEmail] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState("");
  const connect = useConnectEmail(brandId);

  const submit = async () => {
    setError("");
    if (!domain.trim() || !fromEmail.trim() || !apiKey.trim()) {
      setError("Domínio, email de envio e API key são obrigatórios.");
      return;
    }
    try {
      await connect.mutateAsync({ domain: domain.trim(), fromName: fromName.trim(), fromEmail: fromEmail.trim(), apiKey: apiKey.trim() });
    } catch (err) {
      setError(err.message || "Não foi possível ligar o email.");
    }
  };

  return (
    <div style={{ maxWidth: 480 }}>
      <Eyebrow>Email</Eyebrow>
      <h1 style={{ ...serif, fontSize: 24, color: c.ink, marginBottom: 8 }}>Ligar o domínio desta marca</h1>
      <p style={{ ...sans, fontSize: 13, color: c.mist, lineHeight: 1.6, marginBottom: 22 }}>
        Precisas de um domínio verificado no Resend e de uma API key. Segue <strong>docs/GUIA_EMAIL_RESEND.md</strong> se ainda não os tiveres.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
          <div style={{ ...sans, fontSize: 11.5, color: c.mist, marginBottom: 5 }}>Domínio verificado</div>
          <input style={inputStyle} value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="empowermarketing.pt" />
        </div>
        <div>
          <div style={{ ...sans, fontSize: 11.5, color: c.mist, marginBottom: 5 }}>Nome de remetente (opcional)</div>
          <input style={inputStyle} value={fromName} onChange={(e) => setFromName(e.target.value)} placeholder="Empower Marketing" />
        </div>
        <div>
          <div style={{ ...sans, fontSize: 11.5, color: c.mist, marginBottom: 5 }}>Email de envio</div>
          <input style={inputStyle} value={fromEmail} onChange={(e) => setFromEmail(e.target.value)} placeholder="contacto@empowermarketing.pt" />
        </div>
        <div>
          <div style={{ ...sans, fontSize: 11.5, color: c.mist, marginBottom: 5 }}>API key do Resend</div>
          <input style={inputStyle} type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="re_…" />
        </div>
        {error && <div style={{ ...sans, fontSize: 12.5, color: c.rose }}>{error}</div>}
        <button onClick={submit} disabled={connect.isPending} style={{ ...btnPrimary, width: "fit-content" }}>
          {connect.isPending ? "A ligar…" : "Ligar email"}
        </button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------
   EDITOR DE CAMPANHA
--------------------------------------------------------- */
function SendCampaignModal({ brand, campaign, recipientCount, onClose, onSent }) {
  const sendCampaign = useSendCampaign(brand.id, campaign.id);
  const [error, setError] = useState("");

  const confirm = async () => {
    setError("");
    try {
      const result = await sendCampaign.mutateAsync(campaign._contactIds);
      onSent(result);
    } catch (err) {
      setError(err.message || "Não foi possível enviar.");
    }
  };

  return (
    <Modal title="Enviar campanha" onClose={onClose} width={380}>
      <div style={{ ...sans, fontSize: 13, color: c.ink, marginBottom: 16, lineHeight: 1.6 }}>
        Vais enviar <strong>{campaign.name}</strong> a <strong>{recipientCount}</strong> contacto(s) com consentimento de email. Esta ação não pode ser desfeita.
      </div>
      {error && <div style={{ ...sans, fontSize: 12.5, color: c.rose, marginBottom: 12 }}>{error}</div>}
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={confirm} disabled={sendCampaign.isPending || recipientCount === 0} style={btnPrimary}>
          {sendCampaign.isPending ? "A enviar…" : "Confirmar envio"}
        </button>
        <button onClick={onClose} style={btnGhost}>Cancelar</button>
      </div>
    </Modal>
  );
}

function CampaignEditor({ brand, campaign, domain, onBack }) {
  const [name, setName] = useState(campaign.name);
  const [subject, setSubject] = useState(campaign.subject || "");
  const [bodyHtml, setBodyHtml] = useState(campaign.body_html || "");
  const [tagIds, setTagIds] = useState([]);
  const [allOptedIn, setAllOptedIn] = useState(true);
  const [saved, setSaved] = useState(false);
  const [showSend, setShowSend] = useState(false);
  const [sendResult, setSendResult] = useState(null);
  const [error, setError] = useState("");

  const updateCampaign = useUpdateCampaign(brand.id);
  const tagsQuery = useTags(brand.id);
  const contactsQuery = useContacts(brand.id);
  const tagMapQuery = useContactTagMap(brand.id);
  const sendsQuery = useSends(campaign.id);

  const toggleTag = (id) => setTagIds((t) => (t.includes(id) ? t.filter((x) => x !== id) : [...t, id]));

  const recipientIds = (() => {
    const contacts = (contactsQuery.data || []).filter((ct) => ct.opted_in_email && ct.email);
    if (allOptedIn || tagIds.length === 0) return contacts.map((ct) => ct.id);
    const map = tagMapQuery.data || [];
    const withTag = new Set(map.filter((m) => tagIds.includes(m.tag_id)).map((m) => m.contact_id));
    return contacts.filter((ct) => withTag.has(ct.id)).map((ct) => ct.id);
  })();

  const save = async () => {
    setError("");
    try {
      await updateCampaign.mutateAsync({ id: campaign.id, patch: { name, subject, body_html: bodyHtml } });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err.message || "Não foi possível guardar.");
    }
  };

  const sends = sendsQuery.data || [];
  const statusCounts = sends.reduce((acc, s) => ({ ...acc, [s.status]: (acc[s.status] || 0) + 1 }), {});
  const isSent = campaign.status === "sent" || campaign.status === "sending";

  return (
    <div>
      <button onClick={onBack} style={{ ...sans, display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: c.mist, background: "none", border: "none", cursor: "pointer", marginBottom: 16 }}>
        <ArrowLeft size={14} /> Email
      </button>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 6 }}>
        <input value={name} onChange={(e) => setName(e.target.value)} disabled={isSent} style={{ ...serif, fontSize: 24, color: c.ink, border: "none", outline: "none", background: "none" }} />
        {!isSent && (
          <button onClick={save} disabled={updateCampaign.isPending} style={btnPrimary}>
            {updateCampaign.isPending ? "A guardar…" : saved ? "Guardado ✓" : "Guardar"}
          </button>
        )}
      </div>
      <div style={{ ...sans, fontSize: 11.5, color: c.mist, marginBottom: 20 }}>
        Enviado de: <strong>{domain.from_name ? `${domain.from_name} <${domain.from_email}>` : domain.from_email}</strong>
      </div>

      {error && <div style={{ ...sans, fontSize: 12.5, color: c.rose, marginBottom: 16 }}>{error}</div>}

      {isSent && (
        <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
          {["sent", "opened", "clicked", "bounced", "failed"].map((k) => (
            <span key={k} style={{ ...sans, fontSize: 11.5, fontWeight: 600, borderRadius: 999, padding: "5px 12px", background: c.paper, color: c.ink }}>
              {statusCounts[k] || 0} {k}
            </span>
          ))}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 640 }}>
        <div style={{ background: "#fff", border: `1px solid ${c.line}`, borderRadius: 14, padding: 20 }}>
          <div style={{ ...serif, fontSize: 15.5, color: c.ink, marginBottom: 14 }}>Mensagem</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <div style={{ ...sans, fontSize: 11.5, color: c.mist, marginBottom: 5 }}>Assunto</div>
              <input style={inputStyle} value={subject} onChange={(e) => setSubject(e.target.value)} disabled={isSent} placeholder="Assunto do email" />
            </div>
            <div>
              <div style={{ ...sans, fontSize: 11.5, color: c.mist, marginBottom: 5 }}>Corpo (aceita HTML simples)</div>
              <textarea rows={8} style={{ ...inputStyle, resize: "vertical" }} value={bodyHtml} onChange={(e) => setBodyHtml(e.target.value)} disabled={isSent} />
            </div>
          </div>
        </div>

        {!isSent && (
          <div style={{ background: "#fff", border: `1px solid ${c.line}`, borderRadius: 14, padding: 20 }}>
            <div style={{ ...serif, fontSize: 15.5, color: c.ink, marginBottom: 14 }}>Destinatários</div>
            <label style={{ ...sans, fontSize: 12.5, color: c.ink, display: "flex", alignItems: "center", gap: 7, marginBottom: 10 }}>
              <input type="checkbox" checked={allOptedIn} onChange={(e) => setAllOptedIn(e.target.checked)} />
              Todos os contactos com consentimento de email
            </label>
            {!allOptedIn && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {(tagsQuery.data || []).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => toggleTag(t.id)}
                    style={{
                      ...sans, fontSize: 11, fontWeight: 600, padding: "5px 10px", borderRadius: 999, cursor: "pointer",
                      color: tagIds.includes(t.id) ? "#fff" : t.color, background: tagIds.includes(t.id) ? t.color : "#fff",
                      border: `1px solid ${t.color}`,
                    }}
                  >
                    {t.name}
                  </button>
                ))}
              </div>
            )}
            <div style={{ ...sans, fontSize: 12, color: c.mist, marginTop: 12 }}>
              {recipientIds.length} contacto(s) vão receber este email.
            </div>
            <button
              onClick={() => setShowSend(true)}
              disabled={!subject.trim() || recipientIds.length === 0}
              style={{ ...btnPrimary, marginTop: 14, display: "flex", alignItems: "center", gap: 6 }}
            >
              <Send size={13} /> Enviar campanha
            </button>
          </div>
        )}
      </div>

      {showSend && (
        <SendCampaignModal
          brand={brand}
          campaign={{ ...campaign, name, _contactIds: recipientIds }}
          recipientCount={recipientIds.length}
          onClose={() => setShowSend(false)}
          onSent={(result) => { setShowSend(false); setSendResult(result); }}
        />
      )}

      {sendResult && (
        <Modal title="Campanha enviada" onClose={() => setSendResult(null)} width={360}>
          <div style={{ ...sans, fontSize: 13, color: c.ink, lineHeight: 1.8 }}>
            <div>{sendResult.sent} enviados</div>
            <div>{sendResult.skipped} ignorados (sem email ou sem consentimento)</div>
            {sendResult.failed > 0 && <div style={{ color: c.rose }}>{sendResult.failed} falharam</div>}
          </div>
          <button onClick={() => setSendResult(null)} style={{ ...btnGhost, marginTop: 16 }}>Fechar</button>
        </Modal>
      )}
    </div>
  );
}

/* ---------------------------------------------------------
   MÓDULO
--------------------------------------------------------- */
export default function EmailModule({ brand, onBack }) {
  const domainQuery = useEmailDomain(brand.id);
  const campaignsQuery = useCampaigns(brand.id);
  const createCampaign = useCreateCampaign(brand.id);
  const deleteCampaign = useDeleteCampaign(brand.id);
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [openId, setOpenId] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const campaigns = campaignsQuery.data || [];
  const open = openId ? campaigns.find((cp) => cp.id === openId) : null;

  if (domainQuery.isLoading) {
    return <div style={{ ...sans, fontSize: 13, color: c.mist }}>A verificar ligação…</div>;
  }

  if (!domainQuery.data) {
    return (
      <div className="bb-page" style={{ padding: "8px 40px 60px", maxWidth: 1040 }}>
        <button onClick={onBack} style={{ ...sans, display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: c.mist, background: "none", border: "none", cursor: "pointer", marginBottom: 20 }}>
          <ArrowLeft size={14} /> Voltar à marca
        </button>
        <ConnectEmailForm brandId={brand.id} />
      </div>
    );
  }

  if (open) {
    return (
      <div className="bb-page" style={{ padding: "8px 40px 60px", maxWidth: 1040 }}>
        <CampaignEditor brand={brand} campaign={open} domain={domainQuery.data} onBack={() => setOpenId(null)} />
      </div>
    );
  }

  return (
    <div className="bb-page" style={{ padding: "8px 40px 60px", maxWidth: 1040 }}>
      <button onClick={onBack} style={{ ...sans, display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: c.mist, background: "none", border: "none", cursor: "pointer", marginBottom: 20 }}>
        <ArrowLeft size={14} /> Voltar à marca
      </button>

      <Eyebrow>Email</Eyebrow>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <h1 style={{ ...serif, fontSize: 24, color: c.ink, margin: 0 }}>Campanhas</h1>
        <button onClick={() => setShowNew(true)} style={btnPrimary}>
          <Plus size={14} /> Nova campanha
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {campaigns.map((cp) => (
          <div key={cp.id} style={{ display: "flex", alignItems: "center", gap: 14, background: "#fff", border: `1px solid ${c.line}`, borderRadius: 12, padding: "14px 18px", cursor: "pointer" }} onClick={() => setOpenId(cp.id)}>
            <div style={{ width: 34, height: 34, borderRadius: 9, background: c.bossSoft, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Mail size={16} color={c.boss} strokeWidth={1.8} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ ...serif, fontSize: 15, color: c.ink }}>{cp.name}</div>
              <div style={{ ...sans, fontSize: 11.5, color: c.mist, marginTop: 2 }}>{cp.subject || "Sem assunto ainda"}</div>
            </div>
            <span
              style={{
                ...sans, fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", borderRadius: 999, padding: "4px 10px",
                color: cp.status === "sent" ? c.sage : c.mist, background: cp.status === "sent" ? "#E7F5EC" : c.paper,
              }}
            >
              {cp.status === "sent" ? "Enviada" : cp.status === "sending" ? "A enviar" : "Rascunho"}
            </span>
            {cp.status === "draft" && (
              <button onClick={(e) => { e.stopPropagation(); setConfirmDelete(cp); }} style={{ background: "none", border: "none", cursor: "pointer", color: c.mist, padding: 6, flexShrink: 0 }}>
                <Trash2 size={14} />
              </button>
            )}
          </div>
        ))}
        {!campaignsQuery.isLoading && campaigns.length === 0 && (
          <div style={{ ...sans, fontSize: 13, color: c.mistLight, textAlign: "center", padding: "40px 0" }}>Ainda não há campanhas.</div>
        )}
      </div>

      {showNew && (
        <Modal title="Nova campanha" onClose={() => setShowNew(false)} width={360}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <input style={inputStyle} value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nome interno da campanha" autoFocus />
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => newName.trim() && createCampaign.mutate(newName.trim(), { onSuccess: (created) => { setShowNew(false); setNewName(""); setOpenId(created.id); } })}
                disabled={createCampaign.isPending}
                style={btnPrimary}
              >
                {createCampaign.isPending ? "A criar…" : "Criar"}
              </button>
              <button onClick={() => setShowNew(false)} style={btnGhost}>Cancelar</button>
            </div>
          </div>
        </Modal>
      )}

      {confirmDelete && (
        <Modal title="Eliminar campanha" onClose={() => setConfirmDelete(null)} width={360}>
          <div style={{ ...sans, fontSize: 13, color: c.ink, marginBottom: 16 }}>Tens a certeza? Esta ação não pode ser desfeita.</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => deleteCampaign.mutate(confirmDelete.id, { onSuccess: () => setConfirmDelete(null) })} style={{ ...btnPrimary, background: c.rose }}>
              Eliminar
            </button>
            <button onClick={() => setConfirmDelete(null)} style={btnGhost}>Cancelar</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
