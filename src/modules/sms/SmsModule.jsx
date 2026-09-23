import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase, invokeFunction } from "../../lib/supabaseClient.js";
import { c, sans, serif, Eyebrow, inputStyle, btnPrimary } from "../../shared/theme.jsx";
import { ArrowLeft, MessageSquare, AlertCircle, CheckCircle2 } from "lucide-react";

/* ---------------------------------------------------------
   SMS — via Twilio. Módulo do EMPOWER OS.
   Ver docs/GUIA_TWILIO.md. Só envio — sem caixa de entrada própria
   (o SMS aqui serve para confirmações/lembretes, não conversas de
   ida e volta como o WhatsApp). O registo abaixo é só de leitura,
   os envios reais acontecem de dentro das Automações e do
   Agendamento (lembretes).
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

function useSmsMessages(brandId) {
  return useQuery({
    queryKey: ["sms_messages", brandId],
    enabled: !!brandId,
    refetchInterval: 10000,
    queryFn: async () => {
      const { data, error } = await supabase.from("sms_messages").select("*").eq("brand_id", brandId).order("created_at", { ascending: false }).limit(50);
      if (error) throw error;
      return data;
    },
  });
}

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

export default function SmsModule({ brand, onBack }) {
  const accountQuery = useSmsAccount(brand.id);
  const messagesQuery = useSmsMessages(brand.id);

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
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <h1 style={{ ...serif, fontSize: 24, color: c.ink, margin: 0 }}>Envios</h1>
            <div style={{ ...sans, fontSize: 11.5, color: c.mist }}>{accountQuery.data.from_number}</div>
          </div>
          <div style={{ ...sans, fontSize: 11.5, color: c.mist, marginBottom: 16 }}>
            O envio acontece a partir das Automações e dos lembretes de Agendamento — isto é só o registo.
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
      ) : (
        <ConnectSmsForm brandId={brand.id} />
      )}
    </div>
  );
}
