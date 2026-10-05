-- ============================================================
-- Fase 57 — Estatísticas: Gerência pode comparar todas as unidades
--
-- Hoje a "Comparação entre unidades" só enxerga as unidades que o
-- usuário tem vinculadas (a segurança de linha do banco esconde o
-- resto). Aqui a Gerência passa a poder escolher QUALQUER unidade
-- ativa nesse item — e só nele: o restante das Estatísticas, o
-- detalhe de lançamentos e as demais telas continuam limitados às
-- unidades dela.
--
-- 1) estatisticas_comparacao_unidades vira "security definer", mas
--    só devolve unidades fora do vínculo do usuário se o cargo for
--    Gerência, Administrador ou Diretor. Para os demais cargos, só as
--    unidades vinculadas (mesmo comportamento de antes).
-- 2) unidades_para_comparacao() lista as unidades que aparecem no
--    seletor da comparação.
--
-- Rode no SQL Editor do Supabase (depois da fase 56).
-- ============================================================

create or replace function estatisticas_comparacao_unidades(
  data_inicio date, data_fim_excl date, unidade_ids uuid[],
  linha_param linha_tipo default null, categoria_param text default null, modo_taxa text default 'excluir'
)
returns table (unidade_id uuid, qtd_os bigint, valor_total numeric)
language sql stable
security definer
set search_path = public
as $$
  with filtro as (
    select l.unidade_id, l.numero_os, l.data, l.valor_pago
    from lancamentos l
    left join categorias c on c.id = l.categoria_id
    left join tipos_servico ts on ts.id = l.tipo_servico_id
    where l.unidade_id = any(unidade_ids)
      and (
        meu_cargo() in ('gerencia', 'administrador', 'diretor')
        or exists (
          select 1 from usuario_unidades uu
          where uu.usuario_id = auth.uid() and uu.unidade_id = l.unidade_id
        )
      )
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

grant execute on function estatisticas_comparacao_unidades(date, date, uuid[], linha_tipo, text, text) to authenticated;

create or replace function unidades_para_comparacao()
returns table (id uuid, nome text)
language sql stable
security definer
set search_path = public
as $$
  select u.id, u.nome
  from unidades u
  where u.ativo
    and (
      meu_cargo() in ('gerencia', 'administrador', 'diretor')
      or exists (
        select 1 from usuario_unidades uu
        where uu.usuario_id = auth.uid() and uu.unidade_id = u.id
      )
    )
  order by u.nome;
$$;

grant execute on function unidades_para_comparacao() to authenticated;
