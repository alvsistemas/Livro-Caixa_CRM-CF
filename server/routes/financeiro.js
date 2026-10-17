const express = require('express');
const auth = require('../middleware/auth');
const Financeiro = require('../models/Financeiro');
const { validarSecao, serializar } = require('../utils/financeiro');

const router = express.Router();
router.use(auth); // tudo do Controle financeiro exige login

// GET /api/financeiro -> todos os dados do Controle financeiro do usuário
router.get('/', async (req, res) => {
  try {
    const doc = await Financeiro.findOne({ userId: req.userId }).lean();
    res.json({ dados: serializar(doc) });
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
    await Financeiro.findOneAndUpdate(
      { userId: req.userId },
      { $set: { [secao]: resultado.valor } },
      { upsert: true, setDefaultsOnInsert: true }
    );
    res.json({ ok: true, salvoEm: new Date().toISOString() });
  } catch (err) {
    console.error('Erro ao salvar o Controle financeiro:', err.message);
    res.status(500).json({ error: 'Erro ao salvar. Tente de novo.' });
  }
});

module.exports = router;
