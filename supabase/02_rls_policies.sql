-- =========================================================
-- BIG BOSS — REGRAS DE ACESSO POR PERFIL (Row Level Security)
-- =========================================================
-- Corre isto DEPOIS do 01_schema.sql.
-- Implementa a matriz de permissões definida em
-- big-boss-estrutura-tecnica.md, secção 3.
-- =========================================================

-- ---------------------------------------------------------
-- Funções auxiliares — leem o perfil de quem está autenticado
-- ---------------------------------------------------------
create or replace function my_role() returns text
language sql stable security definer as $$
  select role from profiles where id = auth.uid()
$$;

create or replace function my_agency() returns uuid
language sql stable security definer as $$
  select agency_id from profiles where id = auth.uid()
$$;

create or replace function my_brand_ids() returns uuid[]
language sql stable security definer as $$
  select coalesce(brand_ids, '{}') from profiles where id = auth.uid()
$$;

create or replace function is_root_agency(target_agency uuid) returns boolean
language sql stable security definer as $$
  select coalesce((select is_root from agencies where id = target_agency), false)
$$;

create or replace function brand_agency(target_brand uuid) returns uuid
language sql stable security definer as $$
  select agency_id from brands where id = target_brand
$$;

-- Verdadeiro se o utilizador atual faz parte da "equipa" (Biamelo ou agência)
-- com permissão de ver/editar dados de uma dada agência.
create or replace function can_manage_agency(target_agency uuid) returns boolean
language sql stable security definer as $$
  select
    my_role() = 'admin_geral'
    or (my_role() = 'membro' and is_root_agency(target_agency))
    or (my_role() in ('agencia_admin','agencia_membro') and target_agency = my_agency())
$$;

-- Verdadeiro se o utilizador atual pode ver/editar dados de uma dada marca
-- (equipa com acesso à agência dona da marca)
create or replace function can_manage_brand(target_brand uuid) returns boolean
language sql stable security definer as $$
  select can_manage_agency(brand_agency(target_brand))
$$;

-- Verdadeiro se o utilizador é aprovador (cliente) com acesso só a essa marca
create or replace function is_approver_of(target_brand uuid) returns boolean
language sql stable security definer as $$
  select my_role() in ('aprovador_marca','agencia_aprovador') and target_brand = any(my_brand_ids())
$$;

-- ---------------------------------------------------------
-- ORGANIZATIONS — só admin_geral mexe
-- ---------------------------------------------------------
alter table organizations enable row level security;
create policy organizations_all on organizations for all
  using (my_role() = 'admin_geral')
  with check (my_role() = 'admin_geral');

-- ---------------------------------------------------------
-- AGENCIES
-- ---------------------------------------------------------
alter table agencies enable row level security;

create policy agencies_select on agencies for select using (
  my_role() = 'admin_geral'
  or id = my_agency()
  or (my_role() = 'membro' and is_root_agency(id))
);
create policy agencies_insert on agencies for insert with check (my_role() = 'admin_geral');
create policy agencies_update on agencies for update using (
  my_role() = 'admin_geral' or (my_role() = 'agencia_admin' and id = my_agency())
);
create policy agencies_delete on agencies for delete using (my_role() = 'admin_geral');

-- ---------------------------------------------------------
-- PROFILES
-- ---------------------------------------------------------
alter table profiles enable row level security;

create policy profiles_select on profiles for select using (
  id = auth.uid()
  or my_role() = 'admin_geral'
  or (my_role() = 'agencia_admin' and agency_id = my_agency())
);
create policy profiles_update_self on profiles for update using (id = auth.uid());
create policy profiles_manage on profiles for all using (
  my_role() = 'admin_geral' or (my_role() = 'agencia_admin' and agency_id = my_agency())
) with check (
  my_role() = 'admin_geral' or (my_role() = 'agencia_admin' and agency_id = my_agency())
);

-- ---------------------------------------------------------
-- BRANDS
-- ---------------------------------------------------------
alter table brands enable row level security;

create policy brands_select on brands for select using (
  can_manage_agency(agency_id) or id = any(my_brand_ids())
);
create policy brands_insert on brands for insert with check (can_manage_agency(agency_id));
create policy brands_update on brands for update using (can_manage_agency(agency_id));
create policy brands_delete on brands for delete using (
  my_role() = 'admin_geral' or (my_role() = 'agencia_admin' and agency_id = my_agency())
);

-- ---------------------------------------------------------
-- Padrão repetido para tabelas ligadas a brand_id:
-- equipa vê/edita tudo da marca; aprovador só vê (e em alguns
-- casos aprova) a sua marca.
-- ---------------------------------------------------------

-- CONTENTS (posts/reels) — aprovador pode aprovar/reprovar
alter table contents enable row level security;
create policy contents_select on contents for select using (
  can_manage_brand(brand_id) or is_approver_of(brand_id)
);
create policy contents_insert on contents for insert with check (can_manage_brand(brand_id));
create policy contents_update on contents for update using (
  can_manage_brand(brand_id) or is_approver_of(brand_id)
);
create policy contents_delete on contents for delete using (can_manage_brand(brand_id));

-- STORY_WEEK_PLANS — só a equipa vê/edita
alter table story_week_plans enable row level security;
create policy story_week_plans_select on story_week_plans for select using (
  can_manage_brand(brand_id) or is_approver_of(brand_id)
);
create policy story_week_plans_write on story_week_plans for all using (can_manage_brand(brand_id))
  with check (can_manage_brand(brand_id));

-- STORY_ANALYSES
alter table story_analyses enable row level security;
create policy story_analyses_select on story_analyses for select using (can_manage_brand(brand_id));
create policy story_analyses_write on story_analyses for all using (can_manage_brand(brand_id))
  with check (can_manage_brand(brand_id));

-- SCRIPTS (roteiros) — aprovador pode aprovar/reprovar
alter table scripts enable row level security;
create policy scripts_select on scripts for select using (
  can_manage_brand(brand_id) or is_approver_of(brand_id)
);
create policy scripts_insert on scripts for insert with check (can_manage_brand(brand_id));
create policy scripts_update on scripts for update using (
  can_manage_brand(brand_id) or is_approver_of(brand_id)
);
create policy scripts_delete on scripts for delete using (can_manage_brand(brand_id));

-- ACTION_PLANS + TASKS — aprovador só vê
alter table action_plans enable row level security;
create policy action_plans_select on action_plans for select using (
  can_manage_brand(brand_id) or is_approver_of(brand_id)
);
create policy action_plans_write on action_plans for all using (can_manage_brand(brand_id))
  with check (can_manage_brand(brand_id));

alter table tasks enable row level security;
create policy tasks_select on tasks for select using (
  can_manage_brand(brand_id) or is_approver_of(brand_id)
);
create policy tasks_write on tasks for all using (can_manage_brand(brand_id))
  with check (can_manage_brand(brand_id));

-- REPORTS (dashboards) — aprovador só vê
alter table reports enable row level security;
create policy reports_select on reports for select using (
  can_manage_brand(brand_id) or is_approver_of(brand_id)
);
create policy reports_write on reports for all using (can_manage_brand(brand_id))
  with check (can_manage_brand(brand_id));

-- SOCIAL_ACCOUNTS — só a equipa
alter table social_accounts enable row level security;
create policy social_accounts_all on social_accounts for all using (can_manage_brand(brand_id))
  with check (can_manage_brand(brand_id));

-- ---------------------------------------------------------
-- PROPOSALS e PRESENTATIONS
-- Ligadas à agência, não a uma marca — porque se destinam a
-- prospects/clientes, partilhadas por link público (slug),
-- fora do sistema de login. A leitura pública é feita à parte
-- (ver 03_public_access.sql).
-- ---------------------------------------------------------
alter table proposals enable row level security;
create policy proposals_team on proposals for all using (can_manage_agency(agency_id))
  with check (can_manage_agency(agency_id));

alter table presentations enable row level security;
create policy presentations_team on presentations for all using (can_manage_agency(agency_id))
  with check (can_manage_agency(agency_id));

-- ---------------------------------------------------------
-- KNOWLEDGE_ARTICLES — isolado por agência, sem acesso de aprovadores
-- ---------------------------------------------------------
alter table knowledge_articles enable row level security;
create policy knowledge_articles_all on knowledge_articles for all using (can_manage_agency(agency_id))
  with check (can_manage_agency(agency_id));

-- ---------------------------------------------------------
-- NOTIFICATIONS — cada um só vê as da sua agência
-- ---------------------------------------------------------
alter table notifications enable row level security;
create policy notifications_select on notifications for select using (can_manage_agency(agency_id));
create policy notifications_insert on notifications for insert with check (can_manage_agency(agency_id));
create policy notifications_update on notifications for update using (can_manage_agency(agency_id));

-- ---------------------------------------------------------
-- PERSONAL_TASKS + CALENDÁRIO PESSOAL — só o próprio admin_geral
-- ---------------------------------------------------------
alter table personal_tasks enable row level security;
create policy personal_tasks_owner on personal_tasks for all using (
  user_id = auth.uid() and my_role() = 'admin_geral'
) with check (
  user_id = auth.uid() and my_role() = 'admin_geral'
);

-- ---------------------------------------------------------
-- LINK_PAGES — geridas pela equipa; leitura pública à parte
-- ---------------------------------------------------------
alter table link_pages enable row level security;
create policy link_pages_team on link_pages for all using (
  my_role() = 'admin_geral'
  or (owner_type = 'brand' and can_manage_brand(owner_id))
  or (owner_type = 'agency' and can_manage_agency(owner_id))
  or (owner_type = 'user' and owner_id = auth.uid())
) with check (
  my_role() = 'admin_geral'
  or (owner_type = 'brand' and can_manage_brand(owner_id))
  or (owner_type = 'agency' and can_manage_agency(owner_id))
  or (owner_type = 'user' and owner_id = auth.uid())
);

-- ---------------------------------------------------------
-- PRICING_CATEGORIES + PRICING_CALCULATIONS — sem acesso de aprovadores
-- ---------------------------------------------------------
alter table pricing_categories enable row level security;
create policy pricing_categories_select on pricing_categories for select using (
  owner_scope = 'global' or can_manage_agency(agency_id)
);
create policy pricing_categories_write on pricing_categories for all using (can_manage_agency(agency_id))
  with check (can_manage_agency(agency_id));

alter table pricing_calculations enable row level security;
create policy pricing_calculations_all on pricing_calculations for all using (
  (brand_id is not null and can_manage_brand(brand_id))
  or (agency_id is not null and can_manage_agency(agency_id))
) with check (
  (brand_id is not null and can_manage_brand(brand_id))
  or (agency_id is not null and can_manage_agency(agency_id))
);

-- =========================================================
-- NOTA IMPORTANTE sobre aprovadores e colunas sensíveis
-- =========================================================
-- As policies acima dão a aprovador_marca/agencia_aprovador acesso de
-- UPDATE a "contents" e "scripts" para poderem aprovar/reprovar.
-- Isto tecnicamente permite-lhes alterar QUALQUER coluna dessas linhas
-- (não só approval_status/client_note), porque o Postgres RLS controla
-- linhas, não colunas.
--
-- Para bloquear isso com rigor, o próximo passo (recomendado para
-- o Claude Code) é substituir esse UPDATE direto por duas funções RPC
-- "security definer" — ex: approve_content(id, status, note) e
-- approve_script(id, status, note) — que só tocam nessas duas colunas,
-- e retirar a policy de UPDATE genérica dos aprovadores. Isto evita
-- termos de reescrever toda a estrutura agora, mas fica documentado
-- como próximo passo de robustez.
