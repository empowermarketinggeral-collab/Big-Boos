-- Programa de indicações por marca ("Amigas Dreams" no Dreams Studio).
-- A cliente vê na app (/app/<slug>) quantas amigas já indicou e os mimos
-- ganhos; envia uma mensagem pronta com o link de marcação com o código
-- dela (?amiga=<código>). Uma amiga conta quando faz o primeiro serviço da
-- categoria indicada (content.qualifyingCategory, ex: "Cabelo"), com a
-- marcação concluída ou já passada e confirmada.
-- O texto fica em referral_programs.content (jsonb) para se poder mudar
-- sem mexer no código. A equipa vê quem indicou quem e marca os mimos
-- usados em Agendamento, "Amigas".
-- Pode correr-se mais do que uma vez (o texto do Dreams Studio é reposto).

-- 1. PROGRAMA (texto e regras por marca)
create table if not exists referral_programs (
  brand_id uuid primary key references brands(id) on delete cascade,
  enabled boolean not null default false,
  content jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table referral_programs enable row level security;
drop policy if exists referral_programs_select on referral_programs;
drop policy if exists referral_programs_write on referral_programs;
create policy referral_programs_select on referral_programs for select using (is_brand_member(brand_id));
create policy referral_programs_write on referral_programs for all using (can_manage_brand(brand_id)) with check (can_manage_brand(brand_id));

-- 2. CÓDIGO DE CADA CLIENTE (vai no link da mensagem; criado pela app)
create table if not exists referral_codes (
  brand_id uuid not null references brands(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  code text not null unique,
  created_at timestamptz not null default now(),
  primary key (brand_id, contact_id)
);
alter table referral_codes enable row level security;
drop policy if exists referral_codes_select on referral_codes;
create policy referral_codes_select on referral_codes for select using (can_manage_brand(brand_id));

-- 3. MIMOS JÁ USADOS (a equipa marca)
create table if not exists referral_reward_uses (
  brand_id uuid not null references brands(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  level int not null check (level between 1 and 20),
  used_at timestamptz not null default now(),
  marked_by uuid default auth.uid(),
  primary key (contact_id, level)
);
alter table referral_reward_uses enable row level security;
drop policy if exists referral_reward_uses_all on referral_reward_uses;
create policy referral_reward_uses_all on referral_reward_uses for all
  using (can_manage_brand(brand_id))
  with check (can_manage_brand(brand_id) and exists (select 1 from contacts c where c.id = contact_id and c.brand_id = referral_reward_uses.brand_id));

-- 4. AMIGAS DE UMA CLIENTE e quando contaram (uso interno das funções abaixo)
create or replace function referral_friend_stats(p_brand uuid, p_referrer uuid)
returns table (friend_id uuid, friend_name text, qualified_at timestamptz)
language sql stable security definer set search_path = public as $$
  with cat as (
    select nullif(lower(trim(coalesce(content->>'qualifyingCategory', ''))), '') as category
    from referral_programs where brand_id = p_brand
  )
  select f.id, f.name,
    (
      select min(a.ends_at)
      from booking_appointments a
      left join booking_services s on s.id = a.service_id
      where a.brand_id = p_brand and a.contact_id = f.id
        and (a.status = 'completed' or (a.status = 'confirmed' and a.ends_at < now()))
        and (
          (select category from cat) is null
          or lower(coalesce(s.category, '')) = (select category from cat)
          or exists (
            select 1 from jsonb_array_elements(coalesce(a.extra_services, '[]'::jsonb)) x
            join booking_services s2 on s2.id::text = x->>'id'
            where lower(coalesce(s2.category, '')) = (select category from cat)
          )
        )
    )
  from contacts f
  where f.brand_id = p_brand and f.referred_by = p_referrer;
$$;
revoke all on function referral_friend_stats(uuid, uuid) from public, anon, authenticated;

-- 5. O QUE A CLIENTE VÊ NA APP (cria o código dela na primeira vez)
create or replace function client_referral_data(p_brand uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_contact uuid;
  v_program referral_programs;
  v_code text;
begin
  select contact_id into v_contact from client_accounts where user_id = auth.uid() and brand_id = p_brand;
  if v_contact is null then return null; end if;

  select * into v_program from referral_programs where brand_id = p_brand and enabled;
  if not found then return jsonb_build_object('enabled', false); end if;

  select code into v_code from referral_codes where brand_id = p_brand and contact_id = v_contact;
  while v_code is null loop
    begin
      insert into referral_codes (brand_id, contact_id, code)
      values (p_brand, v_contact, substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))
      returning code into v_code;
    exception when unique_violation then
      select code into v_code from referral_codes where brand_id = p_brand and contact_id = v_contact;
    end;
  end loop;

  return jsonb_build_object(
    'enabled', true,
    'content', v_program.content,
    'code', v_code,
    'name', (select name from contacts where id = v_contact),
    'qualified', (
      select coalesce(jsonb_agg(qualified_at order by qualified_at), '[]'::jsonb)
      from referral_friend_stats(p_brand, v_contact) where qualified_at is not null
    ),
    'pending', (select count(*) from referral_friend_stats(p_brand, v_contact) where qualified_at is null),
    'used', (
      select coalesce(jsonb_agg(level order by level), '[]'::jsonb)
      from referral_reward_uses where brand_id = p_brand and contact_id = v_contact
    )
  );
end;
$$;
revoke all on function client_referral_data(uuid) from public, anon;
grant execute on function client_referral_data(uuid) to authenticated;

-- 6. PÁGINA DE MARCAÇÃO COM ?amiga=<código>: só o primeiro nome de quem indicou
create or replace function referral_public_info(p_slug text, p_code text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'referrerFirstName', split_part(trim(c.name), ' ', 1),
    'bookingBanner', rp.content->>'bookingBanner'
  )
  from brands b
  join referral_programs rp on rp.brand_id = b.id and rp.enabled
  join referral_codes rc on rc.brand_id = b.id and rc.code = lower(trim(p_code))
  join contacts c on c.id = rc.contact_id
  where b.booking_slug = p_slug
  limit 1;
$$;
grant execute on function referral_public_info(text, text) to anon, authenticated;

-- 7. VISTA DA EQUIPA: quem indicou quem e os mimos ganhos/usados
create or replace function referral_team_overview(p_brand uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not can_manage_brand(p_brand) then
    raise exception 'Sem acesso a esta marca.';
  end if;
  return (
    select coalesce(jsonb_agg(to_jsonb(x) order by x.qualified desc, x.pending desc, x.name), '[]'::jsonb)
    from (
      select r.id, r.name, r.phone,
        (select count(*) from referral_friend_stats(p_brand, r.id) s where s.qualified_at is not null) as qualified,
        (select count(*) from referral_friend_stats(p_brand, r.id) s where s.qualified_at is null) as pending,
        (
          select coalesce(jsonb_agg(jsonb_build_object('name', s.friend_name, 'qualified_at', s.qualified_at) order by s.qualified_at nulls last), '[]'::jsonb)
          from referral_friend_stats(p_brand, r.id) s
        ) as friends,
        (
          select coalesce(jsonb_agg(jsonb_build_object('level', u.level, 'used_at', u.used_at) order by u.level), '[]'::jsonb)
          from referral_reward_uses u where u.brand_id = p_brand and u.contact_id = r.id
        ) as used
      from contacts r
      where r.brand_id = p_brand
        and exists (select 1 from contacts f where f.brand_id = p_brand and f.referred_by = r.id)
    ) x
  );
end;
$$;
revoke all on function referral_team_overview(uuid) from public, anon;
grant execute on function referral_team_overview(uuid) to authenticated;

-- 8. DREAMS STUDIO: "Amigas Dreams" ligado, com o texto do programa
insert into referral_programs (brand_id, enabled, content, updated_at)
select b.id, true, '{
  "kicker": "Dreams Studio",
  "title": "Amigas Dreams",
  "titleHighlight": "Dreams",
  "lead": "A beleza começa por ouvir. E passa de amiga para amiga.",
  "intro": "Cada amiga que vier pela primeira vez por indicação tua dá-te um mimo. E ela também recebe o dela.",
  "goal": 3,
  "progressLabel": "As tuas amigas",
  "progressMessages": [
    "Falta 1 amiga para o teu spa de mãos com parafina.",
    "Já tens o teu spa de mãos guardado. Mais 1 amiga e ganhas a consulta de visagismo + hidratação.",
    "Mais 1 amiga e passas a Cliente VIP Dreams.",
    "És Cliente VIP Dreams. Obrigada por partilhares o Studio."
  ],
  "pendingMessage": "{{n}} amiga(s) já marcou. Conta quando fizer o primeiro serviço de cabelo.",
  "ladderTitle": "A escada",
  "ladderLead": "Quanto mais partilhas, mais te mimamos.",
  "ladder": [
    {
      "label": "1.ª amiga",
      "title": "Spa de mãos com hidratação de parafina",
      "text": "Mãos macias, unhas cuidadas e um momento só teu."
    },
    {
      "label": "2.ª amiga",
      "title": "Consulta de visagismo + hidratação ao cabelo",
      "text": "Olhamos para o teu rosto e os teus traços para perceber o que te valoriza."
    },
    {
      "label": "3.ª amiga e seguintes",
      "title": "Passas a Cliente VIP Dreams",
      "permanent": true,
      "bullets": [
        "Tratamento de reconstrução oferecido em cada cor, madeixas ou balayage",
        "Finalização premium oferecida quando subires de serviço",
        "Consulta de visagismo sempre que quiseres mudar",
        "Vagas reservadas às sextas, sábados e em dezembro",
        "Mimo de aniversário: hidratação + spa de mãos"
      ]
    }
  ],
  "friendRewardTitle": "A tua amiga recebe",
  "friendReward": {
    "title": "Mini consulta de visagismo + hidratação",
    "text": "Na primeira visita de cabelo, por nossa conta. Só tem de dizer o teu nome ao marcar."
  },
  "stepsTitle": "Como funciona",
  "steps": [
    "Envia à tua amiga a mensagem pronta, aqui em baixo.",
    "Ela marca a primeira visita de cabelo e diz que vem da tua parte.",
    "Quando ela fizer o primeiro serviço, o teu mimo fica guardado aqui na app."
  ],
  "messageTitle": "Mensagem pronta",
  "message": "Olá! A {{nome}} recomendou-te o Dreams Studio (Rua de Cervantes 587, Porto). Na tua primeira visita de cabelo, a mini consulta de visagismo e a hidratação são por nossa conta. Marca aqui e diz que vens da parte da {{nome}}: {{link}}",
  "rulesTitle": "As regras, em poucas palavras",
  "rules": [
    "A amiga conta quando faz o primeiro serviço de cabelo — marcar ainda não chega.",
    "Válido só para amigas que nunca vieram ao Dreams Studio.",
    "Cada mimo é usado numa visita com serviço de cabelo, até 90 dias depois.",
    "Os mimos são serviços oferecidos: não se trocam por dinheiro nem descontos."
  ],
  "footer": [
    "Patrícia Melo · cabeleireira — @dreams.studio",
    "Rua de Cervantes 587, 4050-188 Porto"
  ],
  "instagramUrl": "https://www.instagram.com/dreams.studio/",
  "bookingBanner": "Vens da parte da {{nome}}. Na tua primeira visita de cabelo, a mini consulta de visagismo e a hidratação são por nossa conta.",
  "homeCardText": "Partilha o Studio com as tuas amigas e ganha mimos.",
  "qualifyingCategory": "Cabelo",
  "rewardValidityDays": 90
}'::jsonb, now()
from brands b
where b.name ilike 'dream%studio%'
on conflict (brand_id) do update set content = excluded.content, enabled = true, updated_at = now();
