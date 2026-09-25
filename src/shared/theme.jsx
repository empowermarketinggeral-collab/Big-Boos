/* ---------------------------------------------------------
   TOKENS E PRIMITIVOS PARTILHADOS — Big Boss by Empower Boss
   ---------------------------------------------------------
   As cores são variáveis CSS (src/design/tokens.css), por isso mudam
   sozinhas entre claro e escuro: nunca escrevas hex nos módulos.
   - c.boss é o roxo para FUNDOS (texto branco por cima);
     c.bossText é o roxo para TEXTO e ícones sobre a folha.
   - c.roseSolid / c.sageSolid são para fundos cheios com texto branco;
     c.rose / c.sage são para texto e contornos.
   - c.folha é onde está o conteúdo; c.paper é a mesa (fundo da app).
   Tipografia: display = títulos (Bodoni Moda), serif = subtítulos e
   títulos de cartões (Marcellus), sans = corpo (Quicksand).
--------------------------------------------------------- */
import { X } from "lucide-react";

export const c = {
  ink: "var(--bb-tinta)",
  mist: "var(--bb-tinta-2)",
  mistLight: "var(--bb-tinta-3)",
  line: "var(--bb-linha)",
  lineStrong: "var(--bb-campo-borda)",
  paper: "var(--bb-mesa)",
  folha: "var(--bb-folha)",
  folha2: "var(--bb-folha-2)",
  sidebarBg: "var(--bb-regua)",
  boss: "var(--bb-boss)",
  bossText: "var(--bb-boss-texto)",
  bossDeep: "var(--bb-boss-hover)",
  bossSoft: "var(--bb-boss-suave)",
  onBoss: "var(--bb-sobre-boss)",
  gold: "var(--bb-dourado)",
  sage: "var(--bb-verde)",
  sageSolid: "var(--bb-verde-solido)",
  sageSoft: "var(--bb-verde-suave)",
  amber: "var(--bb-aviso)",
  amberSoft: "var(--bb-aviso-suave)",
  amberSolid: "var(--bb-aviso-solido)",
  info: "var(--bb-info)",
  infoSoft: "var(--bb-info-suave)",
  rose: "var(--bb-erro)",
  roseSolid: "var(--bb-erro-solido)",
  roseSoft: "var(--bb-erro-suave)",
};

export const display = {
  fontFamily: "var(--bb-font-titulo)",
  fontVariationSettings: "var(--bb-titulo-vs)",
  fontWeight: 700,
  letterSpacing: "-0.01em",
};
export const serif = { fontFamily: "var(--bb-font-sub)" };
export const sans = { fontFamily: "var(--bb-font-corpo)" };

export const CAN_MANAGE_ROLES = ["admin_geral", "membro", "agencia_admin", "agencia_membro"];

export function StatusDot({ status }) {
  const map = { green: c.sage, yellow: c.amber, red: c.rose };
  return (
    <span
      style={{
        width: 8,
        height: 8,
        borderRadius: 999,
        background: map[status] || c.mist,
        display: "inline-block",
      }}
    />
  );
}

// O desenho novo não usa etiquetas por cima dos títulos: o título já diz onde estás.
// Fica exportado para os módulos que ainda o importam, mas não desenha nada.
export function Eyebrow() {
  return null;
}

export const inputStyle = {
  ...sans,
  width: "100%",
  fontSize: 14.5,
  fontWeight: 500,
  border: `1px solid ${c.lineStrong}`,
  borderRadius: 6,
  padding: "9px 12px",
  minHeight: 40,
  outline: "none",
  color: c.ink,
  background: c.folha,
};
export const btnPrimary = {
  ...sans,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  fontSize: 14,
  fontWeight: 700,
  color: c.onBoss,
  background: c.boss,
  border: "none",
  borderRadius: 6,
  padding: "9px 18px",
  minHeight: 40,
  cursor: "pointer",
};
export const btnGhost = {
  ...sans,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  fontSize: 14,
  fontWeight: 700,
  color: c.ink,
  background: "none",
  border: `1px solid ${c.lineStrong}`,
  borderRadius: 6,
  padding: "9px 16px",
  minHeight: 40,
  cursor: "pointer",
};

export function Modal({ title, onClose, children, width = 420 }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(8,5,14,0.62)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60, padding: 20 }}>
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={typeof title === "string" ? title : undefined}
        style={{ background: c.folha, color: c.ink, border: `1px solid ${c.line}`, borderRadius: 3, padding: 24, width: "100%", maxWidth: width, maxHeight: "85vh", overflowY: "auto" }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
          <div style={{ ...serif, fontSize: 20, color: c.ink }}>{title}</div>
          <button onClick={onClose} aria-label="Fechar" style={{ background: "none", border: "none", cursor: "pointer", color: c.mist, padding: 4 }}>
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// Personalização partilhada das páginas públicas de cada marca (Formulários,
// Agendamento; o Link na Bio tem a sua, mais antiga, dentro de BigBossPrototype.jsx).
// São as fontes que cada marca pode escolher para a sua página.
export const PAGE_FONT_OPTIONS = [
  { key: "Inter", label: "Inter — moderna" },
  { key: "Fraunces", label: "Fraunces — serifada" },
  { key: "Poppins", label: "Poppins — arredondada" },
  { key: "Playfair Display", label: "Playfair Display — elegante" },
  { key: "Montserrat", label: "Montserrat — geométrica" },
];
export const PAGE_COLOR_SWATCHES = ["#7C52A8", "#30154C", "#1F7A4D", "#B0820D", "#B3261E", "#3B5FC2"];
export const DEFAULT_PAGE_STYLE = { accentColor: "#7C52A8", font: "Inter", logoUrl: "" };

export function ChartCard({ title, sub, right, children }) {
  return (
    <div style={{ background: c.folha, border: `1px solid ${c.line}`, borderRadius: 3, padding: 22 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 18 }}>
        <div>
          <div style={{ ...serif, fontSize: 17, color: c.ink, marginBottom: 4 }}>{title}</div>
          <div style={{ ...sans, fontSize: 13.5, color: c.mist }}>{sub}</div>
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}
