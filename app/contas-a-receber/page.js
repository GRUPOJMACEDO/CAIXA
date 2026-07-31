"use client";
import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import AppShell from "../../components/AppShell";
import Modal from "../../components/Modal";
import CurrencyInput from "../../components/CurrencyInput";
import { supabase } from "../../lib/supabaseClient";
import { useSessao } from "../../lib/SessaoContext";
import { podeVerTodasUnidades } from "../../lib/permissions";
import { formatarMoedaSemSimbolo, formatarDataBR } from "../../lib/formato";

function horasDesde(dataISO) {
  return (Date.now() - new Date(dataISO + "T00:00:00").getTime()) / 3600000;
}

function ConteudoContasAReceber() {
  const { usuario, unidades } = useSessao();
  const [linhas, setLinhas] = useState([]);
  const [filtroUnidade, setFiltroUnidade] = useState("");
  const [selecionada, setSelecionada] = useState(null);
  const [valorAgora, setValorAgora] = useState("");
  const [formaPagamento, setFormaPagamento] = useState("PIX");
  const [salvando, setSalvando] = useState(false);
  const [lembretesAbertos, setLembretesAbertos] = useState(false);
  const [lembretesMostrados, setLembretesMostrados] = useState(false);
  const unidadesMap = Object.fromEntries(unidades.map((u) => [u.id, u.nome]));
  const mostrarUnidade = podeVerTodasUnidades(usuario.cargo) || unidades.length > 1;

  async function carregar() {
    if (unidades.length === 0) return;
    const { data } = await supabase
      .from("vw_contas_a_receber")
      .select("*")
      .in("unidade_id", unidades.map((u) => u.id))
      .order("falta_pagar", { ascending: false });
    setLinhas(data || []);
  }

  useEffect(() => {
    carregar();
  }, [unidades]); // eslint-disable-line react-hooks/exhaustive-deps

  // lembretes: OS com mais de 24h em aberto — abre automaticamente 1x por dia
  const lembretes = linhas.filter((l) => horasDesde(l.ultimo_lancamento) >= 24);
  useEffect(() => {
    if (lembretesMostrados || lembretes.length === 0) return;
    const chave = `lembrete-contas-receber-${new Date().toISOString().slice(0, 10)}`;
    if (!window.localStorage.getItem(chave)) {
      setLembretesAbertos(true);
      window.localStorage.setItem(chave, "1");
    }
    setLembretesMostrados(true);
  }, [lembretes, lembretesMostrados]);

  const linhasFiltradas = filtroUnidade ? linhas.filter((l) => l.unidade_id === filtroUnidade) : linhas;
  const totalOrcamento = linhasFiltradas.reduce((s, l) => s + Number(l.orcamento_aprovado), 0);
  const totalFalta = linhasFiltradas.reduce((s, l) => s + Number(l.falta_pagar), 0);
  const percentualFalta = totalOrcamento ? (totalFalta / totalOrcamento) * 100 : 0;

  function abrirPopup(linha) {
    setSelecionada(linha);
    setValorAgora(Number(linha.falta_pagar));
    setFormaPagamento("PIX");
  }

  async function confirmarPagamento() {
    if (!selecionada) return;
    setSalvando(true);
    await supabase.from("lancamentos").insert({
      unidade_id: selecionada.unidade_id,
      data: new Date().toISOString().slice(0, 10),
      numero_os: selecionada.numero_os,
      categoria_id: selecionada.categoria_id,
      modelo_id: selecionada.modelo_id,
      tipo_servico_id: selecionada.tipo_servico_id,
      orcamento_aprovado: Number(selecionada.orcamento_aprovado),
      valor_pago: Number(valorAgora),
      forma_pagamento: formaPagamento,
      atendente_id: usuario.id,
      criado_por: usuario.id,
    });
    setSalvando(false);
    setSelecionada(null);
    carregar();
  }

  return (
    <div className="max-w-4xl">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted mb-1">Operação</p>
          <h1 className="font-display text-2xl font-semibold text-ink">Contas a receber</h1>
        </div>
        <button onClick={() => setLembretesAbertos(true)} className="relative btn w-10 h-10 p-0" title="Lembretes de cobrança">
          <Bell size={16} />
          {lembretes.length > 0 && (
            <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-danger text-white text-[10px] flex items-center justify-center">
              {lembretes.length}
            </span>
          )}
        </button>
      </div>

      {mostrarUnidade && (
        <div className="mb-4 flex items-center gap-2">
          <span className="field-label mb-0">Unidade:</span>
          <select className="field-input w-56" value={filtroUnidade} onChange={(e) => setFiltroUnidade(e.target.value)}>
            <option value="">Todas as unidades</option>
            {unidades.map((u) => (
              <option key={u.id} value={u.id}>{u.nome}</option>
            ))}
          </select>
        </div>
      )}

      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="card p-4">
          <p className="text-xs text-muted mb-1">Total a receber</p>
          <p className="font-mono-num text-xl font-semibold text-bronze">R$ {formatarMoedaSemSimbolo(totalFalta)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-muted mb-1">% do orçamento total</p>
          <p className="font-mono-num text-xl font-semibold text-ink">{percentualFalta.toFixed(1)}%</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-muted mb-1">OS em aberto</p>
          <p className="font-mono-num text-xl font-semibold text-ink">{linhasFiltradas.length}</p>
        </div>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wider text-muted border-b border-line">
              {mostrarUnidade && <td className="p-3">Unidade</td>}
              <td className="p-3">Nº OS</td>
              <td className="p-3 text-right">Orçamento</td>
              <td className="p-3 text-right">Pago</td>
              <td className="p-3 text-right">Falta pagar</td>
              <td className="p-3">Último lançamento</td>
            </tr>
          </thead>
          <tbody>
            {linhasFiltradas.length === 0 && (
              <tr><td className="p-4 text-muted" colSpan={mostrarUnidade ? 6 : 5}>Nenhuma OS em aberto.</td></tr>
            )}
            {linhasFiltradas.map((l) => (
              <tr
                key={`${l.unidade_id}-${l.numero_os}`}
                className="border-t border-line hover:bg-canvas/60 cursor-pointer"
                onClick={() => abrirPopup(l)}
              >
                {mostrarUnidade && <td className="p-3">{unidadesMap[l.unidade_id]}</td>}
                <td className="p-3 font-mono-num">{l.numero_os}</td>
                <td className="p-3 text-right font-mono-num">R$ {formatarMoedaSemSimbolo(l.orcamento_aprovado)}</td>
                <td className="p-3 text-right font-mono-num">R$ {formatarMoedaSemSimbolo(l.total_pago)}</td>
                <td className="p-3 text-right font-mono-num font-medium text-bronze">R$ {formatarMoedaSemSimbolo(l.falta_pagar)}</td>
                <td className="p-3 text-muted">{formatarDataBR(l.ultimo_lancamento)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selecionada && (
        <Modal titulo={`OS ${selecionada.numero_os}`} subtitulo={mostrarUnidade ? unidadesMap[selecionada.unidade_id] : "Quitar saldo em aberto"} onFechar={() => setSelecionada(null)}>
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div><p className="text-xs text-muted">Orçamento</p><p className="font-mono-num font-medium">R$ {formatarMoedaSemSimbolo(selecionada.orcamento_aprovado)}</p></div>
              <div><p className="text-xs text-muted">Já pago</p><p className="font-mono-num font-medium">R$ {formatarMoedaSemSimbolo(selecionada.total_pago)}</p></div>
              <div><p className="text-xs text-muted">Falta pagar</p><p className="font-mono-num font-medium text-bronze">R$ {formatarMoedaSemSimbolo(selecionada.falta_pagar)}</p></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="field-label">Valor a receber agora</label>
                <CurrencyInput valor={valorAgora} onChange={setValorAgora} />
              </div>
              <div>
                <label className="field-label">Forma de pagamento</label>
                <select className="field-input" value={formaPagamento} onChange={(e) => setFormaPagamento(e.target.value)}>
                  {["PIX", "DÉBITO", "CRÉDITO", "DINHEIRO", "BOLETO", "LINK DE PAGAMENTO"].map((f) => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button className="btn" onClick={() => setSelecionada(null)}>Cancelar</button>
              <button className="btn-primary" onClick={confirmarPagamento} disabled={salvando}>
                {salvando ? "Salvando…" : "Registrar recebimento"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {lembretesAbertos && (
        <Modal
          titulo="Lembretes de cobrança"
          subtitulo={`${lembretes.length} OS com mais de 24h em aberto`}
          onFechar={() => setLembretesAbertos(false)}
        >
          {lembretes.length === 0 ? (
            <p className="text-sm text-muted">Nenhuma pendência com mais de 24h no momento. 🎉</p>
          ) : (
            <div className="space-y-3">
              {lembretes.map((l) => (
                <div key={`${l.unidade_id}-${l.numero_os}`} className="rounded-lg border border-line p-3 text-sm">
                  <p className="text-ink">
                    A OS <span className="font-mono-num font-medium">{l.numero_os}</span>
                    {mostrarUnidade && <> ({unidadesMap[l.unidade_id]})</>} está com{" "}
                    <span className="font-mono-num font-medium text-bronze">R$ {formatarMoedaSemSimbolo(l.falta_pagar)}</span> em
                    aberto desde <span className="font-medium">{formatarDataBR(l.ultimo_lancamento)}</span>. Entre em contato com o
                    cliente para efetuar a cobrança.
                  </p>
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}

export default function ContasAReceber() {
  return (
    <AppShell>
      <ConteudoContasAReceber />
    </AppShell>
  );
}
