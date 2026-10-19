const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { comoUsuario } = require('../db/contexto');
const { situacaoDe } = require('../utils/assinatura');
const { permissoesDe, regraDoCaminho, NOMES } = require('../utils/permissoes');

// Com a assinatura vencida, só estes caminhos continuam abertos: login, a própria tela de
// assinatura, exportar os dados (os dados são da pessoa, sempre) e desligar notificações.
const LIVRES_SEM_ASSINATURA = ['/api/auth', '/api/assinatura', '/api/backup/exportar-tudo', '/api/push', '/api/config'];

// Recursos que só o plano Completo tem
function recursoDoCaminho(caminho) {
  if (caminho.startsWith('/api/ai/')) return 'ia';
  // agenda-mes fica aberta (traz as tarefas do calendário); lá dentro os eventos do Google
  // só entram se o plano tiver a integração
  if (/^\/api\/calendar\/(connect-url|eventos)/.test(caminho)) return 'googleAgenda';
  return null;
}
const NOME_DO_RECURSO = { ia: 'O assistente com IA', googleAgenda: 'A integração com o Google Agenda' };

const JWT_SECRET = process.env.JWT_SECRET || 'troque-este-segredo-no-env';

// Protege rotas: exige um header "Authorization: Bearer <token>" válido.
// Também confere se o token ainda é a versão mais recente do usuário — permite
// "desconectar todos os dispositivos" sem precisar guardar sessão nenhuma.
// Em caso de sucesso, disponibiliza req.userId para a rota usar e liga o contexto do banco.
module.exports = async function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const [tipo, token] = header.split(' ');

  if (tipo !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Não autenticado.' });
  }

  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ error: 'Sessão expirada ou inválida.' });
  }

  try {
    if (payload.twofa) {
      // token temporário de 2FA — só serve pra validar o código, nunca pra acessar rotas normais
      return res.status(401).json({ error: 'Não autenticado.' });
    }
    const user = await User.findById(payload.sub).select('tokenVersion email');
    if (!user) return res.status(401).json({ error: 'Sessão expirada ou inválida.' });
    if ((payload.tv || 0) !== (user.tokenVersion || 0)) {
      return res.status(401).json({ error: 'Sessão encerrada em outro dispositivo. Faça login novamente.' });
    }
    req.userId = String(user._id);
    // Assinatura: sem pagamento em dia (e fora do teste grátis), bloqueia com 402
    const assinatura = await situacaoDe(req.userId, user.email);
    req.assinatura = assinatura;
    const caminho = (req.originalUrl || '').split('?')[0];
    if (!assinatura.liberado && !LIVRES_SEM_ASSINATURA.some((p) => caminho.startsWith(p))) {
      return res.status(402).json({ error: 'Sua assinatura não está ativa.', assinatura: true, motivo: assinatura.motivo });
    }
    const recurso = recursoDoCaminho(caminho);
    if (recurso && !assinatura.recursos[recurso]) {
      return res.status(403).json({ error: `${NOME_DO_RECURSO[recurso]} faz parte do plano Completo.`, recurso, planoNecessario: 'completo' });
    }
    // Permissões da equipe: o gestor pode tirar abas e funções dos membros
    const regra = regraDoCaminho(req.method, caminho);
    if (regra) {
      const p = await permissoesDe(req.userId);
      if (p.restrito && !p[regra.grupo][regra.chave]) {
        return res.status(403).json({ error: `O gestor da sua equipe não liberou: ${NOMES[regra.chave]}.`, permissao: regra.chave });
      }
    }
    // daqui em diante, toda consulta ao banco nesta requisição roda como este usuário
    // (o PostgreSQL só deixa ver e gravar as linhas dele — Row-Level Security)
    comoUsuario(req.userId, () => next());
  } catch (err) {
    // Erro do banco (acordando, conexão caiu...) NÃO é sessão inválida: responder 401 aqui
    // fazia o site deslogar a pessoa à toa. 503 = "tente de novo", e o site tenta sozinho.
    console.error('Falha ao conferir a sessão no banco:', err.message);
    return res.status(503).json({ error: 'O servidor está ocupado. Tente de novo em instantes.', tentarDeNovo: true });
  }
};

module.exports.JWT_SECRET = JWT_SECRET;
