"use client";
import { useEffect, useState } from "react";
import { Smartphone, Tv, Tablet, Watch, Laptop, Bot, Cable, Tag, Trash2 } from "lucide-react";
import AppShell from "../../../components/AppShell";
import { supabase } from "../../../lib/supabaseClient";
import { useSessao } from "../../../lib/SessaoContext";
import { podeConfigCategorias } from "../../../lib/permissions";

const ICONES = {
  celular: Smartphone,
  tv: Tv,
  tablet: Tablet,
  relógio: Watch,
  relogio: Watch,
  notebook: Laptop,
  robô: Bot,
  robo: Bot,
  acessório: Cable,
  acessorio: Cable,
};

function iconeCategoria(nome) {
  return ICONES[nome.toLowerCase()] || Tag;
}

function Conteudo() {
  const { usuario } = useSessao();
  const [categorias, setCategorias] = useState([]);
  const [nome, setNome] = useState("");
  const [editando, setEditando] = useState(null);
  const [nomeEdicao, setNomeEdicao] = useState("");

  async function carregar() {
    const { data } = await supabase.from("categorias").select("*").order("nome");
    setCategorias(data || []);
  }

  useEffect(() => {
    carregar();
  }, []);

  async function salvar(e) {
    e.preventDefault();
    await supabase.from("categorias").insert({ nome });
    setNome("");
    carregar();
  }

  async function salvarEdicao(id) {
    await supabase.from("categorias").update({ nome: nomeEdicao }).eq("id", id);
    setEditando(null);
    carregar();
  }

  async function excluir(categoria) {
    const [emLancamentos, emTipos, emModelos] = await Promise.all([
      supabase.from("lancamentos").select("id", { count: "exact", head: true }).eq("categoria_id", categoria.id),
      supabase.from("tipos_servico").select("id", { count: "exact", head: true }).eq("categoria_id", categoria.id),
      supabase.from("modelos").select("id", { count: "exact", head: true }).eq("categoria_id", categoria.id),
    ]);
    const totalUso = (emLancamentos.count || 0) + (emTipos.count || 0) + (emModelos.count || 0);
    if (totalUso > 0) {
      alert(
        `Não é possível excluir "${categoria.nome}" — ela está em uso (${emLancamentos.count || 0} lançamento(s), ${emTipos.count || 0} tipo(s) de serviço, ${emModelos.count || 0} modelo(s)).`
      );
      return;
    }
    if (!window.confirm(`Excluir a categoria "${categoria.nome}"?`)) return;
    await supabase.from("categorias").delete().eq("id", categoria.id);
    carregar();
  }

  const permitido = podeConfigCategorias(usuario.cargo);
  if (!permitido) {
    return <p className="text-sm text-muted">Somente Gerência, Administrador ou Diretor cadastram categorias.</p>;
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <p className="text-xs uppercase tracking-wider text-muted mb-1">Configurações</p>
        <h1 className="font-display text-2xl font-semibold text-ink">Categorias</h1>
        <p className="text-sm text-muted mt-1">{categorias.length} categorias cadastradas</p>
      </div>

      <form onSubmit={salvar} className="card p-4 flex gap-3 mb-6 items-end">
        <div className="flex-1">
          <label className="field-label">Nova categoria</label>
          <input className="field-input" placeholder="Ex: Robô" value={nome} onChange={(e) => setNome(e.target.value)} required />
        </div>
        <button className="btn-primary" type="submit">Adicionar</button>
      </form>

      <div className="grid grid-cols-2 gap-3">
        {categorias.map((c) => {
          const Icone = iconeCategoria(c.nome);
          const emEdicao = editando === c.id;
          return (
            <div key={c.id} className="card p-3 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-gold-soft flex items-center justify-center text-gold-strong shrink-0">
                <Icone size={17} />
              </div>
              {emEdicao ? (
                <input className="field-input flex-1" value={nomeEdicao} onChange={(e) => setNomeEdicao(e.target.value)} autoFocus />
              ) : (
                <span className="flex-1 text-sm font-medium">{c.nome}</span>
              )}
              <div className="flex items-center gap-1.5 shrink-0">
                {emEdicao ? (
                  <>
                    <button className="btn-primary text-xs px-2 py-1.5" onClick={() => salvarEdicao(c.id)}>Salvar</button>
                    <button className="btn text-xs px-2 py-1.5" onClick={() => setEditando(null)}>Cancelar</button>
                  </>
                ) : (
                  <>
                    <button className="btn text-xs px-2 py-1.5" onClick={() => { setEditando(c.id); setNomeEdicao(c.nome); }}>Editar</button>
                    <button className="btn text-danger px-2 py-1.5" title="Excluir" onClick={() => excluir(c)}>
                      <Trash2 size={14} />
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function CategoriasPage() {
  return (
    <AppShell>
      <Conteudo />
    </AppShell>
  );
}
