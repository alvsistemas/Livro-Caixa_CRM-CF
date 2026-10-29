/* Fechamento da venda: liga o card ganho do CRM ao Controle financeiro.
   A pessoa informa o valor final (com desconto) e como vai receber; cada parcela vira
   um lançamento de Receita de verdade no financeiro, marcado com extras.crmFechamento
   = { clienteId, fechamentoId, tipo, parcela, total, meio }. Os custos da venda (produto,
   frete, taxa do cartão, imposto) viram Despesas com a mesma marca (tipo = o custo).
   Refazer o fechamento troca os lançamentos antigos pelos novos (mantendo como "Pago"
   o que já estava marcado assim). A taxa do cartão e o imposto usam o % guardado uma
   vez (config.taxasVenda); mudar o % na janela muda o guardado ("mudar taxa?"). */
const crypto = require('crypto');
const { query, transacao } = require('../db/pool');
const Contrato = require('../models/Contrato');
const { obterRegraPorChave, percentualTotalDaRegra } = require('./regrasComissao');
const { calcComissaoPorRegra } = require('./comissaoCalc');

const FORMAS = ['avista', 'parcelado', 'entrada'];
// como o cliente pagou -> forma de pagamento do lançamento no financeiro.
// Cartão da maquininha cai na conta do banco (no financeiro, "Cartão de Crédito" é o
// cartão da própria pessoa, usado pra despesas).
const MEIOS = {
  pix: { nome: 'Pix', conta: 'Pix' },
  dinheiro: { nome: 'Dinheiro', conta: 'Dinheiro' },
  credito: { nome: 'Cartão de crédito', conta: 'Conta Corrente' },
  debito: { nome: 'Cartão de débito', conta: 'Conta Corrente' },
  boleto: { nome: 'Boleto', conta: 'Boleto' },
  transferencia: { nome: 'Transferência', conta: 'Conta Corrente' },
  outro: { nome: 'Outro', conta: 'Conta Corrente' },
};
const MAX_PARCELAS = 48;
// % guardado por meio (crédito parcelado tem taxa própria) + o imposto
const CHAVES_TAXA = ['credito', 'creditoParcelado', 'debito', 'pix', 'boleto', 'transferencia', 'dinheiro', 'outro'];
const chaveDaTaxa = (meio, forma) => (meio === 'credito' && forma !== 'avista' ? 'creditoParcelado' : meio);
const CUSTOS = {
  produto: { nome: 'Custo do produto', categoria: 'Custo de mercadoria' },
  frete: { nome: 'Frete', categoria: 'Frete' },
  taxa: { nome: 'Taxa de pagamento', categoria: 'Taxas de pagamento' },
  imposto: { nome: 'Imposto sobre a venda', categoria: 'Impostos' },
  devolucao: { nome: 'Devolução', categoria: 'Devoluções' },
};
const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;

class ErroFechamento extends Error {}
const erro = (m) => new ErroFechamento(m);
const centavos = (v) => Math.round(Number(v) * 100);

function dataValida(s) {
  if (typeof s !== 'string' || !DATA_RE.test(s)) return false;
  const [a, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d));
  return dt.getUTCFullYear() === a && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

// mesma data, n meses depois (dia 31 em mês de 30 dias vira o último dia do mês)
function somarMeses(iso, n) {
  const [a, m, d] = iso.split('-').map(Number);
  const alvo = new Date(Date.UTC(a, m - 1 + n, 1));
  const ultimo = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  alvo.setUTCDate(Math.min(d, ultimo));
  return alvo.toISOString().slice(0, 10);
}

// divide um total (em centavos) em n partes; a sobra dos centavos fica na primeira
function dividir(totalCent, n) {
  const base = Math.floor(totalCent / n);
  const partes = Array(n).fill(base);
  partes[0] += totalCent - base * n;
  return partes;
}

/* Confere o que veio da tela e devolve o fechamento normalizado (valores em reais).
   entrada: { valorFinal | descontoPct, forma, parcelas, entrada, primeiraData, meio, recebido } */
function normalizarFechamento(dados, valorOriginal) {
  if (!dados || typeof dados !== 'object') throw erro('Dados do fechamento inválidos.');
  const originalCent = Math.max(0, centavos(valorOriginal) || 0);

  let finalCent;
  let descontoPct = null;
  if (dados.descontoPct !== undefined && dados.descontoPct !== null && dados.descontoPct !== '') {
    descontoPct = Number(dados.descontoPct);
    if (!Number.isFinite(descontoPct) || descontoPct < 0 || descontoPct >= 100) throw erro('O desconto precisa ficar entre 0% e 99%.');
    if (!originalCent) throw erro('Esse cliente está sem valor. Informe o valor final em reais.');
    finalCent = Math.round(originalCent * (100 - descontoPct) / 100);
  } else {
    finalCent = centavos(dados.valorFinal);
    if (!Number.isFinite(finalCent)) throw erro('Informe o valor final da venda.');
  }
  if (finalCent <= 0) throw erro('O valor final precisa ser maior que zero.');
  if (finalCent > 100000000000) throw erro('Valor alto demais.');

  const forma = FORMAS.includes(dados.forma) ? dados.forma : null;
  if (!forma) throw erro('Escolha como o cliente vai pagar.');
  const meio = MEIOS[dados.meio] ? dados.meio : null;
  if (!meio) throw erro('Escolha o meio de pagamento.');
  if (!dataValida(dados.primeiraData)) throw erro(forma === 'entrada' ? 'Informe a data da entrada.' : 'Informe a data do primeiro pagamento.');

  let parcelas = 1;
  let entradaCent = 0;
  if (forma === 'parcelado') {
    parcelas = parseInt(dados.parcelas, 10);
    if (!(parcelas >= 2 && parcelas <= MAX_PARCELAS)) throw erro(`Parcelado: escolha de 2 a ${MAX_PARCELAS} parcelas.`);
  } else if (forma === 'entrada') {
    parcelas = parseInt(dados.parcelas, 10);
    if (!(parcelas >= 1 && parcelas <= MAX_PARCELAS)) throw erro(`Escolha de 1 a ${MAX_PARCELAS} parcelas depois da entrada.`);
    entradaCent = centavos(dados.entrada);
    if (!(entradaCent > 0)) throw erro('Informe o valor da entrada.');
    if (entradaCent >= finalCent) throw erro('A entrada precisa ser menor que o valor final.');
  }

  // custos (todos opcionais)
  const c = dados.custos && typeof dados.custos === 'object' ? dados.custos : {};
  const dinheiroOpc = (v, nome) => {
    if (v === undefined || v === null || v === '') return 0;
    const n = centavos(v);
    if (!Number.isFinite(n) || n < 0 || n > 100000000000) throw erro(`${nome}: valor inválido.`);
    return n;
  };
  const pctOpc = (v, nome, max) => {
    if (v === undefined || v === null || v === '') return null;
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0 || n > max) throw erro(`${nome}: use um número de 0 a ${max}%.`);
    return Math.round(n * 100) / 100;
  };
  const produtoCent = dinheiroOpc(c.produto, 'Custo do produto');
  const freteCent = dinheiroOpc(c.frete, 'Frete');
  const taxaPct = pctOpc(c.taxaPct, 'Taxa', 30);
  const impostoPct = pctOpc(c.impostoPct, 'Imposto', 60);
  const taxaCent = taxaPct ? Math.round(finalCent * taxaPct / 100) : 0;
  const impostoCent = impostoPct ? Math.round(finalCent * impostoPct / 100) : 0;

  return {
    custos: {
      produto: produtoCent / 100,
      frete: freteCent / 100,
      taxaPct,
      taxa: taxaCent / 100,
      impostoPct,
      imposto: impostoCent / 100,
      total: (produtoCent + freteCent + taxaCent + impostoCent) / 100,
    },
    valorOriginal: originalCent / 100,
    valorFinal: finalCent / 100,
    desconto: Math.max(0, originalCent - finalCent) / 100,
    descontoPct,
    forma,
    parcelas,
    entrada: forma === 'entrada' ? entradaCent / 100 : null,
    primeiraData: dados.primeiraData,
    meio,
    recebido: !!dados.recebido,
  };
}

// Parcelas (data e valor) de um fechamento já normalizado
function montarParcelas(f) {
  const finalCent = centavos(f.valorFinal);
  if (f.forma === 'avista') return [{ data: f.primeiraData, valor: f.valorFinal, rotulo: '' }];
  if (f.forma === 'parcelado') {
    return dividir(finalCent, f.parcelas).map((c, i) => ({ data: somarMeses(f.primeiraData, i), valor: c / 100, rotulo: `${i + 1}/${f.parcelas}` }));
  }
  const entradaCent = centavos(f.entrada);
  const resto = dividir(finalCent - entradaCent, f.parcelas).map((c, i) => ({ data: somarMeses(f.primeiraData, i + 1), valor: c / 100, rotulo: `${i + 1}/${f.parcelas}` }));
  return [{ data: f.primeiraData, valor: entradaCent / 100, rotulo: 'entrada' }, ...resto];
}

// Situação de cada parcela no financeiro: a primeira pode já ter sido recebida;
// o que vence no futuro fica "Agendado"; o que já venceu e não foi recebido, "Pendente".
function statusDaParcela(i, data, hoje, recebido) {
  if (i === 0 && recebido) return 'Pago';
  return data > hoje ? 'Agendado' : 'Pendente';
}

function hojeBR(agora = new Date()) {
  return new Date(agora.getTime() - 3 * 3600 * 1000).toISOString().slice(0, 10);
}

// Lançamentos que o servidor cria no financeiro pra um fechamento.
// pagosAntes: chaves "tipo:parcela" que já estavam como Pago (ex.: "receita:1", "produto:0").
// dataVenda: dia do fechamento — produto e frete entram nesse dia, como pagos.
function montarLancamentos(card, f, fechamentoId, hoje, pagosAntes = new Set(), dataVenda = hoje) {
  const parcelas = montarParcelas(f);
  const nome = String(card.cliente || 'Cliente').slice(0, 120);
  const clienteId = String(card._id || card.id);
  const marca = (tipo, parcela) => ({ crmFechamento: { clienteId, fechamentoId, tipo, parcela, total: parcelas.length, meio: f.meio } });
  const receitas = parcelas.map((p, i) => ({
    id: `crmv-${fechamentoId}-${i + 1}`,
    data: p.data,
    descricao: `Venda — ${nome}${p.rotulo ? ` (${p.rotulo})` : ''}`,
    tipo: 'Receita',
    categoria: 'Vendas',
    escopo: 'Empresa',
    forma: MEIOS[f.meio].conta,
    status: pagosAntes.has(`receita:${i + 1}`) ? 'Pago' : statusDaParcela(i, p.data, hoje, f.recebido),
    valor: p.valor,
    extras: marca('receita', i + 1),
  }));
  const custos = [];
  const c = f.custos || {};
  const custo = (tipo, valor, data, status, forma, detalhe) => {
    if (!(valor > 0)) return;
    custos.push({
      id: `crmv-${fechamentoId}-${tipo}`,
      data,
      descricao: `${CUSTOS[tipo].nome}${detalhe ? ` ${detalhe}` : ''} — ${nome}`,
      tipo: 'Despesa',
      categoria: CUSTOS[tipo].categoria,
      escopo: 'Empresa',
      forma,
      status: pagosAntes.has(`${tipo}:0`) ? 'Pago' : status,
      valor,
      extras: marca(tipo, 0),
    });
  };
  const futuro = (d) => (d > hoje ? 'Agendado' : 'Pendente');
  custo('produto', c.produto, dataVenda, 'Pago', 'Conta Corrente');
  custo('frete', c.frete, dataVenda, 'Pago', 'Conta Corrente');
  // a taxa sai junto com o que a maquininha/banco repassa: acompanha a 1ª parcela
  custo('taxa', c.taxa, f.primeiraData, receitas[0].status === 'Pago' ? 'Pago' : futuro(f.primeiraData), MEIOS[f.meio].conta, `(${String(c.taxaPct).replace('.', ',')}%)`);
  custo('imposto', c.imposto, f.primeiraData, futuro(f.primeiraData), 'Boleto', `(${String(c.impostoPct).replace('.', ',')}%)`);
  return [...receitas, ...custos];
}

// total de uma comissão (todas as parcelas)
function totalDaComissao(ct) {
  if (!ct) return 0;
  if (Array.isArray(ct.blocos) && ct.blocos.length) return Math.round(ct.blocos.reduce((s, b) => s + (Number(b.value) || 0) * (Number(b.parcelas) || 1), 0) * 100) / 100;
  const p1 = Number(ct.parcelas1 != null ? ct.parcelas1 : ct.parcelas) || 0;
  return Math.round(((Number(ct.value) || 0) * p1 + (Number(ct.value2) || 0) * Math.max(0, (Number(ct.parcelas) || 0) - p1)) * 100) / 100;
}

// A comissão segue a regra: por padrão, calcula sobre o valor final do fechamento.
// Só mexe na comissão gerada pelo Pipeline (as manuais ficam como a pessoa fez).
async function ajustarComissao(userId, card, f) {
  const regra = await obterRegraPorChave(userId, card.tipoProduto);
  let contrato = await Contrato.findOne({ cardId: card._id, userId });
  if (!regra) return { contrato, regra: null, base: f.valorFinal }; // sem produto/serviço: sem comissão
  const base = regra.base === 'negociado' ? (Number(card.valor) || 0) : f.valorFinal;
  if (contrato && !contrato.geradoAutomaticamente) return { contrato, regra, base };
  if (!(base > 0)) return { contrato, regra, base };
  if (!contrato && !(percentualTotalDaRegra(regra) > 0)) return { contrato, regra, base }; // produto sem comissão
  const calc = calcComissaoPorRegra(base, regra);
  if (!contrato) {
    const hoje = new Date();
    const mes = /^\d{4}-\d{2}/.test(card.mes || '') ? card.mes : `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
    contrato = await Contrato.create({
      userId, cardId: card._id, geradoAutomaticamente: true, desc: card.cliente || 'Cliente', scope: 'Pessoal',
      date: new Date(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)) - 1, 1), valorVenda: base,
      tipoProduto: card.tipoProduto, regraNome: regra.nome || '',
      parcelas: calc.parcelas, parcelas1: calc.parcelas1, value: calc.value, value2: calc.value2, blocos: calc.blocos,
    });
  } else if (Number(contrato.valorVenda) !== base) {
    Object.assign(contrato, { valorVenda: base, regraNome: regra.nome || '', parcelas: calc.parcelas, parcelas1: calc.parcelas1, value: calc.value, value2: calc.value2, blocos: calc.blocos });
    await contrato.save();
  }
  return { contrato, regra, base };
}

/* ---------------- banco ---------------- */

async function lancamentosDoCard(userId, cardId) {
  const { rows } = await query(
    `SELECT id, data, descricao, tipo, status, valor, extras FROM financeiro_lancamentos
      WHERE user_id = $1::uuid AND extras ? 'crmFechamento' AND extras->'crmFechamento'->>'clienteId' = $2
      ORDER BY tipo DESC, (extras->'crmFechamento'->>'parcela')::int, id`,
    [userId, String(cardId)]
  );
  return rows.map((r) => ({
    id: r.id,
    data: r.data instanceof Date ? r.data.toISOString().slice(0, 10) : String(r.data || '').slice(0, 10),
    descricao: r.descricao,
    tipoLancamento: r.tipo,
    tipo: r.extras.crmFechamento.tipo || 'receita', // fechamentos da etapa 1 não tinham "tipo": eram só receitas
    status: r.status,
    valor: Number(r.valor),
    parcela: Number(r.extras.crmFechamento.parcela) || 0,
  }));
}

// Cria (ou refaz) o fechamento de um card: grava os lançamentos e o resumo no card
async function salvarFechamento(userId, card, dados, agora = new Date()) {
  const f = normalizarFechamento(dados, card.valor);
  const fechamentoId = crypto.randomBytes(6).toString('hex');
  const hoje = hojeBR(agora);
  const anterior = card.fechamento || null;
  // venda refeita depois de desfeita conta como venda nova (de hoje)
  const dataVenda = (anterior && !anterior.cancelado && anterior.dataVenda) || hoje;
  return transacao(async () => {
    // devoluções são registros à parte: refazer o fechamento não mexe nelas
    const antigos = (await lancamentosDoCard(userId, card._id)).filter((l) => l.tipo !== 'devolucao');
    // o que a pessoa já marcou como recebido/pago continua assim
    const pagosAntes = new Set(antigos.filter((l) => l.status === 'Pago').map((l) => `${l.tipo}:${l.parcela}`));
    const novos = montarLancamentos(card, f, fechamentoId, hoje, pagosAntes, dataVenda);
    if (antigos.length) {
      await query(`DELETE FROM financeiro_lancamentos WHERE user_id = $1::uuid AND id = ANY($2::text[])`, [userId, antigos.map((l) => l.id)]);
    }
    const { rows } = await query('SELECT COALESCE(max(posicao), -1)::int AS p FROM financeiro_lancamentos WHERE user_id = $1::uuid', [userId]);
    let posicao = rows[0].p + 1;
    for (const l of novos) {
      await query(
        `INSERT INTO financeiro_lancamentos (user_id, id, posicao, data, descricao, tipo, categoria, escopo, forma, status, valor, recorrencia, parcelas, extras)
         VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'unico', NULL, $12::jsonb)`,
        [userId, l.id, posicao++, l.data, l.descricao, l.tipo, l.categoria, l.escopo, l.forma, l.status, l.valor, JSON.stringify(l.extras)]
      );
    }
    // % usado vira o guardado (o "mudar taxa?" da janela)
    const guardar = {};
    if (f.custos.taxaPct !== null) guardar[chaveDaTaxa(f.meio, f.forma)] = f.custos.taxaPct;
    if (f.custos.impostoPct !== null) guardar.imposto = f.custos.impostoPct;
    if (Object.keys(guardar).length) await salvarTaxas(userId, guardar);
    const com = await ajustarComissao(userId, card, f);
    const resumo = {
      id: fechamentoId,
      valorOriginal: f.valorOriginal,
      valorFinal: f.valorFinal,
      desconto: f.desconto,
      descontoPct: f.descontoPct,
      forma: f.forma,
      parcelas: f.parcelas,
      entrada: f.entrada,
      primeiraData: f.primeiraData,
      meio: f.meio,
      dataVenda,
      custos: f.custos,
      comissao: com.contrato ? totalDaComissao(com.contrato) : 0,
      lancamentoIds: novos.map((l) => l.id),
      criadoEm: (anterior && anterior.criadoEm) || agora.toISOString(),
      atualizadoEm: agora.toISOString(),
    };
    await query('UPDATE clientes SET fechamento = $3::jsonb, fechamento_pendente = false, updated_at = now() WHERE user_id = $1::uuid AND id = $2::uuid',
      [userId, String(card._id), JSON.stringify(resumo)]);
    return { fechamento: resumo, lancamentos: novos, substituidos: antigos.length };
  });
}

// Modo da integração (o que o financeiro faz com o CRM), se a pessoa já escolheu,
// as taxas guardadas e se a comissão entra como custo da empresa
async function lerModo(userId) {
  const { rows } = await query('SELECT config FROM financeiro_perfis WHERE user_id = $1::uuid', [userId]);
  const config = (rows[0] && rows[0].config) || {};
  return {
    modo: ['vendas', 'comissoes', 'nenhum'].includes(config.integracaoCrm) ? config.integracaoCrm : 'vendas',
    perguntado: !!config.integracaoCrmPerguntado || config.integracaoCrm !== undefined,
    taxas: limparTaxas(config.taxasVenda),
    descontarComissoes: !!config.descontarComissoes,
  };
}
function limparTaxas(t) {
  const out = {};
  if (!t || typeof t !== 'object') return out;
  for (const k of [...CHAVES_TAXA, 'imposto']) {
    const n = Number(t[k]);
    if (t[k] !== null && t[k] !== undefined && t[k] !== '' && Number.isFinite(n) && n >= 0 && n <= 60) out[k] = Math.round(n * 100) / 100;
  }
  return out;
}
// Guarda (ou apaga, com null) os % da taxa por meio e do imposto. Junta com o que já existe.
async function salvarTaxas(userId, novas) {
  const permitidas = [...CHAVES_TAXA, 'imposto'];
  const mudar = {};
  for (const [k, v] of Object.entries(novas || {})) {
    if (!permitidas.includes(k)) throw erro('Taxa desconhecida.');
    if (v === null || v === '') { mudar[k] = null; continue; }
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0 || n > (k === 'imposto' ? 60 : 30)) throw erro(`Use um número de 0 a ${k === 'imposto' ? 60 : 30}%.`);
    mudar[k] = Math.round(n * 100) / 100;
  }
  const { rows } = await query('SELECT config FROM financeiro_perfis WHERE user_id = $1::uuid', [userId]);
  const atuais = limparTaxas(rows[0] && rows[0].config && rows[0].config.taxasVenda);
  for (const [k, v] of Object.entries(mudar)) { if (v === null) delete atuais[k]; else atuais[k] = v; }
  await query(
    `INSERT INTO financeiro_perfis (user_id, config) VALUES ($1::uuid, jsonb_build_object('taxasVenda', $2::jsonb))
     ON CONFLICT (user_id) DO UPDATE SET config = COALESCE(financeiro_perfis.config, '{}'::jsonb) || jsonb_build_object('taxasVenda', $2::jsonb), updated_at = now()`,
    [userId, JSON.stringify(atuais)]
  );
  return atuais;
}

// Regra de comissão do card (pra janela mostrar a comissão prevista)
async function regraDoCard(userId, card) {
  const regra = await obterRegraPorChave(userId, card.tipoProduto);
  if (!regra) return null; // sem produto/serviço: a janela não mostra comissão
  const percentualTotal = percentualTotalDaRegra(regra);
  if (!(percentualTotal > 0)) return null;
  return { nome: regra.nome || 'Padrão', base: regra.base === 'negociado' ? 'negociado' : 'final', percentualTotal };
}
async function definirModo(userId, modo) {
  if (!['vendas', 'comissoes', 'nenhum'].includes(modo)) throw erro('Modo inválido.');
  const extra = JSON.stringify({ integracaoCrm: modo, integracaoCrmPerguntado: true });
  await query(
    `INSERT INTO financeiro_perfis (user_id, config) VALUES ($1::uuid, $2::jsonb)
     ON CONFLICT (user_id) DO UPDATE SET config = COALESCE(financeiro_perfis.config, '{}'::jsonb) || $2::jsonb, updated_at = now()`,
    [userId, extra]
  );
  return { modo, perguntado: true };
}

/* ---------------- etapa 3: venda desfeita, devolução, cliente excluído ---------------- */

// A venda saiu de Ganho: apaga o que ainda não foi recebido/pago (receitas e custos) e,
// se pedido, registra a devolução do que o cliente já pagou. O que foi recebido fica.
async function cancelarVenda(userId, card, dados = {}, agora = new Date()) {
  const f = card.fechamento;
  if (!f) throw erro('Esse cliente não tem fechamento de venda.');
  if (f.cancelado) throw erro('Essa venda já foi desfeita.');
  const hoje = hojeBR(agora);
  return transacao(async () => {
    const ligados = await lancamentosDoCard(userId, card._id);
    const apagar = ligados.filter((l) => l.status !== 'Pago' && l.tipo !== 'devolucao');
    if (apagar.length) await query('DELETE FROM financeiro_lancamentos WHERE user_id = $1::uuid AND id = ANY($2::text[])', [userId, apagar.map((l) => l.id)]);
    const recebido = Math.round(ligados.filter((l) => l.tipoLancamento === 'Receita' && l.status === 'Pago').reduce((a, l) => a + l.valor, 0) * 100) / 100;
    let devolucao = null;
    if (dados.devolucao && dados.devolucao.valor) {
      const jaDevolvido = ligados.filter((l) => l.tipo === 'devolucao').reduce((a, l) => a + l.valor, 0);
      devolucao = await inserirDevolucao(userId, card, dados.devolucao, hoje, Math.max(0, Math.round((recebido - jaDevolvido) * 100) / 100));
    }
    const cancelado = {
      em: agora.toISOString(),
      apagados: apagar.length,
      aReceberCancelado: Math.round(apagar.filter((l) => l.tipoLancamento === 'Receita').reduce((a, l) => a + l.valor, 0) * 100) / 100,
      recebidoMantido: recebido,
      devolvido: devolucao ? devolucao.valor : 0,
    };
    await query(`UPDATE clientes SET fechamento = fechamento || jsonb_build_object('cancelado', $3::jsonb), updated_at = now() WHERE user_id = $1::uuid AND id = $2::uuid`,
      [userId, String(card._id), JSON.stringify(cancelado)]);
    return { cancelado, devolucao };
  });
}

// Devolução (parcial ou total): uma despesa "Devoluções" ligada à venda
async function inserirDevolucao(userId, card, dados, hoje, limite) {
  const valorCent = centavos(dados.valor);
  if (!(valorCent > 0)) throw erro('Informe o valor devolvido.');
  const teto = centavos(limite != null ? limite : (card.fechamento && card.fechamento.valorFinal) || 0);
  if (valorCent > teto) throw erro(`A devolução não pode passar de ${(teto / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}.`);
  const data = dados.data === undefined || dados.data === '' ? hoje : dados.data;
  if (!dataValida(data)) throw erro('Data da devolução inválida.');
  const motivo = String(dados.motivo || '').trim().slice(0, 120);
  const nome = String(card.cliente || 'Cliente').slice(0, 120);
  const f = card.fechamento || {};
  const id = `crmv-dev-${crypto.randomBytes(6).toString('hex')}`;
  const { rows } = await query('SELECT COALESCE(max(posicao), -1)::int AS p FROM financeiro_lancamentos WHERE user_id = $1::uuid', [userId]);
  const extras = { crmFechamento: { clienteId: String(card._id), fechamentoId: f.id || null, tipo: 'devolucao', parcela: 0, total: 0, meio: f.meio || null } };
  if (motivo) extras.obs = motivo;
  await query(
    `INSERT INTO financeiro_lancamentos (user_id, id, posicao, data, descricao, tipo, categoria, escopo, forma, status, valor, recorrencia, parcelas, extras)
     VALUES ($1::uuid, $2, $3, $4, $5, 'Despesa', 'Devoluções', 'Empresa', $6, $7, $8, 'unico', NULL, $9::jsonb)`,
    [userId, id, rows[0].p + 1, data, `Devolução — ${nome}${motivo ? ` (${motivo})` : ''}`, MEIOS[f.meio] ? MEIOS[f.meio].conta : 'Conta Corrente',
      data > hoje ? 'Agendado' : 'Pago', valorCent / 100, JSON.stringify(extras)]
  );
  return { id, valor: valorCent / 100, data };
}

// Devolução registrada pela ficha do cliente (venda continua valendo)
async function registrarDevolucao(userId, card, dados = {}, agora = new Date()) {
  if (!card.fechamento) throw erro('Faça o fechamento da venda antes de registrar uma devolução.');
  const hoje = hojeBR(agora);
  return transacao(async () => {
    const ligados = await lancamentosDoCard(userId, card._id);
    const jaDevolvido = ligados.filter((l) => l.tipo === 'devolucao').reduce((a, l) => a + l.valor, 0);
    const limite = Math.max(0, Math.round((Number(card.fechamento.valorFinal) - jaDevolvido) * 100) / 100);
    return inserirDevolucao(userId, card, dados, hoje, limite);
  });
}

// O card foi excluído no CRM: os lançamentos ficam (dinheiro não some do histórico),
// marcados "cliente excluído"
async function marcarClienteExcluido(userId, cardId, nome) {
  await query(
    `UPDATE financeiro_lancamentos
        SET extras = jsonb_set(extras, '{crmFechamento}', (extras->'crmFechamento') || jsonb_build_object('clienteExcluido', true, 'clienteNome', $3::text)), updated_at = now()
      WHERE user_id = $1::uuid AND extras ? 'crmFechamento' AND extras->'crmFechamento'->>'clienteId' = $2`,
    [userId, String(cardId), String(nome || '').slice(0, 120)]
  );
}

module.exports = {
  FORMAS, MEIOS, MAX_PARCELAS, CHAVES_TAXA, CUSTOS, ErroFechamento, chaveDaTaxa,
  normalizarFechamento, montarParcelas, montarLancamentos, statusDaParcela, somarMeses, dividir, hojeBR, totalDaComissao,
  lancamentosDoCard, salvarFechamento, cancelarVenda, registrarDevolucao, marcarClienteExcluido, lerModo, definirModo, salvarTaxas, limparTaxas, regraDoCard, ajustarComissao,
};
