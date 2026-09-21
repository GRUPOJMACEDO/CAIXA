"use client";
import { useEffect, useState } from "react";
import { Wallet, Hash, Lock, Store, FileSpreadsheet, HardHat } from "lucide-react";
import AppShell from "../../../components/AppShell";
import Modal from "../../../components/Modal";
import BotaoAtualizar from "../../../components/BotaoAtualizar";
import BotaoAcao3D from "../../../components/BotaoAcao3D";
import { supabase } from "../../../lib/supabaseClient";
import { useSessao } from "../../../lib/SessaoContext";
import { CARGOS } from "../../../lib/permissions";
import { formatarMoedaSemSimbolo, formatarDataBR } from "../../../lib/formato";
import { listaSemanasRecentes, listaMesesRecentes } from "../../../lib/fusoHorario";

function inicioMes() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

function diaSeguinte(dataIso) {
  const d = new Date(dataIso + "T12:00:00");
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

const MEDALHA = ["text-gold", "text-prata", "text-bronze"];
const CARGOS_GESTAO = [CARGOS.SUPERVISAO, CARGOS.GERENCIA, CARGOS.ADM, CARGOS.ADMINISTRADOR, CARGOS.DIRETOR];

function ConteudoTecnicos() {
  const { usuario, unidades } = useSessao();
  const semanas = listaSemanasRecentes(16);
  const meses = listaMesesRecentes(18);
  const [tipoPeriodo, setTipoPeriodo] = useState("mes"); // "semana" | "mes"
  const [semanaSelecionada, setSemanaSelecionada] = useState(semanas[0].valor);
  const [mesSelecionado, setMesSelecionado] = useState(meses[0].valor);
  const [linhas, setLinhas] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [detalhe, setDetalhe] = useState(null);
  const [lancamentosDetalhe, setLancamentosDetalhe] = useState([]);
  const [carregandoDetalhe, setCarregandoDetalhe] = useState(false);
  const [unidadeFiltro, setUnidadeFiltro] = useState("");

  const idsAutorizados = new Set(unidades.map((u) => u.id));

  const intervalo =
    tipoPeriodo === "semana"
      ? (() => {
          const s = semanas.find((s) => s.valor === semanaSelecionada) || semanas[0];
          return { inicio: s.inicio, fimExcl: diaSeguinte(s.fim), rotulo: `Semana ${s.rotulo}` };
        })()
      : (() => {
          const m = meses.find((m) => m.valor === mesSelecionado) || meses[0];
          return { inicio: m.inicio, fimExcl: m.fimExclusivo, rotulo: m.rotulo };
        })();

  async function carregar() {
    setCarregando(true);
    const { data } = await supabase.rpc("tecnicos_por_periodo", {
      data_inicio: intervalo.inicio,
      data_fim_excl: intervalo.fimExcl,
    });
    const lista = (data || []).sort((a, b) => Number(b.valor_pago) - Number(a.valor_pago));
    setLinhas(lista);
    setCarregando(false);
  }

  useEffect(() => {
    carregar();
  }, [tipoPeriodo, semanaSelecionada, mesSelecionado]); // eslint-disable-line react-hooks/exhaustive-deps

  const mapaUnidades = new Map();
  linhas.forEach((l) => mapaUnidades.set(l.unidade_id, l.unidade_nome));
  const unidadesDisponiveis = [...mapaUnidades.entries()]
    .map(([id, nome]) => ({ id, nome }))
    .sort((a, b) => a.nome.localeCompare(b.nome));

  const linhasFiltradas = unidadeFiltro ? linhas.filter((l) => l.unidade_id === unidadeFiltro) : linhas;

  const totalPago = linhasFiltradas.reduce((s, l) => s + Number(l.valor_pago), 0);
  const totalQtdOs = linhasFiltradas.reduce((s, l) => s + Number(l.qtd_os), 0);
  const tecnicosUnicos = new Set(linhasFiltradas.map((l) => l.tecnico_id)).size;

  function podeVerDetalhe(linha) {
    return CARGOS_GESTAO.includes(usuario.cargo) && idsAutorizados.has(linha.unidade_id);
  }

  async function abrirDetalhe(linha) {
    setDetalhe({ titulo: linha.tecnico_nome, unidadeId: linha.unidade_id, tecnicoId: linha.tecnico_id, categoriaId: linha.categoria_id });
    if (!podeVerDetalhe(linha)) return;
    setCarregandoDetalhe(true);
    let query = supabase
      .from("lancamentos")
      .select("id, data, numero_os, valor_pago, tipos_servico(nome)")
      .eq("unidade_id", linha.unidade_id)
      .eq("tecnico_id", linha.tecnico_id)
      .eq("linha", "ih")
      .gte("data", intervalo.inicio)
      .lt("data", intervalo.fimExcl)
      .order("data", { ascending: false });
    if (linha.categoria_id) query = query.eq("categoria_id", linha.categoria_id);
    else query = query.is("categoria_id", null);

    const { data } = await query;
    setLancamentosDetalhe(data || []);
    setCarregandoDetalhe(false);
  }

  async function exportarExcel() {
    const XLSX = await import("xlsx");
    const linhasExport = linhasFiltradas.map((l, i) => ({
      "Posição": i + 1,
      "Técnico": l.tecnico_nome,
      "Unidade": l.unidade_nome,
      "Categoria": l.categoria_nome,
      "Valor vendido": Number(l.valor_pago),
      "Qtd. OS": Number(l.qtd_os),
    }));
    const planilha = XLSX.utils.json_to_sheet(linhasExport);
    const livro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(livro, planilha, "Técnicos");
    const sufixoUnidade = unidadeFiltro ? `-${(mapaUnidades.get(unidadeFiltro) || "unidade").replace(/\s+/g, "_")}` : "";
    XLSX.writeFile(livro, `tecnicos${sufixoUnidade}-${intervalo.rotulo.replace(/\s+/g, "_")}.xlsx`);
  }

  return (
    <div className="max-w-5xl">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted mb-1">Dashboard</p>
          <h1 className="font-display text-2xl font-semibold text-ink">Técnicos — {intervalo.rotulo}</h1>
          <p className="text-sm text-muted mt-1">Ranking por técnico, nas unidades IH.</p>
        </div>
        <BotaoAtualizar aoAtualizar={carregar} className="shrink-0" />
      </div>

      <div className="flex items-center gap-2 mb-5 flex-wrap">
        <div className="flex items-center gap-1 bg-canvas rounded-full p-0.5 border border-line">
          <button
            onClick={() => setTipoPeriodo("semana")}
            className={`px-3 py-1 rounded-full text-xs transition ${tipoPeriodo === "semana" ? "bg-white shadow-sm font-medium text-ink" : "text-muted"}`}
          >
            Semana
          </button>
          <button
            onClick={() => setTipoPeriodo("mes")}
            className={`px-3 py-1 rounded-full text-xs transition ${tipoPeriodo === "mes" ? "bg-white shadow-sm font-medium text-ink" : "text-muted"}`}
          >
            Mês
          </button>
        </div>
        {tipoPeriodo === "semana" ? (
          <select className="field-input py-1.5 text-sm w-48" value={semanaSelecionada} onChange={(e) => setSemanaSelecionada(e.target.value)}>
            {semanas.map((s) => (
              <option key={s.valor} value={s.valor}>{s.rotulo}</option>
            ))}
          </select>
        ) : (
          <select className="field-input py-1.5 text-sm w-32" value={mesSelecionado} onChange={(e) => setMesSelecionado(e.target.value)}>
            {meses.map((m) => (
              <option key={m.valor} value={m.valor}>{m.rotulo}</option>
            ))}
          </select>
        )}

        <div className="flex items-center gap-1.5 ml-1">
          <Store size={13} className="text-muted" />
          <select className="field-input py-1.5 text-sm w-48" value={unidadeFiltro} onChange={(e) => setUnidadeFiltro(e.target.value)}>
            <option value="">Todas as unidades</option>
            {unidadesDisponiveis.map((u) => (
              <option key={u.id} value={u.id}>{u.nome}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <BotaoAcao3D icone={FileSpreadsheet} rotulo="Exportar Excel" onClick={exportarExcel} cor="teal" disabled={linhasFiltradas.length === 0} />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="card overflow-hidden">
          <div className="h-1.5 bg-[#3F8A5C]" />
          <div className="p-4">
            <div className="w-8 h-8 rounded-lg bg-[#3F8A5C]/10 flex items-center justify-center text-[#3F8A5C] mb-2"><Wallet size={16} /></div>
            <p className="text-xs text-muted mb-1">Valor vendido</p>
            <p className="font-mono-num text-xl font-semibold text-ink">R$ {formatarMoedaSemSimbolo(totalPago)}</p>
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
        <div className="card overflow-hidden">
          <div className="h-1.5 bg-[#2E7D5B]" />
          <div className="p-4">
            <div className="w-8 h-8 rounded-lg bg-[#2E7D5B]/10 flex items-center justify-center text-[#2E7D5B] mb-2"><HardHat size={16} /></div>
            <p className="text-xs text-muted mb-1">Técnicos no período</p>
            <p className="font-mono-num text-xl font-semibold text-ink">{tecnicosUnicos}</p>
          </div>
        </div>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wider text-muted border-b border-line">
              <td className="p-3">Técnico</td>
              <td className="p-3">Unidade</td>
              <td className="p-3">Categoria</td>
              <td className="p-3 text-right">Valor vendido</td>
              <td className="p-3 text-right">Qtd. OS</td>
            </tr>
          </thead>
          <tbody>
            {carregando && <tr><td className="p-4 text-muted" colSpan={5}>Carregando…</td></tr>}
            {!carregando && linhasFiltradas.length === 0 && (
              <tr><td className="p-4 text-muted" colSpan={5}>Nenhuma venda de técnico no período{unidadeFiltro ? " para essa unidade" : ""}.</td></tr>
            )}
            {linhasFiltradas.map((l, i) => (
              <tr
                key={`${l.tecnico_id}-${l.unidade_id}-${l.categoria_id || "sem-categoria"}`}
                className="border-t border-line hover:bg-canvas/60 cursor-pointer"
                onClick={() => abrirDetalhe(l)}
              >
                <td className="p-3">
                  <span className="inline-flex items-center gap-2">
                    <span className={`text-xs font-semibold w-6 ${MEDALHA[i] || "text-muted"}`}>{i + 1}º</span>
                    {l.tecnico_nome}
                    {!podeVerDetalhe(l) && <Lock size={12} className="text-muted" />}
                  </span>
                </td>
                <td className="p-3 text-muted">{l.unidade_nome}</td>
                <td className="p-3 text-muted">{l.categoria_nome}</td>
                <td className="p-3 text-right font-mono-num font-medium">R$ {formatarMoedaSemSimbolo(l.valor_pago)}</td>
                <td className="p-3 text-right font-mono-num text-muted">{l.qtd_os}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {detalhe && (
        <Modal titulo={detalhe.titulo} subtitulo={`${lancamentosDetalhe.length} lançamento(s) no período`} onFechar={() => setDetalhe(null)} largura="max-w-3xl">
          {!podeVerDetalhe({ unidade_id: detalhe.unidadeId }) ? (
            <div className="flex flex-col items-center text-center py-6 text-muted">
              <Lock size={22} className="mb-2 opacity-60" />
              <p className="text-sm">Você não tem permissão para ver o detalhe deste técnico.</p>
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
                  <td className="pb-2 text-right">Valor pago</td>
                </tr>
              </thead>
              <tbody>
                {lancamentosDetalhe.map((l) => (
                  <tr key={l.id} className="border-t border-line">
                    <td className="py-2">{formatarDataBR(l.data)}</td>
                    <td className="py-2 font-mono-num">{l.numero_os}</td>
                    <td className="py-2">{l.tipos_servico?.nome}</td>
                    <td className="py-2 text-right font-mono-num font-medium">R$ {formatarMoedaSemSimbolo(l.valor_pago)}</td>
                  </tr>
                ))}
                {lancamentosDetalhe.length === 0 && (
                  <tr><td colSpan={4} className="py-4 text-muted text-center">Nenhum lançamento.</td></tr>
                )}
              </tbody>
            </table>
          )}
        </Modal>
      )}
    </div>
  );
}

export default function DashboardTecnicosPage() {
  return (
    <AppShell>
      <ConteudoTecnicos />
    </AppShell>
  );
}
