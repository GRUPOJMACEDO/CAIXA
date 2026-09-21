-- ============================================================
-- Fase 43 — Técnicos (IH) por unidade
--
-- Modelo:
-- • tecnicos: cadastro simples, cada técnico pertence a UMA
--   unidade (igual foi decidido). Tem um "ativo" pra poder tirar
--   um técnico da lista de seleção sem apagar o histórico dele.
-- • lancamentos: ganham tecnico_id (opcional — nem todo
--   lançamento IH precisa ter um técnico escolhido).
-- • Dashboard Técnicos: função tecnicos_por_periodo, no mesmo
--   molde de vendedores_por_periodo (fase 35) — agrega por
--   técnico + unidade + categoria.
--
-- Permissão de cadastrar/editar técnicos: igual Categorias/
-- Modelos (Supervisão, Gerência, Administrador, Diretor).
--
-- Rode no SQL Editor do seu projeto Supabase.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Tabela de técnicos
-- ------------------------------------------------------------
create table if not exists tecnicos (
  id uuid primary key default gen_random_uuid(),
  unidade_id uuid not null references unidades(id) on delete cascade,
  nome text not null check (char_length(trim(nome)) > 0),
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create index if not exists idx_tecnicos_unidade on tecnicos (unidade_id);

alter table tecnicos enable row level security;

drop policy if exists tecnicos_select on tecnicos;
create policy tecnicos_select on tecnicos for select using (true);

drop policy if exists tecnicos_insert on tecnicos;
create policy tecnicos_insert on tecnicos for insert
  with check (meu_cargo() in ('supervisao', 'gerencia', 'administrador', 'diretor'));

drop policy if exists tecnicos_update on tecnicos;
create policy tecnicos_update on tecnicos for update
  using (meu_cargo() in ('supervisao', 'gerencia', 'administrador', 'diretor'));

drop policy if exists tecnicos_delete on tecnicos;
create policy tecnicos_delete on tecnicos for delete
  using (meu_cargo() in ('supervisao', 'gerencia', 'administrador', 'diretor'));

-- ------------------------------------------------------------
-- 2) Lançamentos: técnico responsável (opcional, só faz sentido
--    em unidades/lançamentos IH — a tela só mostra o campo nesse
--    caso, mas a coluna não força isso no banco).
-- ------------------------------------------------------------
alter table lancamentos add column if not exists tecnico_id uuid references tecnicos(id);
create index if not exists idx_lancamentos_tecnico on lancamentos (tecnico_id);

-- ------------------------------------------------------------
-- 3) Dashboard Técnicos — agregação por técnico + unidade +
--    categoria, com período livre (semana/mês, igual Vendedores).
--    SECURITY DEFINER: o ranking é global (todo mundo vê todos
--    os técnicos), igual já funciona em Vendedores.
-- ------------------------------------------------------------
create or replace function tecnicos_por_periodo(
  data_inicio date,
  data_fim_excl date
)
returns table (
  tecnico_id uuid,
  tecnico_nome text,
  unidade_id uuid,
  unidade_nome text,
  categoria_id uuid,
  categoria_nome text,
  valor_pago numeric,
  qtd_os bigint
)
language sql
security definer
set search_path = public
stable
as $$
  select
    t.id as tecnico_id,
    t.nome as tecnico_nome,
    un.id as unidade_id,
    un.nome as unidade_nome,
    c.id as categoria_id,
    coalesce(c.nome, 'Sem categoria') as categoria_nome,
    sum(l.valor_pago) as valor_pago,
    count(distinct l.numero_os) as qtd_os
  from lancamentos l
  join tecnicos t on t.id = l.tecnico_id
  join unidades un on un.id = l.unidade_id
  left join categorias c on c.id = l.categoria_id
  where l.data >= data_inicio
    and l.data < data_fim_excl
    and l.tecnico_id is not null
    and l.linha = 'ih'
  group by t.id, t.nome, un.id, un.nome, c.id, c.nome;
$$;

grant execute on function tecnicos_por_periodo(date, date) to authenticated;
