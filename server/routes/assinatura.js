/* /api/assinatura — plano, pagamento e avisos do Asaas.

   GET  /               situação da assinatura de quem está logado (e os planos)
   POST /assinar        { plano, nome, cpfCnpj } -> cria a assinatura no Asaas e devolve o link da fatura
   POST /trocar-plano   { plano }
   POST /cancelar       cancela as próximas cobranças (o que já foi pago continua valendo)
   POST /atualizar      consulta o Asaas agora ("já paguei")
   POST /webhook        avisos do Asaas (sem login; confere o token no header asaas-access-token) */
const crypto = require('crypto');
const express = require('express');
const auth = require('../middleware/auth');
const User = require('../models/User');
const { comoSistema } = require('../db/contexto');
const A = require('../utils/assinatura');
const { ambiente } = require('../utils/asaas');

const router = express.Router();

function responderErro(res, err, contexto) {
  if (err && typeof err.status === 'number' && err.status >= 400 && err.status < 500) {
    return res.status(err.status === 404 ? 400 : err.status).json({ error: err.message });
  }
  console.error(`Assinatura (${contexto}):`, err);
  return res.status(502).json({ error: (err && err.status === 0 && err.message) || 'O Asaas não respondeu como esperado. Nada foi cobrado; tente de novo em instantes.' });
}

async function situacaoCompleta(userId) {
  const user = await comoSistema(() => User.findById(userId).select('email nome'));
  A.esquecer(userId);
  const s = await comoSistema(() => A.situacaoDe(userId, user && user.email));
  return { ...s, ambiente: s.cobranca ? ambiente() : null, nome: (user && user.nome) || '', email: (user && user.email) || '' };
}

/* ---------- aviso do Asaas ---------- */
function tokenConfere(recebido) {
  const esperado = process.env.ASAAS_WEBHOOK_TOKEN || '';
  if (!esperado || !recebido) return false;
  const a = Buffer.from(String(recebido));
  const b = Buffer.from(esperado);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

router.post('/webhook', async (req, res) => {
  if (!tokenConfere(req.get('asaas-access-token'))) {
    return res.status(401).json({ error: 'Token do webhook inválido.' });
  }
  const evento = req.body || {};
  try {
    const novo = await comoSistema(() => A.registrarEvento(evento));
    // responde logo (o Asaas espera um 200 rápido) e consulta o Asaas em seguida
    res.status(200).json({ recebido: true, repetido: !novo });
    if (novo) {
      comoSistema(() => A.processarEvento(evento)).catch((err) => {
        // a conferência de hora em hora (sincronizarPendentes) corrige se isto falhar
        console.error('Falha ao processar aviso do Asaas:', err.message);
      });
    }
  } catch (err) {
    console.error('Falha ao gravar aviso do Asaas:', err);
    if (!res.headersSent) res.status(500).json({ error: 'Falha ao gravar.' });
  }
});

/* ---------- rotas de quem está logado ---------- */
router.use(auth);

router.get('/', async (req, res) => {
  try {
    res.json(await situacaoCompleta(req.userId));
  } catch (err) { responderErro(res, err, 'situação'); }
});

router.post('/assinar', async (req, res) => {
  try {
    const user = await comoSistema(() => User.findById(req.userId).select('email'));
    const { plano, nome, cpfCnpj } = req.body || {};
    const r = await comoSistema(() => A.assinar(req.userId, { plano, nome, cpfCnpj, email: user && user.email }));
    res.json({ ...r, situacao: await situacaoCompleta(req.userId) });
  } catch (err) { responderErro(res, err, 'assinar'); }
});

router.post('/trocar-plano', async (req, res) => {
  try {
    await comoSistema(() => A.trocarPlano(req.userId, (req.body || {}).plano));
    res.json({ situacao: await situacaoCompleta(req.userId) });
  } catch (err) { responderErro(res, err, 'trocar plano'); }
});

router.post('/cancelar', async (req, res) => {
  try {
    await comoSistema(() => A.cancelar(req.userId));
    res.json({ situacao: await situacaoCompleta(req.userId) });
  } catch (err) { responderErro(res, err, 'cancelar'); }
});

router.post('/atualizar', async (req, res) => {
  try {
    await comoSistema(() => A.sincronizar(req.userId));
    res.json({ situacao: await situacaoCompleta(req.userId) });
  } catch (err) { responderErro(res, err, 'atualizar'); }
});

module.exports = router;
