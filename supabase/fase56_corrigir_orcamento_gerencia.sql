-- ============================================================
-- Fase 56 — Libera "Corrigir orçamento" (Contas a Receber e
-- Consulta) também para o cargo Gerência, além do Administrador.
--
-- A função admin_corrigir_orcamento_cr (fase 48) checava
-- meu_cargo() <> 'administrador' e barrava qualquer outro cargo.
-- Agora aceita Administrador OU Gerência. O restante da função
-- (motivo obrigatório, não deixar orçamento menor que o já pago,
-- registro no log) continua igual.
--
-- Rode no SQL Editor do seu projeto Supabase (depois da fase 48).
-- ============================================================

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
  if meu_cargo() not in ('administrador', 'gerencia') then
    raise exception 'Apenas o Administrador ou a Gerência podem corrigir valores do Contas a Receber.';
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
      motivo_exclusao = '[Correção de orçamento] ' || p_motivo,
      alterado_por = auth.uid(),
      alterado_em = now()
  where unidade_id = p_unidade_id and numero_os = p_numero_os
    and tipo_servico_id is not distinct from p_tipo_servico_id and linha = p_linha;

  perform set_config('caixa.permitir_correcao_orcamento', '0', true);
end;
$$;

grant execute on function admin_corrigir_orcamento_cr(uuid, text, uuid, linha_tipo, numeric, text) to authenticated;
