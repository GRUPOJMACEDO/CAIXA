"use client";
import { useEffect, useState } from "react";
import { Search, X, FileDown } from "lucide-react";
import AppShell from "../../components/AppShell";
import { supabase } from "../../lib/supabaseClient";
import { useSessao } from "../../lib/SessaoContext";
import { formatarDataBR, formatarMoedaSemSimbolo } from "../../lib/formato";

function paraCSV(linhas, mostrarUnidade) {
  const cabecalho = ["Data", ...(mostrarUnidade ? ["Unidade"] : []), "Nº OS", "Categoria", "Tipo de Serviço", "Orçamento Aprovado", "Valor Pago"];
  const corpo = linhas.map((l) => [
    formatarDataBR(l.data),
    ...(mostrarUnidade ? [l.unidades?.nome || ""] : []),
    l.numero_os,
    l.categorias?.nome || "",
    l.tipos_servico?.nome || "",
    formatarMoedaSemSimbolo(l.orcamento_aprovado),
    formatarMoedaSemSimbolo(l.valor_pago),
  ]);
  const escapar = (v) => `"${String(v).replace(/"/g, '""')}"`;
  return [cabecalho, ...corpo].map((linha) => linha.map(escapar).join(";")).join("\n");
}

function Conteudo() {
  const { unidades } = useSessao();
  const [categorias, setCategorias] = useState([]);
  const [numeroOs, setNumeroOs] = useState("");
  const [dataDe, setDataDe] = useState("");
  const [dataAte, setDataAte] = useState("");
  const [categoriaId, setCategoriaId] = useState("");
  const [unidadeId, setUnidadeId] = useState("");
  const [resultados, setResultados] = useState(null);
  const [buscando, setBuscando] = useState(false);
  const mostrarUnidade = unidades.length > 1;

  useEffect(() => {
    supabase.from("categorias").select("*").order("nome").then(({ data }) => setCategorias(data || []));
  }, []);

  async function buscar(e) {
    e.preventDefault();
    setBuscando(true);
    let query = supabase
      .from("lancamentos")
      .select("id, data, numero_os, valor_pago, orcamento_aprovado, unidade_id, unidades(nome), categorias(nome), tipos_servico(nome)")
      .in("unidade_id", unidadeId ? [unidadeId] : unidades.map((u) => u.id))
      .order("data", { ascending: false })
      .limit(300);

    if (numeroOs.trim()) query = query.ilike("numero_os", `%${numeroOs.trim().toUpperCase()}%`);
    if (dataDe) query = query.gte("data", dataDe);
    if (dataAte) query = query.lte("data", dataAte);
    if (categoriaId) query = query.eq("categoria_id", categoriaId);

    const { data } = await query;
    setResultados(data || []);
    setBuscando(false);
  }

  function limpar() {
    setNumeroOs("");
    setDataDe("");
    setDataAte("");
    setCategoriaId("");
    setUnidadeId("");
    setResultados(null);
  }

  function exportar() {
    const csv = "\uFEFF" + paraCSV(resultados, mostrarUnidade);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `consulta-caixa-jmacedo-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
  }

  return (
    <div className="max-w-5xl">
      <div className="mb-6">
        <p className="text-xs uppercase tracking-wider text-muted mb-1">Operação</p>
        <h1 className="font-display text-2xl font-semibold text-ink">Consulta</h1>
        <p className="text-sm text-muted mt-1">Busque lançamentos por Nº da OS, data, categoria{mostrarUnidade && " ou unidade"}.</p>
      </div>

      <form onSubmit={buscar} className="card p-4 grid grid-cols-4 gap-3 mb-6 items-end">
        <div>
          <label className="field-label">Nº da OS</label>
          <input className="field-input" value={numeroOs} onChange={(e) => setNumeroOs(e.target.value.toUpperCase())} placeholder="Ex: O-00000015" />
        </div>
        <div>
          <label className="field-label">Data de</label>
          <input className="field-input" type="date" value={dataDe} onChange={(e) => setDataDe(e.target.value)} />
        </div>
        <div>
          <label className="field-label">Data até</label>
          <input className="field-input" type="date" value={dataAte} onChange={(e) => setDataAte(e.target.value)} />
        </div>
        <div>
          <label className="field-label">Categoria</label>
          <select className="field-input" value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)}>
            <option value="">Todas</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>{c.nome}</option>
            ))}
          </select>
        </div>
        {mostrarUnidade && (
          <div className="col-span-2">
            <label className="field-label">Unidade</label>
            <select className="field-input" value={unidadeId} onChange={(e) => setUnidadeId(e.target.value)}>
              <option value="">Todas as unidades</option>
              {unidades.map((u) => (
                <option key={u.id} value={u.id}>{u.nome}</option>
              ))}
            </select>
          </div>
        )}
        <div className={`${mostrarUnidade ? "col-span-2" : "col-span-4"} flex justify-end gap-2`}>
          <button type="button" className="btn flex items-center gap-1.5" onClick={limpar}>
            <X size={14} /> Limpar pesquisa
          </button>
          <button type="submit" className="btn-primary flex items-center gap-1.5" disabled={buscando}>
            <Search size={14} /> {buscando ? "Buscando…" : "Buscar"}
          </button>
        </div>
      </form>

      {resultados && (
        <>
          <div className="flex justify-between items-center mb-3">
            <p className="text-sm text-muted">{resultados.length} resultado(s)</p>
            {resultados.length > 0 && (
              <button className="btn flex items-center gap-1.5" onClick={exportar}>
                <FileDown size={14} /> Exportar para Excel
              </button>
            )}
          </div>
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wider text-muted border-b border-line">
                  <td className="p-3">Data</td>
                  {mostrarUnidade && <td className="p-3">Unidade</td>}
                  <td className="p-3">Nº OS</td>
                  <td className="p-3">Categoria</td>
                  <td className="p-3">Tipo de serviço</td>
                  <td className="p-3 text-right">Orçamento</td>
                  <td className="p-3 text-right">Pago</td>
                </tr>
              </thead>
              <tbody>
                {resultados.length === 0 && (
                  <tr><td className="p-4 text-muted text-center" colSpan={mostrarUnidade ? 7 : 6}>Nenhum resultado encontrado.</td></tr>
                )}
                {resultados.map((r) => (
                  <tr key={r.id} className="border-t border-line">
                    <td className="p-3">{formatarDataBR(r.data)}</td>
                    {mostrarUnidade && <td className="p-3">{r.unidades?.nome}</td>}
                    <td className="p-3 font-mono-num">{r.numero_os}</td>
                    <td className="p-3">{r.categorias?.nome || "—"}</td>
                    <td className="p-3">{r.tipos_servico?.nome}</td>
                    <td className="p-3 text-right font-mono-num">R$ {formatarMoedaSemSimbolo(r.orcamento_aprovado)}</td>
                    <td className="p-3 text-right font-mono-num font-medium">R$ {formatarMoedaSemSimbolo(r.valor_pago)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

export default function ConsultaPage() {
  return (
    <AppShell>
      <Conteudo />
    </AppShell>
  );
}
