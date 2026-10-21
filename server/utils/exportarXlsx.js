/* PDV — planilha do mês em Excel (.xlsx).
   Abas: Resumo, Vendas, Itens vendidos, Mais vendidos, Pagamentos, Caixas, Despesas, Compras,
   Estoque (hoje) e Clientes. Valores como número (R$), datas como data: dá para somar,
   filtrar e fazer gráfico direto no Excel ou no Google Planilhas. */
const ExcelJS = require('exceljs');
const E = require('./estoque');
const F = require('./fidelidade');
const C = require('./caixa');
const { hojeBR } = require('./fechamento');

const MES_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const NOME_MEIO = { ...E.NOME_MEIO, misto: 'Vários' };
const R$ = '"R$" #,##0.00;[Red]-"R$" #,##0.00';
const COR = 'FF9A5B1E';

const dataX = (iso) => { if (!iso) return null; const [a, m, d] = String(iso).slice(0, 10).split('-').map(Number); return new Date(Date.UTC(a, m - 1, d)); };
// hora local do Brasil, como texto (o Excel não tem fuso)
const horaBR = (ts) => (ts ? new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }) : '');
const dataHoraX = (ts) => {
  if (!ts) return null;
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date(ts)).map((x) => [x.type, x.value]));
  return new Date(Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute));
};
const r2 = (n) => Math.round(Number(n || 0) * 100) / 100;

// Cria uma aba com cabeçalho colorido, filtro, primeira linha congelada e formatos por coluna
function aba(wb, nome, colunas, linhas, { totais = null } = {}) {
  const ws = wb.addWorksheet(nome, { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = colunas.map((c) => ({ header: c.t, key: c.k, width: c.w || 14, style: c.f === 'R$' ? { numFmt: R$ } : c.f === 'data' ? { numFmt: 'dd/mm/yyyy' } : c.f === 'datahora' ? { numFmt: 'dd/mm/yyyy hh:mm' } : c.f ? { numFmt: c.f } : {} }));
  const h = ws.getRow(1);
  h.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  h.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR } };
  h.alignment = { vertical: 'middle' };
  h.height = 20;
  linhas.forEach((l) => ws.addRow(l));
  if (linhas.length) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: colunas.length } };
  if (totais && linhas.length) {
    const ult = linhas.length + 1;
    const row = ws.addRow({});
    row.font = { bold: true };
    colunas.forEach((c, i) => {
      const letra = ws.getColumn(i + 1).letter;
      if (i === 0) row.getCell(1).value = 'Total';
      else if (totais.includes(c.k)) row.getCell(i + 1).value = { formula: `SUBTOTAL(9,${letra}2:${letra}${ult})`, result: Math.round(linhas.reduce((t, l) => t + (Number(l[c.k]) || 0), 0) * 1000) / 1000 };
    });
    row.border = { top: { style: 'thin' } };
  }
  if (!linhas.length) ws.addRow([colunas.length ? 'Nada neste período.' : '']).font = { italic: true, color: { argb: 'FF888888' } };
  return ws;
}

async function gerarPlanilha(userId, mes, agora = new Date()) {
  if (!MES_RE.test(String(mes || ''))) mes = hojeBR(agora).slice(0, 7);
  const [ano, m] = mes.split('-').map(Number);
  const de = `${mes}-01`; const ate = `${mes}-${String(new Date(ano, m, 0).getDate()).padStart(2, '0')}`;
  const negocio = (await E.lerNegocio(userId)) || {};
  const vendas = (await E.listarVendas(userId, { de, ate, limite: 200000 })).sort((a, b) => (a.data === b.data ? a.numero - b.numero : a.data < b.data ? -1 : 1));
  const validas = vendas.filter((v) => !v.cancelada);
  const comandas = new Set(validas.filter((v) => v.comandaId).map((v) => v.comandaId));

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Livro-Caixa'; wb.created = agora;

  // ---------- Resumo ----------
  const soma = (f) => r2(validas.reduce((a, v) => a + f(v), 0));
  const fat = soma((v) => v.total); const cmv = soma((v) => v.cmv); const taxas = soma((v) => v.taxa);
  const compras = await E.listarCompras(userId, { de, ate, limite: 200000 });
  const gastos = await E.listarGastos(userId, null, { de, ate, limite: 200000 });
  const fiado = await C.fiadoEmAberto(userId);
  const resumo = [
    ['Negócio', negocio.nome || ''],
    ['Período', `${MESES[m - 1]} de ${ano}`],
    ['Gerado em', dataHoraX(agora)],
    [],
    ['Faturamento (vendas)', fat],
    ['Número de vendas', validas.length],
    ['Ticket médio', validas.length ? r2(fat / validas.length) : 0],
    ['Descontos dados', soma((v) => v.desconto + v.cashbackUsado + v.premioValor)],
    ['Taxa de serviço / entrega cobrada', soma((v) => v.acrescimo)],
    ['Custo da mercadoria vendida (CMV)', cmv],
    ['Taxas de cartão', taxas],
    ['Lucro bruto (vendas − CMV − taxas)', r2(fat - cmv - taxas)],
    ['Margem bruta', fat ? r2((fat - cmv - taxas) / fat) : 0],
    [],
    ['Compras de mercadoria', r2(compras.filter((c) => !c.cancelada).reduce((a, c) => a + c.total, 0))],
    ['Notas de gasto (despesas)', r2(gastos.reduce((a, g) => a + g.valor, 0))],
    ['Fiado a receber (hoje, todos os meses)', fiado.total],
    ['Vendas canceladas', vendas.length - validas.length],
    ...(comandas.size ? [['Contas de mesa/comanda fechadas', comandas.size]] : []),
  ];
  const wr = wb.addWorksheet('Resumo');
  wr.columns = [{ width: 40 }, { width: 22 }];
  const t = wr.addRow([`${negocio.nome || 'PDV'} — ${MESES[m - 1]} de ${ano}`]);
  t.font = { bold: true, size: 14, color: { argb: COR } };
  wr.addRow([]);
  resumo.forEach((l) => {
    const row = wr.addRow(l);
    if (!l.length) return;
    row.getCell(1).font = { bold: true };
    const rot = l[0];
    const c = row.getCell(2);
    if (rot === 'Gerado em') c.numFmt = 'dd/mm/yyyy hh:mm';
    else if (rot === 'Margem bruta') c.numFmt = '0.0%';
    else if (typeof l[1] === 'number' && !/Número|canceladas|fechadas/.test(rot)) c.numFmt = R$;
  });
  wr.addRow([]);
  wr.addRow(['Valores das vendas já com desconto. O CMV usa o custo médio de cada produto no momento da venda.']).font = { italic: true, color: { argb: 'FF777777' } };

  // ---------- Vendas ----------
  const origem = (v) => (v.comandaId ? 'Mesa/comanda' : v.pedidoId ? 'Cardápio digital' : 'Balcão');
  const pagTxt = (v) => (v.pagamentos && v.pagamentos.length ? v.pagamentos.map((p) => `${NOME_MEIO[p.meio] || p.meio} ${p.valor.toFixed(2).replace('.', ',')}`).join(' + ') : NOME_MEIO[v.meio] || v.meio);
  aba(wb, 'Vendas', [
    { t: 'Nº', k: 'n', w: 7 }, { t: 'Data', k: 'data', f: 'data', w: 11 }, { t: 'Hora', k: 'hora', w: 7 }, { t: 'Origem', k: 'origem', w: 15 },
    { t: 'Cliente / mesa', k: 'cliente', w: 22 }, { t: 'Itens', k: 'itens', w: 46 },
    { t: 'Subtotal', k: 'sub', f: 'R$' }, { t: 'Desconto', k: 'desc', f: 'R$' }, { t: 'Cashback/prêmio', k: 'benef', f: 'R$' }, { t: 'Taxa serv./entrega', k: 'acr', f: 'R$' },
    { t: 'Total', k: 'total', f: 'R$' }, { t: 'CMV', k: 'cmv', f: 'R$' }, { t: 'Taxa cartão', k: 'taxa', f: 'R$' }, { t: 'Lucro bruto', k: 'lucro', f: 'R$' },
    { t: 'Pagamento', k: 'pag', w: 28 }, { t: 'Troco', k: 'troco', f: 'R$', w: 10 }, { t: 'Fiado em aberto', k: 'fiado', f: 'R$' }, { t: 'Operador', k: 'op', w: 12 }, { t: 'Situação', k: 'sit', w: 11 },
  ], vendas.map((v) => ({
    n: v.numero, data: dataX(v.data), hora: horaBR(v.criadoEm), origem: origem(v), cliente: v.cliente || '',
    itens: v.itens.map((i) => `${Number(i.qtd).toLocaleString('pt-BR')}× ${i.nome}`).join(', '),
    sub: v.subtotal, desc: v.desconto, benef: r2(v.cashbackUsado + v.premioValor), acr: v.acrescimo, total: v.cancelada ? 0 : v.total,
    cmv: v.cancelada ? 0 : v.cmv, taxa: v.cancelada ? 0 : v.taxa, lucro: v.cancelada ? 0 : v.lucro,
    pag: pagTxt(v), troco: v.troco, fiado: v.fiadoAberto, op: v.operador, sit: v.cancelada ? 'Cancelada' : 'OK',
  })), { totais: ['sub', 'desc', 'benef', 'acr', 'total', 'cmv', 'taxa', 'lucro', 'fiado'] });

  // ---------- Itens vendidos ----------
  const itens = [];
  for (const v of validas) {
    for (const i of v.itens) {
      itens.push({ data: dataX(v.data), n: v.numero, produto: i.nome, adic: (i.opcoes || []).join(', '), qtd: Number(i.qtd), unit: Number(i.unit),
        total: r2(Number(i.qtd) * Number(i.unit)), custoU: r2(i.custoUnit || 0), custo: r2(Number(i.qtd) * Number(i.custoUnit || 0)), origem: origem(v) });
    }
  }
  aba(wb, 'Itens vendidos', [
    { t: 'Data', k: 'data', f: 'data', w: 11 }, { t: 'Venda nº', k: 'n', w: 9 }, { t: 'Produto', k: 'produto', w: 34 }, { t: 'Adicionais / obs.', k: 'adic', w: 30 },
    { t: 'Qtd', k: 'qtd', f: '#,##0.###', w: 8 }, { t: 'Preço unit.', k: 'unit', f: 'R$' }, { t: 'Total', k: 'total', f: 'R$' },
    { t: 'Custo unit.', k: 'custoU', f: 'R$' }, { t: 'Custo total', k: 'custo', f: 'R$' }, { t: 'Origem', k: 'origem', w: 15 },
  ], itens, { totais: ['qtd', 'total', 'custo'] });

  // ---------- Mais vendidos ----------
  const porProd = new Map();
  for (const i of itens) {
    const k = i.produto; const a = porProd.get(k) || { produto: k, qtd: 0, total: 0, custo: 0, vendas: new Set() };
    a.qtd += i.qtd; a.total += i.total; a.custo += i.custo; a.vendas.add(i.n); porProd.set(k, a);
  }
  aba(wb, 'Mais vendidos', [
    { t: 'Produto', k: 'produto', w: 34 }, { t: 'Qtd vendida', k: 'qtd', f: '#,##0.###', w: 12 }, { t: 'Nº de vendas', k: 'vendas', w: 12 },
    { t: 'Faturamento', k: 'total', f: 'R$' }, { t: 'Custo', k: 'custo', f: 'R$' }, { t: 'Lucro bruto', k: 'lucro', f: 'R$' }, { t: 'Margem', k: 'margem', f: '0%', w: 9 },
  ], [...porProd.values()].sort((a, b) => b.total - a.total).map((a) => ({
    produto: a.produto, qtd: Math.round(a.qtd * 1000) / 1000, vendas: a.vendas.size, total: r2(a.total), custo: r2(a.custo), lucro: r2(a.total - a.custo),
    margem: a.total ? (a.total - a.custo) / a.total : 0,
  })), { totais: ['qtd', 'total', 'custo', 'lucro'] });

  // ---------- Pagamentos ----------
  const porMeio = new Map();
  for (const v of validas) {
    const ps = v.pagamentos && v.pagamentos.length ? v.pagamentos : [{ meio: v.meio, valor: v.total }];
    for (const p of ps) { const a = porMeio.get(p.meio) || { n: 0, valor: 0 }; a.n += 1; a.valor += Number(p.valor); porMeio.set(p.meio, a); }
  }
  const taxaMeio = new Map();
  for (const v of validas) if (v.taxa) { const meio = (v.pagamentos && v.pagamentos[0] ? v.pagamentos[0].meio : v.meio); taxaMeio.set(meio, (taxaMeio.get(meio) || 0) + v.taxa); }
  aba(wb, 'Pagamentos', [
    { t: 'Forma de pagamento', k: 'meio', w: 24 }, { t: 'Nº de pagamentos', k: 'n', w: 16 }, { t: 'Valor recebido', k: 'valor', f: 'R$', w: 16 }, { t: '% do total', k: 'pct', f: '0.0%', w: 11 },
  ], [...porMeio.entries()].sort((a, b) => b[1].valor - a[1].valor).map(([meio, a]) => ({ meio: NOME_MEIO[meio] || meio, n: a.n, valor: r2(a.valor), pct: fat ? a.valor / fat : 0 })), { totais: ['n', 'valor'] });

  // ---------- Caixas ----------
  const caixas = (await C.historicoCaixas(userId)).filter((c) => { const d = dataHoraX(c.abertoEm).toISOString().slice(0, 10); return d >= de && d <= ate; }).reverse();
  aba(wb, 'Caixas', [
    { t: 'Caixa nº', k: 'n', w: 9 }, { t: 'Aberto em', k: 'ab', f: 'datahora', w: 17 }, { t: 'Aberto por', k: 'abp', w: 12 }, { t: 'Fechado em', k: 'fe', f: 'datahora', w: 17 }, { t: 'Fechado por', k: 'fep', w: 12 },
    { t: 'Troco inicial', k: 'troco', f: 'R$' }, { t: 'Vendas', k: 'vendas', w: 8 }, { t: 'Total vendido', k: 'total', f: 'R$' },
    { t: 'Dinheiro esperado', k: 'esp', f: 'R$', w: 16 }, { t: 'Dinheiro contado', k: 'cont', f: 'R$', w: 16 }, { t: 'Diferença', k: 'dif', f: 'R$' }, { t: 'Situação', k: 'sit', w: 10 }, { t: 'Obs.', k: 'obs', w: 30 },
  ], caixas.map((c) => ({
    n: c.numero, ab: dataHoraX(c.abertoEm), abp: c.abertoPor, fe: dataHoraX(c.fechadoEm), fep: c.fechadoPor, troco: c.trocoInicial, vendas: c.vendas, total: c.total,
    esp: c.status === 'fechado' ? Number(c.esperado.dinheiro || 0) : null, cont: c.contado.dinheiro !== undefined ? Number(c.contado.dinheiro) : null,
    dif: c.status === 'fechado' ? c.diferenca : null, sit: c.status === 'fechado' ? 'Fechado' : 'Aberto', obs: c.obs,
  })), { totais: ['vendas', 'total', 'dif'] });

  // ---------- Despesas e compras ----------
  // (a despesa paga com o dinheiro do caixa também é uma nota de gasto: já entra aqui)
  aba(wb, 'Despesas', [
    { t: 'Data', k: 'data', f: 'data', w: 11 }, { t: 'Descrição', k: 'desc', w: 36 }, { t: 'Categoria', k: 'cat', w: 20 }, { t: 'Fornecedor', k: 'forn', w: 20 },
    { t: 'Valor', k: 'valor', f: 'R$' }, { t: 'Forma', k: 'meio', w: 16 }, { t: 'Situação', k: 'sit', w: 11 },
  ], gastos.slice().reverse().map((g) => ({ data: dataX(g.data), desc: g.descricao, cat: g.categoria, forn: g.fornecedor, valor: g.valor, meio: NOME_MEIO[g.meio] || g.meio || '', sit: g.status })), { totais: ['valor'] });
  aba(wb, 'Compras', [
    { t: 'Data', k: 'data', f: 'data', w: 11 }, { t: 'Fornecedor', k: 'forn', w: 22 }, { t: 'Itens', k: 'itens', w: 46 }, { t: 'Frete', k: 'frete', f: 'R$', w: 10 },
    { t: 'Total', k: 'total', f: 'R$' }, { t: 'Pagamento', k: 'meio', w: 16 }, { t: 'Vencimento', k: 'venc', f: 'data', w: 11 }, { t: 'Situação', k: 'sit', w: 11 },
  ], compras.slice().reverse().map((c) => ({
    data: dataX(c.data), forn: c.fornecedor, itens: c.itens.map((i) => `${Number(i.qtd).toLocaleString('pt-BR')}× ${i.nome}`).join(', '), frete: c.frete,
    total: c.cancelada ? 0 : c.total, meio: NOME_MEIO[c.meio] || c.meio, venc: dataX(c.vencimento), sit: c.cancelada ? 'Cancelada' : 'OK',
  })), { totais: ['frete', 'total'] });

  // ---------- Estoque (agora) ----------
  const produtos = await E.listarProdutos(userId);
  const SIT = { ok: 'OK', baixo: 'Baixo', acabou: 'Acabou', livre: 'Sem controle' };
  const est = [];
  for (const p of produtos) {
    const linhas = p.variacoes.length ? p.variacoes.map((v) => ({ nome: p.nome, var: v.nome, cod: v.codigo || p.codigo, preco: v.precoFinal, custo: v.custoFinal, estoque: v.estoque, min: v.estoqueMinimo, sit: v.situacao, ativo: p.ativo && v.ativo }))
      : [{ nome: p.nome, var: '', cod: p.codigo, preco: p.preco, custo: p.custo, estoque: p.estoque, min: p.estoqueMinimo, sit: p.situacao, ativo: p.ativo }];
    for (const l of linhas) {
      est.push({ produto: l.nome, var: l.var, cat: p.categoria, cod: l.cod || '', un: p.unidade, preco: l.preco, custo: l.custo,
        estoque: p.controlaEstoque ? l.estoque : null, min: p.controlaEstoque ? l.min : null,
        valor: p.controlaEstoque ? r2(Math.max(0, l.estoque) * l.custo) : null, sit: SIT[l.sit] || l.sit, ativo: l.ativo ? 'Sim' : 'Não' });
    }
  }
  aba(wb, 'Estoque (hoje)', [
    { t: 'Produto', k: 'produto', w: 30 }, { t: 'Variação', k: 'var', w: 14 }, { t: 'Categoria', k: 'cat', w: 16 }, { t: 'Código', k: 'cod', w: 14 }, { t: 'Unidade', k: 'un', w: 8 },
    { t: 'Preço', k: 'preco', f: 'R$' }, { t: 'Custo', k: 'custo', f: 'R$' }, { t: 'Estoque', k: 'estoque', f: '#,##0.###', w: 10 }, { t: 'Mínimo', k: 'min', f: '#,##0.###', w: 9 },
    { t: 'Valor em estoque (custo)', k: 'valor', f: 'R$', w: 20 }, { t: 'Situação', k: 'sit', w: 13 }, { t: 'Ativo', k: 'ativo', w: 7 },
  ], est, { totais: ['valor'] });

  // ---------- Clientes ----------
  const clientes = await F.listarClientes(userId, {}, hojeBR(agora));
  aba(wb, 'Clientes', [
    { t: 'Nome', k: 'nome', w: 26 }, { t: 'Telefone', k: 'tel', w: 16 }, { t: 'Compras', k: 'compras', w: 9 }, { t: 'Total gasto', k: 'gasto', f: 'R$' },
    { t: 'Ticket médio', k: 'ticket', f: 'R$' }, { t: 'Última compra', k: 'ult', f: 'data', w: 13 }, { t: 'Deve (fiado)', k: 'deve', f: 'R$' },
    { t: 'Cashback (saldo)', k: 'saldo', f: 'R$', w: 15 }, { t: 'Selos', k: 'selos', w: 7 }, { t: 'Participa da fidelidade', k: 'part', w: 20 },
  ], clientes.map((c) => ({
    nome: c.nome, tel: c.telefone, compras: c.compras, gasto: c.totalGasto, ticket: c.compras ? r2(c.totalGasto / c.compras) : 0, ult: dataX(c.ultimaCompra),
    deve: fiado.porCliente[c.id] || 0, saldo: c.saldo, selos: c.selos, part: c.participa ? 'Sim' : 'Não',
  })), { totais: ['compras', 'gasto', 'deve', 'saldo'] });

  const buffer = await wb.xlsx.writeBuffer();
  const nomeArq = `PDV ${(negocio.nome || '').replace(/[^\p{L}\p{N} ._-]/gu, '').trim() || 'relatorio'} ${mes}.xlsx`.replace(/\s+/g, ' ');
  return { buffer: Buffer.from(buffer), nome: nomeArq };
}

module.exports = { gerarPlanilha };
