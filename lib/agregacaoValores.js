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
  return data || [];
}
