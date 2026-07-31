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
        const { data: todas } = await supabase.from("unidades").select("id, nome").eq("ativo", true).order("nome");
        listaUnidades = todas || [];
      } else {
        const { data: minhas } = await supabase
          .from("usuario_unidades")
          .select("unidades(id, nome)")
          .eq("usuario_id", uid);
        listaUnidades = (minhas || []).map((m) => m.unidades).filter(Boolean);
      }

      if (ativo) {
        setUsuario(perfil);
        setUnidades(listaUnidades);
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

  return (
    <SessaoContext.Provider value={{ usuario, unidades, carregando, sair }}>
      {children}
    </SessaoContext.Provider>
  );
}

export function useSessao() {
  const ctx = useContext(SessaoContext);
  if (!ctx) throw new Error("useSessao precisa estar dentro de <SessaoProvider>");
  return ctx;
}
