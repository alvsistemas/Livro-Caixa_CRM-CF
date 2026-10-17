/* Aplica as migrações (db/migracoes/*.sql) que ainda não rodaram neste banco.
   Roda sozinho toda vez que o servidor sobe — no Neon não precisa executar nada à mão. */
const fs = require('fs');
const path = require('path');
const { obterPool, definirPapelDaAplicacao } = require('./pool');

const PASTA = path.join(__dirname, 'migracoes');

async function migrar({ silencioso = false } = {}) {
  const cliente = await obterPool().connect();
  try {
    // trava pra dois servidores subindo juntos não aplicarem a mesma migração
    await cliente.query('SELECT pg_advisory_lock(727274)');
    await cliente.query(`CREATE TABLE IF NOT EXISTS schema_migracoes (
      versao text PRIMARY KEY,
      aplicada_em timestamptz NOT NULL DEFAULT now()
    )`);
    const { rows } = await cliente.query('SELECT versao FROM schema_migracoes');
    const aplicadas = new Set(rows.map((r) => r.versao));
    const arquivos = fs.readdirSync(PASTA).filter((f) => f.endsWith('.sql')).sort();
    for (const arquivo of arquivos) {
      if (aplicadas.has(arquivo)) continue;
      const sql = fs.readFileSync(path.join(PASTA, arquivo), 'utf8');
      try {
        await cliente.query('BEGIN');
        await cliente.query(sql);
        await cliente.query('INSERT INTO schema_migracoes (versao) VALUES ($1)', [arquivo]);
        await cliente.query('COMMIT');
        if (!silencioso) console.log(`Migração aplicada: ${arquivo}`);
      } catch (err) {
        await cliente.query('ROLLBACK');
        err.message = `Falha na migração ${arquivo}: ${err.message}`;
        throw err;
      }
    }
    // usa o papel livro_app (sem BYPASSRLS) se ele existir e esta conexão puder assumi-lo
    const papel = await cliente.query(
      `SELECT 1 FROM pg_roles WHERE rolname = 'livro_app' AND pg_has_role(current_user, 'livro_app',
         CASE WHEN current_setting('server_version_num')::int >= 160000 THEN 'SET' ELSE 'MEMBER' END)`
    ).catch(() => ({ rows: [] }));
    definirPapelDaAplicacao(papel.rows.length ? 'livro_app' : null);
    if (!papel.rows.length && !silencioso) {
      console.warn('Aviso: papel livro_app indisponível — confira se o usuário do banco não tem BYPASSRLS.');
    }
  } finally {
    try { await cliente.query('SELECT pg_advisory_unlock(727274)'); } catch (e) { /* ignora */ }
    cliente.release();
  }
}

module.exports = { migrar };

// "node db/migrar.js" aplica as migrações e sai (útil pra testar a conexão com o Neon)
if (require.main === module) {
  require('dotenv').config();
  migrar()
    .then(() => { console.log('Banco atualizado.'); return require('./pool').encerrar(); })
    .catch((err) => { console.error(err.message); process.exit(1); });
}
