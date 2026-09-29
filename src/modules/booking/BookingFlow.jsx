import { useState, useEffect, useMemo } from "react";
import { invokeFunction } from "../../lib/supabaseClient.js";
import { c } from "../../shared/theme.jsx";
import { Check, Search, ChevronLeft } from "lucide-react";
import { T, money, priceLabel, durationLabel, packFitsService, capitalize } from "./publicBooking.js";

/* ---------------------------------------------------------
   FLUXO DE MARCAÇÃO — partilhado pela página pública
   (/agendar/:slug) e pela app das clientes (/app/:slug).
   Primeiro escolhe-se o serviço (por categoria ou pesquisa), depois
   extras, profissional, dia e hora. Com `client` (client_portal_data)
   não pede nome/contacto e deixa pagar com um pack.
   Cores e letras vêm do tema da marca (variáveis --app-*, ver
   publicBooking.js), aplicado pela página que usa este componente.
--------------------------------------------------------- */

const toDateKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const timeLabel = (iso) => new Date(iso).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" });

const label = { ...T.body, fontSize: 13, fontWeight: 500, color: T.muted, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 10 };
const field = {
  ...T.body, width: "100%", boxSizing: "border-box", fontSize: 16, color: T.ink, background: T.surface,
  border: `1px solid ${T.line}`, borderRadius: 10, padding: "12px 14px", minHeight: 48, outline: "none",
};

function Choice({ selected, onClick, children, style }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        ...T.body, textAlign: "left", cursor: "pointer", borderRadius: 12, padding: "14px 16px", width: "100%",
        border: `1px solid ${selected ? T.accent : T.line}`, background: selected ? T.accentSoft : T.surface, color: T.ink, ...style,
      }}
    >
      {children}
    </button>
  );
}

function ServicePicker({ services, onPick }) {
  const categories = useMemo(() => [...new Set(services.map((s) => s.category).filter(Boolean))], [services]);
  const [category, setCategory] = useState("");
  const [q, setQ] = useState("");
  const term = q.trim().toLowerCase();
  const visible = services.filter((s) => (!category || s.category === category) && (!term || s.name.toLowerCase().includes(term)));

  return (
    <div>
      {services.length > 8 && (
        <div style={{ position: "relative", marginBottom: 12, color: T.faint }}>
          <Search size={16} style={{ position: "absolute", left: 14, top: 16 }} />
          <input style={{ ...field, paddingLeft: 40 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Pesquisar serviço" />
        </div>
      )}
      {categories.length > 1 && (
        <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 6, marginBottom: 8 }}>
          {["", ...categories].map((cat) => {
            const on = cat === category;
            return (
              <button
                key={cat || "all"}
                type="button"
                onClick={() => setCategory(cat)}
                style={{
                  ...T.body, flexShrink: 0, fontSize: 14, fontWeight: 500, borderRadius: 999, padding: "8px 16px", cursor: "pointer",
                  border: `1px solid ${on ? T.accent : T.line}`, background: on ? T.accent : T.surface, color: on ? T.onAccent : T.ink,
                }}
              >
                {cat || "Todos"}
              </button>
            );
          })}
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {visible.map((s) => (
          <Choice key={s.id} onClick={() => onPick(s.id)}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
              <span style={{ fontSize: 16, fontWeight: 500 }}>{s.name}</span>
              <span style={{ fontSize: 15, fontWeight: 500, whiteSpace: "nowrap" }}>{priceLabel(s)}</span>
            </div>
            <div style={{ fontSize: 14, color: T.muted, marginTop: 4, lineHeight: 1.45 }}>
              {durationLabel(s.duration_minutes)}{s.description ? `. ${s.description}` : ""}
            </div>
          </Choice>
        ))}
        {!visible.length && <div style={{ ...T.body, fontSize: 15, color: T.muted, padding: "8px 2px" }}>Nenhum serviço encontrado.</div>}
      </div>
    </div>
  );
}

export default function BookingFlow({ page, client, returnUrl, onBooked }) {
  const { brand, services = [], staff = [], upsells: allUpsells = [], deposit } = page;

  const [serviceId, setServiceId] = useState("");
  const [staffId, setStaffId] = useState("any");
  const [selectedUpsellIds, setSelectedUpsellIds] = useState([]);
  const [date, setDate] = useState("");
  const [slots, setSlots] = useState([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [chosenSlot, setChosenSlot] = useState(null);
  const [packId, setPackId] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const service = services.find((s) => s.id === serviceId);
  // Só quem faz este serviço (sem ninguém atribuído = qualquer profissional).
  const serviceStaff = service?.staff_ids?.length ? staff.filter((st) => service.staff_ids.includes(st.id)) : staff;
  const upsells = allUpsells.filter((u) => u.service_id === serviceId);
  const chosenUpsells = upsells.filter((u) => selectedUpsellIds.includes(u.id));
  const extraMinutes = chosenUpsells.reduce((sum, u) => sum + (u.extra_duration_minutes || 0), 0);
  const totalPrice = (Number(service?.price) || 0) + chosenUpsells.reduce((sum, u) => sum + (Number(u.price) || 0), 0);
  const hasRange = service?.price_max && Number(service.price_max) > Number(service.price);

  const usablePacks = useMemo(() => (client?.packs || []).filter((p) => packFitsService(p, serviceId)), [client, serviceId]);

  const days = useMemo(() => {
    const out = [];
    const today = new Date();
    for (let i = 0; i < 45; i++) out.push(new Date(today.getFullYear(), today.getMonth(), today.getDate() + i));
    return out;
  }, []);

  useEffect(() => {
    setSelectedUpsellIds([]); setPackId(""); setDate(""); setChosenSlot(null);
    const s = services.find((x) => x.id === serviceId);
    const ids = s?.staff_ids?.length ? s.staff_ids : staff.map((st) => st.id);
    setStaffId(ids.length === 1 ? ids[0] : "any");
  }, [serviceId, services, staff]);

  useEffect(() => {
    if (!serviceId || !staffId || !date) { setSlots([]); return; }
    let active = true;
    setLoadingSlots(true);
    setChosenSlot(null);
    invokeFunction("booking-availability", { brandId: brand.id, serviceId, staffId, date, upsellIds: selectedUpsellIds })
      .then((data) => { if (active) setSlots(data.slots || []); })
      .catch(() => { if (active) setSlots([]); })
      .finally(() => { if (active) setLoadingSlots(false); });
    return () => { active = false; };
  }, [serviceId, staffId, date, brand.id, selectedUpsellIds]);

  const toggleUpsell = (id) => setSelectedUpsellIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  // Sinal: quem paga e quanto. Sem sessão não sabemos se é cliente nova.
  const depositOn = deposit?.enabled && !packId && totalPrice > 0;
  const depositApplies = depositOn && (deposit.scope === "all" || (client ? client.isNewCustomer : null));
  const depositAmount = depositOn ? Math.round(totalPrice * (deposit.percentage / 100) * 100) / 100 : 0;

  const confirm = async () => {
    setError("");
    if (!client) {
      if (!name.trim()) { setError("Indique o seu nome."); return; }
      if (!phone.trim() && !email.trim()) { setError("Indique o telemóvel ou o email."); return; }
    }
    setSubmitting(true);
    try {
      const result = await invokeFunction("booking-create", {
        brandId: brand.id, serviceId, staffId, startsAt: chosenSlot, upsellIds: selectedUpsellIds,
        clientPackId: packId || undefined,
        name: name.trim(), phone: phone.trim(), email: email.trim(),
        successUrl: returnUrl ? `${returnUrl}${returnUrl.includes("?") ? "&" : "?"}pago=1` : undefined,
        cancelUrl: returnUrl,
      });
      if (result.paymentUrl) {
        window.location.href = result.paymentUrl;
        return;
      }
      onBooked?.({ serviceName: service?.name, startsAt: chosenSlot, withPack: !!packId });
    } catch (err) {
      setError(err.message || "Não foi possível confirmar.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!services.length || !staff.length) {
    return <div style={{ ...T.body, fontSize: 15, color: T.muted }}>As marcações online ainda não estão abertas.</div>;
  }

  if (!service) {
    return (
      <div>
        <div style={label}>Escolha o serviço</div>
        <ServicePicker services={services} onPick={setServiceId} />
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 26, ...T.body }}>
      <div>
        <button type="button" onClick={() => setServiceId("")} style={{ ...T.body, display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", padding: 0, cursor: "pointer", color: T.muted, fontSize: 14, marginBottom: 12 }}>
          <ChevronLeft size={16} /> Outro serviço
        </button>
        <div style={{ ...T.title, fontSize: 22, color: T.ink }}>{service.name}</div>
        <div style={{ fontSize: 14.5, color: T.muted, marginTop: 4 }}>{durationLabel(service.duration_minutes)}, {priceLabel(service)}</div>
        {service.description && <div style={{ fontSize: 14.5, color: T.ink, marginTop: 10, lineHeight: 1.55 }}>{service.description}</div>}
      </div>

      {upsells.length > 0 && (
        <div>
          <div style={label}>Extras (opcional)</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {upsells.map((u) => {
              const on = selectedUpsellIds.includes(u.id);
              return (
                <Choice key={u.id} selected={on} onClick={() => toggleUpsell(u.id)} style={{ padding: "12px 14px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 15 }}>
                    <span style={{ width: 20, height: 20, borderRadius: 5, border: `1px solid ${on ? T.accent : T.line}`, background: on ? T.accent : "transparent", color: T.onAccent, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      {on && <Check size={13} />}
                    </span>
                    <span style={{ flex: 1 }}>{u.name}</span>
                    <span style={{ color: T.muted }}>{money(u.price)}{u.extra_duration_minutes ? `, +${u.extra_duration_minutes} min` : ""}</span>
                  </div>
                </Choice>
              );
            })}
          </div>
        </div>
      )}

      {serviceStaff.length > 1 && (
        <div>
          <div style={label}>Com quem</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Choice selected={staffId === "any"} onClick={() => setStaffId("any")} style={{ width: "auto", padding: "9px 16px", borderRadius: 999 }}>
              <span style={{ fontSize: 15, fontWeight: 500 }}>Sem preferência</span>
            </Choice>
            {serviceStaff.map((s) => (
              <Choice key={s.id} selected={s.id === staffId} onClick={() => setStaffId(s.id)} style={{ width: "auto", padding: "9px 16px", display: "flex", alignItems: "center", gap: 8, borderRadius: 999 }}>
                {s.photo_url && <img src={s.photo_url} alt="" style={{ width: 26, height: 26, borderRadius: "50%", objectFit: "cover" }} />}
                <span style={{ fontSize: 15, fontWeight: 500 }}>{s.name}</span>
              </Choice>
            ))}
          </div>
        </div>
      )}

      <div>
        <div style={label}>Dia</div>
        <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 6 }}>
          {days.map((d) => {
            const key = toDateKey(d);
            const on = key === date;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setDate(key)}
                style={{
                  ...T.body, flexShrink: 0, width: 60, padding: "10px 0", borderRadius: 12, cursor: "pointer", textAlign: "center",
                  border: `1px solid ${on ? T.accent : T.line}`, background: on ? T.accent : T.surface, color: on ? T.onAccent : T.ink,
                }}
              >
                <div style={{ fontSize: 12.5, opacity: 0.8 }}>{capitalize(d.toLocaleDateString("pt-PT", { weekday: "short" }).replace(".", ""))}</div>
                <div style={{ fontSize: 19, fontWeight: 500, lineHeight: 1.35 }}>{d.getDate()}</div>
                <div style={{ fontSize: 12.5, opacity: 0.8 }}>{capitalize(d.toLocaleDateString("pt-PT", { month: "short" }).replace(".", ""))}</div>
              </button>
            );
          })}
        </div>
      </div>

      {date && (
        <div>
          <div style={label}>Hora{extraMinutes > 0 ? `, duração ${durationLabel(service.duration_minutes + extraMinutes)}` : ""}</div>
          {loadingSlots ? (
            <div style={{ fontSize: 15, color: T.muted }}>A procurar horários livres…</div>
          ) : slots.length === 0 ? (
            <div style={{ fontSize: 15, color: T.muted }}>Sem horários livres neste dia. Experimente outro dia.</div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(76px, 1fr))", gap: 8 }}>
              {slots.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setChosenSlot(s)}
                  style={{
                    ...T.body, fontSize: 15, fontWeight: 500, borderRadius: 10, padding: "11px 0", cursor: "pointer",
                    border: `1px solid ${chosenSlot === s ? T.accent : T.line}`, background: chosenSlot === s ? T.accent : T.surface,
                    color: chosenSlot === s ? T.onAccent : T.ink,
                  }}
                >
                  {timeLabel(s)}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {chosenSlot && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16, borderTop: `1px solid ${T.line}`, paddingTop: 22 }}>
          {usablePacks.length > 0 && (
            <div>
              <div style={label}>Pagamento</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {usablePacks.map((p) => (
                  <Choice key={p.id} selected={packId === p.id} onClick={() => setPackId(p.id)}>
                    <div style={{ fontSize: 15, fontWeight: 500 }}>Usar o {p.name}</div>
                    <div style={{ fontSize: 14, color: T.muted, marginTop: 2 }}>Restam {p.sessions_total - p.sessions_used} de {p.sessions_total} sessões</div>
                  </Choice>
                ))}
                <Choice selected={!packId} onClick={() => setPackId("")}>
                  <div style={{ fontSize: 15, fontWeight: 500 }}>Pagar no dia</div>
                </Choice>
              </div>
            </div>
          )}

          <div style={{ fontSize: 15, color: T.ink, background: T.soft, borderRadius: 12, padding: "14px 16px", lineHeight: 1.6 }}>
            <div style={{ fontWeight: 500 }}>{service.name}{chosenUpsells.length ? ` e ${chosenUpsells.map((u) => u.name).join(", ")}` : ""}</div>
            <div style={{ color: T.muted }}>
              {capitalize(new Date(chosenSlot).toLocaleDateString("pt-PT", { weekday: "long", day: "numeric", month: "long" }))}, às {timeLabel(chosenSlot)}
            </div>
            {packId ? (
              <div style={{ color: T.muted }}>Pago com o seu pack</div>
            ) : totalPrice > 0 ? (
              <div style={{ color: T.muted }}>{hasRange ? "Desde" : "Total"}: <span style={{ color: T.ink, fontWeight: 500 }}>{money(totalPrice)}</span></div>
            ) : null}
            {depositApplies === true && (
              <div style={{ marginTop: 8 }}>
                Para confirmar, paga agora um sinal de {deposit.percentage}% ({money(depositAmount)}). O restante é pago no dia.
              </div>
            )}
            {depositApplies === null && (
              <div style={{ marginTop: 8, color: T.muted, fontSize: 14 }}>
                Primeira visita? Para confirmar pedimos um sinal de {deposit.percentage}% ({money(depositAmount)}).
              </div>
            )}
          </div>

          {!client && (
            <>
              <div>
                <div style={label}>Nome</div>
                <input style={field} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
              </div>
              <div>
                <div style={label}>Telemóvel</div>
                <input style={field} value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="tel" placeholder="912 345 678" />
              </div>
              <div>
                <div style={label}>Email (opcional com telemóvel)</div>
                <input style={field} value={email} onChange={(e) => setEmail(e.target.value)} inputMode="email" autoComplete="email" />
              </div>
            </>
          )}

          {error && <div style={{ fontSize: 14.5, color: c.rose }}>{error}</div>}
          <button
            type="button"
            onClick={confirm}
            disabled={submitting}
            style={{ ...T.body, width: "100%", fontSize: 16, fontWeight: 500, letterSpacing: "0.02em", color: T.onAccent, background: T.accent, border: "none", borderRadius: 12, padding: 15, cursor: "pointer", minHeight: 52 }}
          >
            {submitting ? "A confirmar…" : depositApplies === true ? "Pagar sinal e confirmar" : "Confirmar marcação"}
          </button>
        </div>
      )}
    </div>
  );
}

// Logótipo (ou nome) da marca no topo das páginas públicas.
export function BrandHeader({ brand, style, subtitle, center }) {
  const logo = style?.logoUrl || brand.logo_url;
  return (
    <div style={{ marginBottom: 22, textAlign: center ? "center" : "left" }}>
      {logo ? (
        <img src={logo} alt={brand.name} style={{ maxHeight: 52, maxWidth: "60%", display: center ? "inline-block" : "block", marginBottom: 12 }} />
      ) : (
        <h1 style={{ ...T.title, fontSize: 26, color: T.ink, margin: "0 0 6px" }}>{brand.name}</h1>
      )}
      {subtitle && <div style={{ ...T.body, fontSize: 15, color: T.muted }}>{subtitle}</div>}
    </div>
  );
}
