"use client";
import { useEffect, useState } from "react";
import { BarChart3, Building2, Tag, CalendarRange, CalendarCheck2, Eraser } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, LabelList } from "recharts";
import AppShell from "../../../components/AppShell";
import BotaoAtualizar from "../../../components/BotaoAtualizar";
import { supabase } from "../../../lib/supabaseClient";
import { useSessao } from "../../../lib/SessaoContext";
import { formatarMoedaSemSimbolo } from "../../../lib/formato";
import { listaMesesRecentes } from "../../../lib/fusoHorario";

// 0=domingo .. 6=sábado (mesma convenção do extract(dow) do Postgres),
// mas exibidos começando na segunda, do jeito que a gente lê a semana
const DIAS_SEMANA_ORDEM = [
  { dow: 1, nome: "Segunda" },
  { dow: 2, nome: "Terça" },
  { dow: 3, nome: "Quarta" },
  { dow: 4, nome: "Quinta" },
  { dow: 5, nome: "Sexta" },
  { dow: 6, nome: "Sábado" },
  { dow: 0, nome: "Domingo" },
];
const NOMES_DIA_CURTO = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const PALETA_UNIDADES = ["#2670B5", "#3F8A5C", "#9C5A34", "#7C56B5", "#0E7A72", "#B8862E", "#C9752E", "#4C94D6", "#B23B2E", "#5B6B84"];

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

function formatarDataCurta(dataIso) {
  const [, mes, dia] = dataIso.split("-");
  return `${dia}/${mes}`;
}

/** Rótulo customizado acima de cada barra: (quantidade) e o valor em R$, em destaque. */
function RotuloBarra({ x, y, width, value, index, chaveValor, dados }) {
  if (!value) return null;
  const valor = dados[index]?.[chaveValor] || 0;
  return (
    <g>
      <text x={x + width / 2} y={y - 22} textAnchor="middle" fontSize={15} fontWeight={800} fill="#1B3A5C">
        ({value})
      </text>
      <text x={x + width / 2} y={y - 7} textAnchor="middle" fontSize={12} fontWeight={600} fill="#3F8A5C">
        R$ {formatarMoedaSemSimbolo(valor)}
      </text>
    </g>
  );
}

function Conteudo() {
  const { unidades, marcasDisponiveis } = useSessao();
  const mesesAsc = [...listaMesesRecentes(18)].reverse(); // cronológico crescente, pro controle deslizante

  const [unidadesSelecionadas, setUnidadesSelecionadas] = useState([]);
  const [marcasSelecionadas, setMarcasSelecionadas] = useState([]);
  const [diasSemanaSelecionados, setDiasSemanaSelecionados] = useState([]);
  const [mesAtivo, setMesAtivo] = useState(false);
  const [idxMesInicio, setIdxMesInicio] = useState(mesesAsc.length - 1);
  const [idxMesFim, setIdxMesFim] = useState(mesesAsc.length - 1);
  const [dados, setDados] = useState([]);
  const [carregando, setCarregando] = useState(false);

  const mesesSelecionados = mesAtivo
    ? mesesAsc.slice(Math.min(idxMesInicio, idxMesFim), Math.max(idxMesInicio, idxMesFim) + 1).map((m) => m.valor)
    : [];

  function limparSelecao() {
    setUnidadesSelecionadas([]);
    setMarcasSelecionadas([]);
    setDiasSemanaSelecionados([]);
    setMesAtivo(false);
    setIdxMesInicio(mesesAsc.length - 1);
    setIdxMesFim(mesesAsc.length - 1);
    setDados([]);
  }

  function aoMoverMes(tipo, valor) {
    setMesAtivo(true);
    if (tipo === "inicio") setIdxMesInicio(valor);
    else setIdxMesFim(valor);
  }

  async function carregar() {
    if (mesesSelecionados.length === 0 || diasSemanaSelecionados.length === 0) {
      setDados([]);
      return;
    }
    setCarregando(true);

    const idsPorMarca = new Set();
    marcasSelecionadas.forEach((m) => unidades.filter((u) => u.nome.startsWith(m)).forEach((u) => idsPorMarca.add(u.id)));
    const idsEfetivos = new Set([...unidadesSelecionadas, ...idsPorMarca]);
    const unidadeIdsParam = idsEfetivos.size > 0 ? [...idsEfetivos] : null;

    const { data, error } = await supabase.rpc("relatorio_pareto_por_data", {
      meses: mesesSelecionados,
      dias_semana: diasSemanaSelecionados.map(Number),
      unidade_ids: unidadeIdsParam,
    });
    if (error) console.error("Erro no relatório Pareto:", error.message);
    setDados(data || []);
    setCarregando(false);
  }

  useEffect(() => {
    carregar();
  }, [unidadesSelecionadas, marcasSelecionadas, mesesSelecionados.join(","), diasSemanaSelecionados]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- monta os dados do gráfico: uma entrada por data, com qtd/valor por unidade ---
  const datasUnicas = [...new Set(dados.map((d) => d.dia))].sort();
  const unidadesNoResultado = [...new Map(dados.map((d) => [d.unidade_id, d.unidade_nome])).entries()];
  const dadosGrafico = datasUnicas.map((dia) => {
    const dow = new Date(dia + "T12:00:00").getDay();
    const obj = { dia, rotulo: `${NOMES_DIA_CURTO[dow]} ${formatarDataCurta(dia)}` };
    unidadesNoResultado.forEach(([id]) => {
      const linha = dados.find((d) => d.dia === dia && d.unidade_id === id);
      obj[`qtd_${id}`] = linha ? Number(linha.qtd) : 0;
      obj[`valor_${id}`] = linha ? Number(linha.valor_total) : 0;
    });
    return obj;
  });

  const totalQtd = dados.reduce((s, d) => s + Number(d.qtd), 0);
  const totalValor = dados.reduce((s, d) => s + Number(d.valor_total), 0);
  const nomeUnidadeUnica = unidadesNoResultado.length === 1 ? unidadesNoResultado[0][1] : null;

  return (
    <div className="max-w-6xl">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wider text-muted mb-1">Operação</p>
          <h1 className="font-display text-2xl font-semibold text-ink flex items-center gap-2">
            <BarChart3 size={22} className="text-[#B8862E]" /> Pareto
          </h1>
          <p className="text-sm text-muted mt-1">Compare o volume e os valores recebidos entre as ocorrências do(s) dia(s) da semana escolhido(s).</p>
        </div>
        <BotaoAtualizar aoAtualizar={carregar} />
      </div>

      {/* Filtros — tudo numa linha só */}
      <div className="card p-4 mb-5">
        <div className="flex items-end gap-4 flex-wrap">
          <div className="min-w-[220px] flex-1">
            <p className="text-[11px] font-semibold text-muted uppercase tracking-wide mb-1.5 flex items-center gap-1"><Building2 size={11} /> Unidades</p>
            <select
              multiple
              size={5}
              className="field-input text-sm w-full"
              value={unidadesSelecionadas}
              onChange={(e) => setUnidadesSelecionadas([...e.target.selectedOptions].map((o) => o.value))}
            >
              {unidades.map((u) => (
                <option key={u.id} value={u.id}>{u.nome}</option>
              ))}
            </select>
            <p className="text-[10px] text-muted mt-1">Clique segurando Shift ou Ctrl pra marcar várias.</p>
          </div>

          {marcasDisponiveis.length > 1 && (
            <div className="min-w-[100px]">
              <p className="text-[11px] font-semibold text-muted uppercase tracking-wide mb-1.5 flex items-center gap-1"><Tag size={11} /> Marca</p>
              <select
                multiple
                size={5}
                className="field-input text-sm w-full"
                value={marcasSelecionadas}
                onChange={(e) => setMarcasSelecionadas([...e.target.selectedOptions].map((o) => o.value))}
              >
                {marcasDisponiveis.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
          )}

          <div className="min-w-[220px]">
            <p className="text-[11px] font-semibold text-muted uppercase tracking-wide mb-1.5 flex items-center gap-1"><CalendarRange size={11} /> Mês (de / até)</p>
            <div className="bg-canvas rounded-lg border border-line px-3 py-2.5 w-full">
              <p className="text-xs font-mono-num text-center text-ink font-medium mb-1.5">
                {mesAtivo ? `${mesesAsc[Math.min(idxMesInicio, idxMesFim)].rotulo} até ${mesesAsc[Math.max(idxMesInicio, idxMesFim)].rotulo}` : "Nenhum mês selecionado"}
              </p>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-muted w-6">De</span>
                <input
                  type="range"
                  min={0}
                  max={mesesAsc.length - 1}
                  value={idxMesInicio}
                  onChange={(e) => aoMoverMes("inicio", Number(e.target.value))}
                  className="w-full accent-[#B8862E]"
                />
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[10px] text-muted w-6">Até</span>
                <input
                  type="range"
                  min={0}
                  max={mesesAsc.length - 1}
                  value={idxMesFim}
                  onChange={(e) => aoMoverMes("fim", Number(e.target.value))}
                  className="w-full accent-[#B8862E]"
                />
              </div>
            </div>
          </div>

          <div className="min-w-[130px]">
            <p className="text-[11px] font-semibold text-muted uppercase tracking-wide mb-1.5 flex items-center gap-1"><CalendarCheck2 size={11} /> Dia da semana</p>
            <select
              multiple
              size={5}
              className="field-input text-sm w-full"
              value={diasSemanaSelecionados}
              onChange={(e) => setDiasSemanaSelecionados([...e.target.selectedOptions].map((o) => o.value))}
            >
              {DIAS_SEMANA_ORDEM.map((d) => (
                <option key={d.dow} value={d.dow}>{d.nome}</option>
              ))}
            </select>
          </div>

          <button onClick={limparSelecao} className="btn flex items-center gap-1.5 text-sm h-9">
            <Eraser size={14} /> Limpar seleção
          </button>
        </div>
      </div>

      {/* Resumo */}
      {dados.length > 0 && (
        <div className="flex items-center gap-6 mb-4 text-sm">
          <p className="text-muted">
            <span className="font-mono-num font-semibold text-ink">{totalQtd}</span> lançamento(s) no total
          </p>
          <p className="text-muted">
            <span className="font-mono-num font-semibold text-ink">R$ {formatarMoedaSemSimbolo(totalValor)}</span> recebido no total
          </p>
        </div>
      )}

      {/* Gráfico */}
      <div className="card p-5">
        {nomeUnidadeUnica && (
          <p className="text-sm font-semibold text-ink mb-3 flex items-center gap-1.5"><Building2 size={14} className="text-[#2670B5]" /> {nomeUnidadeUnica}</p>
        )}
        {mesesSelecionados.length === 0 || diasSemanaSelecionados.length === 0 ? (
          <p className="text-sm text-muted py-16 text-center">Selecione ao menos um mês e um dia da semana pra ver o gráfico.</p>
        ) : carregando ? (
          <p className="text-sm text-muted py-16 text-center">Carregando…</p>
        ) : dadosGrafico.length === 0 ? (
          <p className="text-sm text-muted py-16 text-center">Nenhum lançamento encontrado para esses filtros.</p>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(380, 70 + unidadesNoResultado.length * 4)}>
            <BarChart data={dadosGrafico} margin={{ top: 44, right: 20, left: 0, bottom: 8 }} barGap={4}>
              <defs>
                {unidadesNoResultado.map(([id], i) => {
                  const cor = PALETA_UNIDADES[i % PALETA_UNIDADES.length];
                  return (
                    <linearGradient key={id} id={`grad-pareto-${id}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={clarear(cor, 0.55)} />
                      <stop offset="45%" stopColor={cor} />
                      <stop offset="100%" stopColor={escurecer(cor, 0.28)} />
                    </linearGradient>
                  );
                })}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#E4E7EC" />
              <XAxis dataKey="rotulo" tick={{ fontSize: 12, fontWeight: 700, fill: "#1B3A5C" }} />
              <YAxis tick={{ fontSize: 11, fill: "#6B6D76" }} width={36} allowDecimals={false} />
              <Tooltip formatter={(v, nome) => [v, nome]} />
              {unidadesNoResultado.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
              {unidadesNoResultado.map(([id, nome], i) => (
                <Bar key={id} dataKey={`qtd_${id}`} name={nome} fill={`url(#grad-pareto-${id})`} radius={[6, 6, 0, 0]} maxBarSize={58}>
                  <LabelList
                    dataKey={`qtd_${id}`}
                    content={(props) => <RotuloBarra {...props} chaveValor={`valor_${id}`} dados={dadosGrafico} />}
                  />
                </Bar>
              ))}
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

export default function ParetoPage() {
  return (
    <AppShell>
      <Conteudo />
    </AppShell>
  );
}
