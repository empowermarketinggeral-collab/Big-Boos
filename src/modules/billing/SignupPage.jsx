import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase, invokeFunction } from "../../lib/supabaseClient.js";
import { c, sans, serif, display } from "../../shared/theme.jsx";
import { Check, ArrowLeft, MessageCircle } from "lucide-react";
import BrandLogo from "../../design/BrandLogo.jsx";

/* ---------------------------------------------------------
   REGISTO PÚBLICO DE AGÊNCIA — /registar. Só para agências novas
   (Starter/Growth/Enterprise) — uma marca/cliente nunca se regista
   sozinha, pertence sempre a uma agência já criada dentro da app.
   Ver supabase/functions/agency-signup/index.ts.

   Fluxo: escolhe o plano → preenche conta → signUp() → a Edge
   Function agency-signup cria agencies+profiles e devolve o URL do
   Checkout do Stripe. Não depende de haver sessão logo a seguir ao
   signUp() (a confirmação de email pode atrasar isso).
--------------------------------------------------------- */

const FONTS_IMPORT = `* { box-sizing: border-box; }`;

const SALES_WHATSAPP = "351910199278";

function money(cents, currency = "EUR") {
  return new Intl.NumberFormat("pt-PT", { style: "currency", currency }).format((cents || 0) / 100);
}

function usePlans() {
  return useQuery({
    queryKey: ["plans", "agency", "public"],
    queryFn: async () => {
      const { data, error } = await supabase.from("plans").select("*").eq("status", "active").eq("scope", "agency").is("agency_id", null).order("price_cents");
      if (error) throw error;
      return data;
    },
  });
}

function PlanStep({ onPick }) {
  const plansQuery = usePlans();
  const salesLink = `https://wa.me/${SALES_WHATSAPP}?text=${encodeURIComponent("Olá! Tenho interesse no plano Enterprise do EMPOWER OS para a minha agência.")}`;

  return (
    <div style={{ width: "100%", maxWidth: 920 }}>
      <div style={{ textAlign: "center", marginBottom: 32 }}>
        <div style={{ ...display, fontSize: 30, color: c.ink, marginBottom: 8 }}>Escolhe o teu plano</div>
        <div style={{ ...sans, fontSize: 15, color: c.mist }}>Regista a tua agência no EMPOWER OS.</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
        {(plansQuery.data || []).map((plan) => (
          <div key={plan.id} style={{ background: c.folha, border: `1px solid ${c.line}`, borderRadius: 3, padding: 22, display: "flex", flexDirection: "column" }}>
            <div style={{ ...serif, fontSize: 19, color: c.ink, marginBottom: 6 }}>{plan.name}</div>
            <div style={{ ...sans, fontSize: 22, fontWeight: 700, color: c.ink, marginBottom: 14 }}>
              {plan.contact_sales ? <span style={{ fontSize: 17 }}>Personalizado</span> : <>{money(plan.price_cents, plan.currency)}<span style={{ fontSize: 13.5, fontWeight: 400, color: c.mist }}>/mês</span></>}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: 18, flex: 1 }}>
              {(plan.features || []).map((f) => (
                <div key={f} style={{ ...sans, fontSize: 14, color: c.mist, display: "flex", alignItems: "flex-start", gap: 7 }}>
                  <Check size={13} color={c.sage} style={{ flexShrink: 0, marginTop: 1 }} /> {f}
                </div>
              ))}
            </div>
            {plan.contact_sales ? (
              <a href={salesLink} target="_blank" rel="noreferrer" style={{ ...sans, fontSize: 14.5, fontWeight: 600, color: "#fff", background: c.boss, border: "none", borderRadius: 6, padding: "11px 16px", cursor: "pointer", textAlign: "center", textDecoration: "none", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                <MessageCircle size={14} /> Falar com vendedor
              </a>
            ) : (
              <button onClick={() => onPick(plan)} style={{ ...sans, fontSize: 14.5, fontWeight: 600, color: "#fff", background: c.boss, border: "none", borderRadius: 6, padding: "11px 16px", cursor: "pointer" }}>
                Escolher {plan.name}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function AccountStep({ plan, onBack }) {
  const [agencyName, setAgencyName] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const fieldStyle = { ...sans, width: "100%", fontSize: 15, border: `1px solid ${c.line}`, borderRadius: 6, padding: "10px 13px", outline: "none", color: c.ink };

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (!agencyName.trim() || !name.trim() || !email.trim() || password.length < 6) {
      setError("Preenche todos os campos — a password precisa de pelo menos 6 caracteres.");
      return;
    }
    setLoading(true);
    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { name: name.trim() }, emailRedirectTo: window.location.origin },
      });
      if (signUpError) throw signUpError;
      const userId = data.user?.id;
      if (!userId) throw new Error("Não foi possível criar a conta.");

      const result = await invokeFunction("agency-signup", {
        userId,
        email: email.trim(),
        name: name.trim(),
        agencyName: agencyName.trim(),
        planId: plan.id,
        successUrl: `${window.location.origin}/?registo=sucesso`,
        cancelUrl: window.location.origin + "/registar",
      });
      window.location.href = result.url;
    } catch (err) {
      setError(err.message || "Não foi possível concluir o registo.");
      setLoading(false);
    }
  };

  return (
    <div style={{ width: "100%", maxWidth: 420 }}>
      <button onClick={onBack} type="button" style={{ ...sans, display: "flex", alignItems: "center", gap: 6, fontSize: 14, color: c.mist, background: "none", border: "none", cursor: "pointer", marginBottom: 16 }}>
        <ArrowLeft size={14} /> Escolher outro plano
      </button>
      <form onSubmit={submit} style={{ background: c.folha, border: `1px solid ${c.line}`, borderRadius: 3, padding: 28 }}>
        <div style={{ ...serif, fontSize: 21, color: c.ink, marginBottom: 4 }}>Criar a tua agência</div>
        <div style={{ ...sans, fontSize: 14, color: c.mist, marginBottom: 22 }}>Plano {plan.name} — {plan.contact_sales ? "personalizado" : `${money(plan.price_cents, plan.currency)}/mês`}</div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <div style={{ ...sans, fontSize: 12.5, color: c.mist, marginBottom: 5 }}>Nome da agência</div>
            <input value={agencyName} onChange={(e) => setAgencyName(e.target.value)} placeholder="A tua agência" style={fieldStyle} />
          </div>
          <div>
            <div style={{ ...sans, fontSize: 12.5, color: c.mist, marginBottom: 5 }}>O teu nome</div>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome completo" style={fieldStyle} />
          </div>
          <div>
            <div style={{ ...sans, fontSize: 12.5, color: c.mist, marginBottom: 5 }}>Email</div>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@agencia.com" style={fieldStyle} />
          </div>
          <div>
            <div style={{ ...sans, fontSize: 12.5, color: c.mist, marginBottom: 5 }}>Password</div>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" style={fieldStyle} />
          </div>
        </div>

        {error && <div style={{ ...sans, fontSize: 14, color: c.rose, marginTop: 14 }}>{error}</div>}

        <button type="submit" disabled={loading} style={{ ...sans, width: "100%", fontSize: 15, fontWeight: 600, color: "#fff", background: c.boss, border: "none", borderRadius: 6, padding: "12px 16px", cursor: "pointer", marginTop: 20 }}>
          {loading ? "A criar…" : "Criar conta e continuar para pagamento"}
        </button>
      </form>
    </div>
  );
}

export default function SignupPage() {
  const [selectedPlan, setSelectedPlan] = useState(null);

  return (
    <div style={{ minHeight: "100vh", background: c.paper, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 20, ...sans }}>
      <style>{FONTS_IMPORT}</style>
      <BrandLogo variant="empilhado" height={130} style={{ marginBottom: 28 }} />

      {selectedPlan ? <AccountStep plan={selectedPlan} onBack={() => setSelectedPlan(null)} /> : <PlanStep onPick={setSelectedPlan} />}

      <a href="/" style={{ ...sans, fontSize: 13.5, color: c.mist, marginTop: 24, textDecoration: "none" }}>Já tens conta? Entrar</a>
    </div>
  );
}
