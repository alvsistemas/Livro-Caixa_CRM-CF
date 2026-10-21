const FluxoExecucao = require('../models/FluxoExecucao');
const Fluxo = require('../models/Fluxo');
const Card = require('../models/Card');
const Task = require('../models/Task');
const Message = require('../models/Message');
const User = require('../models/User');
const { gerarComissaoAutomaticaSeGanho } = require('./comissaoAutomatica');


// Roda periodicamente (chamado de server.js via setInterval). Pra cada execução de
// fluxo em andamento, confere se já chegou a hora da próxima etapa e, se sim, executa.
async function processarFluxos() {
  try {
    const execucoes = await FluxoExecucao.find({ concluido: false });

    for (const exec of execucoes) {
      try {
        const fluxo = await Fluxo.findById(exec.fluxoId);
        if (!fluxo || !fluxo.ativo) continue;
        if (!(await require('./assinatura').temRecurso(exec.userId, 'automacoes'))) continue; // plano Essencial: fica parada

        const etapa = fluxo.etapas[exec.etapaAtual];
        if (!etapa) {
          exec.concluido = true;
          await exec.save();
          continue;
        }

        const executaEm = exec.iniciadoEm.getTime() + etapa.diasAposInicio * 24 * 60 * 60 * 1000;
        if (Date.now() < executaEm) continue; // ainda não chegou a hora dessa etapa

        const card = await Card.findById(exec.cardId);
        if (!card) {
          exec.concluido = true;
          await exec.save();
          continue;
        }

        if (etapa.tipo === 'tarefa') {
          const diasVenc = Number((etapa.params && etapa.params.diasParaVencimento) || 1);
          const venc = new Date();
          venc.setDate(venc.getDate() + diasVenc);
          await Task.create({
            userId: exec.userId,
            titulo: (etapa.params && etapa.params.titulo) || 'Etapa do fluxo',
            vencimento: venc,
            prioridade: 'media',
            leadId: card._id,
            descricao: `Criada automaticamente pelo fluxo "${fluxo.nome}".`,
          });
        } else if (etapa.tipo === 'mover_coluna') {
          const destino = etapa.params && etapa.params.colunaDestinoId;
          if (destino) {
            const atualizado = await Card.findByIdAndUpdate(card._id, { columnId: destino }, { new: true });
            gerarComissaoAutomaticaSeGanho(exec.userId, atualizado, destino);
          }
        }
        // etapa 'mensagem' (WhatsApp) saiu: é só pulada

        exec.etapaAtual += 1;
        if (exec.etapaAtual >= fluxo.etapas.length) exec.concluido = true;
        await exec.save();
      } catch (e) {
        console.error('Erro ao processar execução de fluxo:', e.message);
      }
    }
  } catch (e) {
    console.error('Erro ao processar fluxos:', e.message);
  }
}

module.exports = { processarFluxos };
