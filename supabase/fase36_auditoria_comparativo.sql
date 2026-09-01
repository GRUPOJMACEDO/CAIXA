-- ============================================================
-- Fase 36 — Gráfico comparativo (em dia × retroativo) na tela de
-- Lançamentos retroativos, quando uma única unidade é selecionada.
--
-- Sem security definer: a tela só é acessível pra quem já enxerga
-- tudo (Administrador/Diretor/Auditoria), então a regra normal de
-- RLS já garante a visão completa.
--
-- Rode no SQL Editor do seu projeto Supabase.
-- ============================================================

create or replace function auditoria_comparativo_unidade(
  unidade_id_param uuid,
  data_inicio date,
  data_fim_excl date
)
returns table (dia date, valor_no_prazo numeric, valor_retroativo numeric, qtd_no_prazo bigint, qtd_retroativo bigint)
language sql stable as $$
  select
    l.data as dia,
    coalesce(sum(l.valor_pago) filter (
      where l.data >= date(coalesce(l.alterado_em, l.criado_em) at time zone 'America/Sao_Paulo')
    ), 0) as valor_no_prazo,
    coalesce(sum(l.valor_pago) filter (
      where l.data < date(coalesce(l.alterado_em, l.criado_em) at time zone 'America/Sao_Paulo')
    ), 0) as valor_retroativo,
    count(*) filter (
      where l.data >= date(coalesce(l.alterado_em, l.criado_em) at time zone 'America/Sao_Paulo')
    ) as qtd_no_prazo,
    count(*) filter (
      where l.data < date(coalesce(l.alterado_em, l.criado_em) at time zone 'America/Sao_Paulo')
    ) as qtd_retroativo
  from lancamentos l
  where l.unidade_id = unidade_id_param
    and l.data >= data_inicio
    and l.data < data_fim_excl
  group by l.data
  order by l.data;
$$;

grant execute on function auditoria_comparativo_unidade(uuid, date, date) to authenticated;
