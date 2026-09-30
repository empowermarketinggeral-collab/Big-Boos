import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase, invokeFunction } from "../../lib/supabaseClient.js";
import { c, sans, serif, inputStyle, btnPrimary, btnGhost } from "../../shared/theme.jsx";
import { RefreshCw } from "lucide-react";

/* ---------------------------------------------------------
   IMPORTAR DO GOHIGHLEVEL — Agendamento → Lista e importação.
   Liga a conta (ID da location + token da Private Integration, guardado
   no Vault pela função ghl-sync) e importa as marcações passadas e
   futuras, calendário a calendário, em blocos de um mês. Pode repetir-se:
   o que já foi importado só é atualizado (estado, hora, profissional).
--------------------------------------------------------- */

const card = { background: c.folha, border: `1px solid ${c.line}`, borderRadius: 3, padding: 20 };
const hint = { ...sans, fontSize: 12.5, color: c.mist };
const toInputDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function useGhlAccount(brandId) {
  return useQuery({
    queryKey: ["brand_ghl_accounts", brandId],
    enabled: !!brandId,
    queryFn: async () => {
      const { data, error } = await supabase.from("brand_ghl_accounts").select("location_id, last_import_at, connected_at").eq("brand_id", brandId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export default function GhlImportSection({ brand }) {
  const qc = useQueryClient();
  const accountQuery = useGhlAccount(brand.id);
  const account = accountQuery.data;
  const [locationId, setLocationId] = useState("");
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [calendars, setCalendars] = useState(null);
  const [picked, setPicked] = useState([]);
  const now = new Date();
  const [from, setFrom] = useState(toInputDate(new Date(now.getFullYear() - 2, now.getMonth(), 1)));
  const [to, setTo] = useState(toInputDate(new Date(now.getFullYear() + 1, now.getMonth(), now.getDate())));
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(null);
  const [result, setResult] = useState(null);

  const connect = useMutation({
    mutationFn: () => invokeFunction("ghl-sync", { action: "connect", brandId: brand.id, locationId: locationId.trim(), token: token.trim() }),
    onSuccess: () => { setToken(""); setError(""); qc.invalidateQueries({ queryKey: ["brand_ghl_accounts", brand.id] }); },
    onError: (err) => setError(err.message),
  });
  const disconnect = useMutation({
    mutationFn: () => invokeFunction("ghl-sync", { action: "disconnect", brandId: brand.id }),
    onSuccess: () => { setCalendars(null); qc.invalidateQueries({ queryKey: ["brand_ghl_accounts", brand.id] }); },
  });
  const loadCalendars = useMutation({
    mutationFn: () => invokeFunction("ghl-sync", { action: "calendars", brandId: brand.id }),
    onSuccess: (data) => { setError(""); setCalendars([{ id: "__all__", name: "Tudo: todos os calendários e todas as profissionais", active: true }, ...(data.calendars || [])]); setPicked(["__all__"]); },
    onError: (err) => setError(err.message),
  });

  const runImport = async () => {
    setError(""); setResult(null);
    const start = new Date(`${from}T00:00:00`);
    const end = new Date(`${to}T23:59:59`);
    if (!(end > start)) { setError("A data final tem de ser depois da inicial."); return; }
    const windows = [];
    for (let d = new Date(start); d < end; ) {
      const next = new Date(d.getFullYear(), d.getMonth() + 1, d.getDate());
      windows.push([new Date(d), next < end ? next : end]);
      d = next;
    }
    const total = { found: 0, created: 0, updated: 0, skipped: 0, contactsCreated: 0, servicesCreated: new Set(), errors: [] };
    // "Tudo" já inclui todos os calendários: não repete os outros.
    const cals = picked.includes("__all__") ? calendars.filter((x) => x.id === "__all__") : calendars.filter((x) => picked.includes(x.id));
    const steps = cals.length * windows.length;
    let done = 0;
    setRunning(true);
    try {
      for (const cal of cals) {
        for (const [a, b] of windows) {
          setProgress({ done, steps, label: `${cal.name}: ${a.toLocaleDateString("pt-PT", { month: "long", year: "numeric" })}` });
          try {
            const r = await invokeFunction("ghl-sync", { action: "import", brandId: brand.id, calendarId: cal.id, from: a.toISOString(), to: b.toISOString() });
            total.found += r.found || 0; total.created += r.created || 0; total.updated += r.updated || 0;
            total.skipped += r.skipped || 0; total.contactsCreated += r.contactsCreated || 0;
            (r.servicesCreated || []).forEach((s) => total.servicesCreated.add(s));
            total.errors.push(...(r.errors || []));
          } catch (err) {
            total.errors.push(`${cal.name}, ${a.toLocaleDateString("pt-PT")}: ${err.message}`);
          }
          done++;
        }
      }
    } finally {
      setRunning(false);
      setProgress(null);
      setResult({ ...total, servicesCreated: [...total.servicesCreated] });
      qc.invalidateQueries({ queryKey: ["booking_appointments", brand.id] });
      qc.invalidateQueries({ queryKey: ["brand_ghl_accounts", brand.id] });
    }
  };

  return (
    <div style={card}>
      <div style={{ ...serif, fontSize: 15.5, color: c.ink, marginBottom: 4 }}>GoHighLevel</div>
      <div style={{ ...hint, marginBottom: 14 }}>Traz as marcações antigas e futuras do GoHighLevel. Pode repetir-se sem duplicar.</div>

      {accountQuery.isLoading ? null : !account ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <label style={hint}>ID da conta (location)
            <input style={{ ...inputStyle, marginTop: 4 }} value={locationId} onChange={(e) => setLocationId(e.target.value)} placeholder="Ex: gBuzNW4lx…" />
          </label>
          <label style={hint}>Token da Private Integration
            <input type="password" style={{ ...inputStyle, marginTop: 4 }} value={token} onChange={(e) => setToken(e.target.value)} placeholder="pit-…" autoComplete="off" />
          </label>
          <div style={hint}>No GoHighLevel: Settings, Private Integrations, a tua integração. Precisa de acesso a calendários, eventos, contactos e utilizadores. O token fica guardado no cofre, nunca à vista.</div>
          {error && <div style={{ ...sans, fontSize: 14, color: c.rose }}>{error}</div>}
          <button onClick={() => connect.mutate()} disabled={connect.isPending || !locationId.trim() || !token.trim()} style={{ ...btnPrimary, width: "fit-content" }}>
            {connect.isPending ? "A ligar…" : "Ligar GoHighLevel"}
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ ...sans, fontSize: 13.5, color: c.ink }}>
            Ligado à conta <strong>{account.location_id}</strong>
            {account.last_import_at ? `. Última importação: ${new Date(account.last_import_at).toLocaleString("pt-PT", { dateStyle: "short", timeStyle: "short" })}` : ""}
          </div>
          <div style={{ ...hint, color: c.amber }}>
            Antes de importar: cria as profissionais e os serviços com os mesmos nomes do GoHighLevel (o serviço é reconhecido pelo nome do calendário), pausa as automações de "novo contacto" e desliga os lembretes do GoHighLevel, porque as marcações futuras passam a receber os lembretes daqui.
          </div>
          {!calendars ? (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button onClick={() => loadCalendars.mutate()} disabled={loadCalendars.isPending} style={{ ...btnGhost, padding: "7px 12px" }}>
                <RefreshCw size={12} /> {loadCalendars.isPending ? "A procurar calendários…" : "Escolher calendários"}
              </button>
              <button onClick={() => disconnect.mutate()} style={{ ...btnGhost, padding: "7px 12px", color: c.rose }}>Desligar</button>
            </div>
          ) : (
            <>
              <div>
                <div style={{ ...hint, marginBottom: 6 }}>Calendários a importar</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {calendars.map((cal) => (
                    <label key={cal.id} style={{ ...sans, fontSize: 14, color: c.ink, display: "flex", alignItems: "center", gap: 8 }}>
                      <input type="checkbox" checked={picked.includes(cal.id)} onChange={() => setPicked((p) => (p.includes(cal.id) ? p.filter((x) => x !== cal.id) : [...p, cal.id]))} />
                      {cal.id === "__all__" ? <strong>{cal.name}</strong> : cal.name}{cal.active ? "" : " (inativo)"}
                    </label>
                  ))}
                  {calendars.length <= 1 && <div style={hint}>Esta conta não tem calendários.</div>}
                  <div style={hint}>"Tudo" apanha também as marcações feitas diretamente no calendário de cada profissional.</div>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
                <label style={hint}>Desde<input type="date" style={{ ...inputStyle, marginTop: 4 }} value={from} onChange={(e) => setFrom(e.target.value)} /></label>
                <label style={hint}>Até<input type="date" style={{ ...inputStyle, marginTop: 4 }} value={to} onChange={(e) => setTo(e.target.value)} /></label>
              </div>
              {progress && (
                <div style={{ ...hint }}>
                  A importar {progress.label} ({progress.done + 1} de {progress.steps})
                  <div style={{ height: 4, borderRadius: 999, background: c.line, overflow: "hidden", marginTop: 6 }}>
                    <div style={{ height: "100%", width: `${(progress.done / Math.max(progress.steps, 1)) * 100}%`, background: c.boss }} />
                  </div>
                </div>
              )}
              {error && <div style={{ ...sans, fontSize: 14, color: c.rose }}>{error}</div>}
              <button onClick={runImport} disabled={running || !picked.length} style={{ ...btnPrimary, width: "fit-content" }}>
                {running ? "A importar…" : "Importar marcações"}
              </button>
            </>
          )}
          {result && (
            <div style={{ ...sans, fontSize: 13.5, color: c.ink, background: c.paper, borderRadius: 6, padding: "10px 12px", lineHeight: 1.6 }}>
              <div>{result.found} marcações encontradas: {result.created} novas, {result.updated} atualizadas{result.skipped ? `, ${result.skipped} ignoradas` : ""}.</div>
              <div>{result.contactsCreated} clientes novas criadas no CRM.</div>
              {result.servicesCreated.length > 0 && <div>Serviços criados (arquivados): {result.servicesCreated.join(", ")}.</div>}
              {result.errors.length > 0 && (
                <div style={{ color: c.rose, marginTop: 4 }}>
                  {result.errors.length} erros. {result.errors.slice(0, 5).join(" ")}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
