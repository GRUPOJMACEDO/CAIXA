"use client";
import { useEffect, useState } from "react";
import { Heart } from "lucide-react";
import { estaEmOutubro, carregarModo, alternarOutubroRosa, aoMudarTema } from "../lib/tema";

// Fica sempre visível durante outubro — mesmo depois de alguém "tirar"
// o tema rosa pelo botão de claro/escuro — pra poder religar o
// Outubro Rosa a qualquer momento, sem precisar esperar o mês seguinte.
export default function BotaoOutubroRosa({ recolhido, topbar }) {
  const [modo, setModo] = useState("claro");

  useEffect(() => {
    const atualizar = () => setModo(carregarModo());
    atualizar();
    return aoMudarTema(atualizar);
  }, []);

  if (!estaEmOutubro()) return null;

  const ativo = modo === "rosa";
  const titulo = ativo
    ? "Tema Outubro Rosa ativo — clique para usar as cores padrão do sistema"
    : "Ativar o tema Outubro Rosa";

  if (topbar) {
    return (
      <button
        onClick={alternarOutubroRosa}
        title={titulo}
        className={`w-9 h-9 rounded-lg flex items-center justify-center transition ${ativo ? "hover:bg-[#D93275]/10" : "hover:bg-canvas"}`}
        style={{ color: "#D93275" }}
      >
        <Heart size={17} fill={ativo ? "#D93275" : "none"} />
      </button>
    );
  }

  return (
    <button
      onClick={alternarOutubroRosa}
      title={recolhido ? titulo : undefined}
      className={`w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm hover:bg-white/10 transition ${recolhido ? "justify-center" : ""} ${ativo ? "text-white" : "text-white/60"}`}
    >
      <Heart size={16} strokeWidth={2} className="shrink-0" fill={ativo ? "#D93275" : "none"} style={{ color: "#D93275" }} />
      {!recolhido && (ativo ? "Outubro Rosa ativo" : "Ativar Outubro Rosa")}
    </button>
  );
}
