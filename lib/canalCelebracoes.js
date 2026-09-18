"use client";
import { supabase } from "./supabaseClient";

// Canal público único (tópico "celebracoes"), compartilhado entre quem
// RECEBE (BalaoNotificacoes, que registra os handlers e assina uma única
// vez) e quem só MANDA (BotaoReacoes, via enviarCelebracao). O Realtime do
// Supabase não permite duas assinaturas (`subscribe()`) separadas no mesmo
// tópico — por isso existe só UMA instância deste canal em todo o app.
let canal = null;

/** Cria o canal, deixa o chamador registrar os handlers e então assina. */
export function configurarCelebracoes(configurar) {
  canal = supabase.channel("celebracoes");
  configurar(canal);
  canal.subscribe();
  return canal;
}

export function limparCelebracoes() {
  if (canal) {
    supabase.removeChannel(canal);
    canal = null;
  }
}

/** Manda um broadcast público nesse canal (usado por quem só envia, sem assinar). */
export function enviarCelebracao(event, payload) {
  if (!canal) return false;
  canal.send({ type: "broadcast", event, payload });
  return true;
}
