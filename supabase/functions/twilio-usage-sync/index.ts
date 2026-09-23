// EMPOWER OS — vai buscar o gasto real de SMS/WhatsApp de cada marca
// à API de Usage da Twilio (gratuita) e guarda em messaging_usage_daily.
// Chamado uma vez por dia pelo pg_cron (ver supabase/53_twilio_usage_sync_cron.sql),
// nunca pelo frontend — usa sempre a service role.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

async function fetchUsage(accountSid, token, category) {
  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Usage/Records/Yesterday.json?Category=${category}`,
    { headers: { Authorization: `Basic ${btoa(`${accountSid}:${token}`)}` } }
  );
  if (!res.ok) return null;
  const data = await res.json();
  const record = data?.usage_records?.[0];
  if (!record) return null;
  return {
    date: record.start_date,
    numMessages: Number(record.count) || 0,
    cost: Math.abs(Number(record.price) || 0),
    currency: (record.price_unit || "USD").toUpperCase(),
  };
}

Deno.serve(async () => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const admin = createClient(supabaseUrl, serviceRoleKey);

  let synced = 0, failed = 0;

  const { data: smsAccounts } = await admin.from("sms_accounts").select("brand_id, account_sid, auth_token_ref");
  for (const account of smsAccounts || []) {
    try {
      const { data: token } = await admin.rpc("vault_read_secret", { p_id: account.auth_token_ref });
      if (!token) throw new Error("sem token");
      const usage = await fetchUsage(account.account_sid, token, "sms");
      if (usage) {
        await admin.from("messaging_usage_daily").upsert(
          {
            brand_id: account.brand_id, date: usage.date, channel: "sms", twilio_account_sid: account.account_sid,
            num_messages: usage.numMessages, cost: usage.cost, currency: usage.currency,
          },
          { onConflict: "brand_id,date,channel,twilio_account_sid" }
        );
        synced++;
      }
    } catch (err) {
      console.error("Falha ao sincronizar gasto de SMS", { brandId: account.brand_id, error: String(err?.message || err) });
      failed++;
    }
  }

  const { data: waAccounts } = await admin.from("whatsapp_accounts").select("brand_id, twilio_account_sid, access_token_ref").eq("provider", "twilio");
  for (const account of waAccounts || []) {
    try {
      const { data: token } = await admin.rpc("vault_read_secret", { p_id: account.access_token_ref });
      if (!token) throw new Error("sem token");
      const usage = await fetchUsage(account.twilio_account_sid, token, "whatsapp");
      if (usage) {
        await admin.from("messaging_usage_daily").upsert(
          {
            brand_id: account.brand_id, date: usage.date, channel: "whatsapp", twilio_account_sid: account.twilio_account_sid,
            num_messages: usage.numMessages, cost: usage.cost, currency: usage.currency,
          },
          { onConflict: "brand_id,date,channel,twilio_account_sid" }
        );
        synced++;
      }
    } catch (err) {
      console.error("Falha ao sincronizar gasto de WhatsApp", { brandId: account.brand_id, error: String(err?.message || err) });
      failed++;
    }
  }

  return new Response(JSON.stringify({ synced, failed }), { status: 200, headers: { "Content-Type": "application/json" } });
});
