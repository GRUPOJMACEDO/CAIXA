-- ============================================================
-- Fase 40 — Categorias WSM, ACN, REF exclusivas da unidade ESC Santos
--
-- As categorias WSM, ACN e REF já existiam (criadas na fase 23,
-- como categorias "somente IH", mas sem nenhum tipo de serviço
-- cadastrado nelas ainda). Esta fase:
--
--  1) Cria a coluna categorias.unidade_restrita_id — quando
--     preenchida, a categoria só aparece no formulário de
--     Lançamento quando a unidade selecionada for aquela.
--     Quando NULL (a grande maioria), a categoria continua
--     visível para todas as unidades, como sempre foi.
--  2) Marca WSM, ACN e REF como restritas à unidade "ESC Santos".
--  3) Cria os tipos de serviço "Instalação {categoria}" e
--     "Higienização {categoria}" para cada uma delas.
--
-- Como nenhuma delas tinha tipo de serviço cadastrado até agora,
-- nenhum lançamento existente é afetado.
--
-- Rode no SQL Editor do seu projeto Supabase.
-- ============================================================

-- 1) coluna de restrição por unidade (NULL = disponível para todas)
alter table categorias add column if not exists unidade_restrita_id uuid references unidades(id);

-- 2) garante que WSM, ACN, REF existem (idempotente, já criadas na fase 23)
--    e marca como restritas à unidade ESC Santos
insert into categorias (nome, somente_ih)
select nome, true
from (values ('WSM'), ('ACN'), ('REF')) as novas(nome)
where not exists (select 1 from categorias c where c.nome = novas.nome);

update categorias
set unidade_restrita_id = (select id from unidades where nome = 'ESC Santos')
where nome in ('WSM', 'ACN', 'REF');

-- 3) tipos de serviço "Instalação" e "Higienização" para cada categoria
insert into tipos_servico (categoria_id, nome)
select c.id, t.nome
from categorias c
cross join lateral (
  values
    ('Instalação ' || c.nome),
    ('Higienização ' || c.nome)
) as t(nome)
where c.nome in ('WSM', 'ACN', 'REF')
  and not exists (select 1 from tipos_servico ts where ts.nome = t.nome);
