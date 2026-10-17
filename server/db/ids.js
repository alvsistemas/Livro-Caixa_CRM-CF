/* Identificadores: o banco usa UUID em todas as tabelas.

   Backups antigos (da época do MongoDB) trazem IDs de 24 caracteres hexadecimais. Eles são
   convertidos sempre do mesmo jeito para um UUID ("00000000-" + o ID antigo), então as
   ligações entre cliente, tarefa, comissão etc. continuam batendo depois da importação. */
const crypto = require('crypto');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OBJECT_ID_RE = /^[0-9a-f]{24}$/i;

function novoId() {
  return crypto.randomUUID();
}

// Converte pra UUID quando possível; devolve null se não for um ID reconhecível.
function normalizarId(valor) {
  if (valor === null || valor === undefined) return null;
  const s = String(typeof valor === 'object' && valor._id ? valor._id : valor).trim().toLowerCase();
  if (UUID_RE.test(s)) return s;
  if (OBJECT_ID_RE.test(s)) return `00000000-${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8, 12)}-${s.slice(12, 24)}`;
  return null;
}

// Substitui o antigo mongoose.isValidObjectId nas rotas
function isValidId(valor) {
  return normalizarId(valor) !== null;
}

module.exports = { novoId, normalizarId, isValidId, UUID_RE };
