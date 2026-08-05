"use client";
import { useEffect, useRef, useState } from "react";
import { MessageCircle, Send, Bell, BellOff, X } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useSessao } from "../lib/SessaoContext";

const INTERVALO_VERIFICACAO_MS = 20000;

function formatarDataHora(iso) {
  const d = new Date(iso);
  const hoje = new Date();
  const mesmoDia = d.toDateString() === hoje.toDateString();
  const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  if (mesmoDia) return hora;
  return `${d.toLocaleDateString("pt-BR")} ${hora}`;
}

export default function BotaoMural() {
  const { usuario } = useSessao();
  const [aberto, setAberto] = useState(false);
  const [mensagens, setMensagens] = useState([]);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [naoLidas, setNaoLidas] = useState(0);
  const [notificacoesAtivas, setNotificacoesAtivas] = useState(true);
  const [carregandoInicial, setCarregandoInicial] = useState(true);
  const listaRef = useRef(null);

  async function garantirStatus() {
    const { data } = await supabase.from("mural_status_usuario").select("*").eq("usuario_id", usuario.id).maybeSingle();
    if (data) {
      setNotificacoesAtivas(data.notificacoes_ativas);
      return data;
    }
    const { data: criado } = await supabase
      .from("mural_status_usuario")
      .insert({ usuario_id: usuario.id })
      .select()
      .single();
    return criado;
  }

  async function verificarNaoLidas() {
    const status = await garantirStatus();
    if (!status || status.notificacoes_ativas === false) {
      setNaoLidas(0);
      return;
    }
    const { count } = await supabase
      .from("mural_mensagens")
      .select("id", { count: "exact", head: true })
      .gt("criado_em", status.ultima_leitura)
      .neq("usuario_id", usuario.id);
    setNaoLidas(count || 0);
  }

  useEffect(() => {
    verificarNaoLidas().finally(() => setCarregandoInicial(false));
    const intervalo = setInterval(verificarNaoLidas, INTERVALO_VERIFICACAO_MS);
    return () => clearInterval(intervalo);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function carregarMensagens() {
    const { data } = await supabase
      .from("mural_mensagens")
      .select("id, texto, criado_em, usuarios(nome_completo, login)")
      .order("criado_em", { ascending: true })
      .limit(200);
    setMensagens(data || []);
    setTimeout(() => {
      if (listaRef.current) listaRef.current.scrollTop = listaRef.current.scrollHeight;
    }, 50);
  }

  async function abrirMural() {
    setAberto(true);
    await carregarMensagens();
    await supabase
      .from("mural_status_usuario")
      .upsert({ usuario_id: usuario.id, ultima_leitura: new Date().toISOString() }, { onConflict: "usuario_id" });
    setNaoLidas(0);
  }

  async function enviar(e) {
    e.preventDefault();
    const conteudo = texto.trim();
    if (!conteudo) return;
    setEnviando(true);
    const { error } = await supabase.from("mural_mensagens").insert({ usuario_id: usuario.id, texto: conteudo });
    setEnviando(false);
    if (error) {
      alert("Não foi possível enviar: " + error.message);
      return;
    }
    setTexto("");
    await carregarMensagens();
    await supabase
      .from("mural_status_usuario")
      .upsert({ usuario_id: usuario.id, ultima_leitura: new Date().toISOString() }, { onConflict: "usuario_id" });
  }

  async function alternarNotificacoes() {
    const novoValor = !notificacoesAtivas;
    setNotificacoesAtivas(novoValor);
    await supabase
      .from("mural_status_usuario")
      .upsert({ usuario_id: usuario.id, notificacoes_ativas: novoValor }, { onConflict: "usuario_id" });
    if (!novoValor) setNaoLidas(0);
  }

  return (
    <>
      <button
        onClick={abrirMural}
        title="Mural — mensagens da equipe"
        className="relative text-muted hover:text-gold transition"
      >
        <MessageCircle size={19} />
        {!carregandoInicial && naoLidas > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-danger text-white text-[10px] flex items-center justify-center font-medium">
            {naoLidas > 99 ? "99+" : naoLidas}
          </span>
        )}
      </button>

      {aberto && (
        <div className="fixed inset-0 z-50 flex items-start justify-end p-4 sm:p-6" onClick={() => setAberto(false)}>
          <div className="absolute inset-0 bg-ink/20" />
          <div
            className="relative w-full max-w-sm bg-white rounded-xl2 shadow-2xl border border-line flex flex-col mt-14 max-h-[75vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-line shrink-0">
              <div className="flex items-center gap-2">
                <MessageCircle size={16} className="text-gold" />
                <p className="font-display text-sm font-semibold text-ink">Mural da equipe</p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={alternarNotificacoes}
                  title={notificacoesAtivas ? "Desligar notificações" : "Ligar notificações"}
                  className="text-muted hover:text-ink transition p-1"
                >
                  {notificacoesAtivas ? <Bell size={15} /> : <BellOff size={15} />}
                </button>
                <button onClick={() => setAberto(false)} className="text-muted hover:text-ink transition p-1">
                  <X size={16} />
                </button>
              </div>
            </div>

            <div ref={listaRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-[200px]">
              {mensagens.length === 0 && (
                <p className="text-sm text-muted text-center py-8">Nenhuma mensagem ainda — seja o primeiro a escrever.</p>
              )}
              {mensagens.map((m) => (
                <div key={m.id} className="text-sm">
                  <div className="flex items-baseline gap-1.5">
                    <span className="font-semibold text-ink">{m.usuarios?.nome_completo || "—"}</span>
                    <span className="text-[11px] text-muted font-mono-num">@{m.usuarios?.login}</span>
                    <span className="text-[11px] text-muted ml-auto shrink-0">{formatarDataHora(m.criado_em)}</span>
                  </div>
                  <p className="text-ink mt-0.5 break-words">{m.texto}</p>
                </div>
              ))}
            </div>

            <form onSubmit={enviar} className="border-t border-line p-3 shrink-0">
              <div className="flex items-end gap-2">
                <textarea
                  className="field-input flex-1 resize-none text-sm"
                  rows={2}
                  maxLength={280}
                  placeholder="Escreva uma mensagem para a equipe…"
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      enviar(e);
                    }
                  }}
                />
                <button type="submit" className="btn-primary w-9 h-9 p-0 flex items-center justify-center shrink-0" disabled={enviando || !texto.trim()}>
                  <Send size={15} />
                </button>
              </div>
              <p className="text-[10px] text-muted mt-1">{texto.length}/280</p>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
