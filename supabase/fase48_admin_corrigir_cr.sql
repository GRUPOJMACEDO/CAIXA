-- ============================================================
-- Fase 48 — Contas a Receber: Administrador pode corrigir orçamento
-- e excluir qualquer conta (mesmo já com valor pago)
--
-- Por que precisa de uma função específica pra corrigir o orçamento:
-- o gatilho checar_saldo_os() (fase 18) força o orcamento_aprovado de
-- TODOS os lançamentos de uma mesma conta (unidade+OS+tipo+linha) a
-- ficarem sempre iguais entre si — é o que impede duplicidade de
-- orçamento no dia a dia. Só que isso também significa que, uma vez
-- que uma conta tem orçamento errado, ninguém consegue corrigir esse
-- valor com um UPDATE comum: o próprio gatilho desfaz a mudança. Essa
-- função abre uma única exceção controlada pra isso, só pro
-- Administrador, com motivo obrigatório e validação de que o novo
-- valor não fica menor que o que já foi pago.
--
-- A exclusão (qualquer conta, mesmo com valor pago) não precisa de
-- função nova — já é permitida pela regra de exclusão de lançamentos
-- de sempre (Administrador já pode excluir). A tela é que, até agora,
-- só mostrava o botão de excluir quando não tinha nada pago ainda;
-- isso vai ser liberado na tela só pro Administrador.
--
-- Rode no SQL Editor do seu projeto Supabase.
-- ============================================================

-- 1) O gatilho de sempre passa a respeitar uma "licença" temporária,
--    válida só dentro da mesma transação, pra permitir a correção.
create or replace function checar_saldo_os()
returns trigger as $$
declare
  ja_pago numeric(12,2);
  orcamento numeric(12,2);
begin
  if coalesce(current_setting('caixa.permitir_correcao_orcamento', true), '0') = '1' then
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

-- 2) Função de correção — só o Administrador, motivo obrigatório, não
--    deixa o novo orçamento ficar menor que o que já foi pago.
create or replace function admin_corrigir_orcamento_cr(
  p_unidade_id uuid,
  p_numero_os text,
  p_tipo_servico_id uuid,
  p_linha linha_tipo,
  p_novo_orcamento numeric,
  p_motivo text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pago numeric;
begin
  if meu_cargo() <> 'administrador' then
    raise exception 'Apenas o Administrador pode corrigir valores do Contas a Receber.';
  end if;
  if p_motivo is null or trim(p_motivo) = '' then
    raise exception 'Informe o motivo da correção.';
  end if;
  if p_novo_orcamento is null or p_novo_orcamento <= 0 then
    raise exception 'Informe um novo orçamento válido.';
  end if;

  select coalesce(sum(valor_pago), 0) into v_pago
  from lancamentos
  where unidade_id = p_unidade_id and numero_os = p_numero_os
    and tipo_servico_id is not distinct from p_tipo_servico_id and linha = p_linha;

  if not found or v_pago is null then
    raise exception 'Nenhum lançamento encontrado para essa conta.';
  end if;

  if p_novo_orcamento < v_pago then
    raise exception 'O novo orçamento (%) não pode ficar menor que o total já pago (%).', p_novo_orcamento, v_pago;
  end if;

  perform set_config('caixa.permitir_correcao_orcamento', '1', true);

  update lancamentos
  set orcamento_aprovado = p_novo_orcamento,
      motivo_exclusao = '[Admin] Orçamento corrigido: ' || p_motivo,
      alterado_por = auth.uid(),
      alterado_em = now()
  where unidade_id = p_unidade_id and numero_os = p_numero_os
    and tipo_servico_id is not distinct from p_tipo_servico_id and linha = p_linha;

  perform set_config('caixa.permitir_correcao_orcamento', '0', true);
end;
$$;

grant execute on function admin_corrigir_orcamento_cr(uuid, text, uuid, linha_tipo, numeric, text) to authenticated;
