const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const express = require('express');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'segredo-de-teste';

function stub(rel, exports) {
  const id = require.resolve(rel);
  require.cache[id] = { id, filename: id, loaded: true, exports };
}
// autenticação trocada: o "token" do teste é o próprio id do usuário
stub('../middleware/auth', (req, _res, next) => { req.userId = (req.headers.authorization || '').replace('Bearer ', ''); next(); });
stub('../utils/auditoria', { registrarAuditoria: async () => {} });

const User = require('../models/User');
const Equipe = require('../models/Equipe');
const ConviteEquipe = require('../models/ConviteEquipe');
const equipeRouter = require('../routes/equipe');

const EQUIPE = 'e'.repeat(24);
const GESTOR = 'a'.repeat(24);
const MEMBRO = 'b'.repeat(24);
const NOVO = 'c'.repeat(24);

function preparar() {
  const usuarios = {
    [GESTOR]: { _id: GESTOR, email: 'gestor@x.com', nome: 'Gestor', equipeId: EQUIPE, papelEquipe: 'supervisor', save: async () => {} },
    [MEMBRO]: { _id: MEMBRO, email: 'membro@x.com', nome: 'Membro', equipeId: EQUIPE, papelEquipe: 'membro', save: async () => {} },
    [NOVO]: { _id: NOVO, email: 'novo@x.com', nome: 'Novo', equipeId: null, papelEquipe: 'membro', save: async function () {} },
  };
  const convites = [];
  User.findById = (id) => { const u = usuarios[id] || null; const p = Promise.resolve(u); p.select = async () => u; return p; };
  User.findOne = async (q) => Object.values(usuarios).find((u) => u.email === q.email && String(u.equipeId) === String(q.equipeId)) || null;
  Equipe.findById = async (id) => (String(id) === EQUIPE ? { _id: EQUIPE, nome: 'Time A', donoId: GESTOR } : null);
  ConviteEquipe.countDocuments = async () => convites.length;
  ConviteEquipe.updateOne = async (f, u) => {
    if (!convites.find((c) => c.email === f.email)) convites.push({ _id: 'd'.repeat(24), equipeId: f.equipeId, email: f.email, convidadoPorId: GESTOR });
  };
  ConviteEquipe.find = (f) => { const r = convites.filter((c) => (!f.email || c.email === f.email) && (!f.equipeId || String(c.equipeId) === String(f.equipeId))); const p = Promise.resolve(r); p.sort = async () => r; return p; };
  ConviteEquipe.findOne = async (f) => convites.find((c) => String(c._id) === String(f._id) && c.email === f.email) || null;
  ConviteEquipe.deleteMany = async (f) => { for (let i = convites.length - 1; i >= 0; i--) if (convites[i].email === f.email) convites.splice(i, 1); };
  ConviteEquipe.findByIdAndDelete = async () => null;
  return { usuarios, convites };
}

function chamar(metodo, caminho, quem, corpo) {
  const app = express();
  app.use(express.json());
  app.use('/api/equipe', equipeRouter);
  return new Promise((ok) => {
    const server = app.listen(0, () => {
      const req = http.request({ port: server.address().port, path: `/api/equipe${caminho}`, method: metodo, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${quem}` } }, (res) => {
        let dados = '';
        res.on('data', (d) => (dados += d));
        res.on('end', () => { server.close(); ok({ status: res.statusCode, corpo: dados ? JSON.parse(dados) : null }); });
      });
      if (corpo) req.write(JSON.stringify(corpo));
      req.end();
    });
  });
}

test('só o gestor convida; e-mail inválido é recusado', async () => {
  preparar();
  assert.equal((await chamar('POST', '/convites', MEMBRO, { email: 'novo@x.com' })).status, 403);
  assert.equal((await chamar('POST', '/convites', GESTOR, { email: 'sem-arroba' })).status, 400);
  assert.equal((await chamar('POST', '/convites', GESTOR, { email: 'membro@x.com' })).status, 400); // já é da equipe
});

test('convite não revela se o e-mail tem conta: a resposta é a mesma', async () => {
  const { convites } = preparar();
  assert.equal((await chamar('POST', '/convites', GESTOR, { email: 'novo@x.com' })).status, 201);
  assert.equal((await chamar('POST', '/convites', GESTOR, { email: 'ninguem@x.com' })).status, 201);
  assert.equal(convites.length, 2);
});

test('a pessoa convidada aceita e entra como membro; outra pessoa não consegue aceitar', async () => {
  const { usuarios, convites } = preparar();
  await chamar('POST', '/convites', GESTOR, { email: 'novo@x.com' });
  const id = convites[0]._id;
  assert.equal((await chamar('POST', `/convites/${id}/aceitar`, MEMBRO)).status, 400); // já tem equipe
  assert.equal((await chamar('POST', `/convites/${id}/aceitar`, NOVO)).status, 204);
  assert.equal(String(usuarios[NOVO].equipeId), EQUIPE);
  assert.equal(usuarios[NOVO].papelEquipe, 'membro');
});

test('convite informa se o e-mail de aviso saiu (sem e-mail configurado: emailEnviado=false)', async () => {
  preparar();
  const antes = ['RESEND_API_KEY', 'EMAIL_FROM', 'APP_URL'].map((k) => [k, process.env[k]]);
  antes.forEach(([k]) => delete process.env[k]);
  try {
    const r = await chamar('POST', '/convites', GESTOR, { email: 'sem-email@x.com' });
    assert.equal(r.status, 201);
    assert.equal(r.corpo.emailEnviado, false);
  } finally { antes.forEach(([k, v]) => { if (v !== undefined) process.env[k] = v; }); }
});

test('meta por pessoa: só o gestor define, valor inválido é recusado, membro precisa ser da equipe', async () => {
  preparar();
  const MetaVendas = require('../models/MetaVendas');
  const salvas = [];
  MetaVendas.findOneAndUpdate = async (f, u) => { salvas.push({ f, u }); return { valorMeta: u.valorMeta }; };
  const usuarios = { [MEMBRO]: { _id: MEMBRO, email: 'membro@x.com', nome: 'Membro' } };
  const origFindOne = User.findOne;
  User.findOne = async (q) => (String(q._id) === MEMBRO && String(q.equipeId) === EQUIPE ? usuarios[MEMBRO] : null);
  try {
    assert.equal((await chamar('PUT', `/membro/${MEMBRO}/meta-vendas`, MEMBRO, { valorMeta: 1000 })).status, 403);
    assert.equal((await chamar('PUT', `/membro/${MEMBRO}/meta-vendas`, GESTOR, { valorMeta: -5 })).status, 400);
    assert.equal((await chamar('PUT', `/membro/${MEMBRO}/meta-vendas`, GESTOR, { valorMeta: 'abc' })).status, 400);
    assert.equal((await chamar('PUT', `/membro/${NOVO}/meta-vendas`, GESTOR, { valorMeta: 1000 })).status, 404);
    const ok = await chamar('PUT', `/membro/${MEMBRO}/meta-vendas`, GESTOR, { valorMeta: 45000 });
    assert.equal(ok.status, 200);
    assert.equal(ok.corpo.valorMeta, 45000);
    assert.equal(salvas.length, 1);
    assert.equal(String(salvas[0].f.userId), MEMBRO);
  } finally { User.findOne = origFindOne; }
});

test('rodízio: só o gestor configura; precisa de pelo menos uma pessoa quando ligado', async () => {
  const { usuarios } = preparar();
  const origFind = User.find, origUpd = User.findByIdAndUpdate;
  User.find = () => { const r = [{ _id: MEMBRO }]; const p = Promise.resolve(r); p.select = async () => r; return p; };
  const gravado = [];
  User.findByIdAndUpdate = async (id, u) => { gravado.push(u); };
  try {
    assert.equal((await chamar('PUT', '/rodizio', MEMBRO, { ativo: true, membros: [MEMBRO] })).status, 403);
    assert.equal((await chamar('PUT', '/rodizio', GESTOR, { ativo: true, membros: [] })).status, 400);
    const r = await chamar('PUT', '/rodizio', GESTOR, { ativo: true, membros: [MEMBRO, 'x'.repeat(24)] });
    assert.equal(r.status, 200);
    assert.deepEqual(r.corpo.membros, [MEMBRO]); // quem não é da equipe é ignorado
    assert.equal(gravado[0]['rodizio.ativo'], true);
  } finally { User.find = origFind; User.findByIdAndUpdate = origUpd; }
});
