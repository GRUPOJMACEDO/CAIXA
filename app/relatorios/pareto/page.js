"use client";
import { useEffect, useState } from "react";
import { BarChart3, Building2, Tag, Calendar, CalendarCheck2 } from "lucide-react";
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

function formatarDataCurta(dataIso) {
  const [, mes, dia] = dataIso.split("-");
  return `${dia}/${mes}`;
}

/** Rótulo customizado acima de cada barra: (quantidade) e o valor em R$. */
function RotuloBarra({ x, y, width, value, index, chaveValor, dados }) {
  if (!value) return null;
  const valor = dados[index]?.[chaveValor] || 0;
  return (
    <g>
      <text x={x + width / 2} y={y - 16} textAnchor="middle" fontSize={10} fontWeight={700} fill="#1B3A5C">
        ({value})
      </text>
      <text x={x + width / 2} y={y - 4} textAnchor="middle" fontSize={9} fill="#6B6D76">
        R$ {formatarMoedaSemSimbolo(valor)}
      </text>
    </g>
  );
}

function Conteudo() {
  const { unidades, marcasDisponiveis } = useSessao();
  const mesesLista = listaMesesRecentes(18);

  const [unidadesSelecionadas, setUnidadesSelecionadas] = useState(new Set());
  const [marcasSelecionadas, setMarcasSelecionadas] = useState(new Set());
  const [mesesSelecionados, setMesesSelecionados] = useState(new Set([mesesLista[0].valor]));
  const [diasSemanaSelecionados, setDiasSemanaSelecionados] = useState(new Set([1, 2, 3, 4, 5, 6, 0]));
  const [dados, setDados] = useState([]);
  const [carregando, setCarregando] = useState(false);

  function alternar(conjuntoSet, setConjunto, valor) {
    setConjunto((atual) => {
      const novo = new Set(atual);
      if (novo.has(valor)) novo.delete(valor);
      else novo.add(valor);
      return novo;
    });
  }

  async function carregar() {
    if (mesesSelecionados.size === 0 || diasSemanaSelecionados.size === 0) {
      setDados([]);
      return;
    }
    setCarregando(true);

    const idsPorMarca = new Set();
    marcasSelecionadas.forEach((m) => unidades.filter((u) => u.nome.startsWith(m)).forEach((u) => idsPorMarca.add(u.id)));
    const idsEfetivos = new Set([...unidadesSelecionadas, ...idsPorMarca]);
    const unidadeIdsParam = idsEfetivos.size > 0 ? [...idsEfetivos] : null;

    const { data, error } = await supabase.rpc("relatorio_pareto_por_data", {
      meses: [...mesesSelecionados],
      dias_semana: [...diasSemanaSelecionados],
      unidade_ids: unidadeIdsParam,
    });
    if (error) console.error("Erro no relatório Pareto:", error.message);
    setDados(data || []);
    setCarregando(false);
  }

  useEffect(() => {
    carregar();
  }, [unidadesSelecionadas, marcasSelecionadas, mesesSelecionados, diasSemanaSelecionados]); // eslint-disable-line react-hooks/exhaustive-deps

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

  return (
    <div className="max-w-6xl">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wider text-muted mb-1">Operação</p>
          <h1 className="font-display text-2xl font-semibold text-ink flex items-center gap-2">
            <BarChart3 size={22} className="text-[#B8862E]" /> Pareto
          </h1>
          <p className="text-sm text-muted mt-1">Compare o volume e os valores recebidos entre as ocorrências do(s) dia(s) da semana escolhido(s).</p>
        </div>
        <BotaoAtualizar aoAtualizar={carregar} />
      </div>

      {/* Filtros */}
      <div className="card p-5 mb-6 space-y-4">
        <div>
          <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <Building2 size={12} /> Unidades <span className="normal-case font-normal text-muted/70">(nenhuma marcada = todas)</span>
          </p>
          <div className="grid grid-cols-4 gap-1.5">
            {unidades.map((u) => (
              <label key={u.id} className={`checkbox-tile text-xs py-1.5 ${unidadesSelecionadas.has(u.id) ? "is-checked" : ""}`}>
                <input type="checkbox" className="sr-only" checked={unidadesSelecionadas.has(u.id)} onChange={() => alternar(unidadesSelecionadas, setUnidadesSelecionadas, u.id)} />
                {u.nome}
              </label>
            ))}
          </div>
        </div>

        {marcasDisponiveis.length > 1 && (
          <div>
            <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <Tag size={12} /> Marca <span className="normal-case font-normal text-muted/70">(atalho — inclui todas as unidades dela)</span>
            </p>
            <div className="flex flex-wrap gap-1.5">
              {marcasDisponiveis.map((m) => (
                <label key={m} className={`checkbox-tile text-xs py-1.5 px-3 ${marcasSelecionadas.has(m) ? "is-checked" : ""}`}>
                  <input type="checkbox" className="sr-only" checked={marcasSelecionadas.has(m)} onChange={() => alternar(marcasSelecionadas, setMarcasSelecionadas, m)} />
                  {m}
                </label>
              ))}
            </div>
          </div>
        )}

        <div>
          <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <Calendar size={12} /> Mês
          </p>
          <div className="flex flex-wrap gap-1.5">
            {mesesLista.map((m) => (
              <label key={m.valor} className={`checkbox-tile text-xs py-1.5 px-3 ${mesesSelecionados.has(m.valor) ? "is-checked" : ""}`}>
                <input type="checkbox" className="sr-only" checked={mesesSelecionados.has(m.valor)} onChange={() => alternar(mesesSelecionados, setMesesSelecionados, m.valor)} />
                {m.rotulo}
              </label>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <CalendarCheck2 size={12} /> Dia da semana
          </p>
          <div className="flex flex-wrap gap-1.5">
            {DIAS_SEMANA_ORDEM.map((d) => (
              <label key={d.dow} className={`checkbox-tile text-xs py-1.5 px-3 ${diasSemanaSelecionados.has(d.dow) ? "is-checked" : ""}`}>
                <input type="checkbox" className="sr-only" checked={diasSemanaSelecionados.has(d.dow)} onChange={() => alternar(diasSemanaSelecionados, setDiasSemanaSelecionados, d.dow)} />
                {d.nome}
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* Resumo */}
      <div className="flex items-center gap-6 mb-4 text-sm">
        <p className="text-muted">
          <span className="font-mono-num font-semibold text-ink">{totalQtd}</span> lançamento(s) no total
        </p>
        <p className="text-muted">
          <span className="font-mono-num font-semibold text-ink">R$ {formatarMoedaSemSimbolo(totalValor)}</span> recebido no total
        </p>
      </div>

      {/* Gráfico */}
      <div className="card p-5">
        {mesesSelecionados.size === 0 || diasSemanaSelecionados.size === 0 ? (
          <p className="text-sm text-muted py-16 text-center">Selecione ao menos um mês e um dia da semana.</p>
        ) : carregando ? (
          <p className="text-sm text-muted py-16 text-center">Carregando…</p>
        ) : dadosGrafico.length === 0 ? (
          <p className="text-sm text-muted py-16 text-center">Nenhum lançamento encontrado para esses filtros.</p>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(340, 60 + unidadesNoResultado.length * 4)}>
            <BarChart data={dadosGrafico} margin={{ top: 30, right: 20, left: 0, bottom: 0 }} barGap={4}>
              <defs>
                {unidadesNoResultado.map(([id], i) => {
                  const cor = PALETA_UNIDADES[i % PALETA_UNIDADES.length];
                  return (
                    <linearGradient key={id} id={`grad-pareto-${id}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={clarear(cor, 0.35)} />
                      <stop offset="100%" stopColor={cor} />
                    </linearGradient>
                  );
                })}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#E4E7EC" />
              <XAxis dataKey="rotulo" tick={{ fontSize: 11, fill: "#6B6D76" }} />
              <YAxis tick={{ fontSize: 11, fill: "#6B6D76" }} width={36} allowDecimals={false} />
              <Tooltip formatter={(v, nome) => [v, nome]} />
              {unidadesNoResultado.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
              {unidadesNoResultado.map(([id, nome], i) => (
                <Bar key={id} dataKey={`qtd_${id}`} name={nome} fill={`url(#grad-pareto-${id})`} radius={[5, 5, 0, 0]} maxBarSize={54}>
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
