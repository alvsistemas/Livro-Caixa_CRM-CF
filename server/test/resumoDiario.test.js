const test = require('node:test');
const assert = require('node:assert');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'segredo-de-teste';
process.env.APP_URL = 'https://painel.exemplo.com';
const { calcularResumo, montarEmailResumo, diaDaTarefa } = require('../utils/resumoDiario');

const colunas = [{ _id: 'a', tipo: 'aberto' }, { _id: 'g', tipo: 'ganho' }, { _id: 'p', tipo: 'perdido' }];
const agora = Date.UTC(2026, 9, 22, 12, 0); // 22/10/2026 09:00 em Brasília
const dias = (n) => new Date(agora - n * 86400000);

test('resumo: parados, novos, vendido no mês e tarefas de hoje/atrasadas', () => {
  const cards = [
    { cliente: 'Parado', columnId: 'a', colunaDesde: dias(12), createdAt: dias(30) },
    { cliente: 'Recente', columnId: 'a', colunaDesde: dias(1), createdAt: dias(0.2) },
    { cliente: 'Arquivado', columnId: 'a', colunaDesde: dias(40), createdAt: dias(40), arquivado: true },
    { cliente: 'Venda', columnId: 'g', valor: 80000, mes: '2026-10', colunaDesde: dias(3), createdAt: dias(20) },
    { cliente: 'Venda antiga', columnId: 'g', valor: 50000, mes: '2026-09', colunaDesde: dias(40), createdAt: dias(60) },
    { cliente: 'Perdido', columnId: 'p', colunaDesde: dias(50), createdAt: dias(60) },
  ];
  const tarefas = [
    { titulo: 'Hoje sem hora', vencimento: new Date('2026-10-22T00:00:00Z'), concluida: false },
    { titulo: 'Hoje 14h', vencimento: new Date('2026-10-22T17:00:00Z'), concluida: false },
    { titulo: 'Ontem', vencimento: new Date('2026-10-21T00:00:00Z'), concluida: false },
    { titulo: 'Amanhã', vencimento: new Date('2026-10-23T00:00:00Z'), concluida: false },
    { titulo: 'Feita', vencimento: new Date('2026-10-22T00:00:00Z'), concluida: true },
  ];
  const r = calcularResumo({ colunas, cards, tarefas, meta: { valorMeta: 100000 }, hoje: '2026-10-22', agora });
  assert.equal(r.totalAbertos, 2);
  assert.deepEqual(r.parados.map((p) => p.cliente), ['Parado']);
  assert.equal(r.parados[0].dias, 12);
  assert.equal(r.novos24h, 1);
  assert.equal(r.vendidoMes, 80000);
  assert.equal(r.metaMes, 100000);
  assert.deepEqual(r.tarefasHoje.map((t) => t.titulo), ['Hoje sem hora', 'Hoje 14h']);
  assert.deepEqual(r.tarefasAtrasadas.map((t) => t.titulo), ['Ontem']);
});

test('dia da tarefa: sem hora vale o dia gravado; com hora vale o dia de Brasília', () => {
  assert.equal(diaDaTarefa(new Date('2026-10-22T00:00:00Z')), '2026-10-22');
  assert.equal(diaDaTarefa(new Date('2026-10-23T01:30:00Z')), '2026-10-22'); // 22:30 do dia 22 em Brasília
});

test('e-mail do resumo: escapa HTML, fala de negociações e mostra a equipe do gestor', () => {
  const resumo = { totalAbertos: 3, parados: [{ cliente: '<b>X</b>', dias: 9 }], novos24h: 1, vendidoMes: 0, metaMes: 0, tarefasHoje: [], tarefasAtrasadas: [{ titulo: 'Ligar', dia: '2026-10-20' }] };
  const com = montarEmailResumo({ nome: 'Bia', resumo, equipe: [{ nome: 'Ana', resumo }], hoje: '2026-10-22' });
  assert.ok(!com.html.includes('<b>X</b>'));
  assert.match(com.html, /negociações em aberto/);
  assert.match(com.html, /Sua equipe/);
  assert.match(com.html, /20\/10\/2026/);
  assert.match(com.html, /Meta do mês/);
  assert.match(com.assunto, /1 negociação parada/);
  const sem = montarEmailResumo({ nome: 'Gui', resumo, equipe: null, hoje: '2026-10-22' });
  assert.ok(!/Sua equipe/.test(sem.html));
});
