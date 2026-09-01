"use client";
import { useEffect, useState } from "react";
import { ShieldAlert, Building2, Briefcase, User, Hash, Percent, Clock, Trophy } from "lucide-react";
import AppShell from "../../../components/AppShell";
import BotaoAtualizar from "../../../components/BotaoAtualizar";
import { supabase } from "../../../lib/supabaseClient";
import { useSessao } from "../../../lib/SessaoContext";
import { CARGOS, CARGO_LABELS, podeVerAuditoriaRetroativos } from "../../../lib/permissions";
import { formatarMoedaSemSimbolo, formatarDataBR } from "../../../lib/formato";

function formatarDataHora(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.toLocaleDateString("pt-BR")} às ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
}

function Conteudo() {
  const { usuario, unidades } = useSessao();
  const permitido = podeVerAuditoriaRetroativos(usuario.cargo);

  const [usuariosLista, setUsuariosLista] = useState([]);
  const [unidadesSelecionadas, setUnidadesSelecionadas] = useState([]);
  const [cargosSelecionados, setCargosSelecionados] = useState([]);
  const [usuariosSelecionados, setUsuariosSelecionados] = useState([]);
  const [linhas, setLinhas] = useState([]);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    if (!permitido) return;
    supabase
      .from("usuarios")
      .select("id, nome_completo, login, cargo")
      .order("nome_completo")
      .then(({ data }) => setUsuariosLista(data || []));
  }, [permitido]);

  async function carregar() {
    if (!permitido) return;
    setCarregando(true);
    const { data, error } = await supabase.rpc("auditoria_lancamentos_retroativos", {
      unidade_ids: unidadesSelecionadas.length > 0 ? unidadesSelecionadas : null,
      cargos: cargosSelecionados.length > 0 ? cargosSelecionados : null,
      usuario_ids: usuariosSelecionados.length > 0 ? usuariosSelecionados : null,
    });
    if (error) console.error("Erro na auditoria de retroativos:", error.message);
    setLinhas(data || []);
    setCarregando(false);
  }

  useEffect(() => {
    carregar();
  }, [unidadesSelecionadas, cargosSelecionados, usuariosSelecionados]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!permitido) {
    return <p className="text-sm text-muted">Você não tem acesso a essa tela.</p>;
  }

  // --- resumo ---
  const totalQtd = linhas.length;
  const totalValor = linhas.reduce((s, l) => s + Number(l.valor_pago), 0);
  const mediaAtraso = totalQtd > 0 ? linhas.reduce((s, l) => s + Number(l.dias_atraso), 0) / totalQtd : 0;

  const porLogin = new Map();
  linhas.forEach((l) => {
    const chave = l.responsavel_id;
    if (!porLogin.has(chave)) {
      porLogin.set(chave, { nome: l.responsavel_nome, login: l.responsavel_login, cargo: l.responsavel_cargo, qtd: 0, valor: 0 });
    }
    const acc = porLogin.get(chave);
    acc.qtd += 1;
    acc.valor += Number(l.valor_pago);
  });
  const rankingLogin = [...porLogin.values()].sort((a, b) => b.qtd - a.qtd).slice(0, 8);

  const porUnidade = new Map();
  linhas.forEach((l) => {
    if (!porUnidade.has(l.unidade_id)) porUnidade.set(l.unidade_id, { nome: l.unidade_nome, qtd: 0, valor: 0 });
    const acc = porUnidade.get(l.unidade_id);
    acc.qtd += 1;
    acc.valor += Number(l.valor_pago);
  });
  const rankingUnidade = [...porUnidade.values()].sort((a, b) => b.qtd - a.qtd).slice(0, 8);

  return (
    <div className="w-full">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wider text-muted mb-1">Configurações</p>
          <h1 className="font-display text-2xl font-semibold text-ink flex items-center gap-2">
            <ShieldAlert size={22} className="text-[#B23B2E]" /> Lançamentos retroativos
          </h1>
          <p className="text-sm text-muted mt-1">Lançamentos com data anterior ao dia em que a ação foi realmente feita (na criação ou numa edição posterior).</p>
        </div>
        <BotaoAtualizar aoAtualizar={carregar} />
      </div>

      {/* Filtros */}
      <div className="card p-4 mb-5">
        <div className="flex items-start gap-4 flex-wrap">
          <div className="min-w-[240px] flex-1">
            <p className="text-[11px] font-semibold text-muted uppercase tracking-wide mb-1.5 flex items-center gap-1"><Building2 size={11} /> Unidades</p>
            <select
              multiple
              size={5}
              className="field-input text-sm w-full"
              value={unidadesSelecionadas}
              onChange={(e) => setUnidadesSelecionadas([...e.target.selectedOptions].map((o) => o.value))}
            >
              {unidades.map((u) => (
                <option key={u.id} value={u.id}>{u.nome}</option>
              ))}
            </select>
            <p className="text-[10px] text-muted mt-1">Nenhuma marcada = todas.</p>
          </div>

          <div className="min-w-[180px]">
            <p className="text-[11px] font-semibold text-muted uppercase tracking-wide mb-1.5 flex items-center gap-1"><Briefcase size={11} /> Cargo</p>
            <select
              multiple
              size={5}
              className="field-input text-sm w-full"
              value={cargosSelecionados}
              onChange={(e) => setCargosSelecionados([...e.target.selectedOptions].map((o) => o.value))}
            >
              {Object.values(CARGOS).map((c) => (
                <option key={c} value={c}>{CARGO_LABELS[c]}</option>
              ))}
            </select>
          </div>

          <div className="min-w-[240px] flex-1">
            <p className="text-[11px] font-semibold text-muted uppercase tracking-wide mb-1.5 flex items-center gap-1"><User size={11} /> Usuário</p>
            <select
              multiple
              size={5}
              className="field-input text-sm w-full"
              value={usuariosSelecionados}
              onChange={(e) => setUsuariosSelecionados([...e.target.selectedOptions].map((o) => o.value))}
            >
              {usuariosLista.map((u) => (
                <option key={u.id} value={u.id}>{u.nome_completo} (@{u.login})</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="card overflow-hidden">
          <div className="h-1.5 bg-[#B23B2E]" />
          <div className="p-4">
            <div className="w-8 h-8 rounded-lg bg-[#B23B2E]/10 flex items-center justify-center text-[#B23B2E] mb-2"><Hash size={16} /></div>
            <p className="text-xs text-muted mb-1">Lançamentos retroativos</p>
            <p className="font-mono-num text-xl font-semibold text-ink">{carregando ? "…" : totalQtd}</p>
          </div>
        </div>
        <div className="card overflow-hidden">
          <div className="h-1.5 bg-[#C9A227]" />
          <div className="p-4">
            <div className="w-8 h-8 rounded-lg bg-[#C9A227]/10 flex items-center justify-center text-[#9C7E13] mb-2"><Percent size={16} /></div>
            <p className="text-xs text-muted mb-1">Valor total envolvido</p>
            <p className="font-mono-num text-xl font-semibold text-ink">{carregando ? "…" : `R$ ${formatarMoedaSemSimbolo(totalValor)}`}</p>
          </div>
        </div>
        <div className="card overflow-hidden">
          <div className="h-1.5 bg-[#7C56B5]" />
          <div className="p-4">
            <div className="w-8 h-8 rounded-lg bg-[#7C56B5]/10 flex items-center justify-center text-[#7C56B5] mb-2"><Clock size={16} /></div>
            <p className="text-xs text-muted mb-1">Média de dias de atraso</p>
            <p className="font-mono-num text-xl font-semibold text-ink">{carregando ? "…" : mediaAtraso.toFixed(1)}</p>
          </div>
        </div>
      </div>

      {!carregando && linhas.length > 0 && (
        <div className="grid grid-cols-2 gap-5 mb-6">
          <div className="card p-4">
            <p className="text-sm font-semibold text-ink mb-3 flex items-center gap-1.5"><Trophy size={14} className="text-[#B8862E]" /> Ranking por login</p>
            <div className="space-y-2">
              {rankingLogin.map((r, i) => (
                <div key={r.login} className="flex items-center gap-2 text-sm">
                  <span className="text-xs text-muted w-5">{i + 1}º</span>
                  <span className="flex-1 truncate">{r.nome} <span className="text-xs text-muted">@{r.login}</span></span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-canvas text-muted shrink-0">{CARGO_LABELS[r.cargo] || r.cargo}</span>
                  <span className="font-mono-num font-semibold text-ink shrink-0 w-8 text-right">{r.qtd}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="card p-4">
            <p className="text-sm font-semibold text-ink mb-3 flex items-center gap-1.5"><Trophy size={14} className="text-[#B8862E]" /> Ranking por unidade</p>
            <div className="space-y-2">
              {rankingUnidade.map((r, i) => (
                <div key={r.nome} className="flex items-center gap-2 text-sm">
                  <span className="text-xs text-muted w-5">{i + 1}º</span>
                  <span className="flex-1 truncate">{r.nome}</span>
                  <span className="font-mono-num font-semibold text-ink shrink-0 w-8 text-right">{r.qtd}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Detalhamento */}
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wider text-muted border-b border-line">
              <td className="p-3">Nº OS</td>
              <td className="p-3">Unidade</td>
              <td className="p-3">Categoria</td>
              <td className="p-3">Responsável</td>
              <td className="p-3">Data selecionada</td>
              <td className="p-3">Feito em</td>
              <td className="p-3 text-right">Dias de atraso</td>
              <td className="p-3 text-right">Valor</td>
            </tr>
          </thead>
          <tbody>
            {carregando && <tr><td className="p-4 text-muted" colSpan={8}>Carregando…</td></tr>}
            {!carregando && linhas.length === 0 && <tr><td className="p-4 text-muted" colSpan={8}>Nenhum lançamento retroativo encontrado para esses filtros.</td></tr>}
            {linhas.map((l) => (
              <tr key={l.id} className="border-t border-line">
                <td className="p-3 font-mono-num">{l.numero_os}</td>
                <td className="p-3">
                  {l.unidade_nome}{" "}
                  {l.linha === "ih" && <span className="text-[9px] px-1.5 py-0.5 rounded font-medium bg-teal-soft text-teal">IH</span>}
                </td>
                <td className="p-3 text-xs text-muted">{l.categoria_nome || "—"}</td>
                <td className="p-3">
                  <p className="text-ink">{l.responsavel_nome}</p>
                  <p className="text-xs text-muted">@{l.responsavel_login} · {CARGO_LABELS[l.responsavel_cargo] || l.responsavel_cargo}{l.alterado_em ? " · editou depois" : ""}</p>
                </td>
                <td className="p-3 font-mono-num text-bronze font-medium">{formatarDataBR(l.data)}</td>
                <td className="p-3 text-xs text-muted">{formatarDataHora(l.alterado_em || l.criado_em)}</td>
                <td className="p-3 text-right font-mono-num font-semibold text-[#B23B2E]">{l.dias_atraso}</td>
                <td className="p-3 text-right font-mono-num">R$ {formatarMoedaSemSimbolo(l.valor_pago)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function AuditoriaRetroativosPage() {
  return (
    <AppShell>
      <Conteudo />
    </AppShell>
  );
}
