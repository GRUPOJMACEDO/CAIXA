"use client";
import { useEffect, useState } from "react";
import { Wallet, CheckCircle2, Clock, Percent, Hash, Lock } from "lucide-react";
import AppShell from "../../../components/AppShell";
import Modal from "../../../components/Modal";
import { supabase } from "../../../lib/supabaseClient";
import { useSessao } from "../../../lib/SessaoContext";
import { formatarMoedaSemSimbolo, formatarDataBR } from "../../../lib/formato";

function hoje() {
  return new Date().toISOString().slice(0, 10);
}

const MEDALHA = ["text-gold", "text-prata", "text-bronze"];

function ConteudoDashboard() {
  const { unidades } = useSessao();
  const [linhas, setLinhas] = useState([]);
  const [lancamentosDetalhe, setLancamentosDetalhe] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [detalhe, setDetalhe] = useState(null);
  const [carregandoDetalhe, setCarregandoDetalhe] = useState(false);

  const idsAutorizados = new Set(unidades.map((u) => u.id));

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("vw_dashboard_valores_diario").select("*");
      const lista = (data || []).map((u) => ({ ...u, falta: Number(u.orcamento_aprovado) - Number(u.valor_pago) }));
      setLinhas(lista);
      setCarregando(false);
    })();
  }, []);

  const totalPago = linhas.reduce((s, l) => s + Number(l.valor_pago), 0);
  const totalOrcamento = linhas.reduce((s, l) => s + Number(l.orcamento_aprovado), 0);
  const totalFalta = linhas.reduce((s, l) => s + l.falta, 0);
  const totalQtdOs = linhas.reduce((s, l) => s + Number(l.qtd_os), 0);
  const ordenadas = linhas.slice().sort((a, b) => Number(b.valor_pago) - Number(a.valor_pago));

  async function abrirDetalhe(unidade) {
    setDetalhe({ titulo: unidade.unidade_nome, unidadeId: unidade.unidade_id });
    if (!idsAutorizados.has(unidade.unidade_id)) return;
    setCarregandoDetalhe(true);
    const { data } = await supabase
      .from("lancamentos")
      .select("id, data, numero_os, orcamento_aprovado, valor_pago, tipos_servico(nome)")
      .eq("unidade_id", unidade.unidade_id)
      .eq("data", hoje())
      .order("data", { ascending: false });
    setLancamentosDetalhe(data || []);
    setCarregandoDetalhe(false);
  }

  return (
    <div className="max-w-5xl">
      <div className="mb-6">
        <p className="text-xs uppercase tracking-wider text-muted mb-1">Dashboard</p>
        <h1 className="font-display text-2xl font-semibold text-ink">Valores (Diário) — {formatarDataBR(hoje())}</h1>
        <p className="text-sm text-muted mt-1">Ranking de todas as unidades do grupo, só de hoje.</p>
      </div>

      <div className="grid grid-cols-5 gap-3 mb-6">
        <div className="card overflow-hidden">
          <div className="h-1.5 bg-[#2670B5]" />
          <div className="p-4">
            <div className="w-8 h-8 rounded-lg bg-[#2670B5]/10 flex items-center justify-center text-[#2670B5] mb-2"><Wallet size={16} /></div>
            <p className="text-xs text-muted mb-1">Orçamento aprovado</p>
            <p className="font-mono-num text-xl font-semibold text-ink">R$ {formatarMoedaSemSimbolo(totalOrcamento)}</p>
          </div>
        </div>
        <div className="card overflow-hidden">
          <div className="h-1.5 bg-[#3F8A5C]" />
          <div className="p-4">
            <div className="w-8 h-8 rounded-lg bg-[#3F8A5C]/10 flex items-center justify-center text-[#3F8A5C] mb-2"><CheckCircle2 size={16} /></div>
            <p className="text-xs text-muted mb-1">Valor pago</p>
            <p className="font-mono-num text-xl font-semibold text-ink">R$ {formatarMoedaSemSimbolo(totalPago)}</p>
          </div>
        </div>
        <div className="card overflow-hidden">
          <div className="h-1.5 bg-[#9C5A34]" />
          <div className="p-4">
            <div className="w-8 h-8 rounded-lg bg-[#9C5A34]/10 flex items-center justify-center text-[#9C5A34] mb-2"><Clock size={16} /></div>
            <p className="text-xs text-muted mb-1">Total a receber</p>
            <p className="font-mono-num text-xl font-semibold text-[#9C5A34]">R$ {formatarMoedaSemSimbolo(totalFalta)}</p>
          </div>
        </div>
        <div className="card overflow-hidden">
          <div className="h-1.5 bg-[#C9A227]" />
          <div className="p-4">
            <div className="w-8 h-8 rounded-lg bg-[#C9A227]/10 flex items-center justify-center text-[#9C7E13] mb-2"><Percent size={16} /></div>
            <p className="text-xs text-muted mb-1">% recebido</p>
            <p className="font-mono-num text-xl font-semibold text-[#9C7E13]">{totalOrcamento ? ((totalPago / totalOrcamento) * 100).toFixed(1) : "0.0"}%</p>
          </div>
        </div>
        <div className="card overflow-hidden">
          <div className="h-1.5 bg-[#7C819C]" />
          <div className="p-4">
            <div className="w-8 h-8 rounded-lg bg-[#7C819C]/10 flex items-center justify-center text-[#7C819C] mb-2"><Hash size={16} /></div>
            <p className="text-xs text-muted mb-1">Qtd. de OS</p>
            <p className="font-mono-num text-xl font-semibold text-ink">{totalQtdOs}</p>
          </div>
        </div>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wider text-muted border-b border-line">
              <td className="p-3">Unidade</td>
              <td className="p-3 text-right">Orçamento</td>
              <td className="p-3 text-right">Pago</td>
              <td className="p-3 text-right">Falta pagar</td>
              <td className="p-3 text-right">Qtd. OS</td>
            </tr>
          </thead>
          <tbody>
            {carregando && <tr><td className="p-4 text-muted" colSpan={5}>Carregando…</td></tr>}
            {ordenadas.map((l, i) => (
              <tr key={l.unidade_id} className="border-t border-line hover:bg-canvas/60 cursor-pointer" onClick={() => abrirDetalhe(l)}>
                <td className="p-3">
                  <span className="inline-flex items-center gap-2">
                    <span className={`text-xs font-semibold w-6 ${MEDALHA[i] || "text-muted"}`}>{i + 1}º</span>
                    {l.unidade_nome}
                    {!idsAutorizados.has(l.unidade_id) && <Lock size={12} className="text-muted" />}
                  </span>
                </td>
                <td className="p-3 text-right font-mono-num">R$ {formatarMoedaSemSimbolo(l.orcamento_aprovado)}</td>
                <td className="p-3 text-right font-mono-num font-medium">R$ {formatarMoedaSemSimbolo(l.valor_pago)}</td>
                <td className="p-3 text-right font-mono-num text-muted">R$ {formatarMoedaSemSimbolo(l.falta)}</td>
                <td className="p-3 text-right font-mono-num text-muted">{l.qtd_os}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {detalhe && (
        <Modal titulo={detalhe.titulo} subtitulo={`${lancamentosDetalhe.length} lançamento(s) hoje`} onFechar={() => setDetalhe(null)} largura="max-w-3xl">
          {!idsAutorizados.has(detalhe.unidadeId) ? (
            <div className="flex flex-col items-center text-center py-6 text-muted">
              <Lock size={22} className="mb-2 opacity-60" />
              <p className="text-sm">Você só pode ver o detalhe dos lançamentos da sua própria unidade.</p>
            </div>
          ) : carregandoDetalhe ? (
            <p className="text-sm text-muted py-6 text-center">Carregando…</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wider text-muted border-b border-line">
                  <td className="pb-2">Data</td>
                  <td className="pb-2">OS</td>
                  <td className="pb-2">Tipo de serviço</td>
                  <td className="pb-2 text-right">Orçamento</td>
                  <td className="pb-2 text-right">Valor pago</td>
                </tr>
              </thead>
              <tbody>
                {lancamentosDetalhe.map((l) => (
                  <tr key={l.id} className="border-t border-line">
                    <td className="py-2">{formatarDataBR(l.data)}</td>
                    <td className="py-2 font-mono-num">{l.numero_os}</td>
                    <td className="py-2">{l.tipos_servico?.nome}</td>
                    <td className="py-2 text-right font-mono-num">R$ {formatarMoedaSemSimbolo(l.orcamento_aprovado)}</td>
                    <td className="py-2 text-right font-mono-num font-medium">R$ {formatarMoedaSemSimbolo(l.valor_pago)}</td>
                  </tr>
                ))}
                {lancamentosDetalhe.length === 0 && (
                  <tr><td colSpan={5} className="py-4 text-muted text-center">Nenhum lançamento.</td></tr>
                )}
              </tbody>
            </table>
          )}
        </Modal>
      )}
    </div>
  );
}

export default function DashboardValoresDiarioPage() {
  return (
    <AppShell>
      <ConteudoDashboard />
    </AppShell>
  );
}
