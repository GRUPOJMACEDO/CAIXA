-- ============================================================
-- Fase 35 — Vendedores (abas Orçamentos e Acessórios) ganham
-- seletor de semana/mês, igual os demais dashboards.
--
-- As views antigas (vw_dashboard_vendedores / vw_dashboard_vendedores_ow)
-- só olhavam o mês atual. Esta função faz a mesma coisa, mas com
-- qualquer período — com SECURITY DEFINER, senão cada usuário só
-- veria a própria unidade, e o ranking precisa continuar mostrando
-- todo mundo (igual sempre foi).
--
-- somente_acessorio = true  → equivalente à aba "Acessórios"
-- somente_acessorio = false → equivalente à aba "Orçamentos"
--
-- Rode no SQL Editor do seu projeto Supabase.
-- ============================================================

create or replace function vendedores_por_periodo(
  data_inicio date,
  data_fim_excl date,
  linha_param linha_tipo default null,
  somente_acessorio boolean default false
)
returns table (
  usuario_id uuid,
  nome_completo text,
  unidade_id uuid,
  unidade_nome text,
  linha linha_tipo,
  orcamento_aprovado numeric,
  valor_pago numeric,
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
      and (
        (somente_acessorio and categoria_id = (select id from categorias where nome = 'Acessório'))
        or
        (not somente_acessorio and (categoria_id is null or categoria_id <> (select id from categorias where nome = 'Acessório')))
      )
  ),
  pagos as (
    select atendente_id as usuario_id, unidade_id, linha, sum(valor_pago) as valor_pago, count(distinct numero_os) as qtd_os
    from base group by atendente_id, unidade_id, linha
  ),
  orcamentos as (
    select usuario_id, unidade_id, linha, sum(orcamento_aprovado) as orcamento_aprovado
    from (
      select atendente_id as usuario_id, unidade_id, linha, numero_os, tipo_servico_id, max(orcamento_aprovado) as orcamento_aprovado
      from base group by atendente_id, unidade_id, linha, numero_os, tipo_servico_id
    ) os_unicas
    group by usuario_id, unidade_id, linha
  )
  select
    us.id as usuario_id,
    us.nome_completo,
    un.id as unidade_id,
    un.nome as unidade_nome,
    coalesce(p.linha, o.linha, 'ci'::linha_tipo) as linha,
    coalesce(o.orcamento_aprovado, 0) as orcamento_aprovado,
    coalesce(p.valor_pago, 0) as valor_pago,
    coalesce(p.qtd_os, 0) as qtd_os
  from usuarios us
  join usuario_unidades uu on uu.usuario_id = us.id
  join unidades un on un.id = uu.unidade_id
  left join pagos p on p.usuario_id = us.id and p.unidade_id = un.id
  left join orcamentos o on o.usuario_id = us.id and o.unidade_id = un.id and o.linha = p.linha
  where us.ativo = true and p.valor_pago is not null;
$$;

grant execute on function vendedores_por_periodo(date, date, linha_tipo, boolean) to authenticated;
