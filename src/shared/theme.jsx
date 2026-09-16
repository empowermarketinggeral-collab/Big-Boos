/* ---------------------------------------------------------
   TOKENS E PRIMITIVOS PARTILHADOS — Big Boss + EMPOWER OS
   ---------------------------------------------------------
   Extraído de BigBossPrototype.jsx para que módulos novos
   (src/modules/**) possam reutilizar o design system sem criar
   uma dependência circular com o ficheiro principal (que, por sua
   vez, importa esses módulos para os renderizar).
--------------------------------------------------------- */
import { X } from "lucide-react";

export const c = {
  ink: "#17151F",
  sidebarBg: "#FFFFFF",
  boss: "#7C4DE0",
  bossDeep: "#5E35C4",
  bossSoft: "#F1ECFC",
  paper: "#F6F5FA",
  mist: "#6E6980",
  mistLight: "#9691A6",
  line: "#EAE7F1",
  sage: "#2F9E63",
  amber: "#C9821F",
  rose: "#D3455B",
};

export const serif = { fontFamily: "'Fraunces', serif" };
export const sans = { fontFamily: "'Inter', sans-serif" };

export const CAN_MANAGE_ROLES = ["admin_geral", "membro", "agencia_admin", "agencia_membro"];

export function StatusDot({ status }) {
  const map = { green: c.sage, yellow: c.amber, red: c.rose };
  return (
    <span
      style={{
        width: 7,
        height: 7,
        borderRadius: 999,
        background: map[status] || c.mist,
        display: "inline-block",
      }}
    />
  );
}

export function Eyebrow({ children }) {
  return (
    <div
      style={{
        ...sans,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        color: c.boss,
        marginBottom: 8,
      }}
    >
      {children}
    </div>
  );
}

export const inputStyle = { ...sans, width: "100%", fontSize: 13, border: `1px solid ${c.line}`, borderRadius: 8, padding: "9px 12px", outline: "none", color: c.ink };
export const btnPrimary = { ...sans, display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 600, color: "#fff", background: c.boss, border: "none", borderRadius: 8, padding: "9px 16px", cursor: "pointer" };
export const btnGhost = { ...sans, display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: c.mist, background: "none", border: `1px solid ${c.line}`, borderRadius: 8, padding: "9px 14px", cursor: "pointer" };

export function Modal({ title, onClose, children, width = 420 }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(23,21,31,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60, padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 16, padding: 24, width: "100%", maxWidth: width, maxHeight: "85vh", overflowY: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
          <div style={{ ...serif, fontSize: 17, color: c.ink }}>{title}</div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: c.mist, padding: 4 }}>
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// Personalização partilhada das páginas públicas (Formulários,
// Agendamento — Link na Bio tem a sua própria, mais antiga, dentro
// de BigBossPrototype.jsx). As mesmas 5 fontes já carregadas no
// index.html via Google Fonts.
export const PAGE_FONT_OPTIONS = [
  { key: "Inter", label: "Inter — moderna" },
  { key: "Fraunces", label: "Fraunces — serifada" },
  { key: "Poppins", label: "Poppins — arredondada" },
  { key: "Playfair Display", label: "Playfair Display — elegante" },
  { key: "Montserrat", label: "Montserrat — geométrica" },
];
export const PAGE_COLOR_SWATCHES = ["#7C4DE0", "#1C1526", "#2F9E63", "#C9821F", "#D3455B", "#3B5FC2"];
export const DEFAULT_PAGE_STYLE = { accentColor: "#7C4DE0", font: "Inter", logoUrl: "" };

export function ChartCard({ title, sub, right, children }) {
  return (
    <div style={{ background: "#fff", border: `1px solid ${c.line}`, borderRadius: 14, padding: 22 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 18 }}>
        <div>
          <div style={{ ...serif, fontSize: 15.5, color: c.ink, marginBottom: 4 }}>{title}</div>
          <div style={{ ...sans, fontSize: 11.5, color: c.mist }}>{sub}</div>
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}
