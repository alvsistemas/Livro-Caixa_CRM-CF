const { definirModelo } = require('../db/modelo');
const { jsonPadrao } = require('./_comum');
module.exports = definirModelo('AuditLog', {
  tabela: 'auditoria',
  campos: {
    userId: { type: 'id', ref: 'User', required: true },
    acao: { type: 'string', required: true }, // código curto: login, card_excluido, membro_removido...
    detalhe: { type: 'string', default: '' }, // texto legível
  },
  transformJSON: jsonPadrao((ret) => {
    delete ret.userId;
  }),
});
