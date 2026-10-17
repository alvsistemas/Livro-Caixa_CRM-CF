const crypto = require('crypto');

// Integração com a YCloud (provedor oficial do WhatsApp Business, parceiro da Meta).
// Tudo aqui é independente da Meta: o caminho da Meta continua em whatsappEnvio.js / whatsapp.js.
// Documentação: https://docs.ycloud.com

const YCLOUD_API = process.env.YCLOUD_API_URL || 'https://api.ycloud.com/v2';

// Só dígitos -> "+5515988053447" (formato que a YCloud espera em from/to)
function paraE164(numero) {
  const digitos = String(numero || '').replace(/\D/g, '');
  return digitos ? '+' + digitos : '';
}

// A YCloud assina cada webhook no cabeçalho "YCloud-Signature": "t=<timestamp>,s=<hmac>",
// onde hmac = HMAC-SHA256(secret, `${t}.${corpoCru}`) em hexadecimal. O corpo precisa ser o cru
// (bytes originais), nunca o JSON re-serializado. Rejeita eventos velhos demais (anti-replay).
function assinaturaYcloudValida(corpoCru, cabecalho, secret, opcoes = {}) {
  return motivoAssinaturaYcloud(corpoCru, cabecalho, secret, opcoes) === 'ok';
}

// Chaves possíveis a partir do secret que a YCloud mostra ("whsec_..."): o texto inteiro, sem o
// prefixo, e (como em outros serviços de webhook) o trecho depois do prefixo lido como base64.
// Todas derivam do mesmo secret, então aceitar qualquer uma não enfraquece a conferência.
function chavesDoSecret(secret) {
  const s = String(secret || '').trim();
  const chaves = [s];
  const semPrefixo = s.replace(/^whsec_/, '');
  if (semPrefixo !== s) {
    chaves.push(semPrefixo);
    try { const b = Buffer.from(semPrefixo, 'base64'); if (b.length) chaves.push(b); } catch (e) { /* ignora */ }
  }
  return chaves;
}

// Devolve 'ok' ou o motivo da recusa (usado nos logs, pra dar pra diagnosticar sem ver o secret).
function motivoAssinaturaYcloud(corpoCru, cabecalho, secret, opcoes = {}) {
  const toleranciaSeg = opcoes.toleranciaSeg || 300;
  const agoraSeg = opcoes.agoraSeg || Math.floor(Date.now() / 1000);
  if (!secret) return 'secret_nao_configurado';
  if (!cabecalho) return 'sem_cabecalho_de_assinatura';
  if (!corpoCru) return 'sem_corpo_cru';
  const partes = {};
  for (const p of String(cabecalho).split(',')) {
    const i = p.indexOf('=');
    if (i > 0) partes[p.slice(0, i).trim()] = p.slice(i + 1).trim();
  }
  if (!partes.t || !partes.s) return 'cabecalho_mal_formado';
  const bruto = Buffer.isBuffer(corpoCru) ? corpoCru.toString('utf8') : String(corpoCru);
  const b = Buffer.from(partes.s);
  let confere = false;
  for (const chave of chavesDoSecret(secret)) {
    const esperado = crypto.createHmac('sha256', chave).update(`${partes.t}.${bruto}`).digest('hex');
    const a = Buffer.from(esperado);
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) { confere = true; break; }
  }
  if (!confere) return 'assinatura_diferente';
  let t = Number(partes.t);
  if (!Number.isFinite(t)) return 'cabecalho_mal_formado';
  if (t > 1e12) t = Math.floor(t / 1000); // veio em milissegundos
  if (Math.abs(agoraSeg - t) > toleranciaSeg) return 'evento_antigo_demais';
  return 'ok';
}

const TIPOS_MIDIA = ['image', 'audio', 'document', 'video'];

// Converte um evento da YCloud para o mesmo formato "value" que o painel já entende da Meta
// (metadata / contacts / messages / statuses). Assim a lógica de criar lead, salvar mensagem,
// menu de triagem e agente de IA é uma só para os dois provedores.
// numeroConta = número do WhatsApp conectado deste usuário (só dígitos), usado como identificador.
function normalizarEventoYcloud(evento, numeroConta) {
  if (!evento || typeof evento !== 'object') return null;
  const metadata = { phone_number_id: numeroConta };

  if (evento.type === 'whatsapp.inbound_message.received' && evento.whatsappInboundMessage) {
    const m = evento.whatsappInboundMessage;
    const msg = {
      from: String(m.from || '').replace(/\D/g, ''),
      id: m.wamid || m.id,
      type: m.type,
      timestamp: m.sendTime ? String(Math.floor(new Date(m.sendTime).getTime() / 1000)) : undefined,
    };
    if (m.type === 'text' && m.text) msg.text = { body: m.text.body };
    if (TIPOS_MIDIA.includes(m.type) && m[m.type]) {
      const mi = m[m.type];
      msg[m.type] = { id: mi.id, link: mi.link, caption: mi.caption, filename: mi.filename, mime_type: mi.mime_type };
    }
    const nome = m.customerProfile && m.customerProfile.name;
    return {
      metadata,
      contacts: nome ? [{ profile: { name: nome } }] : [],
      messages: [msg],
      statuses: [],
    };
  }

  if (evento.type === 'whatsapp.message.updated' && evento.whatsappMessage) {
    const m = evento.whatsappMessage;
    const mapa = { sent: 'sent', delivered: 'delivered', read: 'read', failed: 'failed' };
    const status = mapa[m.status];
    if (!status) return { metadata, contacts: [], messages: [], statuses: [] }; // accepted etc.: ignora
    return {
      metadata,
      contacts: [],
      messages: [],
      // a YCloud guarda o id dela (m.id) e o do WhatsApp (m.wamid): aceitamos os dois
      statuses: [{ id: m.wamid || m.id, ids: [m.wamid, m.id].filter(Boolean), status }],
    };
  }

  // Mensagem que VOCÊ mandou pelo app WhatsApp Business (celular) num número em modo "coexistência":
  // a YCloud avisa com um "eco". Vira uma mensagem enviada (direction 'out') no card do cliente.
  const TIPOS_ECO = ['whatsapp.smb.message.echoes', 'whatsapp.smb.message.created', 'whatsapp.echo_message.created'];
  if (TIPOS_ECO.includes(evento.type) && evento.whatsappMessage) {
    const m = evento.whatsappMessage;
    const rotulos = { image: '📷 Foto', audio: '🎤 Áudio', document: '📄 Documento', video: '🎥 Vídeo', sticker: 'Figurinha' };
    const texto = m.type === 'text' && m.text ? m.text.body : ((m[m.type] && m[m.type].caption) || rotulos[m.type] || '[mensagem em formato não suportado]');
    return {
      metadata,
      contacts: [],
      messages: [],
      statuses: [],
      ecos: [{
        to: String(m.to || '').replace(/\D/g, ''),
        id: m.wamid || m.id,
        ids: [m.wamid, m.id].filter(Boolean),
        texto,
        timestamp: m.sendTime ? String(Math.floor(new Date(m.sendTime).getTime() / 1000)) : undefined,
      }],
    };
  }

  // Histórico de conversas antigas, enviado quando o número é conectado em coexistência.
  // Cada evento traz uma mensagem (recebida ou enviada) ou só o andamento da sincronização.
  if (evento.type === 'whatsapp.smb.history') {
    const vazio = { metadata, contacts: [], messages: [], statuses: [] };
    const rotulos = { image: '📷 Foto', audio: '🎤 Áudio', document: '📄 Documento', video: '🎥 Vídeo', sticker: 'Figurinha' };
    const dados = evento.whatsappInboundMessage || evento.whatsappMessage;
    if (!dados) return vazio; // só andamento (phase/progress)
    const recebida = !!evento.whatsappInboundMessage;
    const texto = dados.type === 'text' && dados.text ? dados.text.body : ((dados[dados.type] && dados[dados.type].caption) || rotulos[dados.type] || '[mensagem em formato não suportado]');
    return {
      ...vazio,
      historico: [{
        direcao: recebida ? 'in' : 'out',
        telefone: String(recebida ? dados.from : dados.to || '').replace(/\D/g, ''),
        id: dados.wamid || dados.id,
        ids: [dados.wamid, dados.id].filter(Boolean),
        texto,
        timestamp: dados.sendTime ? String(Math.floor(new Date(dados.sendTime).getTime() / 1000)) : undefined,
      }],
    };
  }

  // Avisos sobre a conta/número/templates: viram alertas (notificação) pro usuário.
  const alerta = montarAlertaYcloud(evento);
  if (alerta) return { metadata, contacts: [], messages: [], statuses: [], alertas: [alerta] };
  return null;
}

// Transforma eventos de conta, número e templates da YCloud num aviso curto em português.
function montarAlertaYcloud(evento) {
  if (!evento || typeof evento !== 'object') return null;
  if (evento.type === 'whatsapp.template.reviewed' && evento.whatsappTemplate) {
    const t = evento.whatsappTemplate;
    const nomes = { APPROVED: 'aprovado ✅', REJECTED: 'rejeitado ❌', PAUSED: 'pausado ⚠️', DISABLED: 'desativado ⚠️', ARCHIVED: 'arquivado', IN_APPEAL: 'em recurso' };
    const status = String(t.status || '').toUpperCase();
    return { titulo: 'WhatsApp · Template', corpo: `O template "${t.name || '?'}" foi ${nomes[status] || `atualizado (${status || 'sem status'})`}.`, tag: `wa-template-${t.id || t.name}` };
  }
  if (evento.type === 'whatsapp.phone_number.quality_updated' && evento.whatsappPhoneNumber) {
    const n = evento.whatsappPhoneNumber;
    const cores = { GREEN: 'alta (verde)', YELLOW: 'média (amarelo) ⚠️', RED: 'baixa (vermelho) 🚨' };
    const q = String(n.qualityRating || '').toUpperCase();
    const partes = [`Qualidade do número ${n.displayPhoneNumber || ''}: ${cores[q] || q || 'atualizada'}.`.replace('  ', ' ')];
    if (n.messagingLimit) partes.push(`Limite de envio: ${n.messagingLimit}.`);
    return { titulo: 'WhatsApp · Qualidade do número', corpo: partes.join(' '), tag: 'wa-qualidade' };
  }
  if (evento.type === 'whatsapp.business_account.updated' && evento.whatsappBusinessAccount) {
    const c = evento.whatsappBusinessAccount;
    const restricoes = (c.restrictions || []).map((r) => r.restrictionType).filter(Boolean).join(', ');
    const corpo = c.updateEvent === 'ACCOUNT_RESTRICTION'
      ? `Sua conta do WhatsApp recebeu uma restrição${restricoes ? ` (${restricoes})` : ''}. Veja o painel da YCloud/Meta.`
      : `Sua conta do WhatsApp foi atualizada${c.updateEvent ? ` (${c.updateEvent})` : ''}.`;
    return { titulo: 'WhatsApp · Conta', corpo, tag: 'wa-conta' };
  }
  if (evento.type === 'whatsapp.business_account.reviewed' && evento.whatsappBusinessAccount) {
    const c = evento.whatsappBusinessAccount;
    const detalhe = c.reviewStatus || c.status || c.accountReviewStatus || '';
    return { titulo: 'WhatsApp · Análise da conta', corpo: `A Meta analisou sua conta do WhatsApp${detalhe ? ` (resultado: ${detalhe})` : ''}. Veja o painel da YCloud para os detalhes.`, tag: 'wa-conta-analise' };
  }
  return null;
}

async function chamarYcloud(apiKey, corpo) {
  const resp = await fetch(`${YCLOUD_API}/whatsapp/messages/sendDirectly`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
    body: JSON.stringify(corpo),
  });
  let data = {};
  try { data = await resp.json(); } catch (e) { /* corpo vazio */ }
  if (!resp.ok) {
    const msg = (data.error && (data.error.message || data.error.code)) || data.message || 'Erro ao enviar pela YCloud.';
    throw new Error(msg);
  }
  // devolve no mesmo formato da Meta ({ messages: [{ id }] }) pra quem chama não precisar mudar
  return { messages: [{ id: data.wamid || data.id }], bruto: data };
}

async function enviarTextoYcloud(user, card, texto) {
  const wb = user.whatsappBusiness;
  return chamarYcloud(wb.accessToken, {
    from: paraE164(wb.phoneNumberId),
    to: paraE164(card.telefoneNormalizado),
    type: 'text',
    text: { body: texto },
  });
}

async function enviarTemplateYcloud(user, card, nome, idioma, variaveis) {
  const wb = user.whatsappBusiness;
  const template = { name: nome, language: { code: idioma || 'pt_BR' } };
  if (Array.isArray(variaveis) && variaveis.length) {
    template.components = [{ type: 'body', parameters: variaveis.map((v) => ({ type: 'text', text: String(v) })) }];
  }
  return chamarYcloud(wb.accessToken, {
    from: paraE164(wb.phoneNumberId),
    to: paraE164(card.telefoneNormalizado),
    type: 'template',
    template,
  });
}

module.exports = {
  YCLOUD_API,
  paraE164,
  assinaturaYcloudValida,
  motivoAssinaturaYcloud,
  normalizarEventoYcloud,
  enviarTextoYcloud,
  enviarTemplateYcloud,
};
