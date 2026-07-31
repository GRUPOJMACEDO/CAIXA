"use client";
import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import AppShell from "../../../components/AppShell";
import { supabase } from "../../../lib/supabaseClient";
import { useSessao } from "../../../lib/SessaoContext";
import { podeConfigModelos, podeConfigTiposServico } from "../../../lib/permissions";

function Conteudo() {
  const { usuario } = useSessao();
  const [categorias, setCategorias] = useState([]);
  const [modelos, setModelos] = useState([]);
  const [categoriaId, setCategoriaId] = useState("");
  const [nomeModelo, setNomeModelo] = useState("");
  const [editando, setEditando] = useState(null);
  const [nomeEdicao, setNomeEdicao] = useState("");

  async function carregar() {
    const { data: c } = await supabase.from("categorias").select("*").order("nome");
    setCategorias(c || []);
    const { data: m } = await supabase.from("modelos").select("*, categorias(nome)").order("nome");
    setModelos(m || []);
  }

  useEffect(() => {
    carregar();
  }, []);

  async function salvarModelo(e) {
    e.preventDefault();
    await supabase.from("modelos").insert({ categoria_id: categoriaId, nome: nomeModelo.toUpperCase() });
    setNomeModelo("");
    carregar();
  }

  async function salvarEdicao(id) {
    await supabase.from("modelos").update({ nome: nomeEdicao.toUpperCase() }).eq("id", id);
    setEditando(null);
    carregar();
  }

  async function excluir(m) {
    const { count } = await supabase.from("lancamentos").select("id", { count: "exact", head: true }).eq("modelo_id", m.id);
    if (count > 0) {
      alert(`Não é possível excluir "${m.nome}" — já foi usado em ${count} lançamento(s).`);
      return;
    }
    if (!window.confirm(`Excluir o modelo "${m.nome}"?`)) return;
    await supabase.from("modelos").delete().eq("id", m.id);
    carregar();
  }

  const permitido = podeConfigModelos(usuario.cargo);
  // exclusão: mesma regra usada em tipos de serviço (Gerência/Administrador/Diretor)
  const podeExcluirItem = podeConfigTiposServico(usuario.cargo);

  if (!permitido) {
    return <p className="text-sm text-muted">Somente Supervisão, Gerência, Administrador ou Diretor cadastram modelos.</p>;
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <p className="text-xs uppercase tracking-wider text-muted mb-1">Configurações</p>
        <h1 className="font-display text-2xl font-semibold text-ink">Modelos</h1>
        <p className="text-sm text-muted mt-1">{modelos.length} modelos cadastrados</p>
      </div>

      <form onSubmit={salvarModelo} className="card p-4 flex gap-3 mb-6 items-end">
        <div className="w-48">
          <label className="field-label">Categoria</label>
          <select className="field-input" value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)} required>
            <option value="">Selecione</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>{c.nome}</option>
            ))}
          </select>
        </div>
        <div className="flex-1">
          <label className="field-label">Nome do modelo</label>
          <input className="field-input" placeholder="Ex: S24 Ultra" value={nomeModelo} onChange={(e) => setNomeModelo(e.target.value)} required />
        </div>
        <button className="btn-primary" type="submit">Adicionar</button>
      </form>

      <div className="card divide-y divide-line">
        {modelos.map((m) => (
          <div key={m.id} className="p-3 flex items-center justify-between gap-3 text-sm">
            {editando === m.id ? (
              <input className="field-input flex-1" value={nomeEdicao} onChange={(e) => setNomeEdicao(e.target.value)} autoFocus />
            ) : (
              <span>{m.nome}</span>
            )}
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs text-muted bg-canvas px-2 py-0.5 rounded">{m.categorias?.nome}</span>
              {editando !== m.id && (
                <button className="btn" onClick={() => { setEditando(m.id); setNomeEdicao(m.nome); }}>Editar</button>
              )}
              {editando === m.id && (
                <>
                  <button className="btn-primary" onClick={() => salvarEdicao(m.id)}>Salvar</button>
                  <button className="btn" onClick={() => setEditando(null)}>Cancelar</button>
                </>
              )}
              {podeExcluirItem && editando !== m.id && (
                <button className="btn text-danger" title="Excluir" onClick={() => excluir(m)}>
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ModelosPage() {
  return (
    <AppShell>
      <Conteudo />
    </AppShell>
  );
}
