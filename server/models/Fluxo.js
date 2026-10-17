const { definirModelo } = require('../db/modelo');
const { jsonPadrao, str } = require('./_comum');
const TIPOS_ETAPA = ['mensagem', 'tarefa', 'mover_coluna'];
const validarEtapas = (v) => Array.isArray(v) && v.every((e) => e && Number(e.diasAposInicio) >= 0 && TIPOS_ETAPA.includes(e.tipo));

module.exports = definirModelo('Fluxo', {
  tabela: 'fluxos',
  campos: {
    userId: { type: 'id', ref: 'User', required: true },
    nome: { type: 'string', required: true, trim: true },
    colunaGatilhoId: { type: 'id', ref: 'Column', required: true }, // começa quando o cliente entra nessa coluna
    etapas: { type: 'json', default: () => [], validate: validarEtapas }, // [{ diasAposInicio, tipo, params }]
    ativo: { type: 'boolean', default: true },
  },
  transformJSON: jsonPadrao((ret) => {
    ret.colunaGatilhoId = str(ret.colunaGatilhoId);
    (ret.etapas || []).forEach((e) => { if (e.params && e.params.colunaDestinoId) e.params.colunaDestinoId = String(e.params.colunaDestinoId); });
  }),
});
