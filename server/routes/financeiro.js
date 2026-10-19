const express = require('express');
const auth = require('../middleware/auth');
const { validarSecao, carregarFinanceiro, salvarSecaoFinanceiro } = require('../utils/financeiro');
const { query } = require('../db/pool');
const Card = require('../models/Card');
const Column = require('../models/Column');
const Contrato = require('../models/Contrato');
const { isValidId } = require('../db/ids');
const fechamento = require('../utils/fechamento');

const router = express.Router();
router.use(auth); // tudo do Controle financeiro exige login

// GET /api/financeiro -> todos os dados do Controle financeiro do usuário
router.get('/', async (req, res) => {
  try {
    // carregadoEm (hora do servidor): volta no salvamento, pra não apagar lançamentos
    // que o CRM criou depois que esta tela abriu
    const carregadoEm = new Date().toISOString();
    res.json({ dados: await carregarFinanceiro(req.userId), carregadoEm });
  } catch (err) {
    console.error('Erro ao carregar o Controle financeiro:', err.message);
    res.status(500).json({ error: 'Erro ao carregar o Controle financeiro.' });
  }
});

/* ---------- Fechamento da venda (card ganho no CRM -> receitas no financeiro) ---------- */

// GET /api/financeiro/fechamento/modo -> { modo: vendas|comissoes|nenhum, perguntado }
router.get('/fechamento/modo', async (req, res) => {
  try { res.json(await fechamento.lerModo(req.userId)); } catch (err) {
    console.error('Erro ao ler o modo da integração:', err.message);
    res.status(500).json({ error: 'Erro ao carregar.' });
  }
});
// PUT /api/financeiro/fechamento/modo { modo }
router.put('/fechamento/modo', async (req, res) => {
  try { res.json(await fechamento.definirModo(req.userId, req.body && req.body.modo)); } catch (err) {
    if (err instanceof fechamento.ErroFechamento) return res.status(400).json({ error: err.message });
    console.error('Erro ao salvar o modo da integração:', err.message);
    res.status(500).json({ error: 'Erro ao salvar.' });
  }
});

// PUT /api/financeiro/fechamento/taxas { credito: 3.5, imposto: 6, pix: null, ... } -> % guardados
router.put('/fechamento/taxas', async (req, res) => {
  try { res.json({ taxas: await fechamento.salvarTaxas(req.userId, req.body || {}) }); } catch (err) {
    if (err instanceof fechamento.ErroFechamento) return res.status(400).json({ error: err.message });
    console.error('Erro ao salvar as taxas:', err.message);
    res.status(500).json({ error: 'Erro ao salvar as taxas.' });
  }
});

async function cardDoUsuario(req, res) {
  const id = req.params.cardId;
  if (!isValidId(id)) { res.status(400).json({ error: 'Cliente inválido.' }); return null; }
  const card = await Card.findOne({ _id: id, userId: req.userId });
  if (!card) { res.status(404).json({ error: 'Cliente não encontrado.' }); return null; }
  return card;
}

// GET /api/financeiro/fechamento/:cardId -> fechamento atual + lançamentos ligados
router.get('/fechamento/:cardId', async (req, res) => {
  try {
    const card = await cardDoUsuario(req, res);
    if (!card) return;
    const [lancamentos, regra, contrato] = await Promise.all([
      fechamento.lancamentosDoCard(req.userId, card._id),
      fechamento.regraDoCard(req.userId, card),
      Contrato.findOne({ cardId: card._id, userId: req.userId }),
    ]);
    res.json({
      fechamento: card.fechamento || null, pendente: !!card.fechamentoPendente, lancamentos, regra,
      // comissão feita à mão (não pelo Pipeline) não é recalculada: a janela mostra o valor dela
      comissaoManual: contrato && !contrato.geradoAutomaticamente ? fechamento.totalDaComissao(contrato) : null,
    });
  } catch (err) {
    console.error('Erro ao ler o fechamento:', err.message);
    res.status(500).json({ error: 'Erro ao carregar o fechamento.' });
  }
});

// POST /api/financeiro/fechamento/:cardId { valorFinal|descontoPct, forma, parcelas, entrada, primeiraData, meio, recebido }
router.post('/fechamento/:cardId', async (req, res) => {
  try {
    const card = await cardDoUsuario(req, res);
    if (!card) return;
    const coluna = await Column.findOne({ _id: card.columnId, userId: req.userId });
    if (!coluna || coluna.tipo !== 'ganho') return res.status(400).json({ error: 'O fechamento é feito quando o cliente está numa coluna de ganho.' });
    const r = await fechamento.salvarFechamento(req.userId, card, req.body || {});
    const atualizado = await Card.findOne({ _id: card._id, userId: req.userId });
    res.json({ card: atualizado.toJSON(), fechamento: r.fechamento, lancamentos: r.lancamentos.length, substituidos: r.substituidos });
  } catch (err) {
    if (err instanceof fechamento.ErroFechamento) return res.status(400).json({ error: err.message });
    console.error('Erro ao salvar o fechamento:', err.message);
    res.status(500).json({ error: 'Erro ao salvar o fechamento. Tente de novo.' });
  }
});

// POST /api/financeiro/fechamento/:cardId/cancelar { devolucao?: { valor, data, motivo } }
// A venda foi desfeita (o card saiu de Ganho): apaga o que não foi recebido
router.post('/fechamento/:cardId/cancelar', async (req, res) => {
  try {
    const card = await cardDoUsuario(req, res);
    if (!card) return;
    const coluna = await Column.findOne({ _id: card.columnId, userId: req.userId });
    if (coluna && coluna.tipo === 'ganho') return res.status(400).json({ error: 'O cliente ainda está numa coluna de ganho. Para corrigir valores, refaça o fechamento.' });
    const r = await fechamento.cancelarVenda(req.userId, card, req.body || {});
    const atualizado = await Card.findOne({ _id: card._id, userId: req.userId });
    res.json({ card: atualizado.toJSON(), ...r });
  } catch (err) {
    if (err instanceof fechamento.ErroFechamento) return res.status(400).json({ error: err.message });
    console.error('Erro ao desfazer a venda:', err.message);
    res.status(500).json({ error: 'Erro ao desfazer a venda. Tente de novo.' });
  }
});

// POST /api/financeiro/fechamento/:cardId/devolucao { valor, data, motivo }
router.post('/fechamento/:cardId/devolucao', async (req, res) => {
  try {
    const card = await cardDoUsuario(req, res);
    if (!card) return;
    res.status(201).json(await fechamento.registrarDevolucao(req.userId, card, req.body || {}));
  } catch (err) {
    if (err instanceof fechamento.ErroFechamento) return res.status(400).json({ error: err.message });
    console.error('Erro ao registrar a devolução:', err.message);
    res.status(500).json({ error: 'Erro ao registrar a devolução. Tente de novo.' });
  }
});

// POST /api/financeiro/fechamento/:cardId/depois -> "Agora não": marca o selo no card
router.post('/fechamento/:cardId/depois', async (req, res) => {
  try {
    const card = await cardDoUsuario(req, res);
    if (!card) return;
    const atualizado = await Card.findOneAndUpdate({ _id: card._id, userId: req.userId }, { fechamentoPendente: !card.fechamento }, { new: true });
    res.json({ card: atualizado.toJSON() });
  } catch (err) {
    console.error('Erro ao adiar o fechamento:', err.message);
    res.status(500).json({ error: 'Erro ao salvar.' });
  }
});

// PUT /api/financeiro/:secao -> substitui uma seção inteira (transacoes, cartoes,
// investimentos, objetivos, perfil ou config). Corpo: { valor: ... }
router.put('/:secao', async (req, res) => {
  try {
    const { secao } = req.params;
    const resultado = validarSecao(secao, req.body ? req.body.valor : undefined);
    if (!resultado.ok) return res.status(400).json({ error: resultado.erro });
    await salvarSecaoFinanceiro(req.userId, secao, resultado.valor, { carregadoEm: req.body.carregadoEm });
    res.json({ ok: true, salvoEm: new Date().toISOString() });
  } catch (err) {
    console.error('Erro ao salvar o Controle financeiro:', err.message);
    res.status(500).json({ error: 'Erro ao salvar. Tente de novo.' });
  }
});

/* ---------- Comprovantes (foto do recibo ou PDF) de um lançamento ---------- */
const TIPOS_COMPROVANTE = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const MAX_BYTES_COMPROVANTE = 3 * 1024 * 1024; // 3 MB por arquivo (as fotos já chegam reduzidas)
const MAX_COMPROVANTES = 1000;
const MAX_BYTES_TOTAL = 300 * 1024 * 1024; // 300 MB por conta
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// GET /api/financeiro/comprovantes?lancamento=ID -> lista (sem o conteúdo)
router.get('/comprovantes', async (req, res) => {
  try {
    const lancamento = String(req.query.lancamento || '').slice(0, 100);
    const { rows } = await query(
      `SELECT id, lancamento_id AS "lancamentoId", nome, tipo, tamanho, created_at AS "criadoEm"
         FROM financeiro_comprovantes WHERE user_id = $1::uuid ${lancamento ? 'AND lancamento_id = $2' : ''}
        ORDER BY created_at`,
      lancamento ? [req.userId, lancamento] : [req.userId]
    );
    res.json({ comprovantes: rows });
  } catch (err) {
    console.error('Erro ao listar comprovantes:', err.message);
    res.status(500).json({ error: 'Erro ao carregar os comprovantes.' });
  }
});

// POST /api/financeiro/comprovantes  { lancamentoId, nome, tipo, dados (base64) }
router.post('/comprovantes', async (req, res) => {
  try {
    const { lancamentoId, nome, tipo, dados } = req.body || {};
    if (!lancamentoId || typeof lancamentoId !== 'string') return res.status(400).json({ error: 'Lançamento não informado.' });
    if (!TIPOS_COMPROVANTE.includes(tipo)) return res.status(400).json({ error: 'Envie uma foto (JPG, PNG) ou um PDF.' });
    if (typeof dados !== 'string' || !dados) return res.status(400).json({ error: 'Arquivo vazio.' });
    const conteudo = Buffer.from(dados.replace(/^data:[^,]*,/, ''), 'base64');
    if (!conteudo.length) return res.status(400).json({ error: 'Arquivo inválido.' });
    if (conteudo.length > MAX_BYTES_COMPROVANTE) return res.status(400).json({ error: 'Arquivo grande demais (máximo 3 MB).' });
    // confere o tipo pelo começo do arquivo, não só pelo que foi declarado
    const assinatura = conteudo.subarray(0, 12);
    const confere = (tipo === 'application/pdf' && assinatura.toString('latin1', 0, 5) === '%PDF-')
      || (tipo === 'image/jpeg' && assinatura[0] === 0xff && assinatura[1] === 0xd8)
      || (tipo === 'image/png' && assinatura.toString('latin1', 1, 4) === 'PNG')
      || (tipo === 'image/webp' && assinatura.toString('latin1', 8, 12) === 'WEBP');
    if (!confere) return res.status(400).json({ error: 'O arquivo não parece ser uma imagem ou PDF válido.' });
    const uso = await query('SELECT count(*)::int AS n, COALESCE(sum(tamanho), 0)::bigint AS bytes FROM financeiro_comprovantes WHERE user_id = $1::uuid', [req.userId]);
    if (uso.rows[0].n >= MAX_COMPROVANTES || Number(uso.rows[0].bytes) + conteudo.length > MAX_BYTES_TOTAL) {
      return res.status(400).json({ error: 'Você atingiu o limite de comprovantes da conta. Apague alguns antigos para enviar novos.' });
    }
    const { rows } = await query(
      `INSERT INTO financeiro_comprovantes (user_id, lancamento_id, nome, tipo, tamanho, conteudo)
       VALUES ($1::uuid, $2, $3, $4, $5, $6) RETURNING id, lancamento_id AS "lancamentoId", nome, tipo, tamanho, created_at AS "criadoEm"`,
      [req.userId, lancamentoId.slice(0, 100), String(nome || 'comprovante').slice(0, 120), tipo, conteudo.length, conteudo]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('Erro ao salvar comprovante:', err.message);
    res.status(500).json({ error: 'Erro ao salvar o comprovante. Tente de novo.' });
  }
});

// GET /api/financeiro/comprovantes/:id -> o arquivo
router.get('/comprovantes/:id', async (req, res) => {
  try {
    if (!UUID_RE.test(req.params.id)) return res.status(400).json({ error: 'Comprovante inválido.' });
    const { rows } = await query('SELECT nome, tipo, conteudo FROM financeiro_comprovantes WHERE user_id = $1::uuid AND id = $2::uuid', [req.userId, req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Comprovante não encontrado.' });
    res.setHeader('Content-Type', rows[0].tipo);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(rows[0].nome)}"`);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(rows[0].conteudo);
  } catch (err) {
    console.error('Erro ao abrir comprovante:', err.message);
    res.status(500).json({ error: 'Erro ao abrir o comprovante.' });
  }
});

// DELETE /api/financeiro/comprovantes/:id  (ou todos de um lançamento: ?lancamento=ID)
router.delete('/comprovantes/:id', async (req, res) => {
  try {
    if (req.params.id === 'do-lancamento') {
      const lancamento = String(req.query.lancamento || '').slice(0, 100);
      if (!lancamento) return res.status(400).json({ error: 'Lançamento não informado.' });
      await query('DELETE FROM financeiro_comprovantes WHERE user_id = $1::uuid AND lancamento_id = $2', [req.userId, lancamento]);
      return res.status(204).end();
    }
    if (!UUID_RE.test(req.params.id)) return res.status(400).json({ error: 'Comprovante inválido.' });
    await query('DELETE FROM financeiro_comprovantes WHERE user_id = $1::uuid AND id = $2::uuid', [req.userId, req.params.id]);
    res.status(204).end();
  } catch (err) {
    console.error('Erro ao apagar comprovante:', err.message);
    res.status(500).json({ error: 'Erro ao apagar o comprovante.' });
  }
});

module.exports = router;
