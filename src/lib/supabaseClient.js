import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Faltam VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY no .env.local"
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

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
