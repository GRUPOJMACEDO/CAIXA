// Taxas do Cartão (Financeiro) — produtos na ordem da tabela da Cielo.
// tipo "debito" só tem 1x; "credito" 1x = Crédito à vista, 2x..12x = Parcelado.
export const PRODUTOS_TAXA = [
  { tipo: "debito", parcelas: 1 },
  ...Array.from({ length: 12 }, (_, i) => ({ tipo: "credito", parcelas: i + 1 })),
];

export function chaveTaxa(tipo, parcelas) {
  return `${tipo}-${tipo === "debito" ? 1 : parcelas || 1}`;
}

export function rotuloProduto(tipo, parcelas) {
  if (tipo === "debito") return "Débito";
  if (tipo === "credito") return !parcelas || Number(parcelas) <= 1 ? "Crédito" : `Parcelado ${parcelas}x`;
  return "";
}

// "3,08" | "3.08" | 3.08 -> 3.08 (null se inválido)
export function lerPercentual(texto) {
  if (texto === null || texto === undefined) return null;
  const limpo = String(texto).replace("%", "").replace(/\s/g, "").replace(",", ".");
  if (limpo === "") return null;
  const n = Number(limpo);
  if (!Number.isFinite(n) || n < 0 || n >= 100) return null;
  return Math.round(n * 1000) / 1000;
}

export function formatarPercentual(valor, casas = 2) {
  const n = Number(valor) || 0;
  return `${n.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`;
}
