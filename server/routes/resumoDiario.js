const express = require('express');
const auth = require('../middleware/auth');
const User = require('../models/User');
const { emailConfigurado } = require('../utils/email');
const { enviarResumoDe } = require('../utils/resumoDiario');

const router = express.Router();
router.use(auth);

// GET /api/resumo-diario -> estado do resumo por e-mail da pessoa logada
router.get('/', async (req, res) => {
  try {
    const u = await User.findById(req.userId).select('email resumoDiarioEmail');
    res.json({ ativo: !!(u && u.resumoDiarioEmail), emailDisponivel: emailConfigurado(), email: u ? u.email : '' });
  } catch (e) { res.status(500).json({ error: 'Erro ao carregar a configuração.' }); }
});

// PUT /api/resumo-diario -> liga/desliga
router.put('/', async (req, res) => {
  try {
    if (!emailConfigurado()) return res.status(400).json({ error: 'O envio de e-mail não está configurado neste servidor.' });
    const ativo = !!(req.body && req.body.ativo);
    await User.findByIdAndUpdate(req.userId, { resumoDiarioEmail: ativo });
    res.json({ ativo });
  } catch (e) { res.status(500).json({ error: 'Erro ao salvar a configuração.' }); }
});

// POST /api/resumo-diario/enviar-agora -> manda o resumo agora (pra testar)
router.post('/enviar-agora', async (req, res) => {
  try {
    const u = await User.findById(req.userId);
    if (!u) return res.status(404).json({ error: 'Usuário não encontrado.' });
    await enviarResumoDe(u);
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: e.message || 'Não foi possível enviar agora.' }); }
});

module.exports = router;
