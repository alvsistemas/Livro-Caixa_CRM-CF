const mongoose = require('mongoose');
const User = require('../models/User');
const Column = require('../models/Column');

// Rodízio de leads novos: o gestor escolhe quem entra no rodízio e, a cada lead novo que chega no canal
// dele (WhatsApp, formulário de anúncio), o lead vai para a próxima pessoa da lista, uma de cada vez.
//
// Guardado no usuário gestor: rodizio = { ativo, membros: [ids na ordem da vez], contador }.
// O contador só sobe (atômico no banco), então dois leads chegando juntos nunca caem na mesma pessoa.

// Devolve { alvo, coluna } da próxima pessoa da vez (já com a coluna "em aberto" onde o lead vai cair),
// ou null se o rodízio não se aplica (desligado, sem equipe, ninguém elegível).
async function escolherPorRodizio(canalUser) {
  const r = canalUser && canalUser.rodizio;
  if (!r || !r.ativo || !canalUser.equipeId || canalUser.papelEquipe !== 'supervisor') return null;
  const idsConfig = (r.membros || []).map(String);
  if (!idsConfig.length) return null;

  // só quem ainda é da equipe e tem uma coluna "em aberto" pra receber o lead
  const doTime = await User.find({ _id: { $in: idsConfig.filter((i) => mongoose.isValidObjectId(i)) }, equipeId: canalUser.equipeId });
  const elegiveis = [];
  for (const id of idsConfig) {
    const u = doTime.find((x) => String(x._id) === id);
    if (!u) continue;
    const coluna = await Column.findOne({ userId: u._id, tipo: 'aberto' }).sort({ ordem: 1 });
    if (coluna) elegiveis.push({ alvo: u, coluna });
  }
  if (!elegiveis.length) return null;

  const atualizado = await User.findByIdAndUpdate(canalUser._id, { $inc: { 'rodizio.contador': 1 } }, { new: true });
  const vez = ((atualizado && atualizado.rodizio && atualizado.rodizio.contador) || 1) - 1;
  return elegiveis[vez % elegiveis.length];
}

module.exports = { escolherPorRodizio };
