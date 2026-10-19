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
  assert.deepEqual(l[2].extras.crmFechamento, { clienteId: card._id, fechamentoId: 'abc', parcela: 3, total: 3, meio: 'credito' });
  // não recebido e já vencido: Pendente; parcela já paga antes continua paga
  const n = f.montarLancamentos(card, { ...fe, recebido: false }, 'x', '2026-12-01', new Set([1]));
  assert.deepEqual(n.map((x) => x.status), ['Pendente', 'Pago', 'Agendado']);
  const av = f.montarLancamentos(card, f.normalizarFechamento({ ...base, valorFinal: 50 }, 50), 'y', '2026-10-19');
  assert.equal(av[0].descricao, 'Venda — Maria');
});
