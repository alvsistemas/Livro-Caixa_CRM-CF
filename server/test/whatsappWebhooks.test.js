const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const crypto = require('crypto');
const express = require('express');
const path = require('path');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'segredo-de-teste';
process.env.APP_URL = 'https://painel.exemplo.com';

// Efeitos colaterais que falariam com o banco/rede: trocados antes de carregar a rota.
function stub(rel, exports) {
  const id = require.resolve(rel);
  require.cache[id] = { id, filename: id, loaded: true, exports };
}
stub('../utils/dispararWebhooks', { dispararWebhooks: () => {} });
stub('../utils/push', { enviarPush: () => {}, montarPayloadMensagem: () => ({}) });
stub('../utils/telegramAlerta', { enviarAlertaTelegram: async () => {} });
stub('../utils/comissaoAutomatica', { gerarComissaoAutomaticaSeGanho: () => {} });

const User = require('../models/User');
const Card = require('../models/Card');
const Column = require('../models/Column');
const Message = require('../models/Message');
const whatsappRouter = require('../routes/whatsapp');

const TOKEN_URL = 'a'.repeat(32);

function subir() {
  const app = express();
  app.use(express.json({ verify: (req, _r, buf) => { req.rawBody = buf; } }));
  app.use('/api/whatsapp', whatsappRouter);
  return new Promise((ok) => {
    const server = app.listen(0, () => ok({ server, base: `http://127.0.0.1:${server.address().port}/api/whatsapp` }));
  });
}

function preparar(provedor, extras = {}) {
  const registro = { mensagens: [], atualizacoes: [], cards: [] };
  const user = {
    _id: 'u1',
    whatsappBusiness: { provedor, phoneNumberId: '5511999990000', accessToken: 'AUTHTOK', webhookToken: TOKEN_URL, webhookSecret: 'whsec_t', accountSid: 'AC' + 'b'.repeat(32), ...extras },
  };
  User.findOne = async (q) => (q['whatsappBusiness.webhookToken'] === TOKEN_URL && q['whatsappBusiness.provedor'] === provedor ? user
    : q['whatsappBusiness.phoneNumberId'] === '5511999990000' ? user : null);
  Card.findOne = async () => null;
  Column.findOne = () => ({ sort: async () => ({ _id: 'col1' }) });
  Card.create = async (d) => { const c = { _id: 'card1', ...d }; registro.cards.push(c); return c; };
  Card.findByIdAndUpdate = async () => {};
  Message.create = async (d) => { registro.mensagens.push(d); return d; };
  Message.updateOne = async (f, u) => { registro.atualizacoes.push({ f, u }); };
  Message.findOne = () => Object.assign(Promise.resolve(null), { sort: async () => null });
  Message.find = () => ({ sort: () => ({ limit: async () => [] }) });
  return registro;
}

const esperar = (ms = 80) => new Promise((r) => setTimeout(r, ms));

test('webhook YCloud: assinatura, mensagem recebida e status', async () => {
  const reg = preparar('ycloud');
  const { server, base } = await subir();
  try {
    const corpo = JSON.stringify({
      id: 'evt1', type: 'whatsapp.inbound_message.received', apiVersion: 'v2',
      whatsappInboundMessage: { wamid: 'wamid.1', from: '+5515988053447', to: '+5511999990000', type: 'text', text: { body: 'Oi!' }, customerProfile: { name: 'Maria' }, sendTime: new Date().toISOString() },
    });
    const t = Math.floor(Date.now() / 1000);
    const sig = (c, s = 'whsec_t') => `t=${t},s=` + crypto.createHmac('sha256', s).update(`${t}.${c}`).digest('hex');
    const url = `${base}/ycloud-webhook/${TOKEN_URL}`;
    const post = (u, c, h) => fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/json', ...h }, body: c });

    assert.strictEqual((await post(url, corpo, { 'YCloud-Signature': sig(corpo, 'errado') })).status, 403);
    assert.strictEqual((await post(url, corpo, {})).status, 403);
    assert.strictEqual((await post(`${base}/ycloud-webhook/${'z'.repeat(32)}`, corpo, { 'YCloud-Signature': sig(corpo) })).status, 403);
    assert.strictEqual(reg.mensagens.length, 0);

    assert.strictEqual((await post(url, corpo, { 'YCloud-Signature': sig(corpo) })).status, 200);
    await esperar();
    assert.strictEqual(reg.cards[0].cliente, 'Maria');
    assert.strictEqual(reg.cards[0].telefone, '5515988053447');
    assert.strictEqual(reg.mensagens[0].direction, 'in');
    assert.strictEqual(reg.mensagens[0].texto, 'Oi!');
    assert.strictEqual(reg.mensagens[0].whatsappMessageId, 'wamid.1');

    const st = JSON.stringify({ type: 'whatsapp.message.updated', whatsappMessage: { id: 'yc1', wamid: 'wamid.2', status: 'read' } });
    assert.strictEqual((await post(url, st, { 'YCloud-Signature': sig(st) })).status, 200);
    await esperar();
    assert.deepStrictEqual(reg.atualizacoes[0].f, { whatsappMessageId: { $in: ['wamid.2', 'yc1'] } });
    assert.deepStrictEqual(reg.atualizacoes[0].u, { status: 'read' });
  } finally { server.close(); }
});

test('webhook Twilio: assinatura, mensagem recebida e status', async () => {
  const reg = preparar('twilio');
  const { server, base } = await subir();
  try {
    const caminho = `/api/whatsapp/twilio-webhook/${TOKEN_URL}`;
    const urlAssinada = `https://painel.exemplo.com${caminho}`;
    const assinar = (p, tok = 'AUTHTOK') => {
      let d = urlAssinada;
      for (const k of Object.keys(p).sort()) d += k + p[k];
      return crypto.createHmac('sha1', tok).update(d).digest('base64');
    };
    const post = (p, h) => fetch(`${base}/twilio-webhook/${TOKEN_URL}`, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...h }, body: new URLSearchParams(p).toString(),
    });
    const p1 = { From: 'whatsapp:+5515988053447', To: 'whatsapp:+5511999990000', Body: 'Quero simular', MessageSid: 'SM1', ProfileName: 'João', NumMedia: '0', SmsStatus: 'received' };

    assert.strictEqual((await post(p1, { 'X-Twilio-Signature': assinar(p1, 'errado') })).status, 403);
    assert.strictEqual((await post(p1, {})).status, 403);
    assert.strictEqual(reg.mensagens.length, 0);

    const r = await post(p1, { 'X-Twilio-Signature': assinar(p1) });
    assert.strictEqual(r.status, 200);
    assert.match(await r.text(), /<Response>/);
    await esperar();
    assert.strictEqual(reg.cards[0].cliente, 'João');
    assert.strictEqual(reg.mensagens[0].texto, 'Quero simular');
    assert.strictEqual(reg.mensagens[0].whatsappMessageId, 'SM1');

    const p2 = { MessageSid: 'SM9', MessageStatus: 'delivered', To: 'whatsapp:+5515988053447' };
    assert.strictEqual((await post(p2, { 'X-Twilio-Signature': assinar(p2) })).status, 200);
    await esperar();
    assert.deepStrictEqual(reg.atualizacoes[0].f, { whatsappMessageId: { $in: ['SM9'] } });
    assert.deepStrictEqual(reg.atualizacoes[0].u, { status: 'delivered' });
  } finally { server.close(); }
});

test('mensagem repetida (reenvio do provedor) não duplica', async () => {
  const reg = preparar('twilio');
  Message.findOne = (q) => Object.assign(Promise.resolve(q && q.whatsappMessageId === 'SMdup' ? { _id: 'ja' } : null), { sort: async () => null });
  const { server, base } = await subir();
  try {
    const caminho = `/api/whatsapp/twilio-webhook/${TOKEN_URL}`;
    const p = { From: 'whatsapp:+5515988053447', Body: 'oi', MessageSid: 'SMdup', NumMedia: '0', SmsStatus: 'received' };
    let d = `https://painel.exemplo.com${caminho}`;
    for (const k of Object.keys(p).sort()) d += k + p[k];
    const sig = crypto.createHmac('sha1', 'AUTHTOK').update(d).digest('base64');
    await fetch(`${base}/twilio-webhook/${TOKEN_URL}`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Twilio-Signature': sig }, body: new URLSearchParams(p).toString() });
    await esperar();
    assert.strictEqual(reg.mensagens.length, 0);
  } finally { server.close(); }
});
