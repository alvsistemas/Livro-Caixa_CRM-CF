const test = require('node:test');
const assert = require('node:assert');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'segredo-de-teste';

const User = require('../models/User');
const Column = require('../models/Column');
const Funil = require('../models/Funil');
const { validarAtribuicao, colunaEquivalente } = require('../utils/atribuirLead');
const EQ = require('../utils/equipesDoUsuario');

const EQUIPE = 'e'.repeat(24);
const GESTOR = 'a'.repeat(24);
const MEMBRO = 'b'.repeat(24);
const DE_FORA = 'c'.repeat(24);

function stubUsuarios() {
  const usuarios = {
    [GESTOR]: { _id: GESTOR, equipeId: EQUIPE, papelEquipe: 'supervisor', nome: 'Gestor' },
    [MEMBRO]: { _id: MEMBRO, equipeId: EQUIPE, papelEquipe: 'membro', nome: 'Membro' },
    [DE_FORA]: { _id: DE_FORA, equipeId: 'f'.repeat(24), papelEquipe: 'membro', nome: 'Fora' },
  };
  User.findById = async (id) => usuarios[id] || null;
  User.findOne = async (q) => {
    const u = usuarios[q._id];
    return u && String(u.equipeId) === String(q.equipeId) ? u : null;
  };
  EQ.membroDe = async (equipeId, id) => {
    const u = usuarios[id];
    return u && String(u.equipeId) === String(equipeId) ? { papel: u.papelEquipe, supervisorDeDados: false } : null;
  };
}

test('gestor pode atribuir para alguém da mesma equipe', async () => {
  stubUsuarios();
  const { alvo } = await validarAtribuicao(GESTOR, MEMBRO);
  assert.equal(alvo.nome, 'Membro');
});

test('membro comum não pode atribuir leads', async () => {
  stubUsuarios();
  await assert.rejects(() => validarAtribuicao(MEMBRO, GESTOR), (e) => e.status === 403);
});

test('não atribui para alguém de outra equipe nem sem escolher ninguém', async () => {
  stubUsuarios();
  await assert.rejects(() => validarAtribuicao(GESTOR, DE_FORA), (e) => e.status === 404);
  await assert.rejects(() => validarAtribuicao(GESTOR, ''), (e) => e.status === 400);
});

test('a coluna equivalente é a de mesmo nome e tipo; senão a primeira em aberto', async () => {
  const colunas = {
    origem: { _id: 'origem', nome: 'Negociação', tipo: 'aberto' },
  };
  Column.findById = async (id) => colunas[id] || null;
  const doAlvo = [
    { _id: 'x1', nome: 'Leads', tipo: 'aberto', ordem: 1 },
    { _id: 'x2', nome: 'negociação', tipo: 'aberto', ordem: 2 },
  ];
  Column.find = () => ({ sort: async () => doAlvo });
  Funil.find = () => ({ sort: async () => [] });
  Funil.findById = async () => null;
  assert.equal((await colunaEquivalente('origem', MEMBRO))._id, 'x2');
  colunas.origem.nome = 'Outra coisa';
  assert.equal((await colunaEquivalente('origem', MEMBRO))._id, 'x1');
});

test('com vários funis, usa o funil de mesmo nome (ou o primeiro) antes de procurar nos outros', async () => {
  const colunas = { origem: { _id: 'origem', nome: 'Leads', tipo: 'aberto', funilId: 'fg' } };
  const funis = { fg: { _id: 'fg', nome: 'Imóveis' } };
  Column.findById = async (id) => colunas[id] || null;
  Funil.findById = async (id) => funis[id] || null;
  const funisAlvo = [{ _id: 'f1', nome: 'Veículos', ordem: 0 }, { _id: 'f2', nome: 'imóveis', ordem: 1 }];
  const doAlvo = [
    { _id: 'v-leads', nome: 'Leads', tipo: 'aberto', funilId: 'f1', ordem: 1 },
    { _id: 'i-novos', nome: 'Novos', tipo: 'aberto', funilId: 'f2', ordem: 2 },
    { _id: 'i-leads', nome: 'Leads', tipo: 'aberto', funilId: 'f2', ordem: 3 },
  ];
  Funil.find = () => ({ sort: async () => funisAlvo });
  Column.find = () => ({ sort: async () => doAlvo });
  assert.equal((await colunaEquivalente('origem', MEMBRO))._id, 'i-leads'); // funil "Imóveis", não o "Leads" de Veículos
  colunas.origem.nome = 'Outra';
  assert.equal((await colunaEquivalente('origem', MEMBRO))._id, 'i-novos'); // primeira em aberto do funil certo
  funis.fg.nome = 'Não existe';
  assert.equal((await colunaEquivalente('origem', MEMBRO))._id, 'v-leads'); // sem funil de mesmo nome: o primeiro funil
});
