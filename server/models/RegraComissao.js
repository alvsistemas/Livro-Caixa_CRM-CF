const { definirModelo } = require('../db/modelo');
const { jsonPadrao } = require('./_comum');
module.exports = definirModelo('RegraComissao', {
  tabela: 'regras_comissao',
  campos: {
    userId: { type: 'id', ref: 'User', required: true },
    chave: { type: 'string', required: true, trim: true }, // identificador estável (usado como "tipoProduto")
    nome: { type: 'string', required: true, trim: true }, // nome de exibição
    // blocos: [{ parcelas, percentual }] — percentual do valor da venda por parcela (0.05 = 5%)
    blocos: { type: 'json', required: true, validate: (v) => Array.isArray(v) && v.length > 0 && v.every((b) => b && Number(b.parcelas) >= 1 && Number(b.percentual) >= 0) },
    mesIndependente: { type: 'boolean', default: false }, // mês da comissão editável sem mudar o do lead
    base: { type: 'string', enum: ['final', 'negociado'], default: 'final' }, // valor final do fechamento ou valor do card
    padrao: { type: 'boolean', default: false }, // regra que veio pronta do sistema
    ordem: { type: 'number', default: 0 },
  },
  transformJSON: jsonPadrao((ret) => {
    delete ret.userId;
  }),
});
