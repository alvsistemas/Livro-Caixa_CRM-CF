const { definirModelo } = require('../db/modelo');
const { jsonPadrao, str } = require('./_comum');
module.exports = definirModelo('MensagemAgendada', {
  tabela: 'mensagens_agendadas',
  campos: {
    userId: { type: 'id', ref: 'User', required: true },
    cardId: { type: 'id', ref: 'Card', required: true },
    texto: { type: 'string', required: true, trim: true },
    agendadoPara: { type: 'date', required: true },
    status: { type: 'string', enum: ['pendente', 'enviada', 'cancelada', 'falhou'], default: 'pendente' },
    erro: { type: 'string', default: null },
  },
  transformJSON: jsonPadrao((ret) => {
    ret.cardId = str(ret.cardId);
  }),
});
