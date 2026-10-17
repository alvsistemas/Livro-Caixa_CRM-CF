const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const { assinaturaValida, exigirAssinaturaMeta } = require('../utils/webhookMeta');

const SEGREDO = 'segredo-do-app';
const corpo = Buffer.from(JSON.stringify({ entry: [{ id: '123' }] }));
const assinar = (buf, segredo = SEGREDO) => 'sha256=' + crypto.createHmac('sha256', segredo).update(buf).digest('hex');

test('assinaturaValida', async (t) => {
  await t.test('aceita a assinatura correta', () => {
    assert.strictEqual(assinaturaValida(corpo, assinar(corpo), SEGREDO), true);
  });
  await t.test('rejeita corpo alterado', () => {
    const adulterado = Buffer.from(JSON.stringify({ entry: [{ id: '999' }] }));
    assert.strictEqual(assinaturaValida(adulterado, assinar(corpo), SEGREDO), false);
  });
  await t.test('rejeita segredo errado, cabeçalho ausente ou lixo', () => {
    assert.strictEqual(assinaturaValida(corpo, assinar(corpo, 'outro'), SEGREDO), false);
    assert.strictEqual(assinaturaValida(corpo, undefined, SEGREDO), false);
    assert.strictEqual(assinaturaValida(corpo, 'sha256=curto', SEGREDO), false);
    assert.strictEqual(assinaturaValida(undefined, assinar(corpo), SEGREDO), false);
  });
});

test('exigirAssinaturaMeta (middleware)', async (t) => {
  const original = process.env.META_APP_SECRET;
  const novoRes = () => ({ sendStatus(c) { this.codigo = c; return this; } });
  const reqCom = (assinatura) => ({ rawBody: corpo, get: (h) => (h.toLowerCase() === 'x-hub-signature-256' ? assinatura : undefined) });

  t.after(() => {
    if (original === undefined) delete process.env.META_APP_SECRET;
    else process.env.META_APP_SECRET = original;
  });

  await t.test('com META_APP_SECRET: assinatura boa passa, ruim leva 403', () => {
    process.env.META_APP_SECRET = SEGREDO;
    let passou = false;
    exigirAssinaturaMeta(reqCom(assinar(corpo)), novoRes(), () => { passou = true; });
    assert.strictEqual(passou, true);

    const res = novoRes();
    let passou2 = false;
    exigirAssinaturaMeta(reqCom('sha256=00'), res, () => { passou2 = true; });
    assert.strictEqual(passou2, false);
    assert.strictEqual(res.codigo, 403);
  });

  await t.test('sem META_APP_SECRET: aceita como antes (compatibilidade)', () => {
    delete process.env.META_APP_SECRET;
    let passou = false;
    const aviso = console.warn;
    console.warn = () => {};
    try { exigirAssinaturaMeta(reqCom(undefined), novoRes(), () => { passou = true; }); } finally { console.warn = aviso; }
    assert.strictEqual(passou, true);
  });
});
