const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const express = require('express');
const bcrypt = require('bcryptjs');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'segredo-de-teste';

const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const authRouter = require('../routes/auth');

// Cada IP de teste tem seu próprio balde do limitador (X-Forwarded-For + trust proxy),
// assim um teste não gasta a cota do outro.
function subirApp() {
  const app = express();
  app.set('trust proxy', true);
  app.use(express.json());
  app.use('/api/auth', authRouter);
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve({ server, base: `http://127.0.0.1:${server.address().port}/api/auth` }));
  });
}

async function chamar(base, caminho, corpo, ip) {
  const r = await fetch(base + caminho, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip },
    body: JSON.stringify(corpo),
  });
  let json = null;
  try { json = await r.json(); } catch (e) { /* sem corpo */ }
  return { status: r.status, json };
}

function usuarioFalso(extra = {}) {
  const u = {
    _id: { toString: () => 'u1' },
    nome: 'Ana', email: 'ana@exemplo.com', senhaHash: null, tokenVersion: 0,
    twoFactorEnabled: false, salvou: 0,
    async save() { this.salvou++; },
    toJSON() { return { id: 'u1', nome: this.nome, email: this.email }; },
    ...extra,
  };
  return u;
}

test('rotas de autenticação (login e recuperação de senha)', async (t) => {
  const fetchOriginal = global.fetch;
  const emailsEnviados = [];
  const chaves = ['RESEND_API_KEY', 'EMAIL_FROM', 'APP_URL'];
  const guardado = {};
  chaves.forEach((k) => { guardado[k] = process.env[k]; });

  global.fetch = async (url, opts) => {
    if (String(url).startsWith('https://api.resend.com')) {
      emailsEnviados.push(JSON.parse(opts.body));
      return { ok: true, status: 200, json: async () => ({ id: 'x' }), text: async () => '' };
    }
    return fetchOriginal(url, opts);
  };
  t.mock.method(AuditLog, 'create', async () => ({}));

  const { server, base } = await subirApp();
  t.after(() => {
    server.close();
    global.fetch = fetchOriginal;
    chaves.forEach((k) => { if (guardado[k] === undefined) delete process.env[k]; else process.env[k] = guardado[k]; });
  });

  await t.test('login: campos ausentes → 400', async () => {
    const r = await chamar(base, '/login', { email: 'a@b.com' }, '10.0.0.1');
    assert.strictEqual(r.status, 400);
  });

  await t.test('login: e-mail desconhecido e senha errada dão a mesma resposta 401', async () => {
    const senhaHash = await bcrypt.hash('certa123', 4);
    const mock = t.mock.method(User, 'findOne', async ({ email }) => (email === 'ana@exemplo.com' ? usuarioFalso({ senhaHash }) : null));
    const a = await chamar(base, '/login', { email: 'ninguem@x.com', senha: 'qualquer1' }, '10.0.0.2');
    const b = await chamar(base, '/login', { email: 'ana@exemplo.com', senha: 'errada123' }, '10.0.0.2');
    assert.strictEqual(a.status, 401);
    assert.strictEqual(b.status, 401);
    assert.strictEqual(a.json.error, b.json.error);
    mock.mock.restore();
  });

  await t.test('login: conta só com Google → 401 com orientação', async () => {
    const mock = t.mock.method(User, 'findOne', async () => usuarioFalso({ senhaHash: null }));
    const r = await chamar(base, '/login', { email: 'ana@exemplo.com', senha: 'abcdef' }, '10.0.0.3');
    assert.strictEqual(r.status, 401);
    assert.match(r.json.error, /Google/);
    mock.mock.restore();
  });

  await t.test('login: senha certa devolve token; com 2FA devolve tempToken sem token', async () => {
    const senhaHash = await bcrypt.hash('certa123', 4);
    let mock = t.mock.method(User, 'findOne', async () => usuarioFalso({ senhaHash }));
    const ok = await chamar(base, '/login', { email: 'ana@exemplo.com', senha: 'certa123' }, '10.0.0.4');
    assert.strictEqual(ok.status, 200);
    assert.ok(ok.json.token);
    mock.mock.restore();

    mock = t.mock.method(User, 'findOne', async () => usuarioFalso({ senhaHash, twoFactorEnabled: true }));
    const dois = await chamar(base, '/login', { email: 'ana@exemplo.com', senha: 'certa123' }, '10.0.0.4');
    assert.strictEqual(dois.status, 200);
    assert.strictEqual(dois.json.requiresTwoFactor, true);
    assert.ok(dois.json.tempToken);
    assert.strictEqual(dois.json.token, undefined);
    mock.mock.restore();
  });

  await t.test('login: a 11ª tentativa do mesmo IP leva 429', async () => {
    const mock = t.mock.method(User, 'findOne', async () => null);
    let ultimo;
    for (let i = 0; i < 11; i++) ultimo = await chamar(base, '/login', { email: 'x@x.com', senha: 'abcdef' }, '10.0.0.5');
    assert.strictEqual(ultimo.status, 429);
    mock.mock.restore();
  });

  await t.test('esqueci-senha: 503 quando o e-mail não está configurado', async () => {
    chaves.forEach((k) => delete process.env[k]);
    const r = await chamar(base, '/esqueci-senha', { email: 'ana@exemplo.com' }, '10.0.1.1');
    assert.strictEqual(r.status, 503);
  });

  process.env.RESEND_API_KEY = 're_teste';
  process.env.EMAIL_FROM = 'Painel <nao-responda@exemplo.com>';
  process.env.APP_URL = 'https://painel.exemplo.com';

  let tokenDoEmail = null;
  let usuarioReset = null;

  await t.test('esqueci-senha: conta existente grava hash (não o token) e envia link', async () => {
    usuarioReset = usuarioFalso();
    const mock = t.mock.method(User, 'findOne', async () => usuarioReset);
    const r = await chamar(base, '/esqueci-senha', { email: ' ANA@exemplo.com ' }, '10.0.1.2');
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.json.ok, true);
    assert.strictEqual(emailsEnviados.length, 1);
    const corpo = JSON.stringify(emailsEnviados[0]);
    const m = corpo.match(/login\.html\?reset=([0-9a-f]{64})/);
    assert.ok(m, 'o e-mail deve conter o link com o token');
    tokenDoEmail = m[1];
    assert.ok(usuarioReset.resetSenhaHash);
    assert.notStrictEqual(usuarioReset.resetSenhaHash, tokenDoEmail);
    assert.ok(usuarioReset.resetSenhaExpira > new Date());
    mock.mock.restore();
  });

  await t.test('esqueci-senha: conta inexistente recebe a MESMA resposta e nenhum e-mail sai', async () => {
    const antes = emailsEnviados.length;
    const mock = t.mock.method(User, 'findOne', async () => null);
    const r = await chamar(base, '/esqueci-senha', { email: 'fantasma@exemplo.com' }, '10.0.1.3');
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.json.ok, true);
    assert.strictEqual(emailsEnviados.length, antes);
    mock.mock.restore();
  });

  await t.test('esqueci-senha: sem e-mail → 400', async () => {
    const r = await chamar(base, '/esqueci-senha', {}, '10.0.1.4');
    assert.strictEqual(r.status, 400);
  });

  await t.test('esqueci-senha: 4º pedido para o mesmo e-mail → 429', async () => {
    const mock = t.mock.method(User, 'findOne', async () => null);
    let ultimo;
    for (let i = 0; i < 4; i++) ultimo = await chamar(base, '/esqueci-senha', { email: 'spam@exemplo.com' }, `10.0.2.${i}`);
    assert.strictEqual(ultimo.status, 429);
    mock.mock.restore();
  });

  await t.test('esqueci-senha: o 6º pedido do mesmo IP → 429', async () => {
    const mock = t.mock.method(User, 'findOne', async () => null);
    let ultimo;
    for (let i = 0; i < 6; i++) ultimo = await chamar(base, '/esqueci-senha', { email: `v${i}@exemplo.com` }, '10.0.3.1');
    assert.strictEqual(ultimo.status, 429);
    mock.mock.restore();
  });

  await t.test('redefinir-senha: campos ausentes e senha curta → 400', async () => {
    assert.strictEqual((await chamar(base, '/redefinir-senha', { token: 'x' }, '10.0.4.1')).status, 400);
    assert.strictEqual((await chamar(base, '/redefinir-senha', { token: 'x', senhaNova: '123' }, '10.0.4.1')).status, 400);
  });

  await t.test('redefinir-senha: token inventado → 400', async () => {
    const mock = t.mock.method(User, 'findOne', async () => null);
    const r = await chamar(base, '/redefinir-senha', { token: 'a'.repeat(64), senhaNova: 'novaSenha1' }, '10.0.4.2');
    assert.strictEqual(r.status, 400);
    mock.mock.restore();
  });

  await t.test('redefinir-senha: token válido troca a senha, invalida sessões e não pode ser reusado', async () => {
    const { hashToken } = require('../utils/senhaReset');
    const mock = t.mock.method(User, 'findOne', async (q) => (q.resetSenhaHash === usuarioReset.resetSenhaHash && usuarioReset.resetSenhaHash ? usuarioReset : null));
    const antes = emailsEnviados.length;
    assert.strictEqual(usuarioReset.resetSenhaHash, hashToken(tokenDoEmail));

    const r = await chamar(base, '/redefinir-senha', { token: tokenDoEmail, senhaNova: 'novaSenha1' }, '10.0.4.3');
    assert.strictEqual(r.status, 200);
    assert.ok(await bcrypt.compare('novaSenha1', usuarioReset.senhaHash));
    assert.strictEqual(usuarioReset.resetSenhaHash, null);
    assert.strictEqual(usuarioReset.tokenVersion, 1);
    assert.strictEqual(emailsEnviados.length, antes + 1, 'deve avisar que a senha mudou');

    const reuso = await chamar(base, '/redefinir-senha', { token: tokenDoEmail, senhaNova: 'outraSenha2' }, '10.0.4.3');
    assert.strictEqual(reuso.status, 400);
    mock.mock.restore();
  });

  await t.test('redefinir-senha: token vencido → 400', async () => {
    const { gerarTokenReset } = require('../utils/senhaReset');
    const { token, hash } = gerarTokenReset();
    const u = usuarioFalso({ resetSenhaHash: hash, resetSenhaExpira: new Date(Date.now() - 1000) });
    const mock = t.mock.method(User, 'findOne', async () => u);
    const r = await chamar(base, '/redefinir-senha', { token, senhaNova: 'novaSenha1' }, '10.0.4.4');
    assert.strictEqual(r.status, 400);
    assert.strictEqual(u.salvou, 0);
    mock.mock.restore();
  });
});
