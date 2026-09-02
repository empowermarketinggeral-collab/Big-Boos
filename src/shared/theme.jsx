/* ---------------------------------------------------------
   TOKENS E PRIMITIVOS PARTILHADOS — Big Boss + EMPOWER OS
   ---------------------------------------------------------
   Extraído de BigBossPrototype.jsx para que módulos novos
   (src/modules/**) possam reutilizar o design system sem criar
   uma dependência circular com o ficheiro principal (que, por sua
   vez, importa esses módulos para os renderizar).
--------------------------------------------------------- */

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
