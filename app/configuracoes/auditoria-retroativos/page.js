"use client";
import { useEffect, useRef, useState } from "react";
import { ShieldAlert, Building2, Briefcase, User, Hash, Percent, Clock, Trophy, Eraser, ArrowDownAZ, ArrowUpAZ, BarChart3, ChevronDown, FileSpreadsheet } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import AppShell from "../../../components/AppShell";
import BotaoAtualizar from "../../../components/BotaoAtualizar";
import BotaoAcao3D from "../../../components/BotaoAcao3D";
import { supabase } from "../../../lib/supabaseClient";
import { useSessao } from "../../../lib/SessaoContext";
import { CARGOS, CARGO_LABELS, podeVerAuditoriaRetroativos } from "../../../lib/permissions";
import { formatarMoedaSemSimbolo, formatarDataBR } from "../../../lib/formato";
import { hojeBrasil, numeroDaSemana } from "../../../lib/fusoHorario";

function formatarDataHora(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.toLocaleDateString("pt-BR")} às ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
}

function somarDias(dataIso, qtd) {
  const d = new Date(dataIso + "T12:00:00");
  d.setDate(d.getDate() + qtd);
  return d.toISOString().slice(0, 10);
}
function diaSeguinte(dataIso) {
  return somarDias(dataIso, 1);
}
function inicioDaSemanaDe(dataIso) {
  const d = new Date(dataIso + "T12:00:00");
  d.setDate(d.getDate() - d.getDay());
  return d.toISOString().slice(0, 10);
}
function formatarDataCurta(dataIso) {
  const [, mes, dia] = dataIso.split("-");
  return `${dia}/${mes}`;
}
function formatarMesCurto(chaveMes) {
  const [ano, mes] = chaveMes.split("-");
  return `${mes}/${ano}`;
}

function clarear(hex, pct) {
  const num = parseInt(hex.replace("#", ""), 16);
  const r = Math.min(255, Math.round(((num >> 16) & 255) + (255 - ((num >> 16) & 255)) * pct));
  const g = Math.min(255, Math.round(((num >> 8) & 255) + (255 - ((num >> 8) & 255)) * pct));
  const b = Math.min(255, Math.round((num & 255) + (255 - (num & 255)) * pct));
  return `rgb(${r},${g},${b})`;
}
function escurecer(hex, pct) {
  const num = parseInt(hex.replace("#", ""), 16);
  const r = Math.round(((num >> 16) & 255) * (1 - pct));
  const g = Math.round(((num >> 8) & 255) * (1 - pct));
  const b = Math.round((num & 255) * (1 - pct));
  return `rgb(${r},${g},${b})`;
}

/** Seletor de múltipla escolha, suspenso — abre numa linha, fecha ao marcar uma opção. */
function SeletorSuspenso({ rotulo, icone: Icone, opcoes, selecionados, onChange }) {
  const [aberto, setAberto] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function aoClicarFora(e) {
      if (ref.current && !ref.current.contains(e.target)) setAberto(false);
    }
    window.addEventListener("mousedown", aoClicarFora);
    return () => window.removeEventListener("mousedown", aoClicarFora);
  }, []);

  function alternar(valor) {
    onChange(selecionados.includes(valor) ? selecionados.filter((v) => v !== valor) : [...selecionados, valor]);
    setAberto(false);
  }

  const rotuloBotao =
    selecionados.length === 0
      ? "Todas"
      : selecionados.length === 1
        ? opcoes.find((o) => o.valor === selecionados[0])?.rotulo || "1 selecionada"
        : `${selecionados.length} selecionadas`;

  return (
    <div className="relative flex-1 min-w-[200px]" ref={ref}>
      <p className="text-[11px] font-semibold text-muted uppercase tracking-wide mb-1.5 flex items-center gap-1">
        {Icone && <Icone size={11} />} {rotulo}
      </p>
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="field-input text-sm w-full flex items-center justify-between text-left"
      >
        <span className="truncate">{rotuloBotao}</span>
        <ChevronDown size={14} className={`shrink-0 transition-transform ${aberto ? "rotate-180" : ""}`} />
      </button>
      {aberto && (
        <div className="absolute z-20 mt-1 w-full max-h-56 overflow-y-auto bg-white border border-line rounded-lg shadow-lg">
          {opcoes.map((o) => (
            <label key={o.valor} className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-canvas cursor-pointer">
              <input type="checkbox" checked={selecionados.includes(o.valor)} onChange={() => alternar(o.valor)} />
              {o.rotulo}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

const GRANULARIDADES = [
  { id: "dia", rotulo: "Dia" },
  { id: "semana", rotulo: "Semana" },
  { id: "mes", rotulo: "Mês" },
];

function Conteudo() {
  const { usuario, unidades } = useSessao();
  const permitido = podeVerAuditoriaRetroativos(usuario.cargo);

  const [usuariosLista, setUsuariosLista] = useState([]);
  const [unidadesSelecionadas, setUnidadesSelecionadas] = useState([]);
  const [cargosSelecionados, setCargosSelecionados] = useState([]);
  const [usuariosSelecionados, setUsuariosSelecionados] = useState([]);
  const [linhas, setLinhas] = useState([]);
  const [totalGeral, setTotalGeral] = useState(0);
  const [carregando, setCarregando] = useState(true);
  const [ordenacao, setOrdenacao] = useState({ campo: null, direcao: "desc" });

  const [granularidadeGrafico, setGranularidadeGrafico] = useState("dia");
  const [comparativo, setComparativo] = useState([]);
  const [carregandoGrafico, setCarregandoGrafico] = useState(false);

  useEffect(() => {
    if (!permitido) return;
    supabase
      .from("usuarios")
      .select("id, nome_completo, login, cargo")
      .order("nome_completo")
      .then(({ data }) => setUsuariosLista(data || []));
  }, [permitido]);

  async function carregar() {
    if (!permitido) return;
    setCarregando(true);
    const filtros = {
      unidade_ids: unidadesSelecionadas.length > 0 ? unidadesSelecionadas : null,
      cargos: cargosSelecionados.length > 0 ? cargosSelecionados : null,
      usuario_ids: usuariosSelecionados.length > 0 ? usuariosSelecionados : null,
    };
    const [{ data, error }, { data: totalData, error: erroTotal }] = await Promise.all([
      supabase.rpc("auditoria_lancamentos_retroativos", filtros),
      supabase.rpc("auditoria_total_lancamentos", filtros),
    ]);
    if (error) console.error("Erro na auditoria de retroativos:", error.message);
    if (erroTotal) console.error("Erro no total geral:", erroTotal.message);
    setLinhas(data || []);
    setTotalGeral(totalData?.[0]?.total || 0);
    setCarregando(false);
  }

  useEffect(() => {
    carregar();
  }, [unidadesSelecionadas, cargosSelecionados, usuariosSelecionados]); // eslint-disable-line react-hooks/exhaustive-deps

  function limparFiltros() {
    setUnidadesSelecionadas([]);
    setCargosSelecionados([]);
    setUsuariosSelecionados([]);
  }

  function alternarOrdenacao(campo) {
    setOrdenacao((atual) => (atual.campo === campo ? { campo, direcao: atual.direcao === "desc" ? "asc" : "desc" } : { campo, direcao: "desc" }));
  }

  // --- gráfico comparativo (em dia × retroativo), só quando 1 unidade está selecionada ---
  const unidadeUnicaId = unidadesSelecionadas.length === 1 ? unidadesSelecionadas[0] : null;
  const unidadeUnicaNome = unidadeUnicaId ? unidades.find((u) => u.id === unidadeUnicaId)?.nome : null;

  async function carregarComparativo() {
    if (!unidadeUnicaId) {
      setComparativo([]);
      return;
    }
    setCarregandoGrafico(true);
    const hoje = hojeBrasil();
    const dataInicio =
      granularidadeGrafico === "mes" ? somarDias(hoje, -365) : granularidadeGrafico === "semana" ? somarDias(hoje, -7 * 11) : somarDias(hoje, -29);
    const { data, error } = await supabase.rpc("auditoria_comparativo_unidade", {
      unidade_id_param: unidadeUnicaId,
      data_inicio: dataInicio,
      data_fim_excl: diaSeguinte(hoje),
    });
    if (error) console.error("Erro no comparativo:", error.message);
    setComparativo(data || []);
    setCarregandoGrafico(false);
  }

  useEffect(() => {
    carregarComparativo();
  }, [unidadeUnicaId, granularidadeGrafico]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!permitido) {
    return <p className="text-sm text-muted">Você não tem acesso a essa tela.</p>;
  }

  // --- resumo ---
  const totalQtd = linhas.length;
  const totalValor = linhas.reduce((s, l) => s + Number(l.valor_pago), 0);
  const mediaAtraso = totalQtd > 0 ? linhas.reduce((s, l) => s + Number(l.dias_atraso), 0) / totalQtd : 0;
  const percentualRetroativo = totalGeral > 0 ? (totalQtd / totalGeral) * 100 : 0;
  const percentualNoPrazo = totalGeral > 0 ? 100 - percentualRetroativo : 0;

  async function exportarExcel() {
    const XLSX = await import("xlsx");
    const linhasExport = linhasOrdenadas.map((l) => ({
      "Nº OS": l.numero_os,
      Unidade: l.unidade_nome,
      Linha: l.linha === "ih" ? "IH" : "CI",
      Categoria: l.categoria_nome || "",
      Responsável: l.responsavel_nome,
      Login: l.responsavel_login,
      Cargo: CARGO_LABELS[l.responsavel_cargo] || l.responsavel_cargo,
      "Editou depois": l.alterado_em ? "Sim" : "Não",
      "Data selecionada": formatarDataBR(l.data),
      "Feito em": formatarDataHora(l.alterado_em || l.criado_em),
      "Dias de atraso": l.dias_atraso,
      "Valor pago": Number(l.valor_pago),
    }));
    const planilha = XLSX.utils.json_to_sheet(linhasExport);
    const livro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(livro, planilha, "Lançamentos retroativos");
    XLSX.writeFile(livro, `lancamentos-retroativos-${hojeBrasil()}.xlsx`);
  }

  const porLogin = new Map();
  linhas.forEach((l) => {
    const chave = l.responsavel_id;
    if (!porLogin.has(chave)) {
      porLogin.set(chave, { nome: l.responsavel_nome, login: l.responsavel_login, cargo: l.responsavel_cargo, qtd: 0, valor: 0 });
    }
    const acc = porLogin.get(chave);
    acc.qtd += 1;
    acc.valor += Number(l.valor_pago);
  });
  const rankingLogin = [...porLogin.values()].sort((a, b) => b.qtd - a.qtd).slice(0, 8);

  const porUnidade = new Map();
  linhas.forEach((l) => {
    if (!porUnidade.has(l.unidade_id)) porUnidade.set(l.unidade_id, { nome: l.unidade_nome, qtd: 0, valor: 0 });
    const acc = porUnidade.get(l.unidade_id);
    acc.qtd += 1;
    acc.valor += Number(l.valor_pago);
  });
  const rankingUnidade = [...porUnidade.values()].sort((a, b) => b.qtd - a.qtd).slice(0, 8);

  // --- ordenação da tabela de detalhe ---
  const linhasOrdenadas = [...linhas];
  if (ordenacao.campo === "data") {
    linhasOrdenadas.sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0) * (ordenacao.direcao === "desc" ? -1 : 1));
  } else if (ordenacao.campo === "feito_em") {
    linhasOrdenadas.sort((a, b) => {
      const da = a.alterado_em || a.criado_em;
      const db = b.alterado_em || b.criado_em;
      return (da < db ? -1 : da > db ? 1 : 0) * (ordenacao.direcao === "desc" ? -1 : 1);
    });
  }

  function IconeOrdenacao({ campo }) {
    if (ordenacao.campo !== campo) return null;
    return ordenacao.direcao === "desc" ? <ArrowDownAZ size={11} className="inline ml-1" /> : <ArrowUpAZ size={11} className="inline ml-1" />;
  }

  // --- pivô do gráfico comparativo, agrupado pela granularidade escolhida ---
  const chaveBucket = (dia) => (granularidadeGrafico === "mes" ? dia.slice(0, 7) : granularidadeGrafico === "semana" ? inicioDaSemanaDe(dia) : dia);
  const rotuloBucket = (chave) =>
    granularidadeGrafico === "mes" ? formatarMesCurto(chave) : granularidadeGrafico === "semana" ? `W${numeroDaSemana(chave)}` : formatarDataCurta(chave);
  const buckets = new Map();
  comparativo.forEach((c) => {
    const chave = chaveBucket(c.dia);
    if (!buckets.has(chave)) buckets.set(chave, { noPrazo: 0, retroativo: 0 });
    const acc = buckets.get(chave);
    acc.noPrazo += Number(c.valor_no_prazo);
    acc.retroativo += Number(c.valor_retroativo);
  });
  const dadosGraficoComparativo = [...buckets.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([chave, v]) => ({ rotulo: rotuloBucket(chave), "Em dia": v.noPrazo, "Retroativo": v.retroativo }));

  return (
    <div className="w-full">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wider text-muted mb-1">Configurações</p>
          <h1 className="font-display text-2xl font-semibold text-ink flex items-center gap-2">
            <ShieldAlert size={22} className="text-[#B23B2E]" /> Lançamentos retroativos
          </h1>
          <p className="text-sm text-muted mt-1">Lançamentos com data anterior ao dia em que a ação foi realmente feita (na criação ou numa edição posterior).</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <BotaoAtualizar aoAtualizar={carregar} />
          <BotaoAcao3D icone={FileSpreadsheet} rotulo="Exportar Excel" onClick={exportarExcel} cor="teal" disabled={linhas.length === 0} />
          <button
            onClick={limparFiltros}
            title="Limpar todos os filtros"
            className="group inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-white
              bg-gradient-to-b from-gold to-gold-strong
              shadow-[0_3px_0_0_rgba(0,0,0,0.18),0_8px_16px_-4px_rgba(184,134,46,0.55)]
              hover:brightness-105 hover:-translate-y-0.5
              active:translate-y-0 active:shadow-[0_1px_0_0_rgba(0,0,0,0.18),0_4px_8px_-2px_rgba(184,134,46,0.5)]
              transition-all duration-150"
          >
            <Eraser size={15} />
            Todos
          </button>
        </div>
      </div>

      {/* Filtros — numa linha só, suspensos */}
      <div className="card p-4 mb-5">
        <div className="flex items-start gap-3 flex-wrap">
          <SeletorSuspenso
            rotulo="Unidades"
            icone={Building2}
            opcoes={unidades.map((u) => ({ valor: u.id, rotulo: u.nome }))}
            selecionados={unidadesSelecionadas}
            onChange={setUnidadesSelecionadas}
          />
          <SeletorSuspenso
            rotulo="Cargo"
            icone={Briefcase}
            opcoes={Object.values(CARGOS).map((c) => ({ valor: c, rotulo: CARGO_LABELS[c] }))}
            selecionados={cargosSelecionados}
            onChange={setCargosSelecionados}
          />
          <SeletorSuspenso
            rotulo="Usuário"
            icone={User}
            opcoes={usuariosLista.map((u) => ({ valor: u.id, rotulo: `${u.nome_completo} (@${u.login})` }))}
            selecionados={usuariosSelecionados}
            onChange={setUsuariosSelecionados}
          />
        </div>
        <p className="text-[10px] text-muted mt-2">Nenhuma opção marcada num filtro = considera todas.</p>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        <div className="card overflow-hidden">
          <div className="h-1.5 bg-[#B23B2E]" />
          <div className="p-4">
            <div className="w-8 h-8 rounded-lg bg-[#B23B2E]/10 flex items-center justify-center text-[#B23B2E] mb-2"><Hash size={16} /></div>
            <p className="text-xs text-muted mb-1">Lançamentos retroativos</p>
            <p className="font-mono-num text-xl font-semibold text-ink">{carregando ? "…" : totalQtd}</p>
          </div>
        </div>
        <div className="card overflow-hidden">
          <div className="h-1.5 bg-[#C9A227]" />
          <div className="p-4">
            <div className="w-8 h-8 rounded-lg bg-[#C9A227]/10 flex items-center justify-center text-[#9C7E13] mb-2"><Percent size={16} /></div>
            <p className="text-xs text-muted mb-1">Valor total envolvido</p>
            <p className="font-mono-num text-xl font-semibold text-ink">{carregando ? "…" : `R$ ${formatarMoedaSemSimbolo(totalValor)}`}</p>
          </div>
        </div>
        <div className="card overflow-hidden">
          <div className="h-1.5 bg-[#7C56B5]" />
          <div className="p-4">
            <div className="w-8 h-8 rounded-lg bg-[#7C56B5]/10 flex items-center justify-center text-[#7C56B5] mb-2"><Clock size={16} /></div>
            <p className="text-xs text-muted mb-1">Média de dias de atraso</p>
            <p className="font-mono-num text-xl font-semibold text-ink">{carregando ? "…" : mediaAtraso.toFixed(1)}</p>
          </div>
        </div>
        <div className="card overflow-hidden">
          <div className="h-1.5 bg-gradient-to-r from-[#2670B5] to-[#B8621E]" />
          <div className="p-4">
            <p className="text-xs text-muted mb-1.5">Em dia × Retroativo</p>
            {carregando ? (
              <p className="font-mono-num text-xl font-semibold text-ink">…</p>
            ) : totalGeral === 0 ? (
              <p className="text-sm text-muted">Sem lançamentos no período.</p>
            ) : (
              <>
                <div className="flex items-center justify-between text-sm font-mono-num font-semibold mb-1.5">
                  <span className="text-[#2670B5]">{percentualNoPrazo.toFixed(1)}%</span>
                  <span className="text-[#B8621E]">{percentualRetroativo.toFixed(1)}%</span>
                </div>
                <div className="h-2 rounded-full overflow-hidden bg-canvas flex">
                  <div className="h-full bg-[#2670B5]" style={{ width: `${percentualNoPrazo}%` }} />
                  <div className="h-full bg-[#B8621E]" style={{ width: `${percentualRetroativo}%` }} />
                </div>
                <p className="text-[10px] text-muted mt-1.5">{totalQtd} de {totalGeral} lançamentos no total</p>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Gráfico comparativo — só aparece com 1 unidade selecionada */}
      {unidadeUnicaId && (
        <div className="card p-5 mb-6">
          <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
            <p className="text-sm font-semibold text-ink flex items-center gap-1.5">
              <BarChart3 size={14} className="text-[#2E6B7A]" /> {unidadeUnicaNome} — valor em dia × retroativo
            </p>
            <div className="flex items-center gap-1 bg-canvas rounded-full p-0.5 border border-line">
              {GRANULARIDADES.map((g) => (
                <button
                  key={g.id}
                  onClick={() => setGranularidadeGrafico(g.id)}
                  className={`px-3 py-1 rounded-full text-xs transition ${granularidadeGrafico === g.id ? "bg-white shadow-sm font-medium text-ink" : "text-muted"}`}
                >
                  {g.rotulo}
                </button>
              ))}
            </div>
          </div>
          <p className="text-xs text-muted mb-4">Azul = valor lançado na data certa. Laranja = valor lançado com data retroativa.</p>
          {carregandoGrafico ? (
            <p className="text-sm text-muted py-12 text-center">Carregando…</p>
          ) : dadosGraficoComparativo.length === 0 ? (
            <p className="text-sm text-muted py-12 text-center">Sem lançamentos nesse período.</p>
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={dadosGraficoComparativo} margin={{ top: 10, right: 20, left: 0, bottom: 0 }} barGap={4}>
                <defs>
                  <linearGradient id="grad-em-dia" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={clarear("#2670B5", 0.55)} />
                    <stop offset="45%" stopColor="#2670B5" />
                    <stop offset="100%" stopColor={escurecer("#2670B5", 0.28)} />
                  </linearGradient>
                  <linearGradient id="grad-retroativo" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={clarear("#B8621E", 0.55)} />
                    <stop offset="45%" stopColor="#B8621E" />
                    <stop offset="100%" stopColor={escurecer("#B8621E", 0.28)} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#E4E7EC" />
                <XAxis dataKey="rotulo" tick={{ fontSize: 11, fill: "#6B6D76" }} />
                <YAxis
                  tick={{ fontSize: 11, fill: "#6B6D76" }}
                  width={70}
                  tickFormatter={(v) => `R$ ${Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`}
                />
                <Tooltip formatter={(v, nome) => [`R$ ${formatarMoedaSemSimbolo(v)}`, nome]} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Em dia" fill="url(#grad-em-dia)" radius={[6, 6, 0, 0]} maxBarSize={54} />
                <Bar dataKey="Retroativo" fill="url(#grad-retroativo)" radius={[6, 6, 0, 0]} maxBarSize={54} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      )}

      {!carregando && linhas.length > 0 && (
        <div className="grid grid-cols-2 gap-5 mb-6">
          <div className="card p-4">
            <p className="text-sm font-semibold text-ink mb-3 flex items-center gap-1.5"><Trophy size={14} className="text-[#B8862E]" /> Ranking por login</p>
            <div className="space-y-2">
              {rankingLogin.map((r, i) => (
                <div key={r.login} className="flex items-center gap-2 text-sm">
                  <span className="text-xs text-muted w-5">{i + 1}º</span>
                  <span className="flex-1 truncate">{r.nome} <span className="text-xs text-muted">@{r.login}</span></span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-canvas text-muted shrink-0">{CARGO_LABELS[r.cargo] || r.cargo}</span>
                  <span className="font-mono-num font-semibold text-ink shrink-0 w-8 text-right">{r.qtd}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="card p-4">
            <p className="text-sm font-semibold text-ink mb-3 flex items-center gap-1.5"><Trophy size={14} className="text-[#B8862E]" /> Ranking por unidade</p>
            <div className="space-y-2">
              {rankingUnidade.map((r, i) => (
                <div key={r.nome} className="flex items-center gap-2 text-sm">
                  <span className="text-xs text-muted w-5">{i + 1}º</span>
                  <span className="flex-1 truncate">{r.nome}</span>
                  <span className="font-mono-num font-semibold text-ink shrink-0 w-8 text-right">{r.qtd}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Detalhamento */}
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wider text-muted border-b border-line">
              <td className="p-3">Nº OS</td>
              <td className="p-3">Unidade</td>
              <td className="p-3">Categoria</td>
              <td className="p-3">Responsável</td>
              <td className="p-3 cursor-pointer select-none hover:text-ink" onClick={() => alternarOrdenacao("data")}>
                Data selecionada<IconeOrdenacao campo="data" />
              </td>
              <td className="p-3 cursor-pointer select-none hover:text-ink" onClick={() => alternarOrdenacao("feito_em")}>
                Feito em<IconeOrdenacao campo="feito_em" />
              </td>
              <td className="p-3 text-right">Dias de atraso</td>
              <td className="p-3 text-right">Valor</td>
            </tr>
          </thead>
          <tbody>
            {carregando && <tr><td className="p-4 text-muted" colSpan={8}>Carregando…</td></tr>}
            {!carregando && linhasOrdenadas.length === 0 && <tr><td className="p-4 text-muted" colSpan={8}>Nenhum lançamento retroativo encontrado para esses filtros.</td></tr>}
            {linhasOrdenadas.map((l) => (
              <tr key={l.id} className="border-t border-line">
                <td className="p-3 font-mono-num">{l.numero_os}</td>
                <td className="p-3">
                  {l.unidade_nome}{" "}
                  {l.linha === "ih" && <span className="text-[9px] px-1.5 py-0.5 rounded font-medium bg-teal-soft text-teal">IH</span>}
                </td>
                <td className="p-3 text-xs text-muted">{l.categoria_nome || "—"}</td>
                <td className="p-3">
                  <p className="text-ink">{l.responsavel_nome}</p>
                  <p className="text-xs text-muted">@{l.responsavel_login} · {CARGO_LABELS[l.responsavel_cargo] || l.responsavel_cargo}{l.alterado_em ? " · editou depois" : ""}</p>
                </td>
                <td className="p-3 font-mono-num text-bronze font-medium">{formatarDataBR(l.data)}</td>
                <td className="p-3 text-xs text-muted">{formatarDataHora(l.alterado_em || l.criado_em)}</td>
                <td className="p-3 text-right font-mono-num font-semibold text-[#B23B2E]">{l.dias_atraso}</td>
                <td className="p-3 text-right font-mono-num">R$ {formatarMoedaSemSimbolo(l.valor_pago)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function AuditoriaRetroativosPage() {
  return (
    <AppShell>
      <Conteudo />
    </AppShell>
  );
}
