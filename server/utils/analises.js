/* PDV — análises das vendas (Relatórios → Produtos e Horários).

   - Curva ABC: os produtos ordenados pelo lucro (ou faturamento) que trazem. Classe A = os que
     somam os primeiros 80%, B = até 95%, C = o resto (inclui quem dá prejuízo).
   - Margem por produto: preço médio vendido, custo médio, lucro e margem — e a margem do
     cadastro (preço x custo de hoje), para achar o que está barato demais.
   - Horários: faturamento por dia da semana × hora (mapa de calor), no horário de Brasília.

   Receita de cada item = preço × quantidade, menos a parte dele no desconto, cashback e prêmio
   da venda (dividido pelo valor). A taxa do cartão também é dividida pelo valor; a taxa de
   serviço/entrega não é do produto e fica de fora. Custo = custo médio no momento da venda. */
const { query } = require('../db/pool');
const E = require('./estoque');

const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;
const r2 = (n) => Math.round(Number(n || 0) * 100) / 100;
const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

function partesBR(ts) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23', weekday: 'short' })
    .formatToParts(new Date(ts)).map((x) => [x.type, x.value]));
  return { data: `${p.year}-${p.month}-${p.day}`, hora: Number(p.hour), dia: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday) };
}

async function analisar(userId, { de, ate, base = 'lucro', agruparVariacoes = true } = {}) {
  if (!DATA_RE.test(String(de)) || !DATA_RE.test(String(ate)) || de > ate) throw new E.ErroEstoque('Período inválido.');
  const { rows } = await query(`SELECT data, criado_em, itens, subtotal, desconto, cashback_usado, premio_valor, total, acrescimo, cmv, taxa
    FROM estoque_vendas WHERE user_id = $1::uuid AND NOT cancelada AND data BETWEEN $2 AND $3 ORDER BY data LIMIT 20000`, [userId, de, ate]);
  const catalogo = await E.listarProdutos(userId);
  const porId = new Map(catalogo.map((p) => [p.id, p]));

  // ---------- produtos ----------
  const prod = new Map();
  let fat = 0; let lucroTotal = 0;
  for (const v of rows) {
    const sub = Number(v.subtotal);
    const liquido = sub - Number(v.desconto) - Number(v.cashback_usado || 0) - Number(v.premio_valor || 0);
    const fator = sub > 0 ? Math.max(0, liquido) / sub : 0;
    const taxa = Number(v.taxa || 0);
    for (const i of v.itens || []) {
      const bruto = Number(i.qtd) * Number(i.unit);
      const receita = bruto * fator;
      const custo = Number(i.qtd) * Number(i.custoUnit || 0);
      const taxaParte = liquido > 0 ? taxa * (receita / liquido) : 0;
      const p = i.produtoId ? porId.get(i.produtoId) : null;
      const chave = agruparVariacoes && i.produtoId ? i.produtoId : `${i.produtoId || ''}|${i.variacaoId || ''}|${i.produtoId ? '' : i.nome}`;
      const nome = agruparVariacoes && p ? p.nome : i.nome;
      const a = prod.get(chave) || { chave, produtoId: i.produtoId || null, nome, categoria: p ? p.categoria : '', qtd: 0, receita: 0, custo: 0, taxa: 0, vendas: new Set(), avulso: !i.produtoId };
      a.qtd += Number(i.qtd); a.receita += receita; a.custo += custo; a.taxa += taxaParte; a.vendas.add(`${v.data}|${v.criado_em}`);
      prod.set(chave, a);
      fat += receita; lucroTotal += receita - custo - taxaParte;
    }
  }
  const lista = [...prod.values()].map((a) => {
    const lucro = a.receita - a.custo - a.taxa;
    const p = a.produtoId ? porId.get(a.produtoId) : null;
    // margem do cadastro (hoje): preço x custo; com variações, a média delas
    let margemCadastro = null;
    if (p) {
      const vs = p.variacoes.filter((x) => x.ativo);
      const pares = vs.length ? vs.map((x) => [x.precoFinal, x.custoFinal]) : [[p.preco, p.custo]];
      const preco = pares.reduce((s, x) => s + x[0], 0); const custo = pares.reduce((s, x) => s + x[1], 0);
      margemCadastro = preco > 0 ? (preco - custo) / preco : null;
    }
    return {
      produtoId: a.produtoId, nome: a.nome, categoria: a.categoria, avulso: a.avulso, qtd: Math.round(a.qtd * 1000) / 1000, vendas: a.vendas.size,
      faturamento: r2(a.receita), custo: r2(a.custo), taxas: r2(a.taxa), lucro: r2(lucro),
      precoMedio: a.qtd ? r2(a.receita / a.qtd) : 0, custoMedio: a.qtd ? r2(a.custo / a.qtd) : 0,
      margem: a.receita > 0 ? Math.round((lucro / a.receita) * 1000) / 1000 : null,
      margemCadastro: margemCadastro === null ? null : Math.round(margemCadastro * 1000) / 1000,
      semCusto: a.custo === 0 && !a.avulso,
    };
  });
  const campo = base === 'faturamento' ? 'faturamento' : 'lucro';
  lista.sort((a, b) => b[campo] - a[campo]);
  const positivo = lista.reduce((s, x) => s + Math.max(0, x[campo]), 0);
  let acum = 0;
  for (const x of lista) {
    const valor = Math.max(0, x[campo]);
    x.participacao = positivo > 0 ? Math.round((valor / positivo) * 1000) / 1000 : 0;
    const antes = acum; acum += valor;
    x.acumulado = positivo > 0 ? Math.round((acum / positivo) * 1000) / 1000 : 0;
    // entra na classe pela posição em que começa (o item que cruza os 80% ainda é A)
    const inicio = positivo > 0 ? antes / positivo : 1;
    x.classe = x[campo] <= 0 ? 'C' : inicio < 0.8 ? 'A' : inicio < 0.95 ? 'B' : 'C';
  }
  const classes = ['A', 'B', 'C'].map((c) => {
    const l = lista.filter((x) => x.classe === c);
    return { classe: c, produtos: l.length, faturamento: r2(l.reduce((s, x) => s + x.faturamento, 0)), lucro: r2(l.reduce((s, x) => s + x.lucro, 0)) };
  });
  // produtos ativos que não venderam nada no período
  const vendidos = new Set(lista.map((x) => x.produtoId).filter(Boolean));
  const parados = catalogo.filter((p) => p.ativo && !vendidos.has(p.id)).map((p) => ({ produtoId: p.id, nome: p.nome, categoria: p.categoria, estoque: p.controlaEstoque ? p.estoque : null }));

  // ---------- horários ----------
  const grade = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => ({ vendas: 0, total: 0 })));
  const porDia = Array.from({ length: 7 }, () => ({ vendas: 0, total: 0, dias: new Set() }));
  const porHora = Array.from({ length: 24 }, () => ({ vendas: 0, total: 0 }));
  let semHora = 0;
  for (const v of rows) {
    const t = Number(v.total);
    const pb = partesBR(v.criado_em);
    const [y, mo, d] = String(v.data).split('-').map(Number);
    const dia = new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
    porDia[dia].vendas += 1; porDia[dia].total += t; porDia[dia].dias.add(v.data);
    // venda lançada para outro dia: não sabemos a hora
    if (pb.data !== String(v.data)) { semHora += 1; continue; }
    grade[dia][pb.hora].vendas += 1; grade[dia][pb.hora].total += t;
    porHora[pb.hora].vendas += 1; porHora[pb.hora].total += t;
  }
  // quantas vezes cada dia da semana aparece no período (para a média por dia)
  const ocorrencias = Array(7).fill(0);
  for (let dt = new Date(`${de}T12:00:00Z`); dt <= new Date(`${ate}T12:00:00Z`); dt.setUTCDate(dt.getUTCDate() + 1)) ocorrencias[dt.getUTCDay()] += 1;
  const totalVendas = rows.reduce((s, v) => s + Number(v.total), 0);
  const dias = porDia.map((x, i) => ({ dia: i, nome: DIAS[i], vendas: x.vendas, total: r2(x.total), media: ocorrencias[i] ? r2(x.total / ocorrencias[i]) : 0, ticket: x.vendas ? r2(x.total / x.vendas) : 0, participacao: totalVendas ? Math.round((x.total / totalVendas) * 1000) / 1000 : 0 }));
  const horas = porHora.map((x, h) => ({ hora: h, vendas: x.vendas, total: r2(x.total), ticket: x.vendas ? r2(x.total / x.vendas) : 0 }));
  // as 3 horas seguidas mais fortes
  let pico = null;
  for (let h = 0; h <= 21; h++) { const s = horas[h].total + horas[h + 1].total + horas[h + 2].total; if (s > 0 && (!pico || s > pico.total)) pico = { de: h, ate: h + 3, total: r2(s) }; }
  return {
    periodo: { de, ate }, base: campo, vendas: rows.length, faturamentoVendas: r2(totalVendas),
    produtos: { lista, classes, faturamento: r2(fat), lucro: r2(lucroTotal), parados },
    horarios: { grade: grade.map((l) => l.map((c) => ({ vendas: c.vendas, total: r2(c.total) }))), dias, horas, pico, semHora },
  };
}

module.exports = { analisar };
