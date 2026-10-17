const test = require('node:test');
const assert = require('node:assert');
const email = require('../utils/email');

const CHAVES = ['RESEND_API_KEY', 'EMAIL_FROM', 'APP_URL'];

test('e-mail (Resend)', async (t) => {
  const guardado = {};
  CHAVES.forEach((k) => { guardado[k] = process.env[k]; });
  const fetchOriginal = global.fetch;
  t.after(() => {
    CHAVES.forEach((k) => { if (guardado[k] === undefined) delete process.env[k]; else process.env[k] = guardado[k]; });
    global.fetch = fetchOriginal;
  });

  await t.test('emailConfigurado exige as três variáveis', () => {
    CHAVES.forEach((k) => delete process.env[k]);
    assert.strictEqual(email.emailConfigurado(), false);
    process.env.RESEND_API_KEY = 're_x';
    process.env.EMAIL_FROM = 'Painel <a@b.com>';
    assert.strictEqual(email.emailConfigurado(), false); // falta APP_URL
    process.env.APP_URL = 'https://painel.exemplo.com/';
    assert.strictEqual(email.emailConfigurado(), true);
    assert.strictEqual(email.urlBaseDoApp(), 'https://painel.exemplo.com'); // tira a barra final
  });

  await t.test('enviarEmail chama o Resend com chave, remetente e anexo em base64', async () => {
    process.env.RESEND_API_KEY = 're_abc';
    process.env.EMAIL_FROM = 'Painel <a@b.com>';
    process.env.APP_URL = 'https://painel.exemplo.com';
    let pedido;
    global.fetch = async (url, opts) => { pedido = { url, opts }; return { ok: true, json: async () => ({ id: '1' }) }; };
    await email.enviarEmail({ para: 'x@y.com', assunto: 'Oi', html: '<p>oi</p>', texto: 'oi', anexos: [{ nome: 'b.json', conteudoBase64: 'e30=' }] });
    assert.strictEqual(pedido.url, 'https://api.resend.com/emails');
    assert.strictEqual(pedido.opts.headers.Authorization, 'Bearer re_abc');
    const corpo = JSON.parse(pedido.opts.body);
    assert.deepStrictEqual(corpo.to, ['x@y.com']);
    assert.strictEqual(corpo.from, 'Painel <a@b.com>');
    assert.deepStrictEqual(corpo.attachments, [{ filename: 'b.json', content: 'e30=' }]);
  });

  await t.test('enviarEmail propaga a mensagem de erro do Resend', async () => {
    global.fetch = async () => ({ ok: false, status: 403, json: async () => ({ message: 'domínio não verificado' }) });
    await assert.rejects(() => email.enviarEmail({ para: 'x@y.com', assunto: 'a', html: 'b', texto: 'c' }), /domínio não verificado/);
  });

  await t.test('enviarEmail recusa se não estiver configurado', async () => {
    CHAVES.forEach((k) => delete process.env[k]);
    await assert.rejects(() => email.enviarEmail({ para: 'x@y.com', assunto: 'a', html: 'b', texto: 'c' }), /não está configurado/);
  });

  await t.test('e-mail de recuperação leva o link e escapa HTML no nome', () => {
    const m = email.montarEmailRecuperacao({ nome: '<b>Zé</b>', link: 'https://p.com/login.html?reset=abc', validadeMinutos: 60 });
    assert.ok(m.html.includes('https://p.com/login.html?reset=abc'));
    assert.ok(m.texto.includes('https://p.com/login.html?reset=abc'));
    assert.ok(!m.html.includes('<b>Zé</b>'));
    assert.ok(m.html.includes('&lt;b&gt;'));
    assert.ok(m.html.includes('60 minutos'));
  });

  await t.test('e-mail de backup muda conforme tenha anexo ou seja grande demais', () => {
    const ok = email.montarEmailBackup({ nome: 'Ana', geradoEm: new Date().toISOString(), anexado: true, tamanhoMb: '1.2' });
    const grande = email.montarEmailBackup({ nome: 'Ana', geradoEm: new Date().toISOString(), anexado: false, tamanhoMb: '31.0' });
    assert.ok(ok.assunto.includes('backup semanal'));
    assert.ok(grande.html.includes('31.0 MB'));
  });
});
