const { GRAPH_API } = require('./meta');
const { enviarTextoYcloud, enviarTemplateYcloud } = require('./whatsappYcloud');
const { enviarTextoTwilio, enviarTemplateTwilio } = require('./whatsappTwilio');

// Ponto único de envio do WhatsApp. Cada usuário tem um provedor: 'meta' (padrão, como sempre foi)
// 'ycloud' ou 'twilio'. Quem chama recebe sempre { messages: [{ id }] }, independente do provedor.
function provedorDe(user) {
  const p = user && user.whatsappBusiness && user.whatsappBusiness.provedor;
  return p === 'ycloud' || p === 'twilio' ? p : 'meta';
}

async function enviarTexto(user, card, texto) {
  if (provedorDe(user) === 'ycloud') return enviarTextoYcloud(user, card, texto);
  if (provedorDe(user) === 'twilio') return enviarTextoTwilio(user, card, texto);
  const resp = await fetch(`${GRAPH_API}/${user.whatsappBusiness.phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${user.whatsappBusiness.accessToken}`,
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: card.telefoneNormalizado,
      type: 'text',
      text: { body: texto },
    }),
  });
  const data = await resp.json();
  if (!resp.ok) {
    throw new Error((data.error && data.error.message) || 'Erro ao enviar mensagem pelo WhatsApp.');
  }
  return data;
}

async function enviarTemplate(user, card, nomeTemplate, idioma, variaveis) {
  if (provedorDe(user) === 'ycloud') return enviarTemplateYcloud(user, card, nomeTemplate, idioma, variaveis);
  if (provedorDe(user) === 'twilio') return enviarTemplateTwilio(user, card, nomeTemplate, idioma, variaveis);
  const components = [];
  if (Array.isArray(variaveis) && variaveis.length) {
    components.push({
      type: 'body',
      parameters: variaveis.map((v) => ({ type: 'text', text: String(v) })),
    });
  }
  const resp = await fetch(`${GRAPH_API}/${user.whatsappBusiness.phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${user.whatsappBusiness.accessToken}`,
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: card.telefoneNormalizado,
      type: 'template',
      template: {
        name: nomeTemplate,
        language: { code: idioma || 'pt_BR' },
        ...(components.length ? { components } : {}),
      },
    }),
  });
  const data = await resp.json();
  if (!resp.ok) {
    throw new Error((data.error && data.error.message) || 'Erro ao enviar o modelo de mensagem.');
  }
  return data;
}

module.exports = { provedorDe, enviarTexto, enviarTemplate };
