/* Ligação entre o cliente do PDV e o contato do CRM: os dois cadastros continuam separados, mas
   são a mesma pessoa quando o telefone é o mesmo (mesma regra dos duplicados: sem o 55 e sem o 9
   extra — chaveTelefone). Nada é copiado; cada lado só lê o resumo do outro. */
const { query } = require('../db/pool');
const { chaveTelefone } = require('./telefone');

const r2 = (n) => Math.round(Number(n || 0) * 100) / 100;
const oitoFinais = (chave) => chave.slice(-8);

// Clientes do PDV com esse telefone, com o resumo das compras no balcão
async function comprasNoBalcao(userId, telefone) {
  const chave = chaveTelefone(telefone);
  if (!chave) return [];
  const { rows } = await query("SELECT id, nome, telefone FROM estoque_clientes WHERE user_id = $1::uuid AND telefone <> '' AND right(telefone, 8) = $2", [userId, oitoFinais(chave)]);
  const clientes = rows.filter((r) => chaveTelefone(r.telefone) === chave);
  const saida = [];
  for (const c of clientes) {
    const [tot, ult] = await Promise.all([
      query('SELECT count(*)::int AS n, COALESCE(sum(total),0) AS total, max(data) AS ultima FROM estoque_vendas WHERE user_id = $1::uuid AND cliente_id = $2::uuid AND NOT cancelada', [userId, c.id]),
      query('SELECT numero, data, total, itens FROM estoque_vendas WHERE user_id = $1::uuid AND cliente_id = $2::uuid AND NOT cancelada ORDER BY data DESC, numero DESC LIMIT 5', [userId, c.id]),
    ]);
    const t = tot.rows[0];
    saida.push({
      id: c.id, nome: c.nome, compras: t.n, total: r2(t.total), ticket: t.n ? r2(t.total / t.n) : 0,
      ultimaCompra: t.ultima ? String(t.ultima instanceof Date ? t.ultima.toISOString() : t.ultima).slice(0, 10) : null,
      vendas: ult.rows.map((v) => ({
        numero: v.numero, data: String(v.data instanceof Date ? v.data.toISOString() : v.data).slice(0, 10), total: r2(v.total),
        itens: (v.itens || []).slice(0, 3).map((i) => `${Number(i.qtd) || 1}× ${i.nome || 'item'}`).join(', ') + ((v.itens || []).length > 3 ? ` +${v.itens.length - 3}` : ''),
      })),
    });
  }
  return saida;
}

// Contatos do CRM com esse telefone (não arquivados), com a etapa e o valor
async function negociacoesNoCrm(userId, telefone) {
  const chave = chaveTelefone(telefone);
  if (!chave) return [];
  const { rows } = await query(
    `SELECT c.id, c.cliente, c.telefone, c.valor, c.fechamento, c.updated_at, k.nome AS etapa, k.tipo, f.nome AS funil
       FROM clientes c JOIN colunas k ON k.id = c.column_id LEFT JOIN funis f ON f.id = k.funil_id
      WHERE c.user_id = $1::uuid AND NOT c.arquivado AND right(regexp_replace(c.telefone, '\\D', '', 'g'), 8) = $2
      ORDER BY c.updated_at DESC`, [userId, oitoFinais(chave)]);
  return rows.filter((r) => chaveTelefone(r.telefone) === chave).map((r) => ({
    id: r.id, cliente: r.cliente, etapa: r.etapa, tipo: r.tipo, funil: r.funil || '',
    valor: r2(r.fechamento && !r.fechamento.cancelado && r.fechamento.valorFinal != null ? r.fechamento.valorFinal : r.valor),
    atualizadoEm: r.updated_at,
  }));
}

module.exports = { comprasNoBalcao, negociacoesNoCrm };
