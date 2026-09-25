/* ---------------------------------------------------------
   SUPABASE DE DEMONSTRAÇÃO — só para rever o visual sem iniciar sessão.
   Ativa-se com VITE_MOCK=1 (ver vite.config.js e a configuração
   "big-boss-mock" do launch.json). Nunca entra num build normal.
   Devolve uma sessão de administrador e alguns dados de exemplo; tudo o
   que não tem dados aparece como estado vazio. Não grava nada.
--------------------------------------------------------- */

const USER_ID = "00000000-0000-4000-8000-000000000001";
const AGENCY_ID = "00000000-0000-4000-8000-0000000000a1";
const B1 = "00000000-0000-4000-8000-0000000000b1";
const B2 = "00000000-0000-4000-8000-0000000000b2";
const B3 = "00000000-0000-4000-8000-0000000000b3";
const now = new Date();
const iso = (days = 0) => new Date(now.getTime() + days * 86400000).toISOString();
const day = (days = 0) => iso(days).slice(0, 10);

const FIXTURES = {
  profiles: [{ id: USER_ID, name: "Ana Silva", email: "ana@empower.pt", role: "admin_geral", agency_id: AGENCY_ID, brand_ids: [], avatar_url: null }],
  agencies: [{ id: AGENCY_ID, name: "Empower Marketing", is_root: true }],
  brands: [
    { id: B1, agency_id: AGENCY_ID, name: "Clínica Aurora", logo_url: null, goal: "Encher a agenda de segunda a sexta com clientes novas.", category: "estetica", status: "green", contract_scope: "Gestão de redes e CRM", brand_book: {}, enabled_modules: [], booking_slug: "aurora" },
    { id: B2, agency_id: AGENCY_ID, name: "WingCare", logo_url: null, goal: "Captar alunas para as formações e vender dermocosmética.", category: "estetica", status: "yellow", contract_scope: "CRM e automações", brand_book: {}, enabled_modules: [], booking_slug: null },
    { id: B3, agency_id: AGENCY_ID, name: "Barbearia Nobre", logo_url: null, goal: "Mais marcações online e menos faltas.", category: "barbearia", status: "red", contract_scope: "Agendamento e SMS", brand_book: {}, enabled_modules: [], booking_slug: null },
  ],
  tags: [
    { id: "t1", brand_id: B1, name: "Lead_LandingPage", color: "#7C52A8", created_at: iso(-30), contact_tags: [{ count: 12 }] },
    { id: "t2", brand_id: B1, name: "Cliente", color: "#1F7A4D", created_at: iso(-20), contact_tags: [{ count: 34 }] },
    { id: "t3", brand_id: B1, name: "Indicada", color: "#B0820D", created_at: iso(-10), contact_tags: [{ count: 3 }] },
  ],
  contacts: [
    { id: "c1", brand_id: B1, name: "Marta Ferreira", email: "marta@clinica.pt", phone: "+351912345678", source: "landing_page", opted_in_whatsapp: true, opted_in_email: true, opted_in_sms: false, birth_date: null, referred_by: null, created_at: iso(-3), contact_tags: [{ tag_id: "t1", tags: { id: "t1", name: "Lead_LandingPage", color: "#7C52A8" } }] },
    { id: "c2", brand_id: B1, name: "Rita Almeida", email: "rita@exemplo.pt", phone: "+351933000111", source: "manual", opted_in_whatsapp: false, opted_in_email: true, opted_in_sms: false, birth_date: day(-9000), referred_by: "c1", created_at: iso(-9), contact_tags: [{ tag_id: "t2", tags: { id: "t2", name: "Cliente", color: "#1F7A4D" } }] },
  ],
  contracts: [
    { id: "k1", agency_id: AGENCY_ID, brand_id: B1, title: "Contrato de prestação de serviços", body_html: "<h1>Contrato</h1><p>Texto de exemplo do contrato.</p>", status: "signed", counterparty_name: "Marta Ferreira", counterparty_email: "marta@clinica.pt", body_hash: "abc123", sent_at: iso(-12), agency_signed_at: iso(-12), counterparty_signed_at: iso(-11), completed_at: iso(-11), created_at: iso(-14), updated_at: iso(-11), brands: { name: "Clínica Aurora" } },
    { id: "k2", agency_id: AGENCY_ID, brand_id: B2, title: "Proposta de CRM e automações", body_html: "<p>Rascunho.</p>", status: "draft", counterparty_name: "Ana WingCare", counterparty_email: "ana@wingcare.pt", body_hash: null, sent_at: null, agency_signed_at: null, counterparty_signed_at: null, completed_at: null, created_at: iso(-2), updated_at: iso(-1), brands: { name: "WingCare" } },
    { id: "k3", agency_id: AGENCY_ID, brand_id: B3, title: "Contrato de agendamento", body_html: "<p>Enviado.</p>", status: "sent", counterparty_name: "João Nobre", counterparty_email: "joao@nobre.pt", body_hash: "def456", sent_at: iso(-3), agency_signed_at: iso(-3), counterparty_signed_at: null, completed_at: null, created_at: iso(-4), updated_at: iso(-3), brands: { name: "Barbearia Nobre" } },
  ],
  contract_signers: [],
  brand_contract_files: [{ id: "f1", brand_id: B1, name: "Contrato assinado 2025.pdf", storage_path: `${B1}/x.pdf`, size_bytes: 482113, created_at: iso(-40) }],
  invoice_links: [
    { id: "i1", brand_id: B1, name: "Fatura de abril", url: "https://exemplo.pt/fatura-abril", document_date: day(-20), created_at: iso(-20) },
    { id: "i2", brand_id: B1, name: "Fatura de março", url: "https://exemplo.pt/fatura-marco", document_date: day(-50), created_at: iso(-50) },
  ],
  service_invoices: [
    { id: "v1", brand_id: B1, title: "Gestão de redes, abril", status: "sent", currency: "EUR", issue_date: day(-20), due_date: day(10), paid_at: null, notes: "", created_at: iso(-20), service_invoice_items: [{ id: "vi1", description: "Gestão mensal", quantity: 1, unit_price_cents: 49000 }] },
  ],
  automations: [
    { id: "a1", brand_id: B1, name: "Boas-vindas, novo lead", trigger_type: "contact_created", trigger_config: {}, status: "active", created_at: iso(-30) },
    { id: "a2", brand_id: B1, name: "Aniversário", trigger_type: "contact_birthday", trigger_config: { hourLocal: 10, daysBefore: 0, requireConsent: true }, status: "draft", created_at: iso(-5) },
  ],
  automation_steps: [],
  brand_lead_webhooks: [{ brand_id: B1, token: "0".repeat(64), enabled: true, default_tag_ids: ["t1"], default_source: "landing_page", default_country_code: "351" }],
  contents: [],
  forms: [],
  plans: [],
};

function resolveData(state) {
  const rows = FIXTURES[state.table] || [];
  if (state.single || state.maybe) {
    const row = rows[0] || null;
    if (!row && state.single) return { data: null, error: { message: "Sem resultados (demonstração)" }, count: 0 };
    return { data: row, error: null, count: rows.length };
  }
  return { data: rows, error: null, count: rows.length };
}

function makeBuilder(table) {
  const state = { table, single: false, maybe: false };
  const proxy = new Proxy(function () {}, {
    get(_target, prop) {
      if (prop === "then") {
        const result = resolveData(state);
        return (resolve, reject) => Promise.resolve(result).then(resolve, reject);
      }
      if (prop === "single") return () => { state.single = true; return proxy; };
      if (prop === "maybeSingle") return () => { state.maybe = true; return proxy; };
      return () => proxy;
    },
  });
  return proxy;
}

const channelStub = { on() { return channelStub; }, subscribe() { return channelStub; }, unsubscribe() {} };
const session = { user: { id: USER_ID, email: "ana@empower.pt" } };
// ?login=1 mostra o ecrã de entrada (sem sessão)
const showLogin = typeof location !== "undefined" && new URLSearchParams(location.search).has("login");

export const supabase = {
  from: (table) => makeBuilder(table),
  rpc: (name) => Promise.resolve({ data: /^(can_|is_)/.test(name) ? true : null, error: null }),
  channel: () => channelStub,
  removeChannel: () => {},
  auth: {
    getSession: async () => ({ data: { session: showLogin ? null : session } }),
    getUser: async () => ({ data: { user: session.user } }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    signOut: async () => ({ error: null }),
    signInWithPassword: async () => ({ error: null }),
    updateUser: async () => ({ error: null }),
    resetPasswordForEmail: async () => ({ error: null }),
  },
  storage: {
    from: () => ({
      upload: async () => ({ error: null }),
      remove: async () => ({ error: null }),
      list: async () => ({ data: [], error: null }),
      getPublicUrl: () => ({ data: { publicUrl: "" } }),
      createSignedUrl: async () => ({ data: { signedUrl: "#" }, error: null }),
    }),
  },
  functions: { invoke: async () => ({ data: {}, error: null }) },
};

export async function invokeFunction() {
  return {};
}
