const User = require('../models/User');
const Column = require('../models/Column');
const Card = require('../models/Card');
const Message = require('../models/Message');
const Anexo = require('../models/Anexo');
const HistoricoContato = require('../models/HistoricoContato');
const MensagemAgendada = require('../models/MensagemAgendada');
const Task = require('../models/Task');
const Contrato = require('../models/Contrato');
const FluxoExecucao = require('../models/FluxoExecucao');
const { isValidId } = require('../db/ids');
const { comoSistema } = require('../db/contexto');
const EQ = require('./equipesDoUsuario');

// Estas funções mexem em dados de duas pessoas da equipe (o gestor e quem recebe o lead).
// Só são chamadas depois de validarAtribuicao conferir que é o gestor da mesma equipe, e
// por isso rodam como "sistema" no banco (fora da trava por usuário do Row-Level Security).

// Só o gestor (supervisor) da equipe pode passar um lead pra outra pessoa, e só pra alguém da MESMA equipe.
// Devolve { gestor, alvo } ou lança um erro com { status, mensagem }.
async function validarAtribuicao(gestorId, alvoId) {
  const erro = (status, mensagem) => Object.assign(new Error(mensagem), { status, mensagem });
  const gestor = await User.findById(gestorId);
  if (!gestor || !gestor.equipeId || gestor.papelEquipe !== 'supervisor') {
    throw erro(403, 'Só o gestor da equipe pode atribuir leads para outra pessoa.');
  }
  if (!alvoId || !isValidId(alvoId)) throw erro(400, 'Escolha para quem vai o lead.');
  const alvo = (await EQ.membroDe(gestor.equipeId, alvoId)) ? await User.findById(alvoId) : null;
  if (!alvo) throw erro(404, 'Essa pessoa não faz parte da sua equipe.');
  return { gestor, alvo };
}

// Acha a coluna equivalente na conta da outra pessoa. A pessoa pode ter vários funis:
// 1) o funil dela com o mesmo nome do funil de origem (sem diferenciar maiúsculas); senão o primeiro funil;
// 2) dentro dele, a coluna de mesmo nome e tipo; senão a primeira "em aberto";
// 3) só se esse funil não tiver coluna em aberto, procura nos outros funis.
async function colunaEquivalente(colunaOrigemId, alvoId) {
  return comoSistema(async () => {
    const Funil = require('../models/Funil');
    const norm = (t) => String(t || '').trim().toLowerCase();
    const origem = colunaOrigemId ? await Column.findById(colunaOrigemId) : null;
    const colunasAlvo = await Column.find({ userId: alvoId }).sort({ ordem: 1 });
    const funisAlvo = await Funil.find({ userId: alvoId }).sort({ ordem: 1 });
    const funilOrigem = origem && origem.funilId ? await Funil.findById(origem.funilId) : null;
    const funil = (funilOrigem && funisAlvo.find((f) => norm(f.nome) === norm(funilOrigem.nome))) || funisAlvo[0] || null;
    // colunas sem funil (contas antigas) contam como do primeiro funil
    const doFunil = funil ? colunasAlvo.filter((c) => (c.funilId ? String(c.funilId) === String(funil._id) : funisAlvo[0] && String(funisAlvo[0]._id) === String(funil._id))) : colunasAlvo;
    const mesmoNome = (lista) => (origem ? lista.find((c) => norm(c.nome) === norm(origem.nome) && c.tipo === origem.tipo) : null);
    return mesmoNome(doFunil) || doFunil.find((c) => c.tipo === 'aberto')
      || mesmoNome(colunasAlvo) || colunasAlvo.find((c) => c.tipo === 'aberto') || null;
  });
}

async function proximaOrdem(colunaId, userId) {
  return comoSistema(async () => {
    const ultimo = await Card.findOne({ columnId: colunaId, userId }).sort('-ordem');
    return ultimo ? ultimo.ordem + 1000 : 1000;
  });
}

// Passa um card que já existe pra outra pessoa, levando junto conversas, anexos, histórico, tarefas, agendamentos e contrato.
async function transferirCard(card, alvo, gestorId) {
  return comoSistema(async () => {
  const destino = await colunaEquivalente(card.columnId, alvo._id);
  if (!destino) {
    throw Object.assign(new Error('A pessoa escolhida não tem uma coluna "em aberto" pra receber o lead.'), { status: 400, mensagem: 'A pessoa escolhida não tem uma coluna "em aberto" pra receber o lead.' });
  }
  const antigoDono = card.userId;
  card.userId = alvo._id;
  card.columnId = destino._id;
  card.ordem = await proximaOrdem(destino._id, alvo._id);
  card.atribuidoPorId = gestorId;
  await card.save();
  const filtro = { cardId: card._id, userId: antigoDono };
  await Promise.all([
    Message.updateMany(filtro, { userId: alvo._id }),
    Anexo.updateMany(filtro, { userId: alvo._id }),
    HistoricoContato.updateMany(filtro, { userId: alvo._id }),
    MensagemAgendada.updateMany(filtro, { userId: alvo._id }),
    Contrato.updateMany(filtro, { userId: alvo._id }),
    FluxoExecucao.updateMany(filtro, { userId: alvo._id }),
    Task.updateMany({ leadId: card._id, userId: antigoDono }, { userId: alvo._id }),
  ]);
  return card;
  });
}

module.exports = { validarAtribuicao, colunaEquivalente, proximaOrdem, transferirCard };
