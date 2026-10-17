const { definirModelo } = require('../db/modelo');
const { jsonPadrao, str } = require('./_comum');
module.exports = definirModelo('Contrato', {
  tabela: 'contratos_comissao',
  campos: {
    userId: { type: 'id', ref: 'User', required: true },
    cardId: { type: 'id', ref: 'Card', default: null }, // preenchido quando gerado automaticamente pelo Pipeline
    geradoAutomaticamente: { type: 'boolean', default: false },
    desc: { type: 'string', required: true, trim: true },
    scope: { type: 'string', enum: ['Pessoal', 'Empresa'], default: 'Pessoal' },
    date: { type: 'date', required: true }, // mês da 1ª parcela (dia 1)
    valorVenda: { type: 'money', required: true }, // valor da venda
    tipoProduto: { type: 'string', default: 'padrao', trim: true }, // chave da regra de comissão usada
    regraNome: { type: 'string', default: '' }, // nome da regra quando a comissão foi calculada
    // calculados na criação/edição e guardados — o histórico não muda se a regra mudar depois
    parcelas: { type: 'int', required: true },
    parcelas1: { type: 'int', required: true },
    value: { type: 'money', required: true },
    value2: { type: 'money', required: true },
    blocos: { type: 'json', default: null }, // detalhe completo (N blocos) da regra usada
    canceladoNoMes: { type: 'string', default: null }, // "YYYY-MM": a partir desse mês para de contar
  },
  transformJSON: jsonPadrao((ret) => {
    ret.cardId = str(ret.cardId);
    if (ret.blocos === null) delete ret.blocos;
  }),
});
