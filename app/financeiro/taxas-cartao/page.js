"use client";
import { useEffect, useState } from "react";
import { CreditCard, Save, Lock, History, Trash2, Info } from "lucide-react";
import AppShell from "../../../components/AppShell";
import { supabase } from "../../../lib/supabaseClient";
import { useSessao } from "../../../lib/SessaoContext";
import { podeVerFinanceiro } from "../../../lib/permissions";
import { formatarDataBR } from "../../../lib/formato";
import { hojeBrasil } from "../../../lib/fusoHorario";
import { PRODUTOS_TAXA, chaveTaxa, rotuloProduto, lerPercentual, formatarPercentual } from "../../../lib/taxasCartao";

const DATA_INICIAL = "2000-01-01"; // carga inicial (fase 61) = vale desde sempre

function Conteudo() {
  const { usuario } = useSessao();
  const permitido = podeVerFinanceiro(usuario.cargo);
  const [historico, setHistorico] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [novas, setNovas] = useState({}); // { chave: "3,10" }
  const [vigencia, setVigencia] = useState(hojeBrasil());
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState(null);
  const [verHistorico, setVerHistorico] = useState(false);

  async function carregar() {
    setCarregando(true);
    const { data, error } = await supabase
      .from("taxas_cartao")
      .select("id, tipo, parcelas, taxa, vigencia_inicio, criado_em")
      .order("vigencia_inicio", { ascending: false });
    if (error) setMensagem({ tipo: "erro", texto: "Erro ao carregar as taxas: " + error.message });
    setHistorico(data || []);
    setCarregando(false);
  }

  useEffect(() => {
    if (permitido) carregar();
  }, [permitido]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!permitido) {
    return (
      <div className="card p-8 max-w-lg text-center text-muted">
        <Lock size={22} className="mx-auto mb-2 opacity-60" />
        <p className="text-sm">Somente Administrador e Diretor podem ver as taxas do cartão.</p>
      </div>
    );
  }

  const hoje = hojeBrasil();
  // taxa que vale HOJE para cada produto (a de data de início mais recente <= hoje)
  // e, se houver, a próxima já agendada para uma data futura
  const atual = {};
  const agendada = {};
  historico.forEach((t) => {
    const chave = chaveTaxa(t.tipo, t.parcelas);
    if (t.vigencia_inicio <= hoje) {
      if (!atual[chave] || t.vigencia_inicio > atual[chave].vigencia_inicio) atual[chave] = t;
    } else if (!agendada[chave] || t.vigencia_inicio < agendada[chave].vigencia_inicio) {
      agendada[chave] = t;
    }
  });

  const alteracoes = PRODUTOS_TAXA.map((p) => {
    const chave = chaveTaxa(p.tipo, p.parcelas);
    const texto = novas[chave];
    if (texto === undefined || String(texto).trim() === "") return null;
    return { ...p, chave, texto, valor: lerPercentual(texto) };
  }).filter(Boolean);
  const invalidas = alteracoes.filter((a) => a.valor === null);

  async function salvar() {
    setMensagem(null);
    if (alteracoes.length === 0) return;
    if (invalidas.length > 0) {
      setMensagem({ tipo: "erro", texto: "Confira as taxas em vermelho: use só números, ex.: 3,08" });
      return;
    }
    if (!vigencia) {
      setMensagem({ tipo: "erro", texto: "Informe a partir de qual data as novas taxas valem." });
      return;
    }
    const resumo = alteracoes.map((a) => `${rotuloProduto(a.tipo, a.parcelas)}: ${formatarPercentual(a.valor)}`).join("\n");
    if (!window.confirm(`Salvar ${alteracoes.length} taxa(s), valendo a partir de ${formatarDataBR(vigencia)}?\n\n${resumo}\n\nLançamentos anteriores a essa data continuam com a taxa antiga.`)) return;
    setSalvando(true);
    const { error } = await supabase.from("taxas_cartao").upsert(
      alteracoes.map((a) => ({
        tipo: a.tipo,
        parcelas: a.tipo === "debito" ? 1 : a.parcelas,
        taxa: a.valor,
        vigencia_inicio: vigencia,
        criado_por: usuario.id,
        criado_em: new Date().toISOString(),
      })),
      { onConflict: "tipo,parcelas,vigencia_inicio" }
    );
    setSalvando(false);
    if (error) {
      setMensagem({ tipo: "erro", texto: "Erro ao salvar: " + error.message });
      return;
    }
    setNovas({});
    setMensagem({ tipo: "ok", texto: `${alteracoes.length} taxa(s) salva(s), valendo a partir de ${formatarDataBR(vigencia)}.` });
    carregar();
  }

  async function excluirVersao(t) {
    const mesmas = historico.filter((h) => h.tipo === t.tipo && h.parcelas === t.parcelas);
    if (mesmas.length <= 1) {
      setMensagem({ tipo: "erro", texto: "Esse produto só tem essa taxa cadastrada — não dá pra excluir. Cadastre uma nova taxa no lugar." });
      return;
    }
    if (!window.confirm(`Excluir a taxa de ${rotuloProduto(t.tipo, t.parcelas)} (${formatarPercentual(t.taxa)}) que vale a partir de ${formatarDataBR(t.vigencia_inicio)}?\n\nOs lançamentos desse período voltam a usar a taxa anterior.`)) return;
    const { error } = await supabase.from("taxas_cartao").delete().eq("id", t.id);
    if (error) {
      setMensagem({ tipo: "erro", texto: "Erro ao excluir: " + error.message });
      return;
    }
    setMensagem({ tipo: "ok", texto: "Taxa excluída do histórico." });
    carregar();
  }

  return (
    <div className="max-w-4xl">
      <div className="mb-5">
        <p className="text-xs uppercase tracking-wider text-muted mb-1">Financeiro</p>
        <h1 className="font-display text-2xl font-semibold text-ink flex items-center gap-2">
          <CreditCard size={22} className="text-[#2670B5]" /> Taxas do Cartão
        </h1>
        <p className="text-sm text-muted mt-1">Cielo — antecipação automática (recebimento em D+1). Essas taxas são usadas no Dashboard de Taxas.</p>
      </div>

      <div className="card p-4 mb-4 text-sm text-muted flex gap-2">
        <Info size={16} className="shrink-0 mt-0.5 text-[#2670B5]" />
        <div>
          <p><b className="text-ink">Débito</b> usa a taxa de Débito. <b className="text-ink">Crédito</b> e <b className="text-ink">Link de pagamento</b> em 1x usam a taxa de Crédito; de 2x a 12x, a taxa do Parcelado correspondente. PIX, Dinheiro e Boleto não têm taxa.</p>
          <p className="mt-1">Para atualizar: digite a taxa nova só nos produtos que mudaram, escolha a data em que ela começa a valer e salve. A taxa antiga fica guardada no histórico e continua valendo para os lançamentos anteriores.</p>
        </div>
      </div>

      {mensagem && (
        <div className={`mb-4 rounded-lg px-4 py-2.5 text-sm ${mensagem.tipo === "ok" ? "bg-[#3F8A5C]/10 text-[#2E6B45]" : "bg-[#B23B2E]/10 text-[#B23B2E]"}`}>
          {mensagem.texto}
        </div>
      )}

      <div className="card overflow-hidden mb-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wider text-white bg-[#2670B5]">
              <td className="p-3">Produto</td>
              <td className="p-3 text-right">Taxa atual</td>
              <td className="p-3">Vale desde</td>
              <td className="p-3 w-44">Nova taxa (%)</td>
            </tr>
          </thead>
          <tbody>
            {carregando && (
              <tr><td colSpan={4} className="p-4 text-muted">Carregando…</td></tr>
            )}
            {!carregando &&
              PRODUTOS_TAXA.map((p) => {
                const chave = chaveTaxa(p.tipo, p.parcelas);
                const t = atual[chave];
                const futura = agendada[chave];
                const texto = novas[chave] ?? "";
                const invalida = texto.trim() !== "" && lerPercentual(texto) === null;
                return (
                  <tr key={chave} className="border-t border-line">
                    <td className="p-3 font-medium text-ink">{rotuloProduto(p.tipo, p.parcelas)}</td>
                    <td className="p-3 text-right font-mono-num font-semibold text-[#2670B5]">{t ? formatarPercentual(t.taxa) : <span className="text-[#B23B2E]">sem taxa</span>}</td>
                    <td className="p-3 text-muted">
                      {t ? (t.vigencia_inicio === DATA_INICIAL ? "início" : formatarDataBR(t.vigencia_inicio)) : "—"}
                      {futura && (
                        <span className="block text-[11px] text-[#9C5A34]">
                          {formatarPercentual(futura.taxa)} a partir de {formatarDataBR(futura.vigencia_inicio)}
                        </span>
                      )}
                    </td>
                    <td className="p-2">
                      <input
                        className={`field-input py-1.5 text-right font-mono-num ${invalida ? "border-[#B23B2E] text-[#B23B2E]" : ""}`}
                        placeholder={t ? String(Number(t.taxa).toFixed(2)).replace(".", ",") : "0,00"}
                        value={texto}
                        inputMode="decimal"
                        onChange={(e) => setNovas((n) => ({ ...n, [chave]: e.target.value }))}
                      />
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>

      <div className="card p-4 mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <label className="field-label">Novas taxas valem a partir de</label>
          <input type="date" className="field-input" value={vigencia} onChange={(e) => setVigencia(e.target.value)} />
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted">{alteracoes.length} alteração(ões)</span>
          <button className="btn-primary inline-flex items-center gap-2" onClick={salvar} disabled={salvando || alteracoes.length === 0}>
            <Save size={15} /> {salvando ? "Salvando…" : "Salvar taxas"}
          </button>
        </div>
      </div>

      <div className="card overflow-hidden">
        <button className="w-full flex items-center justify-between p-4 text-sm font-medium text-ink hover:bg-canvas/60" onClick={() => setVerHistorico((v) => !v)}>
          <span className="inline-flex items-center gap-2"><History size={15} /> Histórico de taxas ({historico.length})</span>
          <span className="text-muted text-xs">{verHistorico ? "ocultar" : "mostrar"}</span>
        </button>
        {verHistorico && (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wider text-muted border-y border-line">
                <td className="p-3">Produto</td>
                <td className="p-3 text-right">Taxa</td>
                <td className="p-3">Vale a partir de</td>
                <td className="p-3">Cadastrada em</td>
                <td className="p-3"></td>
              </tr>
            </thead>
            <tbody>
              {historico
                .slice()
                .sort((a, b) => (a.vigencia_inicio === b.vigencia_inicio ? (a.tipo + String(a.parcelas).padStart(2, "0")).localeCompare(b.tipo + String(b.parcelas).padStart(2, "0")) : b.vigencia_inicio.localeCompare(a.vigencia_inicio)))
                .map((t) => (
                  <tr key={t.id} className="border-t border-line">
                    <td className="p-3">{rotuloProduto(t.tipo, t.parcelas)}</td>
                    <td className="p-3 text-right font-mono-num">{formatarPercentual(t.taxa)}</td>
                    <td className="p-3">{t.vigencia_inicio === DATA_INICIAL ? "início (carga inicial)" : formatarDataBR(t.vigencia_inicio)}</td>
                    <td className="p-3 text-muted">{t.criado_em ? new Date(t.criado_em).toLocaleString("pt-BR") : ""}</td>
                    <td className="p-3 text-right">
                      <button className="text-muted hover:text-[#B23B2E]" title="Excluir essa taxa do histórico" onClick={() => excluirVersao(t)}>
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default function TaxasCartaoPage() {
  return (
    <AppShell>
      <Conteudo />
    </AppShell>
  );
}
