"use client";
import { useState } from "react";
import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import { formatarMoedaSemSimbolo } from "../../lib/formato";
import { formatarPercentual, pct } from "../../lib/taxasCartao";

/**
 * Tabela padrão do Dashboard de Taxas (por unidade ou por mês).
 * Toda coluna é ordenável: 1º clique = maior para o menor, 2º = menor para o maior.
 *
 * linhas: [{ chave, nome, ordem?, valor_recebido, valor_cartao, valor_taxas }]
 */
const COLUNAS = [
  { id: "nome", rotulo: null, numero: false },
  { id: "recebido", rotulo: "Total recebido", numero: true },
  { id: "cartao", rotulo: "Recebido em cartão", numero: true },
  { id: "taxas", rotulo: "Taxas", numero: true },
  { id: "pct", rotulo: "% s/ cartão", numero: true },
  { id: "liquido", rotulo: "Líquido", numero: true },
];

function valorColuna(l, id) {
  switch (id) {
    case "recebido": return Number(l.valor_recebido);
    case "cartao": return Number(l.valor_cartao);
    case "taxas": return Number(l.valor_taxas);
    case "pct": return pct(l.valor_taxas, l.valor_cartao);
    case "liquido": return Number(l.valor_recebido) - Number(l.valor_taxas);
    default: return l.ordem ?? l.nome;
  }
}

export default function TabelaResumoTaxas({ linhas, rotuloNome = "Unidade", ordenacaoInicial = { coluna: "taxas", desc: true }, aoClicar, dicaClique, carregando, vazio = "Nenhum lançamento nesse período." }) {
  const [ord, setOrd] = useState(ordenacaoInicial);

  function clicarCabecalho(id) {
    setOrd((o) => (o.coluna === id ? { coluna: id, desc: !o.desc } : { coluna: id, desc: id !== "nome" }));
  }

  const ordenadas = linhas.slice().sort((a, b) => {
    const va = valorColuna(a, ord.coluna);
    const vb = valorColuna(b, ord.coluna);
    const cmp = typeof va === "string" ? va.localeCompare(vb, "pt-BR") : va - vb;
    return ord.desc ? -cmp : cmp;
  });

  const tot = linhas.reduce(
    (s, l) => ({ valor_recebido: s.valor_recebido + Number(l.valor_recebido), valor_cartao: s.valor_cartao + Number(l.valor_cartao), valor_taxas: s.valor_taxas + Number(l.valor_taxas) }),
    { valor_recebido: 0, valor_cartao: 0, valor_taxas: 0 }
  );

  function Cabecalho({ col }) {
    const ativo = ord.coluna === col.id;
    const Icone = !ativo ? ChevronsUpDown : ord.desc ? ChevronDown : ChevronUp;
    const rotulo = col.rotulo || rotuloNome;
    return (
      <td className={`p-3 ${col.numero ? "text-right" : ""}`}>
        <button
          type="button"
          onClick={() => clicarCabecalho(col.id)}
          title={col.id === "nome" ? "Ordenar por nome" : "Ordenar do maior para o menor (clique de novo para inverter)"}
          className={`inline-flex items-center gap-1 uppercase tracking-wider hover:text-ink transition ${ativo ? "text-ink font-semibold" : ""} ${col.id === "taxas" ? "text-[#B23B2E]" : ""}`}
        >
          {rotulo}
          <Icone size={12} className={ativo ? "" : "opacity-40"} />
        </button>
      </td>
    );
  }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-xs text-muted border-b border-line">
          {COLUNAS.map((c) => (
            <Cabecalho key={c.id} col={c} />
          ))}
        </tr>
      </thead>
      <tbody>
        {carregando && <tr><td className="p-4 text-muted" colSpan={6}>Carregando…</td></tr>}
        {!carregando && ordenadas.length === 0 && <tr><td className="p-4 text-muted" colSpan={6}>{vazio}</td></tr>}
        {!carregando &&
          ordenadas.map((l) => (
            <tr
              key={l.chave}
              className={`border-t border-line ${aoClicar ? "hover:bg-canvas/60 cursor-pointer" : ""}`}
              onClick={aoClicar ? () => aoClicar(l) : undefined}
              title={dicaClique}
            >
              <td className="p-3 font-medium text-ink">{l.nome}</td>
              <td className="p-3 text-right font-mono-num">R$ {formatarMoedaSemSimbolo(l.valor_recebido)}</td>
              <td className="p-3 text-right font-mono-num text-muted">R$ {formatarMoedaSemSimbolo(l.valor_cartao)}</td>
              <td className="p-3 text-right font-mono-num font-bold text-[#B23B2E] bg-[#B23B2E]/5">R$ {formatarMoedaSemSimbolo(l.valor_taxas)}</td>
              <td className="p-3 text-right font-mono-num text-muted">{formatarPercentual(pct(l.valor_taxas, l.valor_cartao))}</td>
              <td className="p-3 text-right font-mono-num text-[#2E6B45]">R$ {formatarMoedaSemSimbolo(Number(l.valor_recebido) - Number(l.valor_taxas))}</td>
            </tr>
          ))}
      </tbody>
      {!carregando && ordenadas.length > 1 && (
        <tfoot>
          <tr className="border-t-2 border-line font-semibold bg-canvas/50">
            <td className="p-3">Total</td>
            <td className="p-3 text-right font-mono-num">R$ {formatarMoedaSemSimbolo(tot.valor_recebido)}</td>
            <td className="p-3 text-right font-mono-num">R$ {formatarMoedaSemSimbolo(tot.valor_cartao)}</td>
            <td className="p-3 text-right font-mono-num text-[#B23B2E]">R$ {formatarMoedaSemSimbolo(tot.valor_taxas)}</td>
            <td className="p-3 text-right font-mono-num">{formatarPercentual(pct(tot.valor_taxas, tot.valor_cartao))}</td>
            <td className="p-3 text-right font-mono-num text-[#2E6B45]">R$ {formatarMoedaSemSimbolo(tot.valor_recebido - tot.valor_taxas)}</td>
          </tr>
        </tfoot>
      )}
    </table>
  );
}
