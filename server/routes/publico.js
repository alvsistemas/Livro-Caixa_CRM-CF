/* /api/publico — informações abertas, sem login, para a página de divulgação.
   GET /precos  planos, preços (mensal e anual), dias de teste grátis e a promoção para
                novos clientes ligada no Painel do dono. A página de divulgação usa isso pra
                nunca mostrar um preço diferente do que o sistema cobra (e, de quebra, a
                chamada "acorda" o servidor enquanto a pessoa ainda está lendo). */
const express = require('express');
const A = require('../utils/assinatura');

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

module.exports = router;
