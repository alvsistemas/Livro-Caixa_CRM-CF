// "Login volta pra tela de login": erro do banco não pode virar 401 (o site desloga com 401)
const test = require('node:test');
const assert = require('node:assert');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'segredo-de-teste';
const User = require('../models/User');
const auth = require('../middleware/auth');
const { ehErroDeConexao } = require('../db/pool');

function chamar(header) {
  return new Promise((resolve) => {
    const req = { headers: { authorization: header } };
    const res = {
      status(c) { this.codigo = c; return this; },
      json(corpo) { resolve({ codigo: this.codigo, corpo }); },
    };
    auth(req, res, () => resolve({ codigo: 'passou', userId: req.userId }));
  });
}

test('sessão', async (t) => {
  const original = User.findById;
  const id = '11111111-1111-4111-8111-111111111111';
  const token = jwt.sign({ sub: id, tv: 0 }, auth.JWT_SECRET, { expiresIn: '1h' });
  t.after(() => { User.findById = original; });

  await t.test('banco fora do ar → 503 "tente de novo", não 401', async () => {
    User.findById = () => ({ select: async () => { throw new Error('Connection terminated unexpectedly'); } });
    const r = await chamar('Bearer ' + token);
    assert.strictEqual(r.codigo, 503);
    assert.strictEqual(r.corpo.tentarDeNovo, true);
  });

  await t.test('token inválido ou vencido → 401', async () => {
    assert.strictEqual((await chamar('Bearer abc.def.ghi')).codigo, 401);
    const vencido = jwt.sign({ sub: id, tv: 0, exp: Math.floor(Date.now() / 1000) - 10 }, auth.JWT_SECRET);
    assert.strictEqual((await chamar('Bearer ' + vencido)).codigo, 401);
    assert.strictEqual((await chamar('')).codigo, 401);
  });

  await t.test('usuário apagado ou "sair de todos os aparelhos" → 401', async () => {
    User.findById = () => ({ select: async () => null });
    assert.strictEqual((await chamar('Bearer ' + token)).codigo, 401);
    User.findById = () => ({ select: async () => ({ _id: id, tokenVersion: 3 }) });
    assert.strictEqual((await chamar('Bearer ' + token)).codigo, 401);
  });

  await t.test('erros de conexão reconhecidos para tentar de novo', () => {
    assert.ok(ehErroDeConexao({ code: 'ECONNRESET' }));
    assert.ok(ehErroDeConexao({ code: '57P01' }));
    assert.ok(ehErroDeConexao({ message: 'timeout exceeded when trying to connect' }));
    assert.ok(!ehErroDeConexao({ code: '23505', message: 'duplicate key' }));
  });
});
