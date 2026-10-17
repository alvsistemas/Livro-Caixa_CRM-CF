const { definirModelo } = require('../db/modelo');
const { jsonPadrao } = require('./_comum');
module.exports = definirModelo('PossivelLead', {
  tabela: 'possiveis_leads',
  campos: {
    userId: { type: 'id', ref: 'User', required: true },
    nome: { type: 'string', default: '' },
    telefone: { type: 'string', default: '' },
    tipoServico: { type: 'string', default: '' },
    origemArquivo: { type: 'string', default: '' }, // nome do arquivo importado
  },
  transformJSON: jsonPadrao(),
});
