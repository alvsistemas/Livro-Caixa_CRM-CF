/* Conexão com o PostgreSQL (Neon em produção).

   Toda consulta roda numa transação curta que diz ao banco quem está consultando:
   - app.user_id = usuário logado  -> as políticas de Row-Level Security só deixam ver
     e gravar as linhas dele;
   - app.bypass = 'on'             -> tarefas do sistema (agendadores, webhooks, login).
   As duas configurações são locais da transação (SET LOCAL), então nada "vaza" de uma
   consulta pra outra — inclusive no pooler do Neon, que reaproveita conexões. */
const { Pool, types } = require('pg');
const { atual, armazenamento } = require('./contexto');

// numeric (dinheiro) e bigint (contagens) chegam como texto por padrão — converte pra número
types.setTypeParser(1700, (v) => (v === null ? null : parseFloat(v)));
types.setTypeParser(20, (v) => (v === null ? null : parseInt(v, 10)));
// date (sem hora) fica como texto "YYYY-MM-DD", sem virar Date com fuso
types.setTypeParser(1082, (v) => v);
// uuid[] -> array de strings (mesmo parser de text[])
types.setTypeParser(2951, types.getTypeParser(1009));

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let pool = null;

function urlDoBanco() {
  return process.env.DATABASE_URL || 'postgres://livro:livro@127.0.0.1:5432/livro_caixa';
}

function tirarSslmode(url) {
  try {
    const u = new URL(url);
    ['sslmode', 'uselibpqcompat'].forEach((k) => u.searchParams.delete(k));
    return u.toString();
  } catch (e) { return url; }
}

function opcoesDoPool() {
  const url = urlDoBanco();
  const local = /@(localhost|127\.0\.0\.1)(:\d+)?\//.test(url);
  const semSsl = local || /sslmode=disable/.test(url);
  return {
    // o "sslmode" sai do endereço: o SSL é definido logo abaixo (com o sslmode no endereço, o pg
    // avisa "SECURITY WARNING" a cada início, porque o significado de "require" vai mudar)
    connectionString: semSsl ? url : tirarSslmode(url),
    max: parseInt(process.env.DB_POOL_MAX || '5', 10),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 15000,
    // Neon exige SSL e o certificado é conferido (verify-full). Em banco local não precisa.
    // Saída de emergência se algum provedor usar certificado próprio: DB_SSL_SEM_VERIFICAR=1
    ssl: semSsl ? false : { rejectUnauthorized: process.env.DB_SSL_SEM_VERIFICAR !== '1' },
  };
}

function obterPool() {
  if (pool) return pool;
  pool = new Pool(opcoesDoPool());
  pool.on('error', (err) => console.error('Erro numa conexão ociosa do banco:', err.message));
  return pool;
}

// Papel sem BYPASSRLS usado em toda transação (criado na migração 002). Se o banco não
// deixou criá-lo, fica null e as consultas rodam com o próprio usuário da conexão.
let papelDaAplicacao = null;
function definirPapelDaAplicacao(nome) { papelDaAplicacao = nome; }

function sqlDeContexto(ctx) {
  const papel = papelDaAplicacao ? `; SET LOCAL ROLE ${papelDaAplicacao}` : '';
  if (ctx && !ctx.sistema && ctx.userId) {
    if (!UUID_RE.test(String(ctx.userId))) throw new Error('Identificador de usuário inválido no contexto do banco.');
    return `BEGIN${papel}; SELECT set_config('app.user_id', '${ctx.userId}', true)`;
  }
  return `BEGIN${papel}; SELECT set_config('app.bypass', 'on', true)`;
}

// Erros de conexão (banco acordando, conexão ociosa derrubada pelo pooler do Neon...):
// nesses casos a consulta nem chegou a rodar, então dá pra tentar de novo com segurança.
const ERROS_DE_CONEXAO = new Set(['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EPIPE', '57P01', '57P02', '57P03', '08000', '08003', '08006']);
function ehErroDeConexao(err) {
  if (!err) return false;
  if (ERROS_DE_CONEXAO.has(err.code)) return true;
  return /Connection terminated|connection timeout|timeout exceeded when trying to connect|Client has encountered a connection error/i.test(err.message || '');
}

// Executa uma consulta respeitando o contexto atual (usuário logado ou sistema).
async function query(texto, params = []) {
  try {
    return await queryUmaVez(texto, params);
  } catch (err) {
    const ctx = atual();
    // só repete se caiu ANTES da consulta rodar (ao conectar ou ao abrir a transação):
    // assim nunca grava a mesma coisa duas vezes
    if ((ctx && ctx.cliente) || !err.antesDaConsulta || !ehErroDeConexao(err)) throw err;
    await new Promise((ok) => setTimeout(ok, 300));
    return queryUmaVez(texto, params);
  }
}
async function queryUmaVez(texto, params) {
  const ctx = atual();
  if (ctx && ctx.cliente) return ctx.cliente.query(texto, params);
  let cliente;
  try {
    cliente = await obterPool().connect();
  } catch (err) { err.antesDaConsulta = true; throw err; }
  let quebrada = null;
  try {
    try { await cliente.query(sqlDeContexto(ctx)); } catch (err) { err.antesDaConsulta = true; throw err; }
    const resultado = await cliente.query(texto, params);
    await cliente.query('COMMIT');
    return resultado;
  } catch (err) {
    if (ehErroDeConexao(err)) quebrada = err;
    else { try { await cliente.query('ROLLBACK'); } catch (e) { quebrada = e; } }
    throw err;
  } finally {
    // conexão com defeito é descartada (release com erro), em vez de voltar pro pool
    cliente.release(quebrada || undefined);
  }
}

// Roda várias consultas numa transação só (tudo ou nada), no mesmo contexto.
async function transacao(fn) {
  const ctx = atual();
  if (ctx && ctx.cliente) return fn(); // já está dentro de uma transação
  const cliente = await obterPool().connect();
  try {
    await cliente.query(sqlDeContexto(ctx));
    const resultado = await armazenamento.run({ ...(ctx || { userId: null, sistema: true }), cliente }, fn);
    await cliente.query('COMMIT');
    return resultado;
  } catch (err) {
    try { await cliente.query('ROLLBACK'); } catch (e) { /* ignora */ }
    throw err;
  } finally {
    cliente.release();
  }
}

async function encerrar() {
  if (!pool) return;
  const p = pool;
  pool = null;
  await p.end();
}

module.exports = { query, transacao, encerrar, obterPool, urlDoBanco, definirPapelDaAplicacao, ehErroDeConexao };
