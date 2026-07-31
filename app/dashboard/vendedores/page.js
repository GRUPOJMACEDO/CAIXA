"use client";
import { useEffect, useState } from "react";
import { Wallet, CheckCircle2, Clock, Percent, Hash } from "lucide-react";
import AppShell from "../../../components/AppShell";
import { supabase } from "../../../lib/supabaseClient";
import { useSessao } from "../../../lib/SessaoContext";
import { formatarMoedaSemSimbolo, mesReferenciaLabel } from "../../../lib/formato";

function inicioMes() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

const MEDALHA = ["text-gold", "text-prata", "text-bronze"];

function ConteudoVendedores() {
  const { unidades } = useSessao();
  const [linhas, setLinhas] = useState([]);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    if (unidades.length === 0) return;
    (async () => {
      const { data: categoriaAcessorio } = await supabase.from("categorias").select("id").eq("nome", "Acessório").single();
      if (!categoriaAcessorio) {
        setCarregando(false);
        return;
      }

      const { data: lancs } = await supabase
        .from("lancamentos")
        .select("atendente_id, orcamento_aprovado, valor_pago, numero_os, usuarios!atendente_id(nome_completo)")
        .in("unidade_id", unidades.map((u) => u.id))
        .eq("categoria_id", categoriaAcessorio.id)
        .gte("data", inicioMes());

      const mapa = {};
      (lancs || []).forEach((l) => {
        const id = l.atendente_id;
        if (!mapa[id]) {
          mapa[id] = { id, nome: l.usuarios?.nome_completo || "—", orcamento: 0, pago: 0, qtdOs: new Set() };
        }
        mapa[id].orcamento += Number(l.orcamento_aprovado);
        mapa[id].pago += Number(l.valor_pago);
        mapa[id].qtdOs.add(l.numero_os);
      });

      const lista = Object.values(mapa)
        .map((v) => ({ ...v, falta: v.orcamento - v.pago, premio: v.pago * 0.05, qtdOs: v.qtdOs.size }))
        .sort((a, b) => b.pago - a.pago);

      setLinhas(lista);
      setCarregando(false);
    })();
  }, [unidades]);

  const totalOrcamento = linhas.reduce((s, l) => s + l.orcamento, 0);
  const totalPago = linhas.reduce((s, l) => s + l.pago, 0);
  const totalFalta = linhas.reduce((s, l) => s + l.falta, 0);
  const totalQtdOs = linhas.reduce((s, l) => s + l.qtdOs, 0);

  return (
    <div className="max-w-5xl">
      <div className="mb-6">
        <p className="text-xs uppercase tracking-wider text-muted mb-1">Dashboard</p>
        <h1 className="font-display text-2xl font-semibold text-ink">Vendedores — Acessórios de {mesReferenciaLabel(inicioMes())}</h1>
        <p className="text-sm text-muted mt-1">Ranking de vendas de acessórios por atendente, com prêmio de 5%.</p>
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
              <td className="p-3">Atendente</td>
              <td className="p-3 text-right">Valor vendido</td>
              <td className="p-3 text-right">Prêmio (5%)</td>
              <td className="p-3 text-right">Qtd. OS</td>
            </tr>
          </thead>
          <tbody>
            {carregando && <tr><td className="p-4 text-muted" colSpan={4}>Carregando…</td></tr>}
            {!carregando && linhas.length === 0 && <tr><td className="p-4 text-muted" colSpan={4}>Nenhuma venda de acessório no mês.</td></tr>}
            {linhas.map((l, i) => (
              <tr key={l.id} className="border-t border-line">
                <td className="p-3">
                  <span className="inline-flex items-center gap-2">
                    <span className={`text-xs font-semibold w-6 ${MEDALHA[i] || "text-muted"}`}>{i + 1}º</span>
                    {l.nome}
                  </span>
                </td>
                <td className="p-3 text-right font-mono-num font-medium">R$ {formatarMoedaSemSimbolo(l.pago)}</td>
                <td className="p-3 text-right font-mono-num text-gold">R$ {formatarMoedaSemSimbolo(l.premio)}</td>
                <td className="p-3 text-right font-mono-num text-muted">{l.qtdOs}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function DashboardVendedoresPage() {
  return (
    <AppShell>
      <ConteudoVendedores />
    </AppShell>
  );
}
