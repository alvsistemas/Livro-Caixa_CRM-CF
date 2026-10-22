/* Acesso da equipe: o que cada função pode ver e fazer, nos três aplicativos.

   Quem está usando:
   - dono: entrou com e-mail e senha num aparelho normal. Vê tudo.
   - funcionario: entrou pelo próprio celular com o código da loja + nome + PIN. O token leva a conta
     do dono (sub) e o funcionário (func); vale 30 dias e cai se o PIN, a função ou o "ativo" mudarem.
   - loja: um aparelho que o dono marcou como "aparelho da loja". Sem alguém entrado com o PIN, só dá
     para escolher quem vai usar; com o PIN, vale o que a função da pessoa permite.

   O servidor confere cada rota (permissaoDoCaminho) e, para quem não pode ver custos, tira custo,
   margem e lucro das respostas (tirarCustos) — não basta esconder na tela. */
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { query } = require('../db/pool');

const PAPEIS = ['gestor', 'gerente', 'vendedor', 'estoquista', 'caixa', 'garcom'];
const NOME_PAPEL = { gestor: 'Gestor', gerente: 'Gerente', vendedor: 'Vendedor', estoquista: 'Estoquista', caixa: 'Caixa', garcom: 'Garçom' };

// cada permissão: nome e explicação (a tela de equipe mostra assim)
const PERMISSOES = {
  vender: ['Vender no balcão', 'Registrar vendas e emitir a nota'],
  caixa: ['Caixa', 'Abrir, fechar, sangria, reforço e cancelar vendas'],
  produtosVer: ['Ver produtos e estoque', 'Consultar o estoque'],
  produtos: ['Editar produtos e estoque', 'Cadastrar, mudar preços e ajustar o estoque'],
  compras: ['Compras de fornecedor', 'Dar entrada nas compras e notas'],
  clientes: ['Clientes e fiado', 'Cadastro, fidelidade e receber fiado'],
  mesas: ['Mesas e comandas', 'Mesas, comandas, cozinha e pedidos do cardápio'],
  relatorios: ['Relatórios do PDV', 'Vendas, fechamentos de caixa e horários'],
  crm: ['CRM', 'Contatos, negociações e agenda'],
  comissoes: ['Comissões', 'Comissões do CRM'],
  custos: ['Custo, margem e lucro', 'Ver quanto custa e quanto sobra'],
  financeiro: ['Controle financeiro', 'Receitas, despesas, contas e o assistente com IA'],
  config: ['Configurações', 'Configurações, equipe e assinatura'],
};
const CHAVES = Object.keys(PERMISSOES);
const TUDO = Object.fromEntries(CHAVES.map((k) => [k, true]));
const NADA = Object.fromEntries(CHAVES.map((k) => [k, false]));
const com = (...ks) => ({ ...NADA, ...Object.fromEntries(ks.map((k) => [k, true])) });
const PADRAO = {
  gestor: TUDO,
  gerente: com('vender', 'caixa', 'produtosVer', 'produtos', 'compras', 'clientes', 'mesas', 'relatorios', 'crm', 'comissoes'),
  vendedor: com('vender', 'produtosVer', 'clientes', 'crm'),
  estoquista: com('vender', 'produtosVer', 'produtos', 'compras'),
  caixa: com('vender', 'caixa', 'produtosVer', 'clientes', 'mesas'),
  garcom: com('mesas'),
};
// a função + os ajustes da pessoa (o gestor sempre tem tudo)
function permissoesDe(op) {
  if (!op) return { ...NADA };
  const papel = PADRAO[op.papel] ? op.papel : 'caixa';
  if (papel === 'gestor') return { ...TUDO };
  const ajustes = op.permissoes && typeof op.permissoes === 'object' ? op.permissoes : {};
  const p = { ...PADRAO[papel] };
  for (const k of CHAVES) if (typeof ajustes[k] === 'boolean' && k !== 'config') p[k] = ajustes[k];
  if (p.produtos) p.produtosVer = true;
  return p;
}
// os três aplicativos: a pessoa vê o que alguma permissão dela abre
function appsDe(p) {
  return {
    pdv: !!(p.vender || p.caixa || p.produtosVer || p.produtos || p.compras || p.clientes || p.mesas || p.relatorios || p.config),
    crm: !!(p.crm || p.comissoes),
    financeiro: !!p.financeiro,
  };
}

/* ---------- qual permissão cada rota pede ---------- */
// 'livre' = qualquer pessoa entrada (até o aparelho da loja sem PIN); null = o PDV decide (sub-rotas)
function permissaoDoEstoque(m, p) {
  const g = m === 'GET';
  if (p === '/' || p === '') return 'livre'; // a tela abre (a trava de PIN aparece por cima); custos saem da resposta
  if (/^\/operadores(\/entrar)?$/.test(p) && (g || p.endsWith('/entrar'))) return 'livre';
  if (/^\/(pdv|negocio|fiscal|operadores|importar\/clientes)(\/|$)/.test(p) && !g) return 'config';
  if (/^\/(negocio|pdv)$/.test(p) && g) return 'livre';
  if (/^\/fiscal(\/|$)/.test(p)) return 'config';
  if (p === '/vendas' && !g) return 'vender';
  if (/^\/vendas\/[^/]+\/nfce/.test(p)) return 'vender';
  if (/^\/vendas\/[^/]+\/cancelar$/.test(p)) return 'caixa';
  if (/^\/vendas(\/|$)/.test(p)) return 'relatorios';
  if (p === '/caixa' && g) return 'livre';
  if (/^\/caixa\/(abrir|fechar|movimento)$/.test(p)) return 'caixa';
  if (/^\/caixa(\/|$)/.test(p)) return 'relatorios';
  if (p === '/resumo') return 'livre';
  if (/^\/produtos\/[^/]+\/movimentos$/.test(p)) return 'produtosVer';
  if (/^\/produtos(\/|$)/.test(p)) return g ? 'livre' : 'produtos';
  if (/^\/(ajuste|importar\/produtos|exportar\/produtos\.xlsx)(\/|$)/.test(p)) return 'produtos';
  if (/^\/(compras|gastos)(\/|$)/.test(p)) return g && p.startsWith('/gastos') ? 'relatorios' : 'compras';
  if (/^\/(clientes|exportar\/clientes\.xlsx)(\/|$)/.test(p)) return 'clientes';
  if (/^\/(mesas|comandas|cozinha|pedidos)(\/|$)/.test(p)) return 'mesas';
  if (/^\/(analises|exportar\.xlsx)(\/|$)/.test(p)) return 'relatorios';
  return 'config';
}
function permissaoDoCaminho(m, c) {
  const g = m === 'GET';
  if (c === '/api/acesso' || c.startsWith('/api/acesso/')) return 'livre';
  if (c === '/api/auth/me' && g) return 'livre';
  if (c === '/api/assinatura' && g) return 'livre';
  if (c.startsWith('/api/config/') && g) return 'livre';
  if (c.startsWith('/api/estoque')) return permissaoDoEstoque(m, c.slice('/api/estoque'.length) || '/');
  if (c.startsWith('/api/financeiro') || c.startsWith('/api/ai/')) return 'financeiro';
  if (/^\/api\/(comissoes|regras-comissao)(\/|$)/.test(c)) return 'comissoes';
  if (/^\/api\/(columns|funis|campos-personalizados|automacoes|fluxos)(\/|$)/.test(c)) return g ? 'crm' : 'config'; // estrutura do CRM: só o gestor muda
  if (/^\/api\/(board|cards|tasks|historico-contato|possiveis-leads|metas)(\/|$)/.test(c)) return 'crm';
  if (/^\/api\/calendar\/agenda-mes/.test(c) && g) return 'crm';
  return 'config'; // o resto (senha, assinatura, backup, integrações, equipe do CRM…) é do gestor
}

/* ---------- tirar custo, margem e lucro das respostas ---------- */
const CHAVE_DE_CUSTO = /^(custo|custos|custoUnit|custoU|custoFinal|custoMedio|custoTotal|cmv|lucro\w*|margem\w*)$/;
function tirarCustos(v, prof = 0) {
  if (prof > 12 || v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map((x) => tirarCustos(x, prof + 1));
  if (v instanceof Date) return v;
  const o = {};
  for (const [k, x] of Object.entries(v)) if (!CHAVE_DE_CUSTO.test(k)) o[k] = tirarCustos(x, prof + 1);
  return o;
}

/* ---------- tokens ---------- */
const SEGREDO = () => process.env.JWT_SECRET || 'troque-este-segredo-no-env';
const tokenFuncionario = (userId, op, tv = 0) => jwt.sign({ sub: String(userId), tv: tv || 0, func: op.id, fv: op.versao || 0 }, SEGREDO(), { expiresIn: '30d' });

/* ---------- código da loja ---------- */
const LETRAS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sem 0/O e 1/I, para não confundir
function novoCodigo() {
  const b = crypto.randomBytes(6);
  return Array.from(b, (x) => LETRAS[x % LETRAS.length]).join('');
}
async function codigoDaLoja(userId, { trocar = false } = {}) {
  await query('INSERT INTO estoque_negocio (user_id) VALUES ($1::uuid) ON CONFLICT (user_id) DO NOTHING', [userId]);
  const { rows } = await query('SELECT codigo_equipe FROM estoque_negocio WHERE user_id = $1::uuid', [userId]);
  if (rows[0] && rows[0].codigo_equipe && !trocar) return rows[0].codigo_equipe;
  for (let i = 0; i < 6; i++) {
    const c = novoCodigo();
    try {
      await query('UPDATE estoque_negocio SET codigo_equipe = $2, updated_at = now() WHERE user_id = $1::uuid', [userId, c]);
      return c;
    } catch (e) { if (e.code !== '23505') throw e; } // código já existe em outra conta: tenta outro
  }
  throw new Error('Não foi possível gerar o código.');
}

/* ---------- entrar pelo celular (rota pública, roda como sistema) ---------- */
const normalizarCodigo = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
async function lojaPorCodigo(codigo) {
  const c = normalizarCodigo(codigo);
  if (c.length < 6) return null;
  const { rows } = await query('SELECT user_id, nome FROM estoque_negocio WHERE codigo_equipe = $1', [c]);
  return rows[0] || null;
}
async function equipeDaLoja(codigo) {
  const loja = await lojaPorCodigo(codigo);
  if (!loja) return null;
  const { rows } = await query(`SELECT id, nome, papel FROM estoque_operadores WHERE user_id = $1::uuid AND ativo ORDER BY nome`, [loja.user_id]);
  return { userId: String(loja.user_id), loja: loja.nome || 'Loja', pessoas: rows.map((r) => ({ id: r.id, nome: r.nome, funcao: NOME_PAPEL[r.papel] || r.papel })) };
}
async function entrarFuncionario({ codigo, id, pin }) {
  const loja = await lojaPorCodigo(codigo);
  if (!loja) return { erro: 'Código da loja não encontrado.' };
  const { rows } = await query('SELECT * FROM estoque_operadores WHERE user_id = $1::uuid AND id::text = $2 AND ativo', [loja.user_id, String(id || '')]);
  const o = rows[0];
  if (!o || !(await bcrypt.compare(String(pin || ''), o.pin_hash))) return { erro: 'PIN incorreto.' };
  await query('UPDATE estoque_operadores SET ultimo_acesso = now() WHERE id = $1::uuid', [o.id]);
  const { rows: u } = await query('SELECT token_version FROM usuarios WHERE id = $1::uuid', [loja.user_id]);
  return { token: tokenFuncionario(loja.user_id, o, u[0] ? u[0].token_version : 0), userId: String(loja.user_id), operador: { id: o.id, nome: o.nome, papel: o.papel } };
}

// operador da conta (para o middleware): ativo e na mesma versão do token
async function operadorDaConta(userId, opId) {
  const { rows } = await query('SELECT id, nome, papel, ativo, permissoes, versao FROM estoque_operadores WHERE user_id = $1::uuid AND id::text = $2', [userId, String(opId || '')]);
  return rows[0] && rows[0].ativo ? rows[0] : null;
}
async function opcoesDaEquipe(userId) {
  const { rows } = await query('SELECT equipe FROM estoque_negocio WHERE user_id = $1::uuid', [userId]);
  return { crmTodos: true, ...((rows[0] && rows[0].equipe) || {}) };
}

module.exports = {
  PAPEIS, NOME_PAPEL, PERMISSOES, CHAVES, PADRAO, TUDO, NADA, permissoesDe, appsDe,
  permissaoDoCaminho, permissaoDoEstoque, tirarCustos, tokenFuncionario,
  codigoDaLoja, normalizarCodigo, equipeDaLoja, entrarFuncionario, operadorDaConta, opcoesDaEquipe,
};
