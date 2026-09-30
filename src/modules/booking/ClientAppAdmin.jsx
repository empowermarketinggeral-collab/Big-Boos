import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase, invokeFunction } from "../../lib/supabaseClient.js";
import { c, sans, serif, Modal, inputStyle, btnPrimary, btnGhost } from "../../shared/theme.jsx";
import { Plus, Pencil, Trash2, Link2, CheckCircle2, Smartphone, CreditCard, Package, Search } from "lucide-react";
import { money } from "./publicBooking.js";
import { MoneyInput, parseMoney, moneyInputValue } from "./ServiceOptions.jsx";

/* ---------------------------------------------------------
   APP DAS CLIENTES, STRIPE DA MARCA E PACKS — painéis da equipa
   dentro do Agendamento. A app em si está em
   src/modules/clientapp/ClientApp.jsx (/app/<booking_slug>).
--------------------------------------------------------- */

const card = { background: c.folha, border: `1px solid ${c.line}`, borderRadius: 3, padding: 20 };
const row = { display: "flex", alignItems: "center", gap: 10, background: c.paper, borderRadius: 6, padding: "10px 14px" };
const iconBtn = { background: "none", border: "none", cursor: "pointer", color: c.mist, padding: 4 };
const hint = { ...sans, fontSize: 12.5, color: c.mist };

/* ---------------------------------------------------------
   Procurar contacto (a agenda pode ter milhares — nunca carrega tudo)
--------------------------------------------------------- */
export function ContactPicker({ brandId, value, onChange }) {
  const [q, setQ] = useState("");
  const results = useQuery({
    queryKey: ["contact_picker", brandId, q],
    enabled: !!brandId && q.trim().length >= 2,
    queryFn: async () => {
      const term = `%${q.trim().replace(/[\\%_,()]/g, "")}%`;
      const { data, error } = await supabase
        .from("contacts")
        .select("id, name, email, phone")
        .eq("brand_id", brandId)
        .or(`name.ilike.${term},email.ilike.${term},phone.ilike.${term}`)
        .order("name")
        .limit(15);
      if (error) throw error;
      return data;
    },
  });

  if (value) {
    return (
      <div style={{ ...row, background: c.paper }}>
        <div style={{ flex: 1, minWidth: 0, ...sans, fontSize: 14, color: c.ink }}>
          <strong>{value.name}</strong>
          <div style={hint}>{[value.email, value.phone].filter(Boolean).join(", ")}</div>
        </div>
        <button type="button" onClick={() => onChange(null)} style={{ ...btnGhost, padding: "5px 10px", minHeight: 0, fontSize: 13 }}>Trocar</button>
      </div>
    );
  }
  return (
    <div>
      <div style={{ position: "relative" }}>
        <Search size={14} color={c.mist} style={{ position: "absolute", left: 11, top: 13 }} />
        <input style={{ ...inputStyle, paddingLeft: 32 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Procurar por nome, email ou telefone" />
      </div>
      {(results.data || []).length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 6, maxHeight: 220, overflowY: "auto" }}>
          {results.data.map((ct) => (
            <button key={ct.id} type="button" onClick={() => onChange(ct)} style={{ ...row, border: "none", cursor: "pointer", textAlign: "left", padding: "8px 12px" }}>
              <div style={{ ...sans, fontSize: 14, color: c.ink }}>
                {ct.name}
                <div style={hint}>{[ct.email, ct.phone].filter(Boolean).join(", ")}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------
   APP DAS CLIENTES
--------------------------------------------------------- */
function useClientAppEnabled(brandId) {
  return useQuery({
    queryKey: ["brand_client_app", brandId],
    enabled: !!brandId,
    queryFn: async () => {
      const { data, error } = await supabase.from("brands").select("client_app_enabled").eq("id", brandId).maybeSingle();
      if (error) throw error;
      return !!data?.client_app_enabled;
    },
  });
}
function useClientAccounts(brandId) {
  return useQuery({
    queryKey: ["client_accounts", brandId],
    enabled: !!brandId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_accounts")
        .select("user_id, contact_id, email, created_at, contacts(id, name, email, phone)")
        .eq("brand_id", brandId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

function RelinkModal({ brandId, account, onClose }) {
  const qc = useQueryClient();
  const [contact, setContact] = useState(account.contacts || null);
  const [error, setError] = useState("");
  const save = useMutation({
    mutationFn: async () => {
      const { error: err } = await supabase.from("client_accounts").update({ contact_id: contact.id }).eq("user_id", account.user_id).eq("brand_id", brandId);
      if (err) throw err;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["client_accounts", brandId] }); onClose(); },
    onError: (err) => setError(err.code === "23505" ? "Essa ficha já está ligada a outra conta." : err.message),
  });
  return (
    <Modal title="Ligar a outra ficha" onClose={onClose} width={440}>
      <div style={{ ...sans, fontSize: 14, color: c.mist, marginBottom: 12, lineHeight: 1.5 }}>
        A conta {account.email} passa a ver as marcações e os packs da ficha que escolheres. Usa isto quando a cliente criou conta com um email que não estava na ficha antiga.
      </div>
      <ContactPicker brandId={brandId} value={contact} onChange={setContact} />
      {error && <div style={{ ...sans, fontSize: 14, color: c.rose, marginTop: 10 }}>{error}</div>}
      <button onClick={() => save.mutate()} disabled={!contact || save.isPending} style={{ ...btnPrimary, marginTop: 14 }}>
        {save.isPending ? "A guardar…" : "Guardar"}
      </button>
    </Modal>
  );
}

export function ClientAppSection({ brand, slug }) {
  const qc = useQueryClient();
  const enabledQuery = useClientAppEnabled(brand.id);
  const accountsQuery = useClientAccounts(brand.id);
  const [copied, setCopied] = useState(false);
  const [relinking, setRelinking] = useState(null);
  const [error, setError] = useState("");
  const toggle = useMutation({
    mutationFn: async (value) => {
      const { error: err } = await supabase.from("brands").update({ client_app_enabled: value }).eq("id", brand.id);
      if (err) throw err;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["brand_client_app", brand.id] }),
    onError: (err) => setError(err.message || "Não foi possível guardar."),
  });

  const url = slug ? `${window.location.origin}/app/${slug}` : "";
  const accounts = accountsQuery.data || [];
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* noop */ }
  };

  return (
    <div style={card}>
      <div style={{ ...serif, fontSize: 15.5, color: c.ink, marginBottom: 4, display: "flex", alignItems: "center", gap: 7 }}>
        <Smartphone size={15} color={c.bossText} /> App das clientes
      </div>
      <div style={{ ...hint, marginBottom: 14, lineHeight: 1.5 }}>
        As clientes entram com email e palavra-passe e veem as marcações futuras e passadas, os packs, e marcam ou compram packs. A conta liga-se à ficha do CRM pelo email.
      </div>
      <label style={{ ...sans, fontSize: 14, fontWeight: 600, color: c.ink, display: "flex", alignItems: "center", gap: 7, marginBottom: 12 }}>
        <input type="checkbox" checked={!!enabledQuery.data} disabled={!slug || toggle.isPending} onChange={(e) => toggle.mutate(e.target.checked)} />
        App ativa
      </label>
      {!slug && <div style={{ ...hint, marginBottom: 12 }}>Ativa primeiro o link público de marcação (lá em cima): a app usa o mesmo endereço.</div>}
      {error && <div style={{ ...sans, fontSize: 14, color: c.rose, marginBottom: 10 }}>{error}</div>}
      {enabledQuery.data && url && (
        <button onClick={copy} style={{ ...btnGhost, marginBottom: 16, maxWidth: "100%", overflow: "hidden" }}>
          {copied ? <CheckCircle2 size={13} /> : <Link2 size={13} />}
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{copied ? "Copiado" : url}</span>
        </button>
      )}

      <div style={{ ...sans, fontSize: 13.5, fontWeight: 700, color: c.ink, marginBottom: 8 }}>Contas criadas ({accounts.length})</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 320, overflowY: "auto" }}>
        {accounts.map((a) => (
          <div key={a.user_id} style={row}>
            <div style={{ flex: 1, minWidth: 0, ...sans, fontSize: 14, color: c.ink }}>
              {a.contacts?.name || a.email}
              <div style={hint}>{a.email}{a.contacts?.email && a.contacts.email.toLowerCase() !== (a.email || "").toLowerCase() ? `, ficha: ${a.contacts.email}` : ""}</div>
            </div>
            <button onClick={() => setRelinking(a)} style={{ ...btnGhost, padding: "5px 10px", minHeight: 0, fontSize: 13 }}>Ficha</button>
          </div>
        ))}
        {!accounts.length && <div style={{ ...hint, textAlign: "center", padding: "10px 0" }}>Ainda ninguém criou conta.</div>}
      </div>
      {relinking && <RelinkModal brandId={brand.id} account={relinking} onClose={() => setRelinking(null)} />}
    </div>
  );
}

/* ---------------------------------------------------------
   STRIPE DA MARCA
--------------------------------------------------------- */
export function StripeAccountSection({ brand }) {
  const qc = useQueryClient();
  const [key, setKey] = useState("");
  const [error, setError] = useState("");
  const accountQuery = useQuery({
    queryKey: ["brand_stripe_account", brand.id],
    queryFn: async () => {
      const { data, error: err } = await supabase.from("brand_stripe_accounts").select("account_name, livemode, connected_at").eq("brand_id", brand.id).maybeSingle();
      if (err) throw err;
      return data;
    },
  });
  const connect = useMutation({
    mutationFn: (payload) => invokeFunction("stripe-brand-connect", { brandId: brand.id, ...payload }),
    onSuccess: () => { setKey(""); setError(""); qc.invalidateQueries({ queryKey: ["brand_stripe_account", brand.id] }); },
    onError: (err) => setError(err.message),
  });
  const account = accountQuery.data;

  return (
    <div style={card}>
      <div style={{ ...serif, fontSize: 15.5, color: c.ink, marginBottom: 4, display: "flex", alignItems: "center", gap: 7 }}>
        <CreditCard size={15} color={c.bossText} /> Pagamentos online (Stripe da marca)
      </div>
      <div style={{ ...hint, marginBottom: 14, lineHeight: 1.5 }}>
        Com o Stripe da marca ligado, os sinais e os packs caem na conta dela. Sem ele, os sinais usam a conta da plataforma e os packs não se vendem online.
      </div>
      {account ? (
        <div style={{ ...row, marginBottom: 12 }}>
          <CheckCircle2 size={15} color={c.sage} />
          <div style={{ flex: 1, ...sans, fontSize: 14, color: c.ink }}>
            {account.account_name}
            <div style={hint}>{account.livemode ? "Modo real" : "Modo de teste"}, ligado a {new Date(account.connected_at).toLocaleDateString("pt-PT")}</div>
          </div>
          <button onClick={() => connect.mutate({ action: "disconnect" })} disabled={connect.isPending} style={{ ...btnGhost, padding: "5px 10px", minHeight: 0, fontSize: 13, color: c.rose }}>Desligar</button>
        </div>
      ) : null}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input
          type="password"
          style={{ ...inputStyle, flex: "1 1 220px", width: "auto" }}
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder={account ? "Nova chave secreta (sk_live_…)" : "Chave secreta (sk_live_…)"}
          autoComplete="off"
        />
        <button onClick={() => connect.mutate({ secretKey: key })} disabled={!key.trim() || connect.isPending} style={btnPrimary}>
          {connect.isPending ? "A ligar…" : account ? "Trocar" : "Ligar"}
        </button>
      </div>
      <div style={{ ...hint, marginTop: 8 }}>No Stripe da marca: Programadores, Chaves de API, Chave secreta. O webhook é criado sozinho.</div>
      {error && <div style={{ ...sans, fontSize: 14, color: c.rose, marginTop: 10 }}>{error}</div>}
    </div>
  );
}

/* ---------------------------------------------------------
   PACKS
--------------------------------------------------------- */
function usePacks(brandId) {
  return useQuery({
    queryKey: ["booking_packs", brandId],
    queryFn: async () => {
      const { data, error } = await supabase.from("booking_packs").select("*").eq("brand_id", brandId).neq("status", "archived").order("created_at");
      if (error) throw error;
      return data;
    },
  });
}
function useSoldPacks(brandId) {
  return useQuery({
    queryKey: ["client_packs", brandId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_packs")
        .select("*, contacts(name)")
        .eq("brand_id", brandId).eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data;
    },
  });
}

function PackFormModal({ brandId, services, pack, onClose }) {
  const qc = useQueryClient();
  const [name, setName] = useState(pack?.name || "");
  const [description, setDescription] = useState(pack?.description || "");
  const [price, setPrice] = useState(moneyInputValue(pack?.price));
  const [sessions, setSessions] = useState(pack?.sessions_count ?? 5);
  const [validity, setValidity] = useState(pack?.validity_days ?? "");
  const [serviceIds, setServiceIds] = useState(pack?.service_ids || []);
  const [bonusSessions, setBonusSessions] = useState(pack?.bonus_sessions ?? 0);
  const [bonusServiceIds, setBonusServiceIds] = useState(pack?.bonus_service_ids || []);
  const [error, setError] = useState("");
  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        name: name.trim(), description: description.trim() || null, price: parseMoney(price), sessions_count: Number(sessions),
        validity_days: validity === "" ? null : Number(validity), service_ids: serviceIds,
        bonus_sessions: Math.max(0, parseInt(bonusSessions, 10) || 0), bonus_service_ids: bonusServiceIds,
      };
      const { error: err } = pack
        ? await supabase.from("booking_packs").update(payload).eq("id", pack.id)
        : await supabase.from("booking_packs").insert({ brand_id: brandId, ...payload });
      if (err) throw err;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["booking_packs", brandId] }); onClose(); },
    onError: (err) => setError(err.message),
  });
  const submit = () => {
    if (!name.trim()) return setError("O nome é obrigatório.");
    if (!(parseMoney(price) > 0)) return setError("Indica o preço (ex: 250 ou 249,90).");
    if (!(Number(sessions) > 0)) return setError("Indica o número de sessões.");
    save.mutate();
  };
  const toggleService = (id) => setServiceIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  const toggleBonusService = (id) => setBonusServiceIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  return (
    <Modal title={pack ? "Editar pack" : "Novo pack"} onClose={onClose} width={460}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome (ex: Pack 5 massagens)" />
        <textarea rows={2} style={{ ...inputStyle, resize: "vertical" }} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descrição (opcional)" />
        <div style={{ display: "grid", gridTemplateColumns: "var(--bb-grid-3, repeat(3, 1fr))", gap: 10 }}>
          <label style={hint}>Preço (€)<MoneyInput style={{ marginTop: 4 }} value={price} onChange={setPrice} placeholder="0,00" /></label>
          <label style={hint}>Sessões pagas<input type="number" min="1" style={{ ...inputStyle, marginTop: 4 }} value={sessions} onChange={(e) => setSessions(e.target.value)} /></label>
          <label style={hint}>Validade (dias)<input type="number" min="1" style={{ ...inputStyle, marginTop: 4 }} value={validity} onChange={(e) => setValidity(e.target.value)} placeholder="Sem limite" /></label>
        </div>
        <div>
          <div style={{ ...hint, marginBottom: 6 }}>Serve para (nenhum escolhido = qualquer serviço)</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {services.map((s) => (
              <label key={s.id} style={{ ...sans, fontSize: 14, color: c.ink, display: "flex", alignItems: "center", gap: 8 }}>
                <input type="checkbox" checked={serviceIds.includes(s.id)} onChange={() => toggleService(s.id)} /> {s.name}
              </label>
            ))}
          </div>
        </div>
        <div style={{ borderTop: `1px solid ${c.line}`, paddingTop: 12 }}>
          <div style={{ ...sans, fontSize: 13.5, fontWeight: 700, color: c.ink, marginBottom: 4 }}>Sessões de oferta (opcional)</div>
          <div style={{ ...hint, marginBottom: 8 }}>Ex: 9 pagas e 1 de oferta de Brushing. A cliente recebe um pack "Oferta" à parte quando este fica ativo.</div>
          <label style={{ ...hint, display: "block", maxWidth: 160 }}>Sessões de oferta<input type="number" min="0" style={{ ...inputStyle, marginTop: 4 }} value={bonusSessions} onChange={(e) => setBonusSessions(e.target.value)} /></label>
          {Number(bonusSessions) > 0 && (
            <div style={{ marginTop: 10 }}>
              <div style={{ ...hint, marginBottom: 6 }}>A oferta serve para (nenhum escolhido = qualquer serviço)</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {services.map((s) => (
                  <label key={s.id} style={{ ...sans, fontSize: 14, color: c.ink, display: "flex", alignItems: "center", gap: 8 }}>
                    <input type="checkbox" checked={bonusServiceIds.includes(s.id)} onChange={() => toggleBonusService(s.id)} /> {s.name}
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
        {error && <div style={{ ...sans, fontSize: 14, color: c.rose }}>{error}</div>}
        <button onClick={submit} disabled={save.isPending} style={{ ...btnPrimary, width: "fit-content" }}>{save.isPending ? "A guardar…" : "Guardar"}</button>
      </div>
    </Modal>
  );
}

// Para packs vendidos ao balcão ou que a cliente já tinha no sistema antigo.
function AssignPackModal({ brandId, packs, onClose }) {
  const qc = useQueryClient();
  const [contact, setContact] = useState(null);
  const [packId, setPackId] = useState(packs[0]?.id || "");
  const [used, setUsed] = useState(0);
  const [expiresAt, setExpiresAt] = useState("");
  const [error, setError] = useState("");
  const pack = packs.find((p) => p.id === packId);
  const save = useMutation({
    mutationFn: async () => {
      const { error: err } = await supabase.from("client_packs").insert({
        brand_id: brandId, contact_id: contact.id, pack_id: pack.id, name: pack.name, service_ids: pack.service_ids || [],
        sessions_total: pack.sessions_count, sessions_used: Math.min(Number(used) || 0, pack.sessions_count),
        price_paid: pack.price, status: "active", source: "manual", purchased_at: new Date().toISOString(),
        expires_at: expiresAt ? new Date(`${expiresAt}T23:59:59`).toISOString() : pack.validity_days ? new Date(Date.now() + pack.validity_days * 86400000).toISOString() : null,
      });
      if (err) throw err;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["client_packs", brandId] }); onClose(); },
    onError: (err) => setError(err.message),
  });
  return (
    <Modal title="Atribuir pack a uma cliente" onClose={onClose} width={460}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <ContactPicker brandId={brandId} value={contact} onChange={setContact} />
        <select style={inputStyle} value={packId} onChange={(e) => setPackId(e.target.value)}>
          {packs.map((p) => <option key={p.id} value={p.id}>{p.name}, {p.sessions_count} sessões</option>)}
        </select>
        <div style={{ display: "grid", gridTemplateColumns: "var(--bb-grid-2, repeat(2, 1fr))", gap: 10 }}>
          <label style={hint}>Sessões já usadas<input type="number" min="0" style={{ ...inputStyle, marginTop: 4 }} value={used} onChange={(e) => setUsed(e.target.value)} /></label>
          <label style={hint}>Válido até (opcional)<input type="date" style={{ ...inputStyle, marginTop: 4 }} value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} /></label>
        </div>
        {error && <div style={{ ...sans, fontSize: 14, color: c.rose }}>{error}</div>}
        <button onClick={() => save.mutate()} disabled={!contact || !pack || save.isPending} style={{ ...btnPrimary, width: "fit-content" }}>
          {save.isPending ? "A guardar…" : "Atribuir"}
        </button>
      </div>
    </Modal>
  );
}

export function PacksSection({ brand, services }) {
  const qc = useQueryClient();
  const packsQuery = usePacks(brand.id);
  const soldQuery = useSoldPacks(brand.id);
  const [editing, setEditing] = useState(undefined);
  const [assigning, setAssigning] = useState(false);
  const archive = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from("booking_packs").update({ status: "archived" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["booking_packs", brand.id] }),
  });
  const adjust = useMutation({
    mutationFn: async ({ id, sessionsUsed }) => {
      const { error } = await supabase.from("client_packs").update({ sessions_used: sessionsUsed }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["client_packs", brand.id] }),
  });
  const packs = packsQuery.data || [];
  const sold = soldQuery.data || [];

  return (
    <div style={card}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 4, flexWrap: "wrap" }}>
        <div style={{ ...serif, fontSize: 15.5, color: c.ink, display: "flex", alignItems: "center", gap: 7 }}>
          <Package size={15} color={c.bossText} /> Packs
        </div>
        <button onClick={() => setEditing(null)} style={{ ...btnGhost, padding: "6px 12px" }}><Plus size={12} /> Pack</button>
      </div>
      <div style={{ ...hint, marginBottom: 14 }}>A cliente compra na app (Stripe da marca) e cada marcação com o pack gasta uma sessão. Se a marcação for cancelada, a sessão volta.</div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 18 }}>
        {packs.map((p) => (
          <div key={p.id} style={row}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ ...sans, fontSize: 14.5, fontWeight: 600, color: c.ink }}>{p.name}</div>
              <div style={{ ...hint, marginTop: 2 }}>
                {money(p.price)}, {p.sessions_count} sessões{p.bonus_sessions > 0 ? ` e ${p.bonus_sessions} de oferta${p.bonus_service_ids?.length ? ` (${p.bonus_service_ids.map((id) => services.find((s) => s.id === id)?.name).filter(Boolean).join(", ")})` : ""}` : ""}
                {p.validity_days ? `, válido ${p.validity_days} dias` : ""}
              </div>
            </div>
            <button onClick={() => setEditing(p)} style={iconBtn} aria-label="Editar"><Pencil size={13} /></button>
            <button onClick={() => archive.mutate(p.id)} style={iconBtn} aria-label="Arquivar"><Trash2 size={13} /></button>
          </div>
        ))}
        {!packs.length && <div style={{ ...hint, textAlign: "center", padding: "10px 0" }}>Ainda sem packs.</div>}
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
        <div style={{ ...sans, fontSize: 13.5, fontWeight: 700, color: c.ink }}>Packs das clientes ({sold.length})</div>
        {packs.length > 0 && <button onClick={() => setAssigning(true)} style={{ ...btnGhost, padding: "5px 10px", minHeight: 0, fontSize: 13 }}><Plus size={12} /> Atribuir</button>}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 360, overflowY: "auto" }}>
        {sold.map((p) => {
          const left = p.sessions_total - p.sessions_used;
          const expired = p.expires_at && new Date(p.expires_at) < new Date();
          return (
            <div key={p.id} style={row}>
              <div style={{ flex: 1, minWidth: 0, ...sans, fontSize: 14, color: c.ink }}>
                {p.contacts?.name}: {p.name}
                <div style={{ ...hint, color: expired || left === 0 ? c.mistLight : c.mist }}>
                  {left} de {p.sessions_total} por usar
                  {p.expires_at ? `, ${expired ? "expirou" : "válido até"} ${new Date(p.expires_at).toLocaleDateString("pt-PT")}` : ""}
                  {p.source === "app" ? ", comprado na app" : ""}
                </div>
              </div>
              <button onClick={() => adjust.mutate({ id: p.id, sessionsUsed: Math.max(p.sessions_used - 1, 0) })} style={{ ...btnGhost, padding: "2px 9px", minHeight: 0 }} aria-label="Devolver uma sessão">+</button>
              <button onClick={() => adjust.mutate({ id: p.id, sessionsUsed: Math.min(p.sessions_used + 1, p.sessions_total) })} style={{ ...btnGhost, padding: "2px 9px", minHeight: 0 }} aria-label="Gastar uma sessão">−</button>
            </div>
          );
        })}
        {!sold.length && <div style={{ ...hint, textAlign: "center", padding: "10px 0" }}>Nenhuma cliente tem packs ainda.</div>}
      </div>

      {editing !== undefined && <PackFormModal brandId={brand.id} services={services} pack={editing} onClose={() => setEditing(undefined)} />}
      {assigning && <AssignPackModal brandId={brand.id} packs={packs} onClose={() => setAssigning(false)} />}
    </div>
  );
}
