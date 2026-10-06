-- =========================================================
-- EMPOWER OS — CRIATIVOS (opções de design por cliente)
--   Para cada marca (cliente): "trabalhos" por tipo (cartão de visita,
--   landing page, identidade visual, redes sociais…), cada um com
--   várias "opções" (Opção 1, 2, 3…), cada opção com versões (v1, v2…),
--   estado (rascunho / enviada / aprovada / rejeitada), comentários,
--   ficheiros finais e um link de partilha para o cliente decidir.
-- =========================================================
-- Corre isto depois do 77. Pode correr-se mais do que uma vez.
-- Depois: cola a função creative-share no Dashboard (Verify JWT DESLIGADO).
--
-- SEGURANÇA
--  - Bucket "creatives" privado (só URLs assinadas e temporárias); o
--    primeiro segmento do caminho é o id da marca.
--  - Só a equipa cria/edita/apaga; o cliente da marca (login) só lê, e
--    nunca vê opções em rascunho.
--  - O cliente sem login decide e comenta pelo link de partilha, sempre
--    através da função creative-share (token de 256 bits, só a equipa
--    o consegue ler).
-- =========================================================

-- ---------------------------------------------------------
-- 1. Bucket privado
-- ---------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('creatives', 'creatives', false, 52428800)
on conflict (id) do update set public = false, file_size_limit = 52428800;

drop policy if exists creatives_storage_select on storage.objects;
drop policy if exists creatives_storage_insert on storage.objects;
drop policy if exists creatives_storage_update on storage.objects;
drop policy if exists creatives_storage_delete on storage.objects;
create policy creatives_storage_select on storage.objects for select to authenticated
  using (bucket_id = 'creatives' and is_brand_member(storage_path_owner_id(name)));
create policy creatives_storage_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'creatives' and can_manage_brand(storage_path_owner_id(name)));
create policy creatives_storage_update on storage.objects for update to authenticated
  using (bucket_id = 'creatives' and can_manage_brand(storage_path_owner_id(name)))
  with check (bucket_id = 'creatives' and can_manage_brand(storage_path_owner_id(name)));
create policy creatives_storage_delete on storage.objects for delete to authenticated
  using (bucket_id = 'creatives' and can_manage_brand(storage_path_owner_id(name)));

-- ---------------------------------------------------------
-- 2. Trabalhos (as abas): um por tipo de trabalho
-- ---------------------------------------------------------
create table if not exists creative_projects (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id) on delete cascade,
  kind text not null check (kind in ('business_card','landing_page','brand_identity','social_media','other')),
  title text not null check (char_length(title) between 1 and 80),
  position int not null default 0,
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);
create index if not exists idx_creative_projects_brand on creative_projects(brand_id, position, created_at);

-- ---------------------------------------------------------
-- 3. Opções dentro de cada trabalho
-- ---------------------------------------------------------
create table if not exists creative_options (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references creative_projects(id) on delete cascade,
  brand_id uuid not null references brands(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 80),
  status text not null default 'draft' check (status in ('draft','sent','approved','rejected')),
  position int not null default 0,
  decided_at timestamptz,
  decided_by_name text,
  -- ficheiros finais para descarregar (opção aprovada): [{name, path, size}]
  final_files jsonb not null default '[]'::jsonb,
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);
create index if not exists idx_creative_options_project on creative_options(project_id, position, created_at);

-- ---------------------------------------------------------
-- 4. Versões de cada opção (v1, v2…): o conteúdo depende do tipo
-- ---------------------------------------------------------
--   business_card:  {front: caminho, back: caminho}
--   landing_page:   {desktop: caminho, mobile: caminho, url: texto}
--   brand_identity: {logo: caminho, colors: [{name, hex}],
--                    fonts: [{name, role}], applications: [caminho…]}
--   social_media / other: {images: [caminho…]}
-- Os caminhos são do bucket "creatives" e começam pelo id da marca.
create table if not exists creative_versions (
  id uuid primary key default gen_random_uuid(),
  option_id uuid not null references creative_options(id) on delete cascade,
  brand_id uuid not null references brands(id) on delete cascade,
  version int not null,
  note text check (note is null or char_length(note) <= 1000),
  content jsonb not null default '{}'::jsonb,
  created_by uuid references profiles(id),
  created_at timestamptz default now(),
  unique (option_id, version)
);
create index if not exists idx_creative_versions_option on creative_versions(option_id, version);

-- ---------------------------------------------------------
-- 5. Comentários (equipa e cliente)
-- ---------------------------------------------------------
create table if not exists creative_comments (
  id uuid primary key default gen_random_uuid(),
  option_id uuid not null references creative_options(id) on delete cascade,
  brand_id uuid not null references brands(id) on delete cascade,
  version int,
  author_name text not null check (char_length(author_name) between 1 and 120),
  from_client boolean not null default false,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz default now()
);
create index if not exists idx_creative_comments_option on creative_comments(option_id, created_at);

-- ---------------------------------------------------------
-- 6. Link de partilha por trabalho (só a equipa lê o token)
-- ---------------------------------------------------------
create table if not exists creative_share_links (
  project_id uuid primary key references creative_projects(id) on delete cascade,
  brand_id uuid not null references brands(id) on delete cascade,
  token text not null unique check (char_length(token) >= 32),
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);

-- ---------------------------------------------------------
-- 7. Coerência: opção/versão/comentário têm de ser da mesma marca
-- ---------------------------------------------------------
create or replace function trg_creative_same_brand() returns trigger
language plpgsql security definer set search_path = public as $$
declare parent_brand uuid;
begin
  if tg_table_name = 'creative_options' then
    select brand_id into parent_brand from creative_projects where id = new.project_id;
  elsif tg_table_name = 'creative_share_links' then
    select brand_id into parent_brand from creative_projects where id = new.project_id;
  else
    select brand_id into parent_brand from creative_options where id = new.option_id;
  end if;
  if parent_brand is distinct from new.brand_id then
    raise exception 'Este item não pertence à mesma marca.';
  end if;
  return new;
end;
$$;
drop trigger if exists creative_options_same_brand on creative_options;
create trigger creative_options_same_brand before insert or update on creative_options for each row execute function trg_creative_same_brand();
drop trigger if exists creative_versions_same_brand on creative_versions;
create trigger creative_versions_same_brand before insert or update on creative_versions for each row execute function trg_creative_same_brand();
drop trigger if exists creative_comments_same_brand on creative_comments;
create trigger creative_comments_same_brand before insert or update on creative_comments for each row execute function trg_creative_same_brand();
drop trigger if exists creative_share_links_same_brand on creative_share_links;
create trigger creative_share_links_same_brand before insert or update on creative_share_links for each row execute function trg_creative_same_brand();

-- Nova versão com o número seguinte, sem corridas entre dois cliques.
create or replace function creative_add_version(p_option uuid, p_note text, p_content jsonb)
returns creative_versions
language plpgsql security invoker set search_path = public as $$
declare opt creative_options; ver creative_versions;
begin
  select * into opt from creative_options where id = p_option for update;
  if not found then raise exception 'Opção não encontrada.'; end if;
  insert into creative_versions (option_id, brand_id, version, note, content, created_by)
  values (
    p_option, opt.brand_id,
    coalesce((select max(version) from creative_versions where option_id = p_option), 0) + 1,
    nullif(btrim(coalesce(p_note, '')), ''), coalesce(p_content, '{}'::jsonb), auth.uid()
  ) returning * into ver;
  return ver;
end;
$$;
grant execute on function creative_add_version(uuid, text, jsonb) to authenticated;

-- ---------------------------------------------------------
-- 8. RLS
-- ---------------------------------------------------------
alter table creative_projects enable row level security;
alter table creative_options enable row level security;
alter table creative_versions enable row level security;
alter table creative_comments enable row level security;
alter table creative_share_links enable row level security;

-- O cliente (login) vê o trabalho e as opções já enviadas; rascunhos só a equipa.
create or replace function creative_option_visible(p_brand uuid, p_status text) returns boolean
language sql stable security definer set search_path = public as $$
  select can_manage_brand(p_brand) or (is_brand_member(p_brand) and p_status <> 'draft');
$$;

drop policy if exists creative_projects_select on creative_projects;
drop policy if exists creative_projects_write on creative_projects;
create policy creative_projects_select on creative_projects for select using (is_brand_member(brand_id));
create policy creative_projects_write on creative_projects for all
  using (can_manage_brand(brand_id)) with check (can_manage_brand(brand_id));

drop policy if exists creative_options_select on creative_options;
drop policy if exists creative_options_write on creative_options;
create policy creative_options_select on creative_options for select using (creative_option_visible(brand_id, status));
create policy creative_options_write on creative_options for all
  using (can_manage_brand(brand_id)) with check (can_manage_brand(brand_id));

drop policy if exists creative_versions_select on creative_versions;
drop policy if exists creative_versions_write on creative_versions;
create policy creative_versions_select on creative_versions for select using (
  exists (select 1 from creative_options o where o.id = option_id and creative_option_visible(o.brand_id, o.status))
);
create policy creative_versions_write on creative_versions for all
  using (can_manage_brand(brand_id)) with check (can_manage_brand(brand_id));

drop policy if exists creative_comments_select on creative_comments;
drop policy if exists creative_comments_insert on creative_comments;
drop policy if exists creative_comments_delete on creative_comments;
create policy creative_comments_select on creative_comments for select using (
  exists (select 1 from creative_options o where o.id = option_id and creative_option_visible(o.brand_id, o.status))
);
-- A equipa comenta como equipa; os comentários do cliente entram só pelo link (função).
create policy creative_comments_insert on creative_comments for insert
  with check (can_manage_brand(brand_id) and from_client = false);
create policy creative_comments_delete on creative_comments for delete using (can_manage_brand(brand_id));

drop policy if exists creative_share_links_all on creative_share_links;
create policy creative_share_links_all on creative_share_links for all
  using (can_manage_brand(brand_id)) with check (can_manage_brand(brand_id));

-- ---------------------------------------------------------
-- 9. Avisos internos quando o cliente decide ou comenta
-- ---------------------------------------------------------
alter table notifications drop constraint if exists notifications_area_check;
alter table notifications add constraint notifications_area_check check (area in (
  'conteudos','roteiros','stories','plano_estrategico','propostas','portfolio','automacoes','agendamento','criativos'
));
