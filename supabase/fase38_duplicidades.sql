-- ============================================================
-- Fase 38 — Módulo Duplicidades
--
-- Detecta OS repetidas (mesmo numero_os) dentro da MESMA unidade.
-- Gravidade em camadas (calculada por lançamento, comparando com
-- os outros da mesma OS):
--   nivel 1 (vermelho claro)  → só a OS é igual
--   nivel 2 (vermelho médio)  → OS + Tipo de Serviço iguais
--   nivel 3 (vermelho escuro) → OS + Tipo de Serviço + Valor iguais
--   nivel 4 (preto)           → OS + Tipo de Serviço + Valor + Data iguais
--
-- Cada unidade só vê as próprias OS (sem security definer — usa a
-- regra de RLS de sempre).
--
-- Rode no SQL Editor do seu projeto Supabase.
-- ============================================================

-- 1) Revisão: quando alguém marca "tudo certo", fica registrado aqui e a
--    OS some da lista (mesma tabela guarda tanto os aprovados quanto,
--    opcionalmente no futuro, outros status)
create table if not exists duplicidades_revisadas (
  unidade_id uuid not null references unidades(id),
  numero_os text not null,
  revisado_por uuid not null references usuarios(id),
  revisado_em timestamptz not null default now(),
  primary key (unidade_id, numero_os)
);

alter table duplicidades_revisadas enable row level security;

create policy duplicidades_revisadas_select on duplicidades_revisadas for select
  using (unidade_id in (select minhas_unidades()) or meu_cargo() in ('administrador', 'diretor', 'adm', 'auditoria'));

create policy duplicidades_revisadas_insert on duplicidades_revisadas for insert
  with check (
    revisado_por = auth.uid()
    and (
      unidade_id in (select minhas_unidades())
      or meu_cargo() in ('administrador', 'diretor', 'adm')
    )
  );

grant select, insert on duplicidades_revisadas to authenticated;

-- 2) Notificação individual (uma linha por destinatário) — só o próprio
--    usuário vê as suas
create table if not exists notificacoes_duplicidade (
  id uuid primary key default gen_random_uuid(),
  unidade_id uuid not null references unidades(id),
  numero_os text not null,
  usuario_id uuid not null references usuarios(id),
  lida boolean not null default false,
  criado_em timestamptz not null default now()
);

create index if not exists idx_notificacoes_duplicidade_usuario on notificacoes_duplicidade (usuario_id, lida);

alter table notificacoes_duplicidade enable row level security;

create policy notificacoes_duplicidade_select on notificacoes_duplicidade for select
  using (usuario_id = auth.uid());

create policy notificacoes_duplicidade_update on notificacoes_duplicidade for update
  using (usuario_id = auth.uid());

grant select, update on notificacoes_duplicidade to authenticated;

-- 3) Gatilho: assim que uma OS vira duplicada (na 2ª ocorrência — não
--    fica repetindo aviso a cada pagamento parcial seguinte), avisa
--    Gerência e Supervisão daquela unidade
create or replace function notificar_duplicidade_os()
returns trigger as $$
declare
  qtd int;
  destinatario record;
begin
  select count(*) into qtd from lancamentos where unidade_id = new.unidade_id and numero_os = new.numero_os;
  if qtd = 2 then
    for destinatario in
      select us.id
      from usuarios us
      join usuario_unidades uu on uu.usuario_id = us.id
      where uu.unidade_id = new.unidade_id
        and us.cargo in ('gerencia', 'supervisao')
        and us.ativo = true
    loop
      insert into notificacoes_duplicidade (unidade_id, numero_os, usuario_id)
      values (new.unidade_id, new.numero_os, destinatario.id);
    end loop;
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_notificar_duplicidade on lancamentos;
create trigger trg_notificar_duplicidade
after insert on lancamentos
for each row execute function notificar_duplicidade_os();

-- 4) Função de listagem — sem security definer, cada unidade só vê as
--    próprias OS, exceto Administrador/Diretor/ADM/Auditoria que veem tudo
--    (via RLS normal da tabela lancamentos)
create or replace function duplicidades_os(unidade_ids uuid[] default null)
returns table (
  id uuid,
  numero_os text,
  unidade_id uuid,
  unidade_nome text,
  linha linha_tipo,
  tipo_servico_id uuid,
  tipo_servico_nome text,
  categoria_nome text,
  data date,
  valor_pago numeric,
  orcamento_aprovado numeric,
  atendente_nome text,
  atendente_login text,
  criado_em timestamptz,
  nivel int,
  qtd_no_grupo bigint
)
language sql stable as $$
  with grupos as (
    select unidade_id, numero_os, count(*) as qtd
    from lancamentos
    group by unidade_id, numero_os
    having count(*) > 1
  )
  select
    l.id, l.numero_os, l.unidade_id, un.nome as unidade_nome, l.linha,
    l.tipo_servico_id, ts.nome as tipo_servico_nome, c.nome as categoria_nome,
    l.data, l.valor_pago, l.orcamento_aprovado,
    us.nome_completo as atendente_nome, us.login as atendente_login,
    l.criado_em,
    (
      select max(
        case
          when l2.tipo_servico_id is not distinct from l.tipo_servico_id
           and l2.valor_pago is not distinct from l.valor_pago
           and l2.data is not distinct from l.data then 4
          when l2.tipo_servico_id is not distinct from l.tipo_servico_id
           and l2.valor_pago is not distinct from l.valor_pago then 3
          when l2.tipo_servico_id is not distinct from l.tipo_servico_id then 2
          else 1
        end
      )
      from lancamentos l2
      where l2.unidade_id = l.unidade_id and l2.numero_os = l.numero_os and l2.id <> l.id
    ) as nivel,
    g.qtd as qtd_no_grupo
  from lancamentos l
  join grupos g on g.unidade_id = l.unidade_id and g.numero_os = l.numero_os
  join unidades un on un.id = l.unidade_id
  left join tipos_servico ts on ts.id = l.tipo_servico_id
  left join categorias c on c.id = l.categoria_id
  join usuarios us on us.id = l.atendente_id
  where (unidade_ids is null or array_length(unidade_ids, 1) is null or l.unidade_id = any(unidade_ids))
  order by l.unidade_id, l.numero_os, l.data desc;
$$;

grant execute on function duplicidades_os(uuid[]) to authenticated;
