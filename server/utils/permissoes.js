/* Permissões da equipe: o gestor (ou o dono do sistema, pelo Painel do dono) escolhe
   quais abas e funções os MEMBROS da equipe podem usar. Gestores e quem não está em
   equipe têm tudo liberado. O padrão é tudo liberado ({} no banco = como antes).

   O servidor aplica as regras em middleware/auth.js (regraDoCaminho); o site esconde
   as abas e botões, mas quem garante é o servidor. */
const { comoSistema } = require('../db/contexto');
const { query } = require('../db/pool');

const ABAS = [
  { chave: 'dashboard', nome: 'Visão geral' },
  { chave: 'leads', nome: 'Contatos' },
  { chave: 'automacoes', nome: 'Ações automáticas' },
  { chave: 'comissoes', nome: 'Comissões' },
  { chave: 'relatorios', nome: 'Relatórios' },
  { chave: 'fluxos', nome: 'Sequências' },
  { chave: 'import-export', nome: 'Importar/Exportar' },
  { chave: 'tarefas', nome: 'Agenda/Tarefas' },
  { chave: 'financeiro', nome: 'Controle financeiro', dica: 'O aplicativo financeiro da própria pessoa' },
  { chave: 'estoque', nome: 'PDV', dica: 'Venda no balcão, produtos e estoque, clientes, compras e notas de gasto' },
];
const FUNCOES = [
  { chave: 'excluirClientes', nome: 'Excluir clientes' },
  { chave: 'exportarDados', nome: 'Exportar dados', dica: 'Planilha e cópia de segurança com todos os clientes' },
  { chave: 'editarFunis', nome: 'Criar e editar funis e colunas' },
  { chave: 'editarRegrasComissao', nome: 'Criar e editar regras de comissão' },
  { chave: 'fechamentoVenda', nome: 'Fazer o fechamento da venda', dica: 'Janela que lança a venda e as parcelas no Controle financeiro' },
  { chave: 'verCustos', nome: 'Ver custos e margem da venda', dica: 'Custo do produto, frete, taxas e quanto sobrou' },
];
const NOMES = Object.fromEntries([...ABAS, ...FUNCOES].map((x) => [x.chave, x.nome]));

// Formato completo, com tudo que não foi marcado como false liberado
function normalizar(p) {
  const base = p && typeof p === 'object' ? p : {};
  const abas = {}; const funcoes = {};
  for (const a of ABAS) abas[a.chave] = !(base.abas && base.abas[a.chave] === false);
  for (const f of FUNCOES) funcoes[f.chave] = !(base.funcoes && base.funcoes[f.chave] === false);
  return { abas, funcoes };
}
// Confere o que veio da tela (só chaves conhecidas, só true/false)
function validar(p) {
  if (!p || typeof p !== 'object') throw new Error('Permissões inválidas.');
  const saida = { abas: {}, funcoes: {} };
  for (const [grupo, lista] of [['abas', ABAS], ['funcoes', FUNCOES]]) {
    const recebido = p[grupo] || {};
    if (typeof recebido !== 'object') throw new Error('Permissões inválidas.');
    for (const k of Object.keys(recebido)) if (!lista.some((x) => x.chave === k)) throw new Error(`Permissão desconhecida: ${k}.`);
    for (const x of lista) saida[grupo][x.chave] = recebido[x.chave] !== false;
  }
  return saida;
}

const TUDO = normalizar({});
const cache = new Map(); // userId -> { valor, ate }
const CACHE_MS = 30000;
function limparCache() { cache.clear(); }

// Permissões que valem para esta pessoa agora
async function permissoesDe(userId) {
  const c = cache.get(String(userId));
  if (c && c.ate > Date.now()) return c.valor;
  // Vale a regra mais restrita de todas as equipes em que a pessoa é MEMBRO (não só a aberta):
  // assim ninguém escapa do que o gestor bloqueou só abrindo outra equipe (ou criando a própria).
  const valor = await comoSistema(async () => {
    const { rows } = await query(
      `SELECT e.permissoes FROM equipe_membros m JOIN equipes e ON e.id = m.equipe_id
        WHERE m.user_id = $1 AND m.papel = 'membro'`, [String(userId)]);
    if (!rows.length) return { ...TUDO, restrito: false };
    const final = normalizar({});
    for (const r of rows) {
      const p = normalizar(r.permissoes || {});
      for (const grupo of ['abas', 'funcoes']) {
        for (const k of Object.keys(final[grupo])) final[grupo][k] = final[grupo][k] && p[grupo][k] !== false;
      }
    }
    return { ...final, restrito: true };
  });
  cache.set(String(userId), { valor, ate: Date.now() + CACHE_MS });
  return valor;
}

// Que permissão um caminho da API exige (null = nenhuma)
function regraDoCaminho(metodo, caminho) {
  const escrita = metodo !== 'GET';
  if (caminho.startsWith('/api/automacoes')) return { grupo: 'abas', chave: 'automacoes' };
  if (caminho.startsWith('/api/fluxos')) return { grupo: 'abas', chave: 'fluxos' };
  if (caminho.startsWith('/api/comissoes')) return { grupo: 'abas', chave: 'comissoes' };
  // a lista de regras é usada na ficha do cliente (produto/serviço): ler fica liberado
  if (caminho.startsWith('/api/regras-comissao')) return escrita ? { grupo: 'funcoes', chave: 'editarRegrasComissao' } : null;
  if (caminho.startsWith('/api/possiveis-leads')) return { grupo: 'abas', chave: 'import-export' };
  if (caminho.startsWith('/api/financeiro/fechamento')) {
    if (caminho === '/api/financeiro/fechamento/modo' && !escrita) return null;
    return escrita ? { grupo: 'funcoes', chave: 'fechamentoVenda' } : null;
  }
  if (caminho.startsWith('/api/financeiro')) return { grupo: 'abas', chave: 'financeiro' };
  if (caminho.startsWith('/api/estoque')) return { grupo: 'abas', chave: 'estoque' };
  if (caminho.startsWith('/api/backup/exportar') || caminho.startsWith('/api/backup/automatico')) return { grupo: 'funcoes', chave: 'exportarDados' };
  if (metodo === 'DELETE' && /^\/api\/cards\/[^/]+$/.test(caminho)) return { grupo: 'funcoes', chave: 'excluirClientes' };
  if (escrita && (caminho.startsWith('/api/funis') || /^\/api\/columns(\/|$)/.test(caminho))) return { grupo: 'funcoes', chave: 'editarFunis' };
  return null;
}

module.exports = { ABAS, FUNCOES, NOMES, normalizar, validar, permissoesDe, regraDoCaminho, limparCache };
