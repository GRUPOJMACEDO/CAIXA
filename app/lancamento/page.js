"use client";
import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import AppShell from "../../components/AppShell";
import CurrencyInput from "../../components/CurrencyInput";
import { supabase } from "../../lib/supabaseClient";
import { useSessao } from "../../lib/SessaoContext";
import { podeLancarDataRetroativa } from "../../lib/permissions";
import { normalizarNumeroOS, REGRA_OS_TEXTO } from "../../lib/validacaoOS";

const FORMAS_PAGAMENTO = ["PIX", "DÉBITO", "CRÉDITO", "DINHEIRO", "BOLETO", "LINK DE PAGAMENTO"];

function hoje() {
  return new Date().toISOString().slice(0, 10);
}

function FormularioLancamento() {
  const { usuario, unidades } = useSessao();
  const [categorias, setCategorias] = useState([]);
  const [modelos, setModelos] = useState([]);
  const [tiposServico, setTiposServico] = useState([]);

  const unidadeUnica = unidades.length === 1;
  const [unidadeId, setUnidadeId] = useState("");
  const [data, setData] = useState(hoje());
  const [numeroOsDigitado, setNumeroOsDigitado] = useState("");
  const [erroOs, setErroOs] = useState(null);
  const [categoriaId, setCategoriaId] = useState("");
  const [modeloId, setModeloId] = useState("");
  const [tipoServicoId, setTipoServicoId] = useState("");
  const [orcamento, setOrcamento] = useState("");
  const [valorPago, setValorPago] = useState("");
  const [formaPagamento, setFormaPagamento] = useState("PIX");
  const [parcelas, setParcelas] = useState("");
  const [bandeira, setBandeira] = useState("");
  const [saldoRestante, setSaldoRestante] = useState(null);
  const [orcamentoTravado, setOrcamentoTravado] = useState(false);
  const [mensagem, setMensagem] = useState(null);
  const [salvando, setSalvando] = useState(false);

  const dataEditavel = podeLancarDataRetroativa(usuario.cargo);
  const precisaCartao = formaPagamento === "CRÉDITO" || formaPagamento === "LINK DE PAGAMENTO";

  useEffect(() => {
    if (unidades[0] && !unidadeId) setUnidadeId(unidades[0].id);
  }, [unidades]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    supabase.from("categorias").select("*").order("nome").then(({ data }) => setCategorias(data || []));
    supabase.from("tipos_servico").select("*").order("nome").then(({ data }) => setTiposServico(data || []));
  }, []);

  useEffect(() => {
    if (!categoriaId) return setModelos([]);
    supabase.from("modelos").select("*").eq("categoria_id", categoriaId).order("nome").then(({ data }) => setModelos(data || []));
  }, [categoriaId]);

  // ao sair do campo de OS, valida o formato e verifica se já existe (saldo restante)
  async function aoSairCampoOS() {
    const resultado = normalizarNumeroOS(numeroOsDigitado);
    if (!resultado.valido) {
      setErroOs(resultado.erro);
      setSaldoRestante(null);
      setOrcamentoTravado(false);
      return;
    }
    setErroOs(null);
    setNumeroOsDigitado(resultado.valor);

    if (!unidadeId) return;
    const { data: existentes } = await supabase
      .from("lancamentos")
      .select("orcamento_aprovado, valor_pago")
      .eq("unidade_id", unidadeId)
      .eq("numero_os", resultado.valor);
    if (existentes && existentes.length > 0) {
      const orcamentoOs = existentes[0].orcamento_aprovado;
      const totalPago = existentes.reduce((s, l) => s + Number(l.valor_pago), 0);
      setOrcamento(orcamentoOs);
      setOrcamentoTravado(true);
      setSaldoRestante(orcamentoOs - totalPago);
    } else {
      setOrcamentoTravado(false);
      setSaldoRestante(null);
    }
  }

  async function executarSalvar() {
    setMensagem(null);
    const resultado = normalizarNumeroOS(numeroOsDigitado);
    if (!resultado.valido) {
      setErroOs(resultado.erro);
      return;
    }
    if (saldoRestante !== null && Number(valorPago) > saldoRestante) {
      setMensagem({ tipo: "erro", texto: `Valor lançado ultrapassa o saldo restante desta OS. Saldo disponível: R$ ${saldoRestante.toFixed(2)}. Corrija o valor.` });
      return;
    }

    setSalvando(true);
    const { error } = await supabase.from("lancamentos").insert({
      unidade_id: unidadeId,
      data,
      numero_os: resultado.valor,
      categoria_id: categoriaId || null,
      modelo_id: modeloId || null,
      tipo_servico_id: tipoServicoId,
      orcamento_aprovado: Number(orcamento),
      valor_pago: Number(valorPago),
      forma_pagamento: formaPagamento,
      parcelas: precisaCartao && parcelas ? Number(parcelas) : null,
      bandeira: precisaCartao ? bandeira.toUpperCase() : null,
      atendente_id: usuario.id,
      criado_por: usuario.id,
    });
    setSalvando(false);

    if (error) {
      setMensagem({
        tipo: "erro",
        texto: error.message.includes("VALOR_EXCEDE_ORCAMENTO")
          ? "Valor lançado ultrapassa o orçamento aprovado da OS. Corrija o valor."
          : "Erro ao salvar: " + error.message,
      });
      return;
    }
    setMensagem({ tipo: "ok", texto: "Lançamento salvo." });
    setNumeroOsDigitado("");
    setValorPago("");
    setSaldoRestante(null);
    setOrcamentoTravado(false);
    if (!orcamentoTravado) setOrcamento("");
  }

  function aoSubmeter(e) {
    e.preventDefault();
    executarSalvar();
  }

  // Enter no formulário pede confirmação antes de executar
  function aoTeclar(e) {
    if (e.key === "Enter" && e.target.tagName !== "TEXTAREA") {
      e.preventDefault();
      if (window.confirm("Confirmar o lançamento?")) executarSalvar();
    }
  }

  return (
    <div className="max-w-4xl relative">
      <div className="mb-5">
        <p className="text-xs uppercase tracking-wider text-muted mb-1">Operação</p>
        <h1 className="font-display text-2xl font-semibold text-ink">Novo lançamento</h1>
      </div>

      <form onSubmit={aoSubmeter} onKeyDown={aoTeclar} className="card p-6 grid grid-cols-3 gap-4">
        <div>
          <label className="field-label">Unidade</label>
          {unidadeUnica ? (
            <div className="field-input bg-canvas text-ink font-medium flex items-center">{unidades[0]?.nome}</div>
          ) : (
            <select className="field-input" value={unidadeId} onChange={(e) => setUnidadeId(e.target.value)}>
              {unidades.map((u) => (
                <option key={u.id} value={u.id}>{u.nome}</option>
              ))}
            </select>
          )}
        </div>
        <div>
          <label className="field-label">Data</label>
          <input
            className="field-input"
            type="date"
            value={data}
            onChange={(e) => setData(e.target.value)}
            disabled={!dataEditavel}
            max={hoje()}
            required
          />
        </div>
        <div>
          <label className="field-label">Nº da OS (10 caracteres)</label>
          <input
            className="field-input font-mono-num"
            value={numeroOsDigitado}
            maxLength={10}
            onChange={(e) => { setNumeroOsDigitado(e.target.value.toUpperCase()); setErroOs(null); }}
            onBlur={aoSairCampoOS}
            placeholder="Ex: O-00000015"
            required
          />
          {erroOs && <p className="text-xs text-danger mt-1">{erroOs}</p>}
        </div>

        <div>
          <label className="field-label">Categoria</label>
          <select className="field-input" value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)}>
            <option value="">Selecione</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>{c.nome}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="field-label">Modelo</label>
          <select className="field-input" value={modeloId} onChange={(e) => setModeloId(e.target.value)}>
            <option value="">Selecione</option>
            {modelos.map((m) => (
              <option key={m.id} value={m.id}>{m.nome}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="field-label">Tipo de serviço</label>
          <select className="field-input" value={tipoServicoId} onChange={(e) => setTipoServicoId(e.target.value)} required>
            <option value="">Selecione</option>
            {tiposServico.map((t) => (
              <option key={t.id} value={t.id}>{t.nome}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="field-label">Orçamento aprovado</label>
          <CurrencyInput valor={orcamento} onChange={setOrcamento} disabled={orcamentoTravado} required />
          {orcamentoTravado && <p className="text-xs text-muted mt-1">Travado nesta OS.</p>}
        </div>
        <div>
          <label className="field-label">Valor pago agora</label>
          <CurrencyInput valor={valorPago} onChange={setValorPago} required />
          {saldoRestante !== null && <p className="text-xs text-muted mt-1">Saldo restante: R$ {saldoRestante.toFixed(2)}</p>}
        </div>
        <div>
          <label className="field-label">Forma de pagamento</label>
          <select className="field-input" value={formaPagamento} onChange={(e) => setFormaPagamento(e.target.value)}>
            {FORMAS_PAGAMENTO.map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="field-label">Parcelas</label>
          <select className="field-input" value={parcelas} onChange={(e) => setParcelas(e.target.value)} disabled={!precisaCartao}>
            <option value="">1x</option>
            {[2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
              <option key={n} value={n}>{n}x</option>
            ))}
          </select>
        </div>
        <div className="col-span-2">
          <label className="field-label">Bandeira</label>
          <input className="field-input" value={bandeira} onChange={(e) => setBandeira(e.target.value.toUpperCase())} disabled={!precisaCartao} placeholder="VISA, MASTERCARD, ELO…" />
        </div>

        {mensagem && (
          <div className={`col-span-3 text-sm rounded-lg px-3 py-2.5 ${mensagem.tipo === "erro" ? "bg-danger-soft text-danger" : "bg-teal-soft text-teal"}`}>
            {mensagem.texto}
          </div>
        )}

        <div className="col-span-3 flex justify-end">
          <button type="submit" disabled={salvando} className="btn-primary flex items-center gap-2">
            <Save size={16} />
            {salvando ? "Salvando…" : "Salvar lançamento"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function LancamentoPage() {
  return (
    <AppShell>
      <FormularioLancamento />
    </AppShell>
  );
}
