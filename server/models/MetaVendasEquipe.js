const { definirModelo } = require('../db/modelo');
const { jsonPadrao, str } = require('./_comum');
module.exports = definirModelo('MetaVendasEquipe', {
  tabela: 'metas_vendas_equipe',
  campos: {
    equipeId: { type: 'id', ref: 'Equipe', required: true },
    mes: { type: 'string', required: true }, // "YYYY-MM"
    valorMeta: { type: 'money', default: 0 }, // 0 = sem meta definida
  },
  transformJSON: jsonPadrao((ret) => {
    ret.equipeId = str(ret.equipeId);
  }),
});
