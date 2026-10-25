/* Resumo do Controle financeiro para o assistente de IA (e o Painel do dono).
   Espelha as contas do front-end (public/financeiro/script.js: occurrencesForMonth,
   crmRowsForMonth, parcelaDoContrato, dataVendaDoCard), pra IA responder com os
   mesmos números que a pessoa vê nas abas Painel e Lucro. */

const arred = (n) => Math.round((Number(n) || 0) * 100) / 100;

const Calc = require('../../public/financeiro/calculos');

// Lançamentos do próprio financeiro que caem no mês (único / fixo / parcelado, com os
// ajustes de um mês só e a data de fim) — mesma regra do site
function ocorrenciasDoMes(transacoes, mes) {
  return Calc.ocorrenciasDoMes(transacoes, mes).map((o) => ({ tx: { ...o.tx, status: o.status }, valor: o.valor, parcela: o.parcela, data: o.data }));
}

// Receitas/despesas que vêm do CRM: a MESMA regra do site (public/financeiro/calculos.js),
// para a IA, o Painel do dono e o e-mail nunca mostrarem um número diferente do financeiro
function linhasDoCrm(crm, mes) {
  return Calc.linhasDoCrm(crm, mes).map((l) => ({ tx: l.tx, valor: l.value, parcela: l.badge }));
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

// O que o financeiro precisa do CRM, lido no servidor para a conta inteira (sem o filtro "só os meus
// contatos" de vendedor). Cards arquivados vêm marcados: não viram venda, mas o "Lucro por venda" de
// um card com fechamento continua aparecendo.
async function dadosDoCrm(userId) {
  const Column = require('../models/Column');
  const Card = require('../models/Card');
  const Contrato = require('../models/Contrato');
  const [colunas, cards, contratos] = await Promise.all([Column.find({ userId }), Card.find({ userId }), Contrato.find({ userId })]);
  return {
    colunas: colunas.map((c) => ({ id: String(c._id), nome: c.nome, tipo: c.tipo })),
    cards: cards.map((c) => ({
      id: String(c._id), cliente: c.cliente, valor: Number(c.valor) || 0, columnId: String(c.columnId), mes: c.mes || '',
      colunaDesde: c.colunaDesde || null, updatedAt: c.updatedAt || null, createdAt: c.createdAt || null,
      fechamento: c.fechamento || null, fechamentoPendente: !!c.fechamentoPendente, arquivado: !!c.arquivado,
    })),
    contratos: contratos.map((c) => c.toJSON()),
  };
}

module.exports = { dadosDoCrm, ocorrenciasDoMes, linhasDoCrm, resumoDoMes, lancamentosDoMes, cartoesObjetivosInvestimentos };
