const crypto = require('crypto');

// Integração com o WhatsApp da Twilio. Independente da Meta e da YCloud.
// Documentação: https://www.twilio.com/docs/whatsapp

const TWILIO_API = process.env.TWILIO_API_URL || 'https://api.twilio.com/2010-04-01';

const paraWhatsapp = (numero) => {
  const d = String(numero || '').replace(/\D/g, '');
  return d ? `whatsapp:+${d}` : '';
};

// A Twilio assina cada webhook no cabeçalho X-Twilio-Signature:
// base64( HMAC-SHA1( AuthToken, URL_completa + cada_parametro_ordenado(nome+valor) ) ).
// A URL tem que ser exatamente a cadastrada na Twilio (https, sem trocar nada).
function assinaturaTwilioValida(url, params, authToken, cabecalho) {
  if (!url || !authToken || !cabecalho) return false;
  const chaves = Object.keys(params || {}).sort();
  let dados = url;
  for (const k of chaves) dados += k + (params[k] == null ? '' : String(params[k]));
  const esperado = crypto.createHmac('sha1', authToken).update(Buffer.from(dados, 'utf8')).digest('base64');
  const a = Buffer.from(esperado);
  const b = Buffer.from(String(cabecalho));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function tipoPorMime(mime) {
  const m = String(mime || '').toLowerCase();
  if (m.startsWith('image/')) return 'image';
  if (m.startsWith('audio/')) return 'audio';
  if (m.startsWith('video/')) return 'video';
  return 'document';
}

// Converte o POST da Twilio para o formato "value" que o painel já entende da Meta
// (metadata / contacts / messages / statuses), pra reaproveitar toda a lógica de leads,
// menu de triagem e agente de IA. Mensagem recebida e status de entrega chegam no mesmo endereço.
function normalizarEventoTwilio(p, numeroConta) {
  if (!p || typeof p !== 'object') return null;
  const metadata = { phone_number_id: numeroConta };

  if (p.MessageStatus && !p.Body && p.SmsStatus !== 'received') {
    const mapa = { sent: 'sent', delivered: 'delivered', read: 'read', failed: 'failed', undelivered: 'failed' };
    const status = mapa[p.MessageStatus];
    return {
      metadata, contacts: [], messages: [],
      statuses: status ? [{ id: p.MessageSid || p.SmsSid, status }] : [],
    };
  }

  if (p.From && (p.Body !== undefined || Number(p.NumMedia) > 0)) {
    const msg = {
      from: String(p.From).replace(/\D/g, ''),
      id: p.MessageSid || p.SmsMessageSid,
      timestamp: String(Math.floor(Date.now() / 1000)),
    };
    const nMidia = Number(p.NumMedia) || 0;
    if (nMidia > 0 && p.MediaUrl0) {
      const tipo = tipoPorMime(p.MediaContentType0);
      msg.type = tipo;
      msg[tipo] = { link: p.MediaUrl0, caption: p.Body || undefined, mime_type: p.MediaContentType0 };
    } else {
      msg.type = 'text';
      msg.text = { body: p.Body || '' };
    }
    return {
      metadata,
      contacts: p.ProfileName ? [{ profile: { name: p.ProfileName } }] : [],
      messages: [msg],
      statuses: [],
    };
  }
  return null;
}

function cabecalhoBasic(sid, token) {
  return 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64');
}

async function chamarTwilio(user, campos) {
  const wb = user.whatsappBusiness;
  const base = String(process.env.APP_URL || '').replace(/\/$/, '');
  const form = new URLSearchParams({ From: paraWhatsapp(wb.phoneNumberId), ...campos });
  if (base && wb.webhookToken) form.set('StatusCallback', `${base}/api/whatsapp/twilio-webhook/${wb.webhookToken}`);
  const resp = await fetch(`${TWILIO_API}/Accounts/${wb.accountSid}/Messages.json`, {
    method: 'POST',
    headers: { Authorization: cabecalhoBasic(wb.accountSid, wb.accessToken), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });
  let data = {};
  try { data = await resp.json(); } catch (e) { /* corpo vazio */ }
  if (!resp.ok) throw new Error(data.message || 'Erro ao enviar pela Twilio.');
  return { messages: [{ id: data.sid }], bruto: data };
}

async function enviarTextoTwilio(user, card, texto) {
  return chamarTwilio(user, { To: paraWhatsapp(card.telefoneNormalizado), Body: texto });
}

// Na Twilio os modelos são identificados pelo Content SID (começa com "HX"), criado no console deles.
// As variáveis vão numeradas: {"1": "...", "2": "..."}.
async function enviarTemplateTwilio(user, card, contentSid, _idioma, variaveis) {
  const campos = { To: paraWhatsapp(card.telefoneNormalizado), ContentSid: contentSid };
  if (Array.isArray(variaveis) && variaveis.length) {
    const vars = {};
    variaveis.forEach((v, i) => { vars[String(i + 1)] = String(v); });
    campos.ContentVariables = JSON.stringify(vars);
  }
  return chamarTwilio(user, campos);
}

module.exports = {
  TWILIO_API, paraWhatsapp, assinaturaTwilioValida, normalizarEventoTwilio,
  cabecalhoBasic, enviarTextoTwilio, enviarTemplateTwilio,
};
