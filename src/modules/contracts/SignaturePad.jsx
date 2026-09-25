import { useRef, useState, useEffect, useCallback } from "react";
import { c, sans } from "../../shared/theme.jsx";
import { Eraser } from "lucide-react";

/* ---------------------------------------------------------
   ASSINATURA DESENHADA — canvas com rato, toque ou caneta. Devolve um
   PNG transparente (data URL) por onChange, ou null se estiver vazio.
   Resolução interna fixa (600×200) para o ficheiro ser pequeno e igual
   em qualquer ecrã; o canvas escala por CSS.
--------------------------------------------------------- */

const W = 600;
const H = 200;

export default function SignaturePad({ onChange, disabled = false }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const last = useRef(null);
  const [hasInk, setHasInk] = useState(false);

  const setupContext = useCallback(() => {
    const ctx = canvasRef.current.getContext("2d");
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#17151F";
    return ctx;
  }, []);

  useEffect(() => {
    setupContext();
  }, [setupContext]);

  const pointFrom = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return { x: ((e.clientX - rect.left) / rect.width) * W, y: ((e.clientY - rect.top) / rect.height) * H };
  };

  const start = (e) => {
    if (disabled) return;
    e.preventDefault();
    canvasRef.current.setPointerCapture?.(e.pointerId);
    drawing.current = true;
    last.current = pointFrom(e);
    // um toque sem arrastar deixa um ponto
    const ctx = setupContext();
    ctx.beginPath();
    ctx.arc(last.current.x, last.current.y, 1.5, 0, Math.PI * 2);
    ctx.fillStyle = "#17151F";
    ctx.fill();
  };

  const move = (e) => {
    if (!drawing.current) return;
    e.preventDefault();
    const ctx = setupContext();
    const p = pointFrom(e);
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
  };

  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    setHasInk(true);
    onChange?.(canvasRef.current.toDataURL("image/png"));
  };

  const clear = () => {
    const canvas = canvasRef.current;
    canvas.getContext("2d").clearRect(0, 0, W, H);
    setHasInk(false);
    onChange?.(null);
  };

  return (
    <div>
      <div style={{ position: "relative", border: `1.5px dashed ${c.line}`, borderRadius: 10, background: "#fff", overflow: "hidden" }}>
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
          onPointerLeave={end}
          style={{ display: "block", width: "100%", aspectRatio: `${W} / ${H}`, touchAction: "none", cursor: disabled ? "not-allowed" : "crosshair" }}
        />
        {!hasInk && (
          <div style={{ ...sans, position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#6C627D", fontSize: 14, pointerEvents: "none" }}>
            Desenha a tua assinatura aqui
          </div>
        )}
        <div style={{ position: "absolute", left: 16, right: 16, bottom: 34, borderTop: `1px solid ${c.line}`, pointerEvents: "none" }} />
      </div>
      <button
        type="button"
        onClick={clear}
        disabled={!hasInk || disabled}
        style={{ ...sans, display: "flex", alignItems: "center", gap: 5, marginTop: 8, fontSize: 12, color: hasInk ? c.mist : c.mistLight, background: "none", border: "none", cursor: hasInk ? "pointer" : "default", padding: 0 }}
      >
        <Eraser size={13} /> Limpar
      </button>
    </div>
  );
}
