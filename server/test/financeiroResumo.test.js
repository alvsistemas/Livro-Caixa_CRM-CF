const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { ocorrenciasDoMes, linhasDoCrm, resumoDoMes, lancamentosDoMes, cartoesObjetivosInvestimentos } = require('../utils/financeiroResumo');

const transacoes = [
  { desc: 'Salário', type: 'Receita', category: 'Salário', scope: 'Pessoal', value: 5000, date: '2026-10-05', recurrence: 'unico', status: 'Pago' },
  { desc: 'Aluguel', type: 'Despesa', category: 'Moradia', scope: 'Pessoal', value: 1500, date: '2026-01-10', recurrence: 'fixo', status: 'Pago' },
  { desc: 'Notebook', type: 'Despesa', category: 'Ferramentas/Software', scope: 'Empresa', value: 400, date: '2026-09-15', recurrence: 'parcelado', parcelas: 3, status: 'Previsto' },
  { desc: 'Mercado', type: 'Despesa', category: 'Alimentação', scope: 'Pessoal', value: 820.45, date: '2026-10-20', recurrence: 'unico', status: 'Pago' },
  { desc: 'Antigo', type: 'Despesa', category: 'Lazer', scope: 'Pessoal', value: 99, date: '2026-08-01', recurrence: 'unico', status: 'Pago' },
];

describe('resumo financeiro para a IA', () => {
  test('único, fixo e parcelado caem nos meses certos', () => {
    const out = ocorrenciasDoMes(transacoes, '2026-10');
    assert.deepEqual(out.map((l) => l.tx.desc).sort(), ['Aluguel', 'Mercado', 'Notebook', 'Salário']);
    assert.equal(out.find((l) => l.tx.desc === 'Notebook').parcela, '2/3');
    assert.equal(ocorrenciasDoMes(transacoes, '2026-12').some((l) => l.tx.desc === 'Notebook'), false); // 3 parcelas: set, out, nov
    assert.equal(ocorrenciasDoMes(transacoes, '2025-12').length, 0);
  });

  test('totais por escopo, maiores despesas e pendentes, com centavos', () => {
    const r = resumoDoMes({ transacoes, config: { integracaoCrm: 'nenhum' } }, {}, '2026-10');
    assert.deepEqual(r.total, { receitas: 5000, despesas: 2720.45, saldo: 2279.55 });
    assert.deepEqual(r.empresa, { receitas: 0, despesas: 400, saldo: -400 });
    assert.equal(r.maioresDespesas[0].categoria, 'Moradia');
    assert.equal(r.lancamentosPendentes, 1);
    assert.equal(r.valorPendente, 400);
  });

  test('vendas do CRM entram como receita da Empresa no mês da venda', () => {
    const crm = {
      colunas: [{ _id: 'g1', tipo: 'ganho' }],
      cards: [
        { columnId: 'g1', cliente: 'Ana', valor: 3000, mes: '2026-10' },
        { columnId: 'g1', cliente: 'Bia', valor: 1000, mes: '2026-09' },
        { columnId: 'g1', cliente: 'Caio', valor: 700, colunaDesde: new Date('2026-10-12T15:00:00Z') },
      ],
      contratos: [],
    };
    const r = resumoDoMes({ transacoes: [], config: { integracaoCrm: 'vendas' } }, crm, '2026-10');
    assert.equal(r.receitasDoCrm, 3700);
    assert.deepEqual(r.empresa, { receitas: 3700, despesas: 0, saldo: 3700 });
  });

  test('comissões do CRM: parcelas por blocos e cancelamento', () => {
    const contratos = [
      { desc: 'Contrato A', scope: 'Pessoal', date: new Date('2026-09-01T00:00:00Z'), parcelas: 3, parcelas1: 3, value: 100, value2: 100 },
      { desc: 'Contrato B', scope: 'Pessoal', date: '2026-10-01', parcelas: 4, blocos: [{ parcelas: 1, value: 500 }, { parcelas: 3, value: 50 }] },
      { desc: 'Cancelado', scope: 'Pessoal', date: '2026-08-01', parcelas: 6, parcelas1: 6, value: 80, value2: 80, canceladoNoMes: '2026-10' },
    ];
    const linhas = linhasDoCrm({ config: { integracaoCrm: 'comissoes' }, contratos }, '2026-10');
    assert.deepEqual(linhas.map((l) => [l.tx.desc, l.valor]), [['Comissão — Contrato A', 100], ['Comissão — Contrato B', 500]]);
    assert.deepEqual(linhasDoCrm({ config: { integracaoCrm: 'comissoes' }, contratos }, '2026-11').map((l) => l.valor), [100, 50]);
    assert.equal(linhasDoCrm({ config: { integracaoCrm: 'nenhum' }, contratos }, '2026-10').length, 0);
  });

  test('vendas do CRM: mesma regra do site (sem dobrar quem tem fechamento, sem arquivados)', () => {
    const crm = {
      config: { integracaoCrm: 'vendas' },
      colunas: [{ _id: 'g1', tipo: 'ganho' }, { _id: 'a1', tipo: 'aberto' }],
      cards: [
        { _id: 'c1', cliente: 'Sem fechamento', columnId: 'g1', valor: 1000, mes: '2026-10-05' },
        { _id: 'c2', cliente: 'Com fechamento', columnId: 'g1', valor: 2000, mes: '2026-10-06', fechamento: { valorFinal: 1900 } },
        { _id: 'c3', cliente: 'Fechamento desfeito', columnId: 'g1', valor: 300, mes: '2026-10-07', fechamento: { valorFinal: 300, cancelado: { em: '2026-10-08' } } },
        { _id: 'c4', cliente: 'Arquivado', columnId: 'g1', valor: 700, mes: '2026-10-08', arquivado: true },
        { _id: 'c5', cliente: 'Em aberto', columnId: 'a1', valor: 900, mes: '2026-10-08' },
      ],
    };
    assert.deepEqual(linhasDoCrm(crm, '2026-10').map((l) => [l.tx.desc, l.valor]), [['Venda — Sem fechamento', 1000], ['Venda — Fechamento desfeito', 300]]);
  });

  test('lista de lançamentos filtra por tipo e categoria', () => {
    const r = lancamentosDoMes({ transacoes, config: { integracaoCrm: 'nenhum' } }, {}, '2026-10', { tipo: 'Despesa', categoria: 'alimen' });
    assert.equal(r.quantidade, 1);
    assert.equal(r.lancamentos[0].descricao, 'Mercado');
    assert.equal(r.lancamentos[0].valor, 820.45);
  });

  test('cartões, objetivos e investimentos', () => {
    const r = cartoesObjetivosInvestimentos({
      cartoes: [{ name: 'Nubank', limit: 3000, dueDay: 10, bestDay: 3 }],
      objetivos: [{ name: 'Reserva', scope: 'Pessoal', target: 10000, current: 2500, deadline: '2027-06-01' }],
      investimentos: [{ name: 'CDB', type: 'Renda Fixa', applied: 1000, current: 1080.5 }, { name: 'Ações', applied: 500, current: 450 }],
    });
    assert.equal(r.objetivos[0].progresso, '25%');
    assert.equal(r.totalInvestidoAtual, 1530.5);
    assert.equal(r.cartoes[0].vencimento, 10);
  });
});

describe('lembrete diário de contas', () => {
  const { montarLembrete } = require('../utils/lembreteFinanceiro');
  test('resume o que vence hoje, amanhã e o que está atrasado', () => {
    const dados = { transacoes: [
      { desc: 'Luz', date: '2026-10-18', type: 'Despesa', value: 120, recurrence: 'unico', status: 'Pendente', account: 'Boleto' },
      { desc: 'Internet', date: '2026-10-19', type: 'Despesa', value: 99.9, recurrence: 'unico', status: 'Pendente', account: 'Boleto' },
      { desc: 'Água', date: '2026-10-10', type: 'Despesa', value: 80, recurrence: 'unico', status: 'Pendente', account: 'Boleto' },
      { desc: 'Paga', date: '2026-10-18', type: 'Despesa', value: 10, recurrence: 'unico', status: 'Pago', account: 'Pix' },
    ], cartoes: [] };
    const l = montarLembrete(dados, '2026-10-18');
    assert.equal(l.titulo, '1 conta vence hoje');
    assert.match(l.corpo, /Hoje: Luz/);
    assert.match(l.corpo, /Amanhã: Internet/);
    assert.match(l.corpo, /1 em atraso/);
    assert.equal(montarLembrete({ transacoes: [], cartoes: [] }, '2026-10-18'), null);
  });
});
