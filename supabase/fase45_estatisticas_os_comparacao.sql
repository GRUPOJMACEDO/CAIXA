-- ============================================================
-- Fase 45 — Estatísticas: ticket médio por OS (não por lançamento),
-- comparação de ticket médio entre unidades, e filtro de
-- Taxa de Análise / Taxa de Visita.
--
-- • estatisticas_kpis_os(): usada só pelos CARDS. Conta Qtd. OS
--   distinta (unidade_id + numero_os) em vez de linhas de
--   lançamento — uma OS com vários lançamentos conta 1 vez, com
--   a soma de todos os valor_pago. Os 4 gráficos da fase 31/44
--   continuam contando por lançamento, sem mudança.
-- • estatisticas_comparacao_unidades(): nova visualização — Qtd
--   OS / valor vendido / ticket médio por unidade, pra comparar
--   2+ unidades lado a lado.
-- • modo_taxa ('excluir' | 'incluir' | 'somente'): identifica taxa
--   pelo nome do tipo de serviço contendo "TAXA" (ex: "TV - TAXA
--   DE ANÁLISE"), sem depender de categoria específica.
--     - 'excluir' (padrão): taxas ficam de fora dos totais.
--     - 'incluir': taxas entram nos totais, junto com o resto.
--     - 'somente': só as taxas (pra tabela dedicada de taxas).
--
-- Rode no SQL Editor do seu projeto Supabase.
-- ============================================================

create or replace function estatisticas_kpis_os(
  data_inicio date, data_fim_excl date, unidade_id_param uuid default null, marca_param text default null,
  linha_param linha_tipo default null, categoria_param text default null, modo_taxa text default 'excluir'
)
returns table (qtd_os bigint, valor_total numeric)
language sql stable as $$
  select
    count(distinct (l.unidade_id, l.numero_os)) as qtd_os,
    coalesce(sum(l.valor_pago), 0) as valor_total
  from lancamentos l
  join unidades un on un.id = l.unidade_id
  left join categorias c on c.id = l.categoria_id
  left join tipos_servico ts on ts.id = l.tipo_servico_id
  where l.data >= data_inicio and l.data < data_fim_excl
    and (unidade_id_param is null or l.unidade_id = unidade_id_param)
    and (marca_param is null or un.nome like marca_param || '%')
    and (linha_param is null or l.linha = linha_param)
    and (categoria_param is null or categoria_efetiva_estatisticas(c.nome) = categoria_param)
    and (
      case modo_taxa
        when 'somente' then ts.nome ilike '%TAXA%'
        when 'incluir' then true
        else coalesce(ts.nome not ilike '%TAXA%', true)
      end
    );
$$;

create or replace function estatisticas_comparacao_unidades(
  data_inicio date, data_fim_excl date, unidade_ids uuid[],
  linha_param linha_tipo default null, categoria_param text default null, modo_taxa text default 'excluir'
)
returns table (unidade_id uuid, qtd_os bigint, valor_total numeric)
language sql stable as $$
  select
    l.unidade_id,
    count(distinct (l.unidade_id, l.numero_os)) as qtd_os,
    coalesce(sum(l.valor_pago), 0) as valor_total
  from lancamentos l
  left join categorias c on c.id = l.categoria_id
  left join tipos_servico ts on ts.id = l.tipo_servico_id
  where l.data >= data_inicio and l.data < data_fim_excl
    and l.unidade_id = any(unidade_ids)
    and (linha_param is null or l.linha = linha_param)
    and (categoria_param is null or categoria_efetiva_estatisticas(c.nome) = categoria_param)
    and (
      case modo_taxa
        when 'somente' then ts.nome ilike '%TAXA%'
        when 'incluir' then true
        else coalesce(ts.nome not ilike '%TAXA%', true)
      end
    )
  group by l.unidade_id;
$$;

grant execute on function estatisticas_kpis_os(date, date, uuid, text, linha_tipo, text, text) to authenticated;
grant execute on function estatisticas_comparacao_unidades(date, date, uuid[], linha_tipo, text, text) to authenticated;
