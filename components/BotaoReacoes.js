"use client";
import { useEffect, useRef, useState } from "react";
import { Smile } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useSessao } from "../lib/SessaoContext";

// mesmo conjunto de ícones pedido pelo usuário, nessa ordem
const ICONES_REACAO = ["❤️", "👍", "🎉", "👏", "😂", "😮", "😢", "🤔", "👎"];

const COOLDOWN_MS = 2500;

/**
 * Botão flutuante (canto inferior esquerdo) que abre uma barrinha de
 * ícones de reação. Ao clicar em um ícone, manda um broadcast público
 * (canal "celebracoes", evento "reacao") com { login, emoji } — o
 * ReacoesFlutuantes (dentro do BalaoNotificacoes) recebe e anima o
 * ícone subindo na tela de todo mundo que estiver online, igual uma
 * reação de chamada de vídeo.
 */
export default function BotaoReacoes() {
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
    <div ref={painelRef} className="fixed bottom-5 left-5 z-[200]">
      {aberto && (
        <div className="mb-2 flex items-center gap-1 rounded-2xl border border-line bg-white shadow-2xl px-2 py-2 balao-notificacao">
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
      <button
        onClick={() => setAberto((v) => !v)}
        title="Reações"
        className="w-11 h-11 rounded-full bg-white border border-line shadow-xl flex items-center justify-center text-muted hover:text-gold-strong hover:border-gold transition"
      >
        <Smile size={20} />
      </button>
    </div>
  );
}
