const User = require('../models/User');
const Card = require('../models/Card');
const Column = require('../models/Column');
const Task = require('../models/Task');
const MetaVendas = require('../models/MetaVendas');
const { hojeBR } = require('./dataBR');
const { temHorarioMarcado } = require('./icsFeed');
const { emailConfigurado, enviarEmail, moldeEmail, escaparHtml, urlBaseDoApp } = require('./email');
const { comoSistema } = require('../db/contexto');

const DIAS_PARADO = 7; // negociação em coluna "em aberto" há mais que isso sem mexer = parado
const HORA_ENVIO_BRT = 8; // a partir das 08:00 de Brasília

// Vocabulário do Livro-Caixa: Contatos e Negociações
const P = { leads: 'negociações', novos: 'Novos contatos', parados: 'Negociações paradas', abertos: 'em aberto' };

// Dia (AAAA-MM-DD) de uma tarefa: com hora vale o dia de Brasília; sem hora vale o dia gravado (meia-noite UTC).
function diaDaTarefa(vencimento) {
  const v = new Date(vencimento);
  return temHorarioMarcado(v) ? hojeBR(v) : v.toISOString().slice(0, 10);
}

// Calcula o resumo de UMA pessoa a partir de listas já carregadas (função pura, testada).
function calcularResumo({ colunas, cards, tarefas, meta, hoje, agora = Date.now() }) {
  const tipoDaColuna = new Map(colunas.map((c) => [String(c._id), c.tipo]));
  const mesAtual = hoje.slice(0, 7);
  const ativos = cards.filter((c) => !c.arquivado);
  const abertos = ativos.filter((c) => tipoDaColuna.get(String(c.columnId)) === 'aberto');
  const limite = agora - DIAS_PARADO * 24 * 3600 * 1000;
  const parados = abertos
    .filter((c) => new Date(c.colunaDesde || c.createdAt || agora).getTime() < limite)
    .sort((a, b) => new Date(a.colunaDesde || a.createdAt) - new Date(b.colunaDesde || b.createdAt));
  const novos24h = ativos.filter((c) => c.createdAt && new Date(c.createdAt).getTime() >= agora - 24 * 3600 * 1000);
  const vendidoMes = ativos
    .filter((c) => tipoDaColuna.get(String(c.columnId)) === 'ganho' && c.mes && c.mes.slice(0, 7) === mesAtual)
    .reduce((s, c) => s + (Number(c.valor) || 0), 0);
  const abertas = (tarefas || []).filter((t) => !t.concluida && t.vencimento);
  const tarefasHoje = abertas.filter((t) => diaDaTarefa(t.vencimento) === hoje).sort((a, b) => new Date(a.vencimento) - new Date(b.vencimento));
  const tarefasAtrasadas = abertas.filter((t) => diaDaTarefa(t.vencimento) < hoje).sort((a, b) => new Date(a.vencimento) - new Date(b.vencimento));
  return {
    totalAbertos: abertos.length,
    parados: parados.map((c) => ({ cliente: c.cliente, dias: Math.floor((agora - new Date(c.colunaDesde || c.createdAt).getTime()) / 86400000) })),
    novos24h: novos24h.length,
    vendidoMes,
    metaMes: meta ? Number(meta.valorMeta) || 0 : 0,
    tarefasHoje: tarefasHoje.map((t) => ({ titulo: t.titulo, vencimento: t.vencimento, comHora: temHorarioMarcado(new Date(t.vencimento)) })),
    tarefasAtrasadas: tarefasAtrasadas.map((t) => ({ titulo: t.titulo, dia: diaDaTarefa(t.vencimento) })),
  };
}

// Carrega os dados de uma pessoa e calcula o resumo dela.
async function resumoDoUsuario(userId, hoje = hojeBR()) {
  const [colunas, cards, tarefas, meta] = await Promise.all([
    Column.find({ userId }),
    Card.find({ userId, arquivado: { $ne: true } }).select('columnId cliente valor mes colunaDesde createdAt arquivado'),
    Task.find({ userId, concluida: false, vencimento: { $ne: null } }),
    MetaVendas.findOne({ userId, mes: hoje.slice(0, 7) }),
  ]);
  return calcularResumo({ colunas, cards, tarefas, meta, hoje });
}

const brl = (n) => 'R$ ' + (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const lista = (itens, vazio) => (itens.length ? `<ul style="margin:6px 0 0;padding-left:18px;line-height:1.6;">${itens.join('')}</ul>` : `<p style="margin:6px 0 0;color:#777;font-size:14px;">${vazio}</p>`);
const titulo = (t) => `<p style="font-weight:bold;margin:18px 0 0;">${t}</p>`;

function montarEmailResumo({ nome, resumo, equipe, hoje }) {
  const p = P;
  const r = resumo;
  const dataBonita = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(hoje + 'T12:00:00Z'));
  const hora = (t) => (t.comHora ? new Date(t.vencimento).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }) + ' — ' : '');
  let corpo = `<p style="line-height:1.55;">Bom dia${nome ? ', ' + escaparHtml(nome) : ''}! Seu resumo de ${escaparHtml(dataBonita)}:</p>`;
  corpo += `<table style="width:100%;border-collapse:collapse;margin:10px 0;"><tr>
<td style="padding:8px;background:#f4f4f2;border-radius:8px;text-align:center;"><div style="font-size:22px;font-weight:bold;">${r.totalAbertos}</div><div style="font-size:12px;color:#666;">${p.leads} ${p.abertos}</div></td><td style="width:8px;"></td>
<td style="padding:8px;background:#f4f4f2;border-radius:8px;text-align:center;"><div style="font-size:22px;font-weight:bold;">${r.novos24h}</div><div style="font-size:12px;color:#666;">novos contatos (24h)</div></td><td style="width:8px;"></td>
<td style="padding:8px;background:#f4f4f2;border-radius:8px;text-align:center;"><div style="font-size:22px;font-weight:bold;">${r.parados.length}</div><div style="font-size:12px;color:#666;">negociações paradas</div></td></tr></table>`;
  corpo += titulo('Tarefas de hoje') + lista(r.tarefasHoje.map((t) => `<li>${hora(t)}${escaparHtml(t.titulo)}</li>`), 'Nenhuma tarefa para hoje.');
  if (r.tarefasAtrasadas.length) corpo += titulo('⚠ Tarefas atrasadas') + lista(r.tarefasAtrasadas.slice(0, 10).map((t) => `<li>${escaparHtml(t.titulo)} <span style="color:#a00;">(${t.dia.split('-').reverse().join('/')})</span></li>`), '');
  if (r.parados.length) corpo += titulo(`${p.parados} (${DIAS_PARADO}+ dias na mesma etapa)`) + lista(r.parados.slice(0, 8).map((c) => `<li>${escaparHtml(c.cliente)} — ${c.dias} dias</li>`), '') + (r.parados.length > 8 ? `<p style="font-size:13px;color:#777;">…e mais ${r.parados.length - 8}.</p>` : '');
  corpo += titulo('Meta do mês') + `<p style="margin:6px 0 0;">${brl(r.vendidoMes)}${r.metaMes ? ` de ${brl(r.metaMes)} (${Math.round((r.vendidoMes / r.metaMes) * 100)}%)` : ' vendidos (sem meta definida)'}</p>`;
  if (equipe && equipe.length) {
    corpo += titulo('Sua equipe') + `<table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:6px;"><tr style="text-align:left;color:#666;"><th style="padding:4px 6px;">Pessoa</th><th>${p.leads} ${p.abertos}</th><th>Paradas</th><th>Tarefas atrasadas</th><th>Vendido / meta</th></tr>${equipe.map((m) => `<tr style="border-top:1px solid #e4e4e0;"><td style="padding:5px 6px;">${escaparHtml(m.nome)}</td><td>${m.resumo.totalAbertos}</td><td${m.resumo.parados.length ? ' style="color:#a00;"' : ''}>${m.resumo.parados.length}</td><td${m.resumo.tarefasAtrasadas.length ? ' style="color:#a00;"' : ''}>${m.resumo.tarefasAtrasadas.length}</td><td>${brl(m.resumo.vendidoMes)}${m.resumo.metaMes ? ' / ' + brl(m.resumo.metaMes) : ''}</td></tr>`).join('')}</table>`;
  }
  corpo += `<p style="margin:22px 0 0;"><a href="${escaparHtml(urlBaseDoApp())}/index.html" style="background:#141414;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;display:inline-block;">Abrir o Livro-Caixa</a></p>
<p style="font-size:12px;color:#888;margin-top:16px;">Para parar de receber, desative em Configurações → Integrações → E-mail.</p>`;
  const texto = `Resumo de ${dataBonita}: ${r.totalAbertos} ${p.leads} ${p.abertos}, ${r.novos24h} contatos novos nas últimas 24h, ${r.parados.length} paradas, ${r.tarefasHoje.length} tarefa(s) hoje, ${r.tarefasAtrasadas.length} atrasada(s).`;
  return { assunto: `Seu resumo de hoje: ${r.tarefasHoje.length} tarefa(s), ${r.parados.length} ${r.parados.length === 1 ? 'negociação parada' : 'negociações paradas'}`, html: moldeEmail('Resumo do dia', corpo), texto };
}

async function resumoDaEquipe(gestor, hoje) {
  const membros = await User.find({ equipeId: gestor.equipeId });
  const lista = [];
  for (const m of membros) {
    if (String(m._id) === String(gestor._id)) continue;
    // dados de outra pessoa da equipe: só números agregados, lidos como sistema (o gestor já foi conferido)
    lista.push({ nome: m.nome || m.email, resumo: await comoSistema(() => resumoDoUsuario(m._id, hoje)) });
  }
  return lista;
}

// Envia o resumo de uma pessoa (usado pelo agendador e pelo botão "Enviar agora"). Lança erro se falhar.
async function enviarResumoDe(user, hoje = hojeBR()) {
  if (!emailConfigurado()) throw new Error('O envio de e-mail não está configurado neste servidor.');
  const resumo = await resumoDoUsuario(user._id, hoje);
  const equipe = user.equipeId && user.papelEquipe === 'supervisor' ? await resumoDaEquipe(user, hoje) : null;
  const msg = montarEmailResumo({ nome: user.nome, resumo, equipe, hoje });
  await enviarEmail({ para: user.email, assunto: msg.assunto, html: msg.html, texto: msg.texto });
}

// Agendador: de 10 em 10 minutos; a partir das 08:00 de Brasília manda 1x por dia (quem ligou). Falha de uma pessoa não derruba as outras.
async function enviarResumosDiarios(agora = new Date()) {
  try {
    if (!emailConfigurado()) return;
    const hoje = hojeBR(agora);
    const horaBR = Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hour12: false, timeZone: 'America/Sao_Paulo' }).format(agora));
    if (horaBR < HORA_ENVIO_BRT || horaBR >= 18) return;
    const diaSemana = new Date(hoje + 'T12:00:00Z').getUTCDay();
    if (diaSemana === 0 || diaSemana === 6) return; // só dias úteis
    const pessoas = await User.find({ resumoDiarioEmail: true, resumoDiarioUltimo: { $ne: hoje } }).limit(500);
    for (const u of pessoas) {
      // marca ANTES, de forma atômica: se duas execuções se cruzarem, só uma envia
      const r = await User.updateOne({ _id: u._id, resumoDiarioUltimo: { $ne: hoje } }, { resumoDiarioUltimo: hoje });
      if (r.modifiedCount !== 1) continue;
      try { await enviarResumoDe(u, hoje); } catch (e) { console.error('Erro no resumo diário:', e.message); }
    }
  } catch (e) {
    console.error('Erro ao enviar resumos diários:', e.message);
  }
}

module.exports = { calcularResumo, montarEmailResumo, enviarResumoDe, enviarResumosDiarios, diaDaTarefa };
