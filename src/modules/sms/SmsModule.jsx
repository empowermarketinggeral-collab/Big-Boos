import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase, invokeFunction } from "../../lib/supabaseClient.js";
import { c, sans, serif, Eyebrow, Modal, inputStyle, btnPrimary, btnGhost } from "../../shared/theme.jsx";
import { ArrowLeft, MessageSquare, AlertCircle, CheckCircle2, Plus, Trash2, Send } from "lucide-react";

/* ---------------------------------------------------------
   SMS — via Twilio. Módulo do EMPOWER OS.
   Ver docs/GUIA_TWILIO.md.

   Três formas de sair um SMS: automações/lembretes de agendamento
   (já existentes), envio avulso a um contacto/número, e campanhas em
   massa — mesmo padrão do email/WhatsApp, mas sem restrição de janela
   de 24h (um SMS normal pode ser enviado a qualquer momento).
--------------------------------------------------------- */

function useSmsAccount(brandId) {
  return useQuery({
    queryKey: ["sms_account", brandId],
    enabled: !!brandId,
    queryFn: async () => {
      const { data, error } = await supabase.from("sms_accounts").select("id, account_sid, from_number, status").eq("brand_id", brandId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

function useConnectSms(brandId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ accountSid, fromNumber, authToken }) => invokeFunction("sms-connect", { brandId, accountSid, fromNumber, authToken }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sms_account", brandId] }),
  });
}

function useSmsUsage(brandId) {
  return useQuery({
    queryKey: ["messaging_usage", brandId, "sms"],
    enabled: !!brandId,
    queryFn: async () => {
      const since = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
      const { data, error } = await supabase.from("messaging_usage_daily").select("num_messages, cost, currency").eq("brand_id", brandId).eq("channel", "sms").gte("date", since);
      if (error) throw error;
      return (data || []).reduce((acc, r) => ({ numMessages: acc.numMessages + r.num_messages, cost: acc.cost + Number(r.cost), currency: r.currency || acc.currency }), { numMessages: 0, cost: 0, currency: "USD" });
    },
  });
}

function useSmsMessages(brandId) {
  return useQuery({
    queryKey: ["sms_messages", brandId],
    enabled: !!brandId,
    refetchInterval: 10000,
    queryFn: async () => {
      const { data, error } = await supabase.from("sms_messages").select("*").eq("brand_id", brandId).is("campaign_id", null).order("created_at", { ascending: false }).limit(50);
      if (error) throw error;
      return data;
    },
  });
}

function useSendSms(brandId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ contactId, toPhone, text }) => invokeFunction("sms-send", { brandId, contactId, toPhone, text }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sms_messages", brandId] }),
  });
}

/* ---------------------------------------------------------
   DATA — campanhas
--------------------------------------------------------- */
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

function useContactsSms(brandId) {
  return useQuery({
    queryKey: ["crm_contacts_sms", brandId],
    enabled: !!brandId,
    queryFn: async () => {
      const { data, error } = await supabase.from("contacts").select("id, name, phone, opted_in_sms").eq("brand_id", brandId);
      if (error) throw error;
      return data;
    },
  });
}

function useSmsCampaigns(brandId) {
  return useQuery({
    queryKey: ["sms_campaigns", brandId],
    enabled: !!brandId,
    queryFn: async () => {
      const { data, error } = await supabase.from("sms_campaigns").select("*").eq("brand_id", brandId).order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

function useCreateSmsCampaign(brandId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name) => {
      const { data, error } = await supabase.from("sms_campaigns").insert({ brand_id: brandId, name, body: "", status: "draft" }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sms_campaigns", brandId] }),
  });
}

function useUpdateSmsCampaign(brandId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }) => {
      const { error } = await supabase.from("sms_campaigns").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sms_campaigns", brandId] }),
  });
}

function useDeleteSmsCampaign(brandId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from("sms_campaigns").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sms_campaigns", brandId] }),
  });
}

function useSendSmsCampaign(brandId, campaignId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (contactIds) => invokeFunction("sms-campaign-send", { campaignId, contactIds }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sms_campaigns", brandId] });
      qc.invalidateQueries({ queryKey: ["sms_campaign_messages", campaignId] });
    },
  });
}

function useSmsCampaignMessages(campaignId) {
  return useQuery({
    queryKey: ["sms_campaign_messages", campaignId],
    enabled: !!campaignId,
    queryFn: async () => {
      const { data, error } = await supabase.from("sms_messages").select("status, error, contacts(name, phone)").eq("campaign_id", campaignId);
      if (error) throw error;
      return data;
    },
  });
}

/* ---------------------------------------------------------
   LIGAR CONTA
--------------------------------------------------------- */
function ConnectSmsForm({ brandId }) {
  const [accountSid, setAccountSid] = useState("");
  const [fromNumber, setFromNumber] = useState("");
  const [authToken, setAuthToken] = useState("");
  const [error, setError] = useState("");
  const connect = useConnectSms(brandId);

  const submit = async () => {
    setError("");
    if (!accountSid.trim() || !fromNumber.trim() || !authToken.trim()) {
      setError("Account SID, número e Auth Token são obrigatórios.");
      return;
    }
    try {
      await connect.mutateAsync({ accountSid: accountSid.trim(), fromNumber: fromNumber.trim(), authToken: authToken.trim() });
    } catch (err) {
      setError(err.message || "Não foi possível ligar a conta.");
    }
  };

  return (
    <div style={{ maxWidth: 480 }}>
      <Eyebrow>SMS</Eyebrow>
      <h1 style={{ ...serif, fontSize: 24, color: c.ink, marginBottom: 8 }}>Ligar a conta desta marca</h1>
      <p style={{ ...sans, fontSize: 13, color: c.mist, lineHeight: 1.6, marginBottom: 22 }}>
        Via Twilio — sem verificação de negócio bloqueante, funciona em minutos. Segue <strong>docs/GUIA_TWILIO.md</strong> se ainda não tiveres estes valores.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
          <div style={{ ...sans, fontSize: 11.5, color: c.mist, marginBottom: 5 }}>Account SID</div>
          <input style={inputStyle} value={accountSid} onChange={(e) => setAccountSid(e.target.value)} placeholder="AC…" />
        </div>
        <div>
          <div style={{ ...sans, fontSize: 11.5, color: c.mist, marginBottom: 5 }}>Número Twilio (de envio)</div>
          <input style={inputStyle} value={fromNumber} onChange={(e) => setFromNumber(e.target.value)} placeholder="+351…" />
        </div>
        <div>
          <div style={{ ...sans, fontSize: 11.5, color: c.mist, marginBottom: 5 }}>Auth Token</div>
          <input style={inputStyle} type="password" value={authToken} onChange={(e) => setAuthToken(e.target.value)} />
        </div>
        {error && <div style={{ ...sans, fontSize: 12.5, color: c.rose }}>{error}</div>}
        <button onClick={submit} disabled={connect.isPending} style={{ ...btnPrimary, width: "fit-content" }}>
          {connect.isPending ? "A ligar…" : "Ligar SMS"}
        </button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------
   ENVIO AVULSO
--------------------------------------------------------- */
function SendSmsModal({ brandId, onClose }) {
  const contactsQuery = useContactsSms(brandId);
  const sendSms = useSendSms(brandId);
  const [contactId, setContactId] = useState("");
  const [phone, setPhone] = useState("");
  const [text, setText] = useState("");
  const [error, setError] = useState("");

  const pickContact = (id) => {
    setContactId(id);
    const found = (contactsQuery.data || []).find((ct) => ct.id === id);
    if (found?.phone) setPhone(found.phone);
  };

  const submit = async () => {
    setError("");
    if (!phone.trim()) { setError("Indica o número de telefone."); return; }
    if (!text.trim()) { setError("Escreve a mensagem."); return; }
    try {
      await sendSms.mutateAsync({ contactId: contactId || null, toPhone: phone.trim(), text: text.trim() });
      onClose();
    } catch (err) {
      setError(err.message || "Não foi possível enviar.");
    }
  };

  return (
    <Modal title="Enviar SMS" onClose={onClose} width={420}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
          <div style={{ ...sans, fontSize: 11.5, color: c.mist, marginBottom: 5 }}>Contacto (opcional)</div>
          <select style={inputStyle} value={contactId} onChange={(e) => pickContact(e.target.value)}>
            <option value="">— número avulso —</option>
            {(contactsQuery.data || []).filter((ct) => ct.phone).map((ct) => <option key={ct.id} value={ct.id}>{ct.name}</option>)}
          </select>
        </div>
        <div>
          <div style={{ ...sans, fontSize: 11.5, color: c.mist, marginBottom: 5 }}>Número de telefone</div>
          <input style={inputStyle} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+351…" />
        </div>
        <div>
          <div style={{ ...sans, fontSize: 11.5, color: c.mist, marginBottom: 5 }}>Mensagem</div>
          <textarea rows={3} style={{ ...inputStyle, resize: "vertical" }} value={text} onChange={(e) => setText(e.target.value)} />
        </div>
        {error && <div style={{ ...sans, fontSize: 12.5, color: c.rose }}>{error}</div>}
        <button onClick={submit} disabled={sendSms.isPending} style={{ ...btnPrimary, width: "fit-content" }}>
          {sendSms.isPending ? "A enviar…" : "Enviar"}
        </button>
      </div>
    </Modal>
  );
}

/* ---------------------------------------------------------
   CAMPANHAS
--------------------------------------------------------- */
function SendSmsCampaignModal({ brandId, campaign, recipientCount, onClose, onSent }) {
  const sendCampaign = useSendSmsCampaign(brandId, campaign.id);
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
        Vais enviar <strong>{campaign.name}</strong> a <strong>{recipientCount}</strong> contacto(s) com consentimento de SMS. Esta ação não pode ser desfeita.
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

function SmsCampaignEditor({ brandId, campaign, onBack }) {
  const [name, setName] = useState(campaign.name);
  const [body, setBody] = useState(campaign.body || "");
  const [tagIds, setTagIds] = useState([]);
  const [allOptedIn, setAllOptedIn] = useState(true);
  const [saved, setSaved] = useState(false);
  const [showSend, setShowSend] = useState(false);
  const [sendResult, setSendResult] = useState(null);
  const [error, setError] = useState("");

  const updateCampaign = useUpdateSmsCampaign(brandId);
  const tagsQuery = useTags(brandId);
  const contactsQuery = useContactsSms(brandId);
  const tagMapQuery = useContactTagMap(brandId);
  const messagesQuery = useSmsCampaignMessages(campaign.id);

  const toggleTag = (id) => setTagIds((t) => (t.includes(id) ? t.filter((x) => x !== id) : [...t, id]));

  const recipientIds = (() => {
    const contacts = (contactsQuery.data || []).filter((ct) => ct.opted_in_sms && ct.phone);
    if (allOptedIn || tagIds.length === 0) return contacts.map((ct) => ct.id);
    const map = tagMapQuery.data || [];
    const withTag = new Set(map.filter((m) => tagIds.includes(m.tag_id)).map((m) => m.contact_id));
    return contacts.filter((ct) => withTag.has(ct.id)).map((ct) => ct.id);
  })();

  const save = async () => {
    setError("");
    try {
      await updateCampaign.mutateAsync({ id: campaign.id, patch: { name, body } });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err.message || "Não foi possível guardar.");
    }
  };

  const messages = messagesQuery.data || [];
  const statusCounts = messages.reduce((acc, s) => ({ ...acc, [s.status]: (acc[s.status] || 0) + 1 }), {});
  const isSent = campaign.status === "sent" || campaign.status === "sending";

  return (
    <div>
      <button onClick={onBack} style={{ ...sans, display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: c.mist, background: "none", border: "none", cursor: "pointer", marginBottom: 16 }}>
        <ArrowLeft size={14} /> Campanhas
      </button>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 20 }}>
        <input value={name} onChange={(e) => setName(e.target.value)} disabled={isSent} style={{ ...serif, fontSize: 24, color: c.ink, border: "none", outline: "none", background: "none" }} />
        {!isSent && (
          <button onClick={save} disabled={updateCampaign.isPending} style={btnPrimary}>
            {updateCampaign.isPending ? "A guardar…" : saved ? "Guardado ✓" : "Guardar"}
          </button>
        )}
      </div>

      {error && <div style={{ ...sans, fontSize: 12.5, color: c.rose, marginBottom: 16 }}>{error}</div>}

      {isSent && (
        <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
          {["sent", "delivered", "failed"].map((k) => (
            <span key={k} style={{ ...sans, fontSize: 11.5, fontWeight: 600, borderRadius: 999, padding: "5px 12px", background: c.paper, color: c.ink }}>
              {statusCounts[k] || 0} {k}
            </span>
          ))}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 640 }}>
        <div style={{ background: "#fff", border: `1px solid ${c.line}`, borderRadius: 14, padding: 20 }}>
          <div style={{ ...serif, fontSize: 15.5, color: c.ink, marginBottom: 14 }}>Mensagem</div>
          <textarea rows={4} style={{ ...inputStyle, resize: "vertical" }} value={body} onChange={(e) => setBody(e.target.value)} disabled={isSent} placeholder="Texto do SMS…" />
        </div>

        {!isSent && (
          <div style={{ background: "#fff", border: `1px solid ${c.line}`, borderRadius: 14, padding: 20 }}>
            <div style={{ ...serif, fontSize: 15.5, color: c.ink, marginBottom: 14 }}>Destinatários</div>
            <label style={{ ...sans, fontSize: 12.5, color: c.ink, display: "flex", alignItems: "center", gap: 7, marginBottom: 10 }}>
              <input type="checkbox" checked={allOptedIn} onChange={(e) => setAllOptedIn(e.target.checked)} />
              Todos os contactos com consentimento de SMS
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
            <div style={{ ...sans, fontSize: 12, color: c.mist, marginTop: 12 }}>{recipientIds.length} contacto(s) vão receber este SMS.</div>
            <button onClick={() => setShowSend(true)} disabled={!body.trim() || recipientIds.length === 0} style={{ ...btnPrimary, marginTop: 14, display: "flex", alignItems: "center", gap: 6 }}>
              <Send size={13} /> Enviar campanha
            </button>
          </div>
        )}
      </div>

      {showSend && (
        <SendSmsCampaignModal
          brandId={brandId}
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
            <div>{sendResult.skipped} ignorados (sem telefone ou sem consentimento)</div>
            {sendResult.failed > 0 && <div style={{ color: c.rose }}>{sendResult.failed} falharam</div>}
          </div>
          <button onClick={() => setSendResult(null)} style={{ ...btnGhost, marginTop: 16 }}>Fechar</button>
        </Modal>
      )}
    </div>
  );
}

function CampaignsPanel({ brandId }) {
  const campaignsQuery = useSmsCampaigns(brandId);
  const deleteCampaign = useDeleteSmsCampaign(brandId);
  const createCampaign = useCreateSmsCampaign(brandId);
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [openId, setOpenId] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const campaigns = campaignsQuery.data || [];
  const open = openId ? campaigns.find((cp) => cp.id === openId) : null;

  if (open) return <SmsCampaignEditor brandId={brandId} campaign={open} onBack={() => setOpenId(null)} />;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ ...serif, fontSize: 17, color: c.ink }}>Campanhas</div>
        <button onClick={() => setShowNew(true)} style={btnPrimary}>
          <Plus size={14} /> Nova campanha
        </button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {campaigns.map((cp) => (
          <div key={cp.id} style={{ display: "flex", alignItems: "center", gap: 14, background: "#fff", border: `1px solid ${c.line}`, borderRadius: 12, padding: "14px 18px", cursor: "pointer" }} onClick={() => setOpenId(cp.id)}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ ...serif, fontSize: 15, color: c.ink }}>{cp.name}</div>
              <div style={{ ...sans, fontSize: 11.5, color: c.mist, marginTop: 2 }}>{cp.body || "Sem texto ainda"}</div>
            </div>
            <span style={{ ...sans, fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", borderRadius: 999, padding: "4px 10px", color: cp.status === "sent" ? c.sage : c.mist, background: cp.status === "sent" ? "#E7F5EC" : c.paper }}>
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
            <button onClick={() => deleteCampaign.mutate(confirmDelete.id, { onSuccess: () => setConfirmDelete(null) })} style={{ ...btnPrimary, background: c.rose }}>Eliminar</button>
            <button onClick={() => setConfirmDelete(null)} style={btnGhost}>Cancelar</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ---------------------------------------------------------
   MÓDULO
--------------------------------------------------------- */
const TABS = [{ k: "envios", l: "Envios" }, { k: "campanhas", l: "Campanhas" }];

export default function SmsModule({ brand, onBack }) {
  const accountQuery = useSmsAccount(brand.id);
  const messagesQuery = useSmsMessages(brand.id);
  const usageQuery = useSmsUsage(brand.id);
  const [tab, setTab] = useState("envios");
  const [showSend, setShowSend] = useState(false);

  return (
    <div className="bb-page" style={{ padding: "8px 40px 60px", maxWidth: 1040 }}>
      <button onClick={onBack} style={{ ...sans, display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: c.mist, background: "none", border: "none", cursor: "pointer", marginBottom: 20 }}>
        <ArrowLeft size={14} /> Voltar à marca
      </button>

      {accountQuery.isLoading ? (
        <div style={{ ...sans, fontSize: 13, color: c.mist }}>A verificar ligação…</div>
      ) : accountQuery.data ? (
        <>
          <Eyebrow>SMS</Eyebrow>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
            <div style={{ display: "flex", gap: 2, background: c.paper, borderRadius: 8, padding: 3 }}>
              {TABS.map((t) => (
                <button
                  key={t.k}
                  onClick={() => setTab(t.k)}
                  style={{
                    ...sans, fontSize: 12.5, fontWeight: 600, padding: "7px 14px", borderRadius: 6, border: "none", cursor: "pointer",
                    color: tab === t.k ? "#fff" : c.mist, background: tab === t.k ? c.boss : "transparent",
                  }}
                >
                  {t.l}
                </button>
              ))}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ ...sans, fontSize: 11.5, color: c.mist }}>{accountQuery.data.from_number}</div>
              {usageQuery.data && usageQuery.data.numMessages > 0 && (
                <div style={{ ...sans, fontSize: 11, color: c.mist, background: c.paper, borderRadius: 999, padding: "4px 10px" }}>
                  {usageQuery.data.numMessages} SMS · {usageQuery.data.cost.toFixed(2)} {usageQuery.data.currency} (30 dias)
                </div>
              )}
              {tab === "envios" && (
                <button onClick={() => setShowSend(true)} style={{ ...btnPrimary, padding: "8px 14px", display: "flex", alignItems: "center", gap: 6 }}>
                  <Send size={14} /> Enviar SMS
                </button>
              )}
            </div>
          </div>

          {tab === "envios" && (
            <>
              <div style={{ ...sans, fontSize: 11.5, color: c.mist, marginBottom: 16 }}>
                Inclui envios manuais, de automações e de lembretes de Agendamento.
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {(messagesQuery.data || []).map((m) => (
                  <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 12, background: "#fff", border: `1px solid ${c.line}`, borderRadius: 10, padding: "10px 14px" }}>
                    <MessageSquare size={14} color={c.boss} style={{ flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ ...sans, fontSize: 12.5, color: c.ink }}>{m.body}</div>
                      <div style={{ ...sans, fontSize: 11, color: c.mist, marginTop: 2 }}>{m.to_number} · {new Date(m.created_at).toLocaleString("pt-PT")}</div>
                    </div>
                    {m.status === "failed" ? <AlertCircle size={14} color={c.rose} /> : <CheckCircle2 size={14} color={c.sage} />}
                  </div>
                ))}
                {!messagesQuery.data?.length && <div style={{ ...sans, fontSize: 13, color: c.mistLight, textAlign: "center", padding: "40px 0" }}>Ainda sem envios.</div>}
              </div>
            </>
          )}

          {tab === "campanhas" && <CampaignsPanel brandId={brand.id} />}

          {showSend && <SendSmsModal brandId={brand.id} onClose={() => setShowSend(false)} />}
        </>
      ) : (
        <ConnectSmsForm brandId={brand.id} />
      )}
    </div>
  );
}
