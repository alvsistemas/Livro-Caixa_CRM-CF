const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { comoUsuario } = require('../db/contexto');

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
    const user = await User.findById(payload.sub).select('tokenVersion');
    if (!user) return res.status(401).json({ error: 'Sessão expirada ou inválida.' });
    if ((payload.tv || 0) !== (user.tokenVersion || 0)) {
      return res.status(401).json({ error: 'Sessão encerrada em outro dispositivo. Faça login novamente.' });
    }
    req.userId = String(user._id);
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
