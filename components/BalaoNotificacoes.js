"use client";
import { useEffect, useRef, useState } from "react";
import { PartyPopper, Sparkles, Megaphone, X, Check } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useSessao } from "../lib/SessaoContext";

let proximoIdBalao = 1;

function formatarMoeda(v) {
  return Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 });
}

/**
 * Balões de notificação ao vivo (Supabase Realtime):
 *   - novo lançamento → balão de comemoração, some sozinho em 5s
 *   - aviso do administrador → balão que só fecha no clique
 */
export default function BalaoNotificacoes() {
  const { usuario } = useSessao();
  const [baloes, setBaloes] = useState([]);
  const cacheUnidades = useRef(new Map());
  const cacheUsuarios = useRef(new Map());

  function removerBalao(id) {
    setBaloes((atual) => atual.filter((b) => b.id !== id));
  }

  async function nomeDaUnidade(id) {
    if (cacheUnidades.current.has(id)) return cacheUnidades.current.get(id);
    const { data } = await supabase.from("unidades").select("nome").eq("id", id).single();
    const nome = data?.nome || "—";
    cacheUnidades.current.set(id, nome);
    return nome;
  }

  async function loginDoUsuario(id) {
    if (cacheUsuarios.current.has(id)) return cacheUsuarios.current.get(id);
    const { data } = await supabase.from("usuarios").select("login").eq("id", id).single();
    const login = data?.login || "—";
    cacheUsuarios.current.set(id, login);
    return login;
  }

  async function aoNovoLancamento(payload) {
    const l = payload.new;
    const [unidadeNome, login] = await Promise.all([nomeDaUnidade(l.unidade_id), loginDoUsuario(l.atendente_id)]);
    const id = proximoIdBalao++;
    setBaloes((atual) => [
      ...atual,
      { id, tipo: "lancamento", unidade: unidadeNome, login, valor: Number(l.valor_pago) },
    ]);
    setTimeout(() => removerBalao(id), 5000);
  }

  function aoNovoAviso(payload) {
    const a = payload.new;
    const id = proximoIdBalao++;
    setBaloes((atual) => [...atual, { id, tipo: "aviso", texto: a.texto }]);
  }

  useEffect(() => {
    if (!usuario) return;
    const canal = supabase
      .channel("baloes-notificacoes")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "lancamentos" }, aoNovoLancamento)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "avisos_admin" }, aoNovoAviso)
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [usuario?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="fixed bottom-5 right-5 z-[200] flex flex-col-reverse gap-2.5 items-end pointer-events-none max-w-[90vw]">
      {baloes.map((b) => (
        <div key={b.id} className="balao-notificacao pointer-events-auto">
          {b.tipo === "lancamento" ? (
            <div
              className="flex items-center gap-3 rounded-2xl px-4 py-3 shadow-2xl border border-white/40 text-white w-80"
              style={{
                background: "linear-gradient(135deg, #B8862E 0%, #D9A83E 45%, #0E7A72 100%)",
                boxShadow: "0 8px 24px -4px rgba(184,134,46,0.55), inset 0 1px 1px rgba(255,255,255,0.35)",
              }}
            >
              <div className="w-9 h-9 rounded-full bg-white/25 flex items-center justify-center shrink-0">
                <PartyPopper size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold flex items-center gap-1 leading-tight">
                  Novo lançamento! <Sparkles size={13} className="shrink-0" />
                </p>
                <p className="text-xs text-white/90 truncate mt-0.5">
                  <span className="font-medium">{b.unidade}</span> · @{b.login}
                </p>
                <p className="font-mono-num text-base font-bold mt-0.5">R$ {formatarMoeda(b.valor)}</p>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-3 rounded-2xl px-4 py-3 shadow-2xl border border-line bg-white w-80">
              <div className="w-9 h-9 rounded-full bg-gold-soft flex items-center justify-center shrink-0 text-gold-strong">
                <Megaphone size={16} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] uppercase tracking-wide text-muted font-semibold mb-0.5">Aviso do administrador</p>
                <p className="text-sm text-ink break-words">{b.texto}</p>
              </div>
              <button
                onClick={() => removerBalao(b.id)}
                title="Marcar como lido e fechar"
                className="shrink-0 w-7 h-7 rounded-full bg-teal-soft text-teal flex items-center justify-center hover:bg-teal hover:text-white transition"
              >
                <Check size={14} />
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
