"use client";
import { useEffect, useState } from "react";
import { Sun, Moon, Heart } from "lucide-react";
import { carregarModo, salvarModo, aplicarModo } from "../lib/tema";

export default function BotaoModoClaroEscuro({ recolhido, topbar }) {
  const [modo, setModo] = useState("claro");

  useEffect(() => {
    setModo(carregarModo());
  }, []);

  function alternar() {
    // Saindo do tema automático de Outubro Rosa, ou saindo do modo claro,
    // vai para o modo escuro padrão do sistema; do escuro, volta pro claro.
    const novo = modo === "escuro" ? "claro" : "escuro";
    setModo(novo);
    salvarModo(novo);
    aplicarModo(novo);
  }

  const emOutubroRosa = modo === "rosa";
  const titulo = emOutubroRosa
    ? "Tema Outubro Rosa ativo — clique para usar as cores padrão do sistema"
    : modo === "claro"
      ? "Modo escuro"
      : "Modo claro";
  const Icone = emOutubroRosa ? Heart : modo === "claro" ? Moon : Sun;
  const corIcone = emOutubroRosa ? { color: "#D93275" } : undefined;

  if (topbar) {
    return (
      <button
        onClick={alternar}
        title={titulo}
        className="w-9 h-9 rounded-lg flex items-center justify-center text-muted hover:bg-canvas hover:text-ink transition"
      >
        <Icone size={17} style={corIcone} fill={emOutubroRosa ? "#D93275" : "none"} />
      </button>
    );
  }

  return (
    <button
      onClick={alternar}
      title={recolhido ? titulo : undefined}
      className={`w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-white/60 hover:bg-white/10 hover:text-white transition ${recolhido ? "justify-center" : ""}`}
    >
      <Icone size={16} strokeWidth={2} className="shrink-0" style={corIcone} fill={emOutubroRosa ? "#D93275" : "none"} />
      {!recolhido && (emOutubroRosa ? "Outubro Rosa ativo" : modo === "claro" ? "Modo escuro" : "Modo claro")}
    </button>
  );
}
