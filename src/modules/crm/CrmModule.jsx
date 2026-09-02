import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabaseClient.js";
import { c, sans, serif, Eyebrow } from "../../shared/theme.jsx";
import {
  ArrowLeft, Plus, X, Trash2, Pencil, Phone, Mail, Search, GripVertical,
} from "lucide-react";

/* ---------------------------------------------------------
   CRM — Contactos + Pipeline (Kanban) + Negócios
   Módulo do EMPOWER OS. Ver docs/EMPOWER_OS_ARCHITECTURE_STRATEGY.md.
   Ao contrário dos módulos operacionais da Big Boss, aqui o cliente
   (aprovador_marca/agencia_aprovador) tem acesso total — é a
   ferramenta de trabalho dele, não algo que só aprova. Por isso
   nenhuma ação aqui é gated por CAN_MANAGE_ROLES: quem chega a este
   módulo (via RLS + is_brand_member) pode geri-lo por completo.
--------------------------------------------------------- */

const money = (v) =>
  v == null ? "—" : new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(v);

const initials = (name) =>
  (name || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");

/* ---------------------------------------------------------
   DATA — contactos e tags
--------------------------------------------------------- */
function mapContactRow(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email || "",
    phone: row.phone || "",
    source: row.source || "",
    optedInWhatsapp: !!row.opted_in_whatsapp,
    optedInEmail: !!row.opted_in_email,
    tags: (row.contact_tags || []).map((ct) => ct.tags).filter(Boolean),
    createdAt: row.created_at,
  };
}

function useContacts(brandId) {
  return useQuery({
    queryKey: ["crm_contacts", brandId],
    enabled: !!brandId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contacts")
        .select("*, contact_tags(tag_id, tags(id,name,color))")
        .eq("brand_id", brandId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data.map(mapContactRow);
    },
  });
}

function useSaveContact(brandId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, name, email, phone, source, createdBy }) => {
      if (id) {
        const { error } = await supabase.from("contacts").update({ name, email, phone, source }).eq("id", id);
        if (error) throw error;
        return id;
      }
      const { data, error } = await supabase
        .from("contacts")
        .insert({ brand_id: brandId, name, email, phone, source, created_by: createdBy })
        .select()
        .single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm_contacts", brandId] }),
  });
}

function useDeleteContact(brandId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from("contacts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm_contacts", brandId] }),
  });
}

function useTags(brandId) {
  return useQuery({
    queryKey: ["crm_tags", brandId],
    enabled: !!brandId,
    queryFn: async () => {
      const { data, error } = await supabase.from("tags").select("*").eq("brand_id", brandId).order("name");
      if (error) throw error;
      return data;
    },
  });
}

function useCreateTag(brandId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name) => {
      const { data, error } = await supabase.from("tags").insert({ brand_id: brandId, name }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm_tags", brandId] }),
  });
}

function useToggleContactTag(brandId, contactId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ tagId, active }) => {
      if (active) {
        const { error } = await supabase.from("contact_tags").insert({ brand_id: brandId, contact_id: contactId, tag_id: tagId });
        if (error) throw error;
      } else {
        const { error } = await supabase.from("contact_tags").delete().eq("contact_id", contactId).eq("tag_id", tagId);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm_contacts", brandId] }),
  });
}

/* ---------------------------------------------------------
   DATA — pipeline, fases, negócios
--------------------------------------------------------- */
const DEFAULT_STAGES = [
  { name: "Novo Lead", position: 0 },
  { name: "Contactado", position: 1 },
  { name: "Qualificado", position: 2 },
  { name: "Proposta", position: 3 },
  { name: "Ganho", position: 4, is_won: true },
  { name: "Perdido", position: 5, is_lost: true },
];

function usePipelines(brandId) {
  return useQuery({
    queryKey: ["crm_pipelines", brandId],
    enabled: !!brandId,
    queryFn: async () => {
      const { data, error } = await supabase.from("pipelines").select("*").eq("brand_id", brandId).order("created_at");
      if (error) throw error;
      return data;
    },
  });
}

function useCreateDefaultPipeline(brandId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data: pipeline, error } = await supabase
        .from("pipelines")
        .insert({ brand_id: brandId, name: "Pipeline", is_default: true })
        .select()
        .single();
      if (error) throw error;
      const { error: stagesError } = await supabase
        .from("pipeline_stages")
        .insert(DEFAULT_STAGES.map((s) => ({ ...s, brand_id: brandId, pipeline_id: pipeline.id })));
      if (stagesError) throw stagesError;
      return pipeline;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm_pipelines", brandId] }),
  });
}

function usePipelineStages(pipelineId) {
  return useQuery({
    queryKey: ["crm_pipeline_stages", pipelineId],
    enabled: !!pipelineId,
    queryFn: async () => {
      const { data, error } = await supabase.from("pipeline_stages").select("*").eq("pipeline_id", pipelineId).order("position");
      if (error) throw error;
      return data;
    },
  });
}

function useCreatePipeline(brandId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name) => {
      const { data: pipeline, error } = await supabase
        .from("pipelines")
        .insert({ brand_id: brandId, name, is_default: false })
        .select()
        .single();
      if (error) throw error;
      const { error: stagesError } = await supabase
        .from("pipeline_stages")
        .insert(DEFAULT_STAGES.map((s) => ({ ...s, brand_id: brandId, pipeline_id: pipeline.id })));
      if (stagesError) throw stagesError;
      return pipeline;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm_pipelines", brandId] }),
  });
}

function useUpdatePipeline(brandId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, name }) => {
      const { error } = await supabase.from("pipelines").update({ name }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm_pipelines", brandId] }),
  });
}

function useDeletePipeline(brandId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from("pipelines").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm_pipelines", brandId] }),
  });
}

function useCreateStage(brandId, pipelineId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ name, position }) => {
      const { error } = await supabase.from("pipeline_stages").insert({ brand_id: brandId, pipeline_id: pipelineId, name, position });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm_pipeline_stages", pipelineId] }),
  });
}

function useUpdateStage(pipelineId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, name }) => {
      const { error } = await supabase.from("pipeline_stages").update({ name }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm_pipeline_stages", pipelineId] }),
  });
}

function useDeleteStage(pipelineId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from("pipeline_stages").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm_pipeline_stages", pipelineId] });
      qc.invalidateQueries({ queryKey: ["crm_deals", pipelineId] });
    },
  });
}

function mapDealRow(row) {
  return {
    id: row.id,
    stageId: row.stage_id,
    contactId: row.contact_id,
    contactName: row.contacts?.name || "",
    title: row.title,
    value: row.value,
    status: row.status,
    createdAt: row.created_at,
  };
}

function useDeals(pipelineId) {
  return useQuery({
    queryKey: ["crm_deals", pipelineId],
    enabled: !!pipelineId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("deals")
        .select("*, contacts(id,name)")
        .eq("pipeline_id", pipelineId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data.map(mapDealRow);
    },
  });
}

function useCreateDeal(brandId, pipelineId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ stageId, title, value, contactId, ownerId }) => {
      const { error } = await supabase
        .from("deals")
        .insert({ brand_id: brandId, pipeline_id: pipelineId, stage_id: stageId, title, value: value || null, contact_id: contactId || null, owner_id: ownerId });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm_deals", pipelineId] }),
  });
}

function useUpdateDealStage(pipelineId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, stage }) => {
      const status = stage.is_won ? "won" : stage.is_lost ? "lost" : "open";
      const { error } = await supabase.from("deals").update({ stage_id: stage.id, status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm_deals", pipelineId] }),
  });
}

function useDeleteDeal(pipelineId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from("deals").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm_deals", pipelineId] }),
  });
}

function useDealActivities(dealId) {
  return useQuery({
    queryKey: ["crm_deal_activities", dealId],
    enabled: !!dealId,
    queryFn: async () => {
      const { data, error } = await supabase.from("activities").select("*").eq("deal_id", dealId).order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

function useAddDealNote(brandId, dealId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ body, createdBy }) => {
      const { error } = await supabase.from("activities").insert({ brand_id: brandId, deal_id: dealId, type: "note", body, created_by: createdBy });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm_deal_activities", dealId] }),
  });
}

/* ---------------------------------------------------------
   UI — primitivos partilhados
--------------------------------------------------------- */
const inputStyle = { ...sans, width: "100%", fontSize: 13, border: `1px solid ${c.line}`, borderRadius: 8, padding: "9px 12px", outline: "none", color: c.ink };
const btnPrimary = { ...sans, display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 600, color: "#fff", background: c.boss, border: "none", borderRadius: 8, padding: "9px 16px", cursor: "pointer" };
const btnGhost = { ...sans, display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: c.mist, background: "none", border: `1px solid ${c.line}`, borderRadius: 8, padding: "9px 14px", cursor: "pointer" };

function Modal({ title, onClose, children, width = 420 }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(23,21,31,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60, padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 16, padding: 24, width: "100%", maxWidth: width, maxHeight: "85vh", overflowY: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
          <div style={{ ...serif, fontSize: 17, color: c.ink }}>{title}</div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: c.mist, padding: 4 }}>
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------
   CONTACTOS
--------------------------------------------------------- */
function ContactFormModal({ brandId, contact, onClose, session }) {
  const [name, setName] = useState(contact?.name || "");
  const [email, setEmail] = useState(contact?.email || "");
  const [phone, setPhone] = useState(contact?.phone || "");
  const [source, setSource] = useState(contact?.source || "manual");
  const [newTag, setNewTag] = useState("");
  const saveContact = useSaveContact(brandId);
  const createTag = useCreateTag(brandId);
  const toggleTag = useToggleContactTag(brandId, contact?.id);
  const tagsQuery = useTags(brandId);
  const [error, setError] = useState("");

  const activeTagIds = new Set((contact?.tags || []).map((t) => t.id));

  const save = async () => {
    if (!name.trim()) { setError("O nome é obrigatório."); return; }
    try {
      await saveContact.mutateAsync({ id: contact?.id, name, email, phone, source, createdBy: session.id });
      onClose();
    } catch (err) {
      setError(err.message || "Não foi possível guardar.");
    }
  };

  const addTag = async () => {
    if (!newTag.trim()) return;
    const tag = await createTag.mutateAsync(newTag.trim());
    if (contact?.id) toggleTag.mutate({ tagId: tag.id, active: true });
    setNewTag("");
  };

  return (
    <Modal title={contact ? "Editar contacto" : "Novo contacto"} onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
          <div style={{ ...sans, fontSize: 11.5, color: c.mist, marginBottom: 5 }}>Nome</div>
          <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome do contacto" />
        </div>
        <div>
          <div style={{ ...sans, fontSize: 11.5, color: c.mist, marginBottom: 5 }}>Telefone (WhatsApp)</div>
          <input style={inputStyle} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+351 912 345 678" />
        </div>
        <div>
          <div style={{ ...sans, fontSize: 11.5, color: c.mist, marginBottom: 5 }}>Email</div>
          <input style={inputStyle} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nome@exemplo.com" />
        </div>
        <div>
          <div style={{ ...sans, fontSize: 11.5, color: c.mist, marginBottom: 5 }}>Origem</div>
          <select style={inputStyle} value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="manual">Manual</option>
            <option value="formulario">Formulário</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="importacao">Importação</option>
            <option value="lead_magnet">Lead magnet</option>
            <option value="funil">Funil</option>
          </select>
        </div>

        {contact?.id && (
          <div>
            <div style={{ ...sans, fontSize: 11.5, color: c.mist, marginBottom: 6 }}>Tags</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
              {(tagsQuery.data || []).map((tag) => {
                const active = activeTagIds.has(tag.id);
                return (
                  <button
                    key={tag.id}
                    onClick={() => toggleTag.mutate({ tagId: tag.id, active: !active })}
                    style={{
                      ...sans, fontSize: 11.5, fontWeight: 600, padding: "5px 10px", borderRadius: 999, cursor: "pointer",
                      border: `1px solid ${active ? tag.color : c.line}`,
                      color: active ? "#fff" : c.mist,
                      background: active ? tag.color : "#fff",
                    }}
                  >
                    {tag.name}
                  </button>
                );
              })}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <input style={{ ...inputStyle, fontSize: 12 }} value={newTag} onChange={(e) => setNewTag(e.target.value)} placeholder="Nova tag…" />
              <button onClick={addTag} style={btnGhost}><Plus size={13} /></button>
            </div>
          </div>
        )}

        {error && <div style={{ ...sans, fontSize: 12, color: c.rose }}>{error}</div>}

        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button onClick={save} disabled={saveContact.isPending} style={btnPrimary}>
            {saveContact.isPending ? "A guardar…" : "Guardar"}
          </button>
          <button onClick={onClose} style={btnGhost}>Cancelar</button>
        </div>
      </div>
    </Modal>
  );
}

function ContactsView({ brand, session }) {
  const contactsQuery = useContacts(brand.id);
  const deleteContact = useDeleteContact(brand.id);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(null);

  const contacts = (contactsQuery.data || []).filter((ct) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return ct.name.toLowerCase().includes(q) || ct.email.toLowerCase().includes(q) || ct.phone.includes(q);
  });

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 200, maxWidth: 320 }}>
          <Search size={14} color={c.mist} style={{ position: "absolute", left: 10, top: 10 }} />
          <input
            style={{ ...inputStyle, paddingLeft: 32 }}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Pesquisar contactos…"
          />
        </div>
        <button onClick={() => { setEditing(null); setShowForm(true); }} style={btnPrimary}>
          <Plus size={14} /> Novo contacto
        </button>
      </div>

      {showForm && (
        <ContactFormModal
          brandId={brand.id}
          contact={editing}
          session={session}
          onClose={() => { setShowForm(false); setEditing(null); }}
        />
      )}

      {contactsQuery.isLoading && <div style={{ ...sans, fontSize: 13, color: c.mist }}>A carregar…</div>}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {contacts.map((ct) => (
          <div
            key={ct.id}
            style={{ display: "flex", alignItems: "center", gap: 14, background: "#fff", border: `1px solid ${c.line}`, borderRadius: 12, padding: "12px 16px" }}
          >
            <div style={{ width: 34, height: 34, borderRadius: 999, background: c.bossSoft, color: c.boss, display: "flex", alignItems: "center", justifyContent: "center", ...sans, fontSize: 12.5, fontWeight: 700, flexShrink: 0 }}>
              {initials(ct.name)}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ ...serif, fontSize: 14.5, color: c.ink }}>{ct.name}</div>
              <div style={{ ...sans, fontSize: 11.5, color: c.mist, display: "flex", gap: 12, marginTop: 2, flexWrap: "wrap" }}>
                {ct.phone && <span style={{ display: "flex", alignItems: "center", gap: 4 }}><Phone size={11} /> {ct.phone}</span>}
                {ct.email && <span style={{ display: "flex", alignItems: "center", gap: 4 }}><Mail size={11} /> {ct.email}</span>}
              </div>
            </div>
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap", maxWidth: 200 }}>
              {ct.tags.map((tag) => (
                <span key={tag.id} style={{ ...sans, fontSize: 10.5, fontWeight: 600, color: "#fff", background: tag.color, borderRadius: 999, padding: "3px 8px" }}>
                  {tag.name}
                </span>
              ))}
            </div>
            <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
              <button onClick={() => { setEditing(ct); setShowForm(true); }} style={{ background: "none", border: "none", cursor: "pointer", color: c.mist, padding: 6 }}>
                <Pencil size={14} />
              </button>
              <button onClick={() => setConfirmingDelete(ct.id)} style={{ background: "none", border: "none", cursor: "pointer", color: c.mist, padding: 6 }}>
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
        {!contactsQuery.isLoading && contacts.length === 0 && (
          <div style={{ ...sans, fontSize: 13, color: c.mistLight, textAlign: "center", padding: "40px 0" }}>
            Ainda não há contactos.
          </div>
        )}
      </div>

      {confirmingDelete && (
        <Modal title="Eliminar contacto" onClose={() => setConfirmingDelete(null)} width={360}>
          <div style={{ ...sans, fontSize: 13, color: c.ink, marginBottom: 16 }}>Tens a certeza? Esta ação não pode ser desfeita.</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => deleteContact.mutate(confirmingDelete, { onSuccess: () => setConfirmingDelete(null) })}
              style={{ ...btnPrimary, background: c.rose }}
            >
              Eliminar
            </button>
            <button onClick={() => setConfirmingDelete(null)} style={btnGhost}>Cancelar</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ---------------------------------------------------------
   PIPELINE (KANBAN)
--------------------------------------------------------- */
function NewDealModal({ brandId, pipelineId, stageId, contacts, onClose, session }) {
  const [title, setTitle] = useState("");
  const [value, setValue] = useState("");
  const [contactId, setContactId] = useState("");
  const createDeal = useCreateDeal(brandId, pipelineId);
  const [error, setError] = useState("");

  const save = async () => {
    if (!title.trim()) { setError("O título é obrigatório."); return; }
    try {
      await createDeal.mutateAsync({ stageId, title, value: value ? Number(value) : null, contactId: contactId || null, ownerId: session.id });
      onClose();
    } catch (err) {
      setError(err.message || "Não foi possível criar o negócio.");
    }
  };

  return (
    <Modal title="Novo negócio" onClose={onClose} width={380}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
          <div style={{ ...sans, fontSize: 11.5, color: c.mist, marginBottom: 5 }}>Título</div>
          <input style={inputStyle} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: Pacote redes sociais" />
        </div>
        <div>
          <div style={{ ...sans, fontSize: 11.5, color: c.mist, marginBottom: 5 }}>Valor (€)</div>
          <input style={inputStyle} type="number" value={value} onChange={(e) => setValue(e.target.value)} placeholder="0" />
        </div>
        <div>
          <div style={{ ...sans, fontSize: 11.5, color: c.mist, marginBottom: 5 }}>Contacto</div>
          <select style={inputStyle} value={contactId} onChange={(e) => setContactId(e.target.value)}>
            <option value="">Sem contacto associado</option>
            {contacts.map((ct) => <option key={ct.id} value={ct.id}>{ct.name}</option>)}
          </select>
        </div>
        {error && <div style={{ ...sans, fontSize: 12, color: c.rose }}>{error}</div>}
        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          <button onClick={save} disabled={createDeal.isPending} style={btnPrimary}>
            {createDeal.isPending ? "A criar…" : "Criar negócio"}
          </button>
          <button onClick={onClose} style={btnGhost}>Cancelar</button>
        </div>
      </div>
    </Modal>
  );
}

function DealDrawer({ deal, stages, pipelineId, brandId, onClose, session }) {
  const updateStage = useUpdateDealStage(pipelineId);
  const deleteDeal = useDeleteDeal(pipelineId);
  const activitiesQuery = useDealActivities(deal.id);
  const addNote = useAddDealNote(brandId, deal.id);
  const [note, setNote] = useState("");

  const sendNote = async () => {
    if (!note.trim()) return;
    await addNote.mutateAsync({ body: note, createdBy: session.id });
    setNote("");
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(23,21,31,0.35)", zIndex: 60, display: "flex", justifyContent: "flex-end" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", width: "100%", maxWidth: 420, height: "100%", padding: 24, overflowY: "auto" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 18 }}>
          <div>
            <div style={{ ...serif, fontSize: 18, color: c.ink }}>{deal.title}</div>
            {deal.contactName && <div style={{ ...sans, fontSize: 12, color: c.mist, marginTop: 3 }}>{deal.contactName}</div>}
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: c.mist, padding: 4 }}><X size={18} /></button>
        </div>

        <div style={{ ...serif, fontSize: 22, color: c.boss, marginBottom: 18 }}>{money(deal.value)}</div>

        <div style={{ ...sans, fontSize: 11.5, color: c.mist, marginBottom: 6 }}>Fase</div>
        <select
          style={{ ...inputStyle, marginBottom: 18 }}
          value={deal.stageId}
          onChange={(e) => {
            const stage = stages.find((s) => s.id === e.target.value);
            if (stage) updateStage.mutate({ id: deal.id, stage });
          }}
        >
          {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>

        <div style={{ ...sans, fontSize: 11.5, color: c.mist, marginBottom: 8 }}>Notas</div>
        <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
          <input style={inputStyle} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Escrever uma nota…" onKeyDown={(e) => e.key === "Enter" && sendNote()} />
          <button onClick={sendNote} style={btnGhost}><Plus size={13} /></button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24 }}>
          {(activitiesQuery.data || []).map((a) => (
            <div key={a.id} style={{ background: c.paper, borderRadius: 8, padding: "8px 12px" }}>
              <div style={{ ...sans, fontSize: 12.5, color: c.ink }}>{a.body}</div>
              <div style={{ ...sans, fontSize: 10.5, color: c.mistLight, marginTop: 3 }}>{new Date(a.created_at).toLocaleString("pt-PT")}</div>
            </div>
          ))}
        </div>

        <button
          onClick={() => deleteDeal.mutate(deal.id, { onSuccess: onClose })}
          style={{ ...sans, display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: c.rose, background: "none", border: `1px solid ${c.line}`, borderRadius: 8, padding: "9px 14px", cursor: "pointer" }}
        >
          <Trash2 size={13} /> Eliminar negócio
        </button>
      </div>
    </div>
  );
}

function DealCard({ deal, onOpen }) {
  return (
    <div
      draggable
      onDragStart={(e) => e.dataTransfer.setData("text/plain", deal.id)}
      onClick={onOpen}
      style={{ background: "#fff", border: `1px solid ${c.line}`, borderRadius: 10, padding: "10px 12px", cursor: "grab" }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
        <GripVertical size={13} color={c.mistLight} style={{ marginTop: 2, flexShrink: 0 }} />
        <div style={{ minWidth: 0 }}>
          <div style={{ ...sans, fontSize: 13, fontWeight: 600, color: c.ink }}>{deal.title}</div>
          {deal.contactName && <div style={{ ...sans, fontSize: 11, color: c.mist, marginTop: 2 }}>{deal.contactName}</div>}
          <div style={{ ...sans, fontSize: 12, fontWeight: 600, color: c.boss, marginTop: 5 }}>{money(deal.value)}</div>
        </div>
      </div>
    </div>
  );
}

function PipelineTab({ pipeline, active, onSelect, onRename, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(pipeline.name);

  const save = () => {
    setEditing(false);
    const trimmed = name.trim();
    if (trimmed && trimmed !== pipeline.name) onRename(trimmed);
    else setName(pipeline.name);
  };

  if (editing) {
    return (
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") { setName(pipeline.name); setEditing(false); }
        }}
        style={{ ...sans, fontSize: 12.5, fontWeight: 600, padding: "7px 10px", borderRadius: 7, border: `1px solid ${c.boss}`, outline: "none", width: 140 }}
      />
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", borderRadius: 7, background: active ? c.boss : "transparent" }}>
      <button
        onClick={onSelect}
        style={{ ...sans, fontSize: 12.5, fontWeight: 600, padding: "7px 12px", border: "none", background: "transparent", color: active ? "#fff" : c.mist, cursor: "pointer" }}
      >
        {pipeline.name}
      </button>
      {active && (
        <>
          <button onClick={() => setEditing(true)} style={{ background: "none", border: "none", cursor: "pointer", color: "#fff", opacity: 0.85, padding: "7px 6px" }}>
            <Pencil size={11} />
          </button>
          <button onClick={onDelete} style={{ background: "none", border: "none", cursor: "pointer", color: "#fff", opacity: 0.85, padding: "7px 10px" }}>
            <Trash2 size={11} />
          </button>
        </>
      )}
    </div>
  );
}

function NewPipelineModal({ onCreate, onClose, isPending }) {
  const [name, setName] = useState("");
  return (
    <Modal title="Novo pipeline" onClose={onClose} width={360}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
          <div style={{ ...sans, fontSize: 11.5, color: c.mist, marginBottom: 5 }}>Nome</div>
          <input
            autoFocus
            style={inputStyle}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex: Pipeline de Vendas"
            onKeyDown={(e) => e.key === "Enter" && name.trim() && onCreate(name.trim())}
          />
        </div>
        <div style={{ ...sans, fontSize: 11.5, color: c.mist }}>Começa com as fases: Novo Lead, Contactado, Qualificado, Proposta, Ganho, Perdido — todas editáveis depois.</div>
        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          <button onClick={() => name.trim() && onCreate(name.trim())} disabled={isPending} style={btnPrimary}>
            {isPending ? "A criar…" : "Criar pipeline"}
          </button>
          <button onClick={onClose} style={btnGhost}>Cancelar</button>
        </div>
      </div>
    </Modal>
  );
}

function StageHeader({ stage, count, total, onRename, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(stage.name);

  const save = () => {
    setEditing(false);
    const trimmed = name.trim();
    if (trimmed && trimmed !== stage.name) onRename(trimmed);
    else setName(stage.name);
  };

  return (
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 6 }}>
      <div style={{ minWidth: 0, flex: 1 }}>
        {editing ? (
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={save}
            onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") { setName(stage.name); setEditing(false); } }}
            style={{ ...sans, fontSize: 12.5, fontWeight: 700, padding: "3px 6px", borderRadius: 6, border: `1px solid ${c.boss}`, outline: "none", width: "100%" }}
          />
        ) : (
          <div onClick={() => setEditing(true)} style={{ ...sans, fontSize: 12.5, fontWeight: 700, color: c.ink, cursor: "text" }} title="Clicar para renomear">
            {stage.name}
          </div>
        )}
        <div style={{ ...sans, fontSize: 11, color: c.mist, marginTop: 1 }}>{count} · {money(total)}</div>
      </div>
      <button onClick={onDelete} style={{ background: "none", border: "none", cursor: "pointer", color: c.mistLight, padding: 4, flexShrink: 0 }}>
        <Trash2 size={12} />
      </button>
    </div>
  );
}

function AddStageColumn({ onAdd }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");

  const save = () => {
    if (name.trim()) onAdd(name.trim());
    setName("");
    setAdding(false);
  };

  if (adding) {
    return (
      <div style={{ background: c.paper, borderRadius: 12, padding: 12, minWidth: 200, flexShrink: 0, alignSelf: "flex-start" }}>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setAdding(false); }}
          onBlur={save}
          placeholder="Nome da fase…"
          style={{ ...sans, width: "100%", fontSize: 12.5, border: `1px solid ${c.boss}`, borderRadius: 7, padding: "7px 10px", outline: "none" }}
        />
      </div>
    );
  }

  return (
    <button
      onClick={() => setAdding(true)}
      style={{
        ...sans, display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 600, color: c.mist,
        background: "transparent", border: `1.5px dashed ${c.line}`, borderRadius: 12, padding: "12px 16px",
        minWidth: 150, flexShrink: 0, cursor: "pointer", alignSelf: "flex-start",
      }}
    >
      <Plus size={14} /> Nova fase
    </button>
  );
}

function PipelineView({ brand, session }) {
  const pipelinesQuery = usePipelines(brand.id);
  const createDefaultPipeline = useCreateDefaultPipeline(brand.id);
  const creatingRef = useRef(false);
  const [selectedPipelineId, setSelectedPipelineId] = useState(null);
  const [addingPipeline, setAddingPipeline] = useState(false);
  const [confirmDeletePipeline, setConfirmDeletePipeline] = useState(null);
  const [confirmDeleteStage, setConfirmDeleteStage] = useState(null);

  useEffect(() => {
    if (pipelinesQuery.data && pipelinesQuery.data.length === 0 && !creatingRef.current) {
      creatingRef.current = true;
      createDefaultPipeline.mutate();
    }
  }, [pipelinesQuery.data]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!pipelinesQuery.data || pipelinesQuery.data.length === 0) return;
    const stillExists = pipelinesQuery.data.some((p) => p.id === selectedPipelineId);
    if (!stillExists) {
      const def = pipelinesQuery.data.find((p) => p.is_default) || pipelinesQuery.data[0];
      setSelectedPipelineId(def.id);
    }
  }, [pipelinesQuery.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const pipeline = pipelinesQuery.data?.find((p) => p.id === selectedPipelineId);
  const stagesQuery = usePipelineStages(pipeline?.id);
  const dealsQuery = useDeals(pipeline?.id);
  const contactsQuery = useContacts(brand.id);
  const [addingToStage, setAddingToStage] = useState(null);
  const [openDeal, setOpenDeal] = useState(null);
  const updateDealStage = useUpdateDealStage(pipeline?.id);

  const createPipeline = useCreatePipeline(brand.id);
  const updatePipeline = useUpdatePipeline(brand.id);
  const deletePipeline = useDeletePipeline(brand.id);
  const createStage = useCreateStage(brand.id, pipeline?.id);
  const updateStageName = useUpdateStage(pipeline?.id);
  const deleteStage = useDeleteStage(pipeline?.id);

  if (pipelinesQuery.isLoading || (pipelinesQuery.data?.length === 0) || !pipeline) {
    return <div style={{ ...sans, fontSize: 13, color: c.mist }}>A preparar o pipeline…</div>;
  }

  const stages = stagesQuery.data || [];
  const deals = dealsQuery.data || [];
  const pipelines = pipelinesQuery.data || [];

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap", marginBottom: 16 }}>
        {pipelines.map((p) => (
          <PipelineTab
            key={p.id}
            pipeline={p}
            active={p.id === pipeline.id}
            onSelect={() => setSelectedPipelineId(p.id)}
            onRename={(name) => updatePipeline.mutate({ id: p.id, name })}
            onDelete={() => setConfirmDeletePipeline(p)}
          />
        ))}
        <button onClick={() => setAddingPipeline(true)} style={{ ...btnGhost, padding: "7px 12px" }}>
          <Plus size={12} /> Pipeline
        </button>
      </div>

      <div style={{ display: "flex", gap: 14, overflowX: "auto", paddingBottom: 12 }}>
        {stages.map((stage) => {
          const stageDeals = deals.filter((d) => d.stageId === stage.id);
          const total = stageDeals.reduce((sum, d) => sum + (d.value || 0), 0);
          return (
            <div
              key={stage.id}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                const dealId = e.dataTransfer.getData("text/plain");
                if (dealId) updateDealStage.mutate({ id: dealId, stage });
              }}
              style={{ background: c.paper, borderRadius: 12, padding: 12, minWidth: 250, flexShrink: 0, display: "flex", flexDirection: "column", gap: 10 }}
            >
              <StageHeader
                stage={stage}
                count={stageDeals.length}
                total={total}
                onRename={(name) => updateStageName.mutate({ id: stage.id, name })}
                onDelete={() => setConfirmDeleteStage({ stage, count: stageDeals.length })}
              />
              <div style={{ display: "flex", flexDirection: "column", gap: 8, minHeight: 40 }}>
                {stageDeals.map((deal) => (
                  <DealCard key={deal.id} deal={deal} onOpen={() => setOpenDeal(deal)} />
                ))}
              </div>
              <button onClick={() => setAddingToStage(stage.id)} style={{ ...sans, display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: c.boss, background: "none", border: "none", cursor: "pointer", padding: "4px 2px" }}>
                <Plus size={13} /> Negócio
              </button>
            </div>
          );
        })}
        <AddStageColumn onAdd={(name) => createStage.mutate({ name, position: stages.length })} />
      </div>

      {addingToStage && (
        <NewDealModal
          brandId={brand.id}
          pipelineId={pipeline.id}
          stageId={addingToStage}
          contacts={contactsQuery.data || []}
          session={session}
          onClose={() => setAddingToStage(null)}
        />
      )}

      {openDeal && (
        <DealDrawer
          deal={deals.find((d) => d.id === openDeal.id) || openDeal}
          stages={stages}
          pipelineId={pipeline.id}
          brandId={brand.id}
          session={session}
          onClose={() => setOpenDeal(null)}
        />
      )}

      {addingPipeline && (
        <NewPipelineModal
          isPending={createPipeline.isPending}
          onCreate={(name) => createPipeline.mutate(name, { onSuccess: () => setAddingPipeline(false) })}
          onClose={() => setAddingPipeline(false)}
        />
      )}

      {confirmDeletePipeline && (
        <Modal title="Eliminar pipeline" onClose={() => setConfirmDeletePipeline(null)} width={380}>
          <div style={{ ...sans, fontSize: 13, color: c.ink, marginBottom: 16, lineHeight: 1.5 }}>
            Vais eliminar <strong>{confirmDeletePipeline.name}</strong>, incluindo todas as fases e negócios lá dentro. Esta ação não pode ser desfeita.
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => deletePipeline.mutate(confirmDeletePipeline.id, { onSuccess: () => setConfirmDeletePipeline(null) })}
              style={{ ...btnPrimary, background: c.rose }}
            >
              Eliminar pipeline
            </button>
            <button onClick={() => setConfirmDeletePipeline(null)} style={btnGhost}>Cancelar</button>
          </div>
        </Modal>
      )}

      {confirmDeleteStage && (
        <Modal title="Eliminar fase" onClose={() => setConfirmDeleteStage(null)} width={380}>
          <div style={{ ...sans, fontSize: 13, color: c.ink, marginBottom: 16, lineHeight: 1.5 }}>
            Vais eliminar a fase <strong>{confirmDeleteStage.stage.name}</strong>
            {confirmDeleteStage.count > 0 ? <> e os <strong>{confirmDeleteStage.count}</strong> negócio(s) que lá estão</> : ""}. Esta ação não pode ser desfeita.
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => deleteStage.mutate(confirmDeleteStage.stage.id, { onSuccess: () => setConfirmDeleteStage(null) })}
              style={{ ...btnPrimary, background: c.rose }}
            >
              Eliminar fase
            </button>
            <button onClick={() => setConfirmDeleteStage(null)} style={btnGhost}>Cancelar</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ---------------------------------------------------------
   MÓDULO
--------------------------------------------------------- */
export default function CrmModule({ brand, onBack, session }) {
  const [tab, setTab] = useState("pipeline");

  return (
    <div className="bb-page" style={{ padding: "8px 40px 60px", maxWidth: 1080 }}>
      <button onClick={onBack} style={{ ...sans, display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: c.mist, background: "none", border: "none", cursor: "pointer", marginBottom: 16 }}>
        <ArrowLeft size={14} /> {brand.name}
      </button>
      <Eyebrow>CRM</Eyebrow>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <h1 style={{ ...serif, fontSize: 27, fontWeight: 500, color: c.ink, margin: 0 }}>Contactos &amp; Pipeline</h1>
        <div style={{ display: "flex", gap: 2, background: c.paper, borderRadius: 9, padding: 3 }}>
          {[{ key: "pipeline", label: "Pipeline" }, { key: "contactos", label: "Contactos" }].map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                ...sans, fontSize: 12.5, fontWeight: 600, padding: "7px 14px", borderRadius: 7, border: "none", cursor: "pointer",
                color: tab === t.key ? "#fff" : c.mist, background: tab === t.key ? c.boss : "transparent",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === "pipeline" ? <PipelineView brand={brand} session={session} /> : <ContactsView brand={brand} session={session} />}
    </div>
  );
}
