-- ============================================================
-- Fase 44 — Estatísticas: filtro de semana/mês específico, CI/IH,
-- categoria, e junção visual de TV + DTV (só nesta tela).
--
-- • categoria_efetiva_estatisticas(nome): TV e DTV contam juntas,
--   sob o rótulo "DTV" — só dentro das funções de Estatísticas,
--   não mexe em Lançamentos, Consulta, Pareto, Vendedores etc.
-- • As 4 funções de fase 31 ganham 2 parâmetros novos:
--     linha_param      → 'ci' | 'ih' | null (null = as duas)
--     categoria_param  → nome da categoria já "efetiva" (pós
--                         junção TV+DTV), ou null = todas
-- • estatisticas_por_categoria passa a agrupar pelo nome efetivo,
--   então TV e DTV aparecem como uma linha só ("DTV").
--
-- Rode no SQL Editor do seu projeto Supabase.
-- ============================================================

create or replace function categoria_efetiva_estatisticas(nome_categoria text)
returns text
language sql
immutable
as $$
  select case when nome_categoria in ('TV', 'DTV') then 'DTV' else nome_categoria end;
$$;

-- Assinatura antiga (4 parâmetros) some — vira a de 6 parâmetros abaixo.
-- Sem isso, o Postgres manteria as duas funções (sobrecarga), em vez de
-- substituir; e o front-end passa os 6 parâmetros nomeados sempre.
drop function if exists estatisticas_series_diarias(date, date, uuid, text);
drop function if exists estatisticas_por_hora(date, date, uuid, text);
drop function if exists estatisticas_mapa_calor(date, date, uuid, text);
drop function if exists estatisticas_por_categoria(date, date, uuid, text);

-- 1) Série diária
create or replace function estatisticas_series_diarias(
  data_inicio date, data_fim_excl date, unidade_id_param uuid default null, marca_param text default null,
  linha_param linha_tipo default null, categoria_param text default null
)
returns table (dia date, linha linha_tipo, qtd bigint, valor_total numeric)
language sql stable as $$
  select l.data as dia, l.linha, count(*) as qtd, coalesce(sum(l.valor_pago), 0) as valor_total
  from lancamentos l
  join unidades un on un.id = l.unidade_id
  left join categorias c on c.id = l.categoria_id
  where l.data >= data_inicio and l.data < data_fim_excl
    and (unidade_id_param is null or l.unidade_id = unidade_id_param)
    and (marca_param is null or un.nome like marca_param || '%')
    and (linha_param is null or l.linha = linha_param)
    and (categoria_param is null or categoria_efetiva_estatisticas(c.nome) = categoria_param)
  group by l.data, l.linha
  order by l.data;
$$;

-- 2) Pareto por horário do dia (0–23), em horário de Brasília
create or replace function estatisticas_por_hora(
  data_inicio date, data_fim_excl date, unidade_id_param uuid default null, marca_param text default null,
  linha_param linha_tipo default null, categoria_param text default null
)
returns table (hora int, qtd bigint)
language sql stable as $$
  select extract(hour from l.criado_em at time zone 'America/Sao_Paulo')::int as hora, count(*) as qtd
  from lancamentos l
  join unidades un on un.id = l.unidade_id
  left join categorias c on c.id = l.categoria_id
  where l.data >= data_inicio and l.data < data_fim_excl
    and (unidade_id_param is null or l.unidade_id = unidade_id_param)
    and (marca_param is null or un.nome like marca_param || '%')
    and (linha_param is null or l.linha = linha_param)
    and (categoria_param is null or categoria_efetiva_estatisticas(c.nome) = categoria_param)
  group by 1
  order by 1;
$$;

-- 3) Mapa de calor dia da semana × hora (0=domingo)
create or replace function estatisticas_mapa_calor(
  data_inicio date, data_fim_excl date, unidade_id_param uuid default null, marca_param text default null,
  linha_param linha_tipo default null, categoria_param text default null
)
returns table (dia_semana int, hora int, qtd bigint)
language sql stable as $$
  select
    extract(dow from l.data)::int as dia_semana,
    extract(hour from l.criado_em at time zone 'America/Sao_Paulo')::int as hora,
    count(*) as qtd
  from lancamentos l
  join unidades un on un.id = l.unidade_id
  left join categorias c on c.id = l.categoria_id
  where l.data >= data_inicio and l.data < data_fim_excl
    and (unidade_id_param is null or l.unidade_id = unidade_id_param)
    and (marca_param is null or un.nome like marca_param || '%')
    and (linha_param is null or l.linha = linha_param)
    and (categoria_param is null or categoria_efetiva_estatisticas(c.nome) = categoria_param)
  group by 1, 2
  order by 1, 2;
$$;

-- 4) Distribuição por categoria (quantidade e valor) — TV e DTV
--    somadas sob o rótulo "DTV"
create or replace function estatisticas_por_categoria(
  data_inicio date, data_fim_excl date, unidade_id_param uuid default null, marca_param text default null,
  linha_param linha_tipo default null, categoria_param text default null
)
returns table (categoria text, qtd bigint, valor_total numeric)
language sql stable as $$
  select coalesce(categoria_efetiva_estatisticas(c.nome), 'Sem categoria') as categoria, count(*) as qtd, coalesce(sum(l.valor_pago), 0) as valor_total
  from lancamentos l
  join unidades un on un.id = l.unidade_id
  left join categorias c on c.id = l.categoria_id
  where l.data >= data_inicio and l.data < data_fim_excl
    and (unidade_id_param is null or l.unidade_id = unidade_id_param)
    and (marca_param is null or un.nome like marca_param || '%')
    and (linha_param is null or l.linha = linha_param)
    and (categoria_param is null or categoria_efetiva_estatisticas(c.nome) = categoria_param)
  group by categoria_efetiva_estatisticas(c.nome)
  order by qtd desc;
$$;

grant execute on function categoria_efetiva_estatisticas(text) to authenticated;
grant execute on function estatisticas_series_diarias(date, date, uuid, text, linha_tipo, text) to authenticated;
grant execute on function estatisticas_por_hora(date, date, uuid, text, linha_tipo, text) to authenticated;
grant execute on function estatisticas_mapa_calor(date, date, uuid, text, linha_tipo, text) to authenticated;
grant execute on function estatisticas_por_categoria(date, date, uuid, text, linha_tipo, text) to authenticated;
