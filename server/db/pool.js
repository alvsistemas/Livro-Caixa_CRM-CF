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

function opcoesDoPool() {
  const url = urlDoBanco();
  const local = /@(localhost|127\.0\.0\.1)(:\d+)?\//.test(url);
  return {
    connectionString: url,
    max: parseInt(process.env.DB_POOL_MAX || '5', 10),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 15000,
    // Neon exige SSL; em banco local não precisa
    ssl: local || /sslmode=disable/.test(url) ? false : { rejectUnauthorized: false },
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

// Executa uma consulta respeitando o contexto atual (usuário logado ou sistema).
async function query(texto, params = []) {
  const ctx = atual();
  if (ctx && ctx.cliente) return ctx.cliente.query(texto, params);
  const cliente = await obterPool().connect();
  try {
    await cliente.query(sqlDeContexto(ctx));
    const resultado = await cliente.query(texto, params);
    await cliente.query('COMMIT');
    return resultado;
  } catch (err) {
    try { await cliente.query('ROLLBACK'); } catch (e) { /* conexão pode já estar quebrada */ }
    throw err;
  } finally {
    cliente.release();
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

module.exports = { query, transacao, encerrar, obterPool, urlDoBanco, definirPapelDaAplicacao };
