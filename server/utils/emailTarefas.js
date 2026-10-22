const User = require('../models/User');
const { temHorarioMarcado } = require('./icsFeed');
const { emailConfigurado, enviarEmail, montarEmailTarefa } = require('./email');

// Texto "quando": "quinta, 22 de outubro de 2026, às 14:30" (ou só o dia, se a tarefa não tem hora).
function descreverQuando(vencimento) {
  const v = new Date(vencimento);
  const comHora = temHorarioMarcado(v);
  const fmtDia = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: comHora ? 'America/Sao_Paulo' : 'UTC' });
  let texto = fmtDia.format(v);
  if (comHora) texto += ', às ' + v.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
  return { texto, comHora };
}

function esc(t) { return String(t || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n'); }
const fmtUtc = (d) => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

// Convite de calendário (.ics) de um compromisso só, pra abrir no Google/Apple/Outlook.
function montarIcsTarefa(tarefa) {
  const v = new Date(tarefa.vencimento);
  const comHora = temHorarioMarcado(v);
  const linhas = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Livro-Caixa//Tarefas//PT', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'BEGIN:VEVENT',
    `UID:tarefa-${tarefa._id || tarefa.id}@livro-caixa`, `DTSTAMP:${fmtUtc(new Date())}`];
  if (comHora) { linhas.push(`DTSTART:${fmtUtc(v)}`, `DTEND:${fmtUtc(new Date(v.getTime() + 30 * 60 * 1000))}`); }
  else {
    const dia = v.toISOString().slice(0, 10).replace(/-/g, '');
    const prox = new Date(v.getTime() + 24 * 3600 * 1000).toISOString().slice(0, 10).replace(/-/g, '');
    linhas.push(`DTSTART;VALUE=DATE:${dia}`, `DTEND;VALUE=DATE:${prox}`);
  }
  linhas.push(`SUMMARY:${esc(tarefa.titulo)}`);
  if (tarefa.descricao) linhas.push(`DESCRIPTION:${esc(tarefa.descricao)}`);
  linhas.push('BEGIN:VALARM', 'TRIGGER:-PT15M', 'ACTION:DISPLAY', 'DESCRIPTION:Tarefa', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR');
  return linhas.join('\r\n') + '\r\n';
}

// tipo: 'nova' (logo que a tarefa é criada) ou 'lembrete' (no dia/hora). Nunca lança: falha de e-mail não pode atrapalhar a tarefa.
async function enviarEmailDaTarefa(userId, tarefa, tipo) {
  try {
    if (!emailConfigurado() || !tarefa || !tarefa.vencimento) return false;
    const user = await User.findById(userId).select('email nome emailTarefas');
    if (!user || !user.emailTarefas || !user.email) return false;
    const { texto: quando, comHora } = descreverQuando(tarefa.vencimento);
    const msg = montarEmailTarefa({ nome: user.nome, titulo: tarefa.titulo, descricao: tarefa.descricao, quando, comHora, tipo });
    const anexos = tipo === 'nova' ? [{ nome: 'tarefa.ics', conteudoBase64: Buffer.from(montarIcsTarefa(tarefa), 'utf8').toString('base64') }] : undefined;
    await enviarEmail({ para: user.email, assunto: msg.assunto, html: msg.html, texto: msg.texto, anexos });
    return true;
  } catch (e) {
    console.error('Erro ao enviar e-mail da tarefa:', e.message);
    return false;
  }
}

module.exports = { enviarEmailDaTarefa, montarIcsTarefa, descreverQuando };
