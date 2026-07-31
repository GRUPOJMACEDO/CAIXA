"use client";
import { useEffect, useState } from "react";
import AppShell from "../../../components/AppShell";
import CurrencyInput from "../../../components/CurrencyInput";
import { supabase } from "../../../lib/supabaseClient";
import { useSessao } from "../../../lib/SessaoContext";
import { CARGOS } from "../../../lib/permissions";

function proximosMeses(qtd) {
  const hoje = new Date();
  const meses = [];
  for (let i = 0; i < qtd; i++) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() + i, 1);
    meses.push(d.toISOString().slice(0, 10));
  }
  return meses;
}

function rotuloMes(iso) {
  const abrev = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];
  const d = new Date(iso + "T00:00:00");
  return `${abrev[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`;
}

function Conteudo() {
  const { usuario, unidades } = useSessao();
  const meses = proximosMeses(3); // mês atual + 2 seguintes, sempre rolando
  const [metas, setMetas] = useState({}); // { unidadeId: { mesIso: valor } }
  const [salvo, setSalvo] = useState({});

  useEffect(() => {
    supabase
      .from("metas")
      .select("*")
      .gte("mes_referencia", meses[0])
      .lte("mes_referencia", meses[meses.length - 1])
      .then(({ data }) => {
        const mapa = {};
        (data || []).forEach((m) => {
          mapa[m.unidade_id] = mapa[m.unidade_id] || {};
          mapa[m.unidade_id][m.mes_referencia] = m.valor_meta;
        });
        setMetas(mapa);
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function setValor(unidadeId, mesIso, valor) {
    setMetas((atual) => ({
      ...atual,
      [unidadeId]: { ...(atual[unidadeId] || {}), [mesIso]: valor },
    }));
  }

  async function salvar(unidadeId, mesIso) {
    const valor = Number(metas[unidadeId]?.[mesIso] || 0);
    await supabase.from("metas").upsert(
      {
        unidade_id: unidadeId,
        mes_referencia: mesIso,
        valor_meta: valor,
        atualizado_por: usuario.id,
        atualizado_em: new Date().toISOString(),
      },
      { onConflict: "unidade_id,mes_referencia" }
    );
    const chave = `${unidadeId}-${mesIso}`;
    setSalvo((s) => ({ ...s, [chave]: true }));
    setTimeout(() => setSalvo((s) => ({ ...s, [chave]: false })), 1500);
  }

  const podeEditar = [CARGOS.GERENCIA, CARGOS.ADMINISTRADOR, CARGOS.DIRETOR].includes(usuario.cargo);

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <p className="text-xs uppercase tracking-wider text-muted mb-1">Configurações</p>
        <h1 className="font-display text-2xl font-semibold text-ink">Metas mensais por unidade</h1>
        <p className="text-sm text-muted mt-1">
          O mês vazio precisa ser definido pela Gerência — assim que um mês passa, ele some da lista e o próximo entra.
        </p>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wider text-muted border-b border-line">
              <td className="p-3">Unidade</td>
              {meses.map((m) => (
                <td key={m} className="p-3 text-center">{rotuloMes(m)}</td>
              ))}
            </tr>
          </thead>
          <tbody>
            {unidades.map((u) => (
              <tr key={u.id} className="border-t border-line">
                <td className="p-3">{u.nome}</td>
                {meses.map((m) => {
                  const chave = `${u.id}-${m}`;
                  return (
                    <td key={m} className="p-3">
                      <div className="flex items-center gap-1.5">
                        <CurrencyInput
                          valor={metas[u.id]?.[m] ?? ""}
                          onChange={(v) => setValor(u.id, m, v)}
                          disabled={!podeEditar}
                          className="w-44"
                        />
                        {podeEditar && (
                          <button className="btn text-xs px-2 py-1" onClick={() => salvar(u.id, m)}>
                            {salvo[chave] ? "✓" : "OK"}
                          </button>
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!podeEditar && (
        <p className="text-sm text-muted mt-3">Somente a Gerência edita a meta da própria unidade.</p>
      )}
    </div>
  );
}

export default function CadastroMetas() {
  return (
    <AppShell>
      <Conteudo />
    </AppShell>
  );
}
