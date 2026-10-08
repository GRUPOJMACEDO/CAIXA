"use client";
import { useEffect, useMemo, useState } from "react";
import { Wallet, CreditCard, Receipt, Percent, PiggyBank, Lock, Store, Calendar, FileSpreadsheet, Printer, X, ArrowLeft, CalendarRange } from "lucide-react";
import AppShell from "../../../components/AppShell";
import Modal from "../../../components/Modal";
import SeletorSuspenso from "../../../components/SeletorSuspenso";
import BotaoAtualizar from "../../../components/BotaoAtualizar";
import BotaoAcao3D from "../../../components/BotaoAcao3D";
import CardExplicado from "../../../components/financeiro/CardExplicado";
import TabelaResumoTaxas from "../../../components/financeiro/TabelaResumoTaxas";
import { supabase } from "../../../lib/supabaseClient";
import { useSessao } from "../../../lib/SessaoContext";
import { podeVerFinanceiro } from "../../../lib/permissions";
import { formatarMoedaSemSimbolo, formatarDataBR } from "../../../lib/formato";
import { hojeBrasil, listaMesesRecentes, listaSemanasRecentes } from "../../../lib/fusoHorario";
import { formatarPercentual, pct, rotuloModalidade, somarModalidades, quebraPorGrupo } from "../../../lib/taxasCartao";

const MODOS = [
  { id: "mes", rotulo: "Por mês" },
  { id: "semana", rotulo: "Por semana" },
  { id: "datas", rotulo: "Por período" },
];
const MESES_ABREV = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function diaSeguinte(dataIso) {
  const d = new Date(dataIso + "T12:00:00");
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}
function rotuloMesCurto(valor) {
  const [ano, mes] = valor.split("-");
  return `${MESES_ABREV[Number(mes) - 1]}/${ano}`;
}
const R$ = (v) => `R$ ${formatarMoedaSemSimbolo(v)}`;

function rotuloForma(d) {
  if (!d.forma) return "—";
  if (d.forma === "LINK DE PAGAMENTO") return `Link ${d.parcelas || 1}x`;
  if (d.forma === "CRÉDITO" || d.forma === "CREDITO") return `Crédito ${d.parcelas || 1}x`;
  if (d.forma === "DÉBITO" || d.forma === "DEBITO") return "Débito";
  return d.forma.charAt(0) + d.forma.slice(1).toLowerCase();
}

// soma as linhas "por unidade" de vários períodos
function somarPorUnidade(listas) {
  const mapa = new Map();
  listas.flat().forEach((l) => {
    if (!mapa.has(l.unidade_id)) mapa.set(l.unidade_id, { chave: l.unidade_id, unidade_id: l.unidade_id, nome: l.unidade_nome, valor_recebido: 0, valor_cartao: 0, valor_taxas: 0, qtd: 0 });
    const a = mapa.get(l.unidade_id);
    a.valor_recebido += Number(l.valor_recebido);
    a.valor_cartao += Number(l.valor_cartao);
    a.valor_taxas += Number(l.valor_taxas);
    a.qtd += Number(l.qtd_lancamentos);
  });
  return [...mapa.values()];
}
function totais(linhas) {
  return linhas.reduce(
    (s, l) => ({ recebido: s.recebido + Number(l.valor_recebido), cartao: s.cartao + Number(l.valor_cartao), taxas: s.taxas + Number(l.valor_taxas), qtd: s.qtd + Number(l.qtd || 0) }),
    { recebido: 0, cartao: 0, taxas: 0, qtd: 0 }
  );
}

function Conteudo() {
  const { usuario, unidades } = useSessao();
  const permitido = podeVerFinanceiro(usuario.cargo);
  const meses = useMemo(() => listaMesesRecentes(18), []);
  const semanas = useMemo(() => listaSemanasRecentes(26), []);

  const [unidadesSel, setUnidadesSel] = useState([]); // começa sempre sem nenhuma
  const [modo, setModo] = useState("mes");
  const [mesesSel, setMesesSel] = useState([meses[0].valor]);
  const [semanaSel, setSemanaSel] = useState(semanas[0].valor);
  const [dataDe, setDataDe] = useState(meses[0].inicio);
  const [dataAte, setDataAte] = useState(hojeBrasil());

  const [resultados, setResultados] = useState([]); // [{ intervalo, unidades, modalidades }]
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [janela, setJanela] = useState(null);
  // janela = { tipo: "mes", intervalo } | { tipo: "detalhe", unidade, intervalos, itens, carregando, voltar? }

  // lista de períodos consultados (1 só, ou vários meses para comparar)
  const intervalos = (() => {
    if (modo === "semana") {
      const s = semanas.find((x) => x.valor === semanaSel) || semanas[0];
      return [{ chave: s.valor, rotulo: `Semana ${s.rotulo}`, inicio: s.inicio, fimExcl: diaSeguinte(s.fim) }];
    }
    if (modo === "datas") {
      if (!dataDe || !dataAte || dataDe > dataAte) return [];
      return [{ chave: "datas", rotulo: `${formatarDataBR(dataDe)} a ${formatarDataBR(dataAte)}`, inicio: dataDe, fimExcl: diaSeguinte(dataAte) }];
    }
    return meses
      .filter((m) => mesesSel.includes(m.valor))
      .map((m) => ({ chave: m.valor, rotulo: rotuloMesCurto(m.valor), inicio: m.inicio, fimExcl: m.fimExclusivo }));
  })();
  const comparando = intervalos.length > 1;
  const tituloPeriodo =
    intervalos.length === 0 ? "" : comparando ? `${intervalos.length} meses (${intervalos[intervalos.length - 1].rotulo} a ${intervalos[0].rotulo})` : modo === "mes" ? `Mês ${intervalos[0].rotulo}` : intervalos[0].rotulo;

  async function carregar() {
    if (!permitido) return;
    if (unidadesSel.length === 0 || intervalos.length === 0) {
      setResultados([]);
      return;
    }
    setCarregando(true);
    setErro("");
    const res = await Promise.all(
      intervalos.map(async (iv) => {
        const params = { unidade_ids: unidadesSel, data_inicio: iv.inicio, data_fim_excl: iv.fimExcl };
        const [r1, r2] = await Promise.all([supabase.rpc("taxas_cartao_por_unidade", params), supabase.rpc("taxas_cartao_por_modalidade", params)]);
        if (r1.error || r2.error) throw new Error((r1.error || r2.error).message);
        return { intervalo: iv, unidades: r1.data || [], modalidades: r2.data || [] };
      })
    ).catch((e) => {
      setErro(e.message);
      return [];
    });
    setResultados(res);
    setCarregando(false);
  }

  const chaveFiltro = `${unidadesSel.join(",")}|${modo}|${mesesSel.join(",")}|${semanaSel}|${dataDe}|${dataAte}`;
  useEffect(() => {
    carregar();
  }, [chaveFiltro]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!permitido) {
    return (
      <div className="card p-8 max-w-lg text-center text-muted">
        <Lock size={22} className="mx-auto mb-2 opacity-60" />
        <p className="text-sm">Somente Administrador e Diretor podem ver o Dashboard de Taxas.</p>
      </div>
    );
  }

  // ---- números agregados ----
  const linhasUnidade = somarPorUnidade(resultados.map((r) => r.unidades));
  const modalidades = somarModalidades(resultados.map((r) => r.modalidades));
  const grupos = quebraPorGrupo(modalidades);
  const tot = totais(linhasUnidade);
  const liquido = tot.recebido - tot.taxas;
  const linhasMes = resultados.map((r) => {
    const t = totais(r.unidades.map((u) => ({ ...u, qtd: u.qtd_lancamentos })));
    return { chave: r.intervalo.chave, ordem: r.intervalo.chave, nome: r.intervalo.rotulo, intervalo: r.intervalo, valor_recebido: t.recebido, valor_cartao: t.cartao, valor_taxas: t.taxas };
  });
  const maiorTaxaModalidade = Math.max(0, ...modalidades.map((m) => Number(m.valor_taxas)));
  const modalidadesOrdenadas = modalidades.slice().sort((a, b) => {
    const ordem = (m) => (m.tipo_taxa === "debito" ? 0 : m.tipo_taxa === "credito" ? m.parcelas : 100);
    return ordem(a) - ordem(b) || Number(b.valor) - Number(a.valor);
  });

  // ---- explicações dos cards (com os números do filtro atual) ----
  const expl = {
    recebido: {
      texto: "Soma de tudo o que foi registrado como valor pago nos lançamentos das unidades e do período escolhidos, em todas as formas de pagamento (cartão, PIX, dinheiro e boleto).",
      calculo: [`Soma de ${tot.qtd} lançamento(s)`, `= ${R$(tot.recebido)}`],
    },
    cartao: {
      texto: "Parte do total recebido que entrou por Débito, Crédito ou Link de pagamento. Só sobre esse valor a operadora cobra taxa. O texto abaixo do valor mostra quanto isso representa do total recebido.",
      calculo: [
        `Débito ${R$(grupos.debito.valor)}`,
        `+ Crédito à vista ${R$(grupos.vista.valor)}`,
        `+ Parcelado ${R$(grupos.parcelado.valor)}`,
        `= ${R$(tot.cartao)}`,
        `${R$(tot.cartao)} ÷ ${R$(tot.recebido)} × 100 = ${pct(tot.cartao, tot.recebido).toFixed(1)}% do total`,
      ],
    },
    taxas: {
      texto: "Valor estimado que a operadora desconta. Cada pagamento em cartão é multiplicado pela taxa do produto (Débito, Crédito, Parcelado Nx) que valia na data do lançamento, conforme a tabela Taxas do Cartão.",
      calculo: [
        `Débito ${R$(grupos.debito.taxas)}`,
        `+ Crédito à vista ${R$(grupos.vista.taxas)}`,
        `+ Parcelado ${R$(grupos.parcelado.taxas)}`,
        `= ${R$(tot.taxas)}`,
      ],
    },
    media: {
      texto: "Valor principal: de cada R$ 100 pagos no cartão, quanto fica com a operadora. Linha de baixo: quanto as taxas pesam sobre TUDO o que foi recebido (incluindo PIX, dinheiro e boleto, que não têm taxa) — por isso é menor.",
      calculo: [
        `Sobre o cartão: ${R$(tot.taxas)} ÷ ${R$(tot.cartao)} × 100 = ${formatarPercentual(pct(tot.taxas, tot.cartao))}`,
        `Sobre o total: ${R$(tot.taxas)} ÷ ${R$(tot.recebido)} × 100 = ${formatarPercentual(pct(tot.taxas, tot.recebido))}`,
      ],
    },
    liquido: {
      texto: "Quanto sobra do total recebido depois do desconto das taxas da operadora. É uma estimativa: não considera aluguel de máquina, chargeback ou outras tarifas.",
      calculo: [`${R$(tot.recebido)} − ${R$(tot.taxas)}`, `= ${R$(liquido)}`],
    },
  };

  // ---- detalhe de uma unidade (um ou vários períodos) ----
  async function abrirDetalhe(unidade, intervalosAlvo, voltar = null) {
    setJanela({ tipo: "detalhe", unidade, intervalos: intervalosAlvo, itens: [], carregando: true, voltar });
    const partes = await Promise.all(
      intervalosAlvo.map((iv) =>
        supabase.rpc("taxas_cartao_detalhe", { p_unidade_id: unidade.unidade_id || unidade.chave, data_inicio: iv.inicio, data_fim_excl: iv.fimExcl })
      )
    );
    const itens = partes.flatMap((p) => p.data || []).sort((a, b) => b.data.localeCompare(a.data));
    setJanela({ tipo: "detalhe", unidade, intervalos: intervalosAlvo, itens, carregando: false, voltar });
  }

  async function exportarExcel() {
    const XLSX = await import("xlsx");
    const livro = XLSX.utils.book_new();
    const linhaPlanilha = (nomeCol, l) => ({
      [nomeCol]: l.nome,
      "Total recebido": Number(l.valor_recebido),
      "Recebido em cartão": Number(l.valor_cartao),
      "Taxas da operadora": Number(l.valor_taxas),
      "% sobre cartão": Number(pct(l.valor_taxas, l.valor_cartao).toFixed(2)),
      "Líquido": Number(l.valor_recebido) - Number(l.valor_taxas),
    });
    if (comparando) XLSX.utils.book_append_sheet(livro, XLSX.utils.json_to_sheet(linhasMes.map((l) => linhaPlanilha("Mês", l))), "Comparação mensal");
    XLSX.utils.book_append_sheet(livro, XLSX.utils.json_to_sheet(linhasUnidade.map((l) => linhaPlanilha("Unidade", l))), "Por unidade");
    const mod = modalidadesOrdenadas.map((m) => ({
      Modalidade: rotuloModalidade(m),
      Valor: Number(m.valor),
      "Taxa média %": Number(pct(m.valor_taxas, m.valor).toFixed(2)),
      Taxas: Number(m.valor_taxas),
      Pagamentos: Number(m.qtd),
    }));
    XLSX.utils.book_append_sheet(livro, XLSX.utils.json_to_sheet(mod), "Por modalidade");
    XLSX.writeFile(livro, `dashboard-taxas-${tituloPeriodo.replace(/[^\w]+/g, "_")}.xlsx`);
  }

  async function exportarDetalhe() {
    if (janela?.tipo !== "detalhe") return;
    const XLSX = await import("xlsx");
    const dados = janela.itens.map((d) => ({
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
    XLSX.writeFile(livro, `taxas-${janela.unidade.nome.replace(/\s+/g, "_")}.xlsx`);
  }

  const semUnidade = unidadesSel.length === 0;
  const semPeriodo = intervalos.length === 0;

  return (
    <div className="max-w-6xl">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted mb-1">Financeiro</p>
          <h1 className="font-display text-2xl font-semibold text-ink">Dashboard de Taxas{tituloPeriodo ? ` — ${tituloPeriodo}` : ""}</h1>
          <p className="text-sm text-muted mt-1">Quanto foi recebido e quanto a operadora de cartão desconta, pela tabela de Taxas do Cartão.</p>
        </div>
        <div className="flex items-center gap-2 print:hidden shrink-0">
          <BotaoAtualizar aoAtualizar={carregar} />
          <BotaoAcao3D icone={FileSpreadsheet} rotulo="Exportar Excel" onClick={exportarExcel} cor="teal" disabled={linhasUnidade.length === 0} />
          <BotaoAcao3D icone={Printer} rotulo="Imprimir" onClick={() => window.print()} cor="ink" />
        </div>
      </div>

      {/* ---------- filtros ---------- */}
      <div className="card p-4 mb-5 flex flex-wrap items-end gap-4 print:hidden">
        <div className="flex items-end gap-2">
          <SeletorSuspenso
            rotulo="Unidades"
            icone={Store}
            opcoes={unidades.map((u) => ({ valor: u.id, rotulo: u.nome }))}
            selecionados={unidadesSel}
            onChange={setUnidadesSel}
            rotuloTudo="Nenhuma selecionada"
            largura="w-72"
          />
          {unidadesSel.length > 0 && (
            <button type="button" className="btn inline-flex items-center gap-1.5 py-2" onClick={() => setUnidadesSel([])} title="Desmarcar todas as unidades">
              <X size={14} /> Limpar
            </button>
          )}
        </div>
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
          <SeletorSuspenso
            rotulo="Meses (marque vários para comparar)"
            icone={CalendarRange}
            opcoes={meses.map((m) => ({ valor: m.valor, rotulo: rotuloMesCurto(m.valor) }))}
            selecionados={mesesSel}
            onChange={setMesesSel}
            rotuloTudo="Nenhum mês"
            largura="w-64"
          />
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

      {semUnidade ? (
        <div className="card py-16 text-center">
          <Store size={26} className="mx-auto mb-2 text-muted opacity-60" />
          <p className="text-sm text-muted">Selecione uma ou mais unidades no filtro acima para ver as taxas.</p>
        </div>
      ) : semPeriodo ? (
        <div className="card py-10 text-center text-sm text-muted">
          {modo === "mes" ? "Marque ao menos um mês." : "A data inicial precisa ser anterior (ou igual) à data final."}
        </div>
      ) : (
        <>
          {erro && <div className="mb-4 rounded-lg px-4 py-2.5 text-sm bg-[#B23B2E]/10 text-[#B23B2E]">Erro ao buscar: {erro}</div>}

          {/* ---------- cards ---------- */}
          <div className="grid grid-cols-5 gap-3 mb-6">
            <CardExplicado cor="#2670B5" icone={Wallet} titulo="Total recebido" valor={R$(tot.recebido)} rodape={`${tot.qtd} lançamento(s)`} explicacao={expl.recebido} />
            <CardExplicado cor="#7C56B5" icone={CreditCard} titulo="Recebido em cartão" valor={R$(tot.cartao)} rodape={`${pct(tot.cartao, tot.recebido).toFixed(1)}% do total recebido`} explicacao={expl.cartao} />
            <CardExplicado cor="#B23B2E" icone={Receipt} titulo="Taxas da operadora" valor={R$(tot.taxas)} destaque explicacao={expl.taxas} />
            <CardExplicado
              cor="#C9A227"
              icone={Percent}
              titulo="Taxa média sobre cartão"
              valor={formatarPercentual(pct(tot.taxas, tot.cartao))}
              rodape={`${formatarPercentual(pct(tot.taxas, tot.recebido))} sobre o total recebido`}
              explicacao={expl.media}
              alinharBalao="direita"
            />
            <CardExplicado cor="#3F8A5C" icone={PiggyBank} titulo="Líquido estimado" valor={R$(liquido)} rodape="Total recebido menos as taxas" explicacao={expl.liquido} alinharBalao="direita" />
          </div>

          {/* ---------- comparação mês a mês ---------- */}
          {comparando && (
            <div className="card overflow-hidden mb-6">
              <div className="px-4 pt-4">
                <h2 className="font-display text-base font-semibold text-ink">Comparação mês a mês</h2>
                <p className="text-xs text-muted">Clique em um mês para ver as unidades só daquele mês.</p>
              </div>
              <TabelaResumoTaxas
                linhas={linhasMes}
                rotuloNome="Mês"
                ordenacaoInicial={{ coluna: "nome", desc: true }}
                carregando={carregando}
                aoClicar={(l) => setJanela({ tipo: "mes", intervalo: l.intervalo })}
                dicaClique="Clique para ver as unidades desse mês"
              />
            </div>
          )}

          {/* ---------- por unidade ---------- */}
          <div className="card overflow-hidden mb-6">
            {comparando && (
              <div className="px-4 pt-4">
                <h2 className="font-display text-base font-semibold text-ink">Por unidade — soma dos meses marcados</h2>
              </div>
            )}
            <TabelaResumoTaxas
              linhas={linhasUnidade}
              carregando={carregando}
              aoClicar={(l) => abrirDetalhe(l, intervalos)}
              dicaClique="Clique para ver os lançamentos"
            />
          </div>

          {/* ---------- por modalidade ---------- */}
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
                      <td className="py-2 text-right font-mono-num">{R$(m.valor)}</td>
                      <td className="py-2 text-right font-mono-num text-muted">{m.tipo_taxa ? formatarPercentual(pct(m.valor_taxas, m.valor)) : "—"}</td>
                      <td className="py-2 text-right font-mono-num text-[#B23B2E]">{m.tipo_taxa ? R$(m.valor_taxas) : "—"}</td>
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

      {/* ---------- janela: unidades de um mês ---------- */}
      {janela?.tipo === "mes" && (
        <Modal titulo={`Unidades — ${janela.intervalo.rotulo}`} subtitulo="Clique numa unidade para ver os lançamentos desse mês" onFechar={() => setJanela(null)} largura="max-w-5xl">
          <TabelaResumoTaxas
            linhas={somarPorUnidade([(resultados.find((r) => r.intervalo.chave === janela.intervalo.chave) || { unidades: [] }).unidades])}
            aoClicar={(l) => abrirDetalhe(l, [janela.intervalo], { tipo: "mes", intervalo: janela.intervalo })}
            dicaClique="Clique para ver os lançamentos"
          />
        </Modal>
      )}

      {/* ---------- janela: lançamentos de uma unidade ---------- */}
      {janela?.tipo === "detalhe" && (() => {
        const totD = janela.itens.reduce((s, d) => ({ valor: s.valor + Number(d.valor), taxa: s.taxa + Number(d.valor_taxa) }), { valor: 0, taxa: 0 });
        const rotuloPeriodos = janela.intervalos.length === 1 ? janela.intervalos[0].rotulo : `${janela.intervalos.length} meses`;
        return (
          <Modal titulo={janela.unidade.nome} subtitulo={`${rotuloPeriodos} · ${janela.itens.length} pagamento(s)`} onFechar={() => setJanela(null)} largura="max-w-5xl">
            {janela.carregando ? (
              <p className="text-sm text-muted py-6 text-center">Carregando…</p>
            ) : (
              <>
                <div className="flex justify-between items-center mb-3">
                  {janela.voltar ? (
                    <button className="btn inline-flex items-center gap-1.5" onClick={() => setJanela(janela.voltar)}>
                      <ArrowLeft size={14} /> Voltar para as unidades
                    </button>
                  ) : (
                    <span />
                  )}
                  <BotaoAcao3D icone={FileSpreadsheet} rotulo="Exportar detalhe" onClick={exportarDetalhe} cor="teal" disabled={janela.itens.length === 0} />
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
                    {janela.itens.map((d, i) => (
                      <tr key={`${d.lancamento_id}-${i}`} className="border-t border-line">
                        <td className="py-2">{formatarDataBR(d.data)}</td>
                        <td className="py-2 font-mono-num">{d.numero_os}</td>
                        <td className="py-2">{rotuloForma(d)}</td>
                        <td className="py-2 text-muted">{d.bandeira || "—"}</td>
                        <td className="py-2 text-right font-mono-num">{R$(d.valor)}</td>
                        <td className="py-2 text-right font-mono-num text-muted">{Number(d.taxa) > 0 ? formatarPercentual(d.taxa) : "—"}</td>
                        <td className="py-2 text-right font-mono-num font-medium text-[#B23B2E]">{Number(d.valor_taxa) > 0 ? R$(d.valor_taxa) : "—"}</td>
                        <td className="py-2 text-right font-mono-num text-[#2E6B45]">{R$(Number(d.valor) - Number(d.valor_taxa))}</td>
                      </tr>
                    ))}
                    {janela.itens.length === 0 && (
                      <tr><td colSpan={8} className="py-4 text-muted text-center">Nenhum lançamento.</td></tr>
                    )}
                  </tbody>
                  {janela.itens.length > 0 && (
                    <tfoot>
                      <tr className="border-t-2 border-line font-semibold">
                        <td className="py-2" colSpan={4}>Total</td>
                        <td className="py-2 text-right font-mono-num">{R$(totD.valor)}</td>
                        <td className="py-2 text-right font-mono-num text-muted">{formatarPercentual(pct(totD.taxa, totD.valor))}</td>
                        <td className="py-2 text-right font-mono-num text-[#B23B2E]">{R$(totD.taxa)}</td>
                        <td className="py-2 text-right font-mono-num text-[#2E6B45]">{R$(totD.valor - totD.taxa)}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </>
            )}
          </Modal>
        );
      })()}
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
