-- ============================================================
-- Fase 55 — Contas a Receber: permitir registrar um segundo (ou
-- terceiro...) pagamento numa conta que já existe, mesmo quando o
-- tipo de serviço é um dos "de exceção" (Taxa de Análise, Taxa de
-- Visita, Instalação, Higienização).
--
-- O que estava acontecendo:
-- A fase 53 criou uma trava pra impedir que a MESMA combinação
-- OS + categoria + tipo de serviço fosse lançada duas vezes como
-- "exceção" — pensada pra pegar erro de técnico duplicando um
-- SERVIÇO sem querer (ex.: lançar "Instalação" duas vezes pra
-- mesma OS, como se fossem dois atendimentos diferentes).
--
-- Só que "Registrar novo pagamento" no Contas a Receber TAMBÉM
-- insere uma linha nova em lancamentos — só que pra completar o
-- saldo de uma conta que já existe (ex.: cliente pagou metade,
-- depois pagou o resto). Isso é a mesma OS + categoria + tipo de
-- serviço de novo, só que é um PAGAMENTO, não um serviço novo — e a
-- trava da fase 53 bloqueava isso por engano sempre que o tipo de
-- serviço era um dos 4 de exceção (caso real: OS 4176727953,
-- "Instalação REF", R$ 800 de orçamento, R$ 400 já pago, tentando
-- registrar os R$ 400 que faltam).
--
-- A correção: criar uma função própria pra esse pagamento
-- complementar (mesmo padrão de "licença" temporária já usado nas
-- fases 48 e 54), que:
--   1) só funciona se já existir lançamento pra essa conta (ou
--      seja, nunca cria uma categoria/tipo de serviço novo — só
--      completa o que já existe);
--   2) herda o orçamento já aprovado do grupo;
--   3) insere o novo lançamento sem passar pela trava de
--      duplicidade exata da fase 53 (que não faz sentido aqui).
--
-- A tela de Contas a Receber passa a chamar essa função em vez de
-- inserir direto na tabela.
--
-- Rode no SQL Editor do seu projeto Supabase (depois da fase 54).
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
  if coalesce(current_setting('caixa.permitir_pagamento_complementar', true), '0') = '1' then
    return new;
  end if;

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
    -- OS + categoria + tipo de serviço (exceto pagamento complementar,
    -- tratado pela licença acima)
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

create or replace function registrar_pagamento_cr(
  p_unidade_id uuid,
  p_numero_os text,
  p_categoria_id uuid,
  p_modelo_id uuid,
  p_tipo_servico_id uuid,
  p_linha linha_tipo,
  p_data date,
  p_valor_pago numeric,
  p_forma_pagamento text,
  p_formas_pagamento jsonb,
  p_parcelas int,
  p_bandeira text,
  p_atendente_id uuid,
  p_criado_por uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_orcamento numeric;
  v_novo_id uuid;
begin
  select max(orcamento_aprovado) into v_orcamento
  from lancamentos
  where unidade_id = p_unidade_id
    and numero_os = p_numero_os
    and tipo_servico_id is not distinct from p_tipo_servico_id
    and linha = p_linha;

  if v_orcamento is null then
    raise exception 'Nenhum lançamento encontrado para essa conta.';
  end if;

  if p_valor_pago is null or p_valor_pago <= 0 then
    raise exception 'Informe o valor recebido.';
  end if;

  perform set_config('caixa.permitir_pagamento_complementar', '1', true);

  insert into lancamentos (
    unidade_id, numero_os, categoria_id, modelo_id, tipo_servico_id, linha,
    data, orcamento_aprovado, valor_pago, forma_pagamento, formas_pagamento,
    parcelas, bandeira, atendente_id, criado_por
  ) values (
    p_unidade_id, p_numero_os, p_categoria_id, p_modelo_id, p_tipo_servico_id, p_linha,
    p_data, v_orcamento, p_valor_pago, p_forma_pagamento, p_formas_pagamento,
    p_parcelas, p_bandeira, p_atendente_id, p_criado_por
  )
  returning id into v_novo_id;

  perform set_config('caixa.permitir_pagamento_complementar', '0', true);

  return v_novo_id;
end;
$$;

grant execute on function registrar_pagamento_cr(
  uuid, text, uuid, uuid, uuid, linha_tipo, date, numeric, text, jsonb, int, text, uuid, uuid
) to authenticated;
