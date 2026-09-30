import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabaseClient.js";
import { c, sans, serif, Eyebrow, Modal, inputStyle, btnPrimary, btnGhost, PAGE_FONT_OPTIONS, PAGE_COLOR_SWATCHES, DEFAULT_PAGE_STYLE, display } from "../../shared/theme.jsx";
import BookingFlow, { BrandHeader } from "./BookingFlow.jsx";
import { usePublicBookingPage, brandThemeVars, brandStyle, T } from "./publicBooking.js";
import ImportAgendaModal from "./ImportAgendaModal.jsx";
import GhlImportSection from "./GhlImportSection.jsx";
import { MoneyInput, parseMoney, moneyInputValue, ServiceUpsellPicker, useUpsellLinks, useSetServiceUpsells, UpsellLibrarySection, OptionGroupsEditor, normalizeOptionGroups, optionGroupsToForm } from "./ServiceOptions.jsx";
import AgendaCalendar from "./AgendaCalendar.jsx";
import { ClientAppSection, StripeAccountSection, PacksSection } from "./ClientAppAdmin.jsx";
import { ArrowLeft, Plus, Trash2, Pencil, Link2, CheckCircle2, Calendar as CalendarIcon, User, History, Upload, CreditCard } from "lucide-react";

async function uploadStaffPhoto(brandId, staffId, file) {
  const ext = file.name.split(".").pop();
  const path = `${brandId}/staff/${staffId}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("brand-logos").upload(path, file, { upsert: true });
  if (error) throw error;
  const { data } = supabase.storage.from("brand-logos").getPublicUrl(path);
  return data.publicUrl;
}

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
const money = (v) => (v == null ? "—" : new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR", minimumFractionDigits: Number.isInteger(Number(v)) ? 0 : 2, maximumFractionDigits: 2 }).format(v));

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
    mutationFn: async ({ id, name, email, photoUrl }) => {
      if (id) {
        const { error } = await supabase.from("booking_staff").update({ name, email, photo_url: photoUrl }).eq("id", id);
        if (error) throw error;
        return { id };
      } else {
        const { data, error } = await supabase.from("booking_staff").insert({ brand_id: brandId, name, email }).select("id").single();
        if (error) throw error;
        return data;
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
      const { data, error } = await supabase.from("booking_services").select("*").eq("brand_id", brandId).order("sort_order").order("created_at");
      if (error) throw error;
      return data;
    },
  });
}
function useSaveService(brandId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, name, description, price, durationMinutes, priceMax, category, careRecommendations, optionGroups }) => {
      const payload = {
        name, description: description?.trim() || null, price, duration_minutes: Number(durationMinutes),
        price_max: priceMax,
        category: category?.trim() || null, care_recommendations: careRecommendations?.trim() || null,
        option_groups: optionGroups,
      };
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
      // Com marcações (histórico) não se pode apagar: fica arquivado.
      const { error } = await supabase.from("booking_services").delete().eq("id", id);
      if (error?.code === "23503") {
        const { error: archiveError } = await supabase.from("booking_services").update({ status: "archived" }).eq("id", id);
        if (archiveError) throw archiveError;
      } else if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["booking_services", brandId] }),
  });
}
/* ---------------------------------------------------------
   DATA — quem faz cada serviço (booking_service_staff).
   Serviço sem ninguém = qualquer profissional pode fazê-lo.
--------------------------------------------------------- */
function useServiceStaff(brandId) {
  return useQuery({
    queryKey: ["booking_service_staff", brandId],
    enabled: !!brandId,
    queryFn: async () => {
      const { data, error } = await supabase.from("booking_service_staff").select("service_id, staff_id").eq("brand_id", brandId);
      if (error) throw error;
      return data;
    },
  });
}
// Troca todas as ligações de um serviço (column = "service_id") ou de um profissional (column = "staff_id").
function useSetServiceStaff(brandId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ column, id, otherIds }) => {
      const other = column === "service_id" ? "staff_id" : "service_id";
      const { error: delError } = await supabase.from("booking_service_staff").delete().eq("brand_id", brandId).eq(column, id);
      if (delError) throw delError;
      if (!otherIds.length) return;
      const { error } = await supabase.from("booking_service_staff").insert(otherIds.map((o) => ({ brand_id: brandId, [column]: id, [other]: o })));
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["booking_service_staff", brandId] }),
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
    mutationFn: async ({ type, enabled, channel, messageTemplate, reviewLink, visitNumbers, visitMessages }) => {
      const row = { brand_id: brandId, type, enabled, channel, message_template: messageTemplate, review_link: reviewLink };
      if (type === "post_visit") Object.assign(row, { visit_numbers: visitNumbers?.length ? visitNumbers : null, visit_messages: visitMessages || {} });
      const { error } = await supabase.from("booking_reminder_settings").upsert(
        row,
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

function usePaymentSettings(brandId) {
  return useQuery({
    queryKey: ["booking_payment_settings", brandId],
    enabled: !!brandId,
    queryFn: async () => {
      const { data, error } = await supabase.from("booking_payment_settings").select("*").eq("brand_id", brandId).maybeSingle();
      if (error) throw error;
      return data || { enabled: false, percentage: 100, scope: "all", exempt_tag_id: null };
    },
  });
}
function useSavePaymentSettings(brandId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ enabled, percentage, scope, exemptTagId }) => {
      const { error } = await supabase.from("booking_payment_settings").upsert(
        { brand_id: brandId, enabled, percentage, scope, exempt_tag_id: exemptTagId || null, updated_at: new Date().toISOString() },
        { onConflict: "brand_id" }
      );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["booking_payment_settings", brandId] }),
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
function StaffServicesPicker({ services, selected, onChange }) {
  const active = services.filter((sv) => sv.status !== "archived");
  const groups = [...new Set(active.map((sv) => sv.category || "Sem categoria"))];
  const toggle = (ids, on) => onChange(on ? [...new Set([...selected, ...ids])] : selected.filter((x) => !ids.includes(x)));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: 320, overflowY: "auto", border: `1px solid ${c.line}`, borderRadius: 6, padding: 10 }}>
      {groups.map((g) => {
        const ids = active.filter((sv) => (sv.category || "Sem categoria") === g).map((sv) => sv.id);
        const all = ids.every((id) => selected.includes(id));
        return (
          <div key={g}>
            <label style={{ ...sans, fontSize: 13.5, fontWeight: 700, color: c.ink, display: "flex", alignItems: "center", gap: 7 }}>
              <input type="checkbox" checked={all} onChange={(e) => toggle(ids, e.target.checked)} /> {g} (todos)
            </label>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, margin: "4px 0 0 22px" }}>
              {active.filter((sv) => (sv.category || "Sem categoria") === g).map((sv) => (
                <label key={sv.id} style={{ ...sans, fontSize: 13.5, color: c.ink, display: "flex", alignItems: "center", gap: 7 }}>
                  <input type="checkbox" checked={selected.includes(sv.id)} onChange={(e) => toggle([sv.id], e.target.checked)} /> {sv.name}
                </label>
              ))}
            </div>
          </div>
        );
      })}
      {!active.length && <div style={{ ...sans, fontSize: 13.5, color: c.mistLight }}>Cria primeiro os serviços.</div>}
    </div>
  );
}

function StaffFormModal({ brandId, staff, onClose }) {
  const servicesQuery = useServices(brandId);
  const linksQuery = useServiceStaff(brandId);
  const setLinks = useSetServiceStaff(brandId);
  const [serviceIds, setServiceIds] = useState(null);
  const initialServiceIds = (linksQuery.data || []).filter((l) => l.staff_id === staff?.id).map((l) => l.service_id);
  const chosenServiceIds = serviceIds ?? initialServiceIds;
  const [savedId, setSavedId] = useState(staff?.id || null);
  const [name, setName] = useState(staff?.name || "");
  const [email, setEmail] = useState(staff?.email || "");
  const [photoUrl, setPhotoUrl] = useState(staff?.photo_url || "");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const saveStaff = useSaveStaff(brandId);

  const pickPhoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      // Uma pessoa nova ainda não tem id — grava o nome primeiro para
      // ter um id a usar no caminho do ficheiro.
      let id = savedId;
      if (!id) {
        const created = await saveStaff.mutateAsync({ name: name.trim() || "Profissional", email: email.trim() });
        id = created.id;
        setSavedId(id);
      }
      const url = await uploadStaffPhoto(brandId, id, file);
      await saveStaff.mutateAsync({ id, name: name.trim() || "Profissional", email: email.trim(), photoUrl: url });
      setPhotoUrl(url);
    } catch (err) {
      setError(err.message || "Não foi possível enviar a foto.");
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    if (!name.trim()) { setError("O nome é obrigatório."); return; }
    try {
      const saved = await saveStaff.mutateAsync({ id: savedId, name: name.trim(), email: email.trim(), photoUrl });
      if (serviceIds !== null) await setLinks.mutateAsync({ column: "staff_id", id: savedId || saved.id, otherIds: serviceIds });
      onClose();
    } catch (err) {
      setError(err.message || "Não foi possível guardar.");
    }
  };

  return (
    <Modal title={staff ? "Editar profissional" : "Novo profissional"} onClose={onClose} width={480}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 56, height: 56, borderRadius: "50%", overflow: "hidden", background: c.paper, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            {photoUrl ? <img src={photoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <User size={22} color={c.mistLight} />}
          </div>
          <label style={{ ...btnGhost, padding: "6px 12px", cursor: "pointer" }}>
            <Upload size={12} /> {uploading ? "A enviar…" : "Foto"}
            <input type="file" accept="image/*" onChange={pickPhoto} disabled={uploading} style={{ display: "none" }} />
          </label>
        </div>
        <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome" />
        <input style={inputStyle} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email (opcional)" />
        <div>
          <div style={{ ...sans, fontSize: 13.5, fontWeight: 700, color: c.ink, marginBottom: 4 }}>Serviços que faz</div>
          <div style={{ ...sans, fontSize: 12.5, color: c.mist, marginBottom: 8 }}>Só aparece para marcação nos serviços escolhidos. Um serviço sem nenhuma profissional escolhida fica com todas.</div>
          {linksQuery.isSuccess && <StaffServicesPicker services={servicesQuery.data || []} selected={chosenServiceIds} onChange={setServiceIds} />}
        </div>
        {error && <div style={{ ...sans, fontSize: 14, color: c.rose }}>{error}</div>}
        <button onClick={save} disabled={saveStaff.isPending || setLinks.isPending} style={{ ...btnPrimary, width: "fit-content" }}>{saveStaff.isPending ? "A guardar…" : "Guardar"}</button>
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
    <div style={{ background: c.folha, border: `1px solid ${c.line}`, borderRadius: 3, padding: 20 }}>
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
              background: selectedStaffId === s.id ? c.boss : c.paper, color: selectedStaffId === s.id ? c.onBoss : c.ink,
            }}
          >
            {s.photo_url ? (
              <img src={s.photo_url} alt="" style={{ width: 18, height: 18, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
            ) : (
              <User size={12} />
            )}
            <span style={{ ...sans, fontSize: 13.5 }}>{s.name}</span>
            <button onClick={(e) => { e.stopPropagation(); setEditing(s); setShowForm(true); }} style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", opacity: 0.75, padding: 3 }}><Pencil size={11} /></button>
            <button onClick={(e) => { e.stopPropagation(); deleteStaff.mutate(s.id); }} style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", opacity: 0.75, padding: 3 }}><Trash2 size={11} /></button>
          </div>
        ))}
        {!staff.length && <div style={{ ...sans, fontSize: 14, color: c.mistLight }}>Cria o primeiro profissional (pode ser só tu).</div>}
      </div>
      {showForm && <StaffFormModal brandId={brand.id} staff={editing} onClose={() => setShowForm(false)} />}
    </div>
  );
}

/* ---------------------------------------------------------
   SERVIÇOS + UPSELLS
--------------------------------------------------------- */
function ServiceFormModal({ brandId, service, categories, staff, links, upsellLinks, onClose }) {
  const setLinks = useSetServiceStaff(brandId);
  const [staffIds, setStaffIds] = useState(() => (links || []).filter((l) => l.service_id === service?.id).map((l) => l.staff_id));
  const toggleStaff = (id) => setStaffIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  const [name, setName] = useState(service?.name || "");
  const [category, setCategory] = useState(service?.category || "");
  const [priceMax, setPriceMax] = useState(moneyInputValue(service?.price_max));
  const [careRecommendations, setCareRecommendations] = useState(service?.care_recommendations || "");
  const [description, setDescription] = useState(service?.description || "");
  const [price, setPrice] = useState(moneyInputValue(service?.price));
  const [durationMinutes, setDurationMinutes] = useState(service?.duration_minutes || 30);
  const [error, setError] = useState("");
  const [savedId, setSavedId] = useState(service?.id || null);
  const [optionGroups, setOptionGroups] = useState(() => optionGroupsToForm(service?.option_groups));
  const [upsellIds, setUpsellIds] = useState(() => (upsellLinks || []).filter((l) => l.service_id === service?.id).map((l) => l.upsell_id));
  const [saved, setSaved] = useState(false);
  const saveService = useSaveService(brandId);
  const setServiceUpsells = useSetServiceUpsells(brandId);

  const save = async () => {
    setError("");
    if (!name.trim()) { setError("O nome é obrigatório."); return; }
    const p = parseMoney(price);
    const pMax = parseMoney(priceMax);
    if (Number.isNaN(p) || Number.isNaN(pMax)) { setError("O preço não parece válido (ex: 12,50)."); return; }
    if (!(parseInt(durationMinutes, 10) > 0)) { setError("Indica a duração em minutos."); return; }
    try {
      const groups = normalizeOptionGroups(optionGroups);
      const id = await saveService.mutateAsync({ id: savedId, name: name.trim(), description, price: p, durationMinutes, priceMax: pMax, category, careRecommendations, optionGroups: groups });
      await setLinks.mutateAsync({ column: "service_id", id, otherIds: staffIds });
      await setServiceUpsells.mutateAsync({ serviceId: id, upsellIds });
      setSavedId(id);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err.message || "Não foi possível guardar.");
    }
  };

  return (
    <Modal title={service ? "Editar serviço" : "Novo serviço"} onClose={onClose} width={440}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome (ex: Corte de cabelo)" />
        <input style={inputStyle} list="booking-service-categories" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Categoria (ex: Cabelo)" />
        <datalist id="booking-service-categories">{categories.map((cat) => <option key={cat} value={cat} />)}</datalist>
        <textarea rows={2} style={{ ...inputStyle, resize: "vertical" }} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Breve explicação (opcional, a cliente vê)" />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 10 }}>
          <label style={{ ...sans, fontSize: 12.5, color: c.mist }}>Preço (€)<MoneyInput style={{ marginTop: 4 }} value={price} onChange={setPrice} placeholder="0,00" /></label>
          <label style={{ ...sans, fontSize: 12.5, color: c.mist }}>Até (€, opcional)<MoneyInput style={{ marginTop: 4 }} value={priceMax} onChange={setPriceMax} /></label>
          <label style={{ ...sans, fontSize: 12.5, color: c.mist }}>Duração (min)<input type="number" style={{ ...inputStyle, marginTop: 4 }} value={durationMinutes} onChange={(e) => setDurationMinutes(e.target.value)} /></label>
        </div>
        {staff.length > 0 && (
          <div>
            <div style={{ ...sans, fontSize: 12.5, color: c.mist, marginBottom: 6 }}>Quem faz este serviço (nenhuma escolhida = todas)</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {staff.map((st) => (
                <label key={st.id} style={{ ...sans, fontSize: 13.5, color: c.ink, display: "flex", alignItems: "center", gap: 6, background: c.paper, borderRadius: 999, padding: "5px 12px" }}>
                  <input type="checkbox" checked={staffIds.includes(st.id)} onChange={() => toggleStaff(st.id)} /> {st.name}
                </label>
              ))}
            </div>
          </div>
        )}
        <textarea rows={3} style={{ ...inputStyle, resize: "vertical" }} value={careRecommendations} onChange={(e) => setCareRecommendations(e.target.value)} placeholder="Recomendações de cuidado depois do serviço (a cliente vê na app)" />
        <div style={{ borderTop: `1px solid ${c.line}`, paddingTop: 14 }}>
          <OptionGroupsEditor groups={optionGroups} onChange={setOptionGroups} basePrice={parseMoney(price) || 0} baseMinutes={durationMinutes} />
        </div>
        <div style={{ borderTop: `1px solid ${c.line}`, paddingTop: 14 }}>
          <ServiceUpsellPicker brandId={brandId} selected={upsellIds} onChange={setUpsellIds} />
        </div>
        {error && <div style={{ ...sans, fontSize: 14, color: c.rose }}>{error}</div>}
        <button onClick={save} disabled={saveService.isPending || setServiceUpsells.isPending} style={{ ...btnPrimary, width: "fit-content" }}>
          {saveService.isPending || setServiceUpsells.isPending ? "A guardar…" : saved ? "Guardado ✓" : savedId ? "Guardar alterações" : "Criar serviço"}
        </button>
      </div>
    </Modal>
  );
}

function ServicesSection({ brand }) {
  const servicesQuery = useServices(brand.id);
  const staffQuery = useStaff(brand.id);
  const linksQuery = useServiceStaff(brand.id);
  const upsellLinksQuery = useUpsellLinks(brand.id);
  const staffList = (staffQuery.data || []).filter((st) => st.status !== "archived");
  const links = linksQuery.data || [];
  const staffNames = (serviceId) => links.filter((l) => l.service_id === serviceId).map((l) => staffList.find((st) => st.id === l.staff_id)?.name).filter(Boolean);
  const deleteService = useDeleteService(brand.id);
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const services = servicesQuery.data || [];
  const categories = [...new Set(services.map((s) => s.category).filter(Boolean))];

  return (
    <div style={{ background: c.folha, border: `1px solid ${c.line}`, borderRadius: 3, padding: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{ ...serif, fontSize: 15.5, color: c.ink }}>Serviços</div>
        <button onClick={() => { setEditing(null); setShowForm(true); }} style={{ ...btnGhost, padding: "6px 12px" }}><Plus size={12} /> Serviço</button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 520, overflowY: "auto" }}>
        {services.map((s, i) => (
          <div key={s.id}>
          {(s.category || "Sem categoria") !== (services[i - 1]?.category || "Sem categoria") || i === 0 ? (
            <div style={{ ...sans, fontSize: 12.5, fontWeight: 700, color: c.mist, margin: i === 0 ? "0 0 6px" : "10px 0 6px" }}>{s.category || "Sem categoria"}</div>
          ) : null}
          <div style={{ display: "flex", alignItems: "center", gap: 10, background: c.paper, borderRadius: 6, padding: "10px 14px", opacity: s.status === "archived" ? 0.55 : 1 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ ...sans, fontSize: 14.5, fontWeight: 600, color: c.ink }}>{s.name}</div>
              <div style={{ ...sans, fontSize: 12.5, color: c.mist, marginTop: 2 }}>
                {money(s.price)}{s.price_max ? ` a ${money(s.price_max)}` : ""}, {s.duration_minutes} min
                {s.option_groups?.length ? `, ${s.option_groups.length === 1 ? `${s.option_groups[0].choices.length} opções de ${s.option_groups[0].name.toLowerCase()}` : `${s.option_groups.length} grupos de opções`}` : ""}
                {s.status === "archived" ? ", arquivado (só histórico)" : ""}
              </div>
              {s.status !== "archived" && staffList.length > 1 && (
                <div style={{ ...sans, fontSize: 12.5, marginTop: 2, color: staffNames(s.id).length ? c.mist : c.amber }}>
                  {staffNames(s.id).length ? staffNames(s.id).join(", ") : "Todas as profissionais"}
                </div>
              )}
            </div>
            <button onClick={() => { setEditing(s); setShowForm(true); }} style={{ background: "none", border: "none", cursor: "pointer", color: c.mist, padding: 4 }}><Pencil size={13} /></button>
            <button onClick={() => deleteService.mutate(s.id)} style={{ background: "none", border: "none", cursor: "pointer", color: c.mist, padding: 4 }}><Trash2 size={13} /></button>
          </div>
          </div>
        ))}
        {!servicesQuery.data?.length && <div style={{ ...sans, fontSize: 13.5, color: c.mistLight, textAlign: "center", padding: "16px 0" }}>Ainda sem serviços.</div>}
      </div>
      {showForm && <ServiceFormModal key={editing?.id || "new"} brandId={brand.id} service={editing} categories={categories} staff={staffList} links={links} upsellLinks={upsellLinksQuery.data || []} onClose={() => setShowForm(false)} />}
    </div>
  );
}

/* ---------------------------------------------------------
   HORÁRIO + FÉRIAS (por profissional)
   Cada dia da semana está "a trabalhar" (com um ou mais intervalos,
   ex: 09:00–13:00 e 14:00–19:00) ou de folga. O horário edita-se
   todo de uma vez e "Guardar horário" substitui o que estava gravado
   para essa profissional (booking_availability).
--------------------------------------------------------- */
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]; // segunda primeiro
const timeInput = { ...sans, fontSize: 14, border: `1px solid ${c.lineStrong}`, borderRadius: 6, padding: "6px 8px", background: c.folha, color: c.ink };

function useReplaceAvailability(brandId, staffId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (days) => {
      const rows = [];
      for (const [weekday, day] of Object.entries(days)) {
        if (!day.works) continue;
        for (const iv of day.intervals) {
          if (!iv.start || !iv.end) continue;
          if (iv.end <= iv.start) throw new Error(`${WEEKDAYS[weekday]}: a hora de fim tem de ser depois da de início.`);
          rows.push({ brand_id: brandId, staff_id: staffId, weekday: Number(weekday), start_time: iv.start, end_time: iv.end });
        }
      }
      const { error: delError } = await supabase.from("booking_availability").delete().eq("staff_id", staffId);
      if (delError) throw delError;
      if (rows.length) {
        const { error } = await supabase.from("booking_availability").insert(rows);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["booking_availability", staffId] }),
  });
}

function WeeklyScheduleEditor({ brandId, staffId, staffName }) {
  const availabilityQuery = useAvailability(staffId);
  const replace = useReplaceAvailability(brandId, staffId);
  const [days, setDays] = useState(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  // Rascunho a partir do que está gravado.
  useEffect(() => {
    if (!availabilityQuery.isSuccess) return;
    const next = {};
    for (let wd = 0; wd < 7; wd++) {
      const rules = availabilityQuery.data.filter((r) => r.weekday === wd).sort((a, b) => a.start_time.localeCompare(b.start_time));
      next[wd] = rules.length
        ? { works: true, intervals: rules.map((r) => ({ start: r.start_time.slice(0, 5), end: r.end_time.slice(0, 5) })) }
        : { works: false, intervals: [{ start: "09:00", end: "19:00" }] };
    }
    setDays(next);
  }, [availabilityQuery.isSuccess, availabilityQuery.data]);

  if (!days) return <div style={{ ...sans, fontSize: 14, color: c.mist }}>A carregar…</div>;

  const edit = (wd, fn) => { setSaved(false); setDays((d) => ({ ...d, [wd]: fn(d[wd]) })); };
  const setIv = (wd, i, key, value) => edit(wd, (day) => ({ ...day, intervals: day.intervals.map((iv, j) => (j === i ? { ...iv, [key]: value } : iv)) }));
  const copyMonday = () => {
    setSaved(false);
    setDays((d) => {
      const next = { ...d };
      for (const wd of [2, 3, 4, 5, 6, 0]) if (next[wd].works) next[wd] = { works: true, intervals: d[1].intervals.map((iv) => ({ ...iv })) };
      return next;
    });
  };
  const save = async () => {
    setError("");
    try {
      await replace.mutateAsync(days);
      setSaved(true);
    } catch (err) {
      setError(err.message || "Não foi possível guardar.");
    }
  };

  return (
    <div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        {WEEK_ORDER.map((wd) => {
          const day = days[wd];
          return (
            <div key={wd} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "10px 0", borderTop: `1px solid ${c.line}`, flexWrap: "wrap" }}>
              <div style={{ ...sans, fontSize: 14, fontWeight: 700, color: c.ink, width: 72, paddingTop: 7 }}>{WEEKDAYS[wd]}</div>
              <div style={{ display: "flex", background: c.paper, borderRadius: 999, padding: 3, height: "fit-content" }}>
                {[[true, "Trabalha"], [false, "Folga"]].map(([value, lbl]) => (
                  <button
                    key={lbl}
                    type="button"
                    onClick={() => edit(wd, (dd) => ({ ...dd, works: value }))}
                    style={{ ...sans, fontSize: 13, fontWeight: 700, border: "none", borderRadius: 999, padding: "5px 12px", cursor: "pointer", background: day.works === value ? (value ? c.boss : c.folha) : "transparent", color: day.works === value ? (value ? c.onBoss : c.ink) : c.mist }}
                  >
                    {lbl}
                  </button>
                ))}
              </div>
              {day.works && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: "1 1 220px" }}>
                  {day.intervals.map((iv, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <input type="time" value={iv.start} onChange={(e) => setIv(wd, i, "start", e.target.value)} style={timeInput} />
                      <span style={{ ...sans, fontSize: 13.5, color: c.mist }}>até</span>
                      <input type="time" value={iv.end} onChange={(e) => setIv(wd, i, "end", e.target.value)} style={timeInput} />
                      {day.intervals.length > 1 && (
                        <button type="button" onClick={() => edit(wd, (dd) => ({ ...dd, intervals: dd.intervals.filter((_, j) => j !== i) }))} style={{ background: "none", border: "none", cursor: "pointer", color: c.mist, padding: 4 }} aria-label="Remover intervalo"><Trash2 size={13} /></button>
                      )}
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => edit(wd, (dd) => ({ ...dd, intervals: [...dd.intervals, { start: "14:00", end: "19:00" }] }))}
                    style={{ ...sans, fontSize: 12.5, color: c.bossText, background: "none", border: "none", cursor: "pointer", padding: 0, textAlign: "left", width: "fit-content" }}
                  >
                    + Outro intervalo (ex: depois do almoço)
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", borderTop: `1px solid ${c.line}`, paddingTop: 14 }}>
        <button type="button" onClick={save} disabled={replace.isPending} style={btnPrimary}>{replace.isPending ? "A guardar…" : `Guardar horário de ${staffName}`}</button>
        {days[1].works && <button type="button" onClick={copyMonday} style={btnGhost}>Copiar segunda para os outros dias de trabalho</button>}
        {saved && <span style={{ ...sans, fontSize: 13.5, color: c.sage, display: "flex", alignItems: "center", gap: 5 }}><CheckCircle2 size={14} /> Guardado</span>}
      </div>
      {error && <div style={{ ...sans, fontSize: 14, color: c.rose, marginTop: 10 }}>{error}</div>}
    </div>
  );
}

function TimeOffEditor({ brandId, staffId, staffName }) {
  const timeOffQuery = useTimeOff(staffId);
  const addTimeOff = useAddTimeOff(brandId, staffId);
  const removeTimeOff = useRemoveTimeOff(staffId);
  const [offStart, setOffStart] = useState("");
  const [offEnd, setOffEnd] = useState("");
  const [offReason, setOffReason] = useState("");
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = (timeOffQuery.data || []).filter((t) => t.ends_at.slice(0, 10) >= today);
  const add = () => {
    if (!offStart) return;
    const end = offEnd && offEnd >= offStart ? offEnd : offStart;
    addTimeOff.mutate({ startsAt: new Date(`${offStart}T00:00:00`).toISOString(), endsAt: new Date(`${end}T23:59:59`).toISOString(), reason: offReason });
    setOffStart(""); setOffEnd(""); setOffReason("");
  };
  const fmt = (iso) => new Date(iso).toLocaleDateString("pt-PT", { weekday: "short", day: "numeric", month: "short" });

  return (
    <div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
        {upcoming.map((t) => {
          const sameDay = new Date(t.starts_at).toDateString() === new Date(t.ends_at).toDateString();
          return (
            <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 10, background: c.paper, borderRadius: 6, padding: "8px 12px" }}>
              <div style={{ flex: 1, ...sans, fontSize: 13.5, color: c.ink }}>
                {sameDay ? fmt(t.starts_at) : `${fmt(t.starts_at)} a ${fmt(t.ends_at)}`}{t.reason ? `, ${t.reason}` : ""}
              </div>
              <button onClick={() => removeTimeOff.mutate(t.id)} style={{ background: "none", border: "none", cursor: "pointer", color: c.mist, padding: 2 }} aria-label="Remover"><Trash2 size={12} /></button>
            </div>
          );
        })}
        {!upcoming.length && <div style={{ ...sans, fontSize: 13.5, color: c.mistLight }}>{staffName} não tem férias nem folgas marcadas.</div>}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8, alignItems: "end" }}>
        <label style={{ ...sans, fontSize: 12.5, color: c.mist }}>De<input type="date" min={today} value={offStart} onChange={(e) => setOffStart(e.target.value)} style={{ ...inputStyle, marginTop: 4 }} /></label>
        <label style={{ ...sans, fontSize: 12.5, color: c.mist }}>Até (vazio = só esse dia)<input type="date" min={offStart || today} value={offEnd} onChange={(e) => setOffEnd(e.target.value)} style={{ ...inputStyle, marginTop: 4 }} /></label>
        <label style={{ ...sans, fontSize: 12.5, color: c.mist }}>Motivo (opcional)<input value={offReason} onChange={(e) => setOffReason(e.target.value)} placeholder="Férias, formação…" style={{ ...inputStyle, marginTop: 4 }} /></label>
        <button type="button" onClick={add} disabled={!offStart || addTimeOff.isPending} style={{ ...btnGhost, height: 40 }}><Plus size={12} /> Bloquear</button>
      </div>
    </div>
  );
}

function AvailabilitySection({ brand, staffId, onSelectStaff }) {
  const staffQuery = useStaff(brand.id);
  const staff = (staffQuery.data || []).filter((s) => s.status !== "archived");
  const current = staff.find((s) => s.id === staffId);
  if (!staff.length) return null;

  const picker = (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
      {staff.map((s) => (
        <button
          key={s.id}
          type="button"
          onClick={() => onSelectStaff(s.id)}
          style={{ ...sans, fontSize: 13.5, fontWeight: 700, borderRadius: 999, padding: "7px 14px", cursor: "pointer", border: `1px solid ${s.id === staffId ? c.boss : c.lineStrong}`, background: s.id === staffId ? c.boss : c.folha, color: s.id === staffId ? c.onBoss : c.ink }}
        >
          {s.name}
        </button>
      ))}
    </div>
  );

  return (
    <>
      <div style={{ background: c.folha, border: `1px solid ${c.line}`, borderRadius: 3, padding: 20 }}>
        <div style={{ ...serif, fontSize: 15.5, color: c.ink, marginBottom: 4 }}>Horário semanal{current ? ` de ${current.name}` : ""}</div>
        <div style={{ ...sans, fontSize: 12.5, color: c.mist, marginBottom: 14 }}>Escolha a profissional. O horário repete-se todas as semanas; nos dias de folga não aparecem horas para marcar.</div>
        {picker}
        {current && <WeeklyScheduleEditor key={current.id} brandId={brand.id} staffId={current.id} staffName={current.name} />}
      </div>

      <div style={{ background: c.folha, border: `1px solid ${c.line}`, borderRadius: 3, padding: 20 }}>
        <div style={{ ...serif, fontSize: 15.5, color: c.ink, marginBottom: 4 }}>Férias e folgas pontuais{current ? ` de ${current.name}` : ""}</div>
        <div style={{ ...sans, fontSize: 12.5, color: c.mist, marginBottom: 14 }}>Dias em que não pode receber marcações, fora do horário normal (férias, formação, um dia de folga).</div>
        {picker}
        {current && <TimeOffEditor key={current.id} brandId={brand.id} staffId={current.id} staffName={current.name} />}
      </div>
    </>
  );
}

/* ---------------------------------------------------------
   MARCAÇÕES + HISTÓRICO DO CLIENTE
--------------------------------------------------------- */
const CARE_NOTE_LABELS = { allergies: "Alergias", sensitivities: "Sensibilidades", contraindications: "Contraindicações" };

function useCareNotes(brandId, contactId) {
  return useQuery({
    queryKey: ["contact_care_notes", contactId],
    enabled: !!contactId,
    queryFn: async () => {
      const { data, error } = await supabase.from("contact_care_notes").select("*").eq("brand_id", brandId).eq("contact_id", contactId);
      if (error) throw error;
      return Object.fromEntries(data.map((n) => [n.category, n]));
    },
  });
}

// A equipa escreve team_text; o que a cliente escreveu na app só se lê aqui.
function CareNoteEditor({ brandId, contactId, category, note }) {
  const qc = useQueryClient();
  const [text, setText] = useState(note?.team_text || "");
  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("contact_care_notes").upsert(
        { contact_id: contactId, brand_id: brandId, category, team_text: text.trim() || null, updated_at: new Date().toISOString() },
        { onConflict: "contact_id,category" }
      );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["contact_care_notes", contactId] }),
  });
  const dirty = (note?.team_text || "") !== text;
  return (
    <div style={{ background: c.paper, borderRadius: 6, padding: "10px 12px" }}>
      <div style={{ ...sans, fontSize: 13.5, fontWeight: 700, color: c.ink, marginBottom: 6 }}>{CARE_NOTE_LABELS[category]}</div>
      <textarea rows={2} style={{ ...inputStyle, resize: "vertical", fontSize: 13.5 }} value={text} onChange={(e) => setText(e.target.value)} placeholder="Registado pela equipa (a cliente vê na app)" />
      {note?.client_text && <div style={{ ...sans, fontSize: 13, color: c.ink, marginTop: 6 }}><span style={{ color: c.mist }}>A cliente escreveu:</span> {note.client_text}</div>}
      {dirty && <button onClick={() => save.mutate()} disabled={save.isPending} style={{ ...btnGhost, padding: "5px 12px", minHeight: 0, marginTop: 8, fontSize: 13 }}>{save.isPending ? "A guardar…" : "Guardar"}</button>}
    </div>
  );
}

function ContactHistoryModal({ brand, contactId, contactName, onClose }) {
  const historyQuery = useContactHistory(brand.id, contactId);
  const notesQuery = useCareNotes(brand.id, contactId);
  return (
    <Modal title={`Ficha de ${contactName}`} onClose={onClose} width={460}>
      <div style={{ ...sans, fontSize: 13.5, fontWeight: 700, color: c.ink, marginBottom: 8 }}>Notas de cuidado</div>
      {notesQuery.isSuccess && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 18 }}>
          {Object.keys(CARE_NOTE_LABELS).map((cat) => <CareNoteEditor key={cat} brandId={brand.id} contactId={contactId} category={cat} note={notesQuery.data[cat]} />)}
        </div>
      )}
      <div style={{ ...sans, fontSize: 13.5, fontWeight: 700, color: c.ink, marginBottom: 8 }}>Marcações</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {(historyQuery.data || []).map((a) => (
          <div key={a.id} style={{ background: c.paper, borderRadius: 6, padding: "10px 12px" }}>
            <div style={{ ...sans, fontSize: 14, fontWeight: 600, color: c.ink }}>{a.booking_services?.name}</div>
            <div style={{ ...sans, fontSize: 12.5, color: c.mist, marginTop: 2 }}>
              {new Date(a.starts_at).toLocaleString("pt-PT", { dateStyle: "short", timeStyle: "short" })}, {a.booking_staff?.name || "sem profissional"}, {STATUS_LABEL[a.status] || a.status}
            </div>
          </div>
        ))}
        {!historyQuery.data?.length && <div style={{ ...sans, fontSize: 14, color: c.mistLight, textAlign: "center", padding: "16px 0" }}>Sem marcações anteriores.</div>}
      </div>
    </Modal>
  );
}

const STATUS_LABEL = {
  confirmed: "Confirmada", completed: "Concluída", cancelled: "Cancelada", no_show: "Faltou", pending_payment: "Sinal por pagar",
};

function useSetAppointmentStatus(brandId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }) => {
      const { error } = await supabase.from("booking_appointments").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["booking_appointments", brandId] });
      qc.invalidateQueries({ queryKey: ["client_packs", brandId] });
    },
  });
}

function AppointmentsSection({ brand, staff }) {
  const appointmentsQuery = useAppointments(brand.id);
  const setStatus = useSetAppointmentStatus(brand.id);
  const [historyFor, setHistoryFor] = useState(null);
  const [tab, setTab] = useState("upcoming");
  const [importing, setImporting] = useState(false);
  const now = Date.now();
  const all = appointmentsQuery.data || [];
  const upcoming = all.filter((a) => new Date(a.ends_at).getTime() >= now && ["confirmed", "pending_payment"].includes(a.status));
  const past = all
    .filter((a) => new Date(a.ends_at).getTime() < now && !(a.status === "cancelled" && a.deposit_status === "failed"))
    .reverse()
    .slice(0, 150);
  const list = tab === "upcoming" ? upcoming : past;
  const small = { ...sans, fontSize: 12.5, background: "none", border: `1px solid ${c.line}`, borderRadius: 6, padding: "5px 10px", cursor: "pointer" };

  return (
    <div style={{ background: c.folha, border: `1px solid ${c.line}`, borderRadius: 3, padding: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <div style={{ ...serif, fontSize: 15.5, color: c.ink }}>Marcações</div>
        <button onClick={() => setImporting(true)} style={{ ...btnGhost, padding: "6px 12px" }}><Upload size={12} /> Importar agenda</button>
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        {[["upcoming", `Próximas (${upcoming.length})`], ["past", "Passadas"]].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            style={{ ...sans, fontSize: 13.5, fontWeight: 600, borderRadius: 999, padding: "6px 14px", cursor: "pointer", border: "none", background: tab === key ? c.boss : c.paper, color: tab === key ? c.onBoss : c.ink }}
          >
            {label}
          </button>
        ))}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {list.map((a) => (
          <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 12, background: c.paper, borderRadius: 6, padding: "10px 14px", flexWrap: "wrap" }}>
            <CalendarIcon size={15} color={c.bossText} style={{ flexShrink: 0 }} />
            <div style={{ flex: "1 1 200px", minWidth: 0 }}>
              <button onClick={() => a.contact_id && setHistoryFor({ id: a.contact_id, name: a.customer_name })} style={{ ...sans, fontSize: 14.5, fontWeight: 600, color: c.ink, background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex", alignItems: "center", gap: 5, textAlign: "left" }}>
                {a.booking_services?.name}, {a.customer_name} <History size={11} color={c.mist} />
              </button>
              <div style={{ ...sans, fontSize: 12.5, color: c.mist, marginTop: 2 }}>
                {new Date(a.starts_at).toLocaleString("pt-PT", { dateStyle: "short", timeStyle: "short" })}, {a.booking_staff?.name || "sem profissional"}
                {a.client_pack_id ? ", pack" : a.total_price != null ? `, ${money(a.total_price)}` : ""}
                {a.deposit_status === "paid" ? `, sinal pago ${money(a.deposit_amount)}` : ""}
                {a.source === "app" ? ", marcada na app" : ""}
                {tab === "past" || a.status === "pending_payment" ? `. ${STATUS_LABEL[a.status] || a.status}` : ""}
              </div>
            </div>
            {tab === "upcoming" ? (
              <button onClick={() => setStatus.mutate({ id: a.id, status: "cancelled" })} style={{ ...small, color: c.rose }}>Cancelar</button>
            ) : a.status === "confirmed" || a.status === "completed" || a.status === "no_show" ? (
              <div style={{ display: "flex", gap: 6 }}>
                {a.status !== "completed" && <button onClick={() => setStatus.mutate({ id: a.id, status: "completed" })} style={{ ...small, color: c.sage }}>Concluída</button>}
                {a.status !== "no_show" && <button onClick={() => setStatus.mutate({ id: a.id, status: "no_show" })} style={{ ...small, color: c.amber }}>Faltou</button>}
              </div>
            ) : null}
          </div>
        ))}
        {!list.length && <div style={{ ...sans, fontSize: 13.5, color: c.mistLight, textAlign: "center", padding: "16px 0" }}>{tab === "upcoming" ? "Sem marcações futuras." : "Sem marcações passadas."}</div>}
      </div>
      {historyFor && <ContactHistoryModal brand={brand} contactId={historyFor.id} contactName={historyFor.name} onClose={() => setHistoryFor(null)} />}
      {importing && <ImportAgendaModal brand={brand} staff={staff} onClose={() => setImporting(false)} />}
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
  const [visitText, setVisitText] = useState((setting?.visit_numbers || []).join(", "));
  const [visitMessages, setVisitMessages] = useState(setting?.visit_messages || {});
  const save = useSaveReminderSetting(brand.id);
  const visitNumbers = [...new Set(visitText.split(/[^\d]+/).map((n) => parseInt(n, 10)).filter((n) => n > 0))].sort((a, b) => a - b);

  const persist = (patch) => {
    const next = { enabled, channel, messageTemplate: template, reviewLink, visitNumbers, visitMessages, ...patch };
    save.mutate({ type, ...next });
  };
  const fieldStyle = { ...sans, fontSize: 13.5, border: `1px solid ${c.lineStrong}`, borderRadius: 7, padding: "7px 9px", outline: "none", background: c.folha };

  return (
    <div style={{ background: c.paper, borderRadius: 6, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <label style={{ ...sans, fontSize: 14, fontWeight: 600, color: c.ink, display: "flex", alignItems: "center", gap: 7 }}>
          <input type="checkbox" checked={enabled} onChange={(e) => { setEnabled(e.target.checked); persist({ enabled: e.target.checked }); }} />
          {label}
        </label>
        <select value={channel} onChange={(e) => { setChannel(e.target.value); persist({ channel: e.target.value }); }} style={{ ...sans, fontSize: 12.5, border: `1px solid ${c.lineStrong}`, borderRadius: 6, padding: "4px 7px" }}>
          <option value="whatsapp">WhatsApp</option>
          <option value="sms">SMS</option>
          <option value="email">Email</option>
        </select>
      </div>
      <textarea
        rows={2}
        value={template}
        onChange={(e) => setTemplate(e.target.value)}
        onBlur={() => persist({})}
        placeholder={type === "post_visit" && visitNumbers.length ? "Mensagem para as visitas sem texto próprio" : "Mensagem. Usa {{primeiro_nome}}, {{nome}}, {{servico}}, {{data}}, {{hora}}"}
        style={{ ...sans, fontSize: 13.5, border: `1px solid ${c.lineStrong}`, borderRadius: 7, padding: "7px 9px", outline: "none", resize: "vertical", background: c.folha }}
      />
      {type === "post_visit" && (
        <>
          <input
            value={reviewLink}
            onChange={(e) => setReviewLink(e.target.value)}
            onBlur={() => persist({})}
            placeholder="Link de avaliação (ex: Google My Business), entra em {{avaliacao}}"
            style={fieldStyle}
          />
          <label style={{ ...sans, fontSize: 12.5, color: c.mist, display: "flex", flexDirection: "column", gap: 4 }}>
            Só nestas visitas (vazio = todas)
            <input value={visitText} onChange={(e) => setVisitText(e.target.value)} onBlur={() => persist({})} placeholder="Ex: 1, 10, 30" style={fieldStyle} />
          </label>
          {visitNumbers.map((n) => (
            <label key={n} style={{ ...sans, fontSize: 12.5, color: c.mist, display: "flex", flexDirection: "column", gap: 4 }}>
              Mensagem da {n}.ª visita
              <textarea
                rows={2}
                value={visitMessages[String(n)] || ""}
                onChange={(e) => setVisitMessages((m) => ({ ...m, [String(n)]: e.target.value }))}
                onBlur={() => persist({})}
                placeholder="Sem texto próprio usa a mensagem de cima"
                style={{ ...fieldStyle, resize: "vertical" }}
              />
            </label>
          ))}
        </>
      )}
    </div>
  );
}

function ColorField({ label, value, onChange, onReset }) {
  return (
    <label style={{ ...sans, fontSize: 12.5, color: c.mist, display: "flex", flexDirection: "column", gap: 6 }}>
      {label}
      <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <input type="color" value={value || "#ffffff"} onChange={(e) => onChange(e.target.value)} style={{ width: 38, height: 32, border: `1px solid ${c.lineStrong}`, borderRadius: 6, cursor: "pointer", padding: 0 }} />
        <span style={{ ...sans, fontSize: 13, color: c.ink }}>{value || "Padrão"}</span>
        {value && onReset && <button type="button" onClick={onReset} style={{ ...sans, fontSize: 12.5, color: c.mist, background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>repor</button>}
      </span>
    </label>
  );
}

// Tema da página pública e da app das clientes (brands.booking_style).
function AppearanceSection({ brand }) {
  const styleQuery = useBookingStyle(brand.id);
  const updateStyle = useUpdateBookingStyle(brand.id);
  const style = styleQuery.data || DEFAULT_PAGE_STYLE;
  const [uploading, setUploading] = useState(false);
  const set = (patch) => updateStyle.mutate({ ...style, ...patch });
  const unset = (key) => { const next = { ...style }; delete next[key]; updateStyle.mutate(next); };
  const small = { ...sans, fontSize: 12.5, color: c.mist, marginBottom: 6 };

  const pickLogo = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `${brand.id}/booking-logo-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("brand-logos").upload(path, file, { upsert: true });
      if (error) throw error;
      set({ logoUrl: supabase.storage.from("brand-logos").getPublicUrl(path).data.publicUrl });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div style={{ background: c.folha, border: `1px solid ${c.line}`, borderRadius: 3, padding: 20 }}>
      <div style={{ ...serif, fontSize: 15.5, color: c.ink, marginBottom: 4 }}>Aparência da marcação e da app</div>
      <div style={{ ...sans, fontSize: 12.5, color: c.mist, marginBottom: 16 }}>Vale para a página pública de marcação e para a app das clientes.</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div>
          <div style={small}>Cor dos botões</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {PAGE_COLOR_SWATCHES.map((hex) => (
              <button
                key={hex}
                type="button"
                onClick={() => set({ accentColor: hex })}
                style={{ width: 26, height: 26, borderRadius: 999, cursor: "pointer", background: hex, flexShrink: 0, border: style.accentColor === hex ? `2px solid ${c.ink}` : `1px solid ${c.line}` }}
              />
            ))}
            <input type="color" value={style.accentColor} onChange={(e) => set({ accentColor: e.target.value })} style={{ width: 30, height: 26, border: `1px solid ${c.lineStrong}`, borderRadius: 6, cursor: "pointer", padding: 0, flexShrink: 0 }} />
            <span style={{ ...sans, fontSize: 13, color: c.ink }}>{style.accentColor}</span>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 14 }}>
          <label style={{ ...small, marginBottom: 0, display: "flex", flexDirection: "column", gap: 6 }}>
            Texto nos botões
            <select style={inputStyle} value={style.accentInk ? "custom" : "white"} onChange={(e) => (e.target.value === "white" ? unset("accentInk") : set({ accentInk: style.ink || "#1A0D0E" }))}>
              <option value="white">Branco</option>
              <option value="custom">Escuro (cor do texto)</option>
            </select>
          </label>
          <ColorField label="Fundo" value={style.background} onChange={(v) => set({ background: v })} onReset={() => unset("background")} />
          <ColorField label="Cartões" value={style.surface} onChange={(v) => set({ surface: v })} onReset={() => unset("surface")} />
          <ColorField label="Texto" value={style.ink} onChange={(v) => set({ ink: v, ...(style.accentInk ? { accentInk: v } : {}) })} onReset={() => unset("ink")} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14 }}>
          <label style={{ ...small, marginBottom: 0, display: "flex", flexDirection: "column", gap: 6 }}>
            Letra dos títulos
            <select style={inputStyle} value={style.titleFont || style.font} onChange={(e) => set({ titleFont: e.target.value })}>
              {PAGE_FONT_OPTIONS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
            </select>
          </label>
          <label style={{ ...small, marginBottom: 0, display: "flex", flexDirection: "column", gap: 6 }}>
            Letra do texto
            <select style={inputStyle} value={style.font} onChange={(e) => set({ font: e.target.value })}>
              {PAGE_FONT_OPTIONS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
            </select>
          </label>
        </div>
        <div>
          <div style={small}>Logótipo</div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            {style.logoUrl && <img src={style.logoUrl} alt="" style={{ maxHeight: 72, maxWidth: 220, objectFit: "contain", background: c.paper, borderRadius: 4, padding: 4 }} />}
            <label style={{ ...btnGhost, padding: "6px 12px", cursor: "pointer" }}>
              <Upload size={12} /> {uploading ? "A enviar…" : style.logoUrl ? "Trocar" : "Enviar imagem"}
              <input type="file" accept="image/*" onChange={pickLogo} disabled={uploading} style={{ display: "none" }} />
            </label>
            {style.logoUrl && <button type="button" onClick={() => unset("logoUrl")} style={{ ...sans, fontSize: 12.5, color: c.mist, background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>remover</button>}
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14 }}>
          <label style={{ ...small, marginBottom: 0, display: "flex", flexDirection: "column", gap: 6 }}>
            Frase por baixo do nome (app)
            <input style={inputStyle} defaultValue={style.tagline || ""} onBlur={(e) => set({ tagline: e.target.value.trim() })} placeholder="Cuidado com continuidade" />
          </label>
          <label style={{ ...small, marginBottom: 0, display: "flex", flexDirection: "column", gap: 6 }}>
            WhatsApp para "Falar connosco"
            <input style={inputStyle} defaultValue={style.contactPhone || ""} onBlur={(e) => set({ contactPhone: e.target.value.trim() })} placeholder="+351 912 345 678" />
          </label>
        </div>
      </div>
    </div>
  );
}

function RemindersSection({ brand }) {
  const settingsQuery = useReminderSettings(brand.id);
  const settings = settingsQuery.data || [];
  return (
    <div style={{ background: c.folha, border: `1px solid ${c.line}`, borderRadius: 3, padding: 20 }}>
      <div style={{ ...serif, fontSize: 15.5, color: c.ink, marginBottom: 4 }}>Lembretes automáticos</div>
      <div style={{ ...sans, fontSize: 12.5, color: c.mist, marginBottom: 14 }}>Por WhatsApp, SMS ou email, com as contas já ligadas nesses módulos. Horas em hora de Lisboa.</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {REMINDER_TYPES.map((rt) => (
          <ReminderRow key={rt.value} brand={brand} type={rt.value} label={rt.label} setting={settings.find((s) => s.type === rt.value)} />
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------
   SINAL / DEPÓSITO
--------------------------------------------------------- */
function PaymentSettingsSection({ brand }) {
  const settingsQuery = usePaymentSettings(brand.id);
  const save = useSavePaymentSettings(brand.id);
  const s = settingsQuery.data || { enabled: false, percentage: 100, scope: "all", exempt_tag_id: null };
  const tagsQuery = useQuery({
    queryKey: ["brand_tags", brand.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("tags").select("id, name").eq("brand_id", brand.id).order("name");
      if (error) throw error;
      return data;
    },
  });

  const persist = (patch) => save.mutate({ enabled: s.enabled, percentage: s.percentage, scope: s.scope, exemptTagId: s.exempt_tag_id, ...patch });

  return (
    <div style={{ background: c.folha, border: `1px solid ${c.line}`, borderRadius: 3, padding: 20 }}>
      <div style={{ ...serif, fontSize: 15.5, color: c.ink, marginBottom: 4, display: "flex", alignItems: "center", gap: 7 }}>
        <CreditCard size={15} color={c.bossText} /> Sinal ao marcar
      </div>
      <div style={{ ...sans, fontSize: 12.5, color: c.mist, marginBottom: 14 }}>
        Pede pagamento (via Stripe) antes de confirmar a marcação. A marcação só fica confirmada depois de paga.
      </div>
      <label style={{ ...sans, fontSize: 14, fontWeight: 600, color: c.ink, display: "flex", alignItems: "center", gap: 7, marginBottom: 14 }}>
        <input type="checkbox" checked={s.enabled} onChange={(e) => persist({ enabled: e.target.checked })} />
        Pedir sinal para confirmar marcações
      </label>
      {s.enabled && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <div style={{ ...sans, fontSize: 12.5, color: c.mist, marginBottom: 5 }}>Percentagem do valor total</div>
            <select value={s.percentage} onChange={(e) => persist({ percentage: Number(e.target.value) })} style={{ ...inputStyle, maxWidth: 200 }}>
              <option value={20}>20%</option>
              <option value={50}>50%</option>
              <option value={100}>100% (valor total)</option>
            </select>
          </div>
          <div>
            <div style={{ ...sans, fontSize: 12.5, color: c.mist, marginBottom: 5 }}>Quem tem de pagar sinal</div>
            <select value={s.scope} onChange={(e) => persist({ scope: e.target.value })} style={{ ...inputStyle, maxWidth: 260 }}>
              <option value="all">Todos os clientes</option>
              <option value="new_customers">Só clientes novos (sem marcação anterior)</option>
            </select>
          </div>
          {s.scope === "new_customers" && (
            <div>
              <div style={{ ...sans, fontSize: 12.5, color: c.mist, marginBottom: 5 }}>Clientes com esta tag contam como clientes antigas (não pagam sinal)</div>
              <select value={s.exempt_tag_id || ""} onChange={(e) => persist({ exemptTagId: e.target.value || null })} style={{ ...inputStyle, maxWidth: 260 }}>
                <option value="">Nenhuma</option>
                {(tagsQuery.data || []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------
   MÓDULO
--------------------------------------------------------- */
export default function BookingModule({ brand, onBack, session }) {
  const slugQuery = useBookingSlug(brand.id);
  const updateSlug = useUpdateBookingSlug(brand.id);
  const [slugInput, setSlugInput] = useState("");
  const [copied, setCopied] = useState(false);
  const [selectedStaffId, setSelectedStaffId] = useState(null);
  const [tab, setTab] = useState("agenda");
  const [contactFor, setContactFor] = useState(null);
  const servicesQuery = useServices(brand.id);
  const staffQuery = useStaff(brand.id);

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
      <button onClick={onBack} style={{ ...sans, display: "flex", alignItems: "center", gap: 6, fontSize: 14, color: c.mist, background: "none", border: "none", cursor: "pointer", marginBottom: 20 }}>
        <ArrowLeft size={14} /> Voltar à marca
      </button>

      <Eyebrow>Agendamento</Eyebrow>
      <h1 style={{ ...display, fontSize: 24, color: c.ink, margin: "0 0 16px" }}>Marcações</h1>

      <div style={{ background: c.folha, border: `1px solid ${c.line}`, borderRadius: 3, padding: 18, marginBottom: 24, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ ...sans, fontSize: 12.5, color: c.mist, flexShrink: 0 }}>Página pública de marcação</div>
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

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 20 }}>
        {BOOKING_TABS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            style={{ ...sans, fontSize: 14, fontWeight: 700, borderRadius: 999, padding: "8px 16px", cursor: "pointer", border: "none", background: tab === key ? c.boss : c.folha, color: tab === key ? c.onBoss : c.ink }}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "agenda" && <AgendaCalendar brand={brand} session={session} onOpenContact={setContactFor} />}

      <div style={{ display: tab === "agenda" ? "none" : "flex", flexDirection: "column", gap: 20, maxWidth: 680 }}>
        {tab === "list" && <AppointmentsSection brand={brand} staff={staffQuery.data || []} />}
        {tab === "list" && <GhlImportSection brand={brand} />}
        {tab === "team" && (
          <>
            <StaffSection brand={brand} selectedStaffId={selectedStaffId} onSelectStaff={setSelectedStaffId} />
            <AvailabilitySection brand={brand} staffId={selectedStaffId} onSelectStaff={setSelectedStaffId} />
            <ServicesSection brand={brand} />
            <UpsellLibrarySection brand={brand} services={servicesQuery.data || []} />
          </>
        )}
        {tab === "app" && (
          <>
            <ClientAppSection brand={brand} slug={slug} />
            <PacksSection brand={brand} services={servicesQuery.data || []} />
            <PaymentSettingsSection brand={brand} />
            <StripeAccountSection brand={brand} />
          </>
        )}
        {tab === "settings" && (
          <>
            <RemindersSection brand={brand} />
            <AppearanceSection brand={brand} />
          </>
        )}
      </div>

      {contactFor && <ContactHistoryModal brand={brand} contactId={contactFor.id} contactName={contactFor.name} onClose={() => setContactFor(null)} />}
    </div>
  );
}

const BOOKING_TABS = [
  ["agenda", "Agenda"],
  ["list", "Lista e importação"],
  ["team", "Profissionais, horários e serviços"],
  ["app", "App, packs e pagamentos"],
  ["settings", "Lembretes e aparência"],
];

/* ---------------------------------------------------------
   PÁGINA PÚBLICA — /agendar/:slug
   Lê tudo por booking_public_page (quem não tem sessão não pode ler
   as tabelas diretamente) e usa o mesmo fluxo da app das clientes.
--------------------------------------------------------- */
export function PublicBookingPage() {
  const { slug } = useParams();
  const pageQuery = usePublicBookingPage(slug);
  const [booked, setBooked] = useState(null);
  const paid = new URLSearchParams(window.location.search).has("pago");
  const page = pageQuery.data;
  const style = brandStyle(page?.brand?.style);

  const shell = (children) => (
    <div className="bb-force-light" style={{ minHeight: "100vh", ...brandThemeVars(page?.brand?.style), display: "flex", justifyContent: "center", padding: "40px 16px", boxSizing: "border-box" }}>
      <div style={{ width: "100%", maxWidth: 520 }}>{children}</div>
    </div>
  );

  if (pageQuery.isLoading) return shell(<div style={{ ...T.body, color: T.muted, textAlign: "center" }}>A carregar…</div>);
  if (pageQuery.isError || !page) return shell(<div style={{ ...T.body, color: T.muted, textAlign: "center" }}>Página não encontrada.</div>);

  const done = booked || paid;

  return shell(
    <div style={{ background: T.surface, border: `1px solid ${T.line}`, borderRadius: 18, padding: "28px 20px" }}>
      <BrandHeader brand={page.brand} style={style} subtitle={done ? null : "Marque o seu momento"} />
      {done ? (
        <div style={{ textAlign: "center", padding: "12px 0", ...T.body }}>
          <CheckCircle2 size={34} color="currentColor" style={{ color: T.accent, marginBottom: 12 }} />
          <div style={{ ...T.title, fontSize: 22, color: T.ink, marginBottom: 8 }}>{paid && !booked ? "Pagamento recebido" : "Marcação confirmada"}</div>
          <div style={{ fontSize: 15, color: T.muted, lineHeight: 1.6 }}>
            {booked
              ? `${booked.serviceName}, ${new Date(booked.startsAt).toLocaleString("pt-PT", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}`
              : "Assim que o pagamento for confirmado, recebe a confirmação da marcação."}
          </div>
          {page.brand.client_app_enabled && (
            <a href={`/app/${page.brand.slug}`} style={{ display: "inline-block", marginTop: 18, fontSize: 15, fontWeight: 500, color: T.ink, textDecorationColor: T.accent }}>
              Ver as minhas marcações na app
            </a>
          )}
        </div>
      ) : (
        <BookingFlow page={page} returnUrl={`${window.location.origin}/agendar/${page.brand.slug}`} onBooked={setBooked} />
      )}
    </div>
  );
}
