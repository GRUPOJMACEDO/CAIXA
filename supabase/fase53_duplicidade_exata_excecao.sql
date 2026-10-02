-- ============================================================
-- Fase 53 — Dentro das palavras de exceção (taxa de análise, taxa
-- de visita, instalação, higienização), só pode existir 1
-- lançamento pra mesma combinação OS + categoria + tipo de
-- serviço. A exceção da fase 52 continua liberando combinações
-- DIFERENTES (ex.: 1 reparo normal + 1 higienização na mesma OS),
-- só não deixa repetir a mesma combinação duas vezes.
--
-- Exemplo: já existe um lançamento com OS 4176565656, categoria X
-- e tipo de serviço HIGIENIZAÇÃO. Um novo lançamento com essa
-- MESMA OS + MESMA categoria + HIGIENIZAÇÃO de novo é bloqueado.
--
-- Rode no SQL Editor do seu projeto Supabase (depois da fase 52).
-- ============================================================

create or replace function checar_categoria_tipo_os()
returns trigger
language plpgsql
as $$
declare
  v_nome_novo text;
  v_excecao_novo boolean;
  v_linha record;
  v_eh_excecao boolean;
begin
  select nome into v_nome_novo from tipos_servico where id = new.tipo_servico_id;
  v_excecao_novo := eh_tipo_servico_excecao_os(v_nome_novo);

  for v_linha in
    select l.id, l.categoria_id, l.tipo_servico_id, ts.nome as tipo_servico_nome
    from lancamentos l
    join tipos_servico ts on ts.id = l.tipo_servico_id
    where l.unidade_id = new.unidade_id
      and l.numero_os = new.numero_os
      and l.linha = new.linha
      and l.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
  loop
    v_eh_excecao := v_excecao_novo or eh_tipo_servico_excecao_os(v_linha.tipo_servico_nome);

    -- mesmo dentro da exceção, não pode repetir a mesma combinação
    -- OS + categoria + tipo de serviço
    if v_eh_excecao
       and v_linha.tipo_servico_id = new.tipo_servico_id
       and v_linha.categoria_id is not distinct from new.categoria_id then
      raise exception 'DUPLICIDADE_OS_CATEGORIA_TIPO: a OS % já tem lançamento com essa mesma categoria e tipo de serviço.', new.numero_os;
    end if;

    -- se um dos dois lados é um tipo de exceção (taxa de análise,
    -- taxa de visita, instalação, higienização), libera esse par
    -- pra categoria/tipo de serviço diferentes
    if v_eh_excecao then
      continue;
    end if;

    if v_linha.categoria_id is distinct from new.categoria_id then
      raise exception 'CATEGORIA_DIVERGENTE_NA_OS: a OS % já tem lançamento com outra categoria.', new.numero_os;
    end if;

    if v_linha.tipo_servico_id <> new.tipo_servico_id then
      raise exception 'TIPO_SERVICO_DIVERGENTE_NA_OS: a OS % já tem lançamento com outro tipo de serviço.', new.numero_os;
    end if;
  end loop;

  return new;
end;
$$;
