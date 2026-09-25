import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabaseClient.js";
import { c, sans, serif, Eyebrow, Modal, btnPrimary, btnGhost, CAN_MANAGE_ROLES } from "../../shared/theme.jsx";
import { ArrowLeft, Upload, Download, Trash2, FileText, FileSignature } from "lucide-react";
import ContractViewer, { StatusPill } from "./ContractViewer.jsx";
import { formatDateTime } from "./contractDoc.js";
import { useContracts } from "./contractsData.js";

/* ---------------------------------------------------------
   ABA "CONTRATOS" DE CADA MARCA
   1. PDFs carregados (contratos já assinados fora da plataforma) —
      bucket privado "contracts", descarregados por URL temporária.
   2. Contratos criados na plataforma para esta marca (só leitura aqui;
      a equipa cria e envia no módulo Contratos da agência).
   O cliente da marca só vê; carregar/apagar é da equipa.
--------------------------------------------------------- */

const MAX_BYTES = 20 * 1024 * 1024;

const formatSize = (bytes) => {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

function useContractFiles(brandId) {
  return useQuery({
    queryKey: ["brand_contract_files", brandId],
    enabled: !!brandId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("brand_contract_files")
        .select("id, name, storage_path, size_bytes, created_at")
        .eq("brand_id", brandId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

function useUploadContractFiles(brandId, userId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (files) => {
      const failures = [];
      for (const file of files) {
        const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
        if (!isPdf) { failures.push(`${file.name}: só são aceites ficheiros PDF.`); continue; }
        if (file.size > MAX_BYTES) { failures.push(`${file.name}: passa os 20 MB.`); continue; }
        const path = `${brandId}/${crypto.randomUUID()}.pdf`;
        const { error: uploadError } = await supabase.storage.from("contracts").upload(path, file, { contentType: "application/pdf" });
        if (uploadError) { failures.push(`${file.name}: ${uploadError.message}`); continue; }
        const { error: insertError } = await supabase
          .from("brand_contract_files")
          .insert({ brand_id: brandId, name: file.name, storage_path: path, size_bytes: file.size, uploaded_by: userId });
        if (insertError) {
          await supabase.storage.from("contracts").remove([path]); // não deixa ficheiros órfãos
          failures.push(`${file.name}: ${insertError.message}`);
        }
      }
      if (failures.length > 0) throw new Error(failures.join("\n"));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["brand_contract_files", brandId] }),
  });
}

function useDeleteContractFile(brandId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file) => {
      const { error: rowError } = await supabase.from("brand_contract_files").delete().eq("id", file.id);
      if (rowError) throw rowError;
      await supabase.storage.from("contracts").remove([file.storage_path]);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["brand_contract_files", brandId] }),
  });
}

export default function BrandContractsModule({ brand, onBack, session }) {
  const canManage = CAN_MANAGE_ROLES.includes(session.role);
  const filesQuery = useContractFiles(brand.id);
  const contractsQuery = useContracts({ brandId: brand.id });
  const upload = useUploadContractFiles(brand.id, session.id);
  const deleteFile = useDeleteContractFile(brand.id);
  const fileInputRef = useRef(null);
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [viewingId, setViewingId] = useState(null);

  const contracts = contractsQuery.data || [];
  const viewing = viewingId ? contracts.find((ct) => ct.id === viewingId) : null;

  const onFilesSelected = async (e) => {
    const files = [...(e.target.files || [])];
    e.target.value = "";
    if (files.length === 0) return;
    setError("");
    try {
      await upload.mutateAsync(files);
    } catch (err) {
      setError(err.message || "Não foi possível carregar o ficheiro.");
    }
  };

  const download = async (file) => {
    setDownloading(file.id);
    setError("");
    try {
      const { data, error: urlError } = await supabase.storage.from("contracts").createSignedUrl(file.storage_path, 60, { download: file.name });
      if (urlError) throw urlError;
      const link = document.createElement("a");
      link.href = data.signedUrl;
      link.rel = "noopener";
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      setError(err.message || "Não foi possível descarregar o ficheiro.");
    } finally {
      setDownloading("");
    }
  };

  const doDelete = async () => {
    try {
      await deleteFile.mutateAsync(confirmDelete);
      setConfirmDelete(null);
    } catch (err) {
      setError(err.message || "Não foi possível apagar o ficheiro.");
      setConfirmDelete(null);
    }
  };

  const shell = (children) => (
    <div className="bb-page" style={{ padding: "8px 40px 60px", maxWidth: 1080 }}>{children}</div>
  );

  if (viewing) {
    return shell(<ContractViewer contract={viewing} canManage={false} onBack={() => setViewingId(null)} />);
  }

  return shell(
    <>
      <button onClick={onBack} style={{ ...sans, display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: c.mist, background: "none", border: "none", cursor: "pointer", marginBottom: 16 }}>
        <ArrowLeft size={14} /> {brand.name}
      </button>
      <Eyebrow>Contratos</Eyebrow>
      <h1 style={{ ...serif, fontSize: 27, fontWeight: 500, color: c.ink, margin: "0 0 24px" }}>Contratos</h1>

      {/* PDFs carregados */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <h2 style={{ ...serif, fontSize: 17, fontWeight: 500, color: c.ink, margin: 0 }}>Ficheiros PDF</h2>
        {canManage && (
          <>
            <input ref={fileInputRef} type="file" accept="application/pdf,.pdf" multiple style={{ display: "none" }} onChange={onFilesSelected} />
            <button onClick={() => fileInputRef.current?.click()} disabled={upload.isPending} style={btnPrimary}>
              <Upload size={13} /> {upload.isPending ? "A carregar…" : "Carregar PDF"}
            </button>
          </>
        )}
      </div>

      {error && <div style={{ ...sans, fontSize: 12.5, color: c.rose, marginBottom: 12, whiteSpace: "pre-line" }}>{error}</div>}
      {filesQuery.isLoading && <div style={{ ...sans, fontSize: 13, color: c.mist }}>A carregar…</div>}
      {filesQuery.isError && <div style={{ ...sans, fontSize: 12.5, color: c.rose }}>Não foi possível carregar os ficheiros.</div>}
      {filesQuery.data?.length === 0 && (
        <div style={{ ...sans, fontSize: 13, color: c.mist }}>
          Ainda não há PDFs.{canManage ? " Carrega aqui os contratos já assinados desta marca." : ""}
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 32 }}>
        {(filesQuery.data || []).map((file) => (
          <div key={file.id} style={{ display: "flex", alignItems: "center", gap: 12, background: "#fff", border: `1px solid ${c.line}`, borderRadius: 12, padding: "12px 16px", flexWrap: "wrap" }}>
            <FileText size={18} color={c.boss} style={{ flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 180 }}>
              <div style={{ ...serif, fontSize: 14.5, color: c.ink, wordBreak: "break-word" }}>{file.name}</div>
              <div style={{ ...sans, fontSize: 11.5, color: c.mist, marginTop: 2 }}>
                {[formatSize(file.size_bytes), formatDateTime(file.created_at)].filter(Boolean).join(" · ")}
              </div>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => download(file)} disabled={downloading === file.id} style={btnGhost}>
                <Download size={13} /> {downloading === file.id ? "…" : "Descarregar"}
              </button>
              {canManage && (
                <button onClick={() => setConfirmDelete(file)} aria-label={`Apagar ${file.name}`} style={{ ...btnGhost, padding: "9px 10px" }}>
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Contratos criados na plataforma */}
      <h2 style={{ ...serif, fontSize: 17, fontWeight: 500, color: c.ink, margin: "0 0 12px" }}>Contratos criados na plataforma</h2>
      {contractsQuery.data && contracts.length === 0 && (
        <div style={{ ...sans, fontSize: 13, color: c.mist }}>
          Ainda não há contratos criados para esta marca.{canManage ? " Cria-os no módulo Contratos da agência (menu lateral) escolhendo esta marca." : ""}
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {contracts.map((ct) => (
          <button
            key={ct.id}
            onClick={() => setViewingId(ct.id)}
            style={{ display: "flex", alignItems: "center", gap: 14, background: "#fff", border: `1px solid ${c.line}`, borderRadius: 12, padding: "12px 16px", cursor: "pointer", textAlign: "left", width: "100%", flexWrap: "wrap" }}
          >
            <FileSignature size={18} color={c.boss} style={{ flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 180 }}>
              <div style={{ ...serif, fontSize: 14.5, color: c.ink }}>{ct.title}</div>
              <div style={{ ...sans, fontSize: 11.5, color: c.mist, marginTop: 2 }}>
                {[ct.counterparty_name, formatDateTime(ct.completed_at || ct.sent_at || ct.created_at)].filter(Boolean).join(" · ")}
              </div>
            </div>
            <StatusPill status={ct.status} />
          </button>
        ))}
      </div>

      {confirmDelete && (
        <Modal title="Apagar ficheiro" onClose={() => setConfirmDelete(null)} width={380}>
          <div style={{ ...sans, fontSize: 13, color: c.ink, lineHeight: 1.6, marginBottom: 16, wordBreak: "break-word" }}>
            Apagar <b>{confirmDelete.name}</b>? Esta ação não pode ser desfeita.
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={doDelete} disabled={deleteFile.isPending} style={{ ...btnPrimary, background: c.rose }}>
              {deleteFile.isPending ? "A apagar…" : "Apagar"}
            </button>
            <button onClick={() => setConfirmDelete(null)} style={btnGhost}>Cancelar</button>
          </div>
        </Modal>
      )}
    </>
  );
}
