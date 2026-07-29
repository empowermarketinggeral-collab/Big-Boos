-- =========================================================
-- BIG BOSS — MAPA DE CRESCIMENTO (nova tabela)
-- =========================================================
-- Corre isto depois do 12_meeting_files_storage.sql.
--
-- Produto fixo que a agência vende ao cliente: diagnóstico,
-- objetivo, análise de concorrência, perfil de cliente ideal,
-- auditoria de canais, obstáculo principal, e plano estratégico
-- com cronograma.
--
-- Ao contrário dos outros módulos de agência, este é visível
-- SÓ para quem o criou, e só se for admin_geral — ninguém da
-- equipa (nem agencia_admin) vê os mapas de outra pessoa. A
-- leitura pública (link partilhável quando enviado/aceite)
-- continua a funcionar normalmente para o cliente final.
-- =========================================================

create table growth_maps (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid references agencies(id) on delete cascade not null,
  created_by uuid references profiles(id) not null,
  client_name text not null,
  slug text unique not null,
  branding_color text default '#7C4DE0',
  status text default 'draft' check (status in ('draft', 'sent', 'accepted', 'rejected')),
  diagnosis text,
  objective text,
  competitor_analysis text,
  ideal_client_profile text,
  obstacle text,
  channel_audit jsonb default '[]'::jsonb,    -- [{ channel, finding }]
  strategic_plan jsonb default '[]'::jsonb,   -- [{ title, description }]
  created_at timestamptz default now()
);

alter table growth_maps enable row level security;

create policy growth_maps_owner on growth_maps for all using (
  created_by = auth.uid() and my_role() = 'admin_geral'
) with check (
  created_by = auth.uid() and my_role() = 'admin_geral'
);

create policy growth_maps_public_read on growth_maps for select
  to anon
  using (status = 'sent' or status = 'accepted');

create index idx_growth_maps_agency on growth_maps(agency_id);
