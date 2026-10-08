-- ============================================================
-- Fase 62 — Financeiro > Gráficos: série no tempo das taxas
--
-- taxas_cartao_serie: para as unidades e o período escolhidos,
-- devolve uma linha por dia, semana (domingo a sábado) ou mês com:
-- total recebido, recebido em cartão, taxas, e quanto entrou em
-- débito, crédito à vista, parcelado e "outros" (PIX, dinheiro,
-- boleto). Usa as mesmas regras e a mesma tabela de taxas da
-- fase 61 (com histórico de vigência).
--
-- Somente Administrador e Diretor. Pode rodar mais de uma vez.
-- Rode no SQL Editor do Supabase (depois da fase 61).
-- ============================================================

create or replace function taxas_cartao_serie(
  unidade_ids uuid[],
  data_inicio date,
  data_fim_excl date,
  agrupamento text default 'mes'
)
returns table (
  periodo date,
  valor_recebido numeric,
  valor_cartao numeric,
  valor_taxas numeric,
  valor_debito numeric,
  valor_credito_vista numeric,
  valor_parcelado numeric,
  valor_outros numeric,
  taxas_debito numeric,
  taxas_credito_vista numeric,
  taxas_parcelado numeric,
  qtd_lancamentos bigint
)
language plpgsql stable security definer set search_path = public as $$
begin
  if coalesce(meu_cargo()::text, '') not in ('administrador', 'diretor') then
    raise exception 'SEM_PERMISSAO: somente Administrador e Diretor.';
  end if;
  if agrupamento not in ('dia', 'semana', 'mes') then
    raise exception 'AGRUPAMENTO_INVALIDO: use dia, semana ou mes.';
  end if;
  return query
    select
      case agrupamento
        when 'dia' then p.data
        when 'semana' then p.data - extract(dow from p.data)::int   -- domingo
        else date_trunc('month', p.data)::date
      end as periodo_calc,
      coalesce(sum(p.valor), 0),
      coalesce(sum(p.valor) filter (where p.tipo_taxa is not null), 0),
      coalesce(sum(p.valor_taxa), 0),
      coalesce(sum(p.valor) filter (where p.tipo_taxa = 'debito'), 0),
      coalesce(sum(p.valor) filter (where p.tipo_taxa = 'credito' and coalesce(p.parcelas, 1) = 1), 0),
      coalesce(sum(p.valor) filter (where p.tipo_taxa = 'credito' and p.parcelas > 1), 0),
      coalesce(sum(p.valor) filter (where p.tipo_taxa is null), 0),
      coalesce(sum(p.valor_taxa) filter (where p.tipo_taxa = 'debito'), 0),
      coalesce(sum(p.valor_taxa) filter (where p.tipo_taxa = 'credito' and coalesce(p.parcelas, 1) = 1), 0),
      coalesce(sum(p.valor_taxa) filter (where p.tipo_taxa = 'credito' and p.parcelas > 1), 0),
      count(distinct p.lancamento_id)
    from _taxas_pagamentos(unidade_ids, data_inicio, data_fim_excl) p
    group by 1
    order by 1;
end;
$$;
grant execute on function taxas_cartao_serie(uuid[], date, date, text) to authenticated;
