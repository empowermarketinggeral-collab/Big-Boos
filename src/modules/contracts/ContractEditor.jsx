import { useEditor, EditorContent, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TextAlign from "@tiptap/extension-text-align";
import { c, sans } from "../../shared/theme.jsx";
import { CONTRACT_CSS, DOC_WIDTH_PX, SIGNATURE_TOKENS } from "./contractDoc.js";
import {
  Bold, Italic, Underline, Strikethrough, List, ListOrdered, AlignLeft, AlignCenter, AlignRight, AlignJustify,
  Heading1, Heading2, Heading3, Pilcrow, Quote, Minus, Undo2, Redo2, PenLine,
} from "lucide-react";

/* ---------------------------------------------------------
   EDITOR DE CONTRATOS — texto rico "tipo Word" (TipTap). Produz HTML
   limpo; o documento final é renderizado por contractDoc.js. O espaço
   de assinatura é um marcador ({{assinatura_agencia}} / {{assinatura_cliente}})
   que passa a caixa de assinatura no documento e no PDF.
--------------------------------------------------------- */

const EDITOR_CSS = `
${CONTRACT_CSS}
.contract-editor .ProseMirror { outline: none; min-height: 520px; }
`;

function ToolButton({ onClick, active, disabled, label, children }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onMouseDown={(e) => e.preventDefault()} // não tira o foco do texto
      onClick={onClick}
      disabled={disabled}
      style={{
        display: "flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, borderRadius: 6, border: "none",
        cursor: disabled ? "default" : "pointer", color: disabled ? c.line : active ? "#fff" : c.mist, background: active ? c.boss : "transparent",
      }}
    >
      {children}
    </button>
  );
}

const Divider = () => <span style={{ width: 1, height: 20, background: c.line, margin: "0 4px", flexShrink: 0 }} />;

export default function ContractEditor({ value, onChange }) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] }, link: { openOnClick: false }, code: false, codeBlock: false }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
    ],
    content: value || "",
    onUpdate: ({ editor: ed }) => onChange(ed.getHTML()),
  });

  const state = useEditorState({
    editor,
    selector: ({ editor: ed }) =>
      ed
        ? {
            bold: ed.isActive("bold"), italic: ed.isActive("italic"), underline: ed.isActive("underline"), strike: ed.isActive("strike"),
            h1: ed.isActive("heading", { level: 1 }), h2: ed.isActive("heading", { level: 2 }), h3: ed.isActive("heading", { level: 3 }),
            bullet: ed.isActive("bulletList"), ordered: ed.isActive("orderedList"), quote: ed.isActive("blockquote"),
            left: ed.isActive({ textAlign: "left" }), center: ed.isActive({ textAlign: "center" }),
            right: ed.isActive({ textAlign: "right" }), justify: ed.isActive({ textAlign: "justify" }),
            canUndo: ed.can().undo(), canRedo: ed.can().redo(),
          }
        : {},
  });

  if (!editor) return null;
  const run = () => editor.chain().focus();
  const insertSignature = (role) =>
    run().insertContent({ type: "paragraph", content: [{ type: "text", text: SIGNATURE_TOKENS[role] }] }).run();

  return (
    <div className="contract-editor">
      <style>{EDITOR_CSS}</style>
      <div
        style={{
          position: "sticky", top: 0, zIndex: 5, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 2, padding: 6,
          background: "#fff", border: `1px solid ${c.line}`, borderRadius: 10, marginBottom: 12,
        }}
      >
        <ToolButton label="Desfazer" onClick={() => run().undo().run()} disabled={!state.canUndo}><Undo2 size={15} /></ToolButton>
        <ToolButton label="Refazer" onClick={() => run().redo().run()} disabled={!state.canRedo}><Redo2 size={15} /></ToolButton>
        <Divider />
        <ToolButton label="Título 1" active={state.h1} onClick={() => run().toggleHeading({ level: 1 }).run()}><Heading1 size={16} /></ToolButton>
        <ToolButton label="Título 2" active={state.h2} onClick={() => run().toggleHeading({ level: 2 }).run()}><Heading2 size={16} /></ToolButton>
        <ToolButton label="Título 3" active={state.h3} onClick={() => run().toggleHeading({ level: 3 }).run()}><Heading3 size={16} /></ToolButton>
        <ToolButton label="Parágrafo" onClick={() => run().setParagraph().run()}><Pilcrow size={15} /></ToolButton>
        <Divider />
        <ToolButton label="Negrito" active={state.bold} onClick={() => run().toggleBold().run()}><Bold size={15} /></ToolButton>
        <ToolButton label="Itálico" active={state.italic} onClick={() => run().toggleItalic().run()}><Italic size={15} /></ToolButton>
        <ToolButton label="Sublinhado" active={state.underline} onClick={() => run().toggleUnderline().run()}><Underline size={15} /></ToolButton>
        <ToolButton label="Rasurado" active={state.strike} onClick={() => run().toggleStrike().run()}><Strikethrough size={15} /></ToolButton>
        <Divider />
        <ToolButton label="Lista" active={state.bullet} onClick={() => run().toggleBulletList().run()}><List size={16} /></ToolButton>
        <ToolButton label="Lista numerada" active={state.ordered} onClick={() => run().toggleOrderedList().run()}><ListOrdered size={16} /></ToolButton>
        <ToolButton label="Citação" active={state.quote} onClick={() => run().toggleBlockquote().run()}><Quote size={15} /></ToolButton>
        <ToolButton label="Linha separadora" onClick={() => run().setHorizontalRule().run()}><Minus size={16} /></ToolButton>
        <Divider />
        <ToolButton label="Alinhar à esquerda" active={state.left} onClick={() => run().setTextAlign("left").run()}><AlignLeft size={15} /></ToolButton>
        <ToolButton label="Centrar" active={state.center} onClick={() => run().setTextAlign("center").run()}><AlignCenter size={15} /></ToolButton>
        <ToolButton label="Alinhar à direita" active={state.right} onClick={() => run().setTextAlign("right").run()}><AlignRight size={15} /></ToolButton>
        <ToolButton label="Justificar" active={state.justify} onClick={() => run().setTextAlign("justify").run()}><AlignJustify size={15} /></ToolButton>
        <Divider />
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => insertSignature("agency")}
          style={{ ...sans, display: "flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600, color: c.boss, background: c.bossSoft, border: "none", borderRadius: 6, padding: "6px 10px", cursor: "pointer" }}
        >
          <PenLine size={13} /> Assinatura da agência
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => insertSignature("counterparty")}
          style={{ ...sans, display: "flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600, color: c.boss, background: c.bossSoft, border: "none", borderRadius: 6, padding: "6px 10px", cursor: "pointer" }}
        >
          <PenLine size={13} /> Assinatura do cliente
        </button>
      </div>

      <div style={{ background: c.paper, padding: "20px 12px", borderRadius: 12, overflowX: "auto" }}>
        <div
          className="contract-doc"
          style={{ background: "#fff", maxWidth: DOC_WIDTH_PX + 80, margin: "0 auto", padding: "40px 40px 48px", boxShadow: "0 1px 6px rgba(23,21,31,0.08)", borderRadius: 4, boxSizing: "border-box" }}
        >
          <EditorContent editor={editor} />
        </div>
      </div>
      <div style={{ ...sans, fontSize: 11.5, color: c.mist, marginTop: 8, lineHeight: 1.6 }}>
        Os marcadores <code>{SIGNATURE_TOKENS.agency}</code> e <code>{SIGNATURE_TOKENS.counterparty}</code> viram caixas de assinatura no documento. Se não os inserires, as caixas ficam no fim.
      </div>
    </div>
  );
}
