const { definirModelo } = require('../db/modelo');
const { jsonPadrao } = require('./_comum');
module.exports = definirModelo('Funil', {
  tabela: 'funis',
  campos: {
    userId: { type: 'id', ref: 'User', required: true },
    nome: { type: 'string', required: true, trim: true },
    ordem: { type: 'number', default: 0 },
  },
  transformJSON: jsonPadrao(),
});
