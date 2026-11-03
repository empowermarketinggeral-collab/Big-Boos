import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabaseClient.js";
import { c, sans, serif, btnGhost } from "../../shared/theme.jsx";
import { Heart, CheckCircle2 } from "lucide-react";

/* ---------------------------------------------------------
   PROGRAMA DE INDICAÇÕES (ex: "Amigas Dreams") — painel da equipa.
   Ligar/desligar, quem indicou quem (referral_team_overview) e marcar
   os mimos usados (referral_reward_uses). O texto do programa vive em
   referral_programs.content (migração 99) e a cliente vê-o na app.
--------------------------------------------------------- */

const card = { background: c.folha, border: `1px solid ${c.line}`, borderRadius: 3, padding: 20 };
const hint = { ...sans, fontSize: 12.5, color: c.mist };
const dateShort = (iso) => new Date(iso).toLocaleDateString("pt-PT", { day: "numeric", month: "short", year: "numeric" }).replace(".", "");

function useProgram(brandId) {
  return useQuery({
    queryKey: ["referral_program", brandId],
    queryFn: async () => {
      const { data, error } = await supabase.from("referral_programs").select("brand_id, enabled, content").eq("brand_id", brandId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

function useOverview(brandId, enabled) {
  return useQuery({
    queryKey: ["referral_overview", brandId],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("referral_team_overview", { p_brand: brandId });
      if (error) throw error;
      return data || [];
    },
  });
}

export function ReferralSection({ brand }) {
  const qc = useQueryClient();
  const programQuery = useProgram(brand.id);
  const program = programQuery.data;
  const overviewQuery = useOverview(brand.id, !!program);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(null);

  const toggle = useMutation({
    mutationFn: async (value) => {
      const { error: err } = await supabase.from("referral_programs").update({ enabled: value, updated_at: new Date().toISOString() }).eq("brand_id", brand.id);
      if (err) throw err;
    },
    onSuccess: () => { setError(""); qc.invalidateQueries({ queryKey: ["referral_program", brand.id] }); },
    onError: (err) => setError(err.message || "Não foi possível guardar."),
  });

  const markUsed = useMutation({
    mutationFn: async ({ contactId, level, used }) => {
      const res = used
        ? await supabase.from("referral_reward_uses").delete().eq("contact_id", contactId).eq("level", level)
        : await supabase.from("referral_reward_uses").insert({ brand_id: brand.id, contact_id: contactId, level });
      if (res.error) throw res.error;
    },
    onSuccess: () => { setError(""); qc.invalidateQueries({ queryKey: ["referral_overview", brand.id] }); },
    onError: (err) => setError(err.message || "Não foi possível guardar."),
  });

  if (programQuery.isLoading) return null;
  if (!program) {
    return (
      <div style={card}>
        <div style={{ ...serif, fontSize: 15.5, color: c.ink, marginBottom: 4, display: "flex", alignItems: "center", gap: 7 }}>
          <Heart size={15} color={c.bossText} /> Programa de indicações
        </div>
        <div style={{ ...hint, lineHeight: 1.5 }}>Esta marca ainda não tem programa de indicações. Peça para o configurar (texto, mimos e regras).</div>
      </div>
    );
  }

  const content = program.content || {};
  const ladder = content.ladder || [];
  const rows = overviewQuery.data || [];

  return (
    <div style={card}>
      <div style={{ ...serif, fontSize: 15.5, color: c.ink, marginBottom: 4, display: "flex", alignItems: "center", gap: 7 }}>
        <Heart size={15} color={c.bossText} /> {content.title || "Programa de indicações"}
      </div>
      <div style={{ ...hint, marginBottom: 14, lineHeight: 1.5 }}>
        Na app, cada cliente envia às amigas uma mensagem com o link de marcação dela. A amiga fica ligada a quem a indicou quando marca pela primeira vez por esse link (ou quando preenche "Indicado por" na ficha do CRM). Conta quando faz o primeiro serviço{content.qualifyingCategory ? ` de ${String(content.qualifyingCategory).toLowerCase()}` : ""}, com a marcação concluída.
      </div>

      <label style={{ ...sans, fontSize: 14, color: c.ink, display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <input type="checkbox" checked={!!program.enabled} onChange={(e) => toggle.mutate(e.target.checked)} disabled={toggle.isPending} />
        Mostrar na app das clientes
      </label>

      {error && <div style={{ ...sans, fontSize: 13.5, color: c.rose, marginBottom: 10 }}>{error}</div>}

      <div style={{ ...sans, fontSize: 14, fontWeight: 700, color: c.ink, marginBottom: 8 }}>Quem já indicou</div>
      {overviewQuery.isLoading && <div style={hint}>A carregar…</div>}
      {overviewQuery.isError && <div style={{ ...sans, fontSize: 13.5, color: c.rose }}>{overviewQuery.error.message}</div>}
      {!overviewQuery.isLoading && !rows.length && <div style={hint}>Ainda ninguém indicou amigas.</div>}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {rows.map((r) => {
          const used = new Map((r.used || []).map((u) => [u.level, u.used_at]));
          const isOpen = open === r.id;
          return (
            <div key={r.id} style={{ background: c.paper, borderRadius: 6, padding: "10px 14px" }}>
              <button type="button" onClick={() => setOpen(isOpen ? null : r.id)} style={{ ...sans, width: "100%", background: "none", border: "none", padding: 0, cursor: "pointer", display: "flex", alignItems: "center", gap: 10, textAlign: "left", flexWrap: "wrap" }}>
                <span style={{ fontSize: 14.5, fontWeight: 600, color: c.ink, flex: 1, minWidth: 140 }}>{r.name}</span>
                <span style={{ fontSize: 13, color: c.ink }}>{r.qualified} amiga(s) contam</span>
                {r.pending > 0 && <span style={{ fontSize: 13, color: c.mist }}>{r.pending} por contar</span>}
              </button>

              {isOpen && (
                <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {(r.friends || []).map((f, i) => (
                      <div key={i} style={{ ...sans, fontSize: 13.5, color: c.ink }}>
                        {f.name}: {f.qualified_at ? `conta desde ${dateShort(f.qualified_at)}` : "ainda não fez o primeiro serviço"}
                      </div>
                    ))}
                  </div>
                  {ladder.map((step, i) => {
                    const level = i + 1;
                    if (r.qualified < level) return null;
                    if (step.permanent) {
                      return <div key={level} style={{ ...sans, fontSize: 13.5, color: c.sage, display: "flex", alignItems: "center", gap: 6 }}><CheckCircle2 size={14} /> {step.title}</div>;
                    }
                    const usedAt = used.get(level);
                    return (
                      <div key={level} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                        <span style={{ ...sans, fontSize: 13.5, color: c.ink, flex: 1, minWidth: 160 }}>{step.title}</span>
                        <button
                          type="button"
                          onClick={() => markUsed.mutate({ contactId: r.id, level, used: !!usedAt })}
                          disabled={markUsed.isPending}
                          style={{ ...btnGhost, padding: "5px 10px", fontSize: 13 }}
                        >
                          {usedAt ? `Usado a ${dateShort(usedAt)} (desfazer)` : "Marcar como usado"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
