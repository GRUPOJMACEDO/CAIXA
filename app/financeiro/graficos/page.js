"use client";
import { useEffect, useMemo, useState } from "react";
import { Lock, Store, Calendar, X, Layers, TrendingUp, TrendingDown, Minus } from "lucide-react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LabelList,
} from "recharts";
import AppShell from "../../../components/AppShell";
import SeletorSuspenso from "../../../components/SeletorSuspenso";
import BotaoAtualizar from "../../../components/BotaoAtualizar";
import { supabase } from "../../../lib/supabaseClient";
import { useSessao } from "../../../lib/SessaoContext";
import { podeVerFinanceiro } from "../../../lib/permissions";
import { formatarMoedaSemSimbolo, formatarCompacto, formatarDataBR } from "../../../lib/formato";
import { hojeBrasil } from "../../../lib/fusoHorario";
import { formatarPercentual, pct, rotuloModalidade } from "../../../lib/taxasCartao";

// Paleta categórica validada (claro/escuro) — ordem fixa, cor segue a série
const PALETA = {
  claro: { azul: "#2a78d6", laranja: "#eb6834", verdeagua: "#1baf7a", amarelo: "#eda100", grade: "#e4e3df", texto: "#52514e" },
  escuro: { azul: "#3987e5", laranja: "#d95926", verdeagua: "#199e70", amarelo: "#c98500", grade: "#2c3a4c", texto: "#c3c2b7" },
};

const PRESETS = [
  { id: "3m", rotulo: "3 meses", meses: 3 },
  { id: "6m", rotulo: "6 meses", meses: 6 },
  { id: "12m", rotulo: "12 meses", meses: 12 },
  { id: "ano", rotulo: "Este ano" },
  { id: "datas", rotulo: "Período" },
];
const AGRUPAMENTOS = [
  { id: "dia", rotulo: "Dia" },
  { id: "semana", rotulo: "Semana" },
  { id: "mes", rotulo: "Mês" },
];
const MESES_ABREV = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const R$ = (v) => `R$ ${formatarMoedaSemSimbolo(v)}`;

function addDias(iso, n) {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
function addMeses(iso, n) {
  const [a, m] = iso.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1 + n, 1));
  return d.toISOString().slice(0, 10);
}
function inicioPeriodo(iso, agrup) {
  if (agrup === "mes") return iso.slice(0, 7) + "-01";
  if (agrup === "semana") {
    const d = new Date(iso + "T12:00:00");
    return addDias(iso, -d.getDay());
  }
  return iso;
}
function rotuloPeriodo(iso, agrup) {
  const [a, m, d] = iso.split("-");
  if (agrup === "mes") return `${MESES_ABREV[Number(m) - 1]}/${a.slice(2)}`;
  return `${d}/${m}`;
}
// todos os períodos do intervalo (mesmo sem lançamento), para a linha não "pular"
function listarPeriodos(inicio, fimExcl, agrup) {
  const lista = [];
  let p = inicioPeriodo(inicio, agrup);
  let guarda = 0;
  while (p < fimExcl && guarda++ < 800) {
    lista.push(p);
    p = agrup === "mes" ? addMeses(p, 1) : addDias(p, agrup === "semana" ? 7 : 1);
  }
  return lista;
}

function useModoEscuro() {
  const [escuro, setEscuro] = useState(false);
  useEffect(() => {
    function ler() {
      const v = getComputedStyle(document.documentElement).getPropertyValue("--color-panel-rgb").trim().split(/\s+/).map(Number);
      setEscuro(v.length === 3 && v[0] + v[1] + v[2] < 300);
    }
    ler();
    const obs = new MutationObserver(ler);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class", "style"] });
    return () => obs.disconnect();
  }, []);
  return escuro;
}

function DicaGrafico({ active, payload, label, formato = "moeda", mostrarTotal }) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((s, p) => s + Number(p.value || 0), 0);
  return (
    <div className="rounded-lg border border-line bg-panel shadow-lg px-3 py-2 text-xs">
      <p className="font-semibold text-ink mb-1">{payload[0]?.payload?.rotuloLongo || label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} className="flex items-center gap-2 text-ink leading-relaxed">
          <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: p.color || p.stroke || p.fill }} />
          <span className="text-muted">{p.name}:</span>
          <span className="font-mono-num ml-auto pl-3">
            {formato === "pct" ? formatarPercentual(p.value) : R$(p.value)}
            {mostrarTotal && total ? <span className="text-muted"> · {((Number(p.value) / total) * 100).toFixed(1)}%</span> : null}
          </span>
        </p>
      ))}
    </div>
  );
}

function Grafico({ titulo, subtitulo, children, altura = 280, className = "" }) {
  return (
    <div className={`card p-5 ${className}`}>
      <h2 className="font-display text-base font-semibold text-ink">{titulo}</h2>
      {subtitulo && <p className="text-xs text-muted mb-3">{subtitulo}</p>}
      <div style={{ height: altura }}>{children}</div>
    </div>
  );
}

function Gradiente({ id, cor }) {
  return (
    <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor={cor} stopOpacity={0.28} />
      <stop offset="95%" stopColor={cor} stopOpacity={0.02} />
    </linearGradient>
  );
}

function Indicador({ titulo, valor, atual, anterior, formato = "moeda", explicacao }) {
  const variacao = anterior ? ((atual - anterior) / Math.abs(anterior)) * 100 : null;
  const Icone = variacao === null || Math.abs(variacao) < 0.05 ? Minus : variacao > 0 ? TrendingUp : TrendingDown;
  return (
    <div className="card p-4" title={explicacao}>
      <p className="text-xs text-muted mb-1">{titulo}</p>
      <p className="font-mono-num text-xl font-semibold text-ink">{valor}</p>
      <p className="text-[11px] text-muted mt-1 flex items-center gap-1">
        <Icone size={12} />
        {variacao === null
          ? "sem dados no período anterior"
          : formato === "pp"
          ? `${variacao >= 0 ? "+" : ""}${(atual - anterior).toFixed(2).replace(".", ",")} p.p. vs período anterior`
          : `${variacao >= 0 ? "+" : ""}${variacao.toFixed(1).replace(".", ",")}% vs período anterior`}
      </p>
    </div>
  );
}

function Conteudo() {
  const { usuario, unidades } = useSessao();
  const permitido = podeVerFinanceiro(usuario.cargo);
  const escuro = useModoEscuro();
  const cor = escuro ? PALETA.escuro : PALETA.claro;
  const hoje = hojeBrasil();

  const [unidadesSel, setUnidadesSel] = useState([]);
  const [preset, setPreset] = useState("6m");
  const [dataDe, setDataDe] = useState(addMeses(hoje, -2));
  const [dataAte, setDataAte] = useState(hoje);
  const [agrup, setAgrup] = useState("mes");

  const [serie, setSerie] = useState([]);
  const [anterior, setAnterior] = useState(null);
  const [porUnidade, setPorUnidade] = useState([]);
  const [porModalidade, setPorModalidade] = useState([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");

  const intervalo = useMemo(() => {
    const fimExcl = preset === "datas" ? addDias(dataAte || hoje, 1) : addDias(hoje, 1);
    let inicio;
    if (preset === "datas") inicio = dataDe;
    else if (preset === "ano") inicio = `${hoje.slice(0, 4)}-01-01`;
    else inicio = addMeses(hoje.slice(0, 7) + "-01", -(PRESETS.find((p) => p.id === preset).meses - 1));
    const valido = !!inicio && inicio < fimExcl;
    // período anterior de mesmo tamanho, logo antes
    const dias = Math.round((new Date(fimExcl) - new Date(inicio)) / 86400000);
    return { inicio, fimExcl, valido, antInicio: addDias(inicio, -dias), antFimExcl: inicio };
  }, [preset, dataDe, dataAte, hoje]);

  async function carregar() {
    if (!permitido) return;
    if (unidadesSel.length === 0 || !intervalo.valido) {
      setSerie([]);
      setPorUnidade([]);
      setPorModalidade([]);
      setAnterior(null);
      return;
    }
    setCarregando(true);
    setErro("");
    const base = { unidade_ids: unidadesSel, data_inicio: intervalo.inicio, data_fim_excl: intervalo.fimExcl };
    const [rS, rA, rU, rM] = await Promise.all([
      supabase.rpc("taxas_cartao_serie", { ...base, agrupamento: agrup }),
      supabase.rpc("taxas_cartao_serie", { unidade_ids: unidadesSel, data_inicio: intervalo.antInicio, data_fim_excl: intervalo.antFimExcl, agrupamento: "mes" }),
      supabase.rpc("taxas_cartao_por_unidade", base),
      supabase.rpc("taxas_cartao_por_modalidade", base),
    ]);
    const e = rS.error || rA.error || rU.error || rM.error;
    if (e) setErro(e.message);
    setSerie(rS.data || []);
    const a = (rA.data || []).reduce((s, l) => ({ recebido: s.recebido + Number(l.valor_recebido), cartao: s.cartao + Number(l.valor_cartao), taxas: s.taxas + Number(l.valor_taxas) }), { recebido: 0, cartao: 0, taxas: 0 });
    setAnterior(a.recebido || a.taxas ? a : null);
    setPorUnidade(rU.data || []);
    setPorModalidade(rM.data || []);
    setCarregando(false);
  }

  useEffect(() => {
    carregar();
  }, [unidadesSel.join(","), intervalo.inicio, intervalo.fimExcl, agrup]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!permitido) {
    return (
      <div className="card p-8 max-w-lg text-center text-muted">
        <Lock size={22} className="mx-auto mb-2 opacity-60" />
        <p className="text-sm">Somente Administrador e Diretor podem ver os gráficos financeiros.</p>
      </div>
    );
  }

  // ---- monta os dados dos gráficos ----
  const mapa = new Map(serie.map((s) => [String(s.periodo).slice(0, 10), s]));
  const dados = intervalo.valido
    ? listarPeriodos(intervalo.inicio, intervalo.fimExcl, agrup).map((p) => {
        const s = mapa.get(p) || {};
        const n = (k) => Number(s[k] || 0);
        return {
          periodo: p,
          rotulo: rotuloPeriodo(p, agrup),
          rotuloLongo: agrup === "mes" ? rotuloPeriodo(p, agrup) : agrup === "semana" ? `Semana de ${formatarDataBR(p)}` : formatarDataBR(p),
          recebido: n("valor_recebido"),
          cartao: n("valor_cartao"),
          taxas: n("valor_taxas"),
          liquido: n("valor_recebido") - n("valor_taxas"),
          taxaMedia: Number(pct(n("valor_taxas"), n("valor_cartao")).toFixed(2)),
          debito: n("valor_debito"),
          vista: n("valor_credito_vista"),
          parcelado: n("valor_parcelado"),
          outros: n("valor_outros"),
        };
      })
    : [];
  const tot = dados.reduce((s, d) => ({ recebido: s.recebido + d.recebido, cartao: s.cartao + d.cartao, taxas: s.taxas + d.taxas }), { recebido: 0, cartao: 0, taxas: 0 });
  const unidadesOrd = porUnidade
    .map((u) => ({ nome: u.unidade_nome, taxas: Number(u.valor_taxas), pct: pct(u.valor_taxas, u.valor_cartao) }))
    .sort((a, b) => b.taxas - a.taxas);
  const modalidadesOrd = porModalidade
    .filter((m) => m.tipo_taxa)
    .map((m) => ({ nome: rotuloModalidade(m).replace("Parcelado ", ""), nomeLongo: rotuloModalidade(m), taxas: Number(m.valor_taxas), valor: Number(m.valor), ordem: m.tipo_taxa === "debito" ? 0 : Number(m.parcelas) }))
    .sort((a, b) => a.ordem - b.ordem);

  const eixo = { tick: { fontSize: 11, fill: cor.texto }, axisLine: false, tickLine: false };
  const grade = <CartesianGrid strokeDasharray="3 3" stroke={cor.grade} vertical={false} />;
  const intervaloX = dados.length > 16 ? Math.ceil(dados.length / 12) - 1 : 0;

  return (
    <div className="max-w-6xl">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted mb-1">Financeiro</p>
          <h1 className="font-display text-2xl font-semibold text-ink">Gráficos</h1>
          <p className="text-sm text-muted mt-1">Evolução do recebido, das taxas da operadora e do mix de pagamento.</p>
        </div>
        <BotaoAtualizar aoAtualizar={carregar} className="shrink-0 print:hidden" />
      </div>

      {/* ---------- filtros (uma linha, acima de todos os gráficos) ---------- */}
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
            <button type="button" className="btn inline-flex items-center gap-1.5 py-2" onClick={() => setUnidadesSel([])}>
              <X size={14} /> Limpar
            </button>
          )}
        </div>
        <div>
          <p className="text-[11px] font-semibold text-muted uppercase tracking-wide mb-1.5 flex items-center gap-1"><Calendar size={11} /> Período</p>
          <div className="flex gap-1.5">
            {PRESETS.map((p) => (
              <button key={p.id} onClick={() => setPreset(p.id)} className={`px-3 py-1.5 rounded-full text-sm transition ${preset === p.id ? "bg-gold text-white font-medium" : "bg-white border border-line text-muted hover:border-gold/50"}`}>
                {p.rotulo}
              </button>
            ))}
          </div>
        </div>
        {preset === "datas" && (
          <div className="flex items-center gap-2">
            <input type="date" className="field-input" value={dataDe} max={dataAte || undefined} onChange={(e) => setDataDe(e.target.value)} />
            <span className="text-sm text-muted">até</span>
            <input type="date" className="field-input" value={dataAte} min={dataDe || undefined} onChange={(e) => setDataAte(e.target.value)} />
          </div>
        )}
        <div>
          <p className="text-[11px] font-semibold text-muted uppercase tracking-wide mb-1.5 flex items-center gap-1"><Layers size={11} /> Agrupar por</p>
          <div className="flex gap-1.5">
            {AGRUPAMENTOS.map((a) => (
              <button key={a.id} onClick={() => setAgrup(a.id)} className={`px-3 py-1.5 rounded-full text-sm transition ${agrup === a.id ? "bg-teal text-white font-medium" : "bg-white border border-line text-muted hover:border-teal/50"}`}>
                {a.rotulo}
              </button>
            ))}
          </div>
        </div>
      </div>

      {unidadesSel.length === 0 ? (
        <div className="card py-16 text-center">
          <Store size={26} className="mx-auto mb-2 text-muted opacity-60" />
          <p className="text-sm text-muted">Selecione uma ou mais unidades no filtro acima para ver os gráficos.</p>
        </div>
      ) : !intervalo.valido ? (
        <div className="card py-10 text-center text-sm text-muted">A data inicial precisa ser anterior (ou igual) à data final.</div>
      ) : (
        <>
          {erro && <div className="mb-4 rounded-lg px-4 py-2.5 text-sm bg-[#B23B2E]/10 text-[#B23B2E]">Erro ao buscar: {erro}</div>}

          <div className="grid grid-cols-4 gap-3 mb-5">
            <Indicador titulo="Total recebido" valor={R$(tot.recebido)} atual={tot.recebido} anterior={anterior?.recebido} explicacao="Soma do valor pago no período, comparada com o período anterior de mesmo tamanho." />
            <Indicador titulo="Taxas da operadora" valor={R$(tot.taxas)} atual={tot.taxas} anterior={anterior?.taxas} explicacao="Soma das taxas estimadas no período, comparada com o período anterior de mesmo tamanho." />
            <Indicador
              titulo="Taxa média sobre cartão"
              valor={formatarPercentual(pct(tot.taxas, tot.cartao))}
              atual={pct(tot.taxas, tot.cartao)}
              anterior={anterior ? pct(anterior.taxas, anterior.cartao) : null}
              formato="pp"
              explicacao="Taxas ÷ recebido em cartão × 100. A variação é em pontos percentuais (p.p.)."
            />
            <Indicador
              titulo="Participação do cartão"
              valor={formatarPercentual(pct(tot.cartao, tot.recebido), 1)}
              atual={pct(tot.cartao, tot.recebido)}
              anterior={anterior ? pct(anterior.cartao, anterior.recebido) : null}
              formato="pp"
              explicacao="Recebido em cartão ÷ total recebido × 100. Quanto maior, mais o faturamento depende de cartão (e paga taxa)."
            />
          </div>

          {carregando ? (
            <div className="card py-16 text-center text-sm text-muted">Carregando…</div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <Grafico titulo="Recebido x Líquido" subtitulo="Total recebido, quanto entrou em cartão e o que sobra depois das taxas" altura={300} className="col-span-2">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={dados} margin={{ top: 10, right: 16, left: 4, bottom: 0 }}>
                    <defs>
                      <Gradiente id="gRecebido" cor={cor.azul} />
                      <Gradiente id="gCartao" cor={cor.amarelo} />
                      <Gradiente id="gLiquido" cor={cor.verdeagua} />
                    </defs>
                    {grade}
                    <XAxis dataKey="rotulo" {...eixo} interval={intervaloX} />
                    <YAxis {...eixo} width={56} tickFormatter={(v) => formatarCompacto(v)} />
                    <Tooltip content={<DicaGrafico />} cursor={{ stroke: cor.texto, strokeDasharray: "3 3" }} />
                    <Legend iconType="plainline" wrapperStyle={{ fontSize: 12 }} />
                    <Area type="monotone" dataKey="recebido" name="Total recebido" stroke={cor.azul} strokeWidth={2} fill="url(#gRecebido)" dot={false} activeDot={{ r: 4 }} />
                    <Area type="monotone" dataKey="liquido" name="Líquido" stroke={cor.verdeagua} strokeWidth={2} fill="url(#gLiquido)" dot={false} activeDot={{ r: 4 }} />
                    <Area type="monotone" dataKey="cartao" name="Recebido em cartão" stroke={cor.amarelo} strokeWidth={2} fill="url(#gCartao)" dot={false} activeDot={{ r: 4 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </Grafico>

              <Grafico titulo="Taxas da operadora (R$)" subtitulo="Valor descontado pela operadora em cada período">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={dados} margin={{ top: 18, right: 16, left: 4, bottom: 0 }}>
                    <defs><Gradiente id="gTaxas" cor={cor.laranja} /></defs>
                    {grade}
                    <XAxis dataKey="rotulo" {...eixo} interval={intervaloX} />
                    <YAxis {...eixo} width={56} tickFormatter={(v) => formatarCompacto(v)} />
                    <Tooltip content={<DicaGrafico />} cursor={{ stroke: cor.texto, strokeDasharray: "3 3" }} />
                    <Area type="monotone" dataKey="taxas" name="Taxas" stroke={cor.laranja} strokeWidth={2} fill="url(#gTaxas)" dot={dados.length <= 14 ? { r: 3, strokeWidth: 0, fill: cor.laranja } : false} activeDot={{ r: 4 }}>
                      {dados.length <= 12 && <LabelList dataKey="taxas" position="top" fontSize={10} fill={cor.texto} formatter={(v) => (v ? formatarCompacto(v) : "")} />}
                    </Area>
                  </AreaChart>
                </ResponsiveContainer>
              </Grafico>

              <Grafico titulo="Taxa média sobre o cartão (%)" subtitulo="Taxas ÷ recebido em cartão — sobe quando cresce o parcelado">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={dados} margin={{ top: 18, right: 16, left: 4, bottom: 0 }}>
                    <defs><Gradiente id="gMedia" cor={cor.azul} /></defs>
                    {grade}
                    <XAxis dataKey="rotulo" {...eixo} interval={intervaloX} />
                    <YAxis {...eixo} width={48} tickFormatter={(v) => `${Number(v).toFixed(1)}%`} domain={[0, "auto"]} />
                    <Tooltip content={<DicaGrafico formato="pct" />} cursor={{ stroke: cor.texto, strokeDasharray: "3 3" }} />
                    <Area type="monotone" dataKey="taxaMedia" name="Taxa média" stroke={cor.azul} strokeWidth={2} fill="url(#gMedia)" dot={dados.length <= 14 ? { r: 3, strokeWidth: 0, fill: cor.azul } : false} activeDot={{ r: 4 }}>
                      {dados.length <= 12 && <LabelList dataKey="taxaMedia" position="top" fontSize={10} fill={cor.texto} formatter={(v) => (v ? `${Number(v).toFixed(2).replace(".", ",")}%` : "")} />}
                    </Area>
                  </AreaChart>
                </ResponsiveContainer>
              </Grafico>

              <Grafico titulo="Composição do recebido" subtitulo="Participação de cada forma no total de cada período (100%)" altura={300} className="col-span-2">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={dados} stackOffset="expand" margin={{ top: 10, right: 16, left: 4, bottom: 0 }}>
                    {grade}
                    <XAxis dataKey="rotulo" {...eixo} interval={intervaloX} />
                    <YAxis {...eixo} width={44} tickFormatter={(v) => `${Math.round(v * 100)}%`} />
                    <Tooltip content={<DicaGrafico mostrarTotal />} cursor={{ stroke: cor.texto, strokeDasharray: "3 3" }} />
                    <Legend iconType="square" wrapperStyle={{ fontSize: 12 }} />
                    <Area type="monotone" dataKey="debito" name="Débito" stackId="1" stroke={cor.azul} strokeWidth={1.5} fill={cor.azul} fillOpacity={0.55} />
                    <Area type="monotone" dataKey="vista" name="Crédito à vista" stackId="1" stroke={cor.laranja} strokeWidth={1.5} fill={cor.laranja} fillOpacity={0.55} />
                    <Area type="monotone" dataKey="parcelado" name="Parcelado (2x a 12x)" stackId="1" stroke={cor.verdeagua} strokeWidth={1.5} fill={cor.verdeagua} fillOpacity={0.55} />
                    <Area type="monotone" dataKey="outros" name="PIX / Dinheiro / Boleto" stackId="1" stroke={cor.amarelo} strokeWidth={1.5} fill={cor.amarelo} fillOpacity={0.55} />
                  </AreaChart>
                </ResponsiveContainer>
              </Grafico>

              <Grafico titulo="Taxas por unidade" subtitulo="Quem mais paga taxa no período (R$)" altura={Math.max(220, unidadesOrd.length * 30 + 30)}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={unidadesOrd} layout="vertical" margin={{ top: 0, right: 64, left: 0, bottom: 0 }} barCategoryGap={6}>
                    <XAxis type="number" hide />
                    <YAxis type="category" dataKey="nome" {...eixo} width={170} />
                    <Tooltip
                      cursor={{ fill: cor.grade, opacity: 0.4 }}
                      content={({ active, payload }) =>
                        active && payload?.length ? (
                          <div className="rounded-lg border border-line bg-panel shadow-lg px-3 py-2 text-xs">
                            <p className="font-semibold text-ink">{payload[0].payload.nome}</p>
                            <p className="text-ink">Taxas: <span className="font-mono-num">{R$(payload[0].payload.taxas)}</span></p>
                            <p className="text-muted">{formatarPercentual(payload[0].payload.pct)} sobre o cartão</p>
                          </div>
                        ) : null
                      }
                    />
                    <Bar dataKey="taxas" name="Taxas" fill={cor.laranja} radius={[0, 4, 4, 0]} maxBarSize={18}>
                      <LabelList dataKey="taxas" position="right" fontSize={10} fill={cor.texto} formatter={(v) => formatarCompacto(v)} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </Grafico>

              <Grafico titulo="Taxas por modalidade" subtitulo="Débito, crédito à vista e cada parcelamento (R$)" altura={Math.max(220, unidadesOrd.length * 30 + 30)}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={modalidadesOrd} margin={{ top: 18, right: 8, left: 4, bottom: 0 }} barCategoryGap={4}>
                    {grade}
                    <XAxis dataKey="nome" {...eixo} />
                    <YAxis {...eixo} width={56} tickFormatter={(v) => formatarCompacto(v)} />
                    <Tooltip
                      cursor={{ fill: cor.grade, opacity: 0.4 }}
                      content={({ active, payload }) =>
                        active && payload?.length ? (
                          <div className="rounded-lg border border-line bg-panel shadow-lg px-3 py-2 text-xs">
                            <p className="font-semibold text-ink">{payload[0].payload.nomeLongo}</p>
                            <p className="text-ink">Recebido: <span className="font-mono-num">{R$(payload[0].payload.valor)}</span></p>
                            <p className="text-ink">Taxas: <span className="font-mono-num">{R$(payload[0].payload.taxas)}</span></p>
                          </div>
                        ) : null
                      }
                    />
                    <Bar dataKey="taxas" name="Taxas" fill={cor.laranja} radius={[4, 4, 0, 0]} maxBarSize={28}>
                      <LabelList dataKey="taxas" position="top" fontSize={10} fill={cor.texto} formatter={(v) => (v ? formatarCompacto(v) : "")} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </Grafico>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function GraficosFinanceiroPage() {
  return (
    <AppShell>
      <Conteudo />
    </AppShell>
  );
}
