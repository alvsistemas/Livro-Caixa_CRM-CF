const { definirModelo } = require('../db/modelo');
const { jsonPadrao, str } = require('./_comum');
const { normalizarTelefone } = require('../utils/telefone');

module.exports = definirModelo('Card', {
  tabela: 'clientes',
  campos: {
    userId: { type: 'id', ref: 'User', required: true },
    columnId: { type: 'id', ref: 'Column', required: true },
    ordem: { type: 'number', default: 0 }, // posição dentro da coluna (espaçamento de 1000 em 1000)
    cliente: { type: 'string', required: true, trim: true },
    tipoPessoa: { type: 'string', enum: ['fisica', 'juridica'], default: 'fisica' },
    cnpj: { type: 'string', default: '' },
    razaoSocial: { type: 'string', default: '' },
    inscricaoEstadual: { type: 'string', default: '' },
    ramoAtividade: { type: 'string', default: '' },
    contatoNome: { type: 'string', default: '' }, // pessoa responsável do lado da empresa
    contatoCargo: { type: 'string', default: '' },
    valor: { type: 'money', default: 0 },
    temperatura: { type: 'string', enum: ['quente', 'morno', 'frio'], default: 'morno' },
    telefone: { type: 'string', default: '' },
    telefoneNormalizado: { type: 'string', default: null }, // só dígitos, com DDI — casa mensagens do WhatsApp
    instagramId: { type: 'string', default: null }, // remetente no Instagram — casa mensagens de DM
    obs: { type: 'string', default: '' },
    tipoProduto: { type: 'string', default: '', trim: true }, // chave da regra de comissão (o produto/serviço); vazio = sem produto
    produtoDetalhe: { type: 'string', default: '', trim: true }, // detalhe livre do que foi vendido (não mexe na comissão)
    mes: { type: 'string', default: '' }, // "YYYY-MM" ou "YYYY-MM-DD" — mês de venda
    mesInicioContato: { type: 'string', default: '' },
    colunaDesde: { type: 'date', default: () => new Date() }, // quando entrou na coluna atual
    automacoesDisparadas: { type: 'id[]', default: () => [] }, // evita repetir a mesma automação por tempo
    sugestaoIA: {
      type: 'group',
      campos: {
        texto: { type: 'string', default: null },
        tarefaTitulo: { type: 'string', default: null },
        tarefaDias: { type: 'int', default: null },
        geradaEm: { type: 'date', default: null },
      },
    },
    aguardandoMenuTriagem: { type: 'boolean', default: false },
    etiquetas: { type: 'string[]', default: () => [] },
    camposPersonalizados: { type: 'json', default: () => ({}) }, // { campoId: valor }
    arquivado: { type: 'boolean', default: false },
    atribuidoPorId: { type: 'id', ref: 'User', default: null }, // gestor que passou esse lead pra esta pessoa
    responsavelOpId: { type: 'id', default: null }, // funcionário da equipe (PDV/loja) que cadastrou o contato
    fechamento: { type: 'json' }, // fechamento da venda (valor final, parcelas) — ver utils/fechamento.js
    fechamentoPendente: { type: 'boolean', default: false }, // "Agora não" na janela de fechamento
  },
  antesDeSalvar(doc, foiAlterado) {
    if (foiAlterado('telefone')) doc.telefoneNormalizado = normalizarTelefone(doc.telefone);
    if (!doc.isNew && foiAlterado('columnId')) {
      doc.colunaDesde = new Date();
      doc.automacoesDisparadas = [];
    }
  },
  antesDeAtualizar(sets) {
    if (sets.telefone !== undefined) sets.telefoneNormalizado = normalizarTelefone(sets.telefone);
    if (sets.columnId !== undefined) {
      sets.colunaDesde = new Date();
      sets.automacoesDisparadas = [];
    }
  },
  transformJSON: jsonPadrao((ret) => {
    ret.columnId = str(ret.columnId);
    delete ret.automacoesDisparadas; // detalhe interno
  }),
});
