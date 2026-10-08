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

export function pct(parte, todo) {
  return Number(todo) ? (Number(parte) / Number(todo)) * 100 : 0;
}

// Rótulo de uma linha de "por modalidade" (tipo_taxa/parcelas ou forma sem taxa)
export function rotuloModalidade(m) {
  if (m.tipo_taxa) return rotuloProduto(m.tipo_taxa, m.parcelas);
  const f = (m.forma || "").toUpperCase();
  return f.charAt(0) + f.slice(1).toLowerCase();
}

// Junta linhas "por modalidade" de vários períodos numa só
export function somarModalidades(listas) {
  const mapa = new Map();
  listas.flat().forEach((m) => {
    const chave = `${m.tipo_taxa || ""}|${m.parcelas || ""}|${m.tipo_taxa ? "" : m.forma || ""}`;
    if (!mapa.has(chave)) mapa.set(chave, { forma: m.forma, tipo_taxa: m.tipo_taxa, parcelas: m.parcelas, valor: 0, valor_taxas: 0, qtd: 0 });
    const acc = mapa.get(chave);
    acc.valor += Number(m.valor);
    acc.valor_taxas += Number(m.valor_taxas);
    acc.qtd += Number(m.qtd);
  });
  return [...mapa.values()];
}

// Débito / Crédito à vista / Parcelado / Outros a partir de "por modalidade"
export function quebraPorGrupo(modalidades) {
  const g = { debito: { valor: 0, taxas: 0 }, vista: { valor: 0, taxas: 0 }, parcelado: { valor: 0, taxas: 0 }, outros: { valor: 0, taxas: 0 } };
  modalidades.forEach((m) => {
    const k = m.tipo_taxa === "debito" ? "debito" : m.tipo_taxa === "credito" ? (Number(m.parcelas) > 1 ? "parcelado" : "vista") : "outros";
    g[k].valor += Number(m.valor);
    g[k].taxas += Number(m.valor_taxas);
  });
  return g;
}
