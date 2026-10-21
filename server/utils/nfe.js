/* PDV — entrada de compra pelo XML da NF-e do fornecedor.

   1) lerNFe: lê o XML (o que o fornecedor manda por e-mail, modelo 55; NFC-e 65 também serve)
      e devolve fornecedor, número, data, itens, frete e vencimentos.
   2) previa: para cada item, sugere o produto do cadastro — pelo que já foi ligado antes
      (mesmo fornecedor + mesmo código), pelo código de barras ou pelo nome parecido.
   3) importar: a pessoa confere (liga a um produto, cria um produto novo ou ignora; diz quantas
      unidades vêm em cada caixa) e a compra entra como sempre: estoque, custo médio e despesa
      "Custo de mercadoria". A nota não pode ser lançada duas vezes.

   Custo de cada item = valor do produto − desconto + IPI + ICMS-ST + outras despesas + seguro,
   dividido pela quantidade. O frete da nota é rateado pelo valor de cada item (como nas compras
   normais). Sem biblioteca de XML: a NF-e tem estrutura fixa e as tags são lidas por nome. */
const { query, transacao } = require('../db/pool');
const E = require('./estoque');

class ErroNFe extends Error {}
const erro = (m) => new ErroNFe(m);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ehUuid = (v) => typeof v === 'string' && UUID_RE.test(v);
const r2 = (n) => Math.round(Number(n || 0) * 100) / 100;
const r4 = (n) => Math.round(Number(n || 0) * 10000) / 10000;
const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function decodificar(t) {
  return String(t || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/&amp;/g, '&').trim();
}
// primeira tag com esse nome dentro do trecho (com ou sem prefixo de namespace)
function tag(xml, nome) {
  const m = String(xml || '').match(new RegExp(`<(?:[\\w-]+:)?${nome}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w-]+:)?${nome}>`));
  return m ? m[1] : '';
}
const txt = (xml, nome) => decodificar(tag(xml, nome));
const num = (xml, nome) => { const v = Number(txt(xml, nome)); return Number.isFinite(v) ? v : 0; };
function todos(xml, nome) {
  const re = new RegExp(`<(?:[\\w-]+:)?${nome}(\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w-]+:)?${nome}>`, 'g');
  const out = []; let m;
  while ((m = re.exec(xml))) out.push({ attrs: m[1] || '', corpo: m[2] });
  return out;
}

const UNIDADE_NFE = { UN: 'un', UND: 'un', UNID: 'un', PC: 'un', PCA: 'un', PECA: 'un', KG: 'kg', G: 'g', GR: 'g', L: 'l', LT: 'l', ML: 'ml', M: 'm', MT: 'm', CX: 'cx', CXA: 'cx', PCT: 'pct', PT: 'pct', PAC: 'pct', FD: 'pct', FARDO: 'pct' };
// embalagens que costumam ter várias unidades dentro
const EMBALAGEM = /^(CX|CXA|FD|FARDO|PCT|PT|PAC|DZ|DUZIA|SC|SACO|BD|BANDEJA|KIT)$/;

function lerNFe(xmlBruto) {
  const xml = String(xmlBruto || '');
  if (!xml.trim()) throw erro('Escolha o arquivo XML da nota.');
  if (xml.length > 3 * 1024 * 1024) throw erro('Arquivo grande demais para um XML de nota.');
  const inf = tag(xml, 'infNFe');
  if (!inf) throw erro('Esse arquivo não parece ser o XML de uma NF-e. Peça ao fornecedor o arquivo .xml da nota (não o PDF/DANFE).');
  const idM = xml.match(/<(?:[\w-]+:)?infNFe[^>]*\sId="NFe(\d{44})"/);
  const chave = idM ? idM[1] : (txt(xml, 'chNFe') || '');
  if (!/^\d{44}$/.test(chave)) throw erro('Não encontrei a chave de acesso da nota no XML.');
  const ide = tag(inf, 'ide'); const emit = tag(inf, 'emit'); const tot = tag(tag(inf, 'total'), 'ICMSTot');
  const dh = txt(ide, 'dhEmi') || txt(ide, 'dEmi');
  const data = /^\d{4}-\d{2}-\d{2}/.test(dh) ? dh.slice(0, 10) : null;
  const itens = todos(inf, 'det').map((d, i) => {
    const nItemM = d.attrs.match(/nItem="(\d+)"/);
    const prod = tag(d.corpo, 'prod'); const imp = tag(d.corpo, 'imposto');
    const qtd = num(prod, 'qCom');
    const vProd = num(prod, 'vProd'); const vDesc = num(prod, 'vDesc'); const vOutro = num(prod, 'vOutro'); const vSeg = num(prod, 'vSeg'); const vFrete = num(prod, 'vFrete');
    const vIPI = num(tag(imp, 'IPI'), 'vIPI');
    const vST = num(tag(imp, 'ICMS'), 'vICMSST') + num(tag(imp, 'ICMS'), 'vFCPST');
    const custoTotal = r2(vProd - vDesc + vOutro + vSeg + vIPI + vST);
    const ean = txt(prod, 'cEAN');
    const uCom = txt(prod, 'uCom').toUpperCase().replace(/[^A-Z]/g, '');
    return {
      n: nItemM ? Number(nItemM[1]) : i + 1, codigo: txt(prod, 'cProd'), ean: /^\d{8,14}$/.test(ean) ? ean : '',
      nome: txt(prod, 'xProd'), ncm: txt(prod, 'NCM'), unidade: uCom, qtd, vUnit: num(prod, 'vUnCom'),
      vProd: r2(vProd), desconto: r2(vDesc), impostos: r2(vIPI + vST), outros: r2(vOutro + vSeg), freteItem: r2(vFrete),
      custoTotal, custoUnit: qtd > 0 ? r4(custoTotal / qtd) : 0, embalagem: EMBALAGEM.test(uCom) || /\b(c\/|cx|com|fardo|pack|kit)\s*\d+/i.test(txt(prod, 'xProd')),
    };
  }).filter((i) => i.qtd > 0);
  if (!itens.length) throw erro('A nota não tem itens.');
  const vencimentos = todos(tag(inf, 'cobr'), 'dup').map((d) => ({ numero: txt(d.corpo, 'nDup'), data: txt(d.corpo, 'dVenc'), valor: num(d.corpo, 'vDup') })).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d.data));
  const pag = todos(tag(inf, 'pag'), 'detPag').map((d) => txt(d.corpo, 'tPag'));
  return {
    chave, numero: txt(ide, 'nNF'), serie: txt(ide, 'serie'), modelo: txt(ide, 'mod'), data,
    fornecedor: { nome: txt(emit, 'xFant') || txt(emit, 'xNome'), razao: txt(emit, 'xNome'), cnpj: txt(emit, 'CNPJ') || txt(emit, 'CPF') },
    itens, frete: r2(num(tot, 'vFrete')), total: r2(num(tot, 'vNF')), produtos: r2(num(tot, 'vProd')),
    vencimentos, formaPagamento: pag[0] || '', // 15 = boleto, 01 = dinheiro, 17 = Pix, 03/04 = cartão, 90 = sem pagamento
  };
}

// "Refrig. Coca-Cola Lata 350ml c/12" ~ "Coca-Cola lata": palavras em comum
const palavras = (s) => semAcento(s).replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((w) => w.length > 1 && !/^(c|com|de|da|do|un|und|cx|pct|ml|lt|kg|g)$/.test(w));
function parecido(a, b) {
  const A = new Set(palavras(a)); const B = new Set(palavras(b));
  if (!A.size || !B.size) return 0;
  let comum = 0; A.forEach((w) => { if (B.has(w) || [...B].some((x) => (x.length > 3 && w.startsWith(x)) || (w.length > 3 && x.startsWith(w)))) comum += 1; });
  return comum / Math.min(A.size, B.size);
}

async function previa(userId, xml) {
  const nota = lerNFe(xml);
  const produtos = (await E.listarProdutos(userId)).filter((p) => p.ativo);
  const mapa = new Map((await query('SELECT * FROM estoque_nfe_mapa WHERE user_id = $1::uuid AND cnpj = $2', [userId, nota.fornecedor.cnpj])).rows.map((r) => [r.codigo, r]));
  const ja = (await query('SELECT data FROM estoque_compras WHERE user_id = $1::uuid AND nfe_chave = $2 AND NOT cancelada', [userId, nota.chave])).rows[0];
  const itens = nota.itens.map((i) => {
    let sug = null;
    const m = mapa.get(i.codigo);
    if (m && produtos.some((p) => p.id === m.produto_id)) sug = { produtoId: m.produto_id, variacaoId: m.variacao_id, fator: Number(m.fator), por: 'antes' };
    if (!sug && i.ean) {
      for (const p of produtos) {
        if (p.codigo && p.codigo === i.ean && !p.variacoes.length) { sug = { produtoId: p.id, variacaoId: null, fator: 1, por: 'codigo' }; break; }
        const v = p.variacoes.find((x) => x.codigo && x.codigo === i.ean);
        if (v) { sug = { produtoId: p.id, variacaoId: v.id, fator: 1, por: 'codigo' }; break; }
      }
    }
    if (!sug) {
      let melhor = null; let nota2 = 0;
      for (const p of produtos) { const s = parecido(i.nome, p.nome); if (s > nota2) { nota2 = s; melhor = p; } }
      if (melhor && nota2 >= 0.6) sug = { produtoId: melhor.id, variacaoId: melhor.variacoes.length === 1 ? melhor.variacoes[0].id : null, fator: 1, por: 'nome', confianca: Math.round(nota2 * 100) };
    }
    return { ...i, sugestao: sug, unidadeSugerida: UNIDADE_NFE[i.unidade] || 'un' };
  });
  return { ...nota, itens, jaLancada: ja ? ja.data : null };
}

// d: { xml, itens: [{ n, acao: 'ligar'|'novo'|'ignorar', produtoId, variacaoId, fator, novo: { nome, categoria, preco, unidade } }], meio, vencimento, data }
async function importar(userId, d = {}, agora = new Date()) {
  const nota = lerNFe(d.xml);
  const escolhas = new Map((Array.isArray(d.itens) ? d.itens : []).map((x) => [Number(x && x.n), x]));
  const usar = nota.itens.filter((i) => (escolhas.get(i.n) || {}).acao !== 'ignorar');
  if (!usar.length) throw erro('Escolha pelo menos um item da nota para dar entrada.');
  const MEIOS = ['dinheiro', 'pix', 'debito', 'credito', 'transferencia', 'boleto', 'outro'];
  return transacao(async () => {
    const itensCompra = [];
    for (const i of usar) {
      const e = escolhas.get(i.n) || {};
      const fator = Math.max(0.001, Math.min(100000, Number(e.fator) || 1));
      let produtoId = e.produtoId; let variacaoId = ehUuid(e.variacaoId) ? e.variacaoId : null;
      if (e.acao === 'novo' || !ehUuid(produtoId)) {
        const nv = e.novo || {};
        const qtdUn = i.qtd * fator; const custo = qtdUn > 0 ? r4(i.custoTotal / qtdUn) : 0;
        const unidade = E.UNIDADES.includes(nv.unidade) ? nv.unidade : (fator === 1 ? (UNIDADE_NFE[i.unidade] || 'un') : 'un');
        const p = await E.salvarProduto(userId, {
          nome: String(nv.nome || i.nome).slice(0, 80), categoria: nv.categoria || '', codigo: fator === 1 ? i.ean : '', unidade,
          preco: Number(nv.preco) > 0 ? Number(nv.preco) : 0, custo, controlaEstoque: true, estoqueInicial: 0, noCardapio: false,
          ...(/^\d{8}$/.test(i.ncm) ? { fiscal: { ncm: i.ncm } } : {}),
        });
        produtoId = p.id; variacaoId = null;
      } else {
        const p = await E.produtoPorId(userId, produtoId);
        if (!p) throw erro(`O produto escolhido para “${i.nome}” não existe mais. Atualize a tela.`);
        if (p.variacoes.length && !p.variacoes.some((v) => v.id === variacaoId)) throw erro(`Escolha a variação de “${p.nome}” para o item “${i.nome}”.`);
        if (!p.variacoes.length) variacaoId = null;
      }
      const qtd = Math.round(i.qtd * fator * 1000) / 1000;
      itensCompra.push({ produtoId, variacaoId, qtd, custoUnit: r4(i.custoTotal / qtd) });
      if (nota.fornecedor.cnpj && i.codigo) {
        await query(`INSERT INTO estoque_nfe_mapa (user_id, cnpj, codigo, produto_id, variacao_id, fator) VALUES ($1::uuid, $2, $3, $4::uuid, $5::uuid, $6)
          ON CONFLICT (user_id, cnpj, codigo) DO UPDATE SET produto_id = EXCLUDED.produto_id, variacao_id = EXCLUDED.variacao_id, fator = EXCLUDED.fator, atualizado_em = now()`,
        [userId, nota.fornecedor.cnpj, i.codigo.slice(0, 60), produtoId, variacaoId, fator]);
      }
    }
    const venc = d.vencimento !== undefined ? (d.vencimento || null) : (nota.vencimentos[0] ? nota.vencimentos[0].data : null);
    const meio = MEIOS.includes(d.meio) ? d.meio : (nota.vencimentos.length || nota.formaPagamento === '15' ? 'boleto' : 'pix');
    const compra = await E.registrarCompra(userId, {
      fornecedor: nota.fornecedor.nome, data: d.data || nota.data || undefined, vencimento: venc && venc > (d.data || nota.data || '') ? venc : null,
      meio, frete: nota.frete, itens: itensCompra, nfe: { chave: nota.chave, numero: nota.numero },
    }, agora);
    return { compra, ignorados: nota.itens.length - usar.length };
  });
}

module.exports = { ErroNFe, lerNFe, previa, importar };
