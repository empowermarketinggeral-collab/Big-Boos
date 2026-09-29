-- =========================================================
-- EMPOWER OS — QUIZZES (tipo novo, separado de Formulário)
-- =========================================================
-- Corre isto depois do 74 (ou do 71, se ainda não tiveres corrido o 74 — não depende dele). Pode correr-se mais do que uma vez.
--
-- Um quiz é um `forms` com type='quiz'. As perguntas de escolha (campo
-- type='choice', novo) têm opções com pontos (forms.fields[].options =
-- [{id, label, points}]) — certo/errado é só o caso em que uma opção
-- tem pontos e as outras não; pontuações diferentes por opção é o caso
-- geral, mesmo mecanismo. `forms.result_bands` guarda as faixas de
-- resultado do quiz: [{id, min, max, title, description}].
--
-- O resultado é calculado no SERVIDOR (não confia no que o browser
-- manda) pela função submit_quiz_response(), chamada pela página
-- pública em vez do insert direto que os formulários normais usam.
-- O trigger de submissão (trg_form_submission_created, já existente)
-- continua a correr na mesma — cria/reconhece o contacto, aplica tags
-- e dispara automações, tal como para formulários normais.
-- =========================================================

alter table forms drop constraint if exists forms_type_check;
alter table forms add constraint forms_type_check check (type in ('form','questionario','lead_magnet','quiz'));

alter table forms add column if not exists result_bands jsonb default '[]'::jsonb;

create or replace function submit_quiz_response(p_form_id uuid, p_answers jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_form record;
  v_score int := 0;
  v_field jsonb;
  v_opt jsonb;
  v_answer text;
  v_band jsonb;
  v_submission_id uuid;
begin
  select * into v_form from forms where id = p_form_id and status = 'published' and type = 'quiz';
  if v_form is null then
    raise exception 'Quiz não encontrado.';
  end if;
  if p_answers is null or jsonb_typeof(p_answers) <> 'object' then
    raise exception 'Respostas inválidas.';
  end if;

  for v_field in select * from jsonb_array_elements(coalesce(v_form.fields, '[]'::jsonb)) loop
    if v_field->>'type' = 'choice' and v_field->'options' is not null then
      v_answer := p_answers ->> (v_field->>'id');
      if v_answer is not null then
        for v_opt in select * from jsonb_array_elements(v_field->'options') loop
          if (v_opt->>'id') = v_answer then
            v_score := v_score + coalesce((v_opt->>'points')::int, 0);
          end if;
        end loop;
      end if;
    end if;
  end loop;

  insert into form_submissions (brand_id, form_id, answers, score)
  values (v_form.brand_id, p_form_id, p_answers, v_score)
  returning id into v_submission_id;

  select to_jsonb(band) into v_band
  from jsonb_to_recordset(coalesce(v_form.result_bands, '[]'::jsonb)) as band(id text, min int, max int, title text, description text)
  where v_score >= band.min and v_score <= band.max
  limit 1;

  return jsonb_build_object('submissionId', v_submission_id, 'score', v_score, 'band', v_band);
end;
$$;

revoke execute on function submit_quiz_response(uuid, jsonb) from public;
grant execute on function submit_quiz_response(uuid, jsonb) to anon, authenticated;
