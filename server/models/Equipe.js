const { definirModelo } = require('../db/modelo');
const { jsonPadrao } = require('./_comum');

function gerarCodigo() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

const Equipe = definirModelo('Equipe', {
  tabela: 'equipes',
  campos: {
    nome: { type: 'string', required: true, trim: true },
    donoId: { type: 'id', ref: 'User', required: true },
    codigoConvite: { type: 'string', default: gerarCodigo },
    permissoes: { type: 'json', default: () => ({}) }, // abas e funções dos membros (utils/permissoes.js)
  },
  transformJSON: jsonPadrao((ret) => { ret.donoId = String(ret.donoId); }),
});
Equipe.gerarCodigo = gerarCodigo;

module.exports = Equipe;
