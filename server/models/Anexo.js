const { definirModelo } = require('../db/modelo');
const { jsonPadrao, str } = require('./_comum');
module.exports = definirModelo('Anexo', {
  tabela: 'anexos',
  campos: {
    userId: { type: 'id', ref: 'User', required: true },
    cardId: { type: 'id', ref: 'Card', required: true },
    nomeArquivo: { type: 'string', required: true },
    tipoMime: { type: 'string', default: 'application/octet-stream' },
    dadosBase64: { type: 'string', required: true }, // arquivo inteiro, já em base64 (data URL)
    tamanho: { type: 'int', default: 0 }, // em bytes
  },
  transformJSON: jsonPadrao((ret) => {
    ret.cardId = str(ret.cardId);
  }),
});
