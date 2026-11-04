/* Horários do caixa do PDV: janelas de funcionamento, turnos, virada do dia e validação. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const H = require('../utils/caixaHorario');

// horário de Brasília (UTC−3)
const br = (s) => new Date(`${s}-03:00`);
const HORARIO = { abre: '08:00', fecha: '18:00', dias: [1, 2, 3, 4, 5, 6] }; // seg a sáb

test('instanteBR e partesBR usam o horário de Brasília', () => {
  assert.equal(H.instanteBR('2026-11-04', 8 * 60).toISOString(), '2026-11-04T11:00:00.000Z');
  const p = H.partesBR(new Date('2026-11-05T01:30:00Z')); // 22:30 do dia 4 em Brasília
  assert.deepEqual(p, { data: '2026-11-04', min: 22 * 60 + 30, dow: 3 });
});

test('horário de funcionamento: dentro, fora, domingo e próxima abertura', () => {
  const j = H.janelaHorario(HORARIO, br('2026-11-04T10:00:00')); // quarta
  assert.equal(j.inicio.toISOString(), br('2026-11-04T08:00:00').toISOString());
  assert.equal(j.fim.toISOString(), br('2026-11-04T18:00:00').toISOString());
  assert.equal(H.janelaHorario(HORARIO, br('2026-11-04T18:00:00')), null, 'às 18:00 já fechou');
  assert.equal(H.janelaHorario(HORARIO, br('2026-11-04T07:59:00')), null);
  assert.equal(H.janelaHorario(HORARIO, br('2026-11-08T10:00:00')), null, 'domingo não abre');
  // sábado à noite: a próxima abertura é segunda às 08:00
  assert.equal(H.proximaAbertura(HORARIO, br('2026-11-07T19:00:00')).inicio.toISOString(), br('2026-11-09T08:00:00').toISOString());
});

test('horário que passa da meia-noite termina no dia seguinte', () => {
  const noite = { abre: '18:00', fecha: '02:00', dias: [5] }; // sexta à noite
  const j = H.janelaHorario(noite, br('2026-11-07T01:00:00')); // sábado 01:00, ainda é a sexta
  assert.ok(j);
  assert.equal(j.fim.toISOString(), br('2026-11-07T02:00:00').toISOString());
  assert.equal(H.janelaHorario(noite, br('2026-11-07T02:30:00')), null);
});

test('turnos: acha o turno certo, inclusive o da madrugada, e um turno só de 24 horas', () => {
  const turnos = [{ nome: 'Manhã', inicio: '06:00', fim: '14:00' }, { nome: 'Tarde', inicio: '14:00', fim: '22:00' }, { nome: 'Noite', inicio: '22:00', fim: '06:00' }];
  assert.equal(H.turnoEm(turnos, br('2026-11-04T13:59:00')).nome, 'Manhã');
  assert.equal(H.turnoEm(turnos, br('2026-11-04T14:00:00')).nome, 'Tarde');
  const n = H.turnoEm(turnos, br('2026-11-05T03:00:00'));
  assert.equal(n.nome, 'Noite');
  assert.equal(n.inicio.toISOString(), br('2026-11-04T22:00:00').toISOString());
  const um = H.turnoEm([{ nome: 'Dia', inicio: '06:00', fim: '06:00' }], br('2026-11-05T05:00:00'));
  assert.equal(um.inicio.toISOString(), br('2026-11-04T06:00:00').toISOString());
  assert.equal(um.fim.toISOString(), br('2026-11-05T06:00:00').toISOString());
});

test('virada do dia: no modo turnos, a madrugada conta no dia anterior', () => {
  const pdv = { modoCaixa: 'turnos', virada: '06:00' };
  assert.equal(H.diaDeTrabalho(pdv, br('2026-11-05T02:00:00')), '2026-11-04');
  assert.equal(H.diaDeTrabalho(pdv, br('2026-11-05T06:00:00')), '2026-11-05');
  assert.equal(H.diaDeTrabalho({ modoCaixa: 'manual', virada: '06:00' }, br('2026-11-05T02:00:00')), '2026-11-05', 'fora do modo turnos, vale o calendário');
});

test('validação de horário e turnos', () => {
  assert.deepEqual(H.validarHorario({ abre: '8:00'.padStart(5, '0'), fecha: '18:00', dias: [6, 1, 1] }), { abre: '08:00', fecha: '18:00', dias: [1, 6] });
  assert.throws(() => H.validarHorario({ abre: '08:00', fecha: '08:00', dias: [1] }), /diferente/);
  assert.throws(() => H.validarHorario({ abre: '08:00', fecha: '18:00', dias: [] }), /dia da semana/);
  assert.throws(() => H.validarHorario({ abre: '25:00', fecha: '18:00', dias: [1] }), /hora de abrir/);
  assert.equal(H.validarTurnos([{ nome: 'Dia', inicio: '06:00', fim: '06:00' }]).length, 1);
  assert.throws(() => H.validarTurnos([{ nome: 'A', inicio: '06:00', fim: '15:00' }, { nome: 'B', inicio: '14:00', fim: '22:00' }]), /passa por cima/);
  assert.throws(() => H.validarTurnos([{ nome: 'A', inicio: '06:00', fim: '14:00' }, { nome: 'B', inicio: '14:00', fim: '07:00' }]), /passa por cima/);
  assert.throws(() => H.validarTurnos([]), /pelo menos um turno/);
});
