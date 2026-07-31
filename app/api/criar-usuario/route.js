import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";

const SENHA_PADRAO = "jmacedo001";

async function usuarioAutenticado(request, admin) {
  const token = request.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return null;
  const { data: perfil } = await admin.from("usuarios").select("*").eq("id", data.user.id).single();
  return perfil;
}

const CARGOS_PODEM_CRIAR = ["supervisao", "gerencia", "administrador", "diretor"];

export async function POST(request) {
  try {
    const admin = supabaseAdmin();
    const chamador = await usuarioAutenticado(request, admin);
    if (!chamador || !CARGOS_PODEM_CRIAR.includes(chamador.cargo)) {
      return NextResponse.json({ erro: "Sem permissão para criar usuários." }, { status: 403 });
    }

    const { nome, sobrenome, cargo, unidadeIds } = await request.json();
    const login = `${nome}.${sobrenome}`.toLowerCase().replace(/\s/g, "");
    const email = `${login}@jmacedo.internal`;

    const { data: novoUsuario, error: erroAuth } = await admin.auth.admin.createUser({
      email,
      password: SENHA_PADRAO,
      email_confirm: true,
      user_metadata: { requer_troca_senha: true },
    });
    if (erroAuth) return NextResponse.json({ erro: erroAuth.message }, { status: 400 });

    const { error: erroPerfil } = await admin.from("usuarios").insert({
      id: novoUsuario.user.id,
      nome_completo: `${nome} ${sobrenome}`.toUpperCase(),
      login,
      cargo,
    });
    if (erroPerfil) return NextResponse.json({ erro: erroPerfil.message }, { status: 400 });

    if (unidadeIds?.length) {
      await admin.from("usuario_unidades").insert(unidadeIds.map((unidade_id) => ({ usuario_id: novoUsuario.user.id, unidade_id })));
    }

    return NextResponse.json({ login, senhaInicial: SENHA_PADRAO });
  } catch (err) {
    return NextResponse.json({ erro: err.message }, { status: 500 });
  }
}
