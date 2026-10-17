const { definirModelo } = require('../db/modelo');
const { jsonPadrao, str } = require('./_comum');
module.exports = definirModelo('Message', {
  tabela: 'mensagens_whatsapp',
  campos: {
    userId: { type: 'id', ref: 'User', required: true },
    cardId: { type: 'id', ref: 'Card', required: true },
    direction: { type: 'string', enum: ['in', 'out'], required: true }, // in = cliente escreveu, out = nós
    canal: { type: 'string', enum: ['whatsapp', 'instagram'], default: 'whatsapp' },
    texto: { type: 'string', default: '' },
    status: { type: 'string', default: null }, // sent | delivered | read | failed (só pra 'out')
    whatsappMessageId: { type: 'string', default: null },
    instagramMessageId: { type: 'string', default: null },
    timestamp: { type: 'date', default: () => new Date() },
    enviadoPorAgente: { type: 'boolean', default: false }, // respondida pelo agente de IA
    anexoId: { type: 'id', ref: 'Anexo', default: null }, // mídia recebida (foto, áudio, documento)
    midiaTipo: { type: 'string', default: null }, // 'image' | 'audio' | 'document' | 'video'
  },
  transformJSON: jsonPadrao((ret) => {
    ret.cardId = str(ret.cardId);
    ret.anexoId = str(ret.anexoId);
  }),
});
