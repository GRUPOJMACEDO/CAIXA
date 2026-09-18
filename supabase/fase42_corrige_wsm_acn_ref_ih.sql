-- ============================================================
-- Fase 42 — Correção: WSM, ACN, REF devem continuar aparecendo
-- normalmente para as unidades de IH
--
-- O que aconteceu: a fase 41 tirou a marcação "somente_ih" dessas
-- categorias, e o código passou a tratar unidade_restrita_id como
-- uma trava exclusiva (só aparece pra ESC Santos, e mais ninguém,
-- em qualquer linha). Isso quebrou o comportamento original: as
-- unidades de IH deixaram de ver WSM/ACN/REF, que sempre foram
-- categorias de IH (fase 23).
--
-- Correção: WSM/ACN/REF voltam a ser "somente_ih = true" (como
-- sempre foram) — continuam aparecendo normalmente para qualquer
-- unidade quando a Linha estiver em IH. A ESC Santos ganha um
-- acesso A MAIS: também enxerga essas categorias com a Linha em
-- CI, mesmo não sendo unidade de IH. unidade_restrita_id deixa de
-- ser uma restrição e passa a ser uma liberação extra.
--
-- Rode no SQL Editor do seu projeto Supabase.
-- ============================================================

update categorias
set somente_ih = true
where nome in ('WSM', 'ACN', 'REF');
