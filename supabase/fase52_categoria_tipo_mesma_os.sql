-- ============================================================
-- Fase 52 — Trava: não deixar lançar categoria ou tipo de serviço
-- diferentes pra uma OS que já tem lançamento registrado.
--
-- Regra:
--  - Compara só dentro da mesma unidade + mesma linha (CI/IH).
--  - Se a OS já tem lançamento com outra categoria -> bloqueia.
--  - Se a OS já tem lançamento com outro tipo de serviço -> bloqueia.
--  - EXCEÇÃO: se o tipo de serviço do lançamento novo OU do já
--    existente contiver (em qualquer variação, com ou sem acento)
--    "TAXA DE ANÁLISE", "TAXA DE VISITA", "INSTALAÇÃO" ou
--    "HIGIENIZAÇÃO", libera a repetição da OS (não bloqueia nem
--    categoria nem tipo de serviço pra esse par).
--
-- Rode no SQL Editor do seu projeto Supabase.
-- ============================================================

create or replace function eh_tipo_servico_excecao_os(p_nome text)
returns boolean
language sql
immutable
as $$
  select coalesce(p_nome, '') ilike '%taxa de an_lise%'
      or coalesce(p_nome, '') ilike '%taxa de visita%'
      or coalesce(p_nome, '') ilike '%instala__o%'
      or coalesce(p_nome, '') ilike '%higieniza__o%';
$$;

create or replace function checar_categoria_tipo_os()
returns trigger
language plpgsql
as $$
declare
  v_nome_novo text;
  v_excecao_novo boolean;
  v_linha record;
begin
  select nome into v_nome_novo from tipos_servico where id = new.tipo_servico_id;
  v_excecao_novo := eh_tipo_servico_excecao_os(v_nome_novo);

  for v_linha in
    select l.id, l.categoria_id, l.tipo_servico_id, ts.nome as tipo_servico_nome
    from lancamentos l
    join tipos_servico ts on ts.id = l.tipo_servico_id
    where l.unidade_id = new.unidade_id
      and l.numero_os = new.numero_os
      and l.linha = new.linha
      and l.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
  loop
    -- se um dos dois lados é um tipo de exceção (taxa de análise,
    -- taxa de visita, instalação, higienização), libera esse par
    if v_excecao_novo or eh_tipo_servico_excecao_os(v_linha.tipo_servico_nome) then
      continue;
    end if;

    if v_linha.categoria_id is distinct from new.categoria_id then
      raise exception 'CATEGORIA_DIVERGENTE_NA_OS: a OS % já tem lançamento com outra categoria.', new.numero_os;
    end if;

    if v_linha.tipo_servico_id <> new.tipo_servico_id then
      raise exception 'TIPO_SERVICO_DIVERGENTE_NA_OS: a OS % já tem lançamento com outro tipo de serviço.', new.numero_os;
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_checar_categoria_tipo_os on lancamentos;
create trigger trg_checar_categoria_tipo_os
before insert or update on lancamentos
for each row execute function checar_categoria_tipo_os();
