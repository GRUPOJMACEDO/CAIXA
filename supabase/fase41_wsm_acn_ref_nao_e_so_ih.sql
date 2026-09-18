-- ============================================================
-- Fase 41 — Correção: WSM, ACN e REF não são exclusivas de IH
--
-- Na fase 40, WSM/ACN/REF ficaram restritas à unidade ESC Santos,
-- mas continuaram marcadas como "somente_ih = true" (herdado da
-- fase 23), então só apareciam no formulário quando a Linha
-- estivesse em IH. Como a ESC Santos não é unidade de IH, elas
-- nunca apareciam.
--
-- Agora a regra passa a ser só a unidade: aparecem para a ESC
-- Santos em qualquer Linha (CI ou IH), e nunca para as demais
-- unidades.
--
-- Rode no SQL Editor do seu projeto Supabase.
-- ============================================================

update categorias
set somente_ih = false
where nome in ('WSM', 'ACN', 'REF');
