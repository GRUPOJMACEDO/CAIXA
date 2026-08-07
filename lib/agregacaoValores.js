/**
 * Busca os valores agregados por unidade + linha (CI/IH) para um
 * período qualquer (data início inclusiva, data fim EXCLUSIVA).
 *
 * Chama a função `valores_por_periodo` do banco (SECURITY DEFINER)
 * em vez de consultar a tabela `lancamentos` direto — assim o
 * ranking continua mostrando o valor real de TODAS as unidades pra
 * qualquer pessoa logada, igual sempre foi (a regra de segurança
 * por unidade só se aplica ao detalhe por-lançamento, não ao
 * ranking agregado).
 */
export async function buscarValoresPorPeriodo(supabase, dataInicioIncl, dataFimExcl, linhaFiltro) {
  const { data, error } = await supabase.rpc("valores_por_periodo", {
    data_inicio: dataInicioIncl,
    data_fim_excl: dataFimExcl,
    linha_param: linhaFiltro || null,
  });
  if (error) {
    console.error("Erro ao buscar valores_por_periodo:", error.message);
    return [];
  }
  const linhas = data || [];
  // modo "CI + IH" (sem filtro de linha): soma as duas numa linha só por
  // unidade, em vez de mostrar CI e IH separados
  return linhaFiltro ? linhas : mesclarPorUnidade(linhas);
}

export function mesclarPorUnidade(linhas) {
  const mapa = new Map();
  linhas.forEach((l) => {
    if (!mapa.has(l.unidade_id)) {
      mapa.set(l.unidade_id, {
        unidade_id: l.unidade_id,
        unidade_nome: l.unidade_nome,
        linha: null,
        orcamento_aprovado: 0,
        valor_pago: 0,
        qtd_os: 0,
      });
    }
    const acc = mapa.get(l.unidade_id);
    acc.orcamento_aprovado += Number(l.orcamento_aprovado);
    acc.valor_pago += Number(l.valor_pago);
    acc.qtd_os += Number(l.qtd_os);
  });
  return [...mapa.values()];
}
