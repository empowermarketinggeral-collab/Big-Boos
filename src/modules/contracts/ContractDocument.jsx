import { useMemo } from "react";
import { c } from "../../shared/theme.jsx";
import { CONTRACT_CSS, DOC_WIDTH_PX, renderContractHtml } from "./contractDoc.js";

/* ---------------------------------------------------------
   Folha do contrato (só leitura): corpo limpo + assinaturas.
   O html devolvido por renderContractHtml é a fonte do PDF também.
--------------------------------------------------------- */
export default function ContractDocument({ contract, signers, agencyName }) {
  const html = useMemo(() => renderContractHtml({ contract, signers, agencyName }), [contract, signers, agencyName]);
  return (
    <div style={{ background: c.paper, padding: "20px 12px", borderRadius: 12, overflowX: "auto" }}>
      <style>{CONTRACT_CSS}</style>
      <div
        className="contract-doc"
        style={{ background: "#fff", maxWidth: DOC_WIDTH_PX + 80, margin: "0 auto", padding: "40px 40px 48px", boxShadow: "0 1px 6px rgba(23,21,31,0.08)", borderRadius: 4, boxSizing: "border-box" }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
