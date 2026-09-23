import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabaseClient.js";
import { c, sans, serif, Eyebrow, Modal, inputStyle, btnPrimary, btnGhost } from "../../shared/theme.jsx";
import { ArrowLeft, Plus, Trash2, Pencil, ChevronUp, ChevronDown, Zap, Play, Pause } from "lucide-react";

/* ---------------------------------------------------------
   AUTOMAÇÕES — motor orientado a dados, não if/else hardcoded.
   Módulo do EMPOWER OS. Ver docs/EMPOWER_OS_ARCHITECTURE_STRATEGY.md
   (secção 17). Cada automação corre passo a passo através do Edge
   Function "automations-run", agendado a cada minuto por pg_cron
   (supabase/33_automations_cron.sql) — nada disto executa no
   frontend, aqui só se desenha a automação.

   Deliberadamente sem passos de condição/ramificação na UI ainda
   (ver secção 22 — "não construir editor visual estilo BPMN já").
   Uma automação é, por agora, sempre uma sequência linear.
--------------------------------------------------------- */

const TRIGGER_TYPES = [
  { value: "contact_created", label: "Novo contacto" },
  { value: "contact_tagged", label: "Tag adicionada a um contacto" },
  { value: "whatsapp_message_received", label: "Mensagem de WhatsApp recebida" },
  { value: "form_submitted", label: "Formulário submetido" },
];

const ACTION_TYPES = [
  { value: "add_tag", label: "Adicionar tag" },
  { value: "remove_tag", label: "Remover tag" },
  { value: "create_task", label: "Criar tarefa" },
  { value: "send_whatsapp", label: "Enviar mensagem de WhatsApp" },
  { value: "send_sms", label: "Enviar SMS" },
  { value: "http_request", label: "Pedido HTTP (webhook)" },
];

const triggerLabel = (value) => TRIGGER_TYPES.find((t) => t.value === value)?.label || value;
const actionLabel = (value) => ACTION_TYPES.find((a) => a.value === value)?.label || value;

/* ---------------------------------------------------------
   DATA
--------------------------------------------------------- */
function useAutomations(brandId) {
  return useQuery({
    queryKey: ["automations", brandId],
    enabled: !!brandId,
    queryFn: async () => {
      const { data, error } = await supabase.from("automations").select("*").eq("brand_id", brandId).order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

function useCreateAutomation(brandId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ name, triggerType, triggerConfig }) => {
      const { data, error } = await supabase
        .from("automations")
        .insert({ brand_id: brandId, name, trigger_type: triggerType, trigger_config: triggerConfig || {}, status: "draft" })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["automations", brandId] }),
  });
}

function useUpdateAutomation(brandId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }) => {
      const { error } = await supabase.from("automations").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["automations", brandId] }),
  });
}

function useDeleteAutomation(brandId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from("automations").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["automations", brandId] }),
  });
}

function useSteps(automationId) {
  return useQuery({
    queryKey: ["automation_steps", automationId],
    enabled: !!automationId,
    queryFn: async () => {
      const { data, error } = await supabase.from("automation_steps").select("*").eq("automation_id", automationId).order("position");
      if (error) throw error;
      return data;
    },
  });
}

function useCreateStep(brandId, automationId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (step) => {
      const { error } = await supabase.from("automation_steps").insert({ brand_id: brandId, automation_id: automationId, ...step });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["automation_steps", automationId] }),
  });
}

function useUpdateStep(automationId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }) => {
      const { error } = await supabase.from("automation_steps").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["automation_steps", automationId] }),
  });
}

function useDeleteStep(automationId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from("automation_steps").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["automation_steps", automationId] }),
  });
}

function useMoveStep(automationId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ stepId, otherStepId, stepPos, otherPos }) => {
      await supabase.from("automation_steps").update({ position: otherPos }).eq("id", stepId);
      await supabase.from("automation_steps").update({ position: stepPos }).eq("id", otherStepId);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["automation_steps", automationId] }),
  });
}

// Mesma queryKey do módulo de CRM — as duas vistas partilham a
// mesma lista de tags em cache, sem precisar de um módulo de dados à parte.
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

// Idem para os formulários — mesma queryKey do módulo de Formulários.
function useForms(brandId) {
  return useQuery({
    queryKey: ["forms", brandId],
    enabled: !!brandId,
    queryFn: async () => {
      const { data, error } = await supabase.from("forms").select("id, name").eq("brand_id", brandId).order("name");
      if (error) throw error;
      return data;
    },
  });
}

/* ---------------------------------------------------------
   CRIAR AUTOMAÇÃO
--------------------------------------------------------- */
function NewAutomationModal({ brandId, tags, forms, onClose }) {
  const [name, setName] = useState("");
  const [triggerType, setTriggerType] = useState(TRIGGER_TYPES[0].value);
  const [tagId, setTagId] = useState("");
  const [formId, setFormId] = useState("");
  const [error, setError] = useState("");
  const createAutomation = useCreateAutomation(brandId);

  const save = async () => {
    if (!name.trim()) { setError("O nome é obrigatório."); return; }
    if (triggerType === "contact_tagged" && !tagId) { setError("Escolhe a tag."); return; }
    try {
      const triggerConfig =
        triggerType === "contact_tagged" ? { tagId } :
        triggerType === "form_submitted" && formId ? { formId } : {};
      await createAutomation.mutateAsync({ name: name.trim(), triggerType, triggerConfig });
      onClose();
    } catch (err) {
      setError(err.message || "Não foi possível criar a automação.");
    }
  };

  return (
    <Modal title="Nova automação" onClose={onClose} width={420}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
          <div style={{ ...sans, fontSize: 11.5, color: c.mist, marginBottom: 5 }}>Nome</div>
          <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Boas-vindas a novo lead" />
        </div>
        <div>
          <div style={{ ...sans, fontSize: 11.5, color: c.mist, marginBottom: 5 }}>Quando…</div>
          <select style={inputStyle} value={triggerType} onChange={(e) => setTriggerType(e.target.value)}>
            {TRIGGER_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        {triggerType === "contact_tagged" && (
          <div>
            <div style={{ ...sans, fontSize: 11.5, color: c.mist, marginBottom: 5 }}>Tag</div>
            <select style={inputStyle} value={tagId} onChange={(e) => setTagId(e.target.value)}>
              <option value="">Escolhe uma tag…</option>
              {(tags || []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            {!tags?.length && <div style={{ ...sans, fontSize: 11.5, color: c.mist, marginTop: 5 }}>Ainda não há tags — cria uma primeiro no CRM.</div>}
          </div>
        )}
        {triggerType === "form_submitted" && (
          <div>
            <div style={{ ...sans, fontSize: 11.5, color: c.mist, marginBottom: 5 }}>Formulário (opcional)</div>
            <select style={inputStyle} value={formId} onChange={(e) => setFormId(e.target.value)}>
              <option value="">Qualquer formulário</option>
              {(forms || []).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </div>
        )}
        {error && <div style={{ ...sans, fontSize: 12.5, color: c.rose }}>{error}</div>}
        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          <button onClick={save} disabled={createAutomation.isPending} style={btnPrimary}>
            {createAutomation.isPending ? "A criar…" : "Criar automação"}
          </button>
          <button onClick={onClose} style={btnGhost}>Cancelar</button>
        </div>
      </div>
    </Modal>
  );
}

/* ---------------------------------------------------------
   PASSOS
--------------------------------------------------------- */
function StepFormModal({ brandId, automationId, step, tags, position, onClose }) {
  const isEdit = !!step;
  const [type, setType] = useState(step?.type || "action");
  const [actionType, setActionType] = useState(step?.action_type || ACTION_TYPES[0].value);
  const [waitMinutes, setWaitMinutes] = useState(step?.wait_minutes || 60);
  const [tagId, setTagId] = useState(step?.config?.tagId || "");
  const [title, setTitle] = useState(step?.config?.title || "");
  const [dueInMinutes, setDueInMinutes] = useState(step?.config?.dueInMinutes || "");
  const [body, setBody] = useState(step?.config?.body || "");
  const [url, setUrl] = useState(step?.config?.url || "");
  const [error, setError] = useState("");

  const createStep = useCreateStep(brandId, automationId);
  const updateStep = useUpdateStep(automationId);

  const buildPayload = () => {
    if (type === "wait") {
      return { type: "wait", position: step?.position ?? position, wait_minutes: Number(waitMinutes) || 1, action_type: null, config: {} };
    }
    const config =
      actionType === "add_tag" || actionType === "remove_tag" ? { tagId } :
      actionType === "create_task" ? { title, dueInMinutes: dueInMinutes ? Number(dueInMinutes) : null } :
      actionType === "send_whatsapp" || actionType === "send_sms" ? { body } :
      actionType === "http_request" ? { url } : {};
    return { type: "action", position: step?.position ?? position, action_type: actionType, config };
  };

  const save = async () => {
    setError("");
    if (type === "action" && (actionType === "add_tag" || actionType === "remove_tag") && !tagId) {
      setError("Escolhe a tag."); return;
    }
    if (type === "action" && (actionType === "send_whatsapp" || actionType === "send_sms") && !body.trim()) {
      setError("Escreve a mensagem."); return;
    }
    if (type === "action" && actionType === "http_request" && !url.trim()) {
      setError("Indica o URL."); return;
    }
    try {
      const payload = buildPayload();
      if (isEdit) await updateStep.mutateAsync({ id: step.id, patch: payload });
      else await createStep.mutateAsync(payload);
      onClose();
    } catch (err) {
      setError(err.message || "Não foi possível guardar o passo.");
    }
  };

  return (
    <Modal title={isEdit ? "Editar passo" : "Novo passo"} onClose={onClose} width={420}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", gap: 2, background: c.paper, borderRadius: 8, padding: 3, width: "fit-content" }}>
          {[{ k: "action", l: "Ação" }, { k: "wait", l: "Esperar" }].map((o) => (
            <button
              key={o.k}
              onClick={() => setType(o.k)}
              style={{
                ...sans, fontSize: 12, fontWeight: 600, padding: "6px 12px", borderRadius: 6, border: "none", cursor: "pointer",
                color: type === o.k ? "#fff" : c.mist, background: type === o.k ? c.boss : "transparent",
              }}
            >
              {o.l}
            </button>
          ))}
        </div>

        {type === "wait" ? (
          <div>
            <div style={{ ...sans, fontSize: 11.5, color: c.mist, marginBottom: 5 }}>Esperar quantos minutos</div>
            <input type="number" min="1" style={inputStyle} value={waitMinutes} onChange={(e) => setWaitMinutes(e.target.value)} />
          </div>
        ) : (
          <>
            <div>
              <div style={{ ...sans, fontSize: 11.5, color: c.mist, marginBottom: 5 }}>Ação</div>
              <select style={inputStyle} value={actionType} onChange={(e) => setActionType(e.target.value)}>
                {ACTION_TYPES.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
              </select>
            </div>

            {(actionType === "add_tag" || actionType === "remove_tag") && (
              <div>
                <div style={{ ...sans, fontSize: 11.5, color: c.mist, marginBottom: 5 }}>Tag</div>
                <select style={inputStyle} value={tagId} onChange={(e) => setTagId(e.target.value)}>
                  <option value="">Escolhe uma tag…</option>
                  {(tags || []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
            )}

            {actionType === "create_task" && (
              <>
                <div>
                  <div style={{ ...sans, fontSize: 11.5, color: c.mist, marginBottom: 5 }}>Título da tarefa</div>
                  <input style={inputStyle} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: Ligar ao lead" />
                </div>
                <div>
                  <div style={{ ...sans, fontSize: 11.5, color: c.mist, marginBottom: 5 }}>Prazo em minutos a partir de agora (opcional)</div>
                  <input type="number" style={inputStyle} value={dueInMinutes} onChange={(e) => setDueInMinutes(e.target.value)} />
                </div>
              </>
            )}

            {(actionType === "send_whatsapp" || actionType === "send_sms") && (
              <div>
                <div style={{ ...sans, fontSize: 11.5, color: c.mist, marginBottom: 5 }}>Mensagem</div>
                <textarea rows={3} style={{ ...inputStyle, resize: "vertical" }} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Texto a enviar ao contacto" />
              </div>
            )}

            {actionType === "http_request" && (
              <div>
                <div style={{ ...sans, fontSize: 11.5, color: c.mist, marginBottom: 5 }}>URL</div>
                <input style={inputStyle} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
              </div>
            )}
          </>
        )}

        {error && <div style={{ ...sans, fontSize: 12.5, color: c.rose }}>{error}</div>}

        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          <button onClick={save} disabled={createStep.isPending || updateStep.isPending} style={btnPrimary}>
            {createStep.isPending || updateStep.isPending ? "A guardar…" : "Guardar passo"}
          </button>
          <button onClick={onClose} style={btnGhost}>Cancelar</button>
        </div>
      </div>
    </Modal>
  );
}

function stepSummary(step) {
  if (step.type === "wait") return `Esperar ${step.wait_minutes} min`;
  return actionLabel(step.action_type);
}

function AutomationEditor({ brand, automation, onBack }) {
  const stepsQuery = useSteps(automation.id);
  const tagsQuery = useTags(brand.id);
  const updateAutomation = useUpdateAutomation(brand.id);
  const deleteStep = useDeleteStep(automation.id);
  const moveStep = useMoveStep(automation.id);
  const [editingStep, setEditingStep] = useState(null);
  const [addingStep, setAddingStep] = useState(false);
  const [confirmDeleteStep, setConfirmDeleteStep] = useState(null);

  const steps = stepsQuery.data || [];
  const isActive = automation.status === "active";

  return (
    <div>
      <button onClick={onBack} style={{ ...sans, display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: c.mist, background: "none", border: "none", cursor: "pointer", marginBottom: 16 }}>
        <ArrowLeft size={14} /> Automações
      </button>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6, flexWrap: "wrap", gap: 10 }}>
        <h1 style={{ ...serif, fontSize: 24, color: c.ink, margin: 0 }}>{automation.name}</h1>
        <button
          onClick={() => updateAutomation.mutate({ id: automation.id, patch: { status: isActive ? "paused" : "active" } })}
          style={{ ...(isActive ? btnGhost : btnPrimary), display: "flex", alignItems: "center", gap: 6 }}
        >
          {isActive ? <><Pause size={13} /> Pausar</> : <><Play size={13} /> Ativar</>}
        </button>
      </div>
      <div style={{ ...sans, fontSize: 12.5, color: c.mist, marginBottom: 24 }}>
        Quando: <strong>{triggerLabel(automation.trigger_type)}</strong>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {steps.map((step, i) => (
          <div key={step.id} style={{ display: "flex", alignItems: "center", gap: 12, background: "#fff", border: `1px solid ${c.line}`, borderRadius: 12, padding: "12px 16px" }}>
            <div style={{ width: 26, height: 26, borderRadius: 999, background: c.bossSoft, color: c.boss, display: "flex", alignItems: "center", justifyContent: "center", ...sans, fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
              {i + 1}
            </div>
            <div style={{ flex: 1, ...sans, fontSize: 13.5, color: c.ink }}>{stepSummary(step)}</div>
            <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
              <button
                onClick={() => moveStep.mutate({ stepId: step.id, otherStepId: steps[i - 1].id, stepPos: step.position, otherPos: steps[i - 1].position })}
                disabled={i === 0}
                style={{ background: "none", border: "none", cursor: i === 0 ? "default" : "pointer", color: i === 0 ? c.line : c.mist, padding: 5 }}
              >
                <ChevronUp size={14} />
              </button>
              <button
                onClick={() => moveStep.mutate({ stepId: step.id, otherStepId: steps[i + 1].id, stepPos: step.position, otherPos: steps[i + 1].position })}
                disabled={i === steps.length - 1}
                style={{ background: "none", border: "none", cursor: i === steps.length - 1 ? "default" : "pointer", color: i === steps.length - 1 ? c.line : c.mist, padding: 5 }}
              >
                <ChevronDown size={14} />
              </button>
              <button onClick={() => setEditingStep(step)} style={{ background: "none", border: "none", cursor: "pointer", color: c.mist, padding: 5 }}>
                <Pencil size={13} />
              </button>
              <button onClick={() => setConfirmDeleteStep(step)} style={{ background: "none", border: "none", cursor: "pointer", color: c.mist, padding: 5 }}>
                <Trash2 size={13} />
              </button>
            </div>
          </div>
        ))}

        <button
          onClick={() => setAddingStep(true)}
          style={{ ...sans, display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 600, color: c.mist, background: "transparent", border: `1.5px dashed ${c.line}`, borderRadius: 12, padding: "12px 16px", cursor: "pointer" }}
        >
          <Plus size={14} /> Novo passo
        </button>
      </div>

      {(addingStep || editingStep) && (
        <StepFormModal
          brandId={brand.id}
          automationId={automation.id}
          step={editingStep}
          tags={tagsQuery.data}
          position={steps.length + 1}
          onClose={() => { setAddingStep(false); setEditingStep(null); }}
        />
      )}

      {confirmDeleteStep && (
        <Modal title="Eliminar passo" onClose={() => setConfirmDeleteStep(null)} width={360}>
          <div style={{ ...sans, fontSize: 13, color: c.ink, marginBottom: 16 }}>Tens a certeza? Esta ação não pode ser desfeita.</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => deleteStep.mutate(confirmDeleteStep.id, { onSuccess: () => setConfirmDeleteStep(null) })} style={{ ...btnPrimary, background: c.rose }}>
              Eliminar
            </button>
            <button onClick={() => setConfirmDeleteStep(null)} style={btnGhost}>Cancelar</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ---------------------------------------------------------
   MÓDULO
--------------------------------------------------------- */
export default function AutomationsModule({ brand, onBack }) {
  const automationsQuery = useAutomations(brand.id);
  const tagsQuery = useTags(brand.id);
  const formsQuery = useForms(brand.id);
  const deleteAutomation = useDeleteAutomation(brand.id);
  const [showNew, setShowNew] = useState(false);
  const [openAutomation, setOpenAutomation] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const automations = automationsQuery.data || [];
  const open = openAutomation ? automations.find((a) => a.id === openAutomation.id) : null;

  if (open) {
    return <AutomationEditor brand={brand} automation={open} onBack={() => setOpenAutomation(null)} />;
  }

  return (
    <div className="bb-page" style={{ padding: "8px 40px 60px", maxWidth: 1040 }}>
      <button onClick={onBack} style={{ ...sans, display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: c.mist, background: "none", border: "none", cursor: "pointer", marginBottom: 20 }}>
        <ArrowLeft size={14} /> Voltar à marca
      </button>

      <Eyebrow>Automações</Eyebrow>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <h1 style={{ ...serif, fontSize: 24, color: c.ink, margin: 0 }}>Automações</h1>
        <button onClick={() => setShowNew(true)} style={btnPrimary}>
          <Plus size={14} /> Nova automação
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {automations.map((a) => (
          <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 14, background: "#fff", border: `1px solid ${c.line}`, borderRadius: 12, padding: "14px 18px", cursor: "pointer" }} onClick={() => setOpenAutomation(a)}>
            <div style={{ width: 34, height: 34, borderRadius: 9, background: c.bossSoft, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Zap size={16} color={c.boss} strokeWidth={1.8} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ ...serif, fontSize: 15, color: c.ink }}>{a.name}</div>
              <div style={{ ...sans, fontSize: 11.5, color: c.mist, marginTop: 2 }}>{triggerLabel(a.trigger_type)}</div>
            </div>
            <span
              style={{
                ...sans, fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", borderRadius: 999, padding: "4px 10px",
                color: a.status === "active" ? c.sage : c.mist, background: a.status === "active" ? "#E7F5EC" : c.paper,
              }}
            >
              {a.status === "active" ? "Ativa" : a.status === "paused" ? "Pausada" : "Rascunho"}
            </span>
            <button
              onClick={(e) => { e.stopPropagation(); setConfirmDelete(a); }}
              style={{ background: "none", border: "none", cursor: "pointer", color: c.mist, padding: 6, flexShrink: 0 }}
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
        {!automationsQuery.isLoading && automations.length === 0 && (
          <div style={{ ...sans, fontSize: 13, color: c.mistLight, textAlign: "center", padding: "40px 0" }}>
            Ainda não há automações.
          </div>
        )}
      </div>

      {showNew && <NewAutomationModal brandId={brand.id} tags={tagsQuery.data} forms={formsQuery.data} onClose={() => setShowNew(false)} />}

      {confirmDelete && (
        <Modal title="Eliminar automação" onClose={() => setConfirmDelete(null)} width={380}>
          <div style={{ ...sans, fontSize: 13, color: c.ink, marginBottom: 16 }}>
            Vais eliminar <strong>{confirmDelete.name}</strong> e todos os seus passos. Esta ação não pode ser desfeita.
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => deleteAutomation.mutate(confirmDelete.id, { onSuccess: () => setConfirmDelete(null) })} style={{ ...btnPrimary, background: c.rose }}>
              Eliminar
            </button>
            <button onClick={() => setConfirmDelete(null)} style={btnGhost}>Cancelar</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
