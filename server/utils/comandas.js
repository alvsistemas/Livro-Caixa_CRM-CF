/* PDV, fase 2 (restaurante): mesas, comandas e a tela da cozinha.

   - Mesa: só um nome ("Mesa 4", "Varanda 2"). Cada mesa tem no máximo uma comanda em aberto.
   - Comanda: a conta de uma mesa, ou avulsa (balcão, bar, "comanda 12"). O garçom lança os
     itens (com adicionais e observação, como "sem cebola") e manda para a cozinha. Itens de
     produto marcado "não vai para a cozinha" (bebida pronta) não aparecem lá.
   - Cozinha: cada envio vira um ticket: novo → preparando → pronto → entregue.
   - Fechar a conta: vira uma venda normal (registrarVenda), com a taxa de serviço como
     acréscimo, os mesmos pagamentos divididos, troco, fiado e fidelidade do balcão.
     O estoque só baixa quando a conta fecha.
   - Cancelar um item que já foi para a cozinha precisa de gerente (a rota confere). */
const { query, transacao } = require('../db/pool');
const E = require('./estoque');

class ErroComanda extends Error {}
const erro = (m) => new ErroComanda(m);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ehUuid = (v) => typeof v === 'string' && UUID_RE.test(v);
const texto = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
const centavos = (v) => Math.round(Number(v) * 100);
const reais = (c) => Math.round(c) / 100;
function numero(v, { min = 0, max = 1e9, nome = 'Valor' } = {}) {
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : Number(v);
  if (!Number.isFinite(n) || n < min || n > max) throw erro(`${nome} inválido.`);
  return n;
}
const ABERTAS = `status IN ('aberta', 'conta')`;
const STATUS_COZINHA = ['novo', 'preparando', 'pronto', 'entregue'];

async function proximo(userId, coluna) {
  await query('INSERT INTO estoque_negocio (user_id) VALUES ($1::uuid) ON CONFLICT (user_id) DO NOTHING', [userId]);
  return (await query(`UPDATE estoque_negocio SET ${coluna} = ${coluna} + 1 WHERE user_id = $1::uuid RETURNING ${coluna} AS n`, [userId])).rows[0].n;
}
async function taxaServicoPct(userId) {
  const { rows } = await query('SELECT pdv FROM estoque_negocio WHERE user_id = $1::uuid', [userId]);
  const p = rows[0] && rows[0].pdv;
  return p && p.taxaServico !== undefined ? Number(p.taxaServico) : 10;
}

/* ------------------------------ mesas ------------------------------ */

async function listarMesasCadastro(userId) {
  const { rows } = await query('SELECT * FROM estoque_mesas WHERE user_id = $1::uuid AND ativo ORDER BY posicao, nome', [userId]);
  return rows.map((r) => ({ id: r.id, nome: r.nome }));
}

// Lista nova de mesas (as que saíram da lista são apagadas, se não tiverem conta aberta)
async function salvarMesas(userId, lista) {
  if (!Array.isArray(lista)) throw erro('Lista de mesas inválida.');
  if (lista.length > 200) throw erro('No máximo 200 mesas.');
  const nomes = new Set();
  const mesas = lista.map((m, i) => {
    const nome = texto(m && m.nome, 30);
    if (!nome) throw erro('Toda mesa precisa de um nome (ex.: Mesa 1).');
    if (nomes.has(nome.toLowerCase())) throw erro(`Nome de mesa repetido: ${nome}.`);
    nomes.add(nome.toLowerCase());
    return { id: ehUuid(m.id) ? m.id : null, nome, posicao: i };
  });
  return transacao(async () => {
    const atuais = (await query('SELECT id FROM estoque_mesas WHERE user_id = $1::uuid', [userId])).rows.map((r) => r.id);
    const manter = mesas.filter((m) => m.id && atuais.includes(m.id)).map((m) => m.id);
    const sair = atuais.filter((id) => !manter.includes(id));
    if (sair.length) {
      const ocupada = await query(`SELECT m.nome FROM estoque_comandas c JOIN estoque_mesas m ON m.user_id = c.user_id AND m.id = c.mesa_id
        WHERE c.user_id = $1::uuid AND c.mesa_id = ANY($2::uuid[]) AND c.${ABERTAS} LIMIT 1`, [userId, sair]);
      if (ocupada.rows.length) throw erro(`A ${ocupada.rows[0].nome} tem conta aberta. Feche a conta antes de tirar a mesa.`);
      await query('DELETE FROM estoque_mesas WHERE user_id = $1::uuid AND id = ANY($2::uuid[])', [userId, sair]);
    }
    for (const m of mesas) {
      if (m.id && manter.includes(m.id)) await query('UPDATE estoque_mesas SET nome = $3, posicao = $4 WHERE user_id = $1::uuid AND id = $2::uuid', [userId, m.id, m.nome, m.posicao]);
      else await query('INSERT INTO estoque_mesas (user_id, nome, posicao) VALUES ($1::uuid, $2, $3)', [userId, m.nome, m.posicao]);
    }
    return listarMesasCadastro(userId);
  });
}

// Mapa do salão: cada mesa com a conta aberta (se houver), mais as comandas avulsas
async function mapa(userId) {
  const mesas = await listarMesasCadastro(userId);
  const { rows: cs } = await query(`SELECT * FROM estoque_comandas WHERE user_id = $1::uuid AND ${ABERTAS} ORDER BY aberta_em`, [userId]);
  const ids = cs.map((c) => c.id);
  const tot = ids.length ? (await query(`SELECT comanda_id, sum(round(qtd * unit, 2)) FILTER (WHERE NOT cancelado) AS total,
      count(*) FILTER (WHERE NOT cancelado) AS itens, count(*) FILTER (WHERE NOT cancelado AND enviado_em IS NULL) AS pendentes
    FROM estoque_comanda_itens WHERE user_id = $1::uuid AND comanda_id = ANY($2::uuid[]) GROUP BY comanda_id`, [userId, ids])).rows : [];
  const coz = ids.length ? (await query(`SELECT comanda_id, count(*) FILTER (WHERE status = 'pronto') AS prontos, count(*) FILTER (WHERE status IN ('novo', 'preparando')) AS fazendo
    FROM estoque_cozinha WHERE user_id = $1::uuid AND comanda_id = ANY($2::uuid[]) GROUP BY comanda_id`, [userId, ids])).rows : [];
  const t = new Map(tot.map((r) => [r.comanda_id, r]));
  const k = new Map(coz.map((r) => [r.comanda_id, r]));
  const resumo = (c) => {
    const a = t.get(c.id) || {}; const b = k.get(c.id) || {};
    return { id: c.id, numero: c.numero, mesaId: c.mesa_id, rotulo: c.rotulo, status: c.status, pessoas: c.pessoas, abertaEm: c.aberta_em, abertaPor: c.aberta_por,
      total: Number(a.total || 0), itens: Number(a.itens || 0), pendentes: Number(a.pendentes || 0), prontos: Number(b.prontos || 0), naCozinha: Number(b.fazendo || 0) };
  };
  const porMesa = new Map(cs.filter((c) => c.mesa_id).map((c) => [c.mesa_id, resumo(c)]));
  return {
    mesas: mesas.map((m) => ({ ...m, comanda: porMesa.get(m.id) || null })),
    avulsas: cs.filter((c) => !c.mesa_id || !mesas.some((m) => m.id === c.mesa_id)).map(resumo),
    taxaServico: await taxaServicoPct(userId),
  };
}

/* ------------------------------ comandas ------------------------------ */

function itemObj(r) {
  return { id: r.id, produtoId: r.produto_id, variacaoId: r.variacao_id, nome: r.nome, qtd: Number(r.qtd), unit: Number(r.unit), opcoes: r.opcoes || [], obs: r.obs,
    cozinha: r.cozinha, enviadoEm: r.enviado_em, envioId: r.envio_id, cancelado: r.cancelado, canceladoMotivo: r.cancelado_motivo, criadoPor: r.criado_por, criadoEm: r.criado_em };
}
async function comandaPorId(userId, id) {
  if (!ehUuid(id)) throw erro('Comanda não encontrada.');
  const { rows } = await query('SELECT * FROM estoque_comandas WHERE user_id = $1::uuid AND id = $2::uuid', [userId, id]);
  const c = rows[0];
  if (!c) throw erro('Comanda não encontrada.');
  const itens = (await query('SELECT * FROM estoque_comanda_itens WHERE user_id = $1::uuid AND comanda_id = $2::uuid ORDER BY criado_em, id', [userId, id])).rows.map(itemObj);
  const tickets = (await query('SELECT id, numero, status, criado_em, pronto_em FROM estoque_cozinha WHERE user_id = $1::uuid AND comanda_id = $2::uuid ORDER BY criado_em', [userId, id])).rows
    .map((r) => ({ id: r.id, numero: r.numero, status: r.status, criadoEm: r.criado_em, prontoEm: r.pronto_em }));
  const pct = await taxaServicoPct(userId);
  const subC = itens.filter((i) => !i.cancelado).reduce((a, i) => a + Math.round(i.qtd * i.unit * 100), 0);
  const taxaC = Math.round(subC * pct / 100);
  let cliente = null;
  if (c.cliente_id) {
    const r = await query('SELECT id, nome, telefone FROM estoque_clientes WHERE user_id = $1::uuid AND id = $2::uuid', [userId, c.cliente_id]);
    cliente = r.rows[0] || null;
  }
  return {
    id: c.id, numero: c.numero, mesaId: c.mesa_id, rotulo: c.rotulo, status: c.status, pessoas: c.pessoas, obs: c.obs,
    abertaEm: c.aberta_em, abertaPor: c.aberta_por, fechadaEm: c.fechada_em, vendaId: c.venda_id, cliente,
    itens, tickets, taxaServicoPct: pct, subtotal: reais(subC), taxaServico: reais(taxaC), total: reais(subC + taxaC),
    pendentes: itens.filter((i) => !i.cancelado && !i.enviadoEm).length,
  };
}
async function comandaAberta(userId, id) {
  if (!ehUuid(id)) throw erro('Comanda não encontrada.');
  const { rows } = await query('SELECT * FROM estoque_comandas WHERE user_id = $1::uuid AND id = $2::uuid FOR UPDATE', [userId, id]);
  const c = rows[0];
  if (!c) throw erro('Comanda não encontrada.');
  if (!['aberta', 'conta'].includes(c.status)) throw erro(c.status === 'fechada' ? 'Essa conta já foi fechada.' : 'Essa comanda foi cancelada.');
  return c;
}

async function abrirComanda(userId, d = {}, operador = '') {
  const pessoas = d.pessoas ? Math.round(numero(d.pessoas, { min: 1, max: 99, nome: 'Número de pessoas' })) : 1;
  let mesa = null;
  if (d.mesaId) {
    if (!ehUuid(d.mesaId)) throw erro('Mesa não encontrada.');
    mesa = (await query('SELECT * FROM estoque_mesas WHERE user_id = $1::uuid AND id = $2::uuid', [userId, d.mesaId])).rows[0];
    if (!mesa) throw erro('Mesa não encontrada. Atualize a tela.');
  }
  const rotulo = texto(d.rotulo, 40) || (mesa ? mesa.nome : '');
  return transacao(async () => {
    // dois garçons abrindo a mesma mesa ao mesmo tempo: trava a conta antes de conferir
    await query('INSERT INTO estoque_negocio (user_id) VALUES ($1::uuid) ON CONFLICT (user_id) DO NOTHING', [userId]);
    await query('SELECT 1 FROM estoque_negocio WHERE user_id = $1::uuid FOR UPDATE', [userId]);
    if (mesa) {
      const ja = await query(`SELECT id FROM estoque_comandas WHERE user_id = $1::uuid AND mesa_id = $2::uuid AND ${ABERTAS}`, [userId, mesa.id]);
      if (ja.rows.length) return comandaPorId(userId, ja.rows[0].id); // alguém já abriu: usa a mesma
    }
    const n = await proximo(userId, 'seq_comanda');
    const r = await query(`INSERT INTO estoque_comandas (user_id, numero, mesa_id, rotulo, pessoas, aberta_por) VALUES ($1::uuid, $2, $3::uuid, $4, $5, $6) RETURNING id`,
      [userId, n, mesa ? mesa.id : null, rotulo || `Comanda ${n}`, pessoas, texto(operador, 60)]);
    return comandaPorId(userId, r.rows[0].id);
  });
}

// Confere os itens com o cadastro e calcula o preço (variação + adicionais), como no cardápio
async function montarItensComanda(userId, itens) {
  if (!Array.isArray(itens) || !itens.length) throw erro('Escolha pelo menos um item.');
  if (itens.length > 50) throw erro('Itens demais de uma vez.');
  const ids = [...new Set(itens.map((i) => i && i.produtoId).filter(ehUuid))];
  const porId = new Map((ids.length ? await E.listarProdutos(userId, { ids }) : []).map((p) => [p.id, p]));
  return itens.map((i) => {
    const qtd = Math.round(numero(i && i.qtd, { min: 0.001, max: 999, nome: 'Quantidade' }) * 1000) / 1000;
    const obs = texto(i.obs, 120);
    if (!i.produtoId) {
      const nome = texto(i.nome, 80);
      if (!nome || i.unit === undefined || i.unit === '') throw erro('Item avulso precisa de nome e preço.');
      return { produtoId: null, variacaoId: null, nome, qtd, unit: Math.round(numero(i.unit, { max: 1e6, nome: 'Preço' }) * 100) / 100, opcoes: [], obs, cozinha: i.cozinha !== false };
    }
    const p = porId.get(i.produtoId);
    if (!p || !p.ativo) throw erro('Um dos produtos não existe mais. Atualize a tela.');
    let v = null;
    const vs = p.variacoes.filter((x) => x.ativo);
    if (vs.length) {
      v = vs.find((x) => x.id === i.variacaoId);
      if (!v) throw erro(`Escolha a variação de “${p.nome}”.`);
    }
    let unit = v ? v.precoFinal : p.preco;
    const escolhidos = [];
    const sel = i.opcoes && typeof i.opcoes === 'object' && !Array.isArray(i.opcoes) ? i.opcoes : {};
    (p.opcoes || []).forEach((g, gi) => {
      const marcados = [...new Set((Array.isArray(sel[gi]) ? sel[gi] : []).map(Number).filter((x) => Number.isInteger(x) && g.escolhas[x]))];
      if (g.tipo === 'um' && marcados.length !== 1) throw erro(`Escolha uma opção em “${g.nome}” (${p.nome}).`);
      for (const x of marcados) { unit += g.escolhas[x].preco; escolhidos.push(g.escolhas[x].nome); }
    });
    return { produtoId: p.id, variacaoId: v ? v.id : null, nome: v ? (/[()]/.test(v.nome) ? `${p.nome} · ${v.nome}` : `${p.nome} (${v.nome})`) : p.nome,
      qtd, unit: Math.round(unit * 100) / 100, opcoes: escolhidos, obs, cozinha: p.cozinha !== false };
  });
}

async function adicionarItens(userId, id, d = {}, operador = '') {
  const itens = await montarItensComanda(userId, d.itens);
  return transacao(async () => {
    const c = await comandaAberta(userId, id);
    for (const i of itens) {
      await query(`INSERT INTO estoque_comanda_itens (user_id, comanda_id, produto_id, variacao_id, nome, qtd, unit, opcoes, obs, cozinha, criado_por, criado_em)
        VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6, $7, $8::jsonb, $9, $10, $11, clock_timestamp())`,
      [userId, c.id, i.produtoId, i.variacaoId, i.nome, i.qtd, i.unit, JSON.stringify(i.opcoes), i.obs, i.cozinha, texto(operador, 60)]);
    }
    // pedindo mais coisa, a mesa volta de "pediu a conta" para aberta
    if (c.status === 'conta') await query(`UPDATE estoque_comandas SET status = 'aberta' WHERE user_id = $1::uuid AND id = $2::uuid`, [userId, c.id]);
    if (d.enviar !== false) await enviarDentro(userId, c, operador);
    return comandaPorId(userId, c.id);
  });
}

// Manda para a cozinha os itens ainda não enviados (dentro de transação, com a comanda travada)
async function enviarDentro(userId, c, operador) {
  const { rows } = await query(`SELECT * FROM estoque_comanda_itens WHERE user_id = $1::uuid AND comanda_id = $2::uuid AND enviado_em IS NULL AND NOT cancelado ORDER BY criado_em, id`, [userId, c.id]);
  if (!rows.length) return null;
  const paraCozinha = rows.filter((r) => r.cozinha);
  let envioId = null;
  if (paraCozinha.length) {
    const n = await proximo(userId, 'seq_cozinha');
    const r = await query(`INSERT INTO estoque_cozinha (user_id, numero, comanda_id, origem, itens, operador) VALUES ($1::uuid, $2, $3::uuid, $4, $5::jsonb, $6) RETURNING id`,
      [userId, n, c.id, c.rotulo || `Comanda ${c.numero}`, JSON.stringify(paraCozinha.map((i) => ({ itemId: i.id, nome: i.nome, qtd: Number(i.qtd), opcoes: i.opcoes || [], obs: i.obs }))), texto(operador, 60)]);
    envioId = r.rows[0].id;
  }
  await query(`UPDATE estoque_comanda_itens SET enviado_em = now(), envio_id = CASE WHEN cozinha THEN $3::uuid ELSE NULL END
    WHERE user_id = $1::uuid AND id = ANY($2::uuid[])`, [userId, rows.map((r) => r.id), envioId]);
  return envioId;
}
async function enviarCozinha(userId, id, operador = '') {
  return transacao(async () => {
    const c = await comandaAberta(userId, id);
    await enviarDentro(userId, c, operador);
    return comandaPorId(userId, c.id);
  });
}

async function itemDaComanda(userId, comandaId, itemId) {
  if (!ehUuid(comandaId) || !ehUuid(itemId)) throw erro('Item não encontrado.');
  const r = await query('SELECT * FROM estoque_comanda_itens WHERE user_id = $1::uuid AND comanda_id = $2::uuid AND id = $3::uuid', [userId, comandaId, itemId]);
  if (!r.rows[0]) throw erro('Item não encontrado.');
  return itemObj(r.rows[0]);
}
// Tirar um item. Ainda não enviado: some. Já enviado: fica riscado, com o motivo, e a cozinha vê.
async function removerItem(userId, comandaId, itemId, d = {}) {
  return transacao(async () => {
    await comandaAberta(userId, comandaId);
    const it = await itemDaComanda(userId, comandaId, itemId);
    if (it.cancelado) return comandaPorId(userId, comandaId);
    if (!it.enviadoEm) {
      await query('DELETE FROM estoque_comanda_itens WHERE user_id = $1::uuid AND id = $2::uuid', [userId, itemId]);
    } else {
      const motivo = texto(d.motivo, 120) || 'cancelado';
      await query('UPDATE estoque_comanda_itens SET cancelado = true, cancelado_motivo = $3 WHERE user_id = $1::uuid AND id = $2::uuid', [userId, itemId, motivo]);
      const r = await query(`SELECT id, itens FROM estoque_cozinha WHERE user_id = $1::uuid AND comanda_id = $2::uuid AND itens @> $3::jsonb`, [userId, comandaId, JSON.stringify([{ itemId }])]);
      for (const t of r.rows) {
        const itens = t.itens.map((x) => (x.itemId === itemId ? { ...x, cancelado: true, motivo } : x));
        await query('UPDATE estoque_cozinha SET itens = $3::jsonb WHERE user_id = $1::uuid AND id = $2::uuid', [userId, t.id, JSON.stringify(itens)]);
      }
    }
    return comandaPorId(userId, comandaId);
  });
}

// Pessoas, nome, cliente, "pediu a conta" e trocar de mesa
async function atualizarComanda(userId, id, d = {}) {
  return transacao(async () => {
    const c = await comandaAberta(userId, id);
    const sets = []; const params = [userId, c.id];
    const add = (col, v) => { params.push(v); sets.push(`${col} = $${params.length}`); };
    if (d.pessoas !== undefined) add('pessoas', Math.round(numero(d.pessoas, { min: 1, max: 99, nome: 'Número de pessoas' })));
    if (d.rotulo !== undefined) add('rotulo', texto(d.rotulo, 40) || c.rotulo);
    if (d.obs !== undefined) add('obs', texto(d.obs, 300));
    if (d.status !== undefined) {
      if (!['aberta', 'conta'].includes(d.status)) throw erro('Situação inválida.');
      add('status', d.status);
    }
    if (d.clienteId !== undefined) {
      if (d.clienteId === null || d.clienteId === '') add('cliente_id', null);
      else {
        if (!ehUuid(d.clienteId)) throw erro('Cliente não encontrado.');
        const r = await query('SELECT 1 FROM estoque_clientes WHERE user_id = $1::uuid AND id = $2::uuid', [userId, d.clienteId]);
        if (!r.rows.length) throw erro('Cliente não encontrado.');
        add('cliente_id', d.clienteId);
      }
    }
    if (d.mesaId !== undefined && d.mesaId !== c.mesa_id) {
      if (d.mesaId === null || d.mesaId === '') { add('mesa_id', null); }
      else {
        if (!ehUuid(d.mesaId)) throw erro('Mesa não encontrada.');
        const m = (await query('SELECT * FROM estoque_mesas WHERE user_id = $1::uuid AND id = $2::uuid', [userId, d.mesaId])).rows[0];
        if (!m) throw erro('Mesa não encontrada.');
        const ocupada = await query(`SELECT 1 FROM estoque_comandas WHERE user_id = $1::uuid AND mesa_id = $2::uuid AND ${ABERTAS}`, [userId, m.id]);
        if (ocupada.rows.length) throw erro(`A ${m.nome} já tem conta aberta. Escolha uma mesa livre.`);
        add('mesa_id', m.id);
        // o nome segue a mesa nova, se era o nome da mesa antiga
        const antiga = c.mesa_id ? (await query('SELECT nome FROM estoque_mesas WHERE user_id = $1::uuid AND id = $2::uuid', [userId, c.mesa_id])).rows[0] : null;
        if (d.rotulo === undefined && (!antiga || c.rotulo === antiga.nome)) add('rotulo', m.nome);
      }
    }
    if (sets.length) await query(`UPDATE estoque_comandas SET ${sets.join(', ')} WHERE user_id = $1::uuid AND id = $2::uuid`, params);
    return comandaPorId(userId, c.id);
  });
}

// Fechar a conta: vira venda (baixa no estoque + receita no financeiro)
async function fecharComanda(userId, id, d = {}, operador = '', extras = {}, agora = new Date()) {
  return transacao(async () => {
    const c = await comandaAberta(userId, id);
    const { rows } = await query('SELECT * FROM estoque_comanda_itens WHERE user_id = $1::uuid AND comanda_id = $2::uuid AND NOT cancelado ORDER BY criado_em, id', [userId, c.id]);
    if (!rows.length) throw erro('A conta está vazia. Lance os itens ou cancele a comanda.');
    const existentes = new Set((await query('SELECT id FROM estoque_produtos WHERE user_id = $1::uuid AND id = ANY($2::uuid[]) AND excluido_em IS NULL',
      [userId, rows.map((r) => r.produto_id).filter(Boolean)])).rows.map((r) => r.id));
    const itens = rows.map((r) => {
      const opcoes = [...(r.opcoes || []), ...(r.obs ? [`obs: ${r.obs}`] : [])];
      return r.produto_id && existentes.has(r.produto_id)
        ? { produtoId: r.produto_id, variacaoId: r.variacao_id, qtd: Number(r.qtd), unit: Number(r.unit), opcoes }
        : { nome: r.nome, qtd: Number(r.qtd), unit: Number(r.unit), opcoes };
    });
    const subC = rows.reduce((a, r) => a + Math.round(Number(r.qtd) * Number(r.unit) * 100), 0);
    const pct = await taxaServicoPct(userId);
    const taxaC = d.semTaxa ? 0 : Math.round(subC * pct / 100);
    const clienteId = ehUuid(d.clienteId) ? d.clienteId : (c.cliente_id || undefined);
    const r = await E.registrarVenda(userId, {
      itens, pagamentos: d.pagamentos, meio: d.meio, desconto: d.desconto, acrescimo: reais(taxaC),
      clienteId, usarCashback: d.usarCashback, usarPremio: d.usarPremio,
      cliente: clienteId ? undefined : c.rotulo,
      obs: `${c.rotulo}${taxaC ? ` · taxa de serviço ${String(pct).replace('.', ',')}%` : ''}${c.pessoas > 1 ? ` · ${c.pessoas} pessoas` : ''}`,
      _operador: operador, _descontoMax: extras._descontoMax,
    }, agora);
    await query('UPDATE estoque_vendas SET comanda_id = $3::uuid WHERE user_id = $1::uuid AND id = $2::uuid', [userId, r.venda.id, c.id]);
    await query(`UPDATE estoque_comandas SET status = 'fechada', venda_id = $3::uuid, fechada_em = now(), fechada_por = $4 WHERE user_id = $1::uuid AND id = $2::uuid`,
      [userId, c.id, r.venda.id, texto(operador, 60)]);
    // o que ficou na cozinha desta mesa sai da tela
    await query(`UPDATE estoque_cozinha SET status = 'entregue', entregue_em = now() WHERE user_id = $1::uuid AND comanda_id = $2::uuid AND status <> 'entregue'`, [userId, c.id]);
    return { ...r, venda: { ...r.venda, comandaId: c.id, taxaServico: reais(taxaC) } };
  });
}

async function cancelarComanda(userId, id, d = {}, operador = '') {
  return transacao(async () => {
    const c = await comandaAberta(userId, id);
    await query(`UPDATE estoque_comandas SET status = 'cancelada', fechada_em = now(), fechada_por = $3, obs = $4 WHERE user_id = $1::uuid AND id = $2::uuid`,
      [userId, c.id, texto(operador, 60), texto(d.motivo, 300) || c.obs]);
    await query(`UPDATE estoque_cozinha SET status = 'entregue', entregue_em = now() WHERE user_id = $1::uuid AND comanda_id = $2::uuid AND status <> 'entregue'`, [userId, c.id]);
    return { ok: true };
  });
}
async function comandaTemItensValidos(userId, id) {
  if (!ehUuid(id)) return false;
  const r = await query('SELECT 1 FROM estoque_comanda_itens WHERE user_id = $1::uuid AND comanda_id = $2::uuid AND NOT cancelado LIMIT 1', [userId, id]);
  return r.rows.length > 0;
}

// Venda de comanda cancelada: a conta volta a ficar aberta ("pediu a conta") para cobrar de novo
async function reabrirPelaVenda(userId, comandaId) {
  if (!ehUuid(comandaId)) return;
  const c = (await query('SELECT * FROM estoque_comandas WHERE user_id = $1::uuid AND id = $2::uuid', [userId, comandaId])).rows[0];
  if (!c || c.status !== 'fechada') return;
  let mesa = c.mesa_id;
  if (mesa) {
    const ocupada = await query(`SELECT 1 FROM estoque_comandas WHERE user_id = $1::uuid AND mesa_id = $2::uuid AND ${ABERTAS}`, [userId, mesa]);
    if (ocupada.rows.length) mesa = null; // a mesa já tem outra conta: volta como avulsa
  }
  await query(`UPDATE estoque_comandas SET status = 'conta', venda_id = NULL, fechada_em = NULL, mesa_id = $3::uuid WHERE user_id = $1::uuid AND id = $2::uuid`, [userId, comandaId, mesa]);
}

async function historicoComandas(userId, limite = 60) {
  const { rows } = await query(`SELECT c.*, v.total AS venda_total, v.numero AS venda_numero FROM estoque_comandas c
    LEFT JOIN estoque_vendas v ON v.user_id = c.user_id AND v.id = c.venda_id
    WHERE c.user_id = $1::uuid AND c.status IN ('fechada', 'cancelada') ORDER BY c.fechada_em DESC NULLS LAST LIMIT $2`, [userId, limite]);
  return rows.map((c) => ({ id: c.id, numero: c.numero, rotulo: c.rotulo, status: c.status, abertaEm: c.aberta_em, fechadaEm: c.fechada_em,
    total: c.venda_total === null ? null : Number(c.venda_total), vendaNumero: c.venda_numero, pessoas: c.pessoas }));
}

/* ------------------------------ cozinha ------------------------------ */

function ticketObj(r) {
  return { id: r.id, numero: r.numero, comandaId: r.comanda_id, pedidoId: r.pedido_id, origem: r.origem, itens: r.itens || [], status: r.status, operador: r.operador,
    criadoEm: r.criado_em, inicioEm: r.inicio_em, prontoEm: r.pronto_em, entregueEm: r.entregue_em };
}
async function listarCozinha(userId) {
  const ativos = (await query(`SELECT * FROM estoque_cozinha WHERE user_id = $1::uuid AND status <> 'entregue' ORDER BY criado_em LIMIT 200`, [userId])).rows;
  const recentes = (await query(`SELECT * FROM estoque_cozinha WHERE user_id = $1::uuid AND status = 'entregue' AND entregue_em > now() - interval '3 hours' ORDER BY entregue_em DESC LIMIT 12`, [userId])).rows;
  return { tickets: ativos.map(ticketObj), entregues: recentes.map(ticketObj), agora: new Date().toISOString() };
}
async function mudarTicket(userId, id, status) {
  if (!ehUuid(id)) throw erro('Pedido da cozinha não encontrado.');
  if (!STATUS_COZINHA.includes(status)) throw erro('Situação inválida.');
  const col = { preparando: 'inicio_em', pronto: 'pronto_em', entregue: 'entregue_em' }[status];
  const r = await query(`UPDATE estoque_cozinha SET status = $3${col ? `, ${col} = COALESCE(${col}, now())` : ''} WHERE user_id = $1::uuid AND id = $2::uuid RETURNING *`, [userId, id, status]);
  if (!r.rows.length) throw erro('Pedido da cozinha não encontrado.');
  return ticketObj(r.rows[0]);
}
// Pedido do cardápio (entrega/retirada) vai para a tela da cozinha; a venda continua sendo registrada no Pedidos
async function pedidoParaCozinha(userId, pedidoId, operador = '') {
  if (!ehUuid(pedidoId)) throw erro('Pedido não encontrado.');
  return transacao(async () => {
    const p = (await query('SELECT * FROM estoque_pedidos WHERE user_id = $1::uuid AND id = $2::uuid FOR UPDATE', [userId, pedidoId])).rows[0];
    if (!p) throw erro('Pedido não encontrado.');
    if (p.cozinha_id) return ticketObj((await query('SELECT * FROM estoque_cozinha WHERE user_id = $1::uuid AND id = $2::uuid', [userId, p.cozinha_id])).rows[0]);
    if (p.status === 'recusado') throw erro('Esse pedido foi recusado.');
    const ids = (p.itens || []).map((i) => i.produtoId).filter(ehUuid);
    const semCozinha = new Set((ids.length ? await query('SELECT id FROM estoque_produtos WHERE user_id = $1::uuid AND id = ANY($2::uuid[]) AND NOT cozinha', [userId, ids]) : { rows: [] }).rows.map((r) => r.id));
    const itens = (p.itens || []).filter((i) => !semCozinha.has(i.produtoId)).map((i) => {
      const obs = (i.opcoes || []).filter((o) => /^obs: /.test(o)).map((o) => o.slice(5)).join('; ');
      return { nome: i.nome, qtd: Number(i.qtd), opcoes: (i.opcoes || []).filter((o) => !/^obs: /.test(o)), obs };
    });
    if (!itens.length) throw erro('Nenhum item desse pedido vai para a cozinha.');
    const n = await proximo(userId, 'seq_cozinha');
    const origem = `Pedido #${String(p.numero).padStart(3, '0')} · ${p.tipo === 'entrega' ? 'entrega' : 'retirada'} · ${p.cliente_nome}`.slice(0, 80);
    const r = await query(`INSERT INTO estoque_cozinha (user_id, numero, pedido_id, origem, itens, operador) VALUES ($1::uuid, $2, $3::uuid, $4, $5::jsonb, $6) RETURNING *`,
      [userId, n, p.id, origem, JSON.stringify(itens), texto(operador, 60)]);
    await query('UPDATE estoque_pedidos SET cozinha_id = $3::uuid WHERE user_id = $1::uuid AND id = $2::uuid', [userId, p.id, r.rows[0].id]);
    return ticketObj(r.rows[0]);
  });
}

module.exports = {
  ErroComanda, listarMesasCadastro, salvarMesas, mapa,
  comandaPorId, abrirComanda, adicionarItens, enviarCozinha, itemDaComanda, removerItem, atualizarComanda,
  fecharComanda, cancelarComanda, comandaTemItensValidos, reabrirPelaVenda, historicoComandas,
  listarCozinha, mudarTicket, pedidoParaCozinha,
};
