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
  notifications: [
    {
      id: "n1", agency_id: AGENCY_ID, brand_id: B1, area: "automacoes", read_by: [],
      message: '2 execução(ões) da automação "Boas-vindas, novo lead" falharam:\n— +351912000001: Falha ao enviar WhatsApp para +351912000001: número inválido\n— +351913000002: Contacto "Rita Almeida" sem telefone.',
      created_at: iso(-0.02), brands: { name: "Clínica Aurora" },
    },
  ],
  contents: [
    { id: "ct1", brand_id: B1, type: "reel", platform: ["instagram"], title: "Antes e depois: limpeza de pele", approval_status: "pending", scheduled_date: day(3), client_note: null, media_urls: [], caption: "Resultado real, sem filtros.", created_at: iso(-2) },
    { id: "ct2", brand_id: B1, type: "carrossel", platform: ["instagram", "facebook"], title: "5 erros de pedicure", approval_status: "pending", scheduled_date: day(5), client_note: null, media_urls: [], caption: "Guarda para a próxima marcação.", created_at: iso(-3) },
    { id: "ct3", brand_id: B1, type: "post", platform: ["facebook"], title: "Nova linha Podocare", approval_status: "approved", scheduled_date: day(7), client_note: null, media_urls: [], caption: "Já disponível.", created_at: iso(-5) },
  ],
  scripts: [
    { id: "sc1", brand_id: B1, title: "Roteiro: bastidores da formação", content: "Cena 1: chegada das alunas.", status: "pending", client_note: null, created_at: iso(-1) },
  ],
  forms: [
    {
      id: "fm1", brand_id: B1, name: "Que profissional de estética és?", slug: "quiz-demo", type: "quiz", status: "published",
      thank_you_message: "Obrigada por responderes!", file_delivery_url: null, on_submit_tags: [], style: { introTitle: "Descobre o teu nível", introSubtitle: "Duas perguntas rápidas e mostramos-te a formação certa." },
      fields: [
        { id: "s1", type: "section", label: "Sobre ti", description: "Para sabermos a quem enviar o resultado." },
        { id: "q1", label: "O teu nome", type: "text", required: true, mapsTo: "name" },
        { id: "q3", label: "Que áreas te interessam?", type: "choice", multiple: true, required: true, options: [
          { id: "o4", label: "Estética facial", points: 1 },
          { id: "o5", label: "Unhas", points: 1 },
          { id: "o6", label: "Massagem", points: 1 },
        ] },
        { id: "s2", type: "section", label: "A tua experiência", description: "" },
        { id: "q2", label: "Quantas formações já tiraste?", type: "choice", required: true, options: [
          { id: "o1", label: "Nenhuma ainda", points: 0 },
          { id: "o2", label: "1 a 2", points: 5 },
          { id: "o3", label: "3 ou mais", points: 10 },
        ] },
      ],
      result_bands: [
        { id: "b1", min: 0, max: 4, title: "Estás a começar", description: "Ainda tens tudo por explorar — perfeito para a formação inicial." },
        { id: "b2", min: 5, max: 10, title: "Já tens experiência", description: "Podes avançar direto para as formações avançadas." },
      ],
      created_at: iso(-6),
    },
  ],
  plans: [],
};

// App das clientes (/app/aurora) e página pública (/agendar/aurora)
const PUBLIC_PAGE = {
  brand: { id: B1, name: "Dreams Studio", slug: "aurora", logo_url: null, client_app_enabled: true,
    style: { accentColor: "#C2A431", accentInk: "#1A0D0E", background: "#F6F1EA", surface: "#FFFDFA", ink: "#1A0D0E", titleFont: "Bodoni Moda", font: "Jost", tagline: "Cuidado com continuidade", contactPhone: "+351912345678" } },
  services: [
    { id: "s1", category: "Cabelo", name: "Brushing", description: "Secagem e modelação simples.", price: 10, duration_minutes: 30 },
    { id: "s2", category: "Massagem", name: "Massagem Relaxante de Aromas", description: "Massagem com óleos essenciais selecionados.", price: 37.5, price_max: 70, duration_minutes: 45 },
    { id: "s3", category: "Cabelo", name: "Coloração", description: "Coloração total ou do crescimento do cabelo.", price: 25, price_max: 44, duration_minutes: 90 },
    { id: "s4", category: "Mãos", name: "Verniz Gel", description: "Manicure com aplicação de verniz gel.", price: 19, duration_minutes: 60 },
    { id: "s5", category: "Rosto", name: "Lifting de Pestanas", description: "Curvatura e definição natural das pestanas.", price: 25, duration_minutes: 60 },
    { id: "s6", category: "Cabelo", name: "Avaliação Capilar Gratuita", description: null, price: 0, duration_minutes: 30 },
  ],
  staff: [{ id: "st1", name: "Joana", photo_url: null }, { id: "st2", name: "Sofia", photo_url: null }],
  upsells: [{ id: "u1", service_id: "s1", name: "Máscara de ouro", price: 15, extra_duration_minutes: 15 }],
  packs: [
    { id: "p1", name: "Pack 5 limpezas", description: "Ideal para um tratamento contínuo.", price: 225, sessions_count: 5, service_ids: ["s1"], validity_days: 180 },
    { id: "p2", name: "Pack 10 massagens", description: null, price: 400, sessions_count: 10, service_ids: [], validity_days: null },
  ],
  deposit: { enabled: true, percentage: 50, scope: "new_customers" },
  online_payments: true,
};
const PORTAL = {
  contact: { id: "c1", name: "Marta Ferreira", email: "marta@clinica.pt", phone: "+351912345678", opted_in_whatsapp: true, opted_in_sms: false, opted_in_email: true },
  appointments: [
    { id: "a1", starts_at: iso(9), ends_at: iso(9.04), status: "confirmed", service: "Massagem relaxante", staff: "Sofia", total_price: 45, deposit_status: "not_required", upsells: [], paid_with_pack: true },
    { id: "a2", starts_at: iso(3), ends_at: iso(3.04), status: "confirmed", service: "Limpeza de pele", staff: "Joana", total_price: 70, deposit_status: "paid", deposit_amount: 35, upsells: [{ name: "Máscara de ouro" }], paid_with_pack: false },
    { id: "a3", starts_at: iso(-12), ends_at: iso(-11.96), status: "completed", service: "Limpeza de pele", staff: "Joana", total_price: 55, deposit_status: "not_required", upsells: [], paid_with_pack: false },
    { id: "a4", starts_at: iso(-40), ends_at: iso(-39.96), status: "no_show", service: "Massagem relaxante", staff: "Sofia", total_price: 45, deposit_status: "not_required", upsells: [], paid_with_pack: false },
    { id: "a5", starts_at: iso(-70), ends_at: iso(-69.96), status: "completed", service: "Massagem relaxante", staff: "Sofia", total_price: 45, deposit_status: "not_required", upsells: [], paid_with_pack: true },
  ],
  packs: [{ id: "cp1", name: "Pack Brushing, 10 sessões", description: "Paga 9, a 10.ª é oferta", service_ids: [], sessions_total: 10, sessions_used: 6, expires_at: iso(200), purchased_at: iso(-80) }],
  careNotes: [{ category: "allergies", team_text: "Alergia a níquel.", client_text: null }],
  recommendations: [{ service: "Limpeza de pele", text: "Evite exposição solar nas 48 horas seguintes. Use protetor solar FPS 50." }],
  isNewCustomer: false,
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
  rpc: (name, args = {}) => {
    // aprovar de facto, para ver a animação do selo
    if (name === "approve_content") { const r = FIXTURES.contents.find((x) => x.id === args.p_id); if (r) r.approval_status = args.p_status; }
    if (name === "approve_script") { const r = FIXTURES.scripts.find((x) => x.id === args.p_id); if (r) r.status = args.p_status; }
    if (name === "submit_quiz_response") {
      const form = FIXTURES.forms.find((f) => f.id === args.p_form_id);
      let score = 0;
      for (const field of form?.fields || []) {
        if (field.type !== "choice") continue;
        const answer = args.p_answers?.[field.id];
        const ids = field.multiple && Array.isArray(answer) ? [...new Set(answer)] : typeof answer === "string" ? [answer] : [];
        for (const opt of field.options || []) if (ids.includes(opt.id)) score += opt.points || 0;
      }
      const band = (form?.result_bands || []).find((b) => score >= b.min && score <= b.max) || null;
      return Promise.resolve({ data: { submissionId: "sub-demo", score, band }, error: null });
    }
    if (name === "booking_public_page") return Promise.resolve({ data: args.p_slug === "aurora" ? PUBLIC_PAGE : null, error: null });
    if (name === "client_portal_data") return Promise.resolve({ data: PORTAL, error: null });
    return Promise.resolve({ data: /^(can_|is_)/.test(name) ? true : null, error: null });
  },
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

// Página de assinatura de demonstração (/assinar/<64 hex>): ler, assinar e voltar a ler.
let mockSigned = false;
export async function invokeFunction(name, body = {}) {
  if (name === "contract-sign") {
    if (body.action === "sign") { mockSigned = true; return { ok: true }; }
    const sig = (role, name2, email, signed) => ({ role, name: name2, email, signature_image: null, signed_at: signed ? iso(-1) : null, signed_ip: signed ? "203.0.113.7" : null, signed_body_hash: null });
    return {
      contract: {
        id: "k9", title: "Contrato de prestação de serviços", status: mockSigned ? "signed" : "sent", body_hash: "abc123",
        body_html: "<h1>Contrato de prestação de serviços</h1><p>Entre a agência Empower Boss e a Clínica Aurora, acordam-se a gestão das redes sociais e o acompanhamento mensal dos resultados.</p><h2>Cláusula 1.ª</h2><p>O prestador publica doze peças por mês.</p><p>{{assinatura_agencia}}</p><p>{{assinatura_cliente}}</p>",
        sent_at: iso(-2), completed_at: mockSigned ? iso(0) : null, counterparty_name: "Marta Ferreira", counterparty_email: "marta@clinica.pt", agency_name: "Empower Marketing",
      },
      signers: [sig("agency", "Ana Silva", "ana@empower.pt", true), sig("counterparty", mockSigned ? "Marta Ferreira" : "Marta Ferreira", "marta@clinica.pt", mockSigned)],
      canSign: !mockSigned,
    };
  }
  if (name === "booking-availability") {
    const base = new Date(`${body.date}T09:00:00`);
    return { slots: [0, 1, 2, 4, 5, 6, 7].map((h) => new Date(base.getTime() + h * 3600000).toISOString()) };
  }
  return {};
}
