const mongoose = require('mongoose');

/* Um "bloco" é uma linha da planilha de regras: N parcelas, cada uma valendo um
   percentual do valor da venda. Uma regra pode ter 1 bloco
   (ex: parcela única) ou vários (ex: 10 parcelas de um jeito + 3 parcelas de outro). */
const blocoSchema = new mongoose.Schema(
  {
    parcelas: { type: Number, required: true, min: 1 },
    percentual: { type: Number, required: true, min: 0 }, // percentual do valor da venda, por parcela — ex: 0.05 = 5%
  },
  { _id: false }
);

const regraComissaoSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    chave: { type: String, required: true, trim: true }, // identificador estável (usado como "tipoProduto" em Card/Contrato)
    nome: { type: String, required: true, trim: true }, // nome de exibição, editável livremente
    blocos: {
      type: [blocoSchema],
      required: true,
      validate: { validator: (v) => Array.isArray(v) && v.length > 0, message: 'A regra precisa ter pelo menos um bloco de parcelas.' },
    },
    // quando true, o mês da comissão pode ser editado em Comissões sem alterar o mês do lead
    // (caso de pagamentos que demoram a acontecer)
    mesIndependente: { type: Boolean, default: false },
    padrao: { type: Boolean, default: false }, // regra que veio pronta do sistema (pode ser editada e até excluída)
    ordem: { type: Number, default: 0 },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret) => {
        ret.id = ret._id.toString();
        delete ret._id;
        delete ret.__v;
        delete ret.userId;
      },
    },
  }
);

regraComissaoSchema.index({ userId: 1, chave: 1 }, { unique: true });

module.exports = mongoose.model('RegraComissao', regraComissaoSchema);
