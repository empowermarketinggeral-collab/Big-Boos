import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabaseClient.js";
import { c, sans, serif, Modal, inputStyle, btnPrimary, btnGhost } from "../../shared/theme.jsx";
import { Plus, Pencil, Trash2, Search, Check, X } from "lucide-react";

/* ---------------------------------------------------------
   TAGS — espaço para criar, renomear, mudar a cor e apagar as tags
   da marca, com a contagem de contactos e onde cada uma é usada nas
   automações. Até aqui as tags só se criavam dentro da ficha de um
   contacto.
--------------------------------------------------------- */

const TAG_COLORS = ["#7C52A8", "#3B82F6", "#14B8A6", "#10B981", "#25D366", "#F59E0B", "#EF4444", "#EC4899", "#8B5CF6", "#6B7280"];
const DEFAULT_COLOR = TAG_COLORS[0];

function friendlyError(err) {
  if (err?.code === "23505") return "Já existe uma tag com esse nome.";
  return err?.message || "Não foi possível guardar.";
}

function useManagedTags(brandId) {
  return useQuery({
    queryKey: ["tags_manage", brandId],
    enabled: !!brandId,
    queryFn: async () => {
      const [tagsRes, autosRes, stepsRes] = await Promise.all([
        supabase.from("tags").select("id, name, color, created_at, contact_tags(count)").eq("brand_id", brandId).order("name"),
        supabase.from("automations").select("id, name, trigger_config").eq("brand_id", brandId),
        supabase.from("automation_steps").select("automation_id, config").eq("brand_id", brandId),
      ]);
      if (tagsRes.error) throw tagsRes.error;
      if (autosRes.error) throw autosRes.error;
      if (stepsRes.error) throw stepsRes.error;

      // tag → automações que a usam (gatilho, tag de paragem ou passo)
      const usage = new Map();
      const addUse = (tagId, auto) => {
        if (!tagId) return;
        if (!usage.has(tagId)) usage.set(tagId, new Map());
        usage.get(tagId).set(auto.id, auto.name);
      };
      const autoById = new Map(autosRes.data.map((a) => [a.id, a]));
      for (const a of autosRes.data) {
        addUse(a.trigger_config?.tagId, a);
        for (const stopId of a.trigger_config?.stopTagIds || []) addUse(stopId, a);
      }
      for (const s of stepsRes.data) {
        const auto = autoById.get(s.automation_id);
        if (auto) addUse(s.config?.tagId, auto);
      }

      return tagsRes.data.map((t) => ({
        id: t.id,
        name: t.name,
        color: t.color || DEFAULT_COLOR,
        contactCount: t.contact_tags?.[0]?.count ?? 0,
        automations: [...(usage.get(t.id)?.values() || [])],
      }));
    },
  });
}

function useTagMutations(brandId) {
  const qc = useQueryClient();
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["tags_manage", brandId] });
    qc.invalidateQueries({ queryKey: ["crm_tags", brandId] });
    qc.invalidateQueries({ queryKey: ["crm_contacts", brandId] });
  };
  const create = useMutation({
    mutationFn: async ({ name, color }) => {
      const { error } = await supabase.from("tags").insert({ brand_id: brandId, name, color });
      if (error) throw error;
    },
    onSuccess: refresh,
  });
  const update = useMutation({
    mutationFn: async ({ id, name, color }) => {
      const { error } = await supabase.from("tags").update({ name, color }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from("tags").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: refresh,
  });
  return { create, update, remove };
}

function ColorPicker({ value, onChange }) {
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {TAG_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          onClick={() => onChange(color)}
          aria-label={`Cor ${color}`}
          style={{
            width: 24, height: 24, borderRadius: 999, background: color, cursor: "pointer", padding: 0,
            border: value === color ? `2px solid ${c.ink}` : "2px solid transparent",
            outline: value === color ? "2px solid #fff" : "none", outlineOffset: -4,
          }}
        />
      ))}
    </div>
  );
}

function TagRow({ tag, onSave, onDelete, saving }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(tag.name);
  const [color, setColor] = useState(tag.color);
  const [error, setError] = useState("");

  const startEdit = () => { setName(tag.name); setColor(tag.color); setError(""); setEditing(true); };
  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) { setError("O nome é obrigatório."); return; }
    try {
      await onSave({ id: tag.id, name: trimmed, color });
      setEditing(false);
    } catch (err) {
      setError(friendlyError(err));
    }
  };

  const box = { background: c.folha, border: `1px solid ${c.line}`, borderRadius: 3, padding: "12px 16px" };

  if (editing) {
    return (
      <div style={box}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <input style={inputStyle} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()} autoFocus />
          <ColorPicker value={color} onChange={setColor} />
          {error && <div style={{ ...sans, fontSize: 13.5, color: c.rose }}>{error}</div>}
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={save} disabled={saving} style={btnPrimary}><Check size={13} /> Guardar</button>
            <button onClick={() => setEditing(false)} style={btnGhost}><X size={13} /> Cancelar</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ ...box, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
      <span style={{ width: 12, height: 12, borderRadius: 999, background: tag.color, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 140 }}>
        <div style={{ ...serif, fontSize: 14.5, color: c.ink, wordBreak: "break-word" }}>{tag.name}</div>
        <div style={{ ...sans, fontSize: 12.5, color: c.mist, marginTop: 2 }}>
          {tag.contactCount} {tag.contactCount === 1 ? "contacto" : "contactos"}
          {tag.automations.length > 0 && `, usada em ${tag.automations.length} ${tag.automations.length === 1 ? "automação" : "automações"}`}
        </div>
      </div>
      <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
        <button onClick={startEdit} aria-label={`Editar ${tag.name}`} style={{ background: "none", border: "none", cursor: "pointer", color: c.mist, padding: 6 }}>
          <Pencil size={14} />
        </button>
        <button onClick={() => onDelete(tag)} aria-label={`Apagar ${tag.name}`} style={{ background: "none", border: "none", cursor: "pointer", color: c.mist, padding: 6 }}>
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}

export default function TagsView({ brand }) {
  const tagsQuery = useManagedTags(brand.id);
  const { create, update, remove } = useTagMutations(brand.id);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(DEFAULT_COLOR);
  const [createError, setCreateError] = useState("");
  const [query, setQuery] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleteError, setDeleteError] = useState("");

  const tags = (tagsQuery.data || []).filter((t) => t.name.toLowerCase().includes(query.trim().toLowerCase()));

  const createTag = async () => {
    const name = newName.trim();
    if (!name) { setCreateError("Escreve o nome da tag."); return; }
    try {
      await create.mutateAsync({ name, color: newColor });
      setNewName("");
      setCreateError("");
    } catch (err) {
      setCreateError(friendlyError(err));
    }
  };

  const doDelete = async () => {
    setDeleteError("");
    try {
      await remove.mutateAsync(confirmDelete.id);
      setConfirmDelete(null);
    } catch (err) {
      setDeleteError(friendlyError(err));
    }
  };

  return (
    <div>
      <div style={{ background: c.folha, border: `1px solid ${c.line}`, borderRadius: 3, padding: 16, marginBottom: 18 }}>
        <div style={{ ...sans, fontSize: 14, fontWeight: 600, color: c.ink, marginBottom: 10 }}>Nova tag</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          <input
            style={{ ...inputStyle, flex: 1, minWidth: 180 }}
            value={newName}
            maxLength={60}
            onChange={(e) => { setNewName(e.target.value); setCreateError(""); }}
            onKeyDown={(e) => e.key === "Enter" && createTag()}
            placeholder="Ex: Interesse_Formacao"
          />
          <button onClick={createTag} disabled={create.isPending} style={btnPrimary}>
            <Plus size={14} /> {create.isPending ? "A criar…" : "Criar tag"}
          </button>
        </div>
        <ColorPicker value={newColor} onChange={setNewColor} />
        {createError && <div style={{ ...sans, fontSize: 13.5, color: c.rose, marginTop: 8 }}>{createError}</div>}
      </div>

      <div style={{ position: "relative", maxWidth: 320, marginBottom: 14 }}>
        <Search size={14} color={c.mist} style={{ position: "absolute", left: 10, top: 10 }} />
        <input style={{ ...inputStyle, paddingLeft: 32 }} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Pesquisar tags…" />
      </div>

      {tagsQuery.isLoading && <div style={{ ...sans, fontSize: 14.5, color: c.mist }}>A carregar…</div>}
      {tagsQuery.isError && <div style={{ ...sans, fontSize: 14, color: c.rose }}>Não foi possível carregar as tags.</div>}
      {tagsQuery.data && tagsQuery.data.length === 0 && (
        <div style={{ ...sans, fontSize: 14.5, color: c.mist }}>Ainda não há tags nesta marca. Cria a primeira acima.</div>
      )}
      {tagsQuery.data?.length > 0 && tags.length === 0 && (
        <div style={{ ...sans, fontSize: 14.5, color: c.mist }}>Nenhuma tag corresponde à pesquisa.</div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {tags.map((tag) => (
          <TagRow
            key={tag.id}
            tag={tag}
            saving={update.isPending}
            onSave={(patch) => update.mutateAsync(patch)}
            onDelete={(t) => { setDeleteError(""); setConfirmDelete(t); }}
          />
        ))}
      </div>

      {confirmDelete && (
        <Modal title="Apagar tag" onClose={() => setConfirmDelete(null)} width={400}>
          <div style={{ ...sans, fontSize: 14.5, color: c.ink, lineHeight: 1.6, marginBottom: 14 }}>
            Apagar a tag <b>{confirmDelete.name}</b>? Sai de {confirmDelete.contactCount} {confirmDelete.contactCount === 1 ? "contacto" : "contactos"}. Esta ação não pode ser desfeita.
            {confirmDelete.automations.length > 0 && (
              <div style={{ marginTop: 10, color: c.rose }}>
                Atenção: é usada em {confirmDelete.automations.length} {confirmDelete.automations.length === 1 ? "automação" : "automações"} ({confirmDelete.automations.slice(0, 5).join(", ")}
                {confirmDelete.automations.length > 5 ? "…" : ""}). Essas automações deixam de funcionar como esperado até escolheres outra tag.
              </div>
            )}
          </div>
          {deleteError && <div style={{ ...sans, fontSize: 13.5, color: c.rose, marginBottom: 10 }}>{deleteError}</div>}
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={doDelete} disabled={remove.isPending} style={{ ...btnPrimary, background: c.roseSolid }}>
              {remove.isPending ? "A apagar…" : "Apagar"}
            </button>
            <button onClick={() => setConfirmDelete(null)} style={btnGhost}>Cancelar</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
