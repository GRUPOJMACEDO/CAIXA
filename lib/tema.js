// Modo claro/escuro — simples, salvo por navegador (localStorage).
//
// Outubro Rosa: durante o mês de outubro, o sistema abre sozinho no
// tema especial "Outubro Rosa" (data-theme="rosa") — mesmo que a
// pessoa já tenha escolhido claro/escuro antes (quase todo mundo já
// escolheu, de algum uso anterior). Só quando ela clicar no botão de
// claro/escuro DURANTE outubro é que esse navegador sai do tema rosa
// e passa a usar a escolha de sempre (clara ou escura) — nesse mês.
// No mês seguinte a outubro, a marca de "saí do rosa" nem importa
// mais: o sistema já volta sozinho pras cores padrão.
const CHAVE = "caixa-jmacedo:modo";

export function estaEmOutubro(data = new Date()) {
  return data.getMonth() === 9; // 0 = janeiro … 9 = outubro
}

function chaveSaidaOutubroRosa(data = new Date()) {
  // inclui o ano pra a marca nunca "vazar" de um outubro pro outro
  return `caixa-jmacedo:saiu-outubro-rosa:${data.getFullYear()}`;
}

function saiuDoOutubroRosa() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(chaveSaidaOutubroRosa()) === "1";
}

function marcarSaidaDoOutubroRosa() {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(chaveSaidaOutubroRosa(), "1");
}

// O que está salvo de fato no navegador (null = a pessoa nunca clicou
// no botão de claro/escuro aqui).
export function modoSalvo() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(CHAVE);
}

// O modo que deve valer agora, já considerando o Outubro Rosa.
export function carregarModo() {
  if (estaEmOutubro() && !saiuDoOutubroRosa()) return "rosa";
  return modoSalvo() || "claro";
}

export function salvarModo(modo) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CHAVE, modo);
  // Clicou no botão durante outubro: a partir de agora esse navegador
  // usa a cor escolhida (claro/escuro), não mais o rosa automático —
  // só até o fim do mês, já que a marca é por ano/outubro.
  if (estaEmOutubro()) marcarSaidaDoOutubroRosa();
}

export function aplicarModo(modo) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", modo);
}
