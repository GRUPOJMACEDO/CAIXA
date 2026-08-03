"use client";
import { useEffect, useState } from "react";
import { Search, X, FileDown, Pencil, SearchX, Trash2, AlertTriangle } from "lucide-react";
import AppShell from "../../components/AppShell";
import Modal from "../../components/Modal";
import CurrencyInput from "../../components/CurrencyInput";
import { supabase } from "../../lib/supabaseClient";
import { useSessao } from "../../lib/SessaoContext";
import { podeAlterar, podeExcluirLancamento } from "../../lib/permissions";
import { iconeCategoria } from "../../lib/iconesCategoria";
import { formatarDataBR, formatarMoedaSemSimbolo } from "../../lib/formato";

const FORMAS_PAGAMENTO = ["PIX", "DÉBITO", "CRÉDITO", "DINHEIRO", "BOLETO", "LINK DE PAGAMENTO"];

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
  const { usuario, unidades } = useSessao();
  const [categorias, setCategorias] = useState([]);
  const [numeroOs, setNumeroOs] = useState("");
  const [dataDe, setDataDe] = useState("");
  const [dataAte, setDataAte] = useState("");
  const [categoriaId, setCategoriaId] = useState("");
  const [unidadeId, setUnidadeId] = useState("");
  const [resultados, setResultados] = useState(null);
  const [buscando, setBuscando] = useState(false);
  const [selecionado, setSelecionado] = useState(null);
  const [editando, setEditando] = useState(false);
  const [edicao, setEdicao] = useState({});
  const [salvando, setSalvando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const [motivoExclusao, setMotivoExclusao] = useState("");
  const [processandoExclusao, setProcessandoExclusao] = useState(false);
  const mostrarUnidade = unidades.length > 1;
  const podeEditar = podeAlterar(usuario.cargo);
  const podeExcluir = podeExcluirLancamento(usuario.cargo);

  useEffect(() => {
    supabase.from("categorias").select("*").order("nome").then(({ data }) => setCategorias(data || []));
  }, []);

  async function buscar(e) {
    e.preventDefault();
    setBuscando(true);
    let query = supabase
      .from("lancamentos")
      .select(
        "id, data, numero_os, valor_pago, orcamento_aprovado, forma_pagamento, parcelas, bandeira, unidade_id, categoria_id, tipo_servico_id, unidades(nome), categorias(nome), tipos_servico(nome), usuarios!atendente_id(nome_completo)"
      )
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

  function abrirDetalhe(item) {
    setSelecionado(item);
    setEditando(false);
    setExcluindo(false);
    setMotivoExclusao("");
    setEdicao({
      orcamento_aprovado: Number(item.orcamento_aprovado),
      valor_pago: Number(item.valor_pago),
      forma_pagamento: item.forma_pagamento,
      parcelas: item.parcelas || "",
      bandeira: item.bandeira || "",
    });
  }

  async function confirmarExclusao() {
    if (!motivoExclusao.trim()) return;
    setProcessandoExclusao(true);
    // primeiro grava o motivo (fica no log de auditoria), depois exclui de fato
    const { error: erroMotivo } = await supabase
      .from("lancamentos")
      .update({ motivo_exclusao: motivoExclusao.trim(), alterado_por: usuario.id, alterado_em: new Date().toISOString() })
      .eq("id", selecionado.id);
    if (erroMotivo) {
      alert("Erro ao registrar o motivo: " + erroMotivo.message);
      setProcessandoExclusao(false);
      return;
    }
    const { data, error } = await supabase.from("lancamentos").delete().eq("id", selecionado.id).select();
    setProcessandoExclusao(false);
    if (error) {
      alert("Erro ao excluir: " + error.message);
      return;
    }
    if (!data || data.length === 0) {
      alert("Não foi possível excluir — você não tem permissão para esta ação.");
      return;
    }
    setResultados((atual) => atual.filter((r) => r.id !== selecionado.id));
    setSelecionado(null);
  }

  async function salvarEdicao() {
    setSalvando(true);
    const { error } = await supabase
      .from("lancamentos")
      .update({
        orcamento_aprovado: Number(edicao.orcamento_aprovado),
        valor_pago: Number(edicao.valor_pago),
        forma_pagamento: edicao.forma_pagamento,
        parcelas: edicao.parcelas ? Number(edicao.parcelas) : null,
        bandeira: edicao.bandeira || null,
        alterado_por: usuario.id,
        alterado_em: new Date().toISOString(),
      })
      .eq("id", selecionado.id);
    setSalvando(false);
    if (error) {
      alert("Erro ao salvar: " + error.message);
      return;
    }
    setResultados((atual) =>
      atual.map((r) => (r.id === selecionado.id ? { ...r, ...edicao, orcamento_aprovado: edicao.orcamento_aprovado, valor_pago: edicao.valor_pago } : r))
    );
    setEditando(false);
    setSelecionado(null);
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

          {resultados.length === 0 ? (
            <div className="card p-10 flex flex-col items-center text-center text-muted">
              <SearchX size={28} className="mb-2 opacity-60" />
              <p>Nenhum resultado encontrado.</p>
            </div>
          ) : (
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
                    <td className="p-3 w-10"></td>
                  </tr>
                </thead>
                <tbody>
                  {resultados.map((r) => {
                    const Icone = iconeCategoria(r.categorias?.nome);
                    return (
                      <tr key={r.id} className="border-t border-line hover:bg-canvas/60 cursor-pointer" onClick={() => abrirDetalhe(r)}>
                        <td className="p-3">{formatarDataBR(r.data)}</td>
                        {mostrarUnidade && <td className="p-3">{r.unidades?.nome}</td>}
                        <td className="p-3 font-mono-num">{r.numero_os}</td>
                        <td className="p-3">
                          <span className="inline-flex items-center gap-1.5">
                            <Icone size={13} className="text-muted" />
                            {r.categorias?.nome || "—"}
                          </span>
                        </td>
                        <td className="p-3">{r.tipos_servico?.nome}</td>
                        <td className="p-3 text-right font-mono-num">R$ {formatarMoedaSemSimbolo(r.orcamento_aprovado)}</td>
                        <td className="p-3 text-right font-mono-num font-medium">R$ {formatarMoedaSemSimbolo(r.valor_pago)}</td>
                        <td className="p-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {podeEditar && (
                              <button
                                className="text-muted hover:text-gold transition"
                                title="Alterar"
                                onClick={(e) => { e.stopPropagation(); abrirDetalhe(r); setEditando(true); }}
                              >
                                <Pencil size={14} />
                              </button>
                            )}
                            {podeExcluir && (
                              <button
                                className="text-muted hover:text-danger transition"
                                title="Excluir"
                                onClick={(e) => { e.stopPropagation(); abrirDetalhe(r); setExcluindo(true); }}
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {selecionado && (
        <Modal
          titulo={`OS ${selecionado.numero_os}`}
          subtitulo={mostrarUnidade ? selecionado.unidades?.nome : undefined}
          onFechar={() => setSelecionado(null)}
        >
          {excluindo ? (
            <div className="space-y-4">
              <div className="flex items-start gap-2 text-sm text-danger">
                <AlertTriangle size={18} className="shrink-0 mt-0.5" />
                <p>
                  Você está prestes a excluir permanentemente o lançamento de{" "}
                  <span className="font-mono-num font-medium">R$ {formatarMoedaSemSimbolo(selecionado.valor_pago)}</span> da OS{" "}
                  <span className="font-mono-num font-medium">{selecionado.numero_os}</span>. Essa ação não pode ser desfeita.
                </p>
              </div>
              <div>
                <label className="field-label">Motivo da exclusão (obrigatório)</label>
                <textarea
                  className="field-input"
                  rows={3}
                  value={motivoExclusao}
                  onChange={(e) => setMotivoExclusao(e.target.value)}
                  placeholder="Ex: lançamento de teste, duplicado por engano, etc."
                />
                <p className="text-xs text-muted mt-1">O motivo fica registrado no log do sistema, junto com os dados do lançamento excluído.</p>
              </div>
              <div className="flex justify-end gap-2">
                <button className="btn" onClick={() => setExcluindo(false)}>Cancelar</button>
                <button
                  className="btn-primary bg-danger hover:bg-danger flex items-center gap-1.5 disabled:opacity-40"
                  disabled={!motivoExclusao.trim() || processandoExclusao}
                  onClick={confirmarExclusao}
                >
                  <Trash2 size={14} /> {processandoExclusao ? "Excluindo…" : "Confirmar exclusão"}
                </button>
              </div>
            </div>
          ) : !editando ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><p className="text-xs text-muted">Data</p><p className="font-medium">{formatarDataBR(selecionado.data)}</p></div>
                <div><p className="text-xs text-muted">Categoria</p><p className="font-medium">{selecionado.categorias?.nome || "—"}</p></div>
                <div><p className="text-xs text-muted">Tipo de serviço</p><p className="font-medium">{selecionado.tipos_servico?.nome}</p></div>
                <div><p className="text-xs text-muted">Atendente</p><p className="font-medium">{selecionado.usuarios?.nome_completo}</p></div>
                <div><p className="text-xs text-muted">Orçamento aprovado</p><p className="font-mono-num font-medium">R$ {formatarMoedaSemSimbolo(selecionado.orcamento_aprovado)}</p></div>
                <div><p className="text-xs text-muted">Valor pago</p><p className="font-mono-num font-medium">R$ {formatarMoedaSemSimbolo(selecionado.valor_pago)}</p></div>
                <div><p className="text-xs text-muted">Forma de pagamento</p><p className="font-medium">{selecionado.forma_pagamento}</p></div>
                <div><p className="text-xs text-muted">Bandeira / Parcelas</p><p className="font-medium">{selecionado.bandeira || "—"} {selecionado.parcelas ? `· ${selecionado.parcelas}x` : ""}</p></div>
              </div>
              <div className="flex justify-end gap-2">
                {podeExcluir && (
                  <button className="btn flex items-center gap-1.5 text-danger border-danger/30 hover:bg-danger-soft" onClick={() => setExcluindo(true)}>
                    <Trash2 size={14} /> Excluir
                  </button>
                )}
                {podeEditar && (
                  <button className="btn flex items-center gap-1.5" onClick={() => setEditando(true)}>
                    <Pencil size={14} /> Alterar
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="field-label">Orçamento aprovado</label>
                  <CurrencyInput valor={edicao.orcamento_aprovado} onChange={(v) => setEdicao({ ...edicao, orcamento_aprovado: v })} />
                </div>
                <div>
                  <label className="field-label">Valor pago</label>
                  <CurrencyInput valor={edicao.valor_pago} onChange={(v) => setEdicao({ ...edicao, valor_pago: v })} />
                </div>
                <div>
                  <label className="field-label">Forma de pagamento</label>
                  <select className="field-input" value={edicao.forma_pagamento} onChange={(e) => setEdicao({ ...edicao, forma_pagamento: e.target.value })}>
                    {FORMAS_PAGAMENTO.map((f) => (
                      <option key={f} value={f}>{f}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="field-label">Bandeira</label>
                  <input className="field-input" value={edicao.bandeira} onChange={(e) => setEdicao({ ...edicao, bandeira: e.target.value.toUpperCase() })} />
                </div>
              </div>
              <p className="text-xs text-muted">Toda alteração fica registrada no log do sistema para auditoria.</p>
              <div className="flex justify-end gap-2">
                <button className="btn" onClick={() => setEditando(false)}>Cancelar</button>
                <button className="btn-primary" onClick={salvarEdicao} disabled={salvando}>
                  {salvando ? "Salvando…" : "Salvar alteração"}
                </button>
              </div>
            </div>
          )}
        </Modal>
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
