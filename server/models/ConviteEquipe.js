const mongoose = require('mongoose');

// Convite que o gestor manda pelo e-mail: a pessoa só entra na equipe se aceitar
// (assim ninguém é colocado numa equipe — e exposto à supervisão — sem saber).
const conviteEquipeSchema = new mongoose.Schema(
  {
    equipeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Equipe', required: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    convidadoPorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret) => {
        ret.id = ret._id.toString();
        ret.equipeId = ret.equipeId.toString();
        ret.convidadoPorId = ret.convidadoPorId.toString();
        delete ret._id;
        delete ret.__v;
      },
    },
  }
);
conviteEquipeSchema.index({ equipeId: 1, email: 1 }, { unique: true });

module.exports = mongoose.model('ConviteEquipe', conviteEquipeSchema);
