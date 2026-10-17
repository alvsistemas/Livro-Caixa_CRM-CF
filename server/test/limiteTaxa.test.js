const test = require('node:test');
const assert = require('node:assert');
const { Limitador, criarMiddlewareLimite } = require('../utils/limiteTaxa');

test('Limitador', async (t) => {
  await t.test('permite até o máximo e bloqueia a tentativa seguinte', () => {
    const l = new Limitador({ janelaMs: 1000, max: 3 });
    assert.strictEqual(l.tentar('a', 0).permitido, true);
    assert.strictEqual(l.tentar('a', 1).permitido, true);
    const terceira = l.tentar('a', 2);
    assert.strictEqual(terceira.permitido, true);
    assert.strictEqual(terceira.restantes, 0);
    const quarta = l.tentar('a', 3);
    assert.strictEqual(quarta.permitido, false);
    assert.ok(quarta.retryAposSegundos >= 1);
  });

  await t.test('chaves diferentes não se misturam', () => {
    const l = new Limitador({ janelaMs: 1000, max: 1 });
    assert.strictEqual(l.tentar('ip1', 0).permitido, true);
    assert.strictEqual(l.tentar('ip1', 1).permitido, false);
    assert.strictEqual(l.tentar('ip2', 1).permitido, true);
  });

  await t.test('a janela reinicia depois que vence', () => {
    const l = new Limitador({ janelaMs: 1000, max: 1 });
    assert.strictEqual(l.tentar('a', 0).permitido, true);
    assert.strictEqual(l.tentar('a', 500).permitido, false);
    assert.strictEqual(l.tentar('a', 1000).permitido, true);
  });

  await t.test('limpar remove só o que já venceu', () => {
    const l = new Limitador({ janelaMs: 1000, max: 1 });
    l.tentar('velha', 0);
    l.tentar('nova', 900);
    l.limpar(1100);
    assert.strictEqual(l.registros.has('velha'), false);
    assert.strictEqual(l.registros.has('nova'), true);
  });
});

test('criarMiddlewareLimite responde 429 com Retry-After depois do limite', () => {
  const mw = criarMiddlewareLimite({ janelaMs: 60000, max: 2, chaveDe: () => 'fixa', mensagem: 'devagar' });
  const chamadas = [];
  const res = {
    headers: {},
    setHeader(k, v) { this.headers[k] = v; },
    status(c) { this.codigo = c; return this; },
    json(corpo) { this.corpo = corpo; return this; },
  };
  const next = () => chamadas.push('next');
  mw({}, res, next);
  mw({}, res, next);
  assert.deepStrictEqual(chamadas, ['next', 'next']);
  mw({}, res, next);
  assert.strictEqual(chamadas.length, 2);
  assert.strictEqual(res.codigo, 429);
  assert.strictEqual(res.corpo.error, 'devagar');
  assert.ok(Number(res.headers['Retry-After']) >= 1);
});
