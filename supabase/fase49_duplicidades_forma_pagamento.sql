-- ============================================================
-- Fase 49 — Duplicidades: mostrar a forma de pagamento de cada
-- lançamento na listagem (pedido do usuário).
--
-- Só adiciona forma_pagamento e formas_pagamento (usado quando o
-- lançamento foi feito em "MÚLTIPLAS" formas) ao retorno da função
-- duplicidades_os — o resto da função fica igual.
--
-- Rode no SQL Editor do seu projeto Supabase.
--
-- O Postgres não deixa trocar o formato de retorno de uma função com
-- "create or replace" — precisa apagar a função antiga primeiro.
-- ============================================================

drop function if exists duplicidades_os(uuid[]);

create or replace function duplicidades_os(unidade_ids uuid[] default null)
returns table (
  id uuid,
  numero_os text,
  unidade_id uuid,
  unidade_nome text,
  linha linha_tipo,
  tipo_servico_id uuid,
  tipo_servico_nome text,
  categoria_nome text,
  data date,
  valor_pago numeric,
  orcamento_aprovado numeric,
  forma_pagamento text,
  formas_pagamento jsonb,
  atendente_nome text,
  atendente_login text,
  criado_em timestamptz,
  nivel int,
  qtd_no_grupo bigint
)
language sql stable as $$
  with grupos as (
    select unidade_id, numero_os, count(*) as qtd
    from lancamentos
    group by unidade_id, numero_os
    having count(*) > 1
  )
  select
    l.id, l.numero_os, l.unidade_id, un.nome as unidade_nome, l.linha,
    l.tipo_servico_id, ts.nome as tipo_servico_nome, c.nome as categoria_nome,
    l.data, l.valor_pago, l.orcamento_aprovado,
    l.forma_pagamento, l.formas_pagamento,
    us.nome_completo as atendente_nome, us.login as atendente_login,
    l.criado_em,
    (
      select max(
        case
          when l2.tipo_servico_id is not distinct from l.tipo_servico_id
           and l2.valor_pago is not distinct from l.valor_pago
           and l2.data is not distinct from l.data then 4
          when l2.tipo_servico_id is not distinct from l.tipo_servico_id
           and l2.valor_pago is not distinct from l.valor_pago then 3
          when l2.tipo_servico_id is not distinct from l.tipo_servico_id then 2
          else 1
        end
      )
      from lancamentos l2
      where l2.unidade_id = l.unidade_id and l2.numero_os = l.numero_os and l2.id <> l.id
    ) as nivel,
    g.qtd as qtd_no_grupo
  from lancamentos l
  join grupos g on g.unidade_id = l.unidade_id and g.numero_os = l.numero_os
  join unidades un on un.id = l.unidade_id
  left join tipos_servico ts on ts.id = l.tipo_servico_id
  left join categorias c on c.id = l.categoria_id
  join usuarios us on us.id = l.atendente_id
  where (unidade_ids is null or array_length(unidade_ids, 1) is null or l.unidade_id = any(unidade_ids))
  order by l.unidade_id, l.numero_os, l.data desc;
$$;

grant execute on function duplicidades_os(uuid[]) to authenticated;
