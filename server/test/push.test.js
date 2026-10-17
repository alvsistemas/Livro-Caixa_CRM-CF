const test = require('node:test');
const assert = require('node:assert');
const { tarefasParaLembrar, janelaDoLembrete, montarPayloadTarefa, montarPayloadMensagem, resumirTexto } = require('../utils/push');

const MIN = 60 * 1000;
// tarefa com hora marcada: 14:00 em Brasília = 17:00 UTC
const COM_HORA = new Date(Date.UTC(2026, 9, 9, 17, 0));
// tarefa só com o dia: o painel guarda meia-noite UTC
const SO_DIA = new Date(Date.UTC(2026, 9, 9, 0, 0));

test('lembretes de tarefa', async (t) => {
  await t.test('com hora marcada: avisa 15 min antes, não antes disso', () => {
    const tarefa = { vencimento: COM_HORA };
    assert.strictEqual(tarefasParaLembrar([tarefa], COM_HORA.getTime() - 16 * MIN).length, 0);
    assert.strictEqual(tarefasParaLembrar([tarefa], COM_HORA.getTime() - 15 * MIN).length, 1);
    assert.strictEqual(tarefasParaLembrar([tarefa], COM_HORA.getTime() - 1 * MIN).length, 1);
  });

  await t.test('com hora marcada: ainda avisa até 1h depois, depois disso desiste', () => {
    const tarefa = { vencimento: COM_HORA };
    assert.strictEqual(tarefasParaLembrar([tarefa], COM_HORA.getTime() + 59 * MIN).length, 1);
    assert.strictEqual(tarefasParaLembrar([tarefa], COM_HORA.getTime() + 61 * MIN).length, 0);
  });

  await t.test('só com o dia: avisa às 08:00 de Brasília (11:00 UTC) até 20:00', () => {
    const tarefa = { vencimento: SO_DIA };
    assert.strictEqual(tarefasParaLembrar([tarefa], Date.UTC(2026, 9, 9, 10, 59)).length, 0);
    assert.strictEqual(tarefasParaLembrar([tarefa], Date.UTC(2026, 9, 9, 11, 0)).length, 1);
    assert.strictEqual(tarefasParaLembrar([tarefa], Date.UTC(2026, 9, 9, 22, 0)).length, 1);
    assert.strictEqual(tarefasParaLembrar([tarefa], Date.UTC(2026, 9, 9, 23, 1)).length, 0);
  });

  await t.test('ignora concluída, já avisada e sem vencimento', () => {
    const agora = COM_HORA.getTime() - 5 * MIN;
    assert.strictEqual(tarefasParaLembrar([{ vencimento: COM_HORA, concluida: true }], agora).length, 0);
    assert.strictEqual(tarefasParaLembrar([{ vencimento: COM_HORA, lembretePushEnviado: true }], agora).length, 0);
    assert.strictEqual(tarefasParaLembrar([{ vencimento: null }], agora).length, 0);
    assert.strictEqual(tarefasParaLembrar(undefined, agora).length, 0);
  });

  await t.test('janelaDoLembrete devolve início e fim coerentes', () => {
    const { inicio, fim } = janelaDoLembrete(COM_HORA);
    assert.ok(inicio < COM_HORA.getTime() && fim > COM_HORA.getTime());
  });
});

test('textos das notificações', async (t) => {
  await t.test('payload de tarefa com hora mostra o horário de Brasília', () => {
    const p = montarPayloadTarefa({ _id: 'abc', titulo: 'Ligar pro João', vencimento: COM_HORA });
    assert.strictEqual(p.titulo, 'Tarefa às 14:00');
    assert.strictEqual(p.corpo, 'Ligar pro João');
    assert.strictEqual(p.tag, 'tarefa-abc');
    assert.strictEqual(p.tipo, 'tarefa');
  });

  await t.test('payload de tarefa só com o dia diz "para hoje"', () => {
    assert.strictEqual(montarPayloadTarefa({ _id: 'x', titulo: 'Enviar proposta', vencimento: SO_DIA }).titulo, 'Tarefa para hoje');
  });

  await t.test('payload de mensagem agrupa por cliente e resume texto longo', () => {
    const longo = 'a'.repeat(300);
    const p = montarPayloadMensagem({ cliente: 'Maria', texto: longo, canal: 'WhatsApp', cardId: 'c1' });
    assert.strictEqual(p.titulo, 'WhatsApp · Maria');
    assert.strictEqual(p.tag, 'msg-c1');
    assert.ok(p.corpo.length <= 120);
    assert.ok(p.corpo.endsWith('…'));
  });

  await t.test('resumirTexto troca quebras de linha e aguenta nulo', () => {
    assert.strictEqual(resumirTexto('oi\n\n  tudo   bem?'), 'oi tudo bem?');
    assert.strictEqual(resumirTexto(null), '');
  });
});
