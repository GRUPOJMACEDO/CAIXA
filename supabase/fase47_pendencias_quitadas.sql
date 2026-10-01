-- ============================================================
-- Fase 47 — "Pendências já quitadas" (Configurações > Administrador)
--
-- Mesma ideia do diagnostico_falsas_pendencias_cr.sql de antes, só que
-- agora como uma função que a tela usa pra listar — e a tela permite
-- selecionar e excluir (ou colar uma lista de OS) direto, sem precisar
-- rodar SQL manualmente toda vez.
--
-- O que é "pendência já quitada": uma conta (unidade + OS + tipo de
-- serviço + linha) que ainda aparece com saldo em aberto no Contas a
-- Receber, mas que, somando TODOS os lançamentos daquela mesma OS —
-- mesmo os com um Tipo de Serviço diferente — já está paga
-- integralmente (ou paga a mais). É o padrão de quem pagou o restante
-- escolhendo por engano um Tipo de Serviço diferente do lançamento
-- original, em vez de dar baixa pelo Contas a Receber.
--
-- Sem security definer: cada unidade só vê as próprias contas (RLS de
-- sempre), exceto Administrador/Diretor/ADM/Auditoria que já veem
-- tudo. A tela em si só é oferecida pro Administrador.
--
-- Rode no SQL Editor do seu projeto Supabase.
-- ============================================================

create or replace function pendencias_quitadas_cr(unidade_ids uuid[] default null)
returns table (
  unidade_id uuid,
  unidade_nome text,
  numero_os text,
  linha linha_tipo,
  tipo_servico_id uuid,
  tipo_servico_nome text,
  orcamento_desta_conta numeric,
  pago_nesta_conta numeric,
  falta_nesta_conta numeric,
  orcamento_total_os numeric,
  pago_total_os numeric,
  saldo_real_da_os numeric,
  qtd_contas_na_os bigint,
  ultimo_lancamento date
)
language sql stable as $$
  with agg as (
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
  )
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
    agg.qtd_contas_na_os,
    cr.ultimo_lancamento
  from vw_contas_a_receber cr
  join unidades un on un.id = cr.unidade_id
  join agg on agg.unidade_id = cr.unidade_id and agg.numero_os = cr.numero_os
  where agg.orcamento_total_os - agg.pago_total_os <= 0.01
    and (unidade_ids is null or array_length(unidade_ids, 1) is null or cr.unidade_id = any(unidade_ids))
  order by cr.falta_pagar desc;
$$;

grant execute on function pendencias_quitadas_cr(uuid[]) to authenticated;

-- Reconfirma, na hora de excluir, que uma conta específica ainda é
-- mesmo uma "pendência já quitada" — evita apagar algo que mudou de
-- estado entre a tela carregar e o clique em excluir (ex: alguém deu
-- baixa de verdade, ou lançou outro valor, nesse meio tempo).
create or replace function confirmar_pendencia_quitada(
  p_unidade_id uuid,
  p_numero_os text,
  p_tipo_servico_id uuid,
  p_linha linha_tipo
)
returns boolean
language sql stable as $$
  select coalesce(
    (
      select sum(orcamento_por_conta) - sum(pago_por_conta) <= 0.01
      from (
        select tipo_servico_id, linha,
          max(orcamento_aprovado) as orcamento_por_conta,
          sum(valor_pago) as pago_por_conta
        from lancamentos
        where unidade_id = p_unidade_id and numero_os = p_numero_os
        group by tipo_servico_id, linha
      ) sub
    ),
    false
  )
  and exists (
    select 1 from lancamentos
    where unidade_id = p_unidade_id and numero_os = p_numero_os
      and tipo_servico_id is not distinct from p_tipo_servico_id and linha = p_linha
  );
$$;

grant execute on function confirmar_pendencia_quitada(uuid, text, uuid, linha_tipo) to authenticated;
