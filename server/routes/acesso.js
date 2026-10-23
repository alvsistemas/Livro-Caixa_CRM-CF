/* /api/acesso — quem está usando e a entrada da equipe (ver utils/acesso.js).

   Públicas (sem login), com limite de tentativas:
     GET  /api/acesso/loja/:codigo  -> nome da loja e quem pode entrar (só nome e função)
     POST /api/acesso/entrar        -> { codigo, id, pin } -> token do funcionário (30 dias)
   Com login:
     GET  /api/acesso               -> tipo (dono | funcionario | loja), quem é, permissões e apps
     POST /api/acesso/aparelho-loja -> transforma este aparelho em "aparelho da loja" (dono ou gestor)
     POST /api/acesso/aparelho-normal -> volta ao normal (só o gestor, com o PIN entrado) */
const express = require('express');
const jwt = require('jsonwebtoken');
const auth = require('../middleware/auth');
const A = require('../utils/acesso');
const C = require('../utils/caixa');
const { comoSistema } = require('../db/contexto');
const { query } = require('../db/pool');
const { criarMiddlewareLimite, Limitador } = require('../utils/limiteTaxa');
const { recursosDe } = require('../utils/assinatura');

const router = express.Router();
const JWT_SECRET = () => process.env.JWT_SECRET || 'troque-este-segredo-no-env';

const limiteCodigo = criarMiddlewareLimite({ janelaMs: 15 * 60 * 1000, max: 30, chaveDe: (req) => `cod:${req.ip}`, mensagem: 'Muitas tentativas. Aguarde alguns minutos.' });
const limiteEntrar = criarMiddlewareLimite({ janelaMs: 15 * 60 * 1000, max: 15, chaveDe: (req) => `pin:${req.ip}`, mensagem: 'Muitas tentativas de PIN. Aguarde alguns minutos.' });
// e por pessoa: 5 PINs errados seguidos travam aquela pessoa por 15 minutos (de qualquer lugar)
const porPessoa = new Limitador({ janelaMs: 15 * 60 * 1000, max: 5 });
setInterval(() => porPessoa.limpar(), 60 * 60 * 1000).unref();

router.get('/loja/:codigo', limiteCodigo, async (req, res) => {
  try {
    const r = await comoSistema(async () => {
      const loja = await A.equipeDaLoja(req.params.codigo);
      if (!loja) return null;
      const rec = await recursosDe(loja.userId).catch(() => ({}));
      return { ...loja, semPlano: rec.equipe === false };
    });
    if (!r) return res.status(404).json({ error: 'Código da loja não encontrado. Confira com o gestor.' });
    if (r.semPlano) return res.status(403).json({ error: 'O acesso da equipe não está disponível nesta loja. Fale com o gestor.' });
    res.json({ loja: r.loja, pessoas: r.pessoas });
  } catch (err) {
    console.error('Equipe da loja:', err.message);
    res.status(500).json({ error: 'Não foi possível carregar. Tente de novo.' });
  }
});

router.post('/entrar', limiteEntrar, async (req, res) => {
  const { codigo, id, pin } = req.body || {};
  const chave = `${A.normalizarCodigo(codigo)}:${String(id || '')}`;
  const t = porPessoa.tentar(chave);
  if (!t.permitido) return res.status(429).json({ error: `Muitos PINs errados. Tente de novo em ${Math.ceil(t.retryAposSegundos / 60)} min.` });
  try {
    const r = await comoSistema(async () => {
      const ok = await A.entrarFuncionario({ codigo, id, pin });
      if (ok.erro) return ok;
      const rec = await recursosDe(ok.userId).catch(() => ({}));
      if (rec.equipe === false) return { erro: 'O acesso da equipe não está disponível nesta loja. Fale com o gestor.' };
      return ok;
    });
    if (r.erro) return res.status(400).json({ error: r.erro });
    porPessoa.registros.delete(chave); // acertou: zera as tentativas
    res.json({ token: r.token, user: { id: r.userId, _id: r.userId, nome: r.operador.nome, funcionario: true }, funcionario: r.operador });
  } catch (err) {
    console.error('Entrar como funcionário:', err.message);
    res.status(500).json({ error: 'Não foi possível entrar. Tente de novo.' });
  }
});

// daqui para baixo, com login
router.use(auth);

router.get('/', async (req, res) => {
  const a = req.acesso || { tipo: 'dono', perm: A.TUDO };
  const op = a.operador;
  const pdvOp = a.tipo === 'dono' ? await C.operadorDoPedido(req).catch(() => null) : null;
  res.json({
    tipo: a.tipo,
    operador: op ? { id: op.id, nome: op.nome, papel: op.papel, funcao: A.NOME_PAPEL[op.papel] || op.papel } : null,
    permissoes: a.perm,
    apps: A.appsDe(a.perm),
    gestor: a.tipo === 'dono' || !!(op && op.papel === 'gestor'),
    // dono com "Pedir o PIN" no PDV: quem entrou no caixa (o servidor confere a função dessa pessoa no PDV)
    pdv: pdvOp ? { operador: { id: pdvOp.id, nome: pdvOp.nome, papel: pdvOp.papel }, permissoes: A.permissoesDe(pdvOp) } : null,
  });
});

const podeMudarAparelho = (req) => req.acesso && (req.acesso.tipo === 'dono' || (req.acesso.operador && req.acesso.operador.papel === 'gestor'));
async function versaoDoToken(userId) {
  const { rows } = await query('SELECT token_version FROM usuarios WHERE id = $1::uuid', [userId]);
  return rows[0] ? rows[0].token_version || 0 : 0;
}
// dono, ou um gestor (pelo próprio celular, ou com o PIN no PDV do dono)
router.post('/aparelho-loja', async (req, res) => {
  if (!podeMudarAparelho(req)) return res.status(403).json({ error: 'Só o dono ou um gestor faz isso. Entre com o PIN de um gestor.' });
  const tv = await comoSistema(() => versaoDoToken(req.userId));
  res.json({ token: jwt.sign({ sub: req.userId, tv, loja: 1 }, JWT_SECRET(), { expiresIn: '365d' }) });
});
router.post('/aparelho-normal', async (req, res) => {
  if (!req.acesso || req.acesso.tipo !== 'loja' || !req.acesso.operador || req.acesso.operador.papel !== 'gestor') {
    return res.status(403).json({ error: 'Para tirar o modo loja, entre com o PIN de um gestor.' });
  }
  // não entrega um acesso de dono: o aparelho só sai da conta (para voltar, entra com e-mail e senha ou pelo link da equipe)
  res.json({ ok: true });
});

module.exports = router;
