import { useEffect, useMemo, useState } from "react";
import {
  LayoutGrid, Briefcase, Handshake, FileText, FileSignature, CreditCard, Users, Settings, Search, Sun, Moon, Monitor, Plus, AlertCircle, CheckCircle2,
} from "lucide-react";
import "./tokens.css";
import "./specimen.css";

/* ---------------------------------------------------------
   EXEMPLAR DE DESIGN — só em desenvolvimento (rota /design).
   Mostra o ecrã de entrada, a aplicação, os componentes, o documento
   e as cores com contraste medido, em claro e escuro. Nada aqui toca
   na aplicação real.
--------------------------------------------------------- */

const STATE_LABEL = { rascunho: "Rascunho", pendente: "Para aprovar", aprovado: "Aprovado", atraso: "Atrasado", erro: "Com erro" };

function Tag({ estado, lit }) {
  return (
    <span className={`bbx-tag bbx-tag-${estado}`}>
      {estado === "aprovado" ? <span className={`bbx-seal bbx-seal-sm${lit ? " lit" : ""}`} aria-hidden="true" /> : <i />}
      {STATE_LABEL[estado]}
    </span>
  );
}

const INITIAL_ROWS = [
  { id: 1, title: 'Reel "Antes e depois"', canal: "Instagram", data: "12 abr", estado: "pendente" },
  { id: 2, title: 'Carrossel "5 erros de pedicure"', canal: "Instagram", data: "14 abr", estado: "pendente" },
  { id: 3, title: 'Post "Nova linha Podocare"', canal: "Facebook", data: "16 abr", estado: "aprovado" },
  { id: 4, title: 'Story "Bastidores da formação"', canal: "Instagram", data: "18 abr", estado: "rascunho" },
  { id: 5, title: 'Vídeo "Depoimento de aluna"', canal: "YouTube", data: "21 abr", estado: "atraso" },
];

const FILTERS = [
  { key: "todas", label: "Todas" },
  { key: "pendente", label: "Para aprovar" },
  { key: "aprovado", label: "Aprovadas" },
];

const NAV = [
  { label: "Painel", icon: LayoutGrid },
  { label: "Marcas", icon: Briefcase, current: true },
  { label: "Reuniões", icon: Handshake },
  { label: "Propostas", icon: FileText },
  { label: "Contratos", icon: FileSignature },
  { label: "Faturação", icon: CreditCard },
  { label: "Equipa", icon: Users },
  { label: "Definições", icon: Settings },
];

/* ---------- contraste (WCAG) ---------- */
function hexToRgb(hex) {
  const h = hex.replace("#", "").trim();
  if (h.length !== 6) return null;
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}
function luminance([r, g, b]) {
  const f = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function ratio(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

const CONTRAST_PAIRS = [
  ["Texto principal sobre folha", "--bb-tinta", "--bb-folha", 4.5],
  ["Texto suave sobre folha", "--bb-tinta-2", "--bb-folha", 4.5],
  ["Texto mais suave e marcadores sobre folha", "--bb-tinta-3", "--bb-folha", 4.5],
  ["Texto mais suave sobre mesa", "--bb-tinta-3", "--bb-mesa", 4.5],
  ["Texto principal sobre mesa", "--bb-tinta", "--bb-mesa", 4.5],
  ["Texto suave sobre mesa", "--bb-tinta-2", "--bb-mesa", 4.5],
  ["Cabeçalho de lista (texto suave sobre folha 2)", "--bb-tinta-2", "--bb-folha-2", 4.5],
  ["Botão principal (texto sobre roxo)", "--bb-sobre-boss", "--bb-boss", 4.5],
  ["Ligações e ações em roxo sobre folha", "--bb-boss-texto", "--bb-folha", 4.5],
  ["Estado para aprovar", "--bb-boss-texto", "--bb-boss-suave", 4.5],
  ["Estado aprovado", "--bb-verde", "--bb-verde-suave", 4.5],
  ["Estado atrasado", "--bb-aviso", "--bb-aviso-suave", 4.5],
  ["Estado com erro", "--bb-erro", "--bb-erro-suave", 4.5],
  ["Menu: texto ativo sobre régua", "--bb-regua-texto", "--bb-regua", 4.5],
  ["Menu: texto normal sobre régua", "--bb-regua-texto-2", "--bb-regua", 4.5],
  ["Documento: texto sobre papel branco", "--bb-doc-tinta", "--bb-doc-papel", 4.5],
  ["Documento: texto suave sobre papel branco", "--bb-doc-tinta-2", "--bb-doc-papel", 4.5],
  ["Contorno de campos e botões sobre folha (componente)", "--bb-campo-borda", "--bb-folha", 3],
  ["Botão principal sobre folha (componente)", "--bb-boss", "--bb-folha", 3],
  ["Estrela dourada sobre folha (componente)", "--bb-dourado", "--bb-folha", 3],
  ["Foco de teclado sobre folha (componente)", "--bb-foco", "--bb-folha", 3],
];

const SWATCHES = [
  ["Mesa", "--bb-mesa", "fundo da aplicação"],
  ["Folha", "--bb-folha", "onde está o conteúdo"],
  ["Régua", "--bb-regua", "menu lateral"],
  ["Roxo Boss", "--bb-boss", "marca e ações que decidem"],
  ["Tinta", "--bb-tinta", "texto"],
  ["Dourado Boss", "--bb-dourado", "só a estrela de aprovado"],
  ["Verde aprovado", "--bb-verde", "estado aprovado"],
  ["Vermelho erro", "--bb-erro", "erros e ações destrutivas"],
  ["Âmbar aviso", "--bb-aviso", "atrasos e avisos"],
];

export default function DesignSpecimen() {
  const [theme, setTheme] = useState("system"); // system | light | dark
  const [tick, setTick] = useState(0);
  const [rows, setRows] = useState(INITIAL_ROWS);
  const [filter, setFilter] = useState("todas");
  const [openId, setOpenId] = useState(1);
  const [litId, setLitId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [signed, setSigned] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", theme);
    const id = requestAnimationFrame(() => setTick((n) => n + 1));
    return () => cancelAnimationFrame(id);
  }, [theme]);
  useEffect(() => () => document.documentElement.removeAttribute("data-theme"), []);

  const resolvedDark = useMemo(
    () => theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches),
    [theme]
  );

  const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const contrastRows = useMemo(
    () =>
      CONTRAST_PAIRS.map(([label, fg, bg, min]) => {
        const a = hexToRgb(cssVar(fg));
        const b = hexToRgb(cssVar(bg));
        const value = a && b ? ratio(a, b) : null;
        return { label, fg, bg, min, value };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tick]
  );

  const approve = (id) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, estado: "aprovado" } : r)));
    setLitId(id);
  };
  const sendForApproval = (id) => setRows((prev) => prev.map((r) => (r.id === id ? { ...r, estado: "pendente" } : r)));
  const shown = rows.filter((r) => filter === "todas" || r.estado === filter);
  const waiting = rows.filter((r) => r.estado === "pendente").length;

  const fakeSave = () => {
    setSaving(true);
    setTimeout(() => setSaving(false), 1600);
  };

  return (
    <div className="bbx">
      <div className="bbx-top">
        <div>
          <div style={{ fontFamily: "var(--bb-font-titulo)", fontVariationSettings: "var(--bb-titulo-vs)", fontWeight: 800, fontSize: 18 }}>Exemplar de design da Big Boss</div>
          <div className="bbx-sub">Só em desenvolvimento. Nada disto está na aplicação.</div>
        </div>
        <div className="bbx-seg" role="group" aria-label="Tema">
          <button aria-pressed={theme === "light"} onClick={() => setTheme("light")}><Sun size={14} /> Claro</button>
          <button aria-pressed={theme === "dark"} onClick={() => setTheme("dark")}><Moon size={14} /> Escuro</button>
          <button aria-pressed={theme === "system"} onClick={() => setTheme("system")}><Monitor size={14} /> Sistema</button>
        </div>
      </div>

      <div className="bbx-wrap">
        {/* ---------------- entrada ---------------- */}
        <section>
          <div className="bbx-block-head">
            <h2 className="bbx-h2">Ecrã de entrada</h2>
            <p className="bbx-sub">Com o logótipo definitivo. No modo escuro troca para a versão sobre roxo.</p>
          </div>
          <div className="bbx-login">
            <div className="bbx-login-in">
              <div className="bbx-brand"><span className="bbx-logo bbx-logo-empilhado" role="img" aria-label="Big Boss by Empower Boss" /></div>
              <div className="bbx-folha bbx-pad" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div>
                  <h3 className="bbx-h2" style={{ fontSize: 22 }}>Entrar</h3>
                  <p className="bbx-muted" style={{ marginTop: 4 }}>Usa o email e a palavra-passe da tua conta.</p>
                </div>
                <div className="bbx-field">
                  <label className="bbx-label" htmlFor="lg-email">Email</label>
                  <input id="lg-email" className="bbx-input" type="email" placeholder="ana@agencia.pt" autoComplete="email" />
                </div>
                <div className="bbx-field">
                  <label className="bbx-label" htmlFor="lg-pass">Palavra-passe</label>
                  <input id="lg-pass" className="bbx-input" type="password" placeholder="A tua palavra-passe" autoComplete="current-password" />
                </div>
                <button className="bbx-btn bbx-btn-primary" type="button">Entrar</button>
                <a className="bbx-btn bbx-btn-ghost bbx-btn-sm" href="#recuperar" onClick={(e) => e.preventDefault()}>Esqueci a palavra-passe</a>
              </div>
              <p className="bbx-muted bbx-small">
                Ainda não tens conta? <a href="#registar" onClick={(e) => e.preventDefault()} style={{ color: "var(--bb-boss-texto)", fontWeight: 700 }}>Regista a tua agência</a>
              </p>
            </div>
          </div>
        </section>

        {/* ---------------- aplicação ---------------- */}
        <section>
          <div className="bbx-block-head">
            <h2 className="bbx-h2">Aplicação</h2>
            <p className="bbx-sub">Régua à esquerda, mesa ao fundo e a folha de trabalho por cima. Carrega em "Aprovar peça" para ver a estrela.</p>
          </div>
          <div className="bbx-app">
            <aside className="bbx-regua">
              <div className="bbx-regua-logo"><span className="bbx-logo bbx-logo-compacto-roxo" role="img" aria-label="Big Boss" /></div>
              <nav className="bbx-nav" aria-label="Principal">
                {NAV.map(({ label, icon: Icon, current }) => (
                  <a key={label} href={`#${label}`} onClick={(e) => e.preventDefault()} aria-current={current ? "page" : undefined}>
                    <Icon size={17} strokeWidth={1.8} /> {label}
                  </a>
                ))}
              </nav>
              <div className="bbx-regua-foot">
                <div className="bbx-avatar">AS</div>
                <div className="bbx-userinfo" style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>Ana Silva</div>
                  <div style={{ fontSize: 13, color: "var(--bb-regua-texto-2)" }}>Agência</div>
                </div>
                <button
                  type="button"
                  className="bbx-btn bbx-btn-sm"
                  style={{ marginLeft: "auto", minHeight: 34, padding: "6px 8px", color: "var(--bb-regua-texto)", background: "var(--bb-regua-hover)" }}
                  aria-label={resolvedDark ? "Mudar para modo claro" : "Mudar para modo escuro"}
                  onClick={() => setTheme(resolvedDark ? "light" : "dark")}
                >
                  {resolvedDark ? <Sun size={16} /> : <Moon size={16} />}
                </button>
              </div>
            </aside>

            <div className="bbx-main">
              <div className="bbx-strip">
                <div className="bbx-crumb">Marcas / <b>Clínica Aurora</b></div>
                <div className="bbx-search">
                  <Search size={16} />
                  <input className="bbx-input" placeholder="Procurar peças e contactos" aria-label="Procurar" />
                </div>
              </div>

              <div className="bbx-folha bbx-sheet">
                <div className="bbx-sheet-head">
                  <div>
                    <h3 className="bbx-h1">Conteúdos de abril</h3>
                    <p className="bbx-sub" style={{ marginTop: 6 }}>
                      {waiting === 0 && "Nenhuma peça à espera da tua aprovação"}
                      {waiting === 1 && "1 peça à espera da tua aprovação"}
                      {waiting > 1 && `${waiting} peças à espera da tua aprovação`}
                    </p>
                  </div>
                  <button className="bbx-btn bbx-btn-primary" type="button"><Plus size={16} /> Nova peça</button>
                </div>
                <div className="bbx-filters" role="group" aria-label="Filtrar por estado">
                  {FILTERS.map((f) => (
                    <button key={f.key} className="bbx-chip" aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}>{f.label}</button>
                  ))}
                </div>

                <div className="bbx-list-head" role="row">
                  <div>Peça</div><div>Canal</div><div>Data</div><div>Estado</div><div />
                </div>
                {shown.map((r) => (
                  <div
                    key={r.id}
                    className={`bbx-row${openId === r.id ? " open" : ""}${litId === r.id ? " flash" : ""}`}
                    onClick={() => setOpenId(r.id)}
                  >
                    {openId === r.id && (<><span className="bbx-cm tl" /><span className="bbx-cm tr" /><span className="bbx-cm bl" /><span className="bbx-cm br" /></>)}
                    <div className="bbx-row-title c-title">{r.title}</div>
                    <div className="c-canal">{r.canal}</div>
                    <div className="c-data">{r.data}</div>
                    <div className="c-estado"><Tag estado={r.estado} lit={litId === r.id} /></div>
                    <div className="bbx-row-act">
                      {r.estado === "pendente" && (
                        <button className="bbx-btn bbx-btn-primary bbx-btn-sm" type="button" onClick={(e) => { e.stopPropagation(); approve(r.id); }}>Aprovar peça</button>
                      )}
                      {r.estado === "rascunho" && (
                        <button className="bbx-btn bbx-btn-secondary bbx-btn-sm" type="button" onClick={(e) => { e.stopPropagation(); sendForApproval(r.id); }}>Enviar para aprovação</button>
                      )}
                      {r.estado === "atraso" && (
                        <button className="bbx-btn bbx-btn-secondary bbx-btn-sm" type="button" onClick={(e) => e.stopPropagation()}>Rever peça</button>
                      )}
                    </div>
                  </div>
                ))}
                {shown.length === 0 && (
                  <div className="bbx-empty">
                    <h3 className="bbx-h3">Nenhuma peça neste filtro</h3>
                    <p className="bbx-muted">Escolhe "Todas" para voltar a ver as peças de abril.</p>
                    <button className="bbx-btn bbx-btn-secondary bbx-btn-sm" onClick={() => setFilter("todas")}>Ver todas</button>
                  </div>
                )}
              </div>
              <div style={{ padding: "0 22px 18px" }}>
                <button className="bbx-btn bbx-btn-ghost bbx-btn-sm" type="button" onClick={() => { setRows(INITIAL_ROWS); setLitId(null); setFilter("todas"); }}>Repor o exemplo</button>
              </div>
            </div>
          </div>
        </section>

        {/* ---------------- componentes ---------------- */}
        <section>
          <div className="bbx-block-head">
            <h2 className="bbx-h2">Componentes</h2>
            <p className="bbx-sub">Botões, campos, estados e avisos, incluindo foco (usa a tecla Tab), desativado, a carregar e erro.</p>
          </div>
          <div className="bbx-grid">
            <div className="bbx-folha bbx-pad" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <h3 className="bbx-h3">Botões</h3>
              <div className="bbx-demo">
                <button className="bbx-btn bbx-btn-primary" type="button">Aprovar peça</button>
                <button className="bbx-btn bbx-btn-secondary" type="button">Guardar rascunho</button>
                <button className="bbx-btn bbx-btn-ghost" type="button">Cancelar</button>
                <button className="bbx-btn bbx-btn-danger" type="button">Apagar contrato</button>
              </div>
              <div className="bbx-demo">
                <button className="bbx-btn bbx-btn-primary" type="button" disabled>Aprovar peça</button>
                <button className="bbx-btn bbx-btn-primary" type="button" onClick={fakeSave} disabled={saving}>
                  {saving && <span className="bbx-spin" />} {saving ? "A guardar…" : "Guardar alterações"}
                </button>
              </div>
              <p className="bbx-hint">Roxo só para ações que decidem ou avançam. O resto é contorno ou texto.</p>
            </div>

            <div className="bbx-folha bbx-pad" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <h3 className="bbx-h3">Campos</h3>
              <div className="bbx-field">
                <label className="bbx-label" htmlFor="c-nome">Nome do contacto</label>
                <input id="c-nome" className="bbx-input" defaultValue="Marta Ferreira" />
              </div>
              <div className="bbx-field">
                <label className="bbx-label" htmlFor="c-mail">Email</label>
                <input id="c-mail" className="bbx-input" defaultValue="marta.ferreira" aria-invalid="true" aria-describedby="c-mail-erro" />
                <div className="bbx-erro-msg" id="c-mail-erro"><AlertCircle size={16} /> O email precisa de @ e de um domínio, por exemplo marta@clinica.pt.</div>
              </div>
              <div className="bbx-field">
                <label className="bbx-label" htmlFor="c-off">Origem</label>
                <input id="c-off" className="bbx-input" defaultValue="Landing page" disabled />
              </div>
              <label className="bbx-check"><input type="checkbox" defaultChecked /> Consentimento para receber WhatsApp</label>
            </div>

            <div className="bbx-folha bbx-pad" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <h3 className="bbx-h3">Estados</h3>
              <div className="bbx-demo">
                <Tag estado="rascunho" /><Tag estado="pendente" /><Tag estado="aprovado" /><Tag estado="atraso" /><Tag estado="erro" />
              </div>
              <div className="bbx-aviso bbx-aviso-ok"><CheckCircle2 size={18} /> Contrato enviado para marta@clinica.pt.</div>
              <div className="bbx-aviso bbx-aviso-erro"><AlertCircle size={18} /> Não foi possível enviar o email. Confirma o endereço e tenta outra vez.</div>
            </div>

            <div className="bbx-folha" style={{ display: "flex" }}>
              <div className="bbx-empty">
                <h3 className="bbx-h3">Ainda não há contratos</h3>
                <p className="bbx-muted">Cria o primeiro contrato para o enviares a um cliente assinar.</p>
                <button className="bbx-btn bbx-btn-primary" type="button">Novo contrato</button>
              </div>
            </div>
          </div>
        </section>

        {/* ---------------- documento ---------------- */}
        <section>
          <div className="bbx-block-head">
            <h2 className="bbx-h2">Documento e assinatura</h2>
            <p className="bbx-sub">Os documentos são a única coisa centrada. As marcas de corte nos cantos só aparecem aqui e no item aberto de uma lista.</p>
          </div>
          <div className="bbx-doc-mesa">
            <div className="bbx-doc">
              <span className="bbx-cm tl" /><span className="bbx-cm tr" /><span className="bbx-cm bl" /><span className="bbx-cm br" />
              <h3 className="bbx-h1">Contrato de prestação de serviços</h3>
              <p>Entre a agência Empower Boss e a Clínica Aurora, acordam-se a gestão das redes sociais e o acompanhamento mensal dos resultados.</p>
              <p className="bbx-muted">Cláusula 1.ª. O prestador publica doze peças por mês, aprovadas previamente pelo cliente na plataforma.</p>
              <div className="bbx-sig">
                <div>Pela agência</div>
                <div>Pelo cliente</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 6, flexWrap: "wrap" }}>
                <button className="bbx-btn bbx-btn-primary" type="button" onClick={() => setSigned(true)} disabled={signed}>{signed ? "Contrato assinado" : "Assinar contrato"}</button>
                {signed && (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 10, color: "#1F7A4D", fontWeight: 700 }}>
                    <span className="bbx-seal bbx-seal-lg lit" style={{ background: "#B0820D" }} aria-hidden="true" /> Assinado pela agência
                  </span>
                )}
                {signed && <button className="bbx-btn bbx-btn-ghost bbx-btn-sm" type="button" onClick={() => setSigned(false)}>Repor o exemplo</button>}
              </div>
            </div>
          </div>
        </section>

        {/* ---------------- cores ---------------- */}
        <section>
          <div className="bbx-block-head">
            <h2 className="bbx-h2">Cores</h2>
            <p className="bbx-sub">Valores lidos do tema ativo neste momento.</p>
          </div>
          <div className="bbx-grid">
            {SWATCHES.map(([name, token, note]) => (
              <div className="bbx-folha bbx-swatch" key={token}>
                <i style={{ background: `var(${token})` }} />
                <div><b>{name}</b><span>{cssVar(token)}</span><br /><span>{note}</span></div>
              </div>
            ))}
          </div>
        </section>

        <section>
          <div className="bbx-block-head">
            <h2 className="bbx-h2">Contraste medido</h2>
            <p className="bbx-sub">Texto precisa de 4,5 ou mais; componentes e marcas de 3 ou mais (WCAG AA). Muda o tema em cima para medir os dois.</p>
          </div>
          <div className="bbx-folha bbx-pad" style={{ overflowX: "auto" }}>
            <table className="bbx-contrast">
              <thead><tr><th>Par</th><th>Razão</th><th>Mínimo</th><th>Resultado</th></tr></thead>
              <tbody>
                {contrastRows.map((r) => {
                  const ok = r.value != null && r.value >= r.min;
                  return (
                    <tr key={r.label}>
                      <td>{r.label}</td>
                      <td>{r.value == null ? "n/d" : `${r.value.toFixed(2)} : 1`}</td>
                      <td>{r.min} : 1</td>
                      <td className={ok ? "bbx-pass" : "bbx-fail"}>{ok ? "Passa" : "Falha"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* ---------------- tipografia ---------------- */}
        <section>
          <div className="bbx-block-head">
            <h2 className="bbx-h2">Tipografia</h2>
            <p className="bbx-sub">Bodoni Moda nos títulos, Marcellus nos subtítulos e Quicksand no corpo.</p>
          </div>
          <div className="bbx-folha bbx-pad" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ fontFamily: "var(--bb-font-titulo)", fontVariationSettings: "var(--bb-titulo-vs)", fontWeight: 800, fontSize: 44, lineHeight: 1.08, letterSpacing: "-0.02em" }}>Contas e contratos, 1.240,50 €</div>
            <div className="bbx-h1">Conteúdos de abril</div>
            <div className="bbx-h2">Ficha do contacto</div>
            <div style={{ fontFamily: "var(--bb-font-sub)", fontSize: 24, color: "var(--bb-tinta-2)" }}>Marcas e clientes ativos</div>
            <div className="bbx-sub">Três peças à espera da tua aprovação</div>
            <p style={{ maxWidth: "62ch" }}>
              Os clientes entram de vez em quando para aprovar conteúdos, ver faturas e ler contratos. A equipa usa a aplicação o dia todo, por isso o texto tem de ser confortável de ler durante horas. Ação: 25 de setembro, 09h30.
            </p>
            <p className="bbx-label">Etiqueta em negrito, 13,5 px: Nome do contacto, telefone, email e origem.</p>
            <p className="bbx-muted bbx-small">Texto de apoio, 13,5 px: última atualização ontem, por Ana Silva.</p>
          </div>
        </section>
      </div>
    </div>
  );
}
