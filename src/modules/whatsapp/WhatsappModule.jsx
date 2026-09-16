import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase, invokeFunction } from "../../lib/supabaseClient.js";
import { c, sans, serif, Eyebrow, inputStyle, btnPrimary } from "../../shared/theme.jsx";
import { ArrowLeft, Send, MessageCircle, CheckCircle2, AlertCircle } from "lucide-react";

/* ---------------------------------------------------------
   WHATSAPP — Inbox ligado à Meta Cloud API (WhatsApp Business)
   Módulo do EMPOWER OS. Ver docs/EMPOWER_OS_ARCHITECTURE_STRATEGY.md
   (secção 14) e docs/GUIA_WHATSAPP_META.md para ligar uma conta real.

   O envio/receção passa sempre pelas Edge Functions
   (supabase/functions/whatsapp-send, whatsapp-webhook) — nunca é
   feito diretamente daqui, porque precisam do token guardado no
   Vault, que o frontend nunca vê.
--------------------------------------------------------- */

const timeLabel = (iso) => (iso ? new Date(iso).toLocaleString("pt-PT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "");

/* ---------------------------------------------------------
   DATA
--------------------------------------------------------- */
function useWhatsappAccount(brandId) {
  return useQuery({
    queryKey: ["whatsapp_account", brandId],
    enabled: !!brandId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_accounts")
        .select("id, waba_id, phone_number_id, display_phone, status")
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
    mutationFn: async ({ wabaId, phoneNumberId, displayPhone, accessToken }) => {
      return invokeFunction("whatsapp-connect", { brandId, wabaId, phoneNumberId, displayPhone, accessToken });
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
   LIGAR CONTA
--------------------------------------------------------- */
function ConnectWhatsappForm({ brandId }) {
  const [wabaId, setWabaId] = useState("");
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [displayPhone, setDisplayPhone] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [error, setError] = useState("");
  const connect = useConnectWhatsapp(brandId);

  const submit = async () => {
    setError("");
    if (!wabaId.trim() || !phoneNumberId.trim() || !accessToken.trim()) {
      setError("WABA ID, Phone Number ID e o token de acesso são obrigatórios.");
      return;
    }
    try {
      await connect.mutateAsync({
        wabaId: wabaId.trim(),
        phoneNumberId: phoneNumberId.trim(),
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
      <p style={{ ...sans, fontSize: 13, color: c.mist, lineHeight: 1.6, marginBottom: 22 }}>
        Precisas destes 3 valores da tua app na Meta for Developers. Segue{" "}
        <strong>docs/GUIA_WHATSAPP_META.md</strong> se ainda não os tiveres — o token nunca fica visível depois de guardado.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
          <div style={{ ...sans, fontSize: 11.5, color: c.mist, marginBottom: 5 }}>WABA ID</div>
          <input style={inputStyle} value={wabaId} onChange={(e) => setWabaId(e.target.value)} placeholder="WhatsApp Business Account ID" />
        </div>
        <div>
          <div style={{ ...sans, fontSize: 11.5, color: c.mist, marginBottom: 5 }}>Phone Number ID</div>
          <input style={inputStyle} value={phoneNumberId} onChange={(e) => setPhoneNumberId(e.target.value)} placeholder="Phone Number ID" />
        </div>
        <div>
          <div style={{ ...sans, fontSize: 11.5, color: c.mist, marginBottom: 5 }}>Número (opcional, só para identificar)</div>
          <input style={inputStyle} value={displayPhone} onChange={(e) => setDisplayPhone(e.target.value)} placeholder="+351 9XX XXX XXX" />
        </div>
        <div>
          <div style={{ ...sans, fontSize: 11.5, color: c.mist, marginBottom: 5 }}>Token de acesso</div>
          <input style={inputStyle} type="password" value={accessToken} onChange={(e) => setAccessToken(e.target.value)} placeholder="Token permanente da Meta" />
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
        <div style={{ ...sans, fontSize: 13, whiteSpace: "pre-wrap" }}>{message.body}</div>
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
            <AlertCircle size={12} /> Janela de 24h fechada — só um template aprovado pela Meta reabre esta conversa.
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
          />
          <button onClick={send} disabled={sendMessage.isPending} style={{ ...btnPrimary, padding: "9px 14px" }}>
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
        Ainda não há conversas. Assim que alguém escrever para o número ligado, aparece aqui.
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", height: "calc(100vh - 220px)", minHeight: 420, border: `1px solid ${c.line}`, borderRadius: 14, overflow: "hidden" }}>
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
export default function WhatsappModule({ brand, onBack }) {
  const accountQuery = useWhatsappAccount(brand.id);

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
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <h1 style={{ ...serif, fontSize: 24, color: c.ink, margin: 0 }}>Inbox</h1>
            <div style={{ ...sans, fontSize: 11.5, color: c.mist }}>{accountQuery.data.display_phone || accountQuery.data.phone_number_id}</div>
          </div>
          <Inbox brandId={brand.id} />
        </>
      ) : (
        <ConnectWhatsappForm brandId={brand.id} />
      )}
    </div>
  );
}
