-- =========================================================
-- EMPOWER OS — CONTRATOS
--   1. Ficheiros PDF por marca (aba "Contratos" de cada cliente)
--   2. Contratos criados na agência: texto rico, assinatura da agência,
--      envio por email, assinatura do outro lado, PDF final
-- =========================================================
-- Corre isto depois do 69. Pode correr-se mais do que uma vez.
-- Depois: cola as funções contract-send (Verify JWT LIGADO) e
-- contract-sign (Verify JWT DESLIGADO) no Dashboard e cria os segredos
-- RESEND_API_KEY e CONTRACTS_FROM_EMAIL (ver o cabeçalho de contract-send).
--
-- SEGURANÇA
--  - Bucket "contracts" privado (só URLs assinadas e temporárias).
--  - Só a equipa cria/edita/apaga; o cliente da marca só lê.
--  - Um contrato enviado ou assinado é IMUTÁVEL para qualquer utilizador
--    autenticado; só as Edge Functions (service role) mudam o estado.
--  - Os tokens de assinatura nunca chegam ao browser (revogados por coluna).
-- =========================================================

-- ---------------------------------------------------------
-- 1. Bucket privado
-- ---------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('contracts', 'contracts', false, 20971520, array['application/pdf'])
on conflict (id) do update set public = false, file_size_limit = 20971520, allowed_mime_types = array['application/pdf'];

-- Primeiro segmento do caminho = id da marca (regra do projeto).
drop policy if exists contracts_storage_select on storage.objects;
drop policy if exists contracts_storage_insert on storage.objects;
drop policy if exists contracts_storage_update on storage.objects;
drop policy if exists contracts_storage_delete on storage.objects;
create policy contracts_storage_select on storage.objects for select to authenticated
  using (bucket_id = 'contracts' and is_brand_member(storage_path_owner_id(name)));
create policy contracts_storage_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'contracts' and can_manage_brand(storage_path_owner_id(name)));
create policy contracts_storage_update on storage.objects for update to authenticated
  using (bucket_id = 'contracts' and can_manage_brand(storage_path_owner_id(name)))
  with check (bucket_id = 'contracts' and can_manage_brand(storage_path_owner_id(name)));
create policy contracts_storage_delete on storage.objects for delete to authenticated
  using (bucket_id = 'contracts' and can_manage_brand(storage_path_owner_id(name)));

-- ---------------------------------------------------------
-- 2. PDFs carregados por marca
-- ---------------------------------------------------------
create table if not exists brand_contract_files (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id) on delete cascade,
  name text not null,
  storage_path text not null unique,
  size_bytes bigint,
  uploaded_by uuid references profiles(id),
  created_at timestamptz default now(),
  -- o ficheiro tem de viver na pasta da própria marca
  constraint brand_contract_files_path_check check (storage_path like brand_id::text || '/%')
);
create index if not exists idx_brand_contract_files_brand on brand_contract_files(brand_id, created_at desc);

alter table brand_contract_files enable row level security;
drop policy if exists brand_contract_files_select on brand_contract_files;
drop policy if exists brand_contract_files_write on brand_contract_files;
create policy brand_contract_files_select on brand_contract_files for select using (is_brand_member(brand_id));
create policy brand_contract_files_write on brand_contract_files for all
  using (can_manage_brand(brand_id)) with check (can_manage_brand(brand_id));

-- ---------------------------------------------------------
-- 3. Contratos criados na plataforma
-- ---------------------------------------------------------
create table if not exists contracts (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references agencies(id) on delete cascade,
  brand_id uuid references brands(id) on delete set null,
  title text not null,
  body_html text not null default '',
  status text not null default 'draft' check (status in ('draft','sent','signed','cancelled')),
  counterparty_name text,
  counterparty_email text,
  -- SHA-256 de {title, body_html} no momento do envio: prova de que o
  -- que o outro lado assinou é exatamente o que a agência assinou.
  body_hash text,
  app_url text,
  agency_signed_at timestamptz,
  counterparty_signed_at timestamptz,
  sent_at timestamptz,
  completed_at timestamptz,
  created_by uuid references profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_contracts_agency on contracts(agency_id, created_at desc);
create index if not exists idx_contracts_brand on contracts(brand_id, created_at desc);

create table if not exists contract_signers (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references contracts(id) on delete cascade,
  role text not null check (role in ('agency','counterparty')),
  name text,
  email text,
  token text unique,                 -- só a parte externa; nunca sai do servidor
  signature_image text,              -- PNG em data URL
  signed_at timestamptz,
  signed_ip text,
  signed_user_agent text,
  signed_body_hash text,
  first_viewed_at timestamptz,
  last_viewed_at timestamptz,
  created_at timestamptz default now(),
  unique (contract_id, role)
);

-- ---------------------------------------------------------
-- 4. Proteções (triggers)
-- ---------------------------------------------------------
-- A marca (se houver) tem de ser da mesma agência do contrato.
create or replace function trg_contracts_brand_check() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.brand_id is not null and brand_agency(new.brand_id) is distinct from new.agency_id then
    raise exception 'A marca escolhida não pertence à agência deste contrato.';
  end if;
  return new;
end;
$$;

drop trigger if exists contracts_brand_check on contracts;
create trigger contracts_brand_check
  before insert or update of brand_id, agency_id on contracts
  for each row execute function trg_contracts_brand_check();

-- Um utilizador autenticado (equipa) só pode: criar rascunhos, editar
-- rascunhos, e cancelar. Enviar, assinar e marcar datas é só das Edge
-- Functions (service role). Contratos enviados/assinados não mudam.
create or replace function trg_contracts_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  if coalesce(auth.role(), '') <> 'authenticated' then
    return new; -- service role / SQL Editor
  end if;

  if tg_op = 'INSERT' then
    if new.status <> 'draft' or new.body_hash is not null or new.sent_at is not null
       or new.agency_signed_at is not null or new.counterparty_signed_at is not null or new.completed_at is not null then
      raise exception 'Um contrato novo tem de começar como rascunho.';
    end if;
    return new;
  end if;

  if new.agency_id is distinct from old.agency_id then
    raise exception 'Não é possível mudar a agência de um contrato.';
  end if;
  if new.body_hash is distinct from old.body_hash or new.sent_at is distinct from old.sent_at
     or new.agency_signed_at is distinct from old.agency_signed_at
     or new.counterparty_signed_at is distinct from old.counterparty_signed_at
     or new.completed_at is distinct from old.completed_at or new.app_url is distinct from old.app_url then
    raise exception 'Estes campos só são preenchidos pelo envio e pelas assinaturas.';
  end if;

  -- Apagar uma marca desliga-a do contrato (on delete set null) — o
  -- registo do contrato mantém-se, mesmo assinado.
  if new.brand_id is null and old.brand_id is not null
     and (new.title, new.body_html, new.status, new.counterparty_name, new.counterparty_email)
         is not distinct from (old.title, old.body_html, old.status, old.counterparty_name, old.counterparty_email) then
    return new;
  end if;

  if old.status = 'draft' then
    if new.status not in ('draft', 'cancelled') then
      raise exception 'Para enviar o contrato usa "Assinar e enviar".';
    end if;
  elsif old.status = 'sent' then
    -- só se pode cancelar; o conteúdo já foi assinado pela agência
    if new.status not in ('sent', 'cancelled')
       or new.title is distinct from old.title or new.body_html is distinct from old.body_html
       or new.counterparty_name is distinct from old.counterparty_name
       or new.counterparty_email is distinct from old.counterparty_email
       or new.brand_id is distinct from old.brand_id then
      raise exception 'Um contrato enviado não pode ser alterado — só cancelado.';
    end if;
  else
    raise exception 'Um contrato % não pode ser alterado.', case old.status when 'signed' then 'assinado' else 'cancelado' end;
  end if;
  return new;
end;
$$;

drop trigger if exists contracts_guard on contracts;
create trigger contracts_guard
  before insert or update on contracts
  for each row execute function trg_contracts_guard();

-- ---------------------------------------------------------
-- 5. RLS
-- ---------------------------------------------------------
alter table contracts enable row level security;
drop policy if exists contracts_select on contracts;
drop policy if exists contracts_insert on contracts;
drop policy if exists contracts_update on contracts;
drop policy if exists contracts_delete on contracts;

-- Equipa vê tudo da agência; o cliente só vê contratos já enviados/assinados da sua marca.
create policy contracts_select on contracts for select using (
  can_manage_agency(agency_id)
  or (brand_id is not null and status in ('sent', 'signed') and is_approver_of(brand_id))
);
create policy contracts_insert on contracts for insert with check (can_manage_agency(agency_id));
create policy contracts_update on contracts for update
  using (can_manage_agency(agency_id)) with check (can_manage_agency(agency_id));
-- Contratos assinados ficam como registo: só rascunhos e cancelados se apagam.
create policy contracts_delete on contracts for delete
  using (can_manage_agency(agency_id) and status in ('draft', 'cancelled'));

alter table contract_signers enable row level security;
drop policy if exists contract_signers_select on contract_signers;
create policy contract_signers_select on contract_signers for select using (
  exists (
    select 1 from contracts ct
    where ct.id = contract_signers.contract_id
      and (
        can_manage_agency(ct.agency_id)
        or (ct.brand_id is not null and ct.status in ('sent', 'signed') and is_approver_of(ct.brand_id))
      )
  )
);

-- Só leitura, e sem o token: a escrita é das Edge Functions.
revoke all on contract_signers from anon, authenticated;
grant select (id, contract_id, role, name, email, signature_image, signed_at, signed_ip, signed_body_hash, first_viewed_at, last_viewed_at, created_at)
  on contract_signers to authenticated;
