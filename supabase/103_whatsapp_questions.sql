-- Perguntas por botões no WhatsApp (Twilio).
-- Uma pergunta tem opções; cada opção põe tags (que arrancam as automações
-- de sempre) e pode seguir para outras perguntas. A primeira pergunta vai
-- num template aprovado (botões com id "q:<pergunta>:<opção>"); as seguintes
-- vão dentro da janela de 24h, sem aprovação (botões até 3 opções, lista até 10).
-- As respostas são tratadas pela função twilio-whatsapp-webhook.
-- Inclui o fluxo "Interesse WingCare" (produtos/formações → marca/tratamento
-- ou curso). Pode correr-se mais do que uma vez.

-- Respostas por botão ficam com o tipo 'button' (não contam como "respondeu"
-- para parar automações) e as perguntas enviadas com 'interactive'.
alter table whatsapp_messages drop constraint if exists whatsapp_messages_type_check;
alter table whatsapp_messages add constraint whatsapp_messages_type_check
  check (type in ('text', 'image', 'video', 'document', 'template', 'button', 'interactive'));

create table if not exists whatsapp_questions (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id) on delete cascade,
  key text not null,
  name text not null,
  body text not null,
  -- [{ id, title, description?, tags: [nome da tag], next: [key de pergunta] }]
  options jsonb not null default '[]'::jsonb,
  final_message text,
  content_sid text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand_id, key)
);
alter table whatsapp_questions enable row level security;
drop policy if exists whatsapp_questions_team on whatsapp_questions;
create policy whatsapp_questions_team on whatsapp_questions for all using (can_manage_brand(brand_id)) with check (can_manage_brand(brand_id));

-- Perguntas que ainda faltam fazer a cada contacto (ex.: escolheu "Os dois").
create table if not exists whatsapp_question_state (
  contact_id uuid primary key references contacts(id) on delete cascade,
  brand_id uuid not null references brands(id) on delete cascade,
  last_question_id uuid references whatsapp_questions(id) on delete set null,
  queue text[] not null default '{}',
  updated_at timestamptz not null default now()
);
alter table whatsapp_question_state enable row level security;
drop policy if exists whatsapp_question_state_team on whatsapp_question_state;
create policy whatsapp_question_state_team on whatsapp_question_state for select using (can_manage_brand(brand_id));

-- ---------------------------------------------------------
-- WingCare: fluxo "Interesse WingCare"
-- ---------------------------------------------------------
do $do$
declare
  b uuid := (select id from brands where name = 'WingCare' order by created_at limit 1);
  v_q uuid;
  v_fim text := 'Obrigada! Vamos enviar-lhe a informação sobre o que escolheu. Se quiser falar connosco, basta responder a esta mensagem.';
begin
  if b is null then
    raise notice 'Marca WingCare não encontrada: só foram criadas as tabelas.';
    return;
  end if;

  insert into tags (brand_id, name, color)
  select b, 'Interesse_Produtos', '#0EA5E9'
  where not exists (select 1 from tags where brand_id = b and lower(name) = lower('Interesse_Produtos'));

  insert into whatsapp_questions (brand_id, key, name, body, options, final_message) values
  (b, 'inicio', 'Interesse WingCare: pergunta inicial',
   'Olá {{1}}! Em algum momento entrou em contacto com a Wingcare e queremos enviar-lhe apenas o que lhe interessa. O que procura neste momento?',
   '[{"id":"produtos","title":"Produtos","tags":["Interesse_Produtos"],"next":["marcas"]},
     {"id":"formacoes","title":"Formações","tags":["Interesse_Formacao"],"next":["formacoes"]},
     {"id":"ambos","title":"Os dois","tags":["Interesse_Produtos","Interesse_Formacao"],"next":["marcas","formacoes"]}]'::jsonb,
   null),
  (b, 'marcas', 'Interesse WingCare: marca',
   'Ótimo! Há alguma marca que lhe interesse em especial?',
   '[{"id":"podocare","title":"Podocare","tags":["Marca_Podocare","Interesse_Podocare"],"next":[]},
     {"id":"jmf","title":"JMF Cosmetics","tags":["Marca_JMF_Cosmetics"],"next":["jmf"]},
     {"id":"wob","title":"World of Beauty","tags":["Marca_World_of_Beauty"],"next":["wob"]}]'::jsonb,
   v_fim),
  (b, 'jmf', 'Interesse WingCare: tratamento JMF',
   'Que tratamento da JMF Cosmetics lhe interessa mais?',
   '[{"id":"skin_cleansing","title":"Skin Cleansing","tags":["Interesse_JMF_Skin_Cleansing"],"next":[]},
     {"id":"composit_viso","title":"Composit Viso","tags":["Interesse_JMF_Composit_Viso"],"next":[]},
     {"id":"spa_viso","title":"Spa Viso","tags":["Interesse_JMF_Spa_Viso"],"next":[]},
     {"id":"activegym","title":"ActiveGym Tonic","tags":["Interesse_JMF_ActiveGym_Tonic"],"next":[]},
     {"id":"water_forces","title":"Water Forces","tags":["Interesse_JMF_Water_Forces"],"next":[]},
     {"id":"saffron","title":"Saffron Elisir","tags":["Interesse_JMF_Saffron_Elisir"],"next":[]},
     {"id":"body_awakening","title":"Body Awakening","tags":["Interesse_JMF_Body_Awakening"],"next":[]},
     {"id":"body_method","title":"Body Method","tags":["Interesse_JMF_Body_Method"],"next":[]}]'::jsonb,
   v_fim),
  (b, 'wob', 'Interesse WingCare: tratamento World of Beauty',
   'Que tratamento da World of Beauty lhe interessa mais?',
   '[{"id":"carboxy_face","title":"Carboxy Lift Face","description":"Carboxy Lift CO2 Face","tags":["Interesse_WoB_Carboxy_Face"],"next":[]},
     {"id":"carboxy_body","title":"Carboxy Lift Body","description":"Carboxy Lift CO2 Body","tags":["Interesse_WoB_Carboxy_Body"],"next":[]},
     {"id":"carboxy_capilar","title":"Carboxy Lift Capilar","description":"Carboxy Lift CO2 Capilar","tags":["Interesse_WoB_Carboxy_Capilar"],"next":[]},
     {"id":"peelings_md","title":"Peelings MD","description":"Peelings Químicos Funcionais MD","tags":["Interesse_WoB_Peelings_MD"],"next":[]},
     {"id":"microbiome","title":"Microbiome Restore","description":"Microbiome Restore Therapy","tags":["Interesse_WoB_Microbiome_Restore"],"next":[]},
     {"id":"exosomes","title":"Exosomes","description":"Exosomes and Cellular Regeneration","tags":["Interesse_WoB_Exosomes"],"next":[]},
     {"id":"collagen_dna","title":"Collagen DNA Derm","description":"Collagen Induction Therapy com DNA Derm","tags":["Interesse_WoB_Collagen_DNA_Derm"],"next":[]}]'::jsonb,
   v_fim),
  (b, 'formacoes', 'Interesse WingCare: formação',
   'Há alguma formação que lhe interesse em especial?',
   '[{"id":"pedicure","title":"Pedicure Terapêutica","description":"Especialização em Pedicure Profissional e Terapêutica","tags":["Curso_Pedicure_Terapeutica"],"next":[]},
     {"id":"foot_master","title":"Premium Foot Master","description":"Avaliação, Performance e Gestão Integrativa do Pé","tags":["Curso_Premium_Foot_Master"],"next":[]},
     {"id":"skin_limpeza","title":"Skin Expert Limpeza","description":"Limpeza de Pele & Aparatologia","tags":["Curso_Skin_Expert_Limpeza"],"next":[]},
     {"id":"skin_peelings","title":"Skin Expert Peelings","description":"Peelings Químicos & Integrativos","tags":["Curso_Skin_Expert_Peelings"],"next":[]},
     {"id":"skin_master","title":"Premium Skin Master","description":"Estética Corporal e Facial","tags":["Curso_Premium_Skin_Master"],"next":[]},
     {"id":"remodelacao","title":"Remodelação Corporal","description":"Remodelação Corporal Bioestimulada","tags":["Curso_Remodelacao_Corporal"],"next":[]},
     {"id":"mentoria","title":"Negócio Magnético","description":"Mentoria Negócio Magnético","tags":["Curso_Mentoria_Negocio_Magnetico"],"next":[]},
     {"id":"nao_sei","title":"Ainda não sei","description":"Quero conhecer as formações","tags":[],"next":[]}]'::jsonb,
   v_fim)
  on conflict (brand_id, key) do update
    set name = excluded.name, body = excluded.body, options = excluded.options,
        final_message = excluded.final_message, content_sid = null, updated_at = now();

  -- Template da primeira pergunta (rascunho): botões com o id da pergunta.
  -- Submete-se em WhatsApp, Templates, "Submeter".
  select id into v_q from whatsapp_questions where brand_id = b and key = 'inicio';
  if not exists (select 1 from whatsapp_templates where brand_id = b and name = 'wc_interesse_inicial') then
    insert into whatsapp_templates (brand_id, name, language, category, body, variables, status, layout)
    values (b, 'wc_interesse_inicial', 'pt_PT', 'MARKETING',
      'Olá {{1}}! Em algum momento entrou em contacto com a Wingcare e queremos enviar-lhe apenas o que lhe interessa. O que procura neste momento?',
      '["Primeiro nome"]'::jsonb, 'draft',
      jsonb_build_object('quickReplies', jsonb_build_array(
        jsonb_build_object('id', 'q:' || v_q || ':produtos', 'title', 'Produtos'),
        jsonb_build_object('id', 'q:' || v_q || ':formacoes', 'title', 'Formações'),
        jsonb_build_object('id', 'q:' || v_q || ':ambos', 'title', 'Os dois'))));
  end if;
end;
$do$;
