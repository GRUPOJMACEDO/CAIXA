-- ============================================================
-- Fase 50 — "Desfazer" exclusão de lançamentos (Contas a Receber)
--
-- Toda vez que um lançamento é excluído (seja pelo botão de excluir
-- do Contas a Receber, seja pela tela de Pendências já quitadas, seja
-- em Duplicidades), o gatilho trg_log_lancamentos (fase 2) já grava a
-- linha inteira, do jeito que ela estava, em log_auditoria.dados_antes
-- — então nada se perde de verdade. Essas duas funções deixam restaurar
-- isso pela tela, sem precisar mexer direto no banco.
--
-- 1) admin_listar_exclusoes_lancamentos — lista as exclusões recentes
--    (quem excluiu, quando, qual OS, qual valor, o motivo que foi
--    informado), com uma marca de "já restaurado" pra quem já voltou.
--
-- 2) admin_restaurar_exclusao_cr — restaura de volta ao Contas a
--    Receber os lançamentos escolhidos, reconstruindo a linha
--    original a partir do que foi salvo no log. Usa a mesma "licença"
--    da fase 48 pra não brigar com o gatilho de saldo da OS durante a
--    restauração. Só o Administrador pode restaurar.
--
-- Rode no SQL Editor do seu projeto Supabase.
-- ============================================================

create or replace function admin_listar_exclusoes_lancamentos(dias int default 30, unidade_ids uuid[] default null)
returns table (
  log_id uuid,
  lancamento_id uuid,
  unidade_id uuid,
  unidade_nome text,
  numero_os text,
  tipo_servico_nome text,
  linha linha_tipo,
  data date,
  valor_pago numeric,
  orcamento_aprovado numeric,
  forma_pagamento text,
  motivo_exclusao text,
  excluido_por text,
  excluido_em timestamptz,
  ja_restaurado boolean
)
language sql stable as $$
  select
    la.id as log_id,
    (la.dados_antes->>'id')::uuid as lancamento_id,
    la.unidade_id,
    un.nome as unidade_nome,
    la.dados_antes->>'numero_os' as numero_os,
    ts.nome as tipo_servico_nome,
    (la.dados_antes->>'linha')::linha_tipo as linha,
    (la.dados_antes->>'data')::date as data,
    (la.dados_antes->>'valor_pago')::numeric as valor_pago,
    (la.dados_antes->>'orcamento_aprovado')::numeric as orcamento_aprovado,
    la.dados_antes->>'forma_pagamento' as forma_pagamento,
    la.dados_antes->>'motivo_exclusao' as motivo_exclusao,
    us.nome_completo as excluido_por,
    la.criado_em as excluido_em,
    exists (select 1 from lancamentos l where l.id = (la.dados_antes->>'id')::uuid) as ja_restaurado
  from log_auditoria la
  left join unidades un on un.id = la.unidade_id
  left join tipos_servico ts on ts.id = nullif(la.dados_antes->>'tipo_servico_id', '')::uuid
  left join usuarios us on us.id = la.usuario_id
  where la.tabela = 'lancamentos'
    and la.acao = 'delete'
    and la.criado_em >= now() - (dias || ' days')::interval
    and (unidade_ids is null or array_length(unidade_ids, 1) is null or la.unidade_id = any(unidade_ids))
  order by la.criado_em desc;
$$;

grant execute on function admin_listar_exclusoes_lancamentos(int, uuid[]) to authenticated;

-- Restaura os lançamentos escolhidos (por log_id). Pula, sem dar erro,
-- qualquer um que já tenha sido restaurado antes (evita duplicar).
create or replace function admin_restaurar_exclusao_cr(p_log_ids uuid[])
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_log record;
  v_id uuid;
  v_restauradas int := 0;
begin
  if meu_cargo() <> 'administrador' then
    raise exception 'Apenas o Administrador pode restaurar exclusões.';
  end if;
  if p_log_ids is null or array_length(p_log_ids, 1) is null then
    raise exception 'Nenhum item selecionado.';
  end if;

  perform set_config('caixa.permitir_correcao_orcamento', '1', true);

  for v_log in
    select id, dados_antes
    from log_auditoria
    where id = any(p_log_ids) and tabela = 'lancamentos' and acao = 'delete'
  loop
    v_id := (v_log.dados_antes->>'id')::uuid;

    if exists (select 1 from lancamentos where id = v_id) then
      continue; -- já restaurado (ou algo ocupou o mesmo id) — pula
    end if;

    insert into lancamentos
    select * from jsonb_populate_record(null::lancamentos, v_log.dados_antes);

    update lancamentos
    set motivo_exclusao = null,
        alterado_por = auth.uid(),
        alterado_em = now()
    where id = v_id;

    v_restauradas := v_restauradas + 1;
  end loop;

  perform set_config('caixa.permitir_correcao_orcamento', '0', true);
  return v_restauradas;
end;
$$;

grant execute on function admin_restaurar_exclusao_cr(uuid[]) to authenticated;
