/* PDV — caixa do dia, fiado e operadores.

   Caixa: abrir (com o troco), sangria (tirar dinheiro), reforço (pôr troco), despesa paga com o
   dinheiro do caixa e fechar. No fechamento o sistema mostra quanto deveria ter em cada forma
   de pagamento; a pessoa informa o que contou e a diferença do dinheiro vira "quebra de caixa"
   (despesa) ou "sobra de caixa" (receita) no Controle financeiro. Sangria e reforço não são
   despesa nem receita: o dinheiro só muda de lugar (do caixa para o cofre ou o banco).

   Fiado: a parte fiado da venda entra no financeiro como receita "Pendente". Ao receber, a
   pendência diminui e entra uma receita "Pago" na data do recebimento (do mais antigo para o
   mais novo). Recebido em dinheiro com o caixa aberto, entra na conta do caixa.

   Operadores: funcionários com PIN de 4 a 6 números. Com "exigir operador" ligado, toda venda e
   movimento de caixa precisa de alguém entrado; só gerente cancela venda, muda configurações,
   produtos e operadores, e dá desconto acima do limite do caixa. Quem entra recebe um token
   próprio (cabeçalho x-operador), válido por 14 horas. */
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query, transacao } = require('../db/pool');
const { hojeBR, MEIOS } = require('./fechamento');
const H = require('./caixaHorario');

class ErroCaixa extends Error {}
const erro = (m) => new ErroCaixa(m);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ehUuid = (v) => typeof v === 'string' && UUID_RE.test(v);
const texto = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
const centavos = (v) => Math.round(Number(v) * 100);
const reais = (c) => Math.round(c) / 100;
function valor(v, nome = 'Valor', min = 0.01) {
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : Number(v);
  if (!Number.isFinite(n) || n < min || n > 1e8) throw erro(`${nome} inválido.`);
  return Math.round(n * 100) / 100;
}
const MEIOS_CAIXA = ['dinheiro', 'pix', 'debito', 'credito', 'transferencia', 'boleto', 'outro'];
const contaDoMeio = (m) => (MEIOS[m] ? MEIOS[m].conta : 'Conta Corrente');
const novoId = (p) => `est-${p}-${crypto.randomBytes(6).toString('hex')}`;
const SEGREDO = () => `${process.env.JWT_SECRET || 'troque-este-segredo-no-env'}:operador`;

/* ------------------------------ configurações do PDV ------------------------------ */

const PDV_PADRAO = {
  exigirCaixa: true, exigirOperador: false, descontoMaxCaixa: 10, reciboRodape: 'Obrigado pela preferência!', taxaServico: 10,
  // como o caixa funciona (utils/caixaHorario.js): manual, horario, turnos ou livre
  modoCaixa: 'manual', avisoMin: 15,
  horario: { abre: '08:00', fecha: '18:00', dias: [1, 2, 3, 4, 5, 6] },
  turnos: [{ nome: 'Manhã', inicio: '06:00', fim: '14:00' }, { nome: 'Tarde', inicio: '14:00', fim: '22:00' }, { nome: 'Noite', inicio: '22:00', fim: '06:00' }],
  virada: '06:00',
};
function pdvDe(p) {
  const o = p && typeof p === 'object' ? p : {};
  const r = { ...PDV_PADRAO, ...o };
  // contas de antes dos modos: "só vender com o caixa aberto" desligado = sem caixa
  if (!H.MODOS.includes(o.modoCaixa)) r.modoCaixa = o.exigirCaixa === false ? 'livre' : 'manual';
  r.exigirCaixa = r.modoCaixa !== 'livre';
  return r;
}
async function lerPdv(userId) {
  const { rows } = await query('SELECT pdv FROM estoque_negocio WHERE user_id = $1::uuid', [userId]);
  return pdvDe(rows[0] && rows[0].pdv);
}
async function salvarPdv(userId, d = {}) {
  const atual = await lerPdv(userId);
  const n = { ...atual };
  if (d.exigirCaixa !== undefined && d.modoCaixa === undefined) n.modoCaixa = d.exigirCaixa ? (n.modoCaixa === 'livre' ? 'manual' : n.modoCaixa) : 'livre';
  if (d.modoCaixa !== undefined) {
    if (!H.MODOS.includes(d.modoCaixa)) throw erro('Escolha como o caixa funciona.');
    n.modoCaixa = d.modoCaixa;
  }
  try {
    if (d.horario !== undefined) n.horario = H.validarHorario(d.horario);
    if (d.turnos !== undefined) n.turnos = H.validarTurnos(d.turnos);
    if (d.virada !== undefined) { const v = H.minutos(d.virada); if (v === null) throw new Error('Informe a virada do dia (ex.: 06:00).'); n.virada = H.hhmm(v); }
  } catch (e) { throw erro(e.message); }
  if (d.avisoMin !== undefined) { const a = Math.round(Number(d.avisoMin)); if (!Number.isFinite(a) || a < 0 || a > 120) throw erro('O aviso antes de fechar vai de 0 a 120 minutos.'); n.avisoMin = a; }
  n.exigirCaixa = n.modoCaixa !== 'livre';
  if (d.descontoMaxCaixa !== undefined) n.descontoMaxCaixa = valor(d.descontoMaxCaixa, 'Desconto máximo', 0) > 100 ? 100 : valor(d.descontoMaxCaixa, 'Desconto máximo', 0);
  if (d.reciboRodape !== undefined) n.reciboRodape = texto(d.reciboRodape, 140);
  if (d.taxaServico !== undefined) { const t = valor(d.taxaServico, 'Taxa de serviço', 0); if (t > 30) throw erro('A taxa de serviço vai até 30%.'); n.taxaServico = t; }
  if (d.exigirOperador !== undefined) {
    n.exigirOperador = !!d.exigirOperador;
    if (n.exigirOperador) {
      const { rows } = await query(`SELECT 1 FROM estoque_operadores WHERE user_id = $1::uuid AND ativo AND papel IN ('gestor', 'gerente') LIMIT 1`, [userId]);
      if (!rows.length) throw erro('Cadastre pelo menos um gestor ou gerente antes de exigir o PIN.');
    }
  }
  await query('INSERT INTO estoque_negocio (user_id) VALUES ($1::uuid) ON CONFLICT (user_id) DO NOTHING', [userId]);
  await query('UPDATE estoque_negocio SET pdv = $2::jsonb, updated_at = now() WHERE user_id = $1::uuid', [userId, JSON.stringify(n)]);
  // mudou o modo, o horário ou os turnos: o caixa aberto passa a seguir o novo (fim previsto e nome do turno)
  if (d.modoCaixa !== undefined || d.horario !== undefined || d.turnos !== undefined) {
    const j = janelaParaAbrir(n, new Date());
    await query(`UPDATE estoque_caixas SET previsto_fim = $2, turno = $3 WHERE user_id = $1::uuid AND status = 'aberto'`, [userId, j ? j.fim.toISOString() : null, (j && j.nome) || '']);
  }
  return n;
}

/* ------------------------------ operadores ------------------------------ */

const PAPEIS = ['gestor', 'gerente', 'vendedor', 'estoquista', 'caixa', 'garcom'];
const CHEFIA = ['gestor', 'gerente'];
const operadorObj = (r) => ({ id: r.id, nome: r.nome, papel: r.papel, ativo: r.ativo, permissoes: r.permissoes || {}, ultimoAcesso: r.ultimo_acesso || null });
async function listarOperadores(userId) {
  const { rows } = await query('SELECT * FROM estoque_operadores WHERE user_id = $1::uuid ORDER BY ativo DESC, nome', [userId]);
  return rows.map(operadorObj);
}
async function salvarOperador(userId, d = {}, id = null) {
  const nome = texto(d.nome, 60);
  if (!nome) throw erro('Informe o nome do operador.');
  const papel = PAPEIS.includes(d.papel) ? d.papel : 'caixa';
  // ajustes por pessoa (só chaves conhecidas, só verdadeiro/falso)
  const CH = require('./acesso').CHAVES;
  const ajustes = d.permissoes && typeof d.permissoes === 'object' ? Object.fromEntries(Object.entries(d.permissoes).filter(([k, v]) => CH.includes(k) && k !== 'config' && typeof v === 'boolean')) : null;
  const pin = d.pin === undefined || d.pin === null || d.pin === '' ? null : String(d.pin);
  if (pin !== null && !/^\d{4,6}$/.test(pin)) throw erro('O PIN precisa ter de 4 a 6 números.');
  if (!id && !pin) throw erro('Crie um PIN de 4 a 6 números.');
  if (id) {
    if (!ehUuid(id)) throw erro('Operador não encontrado.');
    const sets = ['nome = $3', 'papel = $4', 'ativo = $5'];
    const params = [userId, id, nome, papel, d.ativo !== false];
    if (pin) { params.push(await bcrypt.hash(pin, 8)); sets.push(`pin_hash = $${params.length}`); }
    if (ajustes) { params.push(JSON.stringify(ajustes)); sets.push(`permissoes = $${params.length}::jsonb`); }
    // mudou PIN, função, ajustes ou ativo: os acessos abertos no celular caem
    sets.push(`versao = versao + (CASE WHEN papel IS DISTINCT FROM $4 OR ativo IS DISTINCT FROM $5 ${pin ? 'OR true' : ''} ${ajustes ? `OR permissoes IS DISTINCT FROM $${params.length}::jsonb` : ''} THEN 1 ELSE 0 END)`);
    const r = await query(`UPDATE estoque_operadores SET ${sets.join(', ')} WHERE user_id = $1::uuid AND id = $2::uuid RETURNING *`, params);
    if (!r.rows.length) throw erro('Operador não encontrado.');
    await garantirGerente(userId);
    return operadorObj(r.rows[0]);
  }
  const { rows: c } = await query('SELECT count(*)::int AS n FROM estoque_operadores WHERE user_id = $1::uuid', [userId]);
  if (c[0].n >= 50) throw erro('Limite de 50 operadores.');
  const r = await query('INSERT INTO estoque_operadores (user_id, nome, pin_hash, papel, permissoes) VALUES ($1::uuid, $2, $3, $4, $5::jsonb) RETURNING *', [userId, nome, await bcrypt.hash(pin, 8), papel, JSON.stringify(ajustes || {})]);
  return operadorObj(r.rows[0]);
}
// Exigindo PIN, não pode ficar sem nenhum gerente (ninguém conseguiria mexer nas configurações)
async function garantirGerente(userId) {
  const pdv = await lerPdv(userId);
  if (!pdv.exigirOperador) return;
  const { rows } = await query(`SELECT 1 FROM estoque_operadores WHERE user_id = $1::uuid AND ativo AND papel IN ('gestor', 'gerente') LIMIT 1`, [userId]);
  if (!rows.length) throw erro('Precisa ficar pelo menos um gestor ou gerente ativo enquanto o PIN for exigido.');
}
async function excluirOperador(userId, id) {
  if (!ehUuid(id)) throw erro('Operador não encontrado.');
  await transacao(async () => {
    const r = await query('DELETE FROM estoque_operadores WHERE user_id = $1::uuid AND id = $2::uuid RETURNING id', [userId, id]);
    if (!r.rows.length) throw erro('Operador não encontrado.');
    await garantirGerente(userId);
  });
}
// PIN certo -> token do operador (tentativas limitadas na rota)
async function entrarOperador(userId, d = {}) {
  if (!ehUuid(d.id)) throw erro('Escolha quem vai usar o caixa.');
  const { rows } = await query('SELECT * FROM estoque_operadores WHERE user_id = $1::uuid AND id = $2::uuid AND ativo', [userId, d.id]);
  const o = rows[0];
  if (!o || !(await bcrypt.compare(String(d.pin || ''), o.pin_hash))) throw erro('PIN incorreto.');
  await query('UPDATE estoque_operadores SET ultimo_acesso = now() WHERE id = $1::uuid', [o.id]);
  const token = jwt.sign({ u: String(userId), op: o.id, nome: o.nome, papel: o.papel }, SEGREDO(), { expiresIn: '14h' });
  // credencial para vender sem internet neste aparelho (7 dias). O aparelho guarda ela cifrada com
  // uma chave tirada do PIN — o PIN em si nunca é guardado. Só vale para registrar venda feita sem
  // internet (ver operadorDoPedido).
  const offline = jwt.sign({ u: String(userId), op: o.id, off: 1 }, SEGREDO_OFF(), { expiresIn: '7d' });
  return { token, offline, operador: operadorObj(o) };
}
const SEGREDO_OFF = () => `${SEGREDO()}:offline`;
// Venda feita sem internet chegando agora: quem vendeu foi quem entrou com o PIN no aparelho, sem
// internet. A credencial só serve para POST /vendas com refCliente e feitaEm, e a venda precisa ter
// acontecido enquanto ela valia.
async function operadorOffline(req) {
  const t = req.headers['x-operador-offline'];
  const b = req.body || {};
  if (!t || req.method !== 'POST' || req.path !== '/vendas' || !b.refCliente || !b.feitaEm) return null;
  try {
    const p = jwt.verify(String(t), SEGREDO_OFF());
    if (p.u !== String(req.userId) || p.off !== 1) return null;
    const feita = new Date(b.feitaEm).getTime();
    if (!(feita >= p.iat * 1000 - 5 * 60000 && feita <= p.exp * 1000)) return null;
    const { rows } = await query('SELECT * FROM estoque_operadores WHERE user_id = $1::uuid AND id = $2::uuid AND ativo', [req.userId, p.op]);
    return rows[0] ? operadorObj(rows[0]) : null;
  } catch (e) { return null; }
}
// Operador do cabeçalho x-operador (null se não houver ou não valer)
async function operadorDoPedido(req) {
  const off = await operadorOffline(req);
  if (off) return off;
  const t = req.headers['x-operador'];
  if (!t) return null;
  try {
    const p = jwt.verify(String(t), SEGREDO());
    if (p.u !== String(req.userId)) return null;
    const { rows } = await query('SELECT * FROM estoque_operadores WHERE user_id = $1::uuid AND id = $2::uuid AND ativo', [req.userId, p.op]);
    return rows[0] ? operadorObj(rows[0]) : null;
  } catch (e) { return null; }
}

/* ------------------------------ caixa ------------------------------ */

const ZERO = () => Object.fromEntries(MEIOS_CAIXA.map((m) => [m, 0]));
function caixaObj(r) {
  return {
    id: r.id, numero: r.numero, status: r.status, trocoInicial: Number(r.troco_inicial), abertoEm: r.aberto_em, abertoPor: r.aberto_por,
    fechadoEm: r.fechado_em, fechadoPor: r.fechado_por, esperado: r.esperado || {}, contado: r.contado || {}, diferenca: Number(r.diferenca), obs: r.obs,
    turno: r.turno || '', previstoFim: r.previsto_fim || null, abertoAuto: !!r.aberto_auto, fechadoAuto: !!r.fechado_auto,
    conferir: !!r.conferir, trocoConferir: !!r.troco_conferir, trocoDe: r.troco_de || null, conferidoEm: r.conferido_em || null, conferidoPor: r.conferido_por || '',
  };
}
async function caixaAbertoRow(userId) {
  const { rows } = await query(`SELECT * FROM estoque_caixas WHERE user_id = $1::uuid AND status = 'aberto'`, [userId]);
  return rows[0] || null;
}

// Tudo que aconteceu no caixa e quanto deveria ter em cada forma de pagamento
async function resumoDoCaixa(userId, caixaRow) {
  const id = caixaRow.id;
  const v = await query(`SELECT numero, total, pagamentos, troco, cliente, operador, criado_em, cancelada FROM estoque_vendas WHERE user_id = $1::uuid AND caixa_id = $2::uuid ORDER BY criado_em`, [userId, id]);
  const m = await query('SELECT * FROM estoque_caixa_mov WHERE user_id = $1::uuid AND caixa_id = $2::uuid ORDER BY criado_em', [userId, id]);
  const vendasC = ZERO(); let fiadoVendidoC = 0; let totalVendasC = 0; let nVendas = 0; let trocosC = 0;
  for (const r of v.rows) {
    if (r.cancelada) continue;
    nVendas += 1; totalVendasC += centavos(r.total); trocosC += centavos(r.troco);
    for (const p of r.pagamentos || []) {
      if (p.meio === 'fiado') fiadoVendidoC += centavos(p.valor);
      else vendasC[p.meio] = (vendasC[p.meio] || 0) + centavos(p.valor);
    }
  }
  const mov = { sangria: 0, reforco: 0, despesa: 0 };
  const fiadoRecebidoC = ZERO();
  for (const r of m.rows) {
    if (r.tipo === 'fiado') fiadoRecebidoC[r.meio] = (fiadoRecebidoC[r.meio] || 0) + centavos(r.valor);
    else if (r.meio === 'dinheiro') mov[r.tipo] += centavos(r.valor);
  }
  const esperadoC = ZERO();
  for (const k of MEIOS_CAIXA) esperadoC[k] = (vendasC[k] || 0) + (fiadoRecebidoC[k] || 0);
  esperadoC.dinheiro += centavos(caixaRow.troco_inicial) + mov.reforco - mov.sangria - mov.despesa;
  const em = (o) => Object.fromEntries(Object.entries(o).map(([k, c]) => [k, reais(c)]));
  return {
    caixa: caixaObj(caixaRow),
    vendas: { quantidade: nVendas, total: reais(totalVendasC), porMeio: em(vendasC), fiado: reais(fiadoVendidoC), trocos: reais(trocosC) },
    movimentos: {
      sangria: reais(mov.sangria), reforco: reais(mov.reforco), despesa: reais(mov.despesa), fiadoRecebido: em(fiadoRecebidoC),
      lista: m.rows.map((r) => ({ id: r.id, tipo: r.tipo, meio: r.meio, valor: Number(r.valor), descricao: r.descricao, operador: r.operador, em: r.criado_em })),
    },
    ultimasVendas: v.rows.slice(-8).reverse().map((r) => ({ numero: r.numero, total: Number(r.total), cliente: r.cliente, operador: r.operador, em: r.criado_em, cancelada: r.cancelada, pagamentos: r.pagamentos })),
    esperado: em(esperadoC),
  };
}

// Caixas fechados sozinhos que ainda falta conferir (o mais novo primeiro)
async function pendentesDeConferir(userId) {
  const { rows } = await query(`SELECT * FROM estoque_caixas WHERE user_id = $1::uuid AND status = 'fechado' AND conferir ORDER BY fechado_em DESC LIMIT 10`, [userId]);
  return rows.map(caixaObj);
}

async function situacaoCaixa(userId, agora = new Date()) {
  const aberto = await caixaAbertoRow(userId);
  const pdv = await lerPdv(userId);
  const r = { aberto: aberto ? await resumoDoCaixa(userId, aberto) : null, pendentes: await pendentesDeConferir(userId), agora: agora.toISOString() };
  // o que o automático vai fazer (para a tela mostrar "fecha sozinho às 18:00" / "abre sozinho amanhã às 08:00")
  if (pdv.modoCaixa === 'horario') { const p = H.proximaAbertura(pdv.horario, agora); r.proximaAbertura = p ? p.inicio.toISOString() : null; }
  return r;
}

// Fim previsto do caixa aberto agora: o fim do horário/turno em que está (ou do próximo, se abriu um pouco antes)
function janelaParaAbrir(pdv, agora) {
  let j = H.janelaAtual(pdv, agora);
  if (!j && pdv.modoCaixa === 'horario') {
    const p = H.proximaAbertura(pdv.horario, agora);
    if (p && p.inicio - agora <= 3 * 3600000) j = p; // abriu até 3 horas antes do horário
  }
  return j;
}

// extra (uso interno): { auto, abertoEm, trocoDe, trocoConferir, janela }
async function abrirCaixa(userId, d = {}, operador = '', agora = new Date(), extra = {}) {
  const troco = d.trocoInicial === undefined || d.trocoInicial === '' ? 0 : valor(d.trocoInicial, 'Troco inicial', 0);
  const pdv = await lerPdv(userId);
  const j = extra.janela !== undefined ? extra.janela : janelaParaAbrir(pdv, agora);
  return transacao(async () => {
    if (await caixaAbertoRow(userId)) throw erro('Já existe um caixa aberto.');
    await query('INSERT INTO estoque_negocio (user_id) VALUES ($1::uuid) ON CONFLICT (user_id) DO NOTHING', [userId]);
    const n = (await query('UPDATE estoque_negocio SET seq_caixa = seq_caixa + 1 WHERE user_id = $1::uuid RETURNING seq_caixa AS n', [userId])).rows[0].n;
    await query(
      `INSERT INTO estoque_caixas (user_id, numero, troco_inicial, aberto_por, aberto_em, turno, previsto_fim, aberto_auto, troco_conferir, troco_de)
       VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [userId, n, troco, texto(operador, 60), (extra.abertoEm || agora).toISOString(), (j && j.nome) || '', j ? j.fim.toISOString() : null,
        !!extra.auto, !!extra.trocoConferir, extra.trocoDe || null]);
    return situacaoCaixa(userId, agora);
  });
}

// Sangria, reforço ou despesa paga com o dinheiro do caixa
async function movimentarCaixa(userId, d = {}, operador = '', agora = new Date(), registrarGasto = null) {
  const tipo = ['sangria', 'reforco', 'despesa'].includes(d.tipo) ? d.tipo : null;
  if (!tipo) throw erro('Escolha o tipo de movimento.');
  const v = valor(d.valor);
  const descricao = texto(d.descricao, 120);
  if (tipo === 'despesa' && !descricao) throw erro('Descreva a despesa (ex.: gás, entregador, limpeza).');
  return transacao(async () => {
    const cx = await caixaAbertoRow(userId);
    if (!cx) throw erro('Abra o caixa primeiro.');
    if (tipo !== 'reforco') {
      const r = await resumoDoCaixa(userId, cx);
      if (v > r.esperado.dinheiro + 0.004) throw erro(`No caixa só deveria ter ${r.esperado.dinheiro.toFixed(2).replace('.', ',')} em dinheiro.`);
    }
    let ref = null;
    if (tipo === 'despesa' && registrarGasto) {
      const g = await registrarGasto(userId, { descricao, valor: v, categoria: texto(d.categoria, 40) || 'Outros', meio: 'dinheiro', pago: true }, agora);
      ref = g.id;
    }
    await query('INSERT INTO estoque_caixa_mov (user_id, caixa_id, tipo, meio, valor, descricao, operador, ref) VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8)',
      [userId, cx.id, tipo, 'dinheiro', v, descricao || (tipo === 'sangria' ? 'Sangria' : 'Reforço de troco'), texto(operador, 60), ref]);
    return situacaoCaixa(userId);
  });
}

// Quebra (falta) ou sobra de caixa no Controle financeiro. Devolve o id do lançamento.
async function lancarDiferenca(userId, cx, difC, data) {
  const id = novoId('cx');
  const { rows } = await query('SELECT COALESCE(max(posicao), -1)::int AS p FROM financeiro_lancamentos WHERE user_id = $1::uuid', [userId]);
  const falta = difC < 0;
  await query(
    `INSERT INTO financeiro_lancamentos (user_id, id, posicao, data, descricao, tipo, categoria, escopo, forma, status, valor, recorrencia, parcelas, extras)
     VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, 'Empresa', 'Dinheiro', 'Pago', $8, 'unico', NULL, $9::jsonb)`,
    [userId, id, rows[0].p + 1, data, `${falta ? 'Quebra' : 'Sobra'} de caixa — caixa #${cx.numero}`, falta ? 'Despesa' : 'Receita', falta ? 'Quebra de caixa' : 'Outros',
      reais(Math.abs(difC)), JSON.stringify({ estoque: { origem: 'caixa', caixaId: cx.id, numero: cx.numero } })]);
  return id;
}

async function fecharCaixa(userId, d = {}, operador = '', agora = new Date()) {
  const contado = {};
  for (const k of MEIOS_CAIXA) if (d.contado && d.contado[k] !== undefined && d.contado[k] !== '') contado[k] = valor(d.contado[k], 'Valor contado', 0);
  if (contado.dinheiro === undefined) throw erro('Conte o dinheiro do caixa e informe o valor.');
  const hoje = H.diaDeTrabalho(await lerPdv(userId), agora);
  return transacao(async () => {
    const cx = (await query(`SELECT * FROM estoque_caixas WHERE user_id = $1::uuid AND status = 'aberto' FOR UPDATE`, [userId])).rows[0];
    if (!cx) throw erro('Não há caixa aberto.');
    const r = await resumoDoCaixa(userId, cx);
    const difC = centavos(contado.dinheiro) - centavos(r.esperado.dinheiro);
    const lancIds = difC !== 0 ? [await lancarDiferenca(userId, cx, difC, hoje)] : [];
    // contar a gaveta no fechamento também confere o troco (se o caixa abriu sozinho)
    await query(
      `UPDATE estoque_caixas SET status = 'fechado', fechado_em = $9, fechado_por = $3, esperado = $4::jsonb, contado = $5::jsonb, diferenca = $6, obs = $7, lancamento_ids = $8::text[], troco_conferir = false
        WHERE user_id = $1::uuid AND id = $2::uuid`,
      [userId, cx.id, texto(operador, 60), JSON.stringify(r.esperado), JSON.stringify(contado), reais(difC), texto(d.obs, 300), lancIds, agora.toISOString()]);
    // o troco veio de um caixa que fechou sozinho e ninguém contou a gaveta no começo: não dá para
    // separar de qual dos dois é a diferença, então ela fica toda neste fechamento e aquele sai da lista
    if (cx.troco_conferir && cx.troco_de) {
      const orig = (await query(`SELECT * FROM estoque_caixas WHERE user_id = $1::uuid AND id = $2::uuid AND conferir FOR UPDATE`, [userId, cx.troco_de])).rows[0];
      if (orig) await marcarConferido(userId, orig, centavos((orig.esperado || {}).dinheiro || 0), 0, operador, agora, `Conferido junto com o fechamento do caixa #${cx.numero}`);
    }
    const fechado = (await query('SELECT * FROM estoque_caixas WHERE user_id = $1::uuid AND id = $2::uuid', [userId, cx.id])).rows[0];
    return resumoDoCaixa(userId, fechado);
  });
}

/* ----------------------- caixa automático (horário e turnos) ----------------------- */

// Fecha sozinho (horário de funcionamento): guarda o que deveria ter e marca "falta conferir".
// Não lança diferença no financeiro: ninguém contou a gaveta.
async function fecharSozinho(userId, cx, quando) {
  const r = await resumoDoCaixa(userId, cx);
  await query(
    `UPDATE estoque_caixas SET status = 'fechado', fechado_em = $3, fechado_por = '', fechado_auto = true, conferir = true, esperado = $4::jsonb, contado = '{}'::jsonb, diferenca = 0
      WHERE user_id = $1::uuid AND id = $2::uuid AND status = 'aberto'`,
    [userId, cx.id, quando.toISOString(), JSON.stringify(r.esperado)]);
}

// Abre e fecha sozinho conforme o modo. Roda de minuto em minuto (server.js) e quando o PDV
// carrega (se o servidor atrasou, faz o que ficou para trás com o horário certo).
async function ajustarCaixaAutomatico(userId, agora = new Date()) {
  const pdv = await lerPdv(userId);
  if (pdv.modoCaixa !== 'horario' && pdv.modoCaixa !== 'turnos') return false;
  return transacao(async () => {
    // uma execução por vez para esta conta
    await query('INSERT INTO estoque_negocio (user_id) VALUES ($1::uuid) ON CONFLICT (user_id) DO NOTHING', [userId]);
    await query('SELECT 1 FROM estoque_negocio WHERE user_id = $1::uuid FOR UPDATE', [userId]);
    let mudou = false;
    let cx = (await query(`SELECT * FROM estoque_caixas WHERE user_id = $1::uuid AND status = 'aberto' FOR UPDATE`, [userId])).rows[0];
    // horário de funcionamento: passou da hora de fechar
    if (cx && pdv.modoCaixa === 'horario' && cx.previsto_fim && new Date(cx.previsto_fim) <= agora) {
      await fecharSozinho(userId, cx, new Date(cx.previsto_fim));
      cx = null; mudou = true;
    }
    if (cx) return mudou;
    const j = H.janelaAtual(pdv, agora);
    if (!j) return mudou;
    // já teve caixa neste horário/turno (abriu, ou alguém fechou na mão): não abre de novo sozinho
    const ja = await query(`SELECT 1 FROM estoque_caixas WHERE user_id = $1::uuid AND (aberto_em >= $2 OR fechado_em > $2) LIMIT 1`, [userId, j.inicio.toISOString()]);
    if (ja.rows.length) return mudou;
    // troco: o que ficou na gaveta no último caixa (contado, ou o que deveria ter se fechou sozinho)
    const ult = (await query(`SELECT * FROM estoque_caixas WHERE user_id = $1::uuid AND status = 'fechado' ORDER BY fechado_em DESC LIMIT 1`, [userId])).rows[0];
    const trocoC = !ult ? 0 : ult.conferir ? centavos((ult.esperado || {}).dinheiro || 0) : centavos((ult.contado || {}).dinheiro || 0);
    await abrirCaixa(userId, { trocoInicial: reais(Math.max(0, trocoC)) }, '', agora, {
      auto: true, abertoEm: j.inicio > agora ? agora : j.inicio, janela: j, trocoConferir: true, trocoDe: ult && ult.conferir ? ult.id : null,
    });
    return true;
  });
}

// Todas as contas com caixa automático (agendador do server.js, de minuto em minuto)
async function processarCaixasAutomaticos(agora = new Date()) {
  try {
    const { rows } = await query(`SELECT user_id::text AS id FROM estoque_negocio WHERE pdv->>'modoCaixa' IN ('horario', 'turnos')`);
    for (const r of rows) {
      try { await ajustarCaixaAutomatico(r.id, agora); } catch (e) { console.error('Caixa automático:', r.id, e.message); }
    }
  } catch (e) { console.error('Erro no caixa automático:', e.message); }
}

// Conferir e passar o turno: conta a gaveta, fecha o caixa do turno e abre o do próximo turno
// com o dinheiro contado como troco (menos o que foi retirado na troca, se alguém tirou).
async function passarTurno(userId, d = {}, operador = '', agora = new Date()) {
  const pdv = await lerPdv(userId);
  return transacao(async () => {
    const cx = await caixaAbertoRow(userId);
    if (!cx) throw erro('Não há caixa aberto.');
    const fechado = await fecharCaixa(userId, d, operador, agora);
    const retirado = d.retirado === undefined || d.retirado === '' ? 0 : valor(d.retirado, 'Valor retirado', 0);
    const trocoC = centavos(fechado.caixa.contado.dinheiro || 0) - centavos(retirado);
    if (trocoC < 0) throw erro('Não dá para retirar mais do que o dinheiro contado.');
    // próximo turno: o que está valendo agora (ou o que começa quando este termina, se passou antes da hora)
    const fim = cx.previsto_fim ? new Date(cx.previsto_fim) : null;
    const alvo = fim && fim > agora ? fim : agora;
    const j = pdv.modoCaixa === 'turnos' ? H.turnoEm(pdv.turnos, alvo) : null;
    const novo = await abrirCaixa(userId, { trocoInicial: reais(trocoC) }, operador, agora, { janela: j });
    return { fechado, ...novo };
  });
}

// Quando o troco de um caixa veio de outro que fechou sozinho: a contagem de agora confere esse
// caixa de antes. difC = contado agora − o que deveria ter agora (no caixa aberto).
async function conferirOrigem(userId, aberto, difC, retiradoC, operador, agora, obs) {
  const orig = (await query(`SELECT * FROM estoque_caixas WHERE user_id = $1::uuid AND id = $2::uuid AND conferir FOR UPDATE`, [userId, aberto.troco_de])).rows[0];
  if (!orig) return null;
  // a gaveta de verdade no fim daquele caixa = o troco com que este abriu + a diferença + o que tiraram depois
  const gavetaC = centavos(aberto.troco_inicial) + difC + retiradoC;
  return marcarConferido(userId, orig, gavetaC, retiradoC, operador, agora, obs);
}
async function marcarConferido(userId, cx, gavetaC, retiradoC, operador, agora, obs) {
  const esperado = { ...(cx.esperado || {}) };
  const difC = gavetaC - centavos(esperado.dinheiro || 0);
  const lancIds = [...(cx.lancamento_ids || [])];
  if (difC !== 0) lancIds.push(await lancarDiferenca(userId, cx, difC, H.partesBR(new Date(cx.fechado_em)).data));
  // o que foi tirado da gaveta depois que fechou (levado para o cofre ou o banco) fica registrado como sangria
  if (retiradoC > 0) {
    await query(`INSERT INTO estoque_caixa_mov (user_id, caixa_id, tipo, meio, valor, descricao, operador) VALUES ($1::uuid, $2::uuid, 'sangria', 'dinheiro', $3, 'Retirado da gaveta depois do fechamento', $4)`,
      [userId, cx.id, reais(retiradoC), texto(operador, 60)]);
  }
  const contado = { ...(cx.contado || {}), dinheiro: reais(gavetaC - retiradoC) };
  esperado.dinheiro = reais(centavos(esperado.dinheiro || 0) - retiradoC);
  await query(
    `UPDATE estoque_caixas SET conferir = false, conferido_em = $3, conferido_por = $4, contado = $5::jsonb, esperado = $6::jsonb, diferenca = $7, lancamento_ids = $8::text[],
            obs = CASE WHEN $9 = '' THEN obs ELSE $9 END
      WHERE user_id = $1::uuid AND id = $2::uuid`,
    [userId, cx.id, agora.toISOString(), texto(operador, 60), JSON.stringify(contado), JSON.stringify(esperado), reais(difC), lancIds, texto(obs, 300)]);
  return reais(difC);
}

// Conferir a gaveta depois: d = { caixaId?, contado: dinheiro contado agora, retirado?, obs? }
// - sem caixaId (ou o caixa de onde veio o troco do caixa aberto): conta a gaveta agora; acerta o
//   troco do caixa aberto e confere o caixa que fechou sozinho (se houver);
// - outro caixa pendente: a contagem é comparada direto com o que ele deveria ter (vale se a gaveta
//   não foi mexida depois que ele fechou).
async function conferirCaixa(userId, d = {}, operador = '', agora = new Date()) {
  const contadoC = centavos(valor(d.contado, 'Valor contado', 0));
  const retiradoC = d.retirado === undefined || d.retirado === '' ? 0 : centavos(valor(d.retirado, 'Valor retirado', 0));
  return transacao(async () => {
    const aberto = (await query(`SELECT * FROM estoque_caixas WHERE user_id = $1::uuid AND status = 'aberto' FOR UPDATE`, [userId])).rows[0];
    const doAberto = aberto && aberto.troco_conferir && (!d.caixaId || d.caixaId === aberto.troco_de);
    let diferenca = 0;
    if (doAberto) {
      const r = await resumoDoCaixa(userId, aberto);
      const difC = contadoC - centavos(r.esperado.dinheiro); // diferença na gaveta agora
      if (aberto.troco_de) diferenca = await conferirOrigem(userId, aberto, difC, retiradoC, operador, agora, d.obs) || 0;
      // o troco certo deste caixa é o que tinha de verdade quando abriu
      const trocoC = Math.max(0, centavos(aberto.troco_inicial) + difC);
      await query(`UPDATE estoque_caixas SET troco_inicial = $3, troco_conferir = false WHERE user_id = $1::uuid AND id = $2::uuid`, [userId, aberto.id, reais(trocoC)]);
    } else {
      if (!ehUuid(d.caixaId)) throw erro('Nada para conferir agora.');
      const cx = (await query(`SELECT * FROM estoque_caixas WHERE user_id = $1::uuid AND id = $2::uuid AND status = 'fechado' AND conferir FOR UPDATE`, [userId, d.caixaId])).rows[0];
      if (!cx) throw erro('Este caixa já foi conferido.');
      diferenca = await marcarConferido(userId, cx, contadoC + retiradoC, retiradoC, operador, agora, d.obs);
    }
    return { diferenca, ...(await situacaoCaixa(userId, agora)) };
  });
}

async function historicoCaixas(userId) {
  const { rows } = await query(
    `SELECT c.*, (SELECT count(*) FROM estoque_vendas v WHERE v.user_id = c.user_id AND v.caixa_id = c.id AND NOT v.cancelada)::int AS vendas,
            (SELECT COALESCE(sum(total), 0) FROM estoque_vendas v WHERE v.user_id = c.user_id AND v.caixa_id = c.id AND NOT v.cancelada)::float AS total
       FROM estoque_caixas c WHERE c.user_id = $1::uuid ORDER BY c.aberto_em DESC LIMIT 90`, [userId]);
  return rows.map((r) => ({ ...caixaObj(r), vendas: r.vendas, total: Math.round(r.total * 100) / 100 }));
}
async function caixaPorId(userId, id) {
  if (!ehUuid(id)) throw erro('Caixa não encontrado.');
  const { rows } = await query('SELECT * FROM estoque_caixas WHERE user_id = $1::uuid AND id = $2::uuid', [userId, id]);
  if (!rows[0]) throw erro('Caixa não encontrado.');
  return resumoDoCaixa(userId, rows[0]);
}

/* ------------------------------ fiado ------------------------------ */

async function contaFiado(userId, clienteId) {
  if (!ehUuid(clienteId)) throw erro('Cliente não encontrado.');
  const { rows } = await query(
    `SELECT id, numero, data, total, fiado_aberto, itens FROM estoque_vendas
      WHERE user_id = $1::uuid AND cliente_id = $2::uuid AND fiado_aberto > 0 AND NOT cancelada ORDER BY data, numero`, [userId, clienteId]);
  const vendas = rows.map((r) => ({ id: r.id, numero: r.numero, data: r.data, total: Number(r.total), aberto: Number(r.fiado_aberto), itens: r.itens.length }));
  return { total: Math.round(vendas.reduce((a, v) => a + v.aberto, 0) * 100) / 100, vendas };
}

async function receberFiado(userId, clienteId, d = {}, operador = '', agora = new Date()) {
  if (!ehUuid(clienteId)) throw erro('Cliente não encontrado.');
  const meio = MEIOS_CAIXA.includes(d.meio) ? d.meio : null;
  if (!meio) throw erro('Escolha como o cliente pagou.');
  let restanteC = centavos(valor(d.valor));
  const hoje = hojeBR(agora);
  return transacao(async () => {
    const cli = (await query('SELECT nome FROM estoque_clientes WHERE user_id = $1::uuid AND id = $2::uuid', [userId, clienteId])).rows[0];
    if (!cli) throw erro('Cliente não encontrado.');
    const { rows } = await query(
      `SELECT * FROM estoque_vendas WHERE user_id = $1::uuid AND cliente_id = $2::uuid AND fiado_aberto > 0 AND NOT cancelada ORDER BY data, numero FOR UPDATE`, [userId, clienteId]);
    const devidoC = rows.reduce((a, r) => a + centavos(r.fiado_aberto), 0);
    if (!devidoC) throw erro('Este cliente não tem fiado em aberto.');
    if (restanteC > devidoC) throw erro(`O cliente deve ${reais(devidoC).toFixed(2).replace('.', ',')}. O valor passou disso.`);
    const totalC = restanteC;
    const { rows: pos } = await query('SELECT COALESCE(max(posicao), -1)::int AS p FROM financeiro_lancamentos WHERE user_id = $1::uuid', [userId]);
    let posicao = pos[0].p + 1;
    for (const v of rows) {
      if (restanteC <= 0) break;
      const pagaC = Math.min(restanteC, centavos(v.fiado_aberto));
      restanteC -= pagaC;
      // a pendência da venda diminui (ou some)
      const pend = (await query(
        `SELECT id, valor FROM financeiro_lancamentos WHERE user_id = $1::uuid AND id = ANY($2::text[]) AND (extras->'estoque'->>'fiado')::boolean IS TRUE`, [userId, v.lancamento_ids])).rows[0];
      if (pend) {
        const sobra = centavos(pend.valor) - pagaC;
        if (sobra > 0) await query('UPDATE financeiro_lancamentos SET valor = $3, updated_at = now() WHERE user_id = $1::uuid AND id = $2', [userId, pend.id, reais(sobra)]);
        else await query('DELETE FROM financeiro_lancamentos WHERE user_id = $1::uuid AND id = $2', [userId, pend.id]);
      }
      const idRec = novoId('f');
      await query(
        `INSERT INTO financeiro_lancamentos (user_id, id, posicao, data, descricao, tipo, categoria, escopo, forma, status, valor, recorrencia, parcelas, extras)
         VALUES ($1::uuid, $2, $3, $4, $5, 'Receita', 'Vendas', 'Empresa', $6, 'Pago', $7, 'unico', NULL, $8::jsonb)`,
        [userId, idRec, posicao++, hoje, `Recebimento de fiado — venda #${v.numero} — ${cli.nome}`, contaDoMeio(meio), reais(pagaC),
          JSON.stringify({ estoque: { origem: 'fiado', vendaId: v.id, numero: v.numero, meio } })]);
      await query(
        `UPDATE estoque_vendas SET fiado_aberto = fiado_aberto - $3, lancamento_ids = array_append(lancamento_ids, $4) WHERE user_id = $1::uuid AND id = $2::uuid`,
        [userId, v.id, reais(pagaC), idRec]);
    }
    const cx = await caixaAbertoRow(userId);
    if (cx) {
      await query('INSERT INTO estoque_caixa_mov (user_id, caixa_id, tipo, meio, valor, descricao, operador, ref) VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8)',
        [userId, cx.id, 'fiado', meio, reais(totalC), `Fiado recebido — ${cli.nome}`, texto(operador, 60), clienteId]);
    }
    return { recebido: reais(totalC), conta: await contaFiado(userId, clienteId) };
  });
}

// Quem deve, para a lista de clientes e o resumo
async function fiadoEmAberto(userId) {
  const { rows } = await query(
    `SELECT cliente_id, sum(fiado_aberto)::float AS total FROM estoque_vendas WHERE user_id = $1::uuid AND fiado_aberto > 0 AND NOT cancelada AND cliente_id IS NOT NULL GROUP BY cliente_id`, [userId]);
  const porCliente = Object.fromEntries(rows.map((r) => [r.cliente_id, Math.round(r.total * 100) / 100]));
  return { total: Math.round(rows.reduce((a, r) => a + r.total, 0) * 100) / 100, clientes: rows.length, porCliente };
}

module.exports = {
  ErroCaixa, MEIOS_CAIXA, PDV_PADRAO, pdvDe, lerPdv, salvarPdv, operadorObj, CHEFIA,
  listarOperadores, salvarOperador, excluirOperador, entrarOperador, operadorDoPedido,
  situacaoCaixa, abrirCaixa, movimentarCaixa, fecharCaixa, historicoCaixas, caixaPorId,
  ajustarCaixaAutomatico, processarCaixasAutomaticos, passarTurno, conferirCaixa, pendentesDeConferir,
  contaFiado, receberFiado, fiadoEmAberto,
};
