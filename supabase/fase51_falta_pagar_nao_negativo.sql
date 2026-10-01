-- ============================================================
-- Fase 51 — "Falta pagar" não pode ficar negativo nos dashboards
-- de Valores (Diário/Semanal/Mensal).
--
-- Problema: a função valores_por_periodo somava "orçamento" e
-- "pago" cada um separado, por unidade. Quando alguém lança uma
-- taxa de análise (ou qualquer serviço) e paga na hora SEM
-- preencher o orçamento (orcamento_aprovado = 0), esse valor pago
-- entra na soma de "Pago" mas não entra em nada na soma de
-- "Orçamento" — aí, somando todas as OS do dia, o total pago pode
-- passar o total de orçamento e a tela mostra "Falta pagar"
-- negativo (ex.: R$ -60,00), mesmo nenhuma OS estando realmente
-- paga a mais que o próprio orçamento dela.
--
-- Correção: calcular o saldo (orçamento - pago) por OS + tipo de
-- serviço primeiro, travar em zero quando o resultado for negativo
-- (greatest(..., 0)), e só depois somar por unidade. Isso vira uma
-- nova coluna falta_pagar devolvida pela função, em vez do
-- front-end calcular orçamento - pago direto.
--
-- Precisa apagar a função antiga primeiro, porque o Postgres não
-- deixa mudar as colunas de retorno de uma função existente com
-- "create or replace".
--
-- Rode no SQL Editor do seu projeto Supabase.
-- ============================================================

drop function if exists valores_por_periodo(date, date, linha_tipo);

create or replace function valores_por_periodo(data_inicio date, data_fim_excl date, linha_param linha_tipo default null)
returns table (
  unidade_id uuid,
  unidade_nome text,
  linha linha_tipo,
  orcamento_aprovado numeric,
  valor_pago numeric,
  falta_pagar numeric,
  qtd_os bigint
)
language sql
security definer
set search_path = public
stable
as $$
  with base as (
    select *
    from lancamentos
    where data >= data_inicio
      and data < data_fim_excl
      and (linha_param is null or linha = linha_param)
  ),
  pagos as (
    select unidade_id, linha, sum(valor_pago) as valor_pago, count(distinct numero_os) as qtd_os
    from base group by unidade_id, linha
  ),
  -- orçamento e saldo calculados por OS + tipo de serviço, pra não
  -- misturar o saldo de uma taxa sem orçamento com o de outra OS
  os_unicas as (
    select unidade_id, linha, numero_os, tipo_servico_id,
      max(orcamento_aprovado) as orcamento_aprovado,
      sum(valor_pago) as valor_pago_os
    from base group by unidade_id, linha, numero_os, tipo_servico_id
  ),
  orcamentos as (
    select unidade_id, linha, sum(orcamento_aprovado) as orcamento_aprovado
    from os_unicas
    group by unidade_id, linha
  ),
  saldos as (
    select unidade_id, linha,
      sum(greatest(orcamento_aprovado - valor_pago_os, 0)) as falta_pagar
    from os_unicas
    group by unidade_id, linha
  )
  select
    u.id as unidade_id,
    u.nome as unidade_nome,
    l.linha,
    coalesce(o.orcamento_aprovado, 0) as orcamento_aprovado,
    coalesce(p.valor_pago, 0) as valor_pago,
    coalesce(s.falta_pagar, 0) as falta_pagar,
    coalesce(p.qtd_os, 0) as qtd_os
  from unidades u
  cross join (select unnest(enum_range(null::linha_tipo)) as linha) l
  left join pagos p on p.unidade_id = u.id and p.linha = l.linha
  left join orcamentos o on o.unidade_id = u.id and o.linha = l.linha
  left join saldos s on s.unidade_id = u.id and s.linha = l.linha
  where u.ativo = true
    and ((l.linha = 'ci' and u.atende_ci) or (l.linha = 'ih' and u.atende_ih))
    and (linha_param is null or l.linha = linha_param);
$$;

grant execute on function valores_por_periodo(date, date, linha_tipo) to authenticated;
