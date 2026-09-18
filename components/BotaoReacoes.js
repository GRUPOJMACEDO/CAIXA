"use client";
import { useEffect, useRef, useState } from "react";
import { useSessao } from "../lib/SessaoContext";
import { enviarCelebracao } from "../lib/canalCelebracoes";

// mesmo conjunto de ícones pedido pelo usuário, nessa ordem, + os novos
// (dinheiro, fogo, fogos, festa, saco de dinheiro)
const ICONES_REACAO = ["❤️", "👍", "🎉", "👏", "😂", "😮", "😢", "🤔", "👎", "💵", "🔥", "🎆", "🎊", "💰"];

// ícone(s) de dinheiro que disparam o som de caixa registradora
const ICONES_DINHEIRO = ["💵", "💰"];

const COOLDOWN_MS = 2500;

/** Som de "cash" (caixa registradora), tocado ao selecionar um ícone de dinheiro. */
function tocarSomDinheiro() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const tocarNota = (frequencia, inicioEm, duracao, tipo = "triangle") => {
      const osc = ctx.createOscillator();
      const ganho = ctx.createGain();
      osc.type = tipo;
      osc.frequency.value = frequencia;
      const t0 = ctx.currentTime + inicioEm;
      ganho.gain.setValueAtTime(0.0001, t0);
      ganho.gain.exponentialRampToValueAtTime(0.22, t0 + 0.015);
      ganho.gain.exponentialRampToValueAtTime(0.0001, t0 + duracao);
      osc.connect(ganho);
      ganho.connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + duracao + 0.02);
    };
    if (ctx.state === "suspended") ctx.resume();
    // arpejo rápido subindo, tipo "cha-ching" de caixa registradora
    tocarNota(660, 0, 0.12);
    tocarNota(880, 0.06, 0.14);
    tocarNota(1320, 0.12, 0.28);
  } catch {
    // navegador sem suporte a áudio — segue em silêncio, sem quebrar nada
  }
}

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
  const painelRef = useRef(null);

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
    if (emCooldown) return;
    enviarCelebracao("reacao", { login: usuario?.login || "—", emoji });
    if (ICONES_DINHEIRO.includes(emoji)) tocarSomDinheiro();
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
