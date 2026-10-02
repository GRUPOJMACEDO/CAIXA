-- ============================================================
-- Fase 54 — Contas a Receber: dar baixa numa conta informando que o
-- pagamento já foi lançado em outro número de OS por engano.
--
-- Caso de uso: o cliente pagou, mas quem lançou digitou o número da
-- OS errado — o pagamento ficou registrado numa OS diferente da que
-- está pendente aqui. Em vez de lançar o valor de novo (o que
-- duplicaria o caixa), o Administrador informa o número da OS onde
-- o pagamento real está, o sistema confere se o valor bate com o
-- saldo em aberto, e dá baixa só ajustando o orçamento desta conta
-- pro que já foi pago — sem criar nenhum lançamento novo.
--
-- Usa a mesma "licença" temporária (caixa.permitir_correcao_orcamento)
-- já criada na fase 48 pra corrigir orçamento, porque o gatilho
-- checar_saldo_os() travaria esse update senão.
--
-- Rode no SQL Editor do seu projeto Supabase (depois da fase 48).
-- ============================================================

create or replace function admin_baixar_cr_outra_os(
  p_unidade_id uuid,
  p_numero_os text,
  p_tipo_servico_id uuid,
  p_linha linha_tipo,
  p_numero_os_pagamento text,
  p_motivo text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_orcamento numeric;
  v_pago numeric;
  v_falta numeric;
  v_pago_outra_os numeric;
begin
  if meu_cargo() <> 'administrador' then
    raise exception 'Apenas o Administrador pode dar baixa referenciando outra OS.';
  end if;
  if p_motivo is null or trim(p_motivo) = '' then
    raise exception 'Informe o motivo da baixa.';
  end if;
  if p_numero_os_pagamento is null or trim(p_numero_os_pagamento) = '' then
    raise exception 'Informe o número da OS onde o pagamento foi lançado.';
  end if;

  select max(orcamento_aprovado), coalesce(sum(valor_pago), 0)
    into v_orcamento, v_pago
  from lancamentos
  where unidade_id = p_unidade_id and numero_os = p_numero_os
    and tipo_servico_id is not distinct from p_tipo_servico_id and linha = p_linha;

  if v_orcamento is null then
    raise exception 'Nenhum lançamento encontrado para essa conta.';
  end if;

  v_falta := v_orcamento - v_pago;
  if v_falta <= 0 then
    raise exception 'Essa conta já não tem saldo em aberto.';
  end if;

  select coalesce(sum(valor_pago), 0) into v_pago_outra_os
  from lancamentos
  where unidade_id = p_unidade_id and numero_os = p_numero_os_pagamento and linha = p_linha;

  if v_pago_outra_os <= 0 then
    raise exception 'Não encontrei nenhum lançamento pago na OS %.', p_numero_os_pagamento;
  end if;

  if abs(v_pago_outra_os - v_falta) > 0.01 then
    raise exception 'VALOR_NAO_BATE: o valor pago na OS % (%) é diferente do saldo em aberto (%).', p_numero_os_pagamento, v_pago_outra_os, v_falta;
  end if;

  perform set_config('caixa.permitir_correcao_orcamento', '1', true);

  update lancamentos
  set orcamento_aprovado = v_pago,
      motivo_exclusao = '[Admin] Baixa sem lançamento: pagamento já registrado na OS ' || p_numero_os_pagamento || '. ' || p_motivo,
      alterado_por = auth.uid(),
      alterado_em = now()
  where unidade_id = p_unidade_id and numero_os = p_numero_os
    and tipo_servico_id is not distinct from p_tipo_servico_id and linha = p_linha;

  perform set_config('caixa.permitir_correcao_orcamento', '0', true);
end;
$$;

grant execute on function admin_baixar_cr_outra_os(uuid, text, uuid, linha_tipo, text, text) to authenticated;
