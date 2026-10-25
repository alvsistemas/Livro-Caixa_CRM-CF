/* Backup do PDV que dá para restaurar: as tabelas do PDV como estão no banco (sem fotos e sem
   segredos), na ordem em que uma depende da outra. Restaurar grava por cima pelo id (como o resto
   do backup): o que está no arquivo volta, e o que foi criado depois continua lá.
   Ficam de fora: a equipe com PIN (estoque_operadores — os PINs não saem da conta), o código de
   acesso da loja e o token da nota fiscal (estoque_negocio.codigo_equipe / fiscal_token), as fotos
   dos produtos (pesadas demais para o arquivo) e a fila da cozinha (é do momento). */
const { query } = require('../db/pool');

const TABELAS = [
  { nome: 'estoque_negocio', chave: ['user_id'], fora: ['fiscal_token', 'codigo_equipe'] },
  { nome: 'estoque_produtos', chave: ['user_id', 'id'], fora: ['foto', 'foto_tipo'] },
  { nome: 'estoque_variacoes', chave: ['user_id', 'id'] },
  { nome: 'estoque_clientes', chave: ['user_id', 'id'] },
  { nome: 'estoque_cashback', chave: ['user_id', 'id'] },
  { nome: 'estoque_caixas', chave: ['user_id', 'id'] },
  { nome: 'estoque_caixa_mov', chave: ['user_id', 'id'] },
  { nome: 'estoque_vendas', chave: ['user_id', 'id'] },
  { nome: 'estoque_compras', chave: ['user_id', 'id'] },
  { nome: 'estoque_movimentos', chave: ['user_id', 'id'] },
  { nome: 'estoque_mesas', chave: ['user_id', 'id'] },
  { nome: 'estoque_comandas', chave: ['user_id', 'id'] },
  { nome: 'estoque_comanda_itens', chave: ['user_id', 'id'] },
  { nome: 'estoque_pedidos', chave: ['user_id', 'id'] },
  { nome: 'estoque_nfe_mapa', chave: ['user_id', 'cnpj', 'codigo'] },
];

const colunasCache = new Map();
async function colunasDe(tabela) {
  if (colunasCache.has(tabela)) return colunasCache.get(tabela);
  const { rows } = await query('SELECT column_name, data_type FROM information_schema.columns WHERE table_name = $1', [tabela]);
  const mapa = new Map(rows.map((r) => [r.column_name, r.data_type]));
  colunasCache.set(tabela, mapa);
  return mapa;
}

async function exportarPdv(userId) {
  const { rows: tem } = await query('SELECT 1 FROM estoque_negocio WHERE user_id = $1::uuid', [userId]);
  if (!tem.length) return null;
  const saida = { versao: 1 };
  for (const t of TABELAS) {
    const fora = new Set(['user_id', ...(t.fora || [])]);
    const { rows } = await query(`SELECT * FROM ${t.nome} WHERE user_id = $1::uuid`, [userId]);
    saida[t.nome] = rows.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => !fora.has(k))));
  }
  return saida;
}

async function gravarLinha(t, colunas, userId, linha) {
  const fora = new Set(['user_id', ...(t.fora || [])]);
  const cols = Object.keys(linha).filter((k) => colunas.has(k) && !fora.has(k));
  const valores = cols.map((k) => {
    const v = linha[k];
    const tipo = colunas.get(k);
    return (tipo === 'jsonb' || tipo === 'json') && v !== null && v !== undefined ? JSON.stringify(v) : v;
  });
  const todas = ['user_id', ...cols];
  const sets = cols.filter((k) => !t.chave.includes(k)).map((k) => `${k} = EXCLUDED.${k}`);
  const sql = `INSERT INTO ${t.nome} (${todas.join(', ')}) VALUES (${todas.map((_, i) => `$${i + 1}`).join(', ')})
    ON CONFLICT (${t.chave.join(', ')}) DO ${sets.length ? `UPDATE SET ${sets.join(', ')}` : 'NOTHING'}`;
  await query(sql, [userId, ...valores]);
}

// Devolve { tabela: { ok, erro } }. Linhas com problema (ex.: ligação com algo que não veio) são puladas.
async function restaurarPdv(userId, pdv) {
  const resultado = {};
  if (!pdv || typeof pdv !== 'object') return resultado;
  for (const t of TABELAS) {
    const linhas = Array.isArray(pdv[t.nome]) ? pdv[t.nome] : [];
    if (!linhas.length) continue;
    const colunas = await colunasDe(t.nome);
    let ok = 0; let erro = 0;
    for (const linha of linhas) {
      if (!linha || typeof linha !== 'object') { erro++; continue; }
      try {
        await gravarLinha(t, colunas, userId, linha);
        ok++;
      } catch (e) {
        // o endereço do cardápio já é de outra conta: restaura sem ele (a pessoa escolhe outro)
        if (t.nome === 'estoque_negocio' && e.code === '23505' && linha.slug) {
          try { await gravarLinha(t, colunas, userId, { ...linha, slug: null, cardapio_ativo: false }); ok++; continue; } catch (e2) { /* conta como erro */ }
        }
        erro++;
      }
    }
    resultado[t.nome.replace('estoque_', '')] = { ok, erro };
  }
  return resultado;
}

module.exports = { exportarPdv, restaurarPdv, TABELAS };
