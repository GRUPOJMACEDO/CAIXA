-- ============================================================
-- Fase 58 — Consulta: Administrador edita lançamento SEM travas
--
-- Ao alterar um lançamento na Consulta (tipo de serviço, categoria,
-- valores, orçamento), o banco barra por causa de 3 regras de
-- integridade: orçamento compartilhado/valor acima do orçamento
-- (checar_saldo_os), categoria/tipo divergente na mesma OS e
-- duplicidade (checar_categoria_tipo_os).
--
-- Esta fase cria a função admin_editar_lancamento(), exclusiva do
-- Administrador, que liga uma "licença" temporária (só dentro da
-- própria transação) fazendo as duas travas serem ignoradas, grava a
-- alteração e desliga a licença. O registro de histórico (log) continua
-- funcionando normalmente.
--
-- Rode no SQL Editor do Supabase (depois da fase 57).
-- ============================================================

create or replace function checar_saldo_os()
returns trigger as $$
declare
  ja_pago numeric(12,2);
  orcamento numeric(12,2);
begin
  if coalesce(current_setting('caixa.permitir_correcao_orcamento', true), '0') = '1'
     or coalesce(current_setting('caixa.admin_sem_travas', true), '0') = '1' then
    return new;
  end if;

  select coalesce(sum(valor_pago), 0) into ja_pago
  from lancamentos
  where unidade_id = new.unidade_id
    and numero_os = new.numero_os
    and tipo_servico_id = new.tipo_servico_id
    and linha = new.linha
    and id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000');

  select orcamento_aprovado into orcamento
  from lancamentos
  where unidade_id = new.unidade_id
    and numero_os = new.numero_os
    and tipo_servico_id = new.tipo_servico_id
    and linha = new.linha
    and orcamento_aprovado > 0
    and id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000')
  order by criado_em asc
  limit 1;

  if orcamento is not null and orcamento <> new.orcamento_aprovado then
    new.orcamento_aprovado := orcamento;
  end if;

  if new.orcamento_aprovado > 0 and (ja_pago + new.valor_pago) > new.orcamento_aprovado then
    raise exception 'VALOR_EXCEDE_ORCAMENTO: saldo restante é %', (new.orcamento_aprovado - ja_pago);
  end if;

  return new;
end;
$$ language plpgsql;

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
  if coalesce(current_setting('caixa.permitir_pagamento_complementar', true), '0') = '1'
     or coalesce(current_setting('caixa.admin_sem_travas', true), '0') = '1' then
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

create or replace function admin_editar_lancamento(
  p_id uuid,
  p_data date,
  p_numero_os text,
  p_categoria_id uuid,
  p_tipo_servico_id uuid,
  p_orcamento_aprovado numeric,
  p_valor_pago numeric,
  p_forma_pagamento text,
  p_formas_pagamento jsonb,
  p_parcelas int,
  p_bandeira text,
  p_observacoes text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if meu_cargo() <> 'administrador' then
    raise exception 'Apenas o Administrador pode editar lançamentos sem travas.';
  end if;

  perform set_config('caixa.admin_sem_travas', '1', true);

  update lancamentos
  set data = coalesce(p_data, data),
      numero_os = coalesce(p_numero_os, numero_os),
      categoria_id = p_categoria_id,
      tipo_servico_id = p_tipo_servico_id,
      orcamento_aprovado = coalesce(p_orcamento_aprovado, 0),
      valor_pago = coalesce(p_valor_pago, 0),
      forma_pagamento = p_forma_pagamento,
      formas_pagamento = p_formas_pagamento,
      parcelas = p_parcelas,
      bandeira = p_bandeira,
      observacoes = p_observacoes,
      alterado_por = auth.uid(),
      alterado_em = now()
  where id = p_id;

  perform set_config('caixa.admin_sem_travas', '0', true);

  if not found then
    raise exception 'Lançamento não encontrado.';
  end if;
end;
$$;

grant execute on function admin_editar_lancamento(
  uuid, date, text, uuid, uuid, numeric, numeric, text, jsonb, int, text, text
) to authenticated;
