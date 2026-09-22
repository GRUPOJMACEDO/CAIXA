"use client";
import { useEffect, useRef, useState } from "react";
import {
  BarChart3,
  Calendar,
  CalendarDays,
  CalendarRange,
  CalendarClock,
  SlidersHorizontal,
  Building2,
  Clock,
  Percent,
  Hash,
  Flame,
  TrendingUp,
  Tags,
  Grid3x3,
  DollarSign,
  Route,
  Scale,
  ReceiptText,
  Check,
  ChevronDown,
  X,
} from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  ComposedChart,
  Bar,
  BarChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
} from "recharts";
import AppShell from "../../../components/AppShell";
import BotaoAtualizar from "../../../components/BotaoAtualizar";
import { supabase } from "../../../lib/supabaseClient";
import { useSessao } from "../../../lib/SessaoContext";
import { podeVerEstatisticas } from "../../../lib/permissions";
import { formatarMoedaSemSimbolo } from "../../../lib/formato";
import { hojeBrasil, listaSemanasRecentes, listaMesesRecentes } from "../../../lib/fusoHorario";

const NOMES_DIA = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const NOMES_DIA_CURTO = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const TIPOS_PERIODO = [
  { id: "diario", rotulo: "Diário", icone: CalendarDays, descricao: "Hoje, com os últimos 30 dias de contexto" },
  { id: "semanal", rotulo: "Semanal", icone: CalendarRange, descricao: "Escolha a semana (domingo a sábado)" },
  { id: "mensal", rotulo: "Mensal", icone: CalendarClock, descricao: "Escolha o mês" },
  { id: "personalizado", rotulo: "Personalizado", icone: SlidersHorizontal, descricao: "Escolha o período" },
];

// Janelas de contexto dos gráficos — cobrem o mesmo alcance dos seletores
// (16 semanas / 18 meses), pra semana/mês escolhido sempre aparecer destacado.
const QTD_SEMANAS = 16;
const QTD_MESES = 18;

function diaSeguinte(dataIso) {
  const d = new Date(dataIso + "T12:00:00");
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function somarDias(dataIso, qtd) {
  const d = new Date(dataIso + "T12:00:00");
  d.setDate(d.getDate() + qtd);
  return d.toISOString().slice(0, 10);
}

function inicioDaSemanaDe(dataIso) {
  const d = new Date(dataIso + "T12:00:00");
  d.setDate(d.getDate() - d.getDay());
  return d.toISOString().slice(0, 10);
}

function dataInicioMesesAtras(meses) {
  const [ano, mes] = hojeBrasil().split("-").map(Number);
  let m = mes - (meses - 1);
  let a = ano;
  while (m <= 0) {
    m += 12;
    a -= 1;
  }
  return `${a}-${String(m).padStart(2, "0")}-01`;
}

function formatarDataCurta(dataIso) {
  const [, mes, dia] = dataIso.split("-");
  return `${dia}/${mes}`;
}

function formatarMesCurto(chaveMes) {
  const [ano, mes] = chaveMes.split("-");
  return `${mes}/${ano}`;
}

// TV e DTV contam juntas nesta tela, sob o rótulo "DTV" — só aqui em
// Estatísticas; Lançamentos, Consulta, Pareto etc. continuam separados.
function categoriaEfetiva(nome) {
  return nome === "TV" || nome === "DTV" ? "DTV" : nome;
}

// Cores fixas pra comparação entre unidades — cada unidade selecionada
// mantém a mesma cor nas duas tabelas de comparação (geral e de taxas).
const CORES_COMPARACAO = ["#2670B5", "#0E7A72", "#B8862E", "#7C56B5", "#B23B2E", "#2E7D5B", "#9C6B14", "#4A6FA5"];

function TabelaComparacaoUnidades({ titulo, subtitulo, icone: Icone, corAccent, dados, unidadeIds, corFn, nomeFn, carregando, rotuloTicket }) {
  const linhas = unidadeIds
    .map((id) => dados.find((d) => d.unidade_id === id) || { unidade_id: id, qtd_os: 0, valor_total: 0 })
    .map((d) => ({ ...d, ticket_medio: Number(d.qtd_os) > 0 ? Number(d.valor_total) / Number(d.qtd_os) : 0 }));
  const maxTicket = Math.max(1, ...linhas.map((l) => l.ticket_medio));

  return (
    <div className="card p-5 mb-6">
      <p className="text-sm font-semibold text-ink mb-1 flex items-center gap-1.5" style={{ color: corAccent }}>
        <Icone size={14} /> {titulo}
      </p>
      <p className="text-xs text-muted mb-4">{subtitulo}</p>
      {carregando ? (
        <p className="text-sm text-muted py-10 text-center">Carregando…</p>
      ) : (
        <div className="space-y-3">
          {linhas.map((l) => {
            const cor = corFn(l.unidade_id);
            const pct = Math.max(4, Math.round((l.ticket_medio / maxTicket) * 100));
            return (
              <div key={l.unidade_id} className="rounded-xl border border-line overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-2" style={{ background: `${cor}12` }}>
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: cor }} />
                  <span className="text-sm font-semibold text-ink truncate">{nomeFn(l.unidade_id)}</span>
                </div>
                <div className="grid grid-cols-3 gap-3 px-4 py-3">
                  <div>
                    <p className="text-[11px] text-muted flex items-center gap-1 mb-0.5"><Hash size={11} /> Qtd. OS</p>
                    <p className="font-mono-num text-base font-semibold text-ink">{l.qtd_os}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-muted flex items-center gap-1 mb-0.5"><DollarSign size={11} /> Vlr. vendido</p>
                    <p className="font-mono-num text-base font-semibold text-ink">R$ {formatarMoedaSemSimbolo(l.valor_total)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-muted flex items-center gap-1 mb-0.5"><Percent size={11} /> {rotuloTicket}</p>
                    <p className="font-mono-num text-base font-semibold text-ink">R$ {formatarMoedaSemSimbolo(l.ticket_medio)}</p>
                  </div>
                </div>
                <div className="px-4 pb-3">
                  <div className="w-full h-2 rounded-full bg-canvas overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: cor }} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Conteudo() {
  const { usuario, unidades, marcasDisponiveis } = useSessao();
  const permitido = podeVerEstatisticas(usuario.cargo);

  const semanas = listaSemanasRecentes(QTD_SEMANAS);
  const meses = listaMesesRecentes(QTD_MESES);

  const [tipoPeriodo, setTipoPeriodo] = useState("diario"); // "diario" | "semanal" | "mensal" | "personalizado"
  const [semanaSelecionada, setSemanaSelecionada] = useState(semanas[0].valor);
  const [mesSelecionado, setMesSelecionado] = useState(meses[0].valor);
  const [dataInicioCustom, setDataInicioCustom] = useState(somarDias(hojeBrasil(), -30));
  const [dataFimCustom, setDataFimCustom] = useState(hojeBrasil());
  const [escopo, setEscopo] = useState("todas"); // "todas" | "marca:X" | "unidade:<id>"
  const [linhaFiltro, setLinhaFiltro] = useState(""); // "" | "ci" | "ih"
  const [categoriaFiltro, setCategoriaFiltro] = useState(""); // "" | nome efetivo da categoria
  const [categoriasDisponiveis, setCategoriasDisponiveis] = useState([]);
  const [incluirTaxa, setIncluirTaxa] = useState(true); // marcado = totais incluem taxas de análise/visita
  const [carregando, setCarregando] = useState(true);

  const [kpis, setKpis] = useState({ registros: 0, valorTotal: 0, ticketMedio: 0, horaPico: null });
  const [serieDiaria, setSerieDiaria] = useState([]);
  const [porHora, setPorHora] = useState([]);
  const [mapaCalor, setMapaCalor] = useState([]);
  const [porCategoria, setPorCategoria] = useState([]);

  // Comparação de ticket médio entre unidades — controle novo, dedicado só
  // a essa visualização (não mexe no seletor "Escopo" dos cards/gráficos acima).
  const [unidadesComparacao, setUnidadesComparacao] = useState([]);
  const [comparacaoAberta, setComparacaoAberta] = useState(false);
  const [comparacaoDados, setComparacaoDados] = useState([]);
  const [comparacaoTaxaDados, setComparacaoTaxaDados] = useState([]);
  const [comparacaoCarregando, setComparacaoCarregando] = useState(false);
  const comparacaoRef = useRef(null);

  useEffect(() => {
    function aoClicarFora(e) {
      if (comparacaoRef.current && !comparacaoRef.current.contains(e.target)) setComparacaoAberta(false);
    }
    document.addEventListener("mousedown", aoClicarFora);
    return () => document.removeEventListener("mousedown", aoClicarFora);
  }, []);

  const unidadeIdParam = escopo.startsWith("unidade:") ? escopo.slice(8) : null;
  const marcaParam = escopo.startsWith("marca:") ? escopo.slice(6) : null;

  useEffect(() => {
    supabase.from("categorias").select("nome").order("nome").then(({ data }) => {
      const efetivos = [...new Set((data || []).map((c) => categoriaEfetiva(c.nome)))].sort((a, b) => a.localeCompare(b));
      setCategoriasDisponiveis(efetivos);
    });
  }, []);

  // Janela ampla, usada pelos gráficos — dá contexto histórico independente
  // de qual semana/mês específico foi escolhido.
  function calcularIntervaloContexto() {
    const hoje = hojeBrasil();
    if (tipoPeriodo === "personalizado") {
      const inicio = dataInicioCustom;
      const fimExcl = diaSeguinte(dataFimCustom);
      const dias = Math.round((new Date(fimExcl) - new Date(inicio)) / 86400000);
      const granularidade = dias <= 45 ? "dia" : dias <= 180 ? "semana" : "mes";
      return { inicio, fimExcl, granularidade };
    }
    if (tipoPeriodo === "semanal") {
      return { inicio: somarDias(hoje, -7 * (QTD_SEMANAS - 1)), fimExcl: diaSeguinte(hoje), granularidade: "semana" };
    }
    if (tipoPeriodo === "mensal") {
      return { inicio: dataInicioMesesAtras(QTD_MESES), fimExcl: diaSeguinte(hoje), granularidade: "mes" };
    }
    // diario
    return { inicio: somarDias(hoje, -29), fimExcl: diaSeguinte(hoje), granularidade: "dia" };
  }

  // Janela exata do período escolhido — é o que os cards (KPIs) mostram.
  function calcularIntervaloFoco() {
    const hoje = hojeBrasil();
    if (tipoPeriodo === "personalizado") {
      return {
        inicio: dataInicioCustom,
        fimExcl: diaSeguinte(dataFimCustom),
        rotuloCard: `${formatarDataCurta(dataInicioCustom)} a ${formatarDataCurta(dataFimCustom)}`,
        rotuloDestaque: null, // período custom já É o contexto inteiro — nada a destacar
      };
    }
    if (tipoPeriodo === "semanal") {
      const semana = semanas.find((s) => s.valor === semanaSelecionada) || semanas[0];
      return {
        inicio: semana.inicio,
        fimExcl: diaSeguinte(semana.fim),
        rotuloCard: semana.rotulo,
        rotuloDestaque: formatarDataCurta(semana.inicio),
      };
    }
    if (tipoPeriodo === "mensal") {
      const mes = meses.find((m) => m.valor === mesSelecionado) || meses[0];
      return {
        inicio: mes.inicio,
        fimExcl: mes.fimExclusivo,
        rotuloCard: mes.rotulo,
        rotuloDestaque: formatarMesCurto(mes.valor),
      };
    }
    // diario — sempre hoje (não tem seletor de dia; pra um dia específico do
    // passado, use o filtro Personalizado com a mesma data em "De" e "Até")
    return {
      inicio: hoje,
      fimExcl: diaSeguinte(hoje),
      rotuloCard: formatarDataCurta(hoje),
      rotuloDestaque: formatarDataCurta(hoje),
    };
  }

  const intervaloContexto = calcularIntervaloContexto();
  const intervaloFoco = calcularIntervaloFoco();

  async function carregar() {
    if (!permitido) return;
    setCarregando(true);

    const filtrosComuns = {
      unidade_id_param: unidadeIdParam,
      marca_param: marcaParam,
      linha_param: linhaFiltro || null,
      categoria_param: categoriaFiltro || null,
    };
    const paramsContexto = { data_inicio: intervaloContexto.inicio, data_fim_excl: intervaloContexto.fimExcl, ...filtrosComuns };
    const paramsFoco = { data_inicio: intervaloFoco.inicio, data_fim_excl: intervaloFoco.fimExcl, ...filtrosComuns };
    const paramsFocoOs = { ...paramsFoco, modo_taxa: incluirTaxa ? "incluir" : "excluir" };

    const [resSerie, resHora, resMapa, resCategoria, resFocoHora, resFocoOs] = await Promise.all([
      supabase.rpc("estatisticas_series_diarias", paramsContexto),
      supabase.rpc("estatisticas_por_hora", paramsContexto),
      supabase.rpc("estatisticas_mapa_calor", paramsContexto),
      supabase.rpc("estatisticas_por_categoria", paramsContexto),
      supabase.rpc("estatisticas_por_hora", paramsFoco),
      supabase.rpc("estatisticas_kpis_os", paramsFocoOs),
    ]);

    // Cards (Registros/OS e Ticket médio) contam por OS distinta, não por
    // lançamento — os 4 gráficos abaixo continuam contando por lançamento.
    const linhaOs = (resFocoOs.data || [])[0] || { qtd_os: 0, valor_total: 0 };
    const registros = Number(linhaOs.qtd_os || 0);
    const valorTotal = Number(linhaOs.valor_total || 0);

    const horasFoco = resFocoHora.data || [];
    const horaPico = horasFoco.reduce((max, h) => (!max || Number(h.qtd) > Number(max.qtd) ? h : max), null);

    setKpis({
      registros,
      valorTotal,
      ticketMedio: registros > 0 ? valorTotal / registros : 0,
      horaPico,
    });
    setSerieDiaria(resSerie.data || []);
    setPorHora(resHora.data || []);
    setMapaCalor(resMapa.data || []);
    setPorCategoria((resCategoria.data || []).slice(0, 10));
    setCarregando(false);
  }

  async function carregarComparacao() {
    if (!permitido || unidadesComparacao.length === 0) {
      setComparacaoDados([]);
      setComparacaoTaxaDados([]);
      return;
    }
    setComparacaoCarregando(true);
    const paramsBase = {
      data_inicio: intervaloFoco.inicio,
      data_fim_excl: intervaloFoco.fimExcl,
      unidade_ids: unidadesComparacao,
      linha_param: linhaFiltro || null,
      categoria_param: categoriaFiltro || null,
    };
    const chamadas = [supabase.rpc("estatisticas_comparacao_unidades", { ...paramsBase, modo_taxa: incluirTaxa ? "incluir" : "excluir" })];
    if (incluirTaxa) chamadas.push(supabase.rpc("estatisticas_comparacao_unidades", { ...paramsBase, modo_taxa: "somente" }));
    const [resGeral, resTaxa] = await Promise.all(chamadas);
    setComparacaoDados(resGeral.data || []);
    setComparacaoTaxaDados(incluirTaxa ? resTaxa?.data || [] : []);
    setComparacaoCarregando(false);
  }

  useEffect(() => {
    carregar();
  }, [tipoPeriodo, semanaSelecionada, mesSelecionado, dataInicioCustom, dataFimCustom, escopo, linhaFiltro, categoriaFiltro, incluirTaxa]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    carregarComparacao();
  }, [tipoPeriodo, semanaSelecionada, mesSelecionado, dataInicioCustom, dataFimCustom, linhaFiltro, categoriaFiltro, incluirTaxa, unidadesComparacao]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!permitido) {
    return <p className="text-sm text-muted">Você não tem acesso às Estatísticas do sistema.</p>;
  }

  // --- CI vs IH ao longo do tempo (granularidade conforme o período escolhido) ---
  const { granularidade } = intervaloContexto;
  const chaveBucket = (dia) => (granularidade === "mes" ? dia.slice(0, 7) : granularidade === "semana" ? inicioDaSemanaDe(dia) : dia);
  const rotuloBucket = (chave) => (granularidade === "mes" ? formatarMesCurto(chave) : formatarDataCurta(chave));

  const buckets = new Map();
  serieDiaria.forEach((l) => {
    const chave = chaveBucket(l.dia);
    if (!buckets.has(chave)) buckets.set(chave, { CI: 0, IH: 0 });
    const acc = buckets.get(chave);
    acc[l.linha === "ih" ? "IH" : "CI"] += Number(l.qtd);
  });
  const dadosTendencia = [...buckets.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([chave, v]) => ({ rotulo: rotuloBucket(chave), CI: v.CI, IH: v.IH }));
  const mostrarCI = linhaFiltro !== "ih";
  const mostrarIH = linhaFiltro !== "ci" && dadosTendencia.some((d) => d.IH > 0 || linhaFiltro === "ih");

  // --- Volume por horário (00h–23h, ordem cronológica) — contexto amplo ---
  const horasCompletas = Array.from({ length: 24 }, (_, h) => {
    const encontrado = porHora.find((p) => p.hora === h);
    return { hora: h, qtd: encontrado ? Number(encontrado.qtd) : 0 };
  });
  const totalHoras = horasCompletas.reduce((s, h) => s + h.qtd, 0);
  let acumulado = 0;
  const dadosPareto = horasCompletas.map((h) => {
    acumulado += h.qtd;
    return {
      rotulo: `${String(h.hora).padStart(2, "0")}h`,
      qtd: h.qtd,
      acumuladoPct: totalHoras > 0 ? Math.round((acumulado / totalHoras) * 100) : 0,
    };
  });

  // --- Mapa de calor dia da semana × hora ---
  const mapaValores = new Map();
  let maxMapa = 0;
  mapaCalor.forEach((c) => {
    mapaValores.set(`${c.dia_semana}-${c.hora}`, Number(c.qtd));
    if (Number(c.qtd) > maxMapa) maxMapa = Number(c.qtd);
  });

  const rotuloCardRegistros =
    tipoPeriodo === "diario" ? "OS atendidas hoje" : tipoPeriodo === "semanal" ? "OS atendidas na semana" : tipoPeriodo === "mensal" ? "OS atendidas no mês" : "OS atendidas no período";

  // Unidades disponíveis pro controle de comparação (respeitam as mesmas
  // unidades que o usuário enxerga na tela toda).
  const unidadesOrdenadas = [...unidades].sort((a, b) => a.nome.localeCompare(b.nome));
  function alternarUnidadeComparacao(id) {
    setUnidadesComparacao((atual) => (atual.includes(id) ? atual.filter((u) => u !== id) : [...atual, id]));
  }
  function corDaUnidade(id) {
    const idx = unidadesComparacao.indexOf(id);
    return CORES_COMPARACAO[idx % CORES_COMPARACAO.length];
  }
  function nomeDaUnidade(id) {
    return unidades.find((u) => u.id === id)?.nome || "—";
  }

  return (
    <div className="max-w-6xl">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wider text-muted mb-1">Configurações</p>
          <h1 className="font-display text-2xl font-semibold text-ink flex items-center gap-2">
            <BarChart3 size={22} className="text-[#2E6B7A]" /> Estatísticas do sistema
          </h1>
          <p className="text-sm text-muted mt-1">Volume de lançamentos, horários de pico e tendências de uso.</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="relative">
            <Building2 size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none z-10" />
            <select className="field-input pl-8 py-2 w-52" value={escopo} onChange={(e) => setEscopo(e.target.value)}>
              <option value="todas">Todas as unidades</option>
              <optgroup label="Por marca">
                {marcasDisponiveis.map((m) => (
                  <option key={m} value={`marca:${m}`}>{m}</option>
                ))}
              </optgroup>
              <optgroup label="Por unidade">
                {unidades.map((u) => (
                  <option key={u.id} value={`unidade:${u.id}`}>{u.nome}</option>
                ))}
              </optgroup>
            </select>
          </div>
          <BotaoAtualizar aoAtualizar={carregar} />
        </div>
      </div>

      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <Calendar size={14} className="text-muted" />
        <span className="text-xs text-muted mr-1">Período de análise:</span>
        {TIPOS_PERIODO.map((t) => {
          const Icone = t.icone;
          return (
            <button
              key={t.id}
              onClick={() => setTipoPeriodo(t.id)}
              title={t.descricao}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs transition ${
                tipoPeriodo === t.id ? "bg-[#2E6B7A] text-white font-medium" : "bg-white border border-line text-muted hover:border-[#2E6B7A]/50"
              }`}
            >
              <Icone size={12} /> {t.rotulo}
            </button>
          );
        })}
      </div>

      {tipoPeriodo === "semanal" && (
        <div className="flex items-center gap-2 mb-4 text-sm">
          <label className="text-xs text-muted">Semana</label>
          <select className="field-input py-1.5 w-64" value={semanaSelecionada} onChange={(e) => setSemanaSelecionada(e.target.value)}>
            {semanas.map((s) => (
              <option key={s.valor} value={s.valor}>{s.rotulo}</option>
            ))}
          </select>
        </div>
      )}
      {tipoPeriodo === "mensal" && (
        <div className="flex items-center gap-2 mb-4 text-sm">
          <label className="text-xs text-muted">Mês</label>
          <select className="field-input py-1.5 w-40" value={mesSelecionado} onChange={(e) => setMesSelecionado(e.target.value)}>
            {meses.map((m) => (
              <option key={m.valor} value={m.valor}>{m.rotulo}</option>
            ))}
          </select>
        </div>
      )}
      {tipoPeriodo === "personalizado" && (
        <div className="flex items-center gap-2 mb-4 text-sm">
          <label className="text-xs text-muted">De</label>
          <input
            type="date"
            className="field-input py-1.5 w-40"
            value={dataInicioCustom}
            max={dataFimCustom}
            onChange={(e) => setDataInicioCustom(e.target.value)}
          />
          <label className="text-xs text-muted">Até</label>
          <input
            type="date"
            className="field-input py-1.5 w-40"
            value={dataFimCustom}
            min={dataInicioCustom}
            max={hojeBrasil()}
            onChange={(e) => setDataFimCustom(e.target.value)}
          />
        </div>
      )}
      {tipoPeriodo === "diario" && <div className="mb-4" />}

      <div className="flex items-center gap-2 mb-6 flex-wrap">
        <Route size={14} className="text-muted" />
        <span className="text-xs text-muted mr-1">Linha:</span>
        <div className="flex items-center gap-1 bg-canvas rounded-full p-0.5 border border-line">
          {[{ id: "", rotulo: "Todas" }, { id: "ci", rotulo: "CI" }, { id: "ih", rotulo: "IH" }].map((op) => (
            <button
              key={op.id || "todas"}
              onClick={() => setLinhaFiltro(op.id)}
              className={`px-3 py-1 rounded-full text-xs transition ${linhaFiltro === op.id ? "bg-white shadow-sm font-medium text-ink" : "text-muted"}`}
            >
              {op.rotulo}
            </button>
          ))}
        </div>

        <div className="relative ml-2">
          <Tags size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none z-10" />
          <select className="field-input pl-8 py-1.5 text-sm w-52" value={categoriaFiltro} onChange={(e) => setCategoriaFiltro(e.target.value)}>
            <option value="">Todas as categorias</option>
            {categoriasDisponiveis.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <button
          onClick={() => setIncluirTaxa((v) => !v)}
          title="Marcado: os totais incluem Taxa de Análise/Visita. Desmarcado: essas taxas ficam de fora dos totais."
          className={`flex items-center gap-1.5 ml-2 px-3 py-1.5 rounded-full text-xs border transition ${
            incluirTaxa ? "bg-[#B23B2E]/10 border-[#B23B2E]/40 text-[#B23B2E] font-medium" : "bg-white border-line text-muted hover:border-[#B23B2E]/40"
          }`}
        >
          <span className={`w-3.5 h-3.5 rounded flex items-center justify-center border ${incluirTaxa ? "bg-[#B23B2E] border-[#B23B2E]" : "border-line"}`}>
            {incluirTaxa && <Check size={10} className="text-white" strokeWidth={3} />}
          </span>
          <ReceiptText size={13} /> Taxa de Análise / Taxa de Visita
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        <div className="card overflow-hidden">
          <div className="h-1.5 bg-[#2670B5]" />
          <div className="p-4">
            <div className="w-8 h-8 rounded-lg bg-[#2670B5]/10 flex items-center justify-center text-[#2670B5] mb-2"><Hash size={16} /></div>
            <p className="text-xs text-muted mb-1">{rotuloCardRegistros}</p>
            <p className="font-mono-num text-xl font-semibold text-ink">{carregando ? "…" : kpis.registros}</p>
            <p className="text-[11px] text-muted mt-0.5 truncate">{intervaloFoco.rotuloCard}</p>
          </div>
        </div>
        <div className="card overflow-hidden">
          <div className="h-1.5 bg-[#3F8A5C]" />
          <div className="p-4">
            <div className="w-8 h-8 rounded-lg bg-[#3F8A5C]/10 flex items-center justify-center text-[#3F8A5C] mb-2"><DollarSign size={16} /></div>
            <p className="text-xs text-muted mb-1">Valor total vendido</p>
            <p className="font-mono-num text-xl font-semibold text-ink">{carregando ? "…" : `R$ ${formatarMoedaSemSimbolo(kpis.valorTotal)}`}</p>
            <p className="text-[11px] text-muted mt-0.5 truncate">{intervaloFoco.rotuloCard}</p>
          </div>
        </div>
        <div className="card overflow-hidden">
          <div className="h-1.5 bg-[#C9A227]" />
          <div className="p-4">
            <div className="w-8 h-8 rounded-lg bg-[#C9A227]/10 flex items-center justify-center text-[#9C7E13] mb-2"><Percent size={16} /></div>
            <p className="text-xs text-muted mb-1">Ticket médio</p>
            <p className="font-mono-num text-xl font-semibold text-ink">{carregando ? "…" : `R$ ${formatarMoedaSemSimbolo(kpis.ticketMedio)}`}</p>
            <p className="text-[11px] text-muted mt-0.5 truncate">{intervaloFoco.rotuloCard}</p>
          </div>
        </div>
        <div className="card overflow-hidden">
          <div className="h-1.5 bg-[#7C56B5]" />
          <div className="p-4">
            <div className="w-8 h-8 rounded-lg bg-[#7C56B5]/10 flex items-center justify-center text-[#7C56B5] mb-2"><Flame size={16} /></div>
            <p className="text-xs text-muted mb-1">Horário de pico</p>
            <p className="font-mono-num text-xl font-semibold text-ink">
              {carregando || !kpis.horaPico ? "—" : `${String(kpis.horaPico.hora).padStart(2, "0")}h`}
            </p>
            <p className="text-[11px] text-muted mt-0.5 truncate">{intervaloFoco.rotuloCard}</p>
          </div>
        </div>
      </div>

      {/* CI vs IH ao longo do tempo */}
      <div className="card p-5 mb-6">
        <p className="text-sm font-semibold text-ink mb-1 flex items-center gap-1.5">
          <TrendingUp size={14} /> Registros ao longo do tempo{mostrarCI && mostrarIH ? " — CI vs IH" : ""}
        </p>
        <p className="text-xs text-muted mb-4">
          Agrupado por {granularidade === "mes" ? "mês" : granularidade === "semana" ? "semana" : "dia"} · {formatarDataCurta(intervaloContexto.inicio)} até {formatarDataCurta(hojeBrasil())}
          {intervaloFoco.rotuloDestaque ? " · período selecionado destacado em vermelho" : ""}.
        </p>
        {carregando ? (
          <p className="text-sm text-muted py-16 text-center">Carregando…</p>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={dadosTendencia} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E4E7EC" />
              <XAxis dataKey="rotulo" tick={{ fontSize: 11, fill: "#6B6D76" }} />
              <YAxis tick={{ fontSize: 11, fill: "#6B6D76" }} width={36} allowDecimals={false} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {intervaloFoco.rotuloDestaque && (
                <ReferenceLine x={intervaloFoco.rotuloDestaque} stroke="#B23B2E" strokeDasharray="4 3" ifOverflow="discard" />
              )}
              {mostrarCI && <Line type="monotone" dataKey="CI" stroke="#2670B5" strokeWidth={2} dot={{ r: 2.5 }} />}
              {mostrarIH && <Line type="monotone" dataKey="IH" stroke="#0E7A72" strokeWidth={2} dot={{ r: 2.5 }} />}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="grid grid-cols-2 gap-5 mb-6">
        {/* Pareto por horário */}
        <div className="card p-5">
          <p className="text-sm font-semibold text-ink mb-1 flex items-center gap-1.5"><Clock size={14} /> Volume por horário do dia</p>
          <p className="text-xs text-muted mb-4">Das 00h às 23h, com o acumulado do dia em % — mesmo contexto do gráfico acima.</p>
          {carregando ? (
            <p className="text-sm text-muted py-16 text-center">Carregando…</p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <ComposedChart data={dadosPareto} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E4E7EC" />
                <XAxis dataKey="rotulo" tick={{ fontSize: 10, fill: "#6B6D76" }} interval={1} />
                <YAxis yAxisId="qtd" tick={{ fontSize: 10, fill: "#6B6D76" }} width={30} allowDecimals={false} />
                <YAxis yAxisId="pct" orientation="right" tick={{ fontSize: 10, fill: "#6B6D76" }} width={32} domain={[0, 100]} />
                <Tooltip />
                <Bar yAxisId="qtd" dataKey="qtd" name="Registros" fill="#B8862E" radius={[3, 3, 0, 0]} />
                <Line yAxisId="pct" type="monotone" dataKey="acumuladoPct" name="Acumulado %" stroke="#7C56B5" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Distribuição por categoria */}
        <div className="card p-5">
          <p className="text-sm font-semibold text-ink mb-1 flex items-center gap-1.5"><Tags size={14} /> Distribuição por categoria</p>
          <p className="text-xs text-muted mb-4">Top 10 categorias por quantidade de registros (TV e DTV somadas em "DTV").</p>
          {carregando ? (
            <p className="text-sm text-muted py-16 text-center">Carregando…</p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={porCategoria} layout="vertical" margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E4E7EC" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10, fill: "#6B6D76" }} allowDecimals={false} />
                <YAxis type="category" dataKey="categoria" tick={{ fontSize: 11, fill: "#6B6D76" }} width={110} />
                <Tooltip formatter={(v) => [v, "Registros"]} />
                <Bar dataKey="qtd" fill="#0E7A72" radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Mapa de calor dia × hora */}
      <div className="card p-5">
        <p className="text-sm font-semibold text-ink mb-1 flex items-center gap-1.5"><Grid3x3 size={14} /> Mapa de calor — dia da semana × horário</p>
        <p className="text-xs text-muted mb-4">Quanto mais escuro, mais lançamentos aconteceram naquele horário.</p>
        {carregando ? (
          <p className="text-sm text-muted py-16 text-center">Carregando…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="border-collapse">
              <thead>
                <tr>
                  <td className="w-14" />
                  {Array.from({ length: 24 }, (_, h) => (
                    <td key={h} className="text-center text-[9px] text-muted pb-1 w-7">{h}</td>
                  ))}
                </tr>
              </thead>
              <tbody>
                {NOMES_DIA_CURTO.map((nomeDia, dow) => (
                  <tr key={dow}>
                    <td className="text-xs text-muted pr-2 whitespace-nowrap">{nomeDia}</td>
                    {Array.from({ length: 24 }, (_, h) => {
                      const v = mapaValores.get(`${dow}-${h}`) || 0;
                      const alpha = maxMapa > 0 ? Math.max(v / maxMapa, v > 0 ? 0.15 : 0.03) : 0.03;
                      return (
                        <td key={h} className="p-0.5">
                          <div
                            title={`${NOMES_DIA[dow]}, ${String(h).padStart(2, "0")}h — ${v} registro(s)`}
                            className="w-6 h-6 rounded-sm"
                            style={{ background: `rgba(184, 134, 46, ${alpha})` }}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Comparação de ticket médio entre unidades */}
      <div className="mt-6">
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <Scale size={14} className="text-muted" />
          <span className="text-sm font-semibold text-ink mr-1">Comparação entre unidades</span>
          <span className="text-xs text-muted">usa os filtros de Linha, Categoria e Período acima</span>

          <div className="relative ml-auto" ref={comparacaoRef}>
            <button
              onClick={() => setComparacaoAberta((v) => !v)}
              className="flex items-center gap-2 field-input py-1.5 px-3 text-sm min-w-[220px] justify-between"
            >
              <span className="truncate text-left">
                {unidadesComparacao.length === 0
                  ? "Selecionar unidades…"
                  : `${unidadesComparacao.length} unidade${unidadesComparacao.length > 1 ? "s" : ""} selecionada${unidadesComparacao.length > 1 ? "s" : ""}`}
              </span>
              <ChevronDown size={14} className={`text-muted shrink-0 transition-transform ${comparacaoAberta ? "rotate-180" : ""}`} />
            </button>
            {comparacaoAberta && (
              <div className="absolute right-0 mt-1 w-72 max-h-80 overflow-y-auto bg-white border border-line rounded-lg shadow-lg z-20 py-1">
                {unidadesOrdenadas.length === 0 && <p className="text-xs text-muted px-3 py-2">Nenhuma unidade disponível.</p>}
                {unidadesOrdenadas.map((u) => {
                  const marcado = unidadesComparacao.includes(u.id);
                  const cor = marcado ? corDaUnidade(u.id) : null;
                  return (
                    <button
                      key={u.id}
                      onClick={() => alternarUnidadeComparacao(u.id)}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-canvas text-left"
                    >
                      <span
                        className="w-4 h-4 rounded flex items-center justify-center border shrink-0"
                        style={{ background: marcado ? cor : "transparent", borderColor: marcado ? cor : "#D8DBE2" }}
                      >
                        {marcado && <Check size={11} className="text-white" strokeWidth={3} />}
                      </span>
                      <span className="truncate text-ink">{u.nome}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          {unidadesComparacao.length > 0 && (
            <button onClick={() => setUnidadesComparacao([])} className="flex items-center gap-1 text-xs text-muted hover:text-ink" title="Limpar seleção">
              <X size={12} /> Limpar
            </button>
          )}
        </div>

        {unidadesComparacao.length === 0 ? (
          <div className="card p-6 text-center text-sm text-muted mb-6">Selecione 2 ou mais unidades acima para comparar o ticket médio.</div>
        ) : (
          <>
            <TabelaComparacaoUnidades
              titulo="Ticket médio por unidade"
              subtitulo={`Qtd. OS, valor vendido e ticket médio no período selecionado (${intervaloFoco.rotuloCard})${incluirTaxa ? ", incluindo taxas" : ", sem taxas"}.`}
              icone={Scale}
              corAccent="#2E6B7A"
              dados={comparacaoDados}
              unidadeIds={unidadesComparacao}
              corFn={corDaUnidade}
              nomeFn={nomeDaUnidade}
              carregando={comparacaoCarregando}
              rotuloTicket="Ticket médio"
            />

            {incluirTaxa && (
              <TabelaComparacaoUnidades
                titulo="Ticket médio das taxas por unidade"
                subtitulo={`Somente lançamentos de Taxa de Análise/Visita, no período selecionado (${intervaloFoco.rotuloCard}).`}
                icone={ReceiptText}
                corAccent="#B23B2E"
                dados={comparacaoTaxaDados}
                unidadeIds={unidadesComparacao}
                corFn={corDaUnidade}
                nomeFn={nomeDaUnidade}
                carregando={comparacaoCarregando}
                rotuloTicket="Ticket médio das taxas"
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function EstatisticasPage() {
  return (
    <AppShell>
      <Conteudo />
    </AppShell>
  );
}
