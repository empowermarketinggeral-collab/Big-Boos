/* ---------------------------------------------------------
   SELO DE APROVADO — a forma do logótipo (public/brand/aprovado), pintada
   com o dourado do tema. Aparece onde algo foi aprovado ou assinado;
   com lit=true "acende" uma vez (só depois de uma ação da pessoa; parado
   se o sistema pedir menos movimento). ring=true é a versão com anel,
   para o momento de destaque (contrato assinado).
--------------------------------------------------------- */
export default function ApprovalSeal({ size = 16, ring = false, lit = false, color, style }) {
  return (
    <span
      className={`bb-seal${ring ? " bb-seal-ring" : ""}${lit ? " bb-seal-lit" : ""}`}
      style={{ width: size, height: size, ...(color ? { background: color } : null), ...style }}
      aria-hidden="true"
    />
  );
}
