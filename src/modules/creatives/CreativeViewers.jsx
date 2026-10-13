import { useEffect, useRef, useState } from "react";
import { ExternalLink, RotateCw, Columns2, X, Check, ChevronLeft, ChevronRight, MessageSquare } from "lucide-react";
import { c, sans, serif, btnGhost } from "../../shared/theme.jsx";
import { safeHttpUrl, isVideoPath, galleryPieces, pieceLabel } from "./creativesKinds.js";

/* ---------------------------------------------------------
   VISTAS DE CADA TIPO DE TRABALHO
   Usadas pela equipa (CreativesModule) e pelo cliente (página pública).
   Recebem o conteúdo de uma versão e o mapa caminho → URL assinado.
--------------------------------------------------------- */

const prefersReducedMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

function Placeholder({ children, style }) {
  return (
    <div style={{ ...sans, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", color: c.mist, fontSize: 13.5, background: c.folha2, border: `1px dashed ${c.lineStrong}`, borderRadius: 6, padding: 12, ...style }}>
      {children}
    </div>
  );
}

export function Lightbox({ src, alt, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div onClick={onClose} role="dialog" aria-label="Imagem ampliada" style={{ position: "fixed", inset: 0, background: "rgba(8,5,14,0.88)", zIndex: 80, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <button onClick={onClose} aria-label="Fechar" style={{ position: "absolute", top: 16, right: 16, background: "rgba(255,255,255,0.12)", border: "none", color: "#fff", borderRadius: 999, width: 40, height: 40, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <X size={20} />
      </button>
      <img src={src} alt={alt || ""} onClick={(e) => e.stopPropagation()} style={{ maxWidth: "94vw", maxHeight: "90vh", objectFit: "contain", background: "#fff", borderRadius: 4 }} />
    </div>
  );
}

// Imagem que abre ampliada ao clicar.
function ZoomImg({ src, alt, style }) {
  const [open, setOpen] = useState(false);
  if (!src) return <Placeholder style={{ minHeight: 120, ...style }}>A carregar…</Placeholder>;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label={`Ampliar ${alt}`} style={{ padding: 0, border: "none", background: "none", cursor: "zoom-in", display: "block", width: "100%" }}>
        <img src={src} alt={alt} style={{ display: "block", width: "100%", ...style }} />
      </button>
      {open && <Lightbox src={src} alt={alt} onClose={() => setOpen(false)} />}
    </>
  );
}

/* ---------- Cartão de visita: frente e verso ---------- */
function CardFace({ src, label, back, flipped }) {
  const hidden = back ? !flipped : flipped;
  return (
    <div
      aria-hidden={hidden}
      style={{ position: "absolute", inset: 0, backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden", transform: back ? "rotateY(180deg)" : "none", background: "#fff", borderRadius: 8, boxShadow: "0 10px 30px rgba(20,12,32,0.28)", outline: "1px solid rgba(128,128,128,0.35)", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}
    >
      {src ? <img src={src} alt={label} style={{ width: "100%", height: "100%", objectFit: "contain" }} /> : <span style={{ ...sans, fontSize: 13.5, color: "#6C627D" }}>Sem {label.toLowerCase()}</span>}
    </div>
  );
}

function CardViewer({ content, urls }) {
  const [flipped, setFlipped] = useState(false);
  const [sideBySide, setSideBySide] = useState(false);
  const front = content.front ? urls[content.front] : null;
  const back = content.back ? urls[content.back] : null;
  const stage = { width: "100%", maxWidth: 520, aspectRatio: "85 / 55", position: "relative" };
  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        {!sideBySide && (
          <button type="button" onClick={() => setFlipped((v) => !v)} style={btnGhost}>
            <RotateCw size={14} /> Virar ({flipped ? "ver frente" : "ver verso"})
          </button>
        )}
        <button type="button" onClick={() => setSideBySide((v) => !v)} aria-pressed={sideBySide} style={{ ...btnGhost, ...(sideBySide ? { background: c.bossSoft, border: `1px solid ${c.boss}` } : {}) }}>
          <Columns2 size={14} /> Frente e verso lado a lado
        </button>
      </div>
      {sideBySide ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 24 }}>
          {[["Frente", front], ["Verso", back]].map(([label, src]) => (
            <div key={label}>
              <div style={{ ...sans, fontSize: 12.5, fontWeight: 700, color: c.mist, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
              <div style={{ ...stage, background: "#fff", borderRadius: 8, boxShadow: "0 10px 30px rgba(20,12,32,0.22)", outline: "1px solid rgba(128,128,128,0.35)", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {src ? <img src={src} alt={label} style={{ width: "100%", height: "100%", objectFit: "contain" }} /> : <span style={{ ...sans, fontSize: 13.5, color: "#6C627D" }}>Sem {label.toLowerCase()}</span>}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ padding: "22px 0", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
          <button
            type="button"
            onClick={() => setFlipped((v) => !v)}
            aria-label={`Virar o cartão (agora a mostrar ${flipped ? "o verso" : "a frente"})`}
            style={{ ...stage, padding: 0, border: "none", background: "none", cursor: "pointer", perspective: 1400 }}
          >
            <div style={{ position: "absolute", inset: 0, transformStyle: "preserve-3d", transition: prefersReducedMotion() ? "none" : "transform 0.6s ease", transform: flipped ? "rotateY(180deg)" : "none" }}>
              <CardFace src={front} label="Frente" flipped={flipped} />
              <CardFace src={back} label="Verso" back flipped={flipped} />
            </div>
          </button>
          <div style={{ ...sans, fontSize: 13, color: c.mist }}>{flipped ? "Verso" : "Frente"}, clica no cartão para virar</div>
        </div>
      )}
    </div>
  );
}

/* ---------- Landing page: computador e telemóvel ---------- */
function LandingViewer({ content, urls }) {
  const desktop = content.desktop ? urls[content.desktop] : null;
  const mobile = content.mobile ? urls[content.mobile] : null;
  const [device, setDevice] = useState(content.desktop || !content.mobile ? "desktop" : "mobile");
  const live = safeHttpUrl(content.url);
  const tab = (key, label) => (
    <button type="button" key={key} onClick={() => setDevice(key)} aria-pressed={device === key} style={{ ...btnGhost, ...(device === key ? { background: c.bossSoft, border: `1px solid ${c.boss}` } : {}) }}>{label}</button>
  );
  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        {tab("desktop", "Computador")}
        {tab("mobile", "Telemóvel")}
        {live && (
          <a href={live} target="_blank" rel="noopener noreferrer" style={{ ...btnGhost, textDecoration: "none" }}>
            <ExternalLink size={14} /> Abrir página ao vivo
          </a>
        )}
      </div>
      {device === "desktop" ? (
        <div style={{ border: `1px solid ${c.lineStrong}`, borderRadius: 10, overflow: "hidden", background: "#fff", boxShadow: "0 10px 30px rgba(20,12,32,0.18)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 12px", background: "#EDEAF2", borderBottom: "1px solid #D9D3E3" }} aria-hidden="true">
            {["#E5736B", "#E8B64C", "#6FBF73"].map((col) => <span key={col} style={{ width: 10, height: 10, borderRadius: 999, background: col }} />)}
            <span style={{ ...sans, marginLeft: 10, flex: 1, fontSize: 12, color: "#6C627D", background: "#fff", borderRadius: 999, padding: "3px 12px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{live ? new URL(live).host : "a-tua-pagina.pt"}</span>
          </div>
          <div style={{ maxHeight: 620, overflowY: "auto" }}>
            {desktop ? <img src={desktop} alt="Landing page em computador" style={{ display: "block", width: "100%" }} /> : <Placeholder style={{ margin: 16, minHeight: 200 }}>Sem pré-visualização para computador.</Placeholder>}
          </div>
        </div>
      ) : (
        <div style={{ width: "100%", maxWidth: 330, margin: "0 auto", border: "10px solid #17151F", borderRadius: 38, overflow: "hidden", background: "#fff", boxShadow: "0 10px 30px rgba(20,12,32,0.28)" }}>
          <div style={{ maxHeight: 600, overflowY: "auto" }}>
            {mobile ? <img src={mobile} alt="Landing page em telemóvel" style={{ display: "block", width: "100%" }} /> : <Placeholder style={{ margin: 12, minHeight: 240 }}>Sem pré-visualização para telemóvel.</Placeholder>}
          </div>
        </div>
      )}
      <div style={{ ...sans, fontSize: 12.5, color: c.mist, marginTop: 10, textAlign: "center" }}>Desliza dentro da moldura para ver a página toda.</div>
    </div>
  );
}

/* ---------- Identidade visual ---------- */
function SectionTitle({ children }) {
  return <h3 style={{ ...serif, fontSize: 16, fontWeight: 500, color: c.ink, margin: "0 0 12px" }}>{children}</h3>;
}

function Swatch({ color }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(color.hex);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch { /* sem permissão para a área de transferência: o valor está visível na mesma */ }
  };
  return (
    <button type="button" onClick={copy} aria-label={`Copiar ${color.hex}`} style={{ padding: 0, border: `1px solid ${c.line}`, borderRadius: 8, overflow: "hidden", background: c.folha, cursor: "pointer", textAlign: "left" }}>
      <div style={{ height: 64, background: color.hex }} />
      <div style={{ padding: "8px 10px" }}>
        <div style={{ ...sans, fontSize: 13.5, fontWeight: 700, color: c.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{color.name || "Cor"}</div>
        <div style={{ ...sans, fontSize: 12.5, color: c.mist, display: "flex", alignItems: "center", gap: 4 }}>{copied ? <><Check size={12} /> Copiado</> : color.hex.toUpperCase()}</div>
      </div>
    </button>
  );
}

function IdentityViewer({ content, urls }) {
  const logo = content.logo ? urls[content.logo] : null;
  const colors = content.colors || [];
  const fonts = content.fonts || [];
  const apps = content.applications || [];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      <section>
        <SectionTitle>Logótipo</SectionTitle>
        {logo ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
            {[["#FFFFFF", "Sobre claro"], ["#17151F", "Sobre escuro"]].map(([bg, label]) => (
              <div key={bg} style={{ background: bg, border: `1px solid ${c.line}`, borderRadius: 8, padding: 24, display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
                <img src={logo} alt={`Logótipo ${label.toLowerCase()}`} style={{ maxWidth: "100%", maxHeight: 160, objectFit: "contain" }} />
                <span style={{ ...sans, fontSize: 12, color: bg === "#FFFFFF" ? "#6C627D" : "#B9B2C9" }}>{label}</span>
              </div>
            ))}
          </div>
        ) : <Placeholder style={{ minHeight: 100 }}>{content.logo ? "A carregar…" : "Sem logótipo nesta versão."}</Placeholder>}
      </section>

      {colors.length > 0 && (
        <section>
          <SectionTitle>Paleta de cores</SectionTitle>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 10 }}>
            {colors.map((col, i) => <Swatch key={`${col.hex}-${i}`} color={col} />)}
          </div>
        </section>
      )}

      {fonts.length > 0 && (
        <section>
          <SectionTitle>Tipografias</SectionTitle>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
            {fonts.map((f, i) => (
              <div key={`${f.name}-${i}`} style={{ border: `1px solid ${c.line}`, borderRadius: 8, padding: "14px 16px", background: c.folha }}>
                <div style={{ fontFamily: `"${String(f.name).replace(/"/g, "")}", var(--bb-font-corpo)`, fontSize: 38, lineHeight: 1.1, color: c.ink }} aria-hidden="true">Aa</div>
                <div style={{ ...sans, fontSize: 14.5, fontWeight: 700, color: c.ink, marginTop: 8 }}>{f.name}</div>
                {f.role && <div style={{ ...sans, fontSize: 12.5, color: c.mist }}>{f.role}</div>}
              </div>
            ))}
          </div>
        </section>
      )}

      {apps.length > 0 && (
        <section>
          <SectionTitle>Aplicações</SectionTitle>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
            {apps.map((p, i) => <ZoomImg key={p} src={urls[p]} alt={`Aplicação ${i + 1}`} style={{ borderRadius: 6, border: `1px solid ${c.line}` }} />)}
          </div>
        </section>
      )}
    </div>
  );
}

/* ---------- Galeria (redes sociais / outro): peças, carrosséis e vídeos ---------- */
// Botão "Comentar" por cima de cada imagem (só aparece quando há onComment).
function CommentChip({ path, label, count, onComment }) {
  if (!onComment) return null;
  return (
    <button
      type="button" onClick={() => onComment(path)} aria-label={`Comentar ${label}${count ? ` (${count} comentários)` : ""}`}
      style={{ ...sans, position: "absolute", right: 8, bottom: 8, display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12.5, fontWeight: 700, color: "#fff", background: "rgba(23,21,31,0.82)", border: "none", borderRadius: 999, padding: "5px 10px", cursor: "pointer" }}
    >
      <MessageSquare size={13} /> {count ? count : "Comentar"}
    </button>
  );
}

function Media({ path, url, label, fill }) {
  if (!url) return <Placeholder style={{ minHeight: 160, height: fill ? "100%" : undefined }}>A carregar…</Placeholder>;
  if (isVideoPath(path)) {
    return <video src={url} controls playsInline preload="metadata" aria-label={label} style={{ display: "block", width: "100%", height: fill ? "100%" : undefined, objectFit: "contain", background: "#000" }} />;
  }
  return fill
    ? <img src={url} alt={label} style={{ display: "block", width: "100%", height: "100%", objectFit: "contain" }} />
    : <ZoomImg src={url} alt={label} />;
}

function CarouselViewer({ piece, index, urls, counts, onComment }) {
  const track = useRef(null);
  const [at, setAt] = useState(0);
  const [zoom, setZoom] = useState(null);
  const total = piece.paths.length;
  const go = (i) => {
    const el = track.current;
    if (!el) return;
    const next = Math.max(0, Math.min(total - 1, i));
    el.scrollTo({ left: next * el.clientWidth, behavior: prefersReducedMotion() ? "auto" : "smooth" });
  };
  const onScroll = () => {
    const el = track.current;
    if (el && el.clientWidth) setAt(Math.round(el.scrollLeft / el.clientWidth));
  };
  const nav = { position: "absolute", top: "50%", transform: "translateY(-50%)", width: 36, height: 36, borderRadius: 999, border: "none", background: "rgba(23,21,31,0.72)", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 };
  return (
    <div>
      <div style={{ position: "relative", border: `1px solid ${c.line}`, borderRadius: 6, overflow: "hidden", background: c.folha2 }}>
        <div ref={track} onScroll={onScroll} style={{ display: "flex", overflowX: "auto", scrollSnapType: "x mandatory", scrollbarWidth: "none", aspectRatio: "4 / 5" }}>
          {piece.paths.map((p, i) => {
            const label = `Carrossel ${index + 1}, imagem ${i + 1}`;
            return (
              <div key={p} style={{ position: "relative", flex: "0 0 100%", scrollSnapAlign: "start", height: "100%" }}>
                {isVideoPath(p) || !urls[p] ? <Media path={p} url={urls[p]} label={label} fill /> : (
                  <button type="button" onClick={() => setZoom(p)} aria-label={`Ampliar ${label}`} style={{ padding: 0, border: "none", background: "none", cursor: "zoom-in", display: "block", width: "100%", height: "100%" }}>
                    <img src={urls[p]} alt={label} style={{ display: "block", width: "100%", height: "100%", objectFit: "contain" }} />
                  </button>
                )}
                <CommentChip path={p} label={label} count={counts[p]} onComment={onComment} />
              </div>
            );
          })}
        </div>
        {at > 0 && <button type="button" onClick={() => go(at - 1)} aria-label="Imagem anterior" style={{ ...nav, left: 8 }}><ChevronLeft size={18} /></button>}
        {at < total - 1 && <button type="button" onClick={() => go(at + 1)} aria-label="Imagem seguinte" style={{ ...nav, right: 8 }}><ChevronRight size={18} /></button>}
        <span style={{ ...sans, position: "absolute", top: 8, right: 8, fontSize: 12.5, fontWeight: 700, color: "#fff", background: "rgba(23,21,31,0.72)", borderRadius: 999, padding: "2px 9px" }}>{at + 1}/{total}</span>
      </div>
      <div style={{ display: "flex", justifyContent: "center", gap: 6, marginTop: 8 }} aria-hidden="true">
        {piece.paths.map((p, i) => (
          <button key={p} type="button" tabIndex={-1} onClick={() => go(i)} style={{ width: 7, height: 7, borderRadius: 999, border: "none", padding: 0, cursor: "pointer", background: i === at ? c.bossText : c.lineStrong }} />
        ))}
      </div>
      {zoom && urls[zoom] && <Lightbox src={urls[zoom]} alt="" onClose={() => setZoom(null)} />}
    </div>
  );
}

function GalleryViewer({ content, urls, comments = [], onComment }) {
  const pieces = galleryPieces(content);
  if (!pieces.length) return <Placeholder style={{ minHeight: 120 }}>Sem imagens nem vídeos nesta versão.</Placeholder>;
  const counts = {};
  for (const cm of comments) if (cm.target) counts[cm.target] = (counts[cm.target] || 0) + 1;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 280px), 1fr))", gap: 16, alignItems: "start" }}>
      {pieces.map((piece, i) => {
        const label = `${pieceLabel(piece)} ${i + 1}`;
        return (
          <figure key={piece.id} style={{ margin: 0 }}>
            {piece.type === "carousel" ? (
              <CarouselViewer piece={piece} index={i} urls={urls} counts={counts} onComment={onComment} />
            ) : (
              <div style={{ position: "relative", border: `1px solid ${c.line}`, borderRadius: 6, overflow: "hidden" }}>
                <Media path={piece.paths[0]} url={urls[piece.paths[0]]} label={label} />
                <CommentChip path={piece.paths[0]} label={label} count={counts[piece.paths[0]]} onComment={onComment} />
              </div>
            )}
            <figcaption style={{ ...sans, fontSize: 12.5, color: c.mist, marginTop: 6 }}>
              {label}{piece.type === "carousel" ? ` (${piece.paths.length} imagens, desliza para ver)` : ""}
            </figcaption>
          </figure>
        );
      })}
    </div>
  );
}

// comments/onComment: só a galeria usa (comentar cada imagem, também dentro de um carrossel).
export default function VersionViewer({ kind, content, urls, comments, onComment }) {
  const data = content || {};
  if (kind === "business_card") return <CardViewer content={data} urls={urls} />;
  if (kind === "landing_page") return <LandingViewer content={data} urls={urls} />;
  if (kind === "brand_identity") return <IdentityViewer content={data} urls={urls} />;
  return <GalleryViewer content={data} urls={urls} comments={comments} onComment={onComment} />;
}
