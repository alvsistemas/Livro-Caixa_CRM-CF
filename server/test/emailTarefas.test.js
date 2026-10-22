const test = require('node:test');
const assert = require('node:assert');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'segredo-de-teste';
const { montarIcsTarefa, descreverQuando } = require('../utils/emailTarefas');
const { montarEmailTarefa } = require('../utils/email');
const { tarefasParaLembrar } = require('../utils/push');

test('.ics da tarefa: com hora vira horário, sem hora vira dia inteiro, e escapa vírgula', () => {
  const com = montarIcsTarefa({ _id: 't1', titulo: 'Ligar, cobrar', vencimento: new Date('2026-10-22T17:30:00Z') });
  assert.match(com, /DTSTART:20261022T173000Z/);
  assert.match(com, /SUMMARY:Ligar\\, cobrar/);
  const sem = montarIcsTarefa({ _id: 't2', titulo: 'Dia', vencimento: new Date('2026-10-22T00:00:00Z') });
  assert.match(sem, /DTSTART;VALUE=DATE:20261022/);
  assert.match(sem, /DTEND;VALUE=DATE:20261023/);
});

test('texto "quando" e e-mail da tarefa', () => {
  const q = descreverQuando(new Date('2026-10-22T17:30:00Z'));
  assert.equal(q.comHora, true);
  assert.match(q.texto, /14:30/);
  const m = montarEmailTarefa({ nome: 'Ana', titulo: 'Enviar <proposta>', quando: q.texto, comHora: true, tipo: 'nova' });
  assert.match(m.assunto, /Nova tarefa/);
  assert.ok(!m.html.includes('<proposta>')); // escapado
});

test('lembrete por e-mail usa o próprio controle de "já enviado"', () => {
  const agora = Date.UTC(2026, 9, 22, 17, 20);
  const t = { vencimento: new Date('2026-10-22T17:30:00Z'), concluida: false, lembretePushEnviado: true, lembreteEmailEnviado: false };
  assert.equal(tarefasParaLembrar([t], agora).length, 0); // push já foi
  assert.equal(tarefasParaLembrar([t], agora, 'lembreteEmailEnviado').length, 1); // e-mail ainda não
});
