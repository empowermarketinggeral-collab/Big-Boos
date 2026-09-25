// EMPOWER OS — "Assinar e enviar" um contrato.
//
// A equipa da agência assina (desenho + nome) e o contrato é enviado por
// email ao outro lado, que abre uma ligação pessoal (/assinar/<token>),
// lê e assina também. Esta função:
//   1. confirma que quem chama gere a agência do contrato;
//   2. congela o texto (SHA-256 de {título, corpo}) e regista a assinatura
//      da agência com data, IP e navegador;
//   3. cria o token do outro lado (256 bits, nunca devolvido ao browser);
//   4. envia o email (Resend). Se o email falhar, o contrato fica "enviado"
//      e a equipa usa "Reenviar email" — a assinatura da agência não se perde.
//   { contractId, resend: true } reenvia o email de um contrato já enviado.
//
// Precisa de "Verify JWT" LIGADO (chamada pela equipa, com login).
//
// SEGREDOS (Edge Function Secrets — Project Settings → Edge Functions):
//   RESEND_API_KEY        chave da conta Resend
//   CONTRACTS_FROM_EMAIL  remetente, ex: Empower Marketing <contratos@teudominio.pt>
//                         (o domínio tem de estar verificado no Resend)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

const escapeHtml = (v) => String(v ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const hashOfContract = (contract) => sha256Hex(JSON.stringify({ title: contract.title, body_html: contract.body_html }));

function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Só aceita PNG em data URL, com tamanho limitado (a assinatura desenhada).
function isValidSignatureImage(value) {
  if (typeof value !== "string" || value.length > 400_000) return false;
  if (!/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(value)) return false;
  try {
    const header = atob(value.slice("data:image/png;base64,".length, "data:image/png;base64,".length + 12));
    return header.startsWith("\x89PNG");
  } catch {
    return false;
  }
}

function resolveAppUrl(candidate, req) {
  for (const raw of [candidate, req.headers.get("origin")]) {
    if (!raw) continue;
    try {
      const url = new URL(raw);
      if (url.protocol === "https:" || url.protocol === "http:") return url.origin;
    } catch {
      // tenta o seguinte
    }
  }
  return null;
}

async function sendEmail({ to, subject, html, replyTo }) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("CONTRACTS_FROM_EMAIL");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject, html, ...(replyTo ? { reply_to: replyTo } : {}) }),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, error: res.ok ? null : data?.message || data?.error || "Falha ao enviar o email." };
}

function requestEmailHtml({ agencyName, contractTitle, counterpartyName, link }) {
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#17151F;line-height:1.55">
  <p>Olá${counterpartyName ? ` ${escapeHtml(counterpartyName)}` : ""},</p>
  <p><strong>${escapeHtml(agencyName)}</strong> enviou-lhe o contrato <strong>«${escapeHtml(contractTitle)}»</strong> para leitura e assinatura.</p>
  <p style="margin:28px 0"><a href="${escapeHtml(link)}" style="background:#7C4DE0;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;display:inline-block">Ler e assinar o contrato</a></p>
  <p style="font-size:13px;color:#6E6980">Se o botão não funcionar, copie esta ligação para o navegador:<br><span style="word-break:break-all">${escapeHtml(link)}</span></p>
  <p style="font-size:12px;color:#9691A6">Esta ligação é pessoal — não a partilhe. Depois de assinar, poderá descarregar o contrato em PDF na mesma página.</p>
</div>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Sem sessão." }, 401);

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Corpo do pedido inválido." }, 400);
  }
  const { contractId, signerName, signatureImage, appUrl, resend } = body;
  if (!contractId) return json({ error: "Falta o contrato." }, 400);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY"), { global: { headers: { Authorization: authHeader } } });
  const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));

  const { data: userData } = await userClient.auth.getUser();
  const user = userData?.user;
  if (!user) return json({ error: "Sem sessão." }, 401);

  // O contrato só é visível a quem tem acesso (RLS); depois confirma-se
  // que é da equipa — o cliente da marca também lê contratos enviados.
  const { data: contract } = await userClient.from("contracts").select("*").eq("id", contractId).maybeSingle();
  if (!contract) return json({ error: "Contrato não encontrado." }, 404);
  const { data: canManage } = await userClient.rpc("can_manage_agency", { target_agency: contract.agency_id });
  if (canManage !== true) return json({ error: "Sem permissão para enviar este contrato." }, 403);

  if (!Deno.env.get("RESEND_API_KEY") || !Deno.env.get("CONTRACTS_FROM_EMAIL")) {
    return json({ error: "O envio de contratos ainda não está configurado (faltam os segredos RESEND_API_KEY e CONTRACTS_FROM_EMAIL nas Edge Functions)." }, 500);
  }

  const { data: agency } = await admin.from("agencies").select("name").eq("id", contract.agency_id).maybeSingle();
  const agencyName = agency?.name || "A agência";

  // --------------------------------------------------------- reenvio
  if (resend) {
    if (contract.status !== "sent") return json({ error: "Só se pode reenviar um contrato que aguarda assinatura." }, 409);
    const { data: signer } = await admin.from("contract_signers").select("token, email, name, signed_at").eq("contract_id", contract.id).eq("role", "counterparty").maybeSingle();
    if (!signer?.token || signer.signed_at) return json({ error: "Este contrato já não aguarda assinatura." }, 409);
    const origin = resolveAppUrl(contract.app_url || appUrl, req);
    if (!origin) return json({ error: "Não foi possível determinar o endereço da aplicação." }, 400);
    const result = await sendEmail({
      to: signer.email,
      subject: `Lembrete: contrato «${contract.title}» para assinar`,
      html: requestEmailHtml({ agencyName, contractTitle: contract.title, counterpartyName: signer.name, link: `${origin}/assinar/${signer.token}` }),
      replyTo: user.email,
    });
    if (!result.ok) return json({ error: result.error }, 502);
    return json({ ok: true, emailSent: true });
  }

  // --------------------------------------------------------- primeiro envio
  if (contract.status !== "draft") return json({ error: "Este contrato já foi enviado." }, 409);

  const name = String(signerName ?? "").trim();
  if (name.length < 2 || name.length > 120) return json({ error: "Indica o nome de quem assina pela agência." }, 400);
  if (!isValidSignatureImage(signatureImage)) return json({ error: "A assinatura é inválida — desenha-a de novo." }, 400);
  const counterpartyEmail = String(contract.counterparty_email ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(counterpartyEmail)) return json({ error: "Falta o email do outro lado." }, 400);
  if (!String(contract.counterparty_name ?? "").trim()) return json({ error: "Falta o nome do outro lado." }, 400);
  if (!String(contract.title ?? "").trim()) return json({ error: "Falta o título do contrato." }, 400);
  if (String(contract.body_html ?? "").replace(/<[^>]*>/g, "").trim().length < 20) return json({ error: "O contrato está vazio." }, 400);
  const origin = resolveAppUrl(appUrl, req);
  if (!origin) return json({ error: "Não foi possível determinar o endereço da aplicação." }, 400);

  const bodyHash = await hashOfContract(contract);
  const now = new Date().toISOString();
  const ip = req.headers.get("cf-connecting-ip") || (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || null;
  const userAgent = (req.headers.get("user-agent") || "").slice(0, 300) || null;

  // Reserva o envio (só um pedido consegue passar de rascunho a enviado).
  const { data: claimed } = await admin
    .from("contracts")
    .update({ status: "sent", body_hash: bodyHash, sent_at: now, agency_signed_at: now, app_url: origin })
    .eq("id", contract.id)
    .eq("status", "draft")
    .select("id");
  if (!claimed || claimed.length === 0) return json({ error: "Este contrato já foi enviado." }, 409);

  const token = randomToken();
  const { error: signersError } = await admin.from("contract_signers").upsert(
    [
      {
        contract_id: contract.id, role: "agency", name, email: user.email || null,
        signature_image: signatureImage, signed_at: now, signed_ip: ip, signed_user_agent: userAgent, signed_body_hash: bodyHash,
      },
      { contract_id: contract.id, role: "counterparty", name: String(contract.counterparty_name).trim(), email: counterpartyEmail, token },
    ],
    { onConflict: "contract_id,role" }
  );
  if (signersError) {
    await admin.from("contracts").update({ status: "draft", body_hash: null, sent_at: null, agency_signed_at: null, app_url: null }).eq("id", contract.id);
    return json({ error: "Não foi possível registar as assinaturas. Tenta de novo." }, 500);
  }

  const result = await sendEmail({
    to: counterpartyEmail,
    subject: `Contrato «${contract.title}» para assinar`,
    html: requestEmailHtml({ agencyName, contractTitle: contract.title, counterpartyName: contract.counterparty_name, link: `${origin}/assinar/${token}` }),
    replyTo: user.email,
  });
  if (!result.ok) console.error("contract-send: falha no email", { contractId: contract.id, error: result.error });

  return json({ ok: true, emailSent: result.ok, ...(result.ok ? {} : { emailError: result.error }) });
});
