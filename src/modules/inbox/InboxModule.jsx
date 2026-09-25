import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase, invokeFunction } from "../../lib/supabaseClient.js";
import { c, sans, Eyebrow, display } from "../../shared/theme.jsx";
import { ArrowLeft, MessageCircle, Mail, MessageSquare, Send, AlertCircle, CheckCircle2 } from "lucide-react";

/* ---------------------------------------------------------
   INBOX UNIFICADO — todas as conversas de todos os canais, num
   só sítio. Módulo do EMPOWER OS. Ver docs/EMPOWER_OS_ARCHITECTURE_STRATEGY.md
   (Adenda 1 e 2).

   Não é uma tabela nova — agrega whatsapp_messages, email_sends e
   sms_messages (cada um continua a viver exatamente onde já estava,
   nos módulos WhatsApp/Email/SMS). Só o WhatsApp é bidirecional de
   verdade aqui: Email e SMS mostram o que foi enviado, mas ainda não
   têm receção de respostas ligada (webhook de email/SMS de entrada
   não construído) — aparecem como histórico, não como conversa de
   ida e volta, para não fingir uma capacidade que não existe.
--------------------------------------------------------- */

const CHANNEL_ICON = { whatsapp: MessageCircle, email: Mail, sms: MessageSquare };
const CHANNEL_LABEL = { whatsapp: "WhatsApp", email: "Email", sms: "SMS" };
const CHANNEL_COLOR = { whatsapp: c.sage, email: c.info, sms: c.amber };

const timeLabel = (iso) => (iso ? new Date(iso).toLocaleString("pt-PT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "");

/* ---------------------------------------------------------
   DATA
--------------------------------------------------------- */
function useUnifiedContacts(brandId) {
  return useQuery({
    queryKey: ["unified_inbox_contacts", brandId],
    enabled: !!brandId,
    refetchInterval: 15000,
    queryFn: async () => {
      const [wa, em, sm] = await Promise.all([
        supabase.from("whatsapp_conversations").select("id, contact_id, wa_contact_phone, last_message_at, contacts(id,name,phone,email)").eq("brand_id", brandId).not("contact_id", "is", null),
        supabase.from("email_sends").select("contact_id, sent_at, created_at, contacts(id,name,phone,email)").eq("brand_id", brandId),
        supabase.from("sms_messages").select("contact_id, created_at, contacts(id,name,phone,email)").eq("brand_id", brandId).not("contact_id", "is", null),
      ]);

      const map = new Map();
      const upsert = (contactId, contact, channel, at) => {
        if (!contactId || !at || !contact) return;
        const existing = map.get(contactId);
        if (!existing || new Date(at) > new Date(existing.lastAt)) {
          map.set(contactId, { contactId, contact, lastChannel: channel, lastAt: at });
        }
      };
      (wa.data || []).forEach((r) => upsert(r.contact_id, r.contacts, "whatsapp", r.last_message_at));
      (em.data || []).forEach((r) => upsert(r.contact_id, r.contacts, "email", r.sent_at || r.created_at));
      (sm.data || []).forEach((r) => upsert(r.contact_id, r.contacts, "sms", r.created_at));

      return [...map.values()].sort((a, b) => new Date(b.lastAt) - new Date(a.lastAt));
    },
  });
}

function useContactTimeline(brandId, contactId) {
  return useQuery({
    queryKey: ["unified_inbox_timeline", contactId],
    enabled: !!contactId,
    refetchInterval: 8000,
    queryFn: async () => {
      const [wa, em, sm] = await Promise.all([
        supabase.from("whatsapp_conversations").select("id").eq("brand_id", brandId).eq("contact_id", contactId).maybeSingle(),
        supabase.from("email_sends").select("id, status, sent_at, created_at, email_campaigns(subject)").eq("brand_id", brandId).eq("contact_id", contactId),
        supabase.from("sms_messages").select("id, body, status, created_at").eq("brand_id", brandId).eq("contact_id", contactId),
      ]);

      let waMessages = [];
      if (wa.data?.id) {
        const { data } = await supabase.from("whatsapp_messages").select("*").eq("conversation_id", wa.data.id).order("created_at", { ascending: true });
        waMessages = (data || []).map((m) => ({ channel: "whatsapp", at: m.created_at, direction: m.direction, body: m.body, status: m.status }));
      }
      const emailItems = (em.data || []).map((m) => ({
        channel: "email", at: m.sent_at || m.created_at, direction: "outbound",
        body: m.email_campaigns?.subject ? `Email: ${m.email_campaigns.subject}` : "Email enviado", status: m.status,
      }));
      const smsItems = (sm.data || []).map((m) => ({ channel: "sms", at: m.created_at, direction: "outbound", body: m.body, status: m.status }));

      return [...waMessages, ...emailItems, ...smsItems].sort((a, b) => new Date(a.at) - new Date(b.at));
    },
  });
}

function useWhatsappConversationId(brandId, contactId) {
  return useQuery({
    queryKey: ["unified_inbox_wa_conversation", contactId],
    enabled: !!contactId,
    queryFn: async () => {
      const { data } = await supabase.from("whatsapp_conversations").select("id").eq("brand_id", brandId).eq("contact_id", contactId).maybeSingle();
      return data?.id || null;
    },
  });
}

function useSendWhatsapp(brandId, contactId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ conversationId, body }) => invokeFunction("whatsapp-send", { conversationId, body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["unified_inbox_timeline", contactId] });
      qc.invalidateQueries({ queryKey: ["unified_inbox_contacts", brandId] });
    },
  });
}

/* ---------------------------------------------------------
   UI
--------------------------------------------------------- */
function ContactRow({ entry, active, onSelect }) {
  const Icon = CHANNEL_ICON[entry.lastChannel];
  const name = entry.contact?.name || entry.contact?.phone || entry.contact?.email || "Contacto";
  return (
    <button
      onClick={onSelect}
      style={{
        display: "flex", flexDirection: "column", gap: 3, textAlign: "left", width: "100%",
        padding: "10px 12px", borderRadius: 6, border: "none", cursor: "pointer",
        background: active ? c.bossSoft : "transparent",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span style={{ ...sans, fontSize: 14.5, fontWeight: 600, color: c.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
        <Icon size={12} color={CHANNEL_COLOR[entry.lastChannel]} style={{ flexShrink: 0 }} />
      </div>
      <span style={{ ...sans, fontSize: 12.5, color: c.mistLight }}>{timeLabel(entry.lastAt)}</span>
    </button>
  );
}

function TimelineItem({ item }) {
  const Icon = CHANNEL_ICON[item.channel];
  const outbound = item.direction === "outbound";
  return (
    <div style={{ display: "flex", justifyContent: outbound ? "flex-end" : "flex-start" }}>
      <div
        style={{
          maxWidth: "78%", padding: "8px 12px", borderRadius: 3,
          background: outbound ? c.boss : c.folha, color: outbound ? "#fff" : c.ink,
          border: outbound ? "none" : `1px solid ${c.line}`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 3 }}>
          <Icon size={11} color={outbound ? "rgba(255,255,255,0.85)" : c.mist} />
          <span style={{ ...sans, fontSize: 12.5, fontWeight: 700, color: outbound ? "rgba(255,255,255,0.85)" : c.mist }}>
            {CHANNEL_LABEL[item.channel]}
          </span>
        </div>
        <div style={{ ...sans, fontSize: 14.5, whiteSpace: "pre-wrap" }}>{item.body}</div>
        <div style={{ ...sans, fontSize: 12.5, marginTop: 4, color: outbound ? "rgba(255,255,255,0.75)" : c.mistLight, display: "flex", alignItems: "center", gap: 4 }}>
          {timeLabel(item.at)}
          {outbound && item.status === "failed" && <AlertCircle size={11} color="#FBD5DC" />}
          {outbound && item.status !== "failed" && <CheckCircle2 size={11} />}
        </div>
      </div>
    </div>
  );
}

function ContactTimeline({ brand, entry }) {
  const timelineQuery = useContactTimeline(brand.id, entry.contactId);
  const waConversationQuery = useWhatsappConversationId(brand.id, entry.contactId);
  const sendWhatsapp = useSendWhatsapp(brand.id, entry.contactId);
  const [text, setText] = useState("");
  const [error, setError] = useState("");

  const name = entry.contact?.name || entry.contact?.phone || entry.contact?.email || "Contacto";
  const canSendWhatsapp = !!waConversationQuery.data;

  const send = async () => {
    if (!text.trim() || !waConversationQuery.data) return;
    setError("");
    const body = text.trim();
    setText("");
    try {
      await sendWhatsapp.mutateAsync({ conversationId: waConversationQuery.data, body });
    } catch (err) {
      setError(err.message || "Não foi possível enviar.");
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ padding: "12px 16px", borderBottom: `1px solid ${c.line}` }}>
        <div style={{ ...sans, fontSize: 15, fontWeight: 600, color: c.ink }}>{name}</div>
        <div style={{ ...sans, fontSize: 12.5, color: c.mist, marginTop: 1 }}>
          {[entry.contact?.phone, entry.contact?.email].filter(Boolean).join(", ")}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 8, background: c.paper }}>
        {(timelineQuery.data || []).map((item, i) => <TimelineItem key={i} item={item} />)}
        {!timelineQuery.data?.length && <div style={{ ...sans, fontSize: 14, color: c.mistLight, textAlign: "center", padding: "30px 0" }}>Sem histórico ainda.</div>}
      </div>

      <div style={{ padding: 12, borderTop: `1px solid ${c.line}` }}>
        {!canSendWhatsapp && (
          <div style={{ ...sans, fontSize: 12.5, color: c.mist, marginBottom: 8 }}>
            Só é possível responder por WhatsApp a partir daqui (Email/SMS ainda não recebem respostas). Este contacto ainda não tem conversa de WhatsApp.
          </div>
        )}
        {error && <div style={{ ...sans, fontSize: 12.5, color: c.rose, marginBottom: 8 }}>{error}</div>}
        <div style={{ display: "flex", gap: 8 }}>
          <input
            style={{ ...sans, flex: 1, fontSize: 14.5, border: `1px solid ${c.lineStrong}`, borderRadius: 6, padding: "9px 12px", outline: "none", color: c.ink, background: canSendWhatsapp ? c.folha : c.paper }}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder={canSendWhatsapp ? "Responder por WhatsApp…" : "Sem canal bidirecional disponível"}
            disabled={!canSendWhatsapp}
          />
          <button onClick={send} disabled={!canSendWhatsapp || sendWhatsapp.isPending} style={{ ...sans, display: "flex", alignItems: "center", gap: 6, fontSize: 14, fontWeight: 600, color: "#fff", background: c.boss, border: "none", borderRadius: 6, padding: "9px 14px", cursor: canSendWhatsapp ? "pointer" : "default", opacity: canSendWhatsapp ? 1 : 0.5 }}>
            <Send size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------
   MÓDULO
--------------------------------------------------------- */
export default function InboxModule({ brand, onBack }) {
  const contactsQuery = useUnifiedContacts(brand.id);
  const [selectedId, setSelectedId] = useState(null);
  const contacts = contactsQuery.data || [];
  const selected = contacts.find((e) => e.contactId === selectedId) || contacts[0] || null;

  return (
    <div className="bb-page" style={{ padding: "8px 40px 60px", maxWidth: 1040 }}>
      <button onClick={onBack} style={{ ...sans, display: "flex", alignItems: "center", gap: 6, fontSize: 14, color: c.mist, background: "none", border: "none", cursor: "pointer", marginBottom: 20 }}>
        <ArrowLeft size={14} /> Voltar à marca
      </button>

      <Eyebrow>Inbox Unificado</Eyebrow>
      <h1 style={{ ...display, fontSize: 24, color: c.ink, margin: "0 0 16px" }}>Conversas</h1>

      {!contactsQuery.isLoading && contacts.length === 0 ? (
        <div style={{ ...sans, fontSize: 14.5, color: c.mist, display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "60px 0" }}>
          <MessageCircle size={22} color={c.mistLight} />
          Ainda sem atividade em WhatsApp, Email ou SMS para esta marca.
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "var(--bb-split, 280px 1fr)", height: "calc(100vh - 220px)", minHeight: 420, border: `1px solid ${c.line}`, borderRadius: 3, overflow: "hidden" }}>
          <div style={{ borderRight: `1px solid ${c.line}`, overflowY: "auto", padding: 8 }}>
            {contacts.map((entry) => (
              <ContactRow key={entry.contactId} entry={entry} active={selected?.contactId === entry.contactId} onSelect={() => setSelectedId(entry.contactId)} />
            ))}
          </div>
          <div>
            {selected ? <ContactTimeline brand={brand} entry={selected} /> : (
              <div style={{ ...sans, fontSize: 14.5, color: c.mist, padding: 24 }}>Seleciona um contacto.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
