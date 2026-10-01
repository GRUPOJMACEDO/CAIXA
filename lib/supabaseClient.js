import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Login usa o padrão nome.sobrenome. Internamente isso vira um e-mail
// fixo (nome.sobrenome@jmacedo.internal) só para o Supabase Auth aceitar,
// o usuário nunca digita e-mail.
export function loginParaEmail(login) {
  return `${login.trim().toLowerCase()}@jmacedo.internal`;
}

// O Supabase/PostgREST só devolve até 1000 linhas por consulta, por
// padrão — uma consulta sem .range()/.limit() que bater nesse teto é
// cortada EM SILÊNCIO (sem erro), o que já causou gráfico errado (ex:
// Acompanhamento, ao somar 2+ unidades, "sumia" com lançamentos mais
// recentes de uma delas). Esta função busca "página por página" até
// trazer tudo, pra qualquer consulta que possa passar de 1000 linhas.
//
// Uso: await buscarTudo(() => supabase.from("lancamentos").select("...").eq(...))
// (passe uma função que MONTA a consulta — ela é chamada de novo a
// cada página, com .range() aplicado por cima).
export async function buscarTudo(construirQuery, tamanhoPagina = 1000) {
  let todos = [];
  let desde = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await construirQuery().range(desde, desde + tamanhoPagina - 1);
    if (error) throw error;
    todos = todos.concat(data || []);
    if (!data || data.length < tamanhoPagina) break;
    desde += tamanhoPagina;
  }
  return todos;
}
