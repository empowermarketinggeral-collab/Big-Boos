import { Sun, Moon, Monitor } from "lucide-react";
import { c } from "../shared/theme.jsx";
import { setThemePref, useThemePref } from "./theme.js";

/* Escolha do tema: claro, escuro ou o do sistema. Fica na barra de topo (visível também no telemóvel). */
const OPTIONS = [
  { k: "light", label: "Claro", Icon: Sun },
  { k: "dark", label: "Escuro", Icon: Moon },
  { k: "system", label: "Igual ao sistema", Icon: Monitor },
];

export default function ThemeToggle({ compact = false }) {
  const pref = useThemePref();
  const size = compact ? 28 : 32;
  return (
    <div role="group" aria-label="Tema" style={{ display: "inline-flex", border: `1px solid ${c.line}`, borderRadius: 999, background: c.folha, padding: 2, gap: 2 }}>
      {OPTIONS.map(({ k, label, Icon }) => (
        <button
          key={k}
          type="button"
          onClick={() => setThemePref(k)}
          aria-pressed={pref === k}
          aria-label={label}
          title={label}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center", width: size, height: size, borderRadius: 999,
            border: "none", cursor: "pointer", padding: 0,
            background: pref === k ? c.boss : "transparent", color: pref === k ? c.onBoss : c.mist,
          }}
        >
          <Icon size={14} />
        </button>
      ))}
    </div>
  );
}
