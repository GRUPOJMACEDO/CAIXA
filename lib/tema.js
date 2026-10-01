// Modo claro/escuro — simples, salvo por navegador (localStorage).
//
// Outubro Rosa: durante o mês de outubro, se a pessoa nunca escolheu um
// modo nesse navegador, o sistema abre sozinho no tema especial
// "Outubro Rosa" (data-theme="rosa"). Assim que ela clicar no botão de
// claro/escuro, a escolha dela (clara ou escura, a de sempre) fica
// salva e passa a valer sempre a partir daí — inclusive depois que
// outubro terminar.
const CHAVE = "caixa-jmacedo:modo";

export function estaEmOutubro(data = new Date()) {
  return data.getMonth() === 9; // 0 = janeiro … 9 = outubro
}

// O que está salvo de fato no navegador (null = a pessoa nunca clicou
// no botão de claro/escuro aqui).
export function modoSalvo() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(CHAVE);
}

// O modo que deve valer agora, já considerando o Outubro Rosa.
export function carregarModo() {
  const salvo = modoSalvo();
  if (salvo) return salvo;
  return estaEmOutubro() ? "rosa" : "claro";
}

export function salvarModo(modo) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CHAVE, modo);
}

export function aplicarModo(modo) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", modo);
}
