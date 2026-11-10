import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient.js";
import { c, sans, btnGhost } from "./theme.jsx";

/* ---------------------------------------------------------
   AVISOS NO TELEMÓVEL (Web Push, migração 105)
   Cada aparelho ativa por si. O service worker (public/sw.js) mostra a
   notificação e, ao tocar, abre o WhatsApp da marca. No iPhone só funciona
   com o Big Boss instalado no ecrã principal (iOS 16.4 ou mais recente).
--------------------------------------------------------- */

const ENDPOINT = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/push-notify`;

function b64uToBytes(str) {
  const s = String(str).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(s + "===".slice((s.length + 3) % 4));
  return Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
}
function bytesToB64u(buf) {
  if (!buf) return "";
  let s = "";
  new Uint8Array(buf).forEach((b) => { s += String.fromCharCode(b); });
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const supported = () => typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent || "");
const isStandalone = () => window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true;

async function saveSubscription(sub) {
  const keys = sub.toJSON().keys || {};
  const { error } = await supabase.rpc("push_subscribe", {
    p_endpoint: sub.endpoint, p_p256dh: keys.p256dh, p_auth: keys.auth, p_user_agent: navigator.userAgent,
  });
  if (error) throw new Error(error.message);
}

export default function PushToggle() {
  const [state, setState] = useState("loading"); // loading | off | on | denied | unsupported | ios-install
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!supported()) { if (alive) setState(isIos() && !isStandalone() ? "ios-install" : "unsupported"); return; }
      if (Notification.permission === "denied") { if (alive) setState("denied"); return; }
      try {
        const reg = await navigator.serviceWorker.getRegistration("/");
        const sub = reg ? await reg.pushManager.getSubscription() : null;
        if (sub && Notification.permission === "granted") {
          navigator.serviceWorker.register("/sw.js").catch(() => {});
          // Mantém o aparelho ligado a quem tem a sessão aberta agora.
          saveSubscription(sub).catch(() => {});
          if (alive) setState("on");
        } else if (alive) setState("off");
      } catch {
        if (alive) setState("off");
      }
    })();
    return () => { alive = false; };
  }, []);

  const enable = async () => {
    setBusy(true); setError("");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") { setState(permission === "denied" ? "denied" : "off"); return; }
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const res = await fetch(ENDPOINT);
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.publicKey) throw new Error(data.error || "A função push-notify não respondeu.");
      let sub = await reg.pushManager.getSubscription();
      if (sub && bytesToB64u(sub.options?.applicationServerKey) !== data.publicKey) {
        await sub.unsubscribe().catch(() => {});
        sub = null;
      }
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uToBytes(data.publicKey) });
      await saveSubscription(sub);
      setState("on");
    } catch (e) {
      setError(e?.message || "Não foi possível ativar.");
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true); setError("");
    try {
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      if (sub) {
        await supabase.rpc("push_unsubscribe", { p_endpoint: sub.endpoint });
        await sub.unsubscribe().catch(() => {});
      }
      setState("off");
    } catch (e) {
      setError(e?.message || "Não foi possível desligar.");
    } finally {
      setBusy(false);
    }
  };

  if (state === "loading") return null;

  const text = {
    on: "Avisos de WhatsApp neste aparelho: ligados.",
    off: "Receba um aviso neste aparelho quando chegar uma mensagem de WhatsApp.",
    denied: "As notificações estão bloqueadas neste browser. Permita-as nas definições do site e volte aqui.",
    unsupported: "Este browser não mostra notificações.",
    "ios-install": "No iPhone: toque em Partilhar, \"Adicionar ao ecrã principal\", abra o Big Boss a partir do ícone e ative aqui os avisos.",
  }[state];

  return (
    <div style={{ padding: "10px 16px", borderBottom: `1px solid ${c.line}`, display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ ...sans, fontSize: 13, color: c.mist, lineHeight: 1.45 }}>{text}</div>
      {(state === "off" || state === "on") && (
        <button
          onClick={state === "on" ? disable : enable}
          disabled={busy}
          style={{ ...btnGhost, padding: "6px 12px", fontSize: 13, alignSelf: "flex-start" }}
        >
          {busy ? "Um momento…" : state === "on" ? "Desligar avisos" : "Ativar avisos"}
        </button>
      )}
      {error && <div style={{ ...sans, fontSize: 12.5, color: c.rose }}>{error}</div>}
    </div>
  );
}
