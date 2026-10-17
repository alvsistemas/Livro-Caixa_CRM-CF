const { definirModelo } = require('../db/modelo');
const { jsonPadrao, str } = require('./_comum');
module.exports = definirModelo('FluxoExecucao', {
  tabela: 'fluxo_execucoes',
  campos: {
    userId: { type: 'id', ref: 'User', required: true },
    fluxoId: { type: 'id', ref: 'Fluxo', required: true },
    cardId: { type: 'id', ref: 'Card', required: true },
    etapaAtual: { type: 'int', default: 0 }, // índice da próxima etapa a executar
    iniciadoEm: { type: 'date', default: () => new Date() },
    concluido: { type: 'boolean', default: false },
  },
  transformJSON: jsonPadrao((ret) => {
    ret.fluxoId = str(ret.fluxoId);
    ret.cardId = str(ret.cardId);
  }),
});
