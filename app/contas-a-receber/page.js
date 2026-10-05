"use client";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Bell, History, Ticket, Pencil, Trash2, Plus, X, AlertTriangle, Search, Eraser, Wallet, PieChart, ListChecks, ShieldAlert, Check, CalendarClock } from "lucide-react";
import AppShell from "../../components/AppShell";
import Modal from "../../components/Modal";
import CurrencyInput from "../../components/CurrencyInput";
import BotaoAtualizar from "../../components/BotaoAtualizar";
import FormasPagamentoModal from "../../components/FormasPagamentoModal";
import { supabase } from "../../lib/supabaseClient";
import { useSessao } from "../../lib/SessaoContext";
import { hojeBrasil } from "../../lib/fusoHorario";
import { CARGOS, podeVerTodasUnidades, podeExcluirLancamento, podeAlterarContasAReceber, podeLancarDataRetroativa } from "../../lib/permissions";
import { formatarMoedaSemSimbolo, formatarDataBR } from "../../lib/formato";
import { FORMAS_PAGAMENTO, BANDEIRAS, precisaParcelas as precisaParcelasFn, precisaBandeira as precisaBandeiraFn } from "../../lib/formasPagamento";

let proximoIdLinhaCr = 1;
function gerarIdLinhaCr() {
  return proximoIdLinhaCr++;
}

function horasDesde(dataISO) {
  return (Date.now() - new Date(dataISO + "T00:00:00").getTime()) / 3600000;
}

function ConteudoContasAReceber() {
  const { usuario, unidades, linhaFiltro } = useSessao();
  const parametrosUrl = useSearchParams();
  const osAutoAbriuRef = useRef(false);
  const [linhas, setLinhas] = useState([]);
  const [filtroUnidade, setFiltroUnidade] = useState("");
  const [buscaOs, setBuscaOs] = useState("");
  const [selecionada, setSelecionada] = useState(null);
  const [valorAgora, setValorAgora] = useState("");
  const [formaPagamento, setFormaPagamento] = useState("");
  const [parcelas, setParcelas] = useState("");
  const [bandeira, setBandeira] = useState("");
  const [mostrarDataRetroativa, setMostrarDataRetroativa] = useState(false);
  const [dataRecebimento, setDataRecebimento] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [historico, setHistorico] = useState([]);
  const [carregandoHistorico, setCarregandoHistorico] = useState(false);
  const [formasPagamentoPopup, setFormasPagamentoPopup] = useState([]);
  const [mostrarModalFormasPopup, setMostrarModalFormasPopup] = useState(false);
  const [linhaEditandoPopup, setLinhaEditandoPopup] = useState(null);
  const snapshotEdicaoPopupRef = useRef(null);
  const [lembretesAbertos, setLembretesAbertos] = useState(false);
  const [lembretesMostrados, setLembretesMostrados] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const [motivoExclusao, setMotivoExclusao] = useState("");
  const [processandoExclusao, setProcessandoExclusao] = useState(false);
  const [unidadeExpandida, setUnidadeExpandida] = useState(null); // { id, nome } — pop-up de resumo por unidade
  const [ordenacaoExpandida, setOrdenacaoExpandida] = useState({ campo: null, direcao: "asc" });
  const [alterandoOrcamento, setAlterandoOrcamento] = useState(false);
  const [novoOrcamento, setNovoOrcamento] = useState("");
  const [motivoOrcamento, setMotivoOrcamento] = useState("");
  const [salvandoOrcamento, setSalvandoOrcamento] = useState(false);
  const [editandoLancamentoId, setEditandoLancamentoId] = useState(null);
  const [novoValorLancamento, setNovoValorLancamento] = useState("");
  const [salvandoLancamento, setSalvandoLancamento] = useState(false);
  const [baixandoOutraOs, setBaixandoOutraOs] = useState(false);
  const [numeroOsPagamento, setNumeroOsPagamento] = useState("");
  const [motivoBaixaOutraOs, setMotivoBaixaOutraOs] = useState("");
  const [verificandoOutraOs, setVerificandoOutraOs] = useState(false);
  const [verificacaoOutraOs, setVerificacaoOutraOs] = useState(null); // { valor, bate }
  const [salvandoBaixaOutraOs, setSalvandoBaixaOutraOs] = useState(false);
  const podeExcluir = podeExcluirLancamento(usuario.cargo);
  const isAdmin = podeAlterarContasAReceber(usuario.cargo);
  // Gerência, Supervisão e Administrador podem excluir uma conta do Contas a
  // Receber mesmo já tendo valor pago (os demais cargos com acesso a excluir
  // só podem quando ainda não tem nada pago).
  const podeExcluirSempre = [CARGOS.GERENCIA, CARGOS.SUPERVISAO, CARGOS.ADMINISTRADOR].includes(usuario.cargo);
  const podeEditarDataRecebimento = podeLancarDataRetroativa(usuario.cargo, selecionada?.linha);
  const precisaParcelasUnica = precisaParcelasFn(formaPagamento);
  const precisaBandeiraUnica = precisaBandeiraFn(formaPagamento);
  const unidadesMap = Object.fromEntries(unidades.map((u) => [u.id, u.nome]));
  const mostrarUnidade = podeVerTodasUnidades(usuario.cargo) || unidades.length > 1;

  async function carregar() {
    if (unidades.length === 0) return [];
    let query = supabase
      .from("vw_contas_a_receber")
      .select("*")
      .in("unidade_id", unidades.map((u) => u.id))
      .order("falta_pagar", { ascending: false });
    if (linhaFiltro) query = query.eq("linha", linhaFiltro);
    const { data } = await query;
    setLinhas(data || []);
    return data || [];
  }

  useEffect(() => {
    carregar();
  }, [unidades, linhaFiltro]); // eslint-disable-line react-hooks/exhaustive-deps

  // Vem de um link "Ir para Contas a Receber" (ex: do aviso em Novo
  // lançamento) com ?os=XXXX — abre direto o popup de baixa dessa OS.
  useEffect(() => {
    if (osAutoAbriuRef.current) return;
    const osDaUrl = parametrosUrl.get("os");
    if (!osDaUrl || linhas.length === 0) return;
    const alvo = linhas.find((l) => l.numero_os === osDaUrl);
    if (alvo) {
      osAutoAbriuRef.current = true;
      abrirPopup(alvo);
    }
  }, [linhas]); // eslint-disable-line react-hooks/exhaustive-deps

  // lembretes: OS com mais de 24h em aberto — abre automaticamente 1x por dia
  const lembretes = linhas.filter((l) => horasDesde(l.ultimo_lancamento) >= 24);
  useEffect(() => {
    if (lembretesMostrados || lembretes.length === 0) return;
    const chave = `lembrete-contas-receber-${hojeBrasil()}`;
    if (!window.localStorage.getItem(chave)) {
      setLembretesAbertos(true);
      window.localStorage.setItem(chave, "1");
    }
    setLembretesMostrados(true);
  }, [lembretes, lembretesMostrados]);

  const buscaOsNormalizada = buscaOs.trim().toLowerCase();
  const linhasFiltradas = linhas
    .filter((l) => !filtroUnidade || l.unidade_id === filtroUnidade)
    .filter((l) => !buscaOsNormalizada || l.numero_os.toLowerCase().includes(buscaOsNormalizada));
  const totalOrcamento = linhasFiltradas.reduce((s, l) => s + Number(l.orcamento_aprovado), 0);
  const totalFalta = linhasFiltradas.reduce((s, l) => s + Number(l.falta_pagar), 0);
  const percentualFalta = totalOrcamento ? (totalFalta / totalOrcamento) * 100 : 0;
  const consultaAtiva = filtroUnidade !== "" || buscaOsNormalizada !== "";

  function limparConsulta() {
    setBuscaOs("");
    setFiltroUnidade("");
  }

  // resumo por unidade — só pra quem tem acesso a mais de uma unidade e está
  // olhando "todas" (sem escolher uma específica no filtro)
  const mostrarResumoUnidades = unidades.length > 1 && !filtroUnidade && !buscaOsNormalizada;
  const resumoPorUnidade = unidades
    .map((u) => {
      const doUnidade = linhas.filter((l) => l.unidade_id === u.id);
      return {
        id: u.id,
        nome: u.nome,
        orcamento: doUnidade.reduce((s, l) => s + Number(l.orcamento_aprovado), 0),
        pago: doUnidade.reduce((s, l) => s + Number(l.total_pago), 0),
        falta: doUnidade.reduce((s, l) => s + Number(l.falta_pagar), 0),
        qtdOs: doUnidade.length,
      };
    })
    .filter((u) => u.qtdOs > 0)
    .sort((a, b) => b.falta - a.falta);
  const linhasDaUnidadeExpandida = unidadeExpandida ? linhas.filter((l) => l.unidade_id === unidadeExpandida.id) : [];
  const contagemOsExpandida = {};
  linhasDaUnidadeExpandida.forEach((l) => {
    contagemOsExpandida[l.numero_os] = (contagemOsExpandida[l.numero_os] || 0) + 1;
  });
  const linhasDaUnidadeExpandidaOrdenadas = [...linhasDaUnidadeExpandida].sort((a, b) => {
    if (!ordenacaoExpandida.campo) return 0;
    let va, vb;
    if (ordenacaoExpandida.campo === "numero_os") {
      va = Number(a.numero_os) || a.numero_os;
      vb = Number(b.numero_os) || b.numero_os;
    } else {
      va = new Date(a.ultimo_lancamento).getTime();
      vb = new Date(b.ultimo_lancamento).getTime();
    }
    const cmp = va > vb ? 1 : va < vb ? -1 : 0;
    return ordenacaoExpandida.direcao === "asc" ? cmp : -cmp;
  });

  function alternarOrdenacaoExpandida(campo) {
    setOrdenacaoExpandida((atual) =>
      atual.campo === campo ? { campo, direcao: atual.direcao === "asc" ? "desc" : "asc" } : { campo, direcao: "asc" }
    );
  }

  async function carregarHistorico(unidadeId, numeroOs, tipoServicoId, linhaCiIh) {
    setCarregandoHistorico(true);
    const { data } = await supabase
      .from("lancamentos")
      .select("id, data, valor_pago, forma_pagamento, formas_pagamento, usuarios!atendente_id(nome_completo)")
      .eq("unidade_id", unidadeId)
      .eq("numero_os", numeroOs)
      .eq("tipo_servico_id", tipoServicoId)
      .eq("linha", linhaCiIh)
      .order("criado_em", { ascending: true });
    setHistorico(data || []);
    setCarregandoHistorico(false);
  }

  function abrirPopup(linha) {
    setSelecionada(linha);
    setValorAgora(Number(linha.falta_pagar));
    setFormaPagamento("");
    setFormasPagamentoPopup([]);
    setLinhaEditandoPopup(null);
    setMostrarDataRetroativa(false);
    setDataRecebimento("");
    setBaixandoOutraOs(false);
    setNumeroOsPagamento("");
    setMotivoBaixaOutraOs("");
    setVerificacaoOutraOs(null);
    setParcelas("");
    setBandeira("");
    carregarHistorico(linha.unidade_id, linha.numero_os, linha.tipo_servico_id, linha.linha);
  }

  function fecharPopup() {
    setSelecionada(null);
    setHistorico([]);
    setFormasPagamentoPopup([]);
    setLinhaEditandoPopup(null);
    setExcluindo(false);
    setMotivoExclusao("");
    setAlterandoOrcamento(false);
    setNovoOrcamento("");
    setMotivoOrcamento("");
    setEditandoLancamentoId(null);
    setNovoValorLancamento("");
    setMostrarDataRetroativa(false);
    setDataRecebimento("");
    setBaixandoOutraOs(false);
    setNumeroOsPagamento("");
    setMotivoBaixaOutraOs("");
    setVerificacaoOutraOs(null);
    setParcelas("");
    setBandeira("");
  }

  function abrirAlteracaoOrcamento() {
    setNovoOrcamento(Number(selecionada.orcamento_aprovado));
    setMotivoOrcamento("");
    setAlterandoOrcamento(true);
  }

  async function confirmarAlteracaoOrcamento() {
    if (!selecionada || !motivoOrcamento.trim()) return;
    const valor = Number(novoOrcamento);
    if (!valor || valor <= 0) {
      alert("Informe um novo orçamento válido.");
      return;
    }
    setSalvandoOrcamento(true);
    const { error } = await supabase.rpc("admin_corrigir_orcamento_cr", {
      p_unidade_id: selecionada.unidade_id,
      p_numero_os: selecionada.numero_os,
      p_tipo_servico_id: selecionada.tipo_servico_id,
      p_linha: selecionada.linha,
      p_novo_orcamento: valor,
      p_motivo: motivoOrcamento.trim(),
    });
    setSalvandoOrcamento(false);
    if (error) {
      alert("Erro ao corrigir o orçamento: " + error.message);
      return;
    }
    // correção salva — fecha o pop-up de vez, sem cair na tela de
    // "registrar novo pagamento" (a correção já é a ação completa,
    // não precisa de mais nenhum passo)
    await carregar();
    fecharPopup();
  }

  async function verificarOutraOs() {
    if (!selecionada || !numeroOsPagamento.trim()) return;
    const numeroDigitado = numeroOsPagamento.trim();
    setVerificandoOutraOs(true);
    setVerificacaoOutraOs(null);
    const { data, error } = await supabase
      .from("lancamentos")
      .select("valor_pago")
      .eq("unidade_id", selecionada.unidade_id)
      .eq("numero_os", numeroDigitado)
      .eq("linha", selecionada.linha);
    setVerificandoOutraOs(false);
    if (error) {
      alert("Erro ao verificar a OS: " + error.message);
      return;
    }
    if (!data || data.length === 0) {
      setVerificacaoOutraOs({ valor: 0, bate: false, naoEncontrada: true });
      return;
    }
    const valorOutraOs = data.reduce((s, l) => s + Number(l.valor_pago), 0);
    const bate = Math.abs(valorOutraOs - Number(selecionada.falta_pagar)) < 0.01;
    setVerificacaoOutraOs({ valor: valorOutraOs, bate, naoEncontrada: false });
  }

  async function confirmarBaixaOutraOs() {
    if (!selecionada || !verificacaoOutraOs?.bate || !motivoBaixaOutraOs.trim()) return;
    setSalvandoBaixaOutraOs(true);
    const { error } = await supabase.rpc("admin_baixar_cr_outra_os", {
      p_unidade_id: selecionada.unidade_id,
      p_numero_os: selecionada.numero_os,
      p_tipo_servico_id: selecionada.tipo_servico_id,
      p_linha: selecionada.linha,
      p_numero_os_pagamento: numeroOsPagamento.trim(),
      p_motivo: motivoBaixaOutraOs.trim(),
    });
    setSalvandoBaixaOutraOs(false);
    if (error) {
      alert("Erro ao dar baixa: " + error.message);
      return;
    }
    await carregar();
    fecharPopup();
  }

  function iniciarEdicaoLancamento(h) {
    setEditandoLancamentoId(h.id);
    setNovoValorLancamento(Number(h.valor_pago));
  }

  async function salvarEdicaoLancamento(h) {
    const valor = Number(novoValorLancamento);
    if (!valor || valor <= 0) {
      alert("Informe um valor válido.");
      return;
    }
    setSalvandoLancamento(true);
    const { error } = await supabase
      .from("lancamentos")
      .update({
        valor_pago: valor,
        motivo_exclusao: `[Admin] Valor corrigido de R$ ${formatarMoedaSemSimbolo(h.valor_pago)} para R$ ${formatarMoedaSemSimbolo(valor)}`,
        alterado_por: usuario.id,
        alterado_em: new Date().toISOString(),
      })
      .eq("id", h.id);
    setSalvandoLancamento(false);
    if (error) {
      alert("Erro ao corrigir o valor: " + error.message);
      return;
    }
    setEditandoLancamentoId(null);
    await carregarHistorico(selecionada.unidade_id, selecionada.numero_os, selecionada.tipo_servico_id, selecionada.linha);
    const atualizadas = await carregar();
    const atualizada = atualizadas.find(
      (l) =>
        l.unidade_id === selecionada.unidade_id &&
        l.numero_os === selecionada.numero_os &&
        l.tipo_servico_id === selecionada.tipo_servico_id &&
        l.linha === selecionada.linha
    );
    if (atualizada) setSelecionada(atualizada);
  }

  async function excluirLancamentoUnico(h) {
    if (!window.confirm(`Excluir só este lançamento de R$ ${formatarMoedaSemSimbolo(h.valor_pago)} (${formatarDataBR(h.data)})?`)) return;
    const motivo = window.prompt("Motivo da exclusão deste lançamento:");
    if (!motivo || !motivo.trim()) return;
    const { error: erroMotivo } = await supabase
      .from("lancamentos")
      .update({ motivo_exclusao: motivo.trim(), alterado_por: usuario.id, alterado_em: new Date().toISOString() })
      .eq("id", h.id);
    if (erroMotivo) {
      alert("Erro ao registrar o motivo: " + erroMotivo.message);
      return;
    }
    const { error } = await supabase.from("lancamentos").delete().eq("id", h.id);
    if (error) {
      alert("Erro ao excluir: " + error.message);
      return;
    }
    await carregarHistorico(selecionada.unidade_id, selecionada.numero_os, selecionada.tipo_servico_id, selecionada.linha);
    const atualizadas = await carregar();
    const atualizada = atualizadas.find(
      (l) =>
        l.unidade_id === selecionada.unidade_id &&
        l.numero_os === selecionada.numero_os &&
        l.tipo_servico_id === selecionada.tipo_servico_id &&
        l.linha === selecionada.linha
    );
    if (atualizada) setSelecionada(atualizada);
    else fecharPopup();
  }

  async function confirmarExclusaoConta() {
    if (!motivoExclusao.trim() || !selecionada) return;
    const confirmou = window.confirm(
      `Confirma a exclusão da OS ${selecionada.numero_os}${mostrarUnidade ? " — " + (unidadesMap[selecionada.unidade_id] || "") : ""}?\n\nEssa ação não pode ser desfeita.`
    );
    if (!confirmou) return;
    setProcessandoExclusao(true);
    const ids = historico.map((h) => h.id);
    // primeiro grava o motivo em cada lançamento (fica no log de auditoria), depois exclui de fato
    const { error: erroMotivo } = await supabase
      .from("lancamentos")
      .update({ motivo_exclusao: motivoExclusao.trim(), alterado_por: usuario.id, alterado_em: new Date().toISOString() })
      .in("id", ids);
    if (erroMotivo) {
      alert("Erro ao registrar o motivo: " + erroMotivo.message);
      setProcessandoExclusao(false);
      return;
    }
    const { error } = await supabase.from("lancamentos").delete().in("id", ids);
    setProcessandoExclusao(false);
    if (error) {
      alert("Erro ao excluir: " + error.message);
      return;
    }
    fecharPopup();
    carregar();
  }

  async function confirmarPagamento() {
    if (!selecionada) return;
    const usaMultiplas = formasPagamentoPopup.length > 0;
    if (usaMultiplas && linhaEditandoPopup !== null) {
      alert("Finalize a edição da forma de pagamento antes de salvar.");
      return;
    }
    if (!usaMultiplas && !formaPagamento) {
      alert("Selecione a forma de pagamento.");
      return;
    }
    const totalFormas = formasPagamentoPopup.reduce((s, f) => s + (Number(f.valor) || 0), 0);
    const valorEfetivo = usaMultiplas ? totalFormas : Number(valorAgora) || 0;
    if (valorEfetivo <= 0) {
      alert("Informe o valor recebido.");
      return;
    }
    if (valorEfetivo > Number(selecionada.falta_pagar) + 0.001) {
      alert(`O valor não pode ser maior que o saldo em aberto: R$ ${formatarMoedaSemSimbolo(selecionada.falta_pagar)}.`);
      return;
    }

    setSalvando(true);
    const { error } = await supabase.rpc("registrar_pagamento_cr", {
      p_unidade_id: selecionada.unidade_id,
      p_numero_os: selecionada.numero_os,
      p_categoria_id: selecionada.categoria_id,
      p_modelo_id: selecionada.modelo_id,
      p_tipo_servico_id: selecionada.tipo_servico_id,
      p_linha: selecionada.linha,
      p_data: podeEditarDataRecebimento && mostrarDataRetroativa && dataRecebimento ? dataRecebimento : hojeBrasil(),
      p_valor_pago: valorEfetivo,
      p_forma_pagamento: usaMultiplas ? "MÚLTIPLAS" : formaPagamento,
      p_formas_pagamento: usaMultiplas ? formasPagamentoPopup.map(({ id, ...resto }) => resto) : null,
      p_parcelas: !usaMultiplas && precisaParcelasUnica && parcelas ? Number(parcelas) : null,
      p_bandeira: !usaMultiplas && precisaBandeiraUnica ? bandeira : null,
      p_atendente_id: usuario.id,
      p_criado_por: usuario.id,
    });
    setSalvando(false);
    if (error) {
      alert("Erro ao registrar: " + error.message);
      return;
    }

    await carregar();
    fecharPopup();
  }

  function aoSalvarModalFormasPopup(formas) {
    setFormasPagamentoPopup(formas.map((f) => ({ ...f, id: gerarIdLinhaCr() })));
    setMostrarModalFormasPopup(false);
    setLinhaEditandoPopup(null);
    setValorAgora("");
    setFormaPagamento("");
  }

  function usarFormaUnicaPopup() {
    if (formasPagamentoPopup.length > 0 && !window.confirm("Remover as formas de pagamento já preenchidas e voltar a usar apenas uma?")) return;
    setFormasPagamentoPopup([]);
    setLinhaEditandoPopup(null);
  }

  function adicionarLinhaInlinePopup() {
    const nova = { id: gerarIdLinhaCr(), valor: "", forma_pagamento: "", parcelas: null, bandeira: null };
    setFormasPagamentoPopup((fs) => [...fs, nova]);
    snapshotEdicaoPopupRef.current = nova;
    setLinhaEditandoPopup(nova.id);
  }

  function atualizarCampoLinhaPopup(id, campo, valor) {
    setFormasPagamentoPopup((fs) => fs.map((f) => (f.id === id ? { ...f, [campo]: valor } : f)));
  }

  function iniciarEdicaoLinhaPopup(entry) {
    snapshotEdicaoPopupRef.current = entry;
    setLinhaEditandoPopup(entry.id);
  }

  function cancelarEdicaoLinhaPopup() {
    const snap = snapshotEdicaoPopupRef.current;
    if (snap) {
      if (!snap.forma_pagamento && !snap.valor) {
        setFormasPagamentoPopup((fs) => fs.filter((f) => f.id !== snap.id));
      } else {
        setFormasPagamentoPopup((fs) => fs.map((f) => (f.id === snap.id ? snap : f)));
      }
    }
    setLinhaEditandoPopup(null);
    snapshotEdicaoPopupRef.current = null;
  }

  function salvarEdicaoLinhaPopup(entry) {
    if (!entry.valor || Number(entry.valor) <= 0 || !entry.forma_pagamento) {
      alert("Preencha o valor e a forma de pagamento antes de salvar esta linha.");
      return;
    }
    setLinhaEditandoPopup(null);
    snapshotEdicaoPopupRef.current = null;
  }

  function excluirLinhaPopup(id) {
    if (!window.confirm("Remover esta forma de pagamento?")) return;
    setFormasPagamentoPopup((fs) => fs.filter((f) => f.id !== id));
    if (linhaEditandoPopup === id) {
      setLinhaEditandoPopup(null);
      snapshotEdicaoPopupRef.current = null;
    }
  }

  return (
    <div className="max-w-4xl">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted mb-1">Operação</p>
          <h1 className="font-display text-2xl font-semibold text-ink">Contas a receber</h1>
        </div>
        <div className="flex items-center gap-2">
          <BotaoAtualizar aoAtualizar={carregar} />
          <button onClick={() => setLembretesAbertos(true)} className="relative btn w-10 h-10 p-0" title="Lembretes de cobrança">
            <Bell size={16} />
            {lembretes.length > 0 && (
              <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-danger text-white text-[10px] flex items-center justify-center">
                {lembretes.length}
              </span>
            )}
          </button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {mostrarUnidade && (
          <div className="flex items-center gap-2">
            <span className="field-label mb-0">Unidade:</span>
            <select className="field-input w-56" value={filtroUnidade} onChange={(e) => setFiltroUnidade(e.target.value)}>
              <option value="">Todas as unidades</option>
              {unidades.map((u) => (
                <option key={u.id} value={u.id}>{u.nome}</option>
              ))}
            </select>
          </div>
        )}

        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gold" />
          <input
            type="text"
            className="field-input w-56 pl-8"
            placeholder="Consultar OS…"
            value={buscaOs}
            onChange={(e) => setBuscaOs(e.target.value)}
          />
        </div>

        {consultaAtiva && (
          <button
            onClick={limparConsulta}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-white
              bg-gradient-to-b from-[#E0664B] to-[#C94E33] shadow-sm hover:brightness-105 hover:-translate-y-px active:translate-y-0 transition-all"
          >
            <Eraser size={13} /> Limpar consulta
          </button>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="card p-4 flex items-center gap-3">
          <span className="w-9 h-9 rounded-full bg-bronze/10 text-bronze flex items-center justify-center shrink-0">
            <Wallet size={16} />
          </span>
          <div>
            <p className="text-xs text-muted mb-1">Total a receber</p>
            <p className="font-mono-num text-xl font-semibold text-bronze">R$ {formatarMoedaSemSimbolo(totalFalta)}</p>
          </div>
        </div>
        <div className="card p-4 flex items-center gap-3">
          <span className="w-9 h-9 rounded-full bg-teal/10 text-teal flex items-center justify-center shrink-0">
            <PieChart size={16} />
          </span>
          <div>
            <p className="text-xs text-muted mb-1">% do orçamento total</p>
            <p className="font-mono-num text-xl font-semibold text-ink">{percentualFalta.toFixed(1)}%</p>
          </div>
        </div>
        <div className="card p-4 flex items-center gap-3">
          <span className="w-9 h-9 rounded-full bg-[#3F8A5C]/10 text-[#3F8A5C] flex items-center justify-center shrink-0">
            <ListChecks size={16} />
          </span>
          <div>
            <p className="text-xs text-muted mb-1">OS em aberto</p>
            <p className="font-mono-num text-xl font-semibold text-ink">{linhasFiltradas.length}</p>
          </div>
        </div>
      </div>

      {buscaOsNormalizada && (
        <p className="text-xs text-muted mb-3 -mt-3">
          {linhasFiltradas.length === 0
            ? `Nenhuma OS em aberto encontrada para "${buscaOs.trim()}".`
            : `${linhasFiltradas.length} resultado${linhasFiltradas.length > 1 ? "s" : ""} para "${buscaOs.trim()}".`}
        </p>
      )}

      <div className="card overflow-hidden">
        {mostrarResumoUnidades ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wider text-muted border-b border-line">
                <td className="p-3">Unidade</td>
                <td className="p-3 text-right">Orçamento</td>
                <td className="p-3 text-right"><span className="text-[#3F8A5C] font-bold bg-[#3F8A5C]/10 rounded px-2 py-0.5">Pago</span></td>
                <td className="p-3 text-right">Falta pagar</td>
                <td className="p-3 text-right">OS em aberto</td>
              </tr>
            </thead>
            <tbody>
              {resumoPorUnidade.length === 0 && (
                <tr><td className="p-4 text-muted" colSpan={5}>Nenhuma OS em aberto.</td></tr>
              )}
              {resumoPorUnidade.map((u) => (
                <tr
                  key={u.id}
                  className="border-t border-line hover:bg-canvas/60 cursor-pointer"
                  onClick={() => {
                    setUnidadeExpandida({ id: u.id, nome: u.nome });
                    setOrdenacaoExpandida({ campo: null, direcao: "asc" });
                  }}
                >
                  <td className="p-3 font-medium">{u.nome}</td>
                  <td className="p-3 text-right font-mono-num">R$ {formatarMoedaSemSimbolo(u.orcamento)}</td>
                  <td className="p-3 text-right font-mono-num font-bold text-[#2E6B45] bg-[#3F8A5C]/5">R$ {formatarMoedaSemSimbolo(u.pago)}</td>
                  <td className="p-3 text-right font-mono-num font-bold text-bronze bg-bronze/5">R$ {formatarMoedaSemSimbolo(u.falta)}</td>
                  <td className="p-3 text-right font-mono-num text-muted">{u.qtdOs}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wider text-muted border-b border-line">
              {mostrarUnidade && <td className="p-3">Unidade</td>}
              <td className="p-3">Nº OS</td>
              <td className="p-3">Tipo de serviço</td>
              <td className="p-3 text-right">Orçamento</td>
              <td className="p-3 text-right"><span className="text-[#3F8A5C] font-bold bg-[#3F8A5C]/10 rounded px-2 py-0.5">Pago</span></td>
              <td className="p-3 text-right">Falta pagar</td>
              <td className="p-3">Último lançamento</td>
            </tr>
          </thead>
          <tbody>
            {linhasFiltradas.length === 0 && (
              <tr><td className="p-4 text-muted" colSpan={mostrarUnidade ? 7 : 6}>Nenhuma OS em aberto.</td></tr>
            )}
            {linhasFiltradas.map((l) => (
              <tr
                key={`${l.unidade_id}-${l.numero_os}-${l.tipo_servico_id}-${l.linha}`}
                className="border-t border-line hover:bg-canvas/60 cursor-pointer"
                onClick={() => abrirPopup(l)}
              >
                {mostrarUnidade && <td className="p-3">{unidadesMap[l.unidade_id]}</td>}
                <td className="p-3 font-mono-num">{l.numero_os}</td>
                <td className="p-3 text-xs text-muted">
                  {l.tipo_servico_nome || "—"}{" "}
                  {l.linha === "ih" && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded font-medium bg-teal-soft text-teal">
                      IH
                    </span>
                  )}
                </td>
                <td className="p-3 text-right font-mono-num">R$ {formatarMoedaSemSimbolo(l.orcamento_aprovado)}</td>
                <td className="p-3 text-right font-mono-num font-bold text-[#2E6B45] bg-[#3F8A5C]/5">R$ {formatarMoedaSemSimbolo(l.total_pago)}</td>
                <td className="p-3 text-right font-mono-num font-medium text-bronze">R$ {formatarMoedaSemSimbolo(l.falta_pagar)}</td>
                <td className="p-3 text-muted">{formatarDataBR(l.ultimo_lancamento)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        )}
      </div>

      {unidadeExpandida && (
        <Modal titulo={unidadeExpandida.nome} subtitulo={`${linhasDaUnidadeExpandida.length} OS em aberto`} onFechar={() => setUnidadeExpandida(null)} largura="max-w-6xl">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wider text-muted border-b border-line">
                <td className="pb-2 pr-3">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 uppercase tracking-wider hover:text-ink"
                    onClick={() => alternarOrdenacaoExpandida("numero_os")}
                  >
                    Nº OS
                    {ordenacaoExpandida.campo === "numero_os" && (
                      <span className="text-[10px]">{ordenacaoExpandida.direcao === "asc" ? "▲" : "▼"}</span>
                    )}
                  </button>
                </td>
                <td className="pb-2 pr-3">Tipo de serviço</td>
                <td className="pb-2 pr-3 text-right whitespace-nowrap">Orçamento</td>
                <td className="pb-2 pr-3 text-right whitespace-nowrap"><span className="text-[#3F8A5C] font-bold bg-[#3F8A5C]/10 rounded px-2 py-0.5">Pago</span></td>
                <td className="pb-2 pr-3 text-right whitespace-nowrap">Falta pagar</td>
                <td className="pb-2">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 uppercase tracking-wider hover:text-ink whitespace-nowrap"
                    onClick={() => alternarOrdenacaoExpandida("ultimo_lancamento")}
                  >
                    Último lançamento
                    {ordenacaoExpandida.campo === "ultimo_lancamento" && (
                      <span className="text-[10px]">{ordenacaoExpandida.direcao === "asc" ? "▲" : "▼"}</span>
                    )}
                  </button>
                </td>
              </tr>
            </thead>
            <tbody>
              {linhasDaUnidadeExpandidaOrdenadas.map((l) => {
                const duplicada = contagemOsExpandida[l.numero_os] > 1;
                return (
                  <tr
                    key={`${l.unidade_id}-${l.numero_os}-${l.tipo_servico_id}-${l.linha}`}
                    className={`border-t border-line hover:bg-canvas/60 cursor-pointer ${duplicada ? "bg-amber-50 border-l-4 border-l-amber-400" : ""}`}
                    onClick={() => {
                      setUnidadeExpandida(null);
                      abrirPopup(l);
                    }}
                  >
                    <td className="py-2.5 pr-3 font-mono-num whitespace-nowrap">
                      {l.numero_os}
                      {duplicada && (
                        <span className="ml-1.5 text-[9px] px-1.5 py-0.5 rounded font-semibold bg-amber-200 text-amber-900 align-middle">
                          DUPLICADA
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 pr-3 text-xs text-muted">
                      {l.tipo_servico_nome || "—"}{" "}
                      {l.linha === "ih" && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded font-medium bg-teal-soft text-teal">IH</span>
                      )}
                    </td>
                    <td className="py-2.5 pr-3 text-right font-mono-num whitespace-nowrap">R$ {formatarMoedaSemSimbolo(l.orcamento_aprovado)}</td>
                    <td className="py-2.5 pr-3 text-right font-mono-num font-bold text-[#2E6B45] bg-[#3F8A5C]/5 whitespace-nowrap">R$ {formatarMoedaSemSimbolo(l.total_pago)}</td>
                    <td className="py-2.5 pr-3 text-right font-mono-num font-medium text-bronze whitespace-nowrap">R$ {formatarMoedaSemSimbolo(l.falta_pagar)}</td>
                    <td className="py-2.5 text-muted whitespace-nowrap">{formatarDataBR(l.ultimo_lancamento)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Modal>
      )}

      {selecionada && (
        <Modal
          titulo={`OS ${selecionada.numero_os}`}
          subtitulo={`${mostrarUnidade ? unidadesMap[selecionada.unidade_id] + " — " : ""}${selecionada.tipo_servico_nome || "Quitar saldo em aberto"}`}
          onFechar={fecharPopup}
          largura="max-w-xl"
        >
          {excluindo ? (
            <div className="space-y-4">
              <div className="flex items-start gap-2 text-sm text-danger">
                <AlertTriangle size={18} className="shrink-0 mt-0.5" />
                <p>
                  Você está prestes a excluir permanentemente o registro da OS{" "}
                  <span className="font-mono-num font-medium">{selecionada.numero_os}</span> do Contas a Receber
                  (orçamento de <span className="font-mono-num font-medium">R$ {formatarMoedaSemSimbolo(selecionada.orcamento_aprovado)}</span>
                  {Number(selecionada.total_pago) > 0 ? (
                    <>
                      , incluindo{" "}
                      <span className="font-mono-num font-medium">R$ {formatarMoedaSemSimbolo(selecionada.total_pago)}</span> já pago e
                      todo o histórico de lançamentos dessa conta
                    </>
                  ) : (
                    <>, sem nenhum valor pago</>
                  )}
                  ). Essa ação não pode ser desfeita.
                </p>
              </div>
              <div>
                <label className="field-label">Motivo da exclusão (obrigatório)</label>
                <textarea
                  className="field-input"
                  rows={3}
                  value={motivoExclusao}
                  onChange={(e) => setMotivoExclusao(e.target.value)}
                  placeholder="Ex: cliente desistiu, orçamento cadastrado por engano, etc."
                />
                <p className="text-xs text-muted mt-1">O motivo fica registrado no log do sistema, junto com os dados excluídos.</p>
              </div>
              <div className="flex justify-end gap-2">
                <button className="btn" onClick={() => setExcluindo(false)}>Cancelar</button>
                <button
                  className="btn-primary bg-danger hover:bg-danger flex items-center gap-1.5 disabled:opacity-40"
                  disabled={!motivoExclusao.trim() || processandoExclusao}
                  onClick={confirmarExclusaoConta}
                >
                  <Trash2 size={14} /> {processandoExclusao ? "Excluindo…" : "Confirmar exclusão"}
                </button>
              </div>
            </div>
          ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div><p className="text-xs text-muted">Orçamento</p><p className="font-mono-num font-medium">R$ {formatarMoedaSemSimbolo(selecionada.orcamento_aprovado)}</p></div>
              <div><p className="text-xs text-muted">Já pago</p><p className="font-mono-num font-medium">R$ {formatarMoedaSemSimbolo(selecionada.total_pago)}</p></div>
              <div><p className="text-xs text-muted">Falta pagar</p><p className="font-mono-num font-medium text-bronze">R$ {formatarMoedaSemSimbolo(selecionada.falta_pagar)}</p></div>
            </div>

            <div className="flex items-center gap-4">
              {podeExcluirSempre || (podeExcluir && Number(selecionada.total_pago) === 0) ? (
                <button
                  className="text-xs text-danger hover:underline flex items-center gap-1"
                  onClick={() => setExcluindo(true)}
                >
                  <Trash2 size={12} /> Excluir este registro do Contas a Receber
                </button>
              ) : null}
              {isAdmin && !alterandoOrcamento && (
                <button
                  className="text-xs text-gold hover:underline flex items-center gap-1"
                  onClick={abrirAlteracaoOrcamento}
                >
                  <ShieldAlert size={12} /> Corrigir orçamento desta conta
                </button>
              )}
              {isAdmin && !baixandoOutraOs && (
                <button
                  className="text-xs text-gold hover:underline flex items-center gap-1"
                  onClick={() => setBaixandoOutraOs(true)}
                >
                  <Search size={12} /> Pagamento foi lançado em outra OS
                </button>
              )}
            </div>

            {isAdmin && baixandoOutraOs && (
              <div className="rounded-lg border border-gold/30 bg-gold/5 p-3 space-y-2">
                <p className="text-xs font-medium text-ink flex items-center gap-1.5">
                  <Search size={13} className="text-gold" /> Baixar informando a OS onde o pagamento foi lançado (somente Administrador)
                </p>
                <p className="text-xs text-muted">
                  Use isso quando o cliente já pagou, mas o lançamento foi feito por engano em outro número de OS.
                  O sistema confere se o valor pago na outra OS bate com o saldo em aberto desta conta
                  (R$ {formatarMoedaSemSimbolo(selecionada.falta_pagar)}) e dá baixa aqui sem lançar um novo valor.
                </p>
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <label className="field-label">Número da OS onde o pagamento foi lançado</label>
                    <input
                      type="text"
                      className="field-input"
                      value={numeroOsPagamento}
                      onChange={(e) => {
                        setNumeroOsPagamento(e.target.value);
                        setVerificacaoOutraOs(null);
                      }}
                      placeholder="Ex: 4176123456"
                    />
                  </div>
                  <button
                    type="button"
                    className="btn text-xs disabled:opacity-40"
                    disabled={!numeroOsPagamento.trim() || verificandoOutraOs}
                    onClick={verificarOutraOs}
                  >
                    {verificandoOutraOs ? "Verificando…" : "Verificar"}
                  </button>
                </div>

                {verificacaoOutraOs && verificacaoOutraOs.naoEncontrada && (
                  <p className="text-xs text-danger">Não encontrei nenhum lançamento na OS {numeroOsPagamento.trim()} nessa unidade.</p>
                )}
                {verificacaoOutraOs && !verificacaoOutraOs.naoEncontrada && !verificacaoOutraOs.bate && (
                  <p className="text-xs text-danger">
                    O valor pago na OS {numeroOsPagamento.trim()} (R$ {formatarMoedaSemSimbolo(verificacaoOutraOs.valor)}) é diferente
                    do saldo em aberto desta conta (R$ {formatarMoedaSemSimbolo(selecionada.falta_pagar)}). Confira o número da OS.
                  </p>
                )}
                {verificacaoOutraOs && verificacaoOutraOs.bate && (
                  <div className="rounded-lg border border-[#3F8A5C]/30 bg-[#3F8A5C]/5 p-3 space-y-2">
                    <p className="text-xs text-[#2E6B45] flex items-center gap-1.5">
                      <Check size={13} /> O valor pago na OS {numeroOsPagamento.trim()} (R$ {formatarMoedaSemSimbolo(verificacaoOutraOs.valor)}) bate
                      com o saldo em aberto. Confirma a baixa desta conta sem lançar um novo valor?
                    </p>
                    <div>
                      <label className="field-label">Motivo (obrigatório)</label>
                      <input
                        type="text"
                        className="field-input"
                        value={motivoBaixaOutraOs}
                        onChange={(e) => setMotivoBaixaOutraOs(e.target.value)}
                        placeholder="Ex: pagamento lançado por engano na OS acima"
                      />
                    </div>
                  </div>
                )}

                <div className="flex justify-end gap-2">
                  <button
                    className="btn text-xs"
                    onClick={() => {
                      setBaixandoOutraOs(false);
                      setNumeroOsPagamento("");
                      setMotivoBaixaOutraOs("");
                      setVerificacaoOutraOs(null);
                    }}
                  >
                    Cancelar
                  </button>
                  {verificacaoOutraOs?.bate && (
                    <button
                      className="btn-primary text-xs disabled:opacity-40"
                      disabled={!motivoBaixaOutraOs.trim() || salvandoBaixaOutraOs}
                      onClick={confirmarBaixaOutraOs}
                    >
                      {salvandoBaixaOutraOs ? "Salvando…" : "Confirmar baixa"}
                    </button>
                  )}
                </div>
              </div>
            )}

            {isAdmin && alterandoOrcamento && (
              <div className="rounded-lg border border-gold/30 bg-gold/5 p-3 space-y-2">
                <p className="text-xs font-medium text-ink flex items-center gap-1.5"><ShieldAlert size={13} className="text-gold" /> Corrigir orçamento (somente Administrador)</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="field-label">Novo orçamento</label>
                    <CurrencyInput valor={novoOrcamento} onChange={setNovoOrcamento} />
                  </div>
                  <div>
                    <label className="field-label">Motivo (obrigatório)</label>
                    <input
                      type="text"
                      className="field-input"
                      value={motivoOrcamento}
                      onChange={(e) => setMotivoOrcamento(e.target.value)}
                      placeholder="Ex: orçamento cadastrado errado"
                    />
                  </div>
                </div>
                <p className="text-xs text-muted">
                  O novo orçamento não pode ficar menor que o total já pago (R$ {formatarMoedaSemSimbolo(selecionada.total_pago)}).
                  Vale pra todos os lançamentos dessa mesma conta.
                </p>
                <div className="flex justify-end gap-2">
                  <button className="btn text-xs" onClick={() => setAlterandoOrcamento(false)}>Cancelar</button>
                  <button
                    className="btn-primary text-xs disabled:opacity-40"
                    disabled={!motivoOrcamento.trim() || !novoOrcamento || salvandoOrcamento}
                    onClick={confirmarAlteracaoOrcamento}
                  >
                    {salvandoOrcamento ? "Salvando…" : "Salvar e fechar"}
                  </button>
                </div>
              </div>
            )}

            <div>
              <p className="field-label flex items-center gap-1.5 mb-1.5"><History size={12} /> O que já foi lançado nessa OS</p>
              {carregandoHistorico ? (
                <p className="text-sm text-muted">Carregando…</p>
              ) : historico.length === 0 ? (
                <p className="text-sm text-muted">Nenhum lançamento anterior.</p>
              ) : (
                <div className="card divide-y divide-line max-h-40 overflow-y-auto">
                  {historico.map((h) =>
                    editandoLancamentoId === h.id ? (
                      <div key={h.id} className="px-3 py-2 flex items-center gap-2 text-sm bg-gold/5">
                        <span className="text-muted shrink-0">{formatarDataBR(h.data)}</span>
                        <div className="w-28">
                          <CurrencyInput valor={novoValorLancamento} onChange={setNovoValorLancamento} />
                        </div>
                        <div className="flex items-center gap-1 ml-auto">
                          <button
                            type="button"
                            title="Salvar"
                            disabled={salvandoLancamento}
                            onClick={() => salvarEdicaoLancamento(h)}
                            className="text-muted hover:text-[#3F8A5C] transition p-1 disabled:opacity-40"
                          >
                            <Check size={14} />
                          </button>
                          <button
                            type="button"
                            title="Cancelar"
                            onClick={() => setEditandoLancamentoId(null)}
                            className="text-muted hover:text-danger transition p-1"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div key={h.id} className="px-3 py-2 flex items-center justify-between text-sm">
                        <div>
                          <span className="text-muted">{formatarDataBR(h.data)}</span>{" "}
                          <span className="text-xs text-muted">— {h.usuarios?.nome_completo || "—"}</span>
                        </div>
                        <div className="text-right flex items-center gap-1.5">
                          <span className="font-mono-num font-medium">R$ {formatarMoedaSemSimbolo(h.valor_pago)}</span>{" "}
                          <span className="text-xs text-muted bg-canvas px-1.5 py-0.5 rounded ml-1">
                            {h.forma_pagamento === "MÚLTIPLAS" ? `${(h.formas_pagamento || []).length} formas` : h.forma_pagamento || "—"}
                          </span>
                          {isAdmin && (
                            <span className="flex items-center gap-0.5 ml-1">
                              <button type="button" title="Corrigir valor (Administrador)" onClick={() => iniciarEdicaoLancamento(h)} className="text-muted hover:text-gold transition p-1">
                                <Pencil size={12} />
                              </button>
                              <button type="button" title="Excluir só este lançamento (Administrador)" onClick={() => excluirLancamentoUnico(h)} className="text-muted hover:text-danger transition p-1">
                                <Trash2 size={12} />
                              </button>
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  )}
                </div>
              )}
            </div>

            {!alterandoOrcamento && !baixandoOutraOs && (
            <div className="border-t border-line pt-4">
              <div className="flex items-center justify-between mb-1.5">
                <p className="field-label mb-0">Registrar novo pagamento</p>
                {podeEditarDataRecebimento && !mostrarDataRetroativa && (
                  <button
                    type="button"
                    className="text-xs text-gold hover:underline flex items-center gap-1"
                    onClick={() => {
                      setMostrarDataRetroativa(true);
                      setDataRecebimento(hojeBrasil());
                    }}
                  >
                    <CalendarClock size={12} /> Lançar com data anterior
                  </button>
                )}
              </div>
              {podeEditarDataRecebimento && mostrarDataRetroativa && (
                <div className="mb-3 flex items-end gap-2">
                  <div>
                    <label className="field-label">Data do recebimento</label>
                    <input
                      type="date"
                      className="field-input"
                      value={dataRecebimento}
                      max={hojeBrasil()}
                      onChange={(e) => setDataRecebimento(e.target.value)}
                    />
                  </div>
                  <button
                    type="button"
                    className="text-xs text-muted hover:text-danger transition flex items-center gap-1 mb-2"
                    onClick={() => {
                      setMostrarDataRetroativa(false);
                      setDataRecebimento("");
                    }}
                  >
                    <X size={12} /> usar data de hoje
                  </button>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="field-label">Valor a receber agora</label>
                  {formasPagamentoPopup.length > 0 ? (
                    <CurrencyInput valor={formasPagamentoPopup.reduce((s, f) => s + (Number(f.valor) || 0), 0)} disabled />
                  ) : (
                    <CurrencyInput valor={valorAgora} onChange={setValorAgora} />
                  )}
                </div>
                <div>
                  <label className="field-label">Forma de pagamento</label>
                  {formasPagamentoPopup.length > 0 ? (
                    <div className="field-input flex items-center justify-between bg-canvas">
                      <span className="text-sm text-ink">Múltiplas formas</span>
                      <button type="button" onClick={usarFormaUnicaPopup} className="text-xs text-muted hover:text-danger transition flex items-center gap-1">
                        <X size={12} /> usar 1 forma
                      </button>
                    </div>
                  ) : (
                    <div>
                      <select className="field-input" value={formaPagamento} onChange={(e) => setFormaPagamento(e.target.value)}>
                        <option value="">Selecione</option>
                        {FORMAS_PAGAMENTO.map((f) => (
                          <option key={f} value={f}>{f}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => setMostrarModalFormasPopup(true)}
                        className="mt-1.5 w-full flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-white
                          bg-gradient-to-b from-gold to-gold-strong shadow-sm hover:brightness-105 hover:-translate-y-px active:translate-y-0 transition-all"
                      >
                        <Ticket size={13} /> Dividir em mais de uma forma
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {formasPagamentoPopup.length === 0 && (precisaParcelasUnica || precisaBandeiraUnica) && (
                <div className="grid grid-cols-2 gap-3 mt-3">
                  {precisaParcelasUnica && (
                    <div>
                      <label className="field-label">Parcelas</label>
                      <select className="field-input" value={parcelas} onChange={(e) => setParcelas(e.target.value)}>
                        <option value="">1x</option>
                        {[2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                          <option key={n} value={n}>{n}x</option>
                        ))}
                      </select>
                    </div>
                  )}
                  {precisaBandeiraUnica && (
                    <div className={precisaParcelasUnica ? "" : "col-span-2"}>
                      <label className="field-label">Bandeira</label>
                      <div className="flex gap-2 flex-wrap">
                        {BANDEIRAS.map((b) => (
                          <button
                            type="button"
                            key={b}
                            onClick={() => setBandeira(b)}
                            className={`px-3 py-1.5 rounded-lg border text-xs transition ${
                              bandeira === b ? "border-gold bg-gold-soft/60 text-gold-strong font-medium" : "border-line bg-white text-muted hover:border-gold/50"
                            }`}
                          >
                            {b}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {formasPagamentoPopup.length > 0 && (
                <div className="mt-3">
                  <div className="card divide-y divide-line">
                    {formasPagamentoPopup.map((f) =>
                      linhaEditandoPopup === f.id ? (
                        <div key={f.id} className="p-3">
                          <div className="flex items-start gap-2">
                            <div className="w-28 shrink-0">
                              <label className="field-label">Valor</label>
                              <CurrencyInput valor={f.valor} onChange={(v) => atualizarCampoLinhaPopup(f.id, "valor", v)} />
                            </div>
                            <div className="flex-1">
                              <label className="field-label">Forma</label>
                              <select className="field-input" value={f.forma_pagamento} onChange={(e) => atualizarCampoLinhaPopup(f.id, "forma_pagamento", e.target.value)}>
                                <option value="">Selecione</option>
                                {FORMAS_PAGAMENTO.map((fp) => (
                                  <option key={fp} value={fp}>{fp}</option>
                                ))}
                              </select>
                            </div>
                          </div>
                          <div className="flex justify-end gap-2 mt-2">
                            <button type="button" className="btn text-xs" onClick={cancelarEdicaoLinhaPopup}>Cancelar</button>
                            <button type="button" className="btn-primary text-xs" onClick={() => salvarEdicaoLinhaPopup(f)}>Salvar</button>
                          </div>
                        </div>
                      ) : (
                        <div key={f.id} className="p-3 flex items-center justify-between gap-3 text-sm">
                          <div className="flex items-center gap-2">
                            <span className="font-mono-num font-medium">R$ {Number(f.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                            <span className="text-xs text-muted bg-canvas px-2 py-0.5 rounded">{f.forma_pagamento}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <button type="button" title="Alterar" onClick={() => iniciarEdicaoLinhaPopup(f)} className="text-muted hover:text-gold transition p-1">
                              <Pencil size={14} />
                            </button>
                            <button type="button" title="Excluir" onClick={() => excluirLinhaPopup(f.id)} className="text-muted hover:text-danger transition p-1">
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      )
                    )}
                  </div>
                  <button type="button" onClick={adicionarLinhaInlinePopup} className="btn text-xs flex items-center gap-1.5 mt-2">
                    <Plus size={13} /> Adicionar outra forma de pagamento
                  </button>
                </div>
              )}
            </div>
            )}

            <div className="flex justify-end gap-2">
              <button className="btn" onClick={fecharPopup}>Fechar</button>
              {!alterandoOrcamento && !baixandoOutraOs && (
                <button className="btn-primary" onClick={confirmarPagamento} disabled={salvando}>
                  {salvando ? "Salvando…" : "Registrar recebimento"}
                </button>
              )}
            </div>
          </div>
          )}
        </Modal>
      )}

      <FormasPagamentoModal
        aberto={mostrarModalFormasPopup}
        formasIniciais={[]}
        onFechar={() => setMostrarModalFormasPopup(false)}
        onSalvar={aoSalvarModalFormasPopup}
      />

      {lembretesAbertos && (
        <Modal
          titulo="Lembretes de cobrança"
          subtitulo={`${lembretes.length} OS com mais de 24h em aberto`}
          onFechar={() => setLembretesAbertos(false)}
        >
          {lembretes.length === 0 ? (
            <p className="text-sm text-muted">Nenhuma pendência com mais de 24h no momento. 🎉</p>
          ) : (
            <div className="space-y-3">
              {lembretes.map((l) => (
                <div key={`${l.unidade_id}-${l.numero_os}-${l.tipo_servico_id}-${l.linha}`} className="rounded-lg border border-line p-3 text-sm">
                  <p className="text-ink">
                    A OS <span className="font-mono-num font-medium">{l.numero_os}</span>
                    {l.tipo_servico_nome && <> ({l.tipo_servico_nome})</>}
                    {mostrarUnidade && <> — {unidadesMap[l.unidade_id]}</>} está com{" "}
                    <span className="font-mono-num font-medium text-bronze">R$ {formatarMoedaSemSimbolo(l.falta_pagar)}</span> em
                    aberto desde <span className="font-medium">{formatarDataBR(l.ultimo_lancamento)}</span>. Entre em contato com o
                    cliente para efetuar a cobrança.
                  </p>
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}

export default function ContasAReceber() {
  return (
    <AppShell>
      <ConteudoContasAReceber />
    </AppShell>
  );
}
