const express = require('express');
const auth = require('../middleware/auth');
const { validarSecao, carregarFinanceiro, salvarSecaoFinanceiro } = require('../utils/financeiro');
const { query } = require('../db/pool');

const router = express.Router();
router.use(auth); // tudo do Controle financeiro exige login

// GET /api/financeiro -> todos os dados do Controle financeiro do usuário
router.get('/', async (req, res) => {
  try {
    res.json({ dados: await carregarFinanceiro(req.userId) });
  } catch (err) {
    console.error('Erro ao carregar o Controle financeiro:', err.message);
    res.status(500).json({ error: 'Erro ao carregar o Controle financeiro.' });
  }
});

// PUT /api/financeiro/:secao -> substitui uma seção inteira (transacoes, cartoes,
// investimentos, objetivos, perfil ou config). Corpo: { valor: ... }
router.put('/:secao', async (req, res) => {
  try {
    const { secao } = req.params;
    const resultado = validarSecao(secao, req.body ? req.body.valor : undefined);
    if (!resultado.ok) return res.status(400).json({ error: resultado.erro });
    await salvarSecaoFinanceiro(req.userId, secao, resultado.valor);
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
