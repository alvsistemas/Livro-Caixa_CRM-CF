const { definirModelo } = require('../db/modelo');

// Cada aparelho em que a pessoa ativou as notificações (pode ter várias: celular, notebook...)
module.exports = definirModelo('PushSubscription', {
  tabela: 'inscricoes_push',
  campos: {
    userId: { type: 'id', ref: 'User', required: true },
    endpoint: { type: 'string', required: true },
    keys: {
      type: 'group',
      campos: {
        p256dh: { type: 'string', required: true },
        auth: { type: 'string', required: true },
      },
    },
    userAgent: { type: 'string', default: '' },
  },
});
