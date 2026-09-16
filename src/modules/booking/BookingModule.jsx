import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase, invokeFunction } from "../../lib/supabaseClient.js";
import { c, sans, serif, Eyebrow, Modal, inputStyle, btnPrimary, btnGhost, PAGE_FONT_OPTIONS, PAGE_COLOR_SWATCHES, DEFAULT_PAGE_STYLE } from "../../shared/theme.jsx";
import { ArrowLeft, Plus, Trash2, Pencil, Link2, CheckCircle2, Calendar as CalendarIcon, User, History } from "lucide-react";

/* ---------------------------------------------------------
   AGENDAMENTO / MARCAÇÕES — v2
   Módulo do EMPOWER OS. Ver docs/EMPOWER_OS_ARCHITECTURE_STRATEGY.md
   (Adenda 2). Agora com profissionais (cada um com a sua própria
   agenda/disponibilidade/férias), upsells por serviço, histórico do
   cliente, e lembretes automáticos (confirmação, 24h, 1h, pós-visita)
   por WhatsApp/Email — reaproveita as mesmas contas já ligadas nesses
   módulos, não pede nada novo.

   Ainda sem ligação ao Google Calendar (OAuth a sério — ver
   docs/GUIA_GOOGLE_CALENDAR.md) e sem canal de SMS (sem fornecedor
   ligado) — os lembretes são só WhatsApp/Email.
--------------------------------------------------------- */

const WEEKDAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const REMINDER_TYPES = [
  { value: "confirmation", label: "Confirmação (ao marcar)" },
  { value: "reminder_24h", label: "Lembrete 24h antes" },
  { value: "reminder_1h", label: "Lembrete 1h antes" },
  { value: "post_visit", label: "Pós-visita" },
];

const publicBookingUrl = (slug) => `${window.location.origin}/agendar/${slug}`;
const money = (v) => (v == null ? "—" : new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(v));

/* ---------------------------------------------------------
   DATA — profissionais
--------------------------------------------------------- */
function useStaff(brandId) {
  return useQuery({
    queryKey: ["booking_staff", brandId],
    enabled: !!brandId,
    queryFn: async () => {
      const { data, error } = await supabase.from("booking_staff").select("*").eq("brand_id", brandId).order("created_at");
      if (error) throw error;
      return data;
    },
  });
}
function useSaveStaff(brandId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, name, email }) => {
      if (id) {
        const { error } = await supabase.from("booking_staff").update({ name, email }).eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("booking_staff").insert({ brand_id: brandId, name, email });
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["booking_staff", brandId] }),
  });
}
function useDeleteStaff(brandId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from("booking_staff").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["booking_staff", brandId] }),
  });
}

/* ---------------------------------------------------------
   DATA — serviços + upsells
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
    mutationFn: async ({ id, name, description, price, durationMinutes }) => {
      const payload = { name, description, price: price === "" ? null : Number(price), duration_minutes: Number(durationMinutes) };
      if (id) {
        const { error } = await supabase.from("booking_services").update(payload).eq("id", id);
        if (error) throw error;
        return id;
      }
      const { data, error } = await supabase.from("booking_services").insert({ brand_id: brandId, ...payload }).select().single();
      if (error) throw error;
      return data.id;
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
function useUpsells(serviceId) {
  return useQuery({
    queryKey: ["booking_service_upsells", serviceId],
    enabled: !!serviceId,
    queryFn: async () => {
      const { data, error } = await supabase.from("booking_service_upsells").select("*").eq("service_id", serviceId).order("created_at");
      if (error) throw error;
      return data;
    },
  });
}
function useSaveUpsell(brandId, serviceId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ name, price, extraDurationMinutes }) => {
      const { error } = await supabase.from("booking_service_upsells").insert({
        brand_id: brandId, service_id: serviceId, name, price: price === "" ? null : Number(price), extra_duration_minutes: Number(extraDurationMinutes) || 0,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["booking_service_upsells", serviceId] }),
  });
}
function useDeleteUpsell(serviceId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from("booking_service_upsells").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["booking_service_upsells", serviceId] }),
  });
}

/* ---------------------------------------------------------
   DATA — disponibilidade + férias, por profissional
--------------------------------------------------------- */
function useAvailability(staffId) {
  return useQuery({
    queryKey: ["booking_availability", staffId],
    enabled: !!staffId,
    queryFn: async () => {
      const { data, error } = await supabase.from("booking_availability").select("*").eq("staff_id", staffId).order("start_time");
      if (error) throw error;
      return data;
    },
  });
}
function useAddAvailability(brandId, staffId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ weekday, startTime, endTime }) => {
      const { error } = await supabase.from("booking_availability").insert({ brand_id: brandId, staff_id: staffId, weekday, start_time: startTime, end_time: endTime });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["booking_availability", staffId] }),
  });
}
function useRemoveAvailability(staffId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from("booking_availability").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["booking_availability", staffId] }),
  });
}
function useTimeOff(staffId) {
  return useQuery({
    queryKey: ["booking_time_off", staffId],
    enabled: !!staffId,
    queryFn: async () => {
      const { data, error } = await supabase.from("booking_time_off").select("*").eq("staff_id", staffId).order("starts_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}
function useAddTimeOff(brandId, staffId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ startsAt, endsAt, reason }) => {
      const { error } = await supabase.from("booking_time_off").insert({ brand_id: brandId, staff_id: staffId, starts_at: startsAt, ends_at: endsAt, reason });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["booking_time_off", staffId] }),
  });
}
function useRemoveTimeOff(staffId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from("booking_time_off").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["booking_time_off", staffId] }),
  });
}

/* ---------------------------------------------------------
   DATA — marcações + lembretes
--------------------------------------------------------- */
function useAppointments(brandId) {
  return useQuery({
    queryKey: ["booking_appointments", brandId],
    enabled: !!brandId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("booking_appointments")
        .select("*, booking_services(name), booking_staff(name)")
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
function useContactHistory(brandId, contactId) {
  return useQuery({
    queryKey: ["booking_contact_history", contactId],
    enabled: !!contactId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("booking_appointments")
        .select("*, booking_services(name), booking_staff(name)")
        .eq("brand_id", brandId).eq("contact_id", contactId)
        .order("starts_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

function useReminderSettings(brandId) {
  return useQuery({
    queryKey: ["booking_reminder_settings", brandId],
    enabled: !!brandId,
    queryFn: async () => {
      const { data, error } = await supabase.from("booking_reminder_settings").select("*").eq("brand_id", brandId);
      if (error) throw error;
      return data;
    },
  });
}
function useSaveReminderSetting(brandId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ type, enabled, channel, messageTemplate, reviewLink }) => {
      const { error } = await supabase.from("booking_reminder_settings").upsert(
        { brand_id: brandId, type, enabled, channel, message_template: messageTemplate, review_link: reviewLink },
        { onConflict: "brand_id,type" }
      );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["booking_reminder_settings", brandId] }),
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

function useBookingStyle(brandId) {
  return useQuery({
    queryKey: ["brand_booking_style", brandId],
    enabled: !!brandId,
    queryFn: async () => {
      const { data, error } = await supabase.from("brands").select("booking_style").eq("id", brandId).maybeSingle();
      if (error) throw error;
      return { ...DEFAULT_PAGE_STYLE, ...(data?.booking_style || {}) };
    },
  });
}
function useUpdateBookingStyle(brandId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (style) => {
      const { error } = await supabase.from("brands").update({ booking_style: style }).eq("id", brandId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["brand_booking_style", brandId] }),
  });
}

/* ---------------------------------------------------------
   PROFISSIONAIS
--------------------------------------------------------- */
function StaffFormModal({ brandId, staff, onClose }) {
  const [name, setName] = useState(staff?.name || "");
  const [email, setEmail] = useState(staff?.email || "");
  const [error, setError] = useState("");
  const saveStaff = useSaveStaff(brandId);

  const save = async () => {
    if (!name.trim()) { setError("O nome é obrigatório."); return; }
    try {
      await saveStaff.mutateAsync({ id: staff?.id, name: name.trim(), email: email.trim() });
      onClose();
    } catch (err) {
      setError(err.message || "Não foi possível guardar.");
    }
  };

  return (
    <Modal title={staff ? "Editar profissional" : "Novo profissional"} onClose={onClose} width={360}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome" />
        <input style={inputStyle} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email (opcional)" />
        {error && <div style={{ ...sans, fontSize: 12.5, color: c.rose }}>{error}</div>}
        <button onClick={save} disabled={saveStaff.isPending} style={{ ...btnPrimary, width: "fit-content" }}>{saveStaff.isPending ? "A guardar…" : "Guardar"}</button>
      </div>
    </Modal>
  );
}

function StaffSection({ brand, selectedStaffId, onSelectStaff }) {
  const staffQuery = useStaff(brand.id);
  const deleteStaff = useDeleteStaff(brand.id);
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const staff = staffQuery.data || [];

  const firstStaffId = staff[0]?.id;
  useEffect(() => {
    if (!selectedStaffId && firstStaffId) onSelectStaff(firstStaffId);
  }, [firstStaffId, selectedStaffId, onSelectStaff]);

  return (
    <div style={{ background: "#fff", border: `1px solid ${c.line}`, borderRadius: 14, padding: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{ ...serif, fontSize: 15.5, color: c.ink }}>Profissionais</div>
        <button onClick={() => { setEditing(null); setShowForm(true); }} style={{ ...btnGhost, padding: "6px 12px" }}><Plus size={12} /> Profissional</button>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {staff.map((s) => (
          <div
            key={s.id}
            onClick={() => onSelectStaff(s.id)}
            style={{
              display: "flex", alignItems: "center", gap: 7, borderRadius: 999, padding: "6px 6px 6px 12px", cursor: "pointer",
              background: selectedStaffId === s.id ? c.boss : c.paper, color: selectedStaffId === s.id ? "#fff" : c.ink,
            }}
          >
            <User size={12} />
            <span style={{ ...sans, fontSize: 12 }}>{s.name}</span>
            <button onClick={(e) => { e.stopPropagation(); setEditing(s); setShowForm(true); }} style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", opacity: 0.75, padding: 3 }}><Pencil size={11} /></button>
            <button onClick={(e) => { e.stopPropagation(); deleteStaff.mutate(s.id); }} style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", opacity: 0.75, padding: 3 }}><Trash2 size={11} /></button>
          </div>
        ))}
        {!staff.length && <div style={{ ...sans, fontSize: 12.5, color: c.mistLight }}>Cria o primeiro profissional (pode ser só tu).</div>}
      </div>
      {showForm && <StaffFormModal brandId={brand.id} staff={editing} onClose={() => setShowForm(false)} />}
    </div>
  );
}

/* ---------------------------------------------------------
   SERVIÇOS + UPSELLS
--------------------------------------------------------- */
function ServiceFormModal({ brandId, service, onClose }) {
  const [name, setName] = useState(service?.name || "");
  const [description, setDescription] = useState(service?.description || "");
  const [price, setPrice] = useState(service?.price ?? "");
  const [durationMinutes, setDurationMinutes] = useState(service?.duration_minutes || 30);
  const [error, setError] = useState("");
  const [savedId, setSavedId] = useState(service?.id || null);
  const [newUpsellName, setNewUpsellName] = useState("");
  const [newUpsellPrice, setNewUpsellPrice] = useState("");
  const [newUpsellMinutes, setNewUpsellMinutes] = useState("");
  const saveService = useSaveService(brandId);
  const upsellsQuery = useUpsells(savedId);
  const saveUpsell = useSaveUpsell(brandId, savedId);
  const deleteUpsell = useDeleteUpsell(savedId);

  const save = async () => {
    if (!name.trim()) { setError("O nome é obrigatório."); return; }
    try {
      const id = await saveService.mutateAsync({ id: service?.id, name: name.trim(), description, price, durationMinutes });
      setSavedId(id);
    } catch (err) {
      setError(err.message || "Não foi possível guardar.");
    }
  };

  const addUpsell = async () => {
    if (!newUpsellName.trim()) return;
    await saveUpsell.mutateAsync({ name: newUpsellName.trim(), price: newUpsellPrice, extraDurationMinutes: newUpsellMinutes });
    setNewUpsellName(""); setNewUpsellPrice(""); setNewUpsellMinutes("");
  };

  return (
    <Modal title={service ? "Editar serviço" : "Novo serviço"} onClose={onClose} width={440}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome (ex: Corte de cabelo)" />
        <textarea rows={2} style={{ ...inputStyle, resize: "vertical" }} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descrição (opcional)" />
        <div style={{ display: "flex", gap: 10 }}>
          <input type="number" style={inputStyle} value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Preço (€)" />
          <input type="number" style={inputStyle} value={durationMinutes} onChange={(e) => setDurationMinutes(e.target.value)} placeholder="Duração (min)" />
        </div>
        {error && <div style={{ ...sans, fontSize: 12.5, color: c.rose }}>{error}</div>}
        <button onClick={save} disabled={saveService.isPending} style={{ ...btnPrimary, width: "fit-content" }}>
          {saveService.isPending ? "A guardar…" : savedId ? "Guardar alterações" : "Criar serviço"}
        </button>

        {savedId && (
          <div style={{ borderTop: `1px solid ${c.line}`, paddingTop: 14, marginTop: 4 }}>
            <div style={{ ...sans, fontSize: 12, fontWeight: 700, color: c.ink, marginBottom: 8 }}>Upsells (extras opcionais)</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
              {(upsellsQuery.data || []).map((u) => (
                <div key={u.id} style={{ display: "flex", alignItems: "center", gap: 8, background: c.paper, borderRadius: 8, padding: "6px 10px" }}>
                  <div style={{ flex: 1, ...sans, fontSize: 12, color: c.ink }}>{u.name} — {money(u.price)} · +{u.extra_duration_minutes}min</div>
                  <button onClick={() => deleteUpsell.mutate(u.id)} style={{ background: "none", border: "none", cursor: "pointer", color: c.mist, padding: 2 }}><Trash2 size={12} /></button>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <input style={{ ...inputStyle, fontSize: 12 }} value={newUpsellName} onChange={(e) => setNewUpsellName(e.target.value)} placeholder="Nome (ex: Brushing)" />
              <input type="number" style={{ ...inputStyle, fontSize: 12, width: 80 }} value={newUpsellPrice} onChange={(e) => setNewUpsellPrice(e.target.value)} placeholder="€" />
              <input type="number" style={{ ...inputStyle, fontSize: 12, width: 80 }} value={newUpsellMinutes} onChange={(e) => setNewUpsellMinutes(e.target.value)} placeholder="+min" />
              <button onClick={addUpsell} style={{ background: "none", border: "none", cursor: "pointer", color: c.boss, padding: 4 }}><Plus size={16} /></button>
            </div>
          </div>
        )}
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
        <button onClick={() => { setEditing(null); setShowForm(true); }} style={{ ...btnGhost, padding: "6px 12px" }}><Plus size={12} /> Serviço</button>
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
   DISPONIBILIDADE + FÉRIAS (por profissional selecionado)
--------------------------------------------------------- */
function AddAvailabilityRow({ brandId, staffId, weekday }) {
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("18:00");
  const addAvailability = useAddAvailability(brandId, staffId);
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
      <input type="time" value={start} onChange={(e) => setStart(e.target.value)} style={{ ...sans, fontSize: 12, border: `1px solid ${c.line}`, borderRadius: 6, padding: "5px 7px" }} />
      <span style={{ ...sans, fontSize: 12, color: c.mist }}>–</span>
      <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} style={{ ...sans, fontSize: 12, border: `1px solid ${c.line}`, borderRadius: 6, padding: "5px 7px" }} />
      <button onClick={() => addAvailability.mutate({ weekday, startTime: start, endTime: end })} disabled={addAvailability.isPending} style={{ background: "none", border: "none", cursor: "pointer", color: c.boss, padding: 4 }}><Plus size={14} /></button>
    </div>
  );
}

function AvailabilitySection({ brand, staffId }) {
  const availabilityQuery = useAvailability(staffId);
  const removeAvailability = useRemoveAvailability(staffId);
  const timeOffQuery = useTimeOff(staffId);
  const addTimeOff = useAddTimeOff(brand.id, staffId);
  const removeTimeOff = useRemoveTimeOff(staffId);
  const [offStart, setOffStart] = useState("");
  const [offEnd, setOffEnd] = useState("");
  const [offReason, setOffReason] = useState("");
  const rules = availabilityQuery.data || [];

  if (!staffId) return null;

  return (
    <>
      <div style={{ background: "#fff", border: `1px solid ${c.line}`, borderRadius: 14, padding: 20 }}>
        <div style={{ ...serif, fontSize: 15.5, color: c.ink, marginBottom: 4 }}>Disponibilidade semanal</div>
        <div style={{ ...sans, fontSize: 11.5, color: c.mist, marginBottom: 14 }}>Repete-se todas as semanas, para este profissional.</div>
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
                <AddAvailabilityRow brandId={brand.id} staffId={staffId} weekday={weekday} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ background: "#fff", border: `1px solid ${c.line}`, borderRadius: 14, padding: 20 }}>
        <div style={{ ...serif, fontSize: 15.5, color: c.ink, marginBottom: 4 }}>Períodos indisponíveis</div>
        <div style={{ ...sans, fontSize: 11.5, color: c.mist, marginBottom: 14 }}>Férias, folgas — bloqueia marcações neste intervalo, para este profissional.</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
          {(timeOffQuery.data || []).map((t) => (
            <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 10, background: c.paper, borderRadius: 8, padding: "8px 12px" }}>
              <div style={{ flex: 1, ...sans, fontSize: 12, color: c.ink }}>
                {new Date(t.starts_at).toLocaleDateString("pt-PT")} – {new Date(t.ends_at).toLocaleDateString("pt-PT")}{t.reason ? ` · ${t.reason}` : ""}
              </div>
              <button onClick={() => removeTimeOff.mutate(t.id)} style={{ background: "none", border: "none", cursor: "pointer", color: c.mist, padding: 2 }}><Trash2 size={12} /></button>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <input type="date" value={offStart} onChange={(e) => setOffStart(e.target.value)} style={{ ...sans, fontSize: 12, border: `1px solid ${c.line}`, borderRadius: 6, padding: "6px 8px" }} />
          <input type="date" value={offEnd} onChange={(e) => setOffEnd(e.target.value)} style={{ ...sans, fontSize: 12, border: `1px solid ${c.line}`, borderRadius: 6, padding: "6px 8px" }} />
          <input value={offReason} onChange={(e) => setOffReason(e.target.value)} placeholder="Motivo (opcional)" style={{ ...sans, fontSize: 12, border: `1px solid ${c.line}`, borderRadius: 6, padding: "6px 8px", flex: 1, minWidth: 120 }} />
          <button
            onClick={() => {
              if (!offStart || !offEnd) return;
              addTimeOff.mutate({ startsAt: `${offStart}T00:00:00`, endsAt: `${offEnd}T23:59:59`, reason: offReason });
              setOffStart(""); setOffEnd(""); setOffReason("");
            }}
            style={{ ...btnGhost, padding: "6px 12px" }}
          >
            <Plus size={12} /> Adicionar
          </button>
        </div>
      </div>
    </>
  );
}

/* ---------------------------------------------------------
   MARCAÇÕES + HISTÓRICO DO CLIENTE
--------------------------------------------------------- */
function ContactHistoryModal({ brand, contactId, contactName, onClose }) {
  const historyQuery = useContactHistory(brand.id, contactId);
  return (
    <Modal title={`Histórico — ${contactName}`} onClose={onClose} width={420}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {(historyQuery.data || []).map((a) => (
          <div key={a.id} style={{ background: c.paper, borderRadius: 8, padding: "10px 12px" }}>
            <div style={{ ...sans, fontSize: 12.5, fontWeight: 600, color: c.ink }}>{a.booking_services?.name}</div>
            <div style={{ ...sans, fontSize: 11, color: c.mist, marginTop: 2 }}>
              {new Date(a.starts_at).toLocaleString("pt-PT")} · {a.booking_staff?.name} · {a.status === "cancelled" ? "Cancelada" : a.status === "completed" ? "Concluída" : "Confirmada"}
            </div>
          </div>
        ))}
        {!historyQuery.data?.length && <div style={{ ...sans, fontSize: 12.5, color: c.mistLight, textAlign: "center", padding: "16px 0" }}>Sem marcações anteriores.</div>}
      </div>
    </Modal>
  );
}

function AppointmentsSection({ brand }) {
  const appointmentsQuery = useAppointments(brand.id);
  const cancelAppointment = useCancelAppointment(brand.id);
  const [historyFor, setHistoryFor] = useState(null);
  const appointments = (appointmentsQuery.data || []).filter((a) => a.status === "confirmed");

  return (
    <div style={{ background: "#fff", border: `1px solid ${c.line}`, borderRadius: 14, padding: 20 }}>
      <div style={{ ...serif, fontSize: 15.5, color: c.ink, marginBottom: 14 }}>Marcações</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {appointments.map((a) => (
          <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 12, background: c.paper, borderRadius: 10, padding: "10px 14px" }}>
            <CalendarIcon size={15} color={c.boss} style={{ flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <button onClick={() => setHistoryFor({ id: a.contact_id, name: a.customer_name })} style={{ ...sans, fontSize: 13, fontWeight: 600, color: c.ink, background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex", alignItems: "center", gap: 5 }}>
                {a.booking_services?.name} — {a.customer_name} <History size={11} color={c.mist} />
              </button>
              <div style={{ ...sans, fontSize: 11, color: c.mist, marginTop: 2 }}>{new Date(a.starts_at).toLocaleString("pt-PT")} · {a.booking_staff?.name || "—"} · {money(a.total_price)}</div>
            </div>
            <button onClick={() => cancelAppointment.mutate(a.id)} style={{ ...sans, fontSize: 11.5, color: c.rose, background: "none", border: `1px solid ${c.line}`, borderRadius: 7, padding: "5px 10px", cursor: "pointer" }}>Cancelar</button>
          </div>
        ))}
        {!appointments.length && <div style={{ ...sans, fontSize: 12, color: c.mistLight, textAlign: "center", padding: "16px 0" }}>Ainda sem marcações.</div>}
      </div>
      {historyFor && <ContactHistoryModal brand={brand} contactId={historyFor.id} contactName={historyFor.name} onClose={() => setHistoryFor(null)} />}
    </div>
  );
}

/* ---------------------------------------------------------
   LEMBRETES
--------------------------------------------------------- */
function ReminderRow({ brand, type, label, setting }) {
  const [enabled, setEnabled] = useState(setting?.enabled ?? false);
  const [channel, setChannel] = useState(setting?.channel || "whatsapp");
  const [template, setTemplate] = useState(setting?.message_template || "");
  const [reviewLink, setReviewLink] = useState(setting?.review_link || "");
  const save = useSaveReminderSetting(brand.id);

  const persist = (patch) => {
    const next = { enabled, channel, messageTemplate: template, reviewLink, ...patch };
    save.mutate({ type, ...next });
  };

  return (
    <div style={{ background: c.paper, borderRadius: 10, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <label style={{ ...sans, fontSize: 12.5, fontWeight: 600, color: c.ink, display: "flex", alignItems: "center", gap: 7 }}>
          <input type="checkbox" checked={enabled} onChange={(e) => { setEnabled(e.target.checked); persist({ enabled: e.target.checked }); }} />
          {label}
        </label>
        <select value={channel} onChange={(e) => { setChannel(e.target.value); persist({ channel: e.target.value }); }} style={{ ...sans, fontSize: 11.5, border: `1px solid ${c.line}`, borderRadius: 6, padding: "4px 7px" }}>
          <option value="whatsapp">WhatsApp</option>
          <option value="email">Email</option>
        </select>
      </div>
      <textarea
        rows={2}
        value={template}
        onChange={(e) => setTemplate(e.target.value)}
        onBlur={() => persist({})}
        placeholder="Mensagem — usa {{nome}}, {{servico}}, {{data}}, {{hora}}"
        style={{ ...sans, fontSize: 12, border: `1px solid ${c.line}`, borderRadius: 7, padding: "7px 9px", outline: "none", resize: "vertical", background: "#fff" }}
      />
      {type === "post_visit" && (
        <input
          value={reviewLink}
          onChange={(e) => setReviewLink(e.target.value)}
          onBlur={() => persist({})}
          placeholder="Link de avaliação (ex: Google My Business)"
          style={{ ...sans, fontSize: 12, border: `1px solid ${c.line}`, borderRadius: 7, padding: "7px 9px", outline: "none", background: "#fff" }}
        />
      )}
    </div>
  );
}

function AppearanceSection({ brand }) {
  const styleQuery = useBookingStyle(brand.id);
  const updateStyle = useUpdateBookingStyle(brand.id);
  const style = styleQuery.data || DEFAULT_PAGE_STYLE;

  return (
    <div style={{ background: "#fff", border: `1px solid ${c.line}`, borderRadius: 14, padding: 20 }}>
      <div style={{ ...serif, fontSize: 15.5, color: c.ink, marginBottom: 14 }}>Aparência da página de marcação</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <div style={{ ...sans, fontSize: 11.5, color: c.mist, marginBottom: 6 }}>Cor de destaque</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {PAGE_COLOR_SWATCHES.map((hex) => (
              <button
                key={hex}
                type="button"
                onClick={() => updateStyle.mutate({ ...style, accentColor: hex })}
                style={{ width: 26, height: 26, borderRadius: 999, cursor: "pointer", background: hex, flexShrink: 0, border: style.accentColor === hex ? `2px solid ${c.ink}` : "1px solid rgba(0,0,0,0.1)" }}
              />
            ))}
            <input
              type="color"
              value={style.accentColor}
              onChange={(e) => updateStyle.mutate({ ...style, accentColor: e.target.value })}
              style={{ width: 30, height: 26, border: `1px solid ${c.line}`, borderRadius: 6, cursor: "pointer", padding: 0, flexShrink: 0 }}
            />
          </div>
        </div>
        <div>
          <div style={{ ...sans, fontSize: 11.5, color: c.mist, marginBottom: 6 }}>Tipo de letra</div>
          <select style={inputStyle} value={style.font} onChange={(e) => updateStyle.mutate({ ...style, font: e.target.value })}>
            {PAGE_FONT_OPTIONS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
          </select>
        </div>
        <div>
          <div style={{ ...sans, fontSize: 11.5, color: c.mist, marginBottom: 6 }}>Logótipo (link da imagem, opcional)</div>
          <input style={inputStyle} defaultValue={style.logoUrl} onBlur={(e) => updateStyle.mutate({ ...style, logoUrl: e.target.value })} placeholder="https://…" />
        </div>
      </div>
    </div>
  );
}

function RemindersSection({ brand }) {
  const settingsQuery = useReminderSettings(brand.id);
  const settings = settingsQuery.data || [];
  return (
    <div style={{ background: "#fff", border: `1px solid ${c.line}`, borderRadius: 14, padding: 20 }}>
      <div style={{ ...serif, fontSize: 15.5, color: c.ink, marginBottom: 4 }}>Lembretes automáticos</div>
      <div style={{ ...sans, fontSize: 11.5, color: c.mist, marginBottom: 14 }}>Por WhatsApp ou Email — reaproveita as contas já ligadas nesses módulos.</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {REMINDER_TYPES.map((rt) => (
          <ReminderRow key={rt.value} brand={brand} type={rt.value} label={rt.label} setting={settings.find((s) => s.type === rt.value)} />
        ))}
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
  const [selectedStaffId, setSelectedStaffId] = useState(null);

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
        <StaffSection brand={brand} selectedStaffId={selectedStaffId} onSelectStaff={setSelectedStaffId} />
        <ServicesSection brand={brand} />
        <AvailabilitySection brand={brand} staffId={selectedStaffId} />
        <AppointmentsSection brand={brand} />
        <RemindersSection brand={brand} />
        <AppearanceSection brand={brand} />
      </div>
    </div>
  );
}

/* ---------------------------------------------------------
   PÁGINA PÚBLICA — /agendar/:slug
--------------------------------------------------------- */
export function PublicBookingPage() {
  const { slug } = useParams();
  const [state, setState] = useState({ loading: true, error: null, brand: null, services: [], staff: [] });
  const [serviceId, setServiceId] = useState("");
  const [staffId, setStaffId] = useState("");
  const [upsells, setUpsells] = useState([]);
  const [selectedUpsellIds, setSelectedUpsellIds] = useState([]);
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
      .select("id, name, booking_style")
      .eq("booking_slug", slug)
      .maybeSingle()
      .then(async ({ data, error: err }) => {
        if (!active) return;
        if (err || !data) {
          setState({ loading: false, error: "Página não encontrada.", brand: null, services: [], staff: [] });
          return;
        }
        const [{ data: services }, { data: staffList }] = await Promise.all([
          supabase.from("booking_services").select("*").eq("brand_id", data.id).eq("status", "active"),
          supabase.from("booking_staff").select("id, name").eq("brand_id", data.id).eq("status", "active"),
        ]);
        if (!active) return;
        setState({ loading: false, error: null, brand: data, services: services || [], staff: staffList || [] });
        if (services?.length) setServiceId(services[0].id);
        if (staffList?.length) setStaffId(staffList[0].id);
      });
    return () => { active = false; };
  }, [slug]);

  useEffect(() => {
    if (!serviceId) { setUpsells([]); return; }
    let active = true;
    supabase.from("booking_service_upsells").select("*").eq("service_id", serviceId).then(({ data }) => { if (active) setUpsells(data || []); });
    setSelectedUpsellIds([]);
    return () => { active = false; };
  }, [serviceId]);

  useEffect(() => {
    if (!serviceId || !staffId || !date || !state.brand) { setSlots([]); return; }
    let active = true;
    setLoadingSlots(true);
    setChosenSlot(null);
    invokeFunction("booking-availability", { brandId: state.brand.id, serviceId, staffId, date, upsellIds: selectedUpsellIds })
      .then((data) => { if (active) setSlots(data.slots || []); })
      .catch(() => { if (active) setSlots([]); })
      .finally(() => { if (active) setLoadingSlots(false); });
    return () => { active = false; };
  }, [serviceId, staffId, date, state.brand, selectedUpsellIds]);

  const toggleUpsell = (id) => setSelectedUpsellIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  const confirm = async () => {
    setError("");
    if (!name.trim()) { setError("Escreve o teu nome."); return; }
    if (!phone.trim() && !email.trim()) { setError("Escreve o telefone ou o email."); return; }
    setSubmitting(true);
    try {
      await invokeFunction("booking-create", {
        brandId: state.brand.id, serviceId, staffId, startsAt: chosenSlot, upsellIds: selectedUpsellIds,
        name: name.trim(), phone: phone.trim(), email: email.trim(),
      });
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
  const extraMinutes = upsells.filter((u) => selectedUpsellIds.includes(u.id)).reduce((sum, u) => sum + (u.extra_duration_minutes || 0), 0);
  const totalPrice = (service?.price || 0) + upsells.filter((u) => selectedUpsellIds.includes(u.id)).reduce((sum, u) => sum + (u.price || 0), 0);
  const bookingStyle = { ...DEFAULT_PAGE_STYLE, ...(state.brand.booking_style || {}) };
  const titleFont = { fontFamily: `'${bookingStyle.font}', serif` };
  const bodyFont = { fontFamily: `'${bookingStyle.font}', sans-serif` };

  return (
    <div style={{ minHeight: "100vh", background: c.paper, display: "flex", justifyContent: "center", padding: "60px 20px", boxSizing: "border-box" }}>
      <div style={{ width: "100%", maxWidth: 460 }}>
        <div style={{ background: "#fff", borderRadius: 20, padding: "32px 28px", boxShadow: "0 12px 30px rgba(30,20,50,0.1)" }}>
          {bookingStyle.logoUrl && <img src={bookingStyle.logoUrl} alt="" style={{ maxHeight: 44, maxWidth: "60%", display: "block", marginBottom: 16 }} />}
          {confirmed ? (
            <div style={{ textAlign: "center", padding: "20px 0" }}>
              <CheckCircle2 size={32} color={bookingStyle.accentColor} style={{ marginBottom: 12 }} />
              <div style={{ ...serif, ...titleFont, fontSize: 19, color: c.ink, marginBottom: 8 }}>Marcação confirmada!</div>
              <div style={{ ...sans, ...bodyFont, fontSize: 13.5, color: c.mist, lineHeight: 1.6 }}>{service?.name} — {new Date(chosenSlot).toLocaleString("pt-PT")}</div>
            </div>
          ) : (
            <>
              <h1 style={{ ...serif, ...titleFont, fontSize: 21, color: c.ink, marginBottom: 4 }}>{state.brand.name}</h1>
              <div style={{ ...sans, ...bodyFont, fontSize: 13, color: c.mist, marginBottom: 20 }}>Marca o teu horário</div>

              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div>
                  <div style={{ ...sans, fontSize: 12.5, fontWeight: 600, color: "#2A2438", marginBottom: 6 }}>Serviço</div>
                  <select style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }} value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
                    {state.services.map((s) => <option key={s.id} value={s.id}>{s.name} — {money(s.price)} · {s.duration_minutes} min</option>)}
                  </select>
                </div>

                {upsells.length > 0 && (
                  <div>
                    <div style={{ ...sans, fontSize: 12.5, fontWeight: 600, color: "#2A2438", marginBottom: 6 }}>Extras (opcional)</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {upsells.map((u) => (
                        <label key={u.id} style={{ ...sans, fontSize: 12.5, color: c.ink, display: "flex", alignItems: "center", gap: 8 }}>
                          <input type="checkbox" checked={selectedUpsellIds.includes(u.id)} onChange={() => toggleUpsell(u.id)} />
                          {u.name} — {money(u.price)} · +{u.extra_duration_minutes}min
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <div style={{ ...sans, fontSize: 12.5, fontWeight: 600, color: "#2A2438", marginBottom: 6 }}>Profissional</div>
                  <select style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }} value={staffId} onChange={(e) => setStaffId(e.target.value)}>
                    {state.staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>

                <div>
                  <div style={{ ...sans, fontSize: 12.5, fontWeight: 600, color: "#2A2438", marginBottom: 6 }}>Dia</div>
                  <input type="date" min={minDate} style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }} value={date} onChange={(e) => setDate(e.target.value)} />
                </div>

                {date && (
                  <div>
                    <div style={{ ...sans, fontSize: 12.5, fontWeight: 600, color: "#2A2438", marginBottom: 6 }}>Hora {extraMinutes > 0 && `(duração total: ${(service?.duration_minutes || 0) + extraMinutes} min)`}</div>
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
                              ...sans, ...bodyFont, fontSize: 12, fontWeight: 600, borderRadius: 8, padding: "8px 12px", cursor: "pointer",
                              border: `1px solid ${chosenSlot === s ? bookingStyle.accentColor : "#E0DAEC"}`, background: chosenSlot === s ? bookingStyle.accentColor : "#fff",
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
                    <div style={{ ...sans, fontSize: 12.5, color: c.mist }}>Total: <strong style={{ color: c.ink }}>{money(totalPrice)}</strong></div>
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
                      style={{ ...sans, ...bodyFont, width: "100%", fontSize: 14, fontWeight: 600, color: "#fff", background: bookingStyle.accentColor, border: "none", borderRadius: 9, padding: "12px", cursor: "pointer" }}
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
