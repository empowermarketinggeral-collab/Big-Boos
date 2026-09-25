import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase, invokeFunction } from "../../lib/supabaseClient.js";
import { c, sans, serif, Eyebrow, btnPrimary, btnGhost, display } from "../../shared/theme.jsx";
import { CreditCard, Check, ExternalLink, MessageCircle } from "lucide-react";

/* ---------------------------------------------------------
   FATURAÇÃO DA AGÊNCIA — subscrição da própria agência (Starter/
   Growth/Enterprise), separada da subscrição de cada marca (ver
   BillingModule.jsx). Ver supabase/54_billing_plans_and_invoices.sql
   e supabase/55_billing_enterprise_plan.sql.
--------------------------------------------------------- */

const SUB_STATUS_LABEL = { trialing: "Em teste", active: "Ativa", past_due: "Pagamento em atraso", canceled: "Cancelada" };
const SUB_STATUS_COLOR = { trialing: c.amber, active: c.sage, past_due: c.rose, canceled: c.mist };

const SALES_WHATSAPP = "351910199278";

function money(cents, currency = "EUR") {
  return new Intl.NumberFormat("pt-PT", { style: "currency", currency }).format((cents || 0) / 100);
}

// Contas admin_geral (raiz da plataforma) muitas vezes não têm
// agency_id no perfil — nunca precisaram até agora. Mesmo fallback já
// usado nalgumas dezenas de sítios no BigBossPrototype.jsx
// (resolveDefaultAgencyId): sem agency_id próprio, usa a agência raiz
// (is_root = true).
function useAgencyId(session) {
  return useQuery({
    queryKey: ["default_agency_id", session.agency_id],
    queryFn: async () => {
      if (session.agency_id) return session.agency_id;
      const { data, error } = await supabase.from("agencies").select("id").eq("is_root", true).maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Não foi encontrada uma agência para associar — a tua conta não tem agência definida.");
      return data.id;
    },
  });
}

function usePlans() {
  return useQuery({
    queryKey: ["plans", "agency"],
    queryFn: async () => {
      const { data, error } = await supabase.from("plans").select("*").eq("status", "active").eq("scope", "agency").is("agency_id", null).order("price_cents");
      if (error) throw error;
      return data;
    },
  });
}

function useSubscription(agencyId) {
  return useQuery({
    queryKey: ["subscription", "agency", agencyId],
    enabled: !!agencyId,
    queryFn: async () => {
      const { data, error } = await supabase.from("subscriptions").select("*, plans(name, price_cents, currency, limits, features)").eq("agency_id", agencyId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

function useCheckout(agencyId) {
  return useMutation({
    mutationFn: async (planId) => {
      const currentUrl = window.location.href;
      return invokeFunction("stripe-checkout", { agencyId, planId, successUrl: currentUrl, cancelUrl: currentUrl });
    },
  });
}

function usePortal(agencyId) {
  return useMutation({
    mutationFn: async () => invokeFunction("stripe-portal", { agencyId, returnUrl: window.location.href }),
  });
}

export default function AgencyBillingModule({ session }) {
  const agencyIdQuery = useAgencyId(session);
  const agencyId = agencyIdQuery.data;
  const subQuery = useSubscription(agencyId);
  const plansQuery = usePlans();
  const checkout = useCheckout(agencyId);
  const portal = usePortal(agencyId);
  const [error, setError] = useState("");

  const sub = subQuery.data;
  const isActive = sub && (sub.status === "active" || sub.status === "trialing");

  const goCheckout = async (planId) => {
    setError("");
    try {
      const result = await checkout.mutateAsync(planId);
      window.location.href = result.url;
    } catch (err) {
      setError(err.message || "Não foi possível iniciar o checkout.");
    }
  };

  const goPortal = async () => {
    setError("");
    try {
      const result = await portal.mutateAsync();
      window.location.href = result.url;
    } catch (err) {
      setError(err.message || "Não foi possível abrir o portal.");
    }
  };

  const salesLink = `https://wa.me/${SALES_WHATSAPP}?text=${encodeURIComponent("Olá! Tenho interesse no plano Enterprise do EMPOWER OS para a minha agência.")}`;

  if (agencyIdQuery.isLoading) {
    return (
      <div className="bb-page" style={{ padding: "8px 40px 60px", maxWidth: 900 }}>
        <div style={{ ...sans, fontSize: 14.5, color: c.mist }}>A carregar…</div>
      </div>
    );
  }

  if (!agencyId) {
    return (
      <div className="bb-page" style={{ padding: "8px 40px 60px", maxWidth: 900 }}>
        <div style={{ ...sans, fontSize: 14.5, color: c.mist }}>
          {agencyIdQuery.error?.message || "Não foi encontrada nenhuma agência (nem raiz) para associar a esta conta."}
        </div>
      </div>
    );
  }

  return (
    <div className="bb-page" style={{ padding: "8px 40px 60px", maxWidth: 900 }}>
      <Eyebrow>Faturação</Eyebrow>
      <h1 style={{ ...display, fontSize: 24, color: c.ink, margin: "0 0 16px", display: "flex", alignItems: "center", gap: 10 }}>
        <CreditCard size={20} color={c.bossText} /> Subscrição da agência
      </h1>

      <div style={{ background: c.folha, border: `1px solid ${c.line}`, borderRadius: 3, padding: 20 }}>
        {isActive ? (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <div style={{ ...sans, fontSize: 15, fontWeight: 700, color: c.ink }}>{sub.plans?.name}</div>
              <span style={{ ...sans, fontSize: 12.5, fontWeight: 700, borderRadius: 999, padding: "3px 9px", color: SUB_STATUS_COLOR[sub.status], background: c.paper }}>
                {SUB_STATUS_LABEL[sub.status] || sub.status}
              </span>
            </div>
            <div style={{ ...sans, fontSize: 14, color: c.mist, marginBottom: 14 }}>
              {money(sub.plans?.price_cents, sub.plans?.currency)}/mês
              {sub.current_period_end && `, renova a ${new Date(sub.current_period_end).toLocaleDateString("pt-PT")}`}
            </div>
            <button onClick={goPortal} disabled={portal.isPending} style={{ ...btnGhost, display: "flex", alignItems: "center", gap: 6 }}>
              <ExternalLink size={13} /> {portal.isPending ? "A abrir…" : "Gerir subscrição"}
            </button>
          </div>
        ) : (
          <>
            {sub?.status === "canceled" && (
              <div style={{ ...sans, fontSize: 14, color: c.rose, marginBottom: 14 }}>A subscrição anterior foi cancelada. Escolhe um plano para reativar.</div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
              {(plansQuery.data || []).map((plan) => (
                <div key={plan.id} style={{ border: `1px solid ${c.line}`, borderRadius: 3, padding: 16, display: "flex", flexDirection: "column" }}>
                  <div style={{ ...serif, fontSize: 16, color: c.ink, marginBottom: 4 }}>{plan.name}</div>
                  <div style={{ ...sans, fontSize: 18, fontWeight: 700, color: c.ink, marginBottom: 10 }}>
                    {plan.contact_sales ? <span style={{ fontSize: 15 }}>Personalizado</span> : <>{money(plan.price_cents, plan.currency)}<span style={{ fontSize: 12.5, fontWeight: 400, color: c.mist }}>/mês</span></>}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 14, flex: 1 }}>
                    {(plan.features || []).map((f) => (
                      <div key={f} style={{ ...sans, fontSize: 12.5, color: c.mist, display: "flex", alignItems: "center", gap: 6 }}>
                        <Check size={12} color={c.sage} /> {f}
                      </div>
                    ))}
                  </div>
                  {plan.contact_sales ? (
                    <a href={salesLink} target="_blank" rel="noreferrer" style={{ ...btnPrimary, width: "100%", justifyContent: "center", textDecoration: "none" }}>
                      <MessageCircle size={13} /> Falar com vendedor
                    </a>
                  ) : (
                    <button onClick={() => goCheckout(plan.id)} disabled={checkout.isPending} style={{ ...btnPrimary, width: "100%", justifyContent: "center" }}>
                      {checkout.isPending ? "A abrir…" : "Subscrever"}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
        {error && <div style={{ ...sans, fontSize: 14, color: c.rose, marginTop: 12 }}>{error}</div>}
      </div>
    </div>
  );
}
