"use client";
import { useEffect, useState } from "react";
import AppShell from "../../../components/AppShell";
import { supabase } from "../../../lib/supabaseClient";
import { useSessao } from "../../../lib/SessaoContext";
import { podeConfigUnidades } from "../../../lib/permissions";

function Conteudo() {
  const { usuario } = useSessao();
  const [unidades, setUnidades] = useState([]);
  const [nome, setNome] = useState("");
  const [codigo, setCodigo] = useState("");
  const [edicoes, setEdicoes] = useState({}); // { unidadeId: { nome, codigo } }

  async function carregar() {
    const { data } = await supabase.from("unidades").select("*").order("nome");
    setUnidades(data || []);
  }

  useEffect(() => {
    carregar();
  }, []);

  async function salvar(e) {
    e.preventDefault();
    await supabase.from("unidades").insert({ nome, codigo: codigo.toUpperCase() });
    setNome("");
    setCodigo("");
    carregar();
  }

  async function salvarAlteracao(unidade) {
    const edicao = edicoes[unidade.id] || {};
    const novoNome = (edicao.nome ?? unidade.nome).trim();
    const novoCodigo = (edicao.codigo ?? unidade.codigo).toUpperCase().slice(0, 7);
    await supabase.from("unidades").update({ nome: novoNome, codigo: novoCodigo }).eq("id", unidade.id);
    carregar();
  }

  const permitido = podeConfigUnidades(usuario.cargo);

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <p className="text-xs uppercase tracking-wider text-muted mb-1">Configurações</p>
        <h1 className="font-display text-2xl font-semibold text-ink">Unidades</h1>
        <p className="text-sm text-muted mt-1">{unidades.length} lojas cadastradas</p>
      </div>

      {permitido && (
        <form onSubmit={salvar} className="card p-4 flex gap-3 mb-6 items-end">
          <div className="flex-1">
            <label className="field-label">Nome da unidade</label>
            <input className="field-input" value={nome} onChange={(e) => setNome(e.target.value)} required />
          </div>
          <div className="w-32">
            <label className="field-label">ASC Cod.</label>
            <input className="field-input" value={codigo} onChange={(e) => setCodigo(e.target.value)} maxLength={7} required />
          </div>
          <button className="btn-primary" type="submit">Adicionar</button>
        </form>
      )}
      {!permitido && (
        <p className="text-sm text-muted mb-4">Somente o Administrador cadastra e altera unidades.</p>
      )}

      <div className="card divide-y divide-line">
        {unidades.map((u) => (
          <div key={u.id} className="p-3 flex items-center justify-between gap-3 text-sm">
            {permitido ? (
              <input
                className="field-input flex-1"
                value={edicoes[u.id]?.nome ?? u.nome}
                onChange={(e) => setEdicoes({ ...edicoes, [u.id]: { ...edicoes[u.id], nome: e.target.value } })}
              />
            ) : (
              <span>{u.nome}</span>
            )}
            {permitido ? (
              <div className="flex items-center gap-2">
                <input
                  className="field-input w-24 text-xs font-mono-num"
                  maxLength={7}
                  value={edicoes[u.id]?.codigo ?? u.codigo}
                  onChange={(e) => setEdicoes({ ...edicoes, [u.id]: { ...edicoes[u.id], codigo: e.target.value.toUpperCase() } })}
                />
                <button className="btn-primary" onClick={() => salvarAlteracao(u)}>Alterar</button>
              </div>
            ) : (
              <span className="font-mono-num text-muted text-xs">{u.codigo}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function CadastroUnidades() {
  return (
    <AppShell>
      <Conteudo />
    </AppShell>
  );
}
