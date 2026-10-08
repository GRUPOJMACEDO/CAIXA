-- ============================================================
-- Fase 60 — Reduz o consumo de Egress (tráfego) do Supabase
--
-- 1) contar_duplicidades_pendentes: o contador do menu
--    "Duplicidades" (que roda a cada 4 min para toda a gestão)
--    baixava TODOS os lançamentos de toda OS com mais de um
--    lançamento + a tabela de revisadas inteira, só para mostrar
--    um número. Agora o banco devolve só o número.
--
-- 2) valor_pago_por_dia: Acompanhamento e Acompanhamento semanal
--    baixavam lançamento por lançamento para somar no navegador.
--    Agora o banco já devolve a soma por unidade + dia.
--
-- As duas funções rodam com a permissão de quem está logado
-- (mesmas regras de unidade/RLS de antes) — o resultado é igual.
--
-- Pode rodar mais de uma vez. Rode no SQL Editor do Supabase
-- (depois da fase 59).
-- ============================================================

create or replace function contar_duplicidades_pendentes(unidade_ids uuid[] default null)
returns integer
language sql stable as $$
  select count(*)::int
  from (
    select l.unidade_id, l.numero_os
    from lancamentos l
    where (unidade_ids is null or array_length(unidade_ids, 1) is null or l.unidade_id = any(unidade_ids))
    group by l.unidade_id, l.numero_os
    having count(*) > 1
  ) g
  where not exists (
    select 1 from duplicidades_revisadas r
    where r.unidade_id = g.unidade_id and r.numero_os = g.numero_os
  );
$$;
grant execute on function contar_duplicidades_pendentes(uuid[]) to authenticated;

create or replace function valor_pago_por_dia(unidade_ids uuid[], data_inicio date)
returns table (unidade_id uuid, data date, valor_pago numeric)
language sql stable as $$
  select l.unidade_id, l.data, coalesce(sum(l.valor_pago), 0) as valor_pago
  from lancamentos l
  where l.unidade_id = any(unidade_ids)
    and l.data >= data_inicio
  group by l.unidade_id, l.data
  order by l.unidade_id, l.data;
$$;
grant execute on function valor_pago_por_dia(uuid[], date) to authenticated;
