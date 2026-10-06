import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase, invokeFunction } from "../../lib/supabaseClient.js";
import { c, sans, inputStyle, btnPrimary, btnGhost } from "../../shared/theme.jsx";
import { Calendar, Copy, Check, ExternalLink, AlertCircle } from "lucide-react";

/* ---------------------------------------------------------
   GOOGLE AGENDA DE UMA PROFISSIONAL (dentro de "Editar profissional")
   A equipa gera um link pessoal; a profissional abre-o, entra com a conta
   Google dela e autoriza (não precisa de conta na Big Boss). Depois:
   - o Google Agenda dela bloqueia horários na marcação (só ocupado/livre);
   - as marcações confirmadas aparecem no Google Agenda dela (desligável).
   Ver supabase/84_google_calendar.sql e docs/GUIA_GOOGLE_AGENDA.md.
--------------------------------------------------------- */

// Só colunas sem segredos: o token do Google nunca chega ao browser.
const COLUMNS = "staff_id, google_email, push_enabled, status, last_error, last_sync_at, connected_at";

function useGoogleConnection(staffId, waiting) {
  return useQuery({
    queryKey: ["booking_staff_google", staffId],
    enabled: !!staffId,
    // Enquanto a profissional está a autorizar, vai vendo se já ligou.
    refetchInterval: waiting ? 4000 : false,
    queryFn: async () => {
      const { data, error } = await supabase.from("booking_staff_google").select(COLUMNS).eq("staff_id", staffId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

function ago(iso) {
  if (!iso) return "ainda não sincronizou";
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "há instantes";
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  return `há ${Math.round(hours / 24)} dias`;
}

function useGoogleActions(staffId) {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ["booking_staff_google", staffId] });
  const link = useMutation({
    mutationFn: () => invokeFunction("google-calendar-connect", { action: "link", staffId, appUrl: window.location.origin }),
  });
  const settings = useMutation({
    mutationFn: (pushEnabled) => invokeFunction("google-calendar-connect", { action: "settings", staffId, pushEnabled }),
    onSuccess: refresh,
  });
  const disconnect = useMutation({
    mutationFn: () => invokeFunction("google-calendar-connect", { action: "disconnect", staffId }),
    onSuccess: refresh,
  });
  return { link, settings, disconnect };
}

function LinkBox({ url, expiresAt }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // sem permissão de clipboard: o texto continua selecionável no campo
    }
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", gap: 6 }}>
        <input readOnly value={url} onFocus={(e) => e.target.select()} style={{ ...inputStyle, fontSize: 12.5, minWidth: 0 }} aria-label="Link para a profissional" />
        <button type="button" onClick={copy} style={{ ...btnGhost, flexShrink: 0 }} aria-label="Copiar link">
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </button>
        <a href={url} target="_blank" rel="noopener noreferrer" style={{ ...btnGhost, flexShrink: 0, textDecoration: "none" }} aria-label="Abrir link">
          <ExternalLink size={14} />
        </a>
      </div>
      <div style={{ ...sans, fontSize: 12.5, color: c.mist, lineHeight: 1.5 }}>
        Envia este link à profissional. Expira a {new Date(expiresAt).toLocaleDateString("pt-PT")} e só funciona uma vez. Quando ela autorizar, esta secção atualiza-se sozinha.
      </div>
    </div>
  );
}

export default function GoogleCalendarPanel({ staffId, staffName }) {
  const [generated, setGenerated] = useState(null); // { url, expiresAt }
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const connectionQuery = useGoogleConnection(staffId, !!generated);
  const { link, settings, disconnect } = useGoogleActions(staffId);
  const connection = connectionQuery.data;
  const error = link.error?.message || settings.error?.message || disconnect.error?.message || (connectionQuery.isError ? "Não foi possível carregar o estado do Google Agenda." : "");

  const generate = async () => {
    setGenerated(null);
    const result = await link.mutateAsync().catch(() => null);
    if (result?.url) setGenerated({ url: result.url, expiresAt: result.expiresAt });
  };

  const box = { display: "flex", flexDirection: "column", gap: 10, padding: 14, border: `1px solid ${c.line}`, borderRadius: 6, background: c.paper };
  const title = (
    <div style={{ ...sans, display: "flex", alignItems: "center", gap: 7, fontSize: 13.5, fontWeight: 700, color: c.ink }}>
      <Calendar size={15} color={c.bossText} /> Google Agenda
    </div>
  );

  if (connectionQuery.isLoading) {
    return <div style={box}>{title}<div style={{ ...sans, fontSize: 13, color: c.mist }}>A carregar…</div></div>;
  }

  return (
    <div style={box}>
      {title}

      {!connection && (
        <>
          <div style={{ ...sans, fontSize: 12.5, color: c.mist, lineHeight: 1.5 }}>
            Quando {staffName || "a profissional"} liga o Google Agenda, os compromissos dela bloqueiam horários na marcação (só se vê ocupado ou livre, nunca o conteúdo dos eventos) e as marcações confirmadas aparecem no Google Agenda dela.
          </div>
          {generated ? (
            <LinkBox url={generated.url} expiresAt={generated.expiresAt} />
          ) : (
            <button type="button" onClick={generate} disabled={link.isPending} style={{ ...btnPrimary, width: "fit-content" }}>
              {link.isPending ? "A gerar…" : "Gerar link para ela ligar"}
            </button>
          )}
        </>
      )}

      {connection && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span
              style={{
                ...sans, fontSize: 12.5, fontWeight: 700, borderRadius: 999, padding: "3px 10px",
                color: connection.status === "connected" ? c.sage : c.amber,
                background: connection.status === "connected" ? c.sageSoft : c.amberSoft,
              }}
            >
              {connection.status === "connected" ? "Ligado" : "Precisa de voltar a ligar"}
            </span>
            <span style={{ ...sans, fontSize: 13, color: c.ink, overflowWrap: "anywhere" }}>{connection.google_email || "conta Google"}</span>
          </div>

          {connection.status === "connected" ? (
            <>
              <div style={{ ...sans, fontSize: 12.5, color: c.mist }}>Última leitura do Google Agenda: {ago(connection.last_sync_at)}. Atualiza de 5 em 5 minutos.</div>
              <label style={{ ...sans, fontSize: 13, color: c.ink, display: "flex", alignItems: "flex-start", gap: 8, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={connection.push_enabled}
                  disabled={settings.isPending}
                  onChange={(e) => settings.mutate(e.target.checked)}
                  style={{ marginTop: 2 }}
                />
                <span>Escrever as marcações confirmadas no Google Agenda dela (nome, telemóvel e email do cliente ficam no evento).</span>
              </label>
            </>
          ) : (
            <>
              <div style={{ ...sans, fontSize: 12.5, color: c.amber, lineHeight: 1.5 }}>
                A Google deixou de aceitar o acesso (a profissional pode ter revogado, ou a app Google ainda está em modo de teste). Até voltar a ligar, o Google Agenda dela não bloqueia horários.
              </div>
              {generated ? (
                <LinkBox url={generated.url} expiresAt={generated.expiresAt} />
              ) : (
                <button type="button" onClick={generate} disabled={link.isPending} style={{ ...btnPrimary, width: "fit-content" }}>
                  {link.isPending ? "A gerar…" : "Gerar novo link"}
                </button>
              )}
            </>
          )}

          {connection.last_error && (
            <div style={{ ...sans, fontSize: 12.5, color: c.rose, display: "flex", gap: 6, alignItems: "flex-start", lineHeight: 1.5 }}>
              <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} /> {connection.last_error}
            </div>
          )}

          {confirmDisconnect ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ ...sans, fontSize: 12.5, color: c.ink, lineHeight: 1.5 }}>
                Desligar apaga do Google Agenda dela as marcações futuras que a Big Boss lá escreveu e deixa de bloquear horários. Os compromissos pessoais dela não são tocados.
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  onClick={() => disconnect.mutate(undefined, { onSuccess: () => { setConfirmDisconnect(false); setGenerated(null); } })}
                  disabled={disconnect.isPending}
                  style={{ ...btnPrimary, background: c.roseSolid }}
                >
                  {disconnect.isPending ? "A desligar…" : "Desligar"}
                </button>
                <button type="button" onClick={() => setConfirmDisconnect(false)} style={btnGhost}>Cancelar</button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirmDisconnect(true)} style={{ ...btnGhost, width: "fit-content", color: c.rose }}>Desligar Google Agenda</button>
          )}
        </>
      )}

      {error && <div style={{ ...sans, fontSize: 13, color: c.rose }}>{error}</div>}
    </div>
  );
}
