-- =========================================================
-- EMPOWER OS — LIMITES DE MARCAS/UTILIZADORES POR PLANO DE AGÊNCIA
-- =========================================================
-- Corre isto depois do 57_subscription_past_due_tracking.sql.
--
-- Aplicado ao nível da base de dados (trigger), não só no frontend —
-- impossível de contornar, mesmo inserindo diretamente no SQL Editor.
--
-- Regras:
--   - Agências "is_root" (a Biamelo) nunca são limitadas.
--   - Sem subscrição ativa/trialing reconhecida para a agência (ex:
--     ainda não pagou, ou é uma agência antiga anterior ao Billing),
--     não bloqueia — trata como sem limite definido. Isto evita
--     partir instalações existentes que nunca passaram pelo Stripe.
--   - limits->>'brands' / limits->>'users' = -1 no plano significa
--     "sem limite" (Enterprise) — também não bloqueia.
--   - "Utilizadores de equipa" só conta role in ('agencia_admin',
--     'agencia_membro') — clientes/aprovadores não ocupam lugar de
--     equipa.
-- =========================================================

create or replace function enforce_agency_brand_limit() returns trigger
language plpgsql as $$
declare
  v_is_root boolean;
  v_limit int;
  v_count int;
begin
  select is_root into v_is_root from agencies where id = new.agency_id;
  if coalesce(v_is_root, false) then
    return new;
  end if;

  select (p.limits->>'brands')::int into v_limit
  from subscriptions s
  join plans p on p.id = s.plan_id
  where s.agency_id = new.agency_id and s.status in ('active', 'trialing')
  limit 1;

  if v_limit is null or v_limit < 0 then
    return new;
  end if;

  select count(*) into v_count from brands where agency_id = new.agency_id;

  if v_count >= v_limit then
    raise exception 'Limite de marcas do teu plano atingido (%). Faz upgrade do plano da agência para adicionares mais marcas.', v_limit;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_agency_brand_limit on brands;
create trigger trg_enforce_agency_brand_limit before insert on brands
  for each row execute function enforce_agency_brand_limit();

create or replace function enforce_agency_user_limit() returns trigger
language plpgsql as $$
declare
  v_is_root boolean;
  v_limit int;
  v_count int;
begin
  if new.role not in ('agencia_admin', 'agencia_membro') or new.agency_id is null then
    return new;
  end if;

  select is_root into v_is_root from agencies where id = new.agency_id;
  if coalesce(v_is_root, false) then
    return new;
  end if;

  select (p.limits->>'users')::int into v_limit
  from subscriptions s
  join plans p on p.id = s.plan_id
  where s.agency_id = new.agency_id and s.status in ('active', 'trialing')
  limit 1;

  if v_limit is null or v_limit < 0 then
    return new;
  end if;

  select count(*) into v_count from profiles
  where agency_id = new.agency_id
    and role in ('agencia_admin', 'agencia_membro')
    and id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid);

  if v_count >= v_limit then
    raise exception 'Limite de utilizadores de equipa do teu plano atingido (%). Faz upgrade do plano da agência para adicionares mais pessoas.', v_limit;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_agency_user_limit on profiles;
create trigger trg_enforce_agency_user_limit before insert or update of role, agency_id on profiles
  for each row execute function enforce_agency_user_limit();
