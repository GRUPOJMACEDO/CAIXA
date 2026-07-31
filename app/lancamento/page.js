"use client";
import { useEffect, useState } from "react";
import { Save, ReceiptText, Store, CalendarDays, Hash, Tags, Boxes, Wrench, Wallet, CircleDollarSign, CreditCard, Layers, Landmark } from "lucide-react";
import AppShell from "../../components/AppShell";
import CurrencyInput from "../../components/CurrencyInput";
import { supabase } from "../../lib/supabaseClient";
import { useSessao } from "../../lib/SessaoContext";
import { podeLancarDataRetroativa } from "../../lib/permissions";
import { normalizarNumeroOS, REGRA_OS_TEXTO } from "../../lib/validacaoOS";

const FORMAS_PAGAMENTO = ["PIX", "DÉBITO", "CRÉDITO", "DINHEIRO", "BOLETO", "LINK DE PAGAMENTO"];
const BANDEIRAS = ["VISA", "MASTERCARD", "ELO", "OUTRA"];

function hoje() {
  return new Date().toISOString().slice(0, 10);
}

function Rotulo({ icone: Icone, children }) {
  return (
    <label className="field-label flex items-center gap-1.5">
      <Icone size={12} className="text-muted" /> {children}
    </label>
  );
}

function FormularioLancamento() {
  const { usuario, unidades } = useSessao();
  const [categorias, setCategorias] = useState([]);
  const [modelos, setModelos] = useState([]);
  const [tiposServico, setTiposServico] = useState([]);
  const [carregandoTipos, setCarregandoTipos] = useState(false);

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
  const precisaParcelas = formaPagamento === "CRÉDITO" || formaPagamento === "LINK DE PAGAMENTO";
  const precisaBandeira = formaPagamento === "CRÉDITO" || formaPagamento === "LINK DE PAGAMENTO" || formaPagamento === "DÉBITO";

  useEffect(() => {
    if (unidades[0] && !unidadeId) setUnidadeId(unidades[0].id);
  }, [unidades]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    supabase.from("categorias").select("*").order("nome").then(({ data }) => setCategorias(data || []));
  }, []);

  // modelos e tipos de serviço dependem da categoria escolhida
  useEffect(() => {
    setTipoServicoId("");
    setModeloId("");
    if (!categoriaId) {
      setModelos([]);
      setTiposServico([]);
      return;
    }
    supabase.from("modelos").select("*").eq("categoria_id", categoriaId).order("nome").then(({ data }) => setModelos(data || []));
    setCarregandoTipos(true);
    supabase
      .from("tipos_servico")
      .select("*")
      .eq("categoria_id", categoriaId)
      .order("nome")
      .then(({ data }) => {
        setTiposServico(data || []);
        setCarregandoTipos(false);
      });
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
    if (!categoriaId || !tipoServicoId) {
      setMensagem({ tipo: "erro", texto: "Selecione a categoria e o tipo de serviço antes de salvar." });
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
      categoria_id: categoriaId,
      modelo_id: modeloId || null,
      tipo_servico_id: tipoServicoId,
      orcamento_aprovado: Number(orcamento),
      valor_pago: Number(valorPago),
      forma_pagamento: formaPagamento,
      parcelas: precisaParcelas && parcelas ? Number(parcelas) : null,
      bandeira: precisaBandeira ? bandeira : null,
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
    setData(hoje());
    setCategoriaId("");
    setModeloId("");
    setTipoServicoId("");
    setOrcamento("");
    setValorPago("");
    setFormaPagamento("PIX");
    setParcelas("");
    setBandeira("");
    setSaldoRestante(null);
    setOrcamentoTravado(false);
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
        <h1 className="font-display text-2xl font-semibold text-ink flex items-center gap-2">
          <ReceiptText size={22} className="text-gold" /> Novo lançamento
        </h1>
      </div>

      <form onSubmit={aoSubmeter} onKeyDown={aoTeclar} className="card p-6 grid grid-cols-3 gap-4">
        <div>
          <Rotulo icone={Store}>Unidade</Rotulo>
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
          <Rotulo icone={CalendarDays}>Data</Rotulo>
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
          <Rotulo icone={Hash}>Nº da OS (10 caracteres)</Rotulo>
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
          <Rotulo icone={Tags}>Categoria</Rotulo>
          <select className="field-input" value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)} required>
            <option value="">Selecione</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>{c.nome}</option>
            ))}
          </select>
        </div>
        <div>
          <Rotulo icone={Boxes}>Modelo</Rotulo>
          <select className="field-input" value={modeloId} onChange={(e) => setModeloId(e.target.value)} disabled={!categoriaId}>
            <option value="">Selecione</option>
            {modelos.map((m) => (
              <option key={m.id} value={m.id}>{m.nome}</option>
            ))}
          </select>
        </div>
        <div>
          <Rotulo icone={Wrench}>Tipo de serviço</Rotulo>
          <select className="field-input" value={tipoServicoId} onChange={(e) => setTipoServicoId(e.target.value)} disabled={!categoriaId} required>
            <option value="">{categoriaId ? "Selecione" : "Escolha a categoria primeiro"}</option>
            {tiposServico.map((t) => (
              <option key={t.id} value={t.id}>{t.nome}</option>
            ))}
          </select>
          {categoriaId && !carregandoTipos && tiposServico.length === 0 && (
            <p className="text-xs text-danger mt-1">Nenhum tipo de serviço cadastrado para essa categoria — avise a Configurações.</p>
          )}
        </div>

        <div>
          <Rotulo icone={Wallet}>Orçamento aprovado</Rotulo>
          <CurrencyInput valor={orcamento} onChange={setOrcamento} disabled={orcamentoTravado} required />
          {orcamentoTravado && <p className="text-xs text-muted mt-1">Travado nesta OS.</p>}
        </div>
        <div>
          <Rotulo icone={CircleDollarSign}>Valor pago agora</Rotulo>
          <CurrencyInput valor={valorPago} onChange={setValorPago} required />
          {saldoRestante !== null && <p className="text-xs text-muted mt-1">Saldo restante: R$ {saldoRestante.toFixed(2)}</p>}
        </div>
        <div>
          <Rotulo icone={CreditCard}>Forma de pagamento</Rotulo>
          <select className="field-input" value={formaPagamento} onChange={(e) => setFormaPagamento(e.target.value)}>
            {FORMAS_PAGAMENTO.map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
        </div>

        <div>
          <Rotulo icone={Layers}>Parcelas</Rotulo>
          <select className="field-input" value={parcelas} onChange={(e) => setParcelas(e.target.value)} disabled={!precisaParcelas}>
            <option value="">1x</option>
            {[2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
              <option key={n} value={n}>{n}x</option>
            ))}
          </select>
        </div>
        <div className="col-span-2">
          <Rotulo icone={Landmark}>Bandeira</Rotulo>
          <div className="flex gap-2 flex-wrap">
            {BANDEIRAS.map((b) => (
              <button
                type="button"
                key={b}
                disabled={!precisaBandeira}
                onClick={() => setBandeira(b)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm transition disabled:opacity-40 disabled:cursor-not-allowed ${
                  bandeira === b ? "border-gold bg-gold-soft/60 text-gold-strong font-medium" : "border-line bg-white text-muted hover:border-gold/50"
                }`}
              >
                <CreditCard size={14} /> {b}
              </button>
            ))}
          </div>
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
