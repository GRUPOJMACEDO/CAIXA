"use client";
import { useEffect, useState } from "react";
import { Copy, Check, X, Pencil, Trash2, AlertTriangle, Building2 } from "lucide-react";
import AppShell from "../../../components/AppShell";
import Modal from "../../../components/Modal";
import BotaoAtualizar from "../../../components/BotaoAtualizar";
import { supabase } from "../../../lib/supabaseClient";
import { useSessao } from "../../../lib/SessaoContext";
import { podeVerDuplicidades, podeRevisarDuplicidades, podeVerTodasUnidades } from "../../../lib/permissions";
import { formatarMoedaSemSimbolo, formatarDataBR } from "../../../lib/formato";

// gravidade → estilo visual (quanto mais campos batem, mais escuro)
const ESTILO_NIVEL = {
  1: { borda: "border-l-4 border-l-[#F3B0A6]", selo: "bg-[#F3B0A6]/40 text-[#8A2E22]", rotulo: "Mesma OS" },
  2: { borda: "border-l-4 border-l-[#E5766A]", selo: "bg-[#E5766A]/30 text-[#7A2115]", rotulo: "OS + Tipo de serviço" },
  3: { borda: "border-l-4 border-l-[#B23B2E]", selo: "bg-[#B23B2E]/25 text-[#6B140A]", rotulo: "OS + Tipo + Valor" },
  4: { borda: "border-l-4 border-l-black", selo: "bg-black/85 text-white", rotulo: "OS + Tipo + Valor + Data" },
};

function Conteudo() {
  const { usuario, unidades } = useSessao();
  const permitido = podeVerDuplicidades(usuario.cargo);
  const podeAgir = podeRevisarDuplicidades(usuario.cargo);

  const [dados, setDados] = useState([]);
  const [revisadas, setRevisadas] = useState(new Set());
  const [carregando, setCarregando] = useState(true);
  const [gruposRecusados, setGruposRecusados] = useState(new Set()); // chave unidade::os que teve "Recusar" clicado
  const [excluindo, setExcluindo] = useState(null); // lançamento em processo de exclusão
  const [motivoExclusao, setMotivoExclusao] = useState("");
  const [processando, setProcessando] = useState(false);

  async function carregar() {
    if (!permitido) return;
    setCarregando(true);
    const unidadeIdsParam = podeVerTodasUnidades(usuario.cargo) ? null : unidades.map((u) => u.id);
    const [{ data, error }, { data: revisadasData }] = await Promise.all([
      supabase.rpc("duplicidades_os", { unidade_ids: unidadeIdsParam }),
      supabase.from("duplicidades_revisadas").select("unidade_id, numero_os"),
    ]);
    if (error) console.error("Erro ao buscar duplicidades:", error.message);
    setDados(data || []);
    setRevisadas(new Set((revisadasData || []).map((r) => `${r.unidade_id}::${r.numero_os}`)));
    setCarregando(false);
  }

  useEffect(() => {
    carregar();
  }, [permitido]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!permitido) {
    return <p className="text-sm text-muted">Você não tem acesso a essa tela.</p>;
  }

  // --- agrupa por unidade + numero_os, descartando o que já foi revisado ---
  const grupos = new Map();
  dados.forEach((l) => {
    const chave = `${l.unidade_id}::${l.numero_os}`;
    if (revisadas.has(chave)) return;
    if (!grupos.has(chave)) grupos.set(chave, { unidade_id: l.unidade_id, unidade_nome: l.unidade_nome, numero_os: l.numero_os, itens: [] });
    grupos.get(chave).itens.push(l);
  });
  const listaGrupos = [...grupos.values()].sort((a, b) => {
    const maxA = Math.max(...a.itens.map((i) => i.nivel));
    const maxB = Math.max(...b.itens.map((i) => i.nivel));
    return maxB - maxA;
  });

  async function marcarComoOk(grupo) {
    setProcessando(true);
    await supabase.from("duplicidades_revisadas").insert({
      unidade_id: grupo.unidade_id,
      numero_os: grupo.numero_os,
      revisado_por: usuario.id,
    });
    setProcessando(false);
    carregar();
  }

  function alternarRecusado(chave) {
    setGruposRecusados((atual) => {
      const novo = new Set(atual);
      if (novo.has(chave)) novo.delete(chave);
      else novo.add(chave);
      return novo;
    });
  }

  async function confirmarExclusao() {
    if (!excluindo || !motivoExclusao.trim()) return;
    setProcessando(true);
    await supabase
      .from("lancamentos")
      .update({ motivo_exclusao: motivoExclusao.trim(), alterado_por: usuario.id, alterado_em: new Date().toISOString() })
      .eq("id", excluindo.id);
    const { error } = await supabase.from("lancamentos").delete().eq("id", excluindo.id);
    setProcessando(false);
    if (error) {
      alert("Erro ao excluir: " + error.message);
      return;
    }
    setExcluindo(null);
    setMotivoExclusao("");
    carregar();
  }

  return (
    <div className="w-full">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wider text-muted mb-1">Configurações</p>
          <h1 className="font-display text-2xl font-semibold text-ink flex items-center gap-2">
            <Copy size={22} className="text-[#C9752E]" /> Duplicidades
          </h1>
          <p className="text-sm text-muted mt-1">Ordens de serviço repetidas dentro da mesma unidade. Quanto mais escuro, mais campos batem entre os lançamentos.</p>
        </div>
        <BotaoAtualizar aoAtualizar={carregar} />
      </div>

      <div className="flex items-center gap-3 mb-5 text-sm">
        <span className="inline-flex items-center gap-1.5 font-mono-num font-semibold text-ink bg-canvas rounded-full px-3 py-1">
          {carregando ? "…" : listaGrupos.length} pendente(s) de revisão
        </span>
        <div className="flex items-center gap-2 text-[11px] text-muted">
          {[1, 2, 3, 4].map((n) => (
            <span key={n} className={`px-2 py-0.5 rounded ${ESTILO_NIVEL[n].selo}`}>{ESTILO_NIVEL[n].rotulo}</span>
          ))}
        </div>
      </div>

      {carregando ? (
        <p className="text-sm text-muted py-16 text-center">Carregando…</p>
      ) : listaGrupos.length === 0 ? (
        <div className="card p-10 text-center text-muted text-sm">Nenhuma OS duplicada pendente — tudo certo por aqui.</div>
      ) : (
        <div className="space-y-4">
          {listaGrupos.map((grupo) => {
            const chave = `${grupo.unidade_id}::${grupo.numero_os}`;
            const recusado = gruposRecusados.has(chave);
            return (
              <div key={chave} className="card overflow-hidden">
                <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-line bg-canvas/50">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-mono-num font-semibold text-ink">OS {grupo.numero_os}</span>
                    <span className="text-xs text-muted flex items-center gap-1"><Building2 size={12} /> {grupo.unidade_nome}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-white border border-line text-muted">{grupo.itens.length} lançamentos</span>
                  </div>
                  {podeAgir && (
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => marcarComoOk(grupo)}
                        disabled={processando}
                        className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full bg-teal-soft text-teal hover:bg-teal hover:text-white transition font-medium"
                      >
                        <Check size={13} /> Tudo certo
                      </button>
                      <button
                        onClick={() => alternarRecusado(chave)}
                        className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full transition font-medium ${
                          recusado ? "bg-danger text-white" : "bg-danger-soft text-danger hover:bg-danger hover:text-white"
                        }`}
                      >
                        <X size={13} /> Recusar
                      </button>
                    </div>
                  )}
                </div>

                <div>
                  {grupo.itens.map((l) => (
                    <div key={l.id} className={`flex items-center gap-3 px-4 py-2.5 text-sm border-t border-line first:border-t-0 ${ESTILO_NIVEL[l.nivel].borda}`}>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium shrink-0 ${ESTILO_NIVEL[l.nivel].selo}`}>
                        {ESTILO_NIVEL[l.nivel].rotulo}
                      </span>
                      <span className="text-xs text-muted w-24 shrink-0">{formatarDataBR(l.data)}</span>
                      <span className="flex-1 min-w-0 truncate text-ink">
                        {l.tipo_servico_nome || "—"}
                        {l.linha === "ih" && <span className="ml-1.5 text-[9px] px-1.5 py-0.5 rounded font-medium bg-teal-soft text-teal">IH</span>}
                      </span>
                      <span className="text-xs text-muted w-40 shrink-0 truncate">{l.atendente_nome} · @{l.atendente_login}</span>
                      <span className="font-mono-num text-right w-28 shrink-0">R$ {formatarMoedaSemSimbolo(l.valor_pago)}</span>
                      {podeAgir && recusado && (
                        <div className="flex items-center gap-1 shrink-0">
                          <a
                            href={`/consulta?os=${encodeURIComponent(l.numero_os)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Editar na Consulta"
                            className="p-1.5 rounded-md text-muted hover:text-gold hover:bg-gold-soft/40 transition"
                          >
                            <Pencil size={14} />
                          </a>
                          <button
                            onClick={() => setExcluindo(l)}
                            title="Excluir este lançamento"
                            className="p-1.5 rounded-md text-muted hover:text-danger hover:bg-danger-soft transition"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {excluindo && (
        <Modal titulo="Excluir lançamento" onFechar={() => { setExcluindo(null); setMotivoExclusao(""); }} largura="max-w-sm">
          <div className="flex items-start gap-2 text-sm text-danger mb-4">
            <AlertTriangle size={18} className="shrink-0 mt-0.5" />
            <p>
              Excluir o lançamento da OS <span className="font-mono-num font-medium">{excluindo.numero_os}</span> de{" "}
              <span className="font-mono-num font-medium">R$ {formatarMoedaSemSimbolo(excluindo.valor_pago)}</span> em{" "}
              {formatarDataBR(excluindo.data)}. Essa ação não pode ser desfeita.
            </p>
          </div>
          <label className="field-label">Motivo da exclusão (obrigatório)</label>
          <textarea
            className="field-input"
            rows={3}
            value={motivoExclusao}
            onChange={(e) => setMotivoExclusao(e.target.value)}
            placeholder="Ex: lançamento duplicado por engano, mesmo serviço lançado duas vezes."
          />
          <div className="flex justify-end gap-2 mt-4">
            <button className="btn" onClick={() => { setExcluindo(null); setMotivoExclusao(""); }}>Cancelar</button>
            <button
              className="btn-primary bg-danger hover:bg-danger flex items-center gap-1.5 disabled:opacity-40"
              disabled={!motivoExclusao.trim() || processando}
              onClick={confirmarExclusao}
            >
              <Trash2 size={14} /> {processando ? "Excluindo…" : "Confirmar exclusão"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

export default function DuplicidadesPage() {
  return (
    <AppShell>
      <Conteudo />
    </AppShell>
  );
}
