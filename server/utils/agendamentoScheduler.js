const MensagemAgendada = require('../models/MensagemAgendada');
const Card = require('../models/Card');
const Message = require('../models/Message');
const User = require('../models/User');

const { enviarTexto: enviarMensagemGraphSimples } = require('./whatsappEnvio');

// Roda periodicamente (chamado de server.js via setInterval). Manda cada mensagem
// agendada cujo horário já chegou, e marca o resultado.
async function processarAgendamentos() {
  try {
    const pendentes = await MensagemAgendada.find({ status: 'pendente', agendadoPara: { $lte: new Date() } });

    for (const agendamento of pendentes) {
      try {
        const card = await Card.findById(agendamento.cardId);
        if (!card || !card.telefoneNormalizado) {
          agendamento.status = 'falhou';
          agendamento.erro = 'Cliente não encontrado ou sem telefone.';
          await agendamento.save();
          continue;
        }
        const user = await User.findById(agendamento.userId);
        if (!user || !user.whatsappBusiness || !user.whatsappBusiness.accessToken) {
          agendamento.status = 'falhou';
          agendamento.erro = 'WhatsApp Business não está conectado.';
          await agendamento.save();
          continue;
        }
        const data = await enviarMensagemGraphSimples(user, card, agendamento.texto);
        await Message.create({
          userId: agendamento.userId,
          cardId: card._id,
          direction: 'out',
          texto: agendamento.texto,
          whatsappMessageId: data.messages && data.messages[0] && data.messages[0].id,
          status: 'sent',
          timestamp: new Date(),
        });
        agendamento.status = 'enviada';
        await agendamento.save();
      } catch (e) {
        agendamento.status = 'falhou';
        agendamento.erro = e.message;
        await agendamento.save();
      }
    }
  } catch (e) {
    console.error('Erro ao processar agendamentos:', e.message);
  }
}

module.exports = { processarAgendamentos };
