const express = require('express');
const auth = require('../middleware/auth');
const PushSubscription = require('../models/PushSubscription');
const { pushConfigurado, enviarPush } = require('../utils/push');

const router = express.Router();
router.use(auth);

// GET /api/push/chave -> chave pública (VAPID) que o navegador precisa pra se inscrever
router.get('/chave', (req, res) => {
  if (!pushConfigurado()) return res.status(503).json({ error: 'Notificações push não estão configuradas neste servidor.' });
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY });
});

// POST /api/push/inscrever -> { subscription } (o objeto que o navegador devolve do PushManager)
router.post('/inscrever', async (req, res) => {
  try {
    if (!pushConfigurado()) return res.status(503).json({ error: 'Notificações push não estão configuradas neste servidor.' });
    const sub = req.body && req.body.subscription;
    if (!sub || !sub.endpoint || !sub.keys || !sub.keys.p256dh || !sub.keys.auth) {
      return res.status(400).json({ error: 'Inscrição inválida.' });
    }
    await PushSubscription.findOneAndUpdate(
      { endpoint: sub.endpoint },
      { userId: req.userId, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth }, userAgent: String(req.get('user-agent') || '').slice(0, 200) },
      { upsert: true, setDefaultsOnInsert: true }
    );
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: 'Erro ao ativar as notificações.' });
  }
});

// POST /api/push/cancelar -> { endpoint }
router.post('/cancelar', async (req, res) => {
  try {
    const endpoint = req.body && req.body.endpoint;
    if (!endpoint) return res.status(400).json({ error: 'Informe o endpoint.' });
    await PushSubscription.deleteOne({ endpoint, userId: req.userId });
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: 'Erro ao desativar as notificações.' });
  }
});

// POST /api/push/testar -> manda uma notificação de teste pra todos os aparelhos da conta
router.post('/testar', async (req, res) => {
  try {
    if (!pushConfigurado()) return res.status(503).json({ error: 'Notificações push não estão configuradas neste servidor.' });
    const { enviados } = await enviarPush(req.userId, {
      titulo: 'Livro-Caixa',
      corpo: 'Tudo certo! As notificações estão funcionando neste aparelho.',
      tag: 'teste-push',
      url: '/index.html',
      tipo: 'teste',
    });
    if (!enviados) return res.status(404).json({ error: 'Nenhum aparelho inscrito nesta conta. Ative as notificações primeiro.' });
    res.json({ enviados });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao enviar a notificação de teste.' });
  }
});

module.exports = router;
