import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { invokeFunction } from "../../lib/supabaseClient.js";
import { c, sans, display, btnPrimary } from "../../shared/theme.jsx";
import BrandLogo from "../../design/BrandLogo.jsx";
import ApprovalSeal from "../../design/ApprovalSeal.jsx";

/* ---------------------------------------------------------
   PÁGINAS DA PROFISSIONAL PARA LIGAR O GOOGLE AGENDA
   /ligar-agenda/:token        boas-vindas + botão "Continuar com a Google"
   /ligar-agenda-resultado     onde a Google a traz de volta (ok / recusado / erro)
   Públicas, sem login: o link pessoal é a única credencial. O resto do
   processo está em supabase/functions/google-calendar-oauth.
--------------------------------------------------------- */

function Shell({ children }) {
  useEffect(() => {
    document.title = "Google Agenda";
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex, nofollow";
    document.head.appendChild(meta);
    return () => meta.remove();
  }, []);
  return (
    <div style={{ minHeight: "100vh", background: c.paper, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, ...sans }}>
      <div style={{ width: "100%", maxWidth: 460 }}>
        <BrandLogo variant="empilhado" height={96} style={{ marginBottom: 24 }} />
        <div style={{ background: c.folha, border: `1px solid ${c.line}`, borderRadius: 3, padding: "28px 26px" }}>{children}</div>
      </div>
    </div>
  );
}

export default function ConnectGooglePage() {
  const { token } = useParams();
  const [state, setState] = useState({ loading: true, info: null, error: "" });
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState("");

  useEffect(() => {
    let active = true;
    invokeFunction("google-calendar-oauth", { action: "info", token })
      .then((info) => active && setState({ loading: false, info, error: "" }))
      .catch((err) => active && setState({ loading: false, info: null, error: err.message || "Não foi possível abrir este link." }));
    return () => { active = false; };
  }, [token]);

  const start = async () => {
    setStarting(true);
    setStartError("");
    try {
      const { authUrl } = await invokeFunction("google-calendar-oauth", { action: "start", token });
      window.location.assign(authUrl);
    } catch (err) {
      setStartError(err.message || "Não foi possível continuar.");
      setStarting(false);
    }
  };

  if (state.loading) return <Shell><div style={{ fontSize: 14.5, color: c.mist }}>A abrir o link…</div></Shell>;

  if (state.error) {
    return (
      <Shell>
        <h1 style={{ ...display, fontSize: 24, color: c.ink, margin: "0 0 8px" }}>Este link não funciona</h1>
        <div style={{ fontSize: 14.5, color: c.mist, lineHeight: 1.6 }}>{state.error}</div>
      </Shell>
    );
  }

  const { staffName, brandName } = state.info;
  return (
    <Shell>
      <h1 style={{ ...display, fontSize: 26, color: c.ink, margin: "0 0 8px" }}>Ligar o Google Agenda</h1>
      <div style={{ fontSize: 14.5, color: c.mist, lineHeight: 1.6, marginBottom: 18 }}>
        {staffName ? `Olá, ${staffName}. ` : "Olá. "}{brandName ? `A ${brandName} quer` : "A equipa quer"} evitar marcações em cima dos teus compromissos.
      </div>
      <ul style={{ fontSize: 14.5, color: c.ink, lineHeight: 1.6, margin: "0 0 22px", paddingLeft: 20, display: "flex", flexDirection: "column", gap: 8 }}>
        <li>Vemos apenas quando tens eventos (ocupado ou livre). Nunca o nome nem os detalhes deles.</li>
        <li>As marcações dos clientes passam a aparecer no teu Google Agenda.</li>
        <li>Podes desligar quando quiseres, em myaccount.google.com/permissions.</li>
      </ul>
      {startError && <div style={{ fontSize: 14, color: c.rose, marginBottom: 12 }}>{startError}</div>}
      <button type="button" onClick={start} disabled={starting} style={{ ...btnPrimary, width: "100%" }}>
        {starting ? "A abrir a Google…" : "Continuar com a Google"}
      </button>
      <div style={{ fontSize: 12.5, color: c.mist, lineHeight: 1.5, marginTop: 12 }}>
        Vais para a página da Google para entrares e autorizares. A Big Boss nunca vê a tua palavra-passe.
      </div>
    </Shell>
  );
}

const ERROR_TEXT = {
  permissoes: "Para funcionar, a Google precisa de te deixar partilhar a tua disponibilidade (ocupado/livre). Abre o link outra vez e deixa essa opção marcada.",
  "sem-token": "A Google não devolveu o acesso permanente. Abre o link outra vez e autoriza de novo.",
  troca: "A Google não confirmou a autorização. Abre o link outra vez e tenta de novo.",
  configuracao: "A ligação ao Google ainda não está bem configurada. Avisa a equipa.",
};

export function ConnectGoogleResultPage() {
  const [params] = useSearchParams();
  const estado = params.get("estado");
  const nome = params.get("nome") || "";
  const motivo = params.get("motivo") || "";
  const semEscrita = params.get("escrita") === "0";

  if (estado === "ok") {
    return (
      <Shell>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}><ApprovalSeal size={56} ring lit /></div>
        <h1 style={{ ...display, fontSize: 26, color: c.ink, margin: "0 0 8px", textAlign: "center" }}>Google Agenda ligado</h1>
        <div style={{ fontSize: 14.5, color: c.mist, lineHeight: 1.6, textAlign: "center" }}>
          {nome ? `${nome}, o` : "O"} teu Google Agenda ficou ligado. Os teus compromissos já bloqueiam horários na marcação.
          {semEscrita && " Não deste permissão para escrever eventos, por isso as marcações não vão aparecer no teu Google Agenda."}
        </div>
        <div style={{ fontSize: 13, color: c.mist, marginTop: 14, textAlign: "center" }}>Já podes fechar esta página.</div>
      </Shell>
    );
  }

  if (estado === "recusado") {
    return (
      <Shell>
        <h1 style={{ ...display, fontSize: 24, color: c.ink, margin: "0 0 8px" }}>Não ficou ligado</h1>
        <div style={{ fontSize: 14.5, color: c.mist, lineHeight: 1.6 }}>
          Não autorizaste o acesso, por isso nada mudou. Se mudares de ideias, volta a abrir o link que te enviaram.
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <h1 style={{ ...display, fontSize: 24, color: c.ink, margin: "0 0 8px" }}>Não foi possível ligar</h1>
      <div style={{ fontSize: 14.5, color: c.mist, lineHeight: 1.6 }}>
        {ERROR_TEXT[motivo] || "Algo correu mal ao ligar o Google Agenda. Pede um novo link à equipa."}
      </div>
    </Shell>
  );
}
