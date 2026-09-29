-- =========================================================
-- EMPOWER OS — PERGUNTAS DE ESCOLHA COM VÁRIAS RESPOSTAS
-- =========================================================
-- Corre isto depois do 75_quizzes.sql. Pode correr-se mais do que uma vez.
--
-- Uma pergunta de escolha por botões (fields[].type = 'choice') pode agora
-- ter fields[].multiple = true: a resposta chega como lista de ids de opção
-- (["o1","o3"]) em vez de um id só. No quiz, somam-se os pontos de todas
-- as opções escolhidas (cada uma conta uma vez). Numa pergunta de resposta
-- única só conta uma string — uma lista enviada à mão não soma pontos, para
-- ninguém escolher todas as opções e ficar com a pontuação máxima.
-- =========================================================

create or replace function submit_quiz_response(p_form_id uuid, p_answers jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_form record;
  v_score int := 0;
  v_field jsonb;
  v_answer jsonb;
  v_selected text[];
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
    if v_field->>'type' = 'choice' and jsonb_typeof(v_field->'options') = 'array' then
      v_answer := p_answers -> (v_field->>'id');
      v_selected := null;
      if coalesce((v_field->>'multiple')::boolean, false) and jsonb_typeof(v_answer) = 'array' then
        select array_agg(distinct x) into v_selected from jsonb_array_elements_text(v_answer) as x;
      elsif jsonb_typeof(v_answer) = 'string' then
        v_selected := array[v_answer #>> '{}'];
      end if;
      if v_selected is not null then
        v_score := v_score + coalesce((
          select sum(coalesce((o->>'points')::int, 0))
          from jsonb_array_elements(v_field->'options') as o
          where o->>'id' = any(v_selected)
        ), 0);
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
