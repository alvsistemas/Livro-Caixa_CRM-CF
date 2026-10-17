const crypto = require('crypto');

const VALIDADE_MINUTOS = 60;

// O token que vai por e-mail é aleatório e nunca fica guardado como está: só o hash (SHA-256)
// vai pro banco. Assim, mesmo que alguém leia o banco, não consegue usar o link.
function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function gerarTokenReset(agora = Date.now()) {
  const token = crypto.randomBytes(32).toString('hex');
  return {
    token, // vai no link do e-mail
    hash: hashToken(token), // vai pro banco
    expira: new Date(agora + VALIDADE_MINUTOS * 60 * 1000),
  };
}

// Confere se o token recebido bate com o que está guardado e ainda não venceu.
function tokenResetValido(user, token, agora = Date.now()) {
  if (!user || !user.resetSenhaHash || !user.resetSenhaExpira || !token) return false;
  if (new Date(user.resetSenhaExpira).getTime() <= agora) return false;
  const a = Buffer.from(hashToken(token));
  const b = Buffer.from(String(user.resetSenhaHash));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = { VALIDADE_MINUTOS, hashToken, gerarTokenReset, tokenResetValido };
