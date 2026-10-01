"use client";
import { useEffect, useRef, useState } from "react";
import { Eraser, AlertTriangle, Building2, ChevronDown, CheckCircle2, ClipboardPaste, Trash2 } from "lucide-react";
import AppShell from "../../../components/AppShell";
import Modal from "../../../components/Modal";
import BotaoAtualizar from "../../../components/BotaoAtualizar";
import { supabase } from "../../../lib/supabaseClient";
import { useSessao } from "../../../lib/SessaoContext";
import { podeVerPendenciasQuitadas } from "../../../lib/permissions";
import { formatarMoedaSemSimbolo, formatarDataBR } from "../../../lib/formato";
import { normalizarNumeroOS } from "../../../lib/validacaoOS";

function chaveConta(l) {
  return `${l.unidade_id}::${l.numero_os}::${l.tipo_servico_id ?? ""}::${l.linha}`;
}

/** Seletor de unidade, multi-escolha e suspenso (mesmo padrão da tela de Duplicidades). */
function SeletorUnidade({ unidades, selecionados, onChange }) {
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
  }

  const rotulo =
    selecionados.length === 0
      ? "Todas as unidades"
      : selecionados.length === 1
        ? unidades.find((u) => u.id === selecionados[0])?.nome || "1 selecionada"
        : `${selecionados.length} selecionadas`;

  return (
    <div className="relative w-64" ref={ref}>
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="field-input text-sm w-full flex items-center justify-between text-left"
      >
        <span className="truncate flex items-center gap-1.5"><Building2 size={13} className="text-muted shrink-0" /> {rotulo}</span>
        <ChevronDown size={14} className={`shrink-0 transition-transform ${aberto ? "rotate-180" : ""}`} />
      </button>
      {aberto && (
        <div className="absolute z-20 mt-1 w-full max-h-56 overflow-y-auto bg-white border border-line rounded-lg shadow-lg">
          {unidades.map((u) => (
            <label key={u.id} className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-canvas cursor-pointer">
              <input type="checkbox" checked={selecionados.includes(u.id)} onChange={() => alternar(u.id)} />
              {u.nome}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function Conteudo() {
  const { usuario, unidades } = useSessao();
  const permitido = podeVerPendenciasQuitadas(usuario.cargo);

  const [linhas, setLinhas] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [filtroUnidade, setFiltroUnidade] = useState([]);
  const [selecionados, setSelecionados] = useState(new Set());
  const [mostrarColar, setMostrarColar] = useState(false);
  const [textoColado, setTextoColado] = useState("");
  const [relatorioColagem, setRelatorioColagem] = useState(null); // { encontradas, naoEncontradas }
  const [excluindo, setExcluindo] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [processando, setProcessando] = useState(false);
  const [resultado, setResultado] = useState(null); // { ok: [], pulados: [{numero_os, tipo_servico_nome, motivo}] }

  async function carregar() {
    if (!permitido) return;
    setCarregando(true);
    const unidadeIdsParam = filtroUnidade.length > 0 ? filtroUnidade : null;
    const { data, error } = await supabase.rpc("pendencias_quitadas_cr", { unidade_ids: unidadeIdsParam });
    if (error) console.error("Erro ao buscar pendências já quitadas:", error.message);
    setLinhas(data || []);
    setSelecionados(new Set());
    setCarregando(false);
  }

  useEffect(() => {
    carregar();
  }, [permitido, filtroUnidade]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!permitido) {
    return <p className="text-sm text-muted">Você não tem acesso a essa tela.</p>;
  }

  const unidadesMap = Object.fromEntries(unidades.map((u) => [u.id, u.nome]));
  const totalFalta = linhas.reduce((s, l) => s + Number(l.falta_nesta_conta), 0);

  function alternarSelecionado(chave) {
    setSelecionados((atual) => {
      const novo = new Set(atual);
      if (novo.has(chave)) novo.delete(chave);
      else novo.add(chave);
      return novo;
    });
  }

  function alternarTodos() {
    setSelecionados((atual) => (atual.size === linhas.length ? new Set() : new Set(linhas.map(chaveConta))));
  }

  function aplicarListaColada() {
    const tokens = textoColado.split(/[\n,;]+/).map((t) => t.trim()).filter(Boolean);
    const encontradas = new Set();
    const naoEncontradas = [];
    const novaSelecao = new Set(selecionados);

    tokens.forEach((token) => {
      const { valido, valor } = normalizarNumeroOS(token);
      const osAlvo = valido ? valor : token.toUpperCase();
      const linhasDaOs = linhas.filter((l) => l.numero_os === osAlvo);
      if (linhasDaOs.length === 0) {
        naoEncontradas.push(token);
      } else {
        encontradas.add(osAlvo);
        linhasDaOs.forEach((l) => novaSelecao.add(chaveConta(l)));
      }
    });

    setSelecionados(novaSelecao);
    setRelatorioColagem({ encontradas: encontradas.size, naoEncontradas });
  }

  async function excluirSelecionados() {
    if (!motivo.trim() || selecionados.size === 0) return;
    setProcessando(true);
    const alvo = linhas.filter((l) => selecionados.has(chaveConta(l)));
    const ok = [];
    const pulados = [];

    for (const l of alvo) {
      // reconfirma no banco, na hora, que ainda é mesmo uma pendência já quitada
      const { data: aindaValido, error: erroConfirma } = await supabase.rpc("confirmar_pendencia_quitada", {
        p_unidade_id: l.unidade_id,
        p_numero_os: l.numero_os,
        p_tipo_servico_id: l.tipo_servico_id,
        p_linha: l.linha,
      });
      if (erroConfirma || !aindaValido) {
        pulados.push({ numero_os: l.numero_os, tipo_servico_nome: l.tipo_servico_nome, motivo: "Mudou de estado — não é mais uma pendência já quitada. Confira na Consulta." });
        continue;
      }

      let query = supabase
        .from("lancamentos")
        .update({ motivo_exclusao: motivo.trim(), alterado_por: usuario.id, alterado_em: new Date().toISOString() })
        .eq("unidade_id", l.unidade_id)
        .eq("numero_os", l.numero_os)
        .eq("linha", l.linha);
      query = l.tipo_servico_id ? query.eq("tipo_servico_id", l.tipo_servico_id) : query.is("tipo_servico_id", null);
      const { error: erroMotivo } = await query;
      if (erroMotivo) {
        pulados.push({ numero_os: l.numero_os, tipo_servico_nome: l.tipo_servico_nome, motivo: erroMotivo.message });
        continue;
      }

      let queryDelete = supabase
        .from("lancamentos")
        .delete()
        .eq("unidade_id", l.unidade_id)
        .eq("numero_os", l.numero_os)
        .eq("linha", l.linha);
      queryDelete = l.tipo_servico_id ? queryDelete.eq("tipo_servico_id", l.tipo_servico_id) : queryDelete.is("tipo_servico_id", null);
      const { error: erroDelete } = await queryDelete;
      if (erroDelete) {
        pulados.push({ numero_os: l.numero_os, tipo_servico_nome: l.tipo_servico_nome, motivo: erroDelete.message });
        continue;
      }

      ok.push({ numero_os: l.numero_os, tipo_servico_nome: l.tipo_servico_nome });
    }

    setProcessando(false);
    setExcluindo(false);
    setMotivo("");
    setResultado({ ok, pulados });
    carregar();
  }

  const qtdSelecionados = selecionados.size;

  return (
    <div className="w-full max-w-5xl">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wider text-muted mb-1">Configurações · Administrador</p>
          <h1 className="font-display text-2xl font-semibold text-ink flex items-center gap-2">
            <Eraser size={22} className="text-[#3F8A5C]" /> Pendências já quitadas
          </h1>
          <p className="text-sm text-muted mt-1 max-w-2xl">
            OS que ainda aparecem com saldo em aberto no Contas a Receber, mas que, somando todos os lançamentos da
            mesma OS — mesmo com um Tipo de Serviço diferente — já foram pagas por inteiro. Normalmente é alguém
            pagando o restante e escolhendo por engano outro Tipo de Serviço, em vez de dar baixa pelo Contas a
            Receber.
          </p>
        </div>
        <BotaoAtualizar aoAtualizar={carregar} />
      </div>

      <div className="card p-4 mb-5 flex items-center justify-between gap-4 flex-wrap">
        {unidades.length > 1 && <SeletorUnidade unidades={unidades} selecionados={filtroUnidade} onChange={setFiltroUnidade} />}
        <div className="flex items-center gap-3 text-sm ml-auto">
          <span className="font-mono-num font-semibold text-ink bg-canvas rounded-full px-3 py-1">
            {carregando ? "…" : linhas.length} pendência(s) já quitada(s)
          </span>
          <span className="font-mono-num font-semibold text-bronze bg-bronze-soft/40 rounded-full px-3 py-1">
            R$ {formatarMoedaSemSimbolo(totalFalta)} em saldo fantasma
          </span>
        </div>
      </div>

      {linhas.length > 0 && (
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-ink">
              <input type="checkbox" checked={qtdSelecionados === linhas.length && linhas.length > 0} onChange={alternarTodos} />
              Selecionar todas
            </label>
            {qtdSelecionados > 0 && <span className="text-xs text-muted">{qtdSelecionados} selecionada(s)</span>}
          </div>
          <div className="flex items-center gap-2">
            <button className="btn text-sm flex items-center gap-1.5" onClick={() => setMostrarColar(true)}>
              <ClipboardPaste size={14} /> Colar lista de OS
            </button>
            <button
              className="btn-primary bg-danger hover:bg-danger text-sm flex items-center gap-1.5 disabled:opacity-40"
              disabled={qtdSelecionados === 0}
              onClick={() => setExcluindo(true)}
            >
              <Trash2 size={14} /> Excluir selecionadas ({qtdSelecionados})
            </button>
          </div>
        </div>
      )}

      {carregando ? (
        <p className="text-sm text-muted py-16 text-center">Carregando…</p>
      ) : linhas.length === 0 ? (
        <div className="card p-10 text-center text-muted text-sm flex flex-col items-center gap-2">
          <CheckCircle2 size={22} className="text-[#3F8A5C]" />
          Nenhuma pendência fantasma encontrada — o Contas a Receber está batendo certinho.
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wider text-muted border-b border-line">
                <td className="p-3 w-8"></td>
                {unidades.length > 1 && <td className="p-3">Unidade</td>}
                <td className="p-3">Nº OS</td>
                <td className="p-3">Tipo de serviço (em aberto)</td>
                <td className="p-3 text-right">Falta pagar (fantasma)</td>
                <td className="p-3 text-right">Saldo real da OS</td>
                <td className="p-3 text-right">Contas na OS</td>
                <td className="p-3">Último lançamento</td>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => {
                const chave = chaveConta(l);
                const marcada = selecionados.has(chave);
                return (
                  <tr key={chave} className={`border-t border-line ${marcada ? "bg-[#3F8A5C]/5" : ""}`}>
                    <td className="p-3">
                      <input type="checkbox" checked={marcada} onChange={() => alternarSelecionado(chave)} />
                    </td>
                    {unidades.length > 1 && <td className="p-3">{l.unidade_nome || unidadesMap[l.unidade_id]}</td>}
                    <td className="p-3 font-mono-num">{l.numero_os}</td>
                    <td className="p-3 text-xs text-muted">
                      {l.tipo_servico_nome || "—"}{" "}
                      {l.linha === "ih" && <span className="text-[9px] px-1.5 py-0.5 rounded font-medium bg-teal-soft text-teal">IH</span>}
                    </td>
                    <td className="p-3 text-right font-mono-num font-medium text-bronze">R$ {formatarMoedaSemSimbolo(l.falta_nesta_conta)}</td>
                    <td className="p-3 text-right font-mono-num text-muted">R$ {formatarMoedaSemSimbolo(l.saldo_real_da_os)}</td>
                    <td className="p-3 text-right font-mono-num text-muted">{l.qtd_contas_na_os}</td>
                    <td className="p-3 text-muted">{formatarDataBR(l.ultimo_lancamento)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {mostrarColar && (
        <Modal titulo="Colar lista de OS" subtitulo="Uma OS por linha (ou separadas por vírgula) — marca automaticamente as que forem pendência já quitada." onFechar={() => { setMostrarColar(false); setRelatorioColagem(null); }} largura="max-w-md">
          <textarea
            className="field-input font-mono-num"
            rows={8}
            placeholder={"4176699198\n4176701422\n..."}
            value={textoColado}
            onChange={(e) => setTextoColado(e.target.value)}
          />
          {relatorioColagem && (
            <div className="mt-3 text-sm space-y-1">
              <p className="text-[#2E6B45]">{relatorioColagem.encontradas} OS encontrada(s) e marcada(s) acima.</p>
              {relatorioColagem.naoEncontradas.length > 0 && (
                <div className="text-bronze">
                  <p>{relatorioColagem.naoEncontradas.length} não encontrada(s) (não são pendência já quitada, ou já foram resolvidas):</p>
                  <p className="font-mono-num text-xs text-muted mt-1 break-words">{relatorioColagem.naoEncontradas.join(", ")}</p>
                </div>
              )}
            </div>
          )}
          <div className="flex justify-end gap-2 mt-4">
            <button className="btn" onClick={() => { setMostrarColar(false); setRelatorioColagem(null); }}>Fechar</button>
            <button className="btn-primary" onClick={aplicarListaColada} disabled={!textoColado.trim()}>Selecionar da lista</button>
          </div>
        </Modal>
      )}

      {excluindo && (
        <Modal titulo="Excluir pendências já quitadas" onFechar={() => setExcluindo(false)} largura="max-w-md">
          <div className="flex items-start gap-2 text-sm text-danger mb-4">
            <AlertTriangle size={18} className="shrink-0 mt-0.5" />
            <p>
              Vai excluir os lançamentos de <span className="font-mono-num font-medium">{qtdSelecionados}</span> conta(s)
              selecionada(s), limpando esse saldo fantasma do Contas a Receber. Cada uma é reconfirmada no banco antes de
              excluir — se alguma tiver mudado de estado, ela é pulada e aparece no relatório final. Essa ação não pode
              ser desfeita.
            </p>
          </div>
          <label className="field-label">Motivo (obrigatório, vale para todas as selecionadas)</label>
          <textarea
            className="field-input"
            rows={3}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ex: limpeza de pendências já quitadas, conferido em 01/10/2026."
          />
          <div className="flex justify-end gap-2 mt-4">
            <button className="btn" onClick={() => setExcluindo(false)}>Cancelar</button>
            <button
              className="btn-primary bg-danger hover:bg-danger flex items-center gap-1.5 disabled:opacity-40"
              disabled={!motivo.trim() || processando}
              onClick={excluirSelecionados}
            >
              <Trash2 size={14} /> {processando ? "Excluindo…" : `Confirmar exclusão (${qtdSelecionados})`}
            </button>
          </div>
        </Modal>
      )}

      {resultado && (
        <Modal titulo="Resultado da exclusão" onFechar={() => setResultado(null)} largura="max-w-md">
          <div className="space-y-3 text-sm">
            <p className="text-[#2E6B45] flex items-center gap-1.5"><CheckCircle2 size={15} /> {resultado.ok.length} excluída(s) com sucesso.</p>
            {resultado.pulados.length > 0 && (
              <div>
                <p className="text-bronze flex items-center gap-1.5 mb-1.5"><AlertTriangle size={15} /> {resultado.pulados.length} pulada(s):</p>
                <div className="card divide-y divide-line max-h-48 overflow-y-auto">
                  {resultado.pulados.map((p, i) => (
                    <div key={i} className="px-3 py-2 text-xs">
                      <span className="font-mono-num font-medium">{p.numero_os}</span> — {p.tipo_servico_nome || "—"}
                      <p className="text-muted">{p.motivo}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="flex justify-end mt-4">
            <button className="btn" onClick={() => setResultado(null)}>Fechar</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

export default function PendenciasQuitadasPage() {
  return (
    <AppShell>
      <Conteudo />
    </AppShell>
  );
}
