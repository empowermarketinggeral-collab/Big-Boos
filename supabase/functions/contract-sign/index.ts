// EMPOWER OS — página pública de assinatura de contratos.
//
// Chamada SEM login pela página /assinar/<token>, aberta a partir do
// email enviado pelo contract-send. O token (256 bits, pessoal) é a única
// credencial. Ações:
//   { action: "view", token }                       lê o contrato
//   { action: "sign", token, name, signatureImage, agree: true }
//
// Só devolve o que o outro lado precisa de ver (o contrato, o estado e as
// assinaturas). Antes de gravar a assinatura confirma que o texto não foi
// alterado desde que a agência o assinou (SHA-256).
//
// Precisa de "Verify JWT" DESLIGADO — a segurança vem do token.
// Usa os mesmos segredos do contract-send para os emails de conclusão
// (RESEND_API_KEY, CONTRACTS_FROM_EMAIL); sem eles a assinatura grava na
// mesma, só não sai o email de confirmação.

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

async function sendEmail({ to, subject, html }) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("CONTRACTS_FROM_EMAIL");
  if (!apiKey || !from || !to) return;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, subject, html }),
    });
    if (!res.ok) console.error("contract-sign: falha no email", await res.text());
  } catch (err) {
    console.error("contract-sign: falha no email", String(err?.message || err));
  }
}

function completedEmailHtml({ contractTitle, signerName, link, linkLabel }) {
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#17151F;line-height:1.55">
  <p>O contrato <strong>«${escapeHtml(contractTitle)}»</strong> foi assinado por ambas as partes${signerName ? ` (última assinatura: ${escapeHtml(signerName)})` : ""}.</p>
  <p style="margin:28px 0"><a href="${escapeHtml(link)}" style="background:#7C4DE0;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;display:inline-block">${escapeHtml(linkLabel)}</a></p>
  <p style="font-size:12px;color:#9691A6">Pode descarregar o contrato assinado em PDF a partir dessa ligação.</p>
</div>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Corpo do pedido inválido." }, 400);
  }
  const action = body.action;
  const token = typeof body.token === "string" ? body.token.trim() : "";
  if (!/^[a-f0-9]{64}$/.test(token)) return json({ error: "Ligação inválida." }, 404);

  const admin = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));

  const { data: signer } = await admin.from("contract_signers").select("*").eq("token", token).eq("role", "counterparty").maybeSingle();
  if (!signer) return json({ error: "Ligação inválida." }, 404);

  const { data: contract } = await admin.from("contracts").select("*").eq("id", signer.contract_id).maybeSingle();
  if (!contract || contract.status === "draft") return json({ error: "Ligação inválida." }, 404);
  if (contract.status === "cancelled") return json({ error: "Este contrato foi cancelado pela agência." }, 410);

  const { data: agency } = await admin.from("agencies").select("name").eq("id", contract.agency_id).maybeSingle();
  const agencyName = agency?.name || "A agência";

  const currentHash = await hashOfContract(contract);
  if (currentHash !== contract.body_hash) {
    console.error("contract-sign: hash não corresponde", { contractId: contract.id });
    return json({ error: "O conteúdo deste contrato foi alterado depois de assinado pela agência. Contacte a agência." }, 409);
  }

  // ------------------------------------------------------------ ler
  if (action === "view") {
    if (contract.status === "sent" && !signer.signed_at) {
      const now = new Date().toISOString();
      await admin.from("contract_signers").update({ first_viewed_at: signer.first_viewed_at || now, last_viewed_at: now }).eq("id", signer.id);
    }
    const { data: signers } = await admin
      .from("contract_signers")
      .select("role, name, email, signature_image, signed_at, signed_ip, signed_body_hash")
      .eq("contract_id", contract.id);
    return json({
      contract: {
        id: contract.id, title: contract.title, body_html: contract.body_html, status: contract.status, body_hash: contract.body_hash,
        sent_at: contract.sent_at, completed_at: contract.completed_at,
        counterparty_name: contract.counterparty_name, counterparty_email: contract.counterparty_email,
        agency_name: agencyName,
      },
      signers: signers || [],
      canSign: contract.status === "sent" && !signer.signed_at,
    });
  }

  // ------------------------------------------------------------ assinar
  if (action === "sign") {
    if (contract.status !== "sent" || signer.signed_at) return json({ error: "Este contrato já foi assinado." }, 409);
    const name = String(body.name ?? "").trim();
    if (name.length < 2 || name.length > 120) return json({ error: "Escreve o teu nome completo." }, 400);
    if (body.agree !== true) return json({ error: "Tens de confirmar que leste e aceitas o contrato." }, 400);
    if (!isValidSignatureImage(body.signatureImage)) return json({ error: "A assinatura é inválida — desenha-a de novo." }, 400);

    const now = new Date().toISOString();
    const ip = req.headers.get("cf-connecting-ip") || (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || null;
    const userAgent = (req.headers.get("user-agent") || "").slice(0, 300) || null;

    // Só um pedido consegue gravar (signed_at ainda vazio).
    const { data: saved } = await admin
      .from("contract_signers")
      .update({ name, signature_image: body.signatureImage, signed_at: now, signed_ip: ip, signed_user_agent: userAgent, signed_body_hash: currentHash })
      .eq("id", signer.id)
      .is("signed_at", null)
      .select("id");
    if (!saved || saved.length === 0) return json({ error: "Este contrato já foi assinado." }, 409);

    await admin
      .from("contracts")
      .update({ status: "signed", counterparty_signed_at: now, completed_at: now })
      .eq("id", contract.id)
      .eq("status", "sent");

    // Emails de conclusão (não bloqueiam a resposta se falharem).
    const { data: agencySigner } = await admin.from("contract_signers").select("email").eq("contract_id", contract.id).eq("role", "agency").maybeSingle();
    const origin = contract.app_url || "";
    const subject = `Contrato «${contract.title}» assinado`;
    await Promise.all([
      origin
        ? sendEmail({
            to: signer.email,
            subject,
            html: completedEmailHtml({ contractTitle: contract.title, signerName: name, link: `${origin}/assinar/${token}`, linkLabel: "Ver e descarregar o contrato" }),
          })
        : Promise.resolve(),
      origin && agencySigner?.email
        ? sendEmail({
            to: agencySigner.email,
            subject,
            html: completedEmailHtml({ contractTitle: contract.title, signerName: name, link: origin, linkLabel: "Abrir a plataforma" }),
          })
        : Promise.resolve(),
    ]);

    return json({ ok: true });
  }

  return json({ error: "Ação inválida." }, 400);
});
