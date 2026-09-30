-- ============================================================
-- Diagnóstico — Contas a Receber com pendência "fantasma"
--
-- Não altera nada no banco (só SELECT). Lista toda OS que aparece
-- com saldo em aberto no Contas a Receber (vw_contas_a_receber),
-- mas que, somando TODOS os lançamentos daquela mesma OS — mesmo
-- os com um Tipo de Serviço diferente — já está paga integralmente
-- (ou paga a mais). É o padrão de quem fez o pagamento seguinte
-- escolhendo por engano um Tipo de Serviço diferente do lançamento
-- original, em vez de ter dado baixa pelo Contas a Receber.
--
-- Como usar o resultado:
-- Para cada linha, vá em Consulta, busque pelo "numero_os", ache o
-- lançamento com o "tipo_servico_nome" ERRADO (normalmente o mais
-- recente) e corrija o campo "Tipo de serviço" dele pra bater com
-- o original (mesmo nome mostrado na coluna "tipo_servico_nome"
-- desta pendência). A pendência some sozinha assim que a view for
-- recalculada — nenhum lançamento é apagado, o histórico de
-- pagamento continua intacto.
--
-- Rode no SQL Editor do seu projeto Supabase.
-- ============================================================

select
  cr.unidade_id,
  un.nome as unidade_nome,
  cr.numero_os,
  cr.linha,
  cr.tipo_servico_id,
  cr.tipo_servico_nome,
  cr.orcamento_aprovado as orcamento_desta_conta,
  cr.total_pago as pago_nesta_conta,
  cr.falta_pagar as falta_nesta_conta,
  agg.orcamento_total_os,
  agg.pago_total_os,
  round(agg.orcamento_total_os - agg.pago_total_os, 2) as saldo_real_da_os,
  agg.qtd_contas_na_os
from vw_contas_a_receber cr
join unidades un on un.id = cr.unidade_id
join (
  select
    unidade_id,
    numero_os,
    sum(orcamento_por_conta) as orcamento_total_os,
    sum(pago_por_conta) as pago_total_os,
    count(*) as qtd_contas_na_os
  from (
    select unidade_id, numero_os, tipo_servico_id, linha,
      max(orcamento_aprovado) as orcamento_por_conta,
      sum(valor_pago) as pago_por_conta
    from lancamentos
    group by unidade_id, numero_os, tipo_servico_id, linha
  ) sub
  group by unidade_id, numero_os
) agg on agg.unidade_id = cr.unidade_id and agg.numero_os = cr.numero_os
where agg.orcamento_total_os - agg.pago_total_os <= 0.01  -- a OS inteira já está paga (ou quase)
order by cr.falta_pagar desc;

-- ------------------------------------------------------------
-- Bônus: Nº de OS que aparece em mais de uma unidade — pode ser
-- sinal de lançamento feito na unidade errada (o que também gera
-- pendência fantasma, só que entre unidades em vez de tipos de
-- serviço).
-- ------------------------------------------------------------
select
  numero_os,
  count(distinct unidade_id) as qtd_unidades,
  array_agg(distinct un.nome) as unidades
from lancamentos l
join unidades un on un.id = l.unidade_id
group by numero_os
having count(distinct l.unidade_id) > 1
order by numero_os;
