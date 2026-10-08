"use client";
import { Info } from "lucide-react";

/**
 * Card de indicador do Financeiro. Ao passar o mouse (ou focar com o
 * teclado), abre um balão explicando o que o número significa e qual
 * conta foi feita, já com os valores do filtro atual.
 *
 * explicacao = { titulo?, texto, calculo: [linha, linha...] }
 */
export default function CardExplicado({ cor, icone: Icone, titulo, valor, rodape, destaque, explicacao, alinharBalao = "esquerda" }) {
  return (
    <div className="relative group" tabIndex={0}>
      <div
        className={`card overflow-hidden h-full transition group-hover:shadow-md group-focus:shadow-md ${destaque ? "border-2" : ""}`}
        style={destaque ? { borderColor: `${cor}80` } : undefined}
      >
        <div className="h-1.5" style={{ background: cor }} />
        <div className="p-4">
          <div className="flex items-start justify-between">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center mb-2" style={{ background: `${cor}1A`, color: cor }}>
              <Icone size={16} />
            </div>
            {explicacao && <Info size={13} className="text-muted opacity-60 group-hover:opacity-100" />}
          </div>
          <p className="text-xs text-muted mb-1">{titulo}</p>
          <p className="font-mono-num text-xl font-semibold" style={{ color: destaque ? cor : undefined }}>{valor}</p>
          {rodape && <p className="text-[10px] text-muted mt-1 leading-snug">{rodape}</p>}
        </div>
      </div>
      {explicacao && (
        <div
          role="tooltip"
          className={`pointer-events-none absolute top-full mt-2 z-40 w-80 rounded-xl border border-line bg-panel shadow-xl p-4 text-left
            opacity-0 translate-y-1 group-hover:opacity-100 group-hover:translate-y-0 group-focus:opacity-100 group-focus:translate-y-0 transition
            ${alinharBalao === "direita" ? "right-0" : "left-0"} print:hidden`}
        >
          <p className="text-xs font-semibold text-ink mb-1">{explicacao.titulo || titulo}</p>
          <p className="text-xs text-muted leading-relaxed">{explicacao.texto}</p>
          {explicacao.calculo?.length > 0 && (
            <div className="mt-2.5 rounded-lg bg-canvas px-3 py-2">
              <p className="text-[10px] uppercase tracking-wider text-muted mb-1">Cálculo</p>
              {explicacao.calculo.map((linha, i) => (
                <p key={i} className="text-xs font-mono-num text-ink leading-relaxed">{linha}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
