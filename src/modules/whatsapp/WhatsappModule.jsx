import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase, invokeFunction } from "../../lib/supabaseClient.js";
import { c, sans, serif, Eyebrow, Modal, inputStyle, btnPrimary, btnGhost } from "../../shared/theme.jsx";
import { ArrowLeft, Send, MessageCircle, CheckCircle2, AlertCircle, Plus, Trash2, FileText, RefreshCw, UserPlus } from "lucide-react";

/* ---------------------------------------------------------
   WHATSAPP — Inbox ligado à Meta Cloud API (WhatsApp Business)
   Módulo do EMPOWER OS. Ver docs/EMPOWER_OS_ARCHITECTURE_STRATEGY.md
   (secção 14) e docs/GUIA_WHATSAPP_META.md para ligar uma conta real.

   O envio/receção passa sempre pelas Edge Functions
   (supabase/functions/whatsapp-send, whatsapp-webhook) — nunca é
   feito diretamente daqui, porque precisam do token guardado no
   Vault, que o frontend nunca vê.

   Templates + Nova conversa + Campanhas: fora da janela de 24h desde
   a última mensagem do cliente, a WhatsApp só deixa iniciar conversa
   com um template aprovado — regra da própria Meta, não nossa. Ver
   docs/GUIA_TWILIO.md para contas ligadas via Twilio: os templates
   aprovam-se no Content Template Builder da própria Twilio, não aqui;
   esta app só regista o Content SID depois de aprovado.
--------------------------------------------------------- */

const timeLabel = (iso) => (iso ? new Date(iso).toLocaleString("pt-PT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "");

/* ---------------------------------------------------------
   DATA — conta / conversas / mensagens
--------------------------------------------------------- */
function useWhatsappAccount(brandId) {
  return useQuery({
    queryKey: ["whatsapp_account", brandId],
    enabled: !!brandId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_accounts")
        .select("id, provider, waba_id, phone_number_id, display_phone, status")
        .eq("brand_id", brandId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

function useConnectWhatsapp(brandId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ provider, wabaId, phoneNumberId, displayPhone, accessToken, twilioAccountSid }) => {
      return invokeFunction("whatsapp-connect", { brandId, provider, wabaId, phoneNumberId, displayPhone, accessToken, twilioAccountSid });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["whatsapp_account", brandId] }),
  });
}

function useConversations(brandId) {
  return useQuery({
    queryKey: ["whatsapp_conversations", brandId],
    enabled: !!brandId,
    refetchInterval: 8000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_conversations")
        .select("*, contacts(id,name)")
        .eq("brand_id", brandId)
        .order("last_message_at", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return data;
    },
  });
}

function useMessages(conversationId) {
  return useQuery({
    queryKey: ["whatsapp_messages", conversationId],
    enabled: !!conversationId,
    refetchInterval: 5000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}

function useSendMessage(brandId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ conversationId, body }) => invokeFunction("whatsapp-send", { conversationId, body }),
    onSuccess: (_data, { conversationId }) => {
      qc.invalidateQueries({ queryKey: ["whatsapp_messages", conversationId] });
      qc.invalidateQueries({ queryKey: ["whatsapp_conversations", brandId] });
    },
  });
}

/* ---------------------------------------------------------
   DATA — templates
--------------------------------------------------------- */
function useTemplates(brandId) {
  return useQuery({
    queryKey: ["whatsapp_templates", brandId],
    enabled: !!brandId,
    queryFn: async () => {
      const { data, error } = await supabase.from("whatsapp_templates").select("*").eq("brand_id", brandId).order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

function useSubmitTemplate(brandId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ name, language, category, body, variables }) =>
      invokeFunction("whatsapp-templates", { brandId, action: "submit", name, language, category, body, variables }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["whatsapp_templates", brandId] }),
  });
}

function useRegisterTwilioTemplate(brandId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ name, language, twilioContentSid, body, variables }) =>
      invokeFunction("whatsapp-templates", { brandId, action: "register_twilio", name, language, twilioContentSid, body, variables }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["whatsapp_templates", brandId] }),
  });
}

function useCheckTemplateStatus(brandId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (templateId) => invokeFunction("whatsapp-templates", { brandId, action: "check", templateId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["whatsapp_templates", brandId] }),
  });
}

function useDeleteTemplate(brandId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from("whatsapp_templates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["whatsapp_templates", brandId] }),
  });
}

/* ---------------------------------------------------------
   DATA — iniciar conversa
--------------------------------------------------------- */
function useStartConversation(brandId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ phone, contactId, templateId, variableValues }) =>
      invokeFunction("whatsapp-start-conversation", { brandId, phone, contactId, templateId, variableValues }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["whatsapp_conversations", brandId] }),
  });
}

/* ---------------------------------------------------------
   DATA — campanhas (mesmo padrão do EmailModule)
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

function useContactsWa(brandId) {
  return useQuery({
    queryKey: ["crm_contacts_wa", brandId],
    enabled: !!brandId,
    queryFn: async () => {
      const { data, error } = await supabase.from("contacts").select("id, name, phone, opted_in_whatsapp").eq("brand_id", brandId);
      if (error) throw error;
      return data;
    },
  });
}

function useWaCampaigns(brandId) {
  return useQuery({
    queryKey: ["whatsapp_campaigns", brandId],
    enabled: !!brandId,
    queryFn: async () => {
      const { data, error } = await supabase.from("whatsapp_campaigns").select("*, whatsapp_templates(name)").eq("brand_id", brandId).order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

function useCreateWaCampaign(brandId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ name, templateId }) => {
      const { data, error } = await supabase.from("whatsapp_campaigns").insert({ brand_id: brandId, name, template_id: templateId, status: "draft" }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["whatsapp_campaigns", brandId] }),
  });
}

function useDeleteWaCampaign(brandId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from("whatsapp_campaigns").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["whatsapp_campaigns", brandId] }),
  });
}

function useSendWaCampaign(brandId, campaignId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ contactIds, variableValues }) => invokeFunction("whatsapp-campaign-send", { campaignId, contactIds, variableValues }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["whatsapp_campaigns", brandId] });
      qc.invalidateQueries({ queryKey: ["whatsapp_campaign_sends", campaignId] });
    },
  });
}

function useWaCampaignSends(campaignId) {
  return useQuery({
    queryKey: ["whatsapp_campaign_sends", campaignId],
    enabled: !!campaignId,
    queryFn: async () => {
      const { data, error } = await supabase.from("whatsapp_campaign_sends").select("status, error, contacts(name, phone)").eq("campaign_id", campaignId);
      if (error) throw error;
      return data;
    },
  });
}

/* ---------------------------------------------------------
   LIGAR CONTA
--------------------------------------------------------- */
function ConnectWhatsappForm({ brandId }) {
  const [provider, setProvider] = useState("meta");
  const [wabaId, setWabaId] = useState("");
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [twilioAccountSid, setTwilioAccountSid] = useState("");
  const [displayPhone, setDisplayPhone] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [error, setError] = useState("");
  const connect = useConnectWhatsapp(brandId);

  const submit = async () => {
    setError("");
    if (provider === "meta" && (!wabaId.trim() || !phoneNumberId.trim() || !accessToken.trim())) {
      setError("WABA ID, Phone Number ID e o token de acesso são obrigatórios.");
      return;
    }
    if (provider === "twilio" && (!twilioAccountSid.trim() || !phoneNumberId.trim() || !accessToken.trim())) {
      setError("Account SID, número de WhatsApp e Auth Token são obrigatórios.");
      return;
    }
    try {
      await connect.mutateAsync({
        provider,
        wabaId: wabaId.trim(),
        phoneNumberId: phoneNumberId.trim(),
        twilioAccountSid: twilioAccountSid.trim(),
        displayPhone: displayPhone.trim(),
        accessToken: accessToken.trim(),
      });
    } catch (err) {
      setError(err.message || "Não foi possível ligar a conta.");
    }
  };

  return (
    <div style={{ maxWidth: 480 }}>
      <Eyebrow>WhatsApp Business</Eyebrow>
      <h1 style={{ ...serif, fontSize: 24, color: c.ink, marginBottom: 8 }}>Ligar a conta desta marca</h1>

      <div style={{ display: "flex", gap: 2, background: c.paper, borderRadius: 8, padding: 3, marginBottom: 16, width: "fit-content" }}>
        {[{ k: "meta", l: "Meta (direto)" }, { k: "twilio", l: "Twilio" }].map((o) => (
          <button
            key={o.k}
            onClick={() => setProvider(o.k)}
            style={{
              ...sans, fontSize: 12, fontWeight: 600, padding: "6px 12px", borderRadius: 6, border: "none", cursor: "pointer",
              color: provider === o.k ? "#fff" : c.mist, background: provider === o.k ? c.boss : "transparent",
            }}
          >
            {o.l}
          </button>
        ))}
      </div>

      {provider === "meta" ? (
        <p style={{ ...sans, fontSize: 13, color: c.mist, lineHeight: 1.6, marginBottom: 22 }}>
          Precisas destes 3 valores da tua app na Meta for Developers. Segue <strong>docs/GUIA_WHATSAPP_META.md</strong> se ainda não os tiveres.
        </p>
      ) : (
        <p style={{ ...sans, fontSize: 13, color: c.mist, lineHeight: 1.6, marginBottom: 22 }}>
          Alternativa quando a verificação de negócio da Meta fica bloqueada. Segue <strong>docs/GUIA_TWILIO.md</strong> se ainda não tiveres estes valores.
        </p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {provider === "meta" ? (
          <>
            <div>
              <div style={{ ...sans, fontSize: 11.5, color: c.mist, marginBottom: 5 }}>WABA ID</div>
              <input style={inputStyle} value={wabaId} onChange={(e) => setWabaId(e.target.value)} placeholder="WhatsApp Business Account ID" />
            </div>
            <div>
              <div style={{ ...sans, fontSize: 11.5, color: c.mist, marginBottom: 5 }}>Phone Number ID</div>
              <input style={inputStyle} value={phoneNumberId} onChange={(e) => setPhoneNumberId(e.target.value)} placeholder="Phone Number ID" />
            </div>
          </>
        ) : (
          <>
            <div>
              <div style={{ ...sans, fontSize: 11.5, color: c.mist, marginBottom: 5 }}>Account SID</div>
              <input style={inputStyle} value={twilioAccountSid} onChange={(e) => setTwilioAccountSid(e.target.value)} placeholder="AC…" />
            </div>
            <div>
              <div style={{ ...sans, fontSize: 11.5, color: c.mist, marginBottom: 5 }}>Número de WhatsApp (Twilio)</div>
              <input style={inputStyle} value={phoneNumberId} onChange={(e) => setPhoneNumberId(e.target.value)} placeholder="+351…" />
            </div>
          </>
        )}
        <div>
          <div style={{ ...sans, fontSize: 11.5, color: c.mist, marginBottom: 5 }}>Número (opcional, só para identificar)</div>
          <input style={inputStyle} value={displayPhone} onChange={(e) => setDisplayPhone(e.target.value)} placeholder="+351 9XX XXX XXX" />
        </div>
        <div>
          <div style={{ ...sans, fontSize: 11.5, color: c.mist, marginBottom: 5 }}>{provider === "meta" ? "Token de acesso" : "Auth Token"}</div>
          <input style={inputStyle} type="password" value={accessToken} onChange={(e) => setAccessToken(e.target.value)} placeholder={provider === "meta" ? "Token permanente da Meta" : "Auth Token da Twilio"} />
        </div>

        {error && <div style={{ ...sans, fontSize: 12.5, color: c.rose }}>{error}</div>}

        <button onClick={submit} disabled={connect.isPending} style={{ ...btnPrimary, width: "fit-content" }}>
          {connect.isPending ? "A ligar…" : "Ligar WhatsApp"}
        </button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------
   TEMPLATES
--------------------------------------------------------- */
const TEMPLATE_STATUS_LABEL = { pending: "A aguardar aprovação", approved: "Aprovado", rejected: "Rejeitado" };
const TEMPLATE_STATUS_COLOR = { pending: c.amber, approved: c.sage, rejected: c.rose };

function NewTemplateModal({ brandId, provider, onClose }) {
  const [name, setName] = useState("");
  const [language, setLanguage] = useState("pt_PT");
  const [category, setCategory] = useState("MARKETING");
  const [body, setBody] = useState("");
  const [twilioContentSid, setTwilioContentSid] = useState("");
  const [error, setError] = useState("");
  const submitTemplate = useSubmitTemplate(brandId);
  const registerTwilio = useRegisterTwilioTemplate(brandId);

  // {{1}}, {{2}}, ... no texto viram os campos de variável, por ordem.
  const variableCount = (body.match(/\{\{\d+\}\}/g) || []).length;
  const variables = Array.from({ length: variableCount }, (_, i) => `variável ${i + 1}`);

  const submit = async () => {
    setError("");
    if (!name.trim()) { setError("Dá um nome ao template."); return; }
    try {
      if (provider === "twilio") {
        if (!twilioContentSid.trim()) { setError("Cola o Content SID gerado pela Twilio."); return; }
        await registerTwilio.mutateAsync({ name: name.trim(), language, twilioContentSid: twilioContentSid.trim(), body: body.trim(), variables });
      } else {
        if (!body.trim()) { setError("Escreve o texto do template."); return; }
        await submitTemplate.mutateAsync({ name: name.trim(), language, category, body: body.trim(), variables });
      }
      onClose();
    } catch (err) {
      setError(err.message || "Não foi possível criar o template.");
    }
  };

  const isPending = submitTemplate.isPending || registerTwilio.isPending;

  return (
    <Modal title="Novo template" onClose={onClose} width={460}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {provider === "twilio" ? (
          <div style={{ ...sans, fontSize: 12, color: c.mist, lineHeight: 1.6, background: c.paper, borderRadius: 10, padding: 12 }}>
            Esta marca está ligada via Twilio — cria e aprova o template no <strong>Content Template Builder</strong> da Twilio primeiro, depois cola aqui o <strong>Content SID</strong> (começa por "HX…") que ele gera.
          </div>
        ) : (
          <div style={{ ...sans, fontSize: 12, color: c.mist, lineHeight: 1.6, background: c.paper, borderRadius: 10, padding: 12 }}>
            Vai diretamente para aprovação da Meta (demora horas a dias). Usa <code>{"{{1}}"}</code>, <code>{"{{2}}"}</code>… no texto onde quiseres variáveis.
          </div>
        )}
        <div>
          <div style={{ ...sans, fontSize: 11.5, color: c.mist, marginBottom: 5 }}>Nome (sem espaços, minúsculas)</div>
          <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value.toLowerCase().replace(/\s+/g, "_"))} placeholder="lembrete_marcacao" />
        </div>
        <div>
          <div style={{ ...sans, fontSize: 11.5, color: c.mist, marginBottom: 5 }}>Idioma</div>
          <input style={inputStyle} value={language} onChange={(e) => setLanguage(e.target.value)} placeholder="pt_PT" />
        </div>
        {provider !== "twilio" && (
          <div>
            <div style={{ ...sans, fontSize: 11.5, color: c.mist, marginBottom: 5 }}>Categoria</div>
            <select style={inputStyle} value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="MARKETING">Marketing</option>
              <option value="UTILITY">Utilidade</option>
              <option value="AUTHENTICATION">Autenticação</option>
            </select>
          </div>
        )}
        {provider === "twilio" && (
          <div>
            <div style={{ ...sans, fontSize: 11.5, color: c.mist, marginBottom: 5 }}>Content SID (Twilio)</div>
            <input style={inputStyle} value={twilioContentSid} onChange={(e) => setTwilioContentSid(e.target.value)} placeholder="HX…" />
          </div>
        )}
        <div>
          <div style={{ ...sans, fontSize: 11.5, color: c.mist, marginBottom: 5 }}>Texto {provider === "twilio" ? "(opcional, só para referência)" : ""}</div>
          <textarea rows={4} style={{ ...inputStyle, resize: "vertical" }} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Olá {{1}}, a tua marcação é já amanhã às {{2}}." />
        </div>
        {error && <div style={{ ...sans, fontSize: 12.5, color: c.rose }}>{error}</div>}
        <button onClick={submit} disabled={isPending} style={{ ...btnPrimary, width: "fit-content" }}>
          {isPending ? "A criar…" : provider === "twilio" ? "Registar template" : "Submeter à Meta"}
        </button>
      </div>
    </Modal>
  );
}

function TemplatesPanel({ brandId, provider }) {
  const templatesQuery = useTemplates(brandId);
  const checkStatus = useCheckTemplateStatus(brandId);
  const deleteTemplate = useDeleteTemplate(brandId);
  const [showNew, setShowNew] = useState(false);
  const templates = templatesQuery.data || [];

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ ...serif, fontSize: 17, color: c.ink }}>Templates</div>
        <button onClick={() => setShowNew(true)} style={btnPrimary}>
          <Plus size={14} /> Novo template
        </button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {templates.map((tpl) => (
          <div key={tpl.id} style={{ display: "flex", alignItems: "center", gap: 14, background: "#fff", border: `1px solid ${c.line}`, borderRadius: 12, padding: "14px 18px" }}>
            <div style={{ width: 34, height: 34, borderRadius: 9, background: c.bossSoft, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <FileText size={16} color={c.boss} strokeWidth={1.8} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ ...sans, fontSize: 13, fontWeight: 600, color: c.ink }}>{tpl.name}</div>
              <div style={{ ...sans, fontSize: 11.5, color: c.mist, marginTop: 2 }}>{tpl.body || "(sem texto de referência)"}</div>
            </div>
            <span style={{ ...sans, fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", borderRadius: 999, padding: "4px 10px", color: TEMPLATE_STATUS_COLOR[tpl.status], background: c.paper, flexShrink: 0 }}>
              {TEMPLATE_STATUS_LABEL[tpl.status] || tpl.status}
            </span>
            {tpl.status === "pending" && tpl.meta_template_id && (
              <button onClick={() => checkStatus.mutate(tpl.id)} disabled={checkStatus.isPending} style={{ background: "none", border: "none", cursor: "pointer", color: c.mist, padding: 5 }} title="Verificar estado">
                <RefreshCw size={14} />
              </button>
            )}
            <button onClick={() => deleteTemplate.mutate(tpl.id)} style={{ background: "none", border: "none", cursor: "pointer", color: c.mist, padding: 5 }}>
              <Trash2 size={14} />
            </button>
          </div>
        ))}
        {!templatesQuery.isLoading && templates.length === 0 && (
          <div style={{ ...sans, fontSize: 13, color: c.mistLight, textAlign: "center", padding: "40px 0" }}>Ainda não há templates.</div>
        )}
      </div>
      {showNew && <NewTemplateModal brandId={brandId} provider={provider} onClose={() => setShowNew(false)} />}
    </div>
  );
}

/* ---------------------------------------------------------
   NOVA CONVERSA
--------------------------------------------------------- */
function StartConversationModal({ brandId, onClose }) {
  const contactsQuery = useContactsWa(brandId);
  const templatesQuery = useTemplates(brandId);
  const startConversation = useStartConversation(brandId);
  const [contactId, setContactId] = useState("");
  const [phone, setPhone] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [values, setValues] = useState([]);
  const [error, setError] = useState("");

  const approvedTemplates = (templatesQuery.data || []).filter((t) => t.status === "approved");
  const template = approvedTemplates.find((t) => t.id === templateId);

  const pickContact = (id) => {
    setContactId(id);
    const found = (contactsQuery.data || []).find((ct) => ct.id === id);
    if (found?.phone) setPhone(found.phone);
  };

  const submit = async () => {
    setError("");
    if (!phone.trim()) { setError("Indica o número de telefone."); return; }
    if (!templateId) { setError("Escolhe um template aprovado."); return; }
    try {
      await startConversation.mutateAsync({ phone: phone.trim(), contactId: contactId || null, templateId, variableValues: values });
      onClose();
    } catch (err) {
      setError(err.message || "Não foi possível iniciar a conversa.");
    }
  };

  return (
    <Modal title="Nova conversa" onClose={onClose} width={440}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {approvedTemplates.length === 0 && (
          <div style={{ ...sans, fontSize: 12, color: c.rose, lineHeight: 1.6 }}>
            Ainda não tens nenhum template aprovado — cria um no separador "Templates" primeiro.
          </div>
        )}
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
          <div style={{ ...sans, fontSize: 11.5, color: c.mist, marginBottom: 5 }}>Template</div>
          <select style={inputStyle} value={templateId} onChange={(e) => { setTemplateId(e.target.value); setValues([]); }}>
            <option value="">Escolhe um template aprovado</option>
            {approvedTemplates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        {template && (template.variables || []).map((label, i) => (
          <div key={i}>
            <div style={{ ...sans, fontSize: 11.5, color: c.mist, marginBottom: 5 }}>{label || `Variável ${i + 1}`}</div>
            <input style={inputStyle} value={values[i] || ""} onChange={(e) => { const next = [...values]; next[i] = e.target.value; setValues(next); }} />
          </div>
        ))}
        {error && <div style={{ ...sans, fontSize: 12.5, color: c.rose }}>{error}</div>}
        <button onClick={submit} disabled={startConversation.isPending} style={{ ...btnPrimary, width: "fit-content" }}>
          {startConversation.isPending ? "A enviar…" : "Iniciar conversa"}
        </button>
      </div>
    </Modal>
  );
}

/* ---------------------------------------------------------
   CAMPANHAS
--------------------------------------------------------- */
function SendWaCampaignModal({ brandId, campaign, recipientCount, variableValues, onClose, onSent }) {
  const sendCampaign = useSendWaCampaign(brandId, campaign.id);
  const [error, setError] = useState("");

  const confirm = async () => {
    setError("");
    try {
      const result = await sendCampaign.mutateAsync({ contactIds: campaign._contactIds, variableValues });
      onSent(result);
    } catch (err) {
      setError(err.message || "Não foi possível enviar.");
    }
  };

  return (
    <Modal title="Enviar campanha" onClose={onClose} width={380}>
      <div style={{ ...sans, fontSize: 13, color: c.ink, marginBottom: 16, lineHeight: 1.6 }}>
        Vais enviar <strong>{campaign.name}</strong> a <strong>{recipientCount}</strong> contacto(s) com consentimento de WhatsApp. Esta ação não pode ser desfeita.
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

function WaCampaignEditor({ brandId, campaign, onBack }) {
  const [tagIds, setTagIds] = useState([]);
  const [allOptedIn, setAllOptedIn] = useState(true);
  const [values, setValues] = useState([]);
  const [showSend, setShowSend] = useState(false);
  const [sendResult, setSendResult] = useState(null);

  const tagsQuery = useTags(brandId);
  const contactsQuery = useContactsWa(brandId);
  const tagMapQuery = useContactTagMap(brandId);
  const sendsQuery = useWaCampaignSends(campaign.id);
  const template = campaign.whatsapp_templates;

  const toggleTag = (id) => setTagIds((t) => (t.includes(id) ? t.filter((x) => x !== id) : [...t, id]));

  const recipientIds = (() => {
    const contacts = (contactsQuery.data || []).filter((ct) => ct.opted_in_whatsapp && ct.phone);
    if (allOptedIn || tagIds.length === 0) return contacts.map((ct) => ct.id);
    const map = tagMapQuery.data || [];
    const withTag = new Set(map.filter((m) => tagIds.includes(m.tag_id)).map((m) => m.contact_id));
    return contacts.filter((ct) => withTag.has(ct.id)).map((ct) => ct.id);
  })();

  const sends = sendsQuery.data || [];
  const statusCounts = sends.reduce((acc, s) => ({ ...acc, [s.status]: (acc[s.status] || 0) + 1 }), {});
  const isSent = campaign.status === "sent" || campaign.status === "sending";

  return (
    <div>
      <button onClick={onBack} style={{ ...sans, display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: c.mist, background: "none", border: "none", cursor: "pointer", marginBottom: 16 }}>
        <ArrowLeft size={14} /> Campanhas
      </button>
      <div style={{ ...serif, fontSize: 24, color: c.ink, marginBottom: 6 }}>{campaign.name}</div>
      <div style={{ ...sans, fontSize: 11.5, color: c.mist, marginBottom: 20 }}>
        Template: <strong>{template?.name || "—"}</strong>
      </div>

      {isSent && (
        <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
          {["sent", "delivered", "read", "failed"].map((k) => (
            <span key={k} style={{ ...sans, fontSize: 11.5, fontWeight: 600, borderRadius: 999, padding: "5px 12px", background: c.paper, color: c.ink }}>
              {statusCounts[k] || 0} {k}
            </span>
          ))}
        </div>
      )}

      {!isSent && (
        <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 640 }}>
          <div style={{ background: "#fff", border: `1px solid ${c.line}`, borderRadius: 14, padding: 20 }}>
            <div style={{ ...serif, fontSize: 15.5, color: c.ink, marginBottom: 14 }}>Destinatários</div>
            <label style={{ ...sans, fontSize: 12.5, color: c.ink, display: "flex", alignItems: "center", gap: 7, marginBottom: 10 }}>
              <input type="checkbox" checked={allOptedIn} onChange={(e) => setAllOptedIn(e.target.checked)} />
              Todos os contactos com consentimento de WhatsApp
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
            <div style={{ ...sans, fontSize: 12, color: c.mist, marginTop: 12 }}>{recipientIds.length} contacto(s) vão receber esta campanha.</div>
          </div>

          {(template?.variables || []).length > 0 && (
            <div style={{ background: "#fff", border: `1px solid ${c.line}`, borderRadius: 14, padding: 20 }}>
              <div style={{ ...serif, fontSize: 15.5, color: c.ink, marginBottom: 14 }}>Variáveis do template</div>
              <div style={{ ...sans, fontSize: 11.5, color: c.mist, marginBottom: 10 }}>Os mesmos valores vão para todos os destinatários.</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {template.variables.map((label, i) => (
                  <div key={i}>
                    <div style={{ ...sans, fontSize: 11.5, color: c.mist, marginBottom: 5 }}>{label || `Variável ${i + 1}`}</div>
                    <input style={inputStyle} value={values[i] || ""} onChange={(e) => { const next = [...values]; next[i] = e.target.value; setValues(next); }} />
                  </div>
                ))}
              </div>
            </div>
          )}

          <button onClick={() => setShowSend(true)} disabled={recipientIds.length === 0} style={{ ...btnPrimary, width: "fit-content", display: "flex", alignItems: "center", gap: 6 }}>
            <Send size={13} /> Enviar campanha
          </button>
        </div>
      )}

      {showSend && (
        <SendWaCampaignModal
          brandId={brandId}
          campaign={{ ...campaign, _contactIds: recipientIds }}
          recipientCount={recipientIds.length}
          variableValues={values}
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

function NewWaCampaignModal({ brandId, templates, onClose, onCreated }) {
  const [name, setName] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [error, setError] = useState("");
  const createCampaign = useCreateWaCampaign(brandId);
  const approvedTemplates = templates.filter((t) => t.status === "approved");

  const submit = async () => {
    setError("");
    if (!name.trim()) { setError("Dá um nome à campanha."); return; }
    if (!templateId) { setError("Escolhe um template aprovado."); return; }
    try {
      const created = await createCampaign.mutateAsync({ name: name.trim(), templateId });
      onCreated(created);
    } catch (err) {
      setError(err.message || "Não foi possível criar a campanha.");
    }
  };

  return (
    <Modal title="Nova campanha" onClose={onClose} width={380}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {approvedTemplates.length === 0 && (
          <div style={{ ...sans, fontSize: 12, color: c.rose, lineHeight: 1.6 }}>Ainda não tens nenhum template aprovado.</div>
        )}
        <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome interno da campanha" autoFocus />
        <select style={inputStyle} value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
          <option value="">Escolhe um template aprovado</option>
          {approvedTemplates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        {error && <div style={{ ...sans, fontSize: 12.5, color: c.rose }}>{error}</div>}
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={submit} disabled={createCampaign.isPending} style={btnPrimary}>
            {createCampaign.isPending ? "A criar…" : "Criar"}
          </button>
          <button onClick={onClose} style={btnGhost}>Cancelar</button>
        </div>
      </div>
    </Modal>
  );
}

function WaCampaignsPanel({ brandId }) {
  const campaignsQuery = useWaCampaigns(brandId);
  const templatesQuery = useTemplates(brandId);
  const deleteCampaign = useDeleteWaCampaign(brandId);
  const [showNew, setShowNew] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const campaigns = campaignsQuery.data || [];
  const open = openId ? campaigns.find((cp) => cp.id === openId) : null;

  if (open) return <WaCampaignEditor brandId={brandId} campaign={open} onBack={() => setOpenId(null)} />;

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
              <div style={{ ...sans, fontSize: 11.5, color: c.mist, marginTop: 2 }}>{cp.whatsapp_templates?.name || "sem template"}</div>
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
        <NewWaCampaignModal
          brandId={brandId}
          templates={templatesQuery.data || []}
          onClose={() => setShowNew(false)}
          onCreated={(created) => { setShowNew(false); setOpenId(created.id); }}
        />
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
   INBOX
--------------------------------------------------------- */
function ConversationRow({ conversation, active, onSelect }) {
  const name = conversation.contacts?.name || conversation.wa_contact_phone;
  return (
    <button
      onClick={onSelect}
      style={{
        display: "flex", flexDirection: "column", gap: 3, textAlign: "left", width: "100%",
        padding: "10px 12px", borderRadius: 9, border: "none", cursor: "pointer",
        background: active ? c.bossSoft : "transparent",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span style={{ ...sans, fontSize: 13, fontWeight: 600, color: c.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
        {conversation.status === "open" && <span style={{ width: 6, height: 6, borderRadius: 999, background: c.sage, flexShrink: 0 }} />}
      </div>
      <span style={{ ...sans, fontSize: 11, color: c.mist }}>{conversation.wa_contact_phone}</span>
      <span style={{ ...sans, fontSize: 10.5, color: c.mistLight }}>{timeLabel(conversation.last_message_at)}</span>
    </button>
  );
}

function MessageBubble({ message }) {
  const outbound = message.direction === "outbound";
  return (
    <div style={{ display: "flex", justifyContent: outbound ? "flex-end" : "flex-start" }}>
      <div
        style={{
          maxWidth: "72%", padding: "8px 12px", borderRadius: 12,
          background: outbound ? c.boss : "#fff", color: outbound ? "#fff" : c.ink,
          border: outbound ? "none" : `1px solid ${c.line}`,
        }}
      >
        <div style={{ ...sans, fontSize: 13, whiteSpace: "pre-wrap" }}>{message.body || (message.type === "template" ? `[template: ${message.template_name}]` : "")}</div>
        <div style={{ ...sans, fontSize: 10, marginTop: 4, color: outbound ? "rgba(255,255,255,0.75)" : c.mistLight, display: "flex", alignItems: "center", gap: 4 }}>
          {timeLabel(message.created_at)}
          {outbound && message.status === "failed" && <AlertCircle size={11} color="#FBD5DC" />}
          {outbound && message.status !== "failed" && <CheckCircle2 size={11} />}
        </div>
      </div>
    </div>
  );
}

function MessageThread({ brandId, conversation }) {
  const messagesQuery = useMessages(conversation.id);
  const sendMessage = useSendMessage(brandId);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messagesQuery.data]);

  const send = async () => {
    if (!text.trim()) return;
    setError("");
    const body = text.trim();
    setText("");
    try {
      await sendMessage.mutateAsync({ conversationId: conversation.id, body });
    } catch (err) {
      setError(err.message || "Não foi possível enviar.");
    }
  };

  const windowOpen = conversation.window_expires_at && new Date(conversation.window_expires_at) > new Date();

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ padding: "12px 16px", borderBottom: `1px solid ${c.line}` }}>
        <div style={{ ...sans, fontSize: 13.5, fontWeight: 600, color: c.ink }}>{conversation.contacts?.name || conversation.wa_contact_phone}</div>
        <div style={{ ...sans, fontSize: 11, color: c.mist, marginTop: 1 }}>{conversation.wa_contact_phone}</div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 8, background: c.paper }}>
        {(messagesQuery.data || []).map((m) => (
          <MessageBubble key={m.id} message={m} />
        ))}
        <div ref={bottomRef} />
      </div>

      <div style={{ padding: 12, borderTop: `1px solid ${c.line}` }}>
        {!windowOpen && (
          <div style={{ ...sans, fontSize: 11.5, color: c.amber, marginBottom: 8, display: "flex", alignItems: "center", gap: 5 }}>
            <AlertCircle size={12} /> Janela de 24h fechada — usa "Nova conversa" com um template aprovado para reabrir.
          </div>
        )}
        {error && <div style={{ ...sans, fontSize: 11.5, color: c.rose, marginBottom: 8 }}>{error}</div>}
        <div style={{ display: "flex", gap: 8 }}>
          <input
            style={inputStyle}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder="Escrever mensagem…"
            disabled={!windowOpen}
          />
          <button onClick={send} disabled={sendMessage.isPending || !windowOpen} style={{ ...btnPrimary, padding: "9px 14px" }}>
            <Send size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

function Inbox({ brandId }) {
  const conversationsQuery = useConversations(brandId);
  const [selectedId, setSelectedId] = useState(null);
  const conversations = conversationsQuery.data || [];
  const selected = conversations.find((c2) => c2.id === selectedId) || conversations[0] || null;

  if (!conversationsQuery.isLoading && conversations.length === 0) {
    return (
      <div style={{ ...sans, fontSize: 13, color: c.mist, display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "60px 0" }}>
        <MessageCircle size={22} color={c.mistLight} />
        Ainda não há conversas. Assim que alguém escrever para o número ligado, aparece aqui — ou usa "Nova conversa" para começares tu.
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", height: "calc(100vh - 260px)", minHeight: 420, border: `1px solid ${c.line}`, borderRadius: 14, overflow: "hidden" }}>
      <div style={{ borderRight: `1px solid ${c.line}`, overflowY: "auto", padding: 8 }}>
        {conversations.map((conv) => (
          <ConversationRow key={conv.id} conversation={conv} active={selected?.id === conv.id} onSelect={() => setSelectedId(conv.id)} />
        ))}
      </div>
      <div>
        {selected ? <MessageThread brandId={brandId} conversation={selected} /> : (
          <div style={{ ...sans, fontSize: 13, color: c.mist, padding: 24 }}>Seleciona uma conversa.</div>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------
   MÓDULO
--------------------------------------------------------- */
const TABS = [{ k: "inbox", l: "Inbox" }, { k: "templates", l: "Templates" }, { k: "campanhas", l: "Campanhas" }];

export default function WhatsappModule({ brand, onBack }) {
  const accountQuery = useWhatsappAccount(brand.id);
  const [tab, setTab] = useState("inbox");
  const [showStart, setShowStart] = useState(false);

  return (
    <div className="bb-page" style={{ padding: "8px 40px 60px", maxWidth: 1040 }}>
      <button onClick={onBack} style={{ ...sans, display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: c.mist, background: "none", border: "none", cursor: "pointer", marginBottom: 20 }}>
        <ArrowLeft size={14} /> Voltar à marca
      </button>

      {accountQuery.isLoading ? (
        <div style={{ ...sans, fontSize: 13, color: c.mist }}>A verificar ligação…</div>
      ) : accountQuery.data ? (
        <>
          <Eyebrow>WhatsApp Business</Eyebrow>
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
              <div style={{ ...sans, fontSize: 11.5, color: c.mist }}>{accountQuery.data.display_phone || accountQuery.data.phone_number_id}</div>
              {tab === "inbox" && (
                <button onClick={() => setShowStart(true)} style={{ ...btnPrimary, padding: "8px 14px", display: "flex", alignItems: "center", gap: 6 }}>
                  <UserPlus size={14} /> Nova conversa
                </button>
              )}
            </div>
          </div>

          {tab === "inbox" && <Inbox brandId={brand.id} />}
          {tab === "templates" && <TemplatesPanel brandId={brand.id} provider={accountQuery.data.provider} />}
          {tab === "campanhas" && <WaCampaignsPanel brandId={brand.id} />}

          {showStart && <StartConversationModal brandId={brand.id} onClose={() => setShowStart(false)} />}
        </>
      ) : (
        <ConnectWhatsappForm brandId={brand.id} />
      )}
    </div>
  );
}
