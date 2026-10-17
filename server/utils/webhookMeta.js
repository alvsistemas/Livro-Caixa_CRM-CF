const crypto = require('crypto');

// Confere a assinatura que a Meta manda em todo webhook (cabeçalho X-Hub-Signature-256:
// "sha256=<hmac do corpo cru usando o App Secret>"). Sem essa conferência, qualquer pessoa
// que descobrisse o ID do seu número poderia mandar mensagens/leads falsos pro painel.
function assinaturaValida(corpoCru, cabecalho, appSecret) {
  if (!appSecret || !cabecalho || !corpoCru) return false;
  const esperado = 'sha256=' + crypto.createHmac('sha256', appSecret).update(corpoCru).digest('hex');
  const a = Buffer.from(esperado);
  const b = Buffer.from(String(cabecalho));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

let avisouSemSegredo = false;

// Middleware: só valida se META_APP_SECRET estiver configurada no servidor (é a chave "Segredo
// do app" em developers.facebook.com → seu app → Configurações → Básico). Se não estiver,
// deixa passar como antes (pra não derrubar quem já usa) e avisa uma vez no log.
function exigirAssinaturaMeta(req, res, next) {
  const appSecret = process.env.META_APP_SECRET;
  if (!appSecret) {
    if (!avisouSemSegredo) {
      avisouSemSegredo = true;
      console.warn('[segurança] META_APP_SECRET não configurada: webhooks da Meta estão sendo aceitos SEM conferir a assinatura.');
    }
    return next();
  }
  if (assinaturaValida(req.rawBody, req.get('x-hub-signature-256'), appSecret)) return next();
  return res.sendStatus(403);
}

module.exports = { assinaturaValida, exigirAssinaturaMeta };
