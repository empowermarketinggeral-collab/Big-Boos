import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../lib/supabaseClient.js";
import { c, sans, serif, display, inputStyle, btnPrimary, btnGhost, Modal, CAN_MANAGE_ROLES } from "../../shared/theme.jsx";
import { ArrowLeft, Plus, Link2, Copy, Check, Trash2, Pencil, Upload, Download, Send, RotateCcw } from "lucide-react";
import ApprovalSeal from "../../design/ApprovalSeal.jsx";
import VersionViewer from "./CreativeViewers.jsx";
import VersionEditor from "./VersionEditor.jsx";
import {
  KINDS, KIND_ORDER, STATUS, contentPaths, coverPath, formatBytes, formatWhen,
} from "./creativesKinds.js";
import {
  removeCreativeFiles, signedDownloadUrl, uploadCreativeFile, useCreativeComments, useCreativeOptions,
  useCreativeProjects, useCreativeVersions, useInvalidateCreatives, useShareLink, useSignedUrls,
} from "./creativesData.js";

/* ---------------------------------------------------------
   CRIATIVOS (módulo de cada marca)
   Cliente → abas por tipo de trabalho → opções (Opção 1, 2…) → versões.
   A equipa cria e gere; o cliente da marca (com login) só vê as opções já
   enviadas. O cliente sem login decide e comenta pelo link de partilha
   (/criativos/:token, função creative-share).
--------------------------------------------------------- */

export function StatusPill({ status }) {
  const s = STATUS[status] || STATUS.draft;
  return (
    <span style={{ ...sans, fontSize: 12.5, fontWeight: 700, color: s.color, background: `color-mix(in srgb, ${s.color} 10%, transparent)`, borderRadius: 999, padding: "3px 10px", whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 5 }}>
      {status === "approved" && <ApprovalSeal size={13} />}
      {s.label}
    </span>
  );
}

function Confirm({ title, children, confirmLabel, onConfirm, onClose, busy }) {
  return (
    <Modal title={title} onClose={onClose} width={400}>
      <div style={{ ...sans, fontSize: 14.5, color: c.ink, lineHeight: 1.6, marginBottom: 16 }}>{children}</div>
      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" onClick={onConfirm} disabled={busy} style={{ ...btnPrimary, background: c.roseSolid }}>{busy ? "A apagar…" : confirmLabel}</button>
        <button type="button" onClick={onClose} style={btnGhost}>Cancelar</button>
      </div>
    </Modal>
  );
}

const randomToken = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

// Apaga do armazenamento todos os ficheiros de umas opções (versões e finais).
async function filesOfOptions(optionIds, brandId) {
  if (!optionIds.length) return [];
  const [{ data: versions }, { data: options }] = await Promise.all([
    supabase.from("creative_versions").select("content").in("option_id", optionIds),
    supabase.from("creative_options").select("final_files").in("id", optionIds),
  ]);
  const paths = new Set();
  for (const v of versions || []) contentPaths(v.content, brandId).forEach((p) => paths.add(p));
  for (const o of options || []) for (const f of o.final_files || []) if (f?.path?.startsWith(`${brandId}/`)) paths.add(f.path);
  return [...paths];
}

/* ---------- Novo trabalho ---------- */
function NewProjectModal({ brandId, userId, onClose, onCreated, position }) {
  const [kind, setKind] = useState("business_card");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const create = async () => {
    setBusy(true);
    setError("");
    const { data, error: err } = await supabase.from("creative_projects")
      .insert({ brand_id: brandId, kind, title: title.trim() || KINDS[kind].label, position, created_by: userId || null })
      .select("id").single();
    setBusy(false);
    if (err) { setError("Não foi possível criar o trabalho."); return; }
    onCreated(data.id);
  };
  return (
    <Modal title="Novo trabalho" onClose={onClose} width={520}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8, marginBottom: 16 }}>
        {KIND_ORDER.map((k) => {
          const Icon = KINDS[k].icon;
          const on = kind === k;
          return (
            <button key={k} type="button" onClick={() => setKind(k)} aria-pressed={on} style={{ ...sans, textAlign: "left", display: "flex", flexDirection: "column", gap: 6, padding: 12, borderRadius: 6, cursor: "pointer", background: on ? c.bossSoft : c.folha, border: `1px solid ${on ? c.boss : c.lineStrong}`, color: c.ink }}>
              <Icon size={18} color={c.bossText} />
              <span style={{ fontSize: 14, fontWeight: 700 }}>{KINDS[k].label}</span>
              <span style={{ fontSize: 12, color: c.mist, lineHeight: 1.4 }}>{KINDS[k].hint}</span>
            </button>
          );
        })}
      </div>
      <label style={{ ...sans, fontSize: 13, fontWeight: 700, color: c.mist, display: "block", marginBottom: 6 }}>Nome da aba</label>
      <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder={KINDS[kind].label} style={{ ...inputStyle, marginBottom: 16 }} />
      {error && <div role="alert" style={{ ...sans, fontSize: 14, color: c.rose, marginBottom: 12 }}>{error}</div>}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button type="button" onClick={onClose} style={btnGhost}>Cancelar</button>
        <button type="button" onClick={create} disabled={busy} style={btnPrimary}>{busy ? "A criar…" : "Criar trabalho"}</button>
      </div>
    </Modal>
  );
}

/* ---------- Link de partilha ---------- */
function ShareModal({ project, brandId, userId, onClose }) {
  const linkQ = useShareLink(project.id);
  const invalidate = useInvalidateCreatives();
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const token = linkQ.data?.token;
  const url = token ? `${window.location.origin}/criativos/${token}` : "";

  const create = async () => {
    setBusy(true);
    setError("");
    const { error: err } = await supabase.from("creative_share_links").insert({ project_id: project.id, brand_id: brandId, token: randomToken(), created_by: userId || null });
    setBusy(false);
    if (err) { setError("Não foi possível criar o link."); return; }
    invalidate("creative_share_link");
  };
  const disable = async () => {
    setBusy(true);
    setError("");
    const { error: err } = await supabase.from("creative_share_links").delete().eq("project_id", project.id);
    setBusy(false);
    if (err) { setError("Não foi possível desativar o link."); return; }
    invalidate("creative_share_link");
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setError("Não consegui copiar. Seleciona o link e copia à mão.");
    }
  };

  return (
    <Modal title="Partilhar com o cliente" onClose={onClose} width={520}>
      <div style={{ ...sans, fontSize: 14, color: c.mist, lineHeight: 1.6, marginBottom: 14 }}>
        O cliente abre o link sem criar conta, vê as opções marcadas como <b>Enviada</b>, comenta e aprova ou pede alterações. Os rascunhos nunca aparecem.
      </div>
      {linkQ.isLoading && <div style={{ ...sans, fontSize: 14, color: c.mist }}>A carregar…</div>}
      {!linkQ.isLoading && !token && (
        <button type="button" onClick={create} disabled={busy} style={btnPrimary}><Link2 size={14} /> {busy ? "A criar…" : "Criar link de partilha"}</button>
      )}
      {token && (
        <>
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            <input readOnly value={url} onFocus={(e) => e.target.select()} aria-label="Link de partilha" style={inputStyle} />
            <button type="button" onClick={copy} style={btnPrimary}>{copied ? <><Check size={14} /> Copiado</> : <><Copy size={14} /> Copiar</>}</button>
          </div>
          <div style={{ ...sans, fontSize: 12.5, color: c.mist, marginBottom: 14 }}>Quem tiver o link vê as opções enviadas. Desativa-o quando o trabalho terminar.</div>
          <button type="button" onClick={disable} disabled={busy} style={btnGhost}>{busy ? "A desativar…" : "Desativar link"}</button>
        </>
      )}
      {error && <div role="alert" style={{ ...sans, fontSize: 14, color: c.rose, marginTop: 12 }}>{error}</div>}
    </Modal>
  );
}

/* ---------- Detalhe de uma opção ---------- */
function Comments({ option, canManage, session, version }) {
  const q = useCreativeComments(option.id);
  const invalidate = useInvalidateCreatives();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const send = async () => {
    if (!text.trim()) return;
    setBusy(true);
    setError("");
    const { error: err } = await supabase.from("creative_comments").insert({
      option_id: option.id, brand_id: option.brand_id, version, author_name: (session.name || "Equipa").slice(0, 120), from_client: false, body: text.trim(),
    });
    setBusy(false);
    if (err) { setError("Não foi possível enviar o comentário."); return; }
    setText("");
    invalidate("creative_comments");
  };
  const remove = async (id) => {
    await supabase.from("creative_comments").delete().eq("id", id);
    invalidate("creative_comments");
  };
  const list = q.data || [];
  return (
    <section>
      <h3 style={{ ...serif, fontSize: 16, fontWeight: 500, color: c.ink, margin: "0 0 10px" }}>Comentários</h3>
      {list.length === 0 && <div style={{ ...sans, fontSize: 14, color: c.mist, marginBottom: 10 }}>Ainda sem comentários.</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
        {list.map((cm) => (
          <div key={cm.id} style={{ background: cm.from_client ? c.bossSoft : c.folha, border: `1px solid ${c.line}`, borderRadius: 6, padding: "10px 12px" }}>
            <div style={{ ...sans, fontSize: 12.5, color: c.mist, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <b style={{ color: c.ink }}>{cm.author_name}</b>
              <span>{cm.from_client ? "cliente" : "equipa"}</span>
              {cm.version && <span>v{cm.version}</span>}
              <span>{formatWhen(cm.created_at)}</span>
              {canManage && (
                <button type="button" onClick={() => remove(cm.id)} aria-label="Apagar comentário" style={{ marginLeft: "auto", background: "none", border: "none", color: c.mist, cursor: "pointer", padding: 2 }}><Trash2 size={13} /></button>
              )}
            </div>
            <div style={{ ...sans, fontSize: 14.5, color: c.ink, whiteSpace: "pre-wrap", wordBreak: "break-word", marginTop: 4 }}>{cm.body}</div>
          </div>
        ))}
      </div>
      {canManage && (
        <div style={{ display: "flex", gap: 8 }}>
          <input value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} placeholder="Escreve uma nota para o cliente ou para a equipa…" onKeyDown={(e) => { if (e.key === "Enter") send(); }} style={inputStyle} />
          <button type="button" onClick={send} disabled={busy || !text.trim()} style={btnPrimary}><Send size={14} /> Enviar</button>
        </div>
      )}
      {error && <div role="alert" style={{ ...sans, fontSize: 14, color: c.rose, marginTop: 8 }}>{error}</div>}
    </section>
  );
}

function FinalFiles({ option, canManage, project }) {
  const invalidate = useInvalidateCreatives();
  const inputRef = useRef(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const files = Array.isArray(option.final_files) ? option.final_files : [];

  const save = async (next) => {
    const { error: err } = await supabase.from("creative_options").update({ final_files: next }).eq("id", option.id);
    if (err) throw new Error("Não foi possível guardar os ficheiros.");
    invalidate("creative_options");
  };
  const onPick = async (e) => {
    const picked = [...(e.target.files || [])];
    e.target.value = "";
    if (!picked.length) return;
    setError("");
    setBusy("upload");
    const added = [];
    try {
      for (const file of picked) {
        const path = await uploadCreativeFile(option.brand_id, project.id, file, { imageOnly: false });
        added.push({ name: file.name, path, size: file.size });
      }
      await save([...files, ...added]);
    } catch (err) {
      await removeCreativeFiles(added.map((f) => f.path));
      setError(err.message || "Não foi possível carregar o ficheiro.");
    } finally {
      setBusy("");
    }
  };
  const download = async (f) => {
    setError("");
    setBusy(f.path);
    try {
      const url = await signedDownloadUrl(f.path, f.name);
      const a = document.createElement("a");
      a.href = url; a.rel = "noopener";
      document.body.appendChild(a); a.click(); a.remove();
    } catch {
      setError("Não foi possível descarregar o ficheiro.");
    } finally {
      setBusy("");
    }
  };
  const remove = async (f) => {
    setError("");
    try {
      await save(files.filter((x) => x.path !== f.path));
      await removeCreativeFiles([f.path]);
    } catch (err) {
      setError(err.message);
    }
  };

  if (!canManage && files.length === 0) return null;
  return (
    <section style={{ background: c.sageSoft, border: `1px solid ${c.sage}`, borderRadius: 6, padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: files.length ? 10 : 0 }}>
        <h3 style={{ ...serif, fontSize: 16, fontWeight: 500, color: c.ink, margin: 0, flex: 1 }}>Ficheiros finais</h3>
        {canManage && (
          <>
            <input ref={inputRef} type="file" multiple style={{ display: "none" }} onChange={onPick} />
            <button type="button" onClick={() => inputRef.current?.click()} disabled={busy === "upload"} style={btnGhost}><Upload size={14} /> {busy === "upload" ? "A carregar…" : "Carregar ficheiros"}</button>
          </>
        )}
      </div>
      {files.length === 0 && canManage && <div style={{ ...sans, fontSize: 13.5, color: c.mist, marginTop: 8 }}>Carrega aqui os ficheiros finais (PDF, AI, SVG, ZIP…). O cliente descarrega-os no link de partilha.</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {files.map((f) => (
          <div key={f.path} style={{ display: "flex", alignItems: "center", gap: 10, background: c.folha, border: `1px solid ${c.line}`, borderRadius: 6, padding: "8px 12px", flexWrap: "wrap" }}>
            <span style={{ ...sans, fontSize: 14, color: c.ink, flex: 1, minWidth: 140, wordBreak: "break-word" }}>{f.name}{f.size ? <span style={{ color: c.mist }}> ({formatBytes(f.size)})</span> : null}</span>
            <button type="button" onClick={() => download(f)} disabled={busy === f.path} style={btnGhost}><Download size={13} /> Descarregar</button>
            {canManage && <button type="button" onClick={() => remove(f)} aria-label={`Remover ${f.name}`} style={{ ...btnGhost, padding: "9px 10px" }}><Trash2 size={13} /></button>}
          </div>
        ))}
      </div>
      {error && <div role="alert" style={{ ...sans, fontSize: 14, color: c.rose, marginTop: 8 }}>{error}</div>}
    </section>
  );
}

function OptionDetail({ option, project, versions, canManage, session, onBack, onDeleted }) {
  const invalidate = useInvalidateCreatives();
  const latest = versions.length ? versions[versions.length - 1].version : 0;
  const [shown, setShown] = useState(latest);
  const [editing, setEditing] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState(option.title);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { setShown(latest); }, [latest]);
  const current = versions.find((v) => v.version === shown) || versions[versions.length - 1] || null;
  const urls = useSignedUrls(current ? contentPaths(current.content, option.brand_id) : []);

  const setStatus = async (status) => {
    setError("");
    if (status === "sent" && versions.length === 0) { setError("Adiciona primeiro uma versão antes de enviar ao cliente."); return; }
    setBusy(true);
    const decided = status === "approved" || status === "rejected";
    const { error: err } = await supabase.from("creative_options").update({
      status, decided_at: decided ? new Date().toISOString() : null, decided_by_name: decided ? session.name || "Equipa" : null,
    }).eq("id", option.id);
    setBusy(false);
    if (err) { setError("Não foi possível mudar o estado."); return; }
    invalidate("creative_options");
  };
  const saveTitle = async () => {
    const next = title.trim();
    if (!next || next === option.title) { setTitle(option.title); setRenaming(false); return; }
    const { error: err } = await supabase.from("creative_options").update({ title: next }).eq("id", option.id);
    if (err) { setError("Não foi possível mudar o nome."); return; }
    setRenaming(false);
    invalidate("creative_options");
  };
  const saveVersion = async (note, content) => {
    const { error: err } = await supabase.rpc("creative_add_version", { p_option: option.id, p_note: note, p_content: content });
    if (err) throw new Error("Não foi possível guardar a versão.");
    await invalidate("creative_versions");
  };
  const del = async () => {
    setBusy(true);
    const files = await filesOfOptions([option.id], option.brand_id);
    const { error: err } = await supabase.from("creative_options").delete().eq("id", option.id);
    if (err) { setBusy(false); setConfirmDelete(false); setError("Não foi possível apagar a opção."); return; }
    await removeCreativeFiles(files);
    await invalidate("creative_options", "creative_versions");
    onDeleted();
  };

  const actions = {
    draft: [["sent", "Marcar como enviada", Send, true]],
    sent: [["approved", "Aprovar", Check, true], ["rejected", "Rejeitar", null, false], ["draft", "Voltar a rascunho", RotateCcw, false]],
    approved: [["sent", "Reabrir (voltar a enviada)", RotateCcw, false]],
    rejected: [["sent", "Reabrir (voltar a enviada)", RotateCcw, false]],
  }[option.status] || [];

  return (
    <>
      <button type="button" onClick={onBack} style={{ ...sans, display: "flex", alignItems: "center", gap: 6, fontSize: 14, color: c.mist, background: "none", border: "none", cursor: "pointer", marginBottom: 14 }}>
        <ArrowLeft size={14} /> {project.title}
      </button>

      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 6 }}>
        {renaming ? (
          <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} onBlur={saveTitle} onKeyDown={(e) => { if (e.key === "Enter") saveTitle(); if (e.key === "Escape") { setTitle(option.title); setRenaming(false); } }} aria-label="Nome da opção" style={{ ...inputStyle, maxWidth: 320 }} />
        ) : (
          <h1 style={{ ...display, fontSize: 26, color: c.ink, margin: 0 }}>{option.title}</h1>
        )}
        <StatusPill status={option.status} />
        {canManage && !renaming && (
          <button type="button" onClick={() => setRenaming(true)} aria-label="Mudar o nome da opção" style={{ background: "none", border: "none", color: c.mist, cursor: "pointer", padding: 4 }}><Pencil size={15} /></button>
        )}
      </div>
      {option.decided_at && (option.status === "approved" || option.status === "rejected") && (
        <div style={{ ...sans, fontSize: 13, color: c.mist, marginBottom: 12 }}>
          {option.status === "approved" ? "Aprovada" : "Rejeitada"} por {option.decided_by_name || "cliente"} em {formatWhen(option.decided_at)}
        </div>
      )}

      {canManage && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "12px 0 20px" }}>
          {actions.map(([status, label, Icon, primary]) => (
            <button key={status + label} type="button" disabled={busy} onClick={() => setStatus(status)} style={primary ? btnPrimary : btnGhost}>
              {Icon && <Icon size={14} />} {label}
            </button>
          ))}
          <button type="button" onClick={() => setEditing(true)} style={btnGhost}><Plus size={14} /> {versions.length ? "Nova versão" : "Adicionar o design"}</button>
          <button type="button" onClick={() => setConfirmDelete(true)} aria-label="Apagar opção" style={{ ...btnGhost, padding: "9px 10px", marginLeft: "auto" }}><Trash2 size={14} /></button>
        </div>
      )}
      {error && <div role="alert" style={{ ...sans, fontSize: 14, color: c.rose, marginBottom: 12 }}>{error}</div>}

      {versions.length > 1 && (
        <div role="tablist" aria-label="Versões" style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
          {versions.map((v) => (
            <button key={v.version} role="tab" aria-selected={v.version === shown} type="button" onClick={() => setShown(v.version)} style={{ ...sans, fontSize: 13.5, fontWeight: 700, padding: "6px 12px", borderRadius: 999, cursor: "pointer", border: `1px solid ${v.version === shown ? c.boss : c.lineStrong}`, background: v.version === shown ? c.bossSoft : "none", color: c.ink }}>
              v{v.version}{v.version === latest ? " (atual)" : ""}
            </button>
          ))}
        </div>
      )}
      {current?.note && (
        <div style={{ ...sans, fontSize: 14, color: c.mist, marginBottom: 12 }}><b style={{ color: c.ink }}>v{current.version}:</b> {current.note} <span style={{ fontSize: 12.5 }}>({formatWhen(current.created_at)})</span></div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
        {option.status === "approved" && <FinalFiles option={option} canManage={canManage} project={project} />}
        {current ? (
          <VersionViewer kind={project.kind} content={current.content} urls={urls.data || {}} />
        ) : (
          <div style={{ ...sans, fontSize: 14.5, color: c.mist }}>
            Esta opção ainda não tem design.{canManage ? " Carrega em «Adicionar o design» para criar a v1." : ""}
          </div>
        )}
        <Comments option={option} canManage={canManage} session={session} version={current?.version ?? null} />
      </div>

      {editing && (
        <VersionEditor
          kind={project.kind} brandId={option.brand_id} projectId={project.id}
          versionNumber={latest + 1} initial={current?.content}
          onSave={saveVersion} onClose={() => setEditing(false)}
        />
      )}
      {confirmDelete && (
        <Confirm title="Apagar opção" confirmLabel="Apagar" busy={busy} onConfirm={del} onClose={() => setConfirmDelete(false)}>
          Apagar <b>{option.title}</b> com todas as versões, comentários e ficheiros? Esta ação não pode ser desfeita.
        </Confirm>
      )}
    </>
  );
}

/* ---------- Grelha de opções de um trabalho ---------- */
function OptionCard({ option, project, versions, onOpen, coverUrl }) {
  const latest = versions[versions.length - 1];
  const approved = option.status === "approved";
  return (
    <button type="button" onClick={onOpen} style={{ textAlign: "left", padding: 0, cursor: "pointer", background: c.folha, border: `${approved ? 2 : 1}px solid ${approved ? c.sage : c.line}`, borderRadius: 8, overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <div style={{ aspectRatio: "4 / 3", background: c.folha2, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
        {coverUrl ? <img src={coverUrl} alt="" style={{ width: "100%", height: "100%", objectFit: project.kind === "landing_page" ? "cover" : "contain", objectPosition: "top" }} /> : <span style={{ ...sans, fontSize: 13, color: c.mist }}>{latest ? "A carregar…" : "Sem design"}</span>}
      </div>
      <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ ...serif, fontSize: 16, color: c.ink }}>{option.title}</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <StatusPill status={option.status} />
          {latest && <span style={{ ...sans, fontSize: 12.5, color: c.mist }}>v{latest.version}</span>}
        </div>
      </div>
    </button>
  );
}

function ProjectView({ project, brand, canManage, session, onDeleted }) {
  const optionsQ = useCreativeOptions(project.id);
  const options = useMemo(() => optionsQ.data || [], [optionsQ.data]);
  const versionsQ = useCreativeVersions(options.map((o) => o.id));
  const invalidate = useInvalidateCreatives();
  const [openId, setOpenId] = useState(null);
  const [share, setShare] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState(project.title);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { setOpenId(null); setTitle(project.title); setRenaming(false); }, [project.id, project.title]);

  const versionsOf = (id) => (versionsQ.data || []).filter((v) => v.option_id === id);
  const covers = options.map((o) => { const v = versionsOf(o.id); return coverPath(project.kind, v[v.length - 1]?.content); });
  const urlsQ = useSignedUrls(covers);

  const sorted = [...options].sort((a, b) => (b.status === "approved") - (a.status === "approved"));
  const open = options.find((o) => o.id === openId);

  const addOption = async () => {
    setBusy(true);
    setError("");
    const { data, error: err } = await supabase.from("creative_options")
      .insert({ project_id: project.id, brand_id: brand.id, title: `Opção ${options.length + 1}`, position: options.length, created_by: session.id || null })
      .select("id").single();
    setBusy(false);
    if (err) { setError("Não foi possível criar a opção."); return; }
    await invalidate("creative_options");
    setOpenId(data.id);
  };
  const saveTitle = async () => {
    const next = title.trim();
    if (!next || next === project.title) { setTitle(project.title); setRenaming(false); return; }
    const { error: err } = await supabase.from("creative_projects").update({ title: next }).eq("id", project.id);
    if (err) { setError("Não foi possível mudar o nome."); return; }
    setRenaming(false);
    invalidate("creative_projects");
  };
  const del = async () => {
    setBusy(true);
    const files = await filesOfOptions(options.map((o) => o.id), brand.id);
    const { error: err } = await supabase.from("creative_projects").delete().eq("id", project.id);
    if (err) { setBusy(false); setConfirmDelete(false); setError("Não foi possível apagar o trabalho."); return; }
    await removeCreativeFiles(files);
    await invalidate("creative_projects", "creative_options", "creative_versions");
    setBusy(false);
    onDeleted();
  };

  if (open) {
    return <OptionDetail key={open.id} option={open} project={project} versions={versionsOf(open.id)} canManage={canManage} session={session} onBack={() => setOpenId(null)} onDeleted={() => setOpenId(null)} />;
  }

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 18 }}>
        {renaming ? (
          <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} onBlur={saveTitle} onKeyDown={(e) => { if (e.key === "Enter") saveTitle(); if (e.key === "Escape") { setTitle(project.title); setRenaming(false); } }} aria-label="Nome do trabalho" style={{ ...inputStyle, maxWidth: 320 }} />
        ) : (
          <h2 style={{ ...serif, fontSize: 20, fontWeight: 500, color: c.ink, margin: 0 }}>{project.title}</h2>
        )}
        {canManage && !renaming && <button type="button" onClick={() => setRenaming(true)} aria-label="Mudar o nome do trabalho" style={{ background: "none", border: "none", color: c.mist, cursor: "pointer", padding: 4 }}><Pencil size={15} /></button>}
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
          {canManage && <button type="button" onClick={() => setShare(true)} style={btnGhost}><Link2 size={14} /> Partilhar com o cliente</button>}
          {canManage && <button type="button" onClick={addOption} disabled={busy} style={btnPrimary}><Plus size={14} /> Nova opção</button>}
          {canManage && <button type="button" onClick={() => setConfirmDelete(true)} aria-label="Apagar trabalho" style={{ ...btnGhost, padding: "9px 10px" }}><Trash2 size={14} /></button>}
        </div>
      </div>
      {error && <div role="alert" style={{ ...sans, fontSize: 14, color: c.rose, marginBottom: 12 }}>{error}</div>}
      {optionsQ.isLoading && <div style={{ ...sans, fontSize: 14.5, color: c.mist }}>A carregar…</div>}
      {optionsQ.isError && <div style={{ ...sans, fontSize: 14, color: c.rose }}>Não foi possível carregar as opções.</div>}
      {optionsQ.data && options.length === 0 && (
        <div style={{ ...sans, fontSize: 14.5, color: c.mist }}>
          Ainda não há opções.{canManage ? " Carrega em «Nova opção» para criar a Opção 1." : " A equipa vai partilhar as opções aqui."}
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 14 }}>
        {sorted.map((o) => {
          const v = versionsOf(o.id);
          const cover = coverPath(project.kind, v[v.length - 1]?.content);
          return <OptionCard key={o.id} option={o} project={project} versions={v} coverUrl={cover ? urlsQ.data?.[cover] : null} onOpen={() => setOpenId(o.id)} />;
        })}
      </div>

      {share && <ShareModal project={project} brandId={brand.id} userId={session.id} onClose={() => setShare(false)} />}
      {confirmDelete && (
        <Confirm title="Apagar trabalho" confirmLabel="Apagar" busy={busy} onConfirm={del} onClose={() => setConfirmDelete(false)}>
          Apagar <b>{project.title}</b> com todas as opções, versões e ficheiros? Esta ação não pode ser desfeita.
        </Confirm>
      )}
    </>
  );
}

/* ---------- Módulo ---------- */
export default function CreativesModule({ brand, onBack, session }) {
  const canManage = CAN_MANAGE_ROLES.includes(session.role);
  const projectsQ = useCreativeProjects(brand.id);
  const invalidate = useInvalidateCreatives();
  const projects = useMemo(() => projectsQ.data || [], [projectsQ.data]);
  const [selected, setSelected] = useState(null);
  const [creating, setCreating] = useState(false);

  const current = projects.find((p) => p.id === selected) || projects[0] || null;

  return (
    <div className="bb-page" style={{ padding: "8px 40px 60px", maxWidth: 1080 }}>
      <button type="button" onClick={onBack} style={{ ...sans, display: "flex", alignItems: "center", gap: 6, fontSize: 14, color: c.mist, background: "none", border: "none", cursor: "pointer", marginBottom: 16 }}>
        <ArrowLeft size={14} /> {brand.name}
      </button>
      <h1 style={{ ...display, fontSize: 27, color: c.ink, margin: "0 0 6px" }}>Criativos</h1>
      <div style={{ ...sans, fontSize: 14.5, color: c.mist, marginBottom: 22 }}>As opções de design de {brand.name}, por tipo de trabalho.</div>

      {projectsQ.isLoading && <div style={{ ...sans, fontSize: 14.5, color: c.mist }}>A carregar…</div>}
      {projectsQ.isError && <div style={{ ...sans, fontSize: 14, color: c.rose }}>Não foi possível carregar os trabalhos.</div>}

      {projectsQ.data && (
        <div role="tablist" aria-label="Trabalhos" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 22, borderBottom: `1px solid ${c.line}`, paddingBottom: 14 }}>
          {projects.map((p) => {
            const Icon = KINDS[p.kind]?.icon;
            const on = current?.id === p.id;
            return (
              <button key={p.id} role="tab" aria-selected={on} type="button" onClick={() => setSelected(p.id)} style={{ ...sans, display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 700, padding: "8px 14px", borderRadius: 999, cursor: "pointer", color: on ? c.onBoss : c.ink, background: on ? c.boss : "none", border: `1px solid ${on ? c.boss : c.lineStrong}` }}>
                {Icon && <Icon size={15} />} {p.title}
              </button>
            );
          })}
          {canManage && (
            <button type="button" onClick={() => setCreating(true)} style={{ ...btnGhost, borderStyle: "dashed", borderRadius: 999, padding: "8px 14px" }}><Plus size={14} /> Novo trabalho</button>
          )}
        </div>
      )}

      {projectsQ.data && projects.length === 0 && (
        <div style={{ ...sans, fontSize: 14.5, color: c.mist }}>
          Ainda não há trabalhos.{canManage ? " Cria o primeiro (cartão de visita, landing page, identidade visual…) para mostrar as opções ao cliente." : ""}
        </div>
      )}

      {current && <ProjectView key={current.id} project={current} brand={brand} canManage={canManage} session={session} onDeleted={() => { setSelected(null); invalidate("creative_projects"); }} />}

      {creating && (
        <NewProjectModal
          brandId={brand.id} userId={session.id} position={projects.length}
          onClose={() => setCreating(false)}
          onCreated={(id) => { setCreating(false); setSelected(id); invalidate("creative_projects"); }}
        />
      )}
    </div>
  );
}
