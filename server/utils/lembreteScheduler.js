const Task = require('../models/Task');
const { pushConfigurado, enviarPush, tarefasParaLembrar, montarPayloadTarefa } = require('./push');
const { enviarEmailDaTarefa } = require('./emailTarefas');
const { emailConfigurado } = require('./email');

// Roda a cada poucos minutos: acha as tarefas que estão na hora de lembrar e manda o push e o e-mail.
// "lembretePushEnviado" / "lembreteEmailEnviado" evitam avisar duas vezes a mesma tarefa
// (voltam a false se o vencimento mudar). O e-mail só sai para quem ligou "Tarefas por e-mail".
async function candidatas(campo) {
  const agora = Date.now();
  const lista = await Task.find({
    concluida: false,
    [campo]: { $ne: true },
    vencimento: { $gte: new Date(agora - 26 * 60 * 60 * 1000), $lte: new Date(agora + 30 * 60 * 1000) },
  }).limit(500);
  return tarefasParaLembrar(lista, agora, campo);
}

async function enviarLembretesDeTarefas() {
  try {
    if (pushConfigurado()) {
      for (const tarefa of await candidatas('lembretePushEnviado')) {
        // marca ANTES de enviar, de forma atômica: se duas execuções se cruzarem, só uma envia
        const r = await Task.updateOne({ _id: tarefa._id, lembretePushEnviado: { $ne: true } }, { lembretePushEnviado: true });
        if (r.modifiedCount !== 1) continue;
        await enviarPush(tarefa.userId, montarPayloadTarefa(tarefa));
      }
    }
    if (emailConfigurado()) {
      for (const tarefa of await candidatas('lembreteEmailEnviado')) {
        const r = await Task.updateOne({ _id: tarefa._id, lembreteEmailEnviado: { $ne: true } }, { lembreteEmailEnviado: true });
        if (r.modifiedCount !== 1) continue;
        await enviarEmailDaTarefa(tarefa.userId, tarefa, 'lembrete');
      }
    }
  } catch (e) {
    console.error('Erro ao enviar lembretes de tarefas:', e.message);
  }
}

module.exports = { enviarLembretesDeTarefas };
