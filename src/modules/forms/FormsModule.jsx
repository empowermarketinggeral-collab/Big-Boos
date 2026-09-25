import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabaseClient.js";
import { c, sans, serif, Eyebrow, Modal, inputStyle, btnPrimary, btnGhost, PAGE_FONT_OPTIONS, PAGE_COLOR_SWATCHES, DEFAULT_PAGE_STYLE, display } from "../../shared/theme.jsx";
import { ArrowLeft, Plus, Trash2, ChevronUp, ChevronDown, FileText, Link2, CheckCircle2 } from "lucide-react";

/* ---------------------------------------------------------
   FORMULÁRIOS / QUESTIONÁRIOS / LEAD MAGNETS
   Módulo do EMPOWER OS. Ver docs/EMPOWER_OS_ARCHITECTURE_STRATEGY.md
   (secção 19). Reutiliza o mesmo padrão de página pública por slug
   já usado em proposals/presentations/link_pages/growth_maps.

   A submissão em si (contact_id, tags, automações) é toda tratada
   por um trigger na base de dados (supabase/34_forms_and_trigger_filters.sql)
   — o frontend só insere a linha em form_submissions, nunca escreve
   diretamente em contacts (RLS não deixa um visitante anónimo).
--------------------------------------------------------- */

const FORM_TYPES = [
  { value: "form", label: "Formulário" },
  { value: "questionario", label: "Questionário" },
  { value: "lead_magnet", label: "Lead magnet" },
];

const FIELD_TYPES = [
  { value: "text", label: "Texto curto" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Telefone" },
  { value: "textarea", label: "Texto longo" },
  { value: "select", label: "Escolha (lista)" },
];


const MAPS_TO_OPTIONS = [
  { value: "", label: "Não guardar como…" },
  { value: "name", label: "Nome do contacto" },
  { value: "email", label: "Email do contacto" },
  { value: "phone", label: "Telefone do contacto" },
];

const slugify = (s) =>
  (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

const publicFormUrl = (slug) => `${window.location.origin}/formulario/${slug}`;

/* ---------------------------------------------------------
   DATA
--------------------------------------------------------- */
function useForms(brandId) {
  return useQuery({
    queryKey: ["forms", brandId],
    enabled: !!brandId,
    queryFn: async () => {
      const { data, error } = await supabase.from("forms").select("*").eq("brand_id", brandId).order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

function useCreateForm(brandId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ name, type }) => {
      const baseSlug = slugify(name) || "formulario";
      const slug = `${baseSlug}-${Math.random().toString(36).slice(2, 7)}`;
      const { data, error } = await supabase
        .from("forms")
        .insert({ brand_id: brandId, name, type, slug, fields: [], on_submit_tags: [], status: "draft" })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["forms", brandId] }),
  });
}

function useUpdateForm(brandId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }) => {
      const { error } = await supabase.from("forms").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["forms", brandId] }),
  });
}

function useDeleteForm(brandId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from("forms").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["forms", brandId] }),
  });
}

function useSubmissions(formId) {
  return useQuery({
    queryKey: ["form_submissions", formId],
    enabled: !!formId,
    queryFn: async () => {
      const { data, error } = await supabase.from("form_submissions").select("*").eq("form_id", formId).order("submitted_at", { ascending: false });
      if (error) throw error;
      return data;
    },
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

/* ---------------------------------------------------------
   CRIAR FORMULÁRIO
--------------------------------------------------------- */
function NewFormModal({ brandId, onClose, onCreated }) {
  const [name, setName] = useState("");
  const [type, setType] = useState("form");
  const [error, setError] = useState("");
  const createForm = useCreateForm(brandId);

  const save = async () => {
    if (!name.trim()) { setError("O nome é obrigatório."); return; }
    try {
      const created = await createForm.mutateAsync({ name: name.trim(), type });
      onCreated(created);
    } catch (err) {
      setError(err.message || "Não foi possível criar.");
    }
  };

  return (
    <Modal title="Novo formulário" onClose={onClose} width={380}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
          <div style={{ ...sans, fontSize: 12.5, color: c.mist, marginBottom: 5 }}>Nome</div>
          <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Pedido de orçamento" />
        </div>
        <div>
          <div style={{ ...sans, fontSize: 12.5, color: c.mist, marginBottom: 5 }}>Tipo</div>
          <select style={inputStyle} value={type} onChange={(e) => setType(e.target.value)}>
            {FORM_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        {error && <div style={{ ...sans, fontSize: 14, color: c.rose }}>{error}</div>}
        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          <button onClick={save} disabled={createForm.isPending} style={btnPrimary}>
            {createForm.isPending ? "A criar…" : "Criar"}
          </button>
          <button onClick={onClose} style={btnGhost}>Cancelar</button>
        </div>
      </div>
    </Modal>
  );
}

/* ---------------------------------------------------------
   EDITOR
--------------------------------------------------------- */
function FieldRow({ field, onChange, onRemove, onMove, isFirst, isLast }) {
  // Estado próprio para o texto das opções — se o valor do input vier
  // sempre de field.options.join(", "), cada vírgula/espaço a mais
  // desaparece assim que se escreve (porque split+join "limpa" logo
  // a seguir), dando a sensação de que a vírgula não funciona.
  const [optionsText, setOptionsText] = useState((field.options || []).join(", "));

  return (
    <div style={{ background: c.paper, borderRadius: 6, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <input
          value={field.label}
          onChange={(e) => onChange({ ...field, label: e.target.value })}
          placeholder="Pergunta / rótulo do campo"
          style={{ ...sans, flex: 1, fontSize: 14, color: c.ink, background: c.folha, border: `1px solid ${c.lineStrong}`, borderRadius: 6, padding: "6px 9px", outline: "none" }}
        />
        <select
          value={field.type}
          onChange={(e) => onChange({ ...field, type: e.target.value })}
          style={{ ...sans, fontSize: 12.5, border: `1px solid ${c.lineStrong}`, borderRadius: 6, padding: "6px 8px", cursor: "pointer", flexShrink: 0 }}
        >
          {FIELD_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <button onClick={onMove ? () => onMove(-1) : undefined} disabled={isFirst} style={{ background: "none", border: "none", cursor: isFirst ? "default" : "pointer", color: isFirst ? c.line : c.mist, padding: 3 }}>
          <ChevronUp size={13} />
        </button>
        <button onClick={onMove ? () => onMove(1) : undefined} disabled={isLast} style={{ background: "none", border: "none", cursor: isLast ? "default" : "pointer", color: isLast ? c.line : c.mist, padding: 3 }}>
          <ChevronDown size={13} />
        </button>
        <button onClick={onRemove} style={{ background: "none", border: "none", cursor: "pointer", color: c.rose, padding: 3 }}>
          <Trash2 size={13} />
        </button>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <label style={{ ...sans, fontSize: 12.5, color: c.mist, display: "flex", alignItems: "center", gap: 5 }}>
          <input type="checkbox" checked={!!field.required} onChange={(e) => onChange({ ...field, required: e.target.checked })} />
          Obrigatório
        </label>
        {(field.type === "text" || field.type === "email" || field.type === "phone") && (
          <select
            value={field.mapsTo || ""}
            onChange={(e) => onChange({ ...field, mapsTo: e.target.value || undefined })}
            style={{ ...sans, fontSize: 12.5, border: `1px solid ${c.lineStrong}`, borderRadius: 6, padding: "5px 7px", cursor: "pointer" }}
          >
            {MAPS_TO_OPTIONS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        )}
      </div>
      {field.type === "select" && (
        <input
          value={optionsText}
          onChange={(e) => {
            setOptionsText(e.target.value);
            onChange({ ...field, options: e.target.value.split(",").map((o) => o.trim()).filter(Boolean) });
          }}
          placeholder="Opções separadas por vírgula"
          style={{ ...sans, fontSize: 12.5, color: c.ink, background: c.folha, border: `1px solid ${c.lineStrong}`, borderRadius: 6, padding: "6px 9px", outline: "none" }}
        />
      )}
    </div>
  );
}

function FormEditor({ brand, form, onBack }) {
  const [name, setName] = useState(form.name);
  const [type, setType] = useState(form.type);
  const [status, setStatus] = useState(form.status);
  const [thankYou, setThankYou] = useState(form.thank_you_message || "");
  const [fileUrl, setFileUrl] = useState(form.file_delivery_url || "");
  const [tagIds, setTagIds] = useState(form.on_submit_tags || []);
  const [fields, setFields] = useState(form.fields || []);
  const [style, setStyle] = useState({ ...DEFAULT_PAGE_STYLE, ...(form.style || {}) });
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const tagsQuery = useTags(brand.id);
  const submissionsQuery = useSubmissions(form.id);
  const updateForm = useUpdateForm(brand.id);

  const addField = () => setFields((f) => [...f, { id: `f${Date.now()}`, label: "Nova pergunta", type: "text", required: false }]);
  const changeField = (id, patch) => setFields((f) => f.map((x) => (x.id === id ? patch : x)));
  const removeField = (id) => setFields((f) => f.filter((x) => x.id !== id));
  const moveField = (id, dir) => {
    setFields((f) => {
      const i = f.findIndex((x) => x.id === id);
      const j = i + dir;
      if (j < 0 || j >= f.length) return f;
      const copy = [...f];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });
  };
  const toggleTag = (id) => setTagIds((t) => (t.includes(id) ? t.filter((x) => x !== id) : [...t, id]));

  const save = async () => {
    setError("");
    try {
      await updateForm.mutateAsync({
        id: form.id,
        patch: {
          name, type, status,
          thank_you_message: thankYou,
          file_delivery_url: type === "lead_magnet" ? fileUrl : null,
          on_submit_tags: tagIds,
          fields,
          style,
        },
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err.message || "Não foi possível guardar.");
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(publicFormUrl(form.slug));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Não foi possível copiar o link.");
    }
  };

  return (
    <div>
      <button onClick={onBack} style={{ ...sans, display: "flex", alignItems: "center", gap: 6, fontSize: 14, color: c.mist, background: "none", border: "none", cursor: "pointer", marginBottom: 16 }}>
        <ArrowLeft size={14} /> Formulários
      </button>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 6 }}>
        <input value={name} onChange={(e) => setName(e.target.value)} style={{ ...display, fontSize: 24, color: c.ink, border: "none", outline: "none", background: "none" }} />
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={save} disabled={updateForm.isPending} style={btnPrimary}>
            {updateForm.isPending ? "A guardar…" : saved ? "Guardado ✓" : "Guardar"}
          </button>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 20 }}>
        <select value={status} onChange={(e) => setStatus(e.target.value)} style={{ ...sans, fontSize: 13.5, border: `1px solid ${c.lineStrong}`, borderRadius: 7, padding: "6px 9px", cursor: "pointer" }}>
          <option value="draft">Rascunho</option>
          <option value="published">Publicado</option>
        </select>
        <button onClick={copyLink} style={{ ...btnGhost, display: "flex", alignItems: "center", gap: 6 }}>
          {copied ? <CheckCircle2 size={13} /> : <Link2 size={13} />} {copied ? "Copiado!" : publicFormUrl(form.slug)}
        </button>
      </div>

      {error && <div style={{ ...sans, fontSize: 14, color: c.rose, marginBottom: 16 }}>{error}</div>}

      <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 640 }}>
        <div style={{ background: c.folha, border: `1px solid ${c.line}`, borderRadius: 3, padding: 20 }}>
          <div style={{ ...serif, fontSize: 15.5, color: c.ink, marginBottom: 14 }}>Configuração</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <div style={{ ...sans, fontSize: 12.5, color: c.mist, marginBottom: 5 }}>Tipo</div>
              <select style={inputStyle} value={type} onChange={(e) => setType(e.target.value)}>
                {FORM_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            {type === "lead_magnet" && (
              <div>
                <div style={{ ...sans, fontSize: 12.5, color: c.mist, marginBottom: 5 }}>Link do ficheiro a entregar (PDF, guia, etc.)</div>
                <input style={inputStyle} value={fileUrl} onChange={(e) => setFileUrl(e.target.value)} placeholder="https://…" />
              </div>
            )}
            <div>
              <div style={{ ...sans, fontSize: 12.5, color: c.mist, marginBottom: 5 }}>Mensagem de agradecimento</div>
              <textarea rows={2} style={{ ...inputStyle, resize: "vertical" }} value={thankYou} onChange={(e) => setThankYou(e.target.value)} placeholder="Obrigado! Entraremos em contacto brevemente." />
            </div>
            <div>
              <div style={{ ...sans, fontSize: 12.5, color: c.mist, marginBottom: 5 }}>Tags a aplicar ao contacto</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {(tagsQuery.data || []).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => toggleTag(t.id)}
                    style={{
                      ...sans, fontSize: 12.5, fontWeight: 600, padding: "5px 10px", borderRadius: 999, cursor: "pointer",
                      color: tagIds.includes(t.id) ? "#fff" : t.color, background: tagIds.includes(t.id) ? t.color : c.folha,
                      border: `1px solid ${t.color}`,
                    }}
                  >
                    {t.name}
                  </button>
                ))}
                {!tagsQuery.data?.length && <div style={{ ...sans, fontSize: 12.5, color: c.mistLight }}>Sem tags ainda — cria no CRM.</div>}
              </div>
            </div>
          </div>
        </div>

        <div style={{ background: c.folha, border: `1px solid ${c.line}`, borderRadius: 3, padding: 20 }}>
          <div style={{ ...serif, fontSize: 15.5, color: c.ink, marginBottom: 14 }}>Aparência</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <div style={{ ...sans, fontSize: 12.5, color: c.mist, marginBottom: 6 }}>Cor de destaque (botão e realces)</div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                {PAGE_COLOR_SWATCHES.map((hex) => (
                  <button
                    key={hex}
                    type="button"
                    onClick={() => setStyle((s) => ({ ...s, accentColor: hex }))}
                    style={{
                      width: 26, height: 26, borderRadius: 999, cursor: "pointer", background: hex, flexShrink: 0,
                      border: style.accentColor === hex ? `2px solid ${c.ink}` : "1px solid rgba(0,0,0,0.1)",
                    }}
                  />
                ))}
                <input
                  type="color"
                  value={style.accentColor}
                  onChange={(e) => setStyle((s) => ({ ...s, accentColor: e.target.value }))}
                  style={{ width: 30, height: 26, border: `1px solid ${c.lineStrong}`, borderRadius: 6, cursor: "pointer", padding: 0, flexShrink: 0 }}
                />
              </div>
            </div>
            <div>
              <div style={{ ...sans, fontSize: 12.5, color: c.mist, marginBottom: 6 }}>Tipo de letra</div>
              <select style={inputStyle} value={style.font} onChange={(e) => setStyle((s) => ({ ...s, font: e.target.value }))}>
                {PAGE_FONT_OPTIONS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
              </select>
            </div>
            <div>
              <div style={{ ...sans, fontSize: 12.5, color: c.mist, marginBottom: 6 }}>Logótipo (link da imagem, opcional)</div>
              <input style={inputStyle} value={style.logoUrl} onChange={(e) => setStyle((s) => ({ ...s, logoUrl: e.target.value }))} placeholder="https://…" />
            </div>
          </div>
        </div>

        <div style={{ background: c.folha, border: `1px solid ${c.line}`, borderRadius: 3, padding: 20 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <div style={{ ...serif, fontSize: 15.5, color: c.ink }}>Campos</div>
            <button onClick={addField} style={{ ...sans, display: "flex", alignItems: "center", gap: 5, fontSize: 13.5, fontWeight: 600, color: "#fff", background: c.boss, border: "none", borderRadius: 7, padding: "7px 12px", cursor: "pointer" }}>
              <Plus size={13} /> Campo
            </button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {fields.map((f, i) => (
              <FieldRow
                key={f.id}
                field={f}
                onChange={(patch) => changeField(f.id, patch)}
                onRemove={() => removeField(f.id)}
                onMove={(dir) => moveField(f.id, dir)}
                isFirst={i === 0}
                isLast={i === fields.length - 1}
              />
            ))}
            {fields.length === 0 && <div style={{ ...sans, fontSize: 13.5, color: c.mistLight, textAlign: "center", padding: "16px 0" }}>Ainda sem campos.</div>}
          </div>
        </div>

        <div style={{ background: c.folha, border: `1px solid ${c.line}`, borderRadius: 3, padding: 20 }}>
          <div style={{ ...serif, fontSize: 15.5, color: c.ink, marginBottom: 14 }}>Respostas ({submissionsQuery.data?.length || 0})</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {(submissionsQuery.data || []).map((s) => (
              <div key={s.id} style={{ background: c.paper, borderRadius: 6, padding: "10px 12px" }}>
                <div style={{ ...sans, fontSize: 12.5, color: c.mistLight, marginBottom: 5 }}>{new Date(s.submitted_at).toLocaleString("pt-PT")}</div>
                {fields.map((f) => (
                  s.answers?.[f.id] ? (
                    <div key={f.id} style={{ ...sans, fontSize: 13.5, color: c.ink, marginBottom: 2 }}>
                      <strong>{f.label}:</strong> {String(s.answers[f.id])}
                    </div>
                  ) : null
                ))}
              </div>
            ))}
            {!submissionsQuery.data?.length && <div style={{ ...sans, fontSize: 13.5, color: c.mistLight, textAlign: "center", padding: "10px 0" }}>Ainda sem respostas.</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------
   MÓDULO (vista da equipa)
--------------------------------------------------------- */
export default function FormsModule({ brand, onBack }) {
  const formsQuery = useForms(brand.id);
  const deleteForm = useDeleteForm(brand.id);
  const [showNew, setShowNew] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const forms = formsQuery.data || [];
  const open = openId ? forms.find((f) => f.id === openId) : null;

  if (open) {
    return <FormEditor brand={brand} form={open} onBack={() => setOpenId(null)} />;
  }

  return (
    <div className="bb-page" style={{ padding: "8px 40px 60px", maxWidth: 1040 }}>
      <button onClick={onBack} style={{ ...sans, display: "flex", alignItems: "center", gap: 6, fontSize: 14, color: c.mist, background: "none", border: "none", cursor: "pointer", marginBottom: 20 }}>
        <ArrowLeft size={14} /> Voltar à marca
      </button>

      <Eyebrow>Formulários</Eyebrow>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <h1 style={{ ...display, fontSize: 24, color: c.ink, margin: 0 }}>Formulários</h1>
        <button onClick={() => setShowNew(true)} style={btnPrimary}>
          <Plus size={14} /> Novo formulário
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {forms.map((f) => (
          <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 14, background: c.folha, border: `1px solid ${c.line}`, borderRadius: 3, padding: "14px 18px", cursor: "pointer" }} onClick={() => setOpenId(f.id)}>
            <div style={{ width: 34, height: 34, borderRadius: 6, background: c.bossSoft, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <FileText size={16} color={c.bossText} strokeWidth={1.8} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ ...serif, fontSize: 15, color: c.ink }}>{f.name}</div>
              <div style={{ ...sans, fontSize: 12.5, color: c.mist, marginTop: 2 }}>{FORM_TYPES.find((t) => t.value === f.type)?.label}</div>
            </div>
            <span
              style={{
                ...sans, fontSize: 12.5, fontWeight: 700, borderRadius: 999, padding: "4px 10px",
                color: f.status === "published" ? c.sage : c.mist, background: f.status === "published" ? c.sageSoft : c.paper,
              }}
            >
              {f.status === "published" ? "Publicado" : "Rascunho"}
            </span>
            <button onClick={(e) => { e.stopPropagation(); setConfirmDelete(f); }} style={{ background: "none", border: "none", cursor: "pointer", color: c.mist, padding: 6, flexShrink: 0 }}>
              <Trash2 size={14} />
            </button>
          </div>
        ))}
        {!formsQuery.isLoading && forms.length === 0 && (
          <div style={{ ...sans, fontSize: 14.5, color: c.mistLight, textAlign: "center", padding: "40px 0" }}>Ainda não há formulários.</div>
        )}
      </div>

      {showNew && <NewFormModal brandId={brand.id} onClose={() => setShowNew(false)} onCreated={(created) => { setShowNew(false); setOpenId(created.id); }} />}

      {confirmDelete && (
        <Modal title="Eliminar formulário" onClose={() => setConfirmDelete(null)} width={380}>
          <div style={{ ...sans, fontSize: 14.5, color: c.ink, marginBottom: 16 }}>
            Vais eliminar <strong>{confirmDelete.name}</strong> e todas as respostas recebidas. Esta ação não pode ser desfeita.
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => deleteForm.mutate(confirmDelete.id, { onSuccess: () => setConfirmDelete(null) })} style={{ ...btnPrimary, background: c.roseSolid }}>
              Eliminar
            </button>
            <button onClick={() => setConfirmDelete(null)} style={btnGhost}>Cancelar</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ---------------------------------------------------------
   PÁGINA PÚBLICA — /formulario/:slug
--------------------------------------------------------- */
function PublicField({ field, value, onChange, font }) {
  const fontFamily = `'${font || "Inter"}', sans-serif`;
  const label = (
    <div style={{ ...sans, fontFamily, fontSize: 14.5, fontWeight: 600, color: "#2A2438", marginBottom: 6 }}>
      {field.label}{field.required && <span style={{ color: "#D3455B" }}> *</span>}
    </div>
  );
  const inputStyleLocal = { ...sans, fontFamily, width: "100%", fontSize: 15, border: "1px solid #E0DAEC", borderRadius: 6, padding: "10px 12px", outline: "none", boxSizing: "border-box" };

  if (field.type === "textarea") {
    return <div>{label}<textarea rows={3} required={field.required} value={value || ""} onChange={(e) => onChange(e.target.value)} style={{ ...inputStyleLocal, resize: "vertical" }} /></div>;
  }
  if (field.type === "select") {
    return (
      <div>
        {label}
        <select required={field.required} value={value || ""} onChange={(e) => onChange(e.target.value)} style={inputStyleLocal}>
          <option value="">Escolhe…</option>
          {(field.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>
    );
  }
  const htmlType = field.type === "email" ? "email" : field.type === "phone" ? "tel" : "text";
  return <div>{label}<input type={htmlType} required={field.required} value={value || ""} onChange={(e) => onChange(e.target.value)} style={inputStyleLocal} /></div>;
}

export function PublicFormPage() {
  const { slug } = useParams();
  const [state, setState] = useState({ loading: true, error: null, form: null });
  const [answers, setAnswers] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    supabase
      .from("forms")
      .select("id, brand_id, name, type, fields, thank_you_message, file_delivery_url, status, style")
      .eq("slug", slug)
      .maybeSingle()
      .then(({ data, error: err }) => {
        if (!active) return;
        if (err || !data || data.status !== "published") {
          setState({ loading: false, error: "Formulário não encontrado.", form: null });
          return;
        }
        setState({ loading: false, error: null, form: data });
      });
    return () => { active = false; };
  }, [slug]);

  const submit = async (e) => {
    e.preventDefault();
    if (!state.form) return;
    setSubmitting(true);
    setError("");
    const { error: err } = await supabase.from("form_submissions").insert({
      brand_id: state.form.brand_id,
      form_id: state.form.id,
      answers,
    });
    setSubmitting(false);
    if (err) {
      setError("Não foi possível enviar. Tenta novamente.");
      return;
    }
    setSubmitted(true);
  };

  if (state.loading) return <div className="bb-force-light" style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", ...sans, color: c.mist }}>A carregar…</div>;
  if (state.error) return <div className="bb-force-light" style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", ...sans, color: c.mist }}>{state.error}</div>;

  const { form } = state;
  const formStyle = { ...DEFAULT_PAGE_STYLE, ...(form.style || {}) };
  const titleFont = { fontFamily: `'${formStyle.font}', serif` };
  const bodyFont = { fontFamily: `'${formStyle.font}', sans-serif` };

  return (
    <div className="bb-force-light" style={{ minHeight: "100vh", background: c.paper, display: "flex", justifyContent: "center", padding: "60px 20px", boxSizing: "border-box" }}>
      <div style={{ width: "100%", maxWidth: 480 }}>
        <div style={{ background: c.folha, borderRadius: 3, padding: "32px 28px", }}>
          {formStyle.logoUrl && (
            <img src={formStyle.logoUrl} alt="" style={{ maxHeight: 48, maxWidth: "60%", display: "block", marginBottom: 18 }} />
          )}
          {submitted ? (
            <div style={{ textAlign: "center", padding: "20px 0" }}>
              <CheckCircle2 size={32} color={formStyle.accentColor} style={{ marginBottom: 12 }} />
              <div style={{ ...serif, ...titleFont, fontSize: 19, color: c.ink, marginBottom: 8 }}>Obrigado!</div>
              <div style={{ ...sans, ...bodyFont, fontSize: 15, color: c.mist, lineHeight: 1.6 }}>{form.thank_you_message || "A tua resposta foi recebida."}</div>
              {form.type === "lead_magnet" && form.file_delivery_url && (
                <a href={form.file_delivery_url} target="_blank" rel="noopener noreferrer" style={{ ...sans, ...bodyFont, display: "inline-block", marginTop: 16, fontSize: 14.5, fontWeight: 600, color: "#fff", background: formStyle.accentColor, borderRadius: 6, padding: "10px 20px", textDecoration: "none" }}>
                  Descarregar
                </a>
              )}
            </div>
          ) : (
            <form onSubmit={submit}>
              <h1 style={{ ...serif, ...titleFont, fontSize: 21, color: c.ink, marginBottom: 20 }}>{form.name}</h1>
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {(form.fields || []).map((f) => (
                  <PublicField key={f.id} field={f} value={answers[f.id]} onChange={(v) => setAnswers((a) => ({ ...a, [f.id]: v }))} font={formStyle.font} />
                ))}
              </div>
              {error && <div style={{ ...sans, ...bodyFont, fontSize: 14, color: c.rose, marginTop: 14 }}>{error}</div>}
              <button
                type="submit"
                disabled={submitting}
                style={{ ...sans, ...bodyFont, width: "100%", marginTop: 22, fontSize: 15, fontWeight: 600, color: "#fff", background: formStyle.accentColor, border: "none", borderRadius: 6, padding: "12px", cursor: "pointer" }}
              >
                {submitting ? "A enviar…" : "Enviar"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
