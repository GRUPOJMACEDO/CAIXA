-- ============================================================
-- Fase 61 — Financeiro: Taxas do Cartão + Dashboard de Taxas
--
-- 1) Parcelamento passa a aceitar até 12x (antes era até 10x).
-- 2) Tabela taxas_cartao com HISTÓRICO: cada taxa tem uma data de
--    início ("vale a partir de"). Ao atualizar uma taxa, cria-se uma
--    nova linha com a data nova — os lançamentos antigos continuam
--    usando a taxa que valia na data deles.
--    Carga inicial = coluna "CIELO RENOVAÇÃO", valendo desde sempre.
-- 3) Regras de cálculo:
--    - DÉBITO                       -> taxa "Débito"
--    - CRÉDITO / LINK DE PAGAMENTO  -> 1x = "Crédito"; 2x..12x = "Parcelado Nx"
--    - PIX, DINHEIRO, BOLETO        -> sem taxa
--    - Lançamento com várias formas: cada forma é calculada separada.
--    - Data usada = data do lançamento.
-- 4) Acesso: somente Administrador e Diretor.
--
-- Pode rodar mais de uma vez. Rode no SQL Editor do Supabase
-- (depois da fase 60).
-- ============================================================

-- 1) Parcelas até 12x -----------------------------------------
do $$
declare r record;
begin
  for r in
    select conname from pg_constraint
    where conrelid = 'public.lancamentos'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%parcelas%'
  loop
    execute format('alter table lancamentos drop constraint %I', r.conname);
  end loop;
end $$;
alter table lancamentos add constraint lancamentos_parcelas_check check (parcelas between 1 and 12);

-- 2) Tabela de taxas ------------------------------------------
create table if not exists taxas_cartao (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('debito', 'credito')),
  parcelas int not null check (parcelas between 1 and 12),
  taxa numeric(6,3) not null check (taxa >= 0 and taxa < 100), -- em %, ex.: 3.080 = 3,08%
  vigencia_inicio date not null default current_date,
  criado_por uuid references usuarios(id) default auth.uid(),
  criado_em timestamptz not null default now(),
  constraint taxas_cartao_debito_1x check (tipo = 'credito' or parcelas = 1),
  constraint taxas_cartao_unica unique (tipo, parcelas, vigencia_inicio)
);

alter table taxas_cartao enable row level security;

drop policy if exists taxas_cartao_select on taxas_cartao;
create policy taxas_cartao_select on taxas_cartao for select
  using (meu_cargo() in ('administrador', 'diretor'));

drop policy if exists taxas_cartao_insert on taxas_cartao;
create policy taxas_cartao_insert on taxas_cartao for insert
  with check (meu_cargo() in ('administrador', 'diretor'));

drop policy if exists taxas_cartao_update on taxas_cartao;
create policy taxas_cartao_update on taxas_cartao for update
  using (meu_cargo() in ('administrador', 'diretor'))
  with check (meu_cargo() in ('administrador', 'diretor'));

drop policy if exists taxas_cartao_delete on taxas_cartao;
create policy taxas_cartao_delete on taxas_cartao for delete
  using (meu_cargo() in ('administrador', 'diretor'));

grant select, insert, update, delete on taxas_cartao to authenticated;

-- carga inicial: coluna CIELO RENOVAÇÃO (só entra se ainda não existir)
insert into taxas_cartao (tipo, parcelas, taxa, vigencia_inicio, criado_por)
values
  ('debito', 1, 0.85, '2000-01-01', null),
  ('credito', 1, 3.08, '2000-01-01', null),
  ('credito', 2, 4.25, '2000-01-01', null),
  ('credito', 3, 4.86, '2000-01-01', null),
  ('credito', 4, 5.45, '2000-01-01', null),
  ('credito', 5, 6.00, '2000-01-01', null),
  ('credito', 6, 6.57, '2000-01-01', null),
  ('credito', 7, 7.63, '2000-01-01', null),
  ('credito', 8, 8.14, '2000-01-01', null),
  ('credito', 9, 8.70, '2000-01-01', null),
  ('credito', 10, 9.24, '2000-01-01', null),
  ('credito', 11, 9.76, '2000-01-01', null),
  ('credito', 12, 10.26, '2000-01-01', null)
on conflict (tipo, parcelas, vigencia_inicio) do nothing;

-- 3) Pagamentos "abertos" por forma + taxa aplicada ------------
-- Uso interno (não exposto direto ao navegador).
create or replace function _taxas_pagamentos(p_unidade_ids uuid[], p_inicio date, p_fim_excl date)
returns table (
  lancamento_id uuid,
  unidade_id uuid,
  data date,
  numero_os text,
  valor_lancamento numeric,
  forma text,
  parcelas int,
  bandeira text,
  valor numeric,
  tipo_taxa text,
  taxa numeric,
  valor_taxa numeric
)
language sql stable security definer set search_path = public as $$
  with base as (
    select
      l.id, l.unidade_id, l.data, l.numero_os, l.valor_pago,
      upper(coalesce(f.item->>'forma_pagamento', l.forma_pagamento)) as forma,
      case when f.item is not null then nullif(f.item->>'parcelas', '')::int else l.parcelas end as parcelas,
      case when f.item is not null then nullif(f.item->>'bandeira', '') else l.bandeira end as bandeira,
      case when f.item is not null then coalesce(nullif(f.item->>'valor', '')::numeric, 0) else l.valor_pago end as valor
    from lancamentos l
    left join lateral (
      select e as item
      from jsonb_array_elements(
        case when jsonb_typeof(l.formas_pagamento) = 'array' then l.formas_pagamento else '[]'::jsonb end
      ) e
    ) f on true
    where l.data >= p_inicio and l.data < p_fim_excl
      and (p_unidade_ids is null or l.unidade_id = any(p_unidade_ids))
  ),
  classificado as (
    select b.*,
      case
        when b.forma in ('DÉBITO', 'DEBITO') then 'debito'
        when b.forma in ('CRÉDITO', 'CREDITO', 'LINK DE PAGAMENTO') then 'credito'
        else null
      end as tipo_taxa,
      case
        when b.forma in ('DÉBITO', 'DEBITO') then 1
        else greatest(1, least(12, coalesce(b.parcelas, 1)))
      end as parcelas_taxa
    from base b
  )
  select
    c.id, c.unidade_id, c.data, c.numero_os, c.valor_pago,
    c.forma, case when c.tipo_taxa = 'credito' then c.parcelas_taxa else null end, c.bandeira,
    c.valor, c.tipo_taxa,
    coalesce(t.taxa, 0) as taxa,
    round(c.valor * coalesce(t.taxa, 0) / 100, 2) as valor_taxa
  from classificado c
  left join lateral (
    select tc.taxa from taxas_cartao tc
    where tc.tipo = c.tipo_taxa and tc.parcelas = c.parcelas_taxa and tc.vigencia_inicio <= c.data
    order by tc.vigencia_inicio desc
    limit 1
  ) t on c.tipo_taxa is not null;
$$;
revoke all on function _taxas_pagamentos(uuid[], date, date) from public, anon, authenticated;

-- 4) Dashboard: resumo por unidade ----------------------------
create or replace function taxas_cartao_por_unidade(unidade_ids uuid[], data_inicio date, data_fim_excl date)
returns table (
  unidade_id uuid,
  unidade_nome text,
  valor_recebido numeric,
  valor_cartao numeric,
  valor_taxas numeric,
  qtd_lancamentos bigint
)
language plpgsql stable security definer set search_path = public as $$
begin
  if coalesce(meu_cargo()::text, '') not in ('administrador', 'diretor') then
    raise exception 'SEM_PERMISSAO: somente Administrador e Diretor.';
  end if;
  return query
    select p.unidade_id, u.nome::text,
      coalesce(sum(p.valor), 0),
      coalesce(sum(p.valor) filter (where p.tipo_taxa is not null), 0),
      coalesce(sum(p.valor_taxa), 0),
      count(distinct p.lancamento_id)
    from _taxas_pagamentos(unidade_ids, data_inicio, data_fim_excl) p
    join unidades u on u.id = p.unidade_id
    group by p.unidade_id, u.nome
    order by u.nome;
end;
$$;
grant execute on function taxas_cartao_por_unidade(uuid[], date, date) to authenticated;

-- 5) Dashboard: resumo por modalidade (Débito, Crédito, Parcelado Nx, PIX...)
create or replace function taxas_cartao_por_modalidade(unidade_ids uuid[], data_inicio date, data_fim_excl date)
returns table (
  forma text,
  tipo_taxa text,
  parcelas int,
  valor numeric,
  valor_taxas numeric,
  qtd bigint
)
language plpgsql stable security definer set search_path = public as $$
begin
  if coalesce(meu_cargo()::text, '') not in ('administrador', 'diretor') then
    raise exception 'SEM_PERMISSAO: somente Administrador e Diretor.';
  end if;
  return query
    select
      case when p.tipo_taxa is null then coalesce(p.forma, 'SEM FORMA') else null end,
      p.tipo_taxa, p.parcelas,
      coalesce(sum(p.valor), 0), coalesce(sum(p.valor_taxa), 0), count(*)
    from _taxas_pagamentos(unidade_ids, data_inicio, data_fim_excl) p
    group by 1, 2, 3
    having coalesce(sum(p.valor), 0) <> 0
    order by 2 nulls last, 3 nulls first, 1;
end;
$$;
grant execute on function taxas_cartao_por_modalidade(uuid[], date, date) to authenticated;

-- 6) Dashboard: detalhe de uma unidade (ao clicar na linha) ----
create or replace function taxas_cartao_detalhe(p_unidade_id uuid, data_inicio date, data_fim_excl date)
returns table (
  lancamento_id uuid,
  data date,
  numero_os text,
  forma text,
  parcelas int,
  bandeira text,
  valor numeric,
  taxa numeric,
  valor_taxa numeric
)
language plpgsql stable security definer set search_path = public as $$
begin
  if coalesce(meu_cargo()::text, '') not in ('administrador', 'diretor') then
    raise exception 'SEM_PERMISSAO: somente Administrador e Diretor.';
  end if;
  return query
    select p.lancamento_id, p.data, p.numero_os, p.forma, p.parcelas, p.bandeira, p.valor, p.taxa, p.valor_taxa
    from _taxas_pagamentos(array[p_unidade_id], data_inicio, data_fim_excl) p
    order by p.data desc, p.numero_os, p.forma;
end;
$$;
grant execute on function taxas_cartao_detalhe(uuid, date, date) to authenticated;
