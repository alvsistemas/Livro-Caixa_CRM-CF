const { definirModelo } = require('../db/modelo');
const { jsonPadrao, str } = require('./_comum');
module.exports = definirModelo('Automacao', {
  tabela: 'automacoes',
  campos: {
    userId: { type: 'id', ref: 'User', required: true },
    nome: { type: 'string', required: true, trim: true },
    colunaGatilhoId: { type: 'id', ref: 'Column', required: true },
    // 'entrada_coluna' -> dispara quando o cliente entra na coluna
    // 'tempo_parado'   -> dispara quando o cliente fica X dias parado na coluna
    gatilhoTipo: { type: 'string', enum: ['entrada_coluna', 'tempo_parado'], default: 'entrada_coluna' },
    acaoTipo: { type: 'string', enum: ['criar_tarefa', 'mover_coluna'], required: true },
    acaoParams: { type: 'json', default: () => ({}) },
    ativa: { type: 'boolean', default: true },
  },
  transformJSON: jsonPadrao((ret) => {
    ret.colunaGatilhoId = str(ret.colunaGatilhoId);
    if (ret.acaoParams && ret.acaoParams.colunaDestinoId) ret.acaoParams.colunaDestinoId = String(ret.acaoParams.colunaDestinoId);
  }),
});
