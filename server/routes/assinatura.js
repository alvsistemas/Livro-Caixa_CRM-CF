/* /api/assinatura — plano, pagamento e avisos do Asaas.

   GET  /               situação da assinatura de quem está logado (e os planos)
   POST /assinar        { plano, ciclo, nome, cpfCnpj } -> cria a assinatura no Asaas e devolve o link da fatura
   POST /trocar-plano   { plano, ciclo }  (ciclo: "mensal" ou "anual")
   POST /cancelar       cancela as próximas cobranças (o que já foi pago continua valendo)
   POST /atualizar      consulta o Asaas agora ("já paguei")
   POST /webhook        avisos do Asaas (sem login; confere o token no header asaas-access-token)
   POST /validar-saque  "Validação de saque via Webhook" do Asaas: RECUSA todo saque pedido pela API.
                        O Livro-Caixa nunca saca nem transfere dinheiro; se alguém roubar a chave da
                        API, não consegue tirar dinheiro da conta. Saques pelo site/app do Asaas
                        continuam normais (com o token SMS/app do próprio Asaas). */
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
  // preços que esta pessoa veria (com desconto pessoal ou promoção para novos)
  let precos = null;
  if (s.cobranca && s.status !== 'cortesia') {
    const linha = await comoSistema(() => require('../db/pool').query('SELECT * FROM assinaturas WHERE user_id = $1', [userId])).then((r) => r.rows[0]);
    precos = await comoSistema(() => A.precosPara(linha));
  }
  return { ...s, ...(precos || {}), ambiente: s.cobranca ? ambiente() : null, nome: (user && user.nome) || '', email: (user && user.email) || '' };
}

/* ---------- aviso do Asaas ---------- */
function tokenConfere(recebido, esperado = process.env.ASAAS_WEBHOOK_TOKEN || '') {
  if (!esperado || !recebido) return false;
  const a = Buffer.from(String(recebido));
  const b = Buffer.from(esperado);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const { enviarAlertaTelegram } = require('../utils/telegramAlerta');

router.post('/validar-saque', (req, res) => {
  const corpo = req.body || {};
  const tipo = String(corpo.type || 'desconhecido');
  const doAsaas = tokenConfere(req.get('asaas-access-token'), process.env.ASAAS_SAQUE_TOKEN || '');
  const objeto = corpo[Object.keys(corpo).find((k) => k !== 'type')] || {};
  const valor = objeto && objeto.value != null ? ` de R$ ${Number(objeto.value).toFixed(2).replace('.', ',')}` : '';
  // Isto só acontece se alguém usar a chave da API para tirar dinheiro: sempre vale um alerta.
  const alerta = doAsaas
    ? `ALERTA: um saque (${tipo})${valor} foi pedido pela API do Asaas e foi RECUSADO. O Livro-Caixa nunca faz saques: troque a chave da API no Asaas agora.`
    : `Chamada falsa na validação de saque (token errado), tipo ${tipo}. Recusada.`;
  console.error(alerta);
  enviarAlertaTelegram(alerta).catch(() => {});
  // Qualquer resposta diferente de APPROVED já cancela o saque; mesmo assim, recusa explicitamente.
  res.status(200).json({ status: 'REFUSED', refuseReason: 'Saques pela API estão bloqueados nesta conta. Use o site ou o aplicativo do Asaas.' });
});

router.post('/webhook', async (req, res) => {
  if (!tokenConfere(req.get('asaas-access-token'))) {
    return res.status(401).json({ error: 'Token do webhook inválido.' });
  }
  const evento = req.body || {};
  try {
    const novo = await comoSistema(() => A.registrarEvento(evento));
    if (novo && /^ACCESS_TOKEN/.test(String(evento.event || ''))) {
      const msg = `Asaas: aviso sobre a chave da API (${evento.event}). Confira a chave no painel do Asaas e, se precisar, gere outra e troque ASAAS_API_KEY no Render.`;
      console.error(msg);
      enviarAlertaTelegram(msg).catch(() => {});
    }
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
    const { plano, ciclo, nome, cpfCnpj } = req.body || {};
    const r = await comoSistema(() => A.assinar(req.userId, { plano, ciclo: ciclo || 'mensal', nome, cpfCnpj, email: user && user.email }));
    res.json({ ...r, situacao: await situacaoCompleta(req.userId) });
  } catch (err) { responderErro(res, err, 'assinar'); }
});

router.post('/trocar-plano', async (req, res) => {
  try {
    const { plano, ciclo } = req.body || {};
    await comoSistema(() => A.trocarPlano(req.userId, { plano, ciclo }));
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
