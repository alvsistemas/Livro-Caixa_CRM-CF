/* /api/dono — Painel do dono: clientes, assinaturas e saúde do sistema.
   Só para donos (DONOS_EMAILS no Render + os adicionados pelo painel).

   GET    /sou            { dono: true|false } (qualquer pessoa logada; decide se mostra o link)
   GET    /resumo         números dos clientes e assinaturas + lista de clientes
   GET    /saude          servidor, banco, erros, avisos do Asaas, integrações
   PUT    /clientes/:id/desconto  { percentual, meses|null } desconto pessoal (0 = tirar)
   GET    /promocao       promoção para novos clientes
   PUT    /promocao       { ativa, percentual, meses|null, validaAte|null }
   GET    /donos          lista de donos
   POST   /donos          { email } adiciona um dono
   DELETE /donos/:email   remove um dono (os fixos não) */
const express = require('express');
const auth = require('../middleware/auth');
const User = require('../models/User');
const { query } = require('../db/pool');
const { comoSistema } = require('../db/contexto');
const D = require('../utils/donos');
const A = require('../utils/assinatura');
const { ambiente, problemaNaConfiguracao } = require('../utils/asaas');
const { iaConfigurada } = require('../utils/ia');
const { emailConfigurado } = require('../utils/email');
const { pushConfigurado } = require('../utils/push');

const router = express.Router();
router.use(auth);

async function emailDe(userId) {
  const u = await comoSistema(() => User.findById(userId).select('email'));
  return u ? u.email : '';
}

router.get('/sou', async (req, res) => {
  try { res.json({ dono: await D.ehDono(await emailDe(req.userId)) }); }
  catch (err) { res.json({ dono: false }); }
});

// daqui pra baixo, só dono
router.use(async (req, res, next) => {
  try {
    req.emailDoDono = await emailDe(req.userId);
    if (!(await D.ehDono(req.emailDoDono))) return res.status(403).json({ error: 'Só os donos do sistema podem abrir este painel.' });
    next();
  } catch (err) {
    res.status(503).json({ error: 'O servidor está ocupado. Tente de novo em instantes.', tentarDeNovo: true });
  }
});

const DIA = 86400000;

// Em que situação cada pessoa está (função pura, testada à parte)
function situacaoDoCliente(linha, { email, dono, liberadoPorEmail, ligada, agora = new Date() }) {
  if (dono) return { chave: 'dono', rotulo: 'Dono' };
  if (!ligada) return { chave: 'livre', rotulo: 'Liberado' };
  if (liberadoPorEmail || (linha && linha.status === 'cortesia')) return { chave: 'cortesia', rotulo: 'Cortesia' };
  if (!linha) return { chave: 'sem_acesso', rotulo: 'Ainda não entrou' };
  const s = A.calcularAcesso(linha, { agora, email: '', ligada: true });
  const pagoAte = [linha.pago_ate, linha.pago_ate_base].filter(Boolean).map((d) => new Date(d).getTime()).sort((a, b) => b - a)[0] || 0;
  if (s.liberado) {
    if (pagoAte && pagoAte >= agora.getTime()) {
      return linha.status === 'cancelada' ? { chave: 'cancelou', rotulo: 'Cancelou, com acesso' } : { chave: 'pagante', rotulo: 'Pagando' };
    }
    if (s.emTolerancia) return pagoAte ? { chave: 'atrasado', rotulo: 'Atrasado, na tolerância' } : { chave: 'aguardando', rotulo: 'Assinou, falta pagar' };
    if (s.emTeste) return s.temAssinatura ? { chave: 'teste_assinou', rotulo: 'No teste, já assinou' } : { chave: 'teste', rotulo: 'No teste grátis' };
  }
  const motivos = { teste_acabou: 'Teste acabou sem assinar', aguardando_pagamento: 'Assinou e não pagou', pagamento_atrasado: 'Bloqueado por atraso', cancelada: 'Cancelou' };
  return { chave: 'bloqueado', rotulo: motivos[s.motivo] || 'Bloqueado', motivo: s.motivo };
}

router.get('/resumo', async (req, res) => {
  try {
    const agora = new Date();
    const { rows } = await comoSistema(() => query(
      `SELECT a.*, u.id, u.nome, u.email, u.created_at AS cadastro
         FROM usuarios u LEFT JOIN assinaturas a ON a.user_id = u.id
        ORDER BY u.created_at DESC`
    ));
    const ligada = A.cobrancaLigada();
    const liberados = A.emailsLiberados();
    const fixos = D.donosFixos();
    const adicionados = new Set((await D.listarDonos()).map((d) => d.email));
    const contagem = {};
    const porPlano = { essencial: 0, completo: 0 };
    let receitaMensal = 0;
    let anuais = 0;
    let testeAcabou = 0;
    let testeAcabouEPagou = 0;
    const clientes = rows.map((r) => {
      const email = String(r.email || '').toLowerCase();
      const dono = fixos.includes(email) || adicionados.has(email);
      const linha = r.teste_ate ? r : null;
      const sit = situacaoDoCliente(linha, { email, dono, liberadoPorEmail: liberados.includes(email), ligada, agora });
      contagem[sit.chave] = (contagem[sit.chave] || 0) + 1;
      if (sit.chave === 'pagante' || sit.chave === 'atrasado') {
        const plano = A.PLANOS[r.plano] ? r.plano : 'completo';
        porPlano[plano]++;
        if (r.ciclo === 'anual') anuais++;
        // receita em "equivalente mensal": o anual entra dividido por 12, já com o desconto
        const valor = A.valorDevido(r, r.proximo_vencimento instanceof Date ? r.proximo_vencimento.toISOString().slice(0, 10) : r.proximo_vencimento);
        receitaMensal += r.ciclo === 'anual' ? valor / 12 : valor;
      }
      // conversão: entre quem já terminou o teste (sem contar donos e cortesias), quantos pagaram alguma vez
      if (linha && !dono && sit.chave !== 'cortesia' && new Date(r.teste_ate).getTime() < agora.getTime()) {
        testeAcabou++;
        if (r.pago_ate || r.pago_ate_base) testeAcabouEPagou++;
      }
      const pagoAte = [r.pago_ate, r.pago_ate_base].filter(Boolean).sort((a, b) => new Date(b) - new Date(a))[0] || null;
      return {
        id: r.id, nome: r.nome || '', email: r.email, cadastro: r.cadastro,
        ciclo: linha && r.asaas_assinatura_id ? (r.ciclo || 'mensal') : null,
        desconto: linha && Number(r.desconto_percentual) > 0
          ? { percentual: Number(r.desconto_percentual), meses: r.desconto_meses, ate: r.desconto_ate, origem: r.desconto_origem }
          : null,
        situacao: sit.chave, rotulo: sit.rotulo,
        plano: linha && r.asaas_assinatura_id ? r.plano : null,
        testeAte: r.teste_ate, pagoAte, proximoVencimento: r.proximo_vencimento,
      };
    });
    const desde = (dias) => rows.filter((r) => agora - new Date(r.cadastro) <= dias * DIA).length;
    res.json({
      cobranca: ligada,
      ambiente: ligada ? ambiente() : null,
      geradoEm: agora.toISOString(),
      totais: {
        cadastros: rows.length,
        cadastros7d: desde(7),
        cadastros30d: desde(30),
        emTeste: (contagem.teste || 0) + (contagem.teste_assinou || 0),
        pagantes: (contagem.pagante || 0) + (contagem.atrasado || 0),
        atrasados: contagem.atrasado || 0,
        aguardando: contagem.aguardando || 0,
        cancelaram: contagem.cancelou || 0,
        bloqueados: contagem.bloqueado || 0,
        cortesias: (contagem.cortesia || 0) + (contagem.dono || 0),
        semAcesso: contagem.sem_acesso || 0,
        porPlano,
        anuais,
        receitaMensal: Math.round(receitaMensal * 100) / 100,
        testeAcabou,
        testeAcabouEPagou,
        conversao: testeAcabou ? Math.round((testeAcabouEPagou / testeAcabou) * 1000) / 10 : null,
      },
      planos: A.listaDePlanos(),
      promocao: await comoSistema(() => A.lerConfig('promocao_novos')).catch(() => null),
      clientes: clientes.slice(0, 500),
    });
  } catch (err) {
    console.error('Painel do dono (resumo):', err);
    res.status(500).json({ error: 'Não foi possível montar o resumo.' });
  }
});

router.get('/saude', async (req, res) => {
  try {
    const inicio = Date.now();
    let bancoOk = true; let bancoMs = null;
    try { await comoSistema(() => query('SELECT 1')); bancoMs = Date.now() - inicio; } catch (e) { bancoOk = false; }
    const sistema = (sql, p) => comoSistema(() => query(sql, p)).then((r) => r.rows).catch(() => []);
    const [erros24h, erros7d, ultimosErros, avisos24h, ultimosAvisos] = await Promise.all([
      sistema("SELECT count(*)::int AS n FROM erros WHERE created_at > now() - interval '1 day'"),
      sistema("SELECT count(*)::int AS n FROM erros WHERE created_at > now() - interval '7 days'"),
      sistema('SELECT mensagem, rota, tipo, created_at FROM erros ORDER BY created_at DESC LIMIT 15'),
      sistema("SELECT count(*)::int AS n FROM assinatura_eventos WHERE recebido_em > now() - interval '1 day'"),
      sistema(`SELECT e.tipo, e.recebido_em, u.email FROM assinatura_eventos e LEFT JOIN usuarios u ON u.id = e.user_id
                ORDER BY e.recebido_em DESC LIMIT 10`),
    ]);
    const mem = process.memoryUsage();
    res.json({
      servidor: {
        noArDesde: new Date(Date.now() - process.uptime() * 1000).toISOString(),
        node: process.version,
        memoriaMb: Math.round(mem.rss / 1048576),
      },
      banco: { ok: bancoOk, ms: bancoMs },
      erros: {
        ultimas24h: (erros24h[0] || {}).n || 0,
        ultimos7d: (erros7d[0] || {}).n || 0,
        recentes: ultimosErros.map((e) => ({ mensagem: String(e.mensagem).slice(0, 300), rota: e.rota, tipo: e.tipo, quando: e.created_at })),
      },
      cobranca: {
        ligada: A.cobrancaLigada(),
        ambiente: process.env.ASAAS_API_KEY ? ambiente() : null,
        problema: process.env.ASAAS_API_KEY ? problemaNaConfiguracao() : null,
        tokenWebhook: !!process.env.ASAAS_WEBHOOK_TOKEN,
        avisos24h: (avisos24h[0] || {}).n || 0,
        ultimosAvisos: ultimosAvisos.map((a) => ({ tipo: a.tipo, quando: a.recebido_em, email: a.email || null })),
        ultimaConferencia: A.conferencia.ultima,
        conferidas: A.conferencia.conferidas,
        falhasNaConferencia: A.conferencia.falhas,
      },
      integracoes: {
        ia: iaConfigurada(),
        email: emailConfigurado(),
        push: pushConfigurado(),
        googleAgenda: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
        telegram: !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID),
      },
    });
  } catch (err) {
    console.error('Painel do dono (saúde):', err);
    res.status(500).json({ error: 'Não foi possível conferir a saúde do sistema.' });
  }
});

/* ---------- descontos ---------- */
router.put('/clientes/:id/desconto', async (req, res) => {
  try {
    if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) return res.status(400).json({ error: 'Cliente inválido.' });
    const existe = await comoSistema(() => query('SELECT 1 FROM usuarios WHERE id = $1', [req.params.id]));
    if (!existe.rows.length) return res.status(404).json({ error: 'Cliente não encontrado.' });
    const { percentual, meses } = req.body || {};
    await comoSistema(() => A.definirDescontoPessoal(req.params.id, { percentual, meses }));
    res.json({ ok: true });
  } catch (err) {
    if (err && err.status >= 400 && err.status < 500) return res.status(err.status === 404 ? 400 : err.status).json({ error: err.message });
    console.error('Painel do dono (desconto):', err);
    res.status(502).json({ error: (err && err.message) || 'Não foi possível aplicar o desconto agora.' });
  }
});

router.get('/promocao', async (req, res) => {
  try { res.json({ promocao: await comoSistema(() => A.lerConfig('promocao_novos')) }); }
  catch (err) { res.status(500).json({ error: 'Não foi possível ler a promoção.' }); }
});

router.put('/promocao', async (req, res) => {
  try { res.json({ promocao: await comoSistema(() => A.definirPromocao(req.body || {})) }); }
  catch (err) {
    if (err && err.status >= 400 && err.status < 500) return res.status(err.status).json({ error: err.message });
    console.error('Painel do dono (promoção):', err);
    res.status(500).json({ error: 'Não foi possível salvar a promoção.' });
  }
});

router.get('/donos', async (req, res) => {
  try { res.json({ donos: await D.listarDonos(), eu: D.normalizar(req.emailDoDono) }); }
  catch (err) { res.status(500).json({ error: 'Não foi possível listar os donos.' }); }
});

router.post('/donos', async (req, res) => {
  try {
    await D.adicionarDono((req.body || {}).email, req.emailDoDono);
    res.json({ donos: await D.listarDonos(), eu: D.normalizar(req.emailDoDono) });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.status ? err.message : 'Não foi possível adicionar.' });
  }
});

router.delete('/donos/:email', async (req, res) => {
  try {
    await D.removerDono(req.params.email, req.emailDoDono);
    res.json({ donos: await D.listarDonos(), eu: D.normalizar(req.emailDoDono) });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.status ? err.message : 'Não foi possível remover.' });
  }
});

module.exports = router;
module.exports.situacaoDoCliente = situacaoDoCliente;
