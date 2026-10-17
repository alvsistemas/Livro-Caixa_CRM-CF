const PushSubscription = require('../models/PushSubscription');
const { temHorarioMarcado } = require('./icsFeed');

// Notificações push (Web Push) — chegam no celular/computador mesmo com o painel fechado.
// Variáveis no Render:
//   VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY   par de chaves (gere com: npx web-push generate-vapid-keys)
//   VAPID_SUBJECT                          "mailto:seu@email.com" (ou usa o APP_URL se não houver)
function assuntoVapid() {
  return process.env.VAPID_SUBJECT || process.env.APP_URL || '';
}

function pushConfigurado() {
  return !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && assuntoVapid());
}

let webpush = null;
function obterWebPush() {
  if (!pushConfigurado()) return null;
  if (!webpush) {
    webpush = require('web-push'); // só carrega se o recurso estiver ligado
    webpush.setVapidDetails(assuntoVapid(), process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
  }
  return webpush;
}

/* ---------- partes puras (testadas em server/test/push.test.js) ---------- */

const ANTECEDENCIA_MS = 15 * 60 * 1000; // tarefa com hora marcada: avisa 15 min antes
const TOLERANCIA_ATRASO_MS = 60 * 60 * 1000; // ...e ainda avisa até 1h depois, se o servidor estava dormindo
const HORA_AVISO_DIA_UTC = 11; // tarefa só com o dia: avisa às 08:00 de Brasília (11:00 UTC)
const JANELA_DIA_MS = 12 * 60 * 60 * 1000; // ...e só até 20:00 de Brasília

// Início da janela em que o lembrete dessa tarefa deve sair, e até quando ainda vale avisar.
function janelaDoLembrete(vencimento) {
  const v = new Date(vencimento);
  if (temHorarioMarcado(v)) {
    return { inicio: v.getTime() - ANTECEDENCIA_MS, fim: v.getTime() + TOLERANCIA_ATRASO_MS };
  }
  const inicio = Date.UTC(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate(), HORA_AVISO_DIA_UTC);
  return { inicio, fim: inicio + JANELA_DIA_MS };
}

function tarefasParaLembrar(tarefas, agora = Date.now()) {
  return (tarefas || []).filter((t) => {
    if (!t || !t.vencimento || t.concluida || t.lembretePushEnviado) return false;
    const { inicio, fim } = janelaDoLembrete(t.vencimento);
    return agora >= inicio && agora < fim;
  });
}

function resumirTexto(texto, max = 120) {
  const limpo = String(texto == null ? '' : texto).replace(/\s+/g, ' ').trim();
  return limpo.length > max ? limpo.slice(0, max - 1) + '…' : limpo;
}

function montarPayloadTarefa(tarefa) {
  const v = new Date(tarefa.vencimento);
  const comHora = temHorarioMarcado(v);
  const hora = comHora
    ? v.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })
    : null;
  return {
    titulo: comHora ? `Tarefa às ${hora}` : 'Tarefa para hoje',
    corpo: resumirTexto(tarefa.titulo),
    tag: `tarefa-${tarefa._id || tarefa.id}`,
    url: '/index.html',
    tipo: 'tarefa',
  };
}

function montarPayloadMensagem({ cliente, texto, canal, cardId }) {
  return {
    titulo: `${canal || 'Mensagem'} · ${cliente || 'Novo contato'}`,
    corpo: resumirTexto(texto),
    tag: `msg-${cardId}`, // várias mensagens do mesmo cliente se agrupam numa notificação só
    url: '/index.html',
    tipo: 'mensagem',
  };
}

/* ---------- envio ---------- */

// Manda a notificação pra todos os aparelhos inscritos do usuário. Nunca lança erro pra fora
// (uma notificação que falha não pode derrubar o recebimento de uma mensagem, por exemplo).
async function enviarPush(userId, payload) {
  try {
    const wp = obterWebPush();
    if (!wp) return { enviados: 0 };
    const inscricoes = await PushSubscription.find({ userId });
    let enviados = 0;
    await Promise.all(
      inscricoes.map(async (sub) => {
        try {
          await wp.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } },
            JSON.stringify(payload),
            { TTL: 60 * 60 }
          );
          enviados += 1;
        } catch (e) {
          if (e.statusCode === 404 || e.statusCode === 410) {
            await PushSubscription.deleteOne({ _id: sub._id }); // aparelho desinscrito: limpa
          } else {
            console.error('Erro ao enviar notificação push:', e.statusCode || e.message);
          }
        }
      })
    );
    return { enviados };
  } catch (e) {
    console.error('Erro no envio de push:', e.message);
    return { enviados: 0 };
  }
}

module.exports = {
  pushConfigurado,
  enviarPush,
  tarefasParaLembrar,
  janelaDoLembrete,
  montarPayloadTarefa,
  montarPayloadMensagem,
  resumirTexto,
};
