import { useCallback, useEffect, useState } from "react";

/* ---------------------------------------------------------
   ESTADO NO ENDEREÇO (?v=marcas&marca=<id>&m=agendamento&aba=agenda)
   A navegação do Big Boss (secção, marca aberta, módulo da marca e o
   separador dentro do módulo) fica no URL. Assim um refresh mantém a
   pessoa onde estava, o link pode ser partilhado com a equipa e o botão
   "Voltar" do browser funciona.
--------------------------------------------------------- */

export const getParam = (key) => new URLSearchParams(window.location.search).get(key);

// Muda vários parâmetros de uma vez (null/"" apaga). push = nova entrada no
// histórico (para o "Voltar"); senão substitui a atual.
export function setParams(patch, { push = false } = {}) {
  const url = new URL(window.location.href);
  for (const [key, value] of Object.entries(patch)) {
    if (value == null || value === "") url.searchParams.delete(key);
    else url.searchParams.set(key, String(value));
  }
  const next = `${url.pathname}${url.search}${url.hash}`;
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (next === current) return;
  window.history[push ? "pushState" : "replaceState"](window.history.state, "", next);
}

// Como useState, mas o valor vive no parâmetro `key` do URL. O valor por
// omissão não se escreve (o endereço fica limpo).
export function useUrlState(key, defaultValue) {
  const [value, setValue] = useState(() => getParam(key) || defaultValue);

  useEffect(() => {
    const onPop = () => setValue(getParam(key) || defaultValue);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [key, defaultValue]);

  const update = useCallback((next) => {
    setValue((prev) => {
      const resolved = typeof next === "function" ? next(prev) : next;
      setParams({ [key]: resolved === defaultValue ? null : resolved });
      return resolved;
    });
  }, [key, defaultValue]);

  return [value, update];
}
