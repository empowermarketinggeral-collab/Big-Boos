-- "Reenviar aos que falharam" nas campanhas (WhatsApp, SMS e email).
-- Quem falhou (ex.: sem saldo na Twilio, conta suspensa) e ainda não recebeu
-- volta para o FIM da fila da campanha e segue com o mesmo máximo por dia e
-- horário (scheduled_payload). Os registos de falha dessas pessoas são
-- apagados (o resultado novo substitui-os). Quem ainda está na fila por enviar
-- não é posto outra vez.
-- Campanha enviada sem agendamento: cria a fila só com quem falhou, com o
-- ritmo enviado pelo browser (p_defaults: dailyLimit, windowStart,
-- windowEnd, variableValues, includeWithoutConsent).
-- Pode correr-se mais do que uma vez.

create or replace function campaign_requeue_failed(p_channel text, p_campaign uuid, p_defaults jsonb default '{}'::jsonb)
returns int
language plpgsql security definer set search_path = public as $fn$
declare
  v_brand uuid;
  v_status text;
  v_payload jsonb;
  v_offset int;
  v_ids text[];
  v_pending text[];
  v_failed text[];
  v_new_status text;
  v_fresh boolean;
begin
  if p_channel = 'whatsapp' then
    select brand_id, status, scheduled_payload, scheduled_offset into v_brand, v_status, v_payload, v_offset
      from whatsapp_campaigns where id = p_campaign for update;
  elsif p_channel = 'sms' then
    select brand_id, status, scheduled_payload, scheduled_offset into v_brand, v_status, v_payload, v_offset
      from sms_campaigns where id = p_campaign for update;
  elsif p_channel = 'email' then
    select brand_id, status, scheduled_payload, scheduled_offset into v_brand, v_status, v_payload, v_offset
      from email_campaigns where id = p_campaign for update;
  else
    raise exception 'Canal desconhecido.';
  end if;
  if v_brand is null or not can_manage_brand(v_brand) then
    raise exception 'Sem acesso a esta campanha.';
  end if;

  -- Quem falhou e não tem nenhum envio bom nesta campanha.
  if p_channel = 'whatsapp' then
    select array_agg(distinct f.contact_id::text) into v_failed
      from whatsapp_campaign_sends f
     where f.campaign_id = p_campaign and f.status = 'failed'
       and not exists (select 1 from whatsapp_campaign_sends ok where ok.campaign_id = p_campaign and ok.contact_id = f.contact_id and ok.status <> 'failed');
  elsif p_channel = 'sms' then
    select array_agg(distinct f.contact_id::text) into v_failed
      from sms_messages f
     where f.campaign_id = p_campaign and f.status = 'failed' and f.contact_id is not null
       and not exists (select 1 from sms_messages ok where ok.campaign_id = p_campaign and ok.contact_id = f.contact_id and ok.status <> 'failed');
  else
    select array_agg(distinct f.contact_id::text) into v_failed
      from email_sends f
     where f.campaign_id = p_campaign and f.status = 'failed'
       and not exists (select 1 from email_sends ok where ok.campaign_id = p_campaign and ok.contact_id = f.contact_id and ok.status not in ('failed'));
  end if;
  if v_failed is null then return 0; end if;

  v_fresh := v_payload is null or jsonb_typeof(v_payload -> 'contactIds') is distinct from 'array';
  if v_fresh then
    v_ids := '{}';
    v_offset := 0;
    v_payload := jsonb_strip_nulls(jsonb_build_object(
      'includeWithoutConsent', coalesce((p_defaults ->> 'includeWithoutConsent')::boolean, true),
      'dailyLimit', nullif(p_defaults ->> 'dailyLimit', '')::int,
      'windowStart', p_defaults ->> 'windowStart',
      'windowEnd', p_defaults ->> 'windowEnd',
      'variableValues', p_defaults -> 'variableValues'
    ));
  else
    v_ids := array(select jsonb_array_elements_text(v_payload -> 'contactIds'));
    v_offset := least(coalesce(v_offset, 0), coalesce(array_length(v_ids, 1), 0));
  end if;

  -- Quem ainda está na fila por enviar não entra outra vez.
  v_pending := coalesce(v_ids[v_offset + 1 :], '{}');
  v_failed := array(select x from unnest(v_failed) as x where not (x = any(v_pending)));
  if coalesce(array_length(v_failed, 1), 0) = 0 then return 0; end if;

  -- O resultado novo substitui as falhas antigas destas pessoas.
  if p_channel = 'whatsapp' then
    delete from whatsapp_campaign_sends where campaign_id = p_campaign and status = 'failed' and contact_id::text = any(v_failed);
  elsif p_channel = 'sms' then
    delete from sms_messages where campaign_id = p_campaign and status = 'failed' and contact_id::text = any(v_failed);
  else
    delete from email_sends where campaign_id = p_campaign and status = 'failed' and contact_id::text = any(v_failed);
  end if;

  v_payload := v_payload || jsonb_build_object('contactIds', to_jsonb(v_ids || v_failed));
  -- Sem nada enviado da fila (offset 0): começa como agendada; senão continua "a enviar".
  v_new_status := case when v_offset = 0 then 'scheduled' else 'sending' end;

  if p_channel = 'whatsapp' then
    update whatsapp_campaigns
       set scheduled_payload = v_payload, scheduled_offset = v_offset, status = v_new_status, last_error = null,
           scheduled_at = case when v_status in ('scheduled', 'sending') and scheduled_at is not null then scheduled_at else now() end,
           sent_today = case when v_fresh then 0 else sent_today end, sent_day = case when v_fresh then null else sent_day end
     where id = p_campaign;
  elsif p_channel = 'sms' then
    update sms_campaigns
       set scheduled_payload = v_payload, scheduled_offset = v_offset, status = v_new_status, last_error = null,
           scheduled_at = case when v_status in ('scheduled', 'sending') and scheduled_at is not null then scheduled_at else now() end,
           sent_today = case when v_fresh then 0 else sent_today end, sent_day = case when v_fresh then null else sent_day end
     where id = p_campaign;
  else
    update email_campaigns
       set scheduled_payload = v_payload, scheduled_offset = v_offset, status = v_new_status, last_error = null,
           scheduled_at = case when v_status in ('scheduled', 'sending') and scheduled_at is not null then scheduled_at else now() end,
           sent_today = case when v_fresh then 0 else sent_today end, sent_day = case when v_fresh then null else sent_day end
     where id = p_campaign;
  end if;

  return array_length(v_failed, 1);
end;
$fn$;
revoke all on function campaign_requeue_failed(text, uuid, jsonb) from public, anon;
grant execute on function campaign_requeue_failed(text, uuid, jsonb) to authenticated;
