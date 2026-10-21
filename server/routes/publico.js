/* /api/publico — informações abertas, sem login: a página de divulgação e o cardápio digital.
   GET /precos  planos, preços (mensal e anual), dias de teste grátis e a promoção para
                novos clientes ligada no Painel do dono. A página de divulgação usa isso pra
                nunca mostrar um preço diferente do que o sistema cobra (e, de quebra, a
                chamada "acorda" o servidor enquanto a pessoa ainda está lendo). */
const express = require('express');
const A = require('../utils/assinatura');
const E = require('../utils/estoque');
const F = require('../utils/fidelidade');
const { query } = require('../db/pool');
const { criarMiddlewareLimite } = require('../utils/limiteTaxa');

const router = express.Router();

router.get('/precos', async (req, res) => {
  res.set('Cache-Control', 'public, max-age=300');
  try {
    const promo = await A.promocaoAtual().catch(() => null);
    res.json({
      planos: A.listaDePlanos().map((p) => ({ id: p.id, nome: p.nome, valor: p.valor, valorAnual: p.valorAnual, itens: p.itens })),
      diasTeste: A.diasDeTeste(),
      cobranca: A.cobrancaLigada(),
      promocao: promo ? { percentual: Number(promo.percentual), meses: promo.meses == null ? null : Number(promo.meses), validaAte: promo.validaAte || null } : null,
    });
  } catch (err) {
    console.error('Preços públicos:', err.message);
    res.status(500).json({ error: 'Não foi possível carregar os preços.' });
  }
});

/* ---------- Cardápio digital do restaurante (PDV) ---------- */
// O dono precisa estar com a assinatura em dia pro cardápio ficar no ar
async function restauranteDoSlug(req, res) {
  const row = await E.negocioPorSlug(req.params.slug);
  if (!row) { res.status(404).json({ error: 'Cardápio não encontrado.' }); return null; }
  const s = await A.situacaoDe(String(row.user_id), row.email).catch(() => ({ liberado: true }));
  if (!s.liberado || (s.recursos && s.recursos.restaurante === false)) { res.status(404).json({ error: 'Este cardápio está fora do ar no momento.' }); return null; }
  return row;
}

// GET /api/publico/cardapio/:slug
router.get('/cardapio/:slug', async (req, res) => {
  try {
    const row = await restauranteDoSlug(req, res);
    if (!row) return;
    res.set('Cache-Control', 'no-cache');
    res.json(await E.cardapioPublico(row));
  } catch (err) {
    console.error('Cardápio público:', err.message);
    res.status(500).json({ error: 'Não foi possível carregar o cardápio.' });
  }
});

// POST /api/publico/cardapio/:slug/pedido -> { numero, total, mensagem, whatsapp }
const limitePedido = criarMiddlewareLimite({ janelaMs: 10 * 60 * 1000, max: 12, chaveDe: (req) => `${req.ip}:${req.params.slug}`, mensagem: 'Muitos pedidos seguidos. Aguarde alguns minutos.' });
router.post('/cardapio/:slug/pedido', limitePedido, async (req, res) => {
  try {
    const row = await restauranteDoSlug(req, res);
    if (!row) return;
    res.json(await E.criarPedido(row, req.body || {}));
  } catch (err) {
    if (err instanceof E.ErroEstoque || err instanceof F.ErroFidelidade) return res.status(400).json({ error: err.message });
    console.error('Pedido do cardápio:', err.message);
    res.status(500).json({ error: 'Não foi possível enviar o pedido.' });
  }
});

// POST /api/publico/cardapio/:slug/fidelidade { telefone } -> o que o cliente tem no programa
// (só valores, nenhum dado pessoal; limitado para ninguém ficar testando telefones)
const limiteFidelidade = criarMiddlewareLimite({ janelaMs: 10 * 60 * 1000, max: 20, chaveDe: (req) => `${req.ip}:fid`, mensagem: 'Muitas consultas seguidas. Aguarde alguns minutos.' });
router.post('/cardapio/:slug/fidelidade', limiteFidelidade, async (req, res) => {
  try {
    const row = await restauranteDoSlug(req, res);
    if (!row) return;
    res.json(await E.beneficioPublico(row, (req.body || {}).telefone));
  } catch (err) {
    console.error('Fidelidade no cardápio:', err.message);
    res.status(500).json({ error: 'Não foi possível consultar agora.' });
  }
});

// GET /api/publico/foto/:userId/:produtoId -> foto do produto (cardápio e telas do app)
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
router.get('/foto/:userId/:produtoId', async (req, res) => {
  if (!UUID.test(req.params.userId) || !UUID.test(req.params.produtoId)) return res.status(404).end();
  try {
    const { rows } = await query('SELECT foto, foto_tipo FROM estoque_produtos WHERE user_id = $1::uuid AND id = $2::uuid AND foto IS NOT NULL', [req.params.userId, req.params.produtoId]);
    if (!rows.length) return res.status(404).end();
    res.set('Content-Type', rows[0].foto_tipo || 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=604800, immutable');
    res.send(rows[0].foto);
  } catch (err) {
    res.status(500).end();
  }
});

module.exports = router;
