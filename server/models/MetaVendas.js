const { definirModelo } = require('../db/modelo');
const { jsonPadrao } = require('./_comum');
module.exports = definirModelo('MetaVendas', {
  tabela: 'metas_vendas',
  campos: {
    userId: { type: 'id', ref: 'User', required: true },
    mes: { type: 'string', required: true }, // "YYYY-MM"
    valorMeta: { type: 'money', default: 0 },
  },
  transformJSON: jsonPadrao(),
});
