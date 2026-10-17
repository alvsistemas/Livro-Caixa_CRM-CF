const { definirModelo } = require('../db/modelo');
const { jsonPadrao, str } = require('./_comum');
module.exports = definirModelo('EventoGoogleExtra', {
  tabela: 'eventos_google_extra',
  campos: {
    userId: { type: 'id', ref: 'User', required: true },
    eventId: { type: 'string', required: true }, // ID do evento no Google Agenda
    prioridade: { type: 'string', enum: ['baixa', 'media', 'alta'], default: 'media' },
    leadId: { type: 'id', ref: 'Card', default: null },
    concluida: { type: 'boolean', default: false },
  },
  transformJSON: jsonPadrao((ret) => {
    ret.leadId = ret.leadId && typeof ret.leadId === 'object' ? ret.leadId : str(ret.leadId);
  }),
});
