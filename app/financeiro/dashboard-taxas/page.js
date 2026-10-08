"use client";
import { useEffect, useMemo, useState } from "react";
import { Wallet, CreditCard, Receipt, Percent, PiggyBank, Lock, Store, Calendar, FileSpreadsheet, Printer } from "lucide-react";
import AppShell from "../../../components/AppShell";
import Modal from "../../../components/Modal";
import SeletorSuspenso from "../../../components/SeletorSuspenso";
import BotaoAtualizar from "../../../components/BotaoAtualizar";
import BotaoAcao3D from "../../../components/BotaoAcao3D";
import { supabase } from "../../../lib/supabaseClient";
import { useSessao } from "../../../lib/SessaoContext";
import { podeVerFinanceiro } from "../../../lib/permissions";
import { formatarMoedaSemSimbolo, formatarDataBR } from "../../../lib/formato";
import { hojeBrasil, listaMesesRecentes, listaSemanasRecentes } from "../../../lib/fusoHorario";
import { rotuloProduto, formatarPercentual } from "../../../lib/taxasCartao";

const MODOS = [
  { id: "mes", rotulo: "Por mês" },
  { id: "semana", rotulo: "Por semana" },
  { id: "datas", rotulo: "Por período" },
];

function diaSeguinte(dataIso) {
  const d = new Date(dataIso + "T12:00:00");
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function pct(parte, todo) {
  return todo ? (Number(parte) / Number(todo)) * 100 : 0;
}

function rotuloModalidade(m) {
  if (m.tipo_taxa) return rotuloProduto(m.tipo_taxa, m.parcelas);
  const f = (m.forma || "").toUpperCase();
  return f.charAt(0) + f.slice(1).toLowerCase();
}

function rotuloForma(d) {
  if (!d.forma) return "—";
  if (d.forma === "LINK DE PAGAMENTO") return `Link ${d.parcelas || 1}x`;
  if (d.forma === "CRÉDITO" || d.forma === "CREDITO") return d.parcelas > 1 ? `Crédito ${d.parcelas}x` : "Crédito 1x";
  if (d.forma === "DÉBITO" || d.forma === "DEBITO") return "Débito";
  return d.forma.charAt(0) + d.forma.slice(1).toLowerCase();
}

function Card({ cor, icone: Icone, titulo, valor, rodape, destaque }) {
  return (
    <div className={`card overflow-hidden ${destaque ? "border-2" : ""}`} style={destaque ? { borderColor: `${cor}80` } : undefined}>
      <div className="h-1.5" style={{ background: cor }} />
      <div className="p-4">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center mb-2" style={{ background: `${cor}1A`, color: cor }}>
          <Icone size={16} />
        </div>
        <p className="text-xs text-muted mb-1">{titulo}</p>
        <p className="font-mono-num text-xl font-semibold" style={{ color: destaque ? cor : undefined }}>{valor}</p>
        {rodape && <p className="text-[10px] text-muted mt-1 leading-snug">{rodape}</p>}
      </div>
    </div>
  );
}

function Conteudo() {
  const { usuario, unidades } = useSessao();
  const permitido = podeVerFinanceiro(usuario.cargo);
  const meses = useMemo(() => listaMesesRecentes(18), []);
  const semanas = useMemo(() => listaSemanasRecentes(26), []);

  const [unidadesSel, setUnidadesSel] = useState([]); // começa sempre sem nenhuma
  const [modo, setModo] = useState("mes");
  const [mesSel, setMesSel] = useState(meses[0].valor);
  const [semanaSel, setSemanaSel] = useState(semanas[0].valor);
  const [dataDe, setDataDe] = useState(meses[0].inicio);
  const [dataAte, setDataAte] = useState(hojeBrasil());

  const [linhas, setLinhas] = useState([]);
  const [modalidades, setModalidades] = useState([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [detalhe, setDetalhe] = useState(null); // { unidade, itens, carregando }

  const intervalo = (() => {
    if (modo === "semana") {
      const s = semanas.find((x) => x.valor === semanaSel) || semanas[0];
      return { inicio: s.inicio, fimExcl: diaSeguinte(s.fim), rotulo: `Semana ${s.rotulo}`, valido: true };
    }
    if (modo === "datas") {
      const valido = !!dataDe && !!dataAte && dataDe <= dataAte;
      return { inicio: dataDe, fimExcl: dataAte ? diaSeguinte(dataAte) : dataDe, rotulo: `${formatarDataBR(dataDe)} a ${formatarDataBR(dataAte)}`, valido };
    }
    const m = meses.find((x) => x.valor === mesSel) || meses[0];
    return { inicio: m.inicio, fimExcl: m.fimExclusivo, rotulo: `Mês ${m.rotulo}`, valido: true };
  })();

  async function carregar() {
    if (!permitido) return;
    if (unidadesSel.length === 0 || !intervalo.valido) {
      setLinhas([]);
      setModalidades([]);
      return;
    }
    setCarregando(true);
    setErro("");
    const params = { unidade_ids: unidadesSel, data_inicio: intervalo.inicio, data_fim_excl: intervalo.fimExcl };
    const [r1, r2] = await Promise.all([
      supabase.rpc("taxas_cartao_por_unidade", params),
      supabase.rpc("taxas_cartao_por_modalidade", params),
    ]);
    if (r1.error || r2.error) setErro((r1.error || r2.error).message);
    setLinhas(r1.data || []);
    setModalidades(r2.data || []);
    setCarregando(false);
  }

  useEffect(() => {
    carregar();
  }, [unidadesSel, modo, mesSel, semanaSel, dataDe, dataAte]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!permitido) {
    return (
      <div className="card p-8 max-w-lg text-center text-muted">
        <Lock size={22} className="mx-auto mb-2 opacity-60" />
        <p className="text-sm">Somente Administrador e Diretor podem ver o Dashboard de Taxas.</p>
      </div>
    );
  }

  const ordenadas = linhas.slice().sort((a, b) => Number(b.valor_taxas) - Number(a.valor_taxas));
  const tot = ordenadas.reduce(
    (s, l) => ({
      recebido: s.recebido + Number(l.valor_recebido),
      cartao: s.cartao + Number(l.valor_cartao),
      taxas: s.taxas + Number(l.valor_taxas),
      qtd: s.qtd + Number(l.qtd_lancamentos),
    }),
    { recebido: 0, cartao: 0, taxas: 0, qtd: 0 }
  );
  const maiorTaxaModalidade = Math.max(0, ...modalidades.map((m) => Number(m.valor_taxas)));
  const modalidadesOrdenadas = modalidades.slice().sort((a, b) => {
    const ordem = (m) => (m.tipo_taxa === "debito" ? 0 : m.tipo_taxa === "credito" ? m.parcelas : 100);
    return ordem(a) - ordem(b) || Number(b.valor) - Number(a.valor);
  });

  async function abrirDetalhe(l) {
    setDetalhe({ unidade: l, itens: [], carregando: true });
    const { data, error } = await supabase.rpc("taxas_cartao_detalhe", {
      p_unidade_id: l.unidade_id,
      data_inicio: intervalo.inicio,
      data_fim_excl: intervalo.fimExcl,
    });
    if (error) console.error("Erro no detalhe de taxas:", error.message);
    setDetalhe({ unidade: l, itens: data || [], carregando: false });
  }

  async function exportarExcel() {
    const XLSX = await import("xlsx");
    const livro = XLSX.utils.book_new();
    const resumo = ordenadas.map((l) => ({
      Unidade: l.unidade_nome,
      "Total recebido": Number(l.valor_recebido),
      "Recebido em cartão": Number(l.valor_cartao),
      "Taxas da operadora": Number(l.valor_taxas),
      "% sobre cartão": Number(pct(l.valor_taxas, l.valor_cartao).toFixed(2)),
      "Líquido": Number(l.valor_recebido) - Number(l.valor_taxas),
      "Qtd. lançamentos": Number(l.qtd_lancamentos),
    }));
    XLSX.utils.book_append_sheet(livro, XLSX.utils.json_to_sheet(resumo), "Por unidade");
    const mod = modalidadesOrdenadas.map((m) => ({
      Modalidade: rotuloModalidade(m),
      Valor: Number(m.valor),
      "Taxa média %": Number(pct(m.valor_taxas, m.valor).toFixed(2)),
      Taxas: Number(m.valor_taxas),
      Pagamentos: Number(m.qtd),
    }));
    XLSX.utils.book_append_sheet(livro, XLSX.utils.json_to_sheet(mod), "Por modalidade");
    XLSX.writeFile(livro, `dashboard-taxas-${intervalo.inicio}_a_${intervalo.fimExcl}.xlsx`);
  }

  async function exportarDetalhe() {
    if (!detalhe) return;
    const XLSX = await import("xlsx");
    const dados = detalhe.itens.map((d) => ({
      Data: formatarDataBR(d.data),
      OS: d.numero_os,
      Forma: rotuloForma(d),
      Bandeira: d.bandeira || "",
      "Valor recebido": Number(d.valor),
      "Taxa %": Number(d.taxa),
      "Valor da taxa": Number(d.valor_taxa),
      "Líquido": Number(d.valor) - Number(d.valor_taxa),
    }));
    const livro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(livro, XLSX.utils.json_to_sheet(dados), "Detalhe");
    XLSX.writeFile(livro, `taxas-${detalhe.unidade.unidade_nome.replace(/\s+/g, "_")}-${intervalo.inicio}.xlsx`);
  }

  const totDetalhe = detalhe
    ? detalhe.itens.reduce((s, d) => ({ valor: s.valor + Number(d.valor), taxa: s.taxa + Number(d.valor_taxa) }), { valor: 0, taxa: 0 })
    : null;

  return (
    <div className="max-w-6xl">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted mb-1">Financeiro</p>
          <h1 className="font-display text-2xl font-semibold text-ink">Dashboard de Taxas — {intervalo.rotulo}</h1>
          <p className="text-sm text-muted mt-1">Quanto foi recebido e quanto a operadora de cartão desconta, pela tabela de Taxas do Cartão.</p>
        </div>
        <div className="flex items-center gap-2 print:hidden shrink-0">
          <BotaoAtualizar aoAtualizar={carregar} />
          <BotaoAcao3D icone={FileSpreadsheet} rotulo="Exportar Excel" onClick={exportarExcel} cor="teal" disabled={ordenadas.length === 0} />
          <BotaoAcao3D icone={Printer} rotulo="Imprimir" onClick={() => window.print()} cor="ink" />
        </div>
      </div>

      <div className="card p-4 mb-5 flex flex-wrap items-end gap-4 print:hidden">
        <SeletorSuspenso
          rotulo="Unidades"
          icone={Store}
          opcoes={unidades.map((u) => ({ valor: u.id, rotulo: u.nome }))}
          selecionados={unidadesSel}
          onChange={setUnidadesSel}
          rotuloTudo="Nenhuma selecionada"
          largura="w-72"
        />
        <div>
          <p className="text-[11px] font-semibold text-muted uppercase tracking-wide mb-1.5 flex items-center gap-1">
            <Calendar size={11} /> Período
          </p>
          <div className="flex gap-1.5">
            {MODOS.map((m) => (
              <button
                key={m.id}
                onClick={() => setModo(m.id)}
                className={`px-3 py-1.5 rounded-full text-sm transition ${modo === m.id ? "bg-gold text-white font-medium" : "bg-white border border-line text-muted hover:border-gold/50"}`}
              >
                {m.rotulo}
              </button>
            ))}
          </div>
        </div>
        {modo === "mes" && (
          <select className="field-input w-40" value={mesSel} onChange={(e) => setMesSel(e.target.value)}>
            {meses.map((m) => (
              <option key={m.valor} value={m.valor}>{m.rotulo}</option>
            ))}
          </select>
        )}
        {modo === "semana" && (
          <select className="field-input w-72" value={semanaSel} onChange={(e) => setSemanaSel(e.target.value)}>
            {semanas.map((s) => (
              <option key={s.valor} value={s.valor}>{s.rotulo}</option>
            ))}
          </select>
        )}
        {modo === "datas" && (
          <div className="flex items-center gap-2">
            <input type="date" className="field-input" value={dataDe} max={dataAte || undefined} onChange={(e) => setDataDe(e.target.value)} />
            <span className="text-sm text-muted">até</span>
            <input type="date" className="field-input" value={dataAte} min={dataDe || undefined} onChange={(e) => setDataAte(e.target.value)} />
          </div>
        )}
      </div>

      {unidadesSel.length === 0 ? (
        <div className="card py-16 text-center">
          <Store size={26} className="mx-auto mb-2 text-muted opacity-60" />
          <p className="text-sm text-muted">Selecione uma ou mais unidades no filtro acima para ver as taxas.</p>
        </div>
      ) : !intervalo.valido ? (
        <div className="card py-10 text-center text-sm text-muted">A data inicial precisa ser anterior (ou igual) à data final.</div>
      ) : (
        <>
          {erro && <div className="mb-4 rounded-lg px-4 py-2.5 text-sm bg-[#B23B2E]/10 text-[#B23B2E]">Erro ao buscar: {erro}</div>}

          <div className="grid grid-cols-5 gap-3 mb-6">
            <Card cor="#2670B5" icone={Wallet} titulo="Total recebido" valor={`R$ ${formatarMoedaSemSimbolo(tot.recebido)}`} rodape={`${tot.qtd} lançamento(s)`} />
            <Card cor="#7C56B5" icone={CreditCard} titulo="Recebido em cartão" valor={`R$ ${formatarMoedaSemSimbolo(tot.cartao)}`} rodape={`${pct(tot.cartao, tot.recebido).toFixed(1)}% do total (débito, crédito e link)`} />
            <Card cor="#B23B2E" icone={Receipt} titulo="Taxas da operadora" valor={`R$ ${formatarMoedaSemSimbolo(tot.taxas)}`} destaque />
            <Card cor="#C9A227" icone={Percent} titulo="Taxa média sobre cartão" valor={formatarPercentual(pct(tot.taxas, tot.cartao))} rodape={`${pct(tot.taxas, tot.recebido).toFixed(2)}% sobre o total recebido`} />
            <Card cor="#3F8A5C" icone={PiggyBank} titulo="Líquido estimado" valor={`R$ ${formatarMoedaSemSimbolo(tot.recebido - tot.taxas)}`} rodape="Total recebido menos as taxas" />
          </div>

          <div className="card overflow-hidden mb-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wider text-muted border-b border-line">
                  <td className="p-3">Unidade</td>
                  <td className="p-3 text-right">Total recebido</td>
                  <td className="p-3 text-right">Recebido em cartão</td>
                  <td className="p-3 text-right"><span className="text-[#B23B2E] font-bold bg-[#B23B2E]/10 rounded px-2 py-0.5">Taxas</span></td>
                  <td className="p-3 text-right">% s/ cartão</td>
                  <td className="p-3 text-right">Líquido</td>
                </tr>
              </thead>
              <tbody>
                {carregando && <tr><td className="p-4 text-muted" colSpan={6}>Carregando…</td></tr>}
                {!carregando && ordenadas.length === 0 && <tr><td className="p-4 text-muted" colSpan={6}>Nenhum lançamento nesse período.</td></tr>}
                {!carregando &&
                  ordenadas.map((l) => (
                    <tr key={l.unidade_id} className="border-t border-line hover:bg-canvas/60 cursor-pointer" onClick={() => abrirDetalhe(l)} title="Clique para ver os lançamentos">
                      <td className="p-3 font-medium text-ink">{l.unidade_nome}</td>
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
                    <td className="p-3 text-right font-mono-num">R$ {formatarMoedaSemSimbolo(tot.recebido)}</td>
                    <td className="p-3 text-right font-mono-num">R$ {formatarMoedaSemSimbolo(tot.cartao)}</td>
                    <td className="p-3 text-right font-mono-num text-[#B23B2E]">R$ {formatarMoedaSemSimbolo(tot.taxas)}</td>
                    <td className="p-3 text-right font-mono-num">{formatarPercentual(pct(tot.taxas, tot.cartao))}</td>
                    <td className="p-3 text-right font-mono-num text-[#2E6B45]">R$ {formatarMoedaSemSimbolo(tot.recebido - tot.taxas)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {modalidadesOrdenadas.length > 0 && !carregando && (
            <div className="card p-5">
              <h2 className="font-display text-base font-semibold text-ink mb-1">Por modalidade de pagamento</h2>
              <p className="text-xs text-muted mb-4">Onde está o custo: quanto foi recebido em cada modalidade e quanto custou em taxa.</p>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-wider text-muted border-b border-line">
                    <td className="pb-2">Modalidade</td>
                    <td className="pb-2 text-right">Recebido</td>
                    <td className="pb-2 text-right">Taxa</td>
                    <td className="pb-2 text-right">Valor da taxa</td>
                    <td className="pb-2 pl-4 w-1/4"></td>
                  </tr>
                </thead>
                <tbody>
                  {modalidadesOrdenadas.map((m, i) => (
                    <tr key={i} className="border-t border-line">
                      <td className="py-2">{rotuloModalidade(m)} <span className="text-[11px] text-muted">· {m.qtd} pgto(s)</span></td>
                      <td className="py-2 text-right font-mono-num">R$ {formatarMoedaSemSimbolo(m.valor)}</td>
                      <td className="py-2 text-right font-mono-num text-muted">{m.tipo_taxa ? formatarPercentual(pct(m.valor_taxas, m.valor)) : "—"}</td>
                      <td className="py-2 text-right font-mono-num text-[#B23B2E]">{m.tipo_taxa ? `R$ ${formatarMoedaSemSimbolo(m.valor_taxas)}` : "—"}</td>
                      <td className="py-2 pl-4">
                        {m.tipo_taxa && maiorTaxaModalidade > 0 && (
                          <div className="h-2 rounded-full bg-[#B23B2E]/10 overflow-hidden">
                            <div className="h-full rounded-full bg-[#B23B2E]/70" style={{ width: `${(Number(m.valor_taxas) / maiorTaxaModalidade) * 100}%` }} />
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {detalhe && (
        <Modal
          titulo={detalhe.unidade.unidade_nome}
          subtitulo={`${intervalo.rotulo} · ${detalhe.itens.length} pagamento(s)`}
          onFechar={() => setDetalhe(null)}
          largura="max-w-5xl"
        >
          {detalhe.carregando ? (
            <p className="text-sm text-muted py-6 text-center">Carregando…</p>
          ) : (
            <>
              <div className="flex justify-end mb-3">
                <BotaoAcao3D icone={FileSpreadsheet} rotulo="Exportar detalhe" onClick={exportarDetalhe} cor="teal" disabled={detalhe.itens.length === 0} />
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-wider text-muted border-b border-line">
                    <td className="pb-2">Data</td>
                    <td className="pb-2">OS</td>
                    <td className="pb-2">Forma</td>
                    <td className="pb-2">Bandeira</td>
                    <td className="pb-2 text-right">Valor recebido</td>
                    <td className="pb-2 text-right">Taxa</td>
                    <td className="pb-2 text-right">Valor da taxa</td>
                    <td className="pb-2 text-right">Líquido</td>
                  </tr>
                </thead>
                <tbody>
                  {detalhe.itens.map((d, i) => (
                    <tr key={`${d.lancamento_id}-${i}`} className="border-t border-line">
                      <td className="py-2">{formatarDataBR(d.data)}</td>
                      <td className="py-2 font-mono-num">{d.numero_os}</td>
                      <td className="py-2">{rotuloForma(d)}</td>
                      <td className="py-2 text-muted">{d.bandeira || "—"}</td>
                      <td className="py-2 text-right font-mono-num">R$ {formatarMoedaSemSimbolo(d.valor)}</td>
                      <td className="py-2 text-right font-mono-num text-muted">{Number(d.taxa) > 0 ? formatarPercentual(d.taxa) : "—"}</td>
                      <td className="py-2 text-right font-mono-num font-medium text-[#B23B2E]">{Number(d.valor_taxa) > 0 ? `R$ ${formatarMoedaSemSimbolo(d.valor_taxa)}` : "—"}</td>
                      <td className="py-2 text-right font-mono-num text-[#2E6B45]">R$ {formatarMoedaSemSimbolo(Number(d.valor) - Number(d.valor_taxa))}</td>
                    </tr>
                  ))}
                  {detalhe.itens.length === 0 && (
                    <tr><td colSpan={8} className="py-4 text-muted text-center">Nenhum lançamento.</td></tr>
                  )}
                </tbody>
                {detalhe.itens.length > 0 && (
                  <tfoot>
                    <tr className="border-t-2 border-line font-semibold">
                      <td className="py-2" colSpan={4}>Total</td>
                      <td className="py-2 text-right font-mono-num">R$ {formatarMoedaSemSimbolo(totDetalhe.valor)}</td>
                      <td className="py-2 text-right font-mono-num text-muted">{formatarPercentual(pct(totDetalhe.taxa, totDetalhe.valor))}</td>
                      <td className="py-2 text-right font-mono-num text-[#B23B2E]">R$ {formatarMoedaSemSimbolo(totDetalhe.taxa)}</td>
                      <td className="py-2 text-right font-mono-num text-[#2E6B45]">R$ {formatarMoedaSemSimbolo(totDetalhe.valor - totDetalhe.taxa)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </>
          )}
        </Modal>
      )}
    </div>
  );
}

export default function DashboardTaxasPage() {
  return (
    <AppShell>
      <Conteudo />
    </AppShell>
  );
}
