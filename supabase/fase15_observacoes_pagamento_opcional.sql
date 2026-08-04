-- ============================================================
-- Fase 15 — Lançamento: valor pago passa a ser opcional (se não
-- for informado, forma de pagamento fica "nenhuma"/nula) + novo
-- campo de observações, opcional.
-- Rode no SQL Editor do seu projeto Supabase.
-- ============================================================

-- forma_pagamento deixa de ser obrigatória (fica nula quando não há valor pago)
alter table lancamentos alter column forma_pagamento drop not null;

-- novo campo, livre, não obrigatório
alter table lancamentos add column if not exists observacoes text;
