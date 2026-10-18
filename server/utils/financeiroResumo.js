/* Resumo do Controle financeiro para o assistente de IA.
   Espelha as contas do front-end (public/financeiro/script.js: occurrencesForMonth,
   crmRowsForMonth, parcelaDoContrato, dataVendaDoCard), pra IA responder com os
   mesmos números que a pessoa vê nas abas Painel e Lucro. */

const arred = (n) => Math.round((Number(n) || 0) * 100) / 100;

function mesesEntre(a, b) {
  const [ya, ma] = a.split('-').map(Number);
  const [yb, mb] = b.split('-').map(Number);
  return (yb * 12 + mb) - (ya * 12 + ma);
}
const anoMes = (v) => {
  if (!v) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 7);
  return String(v).slice(0, 7);
};

// Lançamentos do próprio financeiro que caem no mês (único / fixo / parcelado)
function ocorrenciasDoMes(transacoes, mes) {
  const linhas = [];
  for (const tx of transacoes || []) {
    const ancora = anoMes(tx.date);
    if (!/^\d{4}-\d{2}$/.test(ancora)) continue;
    if (tx.recurrence === 'fixo') {
      if (ancora <= mes) linhas.push({ tx, valor: Number(tx.value) || 0, parcela: 'fixo' });
    } else if (tx.recurrence === 'parcelado') {
      const idx = mesesEntre(ancora, mes);
      const total = Number(tx.parcelas) || 1;
      if (idx >= 0 && idx < total) {
        const valor = tx.parcelas1 == null ? tx.value : (idx < tx.parcelas1 ? tx.value : (tx.value2 != null ? tx.value2 : tx.value));
        linhas.push({ tx, valor: Number(valor) || 0, parcela: `${idx + 1}/${total}` });
      }
    } else if (ancora === mes) {
      linhas.push({ tx, valor: Number(tx.value) || 0, parcela: null });
    }
  }
  return linhas;
}

function parcelaDoContrato(ct, idx) {
  if (Array.isArray(ct.blocos) && ct.blocos.length) {
    let inicio = 0;
    for (const b of ct.blocos) {
      const n = Math.max(1, parseInt(b.parcelas, 10) || 1);
      if (idx < inicio + n) return Number(b.value) || 0;
      inicio += n;
    }
    return 0;
  }
  const p1 = ct.parcelas1 != null ? ct.parcelas1 : ct.parcelas;
  return idx < p1 ? (Number(ct.value) || 0) : (Number(ct.value2) || 0);
}

function dataVendaDoCard(c) {
  const mes = String(c.mes || '');
  if (/^\d{4}-\d{2}-\d{2}/.test(mes)) return mes.slice(0, 10);
  if (/^\d{4}-\d{2}/.test(mes)) return mes.slice(0, 7) + '-01';
  const ref = c.colunaDesde || c.updatedAt || c.createdAt;
  if (!ref) return '';
  return ref instanceof Date ? ref.toISOString().slice(0, 10) : String(ref).slice(0, 10);
}

// Receitas/despesas que vêm do CRM, conforme a escolha feita na aba Lucro
function linhasDoCrm({ config, colunas, cards, contratos }, mes) {
  const modo = (config && config.integracaoCrm) || 'vendas';
  if (modo === 'nenhum') return [];
  const linhas = [];
  const contratosDoMes = (tipo, categoria, escopoFixo) => {
    for (const ct of contratos || []) {
      const ancora = anoMes(ct.date);
      if (!/^\d{4}-\d{2}$/.test(ancora)) continue;
      const cancelado = anoMes(ct.canceladoNoMes);
      if (cancelado && mes >= cancelado) continue;
      const idx = mesesEntre(ancora, mes);
      if (idx < 0 || idx >= (Number(ct.parcelas) || 1)) continue;
      const valor = parcelaDoContrato(ct, idx);
      if (valor <= 0) continue;
      linhas.push({ tx: { type: tipo, category: categoria, scope: escopoFixo || (ct.scope === 'Empresa' ? 'Empresa' : 'Pessoal'), desc: ct.desc || 'Contrato', origem: 'crm' }, valor });
    }
  };
  if (modo === 'vendas') {
    const ganho = new Set((colunas || []).filter((c) => c.tipo === 'ganho').map((c) => String(c._id || c.id)));
    for (const c of cards || []) {
      if (!ganho.has(String(c.columnId))) continue;
      if (anoMes(dataVendaDoCard(c)) !== mes) continue;
      const valor = Number(c.valor) || 0;
      if (valor <= 0) continue;
      linhas.push({ tx: { type: 'Receita', category: 'Vendas', scope: 'Empresa', desc: `Venda — ${c.cliente || 'Cliente'}`, origem: 'crm' }, valor });
    }
    if (config && config.descontarComissoes) contratosDoMes('Despesa', 'Comissões', 'Empresa');
  } else if (modo === 'comissoes') {
    contratosDoMes('Receita', 'Comissão');
  }
  return linhas;
}

function somar(linhas) {
  const receitas = linhas.filter((l) => l.tx.type === 'Receita').reduce((a, l) => a + l.valor, 0);
  const despesas = linhas.filter((l) => l.tx.type === 'Despesa').reduce((a, l) => a + l.valor, 0);
  return { receitas: arred(receitas), despesas: arred(despesas), saldo: arred(receitas - despesas) };
}

// Resumo de um mês: totais por escopo, maiores despesas por categoria e quanto veio do CRM
function resumoDoMes(dados, crm, mes) {
  const linhas = [...ocorrenciasDoMes(dados.transacoes, mes), ...linhasDoCrm({ ...crm, config: dados.config }, mes)];
  const porCategoria = {};
  for (const l of linhas) {
    if (l.tx.type !== 'Despesa') continue;
    const cat = l.tx.category || 'Outros';
    porCategoria[cat] = (porCategoria[cat] || 0) + l.valor;
  }
  const maioresDespesas = Object.entries(porCategoria)
    .sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([categoria, valor]) => ({ categoria, valor: arred(valor) }));
  const pendentes = linhas.filter((l) => l.tx.status && l.tx.status !== 'Pago' && !l.tx.origem);
  return {
    mes,
    total: somar(linhas),
    pessoal: somar(linhas.filter((l) => l.tx.scope !== 'Empresa')),
    empresa: somar(linhas.filter((l) => l.tx.scope === 'Empresa')),
    receitasDoCrm: arred(linhas.filter((l) => l.tx.origem === 'crm' && l.tx.type === 'Receita').reduce((a, l) => a + l.valor, 0)),
    integracaoCrm: (dados.config && dados.config.integracaoCrm) || 'vendas',
    maioresDespesas,
    lancamentosPendentes: pendentes.length,
    valorPendente: arred(pendentes.reduce((a, l) => a + l.valor, 0)),
  };
}

// Lista de lançamentos do mês (no máximo 25), com filtro opcional
function lancamentosDoMes(dados, crm, mes, { tipo, categoria } = {}) {
  let linhas = [...ocorrenciasDoMes(dados.transacoes, mes), ...linhasDoCrm({ ...crm, config: dados.config }, mes)];
  if (tipo) linhas = linhas.filter((l) => l.tx.type === tipo);
  if (categoria) linhas = linhas.filter((l) => String(l.tx.category || '').toLowerCase().includes(String(categoria).toLowerCase()));
  linhas.sort((a, b) => b.valor - a.valor);
  return {
    mes,
    quantidade: linhas.length,
    lancamentos: linhas.slice(0, 25).map((l) => ({
      descricao: l.tx.desc || '', tipo: l.tx.type, categoria: l.tx.category || '', escopo: l.tx.scope || 'Pessoal',
      valor: arred(l.valor), status: l.tx.origem ? 'do CRM' : (l.tx.status || 'Pago'), parcela: l.parcela || null,
    })),
  };
}

function cartoesObjetivosInvestimentos(dados) {
  return {
    cartoes: (dados.cartoes || []).map((c) => ({ nome: c.name, limite: arred(c.limit), vencimento: c.dueDay, melhorDiaDeCompra: c.bestDay })),
    objetivos: (dados.objetivos || []).map((g) => ({
      nome: g.name, escopo: g.scope, meta: arred(g.target), atual: arred(g.current), prazo: g.deadline || null,
      progresso: g.target ? `${Math.round((Number(g.current) || 0) / Number(g.target) * 100)}%` : null,
    })),
    investimentos: (dados.investimentos || []).map((i) => ({ nome: i.name, tipo: i.type, instituicao: i.institution, aplicado: arred(i.applied), atual: arred(i.current) })),
    totalInvestidoAtual: arred((dados.investimentos || []).reduce((a, i) => a + (Number(i.current) || 0), 0)),
  };
}

module.exports = { ocorrenciasDoMes, linhasDoCrm, resumoDoMes, lancamentosDoMes, cartoesObjetivosInvestimentos };
