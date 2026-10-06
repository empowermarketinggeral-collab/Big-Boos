import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { c, sans, serif, display } from "../../shared/theme.jsx";
import { LEGAL, PRIVACY, TERMS } from "./legalContent.js";

/* ---------------------------------------------------------
   PÁGINAS PÚBLICAS /privacidade e /termos
   Sem login. Em português e inglês (?lang=en abre em inglês).
   Exigidas, por exemplo, pelo ecrã de consentimento OAuth da Google.
--------------------------------------------------------- */

function Block({ item }) {
  if (typeof item === "string") return <p style={{ margin: "0 0 12px" }}>{item}</p>;
  return (
    <ul style={{ margin: "0 0 12px", paddingLeft: 22, display: "flex", flexDirection: "column", gap: 8 }}>
      {item.list.map((li) => <li key={li}>{li}</li>)}
    </ul>
  );
}

function LegalPage({ doc, other }) {
  const [params, setParams] = useSearchParams();
  const [lang, setLang] = useState(params.get("lang") === "en" ? "en" : "pt");
  const data = doc[lang];

  useEffect(() => {
    document.title = `${data.title} — ${LEGAL.product}`;
    document.documentElement.lang = lang;
    return () => { document.documentElement.lang = "pt"; };
  }, [data.title, lang]);

  const pick = (next) => {
    setLang(next);
    setParams(next === "en" ? { lang: "en" } : {}, { replace: true });
  };

  const tab = (key, label) => (
    <button type="button" key={key} onClick={() => pick(key)} aria-pressed={lang === key} style={{ ...sans, fontSize: 13.5, fontWeight: 700, padding: "6px 14px", borderRadius: 999, cursor: "pointer", color: lang === key ? c.onBoss : c.ink, background: lang === key ? c.boss : "none", border: `1px solid ${lang === key ? c.boss : c.lineStrong}` }}>{label}</button>
  );

  return (
    <div className="bb-force-light" style={{ minHeight: "100vh", background: c.paper, ...sans }}>
      <main style={{ maxWidth: 760, margin: "0 auto", padding: "32px 20px 72px", color: c.ink, fontSize: 15, lineHeight: 1.7 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 22 }}>
          <div style={{ ...serif, fontSize: 16, color: c.bossText, flex: 1 }}>{LEGAL.product} by Empower Boss</div>
          <div role="group" aria-label="Idioma / Language" style={{ display: "flex", gap: 6 }}>{tab("pt", "Português")}{tab("en", "English")}</div>
        </div>
        <h1 style={{ ...display, fontSize: 32, color: c.ink, margin: "0 0 6px" }}>{data.title}</h1>
        <div style={{ fontSize: 13.5, color: c.mist, marginBottom: 20 }}>{lang === "en" ? "Last updated" : "Última atualização"}: {LEGAL.updated[lang]}</div>
        <p style={{ margin: "0 0 24px" }}>{data.intro}</p>
        {data.sections.map((s) => (
          <section key={s.title} style={{ marginBottom: 22 }}>
            <h2 style={{ ...serif, fontSize: 19, fontWeight: 500, color: c.ink, margin: "0 0 8px" }}>{s.title}</h2>
            {s.body.map((item, i) => <Block key={i} item={item} />)}
          </section>
        ))}
        <div style={{ marginTop: 34, paddingTop: 16, borderTop: `1px solid ${c.line}`, fontSize: 14, color: c.mist }}>
          <Link to={`${other.path}${lang === "en" ? "?lang=en" : ""}`} style={{ color: c.bossText, fontWeight: 700 }}>{other[lang]}</Link>
        </div>
      </main>
    </div>
  );
}

export function PrivacyPage() {
  return <LegalPage doc={PRIVACY} other={{ path: "/termos", pt: "Termos de Serviço", en: "Terms of Service" }} />;
}

export function TermsPage() {
  return <LegalPage doc={TERMS} other={{ path: "/privacidade", pt: "Política de Privacidade", en: "Privacy Policy" }} />;
}
