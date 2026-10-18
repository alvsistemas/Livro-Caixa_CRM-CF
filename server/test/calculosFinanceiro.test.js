const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../../public/financeiro/calculos');

describe('cálculos do Controle financeiro', () => {
  test('fixo com data de fim e exceções de um mês só', () => {
    const tx = { id: 'a', date: '2026-01-31', type: 'Despesa', value: 100, recurrence: 'fixo', status: 'Pendente', fimEm: '2026-06',
      excecoes: { '2026-03': { value: 150, status: 'Pago' }, '2026-04': { removido: true } } };
    assert.equal(C.ocorrenciaNoMes(tx, '2025-12'), null);
    assert.equal(C.ocorrenciaNoMes(tx, '2026-02').data, '2026-02-28'); // dia 31 vira o último dia de fevereiro
    assert.equal(C.ocorrenciaNoMes(tx, '2026-02').status, 'Pendente');
    const mar = C.ocorrenciaNoMes(tx, '2026-03');
    assert.equal(mar.valor, 150); assert.equal(mar.status, 'Pago'); assert.equal(mar.ajustada, true);
    assert.equal(C.ocorrenciaNoMes(tx, '2026-04'), null);
    assert.ok(C.ocorrenciaNoMes(tx, '2026-06'));
    assert.equal(C.ocorrenciaNoMes(tx, '2026-07'), null);
  });

  test('parcelado e lançamento único', () => {
    const p = { date: '2026-10-10', value: 50, recurrence: 'parcelado', parcelas: 3 };
    assert.equal(C.ocorrenciaNoMes(p, '2026-12').parcela, '3/3');
    assert.equal(C.ocorrenciaNoMes(p, '2027-01'), null);
    const u = { date: '2026-10-10', value: 9.9, recurrence: 'unico' };
    assert.equal(C.ocorrenciaNoMes(u, '2026-10').data, '2026-10-10');
    assert.equal(C.ocorrenciaNoMes(u, '2026-11'), null);
  });

  test('fatura do cartão: compra antes e depois do fechamento', () => {
    const cartao = { id: 'c1', name: 'Nubank', closingDay: 3, dueDay: 10, limit: 5000 };
    assert.equal(C.faturaDaCompra(cartao, '2026-10-02'), '2026-10'); // fecha dia 3, vence dia 10 do mesmo mês
    assert.equal(C.faturaDaCompra(cartao, '2026-10-03'), '2026-10');
    assert.equal(C.faturaDaCompra(cartao, '2026-10-04'), '2026-11');
    const virada = { closingDay: 28, dueDay: 5 }; // vence no mês seguinte ao fechamento
    assert.equal(C.faturaDaCompra(virada, '2026-10-20'), '2026-11');
    assert.equal(C.faturaDaCompra(virada, '2026-10-29'), '2026-12');
    assert.equal(C.faturaDaCompra({ bestDay: 1, dueDay: 8 }, '2026-02-28'), '2026-03'); // cadastro antigo: melhor dia 1 → fecha no último dia
    assert.deepEqual(C.datasDaFatura(virada, '2026-11'), { fechamento: '2026-10-28', vencimento: '2026-11-05' });
  });

  test('faturas e limite usado, separados por cartão', () => {
    const c1 = { id: 'c1', name: 'A', closingDay: 3, dueDay: 10, limit: 3000 };
    const c2 = { id: 'c2', name: 'B', closingDay: 20, dueDay: 28, limit: 1000, faturasPagas: { '2026-10': { contaId: 'k1', data: '2026-10-27', valor: 200 } } };
    const txs = [
      { id: 't1', date: '2026-10-05', type: 'Despesa', account: 'Cartão de Crédito', cardId: 'c1', value: 300, recurrence: 'parcelado', parcelas: 3 },
      { id: 't2', date: '2026-10-01', type: 'Despesa', account: 'Cartão de Crédito', cardId: 'c2', value: 200, recurrence: 'unico' },
      { id: 't3', date: '2026-10-25', type: 'Despesa', account: 'Cartão de Crédito', cardId: 'c2', value: 80, recurrence: 'unico' },
      { id: 't4', date: '2026-10-25', type: 'Despesa', account: 'Pix', value: 999, recurrence: 'unico' },
    ];
    const f1 = C.faturasDoCartao(c1, txs, [c1, c2], { ateMes: '2027-03' });
    assert.deepEqual(Object.keys(f1).sort(), ['2026-11', '2026-12', '2027-01']);
    assert.equal(f1['2026-11'].total, 300);
    assert.equal(C.limiteUsado(c1, txs, [c1, c2], '2026-10-18'), 900); // as 3 parcelas já ocupam o limite
    const f2 = C.faturasDoCartao(c2, txs, [c1, c2], { ateMes: '2027-03' });
    assert.equal(f2['2026-10'].total, 200);
    assert.equal(f2['2026-11'].total, 80);
    assert.equal(C.limiteUsado(c2, txs, [c1, c2], '2026-10-26'), 80); // a fatura de outubro foi paga
    assert.equal(C.situacaoDaFatura(c2, '2026-10', '2026-10-26'), 'paga');
    assert.equal(C.situacaoDaFatura(c1, '2026-11', '2026-11-02'), 'aberta');
    assert.equal(C.situacaoDaFatura(c1, '2026-11', '2026-11-05'), 'fechada');
    assert.equal(C.situacaoDaFatura(c1, '2026-11', '2026-11-11'), 'vencida');
    // sem cardId: se só existe um cartão, é dele
    assert.equal(C.cartaoDoLancamento({ account: 'Cartão de Crédito' }, [c1]), c1);
    assert.equal(C.cartaoDoLancamento({ account: 'Cartão de Crédito' }, [c1, c2]), null);
  });

  test('saldo da conta: só o que está pago, transferências e faturas pagas', () => {
    const dados = {
      transacoes: [
        { id: 's', date: '2026-10-05', type: 'Receita', value: 5000, recurrence: 'unico', status: 'Pago', contaId: 'k1', account: 'Pix' },
        { id: 'al', date: '2026-09-10', type: 'Despesa', value: 1500, recurrence: 'fixo', status: 'Pendente', contaId: 'k1', account: 'Boleto', excecoes: { '2026-09': { status: 'Pago' } } },
        { id: 'pend', date: '2026-10-12', type: 'Despesa', value: 300, recurrence: 'unico', status: 'Pendente', contaId: 'k1', account: 'Pix' },
        { id: 'antes', date: '2026-08-01', type: 'Despesa', value: 70, recurrence: 'unico', status: 'Pago', contaId: 'k1', account: 'Pix' },
      ],
      transferencias: [{ id: 'tr', data: '2026-10-06', deContaId: 'k1', paraContaId: 'k2', valor: 1000 }],
      cartoes: [{ id: 'c', faturasPagas: { '2026-10': { contaId: 'k1', data: '2026-10-10', valor: 250 } } }],
    };
    const k1 = { id: 'k1', saldoInicial: 100, dataSaldo: '2026-08-31' };
    // 100 − 1500 (aluguel de set, pago) + 5000 − 1000 − 250 = 2350; o aluguel de out e o pendente não contam
    assert.equal(C.saldoDaConta(k1, dados, '2026-10-18'), 2350);
    assert.equal(C.saldoDaConta({ id: 'k2', saldoInicial: 0, dataSaldo: '2026-01-01' }, dados, '2026-10-18'), 1000);
    assert.equal(C.saldoDaConta(k1, dados, '2026-09-30'), -1400);
  });

  test('contas a pagar e receber: atrasadas, próximas e faturas', () => {
    const dados = {
      transacoes: [
        { id: 'luz', desc: 'Luz', date: '2026-09-15', type: 'Despesa', value: 120, recurrence: 'fixo', status: 'Pendente', account: 'Boleto', excecoes: { '2026-09': { status: 'Pago' } } },
        { id: 'cli', desc: 'Cliente X', date: '2026-10-25', type: 'Receita', value: 800, recurrence: 'unico', status: 'Pendente', account: 'Pix' },
        { id: 'pago', desc: 'Pago', date: '2026-10-10', type: 'Despesa', value: 50, recurrence: 'unico', status: 'Pago', account: 'Pix' },
        { id: 'cc', desc: 'Compra', date: '2026-10-05', type: 'Despesa', value: 90, recurrence: 'unico', status: 'Pago', account: 'Cartão de Crédito', cardId: 'c' },
      ],
      cartoes: [{ id: 'c', name: 'Nubank', closingDay: 3, dueDay: 10 }],
    };
    const lista = C.aPagarEReceber(dados, { hoje: '2026-10-18', dias: 30 });
    assert.deepEqual(lista.map((i) => [i.descricao, i.data, i.atrasado]), [
      ['Luz', '2026-10-15', true],
      ['Cliente X', '2026-10-25', false],
      ['Fatura Nubank', '2026-11-10', false],
      ['Luz', '2026-11-15', false],
    ]);
  });

  test('plano de quitação: avalanche paga primeiro os juros maiores', () => {
    const dividas = [
      { id: 'cartao', name: 'Cartão', saldo: 2000, juros: 12, parcela: 100 },
      { id: 'emprestimo', name: 'Empréstimo', saldo: 1000, juros: 2, parcela: 100 },
    ];
    const av = C.planoDeQuitacao(dividas, 600, 'avalanche', '2026-11');
    assert.equal(av.viavel, true);
    assert.equal(av.ordem[0].id, 'cartao');
    const bn = C.planoDeQuitacao(dividas, 600, 'bola-de-neve', '2026-11');
    assert.equal(bn.ordem[0].id, 'emprestimo');
    assert.ok(av.jurosTotal < bn.jurosTotal, 'avalanche paga menos juros');
    const impossivel = C.planoDeQuitacao([{ id: 'x', saldo: 10000, juros: 10, parcela: 100 }], 100);
    assert.equal(impossivel.viavel, false);
  });
});
