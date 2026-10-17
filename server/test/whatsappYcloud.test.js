const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const {
  paraE164, assinaturaYcloudValida, normalizarEventoYcloud, enviarTextoYcloud, enviarTemplateYcloud,
} = require('../utils/whatsappYcloud');
const { provedorDe, enviarTexto } = require('../utils/whatsappEnvio');

function assinar(corpo, secret, t) {
  return `t=${t},s=` + crypto.createHmac('sha256', secret).update(`${t}.${corpo}`).digest('hex');
}

test('paraE164 deixa só dígitos com +', () => {
  assert.strictEqual(paraE164('5515988053447'), '+5515988053447');
  assert.strictEqual(paraE164('+55 (15) 98805-3447'), '+5515988053447');
  assert.strictEqual(paraE164(''), '');
});

test('assinatura: válida, adulterada, antiga, sem secret', () => {
  const corpo = '{"id":"evt_1"}';
  const agora = 1800000000;
  const h = assinar(corpo, 'whsec_x', agora);
  assert.ok(assinaturaYcloudValida(Buffer.from(corpo), h, 'whsec_x', { agoraSeg: agora + 10 }));
  assert.ok(!assinaturaYcloudValida(Buffer.from(corpo + ' '), h, 'whsec_x', { agoraSeg: agora }));
  assert.ok(!assinaturaYcloudValida(Buffer.from(corpo), h, 'outro', { agoraSeg: agora }));
  assert.ok(!assinaturaYcloudValida(Buffer.from(corpo), h, 'whsec_x', { agoraSeg: agora + 4000 }));
  assert.ok(!assinaturaYcloudValida(Buffer.from(corpo), h, '', { agoraSeg: agora }));
  assert.ok(!assinaturaYcloudValida(Buffer.from(corpo), 'lixo', 'whsec_x', { agoraSeg: agora }));
  assert.ok(!assinaturaYcloudValida(null, h, 'whsec_x'));
});

test('assinatura aceita timestamp em milissegundos', () => {
  const corpo = '{}';
  const agora = 1800000000;
  const h = assinar(corpo, 's', agora * 1000);
  assert.ok(assinaturaYcloudValida(Buffer.from(corpo), h, 's', { agoraSeg: agora }));
});

test('normaliza mensagem de texto recebida', () => {
  const v = normalizarEventoYcloud({
    type: 'whatsapp.inbound_message.received',
    whatsappInboundMessage: {
      id: 'ycid', wamid: 'wamid.ABC', from: '+55 15 98805-3447', to: '+5511999990000', type: 'text',
      text: { body: 'Oi, quero simular' }, customerProfile: { name: 'Maria' }, sendTime: '2026-10-13T12:00:00.000Z',
    },
  }, '5511999990000');
  assert.strictEqual(v.metadata.phone_number_id, '5511999990000');
  assert.strictEqual(v.messages[0].from, '5515988053447');
  assert.strictEqual(v.messages[0].id, 'wamid.ABC');
  assert.strictEqual(v.messages[0].text.body, 'Oi, quero simular');
  assert.strictEqual(v.contacts[0].profile.name, 'Maria');
  assert.strictEqual(v.messages[0].timestamp, String(Math.floor(Date.parse('2026-10-13T12:00:00.000Z') / 1000)));
});

test('normaliza mídia com link', () => {
  const v = normalizarEventoYcloud({
    type: 'whatsapp.inbound_message.received',
    whatsappInboundMessage: { wamid: 'w', from: '+5515', type: 'image', image: { id: 'm1', link: 'https://x/y.jpg', caption: 'foto', mime_type: 'image/jpeg' } },
  }, '55');
  assert.strictEqual(v.messages[0].image.link, 'https://x/y.jpg');
  assert.strictEqual(v.messages[0].image.caption, 'foto');
});

test('normaliza status e ignora "accepted"', () => {
  const ok = normalizarEventoYcloud({ type: 'whatsapp.message.updated', whatsappMessage: { id: 'yc1', wamid: 'w1', status: 'delivered' } }, '55');
  assert.deepStrictEqual(ok.statuses[0].ids, ['w1', 'yc1']);
  assert.strictEqual(ok.statuses[0].status, 'delivered');
  const ign = normalizarEventoYcloud({ type: 'whatsapp.message.updated', whatsappMessage: { id: 'yc1', status: 'accepted' } }, '55');
  assert.strictEqual(ign.statuses.length, 0);
  assert.strictEqual(normalizarEventoYcloud({ type: 'sms.message.updated' }, '55'), null);
  assert.strictEqual(normalizarEventoYcloud(null, '55'), null);
});

function comFetchFalso(resposta, fn) {
  const original = global.fetch;
  const chamadas = [];
  global.fetch = async (url, opts) => {
    chamadas.push({ url, opts });
    return { ok: resposta.ok !== false, json: async () => resposta.corpo };
  };
  return Promise.resolve(fn(chamadas)).finally(() => { global.fetch = original; });
}

const userYc = { whatsappBusiness: { provedor: 'ycloud', phoneNumberId: '5511999990000', accessToken: 'KEY' } };
const card = { telefoneNormalizado: '5515988053447' };

test('envia texto pela YCloud com X-API-Key e devolve formato compatível', () =>
  comFetchFalso({ corpo: { id: 'yc9', status: 'accepted' } }, async (chamadas) => {
    const r = await enviarTextoYcloud(userYc, card, 'Olá');
    assert.strictEqual(chamadas[0].url, 'https://api.ycloud.com/v2/whatsapp/messages/sendDirectly');
    assert.strictEqual(chamadas[0].opts.headers['X-API-Key'], 'KEY');
    assert.deepStrictEqual(JSON.parse(chamadas[0].opts.body), {
      from: '+5511999990000', to: '+5515988053447', type: 'text', text: { body: 'Olá' },
    });
    assert.strictEqual(r.messages[0].id, 'yc9');
  }));

test('envia modelo pela YCloud com variáveis', () =>
  comFetchFalso({ corpo: { id: 'yc10', wamid: 'wamid.Z' } }, async (chamadas) => {
    const r = await enviarTemplateYcloud(userYc, card, 'lembrete', 'pt_BR', ['Maria', 3]);
    const corpo = JSON.parse(chamadas[0].opts.body);
    assert.strictEqual(corpo.type, 'template');
    assert.strictEqual(corpo.template.name, 'lembrete');
    assert.deepStrictEqual(corpo.template.components[0].parameters, [{ type: 'text', text: 'Maria' }, { type: 'text', text: '3' }]);
    assert.strictEqual(r.messages[0].id, 'wamid.Z');
  }));

test('erro da YCloud vira Error com a mensagem dela', () =>
  comFetchFalso({ ok: false, corpo: { error: { message: 'janela fechada' } } }, async () => {
    await assert.rejects(() => enviarTextoYcloud(userYc, card, 'x'), /janela fechada/);
  }));

test('provedor padrão é Meta e o envio da Meta continua igual', () =>
  comFetchFalso({ corpo: { messages: [{ id: 'wamid.M' }] } }, async (chamadas) => {
    const userMeta = { whatsappBusiness: { phoneNumberId: '123', accessToken: 'TOK' } };
    assert.strictEqual(provedorDe(userMeta), 'meta');
    assert.strictEqual(provedorDe(userYc), 'ycloud');
    const r = await enviarTexto(userMeta, card, 'oi');
    assert.match(chamadas[0].url, /graph\.facebook\.com\/v[\d.]+\/123\/messages$/);
    assert.strictEqual(chamadas[0].opts.headers.Authorization, 'Bearer TOK');
    assert.strictEqual(JSON.parse(chamadas[0].opts.body).messaging_product, 'whatsapp');
    assert.strictEqual(r.messages[0].id, 'wamid.M');
  }));

test('assinatura aceita o secret com prefixo whsec_ lido de formas diferentes e informa o motivo', () => {
  const { motivoAssinaturaYcloud } = require('../utils/whatsappYcloud');
  const corpo = '{"a":1}';
  const t = 1800000000;
  const secret = 'whsec_' + Buffer.from('chave-binaria-123').toString('base64');
  const comChave = (k) => `t=${t},s=` + crypto.createHmac('sha256', k).update(`${t}.${corpo}`).digest('hex');
  const o = { agoraSeg: t };
  assert.strictEqual(motivoAssinaturaYcloud(Buffer.from(corpo), comChave(secret), secret, o), 'ok');
  assert.strictEqual(motivoAssinaturaYcloud(Buffer.from(corpo), comChave(secret.slice(6)), secret, o), 'ok');
  assert.strictEqual(motivoAssinaturaYcloud(Buffer.from(corpo), comChave(Buffer.from('chave-binaria-123')), secret, o), 'ok');
  assert.strictEqual(motivoAssinaturaYcloud(Buffer.from(corpo), comChave('outra'), secret, o), 'assinatura_diferente');
  assert.strictEqual(motivoAssinaturaYcloud(Buffer.from(corpo), '', secret, o), 'sem_cabecalho_de_assinatura');
  assert.strictEqual(motivoAssinaturaYcloud(Buffer.from(corpo), comChave(secret), '', o), 'secret_nao_configurado');
  assert.strictEqual(motivoAssinaturaYcloud(Buffer.from(corpo), comChave(secret), secret, { agoraSeg: t + 9999 }), 'evento_antigo_demais');
});

test('eco de mensagem enviada pelo app do celular vira "eco" normalizado', () => {
  const { normalizarEventoYcloud } = require('../utils/whatsappYcloud');
  const v = normalizarEventoYcloud({
    type: 'whatsapp.smb.message.echoes',
    whatsappMessage: { id: 'y1', wamid: 'w1', from: '+5515988053447', to: '+5515981701736', type: 'text', text: { body: 'Oi, tudo bem?' }, sendTime: '2026-10-15T15:30:00Z' },
  }, '5515988053447');
  assert.equal(v.messages.length, 0);
  assert.equal(v.ecos.length, 1);
  assert.equal(v.ecos[0].to, '5515981701736');
  assert.equal(v.ecos[0].texto, 'Oi, tudo bem?');
  assert.deepEqual(v.ecos[0].ids, ['w1', 'y1']);
});

test('histórico (coexistência) vira lista "historico"; só andamento é ignorado', () => {
  const { normalizarEventoYcloud } = require('../utils/whatsappYcloud');
  const rec = normalizarEventoYcloud({ type: 'whatsapp.smb.history', phase: 1, progress: 40, whatsappInboundMessage: { id: 'a', wamid: 'wa', from: '+5515981701736', to: '+5515988053447', type: 'text', text: { body: 'oi' }, sendTime: '2026-09-01T10:00:00Z' } }, '5515988053447');
  assert.equal(rec.historico[0].direcao, 'in');
  assert.equal(rec.historico[0].telefone, '5515981701736');
  const env = normalizarEventoYcloud({ type: 'whatsapp.smb.history', whatsappMessage: { id: 'b', from: '+5515988053447', to: '+5515981701736', type: 'text', text: { body: 'olá' } } }, '5515988053447');
  assert.equal(env.historico[0].direcao, 'out');
  assert.equal(env.historico[0].telefone, '5515981701736');
  const so = normalizarEventoYcloud({ type: 'whatsapp.smb.history', phase: 1, progress: 10 }, '5515988053447');
  assert.equal((so.historico || []).length, 0);
});

test('eventos de template, qualidade e conta viram alertas em português', () => {
  const { normalizarEventoYcloud } = require('../utils/whatsappYcloud');
  const t = normalizarEventoYcloud({ type: 'whatsapp.template.reviewed', whatsappTemplate: { id: '1', name: 'boas_vindas', status: 'APPROVED' } }, 'x');
  assert.match(t.alertas[0].corpo, /boas_vindas.*aprovado/);
  const q = normalizarEventoYcloud({ type: 'whatsapp.phone_number.quality_updated', whatsappPhoneNumber: { displayPhoneNumber: '+55 15 98805-3447', qualityRating: 'RED', messagingLimit: 'TIER_1K' } }, 'x');
  assert.match(q.alertas[0].corpo, /baixa/);
  const c = normalizarEventoYcloud({ type: 'whatsapp.business_account.updated', whatsappBusinessAccount: { updateEvent: 'ACCOUNT_RESTRICTION', restrictions: [{ restrictionType: 'X' }] } }, 'x');
  assert.match(c.alertas[0].corpo, /restrição/);
  const r = normalizarEventoYcloud({ type: 'whatsapp.business_account.reviewed', whatsappBusinessAccount: { id: '1' } }, 'x');
  assert.match(r.alertas[0].titulo, /Análise/);
});
