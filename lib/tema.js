// Modo claro/escuro — simples, salvo por navegador (localStorage).
//
// Outubro Rosa: durante o mês de outubro, o sistema abre sozinho no
// tema especial "Outubro Rosa" (data-theme="rosa") — mesmo que a
// pessoa já tenha escolhido claro/escuro antes. Um clique no botão de
// claro/escuro (ou no coração, pra "tirar" o rosa) faz esse navegador
// sair do tema rosa nesse mês. O coração fica sempre visível durante
// outubro, mesmo depois de alguém tirar o tema, pra poder colocar o
// rosa de volta a qualquer momento. No mês seguinte a marca de saída
// nem importa mais: o sistema já volta sozinho pras cores padrão.
const CHAVE = "caixa-jmacedo:modo";
const EVENTO = "caixa-jmacedo:tema-mudou";

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

// A preferência de claro/escuro salva de fato (null = a pessoa nunca
// escolheu nesse navegador).
export function modoSalvo() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(CHAVE);
}

// O modo que deve valer agora, já considerando o Outubro Rosa.
export function carregarModo() {
  if (estaEmOutubro() && !saiuDoOutubroRosa()) return "rosa";
  return modoSalvo() || "claro";
}

function aplicar(modo) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", modo);
  window.dispatchEvent(new Event(EVENTO));
}

// Compatibilidade com quem só precisa aplicar um modo já calculado
// (ex.: no carregamento da página, via TemaProvider).
export const aplicarModo = aplicar;

// Avisa quando o tema muda (por qualquer um dos dois botões), pra
// manter os controles sincronizados entre si.
export function aoMudarTema(callback) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(EVENTO, callback);
  return () => window.removeEventListener(EVENTO, callback);
}

// Botão claro/escuro: alterna a preferência de sempre. Se o Outubro
// Rosa automático estava ativo, esse clique também "tira" o rosa
// deste outubro — a pessoa escolheu uma cor específica, de propósito.
export function alternarClaroEscuro() {
  if (typeof window === "undefined") return;
  const atual = carregarModo();
  const baseAtual = atual === "rosa" ? modoSalvo() || "claro" : atual;
  const novo = baseAtual === "escuro" ? "claro" : "escuro";
  window.localStorage.setItem(CHAVE, novo);
  if (estaEmOutubro()) window.localStorage.setItem(chaveSaidaOutubroRosa(), "1");
  aplicar(novo);
}

// Botão coração: liga/desliga o Outubro Rosa, sem mexer na preferência
// de claro/escuro de sempre.
export function alternarOutubroRosa() {
  if (typeof window === "undefined") return;
  if (carregarModo() === "rosa") {
    window.localStorage.setItem(chaveSaidaOutubroRosa(), "1");
    aplicar(modoSalvo() || "claro");
  } else {
    window.localStorage.removeItem(chaveSaidaOutubroRosa());
    aplicar("rosa");
  }
}
