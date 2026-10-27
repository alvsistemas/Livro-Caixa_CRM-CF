const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { comoUsuario } = require('../db/contexto');
const { situacaoDe } = require('../utils/assinatura');
const { permissoesDe, regraDoCaminho, NOMES } = require('../utils/permissoes');
const A = require('../utils/acesso');
const { comoSistema } = require('../db/contexto');
const { isValidId } = require('../db/ids');
const { registrarAuditoria } = require('../utils/auditoria');

// "Atuar como": o gestor da equipe trabalha no funil de um consultor (vê, cria, edita, exclui
// e move contatos e tarefas dele). O navegador manda o header X-Atuar-Como com o id do
// consultor; só vale se quem pede é gestor da equipe aberta e o consultor é dessa MESMA equipe.
// Só as áreas do funil aceitam o modo (nada de configurações, senha, integrações, backup...).
// Toda alteração fica registrada na auditoria do gestor e na do consultor.
const AREAS_ATUAR_COMO = ['/api/board', '/api/columns', '/api/cards', '/api/tasks', '/api/funis', '/api/historico-contato', '/api/campos-personalizados'];
function areaPermitidaParaAtuarComo(caminho, metodo = 'GET') {
  if (AREAS_ATUAR_COMO.some((p) => caminho === p || caminho.startsWith(p + '/'))) return true;
  // venda ganha pelo gestor: o fechamento fica pendente para o próprio consultor fazer (o gestor
  // só lê o modo do consultor e marca o selo; os lançamentos financeiros continuam com o dono deles)
  if (metodo === 'GET' && caminho === '/api/financeiro/fechamento/modo') return true;
  // agenda do consultor: só as tarefas do CRM (o Google Agenda dele é pessoal e não vem)
  if (metodo === 'GET' && caminho === '/api/calendar/agenda-mes') return true;
  if (metodo === 'POST' && /^\/api\/financeiro\/fechamento\/[^/]+\/depois$/.test(caminho)) return true;
  return false;
}
// Confere o pedido de "atuar como". Devolve { alvo } ou { status, error }.
async function conferirAtuarComo(gestorId, alvoId, caminho, metodo) {
  if (!isValidId(alvoId)) return { status: 400, error: 'Consultor inválido.' };
  return comoSistema(async () => {
    const EQ = require('../utils/equipesDoUsuario');
    const gestor = await User.findById(gestorId).select('equipeId papelEquipe nome email');
    if (!gestor || !gestor.equipeId || gestor.papelEquipe !== 'supervisor') {
      return { status: 403, error: 'Só o gestor da equipe pode atuar no funil de outra pessoa.', sairDoFunil: true };
    }
    if (!(await EQ.membroDe(gestor.equipeId, alvoId))) return { status: 404, error: 'Esse consultor não está mais na sua equipe.', sairDoFunil: true };
    if (!areaPermitidaParaAtuarComo(caminho, metodo)) {
      return { status: 403, error: 'Isso não está disponível enquanto você atua no funil de outra pessoa. Clique em "Sair do funil".' };
    }
    const alvo = await User.findById(alvoId).select('nome email');
    return alvo ? { gestor, alvo } : { status: 404, error: 'Esse consultor não está na sua equipe.' };
  });
}

// Com a assinatura vencida, só estes caminhos continuam abertos: login, a própria tela de
// assinatura, exportar os dados (os dados são da pessoa, sempre) e desligar notificações.
const LIVRES_SEM_ASSINATURA = ['/api/auth', '/api/assinatura', '/api/backup/exportar-tudo', '/api/push', '/api/config'];

// Recursos que só o plano Completo tem (ler continua aberto onde faz sentido: a pessoa vê o que já tinha)
function recursoDoCaminho(caminho, metodo = 'GET') {
  const grava = metodo !== 'GET';
  if (caminho.startsWith('/api/ai/')) return 'ia';
  // PDV
  if (/^\/api\/estoque\/(mesas|comandas|cozinha|pedidos)(\/|$)/.test(caminho)) return 'restaurante';
  if (/^\/api\/estoque\/(fiscal|compras\/nfe)(\/|$)/.test(caminho) || /^\/api\/estoque\/vendas\/[^/]+\/nfce/.test(caminho)) return 'nfce';
  if (/^\/api\/estoque\/operadores(\/|$)/.test(caminho) && grava) return 'equipe';
  if (/^\/api\/estoque\/analises(\/|$)/.test(caminho)) return 'relatorios';
  // CRM
  if (/^\/api\/(automacoes|fluxos)(\/|$)/.test(caminho) && grava) return 'automacoes';
  if (/^\/api\/equipe\/?$/.test(caminho) && metodo === 'POST') return 'equipe'; // criar uma equipe (entrar numa é livre)
  if (/^\/api\/equipe\/(supervisao|permissoes|regenerar-codigo|criar-membro)(\/|$)/.test(caminho)) return 'equipe';
  // agenda-mes fica aberta (traz as tarefas do calendário); lá dentro os eventos do Google
  // só entram se o plano tiver a integração
  if (/^\/api\/calendar\/(connect-url|eventos)/.test(caminho)) return 'googleAgenda';
  return null;
}
const NOME_DO_RECURSO = {
  ia: 'O assistente com IA', googleAgenda: 'A integração com o Google Agenda', restaurante: 'O cardápio digital, as mesas e a cozinha',
  nfce: 'A nota fiscal (NFC-e e NF-e)', equipe: 'A equipe (operadores com PIN, membros e supervisão)', relatorios: 'Os relatórios avançados', automacoes: 'As ações automáticas e sequências',
};

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
    // Quem está usando: o dono, um funcionário pelo próprio celular ou o aparelho da loja (ver utils/acesso.js)
    let acesso = { tipo: 'dono', operador: null, perm: A.TUDO };
    if (payload.func) {
      const op = await A.operadorDaConta(req.userId, payload.func);
      if (!op || (op.versao || 0) !== (payload.fv || 0)) return res.status(401).json({ error: 'Seu acesso mudou. Entre de novo com o seu PIN.', funcionario: true });
      acesso = { tipo: 'funcionario', operador: op, perm: A.permissoesDe(op) };
    } else if (payload.loja) {
      let op = null;
      const t = req.headers['x-operador'];
      if (t) {
        try {
          const p = jwt.verify(String(t), `${JWT_SECRET}:operador`);
          if (p.u === req.userId) op = await A.operadorDaConta(req.userId, p.op);
        } catch (e) { op = null; }
      }
      acesso = { tipo: 'loja', operador: op, perm: op ? A.permissoesDe(op) : A.NADA };
    }
    req.acesso = acesso;
    // Assinatura: sem pagamento em dia (e fora do teste grátis), bloqueia com 402
    const assinatura = await situacaoDe(req.userId, user.email);
    req.assinatura = assinatura;
    const caminho = (req.originalUrl || '').split('?')[0];
    if (!assinatura.liberado && !LIVRES_SEM_ASSINATURA.some((p) => caminho.startsWith(p))) {
      return res.status(402).json({ error: 'Sua assinatura não está ativa.', assinatura: true, motivo: assinatura.motivo });
    }
    const recurso = recursoDoCaminho(caminho, req.method);
    if (recurso && !assinatura.recursos[recurso]) {
      return res.status(403).json({ error: `${NOME_DO_RECURSO[recurso]} ${/^(As|Os) /.test(NOME_DO_RECURSO[recurso]) ? 'fazem' : 'faz'} parte do plano Completo.`, recurso, planoNecessario: 'completo' });
    }
    // Função de quem está usando (funcionário ou aparelho da loja): o servidor confere cada rota
    if (acesso.tipo !== 'dono') {
      // A equipe do CRM é de quem tem o próprio login (cada um com o seu funil). Quem entra com
      // nome e PIN usa o CRM da loja, mas não mexe na equipe do CRM do dono nem no monitoramento.
      if (/^\/api\/(equipe|monitoramento)(\/|$)/.test(caminho)) {
        return res.status(403).json({ error: 'A equipe do CRM é só para quem entra com o próprio e-mail e senha.', funcao: true });
      }
      if (assinatura.recursos && assinatura.recursos.equipe === false && !caminho.startsWith('/api/acesso')) {
        return res.status(403).json({ error: 'O acesso da equipe faz parte do plano Completo. Peça para o dono da conta.', recurso: 'equipe', funcao: true });
      }
      // vendedor vê só os contatos dele, se o gestor escolheu assim
      if (acesso.operador && acesso.operador.papel === 'vendedor' && caminho.startsWith('/api/board')) {
        acesso.soMeusContatos = !(await A.opcoesDaEquipe(req.userId)).crmTodos;
      }
      const precisa = A.permissaoDoCaminho(req.method, caminho);
      if (precisa !== 'livre' && (!acesso.operador || !acesso.perm[precisa])) {
        return res.status(403).json({
          error: acesso.operador ? 'A sua função não tem acesso a isto. Fale com o gestor.' : 'Entre com o seu PIN para continuar.',
          permissao: precisa, operador: !acesso.operador, funcao: true,
        });
      }
      // quem não vê custos não recebe custo, margem nem lucro (as compras mostram o que a pessoa mesma lança)
      if (!acesso.perm.custos && !caminho.startsWith('/api/estoque/compras')) {
        const json = res.json.bind(res);
        res.json = (corpo) => json(A.tirarCustos(corpo));
      }
    }
    // Permissões da equipe: o gestor pode tirar abas e funções dos membros
    const regra = regraDoCaminho(req.method, caminho);
    if (regra) {
      const p = await permissoesDe(req.userId);
      if (p.restrito && !p[regra.grupo][regra.chave]) {
        return res.status(403).json({ error: `O gestor da sua equipe não liberou: ${NOMES[regra.chave]}.`, permissao: regra.chave });
      }
    }
    // Gestor atuando no funil de um consultor: daqui em diante a requisição é do consultor
    const alvoId = req.headers['x-atuar-como'];
    if (alvoId && String(alvoId) !== req.userId) {
      if (acesso.tipo !== 'dono') return res.status(403).json({ error: 'Só o gestor da equipe pode atuar no funil de outra pessoa.' });
      const r = await conferirAtuarComo(req.userId, String(alvoId), caminho, req.method);
      if (r.error) return res.status(r.status).json({ error: r.error, atuarComo: true, sairDoFunil: !!r.sairDoFunil });
      req.realUserId = req.userId;
      req.atuandoComo = true;
      req.userId = String(r.alvo._id);
      if (req.method !== 'GET') {
        const nomeAlvo = r.alvo.nome || r.alvo.email;
        const nomeGestor = r.gestor.nome || r.gestor.email || 'O gestor';
        const area = caminho.split('/')[2];
        const oQue = { board: 'o funil', cards: 'um contato', columns: 'uma etapa', tasks: 'uma tarefa', funis: 'um funil', 'historico-contato': 'o histórico de um contato', 'campos-personalizados': 'um campo personalizado' }[area] || area;
        const acao = { POST: /\/(mover|unificar|reordenar)/.test(caminho) ? 'mexeu em' : 'criou ou mudou', PUT: 'alterou', PATCH: 'alterou', DELETE: 'excluiu' }[req.method] || 'mexeu em';
        res.on('finish', () => {
          if (res.statusCode >= 400) return;
          comoSistema(async () => {
            await registrarAuditoria(req.realUserId, 'gestor_atuou', `Você (gestor) ${acao} ${oQue} no funil de ${nomeAlvo}`);
            await registrarAuditoria(req.userId, 'gestor_atuou', `O gestor ${nomeGestor} ${acao} ${oQue} no seu funil`);
          }).catch(() => {});
        });
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

module.exports.recursoDoCaminho = recursoDoCaminho;
module.exports.areaPermitidaParaAtuarComo = areaPermitidaParaAtuarComo;
