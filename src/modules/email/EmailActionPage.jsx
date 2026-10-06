import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { c, sans, serif, btnPrimary } from "../../shared/theme.jsx";

/* ---------------------------------------------------------
   PÁGINAS DOS LINKS DOS EMAILS (públicas, sempre claras, sem marca Big Boss)
   /email/confirmado  depois de um clique de escolha num email
   /email/anular      confirmar anular a subscrição (o pedido vai à função
                      email-click; o link sozinho não anula, para os
                      antivírus que abrem links não tirarem ninguém da lista)
--------------------------------------------------------- */

const ENDPOINT = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/email-click`;

function Shell({ title, children }) {
  useEffect(() => {
    document.title = title;
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex, nofollow";
    document.head.appendChild(meta);
    return () => meta.remove();
  }, [title]);
  return (
    <div className="bb-force-light" style={{ minHeight: "100vh", background: c.paper, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, ...sans }}>
      <div style={{ width: "100%", maxWidth: 440, background: c.folha, border: `1px solid ${c.line}`, borderRadius: 3, padding: "28px 26px", textAlign: "center" }}>
        {children}
      </div>
    </div>
  );
}

export function EmailConfirmedPage() {
  const [params] = useSearchParams();
  const failed = params.get("erro") === "1";
  return (
    <Shell title={failed ? "Link inválido" : "Escolha registada"}>
      <h1 style={{ ...serif, fontSize: 22, color: c.ink, margin: "0 0 8px" }}>{failed ? "Este link já não é válido" : "Escolha registada"}</h1>
      <div style={{ fontSize: 14.5, color: c.mist, lineHeight: 1.6 }}>
        {failed ? "Não foi possível registar este clique. Pode responder ao email diretamente." : "Obrigado. Os próximos emails vão ter isto em conta. Já pode fechar esta página."}
      </div>
    </Shell>
  );
}

export function EmailUnsubscribePage() {
  const [params] = useSearchParams();
  const [state, setState] = useState("ask"); // ask | sending | done | error

  const confirm = async () => {
    setState("sending");
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ p: params.get("p") || "", s: params.get("s") || "" }),
      });
      setState(res.ok ? "done" : "error");
    } catch {
      setState("error");
    }
  };

  if (state === "done") {
    return (
      <Shell title="Subscrição anulada">
        <h1 style={{ ...serif, fontSize: 22, color: c.ink, margin: "0 0 8px" }}>Subscrição anulada</h1>
        <div style={{ fontSize: 14.5, color: c.mist, lineHeight: 1.6 }}>Não volta a receber emails de marketing nossos. Já pode fechar esta página.</div>
      </Shell>
    );
  }

  return (
    <Shell title="Anular subscrição">
      <h1 style={{ ...serif, fontSize: 22, color: c.ink, margin: "0 0 8px" }}>Deixar de receber emails?</h1>
      <div style={{ fontSize: 14.5, color: c.mist, lineHeight: 1.6, marginBottom: 20 }}>
        Ao confirmar, deixa de receber os nossos emails de marketing. Os emails sobre compras que já fez continuam a chegar.
      </div>
      {state === "error" && (
        <div style={{ fontSize: 14, color: c.rose, marginBottom: 14 }}>Não foi possível anular. Tente outra vez ou responda ao email a pedir.</div>
      )}
      <button onClick={confirm} disabled={state === "sending"} style={{ ...btnPrimary, margin: "0 auto" }}>
        {state === "sending" ? "A anular…" : "Anular subscrição"}
      </button>
    </Shell>
  );
}
