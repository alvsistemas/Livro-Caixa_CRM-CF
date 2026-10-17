const { definirModelo } = require('../db/modelo');
const { jsonPadrao } = require('./_comum');
const crypto = require('crypto');

const EVENTOS_DISPONIVEIS = ['lead.criado', 'lead.movido', 'lead.ganho', 'mensagem.recebida', 'tarefa.criada'];

module.exports = definirModelo('WebhookSaida', {
  tabela: 'webhooks_saida',
  campos: {
    userId: { type: 'id', ref: 'User', required: true },
    nome: { type: 'string', default: '' }, // ex: "Zapier - novo lead"
    url: { type: 'string', required: true },
    eventos: { type: 'string[]', default: () => [], validate: (arr) => arr.every((e) => EVENTOS_DISPONIVEIS.includes(e)) },
    ativo: { type: 'boolean', default: true },
    secreto: { type: 'string', default: () => crypto.randomBytes(16).toString('hex') }, // vai no header
    ultimoEnvioEm: { type: 'date', default: null },
    ultimoEnvioStatus: { type: 'string', default: null }, // 'ok' | 'erro'
  },
  transformJSON: jsonPadrao(),
});

module.exports.EVENTOS_DISPONIVEIS = EVENTOS_DISPONIVEIS;
