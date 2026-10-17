const { definirModelo } = require('../db/modelo');
const { jsonPadrao, str } = require('./_comum');
module.exports = definirModelo('ErrorLog', {
  tabela: 'erros',
  campos: {
    mensagem: { type: 'string', required: true },
    stack: { type: 'string', default: '' },
    rota: { type: 'string', default: '' }, // ex: "POST /api/cards"
    userId: { type: 'id', ref: 'User', default: null }, // quem estava logado, se souber
    tipo: { type: 'string', enum: ['rota', 'excecao_nao_tratada', 'promise_rejeitada'], default: 'rota' },
  },
  transformJSON: jsonPadrao((ret) => {
    ret.userId = str(ret.userId);
  }),
});
