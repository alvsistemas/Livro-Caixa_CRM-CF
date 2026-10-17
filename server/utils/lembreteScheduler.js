const Task = require('../models/Task');
const { pushConfigurado, enviarPush, tarefasParaLembrar, montarPayloadTarefa } = require('./push');

// Roda a cada poucos minutos: acha as tarefas que estão na hora de lembrar e manda o push.
// "lembretePushEnviado" evita avisar duas vezes a mesma tarefa (volta a false se o vencimento mudar).
async function enviarLembretesDeTarefas() {
  if (!pushConfigurado()) return;
  try {
    const agora = Date.now();
    const candidatas = await Task.find({
      concluida: false,
      lembretePushEnviado: { $ne: true },
      vencimento: { $gte: new Date(agora - 26 * 60 * 60 * 1000), $lte: new Date(agora + 30 * 60 * 1000) },
    }).limit(500);

    for (const tarefa of tarefasParaLembrar(candidatas, agora)) {
      // marca ANTES de enviar, de forma atômica: se duas execuções se cruzarem, só uma envia
      const r = await Task.updateOne({ _id: tarefa._id, lembretePushEnviado: { $ne: true } }, { lembretePushEnviado: true });
      if (r.modifiedCount !== 1) continue;
      await enviarPush(tarefa.userId, montarPayloadTarefa(tarefa));
    }
  } catch (e) {
    console.error('Erro ao enviar lembretes de tarefas:', e.message);
  }
}

module.exports = { enviarLembretesDeTarefas };
