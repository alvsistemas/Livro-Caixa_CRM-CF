const RegraComissao = require('../models/RegraComissao');

/* ---- Regra antiga "Padrão" ----
   Até a versão 20261176 toda conta nascia com a regra "Padrão" (5% numa parcela) e todo contato
   apontava para ela. Agora a conta começa SEM regras: o produto/serviço do contato começa vazio e
   só tem comissão quem cria um produto com comissão. Esta regra fica só como reserva para os
   contatos e contratos antigos que apontam para "padrao" e cuja regra foi apagada. */
const REGRAS_PADRAO = [
  { chave: 'padrao', nome: 'Padrão', blocos: [{ parcelas: 1, percentual: 0.05 }], mesIndependente: false, padrao: true, ordem: 0 },
];

// Regras (produtos/serviços) do usuário, em ordem de exibição. Não cria nada sozinho.
async function obterRegrasDoUsuario(userId) {
  const existentes = await RegraComissao.find({ userId });
  return existentes.sort((a, b) => a.ordem - b.ordem);
}

// Soma de todos os percentuais (0 = produto sem comissão)
function percentualTotalDaRegra(regra) {
  return (regra && Array.isArray(regra.blocos) ? regra.blocos : []).reduce((s, b) => s + (Number(b.percentual) || 0) * Math.max(1, parseInt(b.parcelas, 10) || 1), 0);
}

// Busca uma regra específica pela chave (ex: "padrao"). Se por algum motivo não existir
// (usuário excluiu a regra, dado antigo com chave que não bate com nada), cai pra uma
// regra padrão equivalente sem nunca quebrar o cálculo — na pior das hipóteses, uma
// regra genérica de 1 parcela e 0%.
async function obterRegraPorChave(userId, chave) {
  if (!chave) return null; // contato sem produto/serviço: sem comissão
  const regras = await obterRegrasDoUsuario(userId);
  const encontrada = regras.find((r) => r.chave === chave);
  if (encontrada) return encontrada;
  const padrao = REGRAS_PADRAO.find((r) => r.chave === chave);
  if (padrao) return { ...padrao, userId };
  return { chave: chave || 'padrao', nome: chave || 'Padrão', blocos: [{ parcelas: 1, percentual: 0 }], mesIndependente: false, padrao: false };
}

// Transforma um nome digitado pelo usuário ("Serviço Premium") numa chave técnica
// estável ("servico_premium"), sem acento nem espaço.
function slugify(nome) {
  return String(nome || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // remove acentos
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    || 'regra';
}

// Gera uma chave única pra esse usuário a partir do nome — se já existir, acrescenta um
// sufixo numérico (ex: "servico_premium_2") até achar uma livre.
async function gerarChaveUnica(userId, nome, ignorarId) {
  const base = slugify(nome);
  const existentes = await RegraComissao.find({ userId, ...(ignorarId ? { _id: { $ne: ignorarId } } : {}) }).select('chave');
  const chavesUsadas = new Set(existentes.map((r) => r.chave));
  if (!chavesUsadas.has(base)) return base;
  let n = 2;
  while (chavesUsadas.has(`${base}_${n}`)) n += 1;
  return `${base}_${n}`;
}

module.exports = { REGRAS_PADRAO, obterRegrasDoUsuario, obterRegraPorChave, percentualTotalDaRegra, slugify, gerarChaveUnica };
