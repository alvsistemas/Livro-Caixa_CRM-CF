const mongoose = require('mongoose');

/* Dados do Controle financeiro (o antigo Livro-Caixa) — um documento por usuário.
   Cada seção é guardada do jeito que o front-end do financeiro trabalha (listas de
   objetos simples), pra não precisar de uma coleção por tipo. A validação do formato
   fica em utils/financeiro.js. */
const financeiroSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    transacoes: { type: Array, default: [] }, // lançamentos: receitas e despesas (único, fixo ou parcelado)
    cartoes: { type: Array, default: [] },
    investimentos: { type: Array, default: [] },
    objetivos: { type: Array, default: [] },
    perfil: { type: mongoose.Schema.Types.Mixed, default: null }, // nome, personagem, plano, foto
    config: { type: mongoose.Schema.Types.Mixed, default: () => ({}) }, // ex: como as vendas do CRM entram no financeiro
  },
  {
    timestamps: true,
    minimize: false,
    toJSON: {
      transform: (_doc, ret) => {
        ret.id = ret._id.toString();
        delete ret._id;
        delete ret.__v;
      },
    },
  }
);

module.exports = mongoose.model('Financeiro', financeiroSchema);
