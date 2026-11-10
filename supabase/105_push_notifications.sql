-- Notificações no telemóvel (Web Push) quando chega uma mensagem de WhatsApp.
-- Cada aparelho que carrega em "Ativar no telemóvel" (sino do Big Boss)
-- guarda aqui a subscrição. Quando entra uma mensagem (whatsapp_messages,
-- inbound) o trigger chama a função push-notify, que envia o aviso a quem
-- tem acesso à marca. As chaves VAPID são criadas sozinhas pela função na
-- primeira vez (privada no Vault, ref em push_config).
-- No iPhone só funciona com o Big Boss instalado no ecrã principal (iOS 16.4+).
-- Pode correr-se mais do que uma vez.

create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
alter table push_subscriptions enable row level security;
drop policy if exists push_subscriptions_own on push_subscriptions;
create policy push_subscriptions_own on push_subscriptions for select using (user_id = auth.uid());
-- Escrita só pelas funções abaixo (o mesmo aparelho pode mudar de utilizador).

create table if not exists push_config (
  id int primary key default 1 check (id = 1),
  vapid_public text not null,
  vapid_private_ref uuid not null,
  created_at timestamptz not null default now()
);
alter table push_config enable row level security;
-- Sem políticas: só a service role.

create or replace function push_subscribe(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text default null)
returns void language plpgsql security definer set search_path = public as $fn$
begin
  if auth.uid() is null or not exists (select 1 from profiles where id = auth.uid()) then
    raise exception 'Sem sessão da equipa.';
  end if;
  if p_endpoint !~ '^https://' or length(p_endpoint) > 1000 or length(p_p256dh) > 200 or length(p_auth) > 100 then
    raise exception 'Subscrição inválida.';
  end if;
  insert into push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, left(p_user_agent, 300))
  on conflict (endpoint) do update
    set user_id = auth.uid(), p256dh = excluded.p256dh, auth = excluded.auth, user_agent = excluded.user_agent;
end;
$fn$;
revoke all on function push_subscribe(text, text, text, text) from public, anon;
grant execute on function push_subscribe(text, text, text, text) to authenticated;

create or replace function push_unsubscribe(p_endpoint text)
returns void language sql security definer set search_path = public as $fn$
  delete from push_subscriptions where endpoint = p_endpoint and user_id = auth.uid();
$fn$;
revoke all on function push_unsubscribe(text) from public, anon;
grant execute on function push_unsubscribe(text) to authenticated;

-- Aparelhos de quem tem acesso à marca (mesma regra de is_brand_member:
-- equipa da agência ou cliente com a marca em brand_ids).
create or replace function push_targets(p_brand uuid)
returns table (id uuid, endpoint text, p256dh text, auth text)
language sql stable security definer set search_path = public as $fn$
  select s.id, s.endpoint, s.p256dh, s.auth
  from push_subscriptions s
  join profiles p on p.id = s.user_id
  join brands b on b.id = p_brand
  where p.role = 'admin_geral'
     or (p.role = 'membro' and is_root_agency(b.agency_id))
     or (p.role in ('agencia_admin', 'agencia_membro') and p.agency_id = b.agency_id)
     or (p.role in ('aprovador_marca', 'agencia_aprovador') and p_brand = any(coalesce(p.brand_ids, '{}')));
$fn$;
revoke all on function push_targets(uuid) from public, anon, authenticated;

-- Mensagem de WhatsApp recebida → aviso no telemóvel.
create or replace function whatsapp_inbound_push() returns trigger
language plpgsql security definer set search_path = public as $fn$
declare
  v_url text := (select decrypted_secret from vault.decrypted_secrets where name = 'automations_project_url');
  v_key text := (select decrypted_secret from vault.decrypted_secrets where name = 'automations_service_role_key');
  v_name text;
  v_brand text;
  v_text text;
begin
  if new.direction <> 'inbound' or v_url is null or v_key is null then return new; end if;
  if not exists (select 1 from push_subscriptions) then return new; end if;
  select coalesce(nullif(trim(ct.name), ''), wc.wa_contact_phone) into v_name
    from whatsapp_conversations wc left join contacts ct on ct.id = wc.contact_id
    where wc.id = new.conversation_id;
  select name into v_brand from brands where id = new.brand_id;
  v_text := case
    when coalesce(trim(new.body), '') <> '' then left(new.body, 140)
    when new.type = 'image' then 'Enviou uma imagem'
    when new.type = 'video' then 'Enviou um vídeo'
    when new.type = 'document' then 'Enviou um documento'
    else 'Nova mensagem' end;
  perform net.http_post(
    url := v_url || '/functions/v1/push-notify',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
    body := jsonb_build_object(
      'brandId', new.brand_id,
      'title', coalesce(v_name, 'WhatsApp') || ' (' || coalesce(v_brand, 'WhatsApp') || ')',
      'body', v_text,
      'url', '/?v=marcas&marca=' || new.brand_id || '&m=whatsapp',
      'tag', 'wa-' || new.conversation_id
    )
  );
  return new;
exception when others then
  -- O aviso nunca impede a mensagem de ficar guardada.
  return new;
end;
$fn$;

drop trigger if exists whatsapp_messages_inbound_push on whatsapp_messages;
create trigger whatsapp_messages_inbound_push
  after insert on whatsapp_messages
  for each row when (new.direction = 'inbound')
  execute function whatsapp_inbound_push();
