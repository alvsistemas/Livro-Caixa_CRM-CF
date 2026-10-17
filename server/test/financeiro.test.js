const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { validarSecao, serializar, dadosPadrao, SECOES } = require('../utils/financeiro');

describe('validarSecao — formato dos dados do Controle financeiro', () => {
  test('aceita listas de objetos nas seções de lista', () => {
    for (const secao of ['transacoes', 'cartoes', 'investimentos', 'objetivos']) {
      const r = validarSecao(secao, [{ id: 'a', value: 10 }]);
      assert.equal(r.ok, true, secao);
    }
  });

  test('recusa seção desconhecida', () => {
    assert.equal(validarSecao('senhas', []).ok, false);
    assert.equal(validarSecao('__proto__', {}).ok, false);
  });

  test('recusa lista que não é lista ou tem itens que não são objetos', () => {
    assert.equal(validarSecao('transacoes', { a: 1 }).ok, false);
    assert.equal(validarSecao('transacoes', [1, 2]).ok, false);
    assert.equal(validarSecao('transacoes', [null]).ok, false);
    assert.equal(validarSecao('transacoes', undefined).ok, false);
  });

  test('perfil aceita null, objeto e foto em data URL de imagem', () => {
    assert.equal(validarSecao('perfil', null).ok, true);
    assert.equal(validarSecao('perfil', { name: 'Ana', character: 'lily' }).ok, true);
    assert.equal(validarSecao('perfil', { photo: 'data:image/jpeg;base64,AAAA' }).ok, true);
  });

  test('perfil recusa foto que não é imagem', () => {
    assert.equal(validarSecao('perfil', { photo: 'javascript:alert(1)' }).ok, false);
    assert.equal(validarSecao('perfil', { photo: 'data:text/html;base64,AAAA' }).ok, false);
    assert.equal(validarSecao('perfil', [1]).ok, false);
  });

  test('config só aceita modos de integração conhecidos', () => {
    for (const modo of ['vendas', 'comissoes', 'nenhum']) assert.equal(validarSecao('config', { integracaoCrm: modo }).ok, true);
    assert.equal(validarSecao('config', { integracaoCrm: 'tudo' }).ok, false);
    assert.equal(validarSecao('config', {}).ok, true);
    assert.equal(validarSecao('config', null).ok, false);
  });

  test('recusa seção grande demais (acima de 2 MB)', () => {
    const grande = [{ texto: 'x'.repeat(2.1 * 1024 * 1024) }];
    assert.equal(validarSecao('transacoes', grande).ok, false);
  });
});

describe('serializar — formato devolvido ao front-end', () => {
  test('sem documento ainda, devolve tudo vazio', () => {
    assert.deepEqual(serializar(null), dadosPadrao());
  });

  test('copia só as seções conhecidas e troca config null por objeto vazio', () => {
    const r = serializar({ transacoes: [{ id: 1 }], config: null, userId: 'x', _id: 'y' });
    assert.deepEqual(r.transacoes, [{ id: 1 }]);
    assert.deepEqual(r.config, {});
    assert.equal(r.userId, undefined);
    assert.deepEqual(Object.keys(r).sort(), [...SECOES].sort());
  });
});
