const test = require('node:test');
const assert = require('node:assert');
const { gerarTokenReset, hashToken, tokenResetValido, VALIDADE_MINUTOS } = require('../utils/senhaReset');

test('recuperação de senha: token', async (t) => {
  await t.test('gera tokens longos, únicos, e guarda só o hash', () => {
    const a = gerarTokenReset();
    const b = gerarTokenReset();
    assert.strictEqual(a.token.length, 64);
    assert.notStrictEqual(a.token, b.token);
    assert.notStrictEqual(a.hash, a.token);
    assert.strictEqual(a.hash, hashToken(a.token));
  });

  await t.test('expira em VALIDADE_MINUTOS', () => {
    const agora = 1_700_000_000_000;
    const { expira } = gerarTokenReset(agora);
    assert.strictEqual(expira.getTime(), agora + VALIDADE_MINUTOS * 60 * 1000);
  });

  await t.test('token certo e dentro do prazo é válido', () => {
    const agora = Date.now();
    const { token, hash, expira } = gerarTokenReset(agora);
    const user = { resetSenhaHash: hash, resetSenhaExpira: expira };
    assert.strictEqual(tokenResetValido(user, token, agora + 1000), true);
  });

  await t.test('token errado, vencido ou ausente é inválido', () => {
    const agora = Date.now();
    const { token, hash, expira } = gerarTokenReset(agora);
    const user = { resetSenhaHash: hash, resetSenhaExpira: expira };
    assert.strictEqual(tokenResetValido(user, 'outro-token', agora), false);
    assert.strictEqual(tokenResetValido(user, token, expira.getTime() + 1), false);
    assert.strictEqual(tokenResetValido(user, '', agora), false);
    assert.strictEqual(tokenResetValido(null, token, agora), false);
    assert.strictEqual(tokenResetValido({ resetSenhaHash: null, resetSenhaExpira: null }, token, agora), false);
  });
});
