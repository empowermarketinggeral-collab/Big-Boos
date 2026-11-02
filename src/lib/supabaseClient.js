import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Faltam VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY no .env.local"
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// O Supabase devolve no máximo 1000 linhas por pedido. Isto vai buscando
// página a página até ao fim. build() tem de devolver a query já ordenada
// por uma coluna única (para as páginas não se sobreporem).
export async function fetchAll(build, pageSize = 1000) {
  const out = [];
  for (let from = 0; from < 500000; from += pageSize) {
    const { data, error } = await build().range(from, from + pageSize - 1);
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  return out;
}

// supabase.functions.invoke() só devolve "Edge Function returned a
// non-2xx status code" quando a função falha — o corpo real do erro
// (o que a nossa função escreveu com json({ error: "..." }, status))
// fica escondido em error.context (a Response em si). Isto vai lá
// buscar a mensagem verdadeira sempre que existir.
export async function invokeFunction(name, body) {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    let message = error.message;
    try {
      const parsed = await error.context.json();
      if (parsed?.error) message = parsed.error;
    } catch {
      // resposta sem corpo JSON legível — fica a mensagem genérica
    }
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}
