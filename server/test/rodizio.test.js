const test = require('node:test');
const assert = require('node:assert');
const User = require('../models/User');
const Column = require('../models/Column');
const { escolherPorRodizio } = require('../utils/rodizio');

function montar({ contador = 0, semColuna = [] } = {}) {
  const origU = { find: User.find, upd: User.findByIdAndUpdate }, origC = Column.findOne;
  const equipeId = 'eq1';
  const membros = ['a', 'b', 'c'].map((id) => ({ _id: id, equipeId }));
  let c = contador;
  User.find = async () => membros;
  User.findByIdAndUpdate = async () => ({ rodizio: { contador: ++c } });
  Column.findOne = (q) => ({ sort: async () => (semColuna.includes(q.userId) ? null : { _id: 'col-' + q.userId }) });
  const gestor = { _id: 'g', equipeId, papelEquipe: 'supervisor', rodizio: { ativo: true, membros: ['a', 'b', 'c'] } };
  return { gestor, restaurar() { User.find = origU.find; User.findByIdAndUpdate = origU.upd; Column.findOne = origC; } };
}

test('rodízio gira entre os membros em ordem', async () => {
  const { gestor, restaurar } = montar();
  try {
    const ids = [];
    for (let i = 0; i < 4; i++) ids.push((await escolherPorRodizio(gestor)).alvo._id);
    assert.deepStrictEqual(ids, ['a', 'b', 'c', 'a']);
  } finally { restaurar(); }
});

test('rodízio pula quem não tem coluna em aberto', async () => {
  const { gestor, restaurar } = montar({ semColuna: ['b'] });
  try {
    const ids = [];
    for (let i = 0; i < 3; i++) ids.push((await escolherPorRodizio(gestor)).alvo._id);
    assert.deepStrictEqual(ids, ['a', 'c', 'a']);
  } finally { restaurar(); }
});

test('rodízio desligado ou sem ser gestor devolve null', async () => {
  const { gestor, restaurar } = montar();
  try {
    assert.strictEqual(await escolherPorRodizio({ ...gestor, rodizio: { ativo: false, membros: ['a'] } }), null);
    assert.strictEqual(await escolherPorRodizio({ ...gestor, papelEquipe: 'membro' }), null);
    assert.strictEqual(await escolherPorRodizio(null), null);
  } finally { restaurar(); }
});
