import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase, invokeFunction } from "../../lib/supabaseClient.js";
import { c, sans, serif, Eyebrow, Modal, inputStyle, btnPrimary, btnGhost } from "../../shared/theme.jsx";
import { ArrowLeft, Plus, Trash2, Pencil, Link2, CheckCircle2, Calendar as CalendarIcon } from "lucide-react";

/* ---------------------------------------------------------
   AGENDAMENTO / MARCAÇÕES
   Módulo do EMPOWER OS. Ver docs/EMPOWER_OS_ARCHITECTURE_STRATEGY.md
   (Adenda 2). v1: agenda única por marca (sem separação por
   profissional/recurso), sem exceções de data (feriados) na
   disponibilidade, e sem ligação ao Google Calendar ainda — isso
   é OAuth a sério (com refresh token), fica para um passo seguinte.
--------------------------------------------------------- */

const WEEKDAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

const publicBookingUrl = (slug) => `${window.location.origin}/agendar/${slug}`;

const money = (v) => (v == null ? "—" : new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(v));

/* ---------------------------------------------------------
   DATA
--------------------------------------------------------- */
function useServices(brandId) {
  return useQuery({
    queryKey: ["booking_services", brandId],
    enabled: !!brandId,
    queryFn: async () => {
      const { data, error } = await supabase.from("booking_services").select("*").eq("brand_id", brandId).order("created_at");
      if (error) throw error;
      return data;
    },
  });
}

function useSaveService(brandId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, name, description, price, durationMinutes, color }) => {
      const payload = { name, description, price: price === "" ? null : Number(price), duration_minutes: Number(durationMinutes), color };
      if (id) {
        const { error } = await supabase.from("booking_services").update(payload).eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("booking_services").insert({ brand_id: brandId, ...payload });
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["booking_services", brandId] }),
  });
}

function useDeleteService(brandId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from("booking_services").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["booking_services", brandId] }),
  });
}

function useAvailability(brandId) {
  return useQuery({
    queryKey: ["booking_availability", brandId],
    enabled: !!brandId,
    queryFn: async () => {
      const { data, error } = await supabase.from("booking_availability").select("*").eq("brand_id", brandId).order("start_time");
      if (error) throw error;
      return data;
    },
  });
}

function useAddAvailability(brandId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ weekday, startTime, endTime }) => {
      const { error } = await supabase.from("booking_availability").insert({ brand_id: brandId, weekday, start_time: startTime, end_time: endTime });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["booking_availability", brandId] }),
  });
}

function useRemoveAvailability(brandId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from("booking_availability").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["booking_availability", brandId] }),
  });
}

function useAppointments(brandId) {
  return useQuery({
    queryKey: ["booking_appointments", brandId],
    enabled: !!brandId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("booking_appointments")
        .select("*, booking_services(name)")
        .eq("brand_id", brandId)
        .order("starts_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}

function useCancelAppointment(brandId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from("booking_appointments").update({ status: "cancelled" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["booking_appointments", brandId] }),
  });
}

function useUpdateBookingSlug(brandId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (slug) => {
      const { error } = await supabase.from("brands").update({ booking_slug: slug }).eq("id", brandId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["brand_booking_slug", brandId] }),
  });
}

function useBookingSlug(brandId) {
  return useQuery({
    queryKey: ["brand_booking_slug", brandId],
    enabled: !!brandId,
    queryFn: async () => {
      const { data, error } = await supabase.from("brands").select("booking_slug").eq("id", brandId).maybeSingle();
      if (error) throw error;
      return data?.booking_slug || "";
    },
  });
}

/* ---------------------------------------------------------
   SERVIÇOS
--------------------------------------------------------- */
function ServiceFormModal({ brandId, service, onClose }) {
  const [name, setName] = useState(service?.name || "");
  const [description, setDescription] = useState(service?.description || "");
  const [price, setPrice] = useState(service?.price ?? "");
  const [durationMinutes, setDurationMinutes] = useState(service?.duration_minutes || 30);
  const [error, setError] = useState("");
  const saveService = useSaveService(brandId);

  const save = async () => {
    if (!name.trim()) { setError("O nome é obrigatório."); return; }
    try {
      await saveService.mutateAsync({ id: service?.id, name: name.trim(), description, price, durationMinutes, color: service?.color || "#7C4DE0" });
      onClose();
    } catch (err) {
      setError(err.message || "Não foi possível guardar.");
    }
  };

  return (
    <Modal title={service ? "Editar serviço" : "Novo serviço"} onClose={onClose} width={400}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
          <div style={{ ...sans, fontSize: 11.5, color: c.mist, marginBottom: 5 }}>Nome</div>
          <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Corte de cabelo" />
        </div>
        <div>
          <div style={{ ...sans, fontSize: 11.5, color: c.mist, marginBottom: 5 }}>Descrição (opcional)</div>
          <textarea rows={2} style={{ ...inputStyle, resize: "vertical" }} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={{ ...sans, fontSize: 11.5, color: c.mist, marginBottom: 5 }}>Preço (€)</div>
            <input type="number" style={inputStyle} value={price} onChange={(e) => setPrice(e.target.value)} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ ...sans, fontSize: 11.5, color: c.mist, marginBottom: 5 }}>Duração (min)</div>
            <input type="number" style={inputStyle} value={durationMinutes} onChange={(e) => setDurationMinutes(e.target.value)} />
          </div>
        </div>
        {error && <div style={{ ...sans, fontSize: 12.5, color: c.rose }}>{error}</div>}
        <button onClick={save} disabled={saveService.isPending} style={{ ...btnPrimary, width: "fit-content" }}>
          {saveService.isPending ? "A guardar…" : "Guardar"}
        </button>
      </div>
    </Modal>
  );
}

function ServicesSection({ brand }) {
  const servicesQuery = useServices(brand.id);
  const deleteService = useDeleteService(brand.id);
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);

  return (
    <div style={{ background: "#fff", border: `1px solid ${c.line}`, borderRadius: 14, padding: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{ ...serif, fontSize: 15.5, color: c.ink }}>Serviços</div>
        <button onClick={() => { setEditing(null); setShowForm(true); }} style={{ ...btnGhost, padding: "6px 12px" }}>
          <Plus size={12} /> Serviço
        </button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {(servicesQuery.data || []).map((s) => (
          <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 10, background: c.paper, borderRadius: 10, padding: "10px 14px" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ ...sans, fontSize: 13, fontWeight: 600, color: c.ink }}>{s.name}</div>
              <div style={{ ...sans, fontSize: 11, color: c.mist, marginTop: 2 }}>{money(s.price)} · {s.duration_minutes} min</div>
            </div>
            <button onClick={() => { setEditing(s); setShowForm(true); }} style={{ background: "none", border: "none", cursor: "pointer", color: c.mist, padding: 4 }}><Pencil size={13} /></button>
            <button onClick={() => deleteService.mutate(s.id)} style={{ background: "none", border: "none", cursor: "pointer", color: c.mist, padding: 4 }}><Trash2 size={13} /></button>
          </div>
        ))}
        {!servicesQuery.data?.length && <div style={{ ...sans, fontSize: 12, color: c.mistLight, textAlign: "center", padding: "16px 0" }}>Ainda sem serviços.</div>}
      </div>
      {showForm && <ServiceFormModal brandId={brand.id} service={editing} onClose={() => setShowForm(false)} />}
    </div>
  );
}

/* ---------------------------------------------------------
   DISPONIBILIDADE
--------------------------------------------------------- */
function AddAvailabilityRow({ brandId, weekday }) {
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("18:00");
  const addAvailability = useAddAvailability(brandId);

  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
      <input type="time" value={start} onChange={(e) => setStart(e.target.value)} style={{ ...sans, fontSize: 12, border: `1px solid ${c.line}`, borderRadius: 6, padding: "5px 7px" }} />
      <span style={{ ...sans, fontSize: 12, color: c.mist }}>–</span>
      <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} style={{ ...sans, fontSize: 12, border: `1px solid ${c.line}`, borderRadius: 6, padding: "5px 7px" }} />
      <button
        onClick={() => addAvailability.mutate({ weekday, startTime: start, endTime: end })}
        disabled={addAvailability.isPending}
        style={{ background: "none", border: "none", cursor: "pointer", color: c.boss, padding: 4 }}
      >
        <Plus size={14} />
      </button>
    </div>
  );
}

function AvailabilitySection({ brand }) {
  const availabilityQuery = useAvailability(brand.id);
  const removeAvailability = useRemoveAvailability(brand.id);
  const rules = availabilityQuery.data || [];

  return (
    <div style={{ background: "#fff", border: `1px solid ${c.line}`, borderRadius: 14, padding: 20 }}>
      <div style={{ ...serif, fontSize: 15.5, color: c.ink, marginBottom: 4 }}>Disponibilidade semanal</div>
      <div style={{ ...sans, fontSize: 11.5, color: c.mist, marginBottom: 14 }}>Repete-se todas as semanas. Sem exceções por data (feriados, etc.) por agora.</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {WEEKDAYS.map((label, weekday) => (
          <div key={weekday} style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
            <div style={{ ...sans, fontSize: 12.5, fontWeight: 600, color: c.ink, width: 80, flexShrink: 0, paddingTop: 5 }}>{label}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
              {rules.filter((r) => r.weekday === weekday).map((r) => (
                <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ ...sans, fontSize: 12, color: c.ink, background: c.paper, borderRadius: 6, padding: "4px 9px" }}>{r.start_time.slice(0, 5)} – {r.end_time.slice(0, 5)}</span>
                  <button onClick={() => removeAvailability.mutate(r.id)} style={{ background: "none", border: "none", cursor: "pointer", color: c.mist, padding: 2 }}><Trash2 size={12} /></button>
                </div>
              ))}
              <AddAvailabilityRow brandId={brand.id} weekday={weekday} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------
   MARCAÇÕES
--------------------------------------------------------- */
function AppointmentsSection({ brand }) {
  const appointmentsQuery = useAppointments(brand.id);
  const cancelAppointment = useCancelAppointment(brand.id);
  const appointments = (appointmentsQuery.data || []).filter((a) => a.status !== "cancelled");

  return (
    <div style={{ background: "#fff", border: `1px solid ${c.line}`, borderRadius: 14, padding: 20 }}>
      <div style={{ ...serif, fontSize: 15.5, color: c.ink, marginBottom: 14 }}>Marcações</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {appointments.map((a) => (
          <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 12, background: c.paper, borderRadius: 10, padding: "10px 14px" }}>
            <CalendarIcon size={15} color={c.boss} style={{ flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ ...sans, fontSize: 13, fontWeight: 600, color: c.ink }}>{a.booking_services?.name} — {a.customer_name}</div>
              <div style={{ ...sans, fontSize: 11, color: c.mist, marginTop: 2 }}>{new Date(a.starts_at).toLocaleString("pt-PT")}</div>
            </div>
            <button onClick={() => cancelAppointment.mutate(a.id)} style={{ ...sans, fontSize: 11.5, color: c.rose, background: "none", border: `1px solid ${c.line}`, borderRadius: 7, padding: "5px 10px", cursor: "pointer" }}>
              Cancelar
            </button>
          </div>
        ))}
        {!appointments.length && <div style={{ ...sans, fontSize: 12, color: c.mistLight, textAlign: "center", padding: "16px 0" }}>Ainda sem marcações.</div>}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------
   MÓDULO
--------------------------------------------------------- */
export default function BookingModule({ brand, onBack }) {
  const slugQuery = useBookingSlug(brand.id);
  const updateSlug = useUpdateBookingSlug(brand.id);
  const [slugInput, setSlugInput] = useState("");
  const [copied, setCopied] = useState(false);

  const slug = slugQuery.data || "";
  const effectiveSlug = slugInput || slug;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(publicBookingUrl(slug));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* noop */ }
  };

  return (
    <div className="bb-page" style={{ padding: "8px 40px 60px", maxWidth: 1040 }}>
      <button onClick={onBack} style={{ ...sans, display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: c.mist, background: "none", border: "none", cursor: "pointer", marginBottom: 20 }}>
        <ArrowLeft size={14} /> Voltar à marca
      </button>

      <Eyebrow>Agendamento</Eyebrow>
      <h1 style={{ ...serif, fontSize: 24, color: c.ink, margin: "0 0 16px" }}>Marcações</h1>

      <div style={{ background: "#fff", border: `1px solid ${c.line}`, borderRadius: 14, padding: 18, marginBottom: 24, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ ...sans, fontSize: 11.5, color: c.mist, flexShrink: 0 }}>Página pública de marcação</div>
        {slug ? (
          <button onClick={copyLink} style={{ ...btnGhost, display: "flex", alignItems: "center", gap: 6 }}>
            {copied ? <CheckCircle2 size={13} /> : <Link2 size={13} />} {copied ? "Copiado!" : publicBookingUrl(slug)}
          </button>
        ) : (
          <>
            <input style={{ ...inputStyle, maxWidth: 220 }} value={slugInput} onChange={(e) => setSlugInput(e.target.value)} placeholder="nome-da-marca" />
            <button onClick={() => effectiveSlug && updateSlug.mutate(effectiveSlug)} disabled={!effectiveSlug || updateSlug.isPending} style={btnPrimary}>
              {updateSlug.isPending ? "A guardar…" : "Ativar link"}
            </button>
          </>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 640 }}>
        <ServicesSection brand={brand} />
        <AvailabilitySection brand={brand} />
        <AppointmentsSection brand={brand} />
      </div>
    </div>
  );
}

/* ---------------------------------------------------------
   PÁGINA PÚBLICA — /agendar/:slug
--------------------------------------------------------- */
export function PublicBookingPage() {
  const { slug } = useParams();
  const [state, setState] = useState({ loading: true, error: null, brand: null, services: [] });
  const [serviceId, setServiceId] = useState("");
  const [date, setDate] = useState("");
  const [slots, setSlots] = useState([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [chosenSlot, setChosenSlot] = useState(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    supabase
      .from("brands")
      .select("id, name")
      .eq("booking_slug", slug)
      .maybeSingle()
      .then(async ({ data, error: err }) => {
        if (!active) return;
        if (err || !data) {
          setState({ loading: false, error: "Página não encontrada.", brand: null, services: [] });
          return;
        }
        const { data: services } = await supabase.from("booking_services").select("*").eq("brand_id", data.id).eq("status", "active");
        if (!active) return;
        setState({ loading: false, error: null, brand: data, services: services || [] });
        if (services?.length) setServiceId(services[0].id);
      });
    return () => { active = false; };
  }, [slug]);

  useEffect(() => {
    if (!serviceId || !date || !state.brand) { setSlots([]); return; }
    let active = true;
    setLoadingSlots(true);
    setChosenSlot(null);
    invokeFunction("booking-availability", { brandId: state.brand.id, serviceId, date })
      .then((data) => { if (active) setSlots(data.slots || []); })
      .catch(() => { if (active) setSlots([]); })
      .finally(() => { if (active) setLoadingSlots(false); });
    return () => { active = false; };
  }, [serviceId, date, state.brand]);

  const confirm = async () => {
    setError("");
    if (!name.trim()) { setError("Escreve o teu nome."); return; }
    if (!phone.trim() && !email.trim()) { setError("Escreve o telefone ou o email."); return; }
    setSubmitting(true);
    try {
      await invokeFunction("booking-create", { brandId: state.brand.id, serviceId, startsAt: chosenSlot, name: name.trim(), phone: phone.trim(), email: email.trim() });
      setConfirmed(true);
    } catch (err) {
      setError(err.message || "Não foi possível confirmar.");
    } finally {
      setSubmitting(false);
    }
  };

  if (state.loading) return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", ...sans, color: c.mist }}>A carregar…</div>;
  if (state.error) return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", ...sans, color: c.mist }}>{state.error}</div>;

  const service = state.services.find((s) => s.id === serviceId);
  const minDate = new Date().toISOString().slice(0, 10);

  return (
    <div style={{ minHeight: "100vh", background: c.paper, display: "flex", justifyContent: "center", padding: "60px 20px", boxSizing: "border-box" }}>
      <div style={{ width: "100%", maxWidth: 460 }}>
        <div style={{ background: "#fff", borderRadius: 20, padding: "32px 28px", boxShadow: "0 12px 30px rgba(30,20,50,0.1)" }}>
          {confirmed ? (
            <div style={{ textAlign: "center", padding: "20px 0" }}>
              <CheckCircle2 size={32} color={c.sage} style={{ marginBottom: 12 }} />
              <div style={{ ...serif, fontSize: 19, color: c.ink, marginBottom: 8 }}>Marcação confirmada!</div>
              <div style={{ ...sans, fontSize: 13.5, color: c.mist, lineHeight: 1.6 }}>{service?.name} — {new Date(chosenSlot).toLocaleString("pt-PT")}</div>
            </div>
          ) : (
            <>
              <h1 style={{ ...serif, fontSize: 21, color: c.ink, marginBottom: 4 }}>{state.brand.name}</h1>
              <div style={{ ...sans, fontSize: 13, color: c.mist, marginBottom: 20 }}>Marca o teu horário</div>

              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div>
                  <div style={{ ...sans, fontSize: 12.5, fontWeight: 600, color: "#2A2438", marginBottom: 6 }}>Serviço</div>
                  <select style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }} value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
                    {state.services.map((s) => <option key={s.id} value={s.id}>{s.name} — {money(s.price)} · {s.duration_minutes} min</option>)}
                  </select>
                </div>
                <div>
                  <div style={{ ...sans, fontSize: 12.5, fontWeight: 600, color: "#2A2438", marginBottom: 6 }}>Dia</div>
                  <input type="date" min={minDate} style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }} value={date} onChange={(e) => setDate(e.target.value)} />
                </div>

                {date && (
                  <div>
                    <div style={{ ...sans, fontSize: 12.5, fontWeight: 600, color: "#2A2438", marginBottom: 6 }}>Hora</div>
                    {loadingSlots ? (
                      <div style={{ ...sans, fontSize: 12.5, color: c.mist }}>A ver horários livres…</div>
                    ) : slots.length === 0 ? (
                      <div style={{ ...sans, fontSize: 12.5, color: c.mist }}>Sem horários livres neste dia.</div>
                    ) : (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {slots.map((s) => (
                          <button
                            key={s}
                            onClick={() => setChosenSlot(s)}
                            style={{
                              ...sans, fontSize: 12, fontWeight: 600, borderRadius: 8, padding: "8px 12px", cursor: "pointer",
                              border: `1px solid ${chosenSlot === s ? c.boss : "#E0DAEC"}`, background: chosenSlot === s ? c.boss : "#fff",
                              color: chosenSlot === s ? "#fff" : c.ink,
                            }}
                          >
                            {new Date(s).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {chosenSlot && (
                  <>
                    <div>
                      <div style={{ ...sans, fontSize: 12.5, fontWeight: 600, color: "#2A2438", marginBottom: 6 }}>Nome</div>
                      <input style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }} value={name} onChange={(e) => setName(e.target.value)} />
                    </div>
                    <div>
                      <div style={{ ...sans, fontSize: 12.5, fontWeight: 600, color: "#2A2438", marginBottom: 6 }}>Telefone</div>
                      <input style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }} value={phone} onChange={(e) => setPhone(e.target.value)} />
                    </div>
                    <div>
                      <div style={{ ...sans, fontSize: 12.5, fontWeight: 600, color: "#2A2438", marginBottom: 6 }}>Email (opcional se deres telefone)</div>
                      <input style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }} value={email} onChange={(e) => setEmail(e.target.value)} />
                    </div>
                    {error && <div style={{ ...sans, fontSize: 12.5, color: c.rose }}>{error}</div>}
                    <button
                      onClick={confirm}
                      disabled={submitting}
                      style={{ ...sans, width: "100%", fontSize: 14, fontWeight: 600, color: "#fff", background: c.boss, border: "none", borderRadius: 9, padding: "12px", cursor: "pointer" }}
                    >
                      {submitting ? "A confirmar…" : "Confirmar marcação"}
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
