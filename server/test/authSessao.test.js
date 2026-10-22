const test = require('node:test');
const assert = require('node:assert');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'segredo-de-teste';
const User = require('../models/User');
const auth = require('../middleware/auth');

function executar(token) {
  return new Promise((ok) => {
    const req = { headers: { authorization: token ? `Bearer ${token}` : '' } };
    const res = {
      status(c) { this.codigo = c; return this; },
      json(corpo) { ok({ status: this.codigo, corpo }); },
    };
    auth(req, res, () => ok({ status: 200, userId: req.userId }));
  });
}
const assinar = (extra = {}) => jwt.sign({ sub: 'u1', tv: 0, ...extra }, 'segredo-de-teste', { expiresIn: '1h' });

test('token inválido ou expirado → 401 com codigo sessao_invalida (aí o navegador desloga)', async () => {
  const r = await executar('lixo');
  assert.equal(r.status, 401);
  assert.equal(r.corpo.codigo, 'sessao_invalida');
  const expirado = jwt.sign({ sub: 'u1' }, 'segredo-de-teste', { expiresIn: -10 });
  assert.equal((await executar(expirado)).corpo.codigo, 'sessao_invalida');
});

test('erro do banco → 503 SEM codigo de sessão inválida (ninguém é deslogado por soluço do servidor)', async () => {
  User.findById = () => ({ select: async () => { throw new Error('buffering timed out'); } });
  const r = await executar(assinar());
  assert.equal(r.status, 503);
  assert.equal(r.corpo.codigo, undefined);
});

test('versão de token diferente → 401 sessao_invalida; versão certa passa', async () => {
  User.findById = () => ({ select: async () => ({ tokenVersion: 2 }) });
  assert.equal((await executar(assinar({ tv: 1 }))).corpo.codigo, 'sessao_invalida');
  const ok = await executar(assinar({ tv: 2 }));
  assert.equal(ok.status, 200);
  assert.equal(ok.userId, 'u1');
});
