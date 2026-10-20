/* PDV — clientes e programa de fidelidade.

   - Cliente reconhecido pelo telefone (só números), sem login. Histórico = as vendas ligadas
     a ele (estoque_vendas.cliente_id).
   - Programa (o dono escolhe UM): "selos" (cartão fidelidade: a cada N compras, um prêmio que
     vira desconto) ou "cashback" (X% de cada compra vira crédito, com validade).
   - Só ganha quem participa (participa = true). No cardápio é a caixinha que o cliente marca;
     no balcão, quem atende confirma com o cliente.
   - O benefício é sempre aplicado por quem vende (no PDV), nunca pelo site: como não há login,
     quem digitasse o telefone de outra pessoa poderia usar o saldo dela.
   - No financeiro: cashback usado e prêmio entram como desconto da venda (a receita já sai
     menor). Cashback dado não é despesa; o que falta usar aparece como "cashback em aberto". */
const { query } = require('../db/pool');

class ErroFidelidade extends Error {}
const erro = (m) => new ErroFidelidade(m);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ehUuid = (v) => typeof v === 'string' && UUID_RE.test(v);
const texto = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
const reais = (c) => Math.round(c) / 100;

// "(11) 98888-7777" -> "11988887777"; com 55 na frente também vale
function telDe(v) {
  let n = String(v || '').replace(/\D/g, '');
  if (n.length > 11 && n.startsWith('55')) n = n.slice(2);
  return n.slice(0, 13);
}

const PADRAO = { modelo: 'nenhum', cashbackPct: 5, validadeDias: 90, minimoUso: 0, selosMeta: 10, selosMinimo: 0, premioTexto: '', premioValor: 0 };
function programaDe(f) {
  const p = { ...PADRAO, ...(f && typeof f === 'object' ? f : {}) };
  if (!['nenhum', 'selos', 'cashback'].includes(p.modelo)) p.modelo = 'nenhum';
  return p;
}
function num(v, min, max, nome) {
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : Number(v);
  if (!Number.isFinite(n) || n < min || n > max) throw erro(`${nome} inválido.`);
  return n;
}
function validarPrograma(d = {}) {
  const p = programaDe(d);
  if (p.modelo === 'cashback') {
    p.cashbackPct = Math.round(num(p.cashbackPct, 0.5, 50, 'Percentual de cashback') * 100) / 100;
    p.validadeDias = Math.round(num(p.validadeDias || 0, 0, 3650, 'Validade'));
    p.minimoUso = Math.round(num(p.minimoUso || 0, 0, 100000, 'Valor mínimo') * 100) / 100;
  }
  if (p.modelo === 'selos') {
    p.selosMeta = Math.round(num(p.selosMeta, 2, 50, 'Número de compras'));
    p.selosMinimo = Math.round(num(p.selosMinimo || 0, 0, 100000, 'Valor mínimo da compra') * 100) / 100;
    p.premioValor = Math.round(num(p.premioValor, 0.01, 100000, 'Valor do prêmio') * 100) / 100;
    p.premioTexto = texto(p.premioTexto, 80);
  }
  return {
    modelo: p.modelo, cashbackPct: Number(p.cashbackPct) || PADRAO.cashbackPct, validadeDias: Number(p.validadeDias) || 0, minimoUso: Number(p.minimoUso) || 0,
    selosMeta: Number(p.selosMeta) || PADRAO.selosMeta, selosMinimo: Number(p.selosMinimo) || 0, premioTexto: p.premioTexto || '', premioValor: Number(p.premioValor) || 0,
  };
}

/* ------------------------------ saldo de cashback ------------------------------ */

async function saldoCashback(userId, clienteId, hoje) {
  const { rows } = await query(
    `SELECT COALESCE(sum(restante), 0)::float AS s FROM estoque_cashback
      WHERE user_id = $1::uuid AND cliente_id = $2::uuid AND restante > 0 AND (expira_em IS NULL OR expira_em >= $3)`, [userId, clienteId, hoje]);
  return Math.round(rows[0].s * 100) / 100;
}
async function proximoVencimento(userId, clienteId, hoje) {
  const { rows } = await query(
    `SELECT expira_em, sum(restante)::float AS valor FROM estoque_cashback
      WHERE user_id = $1::uuid AND cliente_id = $2::uuid AND restante > 0 AND expira_em IS NOT NULL AND expira_em >= $3
      GROUP BY expira_em ORDER BY expira_em LIMIT 1`, [userId, clienteId, hoje]);
  return rows[0] ? { data: rows[0].expira_em, valor: Math.round(rows[0].valor * 100) / 100 } : null;
}
// Usa o cashback do crédito que vence primeiro. Dentro de transação. Devolve [{ id, valor }].
async function consumirCashback(userId, clienteId, valorC, hoje) {
  const { rows } = await query(
    `SELECT id, restante FROM estoque_cashback
      WHERE user_id = $1::uuid AND cliente_id = $2::uuid AND restante > 0 AND (expira_em IS NULL OR expira_em >= $3)
      ORDER BY expira_em NULLS LAST, criado_em FOR UPDATE`, [userId, clienteId, hoje]);
  let falta = valorC; const consumo = [];
  for (const r of rows) {
    if (falta <= 0) break;
    const tira = Math.min(falta, Math.round(Number(r.restante) * 100));
    await query('UPDATE estoque_cashback SET restante = restante - $3 WHERE user_id = $1::uuid AND id = $2::uuid', [userId, r.id, reais(tira)]);
    consumo.push({ id: r.id, valor: reais(tira) });
    falta -= tira;
  }
  if (falta > 0) throw erro('O cliente não tem esse saldo de cashback.');
  return consumo;
}
async function devolverConsumo(userId, consumo) {
  for (const c of consumo || []) {
    await query('UPDATE estoque_cashback SET restante = LEAST(valor, restante + $3) WHERE user_id = $1::uuid AND id = $2::uuid', [userId, c.id, c.valor]);
  }
}
function somarDias(iso, dias) {
  const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}
async function creditarCashback(userId, clienteId, vendaId, valorC, programa, hoje, obs = '') {
  if (valorC <= 0) return;
  const expira = programa.validadeDias ? somarDias(hoje, programa.validadeDias) : null;
  await query(
    `INSERT INTO estoque_cashback (user_id, cliente_id, venda_id, valor, restante, expira_em, obs) VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $4, $5, $6)`,
    [userId, clienteId, vendaId, reais(valorC), expira, obs]);
}

/* ------------------------------ clientes ------------------------------ */

function clienteObj(r) {
  return {
    id: r.id, nome: r.nome, telefone: r.telefone, endereco: r.endereco, obs: r.obs, participa: r.participa, selos: r.selos,
    compras: Number(r.compras || 0), totalGasto: Math.round(Number(r.total_gasto || 0) * 100) / 100,
    ultimaCompra: r.ultima_compra || null, saldo: Math.round(Number(r.saldo || 0) * 100) / 100, criadoEm: r.criado_em,
  };
}
const SELECT_CLIENTE = `
  SELECT c.*, v.compras, v.total_gasto, v.ultima_compra, cb.saldo
    FROM estoque_clientes c
    LEFT JOIN LATERAL (SELECT count(*) AS compras, sum(total) AS total_gasto, max(data) AS ultima_compra
                         FROM estoque_vendas WHERE user_id = c.user_id AND cliente_id = c.id AND NOT cancelada) v ON true
    LEFT JOIN LATERAL (SELECT sum(restante) AS saldo FROM estoque_cashback
                        WHERE user_id = c.user_id AND cliente_id = c.id AND restante > 0 AND (expira_em IS NULL OR expira_em >= $2)) cb ON true`;

async function listarClientes(userId, { busca = '', filtro = '' } = {}, hoje) {
  const params = [userId, hoje];
  let onde = 'c.user_id = $1::uuid';
  const b = texto(busca, 60).toLowerCase();
  if (b) {
    params.push(`%${b}%`);
    const tel = telDe(b);
    if (tel.length >= 3) { params.push(`%${tel}%`); onde += ` AND (lower(c.nome) LIKE $3 OR c.telefone LIKE $4)`; }
    else onde += ` AND lower(c.nome) LIKE $3`;
  }
  const { rows } = await query(`${SELECT_CLIENTE} WHERE ${onde} ORDER BY v.ultima_compra DESC NULLS LAST, c.nome LIMIT 1000`, params);
  let lista = rows.map(clienteObj);
  if (filtro === 'sumidos') {
    const limite = somarDias(hoje, -30);
    lista = lista.filter((c) => c.ultimaCompra && c.ultimaCompra < limite);
  } else if (filtro === 'saldo') lista = lista.filter((c) => c.saldo > 0 || c.selos > 0);
  return lista;
}
async function clientePorId(userId, id, hoje) {
  if (!ehUuid(id)) return null;
  const { rows } = await query(`${SELECT_CLIENTE} WHERE c.user_id = $1::uuid AND c.id = $3::uuid`, [userId, hoje, id]);
  return rows[0] ? clienteObj(rows[0]) : null;
}
async function clientePorTelefone(userId, telefone) {
  const tel = telDe(telefone);
  if (tel.length < 8) return null;
  const { rows } = await query('SELECT * FROM estoque_clientes WHERE user_id = $1::uuid AND telefone = $2', [userId, tel]);
  return rows[0] || null;
}

function validarDadosCliente(d, parcial = false) {
  const out = {};
  if (!parcial || d.nome !== undefined) { out.nome = texto(d.nome, 80); if (!out.nome) throw erro('Informe o nome do cliente.'); }
  if (!parcial || d.telefone !== undefined) {
    out.telefone = telDe(d.telefone);
    if (out.telefone && (out.telefone.length < 10 || out.telefone.length > 11)) throw erro('Telefone inválido. Use DDD + número.');
  }
  if (d.endereco !== undefined) out.endereco = texto(d.endereco, 200);
  if (d.obs !== undefined) out.obs = texto(d.obs, 300);
  if (d.participa !== undefined) out.participa = !!d.participa;
  return out;
}
async function salvarCliente(userId, d = {}, id = null, hoje) {
  const c = validarDadosCliente(d, !!id);
  if (c.telefone) {
    const outro = await clientePorTelefone(userId, c.telefone);
    if (outro && outro.id !== id) throw erro(`Esse telefone já é de ${outro.nome || 'outro cliente'}.`);
  }
  let cid = id;
  if (id) {
    if (!ehUuid(id)) throw erro('Cliente não encontrado.');
    const campos = Object.keys(c);
    if (campos.length) {
      const sets = campos.map((k, i) => `${k} = $${i + 3}`).join(', ');
      const r = await query(`UPDATE estoque_clientes SET ${sets}, atualizado_em = now() WHERE user_id = $1::uuid AND id = $2::uuid RETURNING id`, [userId, id, ...campos.map((k) => c[k])]);
      if (!r.rows.length) throw erro('Cliente não encontrado.');
    }
  } else {
    const r = await query(
      `INSERT INTO estoque_clientes (user_id, nome, telefone, endereco, obs, participa) VALUES ($1::uuid, $2, $3, $4, $5, $6) RETURNING id`,
      [userId, c.nome, c.telefone || '', c.endereco || '', c.obs || '', c.participa !== false]);
    cid = r.rows[0].id;
  }
  return clientePorId(userId, cid, hoje);
}
// Exclui o cliente; as vendas ficam (com o nome escrito), só perdem a ligação
async function excluirCliente(userId, id) {
  if (!ehUuid(id)) throw erro('Cliente não encontrado.');
  await query('UPDATE estoque_vendas SET cliente_id = NULL WHERE user_id = $1::uuid AND cliente_id = $2::uuid', [userId, id]);
  await query('UPDATE estoque_pedidos SET cliente_id = NULL WHERE user_id = $1::uuid AND cliente_id = $2::uuid', [userId, id]);
  const r = await query('DELETE FROM estoque_clientes WHERE user_id = $1::uuid AND id = $2::uuid RETURNING id', [userId, id]);
  if (!r.rows.length) throw erro('Cliente não encontrado.');
}

// Pedido do cardápio: acha pelo telefone ou cria (nome e endereço atualizados a cada pedido)
async function clienteDoPedido(userId, { nome, telefone, endereco, participar }) {
  const tel = telDe(telefone);
  if (tel.length < 10) return null;
  const atual = await clientePorTelefone(userId, tel);
  if (atual) {
    await query(
      `UPDATE estoque_clientes SET nome = CASE WHEN $3 <> '' THEN $3 ELSE nome END, endereco = CASE WHEN $4 <> '' THEN $4 ELSE endereco END,
         participa = participa OR $5, atualizado_em = now() WHERE user_id = $1::uuid AND id = $2::uuid`,
      [userId, atual.id, texto(nome, 80), texto(endereco, 200), !!participar]);
    return atual.id;
  }
  const r = await query(
    `INSERT INTO estoque_clientes (user_id, nome, telefone, endereco, participa) VALUES ($1::uuid, $2, $3, $4, $5)
     ON CONFLICT (user_id, telefone) WHERE telefone <> '' DO UPDATE SET atualizado_em = now() RETURNING id`,
    [userId, texto(nome, 80), tel, texto(endereco, 200), !!participar]);
  return r.rows[0].id;
}

// O que o cliente tem no programa agora
async function beneficioDe(userId, cliente, programa, hoje) {
  if (!cliente || programa.modelo === 'nenhum') return { modelo: programa.modelo, participa: !!(cliente && cliente.participa) };
  const base = { modelo: programa.modelo, participa: cliente.participa };
  if (programa.modelo === 'cashback') {
    return { ...base, saldo: await saldoCashback(userId, cliente.id, hoje), vence: await proximoVencimento(userId, cliente.id, hoje), minimoUso: programa.minimoUso, pct: programa.cashbackPct };
  }
  return { ...base, selos: cliente.selos, meta: programa.selosMeta, podePremio: cliente.selos >= programa.selosMeta, premioValor: programa.premioValor, premioTexto: programa.premioTexto, selosMinimo: programa.selosMinimo };
}

// Ficha: dados, benefício, compras, o que mais pede e o extrato do cashback
async function fichaCliente(userId, id, programa, hoje) {
  const c = await clientePorId(userId, id, hoje);
  if (!c) throw erro('Cliente não encontrado.');
  const v = await query(
    `SELECT id, numero, data, itens, total, meio, cancelada, cashback_usado, cashback_ganho, premio_valor, selos_ganhos
       FROM estoque_vendas WHERE user_id = $1::uuid AND cliente_id = $2::uuid ORDER BY data DESC, numero DESC LIMIT 100`, [userId, id]);
  const preferidos = new Map();
  for (const r of v.rows) if (!r.cancelada) for (const i of r.itens) {
    const x = preferidos.get(i.nome) || { nome: i.nome, qtd: 0 }; x.qtd += Number(i.qtd); preferidos.set(i.nome, x);
  }
  const cb = await query(
    `SELECT id, valor, restante, expira_em, obs, venda_id, criado_em FROM estoque_cashback WHERE user_id = $1::uuid AND cliente_id = $2::uuid ORDER BY criado_em DESC LIMIT 100`, [userId, id]);
  return {
    cliente: c,
    beneficio: await beneficioDe(userId, c, programa, hoje),
    vendas: v.rows.map((r) => ({ id: r.id, numero: r.numero, data: r.data, itens: r.itens, total: Number(r.total), meio: r.meio, cancelada: r.cancelada,
      cashbackUsado: Number(r.cashback_usado), cashbackGanho: Number(r.cashback_ganho), premioValor: Number(r.premio_valor), selosGanhos: r.selos_ganhos })),
    preferidos: [...preferidos.values()].sort((a, b) => b.qtd - a.qtd).slice(0, 5),
    cashback: cb.rows.map((r) => ({ id: r.id, valor: Number(r.valor), restante: Number(r.restante), expiraEm: r.expira_em, obs: r.obs, vendaId: r.venda_id, em: r.criado_em,
      vencido: !!(r.expira_em && r.expira_em < hoje && Number(r.restante) > 0) })),
  };
}

// Ajuste manual: dar cashback (cortesia, compensação) ou acertar os selos
async function ajustarBeneficio(userId, id, d = {}, programa, hoje) {
  const c = await clientePorId(userId, id, hoje);
  if (!c) throw erro('Cliente não encontrado.');
  if (programa.modelo === 'cashback') {
    const v = Math.round(num(d.valor, 0.01, 10000, 'Valor') * 100);
    await creditarCashback(userId, id, null, v, programa, hoje, texto(d.obs, 120) || 'Crédito dado pela loja');
  } else if (programa.modelo === 'selos') {
    const s = Math.round(num(d.selos, 0, 500, 'Quantidade de compras'));
    await query('UPDATE estoque_clientes SET selos = $3, atualizado_em = now() WHERE user_id = $1::uuid AND id = $2::uuid', [userId, id, s]);
  } else throw erro('Ligue o programa de fidelidade nas Configurações.');
  return fichaCliente(userId, id, programa, hoje);
}

async function cashbackEmAberto(userId, hoje) {
  const { rows } = await query(
    `SELECT COALESCE(sum(restante), 0)::float AS s, count(DISTINCT cliente_id)::int AS n FROM estoque_cashback
      WHERE user_id = $1::uuid AND restante > 0 AND (expira_em IS NULL OR expira_em >= $2)`, [userId, hoje]);
  return { valor: Math.round(rows[0].s * 100) / 100, clientes: rows[0].n };
}

module.exports = {
  ErroFidelidade, telDe, programaDe, validarPrograma,
  saldoCashback, consumirCashback, devolverConsumo, creditarCashback,
  listarClientes, clientePorId, clientePorTelefone, salvarCliente, excluirCliente, clienteDoPedido,
  beneficioDe, fichaCliente, ajustarBeneficio, cashbackEmAberto, somarDias,
};
