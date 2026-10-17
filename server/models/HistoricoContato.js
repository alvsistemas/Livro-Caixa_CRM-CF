const { definirModelo } = require('../db/modelo');
const { jsonPadrao, str } = require('./_comum');
module.exports = definirModelo('HistoricoContato', {
  tabela: 'historico_contato',
  campos: {
    userId: { type: 'id', ref: 'User', required: true },
    cardId: { type: 'id', ref: 'Card', required: true },
    texto: { type: 'string', required: true, trim: true },
  },
  transformJSON: jsonPadrao((ret) => {
    ret.cardId = str(ret.cardId);
  }),
});
