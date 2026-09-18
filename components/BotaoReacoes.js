"use client";
import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useSessao } from "../lib/SessaoContext";

// mesmo conjunto de ícones pedido pelo usuário, nessa ordem
const ICONES_REACAO = ["❤️", "👍", "🎉", "👏", "😂", "😮", "😢", "🤔", "👎"];

const COOLDOWN_MS = 2500;

/**
 * Botão de reações — fica no topo da barra lateral, logo acima do logo
 * (canto superior esquerdo). Visual 3D (mesmo estilo dos outros botões
 * de ação do sistema) e com um "pisca" periódico pra lembrar que está
 * ali. Ao clicar, abre uma barrinha de ícones; ao escolher um, manda um
 * broadcast público (canal "celebracoes", evento "reacao") com
 * { login, emoji } — o BalaoNotificacoes recebe em todas as telas e
 * anima o ícone subindo, igual reação de chamada de vídeo.
 */
export default function BotaoReacoes({ recolhido = false }) {
  const { usuario } = useSessao();
  const [aberto, setAberto] = useState(false);
  const [emCooldown, setEmCooldown] = useState(false);
  const canalRef = useRef(null);
  const painelRef = useRef(null);

  useEffect(() => {
    if (!usuario) return;
    const canal = supabase.channel("celebracoes").subscribe();
    canalRef.current = canal;
    return () => {
      supabase.removeChannel(canal);
      canalRef.current = null;
    };
  }, [usuario?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    function aoClicarFora(e) {
      if (painelRef.current && !painelRef.current.contains(e.target)) {
        setAberto(false);
      }
    }
    if (aberto) document.addEventListener("mousedown", aoClicarFora);
    return () => document.removeEventListener("mousedown", aoClicarFora);
  }, [aberto]);

  function enviarReacao(emoji) {
    if (emCooldown || !canalRef.current) return;
    canalRef.current.send({
      type: "broadcast",
      event: "reacao",
      payload: { login: usuario?.login || "—", emoji },
    });
    setEmCooldown(true);
    setTimeout(() => setEmCooldown(false), COOLDOWN_MS);
    setAberto(false);
  }

  if (!usuario) return null;

  return (
    <div ref={painelRef} className={`relative ${recolhido ? "flex justify-center" : ""}`}>
      <button
        onClick={() => setAberto((v) => !v)}
        title="Reações"
        className="botao-reacoes-pisca group inline-flex items-center justify-center rounded-full text-lg
          w-10 h-10 text-white
          bg-gradient-to-b from-gold to-gold-strong
          shadow-[0_3px_0_0_rgba(0,0,0,0.18),0_8px_16px_-4px_rgba(184,134,46,0.55)]
          hover:brightness-105 hover:-translate-y-0.5 active:translate-y-0
          transition-all duration-150"
      >
        😊
      </button>

      {aberto && (
        <div
          className={`absolute top-full mt-2 ${recolhido ? "left-1/2 -translate-x-1/2" : "left-0"}
            z-[200] flex items-center gap-1 rounded-2xl border border-line bg-white shadow-2xl px-2 py-2 balao-notificacao`}
        >
          {ICONES_REACAO.map((emoji) => (
            <button
              key={emoji}
              onClick={() => enviarReacao(emoji)}
              disabled={emCooldown}
              title="Enviar reação"
              className="text-2xl leading-none w-9 h-9 flex items-center justify-center rounded-full hover:bg-canvas hover:scale-110 active:scale-95 transition disabled:opacity-40 disabled:pointer-events-none"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
