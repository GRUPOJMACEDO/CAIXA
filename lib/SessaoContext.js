"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "./supabaseClient";
import { podeVerTodasUnidades } from "./permissions";

const SessaoContext = createContext(null);

export function SessaoProvider({ children }) {
  const [usuario, setUsuario] = useState(null);
  const [unidades, setUnidades] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [modoLinha, setModoLinha] = useState("todos"); // "todos" | "ci" | "ih"
  const [marcasFiltro, setMarcasFiltro] = useState([]); // [] = todas as marcas
  const router = useRouter();

  useEffect(() => {
    let ativo = true;
    (async () => {
      const { data: sessao } = await supabase.auth.getSession();
      if (!sessao.session) {
        if (ativo) {
          setCarregando(false);
          router.replace("/login");
        }
        return;
      }
      const uid = sessao.session.user.id;

      if (sessao.session.user.user_metadata?.requer_troca_senha) {
        if (ativo) setCarregando(false);
        if (typeof window !== "undefined" && window.location.pathname !== "/trocar-senha") {
          router.replace("/trocar-senha");
        }
        return;
      }

      const { data: perfil } = await supabase.from("usuarios").select("*").eq("id", uid).single();

      let listaUnidades = [];
      if (perfil && podeVerTodasUnidades(perfil.cargo)) {
        const { data: todas } = await supabase.from("unidades").select("id, nome, atende_ci, atende_ih").eq("ativo", true).order("nome");
        listaUnidades = todas || [];
      } else {
        const { data: minhas } = await supabase
          .from("usuario_unidades")
          .select("unidades(id, nome, atende_ci, atende_ih)")
          .eq("usuario_id", uid);
        listaUnidades = (minhas || []).map((m) => m.unidades).filter(Boolean);
      }

      if (ativo) {
        setUsuario(perfil);
        setUnidades(listaUnidades);
        if (typeof window !== "undefined") {
          setModoLinha(window.localStorage.getItem(`modoLinha:${uid}`) || "todos");
          try {
            const salvas = JSON.parse(window.localStorage.getItem(`marcasFiltro:${uid}`) || "[]");
            setMarcasFiltro(Array.isArray(salvas) ? salvas : []);
          } catch {
            setMarcasFiltro([]);
          }
        }
        setCarregando(false);
      }
    })();
    return () => {
      ativo = false;
    };
  }, [router]);

  async function sair() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  // gestão (sem linha fixa no cadastro) com acesso a mais de uma unidade,
  // sendo que pelo menos uma delas atende IH — só esse grupo vê o seletor
  const podeAlternarLinha =
    !!usuario && !usuario.linha && unidades.length > 1 && unidades.some((u) => u.atende_ih);

  function definirModoLinha(novoModo) {
    setModoLinha(novoModo);
    if (typeof window !== "undefined" && usuario) {
      window.localStorage.setItem(`modoLinha:${usuario.id}`, novoModo);
    }
  }

  // marca = primeira palavra do nome da unidade (CSP, MSC, ESC, INSS...)
  const marcasDisponiveis = [...new Set(unidades.map((u) => u.nome.split(" ")[0]))].sort();

  function definirMarcasFiltro(novasMarcas) {
    setMarcasFiltro(novasMarcas);
    if (typeof window !== "undefined" && usuario) {
      window.localStorage.setItem(`marcasFiltro:${usuario.id}`, JSON.stringify(novasMarcas));
    }
  }

  // linha usada para filtrar consultas: fixa pelo login, ou pelo seletor
  // (gestão); null = sem filtro (mostra CI e IH juntos, cada um em sua linha)
  const linhaFiltro = usuario?.linha || (podeAlternarLinha && modoLinha !== "todos" ? modoLinha : null);

  return (
    <SessaoContext.Provider
      value={{
        usuario,
        unidades,
        carregando,
        sair,
        modoLinha,
        definirModoLinha,
        podeAlternarLinha,
        linhaFiltro,
        marcasFiltro,
        definirMarcasFiltro,
        marcasDisponiveis,
      }}
    >
      {children}
    </SessaoContext.Provider>
  );
}

export function useSessao() {
  const ctx = useContext(SessaoContext);
  if (!ctx) throw new Error("useSessao precisa estar dentro de <SessaoProvider>");
  return ctx;
}
