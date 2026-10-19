const { test } = require('node:test');
const assert = require('node:assert/strict');
const f = require('../utils/fechamento');

const base = { forma: 'avista', primeiraData: '2026-10-19', meio: 'pix' };

test('fechamento: valor final ou desconto em %, sempre em centavos exatos', () => {
  const a = f.normalizarFechamento({ ...base, valorFinal: 900 }, 1000);
  assert.equal(a.valorFinal, 900);
  assert.equal(a.desconto, 100);
  const b = f.normalizarFechamento({ ...base, descontoPct: 7.5 }, 39.9);
  assert.equal(b.valorFinal, 36.91); // 39,90 - 7,5% = 36,9075 -> 36,91
  assert.equal(b.desconto, 2.99);
  // sem valor no card, só dá pra informar o valor final
  assert.throws(() => f.normalizarFechamento({ ...base, descontoPct: 10 }, 0), /valor final/);
  assert.equal(f.normalizarFechamento({ ...base, valorFinal: 50 }, 0).valorFinal, 50);
});

test('fechamento: recusa dados errados com mensagem clara', () => {
  assert.throws(() => f.normalizarFechamento({ ...base, valorFinal: 0 }, 100), /maior que zero/);
  assert.throws(() => f.normalizarFechamento({ ...base, valorFinal: 10, forma: 'fiado' }, 100), /como o cliente vai pagar/);
  assert.throws(() => f.normalizarFechamento({ ...base, valorFinal: 10, meio: 'cheque-voador' }, 100), /meio de pagamento/);
  assert.throws(() => f.normalizarFechamento({ ...base, valorFinal: 10, primeiraData: '2026-02-30' }, 100), /data/);
  assert.throws(() => f.normalizarFechamento({ ...base, valorFinal: 10, forma: 'parcelado', parcelas: 1 }, 100), /2 a 48/);
  assert.throws(() => f.normalizarFechamento({ ...base, valorFinal: 100, forma: 'entrada', parcelas: 2, entrada: 100 }, 100), /menor que o valor final/);
  assert.throws(() => f.normalizarFechamento({ ...base, descontoPct: 100 }, 100), /entre 0% e 99%/);
});

test('fechamento: parcelas somam o valor final, sobra dos centavos na primeira, fim de mês ajustado', () => {
  const p = f.montarParcelas(f.normalizarFechamento({ ...base, valorFinal: 100, forma: 'parcelado', parcelas: 3, primeiraData: '2026-01-31' }, 100));
  assert.deepEqual(p.map((x) => x.valor), [33.34, 33.33, 33.33]);
  assert.deepEqual(p.map((x) => x.data), ['2026-01-31', '2026-02-28', '2026-03-31']);
  const e = f.montarParcelas(f.normalizarFechamento({ ...base, valorFinal: 1000, forma: 'entrada', entrada: 250, parcelas: 3, primeiraData: '2026-10-19' }, 1000));
  assert.deepEqual(e.map((x) => [x.rotulo, x.data, x.valor]), [['entrada', '2026-10-19', 250], ['1/3', '2026-11-19', 250], ['2/3', '2026-12-19', 250], ['3/3', '2027-01-19', 250]]);
  const total = (lista) => Math.round(lista.reduce((s, x) => s + x.valor * 100, 0));
  const q = f.montarParcelas(f.normalizarFechamento({ ...base, valorFinal: 1234.57, forma: 'parcelado', parcelas: 7 }, 0));
  assert.equal(total(q), 123457);
});

test('fechamento: lançamentos de receita com situação certa e marca do CRM', () => {
  const card = { _id: '11111111-1111-1111-1111-111111111111', cliente: 'Maria' };
  const fe = f.normalizarFechamento({ ...base, valorFinal: 300, forma: 'parcelado', parcelas: 3, primeiraData: '2026-10-19', meio: 'credito', recebido: true }, 300);
  const l = f.montarLancamentos(card, fe, 'abc', '2026-10-19');
  assert.deepEqual(l.map((x) => x.status), ['Pago', 'Agendado', 'Agendado']);
  assert.equal(l[0].descricao, 'Venda — Maria (1/3)');
  assert.equal(l[0].forma, 'Conta Corrente'); // maquininha cai no banco, não é o cartão da pessoa
  assert.equal(l[0].tipo, 'Receita');
  assert.equal(l[0].categoria, 'Vendas');
  assert.deepEqual(l[2].extras.crmFechamento, { clienteId: card._id, fechamentoId: 'abc', tipo: 'receita', parcela: 3, total: 3, meio: 'credito' });
  // não recebido e já vencido: Pendente; parcela já paga antes continua paga
  const n = f.montarLancamentos(card, { ...fe, recebido: false }, 'x', '2026-12-01', new Set(['receita:2']));
  assert.deepEqual(n.map((x) => x.status), ['Pendente', 'Pago', 'Agendado']);
  const av = f.montarLancamentos(card, f.normalizarFechamento({ ...base, valorFinal: 50 }, 50), 'y', '2026-10-19');
  assert.equal(av[0].descricao, 'Venda — Maria');
});

test('custos da venda: produto e frete no dia da venda, taxa e imposto pelo % sobre o valor final', () => {
  const card = { _id: '22222222-2222-2222-2222-222222222222', cliente: 'Maria' };
  const fe = f.normalizarFechamento({ ...base, valorFinal: 9500, forma: 'parcelado', parcelas: 3, primeiraData: '2026-12-15', meio: 'credito',
    custos: { produto: 6000, frete: '300', taxaPct: 4.99, impostoPct: 6 } }, 10000);
  assert.deepEqual(fe.custos, { produto: 6000, frete: 300, taxaPct: 4.99, taxa: 474.05, impostoPct: 6, imposto: 570, total: 7344.05 });
  const l = f.montarLancamentos(card, fe, 'z', '2026-11-15', new Set(), '2026-11-15');
  const despesas = l.filter((x) => x.tipo === 'Despesa');
  assert.deepEqual(despesas.map((x) => [x.descricao, x.categoria, x.data, x.status, x.valor]), [
    ['Custo do produto — Maria', 'Custo de mercadoria', '2026-11-15', 'Pago', 6000],
    ['Frete — Maria', 'Frete', '2026-11-15', 'Pago', 300],
    ['Taxa de pagamento (4,99%) — Maria', 'Taxas de pagamento', '2026-12-15', 'Agendado', 474.05],
    ['Imposto sobre a venda (6%) — Maria', 'Impostos', '2026-12-15', 'Agendado', 570],
  ]);
  assert.equal(despesas[0].extras.crmFechamento.tipo, 'produto');
  // custo zerado não vira lançamento; custo já pago antes continua pago
  const sem = f.montarLancamentos(card, f.normalizarFechamento({ ...base, valorFinal: 100, custos: { frete: 0, taxaPct: 0 } }, 100), 'k', '2026-10-19');
  assert.equal(sem.filter((x) => x.tipo === 'Despesa').length, 0);
  const pago = f.montarLancamentos(card, fe, 'w', '2026-11-15', new Set(['imposto:0']), '2026-11-15');
  assert.equal(pago.find((x) => x.extras.crmFechamento.tipo === 'imposto').status, 'Pago');
  // taxa e crédito parcelado têm chaves próprias; números fora da faixa são recusados
  assert.equal(f.chaveDaTaxa('credito', 'parcelado'), 'creditoParcelado');
  assert.equal(f.chaveDaTaxa('credito', 'avista'), 'credito');
  assert.throws(() => f.normalizarFechamento({ ...base, valorFinal: 100, custos: { taxaPct: 45 } }, 100), /0 a 30%/);
  assert.throws(() => f.normalizarFechamento({ ...base, valorFinal: 100, custos: { produto: -1 } }, 100), /Custo do produto/);
  assert.deepEqual(f.limparTaxas({ credito: 3.5, pix: null, lixo: 9, debito: 'x' }), { credito: 3.5 });
  assert.equal(f.totalDaComissao({ parcelas: 3, parcelas1: 1, value: 100, value2: 50 }), 200);
  assert.equal(f.totalDaComissao({ blocos: [{ parcelas: 2, value: 10.5 }, { parcelas: 1, value: 1 }] }), 22);
});
