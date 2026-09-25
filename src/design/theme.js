import { useSyncExternalStore } from "react";

/* ---------------------------------------------------------
   TEMA CLARO / ESCURO
   "system" segue o computador ou o telemóvel; "light" e "dark" são
   escolhas manuais, guardadas neste navegador (só uma comodidade de
   quem vê: se o armazenamento falhar, segue o sistema).
   O atributo data-theme no <html> ativa os tokens de tokens.css; o
   index.html aplica a escolha antes de a página desenhar (sem clarão).
--------------------------------------------------------- */

const KEY = "bb-theme";
const EVENT = "bb-theme-change";
const DARK_QUERY = "(prefers-color-scheme: dark)";

export function getThemePref() {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

export function applyTheme(pref) {
  const root = document.documentElement;
  if (pref === "light" || pref === "dark") root.setAttribute("data-theme", pref);
  else root.removeAttribute("data-theme");
}

export function setThemePref(pref) {
  try {
    if (pref === "light" || pref === "dark") localStorage.setItem(KEY, pref);
    else localStorage.removeItem(KEY);
  } catch {
    // sem armazenamento: a escolha vale só nesta visita
  }
  applyTheme(pref);
  window.dispatchEvent(new Event(EVENT));
}

const subscribe = (cb) => {
  const media = window.matchMedia(DARK_QUERY);
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  media.addEventListener("change", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
    media.removeEventListener("change", cb);
  };
};

export function useThemePref() {
  return useSyncExternalStore(subscribe, getThemePref, () => "system");
}

// O que está mesmo a ser mostrado agora: lê o atributo data-theme do <html> (o que os
// estilos usam) e, sem ele, o sistema; acompanha qualquer mudança de um ou do outro.
const readIsDark = () => {
  const attr = document.documentElement.getAttribute("data-theme");
  if (attr === "dark") return true;
  if (attr === "light") return false;
  return window.matchMedia(DARK_QUERY).matches;
};
const subscribeDark = (cb) => {
  const media = window.matchMedia(DARK_QUERY);
  const observer = new MutationObserver(cb);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  media.addEventListener("change", cb);
  return () => {
    observer.disconnect();
    media.removeEventListener("change", cb);
  };
};
export function useIsDark() {
  return useSyncExternalStore(subscribeDark, readIsDark, () => false);
}
