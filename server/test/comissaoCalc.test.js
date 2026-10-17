const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { calcComissaoPorBlocos, calcComissaoPorRegra } = require('../utils/comissaoCalc');

describe('calcComissaoPorRegra — comissão a partir de uma regra editável', () => {
  test('parcela única de 5%: venda de R$100.000 gera R$5.000', () => {
    const r = calcComissaoPorRegra(100000, { blocos: [{ parcelas: 1, percentual: 0.05 }] });
    assert.equal(r.parcelas, 1);
    assert.equal(r.value, 5000);
    assert.equal(r.total, 5000);
  });

  test('várias parcelas iguais: 10% dividido em 4x', () => {
    const r = calcComissaoPorRegra(20000, { blocos: [{ parcelas: 4, percentual: 0.1 / 4 }] });
    assert.equal(r.parcelas, 4);
    assert.equal(r.value, 500);
    assert.equal(r.total, 2000);
  });

  test('dois blocos diferentes: guarda o detalhe e o resumo', () => {
    const r = calcComissaoPorRegra(10000, { blocos: [{ parcelas: 2, percentual: 0.03 }, { parcelas: 1, percentual: 0.04 }] });
    assert.equal(r.parcelas, 3);
    assert.equal(r.parcelas1, 2);
    assert.equal(r.value, 300);
    assert.equal(r.value2, 400);
    assert.equal(r.total, 1000);
    assert.equal(r.blocos.length, 2);
  });

  test('valor de venda 0 não gera comissão negativa nem NaN', () => {
    const r = calcComissaoPorRegra(0, { blocos: [{ parcelas: 3, percentual: 0.02 }] });
    assert.equal(r.value, 0);
    assert.equal(r.total, 0);
  });

  test('valor como texto numérico é aceito; texto inválido cai pra 0', () => {
    assert.equal(calcComissaoPorRegra('1000', { blocos: [{ parcelas: 1, percentual: 0.1 }] }).value, 100);
    assert.equal(calcComissaoPorRegra('abc', { blocos: [{ parcelas: 1, percentual: 0.1 }] }).value, 0);
  });

  test('regra sem blocos não quebra — cai num bloco de 0%', () => {
    const r = calcComissaoPorRegra(1000, null);
    assert.equal(r.parcelas, 1);
    assert.equal(r.value, 0);
  });

  test('arredonda cada parcela a centavos', () => {
    const [b] = calcComissaoPorBlocos(100000, [{ parcelas: 11, percentual: 0.016 / 11 }]);
    assert.equal(b.value, 145.45);
  });
});
