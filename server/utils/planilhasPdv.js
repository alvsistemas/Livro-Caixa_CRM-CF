/* PDV — produtos e clientes em planilha do Excel (.xlsx), ida e volta.

   Exportar: uma linha por produto (ou por variação), com as mesmas colunas que a importação lê.
   Importar: a pessoa manda a planilha (a exportada ou uma dela, com cabeçalho), vê a prévia
   (novo / atualizar / sem mudança / erro) e confirma.
   - Produto: reconhecido pela coluna ID (da exportação) ou pelo nome. Variações pelo nome.
     O estoque de produto novo vira o estoque inicial; nos que já existem, só muda se a pessoa
     marcar "atualizar o estoque pela planilha" (vira um ajuste de contagem, com histórico).
   - Cliente: reconhecido pelo telefone (ou pelo nome, se não tiver telefone). */
const ExcelJS = require('exceljs');
const JSZip = require('jszip');
const E = require('./estoque');
const F = require('./fidelidade');
const C = require('./caixa');
const { hojeBR } = require('./fechamento');
const { transacao } = require('../db/pool');

class ErroPlanilha extends Error {}
const erro = (m) => new ErroPlanilha(m);
const R$ = '"R$" #,##0.00';
const COR = 'FF9A5B1E';
const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const simNao = (v, padrao) => { const t = semAcento(v); if (!t) return padrao; return /^(s|sim|y|yes|x|1|true|verdadeiro|ativo)$/.test(t) ? true : /^(n|nao|no|0|false|falso|inativo)$/.test(t) ? false : padrao; };
function numero(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let t = String(v).replace(/R\$|\s/g, '');
  if (/^-?\d{1,3}(\.\d{3})*,\d+$/.test(t) || /^-?\d+,\d+$/.test(t)) t = t.replace(/\./g, '').replace(',', '.');
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}

async function livro(colunas, linhas, nomeAba) {
  const wb = new ExcelJS.Workbook(); wb.creator = 'Livro-Caixa';
  const ws = wb.addWorksheet(nomeAba, { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = colunas.map((c) => ({ header: c.t, key: c.k, width: c.w || 14, style: c.f === 'R$' ? { numFmt: R$ } : c.f === 'data' ? { numFmt: 'dd/mm/yyyy' } : c.f ? { numFmt: c.f } : {} }));
  const h = ws.getRow(1); h.font = { bold: true, color: { argb: 'FFFFFFFF' } }; h.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR } };
  linhas.forEach((l) => ws.addRow(l));
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: colunas.length } };
  return Buffer.from(await wb.xlsx.writeBuffer());
}

// Lê a primeira aba com cabeçalho; devolve linhas como objetos { cabeçalho normalizado: valor }
async function lerPlanilha(base64) {
  if (!base64 || typeof base64 !== 'string') throw erro('Escolha o arquivo da planilha.');
  const buf = Buffer.from(base64.replace(/^data:[^,]*,/, ''), 'base64');
  if (buf.length < 100 || buf.slice(0, 2).toString() !== 'PK') throw erro('Envie uma planilha do Excel (.xlsx). Se estiver em .xls ou .csv, abra no Excel ou no Google Planilhas e salve como .xlsx.');
  // .xlsx é um zip: confere o tamanho descompactado antes de abrir (arquivo "bomba" travaria o servidor)
  try {
    const zip = await JSZip.loadAsync(buf);
    let total = 0; zip.forEach((_, f) => { total += (f._data && f._data.uncompressedSize) || 0; });
    if (total > 60 * 1024 * 1024) throw erro('Planilha grande demais. Divida em arquivos menores (até uns 20 mil linhas).');
  } catch (e) { if (e instanceof ErroPlanilha) throw e; throw erro('Não consegui abrir essa planilha. Confira se é um arquivo .xlsx.'); }
  const wb = new ExcelJS.Workbook();
  try { await wb.xlsx.load(buf); } catch (e) { throw erro('Não consegui abrir essa planilha. Confira se é um arquivo .xlsx.'); }
  const ws = wb.worksheets.find((w) => w.rowCount > 1) || wb.worksheets[0];
  if (!ws) throw erro('A planilha está vazia.');
  const valor = (c) => { const v = c.value; if (v && typeof v === 'object') { if (v.richText) return v.richText.map((x) => x.text).join(''); if ('result' in v) return v.result; if (v.text) return v.text; if (v instanceof Date) return v; } return v; };
  const cab = []; ws.getRow(1).eachCell({ includeEmpty: true }, (c, i) => { cab[i] = semAcento(valor(c)); });
  const linhas = [];
  for (let r = 2; r <= Math.min(ws.rowCount, 5001); r++) {
    const row = ws.getRow(r); const o = { _linha: r }; let algo = false;
    cab.forEach((k, i) => { if (!k) return; const v = valor(row.getCell(i)); if (v !== null && v !== undefined && String(v).trim() !== '') { o[k] = v; algo = true; } });
    if (algo) linhas.push(o);
  }
  if (!linhas.length) throw erro('A planilha não tem linhas preenchidas abaixo do cabeçalho.');
  return { cab: cab.filter(Boolean), linhas };
}
// pega o valor pelo primeiro nome de coluna que existir
// (primeiro o nome exato; depois o que começa igual, sem confundir "preço" com "preço de custo" ou "estoque" com "estoque mínimo")
function campo(o, ...nomes) {
  const ks = Object.keys(o).filter((k) => k !== '_linha');
  for (const n of nomes) if (ks.includes(n)) return o[n];
  for (const n of nomes) {
    if (n.length < 4) continue;
    const k = ks.find((x) => x.startsWith(n) && !['custo', 'minimo'].some((w) => x.includes(w) && !n.includes(w)));
    if (k !== undefined) return o[k];
  }
  return undefined;
}

/* ------------------------------ produtos ------------------------------ */

const COLS_PRODUTOS = [
  { t: 'ID', k: 'id', w: 10 }, { t: 'Produto', k: 'produto', w: 30 }, { t: 'Variação', k: 'variacao', w: 14 }, { t: 'Categoria', k: 'categoria', w: 16 },
  { t: 'Código de barras', k: 'codigo', w: 16 }, { t: 'Unidade', k: 'unidade', w: 8 }, { t: 'Preço', k: 'preco', f: 'R$' }, { t: 'Custo', k: 'custo', f: 'R$' },
  { t: 'Estoque', k: 'estoque', f: '#,##0.###', w: 9 }, { t: 'Estoque mínimo', k: 'minimo', f: '#,##0.###', w: 14 }, { t: 'Controla estoque', k: 'controla', w: 15 },
  { t: 'No cardápio', k: 'cardapio', w: 11 }, { t: 'Vai para a cozinha', k: 'cozinha', w: 16 }, { t: 'Ativo', k: 'ativo', w: 7 }, { t: 'Descrição', k: 'descricao', w: 40 },
  { t: 'NCM', k: 'ncm', w: 11 },
];
async function exportarProdutos(userId) {
  const linhas = [];
  for (const p of await E.listarProdutos(userId)) {
    const base = { id: p.id, produto: p.nome, categoria: p.categoria, unidade: p.unidade, controla: p.controlaEstoque ? 'Sim' : 'Não', cardapio: p.noCardapio ? 'Sim' : 'Não', cozinha: p.cozinha !== false ? 'Sim' : 'Não', descricao: p.descricao, ncm: (p.fiscal && p.fiscal.ncm) || '' };
    if (p.variacoes.length) p.variacoes.forEach((v) => linhas.push({ ...base, variacao: v.nome, codigo: v.codigo, preco: v.precoFinal, custo: v.custoFinal, estoque: p.controlaEstoque ? v.estoque : null, minimo: v.estoqueMinimo, ativo: p.ativo && v.ativo ? 'Sim' : 'Não' }));
    else linhas.push({ ...base, variacao: '', codigo: p.codigo, preco: p.preco, custo: p.custo, estoque: p.controlaEstoque ? p.estoque : null, minimo: p.estoqueMinimo, ativo: p.ativo ? 'Sim' : 'Não' });
  }
  if (!linhas.length) linhas.push({ produto: 'Exemplo: Camiseta básica', variacao: 'M', categoria: 'Roupas', codigo: '7891234567890', unidade: 'un', preco: 59.9, custo: 25, estoque: 10, minimo: 3, controla: 'Sim', cardapio: 'Não', cozinha: 'Não', ativo: 'Sim', descricao: 'Apague esta linha e preencha com os seus produtos' });
  return livro(COLS_PRODUTOS, linhas, 'Produtos');
}

// Monta o plano (o que muda em cada produto). aplicar=true executa.
async function importarProdutos(userId, d = {}) {
  const { linhas } = await lerPlanilha(d.arquivo);
  const atualizarEstoque = !!d.atualizarEstoque;
  const catalogo = await E.listarProdutos(userId);
  const porId = new Map(catalogo.map((p) => [p.id, p]));
  const porNome = new Map(catalogo.map((p) => [semAcento(p.nome), p]));
  // agrupa as linhas por produto (ID da exportação ou nome)
  const grupos = new Map();
  const erros = [];
  for (const l of linhas) {
    const nome = String(campo(l, 'produto', 'nome', 'descricao do produto', 'item') || '').trim();
    const id = String(campo(l, 'id') || '').trim();
    if (!nome && !id) { erros.push({ linha: l._linha, erro: 'Sem o nome do produto.' }); continue; }
    if (/^exemplo:/i.test(nome)) continue;
    const chave = porId.has(id) ? id : semAcento(nome);
    if (!grupos.has(chave)) grupos.set(chave, { existente: porId.get(id) || porNome.get(semAcento(nome)) || null, nome, linhas: [] });
    grupos.get(chave).linhas.push(l);
  }
  const UNID = E.UNIDADES;
  const plano = [];
  for (const g of grupos.values()) {
    const item = { nome: g.nome || (g.existente && g.existente.nome), linha: g.linhas[0]._linha, acao: g.existente ? 'atualizar' : 'novo', mudancas: [], erro: '' };
    try {
      const l0 = g.linhas[0];
      const num = (l, ...n) => { const v = numero(campo(l, ...n)); if (Number.isNaN(v)) throw erro(`Número inválido na linha ${l._linha} (${n[0]}).`); return v; };
      const unidadeTxt = semAcento(campo(l0, 'unidade', 'un') || '');
      const unidade = UNID.includes(unidadeTxt) ? unidadeTxt : unidadeTxt === 'und' || unidadeTxt === 'unid' ? 'un' : unidadeTxt === 'lt' ? 'l' : null;
      const comVar = g.linhas.some((l) => String(campo(l, 'variacao', 'tamanho') || '').trim());
      const p = g.existente;
      const corpo = p ? {
        nome: p.nome, categoria: p.categoria, descricao: p.descricao, codigo: p.codigo, unidade: p.unidade, preco: p.preco, custo: p.custo, controlaEstoque: p.controlaEstoque,
        estoqueMinimo: p.estoqueMinimo, opcoes: p.opcoes, noCardapio: p.noCardapio, destaque: p.destaque, ativo: p.ativo, cozinha: p.cozinha,
        variacoes: p.variacoes.map((v) => ({ id: v.id, nome: v.nome, codigo: v.codigo, preco: v.preco, custo: v.custo, estoqueMinimo: v.estoqueMinimo, ativo: v.ativo })),
      } : { nome: item.nome, categoria: '', descricao: '', codigo: '', unidade: 'un', preco: 0, custo: 0, controlaEstoque: true, estoqueMinimo: 0, opcoes: [], noCardapio: true, destaque: false, ativo: true, cozinha: true, variacoes: [] };
      const muda = (rot, antes, depois) => { if (String(antes ?? '') !== String(depois ?? '')) item.mudancas.push(rot); };
      const set = (k, v, rot) => { if (v === undefined || v === null || v === '') return; muda(rot, corpo[k], v); corpo[k] = v; };
      if (p && g.nome && g.nome !== p.nome && porId.has(String(campo(l0, 'id') || ''))) set('nome', g.nome.slice(0, 80), 'nome');
      set('categoria', String(campo(l0, 'categoria') || '').trim().slice(0, 60) || undefined, 'categoria');
      set('descricao', campo(l0, 'descricao') !== undefined ? String(campo(l0, 'descricao')).slice(0, 400) : undefined, 'descrição');
      if (unidade) set('unidade', unidade, 'unidade');
      const ncmTxt = campo(l0, 'ncm');
      if (ncmTxt !== undefined) {
        const ncm = String(ncmTxt).replace(/\D/g, '');
        if (ncm && ncm.length !== 8) throw erro(`Linha ${l0._linha}: o NCM tem 8 números.`);
        const antes = (p && p.fiscal && p.fiscal.ncm) || '';
        if (ncm !== antes) { corpo.fiscal = { ...((p && p.fiscal) || {}), ncm: ncm || undefined }; if (!ncm) delete corpo.fiscal.ncm; item.mudancas.push('NCM'); }
      }
      for (const [k, cols, rot] of [['controlaEstoque', ['controla estoque', 'controla'], 'controle de estoque'], ['noCardapio', ['no cardapio', 'cardapio'], 'cardápio'], ['cozinha', ['vai para a cozinha', 'cozinha'], 'cozinha'], ['ativo', ['ativo'], 'ativo']]) {
        const v = campo(l0, ...cols); if (v !== undefined) set(k, simNao(v, corpo[k]), rot);
      }
      const estoquesPlanilha = []; // [{ variacaoNome|null, saldo }]
      if (!comVar) {
        if (p && p.variacoes.length) throw erro(`“${p.nome}” tem variações no cadastro: preencha a coluna Variação.`);
        const preco = num(l0, 'preco', 'valor', 'preco de venda'); const custo = num(l0, 'custo', 'preco de custo'); const minimo = num(l0, 'estoque minimo', 'minimo');
        if (preco !== null) { if (preco < 0) throw erro('Preço negativo.'); set('preco', Math.round(preco * 100) / 100, 'preço'); }
        if (custo !== null) { if (custo < 0) throw erro('Custo negativo.'); set('custo', Math.round(custo * 10000) / 10000, 'custo'); }
        if (minimo !== null) set('estoqueMinimo', minimo, 'estoque mínimo');
        const cod = campo(l0, 'codigo de barras', 'codigo', 'ean', 'sku'); if (cod !== undefined) set('codigo', String(cod).trim().slice(0, 40), 'código');
        const est = num(l0, 'estoque', 'quantidade', 'qtd'); if (est !== null) estoquesPlanilha.push({ variacao: null, saldo: est });
      } else {
        for (const l of g.linhas) {
          const vn = String(campo(l, 'variacao', 'tamanho') || '').trim().slice(0, 60);
          if (!vn) throw erro(`Linha ${l._linha}: falta o nome da variação.`);
          let v = corpo.variacoes.find((x) => semAcento(x.nome) === semAcento(vn));
          if (!v) { v = { nome: vn, codigo: '', preco: null, custo: null, estoqueMinimo: 0, ativo: true, estoqueInicial: 0 }; corpo.variacoes.push(v); item.mudancas.push(`variação ${vn}`); }
          const preco = num(l, 'preco', 'valor', 'preco de venda'); const custo = num(l, 'custo', 'preco de custo'); const minimo = num(l, 'estoque minimo', 'minimo');
          if (preco !== null) { if (String(v.preco ?? corpo.preco) !== String(Math.round(preco * 100) / 100)) item.mudancas.push(`preço ${vn}`); v.preco = Math.round(preco * 100) / 100; }
          if (custo !== null) { if (String(v.custo ?? corpo.custo) !== String(Math.round(custo * 10000) / 10000)) item.mudancas.push(`custo ${vn}`); v.custo = Math.round(custo * 10000) / 10000; }
          if (minimo !== null) { if (Number(v.estoqueMinimo) !== minimo) item.mudancas.push(`mínimo ${vn}`); v.estoqueMinimo = minimo; }
          const cod = campo(l, 'codigo de barras', 'codigo', 'ean', 'sku'); if (cod !== undefined && String(cod).trim() !== (v.codigo || '')) { v.codigo = String(cod).trim().slice(0, 40); item.mudancas.push(`código ${vn}`); }
          const at = campo(l, 'ativo'); if (at !== undefined) v.ativo = simNao(at, v.ativo);
          const est = num(l, 'estoque', 'quantidade', 'qtd');
          if (est !== null) { if (!v.id) v.estoqueInicial = est; else estoquesPlanilha.push({ variacao: v.nome, saldo: est }); }
        }
      }
      if (!p) {
        const ini = estoquesPlanilha.find((x) => x.variacao === null);
        if (ini) corpo.estoqueInicial = ini.saldo;
      }
      // estoque dos que já existem: só com a opção marcada
      const ajustes = [];
      if (p && corpo.controlaEstoque) {
        for (const e of estoquesPlanilha) {
          const atual = e.variacao ? (p.variacoes.find((x) => semAcento(x.nome) === semAcento(e.variacao)) || {}).estoque : p.estoque;
          if (atual !== undefined && Math.abs(Number(atual) - e.saldo) > 0.0005) ajustes.push({ ...e, atual });
        }
        if (ajustes.length) item.estoque = ajustes.map((a) => `${a.variacao ? `${a.variacao}: ` : ''}${a.atual} → ${a.saldo}`).join(', ');
        if (atualizarEstoque && ajustes.length) item.mudancas.push('estoque');
      }
      if (p && !item.mudancas.length) item.acao = 'igual';
      item._corpo = corpo; item._id = p ? p.id : null; item._ajustes = atualizarEstoque ? ajustes : [];
    } catch (e) { item.acao = 'erro'; item.erro = e.message; }
    plano.push(item);
  }
  erros.forEach((e) => plano.push({ nome: '', linha: e.linha, acao: 'erro', erro: e.erro, mudancas: [] }));
  const resumo = { novo: 0, atualizar: 0, igual: 0, erro: 0 };
  plano.forEach((x) => { resumo[x.acao] += 1; });
  if (d.aplicar) {
    if (resumo.erro) throw erro('Corrija as linhas com erro na planilha (ou apague-as) e envie de novo.');
    await transacao(async () => { // tudo ou nada
      for (const x of plano.filter((y) => y.acao === 'novo' || y.acao === 'atualizar')) {
        const salvo = await E.salvarProduto(userId, x._corpo, x._id);
        for (const a of x._ajustes) {
          const v = a.variacao ? salvo.variacoes.find((y) => semAcento(y.nome) === semAcento(a.variacao)) : null;
          await E.ajustarEstoque(userId, { produtoId: salvo.id, variacaoId: v ? v.id : undefined, modo: 'contagem', saldo: a.saldo, obs: 'Contagem pela planilha' });
        }
      }
    });
  }
  return { resumo, itens: plano.map(({ _corpo, _id, _ajustes, ...r }) => r).sort((a, b) => a.linha - b.linha), aplicado: !!d.aplicar };
}

/* ------------------------------ clientes ------------------------------ */

const COLS_CLIENTES = [
  { t: 'Nome', k: 'nome', w: 26 }, { t: 'Telefone', k: 'telefone', w: 16 }, { t: 'Endereço', k: 'endereco', w: 34 }, { t: 'Observações', k: 'obs', w: 30 },
  { t: 'Participa da fidelidade', k: 'participa', w: 20 }, { t: 'Compras', k: 'compras', w: 9 }, { t: 'Total gasto', k: 'gasto', f: 'R$' },
  { t: 'Última compra', k: 'ultima', f: 'data', w: 13 }, { t: 'Deve (fiado)', k: 'deve', f: 'R$' }, { t: 'Cashback', k: 'saldo', f: 'R$' }, { t: 'Selos', k: 'selos', w: 7 },
];
const dataX = (iso) => { if (!iso) return null; const [a, m, d] = String(iso).slice(0, 10).split('-').map(Number); return new Date(Date.UTC(a, m - 1, d)); };
async function exportarClientes(userId) {
  const fiado = await C.fiadoEmAberto(userId);
  const lista = await F.listarClientes(userId, {}, hojeBR());
  const linhas = lista.map((c) => ({ nome: c.nome, telefone: c.telefone, endereco: c.endereco, obs: c.obs, participa: c.participa ? 'Sim' : 'Não', compras: c.compras, gasto: c.totalGasto, ultima: dataX(c.ultimaCompra), deve: fiado.porCliente[c.id] || 0, saldo: c.saldo, selos: c.selos }));
  if (!linhas.length) linhas.push({ nome: 'Exemplo: Maria Silva', telefone: '11988887777', endereco: 'Rua das Flores, 10', obs: 'Apague esta linha', participa: 'Sim' });
  return livro(COLS_CLIENTES, linhas, 'Clientes');
}
async function importarClientes(userId, d = {}) {
  const { linhas } = await lerPlanilha(d.arquivo);
  const hoje = hojeBR();
  const atuais = await F.listarClientes(userId, {}, hoje);
  const porTel = new Map(atuais.filter((c) => c.telefone).map((c) => [c.telefone, c]));
  const porNome = new Map(atuais.map((c) => [semAcento(c.nome), c]));
  const vistos = new Set();
  const plano = [];
  for (const l of linhas) {
    const nome = String(campo(l, 'nome', 'cliente') || '').trim();
    if (/^exemplo:/i.test(nome)) continue;
    const tel = String(campo(l, 'telefone', 'celular', 'whatsapp', 'fone') || '').replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');
    const item = { nome, telefone: tel, linha: l._linha, acao: 'novo', mudancas: [], erro: '' };
    try {
      if (!nome) throw new Error('Sem o nome do cliente.');
      if (tel && (tel.length < 10 || tel.length > 11)) throw new Error('Telefone inválido (use DDD + número).');
      const chave = tel || semAcento(nome);
      if (vistos.has(chave)) throw new Error('Cliente repetido na planilha.');
      vistos.add(chave);
      const existente = (tel && porTel.get(tel)) || (!tel && porNome.get(semAcento(nome))) || null;
      const corpo = { nome: nome.slice(0, 80) };
      if (tel) corpo.telefone = tel;
      const end = campo(l, 'endereco'); if (end !== undefined) corpo.endereco = String(end).slice(0, 200);
      const obs = campo(l, 'observacoes', 'obs'); if (obs !== undefined) corpo.obs = String(obs).slice(0, 300);
      const part = campo(l, 'participa'); corpo.participa = simNao(part, existente ? existente.participa : false);
      if (existente) {
        item.acao = 'atualizar';
        if (corpo.nome !== existente.nome) item.mudancas.push('nome');
        if (corpo.endereco !== undefined && corpo.endereco !== (existente.endereco || '')) item.mudancas.push('endereço');
        if (corpo.obs !== undefined && corpo.obs !== (existente.obs || '')) item.mudancas.push('observações');
        if (corpo.participa !== existente.participa) item.mudancas.push('fidelidade');
        if (!item.mudancas.length) item.acao = 'igual';
        item._id = existente.id;
      }
      item._corpo = corpo;
    } catch (e) { item.acao = 'erro'; item.erro = e.message; }
    plano.push(item);
  }
  const resumo = { novo: 0, atualizar: 0, igual: 0, erro: 0 };
  plano.forEach((x) => { resumo[x.acao] += 1; });
  if (d.aplicar) {
    if (resumo.erro) throw erro('Corrija as linhas com erro na planilha (ou apague-as) e envie de novo.');
    await transacao(async () => { for (const x of plano.filter((y) => y.acao === 'novo' || y.acao === 'atualizar')) await F.salvarCliente(userId, x._corpo, x._id || null, hoje); });
  }
  return { resumo, itens: plano.map(({ _corpo, _id, ...r }) => r), aplicado: !!d.aplicar };
}

module.exports = { ErroPlanilha, exportarProdutos, importarProdutos, exportarClientes, importarClientes };
