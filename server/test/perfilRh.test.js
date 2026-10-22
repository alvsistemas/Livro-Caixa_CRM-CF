const test = require('node:test');
const assert = require('node:assert');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'segredo-de-teste';
const Column = require('../models/Column');
const Funil = require('../models/Funil');
const CampoPersonalizado = require('../models/CampoPersonalizado');
const { seedColunasPadrao } = require('../seed');

function espiar() {
  const r = { funis: [], colunas: [], campos: [] };
  Funil.create = async (d) => { r.funis.push(d); return { _id: 'f1', ...d }; };
  Column.insertMany = async (l) => { r.colunas.push(...l); };
  CampoPersonalizado.insertMany = async (l) => { r.campos.push(...l); };
  return r;
}

test('perfil rh: funil de recrutamento com etapas e campos de candidato', async () => {
  const r = espiar();
  await seedColunasPadrao('u1', 'rh');
  assert.equal(r.funis[0].nome, 'Processo seletivo');
  assert.deepEqual(r.colunas.map((c) => c.nome), ['Triagem', 'Entrevista', 'Teste / Proposta', 'Contratado', 'Descartado']);
  assert.deepEqual(r.colunas.map((c) => c.tipo), ['aberto', 'aberto', 'aberto', 'ganho', 'perdido']);
  assert.ok(r.campos.some((c) => c.nome === 'Vaga'));
  assert.ok(r.campos.some((c) => c.tipo === 'data'));
});

test('sem perfil (ou consórcio): funil de vendas de sempre, sem campos extras', async () => {
  const r = espiar();
  await seedColunasPadrao('u2');
  assert.equal(r.funis[0].nome, 'Funil Principal');
  assert.equal(r.colunas[0].nome, 'Leads');
  assert.equal(r.campos.length, 0);
});
