/* Regras do Controle financeiro no servidor: quais seções existem e o que cada uma aceita. */

const SECOES_LISTA = ['transacoes', 'cartoes', 'investimentos', 'objetivos'];
const SECOES_OBJETO = ['perfil', 'config'];
const SECOES = [...SECOES_LISTA, ...SECOES_OBJETO];

const MAX_ITENS = 20000; // por lista — bem acima do uso normal, só pra barrar abuso
const MAX_BYTES_SECAO = 2 * 1024 * 1024; // 2 MB por seção (a foto do perfil já vem reduzida)
const MODOS_INTEGRACAO = ['vendas', 'comissoes', 'nenhum'];

const ehObjetoSimples = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// Confere se o valor enviado pra uma seção tem o formato certo.
// Devolve { ok: true, valor } (já normalizado) ou { ok: false, erro }.
function validarSecao(secao, valor) {
  if (!SECOES.includes(secao)) return { ok: false, erro: 'Seção desconhecida.' };

  let tamanho = 0;
  try { tamanho = Buffer.byteLength(JSON.stringify(valor === undefined ? null : valor)); } catch (e) { return { ok: false, erro: 'Dados inválidos.' }; }
  if (tamanho > MAX_BYTES_SECAO) return { ok: false, erro: 'Dados grandes demais para salvar.' };

  if (SECOES_LISTA.includes(secao)) {
    if (!Array.isArray(valor)) return { ok: false, erro: 'Era esperada uma lista.' };
    if (valor.length > MAX_ITENS) return { ok: false, erro: 'Itens demais nessa lista.' };
    if (!valor.every(ehObjetoSimples)) return { ok: false, erro: 'Cada item da lista precisa ser um objeto.' };
    return { ok: true, valor };
  }

  if (secao === 'perfil') {
    if (valor === null) return { ok: true, valor: null };
    if (!ehObjetoSimples(valor)) return { ok: false, erro: 'Perfil inválido.' };
    if (valor.photo != null && !(typeof valor.photo === 'string' && /^data:image\/(png|jpeg|jpg|webp|gif);base64,/.test(valor.photo))) {
      return { ok: false, erro: 'Foto inválida.' };
    }
    if (valor.characterName != null && !(typeof valor.characterName === 'string' && valor.characterName.length <= 40)) {
      return { ok: false, erro: 'Nome do personagem inválido.' };
    }
    return { ok: true, valor };
  }

  // config
  if (!ehObjetoSimples(valor)) return { ok: false, erro: 'Configuração inválida.' };
  if (valor.integracaoCrm !== undefined && !MODOS_INTEGRACAO.includes(valor.integracaoCrm)) {
    return { ok: false, erro: 'Modo de integração inválido.' };
  }
  return { ok: true, valor };
}

// Formato devolvido pro front-end, mesmo quando o usuário ainda não salvou nada.
function dadosPadrao() {
  return { transacoes: [], cartoes: [], investimentos: [], objetivos: [], perfil: null, config: {} };
}

function serializar(doc) {
  const base = dadosPadrao();
  if (!doc) return base;
  for (const s of SECOES) if (doc[s] !== undefined) base[s] = doc[s];
  if (base.config === null) base.config = {};
  return base;
}

module.exports = { SECOES, SECOES_LISTA, SECOES_OBJETO, MODOS_INTEGRACAO, validarSecao, dadosPadrao, serializar };

/* ------------------------------------------------------------------ */
/* Gravação no PostgreSQL: cada lista vira linhas de uma tabela própria */
/* (financeiro_lancamentos, _cartoes, _investimentos, _objetivos) e o   */
/* perfil/config ficam em financeiro_perfis. Dinheiro em numeric(14,2). */
/* ------------------------------------------------------------------ */
const { query, transacao } = require('../db/pool');

const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;
const dataOuNull = (v) => (typeof v === 'string' && DATA_RE.test(v) ? v : null);
const dinheiro = (v) => { const n = Number(v); return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0; };
const inteiroOuNull = (v) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : null; };
const texto = (v) => (v === null || v === undefined ? '' : String(v));
const umDe = (v, opcoes, padrao) => (opcoes.includes(v) ? v : padrao);

// Para cada lista: tabela, colunas (com o campo do front-end que vai em cada uma) e conversões
const TABELAS = {
  transacoes: {
    tabela: 'financeiro_lancamentos',
    colunas: [
      ['data', 'date', (i) => dataOuNull(i.date), (v) => v || ''],
      ['descricao', 'desc', (i) => texto(i.desc)],
      ['tipo', 'type', (i) => umDe(i.type, ['Receita', 'Despesa'], 'Despesa')],
      ['categoria', 'category', (i) => texto(i.category)],
      ['escopo', 'scope', (i) => umDe(i.scope, ['Pessoal', 'Empresa'], 'Pessoal')],
      ['forma', 'account', (i) => texto(i.account)],
      ['status', 'status', (i) => texto(i.status) || 'Pago'],
      ['valor', 'value', (i) => dinheiro(i.value)],
      ['recorrencia', 'recurrence', (i) => umDe(i.recurrence, ['unico', 'fixo', 'parcelado'], 'unico')],
      ['parcelas', 'parcelas', (i) => inteiroOuNull(i.parcelas)],
    ],
  },
  cartoes: {
    tabela: 'financeiro_cartoes',
    colunas: [
      ['nome', 'name', (i) => texto(i.name)],
      ['limite', 'limit', (i) => dinheiro(i.limit)],
      ['dia_vencimento', 'dueDay', (i) => inteiroOuNull(i.dueDay)],
      ['melhor_dia', 'bestDay', (i) => inteiroOuNull(i.bestDay)],
    ],
  },
  investimentos: {
    tabela: 'financeiro_investimentos',
    colunas: [
      ['nome', 'name', (i) => texto(i.name)],
      ['tipo', 'type', (i) => texto(i.type)],
      ['escopo', 'scope', (i) => umDe(i.scope, ['Pessoal', 'Empresa'], 'Pessoal')],
      ['instituicao', 'institution', (i) => texto(i.institution)],
      ['data', 'date', (i) => dataOuNull(i.date), (v) => v || ''],
      ['aplicado', 'applied', (i) => dinheiro(i.applied)],
      ['atual', 'current', (i) => dinheiro(i.current)],
    ],
  },
  objetivos: {
    tabela: 'financeiro_objetivos',
    colunas: [
      ['nome', 'name', (i) => texto(i.name)],
      ['escopo', 'scope', (i) => umDe(i.scope, ['Pessoal', 'Empresa'], 'Pessoal')],
      ['meta', 'target', (i) => dinheiro(i.target)],
      ['atual', 'current', (i) => dinheiro(i.current)],
      ['prazo', 'deadline', (i) => dataOuNull(i.deadline), (v) => v || ''],
    ],
  },
};

// Linha do banco -> objeto do jeito que o front-end do financeiro usa
function linhaParaItem(def, linha) {
  const item = { ...(linha.extras || {}), id: linha.id };
  for (const [col, campo, , saida] of def.colunas) {
    const v = linha[col];
    item[campo] = saida ? saida(v) : v;
  }
  return item;
}

// Objeto do front-end -> valores das colunas + "extras" (campos que não têm coluna própria)
function itemParaValores(def, item) {
  const conhecidos = new Set(['id', ...def.colunas.map((c) => c[1])]);
  const extras = {};
  for (const [k, v] of Object.entries(item)) if (!conhecidos.has(k)) extras[k] = v;
  return { valores: def.colunas.map(([, , entrada]) => entrada(item)), extras };
}

// Lê tudo do Controle financeiro de um usuário
async function carregarFinanceiro(userId) {
  const dados = dadosPadrao();
  for (const [secao, def] of Object.entries(TABELAS)) {
    const { rows } = await query(`SELECT * FROM ${def.tabela} WHERE user_id = $1::uuid ORDER BY posicao, created_at`, [userId]);
    dados[secao] = rows.map((r) => linhaParaItem(def, r));
  }
  const { rows } = await query('SELECT perfil, config FROM financeiro_perfis WHERE user_id = $1::uuid', [userId]);
  if (rows[0]) {
    dados.perfil = rows[0].perfil || null;
    dados.config = rows[0].config || {};
  }
  return dados;
}

// Substitui uma seção inteira (já validada por validarSecao), numa transação só
async function salvarSecaoFinanceiro(userId, secao, valor) {
  if (SECOES_OBJETO.includes(secao)) {
    await query(
      `INSERT INTO financeiro_perfis (user_id, ${secao}) VALUES ($1::uuid, $2::jsonb)
       ON CONFLICT (user_id) DO UPDATE SET ${secao} = EXCLUDED.${secao}, updated_at = now()`,
      [userId, JSON.stringify(valor === undefined ? null : (secao === 'config' && !valor ? {} : valor))]
    );
    return;
  }
  const def = TABELAS[secao];
  // ids repetidos: fica o último (é o que o front-end teria mostrado por último)
  const porId = new Map();
  valor.forEach((item, posicao) => {
    const id = texto(item.id).slice(0, 100) || `sem-id-${posicao}`;
    porId.set(id, { item: { ...item, id }, posicao });
  });
  await transacao(async () => {
    const ids = [...porId.keys()];
    await query(`DELETE FROM ${def.tabela} WHERE user_id = $1::uuid AND NOT (id = ANY($2::text[]))`, [userId, ids]);
    const nomesCols = def.colunas.map((c) => c[0]);
    const lista = [...porId.values()];
    const LOTE = 300;
    for (let i = 0; i < lista.length; i += LOTE) {
      const params = [];
      const linhas = lista.slice(i, i + LOTE).map(({ item, posicao }) => {
        const { valores, extras } = itemParaValores(def, item);
        const base = [userId, item.id, posicao, ...valores, JSON.stringify(extras)];
        const ph = base.map((v, k) => {
          params.push(v);
          if (k === 0) return `$${params.length}::uuid`;
          if (k === base.length - 1) return `$${params.length}::jsonb`;
          return `$${params.length}`;
        });
        return `(${ph.join(', ')})`;
      });
      const cols = ['user_id', 'id', 'posicao', ...nomesCols, 'extras'];
      const atualiza = cols.filter((c) => c !== 'user_id' && c !== 'id').map((c) => `${c} = EXCLUDED.${c}`);
      await query(
        `INSERT INTO ${def.tabela} (${cols.join(', ')}) VALUES ${linhas.join(', ')}
         ON CONFLICT (user_id, id) DO UPDATE SET ${atualiza.join(', ')}, updated_at = now()`,
        params
      );
    }
  });
}

module.exports.carregarFinanceiro = carregarFinanceiro;
module.exports.salvarSecaoFinanceiro = salvarSecaoFinanceiro;
module.exports.TABELAS = TABELAS;
