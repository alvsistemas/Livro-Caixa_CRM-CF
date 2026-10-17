const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const {
  calcComissaoPorBlocos,
  resumoLegadoDeBlocos,
  calcComissaoPorRegra,
} = require('../utils/comissaoCalc');
const { REGRAS_PADRAO, slugify } = require('../utils/regrasComissao');

describe('calcComissaoPorBlocos — motor genérico da engrenagem de Comissões', () => {
  test('um bloco só: calcula parcelas x percentual, arredondado a centavos', () => {
    const r = calcComissaoPorBlocos(100000, [{ parcelas: 1, percentual: 0.011 }]);
    assert.equal(r.length, 1);
    assert.equal(r[0].parcelas, 1);
    assert.equal(r[0].value, 1100);
  });

  test('vários blocos: cada linha calcula seu próprio valor independentemente', () => {
    const r = calcComissaoPorBlocos(1000000, [
      { parcelas: 10, percentual: 1033.88 / 1000000 },
      { parcelas: 3, percentual: 1905.61 / 1000000 },
    ]);
    assert.equal(r[0].value, 1033.88);
    assert.equal(r[1].value, 1905.61);
  });

  test('lista de blocos vazia ou inválida não quebra — cai num bloco de 0%', () => {
    const r = calcComissaoPorBlocos(100000, []);
    assert.equal(r.length, 1);
    assert.equal(r[0].value, 0);
  });

  test('valor de venda inválido (texto) não quebra, cai pra 0', () => {
    const r = calcComissaoPorBlocos('abc', [{ parcelas: 1, percentual: 0.1 }]);
    assert.equal(r[0].value, 0);
  });
});

describe('resumoLegadoDeBlocos — compatibilidade com contratos antigos (parcelas/parcelas1/value/value2)', () => {
  test('1 bloco só: value2 fica 0 e parcelas1 = parcelas do único bloco', () => {
    const blocos = calcComissaoPorBlocos(100000, [{ parcelas: 11, percentual: 0.016 / 11 }]);
    const resumo = resumoLegadoDeBlocos(blocos);
    assert.equal(resumo.parcelas, 11);
    assert.equal(resumo.parcelas1, 11);
    assert.equal(resumo.value2, 0);
  });

  test('3+ blocos: resumo legado usa só os 2 primeiros, mas "parcelas" soma todos', () => {
    const blocos = calcComissaoPorBlocos(100000, [
      { parcelas: 5, percentual: 0.01 },
      { parcelas: 5, percentual: 0.02 },
      { parcelas: 5, percentual: 0.03 },
    ]);
    const resumo = resumoLegadoDeBlocos(blocos);
    assert.equal(resumo.parcelas, 15);
    assert.equal(resumo.parcelas1, 5);
    assert.equal(resumo.value, 1000);
    assert.equal(resumo.value2, 2000);
  });
});

describe('Regras padrão do sistema', () => {
  test('existe pelo menos uma regra padrão, com chave "padrao"', () => {
    assert.ok(REGRAS_PADRAO.length >= 1);
    assert.ok(REGRAS_PADRAO.some((r) => r.chave === 'padrao'));
  });

  test('regra "padrao" = 5% do valor da venda numa parcela só', () => {
    const regra = REGRAS_PADRAO.find((r) => r.chave === 'padrao');
    const r = calcComissaoPorRegra(100000, regra);
    assert.equal(r.parcelas, 1);
    assert.equal(r.parcelas1, 1);
    assert.equal(r.value, 5000);
    assert.equal(r.value2, 0);
    assert.equal(r.total, 5000);
  });

  test('toda regra padrão tem chave única, nome e pelo menos um bloco válido', () => {
    const chaves = new Set();
    for (const regra of REGRAS_PADRAO) {
      assert.ok(!chaves.has(regra.chave), `chave repetida: ${regra.chave}`);
      chaves.add(regra.chave);
      assert.ok(regra.nome && regra.nome.trim());
      assert.ok(Array.isArray(regra.blocos) && regra.blocos.length > 0);
      for (const b of regra.blocos) {
        assert.ok(b.parcelas >= 1);
        assert.ok(b.percentual >= 0);
      }
    }
  });
});

describe('slugify — transforma nome digitado numa chave técnica estável', () => {
  test('remove acentos, deixa minúsculo e troca espaço por underscore', () => {
    assert.equal(slugify('Serviço Premium'), 'servico_premium');
  });
  test('remove pontuação e símbolos', () => {
    assert.equal(slugify('Plano (anual) - 2ª versão!'), 'plano_anual_2_versao');
  });
  test('string vazia ou só símbolos cai num nome padrão', () => {
    assert.equal(slugify(''), 'regra');
    assert.equal(slugify('!!!'), 'regra');
  });
});
