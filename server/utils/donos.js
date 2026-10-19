/* Quem é dono do sistema (pode abrir o Painel do dono).

   DONOS_EMAILS (variável do Render) = donos fixos, separados por vírgula. Eles não podem ser
   removidos pelo painel — é o que garante que você nunca fica trancado fora.
   Os demais donos são adicionados e removidos pelo próprio painel (tabela "donos").
   Donos nunca pagam assinatura. */
const { query } = require('../db/pool');
const { comoSistema } = require('../db/contexto');

const normalizar = (e) => String(e || '').trim().toLowerCase();
const emailValido = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 254;

function donosFixos() {
  return String(process.env.DONOS_EMAILS || '').split(',').map(normalizar).filter(Boolean);
}

let cache = { ate: 0, lista: [] };
async function donosAdicionados() {
  if (cache.ate > Date.now()) return cache.lista;
  const { rows } = await comoSistema(() => query('SELECT email, adicionado_por, created_at FROM donos ORDER BY created_at'));
  cache = { ate: Date.now() + 60 * 1000, lista: rows };
  return rows;
}
function esquecerCache() { cache = { ate: 0, lista: [] }; }

async function ehDono(email) {
  const e = normalizar(email);
  if (!e) return false;
  if (donosFixos().includes(e)) return true;
  try {
    return (await donosAdicionados()).some((d) => d.email === e);
  } catch (err) {
    return false; // banco fora: na dúvida, não é dono
  }
}

async function listarDonos() {
  const fixos = donosFixos().map((email) => ({ email, fixo: true }));
  const adicionados = (await donosAdicionados())
    .filter((d) => !donosFixos().includes(d.email))
    .map((d) => ({ email: d.email, fixo: false, adicionadoPor: d.adicionado_por, desde: d.created_at }));
  return [...fixos, ...adicionados];
}

async function adicionarDono(email, quem) {
  const e = normalizar(email);
  if (!emailValido(e)) { const err = new Error('E-mail inválido.'); err.status = 400; throw err; }
  await comoSistema(() => query('INSERT INTO donos (email, adicionado_por) VALUES ($1, $2) ON CONFLICT (email) DO NOTHING', [e, normalizar(quem)]));
  esquecerCache();
}

async function removerDono(email, quem) {
  const e = normalizar(email);
  if (donosFixos().includes(e)) { const err = new Error('Este dono está fixo na variável DONOS_EMAILS do Render. Para tirar, edite a variável.'); err.status = 400; throw err; }
  if (e === normalizar(quem)) { const err = new Error('Você não pode remover a si mesmo. Peça a outro dono.'); err.status = 400; throw err; }
  await comoSistema(() => query('DELETE FROM donos WHERE email = $1', [e]));
  esquecerCache();
}

module.exports = { ehDono, listarDonos, adicionarDono, removerDono, donosFixos, normalizar };
