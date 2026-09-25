import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase, invokeFunction } from "../../lib/supabaseClient.js";
import { c, sans } from "../../shared/theme.jsx";
import { AlertTriangle } from "lucide-react";

/* ---------------------------------------------------------
   AVISO DE PAGAMENTO EM ATRASO — barra fixa no topo de toda a app,
   quando a subscrição (da marca do cliente, ou da própria agência)
   fica com status='past_due' no Stripe. Sem bloqueio automático de
   acesso — é só aviso, quem decide cortar acesso continua a ser a
   equipa, à mão.

   Contagem: 7 dias desde que entrou em atraso (past_due_since) para
   um aviso "amarelo/urgente", depois mais 3 dias com aviso mais forte
   ("a conta pode ser desativada"). Não há imposição automática no fim
   disso — é só escalar visualmente.

   Cobertura atual: cliente (aprovador_marca/agencia_aprovador) vê o
   estado da SUA marca (a primeira de brand_ids); equipa de agência vê
   o estado da SUA PRÓPRIA agência. Não agrega ainda "alguma das
   marcas que giro está em atraso" — fica para depois, se fizer falta.
--------------------------------------------------------- */

const CLIENT_ROLES = ["aprovador_marca", "agencia_aprovador"];

function useMySubscription(session) {
  const isClient = CLIENT_ROLES.includes(session?.role);
  const brandId = isClient ? session?.brand_ids?.[0] : null;

  return useQuery({
    queryKey: ["payment_reminder_subscription", session?.role, brandId, session?.agency_id],
    enabled: !!session,
    queryFn: async () => {
      if (isClient) {
        if (!brandId) return null;
        const { data, error } = await supabase.from("subscriptions").select("status, past_due_since").eq("brand_id", brandId).maybeSingle();
        if (error) throw error;
        return data ? { ...data, ownerType: "brand", ownerId: brandId } : null;
      }
      let agencyId = session.agency_id;
      if (!agencyId) {
        const { data: rootAgency } = await supabase.from("agencies").select("id").eq("is_root", true).maybeSingle();
        agencyId = rootAgency?.id;
      }
      if (!agencyId) return null;
      const { data, error } = await supabase.from("subscriptions").select("status, past_due_since").eq("agency_id", agencyId).maybeSingle();
      if (error) throw error;
      return data ? { ...data, ownerType: "agency", ownerId: agencyId } : null;
    },
  });
}

function usePortal(ownerType, ownerId) {
  return useMutation({
    mutationFn: async () => {
      const key = ownerType === "brand" ? "brandId" : "agencyId";
      return invokeFunction("stripe-portal", { [key]: ownerId, returnUrl: window.location.href });
    },
  });
}

export default function PaymentReminderBanner({ session }) {
  const subQuery = useMySubscription(session);
  const sub = subQuery.data;
  const portal = usePortal(sub?.ownerType, sub?.ownerId);
  const [dismissed, setDismissed] = useState(false);

  if (!sub || sub.status !== "past_due" || !sub.past_due_since || dismissed) return null;

  const daysSince = Math.floor((Date.now() - new Date(sub.past_due_since).getTime()) / 86400000);
  const escalated = daysSince > 7;
  const daysLeft = Math.max(0, escalated ? 10 - daysSince : 7 - daysSince);

  const goPay = async () => {
    try {
      const result = await portal.mutateAsync();
      window.location.href = result.url;
    } catch {
      // silencioso — o botão fica disponível para tentar de novo
    }
  };

  return (
    <div style={{ background: escalated ? c.roseSolid : c.amberSolid, color: "#fff", padding: "10px 20px", display: "flex", alignItems: "center", justifyContent: "center", gap: 12, flexWrap: "wrap" }}>
      <div style={{ ...sans, fontSize: 14, fontWeight: 600, display: "flex", alignItems: "center", gap: 8, textAlign: "center" }}>
        <AlertTriangle size={15} />
        {escalated
          ? `Pagamento em atraso — a conta pode ser desativada nos próximos ${daysLeft} dia(s). Regulariza já.`
          : `Pagamento necessário nos próximos ${daysLeft} dia(s) para manteres o acesso.`}
      </div>
      <button onClick={goPay} disabled={portal.isPending} style={{ ...sans, fontSize: 13.5, fontWeight: 700, color: escalated ? c.rose : c.amber, background: c.folha, border: "none", borderRadius: 7, padding: "6px 14px", cursor: "pointer" }}>
        {portal.isPending ? "A abrir…" : "Pagar agora"}
      </button>
      <button onClick={() => setDismissed(true)} style={{ ...sans, fontSize: 12.5, color: "rgba(255,255,255,0.85)", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>
        Dispensar por agora
      </button>
    </div>
  );
}
