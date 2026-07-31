// Matriz de permissões — Grupo J.Macedo

export const CARGOS = {
  OPERACIONAL: "operacional",
  SUPERVISAO: "supervisao",
  GERENCIA: "gerencia",
  ADMINISTRADOR: "administrador",
  DIRETOR: "diretor",
};

// Rótulos exibidos na tela — sempre com acentuação correta.
// O valor salvo no banco (enum) fica sem acento por segurança/compatibilidade.
export const CARGO_LABELS = {
  [CARGOS.OPERACIONAL]: "Operacional",
  [CARGOS.SUPERVISAO]: "Supervisão",
  [CARGOS.GERENCIA]: "Gerência",
  [CARGOS.ADMINISTRADOR]: "Administrador",
  [CARGOS.DIRETOR]: "Diretor",
};

export function rotuloCargo(cargo) {
  return CARGO_LABELS[cargo] || cargo;
}

export function podeAlterar(cargo) {
  return [CARGOS.SUPERVISAO, CARGOS.GERENCIA, CARGOS.ADMINISTRADOR, CARGOS.DIRETOR].includes(cargo);
}

export function podeExcluir(cargo) {
  return [CARGOS.GERENCIA, CARGOS.ADMINISTRADOR, CARGOS.DIRETOR].includes(cargo);
}

// Data do lançamento no passado (retroativo)
export function podeLancarDataRetroativa(cargo) {
  return [CARGOS.SUPERVISAO, CARGOS.GERENCIA, CARGOS.ADMINISTRADOR, CARGOS.DIRETOR].includes(cargo);
}

export function podeVerTodasUnidades(cargo) {
  return [CARGOS.ADMINISTRADOR, CARGOS.DIRETOR].includes(cargo);
}

// Quantas unidades um cargo pode ter vinculadas no cadastro de usuário
export function limiteUnidadesPorCargo(cargo) {
  if (cargo === CARGOS.OPERACIONAL || cargo === CARGOS.SUPERVISAO) return 1;
  if (cargo === CARGOS.GERENCIA) return null; // sem limite definido, várias
  return null; // administrador/diretor: todas, automaticamente
}

// --- Matriz de "Configurações" (cadastros) ---
export function podeConfigTiposServico(cargo) {
  return [CARGOS.GERENCIA, CARGOS.ADMINISTRADOR, CARGOS.DIRETOR].includes(cargo);
}
export function podeConfigCategorias(cargo) {
  return [CARGOS.GERENCIA, CARGOS.ADMINISTRADOR, CARGOS.DIRETOR].includes(cargo);
}
export function podeConfigModelos(cargo) {
  return [CARGOS.SUPERVISAO, CARGOS.GERENCIA, CARGOS.ADMINISTRADOR, CARGOS.DIRETOR].includes(cargo);
}
export function podeConfigUnidades(cargo) {
  return [CARGOS.ADMINISTRADOR, CARGOS.DIRETOR].includes(cargo);
}
export function podeConfigUsuarios(cargo) {
  return [CARGOS.SUPERVISAO, CARGOS.GERENCIA, CARGOS.ADMINISTRADOR, CARGOS.DIRETOR].includes(cargo);
}
export function podeConfigMetas(cargo) {
  return [CARGOS.GERENCIA, CARGOS.ADMINISTRADOR, CARGOS.DIRETOR].includes(cargo);
}
// Log do sistema: Administrador vê tudo; Gerência vê o log das suas unidades.
export function podeVerLogAuditoria(cargo) {
  return [CARGOS.GERENCIA, CARGOS.ADMINISTRADOR, CARGOS.DIRETOR].includes(cargo);
}
// Solicitações de "esqueci minha senha" — mesma regra de acesso a Usuários
export function podeVerSolicitacoesSenha(cargo) {
  return [CARGOS.SUPERVISAO, CARGOS.GERENCIA, CARGOS.ADMINISTRADOR, CARGOS.DIRETOR].includes(cargo);
}
export function temAcessoConfiguracoes(cargo) {
  return (
    podeConfigTiposServico(cargo) ||
    podeConfigCategorias(cargo) ||
    podeConfigModelos(cargo) ||
    podeConfigUnidades(cargo) ||
    podeConfigUsuarios(cargo) ||
    podeConfigMetas(cargo)
  );
}

// mantidos por compatibilidade com telas já existentes
export const podeCadastrarTipoServicoOuModelo = podeConfigModelos;
export const podeCadastrarUsuarioOuUnidade = podeConfigUnidades;
export const podeEditarMeta = podeConfigMetas;
