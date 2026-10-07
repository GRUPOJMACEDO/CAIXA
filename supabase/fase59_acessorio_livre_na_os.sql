-- ============================================================
-- Fase 59 — Acessório pode ser lançado em qualquer OS
--
-- A trava de "mesma categoria / mesmo tipo de serviço por OS" (fases
-- 52/53) barrava o lançamento de um Acessório (película, cabo, fonte...)
-- numa OS que já tinha um serviço de outra categoria — mas acessório é
-- venda avulsa, vendida junto com o conserto. Agora, se o lançamento
-- novo OU o já existente for da categoria "Acessório", a trava é
-- ignorada (inclusive a de duplicidade exata).
--
-- Rode no SQL Editor do Supabase (depois da fase 58).
-- ============================================================

create or replace function checar_categoria_tipo_os()
returns trigger
language plpgsql
as $$
declare
  v_nome_novo text;
  v_excecao_novo boolean;
  v_acessorio_novo boolean;
  v_linha record;
  v_eh_excecao boolean;
begin
  if coalesce(current_setting('caixa.permitir_pagamento_complementar', true), '0') = '1'
     or coalesce(current_setting('caixa.admin_sem_travas', true), '0') = '1' then
    return new;
  end if;

  select nome into v_nome_novo from tipos_servico where id = new.tipo_servico_id;
  v_excecao_novo := eh_tipo_servico_excecao_os(v_nome_novo);
  v_acessorio_novo := exists (
    select 1 from categorias c where c.id = new.categoria_id and c.nome ilike 'acess_rio'
  );

  for v_linha in
    select l.id, l.categoria_id, l.tipo_servico_id, ts.nome as tipo_servico_nome,
           (c.nome ilike 'acess_rio') as eh_acessorio
    from lancamentos l
    join tipos_servico ts on ts.id = l.tipo_servico_id
    left join categorias c on c.id = l.categoria_id
    where l.unidade_id = new.unidade_id
      and l.numero_os = new.numero_os
      and l.linha = new.linha
      and l.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
  loop
    -- Acessório (de um lado ou do outro) é venda avulsa: não entra na regra
    if v_acessorio_novo or coalesce(v_linha.eh_acessorio, false) then
      continue;
    end if;

    v_eh_excecao := v_excecao_novo or eh_tipo_servico_excecao_os(v_linha.tipo_servico_nome);

    if v_eh_excecao
       and v_linha.tipo_servico_id = new.tipo_servico_id
       and v_linha.categoria_id is not distinct from new.categoria_id then
      raise exception 'DUPLICIDADE_OS_CATEGORIA_TIPO: a OS % já tem lançamento com essa mesma categoria e tipo de serviço.', new.numero_os;
    end if;

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
