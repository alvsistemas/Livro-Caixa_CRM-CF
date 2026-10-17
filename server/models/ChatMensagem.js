const { definirModelo } = require('../db/modelo');
const { jsonPadrao, str } = require('./_comum');
module.exports = definirModelo('ChatMensagem', {
  tabela: 'chat_mensagens',
  campos: {
    equipeId: { type: 'id', ref: 'Equipe', required: true },
    remetenteId: { type: 'id', ref: 'User', required: true },
    remetenteNome: { type: 'string', default: '' }, // guardado aqui pra não precisar buscar a cada leitura
    destinatarioId: { type: 'id', ref: 'User', default: null }, // null = chat da equipe; preenchido = conversa privada
    texto: { type: 'string', required: true, trim: true },
    timestamp: { type: 'date', default: () => new Date() },
  },
  transformJSON: jsonPadrao((ret) => {
    ret.equipeId = str(ret.equipeId);
    ret.remetenteId = str(ret.remetenteId);
    ret.destinatarioId = str(ret.destinatarioId);
  }),
});
