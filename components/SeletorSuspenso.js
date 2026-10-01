"use client";
import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

/**
 * Seletor de múltipla escolha, suspenso — abre numa lista com checkboxes,
 * fecha ao clicar fora. Usado em qualquer filtro que precise marcar mais
 * de um item (unidades, meses, etc.) sem precisar de Ctrl/Shift + clique
 * como num <select multiple> nativo.
 */
export default function SeletorSuspenso({ rotulo, icone: Icone, opcoes, selecionados, onChange, rotuloTudo = "Todas", largura = "w-64" }) {
  const [aberto, setAberto] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function aoClicarFora(e) {
      if (ref.current && !ref.current.contains(e.target)) setAberto(false);
    }
    window.addEventListener("mousedown", aoClicarFora);
    return () => window.removeEventListener("mousedown", aoClicarFora);
  }, []);

  function alternar(valor) {
    onChange(selecionados.includes(valor) ? selecionados.filter((v) => v !== valor) : [...selecionados, valor]);
  }

  const rotuloBotao =
    selecionados.length === 0
      ? rotuloTudo
      : selecionados.length === 1
        ? opcoes.find((o) => o.valor === selecionados[0])?.rotulo || "1 selecionada"
        : `${selecionados.length} selecionadas`;

  return (
    <div className={`relative ${largura}`} ref={ref}>
      {rotulo && (
        <p className="text-[11px] font-semibold text-muted uppercase tracking-wide mb-1.5 flex items-center gap-1">
          {Icone && <Icone size={11} />} {rotulo}
        </p>
      )}
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="field-input text-sm w-full flex items-center justify-between text-left"
      >
        <span className="truncate">{rotuloBotao}</span>
        <ChevronDown size={14} className={`shrink-0 transition-transform ${aberto ? "rotate-180" : ""}`} />
      </button>
      {aberto && (
        <div className="absolute z-20 mt-1 w-full max-h-64 overflow-y-auto bg-white border border-line rounded-lg shadow-lg">
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-line bg-canvas/50">
            <button type="button" className="text-[11px] text-gold hover:underline" onClick={() => onChange(opcoes.map((o) => o.valor))}>
              Selecionar todas
            </button>
            <button type="button" className="text-[11px] text-muted hover:underline" onClick={() => onChange([])}>
              Limpar
            </button>
          </div>
          {opcoes.map((o) => (
            <label key={o.valor} className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-canvas cursor-pointer">
              <input type="checkbox" checked={selecionados.includes(o.valor)} onChange={() => alternar(o.valor)} />
              {o.rotulo}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
