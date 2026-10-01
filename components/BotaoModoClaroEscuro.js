"use client";
import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";
import { carregarModo, modoSalvo, alternarClaroEscuro, aoMudarTema } from "../lib/tema";

// Quando o Outubro Rosa está ativo, esse botão reflete a preferência
// de claro/escuro "de baixo" dele — clicar aqui sai do rosa e aplica
// essa cor específica (ver lib/tema.js).
function baseClaroOuEscuro(modo) {
  return modo === "rosa" ? modoSalvo() || "claro" : modo;
}

export default function BotaoModoClaroEscuro({ recolhido, topbar }) {
  const [modo, setModo] = useState("claro");

  useEffect(() => {
    const atualizar = () => setModo(carregarModo());
    atualizar();
    return aoMudarTema(atualizar);
  }, []);

  const base = baseClaroOuEscuro(modo);
  const titulo = base === "claro" ? "Modo escuro" : "Modo claro";
  const Icone = base === "claro" ? Moon : Sun;

  if (topbar) {
    return (
      <button
        onClick={alternarClaroEscuro}
        title={titulo}
        className="w-9 h-9 rounded-lg flex items-center justify-center text-muted hover:bg-canvas hover:text-ink transition"
      >
        <Icone size={17} />
      </button>
    );
  }

  return (
    <button
      onClick={alternarClaroEscuro}
      title={recolhido ? titulo : undefined}
      className={`w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-white/60 hover:bg-white/10 hover:text-white transition ${recolhido ? "justify-center" : ""}`}
    >
      <Icone size={16} strokeWidth={2} className="shrink-0" />
      {!recolhido && titulo}
    </button>
  );
}
