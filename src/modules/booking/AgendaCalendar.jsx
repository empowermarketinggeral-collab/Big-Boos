import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabaseClient.js";
import { c, sans, serif, Modal, inputStyle, btnPrimary, btnGhost } from "../../shared/theme.jsx";
import { ChevronLeft, ChevronRight, Plus, Phone, History, AlertTriangle } from "lucide-react";
import { ContactPicker } from "./ClientAppAdmin.jsx";
import { normalizePhone } from "../../shared/csv.js";
import { money } from "./publicBooking.js";

/* ---------------------------------------------------------
   AGENDA — calendário das marcações da marca.
   Vistas dia / semana / mês, para todas as profissionais ou uma só.
   No dia com "Todas", cada profissional tem a sua coluna. As horas fora
   do horário semanal (e as férias/folgas) aparecem a cinzento.
   Clicar num espaço vazio cria uma marcação à mão (telefone, balcão);
   clicar numa marcação abre-a: reagendar, concluída, faltou, cancelar,
   ficha da cliente. As marcações feitas aqui não pedem sinal e não
   verificam o horário (a equipa pode marcar fora de horas, com aviso).
   Quem tem o mesmo email que uma profissional abre a agenda só dela.
--------------------------------------------------------- */

const HOUR_PX = 56;
const STAFF_COLORS = [c.boss, c.sageSolid, c.amberSolid, c.info, c.roseSolid, c.gold, c.bossDeep];
const VIEWS = [["day", "Dia"], ["week", "Semana"], ["month", "Mês"]];
const DAY_NAMES = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const STATUS_LABEL = { confirmed: "Confirmada", completed: "Concluída", cancelled: "Cancelada", no_show: "Faltou", pending_payment: "Sinal por pagar" };

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const startOfWeek = (d) => addDays(startOfDay(d), -((d.getDay() + 6) % 7)); // segunda
const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const minutesOf = (d) => d.getHours() * 60 + d.getMinutes();
const hhmm = (d) => d.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" });
const toDateInput = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const timeToMin = (t) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };

function visibleRange(view, cursor) {
  if (view === "day") return [startOfDay(cursor), addDays(startOfDay(cursor), 1)];
  if (view === "week") { const s = startOfWeek(cursor); return [s, addDays(s, 7)]; }
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const s = startOfWeek(first);
  return [s, addDays(s, 42)];
}

/* ---------------------------------------------------------
   DADOS
--------------------------------------------------------- */
function useAgendaAppointments(brandId, from, to) {
  return useQuery({
    queryKey: ["agenda", brandId, from.toISOString(), to.toISOString()],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("booking_appointments")
        .select("*, booking_services(name, category), booking_staff(name)")
        .eq("brand_id", brandId)
        .gte("starts_at", from.toISOString())
        .lt("starts_at", to.toISOString())
        .neq("status", "cancelled")
        .order("starts_at");
      if (error) throw error;
      return data;
    },
  });
}

function useAgendaSchedule(brandId, from, to) {
  return useQuery({
    queryKey: ["agenda_schedule", brandId, from.toISOString(), to.toISOString()],
    queryFn: async () => {
      const [{ data: rules, error: e1 }, { data: timeOff, error: e2 }] = await Promise.all([
        supabase.from("booking_availability").select("staff_id, weekday, start_time, end_time").eq("brand_id", brandId),
        supabase.from("booking_time_off").select("staff_id, starts_at, ends_at, reason").eq("brand_id", brandId).lt("starts_at", to.toISOString()).gt("ends_at", from.toISOString()),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;
      return { rules: rules || [], timeOff: timeOff || [] };
    },
  });
}

function useAgendaStatics(brandId) {
  return useQuery({
    queryKey: ["agenda_statics", brandId],
    queryFn: async () => {
      const [{ data: staff }, { data: services }, { data: links }] = await Promise.all([
        supabase.from("booking_staff").select("id, name, email, status").eq("brand_id", brandId).order("created_at"),
        supabase.from("booking_services").select("id, name, category, duration_minutes, price, status").eq("brand_id", brandId).order("sort_order").order("created_at"),
        supabase.from("booking_service_staff").select("service_id, staff_id").eq("brand_id", brandId),
      ]);
      return {
        staff: (staff || []).filter((s) => s.status !== "archived"),
        services: (services || []).filter((s) => s.status === "active"),
        links: links || [],
      };
    },
  });
}

function useInvalidateAgenda(brandId) {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["agenda", brandId] });
    qc.invalidateQueries({ queryKey: ["booking_appointments", brandId] });
    qc.invalidateQueries({ queryKey: ["client_packs", brandId] });
  };
}

/* ---------------------------------------------------------
   PEÇAS DO CALENDÁRIO
--------------------------------------------------------- */
// Marcações que se sobrepõem ficam lado a lado.
function layoutLanes(items) {
  const sorted = [...items].sort((a, b) => a.start - b.start || b.end - a.end);
  const out = [];
  let cluster = [];
  let clusterEnd = -1;
  const flush = () => {
    const lanes = [];
    for (const it of cluster) {
      let lane = lanes.findIndex((end) => end <= it.start);
      if (lane === -1) { lane = lanes.length; lanes.push(it.end); } else lanes[lane] = it.end;
      it.lane = lane;
    }
    for (const it of cluster) out.push({ ...it, lanes: lanes.length });
    cluster = [];
  };
  for (const it of sorted) {
    if (cluster.length && it.start >= clusterEnd) flush();
    cluster.push(it);
    clusterEnd = Math.max(clusterEnd, it.end);
  }
  if (cluster.length) flush();
  return out;
}

function EventBlock({ appt, color, top, height, left, width, onClick, compact }) {
  const muted = appt.status === "no_show" || appt.status === "completed";
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(appt); }}
      title={`${hhmm(new Date(appt.starts_at))} ${appt.customer_name}, ${appt.booking_services?.name || ""}`}
      style={{
        ...sans, position: "absolute", top, height: Math.max(height, 20), left: `calc(${left}% + 2px)`, width: `calc(${width}% - 4px)`,
        background: `color-mix(in srgb, ${color} ${muted ? 10 : 18}%, ${c.folha})`,
        borderStyle: appt.status === "pending_payment" ? "dashed" : "solid", borderWidth: appt.status === "pending_payment" ? "1px 1px 1px 3px" : "0 0 0 3px", borderColor: color,
        borderRadius: 4, padding: "2px 6px", textAlign: "left", cursor: "pointer", overflow: "hidden", color: c.ink, zIndex: 2,
        textDecoration: appt.status === "no_show" ? "line-through" : "none", opacity: muted ? 0.75 : 1,
      }}
    >
      <div style={{ fontSize: 12.5, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {hhmm(new Date(appt.starts_at))} {appt.customer_name}
      </div>
      {!compact && height > 34 && (
        <div style={{ fontSize: 12.5, color: c.mist, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{appt.booking_services?.name}</div>
      )}
    </button>
  );
}

// Uma coluna da grelha horária (um dia, ou um dia de uma profissional).
function DayColumn({ date, appts, gridStart, gridEnd, colorFor, blocked, onSlot, onOpen, compact }) {
  const height = ((gridEnd - gridStart) / 60) * HOUR_PX;
  const items = layoutLanes(
    appts.map((a) => {
      const s = new Date(a.starts_at);
      const e = new Date(a.ends_at);
      return { appt: a, start: sameDay(s, date) ? minutesOf(s) : gridStart, end: sameDay(e, date) ? minutesOf(e) : gridEnd };
    })
  );
  const now = new Date();
  const nowMin = minutesOf(now);

  const click = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const minutes = gridStart + Math.floor(((e.clientY - rect.top) / HOUR_PX) * 60 / 15) * 15;
    onSlot(date, Math.min(Math.max(minutes, gridStart), gridEnd - 15));
  };

  return (
    <div onClick={click} style={{ position: "relative", height, borderLeft: `1px solid ${c.line}`, cursor: "copy" }}>
      {blocked.map((b, i) => (
        <div key={i} style={{ position: "absolute", left: 0, right: 0, top: ((b.from - gridStart) / 60) * HOUR_PX, height: ((b.to - b.from) / 60) * HOUR_PX, background: `color-mix(in srgb, ${c.ink} 6%, transparent)`, pointerEvents: "none" }} />
      ))}
      {Array.from({ length: (gridEnd - gridStart) / 60 }).map((_, i) => (
        <div key={i} style={{ position: "absolute", left: 0, right: 0, top: i * HOUR_PX, borderTop: `1px solid ${c.line}`, pointerEvents: "none" }} />
      ))}
      {sameDay(date, now) && nowMin >= gridStart && nowMin <= gridEnd && (
        <div style={{ position: "absolute", left: 0, right: 0, top: ((nowMin - gridStart) / 60) * HOUR_PX, borderTop: `2px solid ${c.rose}`, zIndex: 3, pointerEvents: "none" }} />
      )}
      {items.map((it) => (
        <EventBlock
          key={it.appt.id}
          appt={it.appt}
          color={colorFor(it.appt.staff_id)}
          top={((Math.max(it.start, gridStart) - gridStart) / 60) * HOUR_PX}
          height={((Math.min(it.end, gridEnd) - Math.max(it.start, gridStart)) / 60) * HOUR_PX - 2}
          left={(it.lane / it.lanes) * 100}
          width={100 / it.lanes}
          onClick={onOpen}
          compact={compact}
        />
      ))}
    </div>
  );
}

function TimeGrid({ columns, gridStart, gridEnd, colorFor, onSlot, onOpen, minColWidth }) {
  const scrollRef = useRef(null);
  const hours = Array.from({ length: (gridEnd - gridStart) / 60 }, (_, i) => gridStart / 60 + i);
  return (
    <div ref={scrollRef} style={{ overflowX: "auto", border: `1px solid ${c.line}`, borderRadius: 3, background: c.folha }}>
      <div style={{ display: "grid", gridTemplateColumns: `48px repeat(${columns.length}, minmax(${minColWidth}px, 1fr))`, minWidth: 48 + columns.length * minColWidth }}>
        <div style={{ position: "sticky", top: 0, background: c.folha, zIndex: 4, borderBottom: `1px solid ${c.line}` }} />
        {columns.map((col) => (
          <div key={col.key} style={{ ...sans, fontSize: 13.5, fontWeight: 700, color: col.highlight ? c.bossText : c.ink, padding: "8px 6px", textAlign: "center", borderBottom: `1px solid ${c.line}`, borderLeft: `1px solid ${c.line}`, background: c.folha, position: "sticky", top: 0, zIndex: 4 }}>
            {col.color && <span style={{ display: "inline-block", width: 9, height: 9, borderRadius: 999, background: col.color, marginRight: 6 }} />}
            {col.title}
          </div>
        ))}
        <div style={{ position: "relative" }}>
          {hours.map((h, i) => (
            <div key={h} style={{ ...sans, position: "absolute", top: i * HOUR_PX - 7, right: 6, fontSize: 12.5, color: c.mist }}>{i === 0 ? "" : `${String(h).padStart(2, "0")}:00`}</div>
          ))}
        </div>
        {columns.map((col) => (
          <DayColumn key={col.key} date={col.date} appts={col.appts} gridStart={gridStart} gridEnd={gridEnd} colorFor={colorFor} blocked={col.blocked} onSlot={(d, m) => onSlot(d, m, col.staffId)} onOpen={onOpen} compact={col.compact} />
        ))}
      </div>
    </div>
  );
}

function MonthGrid({ cursor, appts, colorFor, onDay, onOpen }) {
  const [from] = visibleRange("month", cursor);
  const days = Array.from({ length: 42 }, (_, i) => addDays(from, i));
  const today = new Date();
  return (
    <div style={{ border: `1px solid ${c.line}`, borderRadius: 3, background: c.folha, overflowX: "auto" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(92px, 1fr))", minWidth: 644 }}>
        {[1, 2, 3, 4, 5, 6, 0].map((wd) => (
          <div key={wd} style={{ ...sans, fontSize: 12.5, fontWeight: 700, color: c.mist, padding: "8px 8px", borderBottom: `1px solid ${c.line}` }}>{DAY_NAMES[wd]}</div>
        ))}
        {days.map((d) => {
          const list = appts.filter((a) => sameDay(new Date(a.starts_at), d));
          const inMonth = d.getMonth() === cursor.getMonth();
          return (
            <div key={d.toISOString()} onClick={() => onDay(d)} style={{ minHeight: 96, padding: 6, borderTop: `1px solid ${c.line}`, borderLeft: `1px solid ${c.line}`, cursor: "pointer", background: inMonth ? c.folha : c.paper }}>
              <div style={{ ...sans, fontSize: 13, fontWeight: 700, color: sameDay(d, today) ? c.bossText : inMonth ? c.ink : c.mistLight, marginBottom: 4 }}>{d.getDate()}</div>
              {list.slice(0, 3).map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onOpen(a); }}
                  style={{ ...sans, display: "block", width: "100%", textAlign: "left", fontSize: 12.5, color: c.ink, background: `color-mix(in srgb, ${colorFor(a.staff_id)} 16%, ${c.folha})`, borderStyle: "solid", borderWidth: "0 0 0 3px", borderColor: colorFor(a.staff_id), borderRadius: 3, padding: "2px 5px", marginBottom: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", cursor: "pointer" }}
                >
                  {hhmm(new Date(a.starts_at))} {a.customer_name}
                </button>
              ))}
              {list.length > 3 && <div style={{ ...sans, fontSize: 12.5, color: c.mist }}>+{list.length - 3} mais</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------
   MARCAÇÃO — ver, reagendar, estado
--------------------------------------------------------- */
function AppointmentModal({ brandId, appt, staff, onClose, onOpenContact }) {
  const invalidate = useInvalidateAgenda(brandId);
  const start = new Date(appt.starts_at);
  const duration = (new Date(appt.ends_at) - start) / 60000;
  const [editing, setEditing] = useState(false);
  const [date, setDate] = useState(toDateInput(start));
  const [time, setTime] = useState(hhmm(start));
  const [staffId, setStaffId] = useState(appt.staff_id || "");
  const [error, setError] = useState("");

  const update = useMutation({
    mutationFn: async (patch) => {
      const { error: err } = await supabase.from("booking_appointments").update(patch).eq("id", appt.id);
      if (err) throw err;
    },
    onSuccess: () => { invalidate(); onClose(); },
    onError: (err) => setError(err.message),
  });

  const reschedule = () => {
    const s = new Date(`${date}T${time}:00`);
    if (Number.isNaN(s.getTime())) return setError("Data ou hora inválida.");
    update.mutate({
      starts_at: s.toISOString(), ends_at: new Date(s.getTime() + duration * 60000).toISOString(), staff_id: staffId || null,
      // Nova hora = os lembretes voltam a sair.
      reminder_24h_sent: false, reminder_1h_sent: false, post_visit_sent: false,
    });
  };

  const row = { ...sans, fontSize: 14, color: c.ink, display: "flex", gap: 8, padding: "7px 0", borderTop: `1px solid ${c.line}` };
  const lbl = { color: c.mist, width: 110, flexShrink: 0 };
  const past = new Date(appt.ends_at) < new Date();

  return (
    <Modal title={appt.customer_name} onClose={onClose} width={460}>
      <div style={{ marginBottom: 14 }}>
        <div style={row}><span style={lbl}>Serviço</span><span>{appt.booking_services?.name || "?"}{appt.selected_upsells?.length ? ` e ${appt.selected_upsells.map((u) => u.name).join(", ")}` : ""}</span></div>
        <div style={row}><span style={lbl}>Quando</span><span>{cap(start.toLocaleDateString("pt-PT", { weekday: "long", day: "numeric", month: "long" }))}, {hhmm(start)} às {hhmm(new Date(appt.ends_at))}</span></div>
        <div style={row}><span style={lbl}>Profissional</span><span>{appt.booking_staff?.name || "Sem profissional"}</span></div>
        <div style={row}><span style={lbl}>Estado</span><span>{STATUS_LABEL[appt.status] || appt.status}</span></div>
        {appt.customer_phone && <div style={row}><span style={lbl}>Telemóvel</span><a href={`tel:${appt.customer_phone}`} style={{ color: c.bossText, display: "flex", alignItems: "center", gap: 5 }}><Phone size={13} /> {appt.customer_phone}</a></div>}
        {appt.customer_email && <div style={row}><span style={lbl}>Email</span><span>{appt.customer_email}</span></div>}
        <div style={row}>
          <span style={lbl}>Pagamento</span>
          <span>
            {appt.client_pack_id ? "Pack" : appt.total_price != null ? money(appt.total_price) : "?"}
            {appt.deposit_status === "paid" ? `, sinal pago ${money(appt.deposit_amount)}` : appt.deposit_status === "pending" ? ", sinal por pagar" : ""}
          </span>
        </div>
        <div style={row}><span style={lbl}>Origem</span><span>{{ app: "App das clientes", online: "Link de marcação", manual: "Equipa", import: "Importada" }[appt.source] || appt.source || "?"}</span></div>
      </div>

      {editing ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, background: c.paper, borderRadius: 6, padding: 12, marginBottom: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8 }}>
            <label style={{ ...sans, fontSize: 12.5, color: c.mist }}>Dia<input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ ...inputStyle, marginTop: 4 }} /></label>
            <label style={{ ...sans, fontSize: 12.5, color: c.mist }}>Hora<input type="time" step={300} value={time} onChange={(e) => setTime(e.target.value)} style={{ ...inputStyle, marginTop: 4 }} /></label>
            <label style={{ ...sans, fontSize: 12.5, color: c.mist }}>Profissional
              <select value={staffId} onChange={(e) => setStaffId(e.target.value)} style={{ ...inputStyle, marginTop: 4 }}>
                {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={reschedule} disabled={update.isPending} style={btnPrimary}>Guardar nova hora</button>
            <button type="button" onClick={() => setEditing(false)} style={btnGhost}>Cancelar</button>
          </div>
        </div>
      ) : null}

      {error && <div style={{ ...sans, fontSize: 14, color: c.rose, marginBottom: 10 }}>{error}</div>}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {!editing && appt.status !== "cancelled" && <button type="button" onClick={() => setEditing(true)} style={btnGhost}>Reagendar</button>}
        {past && appt.status !== "completed" && <button type="button" onClick={() => update.mutate({ status: "completed" })} style={{ ...btnGhost, color: c.sage }}>Concluída</button>}
        {past && appt.status !== "no_show" && <button type="button" onClick={() => update.mutate({ status: "no_show" })} style={{ ...btnGhost, color: c.amber }}>Faltou</button>}
        {!past && <button type="button" onClick={() => { if (window.confirm("Cancelar esta marcação?")) update.mutate({ status: "cancelled" }); }} style={{ ...btnGhost, color: c.rose }}>Cancelar marcação</button>}
        {appt.contact_id && <button type="button" onClick={() => onOpenContact({ id: appt.contact_id, name: appt.customer_name })} style={btnGhost}><History size={13} /> Ficha</button>}
      </div>
    </Modal>
  );
}

/* ---------------------------------------------------------
   NOVA MARCAÇÃO (feita pela equipa)
--------------------------------------------------------- */
function NewAppointmentModal({ brandId, statics, initial, onClose }) {
  const invalidate = useInvalidateAgenda(brandId);
  const { staff, services, links } = statics;
  const [contact, setContact] = useState(null);
  const [newClient, setNewClient] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [staffId, setStaffId] = useState(initial.staffId || staff[0]?.id || "");
  const [date, setDate] = useState(toDateInput(initial.date));
  const [time, setTime] = useState(`${String(Math.floor(initial.minutes / 60)).padStart(2, "0")}:${String(initial.minutes % 60).padStart(2, "0")}`);
  const [duration, setDuration] = useState(60);
  const [price, setPrice] = useState("");
  const [packId, setPackId] = useState("");
  const [warning, setWarning] = useState("");
  const [error, setError] = useState("");

  const service = services.find((s) => s.id === serviceId);
  const assigned = links.filter((l) => l.service_id === serviceId).map((l) => l.staff_id);
  const serviceStaff = assigned.length ? staff.filter((s) => assigned.includes(s.id)) : staff;
  const categories = [...new Set(services.map((s) => s.category || "Sem categoria"))];

  useEffect(() => {
    if (!service) return;
    setDuration(service.duration_minutes);
    setPrice(service.price ?? "");
    if (assigned.length && !assigned.includes(staffId)) setStaffId(assigned[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviceId]);

  const packsQuery = useQuery({
    queryKey: ["contact_packs", contact?.id],
    enabled: !!contact?.id,
    queryFn: async () => {
      const { data, error: err } = await supabase.from("client_packs").select("*").eq("contact_id", contact.id).eq("status", "active");
      if (err) throw err;
      return data;
    },
  });
  const usablePacks = (packsQuery.data || []).filter((p) => {
    const ids = p.service_ids || [];
    return p.sessions_used < p.sessions_total && (!p.expires_at || new Date(p.expires_at) > new Date()) && (!ids.length || ids.includes(serviceId));
  });

  const save = useMutation({
    mutationFn: async (force) => {
      const start = new Date(`${date}T${time}:00`);
      if (Number.isNaN(start.getTime())) throw new Error("Data ou hora inválida.");
      const end = new Date(start.getTime() + Number(duration) * 60000);

      // Aviso (não bloqueia): sobreposição com outra marcação da mesma profissional.
      if (!force) {
        const { data: clash } = await supabase.from("booking_appointments").select("id, customer_name")
          .eq("brand_id", brandId).eq("staff_id", staffId).in("status", ["confirmed", "pending_payment"])
          .lt("starts_at", end.toISOString()).gt("ends_at", start.toISOString()).limit(1);
        if (clash?.length) return { clash: clash[0].customer_name };
      }

      let c2 = contact;
      if (newClient) {
        const normalized = normalizePhone(phone);
        if (!name.trim()) throw new Error("Escreva o nome da cliente.");
        if (normalized) {
          const { data: existing } = await supabase.from("contacts").select("id, name, email, phone").eq("brand_id", brandId).eq("phone", normalized).maybeSingle();
          if (existing) c2 = existing;
        }
        if (!c2) {
          const { data: created, error: err } = await supabase.from("contacts").insert({ brand_id: brandId, name: name.trim(), phone: normalized || null, source: "manual" }).select("id, name, email, phone").single();
          if (err) throw err;
          c2 = created;
        }
      }
      if (!c2) throw new Error("Escolha a cliente.");

      if (packId) {
        const pack = usablePacks.find((p) => p.id === packId);
        const { error: err } = await supabase.from("client_packs").update({ sessions_used: pack.sessions_used + 1 }).eq("id", pack.id).eq("sessions_used", pack.sessions_used);
        if (err) throw err;
      }
      const { error: err } = await supabase.from("booking_appointments").insert({
        brand_id: brandId, service_id: serviceId, staff_id: staffId, contact_id: c2.id,
        customer_name: c2.name, customer_phone: c2.phone || null, customer_email: c2.email || null,
        starts_at: start.toISOString(), ends_at: end.toISOString(), status: "confirmed",
        total_price: price === "" ? null : Number(price), selected_upsells: [],
        deposit_required: false, deposit_status: "not_required", client_pack_id: packId || null, source: "manual",
      });
      if (err) throw err;
      return { ok: true };
    },
    onSuccess: (res) => {
      if (res?.clash) { setWarning(`${staff.find((s) => s.id === staffId)?.name} já tem uma marcação nesse horário (${res.clash}).`); return; }
      invalidate();
      onClose();
    },
    onError: (err) => setError(err.message),
  });

  const submit = (force = false) => {
    setError("");
    if (!serviceId) return setError("Escolha o serviço.");
    if (!staffId) return setError("Escolha a profissional.");
    save.mutate(force);
  };
  const small = { ...sans, fontSize: 12.5, color: c.mist };

  return (
    <Modal title="Nova marcação" onClose={onClose} width={500}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <span style={small}>Cliente</span>
            <button type="button" onClick={() => { setNewClient(!newClient); setContact(null); }} style={{ ...sans, fontSize: 12.5, color: c.bossText, background: "none", border: "none", cursor: "pointer" }}>
              {newClient ? "Procurar cliente existente" : "+ Cliente nova"}
            </button>
          </div>
          {newClient ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 8 }}>
              <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome" />
              <input style={inputStyle} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Telemóvel" inputMode="tel" />
            </div>
          ) : (
            <ContactPicker brandId={brandId} value={contact} onChange={setContact} />
          )}
        </div>

        <label style={small}>Serviço
          <select value={serviceId} onChange={(e) => setServiceId(e.target.value)} style={{ ...inputStyle, marginTop: 4 }}>
            <option value="">Escolher…</option>
            {categories.map((cat) => (
              <optgroup key={cat} label={cat}>
                {services.filter((s) => (s.category || "Sem categoria") === cat).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </optgroup>
            ))}
          </select>
        </label>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 8 }}>
          <label style={small}>Profissional
            <select value={staffId} onChange={(e) => setStaffId(e.target.value)} style={{ ...inputStyle, marginTop: 4 }}>
              {serviceStaff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <label style={small}>Dia<input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ ...inputStyle, marginTop: 4 }} /></label>
          <label style={small}>Hora<input type="time" step={300} value={time} onChange={(e) => setTime(e.target.value)} style={{ ...inputStyle, marginTop: 4 }} /></label>
          <label style={small}>Duração (min)<input type="number" min={5} step={5} value={duration} onChange={(e) => setDuration(e.target.value)} style={{ ...inputStyle, marginTop: 4 }} /></label>
          <label style={small}>Preço (€)<input type="number" min={0} step="0.5" value={price} onChange={(e) => setPrice(e.target.value)} style={{ ...inputStyle, marginTop: 4 }} /></label>
        </div>

        {usablePacks.length > 0 && (
          <label style={small}>Pagamento
            <select value={packId} onChange={(e) => setPackId(e.target.value)} style={{ ...inputStyle, marginTop: 4 }}>
              <option value="">Paga no dia</option>
              {usablePacks.map((p) => <option key={p.id} value={p.id}>Usar sessão do {p.name} ({p.sessions_total - p.sessions_used} por usar)</option>)}
            </select>
          </label>
        )}

        {warning && (
          <div style={{ ...sans, fontSize: 14, color: c.ink, background: c.amberSoft, borderRadius: 6, padding: "10px 12px", display: "flex", gap: 8, alignItems: "flex-start" }}>
            <AlertTriangle size={16} color={c.amber} style={{ flexShrink: 0, marginTop: 2 }} />
            <div style={{ flex: 1 }}>
              {warning}
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button type="button" onClick={() => { setWarning(""); submit(true); }} style={{ ...btnGhost, padding: "5px 12px", minHeight: 0 }}>Marcar mesmo assim</button>
              </div>
            </div>
          </div>
        )}
        {error && <div style={{ ...sans, fontSize: 14, color: c.rose }}>{error}</div>}
        <button type="button" onClick={() => submit(false)} disabled={save.isPending} style={{ ...btnPrimary, width: "fit-content" }}>{save.isPending ? "A marcar…" : "Marcar"}</button>
        <div style={small}>Marcações feitas pela equipa não pedem sinal. Os lembretes automáticos saem na mesma.</div>
      </div>
    </Modal>
  );
}

/* ---------------------------------------------------------
   AGENDA
--------------------------------------------------------- */
export default function AgendaCalendar({ brand, session, onOpenContact }) {
  const staticsQuery = useAgendaStatics(brand.id);
  const statics = staticsQuery.data || { staff: [], services: [], links: [] };
  const isNarrow = typeof window !== "undefined" && window.innerWidth < 720;
  const [view, setView] = useState(isNarrow ? "day" : "week");
  const [cursor, setCursor] = useState(() => startOfDay(new Date()));
  const [staffFilter, setStaffFilter] = useState(null); // null = ainda não escolhido
  const [openAppt, setOpenAppt] = useState(null);
  const [newAt, setNewAt] = useState(null);

  // A profissional com o email da sessão vê só a agenda dela por omissão.
  useEffect(() => {
    if (staffFilter !== null || !staticsQuery.isSuccess) return;
    const me = statics.staff.find((s) => s.email && session?.email && s.email.toLowerCase() === session.email.toLowerCase());
    setStaffFilter(me ? me.id : "all");
  }, [staticsQuery.isSuccess, statics.staff, session, staffFilter]);

  const [from, to] = visibleRange(view, cursor);
  const apptsQuery = useAgendaAppointments(brand.id, from, to);
  const scheduleQuery = useAgendaSchedule(brand.id, from, to);
  const filter = staffFilter || "all";
  const appts = (apptsQuery.data || []).filter((a) => filter === "all" || a.staff_id === filter);
  const colorFor = useMemo(() => {
    const map = Object.fromEntries(statics.staff.map((s, i) => [s.id, STAFF_COLORS[i % STAFF_COLORS.length]]));
    return (id) => map[id] || c.mist;
  }, [statics.staff]);

  // Horas mostradas: do início ao fim do horário mais largo (com margem).
  const rules = scheduleQuery.data?.rules || [];
  const gridStart = Math.min(8 * 60, ...rules.map((r) => Math.floor(timeToMin(r.start_time) / 60) * 60));
  const gridEnd = Math.max(20 * 60, ...rules.map((r) => Math.ceil(timeToMin(r.end_time) / 60) * 60));

  // Zonas sem atendimento de uma profissional num dia (fora do horário ou de folga).
  const blockedFor = (staffId, date) => {
    const dayRules = rules.filter((r) => r.staff_id === staffId && r.weekday === date.getDay()).map((r) => [timeToMin(r.start_time), timeToMin(r.end_time)]).sort((a, b) => a[0] - b[0]);
    const blocks = [];
    let cursorMin = gridStart;
    for (const [s, e] of dayRules) { if (s > cursorMin) blocks.push({ from: cursorMin, to: s }); cursorMin = Math.max(cursorMin, e); }
    if (cursorMin < gridEnd) blocks.push({ from: cursorMin, to: gridEnd });
    const dayStart = startOfDay(date).getTime();
    for (const t of scheduleQuery.data?.timeOff || []) {
      if (t.staff_id !== staffId) continue;
      const s = Math.max(new Date(t.starts_at).getTime(), dayStart);
      const e = Math.min(new Date(t.ends_at).getTime(), dayStart + 86400000);
      if (e > s) blocks.push({ from: Math.max(gridStart, (s - dayStart) / 60000), to: Math.min(gridEnd, (e - dayStart) / 60000) });
    }
    return blocks;
  };

  const move = (dir) => {
    if (view === "day") setCursor(addDays(cursor, dir));
    else if (view === "week") setCursor(addDays(cursor, 7 * dir));
    else setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + dir, 1));
  };

  const title = view === "day"
    ? cap(cursor.toLocaleDateString("pt-PT", { weekday: "long", day: "numeric", month: "long", year: "numeric" }))
    : view === "week"
      ? `${from.toLocaleDateString("pt-PT", { day: "numeric", month: "long" })} a ${addDays(to, -1).toLocaleDateString("pt-PT", { day: "numeric", month: "long", year: "numeric" })}`
      : cap(cursor.toLocaleDateString("pt-PT", { month: "long", year: "numeric" }));

  let columns = [];
  if (view === "day" && filter === "all") {
    columns = statics.staff.map((s) => ({
      key: s.id, title: s.name, color: colorFor(s.id), staffId: s.id, date: cursor,
      appts: appts.filter((a) => a.staff_id === s.id && sameDay(new Date(a.starts_at), cursor)), blocked: blockedFor(s.id, cursor),
    }));
  } else if (view === "day") {
    columns = [{ key: "one", title: statics.staff.find((s) => s.id === filter)?.name || "", staffId: filter, date: cursor, appts: appts.filter((a) => sameDay(new Date(a.starts_at), cursor)), blocked: blockedFor(filter, cursor) }];
  } else if (view === "week") {
    columns = Array.from({ length: 7 }, (_, i) => {
      const d = addDays(from, i);
      return {
        key: d.toISOString(), date: d, staffId: filter === "all" ? null : filter, highlight: sameDay(d, new Date()), compact: filter === "all",
        title: `${DAY_NAMES[d.getDay()]} ${d.getDate()}`,
        appts: appts.filter((a) => sameDay(new Date(a.starts_at), d)),
        blocked: filter === "all" ? [] : blockedFor(filter, d),
      };
    });
  }

  const pill = (on) => ({ ...sans, fontSize: 13.5, fontWeight: 700, borderRadius: 999, padding: "6px 13px", cursor: "pointer", border: `1px solid ${on ? c.boss : c.lineStrong}`, background: on ? c.boss : c.folha, color: on ? c.onBoss : c.ink });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 4 }}>
          <button type="button" onClick={() => move(-1)} style={{ ...btnGhost, padding: "6px 9px", minHeight: 36 }} aria-label="Anterior"><ChevronLeft size={16} /></button>
          <button type="button" onClick={() => setCursor(startOfDay(new Date()))} style={{ ...btnGhost, padding: "6px 12px", minHeight: 36 }}>Hoje</button>
          <button type="button" onClick={() => move(1)} style={{ ...btnGhost, padding: "6px 9px", minHeight: 36 }} aria-label="Seguinte"><ChevronRight size={16} /></button>
        </div>
        <div style={{ ...serif, fontSize: 17, color: c.ink, flex: "1 1 180px" }}>{title}</div>
        <div style={{ display: "flex", gap: 4 }}>
          {VIEWS.map(([key, label]) => <button key={key} type="button" onClick={() => setView(key)} style={pill(view === key)}>{label}</button>)}
        </div>
        <button type="button" onClick={() => setNewAt({ date: cursor, minutes: 10 * 60, staffId: filter === "all" ? null : filter })} style={{ ...btnPrimary, minHeight: 36, padding: "6px 14px" }}><Plus size={14} /> Marcação</button>
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <button type="button" onClick={() => setStaffFilter("all")} style={pill(filter === "all")}>Todas</button>
        {statics.staff.map((s) => (
          <button key={s.id} type="button" onClick={() => setStaffFilter(s.id)} style={{ ...pill(filter === s.id), display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 9, height: 9, borderRadius: 999, background: colorFor(s.id) }} /> {s.name}
          </button>
        ))}
      </div>

      {!statics.staff.length && staticsQuery.isSuccess ? (
        <div style={{ ...sans, fontSize: 14, color: c.mist, background: c.folha, border: `1px solid ${c.line}`, borderRadius: 3, padding: 20 }}>Crie primeiro as profissionais e o horário de cada uma (em Configuração).</div>
      ) : view === "month" ? (
        <MonthGrid cursor={cursor} appts={appts} colorFor={colorFor} onDay={(d) => { setCursor(d); setView("day"); }} onOpen={setOpenAppt} />
      ) : (
        <TimeGrid
          columns={columns}
          gridStart={gridStart}
          gridEnd={gridEnd}
          colorFor={colorFor}
          minColWidth={view === "day" ? 150 : filter === "all" ? 110 : 90}
          onSlot={(date, minutes, staffId) => setNewAt({ date, minutes, staffId: staffId || (filter === "all" ? null : filter) })}
          onOpen={setOpenAppt}
        />
      )}
      <div style={{ ...sans, fontSize: 12.5, color: c.mist }}>Clique num espaço livre para marcar. A cinzento: fora do horário ou de folga.</div>

      {openAppt && <AppointmentModal brandId={brand.id} appt={openAppt} staff={statics.staff} onClose={() => setOpenAppt(null)} onOpenContact={(ct) => { setOpenAppt(null); onOpenContact(ct); }} />}
      {newAt && staticsQuery.isSuccess && <NewAppointmentModal brandId={brand.id} statics={statics} initial={newAt} onClose={() => setNewAt(null)} />}
    </div>
  );
}
