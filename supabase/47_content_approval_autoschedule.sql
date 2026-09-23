-- =========================================================
-- EMPOWER OS — APROVAR CONTEÚDO AGENDA AUTOMATICAMENTE NO PLANEADOR
-- =========================================================
-- Corre isto depois do 46_whatsapp_waba_id_optional.sql.
--
-- Até agora, aprovar um conteúdo no calendário (contents) só mudava
-- approval_status — o Planeador de Social Media (social_posts) é uma
-- tabela à parte, e ninguém a alimentava sozinho: alguém da equipa
-- tinha de ir lá recriar o post à mão. Isto liga as duas: ao aprovar,
-- para cada plataforma do conteúdo com uma conta social ligada dessa
-- marca, cria (ou atualiza, se já existir) o post correspondente no
-- Planeador — já agendado se a plataforma publicar a sério
-- (instagram/facebook por agora), ou "pronto a publicar manualmente"
-- para as restantes. Aplica-se a todas as marcas, porque é lógica de
-- base de dados, não código por marca.
-- =========================================================

alter table social_posts add column if not exists source_content_id uuid references contents(id) on delete set null;

-- Chave de deduplicação: no máximo um social_post por conteúdo x conta
-- social ligada — reaprovar (ou editar depois de aprovado) atualiza o
-- mesmo post em vez de duplicar.
create unique index if not exists idx_social_posts_source_content_platform
  on social_posts(source_content_id, social_account_id) where source_content_id is not null;

-- contents.scheduled_date é só "date" — falta a hora. Não há coluna de
-- fuso horário em brands, por isso assume-se Europe/Lisbon (a agência
-- é portuguesa); fácil de trocar por uma coluna em brands mais tarde
-- se abrirem marcas noutros fusos.
alter table contents add column if not exists scheduled_time time default '12:00';

create or replace function approve_content(p_id uuid, p_status text, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_brand_id uuid;
  v_content record;
  v_platform text;
  v_account record;
  v_scheduled_at timestamptz;
begin
  if p_status not in ('approved', 'rejected') then
    raise exception 'status inválido: %', p_status;
  end if;

  select brand_id into v_brand_id from contents where id = p_id;
  if v_brand_id is null then
    raise exception 'conteúdo não encontrado';
  end if;

  if not (can_manage_brand(v_brand_id) or is_approver_of(v_brand_id)) then
    raise exception 'sem permissão para aprovar este conteúdo';
  end if;

  update contents
     set approval_status = p_status,
         client_note = p_note
   where id = p_id;

  if p_status = 'approved' then
    select * into v_content from contents where id = p_id;

    -- Sem data marcada não há como agendar a sério — fica só aprovado,
    -- como já ficava antes desta migração (a equipa cria o post à mão
    -- no Planeador se quiser).
    if v_content.scheduled_date is not null then
      v_scheduled_at := (v_content.scheduled_date + coalesce(v_content.scheduled_time, '12:00'::time)) at time zone 'Europe/Lisbon';

      for v_platform in select unnest(v_content.platform) loop
        select id into v_account from social_accounts
          where brand_id = v_brand_id and platform = v_platform and status = 'connected'
          limit 1;

        if found then
          insert into social_posts (brand_id, social_account_id, caption, media_urls, scheduled_at, status, approval_status, source_content_id)
          values (
            v_brand_id, v_account.id, v_content.caption, v_content.media_urls, v_scheduled_at,
            case when v_platform in ('instagram', 'facebook') then 'scheduled' else 'manual_only' end,
            'approved', p_id
          )
          on conflict (source_content_id, social_account_id) where source_content_id is not null
          do update set
            caption = excluded.caption,
            media_urls = excluded.media_urls,
            scheduled_at = excluded.scheduled_at,
            status = excluded.status,
            approval_status = 'approved';
        end if;
      end loop;
    end if;
  end if;
end;
$$;

grant execute on function approve_content(uuid, text, text) to authenticated;
