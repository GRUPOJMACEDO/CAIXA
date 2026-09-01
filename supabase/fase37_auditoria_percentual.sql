-- ============================================================
-- Fase 37 — Card de percentual (em dia × retroativo) na tela de
-- Lançamentos retroativos.
--
-- A tela já lista só os retroativos; pra calcular o percentual
-- preciso saber o TOTAL geral de lançamentos (retroativos + em
-- dia) com os mesmos filtros de unidade/cargo/usuário.
--
-- Rode no SQL Editor do seu projeto Supabase.
-- ============================================================

create or replace function auditoria_total_lancamentos(
  unidade_ids uuid[] default null,
  cargos text[] default null,
  usuario_ids uuid[] default null
)
returns table (total bigint, valor_total numeric)
language sql stable as $$
  select count(*), coalesce(sum(l.valor_pago), 0)
  from lancamentos l
  join usuarios resp on resp.id = coalesce(l.alterado_por, l.criado_por, l.atendente_id)
  where (unidade_ids is null or array_length(unidade_ids, 1) is null or l.unidade_id = any(unidade_ids))
    and (cargos is null or array_length(cargos, 1) is null or resp.cargo::text = any(cargos))
    and (usuario_ids is null or array_length(usuario_ids, 1) is null or resp.id = any(usuario_ids));
$$;

grant execute on function auditoria_total_lancamentos(uuid[], text[], uuid[]) to authenticated;
