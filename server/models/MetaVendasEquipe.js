const mongoose = require('mongoose');

const metaVendasEquipeSchema = new mongoose.Schema(
  {
    equipeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Equipe', required: true },
    mes: { type: String, required: true }, // formato "YYYY-MM"
    valorMeta: { type: Number, default: 0 }, // 0 = sem meta definida; o gestor define o valor no Dashboard
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret) => {
        ret.id = ret._id.toString();
        ret.equipeId = ret.equipeId.toString();
        delete ret._id;
        delete ret.__v;
      },
    },
  }
);
metaVendasEquipeSchema.index({ equipeId: 1, mes: 1 }, { unique: true });

module.exports = mongoose.model('MetaVendasEquipe', metaVendasEquipeSchema);
