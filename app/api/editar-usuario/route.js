import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";

const CARGOS_PODEM_EDITAR = ["administrador", "diretor"];

async function usuarioAutenticado(request, admin) {
  const token = request.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return null;
  const { data: perfil } = await admin.from("usuarios").select("*").eq("id", data.user.id).single();
  return perfil;
}

export async function POST(request) {
  try {
    const admin = supabaseAdmin();
    const chamador = await usuarioAutenticado(request, admin);
    if (!chamador || !CARGOS_PODEM_EDITAR.includes(chamador.cargo)) {
      return NextResponse.json({ erro: "Sem permissão para editar usuários." }, { status: 403 });
    }

    const { usuarioId, nome, sobrenome, cargo, unidadeIds } = await request.json();
    const login = `${nome}.${sobrenome}`.toLowerCase().replace(/\s/g, "");
    const email = `${login}@jmacedo.internal`;

    const { error: erroAuth } = await admin.auth.admin.updateUserById(usuarioId, { email });
    if (erroAuth) return NextResponse.json({ erro: erroAuth.message }, { status: 400 });

    const { error: erroPerfil } = await admin
      .from("usuarios")
      .update({ nome_completo: `${nome} ${sobrenome}`.toUpperCase(), login, cargo })
      .eq("id", usuarioId);
    if (erroPerfil) return NextResponse.json({ erro: erroPerfil.message }, { status: 400 });

    await admin.from("usuario_unidades").delete().eq("usuario_id", usuarioId);
    if (unidadeIds?.length) {
      await admin.from("usuario_unidades").insert(unidadeIds.map((unidade_id) => ({ usuario_id: usuarioId, unidade_id })));
    }

    return NextResponse.json({ login });
  } catch (err) {
    return NextResponse.json({ erro: err.message }, { status: 500 });
  }
}
