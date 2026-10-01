"use client";
import { useEffect, useState } from "react";
import { RotateCcw, CheckCircle2, History } from "lucide-react";
import AppShell from "../../../components/AppShell";
import Modal from "../../../components/Modal";
import BotaoAtualizar from "../../../components/BotaoAtualizar";
import SeletorSuspenso from "../../../components/SeletorSuspenso";
import { supabase } from "../../../lib/supabaseClient";
import { useSessao } from "../../../lib/SessaoContext";
import { podeAlterarContasAReceber } from "../../../lib/permissions";
import { formatarMoedaSemSimbolo, formatarDataBR } from "../../../lib/formato";

function formatarDataHora(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function Conteudo() {
  const { usuario, unidades } = useSessao();
  const permitido = podeAlterarContasAReceber(usuario.cargo);

  const [linhas, setLinhas] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [dias, setDias] = useState(30);
  const [filtroUnidade, setFiltroUnidade] = useState([]);
  const [selecionados, setSelecionados] = useState(new Set());
  const [restaurando, setRestaurando] = useState(false);
  const [resultado, setResultado] = useState(null); // { qtd }

  async function carregar() {
    if (!permitido) return;
    setCarregando(true);
    const unidadeIdsParam = filtroUnidade.length > 0 ? filtroUnidade : null;
    const { data, error } = await supabase.rpc("admin_listar_exclusoes_lancamentos", { dias, unidade_ids: unidadeIdsParam });
    if (error) console.error("Erro ao buscar exclusões:", error.message);
    setLinhas(data || []);
    setSelecionados(new Set());
    setCarregando(false);
  }

  useEffect(() => {
    carregar();
  }, [permitido, dias, filtroUnidade]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!permitido) {
    return <p className="text-sm text-muted">Você não tem acesso a essa tela.</p>;
  }

  const restauraveis = linhas.filter((l) => !l.ja_restaurado);

  function alternarSelecionado(logId) {
    setSelecionados((atual) => {
      const novo = new Set(atual);
      if (novo.has(logId)) novo.delete(logId);
      else novo.add(logId);
      return novo;
    });
  }

  function alternarTodos() {
    setSelecionados((atual) =>
      atual.size === restauraveis.length ? new Set() : new Set(restauraveis.map((l) => l.log_id))
    );
  }

  async function restaurarSelecionados() {
    if (selecionados.size === 0) return;
    setRestaurando(true);
    const { data, error } = await supabase.rpc("admin_restaurar_exclusao_cr", { p_log_ids: [...selecionados] });
    setRestaurando(false);
    if (error) {
      alert("Erro ao restaurar: " + error.message);
      return;
    }
    setResultado({ qtd: data });
    carregar();
  }

  const qtdSelecionados = selecionados.size;

  return (
    <div className="w-full max-w-5xl">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wider text-muted mb-1">Configurações · Administrador</p>
          <h1 className="font-display text-2xl font-semibold text-ink flex items-center gap-2">
            <History size={22} className="text-[#2670B5]" /> Itens excluídos
          </h1>
          <p className="text-sm text-muted mt-1 max-w-2xl">
            Lançamentos apagados do Contas a Receber (por qualquer tela — exclusão direta, Pendências já quitadas,
            Duplicidades). Nada se perde de verdade: dá pra trazer de volta qualquer um deles aqui.
          </p>
        </div>
        <BotaoAtualizar aoAtualizar={carregar} />
      </div>

      <div className="card p-4 mb-5 flex items-center gap-4 flex-wrap">
        {unidades.length > 1 && (
          <SeletorSuspenso
            rotulo={null}
            opcoes={unidades.map((u) => ({ valor: u.id, rotulo: u.nome }))}
            selecionados={filtroUnidade}
            onChange={setFiltroUnidade}
            largura="w-56"
            rotuloTudo="Todas as unidades"
          />
        )}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted">Período:</span>
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              onClick={() => setDias(d)}
              className={`px-3 py-1.5 rounded-full text-xs transition ${
                dias === d ? "bg-gold text-white font-medium" : "bg-white border border-line text-muted hover:border-gold/50"
              }`}
            >
              {d} dias
            </button>
          ))}
        </div>
        <span className="font-mono-num font-semibold text-ink bg-canvas rounded-full px-3 py-1 text-sm ml-auto">
          {carregando ? "…" : restauraveis.length} restaurável(eis)
        </span>
      </div>

      {restauraveis.length > 0 && (
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={qtdSelecionados === restauraveis.length && restauraveis.length > 0} onChange={alternarTodos} />
            Selecionar todas
          </label>
          <button
            className="btn-primary flex items-center gap-1.5 disabled:opacity-40"
            disabled={qtdSelecionados === 0 || restaurando}
            onClick={restaurarSelecionados}
          >
            <RotateCcw size={14} /> {restaurando ? "Restaurando…" : `Restaurar selecionados (${qtdSelecionados})`}
          </button>
        </div>
      )}

      {carregando ? (
        <p className="text-sm text-muted py-16 text-center">Carregando…</p>
      ) : linhas.length === 0 ? (
        <div className="card p-10 text-center text-muted text-sm flex flex-col items-center gap-2">
          <CheckCircle2 size={22} className="text-[#3F8A5C]" />
          Nenhuma exclusão nesse período.
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wider text-muted border-b border-line">
                <td className="p-3 w-8"></td>
                {unidades.length > 1 && <td className="p-3">Unidade</td>}
                <td className="p-3">Nº OS</td>
                <td className="p-3">Tipo de serviço</td>
                <td className="p-3">Data do lançamento</td>
                <td className="p-3 text-right">Valor</td>
                <td className="p-3">Motivo da exclusão</td>
                <td className="p-3">Excluído por</td>
                <td className="p-3">Excluído em</td>
                <td className="p-3"></td>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => {
                const marcada = selecionados.has(l.log_id);
                return (
                  <tr key={l.log_id} className={`border-t border-line ${marcada ? "bg-gold/5" : ""} ${l.ja_restaurado ? "opacity-50" : ""}`}>
                    <td className="p-3">
                      {!l.ja_restaurado && (
                        <input type="checkbox" checked={marcada} onChange={() => alternarSelecionado(l.log_id)} />
                      )}
                    </td>
                    {unidades.length > 1 && <td className="p-3">{l.unidade_nome}</td>}
                    <td className="p-3 font-mono-num">{l.numero_os}</td>
                    <td className="p-3 text-xs text-muted">
                      {l.tipo_servico_nome || "—"}{" "}
                      {l.linha === "ih" && <span className="text-[9px] px-1.5 py-0.5 rounded font-medium bg-teal-soft text-teal">IH</span>}
                    </td>
                    <td className="p-3 text-xs text-muted whitespace-nowrap">{formatarDataBR(l.data)}</td>
                    <td className="p-3 text-right font-mono-num font-medium">R$ {formatarMoedaSemSimbolo(l.valor_pago)}</td>
                    <td className="p-3 text-xs text-muted max-w-[220px] truncate" title={l.motivo_exclusao || ""}>
                      {l.motivo_exclusao || "—"}
                    </td>
                    <td className="p-3 text-xs text-muted">{l.excluido_por || "—"}</td>
                    <td className="p-3 text-xs text-muted whitespace-nowrap">{formatarDataHora(l.excluido_em)}</td>
                    <td className="p-3 text-right">
                      {l.ja_restaurado && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-[#3F8A5C]/10 text-[#3F8A5C] whitespace-nowrap">
                          Já restaurado
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {resultado && (
        <Modal titulo="Restauração concluída" onFechar={() => setResultado(null)} largura="max-w-sm">
          <div className="flex items-start gap-2 text-sm text-[#2E6B45]">
            <CheckCircle2 size={18} className="shrink-0 mt-0.5" />
            <p>
              {resultado.qtd} lançamento(s) voltaram pro Contas a Receber. Se algum já tinha sido restaurado antes, ele
              foi pulado automaticamente.
            </p>
          </div>
          <div className="flex justify-end mt-4">
            <button className="btn" onClick={() => setResultado(null)}>Fechar</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

export default function ItensExcluidosPage() {
  return (
    <AppShell>
      <Conteudo />
    </AppShell>
  );
}
