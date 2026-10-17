const { definirModelo } = require('../db/modelo');
const { jsonPadrao, str } = require('./_comum');
module.exports = definirModelo('Column', {
  tabela: 'colunas',
  campos: {
    userId: { type: 'id', ref: 'User', required: true },
    funilId: { type: 'id', ref: 'Funil', default: null },
    nome: { type: 'string', required: true, trim: true },
    tipo: { type: 'string', enum: ['aberto', 'ganho', 'perdido'], default: 'aberto' },
    probabilidade: { type: 'number', default: 50, min: 0, max: 100 }, // % de chance de fechar (valor ponderado)
    ordem: { type: 'number', default: 0 },
  },
  transformJSON: jsonPadrao((ret) => {
    ret.funilId = str(ret.funilId);
  }),
});
