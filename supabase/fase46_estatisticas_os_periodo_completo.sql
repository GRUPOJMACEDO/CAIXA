-- ============================================================
-- Fase 46 — Corrige o critério de "OS dentro do período" nas
-- funções de comparação/cards da fase 45.
--
-- Problema: uma OS com lançamentos em datas de períodos diferentes
-- (ex: um em 17/09 — semana W38 — e outro em 21/09 — semana W39)
-- aparecia "quebrada": ao filtrar pela W39, só o lançamento de
-- 21/09 entrava, então a OS mostrava R$300 em vez dos R$600 reais
-- (soma dos dois lançamentos), divergindo da tela de Consulta.
--
-- Critério novo (confirmado com o usuário): se a OS teve QUALQUER
-- lançamento dentro do período filtrado (respeitando linha/
-- categoria/taxa), ela entra inteira — com a soma de TODOS os seus
-- lançamentos que casam com esses mesmos filtros, não só os que
-- caem dentro da janela de datas.
--
-- Substitui as duas funções da fase 45 (mesma assinatura).
-- Rode no SQL Editor do seu projeto Supabase.
-- ============================================================

create or replace function estatisticas_kpis_os(
  data_inicio date, data_fim_excl date, unidade_id_param uuid default null, marca_param text default null,
  linha_param linha_tipo default null, categoria_param text default null, modo_taxa text default 'excluir'
)
returns table (qtd_os bigint, valor_total numeric)
language sql stable as $$
  with filtro as (
    select l.unidade_id, l.numero_os, l.data, l.valor_pago
    from lancamentos l
    join unidades un on un.id = l.unidade_id
    left join categorias c on c.id = l.categoria_id
    left join tipos_servico ts on ts.id = l.tipo_servico_id
    where (unidade_id_param is null or l.unidade_id = unidade_id_param)
      and (marca_param is null or un.nome like marca_param || '%')
      and (linha_param is null or l.linha = linha_param)
      and (categoria_param is null or categoria_efetiva_estatisticas(c.nome) = categoria_param)
      and (
        case modo_taxa
          when 'somente' then ts.nome ilike '%TAXA%'
          when 'incluir' then true
          else coalesce(ts.nome not ilike '%TAXA%', true)
        end
      )
  ),
  os_no_periodo as (
    select distinct unidade_id, numero_os
    from filtro
    where data >= data_inicio and data < data_fim_excl
  ),
  valores_por_os as (
    select o.unidade_id, o.numero_os, sum(f.valor_pago) as valor_os
    from os_no_periodo o
    join filtro f on f.unidade_id = o.unidade_id and f.numero_os = o.numero_os
    group by o.unidade_id, o.numero_os
  )
  select count(*) as qtd_os, coalesce(sum(valor_os), 0) as valor_total
  from valores_por_os;
$$;

create or replace function estatisticas_comparacao_unidades(
  data_inicio date, data_fim_excl date, unidade_ids uuid[],
  linha_param linha_tipo default null, categoria_param text default null, modo_taxa text default 'excluir'
)
returns table (unidade_id uuid, qtd_os bigint, valor_total numeric)
language sql stable as $$
  with filtro as (
    select l.unidade_id, l.numero_os, l.data, l.valor_pago
    from lancamentos l
    left join categorias c on c.id = l.categoria_id
    left join tipos_servico ts on ts.id = l.tipo_servico_id
    where l.unidade_id = any(unidade_ids)
      and (linha_param is null or l.linha = linha_param)
      and (categoria_param is null or categoria_efetiva_estatisticas(c.nome) = categoria_param)
      and (
        case modo_taxa
          when 'somente' then ts.nome ilike '%TAXA%'
          when 'incluir' then true
          else coalesce(ts.nome not ilike '%TAXA%', true)
        end
      )
  ),
  os_no_periodo as (
    select distinct unidade_id, numero_os
    from filtro
    where data >= data_inicio and data < data_fim_excl
  ),
  valores_por_os as (
    select o.unidade_id, o.numero_os, sum(f.valor_pago) as valor_os
    from os_no_periodo o
    join filtro f on f.unidade_id = o.unidade_id and f.numero_os = o.numero_os
    group by o.unidade_id, o.numero_os
  )
  select unidade_id, count(*) as qtd_os, coalesce(sum(valor_os), 0) as valor_total
  from valores_por_os
  group by unidade_id;
$$;

grant execute on function estatisticas_kpis_os(date, date, uuid, text, linha_tipo, text, text) to authenticated;
grant execute on function estatisticas_comparacao_unidades(date, date, uuid[], linha_tipo, text, text) to authenticated;
