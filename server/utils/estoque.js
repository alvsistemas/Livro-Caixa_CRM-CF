/* PDV — regras do servidor.

   - Produtos (com ou sem variações) e o estoque de cada um. Toda mudança de estoque vira uma
     linha em estoque_movimentos, com o saldo depois dela.
   - Venda no balcão: dá baixa no estoque e lança a Receita no Controle financeiro, levando o
     custo da mercadoria vendida (CMV) junto — o Lucro por venda usa isso.
   - Compra de mercadoria: entra no estoque, atualiza o custo médio e vira Despesa.
   - Nota de gasto: vira Despesa.
   Os lançamentos ficam marcados com extras.estoque = { origem, ... } e o salvamento da tela
   do financeiro não os apaga por engano (ver salvarSecaoFinanceiro).

   Por que o CMV não vira despesa: a compra da mercadoria já entrou como despesa quando foi
   paga. Lançar o CMV de novo contaria o mesmo dinheiro duas vezes. O CMV aparece só no
   Lucro por venda (quanto sobrou de cada venda). */
const crypto = require('crypto');
const { query, transacao } = require('../db/pool');
const { MEIOS, hojeBR, lerModo } = require('./fechamento');
const F = require('./fidelidade');
const { comoSistema } = require('../db/contexto');

class ErroEstoque extends Error {}
const erro = (m) => new ErroEstoque(m);

const TIPOS_NEGOCIO = ['restaurante', 'loja', 'servicos', 'outro'];
const UNIDADES = ['un', 'kg', 'g', 'l', 'ml', 'm', 'cx', 'pct'];
const MEIOS_VENDA = ['dinheiro', 'pix', 'debito', 'credito', 'transferencia', 'boleto', 'fiado', 'outro'];
const NOME_MEIO = { dinheiro: 'Dinheiro', pix: 'Pix', debito: 'Cartão de débito', credito: 'Cartão de crédito', transferencia: 'Transferência', boleto: 'Boleto', fiado: 'Fiado (a receber)', outro: 'Outro', misto: 'Vários' };
const contaDoMeio = (meio) => (MEIOS[meio] ? MEIOS[meio].conta : meio === 'fiado' ? 'Conta Corrente' : 'Conta Corrente');
const MAX_ITENS = 200;
const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FOTO_MAX = 450 * 1024;

const ehUuid = (v) => typeof v === 'string' && UUID_RE.test(v);
const texto = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
const centavos = (v) => Math.round(Number(v) * 100);
const reais = (c) => Math.round(c) / 100;
const qtd3 = (v) => Math.round(Number(v) * 1000) / 1000;
function numero(v, { min = 0, max = 1e9, nome = 'Valor' } = {}) {
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : Number(v);
  if (!Number.isFinite(n) || n < min || n > max) throw erro(`${nome} inválido.`);
  return n;
}
function dataOu(v, padrao) {
  if (v == null || v === '') return padrao;
  if (typeof v !== 'string' || !DATA_RE.test(v) || Number.isNaN(Date.parse(v))) throw erro('Data inválida.');
  return v;
}
function slugDe(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/g, '');
}
// "Camiseta (M)"; se a variação já tem parênteses: "Pizza · Grande (8 fatias)"
const nomeComVar = (p, v) => (/[()]/.test(v) ? `${p} · ${v}` : `${p} (${v})`);
const novoIdLancamento = (prefixo) => `est-${prefixo}-${crypto.randomBytes(6).toString('hex')}`;

/* ------------------------------ Negócio ------------------------------ */

function negocioObj(r) {
  if (!r) return null;
  return {
    tipo: r.tipo, nome: r.nome, controlaEstoque: r.controla_estoque,
    slug: r.slug, cardapioAtivo: r.cardapio_ativo, whatsapp: r.whatsapp, frase: r.frase, cor: r.cor,
    horario: r.horario, aceitaRetirada: r.aceita_retirada, aceitaEntrega: r.aceita_entrega,
    taxaEntrega: Number(r.taxa_entrega), pedidoMinimo: Number(r.pedido_minimo), categorias: r.categorias || [],
    checklist: r.checklist || {}, fidelidade: F.programaDe(r.fidelidade),
  };
}

async function lerNegocio(userId) {
  const { rows } = await query('SELECT * FROM estoque_negocio WHERE user_id = $1::uuid', [userId]);
  return negocioObj(rows[0]);
}

async function slugLivre(base, userId) {
  let s = slugDe(base) || 'cardapio';
  if (s.length < 3) s = `${s}-cardapio`;
  for (let i = 0; i < 50; i++) {
    const tentativa = i === 0 ? s : `${s}-${i + 1}`;
    // o endereço é único entre TODAS as contas: a consulta passa por cima da trava por usuário (RLS)
    const { rows } = await comoSistema(() => query('SELECT user_id FROM estoque_negocio WHERE slug = $1', [tentativa]));
    if (!rows.length || String(rows[0].user_id) === String(userId)) return tentativa;
  }
  return `${s}-${crypto.randomBytes(2).toString('hex')}`;
}

// Checklist do primeiro acesso e a tela de Configurações usam a mesma rota
async function salvarNegocio(userId, d = {}) {
  const atual = await lerNegocio(userId);
  const base = atual || { fidelidade: F.programaDe({}), tipo: 'loja', nome: '', controlaEstoque: true, slug: null, cardapioAtivo: false, whatsapp: '', frase: '', cor: '#2F5D46', horario: '', aceitaRetirada: true, aceitaEntrega: true, taxaEntrega: 0, pedidoMinimo: 0, categorias: [], checklist: {} };
  const n = { ...base };
  if (d.tipo !== undefined) { if (!TIPOS_NEGOCIO.includes(d.tipo)) throw erro('Tipo de negócio inválido.'); n.tipo = d.tipo; }
  if (d.nome !== undefined) n.nome = texto(d.nome, 80);
  if (d.controlaEstoque !== undefined) n.controlaEstoque = !!d.controlaEstoque;
  if (d.whatsapp !== undefined) {
    const w = String(d.whatsapp || '').replace(/\D/g, '');
    if (w && (w.length < 10 || w.length > 13)) throw erro('WhatsApp inválido. Use DDD + número.');
    n.whatsapp = w;
  }
  if (d.frase !== undefined) n.frase = texto(d.frase, 140);
  if (d.cor !== undefined) { if (!/^#[0-9a-fA-F]{6}$/.test(String(d.cor))) throw erro('Cor inválida.'); n.cor = d.cor; }
  if (d.horario !== undefined) n.horario = texto(d.horario, 80);
  if (d.aceitaRetirada !== undefined) n.aceitaRetirada = !!d.aceitaRetirada;
  if (d.aceitaEntrega !== undefined) n.aceitaEntrega = !!d.aceitaEntrega;
  if (d.taxaEntrega !== undefined) n.taxaEntrega = numero(d.taxaEntrega || 0, { max: 10000, nome: 'Taxa de entrega' });
  if (d.pedidoMinimo !== undefined) n.pedidoMinimo = numero(d.pedidoMinimo || 0, { max: 100000, nome: 'Pedido mínimo' });
  if (d.categorias !== undefined) {
    if (!Array.isArray(d.categorias)) throw erro('Categorias inválidas.');
    n.categorias = [...new Set(d.categorias.map((c) => texto(c, 60)).filter(Boolean))].slice(0, 60);
  }
  if (d.checklist !== undefined && d.checklist && typeof d.checklist === 'object') {
    const c = { ...(n.checklist || {}) };
    for (const k of ['configurado', 'produto', 'venda', 'cardapio', 'escondido']) if (d.checklist[k] !== undefined) c[k] = !!d.checklist[k];
    n.checklist = c;
  }
  if (d.cardapioAtivo !== undefined) n.cardapioAtivo = !!d.cardapioAtivo;
  if (d.fidelidade !== undefined) n.fidelidade = F.validarPrograma(d.fidelidade);
  if (n.tipo !== 'restaurante') n.cardapioAtivo = false;
  if (d.slug !== undefined && d.slug !== null && d.slug !== '') {
    const s = slugDe(d.slug);
    if (s.length < 3) throw erro('O endereço do cardápio precisa de pelo menos 3 letras ou números.');
    const { rows } = await comoSistema(() => query('SELECT user_id FROM estoque_negocio WHERE slug = $1', [s]));
    if (rows.length && String(rows[0].user_id) !== String(userId)) throw erro('Esse endereço já está em uso. Escolha outro.');
    n.slug = s;
  }
  if (n.tipo === 'restaurante' && !n.slug) n.slug = await slugLivre(n.nome || 'cardapio', userId);
  if (n.cardapioAtivo && !n.whatsapp) throw erro('Informe o WhatsApp que vai receber os pedidos.');
  n.checklist = { ...(n.checklist || {}), configurado: true };
  await query(
    `INSERT INTO estoque_negocio (user_id, tipo, nome, controla_estoque, slug, cardapio_ativo, whatsapp, frase, cor, horario,
       aceita_retirada, aceita_entrega, taxa_entrega, pedido_minimo, categorias, checklist, fidelidade)
     VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::text[], $16::jsonb, $17::jsonb)
     ON CONFLICT (user_id) DO UPDATE SET tipo = EXCLUDED.tipo, nome = EXCLUDED.nome, controla_estoque = EXCLUDED.controla_estoque,
       slug = EXCLUDED.slug, cardapio_ativo = EXCLUDED.cardapio_ativo, whatsapp = EXCLUDED.whatsapp, frase = EXCLUDED.frase,
       cor = EXCLUDED.cor, horario = EXCLUDED.horario, aceita_retirada = EXCLUDED.aceita_retirada, aceita_entrega = EXCLUDED.aceita_entrega,
       taxa_entrega = EXCLUDED.taxa_entrega, pedido_minimo = EXCLUDED.pedido_minimo, categorias = EXCLUDED.categorias,
       checklist = EXCLUDED.checklist, fidelidade = EXCLUDED.fidelidade, updated_at = now()`,
    [userId, n.tipo, n.nome, n.controlaEstoque, n.slug, n.cardapioAtivo, n.whatsapp, n.frase, n.cor, n.horario,
      n.aceitaRetirada, n.aceitaEntrega, n.taxaEntrega, n.pedidoMinimo, n.categorias, JSON.stringify(n.checklist), JSON.stringify(n.fidelidade || F.programaDe({}))]
  );
  return lerNegocio(userId);
}

async function marcarChecklist(userId, chave) {
  await query(
    `UPDATE estoque_negocio SET checklist = checklist || jsonb_build_object($2::text, true) WHERE user_id = $1::uuid AND NOT (checklist ? $2::text)`,
    [userId, chave]
  );
}

/* ------------------------------ Produtos ------------------------------ */

function situacao(estoque, minimo, controla) {
  if (!controla) return 'livre';
  if (estoque <= 0) return 'acabou';
  if (minimo > 0 && estoque <= minimo) return 'baixo';
  return 'ok';
}

function produtoObj(r, variacoes = []) {
  const vs = variacoes.map((v) => ({
    id: v.id, nome: v.nome, codigo: v.codigo, preco: v.preco === null ? null : Number(v.preco), custo: v.custo === null ? null : Number(v.custo),
    estoque: Number(v.estoque), estoqueMinimo: Number(v.estoque_minimo), ativo: v.ativo,
    precoFinal: v.preco === null ? Number(r.preco) : Number(v.preco), custoFinal: v.custo === null ? Number(r.custo) : Number(v.custo),
    situacao: situacao(Number(v.estoque), Number(v.estoque_minimo), r.controla_estoque),
  }));
  const ativas = vs.filter((v) => v.ativo);
  const estoque = vs.length ? ativas.reduce((a, v) => a + v.estoque, 0) : Number(r.estoque);
  let sit = situacao(Number(r.estoque), Number(r.estoque_minimo), r.controla_estoque);
  if (vs.length) {
    sit = !r.controla_estoque ? 'livre' : ativas.every((v) => v.situacao === 'acabou') ? 'acabou' : ativas.some((v) => v.situacao !== 'ok') ? 'baixo' : 'ok';
  }
  return {
    id: r.id, nome: r.nome, categoria: r.categoria, descricao: r.descricao, codigo: r.codigo, unidade: r.unidade,
    preco: Number(r.preco), custo: Number(r.custo), controlaEstoque: r.controla_estoque,
    estoque: qtd3(estoque), estoqueMinimo: Number(r.estoque_minimo), opcoes: r.opcoes || [],
    noCardapio: r.no_cardapio, destaque: r.destaque, ativo: r.ativo, cozinha: r.cozinha !== false, fiscal: r.fiscal || {},
    foto: r.tem_foto ? `/api/publico/foto/${r.user_id}/${r.id}?v=${new Date(r.updated_at).getTime()}` : '',
    variacoes: vs, situacao: sit, posicao: r.posicao,
  };
}

const COLS_PRODUTO = `user_id, id, nome, categoria, descricao, codigo, unidade, preco, custo, controla_estoque, estoque, estoque_minimo,
  opcoes, no_cardapio, destaque, ativo, cozinha, fiscal, posicao, updated_at, (foto IS NOT NULL) AS tem_foto`;

async function listarProdutos(userId, { ids = null } = {}) {
  const filtro = ids ? 'AND id = ANY($2::uuid[])' : '';
  const params = ids ? [userId, ids] : [userId];
  const { rows } = await query(`SELECT ${COLS_PRODUTO} FROM estoque_produtos WHERE user_id = $1::uuid ${filtro} ORDER BY categoria, posicao, nome`, params);
  const vs = await query(`SELECT * FROM estoque_variacoes WHERE user_id = $1::uuid ${ids ? 'AND produto_id = ANY($2::uuid[])' : ''} ORDER BY posicao, nome`, params);
  const porProduto = new Map();
  for (const v of vs.rows) { if (!porProduto.has(v.produto_id)) porProduto.set(v.produto_id, []); porProduto.get(v.produto_id).push(v); }
  return rows.map((r) => produtoObj(r, porProduto.get(r.id) || []));
}

async function produtoPorId(userId, id) {
  if (!ehUuid(id)) return null;
  const l = await listarProdutos(userId, { ids: [id] });
  return l[0] || null;
}

function validarOpcoes(lista) {
  if (lista == null) return [];
  if (!Array.isArray(lista) || lista.length > 10) throw erro('Adicionais inválidos (no máximo 10 grupos).');
  return lista.map((g) => {
    const nome = texto(g && g.nome, 40);
    if (!nome) throw erro('Dê um nome para cada grupo de adicionais.');
    const tipo = g.tipo === 'um' ? 'um' : 'varios';
    if (!Array.isArray(g.escolhas) || !g.escolhas.length || g.escolhas.length > 30) throw erro(`O grupo “${nome}” precisa de 1 a 30 opções.`);
    const escolhas = g.escolhas.map((e) => {
      const en = texto(e && e.nome, 40);
      if (!en) throw erro(`Uma opção do grupo “${nome}” está sem nome.`);
      return { nome: en, preco: Math.round(numero(e.preco || 0, { max: 100000, nome: 'Preço do adicional' }) * 100) / 100 };
    });
    return { nome, tipo, escolhas };
  }).filter(Boolean);
}

// Movimenta o estoque de um produto (ou variação). Dentro de transação. Devolve o saldo novo.
async function movimentar(userId, { produtoId, variacaoId = null, delta, tipo, ref = null, custoUnit = null, obs = '' }) {
  const p = await query('SELECT controla_estoque FROM estoque_produtos WHERE user_id = $1::uuid AND id = $2::uuid FOR UPDATE', [userId, produtoId]);
  if (!p.rows.length) return null;
  if (!p.rows[0].controla_estoque && tipo !== 'inicial') return null;
  let saldo;
  if (variacaoId) {
    const r = await query('UPDATE estoque_variacoes SET estoque = estoque + $3 WHERE user_id = $1::uuid AND id = $2::uuid RETURNING estoque', [userId, variacaoId, delta]);
    if (!r.rows.length) return null;
    saldo = Number(r.rows[0].estoque);
  } else {
    const r = await query('UPDATE estoque_produtos SET estoque = estoque + $3, updated_at = now() WHERE user_id = $1::uuid AND id = $2::uuid RETURNING estoque', [userId, produtoId, delta]);
    saldo = Number(r.rows[0].estoque);
  }
  await query(
    `INSERT INTO estoque_movimentos (user_id, produto_id, variacao_id, tipo, qtd, saldo, custo_unit, ref, obs)
     VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, $8, $9)`,
    [userId, produtoId, variacaoId, tipo, delta, saldo, custoUnit, ref, texto(obs, 200)]
  );
  return saldo;
}

// dados fiscais do produto (NFC-e): NCM de 8 números, CFOP de venda (5xxx/6xxx), CSOSN, origem, CEST
function fiscalDe(f) {
  if (!f || typeof f !== 'object') return {};
  const o = {};
  const ncm = String(f.ncm || '').replace(/\D/g, '');
  if (ncm) { if (ncm.length !== 8) throw erro('O NCM tem 8 números (veja na nota do fornecedor).'); o.ncm = ncm; }
  if (f.cfop) { if (!/^[56]\d{3}$/.test(String(f.cfop))) throw erro('CFOP inválido (ex.: 5102).'); o.cfop = String(f.cfop); }
  if (f.csosn) { if (!/^\d{3}$/.test(String(f.csosn))) throw erro('CSOSN inválido (ex.: 102).'); o.csosn = String(f.csosn); }
  if (f.origem !== undefined && f.origem !== '') { if (!/^[0-8]$/.test(String(f.origem))) throw erro('Origem inválida.'); o.origem = String(f.origem); }
  const cest = String(f.cest || '').replace(/\D/g, ''); if (cest) { if (cest.length !== 7) throw erro('O CEST tem 7 números.'); o.cest = cest; }
  return o;
}

async function salvarProduto(userId, d = {}, id = null) {
  const nome = texto(d.nome, 80);
  if (!nome) throw erro('Dê um nome para o produto.');
  const unidade = UNIDADES.includes(d.unidade) ? d.unidade : 'un';
  const preco = Math.round(numero(d.preco || 0, { max: 1e7, nome: 'Preço' }) * 100) / 100;
  const custo = Math.round(numero(d.custo || 0, { max: 1e7, nome: 'Custo' }) * 10000) / 10000;
  const controla = d.controlaEstoque !== false;
  const minimo = qtd3(numero(d.estoqueMinimo || 0, { max: 1e9, nome: 'Estoque mínimo' }));
  const opcoes = validarOpcoes(d.opcoes);
  const variacoes = Array.isArray(d.variacoes) ? d.variacoes : [];
  if (variacoes.length > 100) throw erro('No máximo 100 variações por produto.');
  const nomesVar = new Set();
  const vs = variacoes.map((v, i) => {
    const vn = texto(v && v.nome, 60);
    if (!vn) throw erro('Toda variação precisa de um nome (ex.: P, M, G ou Azul).');
    if (nomesVar.has(vn.toLowerCase())) throw erro(`Variação repetida: ${vn}.`);
    nomesVar.add(vn.toLowerCase());
    const vazio = (x) => x === null || x === undefined || x === '';
    return {
      id: ehUuid(v.id) ? v.id : null, nome: vn, codigo: texto(v.codigo, 40), posicao: i,
      preco: vazio(v.preco) ? null : Math.round(numero(v.preco, { max: 1e7, nome: 'Preço da variação' }) * 100) / 100,
      custo: vazio(v.custo) ? null : Math.round(numero(v.custo, { max: 1e7, nome: 'Custo da variação' }) * 10000) / 10000,
      estoqueMinimo: qtd3(numero(v.estoqueMinimo || 0, { max: 1e9, nome: 'Estoque mínimo' })),
      estoqueInicial: vazio(v.estoqueInicial) ? 0 : qtd3(numero(v.estoqueInicial, { min: -1e9, max: 1e9, nome: 'Estoque inicial' })),
      ativo: v.ativo !== false,
    };
  });
  const campos = [nome, texto(d.categoria, 60), texto(d.descricao, 400), texto(d.codigo, 40), unidade, preco, custo, controla, minimo,
    JSON.stringify(opcoes), d.noCardapio !== false, !!d.destaque, d.ativo !== false, d.cozinha !== false, d.fiscal === undefined ? null : JSON.stringify(fiscalDe(d.fiscal))];

  return transacao(async () => {
    let pid = id;
    if (pid) {
      if (!ehUuid(pid)) throw erro('Produto não encontrado.');
      const r = await query(
        `UPDATE estoque_produtos SET nome = $3, categoria = $4, descricao = $5, codigo = $6, unidade = $7, preco = $8, custo = $9,
           controla_estoque = $10, estoque_minimo = $11, opcoes = $12::jsonb, no_cardapio = $13, destaque = $14, ativo = $15, cozinha = $16, fiscal = COALESCE($17::jsonb, fiscal), updated_at = now()
         WHERE user_id = $1::uuid AND id = $2::uuid RETURNING id`, [userId, pid, ...campos]);
      if (!r.rows.length) throw erro('Produto não encontrado.');
    } else {
      const { rows: c } = await query('SELECT count(*)::int AS n FROM estoque_produtos WHERE user_id = $1::uuid', [userId]);
      if (c[0].n >= 5000) throw erro('Limite de 5.000 produtos atingido.');
      const r = await query(
        `INSERT INTO estoque_produtos (user_id, nome, categoria, descricao, codigo, unidade, preco, custo, controla_estoque, estoque_minimo,
           opcoes, no_cardapio, destaque, ativo, cozinha, fiscal, posicao)
         VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12, $13, $14, $15, COALESCE($16::jsonb, '{}'::jsonb), $17) RETURNING id`, [userId, ...campos, c[0].n]);
      pid = r.rows[0].id;
      const inicial = vs.length ? 0 : qtd3(numero(d.estoqueInicial || 0, { min: -1e9, max: 1e9, nome: 'Estoque inicial' }));
      if (inicial && controla) await movimentar(userId, { produtoId: pid, delta: inicial, tipo: 'inicial', custoUnit: custo, obs: 'Estoque inicial' });
    }
    // variações: as que sumiram da lista são apagadas; as novas entram com o estoque inicial
    const existentes = await query('SELECT id FROM estoque_variacoes WHERE user_id = $1::uuid AND produto_id = $2::uuid', [userId, pid]);
    const ids = new Set(existentes.rows.map((r) => r.id));
    const mantidas = vs.filter((v) => v.id && ids.has(v.id)).map((v) => v.id);
    await query('DELETE FROM estoque_variacoes WHERE user_id = $1::uuid AND produto_id = $2::uuid AND NOT (id = ANY($3::uuid[]))', [userId, pid, mantidas]);
    for (const v of vs) {
      if (v.id && ids.has(v.id)) {
        await query(
          `UPDATE estoque_variacoes SET nome = $3, codigo = $4, preco = $5, custo = $6, estoque_minimo = $7, ativo = $8, posicao = $9
           WHERE user_id = $1::uuid AND id = $2::uuid`, [userId, v.id, v.nome, v.codigo, v.preco, v.custo, v.estoqueMinimo, v.ativo, v.posicao]);
      } else {
        const r = await query(
          `INSERT INTO estoque_variacoes (user_id, produto_id, nome, codigo, preco, custo, estoque_minimo, ativo, posicao)
           VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
          [userId, pid, v.nome, v.codigo, v.preco, v.custo, v.estoqueMinimo, v.ativo, v.posicao]);
        if (v.estoqueInicial && controla) {
          await movimentar(userId, { produtoId: pid, variacaoId: r.rows[0].id, delta: v.estoqueInicial, tipo: 'inicial', custoUnit: v.custo === null ? custo : v.custo, obs: 'Estoque inicial' });
        }
      }
    }
    // ganhou variações: o estoque passa a ser de cada variação
    if (vs.length) await query('UPDATE estoque_produtos SET estoque = 0 WHERE user_id = $1::uuid AND id = $2::uuid', [userId, pid]);
    await marcarChecklist(userId, 'produto');
    return produtoPorId(userId, pid);
  });
}

async function excluirProduto(userId, id) {
  if (!ehUuid(id)) throw erro('Produto não encontrado.');
  const r = await query('DELETE FROM estoque_produtos WHERE user_id = $1::uuid AND id = $2::uuid RETURNING id', [userId, id]);
  if (!r.rows.length) throw erro('Produto não encontrado.');
}

async function salvarFoto(userId, id, dataUrl) {
  if (!ehUuid(id)) throw erro('Produto não encontrado.');
  if (dataUrl === null) {
    await query('UPDATE estoque_produtos SET foto = NULL, foto_tipo = NULL, updated_at = now() WHERE user_id = $1::uuid AND id = $2::uuid', [userId, id]);
    return;
  }
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!m) throw erro('Foto inválida. Use JPG, PNG ou WEBP.');
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > FOTO_MAX) throw erro('Foto grande demais.');
  const r = await query('UPDATE estoque_produtos SET foto = $3, foto_tipo = $4, updated_at = now() WHERE user_id = $1::uuid AND id = $2::uuid RETURNING id', [userId, id, buf, m[1]]);
  if (!r.rows.length) throw erro('Produto não encontrado.');
}

// Ajuste manual: "contei e tem X" (saldo) ou "perdi/quebrou N" (perda)
async function ajustarEstoque(userId, d = {}) {
  if (!ehUuid(d.produtoId)) throw erro('Produto não encontrado.');
  const variacaoId = ehUuid(d.variacaoId) ? d.variacaoId : null;
  return transacao(async () => {
    const p = await query('SELECT estoque, controla_estoque FROM estoque_produtos WHERE user_id = $1::uuid AND id = $2::uuid FOR UPDATE', [userId, d.produtoId]);
    if (!p.rows.length) throw erro('Produto não encontrado.');
    if (!p.rows[0].controla_estoque) throw erro('Este produto está sem controle de estoque.');
    let atual = Number(p.rows[0].estoque);
    if (variacaoId) {
      const v = await query('SELECT estoque FROM estoque_variacoes WHERE user_id = $1::uuid AND id = $2::uuid AND produto_id = $3::uuid', [userId, variacaoId, d.produtoId]);
      if (!v.rows.length) throw erro('Variação não encontrada.');
      atual = Number(v.rows[0].estoque);
    } else {
      const temVar = await query('SELECT 1 FROM estoque_variacoes WHERE user_id = $1::uuid AND produto_id = $2::uuid LIMIT 1', [userId, d.produtoId]);
      if (temVar.rows.length) throw erro('Escolha a variação.');
    }
    let delta; let tipo;
    if (d.modo === 'perda') { delta = -qtd3(numero(d.qtd, { min: 0.001, max: 1e9, nome: 'Quantidade' })); tipo = 'perda'; }
    else if (d.modo === 'entrada') { delta = qtd3(numero(d.qtd, { min: 0.001, max: 1e9, nome: 'Quantidade' })); tipo = 'ajuste'; }
    else { delta = qtd3(numero(d.saldo, { min: -1e9, max: 1e9, nome: 'Quantidade' }) - atual); tipo = 'ajuste'; }
    if (!delta) return { saldo: atual };
    const saldo = await movimentar(userId, { produtoId: d.produtoId, variacaoId, delta, tipo, obs: texto(d.obs, 200) });
    return { saldo };
  });
}

async function movimentosDe(userId, produtoId) {
  if (!ehUuid(produtoId)) return [];
  const { rows } = await query(
    `SELECT m.id, m.tipo, m.qtd, m.saldo, m.custo_unit, m.ref, m.obs, m.criado_em, v.nome AS variacao
       FROM estoque_movimentos m LEFT JOIN estoque_variacoes v ON v.user_id = m.user_id AND v.id = m.variacao_id
      WHERE m.user_id = $1::uuid AND m.produto_id = $2::uuid ORDER BY m.criado_em DESC, m.id DESC LIMIT 200`, [userId, produtoId]);
  return rows.map((r) => ({ id: r.id, tipo: r.tipo, qtd: Number(r.qtd), saldo: Number(r.saldo), custoUnit: r.custo_unit === null ? null : Number(r.custo_unit), ref: r.ref, obs: r.obs, em: r.criado_em, variacao: r.variacao }));
}

/* ------------------------------ Financeiro ------------------------------ */

async function inserirLancamentos(userId, lista) {
  if (!lista.length) return [];
  const { rows } = await query('SELECT COALESCE(max(posicao), -1)::int AS p FROM financeiro_lancamentos WHERE user_id = $1::uuid', [userId]);
  let posicao = rows[0].p + 1;
  for (const l of lista) {
    await query(
      `INSERT INTO financeiro_lancamentos (user_id, id, posicao, data, descricao, tipo, categoria, escopo, forma, status, valor, recorrencia, parcelas, extras)
       VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, 'Empresa', $8, $9, $10, 'unico', NULL, $11::jsonb)`,
      [userId, l.id, posicao++, l.data, texto(l.descricao, 200), l.tipo, l.categoria, l.forma, l.status, l.valor, JSON.stringify(l.extras)]
    );
  }
  return lista.map((l) => l.id);
}
async function apagarLancamentos(userId, ids) {
  if (!ids || !ids.length) return;
  await query(`DELETE FROM financeiro_lancamentos WHERE user_id = $1::uuid AND id = ANY($2::text[]) AND extras ? 'estoque'`, [userId, ids]);
}

/* ------------------------------ Vendas ------------------------------ */

async function proximoNumero(userId, coluna) {
  await query('INSERT INTO estoque_negocio (user_id) VALUES ($1::uuid) ON CONFLICT (user_id) DO NOTHING', [userId]);
  const r = await query(`UPDATE estoque_negocio SET ${coluna} = ${coluna} + 1 WHERE user_id = $1::uuid RETURNING ${coluna} AS n`, [userId]);
  return r.rows[0].n;
}

// Confere os itens com o cadastro. Item avulso (sem produto) também vale: { nome, qtd, unit }.
async function montarItens(userId, itens, { exigirEstoque = false } = {}) {
  if (!Array.isArray(itens) || !itens.length) throw erro('Adicione pelo menos um item.');
  if (itens.length > MAX_ITENS) throw erro('Itens demais numa venda só.');
  const ids = [...new Set(itens.map((i) => i && i.produtoId).filter(ehUuid))];
  const produtos = ids.length ? await listarProdutos(userId, { ids }) : [];
  const porId = new Map(produtos.map((p) => [p.id, p]));
  return itens.map((i) => {
    const qtd = qtd3(numero(i && i.qtd, { min: 0.001, max: 100000, nome: 'Quantidade' }));
    const unitDado = i.unit === undefined || i.unit === null || i.unit === '' ? null : Math.round(numero(i.unit, { max: 1e7, nome: 'Preço' }) * 100) / 100;
    const opcoes = Array.isArray(i.opcoes) ? i.opcoes.map((o) => texto(o, 60)).filter(Boolean).slice(0, 20) : [];
    if (!i.produtoId) {
      const nome = texto(i.nome, 80);
      if (!nome || unitDado === null) throw erro('Item avulso precisa de nome e preço.');
      return { produtoId: null, variacaoId: null, nome, qtd, unit: unitDado, custoUnit: Math.round(numero(i.custoUnit || 0, { max: 1e7, nome: 'Custo' }) * 100) / 100, opcoes, controla: false };
    }
    const p = porId.get(i.produtoId);
    if (!p) throw erro('Um dos produtos não existe mais. Atualize a tela.');
    let v = null;
    if (p.variacoes.length) {
      v = p.variacoes.find((x) => x.id === i.variacaoId);
      if (!v) throw erro(`Escolha a variação de “${p.nome}”.`);
    }
    const nome = v ? nomeComVar(p.nome, v.nome) : p.nome;
    if (exigirEstoque && p.controlaEstoque && (v ? v.estoque : p.estoque) < qtd) throw erro(`“${nome}” não tem estoque suficiente.`);
    return {
      produtoId: p.id, variacaoId: v ? v.id : null, nome, qtd,
      unit: unitDado !== null ? unitDado : (v ? v.precoFinal : p.preco),
      custoUnit: Math.round((v ? v.custoFinal : p.custo) * 10000) / 10000, opcoes, controla: p.controlaEstoque,
    };
  });
}

async function registrarVenda(userId, d = {}, agora = new Date()) {
  // venda feita sem internet e reenviada: o mesmo código não vira duas vendas
  const refCliente = typeof d.refCliente === 'string' && /^[\w-]{8,64}$/.test(d.refCliente) ? d.refCliente : null;
  if (refCliente) {
    const ja = await query('SELECT id FROM estoque_vendas WHERE user_id = $1::uuid AND ref_cliente = $2', [userId, refCliente]);
    if (ja.rows.length) return { venda: await vendaPorId(userId, ja.rows[0].id), alertas: [], repetida: true };
  }
  // hora em que a venda aconteceu de verdade (sem internet), até 7 dias atrás
  let feitaEm = null;
  if (d.feitaEm) {
    const t = new Date(d.feitaEm);
    if (!Number.isNaN(t.getTime()) && t <= new Date(agora.getTime() + 5 * 60000) && t >= new Date(agora.getTime() - 7 * 86400000)) feitaEm = t;
  }
  if (feitaEm && !d.data) d = { ...d, data: hojeBR(feitaEm) };
  const hoje = hojeBR(agora);
  const data = dataOu(d.data, hoje);
  // pagamentos: [{ meio, valor }] (pode dividir; o dinheiro pode passar do total e vira troco)
  // ou só "meio" (um meio só, o total inteiro)
  let pagEntrada = null;
  if (Array.isArray(d.pagamentos) && d.pagamentos.length) {
    if (d.pagamentos.length > 6) throw erro('No máximo 6 formas de pagamento numa venda.');
    pagEntrada = d.pagamentos.map((p) => {
      if (!p || !MEIOS_VENDA.includes(p.meio)) throw erro('Forma de pagamento inválida.');
      return { meio: p.meio, valorC: centavos(numero(p.valor, { min: 0.01, max: 1e8, nome: 'Valor do pagamento' })) };
    });
  } else if (!MEIOS_VENDA.includes(d.meio)) throw erro('Escolha a forma de pagamento.');
  const itens = await montarItens(userId, d.itens);
  const subC = itens.reduce((a, i) => a + Math.round(i.qtd * i.unit * 100), 0);
  const descC = centavos(numero(d.desconto || 0, { max: 1e8, nome: 'Desconto' }));
  const acrC = centavos(numero(d.acrescimo || 0, { max: 1e8, nome: 'Taxa de entrega' }));
  if (descC > subC) throw erro('O desconto é maior que a venda.');
  const cmvC = itens.reduce((a, i) => a + Math.round(i.qtd * i.custoUnit * 100), 0);
  const { taxas } = await lerModo(userId);
  const negocio = await lerNegocio(userId);
  const programa = F.programaDe(negocio && negocio.fidelidade);

  // cliente: um já cadastrado (clienteId) ou um novo (clienteNovo: { nome, telefone, participa })
  let clienteRow = null;
  if (ehUuid(d.clienteId)) {
    const r = await query('SELECT * FROM estoque_clientes WHERE user_id = $1::uuid AND id = $2::uuid', [userId, d.clienteId]);
    clienteRow = r.rows[0] || null;
    if (!clienteRow) throw erro('Cliente não encontrado. Atualize a tela.');
  } else if (d.clienteNovo && typeof d.clienteNovo === 'object') {
    const c = await F.salvarCliente(userId, d.clienteNovo, null, hoje);
    clienteRow = (await query('SELECT * FROM estoque_clientes WHERE user_id = $1::uuid AND id = $2::uuid', [userId, c.id])).rows[0];
  }
  const cliente = texto(d.cliente, 80) || (clienteRow ? clienteRow.nome : '');
  const participa = !!(clienteRow && clienteRow.participa) && programa.modelo !== 'nenhum';

  // benefícios usados nesta venda (viram desconto)
  const baseC = subC - descC;
  let cashUsoC = 0; let premioC = 0; let selosUsados = 0;
  if (d.usarCashback && participa && programa.modelo === 'cashback') {
    const saldoC = Math.round((await F.saldoCashback(userId, clienteRow.id, hoje)) * 100);
    if (programa.minimoUso && baseC < centavos(programa.minimoUso)) throw erro(`O cashback só pode ser usado em compras a partir de ${moeda(programa.minimoUso)}.`);
    const pedido = d.usarCashback === true ? saldoC : centavos(numero(d.usarCashback, { max: 1e8, nome: 'Cashback' }));
    cashUsoC = Math.min(pedido, saldoC, baseC);
  }
  if (d.usarPremio && participa && programa.modelo === 'selos') {
    if (clienteRow.selos < programa.selosMeta) throw erro(`O cliente ainda não completou ${programa.selosMeta} compras.`);
    premioC = Math.min(centavos(programa.premioValor), baseC);
    selosUsados = programa.selosMeta;
  }
  const pagoC = baseC - cashUsoC - premioC; // o que o cliente paga pelos produtos
  const totalC = pagoC + acrC;
  // limite de desconto de quem está no caixa (operador "caixa"); o gerente não tem limite
  if (d._descontoMax !== undefined && d._descontoMax !== null && subC > 0 && descC > Math.round(subC * Number(d._descontoMax) / 100)) {
    throw erro(`Desconto acima do permitido para o caixa (até ${String(d._descontoMax).replace('.', ',')}%). Peça para um gerente.`);
  }
  // junta os pagamentos por meio, confere se cobrem o total e calcula o troco (só do dinheiro)
  const porMeio = new Map();
  for (const p of (pagEntrada || [{ meio: d.meio, valorC: totalC }])) porMeio.set(p.meio, (porMeio.get(p.meio) || 0) + p.valorC);
  const somaC = [...porMeio.values()].reduce((a, v) => a + v, 0);
  if (somaC < totalC) throw erro(`Falta receber ${moeda(reais(totalC - somaC))}.`);
  const trocoC = somaC - totalC;
  const dinheiroC = porMeio.get('dinheiro') || 0;
  if (trocoC > dinheiroC) throw erro('O valor pago passou do total. Só o dinheiro pode ter troco.');
  const recebidoC = dinheiroC;
  if (trocoC) { if (dinheiroC - trocoC > 0) porMeio.set('dinheiro', dinheiroC - trocoC); else porMeio.delete('dinheiro'); }
  if (totalC === 0) porMeio.clear();
  const pagamentos = [...porMeio.entries()].filter(([, v]) => v > 0).map(([meio, valorC]) => ({ meio, valorC }));
  if (pagamentos.some((p) => p.meio === 'fiado') && !clienteRow) throw erro('Para vender fiado, escolha o cliente.');
  const meio = pagamentos.length > 1 ? 'misto' : (pagamentos[0] ? pagamentos[0].meio : (pagEntrada ? pagEntrada[0].meio : d.meio));
  const fiadoC = porMeio.get('fiado') || 0;
  const taxaPorMeio = pagamentos.map((p) => { const pct = p.meio === 'fiado' ? null : taxas[p.meio]; return pct ? Math.round(p.valorC * pct / 100) : 0; });
  const taxaC = taxaPorMeio.reduce((a, v) => a + v, 0);
  // caixa aberto (só para venda de hoje)
  const caixaAberto = data === hoje ? (await query(`SELECT id FROM estoque_caixas WHERE user_id = $1::uuid AND status = 'aberto'`, [userId])).rows[0] : null;
  // benefícios ganhos
  const cashGanhoC = participa && programa.modelo === 'cashback' ? Math.round(pagoC * programa.cashbackPct / 100) : 0;
  const selosGanhos = participa && programa.modelo === 'selos' && baseC >= centavos(programa.selosMinimo || 0) && baseC > 0 ? 1 : 0;

  return transacao(async () => {
    if (refCliente) {
      // dois envios da mesma venda ao mesmo tempo (duas abas, internet voltando): trava a conta e confere de novo
      await query('INSERT INTO estoque_negocio (user_id) VALUES ($1::uuid) ON CONFLICT (user_id) DO NOTHING', [userId]);
      await query('SELECT 1 FROM estoque_negocio WHERE user_id = $1::uuid FOR UPDATE', [userId]);
      const ja = await query('SELECT id FROM estoque_vendas WHERE user_id = $1::uuid AND ref_cliente = $2', [userId, refCliente]);
      if (ja.rows.length) return { venda: await vendaPorId(userId, ja.rows[0].id), alertas: [], repetida: true };
    }
    const numeroVenda = await proximoNumero(userId, 'seq_venda');
    const vendaId = crypto.randomUUID();
    const alertas = [];
    for (const i of itens) {
      if (!i.produtoId || !i.controla) continue;
      const saldo = await movimentar(userId, { produtoId: i.produtoId, variacaoId: i.variacaoId, delta: -i.qtd, tipo: 'venda', ref: vendaId, custoUnit: i.custoUnit, obs: `Venda #${numeroVenda}` });
      if (saldo !== null && saldo <= 0) alertas.push(`${i.nome}: acabou o estoque${saldo < 0 ? ` (ficou ${saldo})` : ''}`);
    }
    let consumo = [];
    if (cashUsoC > 0) consumo = await F.consumirCashback(userId, clienteRow.id, cashUsoC, hoje);
    if (cashGanhoC > 0) await F.creditarCashback(userId, clienteRow.id, vendaId, cashGanhoC, programa, hoje, `Venda #${numeroVenda}`);
    if (selosGanhos || selosUsados) {
      await query('UPDATE estoque_clientes SET selos = GREATEST(0, selos - $3 + $4), atualizado_em = now() WHERE user_id = $1::uuid AND id = $2::uuid',
        [userId, clienteRow.id, selosUsados, selosGanhos]);
    }
    const beneficioTxt = cashUsoC ? ` (cashback ${moeda(reais(cashUsoC))})` : premioC ? ' (prêmio fidelidade)' : '';
    // uma receita por forma de pagamento (o custo da mercadoria vai só na primeira)
    const lanc = [];
    pagamentos.forEach((p, i) => {
      const marca = { origem: 'venda', vendaId, numero: numeroVenda, cmv: i === 0 ? reais(cmvC) : 0, taxa: i === 0 ? reais(taxaC) : 0, meio: p.meio, itens: i === 0 ? itens.length : 0 };
      if (i > 0) marca.parte = true;
      if (p.meio === 'fiado') marca.fiado = true;
      if (i === 0 && (cashUsoC || premioC)) marca.fidelidade = reais(cashUsoC + premioC);
      lanc.push({
        id: novoIdLancamento('v'), data,
        descricao: `Venda #${numeroVenda}${cliente ? ` — ${cliente}` : ''}${d.pedidoId ? ' (cardápio)' : ''}${pagamentos.length > 1 ? ` (${NOME_MEIO[p.meio]})` : p.meio === 'fiado' ? ' (fiado)' : ''}${i === 0 ? beneficioTxt : ''}`,
        tipo: 'Receita', categoria: 'Vendas', forma: contaDoMeio(p.meio), status: p.meio === 'fiado' ? 'Pendente' : (data > hoje ? 'Agendado' : 'Pago'),
        valor: reais(p.valorC), extras: { estoque: marca },
      });
      if (taxaPorMeio[i] > 0) {
        lanc.push({ id: novoIdLancamento('t'), data, descricao: `Taxa ${NOME_MEIO[p.meio].toLowerCase()} — venda #${numeroVenda}`, tipo: 'Despesa', categoria: 'Taxas de pagamento',
          forma: contaDoMeio(p.meio), status: data > hoje ? 'Agendado' : 'Pago', valor: reais(taxaPorMeio[i]), extras: { estoque: { origem: 'taxa', vendaId, numero: numeroVenda } } });
      }
    });
    const lancIds = await inserirLancamentos(userId, lanc);
    const itensGuardados = itens.map(({ controla, ...resto }) => resto);
    await query(
      `INSERT INTO estoque_vendas (user_id, id, numero, data, itens, subtotal, desconto, acrescimo, total, cmv, taxa, meio, cliente, obs, pedido_id, lancamento_ids,
         cliente_id, cashback_usado, cashback_ganho, premio_valor, selos_ganhos, selos_usados, cashback_consumo,
         caixa_id, operador, pagamentos, recebido, troco, fiado_aberto, ref_cliente, offline, criado_em)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5::jsonb, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::uuid, $16::text[], $17::uuid, $18, $19, $20, $21, $22, $23::jsonb,
         $24::uuid, $25, $26::jsonb, $27, $28, $29, $30, $31, COALESCE($32::timestamptz, now()))`,
      [userId, vendaId, numeroVenda, data, JSON.stringify(itensGuardados), reais(subC), reais(descC), reais(acrC), reais(totalC), reais(cmvC), reais(taxaC),
        meio, cliente, texto(d.obs, 300), ehUuid(d.pedidoId) ? d.pedidoId : null, lancIds,
        clienteRow ? clienteRow.id : null, reais(cashUsoC), reais(cashGanhoC), reais(premioC), selosGanhos, selosUsados, JSON.stringify(consumo),
        caixaAberto ? caixaAberto.id : null, texto(d._operador, 60), JSON.stringify(pagamentos.map((p) => ({ meio: p.meio, valor: reais(p.valorC) }))),
        reais(recebidoC), reais(trocoC), reais(fiadoC), refCliente, !!feitaEm, feitaEm ? feitaEm.toISOString() : null]
    );
    await marcarChecklist(userId, 'venda');
    // estoque baixo (não acabou, mas chegou no mínimo)
    const ids = [...new Set(itens.filter((i) => i.produtoId && i.controla).map((i) => i.produtoId))];
    if (ids.length) {
      for (const p of await listarProdutos(userId, { ids })) {
        const partes = p.variacoes.length ? p.variacoes.filter((v) => v.situacao === 'baixo').map((v) => nomeComVar(p.nome, v.nome)) : (p.situacao === 'baixo' ? [p.nome] : []);
        for (const n of partes) alertas.push(`${n}: estoque baixo`);
      }
    }
    return { venda: await vendaPorId(userId, vendaId), alertas };
  });
}

function vendaObj(r) {
  return {
    id: r.id, numero: r.numero, data: r.data, itens: r.itens, subtotal: Number(r.subtotal), desconto: Number(r.desconto), acrescimo: Number(r.acrescimo),
    total: Number(r.total), cmv: Number(r.cmv), taxa: Number(r.taxa), lucro: Math.round((Number(r.total) - Number(r.cmv) - Number(r.taxa)) * 100) / 100,
    meio: r.meio, cliente: r.cliente, obs: r.obs, pedidoId: r.pedido_id, cancelada: r.cancelada, criadoEm: r.criado_em,
    clienteId: r.cliente_id, cashbackUsado: Number(r.cashback_usado || 0), cashbackGanho: Number(r.cashback_ganho || 0),
    premioValor: Number(r.premio_valor || 0), selosGanhos: r.selos_ganhos || 0, selosUsados: r.selos_usados || 0,
    caixaId: r.caixa_id || null, operador: r.operador || '', pagamentos: r.pagamentos || [], recebido: Number(r.recebido || 0), troco: Number(r.troco || 0),
    fiadoAberto: Number(r.fiado_aberto || 0), comandaId: r.comanda_id || null, nfce: r.nfce || null, offline: !!r.offline,
  };
}
async function vendaPorId(userId, id) {
  const { rows } = await query('SELECT * FROM estoque_vendas WHERE user_id = $1::uuid AND id = $2::uuid', [userId, id]);
  return rows[0] ? vendaObj(rows[0]) : null;
}
// limite: a tela mostra até 1000; planilha e backup pedem tudo (limite maior)
async function listarVendas(userId, { de, ate, limite = 1000 } = {}) {
  const ini = dataOu(de, '1900-01-01'); const fim = dataOu(ate, '2999-12-31');
  const { rows } = await query('SELECT * FROM estoque_vendas WHERE user_id = $1::uuid AND data BETWEEN $2 AND $3 ORDER BY data DESC, numero DESC LIMIT $4', [userId, ini, fim, Math.min(Math.max(1, Number(limite) || 1000), 200000)]);
  return rows.map(vendaObj);
}

async function cancelarVenda(userId, id) {
  if (!ehUuid(id)) throw erro('Venda não encontrada.');
  return transacao(async () => {
    const { rows } = await query('SELECT * FROM estoque_vendas WHERE user_id = $1::uuid AND id = $2::uuid FOR UPDATE', [userId, id]);
    const v = rows[0];
    if (!v) throw erro('Venda não encontrada.');
    if (v.cancelada) return vendaObj(v);
    if (v.nfce && v.nfce.status === 'autorizada') throw erro('Essa venda tem NFC-e autorizada. Cancele a nota fiscal primeiro (no detalhe da venda) e depois a venda.');
    const fiadoTotal = (v.pagamentos || []).filter((p) => p.meio === 'fiado').reduce((a, p) => a + Number(p.valor), 0);
    if (fiadoTotal && Number(v.fiado_aberto) < fiadoTotal - 0.004) throw erro('O cliente já pagou parte deste fiado. Para desfazer, registre uma devolução no Controle financeiro.');
    for (const i of v.itens) {
      if (!i.produtoId) continue;
      await movimentar(userId, { produtoId: i.produtoId, variacaoId: i.variacaoId || null, delta: Number(i.qtd), tipo: 'cancelamento', ref: id, obs: `Venda #${v.numero} cancelada` });
    }
    await apagarLancamentos(userId, v.lancamento_ids);
    // fidelidade: o cashback usado volta, o ganho nesta venda some (o que já foi gasto dele fica)
    await F.devolverConsumo(userId, v.cashback_consumo);
    await query('DELETE FROM estoque_cashback WHERE user_id = $1::uuid AND venda_id = $2::uuid', [userId, id]);
    if (v.cliente_id && (v.selos_ganhos || v.selos_usados)) {
      await query('UPDATE estoque_clientes SET selos = GREATEST(0, selos - $3 + $4) WHERE user_id = $1::uuid AND id = $2::uuid', [userId, v.cliente_id, v.selos_ganhos, v.selos_usados]);
    }
    await query('UPDATE estoque_vendas SET cancelada = true, cancelada_em = now() WHERE user_id = $1::uuid AND id = $2::uuid', [userId, id]);
    if (v.pedido_id) await query(`UPDATE estoque_pedidos SET status = 'novo', venda_id = NULL WHERE user_id = $1::uuid AND id = $2::uuid`, [userId, v.pedido_id]);
    return vendaPorId(userId, id);
  });
}

/* ------------------------------ Compras ------------------------------ */

async function registrarCompra(userId, d = {}, agora = new Date()) {
  const hoje = hojeBR(agora);
  const data = dataOu(d.data, hoje);
  const vencimento = d.vencimento ? dataOu(d.vencimento, null) : null;
  const meio = MEIOS_VENDA.includes(d.meio) && d.meio !== 'fiado' ? d.meio : 'pix';
  if (!Array.isArray(d.itens) || !d.itens.length) throw erro('Adicione pelo menos um produto na compra.');
  if (d.itens.length > MAX_ITENS) throw erro('Itens demais numa compra só.');
  const ids = [...new Set(d.itens.map((i) => i && i.produtoId).filter(ehUuid))];
  const porId = new Map((ids.length ? await listarProdutos(userId, { ids }) : []).map((p) => [p.id, p]));
  const itens = d.itens.map((i) => {
    const p = porId.get(i && i.produtoId);
    if (!p) throw erro('Escolha o produto de cada linha da compra.');
    let v = null;
    if (p.variacoes.length) { v = p.variacoes.find((x) => x.id === i.variacaoId); if (!v) throw erro(`Escolha a variação de “${p.nome}”.`); }
    return {
      produtoId: p.id, variacaoId: v ? v.id : null, nome: v ? nomeComVar(p.nome, v.nome) : p.nome,
      qtd: qtd3(numero(i.qtd, { min: 0.001, max: 1e7, nome: 'Quantidade' })),
      custoUnit: Math.round(numero(i.custoUnit, { max: 1e7, nome: 'Custo' }) * 10000) / 10000,
      produto: p, variacao: v,
    };
  });
  const freteC = centavos(numero(d.frete || 0, { max: 1e8, nome: 'Frete' }));
  const mercC = itens.reduce((a, i) => a + Math.round(i.qtd * i.custoUnit * 100), 0);
  const totalC = mercC + freteC;
  if (totalC <= 0) throw erro('O valor da compra precisa ser maior que zero.');
  const fornecedor = texto(d.fornecedor, 80);
  const nfe = d.nfe && typeof d.nfe === 'object' && /^\d{44}$/.test(String(d.nfe.chave || '')) ? { chave: String(d.nfe.chave), numero: texto(d.nfe.numero, 20) } : null;

  return transacao(async () => {
    if (nfe) {
      const ja = await query('SELECT data FROM estoque_compras WHERE user_id = $1::uuid AND nfe_chave = $2 AND NOT cancelada', [userId, nfe.chave]);
      if (ja.rows.length) throw erro(`Essa nota (NF-e ${nfe.numero}) já foi lançada em ${String(ja.rows[0].data).split('-').reverse().join('/')}.`);
    }
    const compraId = crypto.randomUUID();
    for (const i of itens) {
      // frete dividido pelo valor de cada item: entra no custo da mercadoria
      const parteFrete = mercC > 0 ? (freteC / 100) * (i.qtd * i.custoUnit) / (mercC / 100) : 0;
      const custoComFrete = i.custoUnit + parteFrete / i.qtd;
      const p = i.produto; const v = i.variacao;
      const saldoAntes = Math.max(0, v ? v.estoque : p.estoque);
      const custoAntes = v ? v.custoFinal : p.custo;
      const custoNovo = p.controlaEstoque && saldoAntes > 0 ? (saldoAntes * custoAntes + i.qtd * custoComFrete) / (saldoAntes + i.qtd) : custoComFrete;
      const c4 = Math.round(custoNovo * 10000) / 10000;
      if (v) await query('UPDATE estoque_variacoes SET custo = $3 WHERE user_id = $1::uuid AND id = $2::uuid', [userId, v.id, c4]);
      else await query('UPDATE estoque_produtos SET custo = $3, updated_at = now() WHERE user_id = $1::uuid AND id = $2::uuid', [userId, p.id, c4]);
      await movimentar(userId, { produtoId: p.id, variacaoId: v ? v.id : null, delta: i.qtd, tipo: 'compra', ref: compraId, custoUnit: Math.round(custoComFrete * 10000) / 10000, obs: fornecedor ? `Compra — ${fornecedor}` : 'Compra' });
    }
    const quando = vencimento || data;
    const lancIds = await inserirLancamentos(userId, [{
      id: novoIdLancamento('c'), data: quando, descricao: `Compra de mercadoria${fornecedor ? ` — ${fornecedor}` : ''}${nfe ? ` (NF-e ${nfe.numero})` : ''}`,
      tipo: 'Despesa', categoria: 'Custo de mercadoria', forma: contaDoMeio(meio), status: quando > hoje ? 'Agendado' : 'Pago',
      valor: reais(totalC), extras: { estoque: { origem: 'compra', compraId } },
    }]);
    const guardar = itens.map(({ produto, variacao, ...r }) => r);
    await query(
      `INSERT INTO estoque_compras (user_id, id, data, fornecedor, itens, frete, total, meio, vencimento, lancamento_ids, nfe_chave, nfe_numero)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5::jsonb, $6, $7, $8, $9, $10::text[], $11, $12)`,
      [userId, compraId, data, fornecedor, JSON.stringify(guardar), reais(freteC), reais(totalC), meio, vencimento, lancIds, nfe ? nfe.chave : null, nfe ? nfe.numero : '']
    );
    return compraPorId(userId, compraId);
  });
}
function compraObj(r) {
  return { id: r.id, data: r.data, fornecedor: r.fornecedor, itens: r.itens, frete: Number(r.frete), total: Number(r.total), meio: r.meio, vencimento: r.vencimento, cancelada: r.cancelada, criadoEm: r.criado_em, nfeNumero: r.nfe_numero || '', nfeChave: r.nfe_chave || null };
}
async function compraPorId(userId, id) {
  const { rows } = await query('SELECT * FROM estoque_compras WHERE user_id = $1::uuid AND id = $2::uuid', [userId, id]);
  return rows[0] ? compraObj(rows[0]) : null;
}
async function listarCompras(userId, { de, ate, limite = 500 } = {}) {
  const ini = dataOu(de, '1900-01-01'); const fim = dataOu(ate, '2999-12-31');
  const { rows } = await query('SELECT * FROM estoque_compras WHERE user_id = $1::uuid AND data BETWEEN $2 AND $3 ORDER BY data DESC, criado_em DESC LIMIT $4', [userId, ini, fim, Math.min(Math.max(1, Number(limite) || 500), 200000)]);
  return rows.map(compraObj);
}
async function cancelarCompra(userId, id) {
  if (!ehUuid(id)) throw erro('Compra não encontrada.');
  return transacao(async () => {
    const { rows } = await query('SELECT * FROM estoque_compras WHERE user_id = $1::uuid AND id = $2::uuid FOR UPDATE', [userId, id]);
    const c = rows[0];
    if (!c) throw erro('Compra não encontrada.');
    if (c.cancelada) return compraObj(c);
    for (const i of c.itens) {
      await movimentar(userId, { produtoId: i.produtoId, variacaoId: i.variacaoId || null, delta: -Number(i.qtd), tipo: 'cancelamento', ref: id, obs: 'Compra cancelada' });
    }
    await apagarLancamentos(userId, c.lancamento_ids);
    await query('UPDATE estoque_compras SET cancelada = true WHERE user_id = $1::uuid AND id = $2::uuid', [userId, id]);
    return compraPorId(userId, id);
  });
}

/* ------------------------------ Notas de gasto ------------------------------ */

async function registrarGasto(userId, d = {}, agora = new Date()) {
  const hoje = hojeBR(agora);
  const descricao = texto(d.descricao, 120);
  if (!descricao) throw erro('Descreva o gasto (ex.: conta de luz, embalagens).');
  const valor = Math.round(numero(d.valor, { min: 0.01, max: 1e8, nome: 'Valor' }) * 100) / 100;
  const data = dataOu(d.data, hoje);
  const categoria = texto(d.categoria, 40) || 'Outros';
  const meio = MEIOS_VENDA.includes(d.meio) && d.meio !== 'fiado' ? d.meio : 'dinheiro';
  const pago = d.pago !== false;
  const id = novoIdLancamento('g');
  await inserirLancamentos(userId, [{
    id, data, descricao, tipo: 'Despesa', categoria, forma: contaDoMeio(meio),
    status: !pago ? (data > hoje ? 'Agendado' : 'Pendente') : 'Pago', valor,
    extras: { estoque: { origem: 'gasto', meio, fornecedor: texto(d.fornecedor, 80) } },
  }]);
  return (await listarGastos(userId, id))[0];
}
async function listarGastos(userId, id = null, { de, ate, limite = 500 } = {}) {
  const ini = dataOu(de, '1900-01-01'); const fim = dataOu(ate, '2999-12-31');
  const { rows } = await query(
    `SELECT id, data, descricao, categoria, status, valor, extras FROM financeiro_lancamentos
      WHERE user_id = $1::uuid AND extras->'estoque'->>'origem' = 'gasto' AND data BETWEEN $2 AND $3 ${id ? 'AND id = $5' : ''}
      ORDER BY data DESC, created_at DESC LIMIT $4`, id ? [userId, ini, fim, 1, id] : [userId, ini, fim, Math.min(Math.max(1, Number(limite) || 500), 200000)]);
  return rows.map((r) => ({ id: r.id, data: r.data, descricao: r.descricao, categoria: r.categoria, status: r.status, valor: Number(r.valor), meio: r.extras.estoque.meio, fornecedor: r.extras.estoque.fornecedor || '' }));
}
async function excluirGasto(userId, id) {
  const r = await query(`DELETE FROM financeiro_lancamentos WHERE user_id = $1::uuid AND id = $2 AND extras->'estoque'->>'origem' = 'gasto' RETURNING id`, [userId, String(id || '')]);
  if (!r.rows.length) throw erro('Gasto não encontrado.');
}

/* ------------------------------ Resumo ------------------------------ */

async function resumo(userId, agora = new Date()) {
  const hoje = hojeBR(agora);
  const mes = hoje.slice(0, 7);
  const ini = `${mes}-01`;
  const v = await query(
    `SELECT data, total, cmv, taxa, acrescimo, itens FROM estoque_vendas WHERE user_id = $1::uuid AND NOT cancelada AND data >= $2 AND data <= $3`,
    [userId, ini, `${mes}-31`]);
  const somar = (lista) => lista.reduce((a, r) => ({ n: a.n + 1, total: a.total + Number(r.total), cmv: a.cmv + Number(r.cmv), taxa: a.taxa + Number(r.taxa) }), { n: 0, total: 0, cmv: 0, taxa: 0 });
  const doMes = somar(v.rows);
  const doDia = somar(v.rows.filter((r) => r.data === hoje));
  const ranking = new Map();
  for (const r of v.rows) for (const i of r.itens) {
    const k = i.nome; const x = ranking.get(k) || { nome: k, qtd: 0, total: 0 };
    x.qtd += Number(i.qtd); x.total += Number(i.qtd) * Number(i.unit); ranking.set(k, x);
  }
  const g = await query(
    `SELECT COALESCE(sum(valor), 0)::float AS total FROM financeiro_lancamentos WHERE user_id = $1::uuid AND extras->'estoque'->>'origem' IN ('gasto', 'compra') AND data >= $2 AND data <= $3`,
    [userId, ini, `${mes}-31`]);
  const produtos = await listarProdutos(userId);
  const alertas = [];
  for (const p of produtos) {
    if (!p.ativo || !p.controlaEstoque) continue;
    if (p.variacoes.length) { for (const x of p.variacoes) if (x.ativo && x.situacao !== 'ok') alertas.push({ produtoId: p.id, nome: nomeComVar(p.nome, x.nome), estoque: x.estoque, minimo: x.estoqueMinimo, situacao: x.situacao, unidade: p.unidade }); }
    else if (p.situacao !== 'ok') alertas.push({ produtoId: p.id, nome: p.nome, estoque: p.estoque, minimo: p.estoqueMinimo, situacao: p.situacao, unidade: p.unidade });
  }
  const valorEstoque = produtos.filter((p) => p.ativo && p.controlaEstoque).reduce((a, p) => a + (p.variacoes.length
    ? p.variacoes.reduce((b, x) => b + Math.max(0, x.estoque) * x.custoFinal, 0) : Math.max(0, p.estoque) * p.custo), 0);
  const pend = await query(`SELECT count(*)::int AS n FROM estoque_pedidos WHERE user_id = $1::uuid AND status = 'novo'`, [userId]);
  const r2 = (n) => Math.round(n * 100) / 100;
  return {
    hoje: { vendas: doDia.n, total: r2(doDia.total) },
    mes: { vendas: doMes.n, total: r2(doMes.total), cmv: r2(doMes.cmv), taxas: r2(doMes.taxa), lucroBruto: r2(doMes.total - doMes.cmv - doMes.taxa), gastos: r2(g.rows[0].total) },
    maisVendidos: [...ranking.values()].sort((a, b) => b.total - a.total).slice(0, 5).map((x) => ({ ...x, total: r2(x.total) })),
    alertas: alertas.sort((a, b) => (a.situacao === 'acabou' ? 0 : 1) - (b.situacao === 'acabou' ? 0 : 1)).slice(0, 30),
    valorEstoque: r2(valorEstoque), produtos: produtos.length, pedidosNovos: pend.rows[0].n,
  };
}

/* ------------------------------ Cardápio (restaurante) ------------------------------ */

// Negócio dono de um cardápio público. Roda como sistema (página sem login).
async function negocioPorSlug(slug) {
  const s = slugDe(slug);
  if (!s) return null;
  const { rows } = await query(
    `SELECT n.*, u.email FROM estoque_negocio n JOIN usuarios u ON u.id = n.user_id
      WHERE n.slug = $1 AND n.tipo = 'restaurante' AND n.cardapio_ativo`, [s]);
  return rows[0] || null;
}

function produtoPublico(p) {
  const esgotado = (x) => p.controlaEstoque && x <= 0;
  const variacoes = p.variacoes.filter((v) => v.ativo).map((v) => ({ id: v.id, nome: v.nome, preco: v.precoFinal, esgotado: esgotado(v.estoque) }));
  return {
    id: p.id, nome: p.nome, categoria: p.categoria || 'Cardápio', descricao: p.descricao, preco: p.preco, foto: p.foto, destaque: p.destaque,
    opcoes: p.opcoes, variacoes, esgotado: variacoes.length ? variacoes.every((v) => v.esgotado) : esgotado(p.estoque),
  };
}

async function cardapioPublico(row) {
  const n = negocioObj(row);
  const produtos = (await listarProdutos(row.user_id)).filter((p) => p.ativo && p.noCardapio).map(produtoPublico);
  const ordem = n.categorias || [];
  const cats = [...new Set(produtos.map((p) => p.categoria))].sort((a, b) => {
    const ia = ordem.indexOf(a); const ib = ordem.indexOf(b);
    return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib) || a.localeCompare(b, 'pt-BR');
  });
  return {
    nome: n.nome || 'Cardápio', frase: n.frase, cor: n.cor, horario: n.horario, slug: n.slug,
    aceitaRetirada: n.aceitaRetirada, aceitaEntrega: n.aceitaEntrega, taxaEntrega: n.taxaEntrega, pedidoMinimo: n.pedidoMinimo,
    categorias: cats, produtos,
    fidelidade: (() => { const f = F.programaDe(row.fidelidade); return f.modelo === 'cashback' ? { modelo: 'cashback', pct: f.cashbackPct, validadeDias: f.validadeDias }
      : f.modelo === 'selos' ? { modelo: 'selos', meta: f.selosMeta, premioTexto: f.premioTexto, premioValor: f.premioValor } : { modelo: 'nenhum' }; })(),
  };
}

const PAGAMENTOS_PEDIDO = { pix: 'Pix', dinheiro: 'Dinheiro', cartao: 'Cartão (na entrega/retirada)' };
const moeda = (n) => `R$ ${Number(n).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;

// O pedido do cliente: confere tudo com o cadastro (preço vem do servidor, nunca da página)
async function criarPedido(row, d = {}) {
  const userId = row.user_id;
  const n = negocioObj(row);
  const tipo = d.tipo === 'entrega' ? 'entrega' : 'retirada';
  if (tipo === 'entrega' && !n.aceitaEntrega) throw erro('Este restaurante não está fazendo entregas.');
  if (tipo === 'retirada' && !n.aceitaRetirada) throw erro('Este restaurante não está aceitando retirada.');
  const nome = texto(d.nome, 60);
  if (!nome) throw erro('Informe seu nome.');
  const tel = String(d.telefone || '').replace(/\D/g, '').slice(0, 13);
  const endereco = tipo === 'entrega' ? texto(d.endereco, 200) : '';
  if (tipo === 'entrega' && endereco.length < 5) throw erro('Informe o endereço de entrega.');
  const pagamento = PAGAMENTOS_PEDIDO[d.pagamento] ? d.pagamento : 'pix';
  const troco = pagamento === 'dinheiro' ? texto(d.troco, 30) : '';
  if (!Array.isArray(d.itens) || !d.itens.length) throw erro('Seu carrinho está vazio.');
  if (d.itens.length > 50) throw erro('Itens demais num pedido só.');
  const ids = [...new Set(d.itens.map((i) => i && i.produtoId).filter(ehUuid))];
  const porId = new Map((ids.length ? await listarProdutos(userId, { ids }) : []).map((p) => [p.id, p]));
  const itens = d.itens.map((i) => {
    const p = porId.get(i && i.produtoId);
    if (!p || !p.ativo || !p.noCardapio) throw erro('Um item do carrinho não está mais disponível. Atualize a página.');
    const qtd = Math.round(numero(i.qtd, { min: 1, max: 50, nome: 'Quantidade' }));
    let v = null;
    if (p.variacoes.filter((x) => x.ativo).length) {
      v = p.variacoes.find((x) => x.id === i.variacaoId && x.ativo);
      if (!v) throw erro(`Escolha o tamanho/tipo de “${p.nome}”.`);
    }
    const disponivel = v ? v.estoque : p.estoque;
    if (p.controlaEstoque && disponivel < qtd) throw erro(`“${v ? nomeComVar(p.nome, v.nome) : p.nome}” esgotou ou não tem essa quantidade.`);
    let unit = v ? v.precoFinal : p.preco;
    const escolhidos = [];
    const sel = i.opcoes && typeof i.opcoes === 'object' ? i.opcoes : {};
    (p.opcoes || []).forEach((g, gi) => {
      const marcados = (Array.isArray(sel[gi]) ? sel[gi] : []).map(Number).filter((x) => Number.isInteger(x) && g.escolhas[x]);
      const unicos = [...new Set(marcados)];
      if (g.tipo === 'um' && unicos.length !== 1) throw erro(`Escolha uma opção em “${g.nome}” (${p.nome}).`);
      for (const x of unicos) { unit += g.escolhas[x].preco; escolhidos.push(g.escolhas[x].nome); }
    });
    const obs = texto(i.obs, 120);
    if (obs) escolhidos.push(`obs: ${obs}`);
    return { produtoId: p.id, variacaoId: v ? v.id : null, nome: v ? nomeComVar(p.nome, v.nome) : p.nome, qtd, unit: Math.round(unit * 100) / 100, opcoes: escolhidos };
  });
  const subC = itens.reduce((a, i) => a + Math.round(i.qtd * i.unit * 100), 0);
  if (n.pedidoMinimo && subC < centavos(n.pedidoMinimo)) throw erro(`O pedido mínimo é ${moeda(n.pedidoMinimo)}.`);
  const taxaC = tipo === 'entrega' ? centavos(n.taxaEntrega) : 0;
  const totalC = subC + taxaC;
  const obsGeral = texto(d.obs, 300);
  const programa = F.programaDe(row.fidelidade);
  const querBeneficio = !!d.usarBeneficio && programa.modelo !== 'nenhum';

  const pedido = await transacao(async () => {
    const num = await proximoNumero(userId, 'seq_pedido');
    // histórico do cliente: acha pelo telefone (ou cadastra); participa só se marcou a caixinha
    const clienteId = await F.clienteDoPedido(userId, { nome, telefone: tel, endereco, participar: !!d.participar && programa.modelo !== 'nenhum' });
    const r = await query(
      `INSERT INTO estoque_pedidos (user_id, numero, tipo, cliente_nome, cliente_tel, endereco, pagamento, obs, itens, subtotal, taxa_entrega, total, cliente_id, quer_beneficio)
       VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12, $13::uuid, $14) RETURNING id, numero`,
      [userId, num, tipo, nome, tel, endereco, pagamento + (troco ? `|${troco}` : ''), obsGeral, JSON.stringify(itens), reais(subC), reais(taxaC), reais(totalC), clienteId, querBeneficio]);
    return r.rows[0];
  });
  // Mensagem pronta para o WhatsApp do restaurante
  const linhas = [
    `*Pedido #${String(pedido.numero).padStart(3, '0')}* — ${n.nome || 'cardápio'}`,
    '',
    ...itens.map((i) => `${i.qtd}x ${i.nome} — ${moeda(i.qtd * i.unit)}${i.opcoes.length ? `\n   _${i.opcoes.join(', ')}_` : ''}`),
    '',
    `Subtotal: ${moeda(reais(subC))}`,
    ...(taxaC ? [`Entrega: ${moeda(reais(taxaC))}`] : []),
    `*Total: ${moeda(reais(totalC))}*`,
    '',
    `${tipo === 'entrega' ? '🛵 Entrega' : '🏃 Retirada'} · ${nome}${tel ? ` · ${tel}` : ''}`,
    ...(endereco ? [`Endereço: ${endereco}`] : []),
    `Pagamento: ${PAGAMENTOS_PEDIDO[pagamento]}${troco ? ` (troco para ${troco})` : ''}`,
    ...(obsGeral ? [`Obs.: ${obsGeral}`] : []),
    ...(querBeneficio ? [programa.modelo === 'cashback' ? '🎁 Quero usar meu cashback neste pedido' : '🎁 Quero usar meu prêmio do cartão fidelidade'] : []),
  ];
  const mensagem = linhas.join('\n');
  return { numero: pedido.numero, total: reais(totalC), mensagem, whatsapp: `https://wa.me/${n.whatsapp.length <= 11 ? `55${n.whatsapp}` : n.whatsapp}?text=${encodeURIComponent(mensagem)}` };
}

// Página do cardápio: o cliente digita o telefone e vê o que tem no programa (sem dados pessoais)
async function beneficioPublico(row, telefone, agora = new Date()) {
  const programa = F.programaDe(row.fidelidade);
  const resposta = { modelo: programa.modelo };
  if (programa.modelo === 'nenhum') return resposta;
  if (programa.modelo === 'cashback') Object.assign(resposta, { pct: programa.cashbackPct, minimoUso: programa.minimoUso });
  else Object.assign(resposta, { meta: programa.selosMeta, premioTexto: programa.premioTexto, premioValor: programa.premioValor, selosMinimo: programa.selosMinimo });
  const c = await F.clientePorTelefone(row.user_id, telefone);
  if (!c || !c.participa) return { ...resposta, participa: false };
  const b = await F.beneficioDe(row.user_id, c, programa, hojeBR(agora));
  return { ...resposta, participa: true, saldo: b.saldo, selos: b.selos, podePremio: b.podePremio };
}

function pedidoObj(r) {
  const [pag, troco] = String(r.pagamento || '').split('|');
  return {
    id: r.id, numero: r.numero, tipo: r.tipo, clienteNome: r.cliente_nome, clienteTel: r.cliente_tel, endereco: r.endereco,
    pagamento: pag, troco: troco || '', obs: r.obs, itens: r.itens, subtotal: Number(r.subtotal), taxaEntrega: Number(r.taxa_entrega), total: Number(r.total),
    status: r.status, vendaId: r.venda_id, criadoEm: r.criado_em, clienteId: r.cliente_id, querBeneficio: !!r.quer_beneficio, cozinhaId: r.cozinha_id || null,
  };
}
async function listarPedidos(userId) {
  const { rows } = await query(
    `(SELECT * FROM estoque_pedidos WHERE user_id = $1::uuid AND status = 'novo' ORDER BY criado_em DESC LIMIT 200)
     UNION ALL
     (SELECT * FROM estoque_pedidos WHERE user_id = $1::uuid AND status <> 'novo' ORDER BY criado_em DESC LIMIT 60)`, [userId]);
  return rows.map(pedidoObj);
}
async function recusarPedido(userId, id) {
  if (!ehUuid(id)) throw erro('Pedido não encontrado.');
  const r = await query(`UPDATE estoque_pedidos SET status = 'recusado' WHERE user_id = $1::uuid AND id = $2::uuid AND status = 'novo' RETURNING *`, [userId, id]);
  if (!r.rows.length) throw erro('Esse pedido já foi resolvido.');
  // se já tinha ido para a cozinha, sai da tela
  await query(`UPDATE estoque_cozinha SET status = 'entregue', entregue_em = now() WHERE user_id = $1::uuid AND pedido_id = $2::uuid AND status <> 'entregue'`, [userId, id]);
  return pedidoObj(r.rows[0]);
}
// Pedido confirmado vira venda (baixa no estoque + receita no financeiro)
async function venderPedido(userId, id, d = {}, agora = new Date()) {
  if (!ehUuid(id)) throw erro('Pedido não encontrado.');
  return transacao(async () => {
    const { rows } = await query('SELECT * FROM estoque_pedidos WHERE user_id = $1::uuid AND id = $2::uuid FOR UPDATE', [userId, id]);
    const p = rows[0];
    if (!p) throw erro('Pedido não encontrado.');
    if (p.status !== 'novo') throw erro('Esse pedido já foi resolvido.');
    const [pag] = String(p.pagamento || '').split('|');
    const meio = MEIOS_VENDA.includes(d.meio) ? d.meio : (pag === 'cartao' ? 'credito' : pag === 'dinheiro' ? 'dinheiro' : 'pix');
    // produto apagado depois do pedido: entra como item avulso com o mesmo preço
    const existentes = new Set((await query('SELECT id FROM estoque_produtos WHERE user_id = $1::uuid AND id = ANY($2::uuid[])',
      [userId, p.itens.map((i) => i.produtoId).filter(ehUuid)])).rows.map((r) => r.id));
    const itens = p.itens.map((i) => (existentes.has(i.produtoId)
      ? { produtoId: i.produtoId, variacaoId: i.variacaoId, qtd: i.qtd, unit: i.unit, opcoes: i.opcoes }
      : { nome: i.nome, qtd: i.qtd, unit: i.unit, opcoes: i.opcoes }));
    const r = await registrarVenda(userId, { itens, meio, acrescimo: Number(p.taxa_entrega), cliente: p.cliente_nome, obs: p.obs, pedidoId: id,
      clienteId: p.cliente_id || undefined, usarCashback: d.usarCashback, usarPremio: d.usarPremio }, agora);
    await query(`UPDATE estoque_pedidos SET status = 'vendido', venda_id = $3::uuid WHERE user_id = $1::uuid AND id = $2::uuid`, [userId, id, r.venda.id]);
    return r;
  });
}

module.exports = {
  ErroEstoque, TIPOS_NEGOCIO, UNIDADES, MEIOS_VENDA, NOME_MEIO, nomeComVar,
  slugDe, lerNegocio, salvarNegocio, marcarChecklist,
  listarProdutos, produtoPorId, salvarProduto, excluirProduto, salvarFoto, ajustarEstoque, movimentosDe,
  registrarVenda, listarVendas, cancelarVenda, vendaPorId, vendaObj,
  registrarCompra, listarCompras, cancelarCompra,
  registrarGasto, listarGastos, excluirGasto,
  resumo, negocioPorSlug, cardapioPublico, criarPedido, listarPedidos, recusarPedido, venderPedido, beneficioPublico,
};
