-- ============================================================
-- Fase 34 — Cargo Auditoria (somente leitura) + auditoria de
-- lançamentos em data retroativa
--
-- 1) Novo cargo "auditoria": enxerga todas as unidades, igual ao
--    Administrador/Diretor — mas SÓ LEITURA. Ele não entra em
--    nenhuma política de insert/update/delete, então mesmo que
--    a pessoa tente alterar algo, o banco recusa.
--
-- 2) Função que lista lançamentos cuja data é anterior ao dia em
--    que a pessoa realmente fez a ação (seja na criação, seja
--    numa edição posterior que jogou a data pra trás).
--
-- Rode no SQL Editor do seu projeto Supabase.
-- ============================================================

-- 1) Novo cargo
alter type cargo_tipo add value if not exists 'auditoria';

-- Auditoria só é adicionada na política de SELECT (leitura) — nunca em
-- insert/update/delete, é isso que garante o "somente leitura" de verdade.
drop policy if exists lancamentos_select on lancamentos;
create policy lancamentos_select on lancamentos for select
  using (
    meu_cargo() in ('administrador', 'diretor', 'adm', 'auditoria')
    or unidade_id in (select minhas_unidades())
  );

-- 2) Função de auditoria — respeita a mesma regra de unidade de sempre
-- (sem security definer): Administrador/Diretor/Auditoria veem tudo;
-- qualquer outro cargo que algum dia acessar isso só veria as próprias
-- unidades, mesmo que a tela não ofereça esse acesso hoje.
create or replace function auditoria_lancamentos_retroativos(
  unidade_ids uuid[] default null,
  cargos text[] default null,
  usuario_ids uuid[] default null
)
returns table (
  id uuid,
  numero_os text,
  unidade_id uuid,
  unidade_nome text,
  linha linha_tipo,
  data date,
  criado_em timestamptz,
  alterado_em timestamptz,
  responsavel_id uuid,
  responsavel_nome text,
  responsavel_login text,
  responsavel_cargo cargo_tipo,
  dias_atraso int,
  valor_pago numeric,
  categoria_nome text
)
language sql stable as $$
  select
    l.id,
    l.numero_os,
    l.unidade_id,
    un.nome as unidade_nome,
    l.linha,
    l.data,
    l.criado_em,
    l.alterado_em,
    resp.id as responsavel_id,
    resp.nome_completo as responsavel_nome,
    resp.login as responsavel_login,
    resp.cargo as responsavel_cargo,
    (date(coalesce(l.alterado_em, l.criado_em) at time zone 'America/Sao_Paulo') - l.data)::int as dias_atraso,
    l.valor_pago,
    c.nome as categoria_nome
  from lancamentos l
  join unidades un on un.id = l.unidade_id
  join usuarios resp on resp.id = coalesce(l.alterado_por, l.criado_por, l.atendente_id)
  left join categorias c on c.id = l.categoria_id
  where l.data < date(coalesce(l.alterado_em, l.criado_em) at time zone 'America/Sao_Paulo')
    and (unidade_ids is null or array_length(unidade_ids, 1) is null or l.unidade_id = any(unidade_ids))
    and (cargos is null or array_length(cargos, 1) is null or resp.cargo::text = any(cargos))
    and (usuario_ids is null or array_length(usuario_ids, 1) is null or resp.id = any(usuario_ids))
  order by coalesce(l.alterado_em, l.criado_em) desc;
$$;

grant execute on function auditoria_lancamentos_retroativos(uuid[], text[], uuid[]) to authenticated;
