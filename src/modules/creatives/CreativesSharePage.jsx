import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { invokeFunction } from "../../lib/supabaseClient.js";
import { c, sans, serif, display, inputStyle, btnPrimary, btnGhost } from "../../shared/theme.jsx";
import { Download, Palette, Check, MessageSquare, RotateCcw } from "lucide-react";
import ApprovalSeal from "../../design/ApprovalSeal.jsx";
import VersionViewer from "./CreativeViewers.jsx";
import { StatusPill } from "./CreativesModule.jsx";
import { KINDS, formatBytes, formatWhen } from "./creativesKinds.js";

/* ---------------------------------------------------------
   PÁGINA PÚBLICA DE OPÇÕES — /criativos/:token
   O token é a única credencial; tudo passa pela função creative-share
   (sem login). O cliente vê as opções enviadas, comenta, aprova ou pede
   alterações, e descarrega os ficheiros finais da opção aprovada.
   Fica sempre clara para ver os designs sem cor de tema por cima.
--------------------------------------------------------- */

const NAME_KEY = "bb-criativos-nome";
const readName = () => { try { return localStorage.getItem(NAME_KEY) || ""; } catch { return ""; } };
const saveName = (v) => { try { localStorage.setItem(NAME_KEY, v); } catch { /* sem armazenamento: não faz mal */ } };

function Shell({ children }) {
  return (
    <div className="bb-force-light" style={{ minHeight: "100vh", background: c.paper, ...sans }}>
      <div style={{ maxWidth: 940, margin: "0 auto", padding: "28px 16px 72px" }}>{children}</div>
    </div>
  );
}

function OptionPanel({ token, option, kind, urls, onChanged }) {
  const latest = option.versions.length ? option.versions[option.versions.length - 1].version : 0;
  const [shown, setShown] = useState(latest);
  const [name, setName] = useState(readName);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  useEffect(() => { setShown(latest); }, [latest, option.id]);
  const current = option.versions.find((v) => v.version === shown) || option.versions[option.versions.length - 1] || null;

  const call = async (payload, successMessage) => {
    setError("");
    setDone("");
    if (name.trim().length < 2) { setError("Escreva o seu nome para a equipa saber quem respondeu."); return; }
    saveName(name.trim());
    setBusy(payload.action + (payload.decision || ""));
    try {
      await invokeFunction("creative-share", { token, optionId: option.id, name: name.trim(), ...payload });
      setText("");
      setDone(successMessage);
      await onChanged();
    } catch (err) {
      setError(err.message || "Não foi possível enviar. Tente outra vez.");
    } finally {
      setBusy("");
    }
  };

  const approved = option.status === "approved";
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 6 }}>
        <h2 style={{ ...display, fontSize: 24, color: c.ink, margin: 0 }}>{option.title}</h2>
        <StatusPill status={option.status} />
      </div>
      {option.decidedAt && (option.status === "approved" || option.status === "rejected") && (
        <div style={{ fontSize: 13, color: c.mist, marginBottom: 10 }}>{option.status === "approved" ? "Aprovada" : "Alterações pedidas"} por {option.decidedByName || "cliente"} em {formatWhen(option.decidedAt)}</div>
      )}

      {approved && option.finalFiles.length > 0 && (
        <section style={{ background: c.sageSoft, border: `1px solid ${c.sage}`, borderRadius: 6, padding: 16, margin: "12px 0 20px" }}>
          <h3 style={{ ...serif, fontSize: 16, fontWeight: 500, color: c.ink, margin: "0 0 10px" }}>Ficheiros finais</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {option.finalFiles.map((f, i) => (
              <div key={`${f.name}-${i}`} style={{ display: "flex", alignItems: "center", gap: 10, background: c.folha, border: `1px solid ${c.line}`, borderRadius: 6, padding: "8px 12px", flexWrap: "wrap" }}>
                <span style={{ fontSize: 14, color: c.ink, flex: 1, minWidth: 140, wordBreak: "break-word" }}>{f.name}{f.size ? <span style={{ color: c.mist }}> ({formatBytes(f.size)})</span> : null}</span>
                <a href={f.url} style={{ ...btnPrimary, textDecoration: "none" }}><Download size={14} /> Descarregar</a>
              </div>
            ))}
          </div>
        </section>
      )}

      {option.versions.length > 1 && (
        <div role="tablist" aria-label="Versões" style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "14px 0 10px" }}>
          {option.versions.map((v) => (
            <button key={v.version} role="tab" aria-selected={v.version === shown} type="button" onClick={() => setShown(v.version)} style={{ fontSize: 13.5, fontWeight: 700, padding: "6px 12px", borderRadius: 999, cursor: "pointer", border: `1px solid ${v.version === shown ? c.boss : c.lineStrong}`, background: v.version === shown ? c.bossSoft : "none", color: c.ink }}>
              v{v.version}{v.version === latest ? " (atual)" : ""}
            </button>
          ))}
        </div>
      )}
      {current?.note && <div style={{ fontSize: 14, color: c.mist, margin: "8px 0 12px" }}><b style={{ color: c.ink }}>v{current.version}:</b> {current.note}</div>}

      <div style={{ margin: "16px 0 28px" }}>
        {current ? <VersionViewer kind={kind} content={current.content} urls={urls} /> : <div style={{ fontSize: 14.5, color: c.mist }}>Esta opção ainda não tem design.</div>}
      </div>

      <section style={{ marginBottom: 24 }}>
        <h3 style={{ ...serif, fontSize: 16, fontWeight: 500, color: c.ink, margin: "0 0 10px" }}>Comentários</h3>
        {option.comments.length === 0 && <div style={{ fontSize: 14, color: c.mist }}>Ainda sem comentários.</div>}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {option.comments.map((cm, i) => (
            <div key={i} style={{ background: cm.fromClient ? c.bossSoft : c.folha, border: `1px solid ${c.line}`, borderRadius: 6, padding: "10px 12px" }}>
              <div style={{ fontSize: 12.5, color: c.mist, display: "flex", gap: 8, flexWrap: "wrap" }}>
                <b style={{ color: c.ink }}>{cm.authorName}</b>{!cm.fromClient && <span>equipa</span>}{cm.version && <span>v{cm.version}</span>}<span>{formatWhen(cm.createdAt)}</span>
              </div>
              <div style={{ fontSize: 14.5, color: c.ink, whiteSpace: "pre-wrap", wordBreak: "break-word", marginTop: 4 }}>{cm.body}</div>
            </div>
          ))}
        </div>
      </section>

      <section style={{ background: c.folha, border: `1px solid ${c.line}`, borderRadius: 6, padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ ...serif, fontSize: 17, color: c.ink }}>A sua opinião</div>
        <div>
          <label htmlFor="criativos-nome" style={{ fontSize: 12.5, color: c.mist, display: "block", marginBottom: 5 }}>O seu nome</label>
          <input id="criativos-nome" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoComplete="name" style={inputStyle} />
        </div>
        <div>
          <label htmlFor="criativos-texto" style={{ fontSize: 12.5, color: c.mist, display: "block", marginBottom: 5 }}>Comentário (obrigatório se pedir alterações)</label>
          <textarea id="criativos-texto" value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={2000} placeholder="O que gostou ou o que quer que mudemos?" style={{ ...inputStyle, resize: "vertical" }} />
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {!approved && (
            <button type="button" disabled={!!busy} onClick={() => call({ action: "decide", decision: "approved", comment: text }, "Obrigado! Escolheu esta opção e a equipa já foi avisada.")} style={btnPrimary}>
              <Check size={14} /> {busy === "decideapproved" ? "A enviar…" : "Aprovar esta opção"}
            </button>
          )}
          <button type="button" disabled={!!busy || !text.trim()} onClick={() => call({ action: "decide", decision: "rejected", comment: text }, "Recebemos o seu pedido de alterações. A equipa vai preparar uma nova versão.")} style={btnGhost}>
            <RotateCcw size={14} /> {busy === "decidererejected" ? "A enviar…" : "Pedir alterações"}
          </button>
          <button type="button" disabled={!!busy || !text.trim()} onClick={() => call({ action: "comment", body: text, version: current?.version ?? null }, "Comentário enviado.")} style={btnGhost}>
            <MessageSquare size={14} /> {busy === "commentcomment" ? "A enviar…" : "Só comentar"}
          </button>
        </div>
        {approved && (
          <div style={{ fontSize: 13, color: c.mist }}>Esta opção já está aprovada. Pode ainda comentar ou pedir alterações.</div>
        )}
        {error && <div role="alert" style={{ fontSize: 14, color: c.rose }}>{error}</div>}
        {done && <div role="status" style={{ fontSize: 14, color: c.sageSolid }}>{done}</div>}
      </section>
    </div>
  );
}

export default function CreativesSharePage() {
  const { token } = useParams();
  const [state, setState] = useState({ loading: true, error: "", data: null });
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    document.title = "Opções de design";
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex, nofollow";
    document.head.appendChild(meta);
    return () => meta.remove();
  }, []);

  const load = useCallback(async () => {
    try {
      const data = await invokeFunction("creative-share", { action: "view", token });
      setState({ loading: false, error: "", data });
    } catch (err) {
      setState((prev) => (prev.data ? prev : { loading: false, error: err.message || "Não foi possível abrir esta página.", data: null }));
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  if (state.loading) return <Shell><div style={{ fontSize: 14.5, color: c.mist }}>A abrir as opções…</div></Shell>;
  if (state.error) {
    return (
      <Shell>
        <div style={{ background: c.folha, border: `1px solid ${c.line}`, borderRadius: 3, padding: 28, textAlign: "center" }}>
          <Palette size={28} color={c.mistLight} />
          <div style={{ ...serif, fontSize: 19, color: c.ink, margin: "12px 0 6px" }}>Não foi possível abrir esta página</div>
          <div style={{ fontSize: 14.5, color: c.mist }}>{state.error}</div>
        </div>
      </Shell>
    );
  }

  const { project, brand, options, urls } = state.data;
  const sorted = [...options].sort((a, b) => (b.status === "approved") - (a.status === "approved"));
  const active = sorted.find((o) => o.id === selected) || sorted[0] || null;
  const KindIcon = KINDS[project.kind]?.icon || Palette;

  return (
    <Shell>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
        {brand.logoUrl && <img src={brand.logoUrl} alt="" style={{ height: 36, width: "auto", maxWidth: 120, objectFit: "contain" }} />}
        <div style={{ ...serif, fontSize: 15, color: c.bossText }}>{brand.name}</div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <KindIcon size={22} color={c.bossText} />
        <h1 style={{ ...display, fontSize: 28, color: c.ink, margin: 0 }}>{project.title}</h1>
      </div>
      <div style={{ fontSize: 14.5, color: c.mist, lineHeight: 1.6, marginBottom: 20 }}>
        Veja as opções preparadas para si. Pode comentar cada uma, aprovar a que preferir ou pedir alterações.
      </div>

      {sorted.length === 0 && <div style={{ fontSize: 14.5, color: c.mist }}>Ainda não há opções para ver. A equipa avisa quando estiverem prontas.</div>}

      {sorted.length > 1 && (
        <div role="tablist" aria-label="Opções" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 24, borderBottom: `1px solid ${c.line}`, paddingBottom: 14 }}>
          {sorted.map((o) => {
            const on = active?.id === o.id;
            return (
              <button key={o.id} role="tab" aria-selected={on} type="button" onClick={() => setSelected(o.id)} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 700, padding: "8px 14px", borderRadius: 999, cursor: "pointer", color: on ? c.onBoss : c.ink, background: on ? c.boss : "none", border: `1px solid ${on ? c.boss : c.lineStrong}` }}>
                {o.status === "approved" && <ApprovalSeal size={14} />} {o.title}
              </button>
            );
          })}
        </div>
      )}

      {active && <OptionPanel key={active.id} token={token} option={active} kind={project.kind} urls={urls} onChanged={load} />}
    </Shell>
  );
}
