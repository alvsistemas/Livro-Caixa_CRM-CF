const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const {
  paraWhatsapp, assinaturaTwilioValida, normalizarEventoTwilio, enviarTextoTwilio, enviarTemplateTwilio,
} = require('../utils/whatsappTwilio');
const { provedorDe, enviarTexto } = require('../utils/whatsappEnvio');

function assinar(url, params, token) {
  let d = url;
  for (const k of Object.keys(params).sort()) d += k + params[k];
  return crypto.createHmac('sha1', token).update(d).digest('base64');
}

test('paraWhatsapp', () => {
  assert.strictEqual(paraWhatsapp('5515988053447'), 'whatsapp:+5515988053447');
  assert.strictEqual(paraWhatsapp(''), '');
});

test('assinatura Twilio: válida, adulterada, token errado, sem cabeçalho', () => {
  const url = 'https://painel.exemplo.com/api/whatsapp/twilio-webhook/abc';
  const p = { From: 'whatsapp:+5515988053447', Body: 'Olá', MessageSid: 'SM1' };
  const h = assinar(url, p, 'tok');
  assert.ok(assinaturaTwilioValida(url, p, 'tok', h));
  assert.ok(assinaturaTwilioValida(url, { Body: 'Olá', MessageSid: 'SM1', From: p.From }, 'tok', h)); // ordem não importa
  assert.ok(!assinaturaTwilioValida(url, { ...p, Body: 'outro' }, 'tok', h));
  assert.ok(!assinaturaTwilioValida(url, p, 'errado', h));
  assert.ok(!assinaturaTwilioValida(url, p, 'tok', ''));
  assert.ok(!assinaturaTwilioValida(url + 'x', p, 'tok', h));
});

test('normaliza mensagem de texto recebida', () => {
  const v = normalizarEventoTwilio({ From: 'whatsapp:+5515988053447', To: 'whatsapp:+14155238886', Body: 'Quero simular', MessageSid: 'SM9', ProfileName: 'Maria', NumMedia: '0', SmsStatus: 'received' }, '14155238886');
  assert.strictEqual(v.metadata.phone_number_id, '14155238886');
  assert.strictEqual(v.messages[0].from, '5515988053447');
  assert.strictEqual(v.messages[0].id, 'SM9');
  assert.strictEqual(v.messages[0].text.body, 'Quero simular');
  assert.strictEqual(v.contacts[0].profile.name, 'Maria');
});

test('normaliza mídia recebida', () => {
  const v = normalizarEventoTwilio({ From: 'whatsapp:+55', Body: 'foto', NumMedia: '1', MediaUrl0: 'https://api.twilio.com/m/1', MediaContentType0: 'image/jpeg', MessageSid: 'SM2' }, '1');
  assert.strictEqual(v.messages[0].type, 'image');
  assert.strictEqual(v.messages[0].image.link, 'https://api.twilio.com/m/1');
  const d = normalizarEventoTwilio({ From: 'whatsapp:+55', Body: '', NumMedia: '1', MediaUrl0: 'u', MediaContentType0: 'application/pdf', MessageSid: 'SM3' }, '1');
  assert.strictEqual(d.messages[0].type, 'document');
});

test('normaliza status de entrega', () => {
  assert.deepStrictEqual(normalizarEventoTwilio({ MessageSid: 'SM1', MessageStatus: 'delivered' }, '1').statuses, [{ id: 'SM1', status: 'delivered' }]);
  assert.strictEqual(normalizarEventoTwilio({ MessageSid: 'SM1', MessageStatus: 'undelivered' }, '1').statuses[0].status, 'failed');
  assert.strictEqual(normalizarEventoTwilio({ MessageSid: 'SM1', MessageStatus: 'queued' }, '1').statuses.length, 0);
  assert.strictEqual(normalizarEventoTwilio({}, '1'), null);
});

function comFetchFalso(resposta, fn) {
  const original = global.fetch;
  const chamadas = [];
  global.fetch = async (url, opts) => { chamadas.push({ url, opts }); return { ok: resposta.ok !== false, json: async () => resposta.corpo }; };
  return Promise.resolve(fn(chamadas)).finally(() => { global.fetch = original; });
}

const SID = 'AC' + 'a'.repeat(32);
const user = { whatsappBusiness: { provedor: 'twilio', phoneNumberId: '14155238886', accountSid: SID, accessToken: 'TOK', webhookToken: 'x'.repeat(48) } };
const card = { telefoneNormalizado: '5515988053447' };

test('envia texto pela Twilio (Basic auth, formulário, whatsapp:)', () =>
  comFetchFalso({ corpo: { sid: 'SMabc' } }, async (c) => {
    process.env.APP_URL = 'https://painel.exemplo.com';
    const r = await enviarTextoTwilio(user, card, 'Olá');
    assert.strictEqual(c[0].url, `https://api.twilio.com/2010-04-01/Accounts/${SID}/Messages.json`);
    assert.strictEqual(c[0].opts.headers.Authorization, 'Basic ' + Buffer.from(`${SID}:TOK`).toString('base64'));
    const f = new URLSearchParams(c[0].opts.body);
    assert.strictEqual(f.get('From'), 'whatsapp:+14155238886');
    assert.strictEqual(f.get('To'), 'whatsapp:+5515988053447');
    assert.strictEqual(f.get('Body'), 'Olá');
    assert.strictEqual(f.get('StatusCallback'), `https://painel.exemplo.com/api/whatsapp/twilio-webhook/${'x'.repeat(48)}`);
    assert.strictEqual(r.messages[0].id, 'SMabc');
  }));

test('envia modelo pela Twilio com ContentSid e variáveis numeradas', () =>
  comFetchFalso({ corpo: { sid: 'SMt' } }, async (c) => {
    await enviarTemplateTwilio(user, card, 'HX123', 'pt_BR', ['Maria', 3]);
    const f = new URLSearchParams(c[0].opts.body);
    assert.strictEqual(f.get('ContentSid'), 'HX123');
    assert.deepStrictEqual(JSON.parse(f.get('ContentVariables')), { 1: 'Maria', 2: '3' });
    assert.strictEqual(f.get('Body'), null);
  }));

test('erro da Twilio vira Error com a mensagem dela', () =>
  comFetchFalso({ ok: false, corpo: { message: 'janela de 24h fechada' } }, async () => {
    await assert.rejects(() => enviarTextoTwilio(user, card, 'x'), /janela de 24h/);
  }));

test('despacho por provedor', () =>
  comFetchFalso({ corpo: { sid: 'SMd' } }, async (c) => {
    assert.strictEqual(provedorDe(user), 'twilio');
    await enviarTexto(user, card, 'oi');
    assert.match(c[0].url, /api\.twilio\.com/);
  }));
