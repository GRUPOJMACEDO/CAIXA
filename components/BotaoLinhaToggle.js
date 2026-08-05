"use client";
import { Home, Store } from "lucide-react";
import { useSessao } from "../lib/SessaoContext";

/**
 * Interruptor de linha de operação, visível só para gestão com
 * acesso a mais de uma unidade, sendo pelo menos uma delas IH.
 *
 * Ligado (IH) → só dados de atendimento in-home.
 * Desligado   → junção de CI + IH (o normal de hoje).
 */
export default function BotaoLinhaToggle() {
  const { podeAlternarLinha, modoIH, alternarModoIH } = useSessao();

  if (!podeAlternarLinha) return null;

  return (
    <button
      onClick={alternarModoIH}
      title={modoIH ? "Modo IH ligado — clique para ver CI + IH junto" : "Ver só IH (in-home)"}
      className={`group inline-flex items-center gap-2 rounded-full pl-1.5 pr-3 py-1.5 text-sm font-medium
        border transition-all duration-200 shadow-sm
        ${modoIH
          ? "bg-gradient-to-b from-teal to-[#0A4440] border-transparent text-white shadow-[0_3px_0_0_rgba(0,0,0,0.18),0_8px_16px_-4px_rgba(14,90,86,0.55)] hover:brightness-105 hover:-translate-y-0.5"
          : "bg-white border-line text-muted hover:border-teal/50 hover:text-teal"
        }`}
    >
      <span
        className={`relative inline-flex items-center h-5 w-9 rounded-full transition-colors shrink-0 ${
          modoIH ? "bg-white/25" : "bg-line"
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
            modoIH ? "translate-x-4" : "translate-x-0"
          }`}
        />
      </span>
      {modoIH ? <Home size={14} /> : <Store size={14} />}
      {modoIH ? "Modo IH" : "CI + IH"}
    </button>
  );
}
