import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase, invokeFunction } from "../../lib/supabaseClient.js";
import { c } from "../../shared/theme.jsx";
import {
  Home, Package, CalendarDays, History, UserRound, CheckCircle2, LogOut, Trash2, Plus, ChevronRight, ChevronLeft,
  MessageCircle, AlertTriangle, Shield, ShieldAlert, Pencil, Clock, Sparkles, Bell, Smartphone,
} from "lucide-react";
import BookingFlow from "../booking/BookingFlow.jsx";
import { usePublicBookingPage, money, capitalize, brandThemeVars, brandStyle, T } from "../booking/publicBooking.js";

/* ---------------------------------------------------------
   APP DAS CLIENTES — /app/:slug (ex: Dreams Studio)
   A cliente final entra com email e palavra-passe (Supabase Auth, sem
   linha em profiles). A conta liga-se à ficha do CRM pelo email
   confirmado (client_portal_link) e tudo o que ela vê vem de
   client_portal_data — nunca lê tabelas diretamente.
   Separadores: Início, Packs, Marcações, Histórico, Perfil.
   Cores e letras são as da marca (tema em publicBooking.js); a página
   é sempre clara (bb-force-light). Tratamento formal ("o seu").
--------------------------------------------------------- */

const dateLong = (iso) => capitalize(new Date(iso).toLocaleDateString("pt-PT", { weekday: "long", day: "numeric", month: "long" }));
const timeShort = (iso) => new Date(iso).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" });
const dateShort = (iso) => new Date(iso).toLocaleDateString("pt-PT", { day: "numeric", month: "short", year: "numeric" }).replace(".", "");
const greeting = () => { const h = new Date().getHours(); return h < 12 ? "Bom dia" : h < 20 ? "Boa tarde" : "Boa noite"; };

const PAST_LABEL = { completed: "Realizada", confirmed: "Realizada", no_show: "Faltou", cancelled: "Cancelada" };

const AUTH_ERRORS = {
  "Invalid login credentials": "Email ou palavra-passe incorretos.",
  "Email not confirmed": "Ainda não confirmou o seu email. Veja a caixa de entrada (e o spam).",
  "User already registered": "Este email já tem conta. Entre com a sua palavra-passe.",
};
const authMessage = (err) => AUTH_ERRORS[err?.message] || (/password/i.test(err?.message || "") ? "A palavra-passe tem de ter pelo menos 6 caracteres." : err?.message || "Algo correu mal. Tente novamente.");

const LINK_ERRORS = {
  team_account: "Tem sessão iniciada com uma conta da equipa. Termine a sessão para entrar como cliente.",
  email_not_confirmed: "Confirme primeiro o seu email: enviámos-lhe um link.",
  app_disabled: "A app ainda não está disponível.",
  contact_already_linked: "A sua ficha já está ligada a outra conta. Fale connosco para resolvermos.",
};

const CARE_CATEGORIES = [
  { key: "allergies", label: "Alergias", icon: AlertTriangle },
  { key: "sensitivities", label: "Sensibilidades", icon: Shield },
  { key: "contraindications", label: "Contraindicações", icon: ShieldAlert },
];

// "Adicionar ao ecrã principal" com o nome, a cor e o ícone da marca.
function useBrandInstallable(brand, style) {
  useEffect(() => {
    if (!brand) return;
    const previousTitle = document.title;
    document.title = brand.name;
    const origin = window.location.origin;
    const logo = style.logoUrl || brand.logo_url;
    const manifest = {
      name: brand.name, short_name: brand.name.slice(0, 12),
      start_url: `${origin}/app/${brand.slug}`, scope: `${origin}/app/${brand.slug}`,
      display: "standalone", background_color: style.background || "white", theme_color: style.surface || style.accentColor,
      icons: [{ src: logo || `${origin}/icon-512.png`, sizes: "512x512", type: "image/png", purpose: "any" }],
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(manifest)], { type: "application/manifest+json" }));
    const swaps = [
      ['link[rel="manifest"]', "href", url],
      ['meta[name="apple-mobile-web-app-title"]', "content", brand.name],
      ['link[rel="apple-touch-icon"]', "href", logo],
      ['meta[name="theme-color"]', "content", style.surface || style.accentColor],
    ].map(([selector, attr, value]) => {
      const el = document.querySelector(selector);
      const previous = el?.getAttribute(attr);
      if (el && value) el.setAttribute(attr, value);
      return () => { if (el && previous) el.setAttribute(attr, previous); };
    });
    return () => { document.title = previousTitle; swaps.forEach((undo) => undo()); URL.revokeObjectURL(url); };
  }, [brand, style.logoUrl, style.accentColor, style.background, style.surface]);
}

function useSession() {
  const [state, setState] = useState({ loading: true, session: null, recovery: false });
  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => { if (active) setState((s) => ({ ...s, loading: false, session: data.session })); });
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      setState((s) => ({ loading: false, session, recovery: event === "PASSWORD_RECOVERY" ? true : event === "SIGNED_OUT" ? false : s.recovery }));
    });
    return () => { active = false; data.subscription.unsubscribe(); };
  }, []);
  return [state, (patch) => setState((s) => ({ ...s, ...patch }))];
}

/* ---------------------------------------------------------
   PEÇAS
--------------------------------------------------------- */
const card = { background: T.surface, border: `1px solid ${T.line}`, borderRadius: 16, padding: "18px 18px" };
const eyebrow = { ...T.body, fontSize: 12.5, fontWeight: 500, letterSpacing: "0.12em", textTransform: "uppercase", color: T.muted };
const linkBtn = { ...T.body, background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: 15, color: T.ink };

function Frame({ page, style, children, nav }) {
  const logo = style.logoUrl || page.brand.logo_url;
  return (
    <div className="bb-force-light" style={{ minHeight: "100dvh", ...brandThemeVars(page.brand.style), ...T.body }}>
      <header style={{ background: T.surface, borderBottom: `1px solid ${T.line}`, display: "flex", justifyContent: "center", alignItems: "center", height: 84, position: "sticky", top: 0, zIndex: 10 }}>
        {logo ? <img src={logo} alt={page.brand.name} style={{ maxHeight: 62, maxWidth: "70%", objectFit: "contain" }} /> : <span style={{ ...T.title, fontSize: 20, color: T.ink }}>{page.brand.name}</span>}
      </header>
      <main style={{ maxWidth: 520, margin: "0 auto", padding: `26px 16px ${nav ? 110 : 40}px`, boxSizing: "border-box" }}>{children}</main>
      {nav}
    </div>
  );
}

function PageTitle({ title, subtitle }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <h1 style={{ ...T.title, fontSize: 30, color: T.ink, margin: 0, lineHeight: 1.15 }}>{title}</h1>
      {subtitle && <div style={{ fontSize: 15, color: T.muted, marginTop: 6 }}>{subtitle}</div>}
    </div>
  );
}

function IconBox({ icon: Icon, size = 44 }) {
  return (
    <div style={{ width: size, height: size, borderRadius: 12, background: T.soft, color: T.muted, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      <Icon size={size * 0.42} strokeWidth={1.6} />
    </div>
  );
}

function EmptyState({ icon, title, hint }) {
  return (
    <div style={{ textAlign: "center", padding: "36px 12px", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
      <IconBox icon={icon} size={56} />
      <div style={{ fontSize: 15.5, color: T.ink }}>{title}</div>
      {hint && <div style={{ fontSize: 14, color: T.faint, marginTop: -6 }}>{hint}</div>}
    </div>
  );
}

function Badge({ children, strong }) {
  return (
    <span style={{ fontSize: 12.5, fontWeight: 500, padding: "3px 10px", borderRadius: 999, whiteSpace: "nowrap", background: strong ? T.accentSoft : T.soft, color: T.ink }}>
      {children}
    </span>
  );
}

function AccentButton({ children, style, ...props }) {
  return (
    <button
      type="button"
      style={{ ...T.body, width: "100%", fontSize: 16, fontWeight: 500, letterSpacing: "0.02em", color: T.onAccent, background: T.accent, border: "none", borderRadius: 12, padding: 14, minHeight: 50, cursor: "pointer", ...style }}
      {...props}
    >
      {children}
    </button>
  );
}

function RowButton({ icon: Icon, label, onClick, href, danger, filled }) {
  const style = {
    ...T.body, ...card, padding: "16px 18px", width: "100%", boxSizing: "border-box", display: "flex", alignItems: "center", gap: 12,
    cursor: "pointer", fontSize: 15.5, textAlign: "left", textDecoration: "none",
    color: danger ? c.rose : T.ink, background: filled ? c.roseSoft : T.surface,
    borderColor: filled ? `color-mix(in srgb, ${c.rose} 30%, transparent)` : T.line,
  };
  const inner = (
    <>
      {Icon && <Icon size={19} strokeWidth={1.7} />}
      <span style={{ flex: 1 }}>{label}</span>
      {!danger && <ChevronRight size={18} style={{ color: T.faint }} />}
    </>
  );
  return href ? <a href={href} target="_blank" rel="noreferrer" style={style}>{inner}</a> : <button type="button" onClick={onClick} style={style}>{inner}</button>;
}

function Field({ label, ...props }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 7 }}>
      <span style={eyebrow}>{label}</span>
      <input
        style={{ ...T.body, fontSize: 16, color: T.ink, background: T.surface, border: `1px solid ${T.line}`, borderRadius: 10, padding: "12px 14px", minHeight: 48, outline: "none" }}
        {...props}
      />
    </label>
  );
}

function BackLink({ onClick, children = "Voltar" }) {
  return (
    <button type="button" onClick={onClick} style={{ ...linkBtn, display: "flex", alignItems: "center", gap: 4, color: T.muted, fontSize: 14.5, marginBottom: 16 }}>
      <ChevronLeft size={17} /> {children}
    </button>
  );
}

/* ---------------------------------------------------------
   ENTRAR / CRIAR CONTA / RECUPERAR
--------------------------------------------------------- */
function AuthScreen({ page, style }) {
  const { brand } = page;
  const [mode, setMode] = useState("login");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const redirectTo = `${window.location.origin}/app/${brand.slug}`;
  const go = (m) => { setMode(m); setError(""); setNotice(""); };

  const submit = async (e) => {
    e.preventDefault();
    setError(""); setNotice("");
    if (!email.trim()) return setError("Indique o seu email.");
    setBusy(true);
    try {
      if (mode === "login") {
        const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (err) throw err;
      } else if (mode === "signup") {
        if (!name.trim()) throw new Error("Indique o seu nome.");
        if (phone.replace(/D/g, "").length < 9) throw new Error("Indique o seu telemóvel: é por ele que encontramos o seu histórico.");
        if (password.length < 6) throw new Error("A palavra-passe tem de ter pelo menos 6 caracteres.");
        const { data, error: err } = await supabase.auth.signUp({
          email: email.trim(), password,
          // app_brand: os modelos de email do Supabase usam-no para falar em nome
          // da marca (as contas da equipa não o têm e recebem o texto do Big Boss).
          options: { emailRedirectTo: redirectTo, data: { name: name.trim(), phone: phone.trim(), app_brand: brand.name } },
        });
        if (err) throw err;
        if (data.user && data.user.identities?.length === 0) {
          go("login");
          setNotice("Este email já tem conta. Entre com a sua palavra-passe, ou recupere-a.");
        } else if (!data.session) {
          setNotice(`Enviámos um email para ${email.trim()}. Abra o link para confirmar a conta e voltará aqui já com sessão iniciada.`);
        }
      } else {
        const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
        if (err) throw err;
        setNotice("Se este email tiver conta, recebe um link para escolher uma nova palavra-passe.");
      }
    } catch (err) {
      setError(authMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const titles = { login: "Entrar", signup: "Criar conta", forgot: "Recuperar palavra-passe" };

  return (
    <Frame page={page} style={style}>
      <PageTitle title={titles[mode]} subtitle={mode === "login" ? "As suas marcações, o seu histórico e os seus packs." : null} />
      <form onSubmit={submit} style={{ ...card, padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
        {mode === "signup" && (
          <>
            <Field label="Nome" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
            <Field label="Telemóvel" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="tel" placeholder="912 345 678" />
          </>
        )}
        <Field label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" inputMode="email" />
        {mode === "signup" && <div style={{ fontSize: 13.5, color: T.muted, marginTop: -8 }}>Se já é cliente, use o telemóvel que nos deu: assim vê o seu histórico.</div>}
        {mode !== "forgot" && (
          <Field label="Palavra-passe" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "login" ? "current-password" : "new-password"} />
        )}
        {error && <div style={{ fontSize: 14.5, color: c.rose }}>{error}</div>}
        {notice && <div style={{ fontSize: 14.5, color: T.ink, background: T.soft, borderRadius: 10, padding: "12px 14px", lineHeight: 1.5 }}>{notice}</div>}
        <AccentButton type="submit" disabled={busy}>
          {busy ? "Um momento…" : mode === "login" ? "Entrar" : mode === "signup" ? "Criar conta" : "Enviar link"}
        </AccentButton>
      </form>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "center", marginTop: 20 }}>
        {mode !== "signup" && <button type="button" onClick={() => go("signup")} style={linkBtn}>Ainda não tem conta? <u>Criar conta</u></button>}
        {mode !== "login" && <button type="button" onClick={() => go("login")} style={linkBtn}>Já tem conta? <u>Entrar</u></button>}
        {mode === "login" && <button type="button" onClick={() => go("forgot")} style={{ ...linkBtn, color: T.muted, fontSize: 14.5 }}>Esqueci-me da palavra-passe</button>}
        <a href={`/agendar/${brand.slug}`} style={{ fontSize: 14.5, color: T.muted, marginTop: 6 }}>Marcar sem conta</a>
      </div>
    </Frame>
  );
}

function NewPasswordScreen({ page, style, onDone }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const save = async (e) => {
    e.preventDefault();
    if (password.length < 6) return setError("A palavra-passe tem de ter pelo menos 6 caracteres.");
    setBusy(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (err) return setError(authMessage(err));
    onDone();
  };
  return (
    <Frame page={page} style={style}>
      <PageTitle title="Nova palavra-passe" />
      <form onSubmit={save} style={{ ...card, padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
        <Field label="Palavra-passe" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
        {error && <div style={{ fontSize: 14.5, color: c.rose }}>{error}</div>}
        <AccentButton type="submit" disabled={busy}>{busy ? "A guardar…" : "Guardar"}</AccentButton>
      </form>
    </Frame>
  );
}

/* ---------------------------------------------------------
   DADOS
--------------------------------------------------------- */
function usePortal(brandId, session, skipPhone) {
  return useQuery({
    queryKey: ["client_portal", brandId, session?.user?.id, skipPhone],
    enabled: !!brandId && !!session,
    retry: false,
    queryFn: async () => {
      const meta = session.user.user_metadata || {};
      const { error: linkError } = await supabase.rpc("client_portal_link", { p_brand: brandId, p_name: meta.name || null, p_phone: meta.phone || null, p_skip_phone: skipPhone });
      if (linkError?.message?.includes("phone_verification_required")) return { needsPhoneVerification: true };
      if (linkError) {
        const code = Object.keys(LINK_ERRORS).find((k) => linkError.message?.includes(k));
        throw new Error(code ? LINK_ERRORS[code] : linkError.message);
      }
      const { data, error } = await supabase.rpc("client_portal_data", { p_brand: brandId });
      if (error) throw error;
      return data;
    },
  });
}

const isUpcoming = (a) => new Date(a.ends_at).getTime() >= Date.now() && ["confirmed", "pending_payment"].includes(a.status);
const isPast = (a) => !isUpcoming(a) && (new Date(a.ends_at).getTime() < Date.now() || a.status === "cancelled");
const packState = (p) => {
  const left = p.sessions_total - p.sessions_used;
  if (p.expires_at && new Date(p.expires_at) < new Date()) return { left, active: false, label: "Expirado" };
  if (left <= 0) return { left, active: false, label: "Concluído" };
  return { left, active: true, label: "Ativo" };
};

/* ---------------------------------------------------------
   INÍCIO
--------------------------------------------------------- */
function NextAppointment({ a }) {
  return (
    <div style={card}>
      <div style={eyebrow}>A sua próxima marcação</div>
      <div style={{ ...T.title, fontSize: 22, color: T.ink, marginTop: 10 }}>{a.service}</div>
      <div style={{ fontSize: 15.5, color: T.ink, marginTop: 8, display: "flex", alignItems: "center", gap: 8 }}>
        <Clock size={16} strokeWidth={1.7} style={{ color: T.muted }} /> {dateLong(a.starts_at)}, às {timeShort(a.starts_at)}
      </div>
      {a.staff && <div style={{ fontSize: 14.5, color: T.muted, marginTop: 4, paddingLeft: 24 }}>Com {a.staff}</div>}
      {a.status === "pending_payment" && <div style={{ fontSize: 14, color: c.amber, marginTop: 10 }}>O sinal ainda não foi confirmado.</div>}
    </div>
  );
}

function Progress({ used, total }) {
  return (
    <div style={{ height: 6, background: T.soft, borderRadius: 3, marginTop: 14, overflow: "hidden" }}>
      <div style={{ height: "100%", width: `${Math.min(100, (used / total) * 100)}%`, background: T.accent }} />
    </div>
  );
}

function PackMini({ pack, onClick }) {
  const st = packState(pack);
  return (
    <button type="button" onClick={onClick} style={{ ...card, ...T.body, width: "100%", textAlign: "left", cursor: "pointer", color: T.ink }}>
      <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
        <IconBox icon={Package} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15.5, fontWeight: 500 }}>{pack.name}</div>
          <div style={{ fontSize: 14, color: T.muted, marginTop: 2 }}>{st.active ? `${st.left} ${st.left === 1 ? "sessão restante" : "sessões restantes"}` : st.label}</div>
        </div>
        <Badge>{pack.sessions_used}/{pack.sessions_total}</Badge>
      </div>
      <Progress used={pack.sessions_used} total={pack.sessions_total} />
    </button>
  );
}

function HomeTab({ page, style, data, go }) {
  const upcoming = data.appointments.filter(isUpcoming).reverse();
  const next = upcoming[0];
  const activePacks = data.packs.filter((p) => packState(p).active);
  const firstName = (data.contact?.name || "").split(" ")[0];
  const phoneDigits = String(style.contactPhone || "").replace(/\D/g, "");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ marginBottom: 4 }}>
        <div style={{ fontSize: 15.5, color: T.muted }}>{greeting()},</div>
        <div style={{ ...T.title, fontSize: 30, color: T.ink, marginTop: 2 }}>{firstName}</div>
      </div>

      {next ? <NextAppointment a={next} /> : (
        <div style={card}>
          <div style={{ fontSize: 16, color: T.ink }}>Não tem marcações futuras de momento.</div>
          <div style={{ fontSize: 14, color: T.faint, marginTop: 6 }}>Quando agendar, verá aqui os detalhes.</div>
        </div>
      )}
      <AccentButton onClick={() => go("appointments", "book")}>Marcar</AccentButton>

      {data.packs.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ fontSize: 16, fontWeight: 500, color: T.ink }}>Os seus packs</div>
            <button type="button" onClick={() => go("packs")} style={{ ...linkBtn, fontSize: 14, color: T.muted, display: "flex", alignItems: "center", gap: 2 }}>Ver todos <ChevronRight size={15} /></button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {(activePacks.length ? activePacks : data.packs.slice(0, 1)).slice(0, 2).map((p) => <PackMini key={p.id} pack={p} onClick={() => go("packs")} />)}
          </div>
        </div>
      )}

      {phoneDigits && (
        <div style={{ marginTop: 8 }}>
          <RowButton icon={MessageCircle} label={`Falar com o ${page.brand.name}`} href={`https://wa.me/${phoneDigits}`} />
        </div>
      )}

      <div style={{ textAlign: "center", marginTop: 34 }}>
        <div style={{ ...T.title, fontSize: 20, color: T.faint }}>{page.brand.name}</div>
        {style.tagline && <div style={{ ...eyebrow, color: T.faint, fontSize: 11.5, letterSpacing: "0.2em", marginTop: 6 }}>{style.tagline}</div>}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------
   PACKS
--------------------------------------------------------- */
function PackCard({ pack }) {
  const st = packState(pack);
  return (
    <div style={card}>
      <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
        <IconBox icon={Sparkles} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 500, color: T.ink }}>{pack.name}</div>
          {pack.description && <div style={{ fontSize: 14, color: T.muted, marginTop: 3, lineHeight: 1.45 }}>{pack.description}</div>}
        </div>
        <Badge strong={st.active}>{st.label}</Badge>
      </div>
      <Progress used={pack.sessions_used} total={pack.sessions_total} />
      <div style={{ display: "flex", gap: 22, marginTop: 14 }}>
        {[["Utilizadas", pack.sessions_used], ["Restantes", Math.max(st.left, 0)], ["Total", pack.sessions_total]].map(([l, v]) => (
          <div key={l}>
            <div style={{ fontSize: 13.5, color: T.muted }}>{l}</div>
            <div style={{ fontSize: 16, color: T.ink, fontWeight: 500 }}>{v}</div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 13.5, color: T.faint, marginTop: 12 }}>
        {pack.expires_at ? `Válido até ${dateShort(pack.expires_at)}` : "Sem prazo de validade"}
      </div>
    </div>
  );
}

function PacksTab({ page, data }) {
  const [buying, setBuying] = useState(null);
  const [error, setError] = useState("");
  const active = data.packs.filter((p) => packState(p).active);
  const finished = data.packs.filter((p) => !packState(p).active);
  const serviceName = (id) => page.services.find((s) => s.id === id)?.name;

  const buy = async (packId) => {
    setError(""); setBuying(packId);
    try {
      const base = `${window.location.origin}/app/${page.brand.slug}`;
      const result = await invokeFunction("pack-checkout", { brandId: page.brand.id, packId, successUrl: `${base}?pago=1&tab=packs`, cancelUrl: `${base}?tab=packs` });
      window.location.href = result.paymentUrl;
    } catch (err) {
      setError(err.message);
      setBuying(null);
    }
  };

  return (
    <div>
      <PageTitle title="Os meus packs" subtitle="Acompanhe as suas sessões com clareza" />
      {!data.packs.length && <EmptyState icon={Package} title="Ainda não tem packs." hint={page.packs.length ? "Veja abaixo os packs disponíveis." : null} />}
      {active.length > 0 && (
        <div style={{ marginBottom: 26 }}>
          <div style={{ ...eyebrow, marginBottom: 10 }}>Ativos</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>{active.map((p) => <PackCard key={p.id} pack={p} />)}</div>
        </div>
      )}
      {finished.length > 0 && (
        <div style={{ marginBottom: 26 }}>
          <div style={{ ...eyebrow, marginBottom: 10 }}>Terminados</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, opacity: 0.75 }}>{finished.map((p) => <PackCard key={p.id} pack={p} />)}</div>
        </div>
      )}
      {page.packs.length > 0 && (
        <div>
          <div style={{ ...eyebrow, marginBottom: 10 }}>Disponíveis</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {page.packs.map((p) => {
              const names = (p.service_ids || []).map(serviceName).filter(Boolean);
              return (
                <div key={p.id} style={card}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
                    <div style={{ fontSize: 16, fontWeight: 500, color: T.ink }}>{p.name}</div>
                    <div style={{ fontSize: 17, fontWeight: 500, color: T.ink, whiteSpace: "nowrap" }}>{money(p.price)}</div>
                  </div>
                  <div style={{ fontSize: 14, color: T.muted, marginTop: 6, lineHeight: 1.5 }}>
                    {p.sessions_count} sessões{names.length ? ` de ${names.join(", ")}` : ""}{p.validity_days ? `, válido ${p.validity_days} dias após a compra` : ""}.
                  </div>
                  {p.description && <div style={{ fontSize: 14.5, color: T.ink, marginTop: 8, lineHeight: 1.5 }}>{p.description}</div>}
                  {page.online_payments ? (
                    <AccentButton onClick={() => buy(p.id)} disabled={!!buying} style={{ marginTop: 14 }}>{buying === p.id ? "A abrir o pagamento…" : "Comprar"}</AccentButton>
                  ) : (
                    <div style={{ fontSize: 14, color: T.faint, marginTop: 12 }}>Para adquirir este pack, fale connosco na sua próxima visita.</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
      {error && <div style={{ fontSize: 14.5, color: c.rose, marginTop: 12 }}>{error}</div>}
    </div>
  );
}

/* ---------------------------------------------------------
   MARCAÇÕES
--------------------------------------------------------- */
function AppointmentCard({ a }) {
  const upcoming = isUpcoming(a);
  const status = upcoming ? (a.status === "pending_payment" ? "Sinal por pagar" : "Confirmada") : PAST_LABEL[a.status] || a.status;
  return (
    <div style={{ ...card, display: "flex", gap: 14 }}>
      <div style={{ width: 50, flexShrink: 0, textAlign: "center", background: T.soft, borderRadius: 12, padding: "8px 0", alignSelf: "flex-start" }}>
        <div style={{ fontSize: 20, fontWeight: 500, color: T.ink, lineHeight: 1.1 }}>{new Date(a.starts_at).getDate()}</div>
        <div style={{ fontSize: 12.5, color: T.muted }}>{capitalize(new Date(a.starts_at).toLocaleDateString("pt-PT", { month: "short" }).replace(".", ""))}</div>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
          <div style={{ fontSize: 16, fontWeight: 500, color: T.ink }}>{a.service}</div>
          <Badge strong={upcoming}>{status}</Badge>
        </div>
        <div style={{ fontSize: 14, color: T.muted, marginTop: 4 }}>
          {timeShort(a.starts_at)}{a.staff ? `, com ${a.staff}` : ""}
          {a.upsells?.length ? `. Extras: ${a.upsells.map((u) => u.name).join(", ")}` : ""}
        </div>
        {(a.paid_with_pack || a.deposit_status === "paid") && (
          <div style={{ fontSize: 13.5, color: T.faint, marginTop: 4 }}>{a.paid_with_pack ? "Com pack" : `Sinal pago ${money(a.deposit_amount)}`}</div>
        )}
      </div>
    </div>
  );
}

function AppointmentsTab({ page, data, mode, setMode, onBooked }) {
  const [tab, setTab] = useState("upcoming");
  const [booked, setBooked] = useState(null);
  const upcoming = data.appointments.filter(isUpcoming).reverse();
  const past = data.appointments.filter(isPast);
  const list = tab === "upcoming" ? upcoming : past;

  if (mode === "book") {
    return (
      <div>
        <BackLink onClick={() => { setMode(null); setBooked(null); }}>As minhas marcações</BackLink>
        <PageTitle title="Nova marcação" />
        <div style={{ ...card, padding: "20px 16px" }}>
          {booked ? (
            <div style={{ textAlign: "center", padding: "14px 0" }}>
              <CheckCircle2 size={36} strokeWidth={1.6} style={{ color: T.accent, marginBottom: 10 }} />
              <div style={{ ...T.title, fontSize: 24, color: T.ink, marginBottom: 6 }}>Marcação confirmada</div>
              <div style={{ fontSize: 15.5, color: T.muted }}>{booked.serviceName}, {dateLong(booked.startsAt)}, às {timeShort(booked.startsAt)}</div>
              {booked.withPack && <div style={{ fontSize: 14.5, color: T.muted, marginTop: 4 }}>Foi usada uma sessão do seu pack.</div>}
              <AccentButton onClick={() => { setBooked(null); setMode(null); }} style={{ marginTop: 20 }}>Ver as minhas marcações</AccentButton>
            </div>
          ) : (
            <BookingFlow page={page} client={data} returnUrl={`${window.location.origin}/app/${page.brand.slug}?tab=appointments`} onBooked={(b) => { setBooked(b); onBooked(); }} />
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageTitle title="As minhas marcações" subtitle="O seu calendário de cuidado" />
      <button
        type="button"
        onClick={() => setMode("book")}
        style={{ ...T.body, width: "100%", display: "flex", alignItems: "center", gap: 10, background: T.accent, color: T.onAccent, border: "none", borderRadius: 14, padding: "16px 18px", cursor: "pointer", fontSize: 16, fontWeight: 500 }}
      >
        <Plus size={19} /> <span style={{ flex: 1, textAlign: "left" }}>Nova marcação</span> <span style={{ fontSize: 14, opacity: 0.8 }}>Agendar</span>
      </button>
      <div style={{ display: "flex", background: T.soft, borderRadius: 12, padding: 4, margin: "18px 0" }}>
        {[["upcoming", "Próximas"], ["past", "Anteriores"]].map(([key, lbl]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            style={{ ...T.body, flex: 1, border: "none", borderRadius: 9, padding: "9px 0", cursor: "pointer", fontSize: 14.5, fontWeight: tab === key ? 500 : 400, background: tab === key ? T.surface : "transparent", color: tab === key ? T.ink : T.muted }}
          >
            {lbl}
          </button>
        ))}
      </div>
      {list.length ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{list.map((a) => <AppointmentCard key={a.id} a={a} />)}</div>
      ) : (
        <EmptyState icon={CalendarDays} title={tab === "upcoming" ? "Não tem marcações futuras." : "Ainda não tem marcações anteriores."} hint={tab === "upcoming" ? "Use o botão acima para agendar." : null} />
      )}
    </div>
  );
}

/* ---------------------------------------------------------
   HISTÓRICO
--------------------------------------------------------- */
function HistoryTab({ data }) {
  const done = data.appointments.filter((a) => isPast(a) && (a.status === "completed" || a.status === "confirmed"));
  const recs = Object.fromEntries((data.recommendations || []).map((r) => [r.service, r.text]));
  const [open, setOpen] = useState(null);

  return (
    <div>
      <PageTitle title="O meu histórico" subtitle="O seu registo de cuidado ajuda-nos a cuidar de si com mais precisão" />
      {done.length ? (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 18 }}>
            <div style={card}>
              <div style={{ fontSize: 26, fontWeight: 500, color: T.ink }}>{done.length}</div>
              <div style={{ fontSize: 14, color: T.muted }}>{done.length === 1 ? "tratamento realizado" : "tratamentos realizados"}</div>
            </div>
            <div style={card}>
              <div style={{ fontSize: 16, fontWeight: 500, color: T.ink, marginTop: 6 }}>{dateShort(done[done.length - 1].starts_at)}</div>
              <div style={{ fontSize: 14, color: T.muted, marginTop: 4 }}>cliente desde</div>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {done.map((a) => {
              const rec = recs[a.service];
              const isOpen = open === a.id;
              return (
                <div key={a.id} style={card}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 500, color: T.ink }}>{a.service}</div>
                      <div style={{ fontSize: 14, color: T.muted, marginTop: 3 }}>{dateShort(a.starts_at)}{a.staff ? `, com ${a.staff}` : ""}</div>
                    </div>
                    {a.category && <Badge>{a.category}</Badge>}
                  </div>
                  {rec && (
                    <>
                      <button type="button" onClick={() => setOpen(isOpen ? null : a.id)} style={{ ...linkBtn, fontSize: 14, color: T.muted, marginTop: 10, display: "flex", alignItems: "center", gap: 4 }}>
                        Recomendações de cuidado <ChevronRight size={15} style={{ transform: isOpen ? "rotate(90deg)" : "none" }} />
                      </button>
                      {isOpen && <div style={{ fontSize: 14.5, color: T.ink, background: T.soft, borderRadius: 10, padding: "12px 14px", marginTop: 8, lineHeight: 1.55, whiteSpace: "pre-line" }}>{rec}</div>}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <EmptyState icon={Clock} title="O seu histórico de tratamentos aparecerá aqui." />
      )}
    </div>
  );
}

/* ---------------------------------------------------------
   PERFIL
--------------------------------------------------------- */
function CareNoteCard({ brandId, category, note, onSaved }) {
  const { label, icon: Icon } = category;
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(note?.client_text || "");
  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("client_portal_save_note", { p_brand: brandId, p_category: category.key, p_text: text });
      if (error) throw error;
    },
    onSuccess: () => { setEditing(false); onSaved(); },
  });
  const box = { borderRadius: 12, padding: "12px 14px" };
  const small = { ...eyebrow, fontSize: 11.5, letterSpacing: "0.1em" };
  const empty = { fontSize: 15, color: T.faint, fontStyle: "italic", marginTop: 6 };

  return (
    <div style={card}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 16, fontWeight: 500, color: T.ink, marginBottom: 12 }}>
        <Icon size={17} strokeWidth={1.7} /> {label}
      </div>
      <div style={{ ...box, background: T.soft }}>
        <div style={small}>Informação registada pela equipa</div>
        {note?.team_text ? <div style={{ fontSize: 15, color: T.ink, marginTop: 6, whiteSpace: "pre-line" }}>{note.team_text}</div> : <div style={empty}>Sem informação registada pela equipa</div>}
      </div>
      <div style={{ ...box, border: `1px solid ${T.line}`, marginTop: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <div style={small}>Informação adicionada por si</div>
          {!editing && (
            <button type="button" onClick={() => { setText(note?.client_text || ""); setEditing(true); }} style={{ ...linkBtn, fontSize: 13.5, color: T.muted, display: "flex", alignItems: "center", gap: 4 }}>
              <Pencil size={13} /> Editar
            </button>
          )}
        </div>
        {editing ? (
          <>
            <textarea
              rows={3}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={`Descreva as suas ${label.toLowerCase()}`}
              style={{ ...T.body, width: "100%", boxSizing: "border-box", marginTop: 8, fontSize: 15.5, color: T.ink, background: T.surface, border: `1px solid ${T.line}`, borderRadius: 10, padding: "10px 12px", outline: "none", resize: "vertical" }}
            />
            {save.isError && <div style={{ fontSize: 14, color: c.rose, marginTop: 6 }}>Não foi possível guardar.</div>}
            <div style={{ display: "flex", gap: 14, marginTop: 10, alignItems: "center" }}>
              <button type="button" onClick={() => save.mutate()} disabled={save.isPending} style={{ ...T.body, fontSize: 14.5, fontWeight: 500, color: T.onAccent, background: T.accent, border: "none", borderRadius: 10, padding: "9px 18px", cursor: "pointer" }}>
                {save.isPending ? "A guardar…" : "Guardar"}
              </button>
              <button type="button" onClick={() => setEditing(false)} style={{ ...linkBtn, fontSize: 14.5, color: T.muted }}>Cancelar</button>
            </div>
          </>
        ) : note?.client_text ? (
          <div style={{ fontSize: 15, color: T.ink, marginTop: 6, whiteSpace: "pre-line" }}>{note.client_text}</div>
        ) : (
          <div style={empty}>Ainda não adicionou informação</div>
        )}
      </div>
    </div>
  );
}

function Toggle({ label, checked, onChange, disabled }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 0", borderTop: `1px solid ${T.line}`, cursor: "pointer" }}>
      <div style={{ flex: 1, fontSize: 15.5, color: T.ink }}>{label}</div>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} style={{ width: 22, height: 22, accentColor: "var(--app-accent)" }} />
    </label>
  );
}

function NotificationsView({ brandId, contact, onBack, onSaved }) {
  const save = useMutation({
    mutationFn: async (patch) => {
      const next = { whatsapp: contact.opted_in_whatsapp, sms: contact.opted_in_sms, email: contact.opted_in_email, ...patch };
      const { error } = await supabase.rpc("client_portal_set_consent", { p_brand: brandId, p_whatsapp: next.whatsapp, p_sms: next.sms, p_email: next.email });
      if (error) throw error;
    },
    onSuccess: onSaved,
  });
  return (
    <div>
      <BackLink onClick={onBack}>Perfil</BackLink>
      <PageTitle title="Notificações" subtitle="Escolha por onde quer receber novidades e ofertas." />
      <div style={{ ...card, paddingTop: 4, paddingBottom: 4 }}>
        <Toggle label="WhatsApp" checked={contact.opted_in_whatsapp} disabled={save.isPending} onChange={(v) => save.mutate({ whatsapp: v })} />
        <Toggle label="SMS" checked={contact.opted_in_sms} disabled={save.isPending} onChange={(v) => save.mutate({ sms: v })} />
        <Toggle label="Email" checked={contact.opted_in_email} disabled={save.isPending} onChange={(v) => save.mutate({ email: v })} />
      </div>
      <div style={{ fontSize: 13.5, color: T.muted, marginTop: 12, lineHeight: 1.5 }}>A confirmação e os lembretes das suas marcações são sempre enviados.</div>
    </div>
  );
}

function RecommendationsView({ data, onBack }) {
  const recs = data.recommendations || [];
  return (
    <div>
      <BackLink onClick={onBack}>Perfil</BackLink>
      <PageTitle title="Recomendações de cuidado" subtitle="Para os tratamentos que já fez connosco." />
      {recs.length ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {recs.map((r) => (
            <div key={r.service} style={card}>
              <div style={{ fontSize: 16, fontWeight: 500, color: T.ink }}>{r.service}</div>
              <div style={{ fontSize: 15, color: T.ink, marginTop: 8, lineHeight: 1.55, whiteSpace: "pre-line" }}>{r.text}</div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState icon={Sparkles} title="Ainda não há recomendações." hint="Aparecem aqui depois dos seus tratamentos." />
      )}
    </div>
  );
}

function InstallView({ onBack }) {
  return (
    <div>
      <BackLink onClick={onBack}>Perfil</BackLink>
      <PageTitle title="Ter a app no telemóvel" />
      <div style={{ ...card, fontSize: 15.5, color: T.ink, lineHeight: 1.7 }}>
        <div><strong style={{ fontWeight: 500 }}>iPhone:</strong> no Safari, toque em Partilhar e depois em "Adicionar ao ecrã principal".</div>
        <div style={{ marginTop: 10 }}><strong style={{ fontWeight: 500 }}>Android:</strong> no Chrome, abra o menu e toque em "Instalar app" ou "Adicionar ao ecrã principal".</div>
      </div>
    </div>
  );
}

function ProfileTab({ page, data, email, sub, setSub, refresh }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const del = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("client_portal_delete_account");
      if (error) throw error;
      await supabase.auth.signOut();
    },
    onError: (err) => setDeleteError(err.message),
  });
  const notes = Object.fromEntries((data.careNotes || []).map((n) => [n.category, n]));

  if (sub === "notifications") return <NotificationsView brandId={page.brand.id} contact={data.contact} onBack={() => setSub(null)} onSaved={refresh} />;
  if (sub === "recommendations") return <RecommendationsView data={data} onBack={() => setSub(null)} />;
  if (sub === "install") return <InstallView onBack={() => setSub(null)} />;

  const initial = (data.contact?.name || email || "?").trim().charAt(0).toUpperCase();
  return (
    <div>
      <PageTitle title="O meu perfil" />
      <div style={{ ...card, display: "flex", alignItems: "center", gap: 16 }}>
        <div style={{ width: 60, height: 60, borderRadius: "50%", background: T.accent, color: T.onAccent, display: "flex", alignItems: "center", justifyContent: "center", ...T.title, fontSize: 24, flexShrink: 0 }}>{initial}</div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 17, fontWeight: 500, color: T.ink }}>{data.contact?.name}</div>
          <div style={{ fontSize: 14, color: T.muted, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis" }}>{email}</div>
          {data.contact?.phone && <div style={{ fontSize: 14, color: T.muted }}>{data.contact.phone}</div>}
        </div>
      </div>

      <div style={{ margin: "28px 0 14px" }}>
        <div style={{ fontSize: 17, fontWeight: 500, color: T.ink }}>As minhas notas de cuidado</div>
        <div style={{ fontSize: 14, color: T.muted, marginTop: 4, lineHeight: 1.5 }}>Informação privada, partilhada apenas com a equipa {page.brand.name} para garantir o melhor cuidado.</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {CARE_CATEGORIES.map((cat) => <CareNoteCard key={cat.key} brandId={page.brand.id} category={cat} note={notes[cat.key]} onSaved={refresh} />)}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 28 }}>
        <RowButton icon={Bell} label="Notificações" onClick={() => setSub("notifications")} />
        <RowButton icon={Sparkles} label="Recomendações de cuidado" onClick={() => setSub("recommendations")} />
        <RowButton icon={Smartphone} label="Ter a app no telemóvel" onClick={() => setSub("install")} />
        <RowButton icon={LogOut} label="Terminar sessão" danger onClick={() => supabase.auth.signOut()} />
        {confirmDelete ? (
          <div style={{ ...card, background: c.roseSoft, borderColor: `color-mix(in srgb, ${c.rose} 30%, transparent)` }}>
            <div style={{ fontSize: 15, color: T.ink, lineHeight: 1.5 }}>Eliminar a sua conta de acesso? Deixa de conseguir entrar na app. O seu histórico de tratamentos fica guardado connosco.</div>
            {deleteError && <div style={{ fontSize: 14, color: c.rose, marginTop: 8 }}>{deleteError}</div>}
            <div style={{ display: "flex", gap: 16, marginTop: 14, alignItems: "center" }}>
              <button type="button" onClick={() => del.mutate()} disabled={del.isPending} style={{ ...T.body, fontSize: 15, fontWeight: 500, color: c.onBoss, background: c.roseSolid, border: "none", borderRadius: 10, padding: "10px 18px", cursor: "pointer" }}>
                {del.isPending ? "A eliminar…" : "Eliminar conta"}
              </button>
              <button type="button" onClick={() => setConfirmDelete(false)} style={{ ...linkBtn, color: T.muted }}>Cancelar</button>
            </div>
          </div>
        ) : (
          <RowButton icon={Trash2} label="Eliminar conta" danger filled onClick={() => setConfirmDelete(true)} />
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------
   JÁ É CLIENTE? — confirma o telemóvel por SMS para ligar à ficha
--------------------------------------------------------- */
function PhoneVerifyScreen({ page, style, onLinked, onSkip }) {
  const [sentTo, setSentTo] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const call = async (payload) => {
    setError(""); setBusy(true);
    try {
      return await invokeFunction("client-phone-verify", { brandId: page.brand.id, ...payload });
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setBusy(false);
    }
  };
  const send = async () => { const r = await call({ action: "send" }); if (r?.linked) onLinked(); else if (r?.sentTo) setSentTo(r.sentTo); };
  const verify = async (e) => { e.preventDefault(); const r = await call({ action: "verify", code }); if (r?.linked) onLinked(); };

  return (
    <Frame page={page} style={style}>
      <PageTitle title="Já é nossa cliente" subtitle="Encontrámos uma ficha com o seu telemóvel. Confirme que é seu para ver o seu histórico e os seus packs." />
      <div style={{ ...card, padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
        {!sentTo ? (
          <AccentButton onClick={send} disabled={busy}>{busy ? "A enviar…" : "Enviar código por SMS"}</AccentButton>
        ) : (
          <form onSubmit={verify} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ fontSize: 15, color: T.ink }}>Enviámos um código para {sentTo}.</div>
            <Field label="Código" value={code} onChange={(e) => setCode(e.target.value.replace(/D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" />
            <AccentButton type="submit" disabled={busy || code.length !== 6}>{busy ? "A confirmar…" : "Confirmar"}</AccentButton>
            <button type="button" onClick={send} disabled={busy} style={{ ...linkBtn, color: T.muted, fontSize: 14.5 }}>Enviar outro código</button>
          </form>
        )}
        {error && <div style={{ fontSize: 14.5, color: c.rose }}>{error}</div>}
      </div>
      <div style={{ textAlign: "center", marginTop: 20 }}>
        <button type="button" onClick={onSkip} style={{ ...linkBtn, color: T.muted, fontSize: 14.5 }}>Este número não é meu, continuar sem histórico</button>
      </div>
    </Frame>
  );
}

/* ---------------------------------------------------------
   DENTRO DA APP
--------------------------------------------------------- */
const TABS = [
  { key: "home", label: "Início", icon: Home },
  { key: "packs", label: "Packs", icon: Package },
  { key: "appointments", label: "Marcações", icon: CalendarDays },
  { key: "history", label: "Histórico", icon: History },
  { key: "profile", label: "Perfil", icon: UserRound },
];

function BottomNav({ tab, onChange }) {
  return (
    <nav style={{ position: "fixed", left: 0, right: 0, bottom: 0, background: T.surface, borderTop: `1px solid ${T.line}`, paddingBottom: "env(safe-area-inset-bottom)", zIndex: 20 }}>
      <div style={{ display: "flex", maxWidth: 520, margin: "0 auto" }}>
        {TABS.map(({ key, label, icon: Icon }) => {
          const on = tab === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onChange(key)}
              style={{ ...T.body, flex: 1, background: "none", border: "none", cursor: "pointer", padding: "10px 0 9px", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, color: on ? T.ink : T.faint, fontSize: 12.5, fontWeight: on ? 500 : 400 }}
            >
              <Icon size={21} strokeWidth={on ? 2 : 1.6} />
              {label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function Portal({ page, style, session }) {
  const qc = useQueryClient();
  const params = new URLSearchParams(window.location.search);
  const [tab, setTabState] = useState(TABS.some((t) => t.key === params.get("tab")) ? params.get("tab") : "home");
  const [sub, setSub] = useState(null);
  const [paidNotice, setPaidNotice] = useState(params.has("pago"));
  const [skipPhone, setSkipPhone] = useState(false);
  const portalQuery = usePortal(page.brand.id, session, skipPhone);
  const refresh = () => qc.invalidateQueries({ queryKey: ["client_portal"] });
  const go = (key, subView = null) => { setTabState(key); setSub(subView); };

  // Depois de pagar no Stripe, o webhook pode demorar uns segundos.
  useEffect(() => {
    if (!paidNotice) return;
    window.history.replaceState(null, "", window.location.pathname);
    const timers = [2500, 6000, 12000].map((ms) => setTimeout(() => qc.invalidateQueries({ queryKey: ["client_portal"] }), ms));
    return () => timers.forEach(clearTimeout);
  }, [paidNotice, qc]);

  useEffect(() => { window.scrollTo(0, 0); }, [tab, sub]);

  if (portalQuery.isLoading) return <Frame page={page} style={style}><div style={{ color: T.muted, textAlign: "center", paddingTop: 40 }}>A carregar…</div></Frame>;
  if (portalQuery.isError) {
    return (
      <Frame page={page} style={style}>
        <div style={card}>
          <div style={{ fontSize: 15.5, color: T.ink, lineHeight: 1.5, marginBottom: 16 }}>{portalQuery.error.message}</div>
          <AccentButton onClick={() => supabase.auth.signOut()}>Terminar sessão</AccentButton>
        </div>
      </Frame>
    );
  }
  const data = portalQuery.data;
  if (data?.needsPhoneVerification) {
    return <PhoneVerifyScreen page={page} style={style} onLinked={refresh} onSkip={() => setSkipPhone(true)} />;
  }

  return (
    <Frame page={page} style={style} nav={<BottomNav tab={tab} onChange={(k) => go(k)} />}>
      {paidNotice && (
        <div style={{ ...card, marginBottom: 16, display: "flex", gap: 10, alignItems: "flex-start", fontSize: 14.5, color: T.ink }}>
          <CheckCircle2 size={19} style={{ color: T.accent, flexShrink: 0 }} />
          <div style={{ flex: 1 }}>Pagamento recebido. Pode demorar alguns segundos a aparecer aqui.</div>
          <button type="button" onClick={() => setPaidNotice(false)} style={{ ...linkBtn, color: T.muted, fontSize: 13.5 }}>Fechar</button>
        </div>
      )}
      {tab === "home" && <HomeTab page={page} style={style} data={data} go={go} />}
      {tab === "packs" && <PacksTab page={page} data={data} />}
      {tab === "appointments" && <AppointmentsTab page={page} data={data} mode={sub} setMode={setSub} onBooked={refresh} />}
      {tab === "history" && <HistoryTab data={data} />}
      {tab === "profile" && <ProfileTab page={page} data={data} email={session.user.email} sub={sub} setSub={setSub} refresh={refresh} />}
    </Frame>
  );
}

/* ---------------------------------------------------------
   ROTA
--------------------------------------------------------- */
export default function ClientApp() {
  const { slug } = useParams();
  const pageQuery = usePublicBookingPage(slug);
  const [auth, setAuth] = useSession();
  const page = pageQuery.data;
  const style = brandStyle(page?.brand?.style);
  useBrandInstallable(page?.brand, style);

  if (pageQuery.isLoading || auth.loading) {
    return <div className="bb-force-light" style={{ minHeight: "100dvh", ...brandThemeVars(page?.brand?.style) }} />;
  }
  if (!page || !page.brand.client_app_enabled) {
    return (
      <div className="bb-force-light" style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", ...brandThemeVars(page?.brand?.style), ...T.body, color: T.muted }}>
        Esta app não está disponível.
      </div>
    );
  }
  if (auth.recovery && auth.session) return <NewPasswordScreen page={page} style={style} onDone={() => setAuth({ recovery: false })} />;
  if (!auth.session) return <AuthScreen page={page} style={style} />;
  return <Portal page={page} style={style} session={auth.session} />;
}
