const { definirModelo } = require('../db/modelo');
const { jsonPadrao } = require('./_comum');
module.exports = definirModelo('CampoPersonalizado', {
  tabela: 'campos_personalizados',
  campos: {
    userId: { type: 'id', ref: 'User', required: true },
    nome: { type: 'string', required: true, trim: true },
    tipo: { type: 'string', enum: ['texto', 'numero', 'data'], default: 'texto' },
    ordem: { type: 'number', default: 0 },
  },
  transformJSON: jsonPadrao(),
});
