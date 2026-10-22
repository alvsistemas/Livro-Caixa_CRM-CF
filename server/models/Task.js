const { definirModelo } = require('../db/modelo');
const { jsonPadrao, str } = require('./_comum');
module.exports = definirModelo('Task', {
  tabela: 'tarefas',
  campos: {
    userId: { type: 'id', ref: 'User', required: true },
    titulo: { type: 'string', required: true, trim: true },
    vencimento: { type: 'date', default: null },
    prioridade: { type: 'string', enum: ['baixa', 'media', 'alta'], default: 'media' },
    leadId: { type: 'id', ref: 'Card', default: null },
    descricao: { type: 'string', default: '' },
    concluida: { type: 'boolean', default: false },
    googleEventId: { type: 'string', default: null },
    lembretePushEnviado: { type: 'boolean', default: false }, // já avisamos por notificação push
    lembreteEmailEnviado: { type: 'boolean', default: false }, // já avisamos por e-mail
  },
  transformJSON: jsonPadrao((ret) => {
    ret.leadId = ret.leadId && typeof ret.leadId === 'object' ? ret.leadId : str(ret.leadId);
  }),
});
