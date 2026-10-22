const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const express = require('express');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'segredo-de-teste';
function stub(rel, exports) { const id = require.resolve(rel); require.cache[id] = { id, filename: id, loaded: true, exports }; }
stub('../middleware/auth', (req, _res, next) => { req.userId = (req.headers.authorization || '').replace('Bearer ', ''); next(); });
stub('../utils/auditoria', { registrarAuditoria: async () => {} });
stub('../utils/push', { enviarPush: () => {}, montarPayloadMensagem: () => ({}) });
stub('../utils/dispararWebhooks', { dispararWebhooks: () => {} });
stub('../utils/comissaoAutomatica', { gerarComissaoAutomaticaSeGanho: () => {}, cancelarComissaoSePerdidoAposGanho: () => {} });

const User = require('../models/User');
const Card = require('../models/Card');
const Column = require('../models/Column');
const PossivelLead = require('../models/PossivelLead');
const possiveisRouter = require('../routes/possiveisLeads');
const cardsRouter = require('../routes/cards');
const { hojeBR } = require('../utils/dataBR');

const EQ = 'e'.repeat(24), GESTOR = 'a'.repeat(24), MEMBRO = 'b'.repeat(24), SOLO = 'c'.repeat(24);
const usuarios = {
  [GESTOR]: { _id: GESTOR, nome: 'Gestor', equipeId: EQ, papelEquipe: 'supervisor' },
  [MEMBRO]: { _id: MEMBRO, nome: 'Ana', equipeId: EQ, papelEquipe: 'membro' },
  [SOLO]: { _id: SOLO, nome: 'Solo', equipeId: null, papelEquipe: 'membro' },
};

function chamar(rota, router, metodo, caminho, quem, corpo) {
  const app = express(); app.use(express.json()); app.use(rota, router);
  return new Promise((ok) => {
    const server = app.listen(0, () => {
      const req = http.request({ port: server.address().port, path: rota + caminho, method: metodo, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${quem}` } }, (res) => {
        let d = ''; res.on('data', (x) => (d += x)); res.on('end', () => { server.close(); ok({ status: res.statusCode, corpo: d ? JSON.parse(d) : null }); });
      });
      if (corpo) req.write(JSON.stringify(corpo)); req.end();
    });
  });
}

function preparar() {
  const criados = [], removidosPossiveis = [], excluidos = [];
  User.findById = (id) => { const u = usuarios[id] || null; const p = Promise.resolve(u); p.select = async () => u; return p; };
  User.findOne = async (q) => Object.values(usuarios).find((u) => String(u._id) === String(q._id) && String(u.equipeId) === String(q.equipeId)) || null;
  PossivelLead.find = () => ({ sort: () => ({ limit: async () => [{ _id: 'p1', nome: 'Maria', telefone: '1599', tipoServico: 'imóvel' }, { _id: 'p2', nome: '', telefone: '1598', tipoServico: '' }] }) });
  PossivelLead.deleteMany = async (f) => { removidosPossiveis.push(...f._id.$in); };
  Column.findOne = (q) => Object.assign(Promise.resolve({ _id: 'col-' + q.userId, userId: q.userId, tipo: 'aberto' }), { sort: async () => ({ _id: 'col-' + q.userId, userId: q.userId, tipo: 'aberto' }) });
  Column.find = (q) => ({ sort: async () => [{ _id: 'col-' + q.userId, userId: q.userId, tipo: 'aberto', nome: 'Novos' }] });
  Column.findById = async () => null;
  Card.findOne = () => ({ sort: async () => null });
  Card.create = async (d) => { const c = { _id: 'k' + criados.length, ...d, toJSON() { return { id: this._id, ...d }; } }; criados.push(c); return c; };
  Card.findOneAndDelete = async (f) => { excluidos.push(f); return { cliente: 'X' }; };
  return { criados, removidosPossiveis, excluidos };
}

test('passar todos os possíveis leads: mês de venda vazio, início de contato = hoje (dia completo)', async () => {
  const { criados, removidosPossiveis } = preparar();
  const r = await chamar('/api/possiveis-leads', possiveisRouter, 'POST', '/promover-lote', SOLO, {});
  assert.equal(r.status, 201);
  assert.equal(r.corpo.total, 2);
  assert.equal(criados.length, 2);
  for (const c of criados) {
    assert.equal(c.mes, '');
    assert.equal(c.mesInicioContato, hojeBR());
    assert.match(c.mesInicioContato, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(String(c.userId), SOLO);
  }
  assert.equal(criados[1].cliente, '1598'); // sem nome: usa o telefone
  assert.deepEqual(removidosPossiveis, ['p1', 'p2']);
});

test('gestor manda os possíveis leads para uma pessoa da equipe; membro não pode', async () => {
  const { criados } = preparar();
  const ok = await chamar('/api/possiveis-leads', possiveisRouter, 'POST', '/promover-lote', GESTOR, { atribuirParaId: MEMBRO });
  assert.equal(ok.status, 201);
  assert.equal(ok.corpo.destinoNome, 'Ana');
  assert.equal(String(criados[0].userId), MEMBRO);
  assert.equal(String(criados[0].atribuidoPorId), GESTOR);
  const proibido = await chamar('/api/possiveis-leads', possiveisRouter, 'POST', '/promover-lote', MEMBRO, { atribuirParaId: GESTOR });
  assert.equal(proibido.status, 403);
});

test('em equipe, só o gestor exclui leads', async () => {
  const { excluidos } = preparar();
  const id = 'f'.repeat(24);
  assert.equal((await chamar('/api/cards', cardsRouter, 'DELETE', `/${id}`, MEMBRO)).status, 403);
  assert.equal(excluidos.length, 0);
  assert.equal((await chamar('/api/cards', cardsRouter, 'DELETE', `/${id}`, GESTOR)).status, 204);
  assert.equal((await chamar('/api/cards', cardsRouter, 'DELETE', `/${id}`, SOLO)).status, 204); // quem não é de equipe continua podendo
  assert.equal(excluidos.length, 2);
});

test('transferir em lote: só o gestor, e precisa escolher outra pessoa', async () => {
  preparar();
  assert.equal((await chamar('/api/cards', cardsRouter, 'POST', '/transferir-lote', MEMBRO, { ids: ['a'.repeat(24)], atribuirParaId: GESTOR })).status, 403);
  assert.equal((await chamar('/api/cards', cardsRouter, 'POST', '/transferir-lote', GESTOR, { ids: [], atribuirParaId: MEMBRO })).status, 400);
  assert.equal((await chamar('/api/cards', cardsRouter, 'POST', '/transferir-lote', GESTOR, { ids: ['a'.repeat(24)], atribuirParaId: GESTOR })).status, 400);
});

test('hojeBR usa o dia de Brasília (23h em Brasília ainda é o mesmo dia)', () => {
  assert.equal(hojeBR(new Date('2026-10-22T02:30:00Z')), '2026-10-21'); // 23:30 do dia 21 em Brasília
  assert.equal(hojeBR(new Date('2026-10-22T12:00:00Z')), '2026-10-22');
});
