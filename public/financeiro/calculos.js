/* =======================================================================
   Controle financeiro — cálculos (sem tela).
   Usado pelo site (public/financeiro) e pelo servidor (assistente de IA e
   lembretes), pra os dois chegarem sempre nos mesmos números.

   Lançamento (tx): { id, date "AAAA-MM-DD", desc, type "Receita"|"Despesa",
     category, scope "Pessoal"|"Empresa", account (forma de pagamento), status,
     value, recurrence "unico"|"fixo"|"parcelado", parcelas,
     cardId?   cartão (quando a forma é Cartão de Crédito)
     contaId?  conta onde o dinheiro entra/sai (banco, carteira...)
     fimEm?    "AAAA-MM" último mês de um fixo
     excecoes? { "AAAA-MM": { status?, value?, removido? } }  ajustes de um mês só
   }
   ======================================================================= */
(function (raiz) {
  const CARTAO = 'Cartão de Crédito';

  /* ---------- datas ---------- */
  const anoMes = (v) => {
    if (!v) return '';
    if (v instanceof Date) return v.toISOString().slice(0, 7);
    return String(v).slice(0, 7);
  };
  const ehAnoMes = (v) => /^\d{4}-\d{2}$/.test(v || '');
  function somarMeses(ym, n) {
    const [y, m] = ym.split('-').map(Number);
    const total = y * 12 + (m - 1) + n;
    return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
  }
  function mesesEntre(a, b) {
    const [ya, ma] = a.split('-').map(Number);
    const [yb, mb] = b.split('-').map(Number);
    return (yb * 12 + mb) - (ya * 12 + ma);
  }
  const diasNoMes = (ym) => { const [y, m] = ym.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); };
  // dia "d" no mês ym, sem passar do último dia (31 em fevereiro vira 28/29)
  const diaNoMes = (ym, d) => `${ym}-${String(Math.min(Math.max(1, d || 1), diasNoMes(ym))).padStart(2, '0')}`;
  const diaDe = (iso) => parseInt(String(iso || '').slice(8, 10), 10) || 1;
  function hojeISO(agora) {
    const d = agora || new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  const arred = (n) => Math.round((Number(n) || 0) * 100) / 100;

  /* ---------- ocorrências de um lançamento ---------- */
  function valorDaParcela(tx, idx) {
    if (tx.parcelas1 == null) return Number(tx.value) || 0;
    return Number(idx < tx.parcelas1 ? tx.value : (tx.value2 != null ? tx.value2 : tx.value)) || 0;
  }
  // Status do lançamento num mês: o ajuste do mês, ou o status "padrão" do lançamento
  function statusNoMes(tx, mes) {
    const exc = tx.excecoes && tx.excecoes[mes];
    return (exc && exc.status) || tx.status || 'Pago';
  }
  // A ocorrência de um lançamento num mês (ou null se não cai nesse mês)
  function ocorrenciaNoMes(tx, mes) {
    const ancora = anoMes(tx.date);
    if (!ehAnoMes(ancora)) return null;
    const exc = (tx.excecoes && tx.excecoes[mes]) || null;
    if (exc && exc.removido) return null;
    let valor;
    let parcela = null;
    if (tx.recurrence === 'fixo') {
      if (mes < ancora) return null;
      if (ehAnoMes(tx.fimEm) && mes > tx.fimEm) return null;
      valor = Number(tx.value) || 0;
      parcela = 'Fixo';
    } else if (tx.recurrence === 'parcelado') {
      const idx = mesesEntre(ancora, mes);
      const total = Number(tx.parcelas) || 1;
      if (idx < 0 || idx >= total) return null;
      valor = valorDaParcela(tx, idx);
      parcela = `${idx + 1}/${total}`;
    } else {
      if (mes !== ancora) return null;
      valor = Number(tx.value) || 0;
    }
    if (exc && exc.value != null && exc.value !== '') valor = Number(exc.value) || 0;
    return {
      tx, mes, valor, parcela,
      data: tx.recurrence === 'unico' || !tx.recurrence ? String(tx.date).slice(0, 10) : diaNoMes(mes, diaDe(tx.date)),
      status: statusNoMes(tx, mes),
      ajustada: !!(exc && (exc.value != null || exc.status)),
    };
  }
  function ocorrenciasDoMes(txs, mes) {
    const out = [];
    for (const tx of txs || []) { const o = ocorrenciaNoMes(tx, mes); if (o) out.push(o); }
    return out;
  }
  // Primeiro mês com algum lançamento (pra saber de onde começar a contar)
  function primeiroMes(txs) {
    let menor = null;
    for (const tx of txs || []) { const a = anoMes(tx.date); if (ehAnoMes(a) && (!menor || a < menor)) menor = a; }
    return menor;
  }

  /* ---------- cartões de crédito ---------- */
  // Dia de fechamento: o informado, ou o dia antes do "melhor dia de compra" (cadastros antigos)
  function diaFechamento(cartao) {
    if (cartao.closingDay) return Math.min(31, Math.max(1, parseInt(cartao.closingDay, 10)));
    const melhor = parseInt(cartao.bestDay, 10);
    if (melhor > 1) return melhor - 1;
    return 31; // melhor dia = 1 → fecha no último dia do mês
  }
  // Em qual fatura cai uma compra: devolve o mês de VENCIMENTO ("AAAA-MM")
  function faturaDaCompra(cartao, dataISO) {
    const mes = anoMes(dataISO);
    const fecha = diaFechamento(cartao);
    const fechaEsteMes = Math.min(fecha, diasNoMes(mes));
    const mesFechamento = diaDe(dataISO) <= fechaEsteMes ? mes : somarMeses(mes, 1);
    const vence = parseInt(cartao.dueDay, 10) || fecha;
    return vence > fecha ? mesFechamento : somarMeses(mesFechamento, 1);
  }
  function datasDaFatura(cartao, mesVencimento) {
    const fecha = diaFechamento(cartao);
    const vence = parseInt(cartao.dueDay, 10) || fecha;
    const mesFechamento = vence > fecha ? mesVencimento : somarMeses(mesVencimento, -1);
    return { fechamento: diaNoMes(mesFechamento, fecha), vencimento: diaNoMes(mesVencimento, vence) };
  }
  // A qual cartão pertence um lançamento no cartão (se só existe um cartão, é ele)
  function cartaoDoLancamento(tx, cartoes) {
    if (tx.account !== CARTAO) return null;
    if (tx.cardId) return (cartoes || []).find((c) => c.id === tx.cardId) || null;
    return cartoes && cartoes.length === 1 ? cartoes[0] : null;
  }
  // Todas as compras de um cartão agrupadas por fatura (mês de vencimento)
  function faturasDoCartao(cartao, txs, cartoes, { ateMes } = {}) {
    const inicio = primeiroMes(txs);
    const faturas = {};
    if (!inicio) return faturas;
    const fim = ateMes || somarMeses(hojeISO().slice(0, 7), 24);
    const doCartao = (txs || []).filter((tx) => tx.type === 'Despesa' && cartaoDoLancamento(tx, cartoes) === cartao);
    for (let m = inicio; m <= fim; m = somarMeses(m, 1)) {
      for (const tx of doCartao) {
        const o = ocorrenciaNoMes(tx, m);
        if (!o || o.valor <= 0) continue;
        const venc = faturaDaCompra(cartao, o.data);
        if (!faturas[venc]) faturas[venc] = { mes: venc, itens: [], total: 0 };
        faturas[venc].itens.push(o);
        faturas[venc].total = arred(faturas[venc].total + o.valor);
      }
    }
    return faturas;
  }
  function situacaoDaFatura(cartao, mesVencimento, hoje) {
    const pago = cartao.faturasPagas && cartao.faturasPagas[mesVencimento];
    if (pago) return 'paga';
    const { fechamento, vencimento } = datasDaFatura(cartao, mesVencimento);
    const h = hoje || hojeISO();
    if (h <= fechamento) return 'aberta';
    if (h <= vencimento) return 'fechada';
    return 'vencida';
  }
  // Limite usado: tudo que ainda não foi pago, incluindo parcelas futuras já compradas
  // (assinaturas fixas só contam até hoje — as futuras ainda não foram cobradas)
  function limiteUsado(cartao, txs, cartoes, hoje) {
    const h = hoje || hojeISO();
    const faturas = faturasDoCartao(cartao, txs, cartoes);
    let usado = 0;
    for (const f of Object.values(faturas)) {
      if (cartao.faturasPagas && cartao.faturasPagas[f.mes]) continue;
      for (const o of f.itens) if (o.tx.recurrence !== 'fixo' || o.data <= h) usado += o.valor;
    }
    return arred(usado);
  }

  /* ---------- contas (banco, carteira...) e saldo ---------- */
  // Saldo de uma conta numa data: saldo inicial + o que entrou − o que saiu (só o que está
  // "Pago"), transferências e faturas de cartão pagas com essa conta.
  function saldoDaConta(conta, dados, ateISO) {
    const ate = ateISO || hojeISO();
    const desde = conta.dataSaldo || '0000-00-00';
    let saldo = Number(conta.saldoInicial) || 0;
    const txs = (dados.transacoes || []).filter((tx) => tx.contaId === conta.id && tx.account !== CARTAO);
    const inicio = primeiroMes(txs);
    if (inicio) {
      for (let m = inicio < anoMes(desde) ? anoMes(desde) : inicio; m <= anoMes(ate); m = somarMeses(m, 1)) {
        for (const tx of txs) {
          const o = ocorrenciaNoMes(tx, m);
          if (!o || o.status !== 'Pago' || o.data <= desde || o.data > ate) continue;
          saldo += tx.type === 'Receita' ? o.valor : -o.valor;
        }
      }
    }
    for (const t of dados.transferencias || []) {
      if (!t.data || t.data <= desde || t.data > ate) continue;
      if (t.deContaId === conta.id) saldo -= Number(t.valor) || 0;
      if (t.paraContaId === conta.id) saldo += Number(t.valor) || 0;
    }
    for (const c of dados.cartoes || []) {
      for (const p of Object.values(c.faturasPagas || {})) {
        if (p.contaId === conta.id && p.data && p.data > desde && p.data <= ate) saldo -= Number(p.valor) || 0;
      }
    }
    return arred(saldo);
  }

  /* ---------- contas a pagar e a receber ---------- */
  // O que ainda não foi pago: atrasados + o que vence nos próximos "dias" dias.
  // Inclui as faturas de cartão em aberto.
  function aPagarEReceber(dados, { hoje, dias = 30, mesesAtras = 12 } = {}) {
    const h = hoje || hojeISO();
    const limite = (() => { const d = new Date(h + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + dias); return d.toISOString().slice(0, 10); })();
    const itens = [];
    const mesHoje = h.slice(0, 7);
    for (let m = somarMeses(mesHoje, -mesesAtras); m <= anoMes(limite); m = somarMeses(m, 1)) {
      for (const o of ocorrenciasDoMes(dados.transacoes, m)) {
        if (o.tx.account === CARTAO || o.status === 'Pago' || o.valor <= 0) continue;
        if (o.data > limite) continue;
        itens.push({ tipo: o.tx.type === 'Receita' ? 'receber' : 'pagar', origem: 'lancamento', ocorrencia: o, data: o.data, valor: o.valor, descricao: o.tx.desc || '', atrasado: o.data < h });
      }
    }
    for (const c of dados.cartoes || []) {
      const faturas = faturasDoCartao(c, dados.transacoes, dados.cartoes, { ateMes: anoMes(limite) });
      for (const f of Object.values(faturas)) {
        if (f.total <= 0 || (c.faturasPagas && c.faturasPagas[f.mes])) continue;
        const { vencimento } = datasDaFatura(c, f.mes);
        if (vencimento > limite || f.mes < somarMeses(mesHoje, -mesesAtras)) continue;
        itens.push({ tipo: 'pagar', origem: 'fatura', cartao: c, mes: f.mes, data: vencimento, valor: f.total, descricao: `Fatura ${c.name || 'do cartão'}`, atrasado: vencimento < h });
      }
    }
    itens.sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0));
    return itens;
  }

  /* ---------- dívidas: plano de quitação ---------- */
  // dividas: [{ id, name, saldo, juros (% ao mês), parcela (pagamento mínimo) }]
  // estrategia: 'avalanche' (maior juros primeiro) ou 'bola-de-neve' (menor saldo primeiro)
  function planoDeQuitacao(dividas, pagamentoMensal, estrategia = 'avalanche', inicioMes) {
    const ativas = (dividas || []).filter((d) => (Number(d.saldo) || 0) > 0.005)
      .map((d) => ({ id: d.id, name: d.name, saldo: Number(d.saldo) || 0, juros: (Number(d.juros) || 0) / 100, parcela: Number(d.parcela) || 0, quitadaNoMes: null }));
    const inicio = inicioMes || hojeISO().slice(0, 7);
    const minimos = ativas.reduce((a, d) => a + d.parcela, 0);
    const orcamento = Math.max(Number(pagamentoMensal) || 0, minimos);
    if (!ativas.length) return { viavel: true, meses: 0, livreEm: null, jurosTotal: 0, ordem: [], orcamento: 0, minimos: 0 };
    const ordenar = (lista) => lista.slice().sort((a, b) => (estrategia === 'bola-de-neve' ? a.saldo - b.saldo : b.juros - a.juros || a.saldo - b.saldo));
    let jurosTotal = 0;
    let mes = 0;
    const ordem = [];
    while (ativas.some((d) => d.saldo > 0.005) && mes < 600) {
      mes++;
      const rotulo = somarMeses(inicio, mes - 1);
      const abertas = ativas.filter((d) => d.saldo > 0.005);
      for (const d of abertas) { const j = d.saldo * d.juros; d.saldo += j; jurosTotal += j; }
      let sobra = orcamento;
      for (const d of abertas) { const p = Math.min(d.parcela, d.saldo); d.saldo -= p; sobra -= p; }
      for (const d of ordenar(abertas.filter((x) => x.saldo > 0.005))) {
        if (sobra <= 0.005) break;
        const p = Math.min(sobra, d.saldo); d.saldo -= p; sobra -= p;
      }
      for (const d of abertas) if (d.saldo <= 0.005 && !d.quitadaNoMes) { d.saldo = 0; d.quitadaNoMes = rotulo; ordem.push({ id: d.id, name: d.name, mes: rotulo, mesesAte: mes }); }
      // se o pagamento não cobre nem os juros, nunca quita
      if (mes === 1 && abertas.every((d) => d.saldo >= (Number((dividas.find((x) => x.id === d.id) || {}).saldo) || 0) - 0.005)) {
        return { viavel: false, meses: null, livreEm: null, jurosTotal: null, ordem: [], orcamento, minimos };
      }
    }
    const viavel = !ativas.some((d) => d.saldo > 0.005);
    return { viavel, meses: viavel ? mes : null, livreEm: viavel ? somarMeses(inicio, mes - 1) : null, jurosTotal: arred(jurosTotal), ordem, orcamento: arred(orcamento), minimos: arred(minimos) };
  }

  const api = {
    CARTAO, anoMes, ehAnoMes, somarMeses, mesesEntre, diasNoMes, diaNoMes, hojeISO, arred,
    valorDaParcela, statusNoMes, ocorrenciaNoMes, ocorrenciasDoMes, primeiroMes,
    diaFechamento, faturaDaCompra, datasDaFatura, cartaoDoLancamento, faturasDoCartao, situacaoDaFatura, limiteUsado,
    saldoDaConta, aPagarEReceber, planoDeQuitacao,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else raiz.Calculos = api;
})(typeof window !== 'undefined' ? window : this);
