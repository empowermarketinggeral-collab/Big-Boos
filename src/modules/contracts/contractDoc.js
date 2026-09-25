import DOMPurify from "dompurify";

/* ---------------------------------------------------------
   DOCUMENTO DO CONTRATO — HTML (do editor) → página com blocos de
   assinatura → PDF. O mesmo HTML serve o ecrã (editor, pré-visualização,
   página pública) e o PDF, para o que se vê ser o que se descarrega.
--------------------------------------------------------- */

export const SIGNATURE_TOKENS = {
  agency: "{{assinatura_agencia}}",
  counterparty: "{{assinatura_cliente}}",
};

export const CONTRACT_STATUS = {
  draft: { label: "Rascunho", color: "#6E6980" },
  sent: { label: "Aguarda assinatura", color: "#C9821F" },
  signed: { label: "Assinado", color: "#2F9E63" },
  cancelled: { label: "Cancelado", color: "#D3455B" },
};

// Largura do documento em px (180 mm = A4 menos margens de 15 mm).
export const DOC_WIDTH_PX = 680;

export const CONTRACT_CSS = `
.contract-doc { font-family: Georgia, 'Times New Roman', serif; font-size: 14px; line-height: 1.65; color: #17151F; word-wrap: break-word; }
.contract-doc h1 { font-size: 22px; line-height: 1.3; margin: 0 0 14px; font-weight: 700; }
.contract-doc h2 { font-size: 17px; line-height: 1.35; margin: 20px 0 8px; font-weight: 700; }
.contract-doc h3 { font-size: 15px; line-height: 1.4; margin: 16px 0 6px; font-weight: 700; }
.contract-doc p { margin: 0 0 10px; }
.contract-doc ul, .contract-doc ol { margin: 0 0 10px; padding-left: 24px; }
.contract-doc li { margin-bottom: 3px; }
.contract-doc li > p { margin: 0; }
.contract-doc blockquote { margin: 0 0 10px; padding-left: 14px; border-left: 3px solid #D9D5E6; color: #4A4658; }
.contract-doc hr { border: none; border-top: 1px solid #C9C5D6; margin: 18px 0; }
.contract-doc a { color: #5E35C4; }
.contract-doc .sig-row { display: flex; gap: 32px; margin-top: 36px; }
.contract-doc .sig-row .sig-box { flex: 1; min-width: 0; }
.contract-doc .sig-box { margin: 26px 0 8px; max-width: 320px; page-break-inside: avoid; break-inside: avoid; }
.contract-doc .sig-label { font-size: 12px; color: #6E6980; margin-bottom: 4px; }
.contract-doc .sig-area { height: 76px; display: flex; align-items: flex-end; }
.contract-doc .sig-area img { max-height: 72px; max-width: 100%; }
.contract-doc .sig-line { border-top: 1px solid #17151F; margin-top: 2px; }
.contract-doc .sig-name { font-size: 13px; font-weight: 700; margin-top: 4px; }
.contract-doc .sig-meta { font-size: 11px; color: #6E6980; margin-top: 2px; }
.contract-doc .sig-pending { font-size: 11.5px; color: #9691A6; font-style: italic; }
.contract-doc .audit { page-break-before: always; break-before: page; padding-top: 4px; }
.contract-doc .audit table { width: 100%; border-collapse: collapse; font-size: 12px; margin: 8px 0 14px; }
.contract-doc .audit th { text-align: left; width: 34%; font-weight: 700; padding: 6px 8px 6px 0; vertical-align: top; border-bottom: 1px solid #EAE7F1; }
.contract-doc .audit td { padding: 6px 0; border-bottom: 1px solid #EAE7F1; word-break: break-all; }
.contract-doc .audit .note { font-size: 11px; color: #6E6980; }
`;

const escapeHtml = (v) => String(v ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));

export function formatDateTime(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("pt-PT", { timeZone: "Europe/Lisbon", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

// Só imagens PNG em data URL — é o que a assinatura desenhada gera e o que as funções validam.
const safeSignatureSrc = (src) => (typeof src === "string" && /^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(src) ? src : "");

function signatureBoxHtml({ label, name, signer }) {
  const src = safeSignatureSrc(signer?.signature_image);
  return `<div class="sig-box">
    <div class="sig-label">${escapeHtml(label)}</div>
    <div class="sig-area">${src ? `<img src="${src}" alt="Assinatura" />` : ""}</div>
    <div class="sig-line"></div>
    <div class="sig-name">${escapeHtml(signer?.name || name || "")}</div>
    ${signer?.signed_at ? `<div class="sig-meta">Assinado eletronicamente em ${escapeHtml(formatDateTime(signer.signed_at))}</div>` : `<div class="sig-pending">Por assinar</div>`}
  </div>`;
}

function auditHtml({ contract, signers }) {
  const rows = (role, title) => {
    const s = signers.find((x) => x.role === role);
    if (!s?.signed_at) return "";
    return `<h3>${escapeHtml(title)}</h3>
      <table>
        <tr><th>Nome</th><td>${escapeHtml(s.name)}</td></tr>
        <tr><th>Email</th><td>${escapeHtml(s.email)}</td></tr>
        <tr><th>Data e hora (Lisboa)</th><td>${escapeHtml(formatDateTime(s.signed_at))}</td></tr>
        <tr><th>Endereço IP</th><td>${escapeHtml(s.signed_ip || "—")}</td></tr>
      </table>`;
  };
  return `<div class="audit">
    <h2>Certificado de assinatura</h2>
    <table>
      <tr><th>Documento</th><td>${escapeHtml(contract.title)}</td></tr>
      <tr><th>Identificador</th><td>${escapeHtml(contract.id)}</td></tr>
      <tr><th>Enviado em</th><td>${escapeHtml(formatDateTime(contract.sent_at))}</td></tr>
      <tr><th>Concluído em</th><td>${escapeHtml(formatDateTime(contract.completed_at))}</td></tr>
      <tr><th>Impressão digital (SHA-256)</th><td>${escapeHtml(contract.body_hash)}</td></tr>
    </table>
    ${rows("agency", "Assinatura da agência")}
    ${rows("counterparty", "Assinatura da outra parte")}
    <p class="note">Contrato assinado eletronicamente através do EMPOWER OS. A impressão digital acima identifica, de forma única, o texto exato que ambas as partes assinaram; qualquer alteração ao texto produz uma impressão diferente.</p>
  </div>`;
}

// Devolve o HTML final do documento: corpo limpo + blocos de assinatura
// (nos marcadores do texto, ou no fim se faltarem) + certificado se assinado.
export function renderContractHtml({ contract, signers = [], agencyName = "" }) {
  const clean = DOMPurify.sanitize(contract.body_html || "");
  const signerFor = (role) => signers.find((s) => s.role === role);
  const boxes = {
    agency: signatureBoxHtml({ label: `Pela ${agencyName || "agência"}`, name: "", signer: signerFor("agency") }),
    counterparty: signatureBoxHtml({ label: `Por ${contract.counterparty_name || "outra parte"}`, name: contract.counterparty_name, signer: signerFor("counterparty") }),
  };

  let html = clean;
  const used = { agency: false, counterparty: false };
  for (const role of ["agency", "counterparty"]) {
    const token = SIGNATURE_TOKENS[role].replace(/[{}]/g, "\\$&");
    const asParagraph = new RegExp(`<p[^>]*>\\s*${token}\\s*</p>`, "g");
    const bare = new RegExp(token, "g");
    if (asParagraph.test(html) || bare.test(html)) used[role] = true;
    html = html.replace(asParagraph, boxes[role]).replace(bare, boxes[role]);
  }
  const missing = ["agency", "counterparty"].filter((role) => !used[role]);
  if (missing.length > 0) {
    html += `<div class="sig-row">${missing.map((role) => boxes[role]).join("")}</div>`;
  }
  if (contract.status === "signed" && contract.body_hash) {
    html += auditHtml({ contract, signers });
  }
  return html;
}

const slug = (text) =>
  String(text || "contrato")
    .normalize("NFD")
    .replace(new RegExp("[" + String.fromCharCode(0x300) + "-" + String.fromCharCode(0x36f) + "]", "g"), "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "contrato";

// Gera o PDF em memória (biblioteca carregada só quando é preciso).
export async function generateContractPdf(html) {
  const { default: html2pdf } = await import("html2pdf.js");
  // O elemento que vai para o PDF não pode ter posicionamento próprio (é
  // clonado para dentro de um contentor): fica dentro de um "host" fora do ecrã.
  const host = document.createElement("div");
  host.style.cssText = `position:fixed;left:-10000px;top:0;width:${DOC_WIDTH_PX}px;background:#fff;`;
  const doc = document.createElement("div");
  doc.className = "contract-doc";
  doc.style.cssText = `width:${DOC_WIDTH_PX}px;background:#fff;`;
  doc.innerHTML = `<style>${CONTRACT_CSS}</style>${html}`;
  host.appendChild(doc);
  document.body.appendChild(host);
  try {
    const pdf = await html2pdf()
      .set({
        margin: [15, 15, 18, 15],
        image: { type: "jpeg", quality: 0.95 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff" },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        pagebreak: { mode: ["css", "legacy"], avoid: [".sig-box", "h1", "h2", "h3", "li", "tr"] },
      })
      .from(doc)
      .toPdf()
      .get("pdf");
    return { blob: pdf.output("blob"), pages: pdf.internal.getNumberOfPages() };
  } finally {
    host.remove();
  }
}

// Gera o PDF e descarrega-o com o título do contrato como nome do ficheiro.
export async function downloadContractPdf(html, title) {
  const { blob } = await generateContractPdf(html);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${slug(title)}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
