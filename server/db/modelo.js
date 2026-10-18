/* Modelos sobre o PostgreSQL com a mesma "cara" que o código já usava (find, findOne,
   findOneAndUpdate, save...). Cada modelo declara seus campos com tipo de verdade (uuid,
   numeric pra dinheiro, timestamptz, arrays, jsonb) e vira uma tabela relacional. Assim as
   rotas continuam praticamente iguais e o banco ganha tipos, chaves e segurança por linha.

   O que este arquivo cobre (é o que o sistema usa):
   - filtros: igualdade, $in, $nin, $ne, $gt, $gte, $lt, $lte, $exists, $regex, $or, $and,
     caminhos com ponto ("whatsappBusiness.webhookToken");
   - atualizações: campos diretos, $set, $inc, $addToSet, $push, $pull, $unset, upsert;
   - consultas: sort, select, limit, skip, lean, populate. */
const { query } = require('./pool');
const { novoId, normalizarId } = require('./ids');

const registro = new Map();

class ErroDeValidacao extends Error {
  constructor(mensagem, caminho) {
    super(mensagem);
    this.name = 'ValidationError';
    this.caminho = caminho;
  }
}

const snake = (s) => s.replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/([A-Z])([A-Z][a-z])/g, '$1_$2').toLowerCase();
const ehObjetoSimples = (v) => v !== null && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date);
const CAST = {
  id: 'uuid', 'id[]': 'uuid[]', string: 'text', 'string[]': 'text[]', 'int[]': 'int[]',
  json: 'jsonb', date: 'timestamptz', number: 'float8', money: 'numeric', int: 'int', boolean: 'boolean',
};
const TIPOS_ARRAY = new Set(['id[]', 'string[]', 'int[]']);

function aplicarPadrao(folha) {
  if (folha.default === undefined) return TIPOS_ARRAY.has(folha.type) ? [] : null;
  return typeof folha.default === 'function' ? folha.default() : (ehObjetoSimples(folha.default) ? { ...folha.default } : folha.default);
}

// Campo com valor padrão é NOT NULL no banco. Quando a rota manda null (ex.: campo de
// texto vazio que vira null), grava o padrão em vez de quebrar a gravação — o MongoDB
// aceitava null nesses campos. Datas e textos gerados por função (ex.: colunaDesde)
// ficam de fora: neles null pode ser intencional.
function nuloViraPadrao(folha, v) {
  if (v !== null || folha.default === undefined || folha.default === null) return v;
  if (typeof folha.default === 'function' && folha.type !== 'json' && !TIPOS_ARRAY.has(folha.type)) return v;
  return aplicarPadrao(folha);
}

function getCaminho(obj, caminho) {
  const partes = caminho.split('.');
  let atual = obj;
  for (const p of partes) {
    if (atual === null || atual === undefined) return undefined;
    atual = atual[p];
  }
  return atual;
}
function setCaminho(obj, caminho, valor) {
  const partes = caminho.split('.');
  let atual = obj;
  for (let i = 0; i < partes.length - 1; i++) {
    if (!ehObjetoSimples(atual[partes[i]])) atual[partes[i]] = {};
    atual = atual[partes[i]];
  }
  atual[partes[partes.length - 1]] = valor;
}

// Converte e valida um valor pro tipo do campo (o que o Mongoose fazia sozinho)
function converter(folha, v) {
  if (v === undefined) return undefined;
  if (v === null) return null;
  switch (folha.type) {
    case 'id': {
      const id = normalizarId(v);
      if (!id) throw new ErroDeValidacao(`Identificador inválido em "${folha.caminho}".`, folha.caminho);
      return id;
    }
    case 'id[]':
      if (!Array.isArray(v)) v = [v];
      return v.map((x) => normalizarId(x)).filter(Boolean);
    case 'string': {
      if (typeof v === 'object') v = String(v._id || v);
      let s = String(v);
      if (folha.trim) s = s.trim();
      if (folha.lowercase) s = s.toLowerCase();
      return s;
    }
    case 'string[]':
      if (!Array.isArray(v)) v = [v];
      return v.filter((x) => x !== null && x !== undefined).map((x) => String(x));
    case 'int[]':
      if (!Array.isArray(v)) v = [v];
      return v.map((x) => parseInt(x, 10)).filter((x) => Number.isFinite(x));
    case 'number': case 'money': case 'int': {
      if (v === '') return null;
      const n = Number(v);
      if (!Number.isFinite(n)) throw new ErroDeValidacao(`Número inválido em "${folha.caminho}".`, folha.caminho);
      if (folha.type === 'int') return Math.trunc(n);
      if (folha.type === 'money') return Math.round(n * 100) / 100;
      return n;
    }
    case 'boolean':
      if (v === 'false' || v === '0' || v === 0) return false;
      return !!v;
    case 'date': {
      const d = v instanceof Date ? v : new Date(v);
      if (Number.isNaN(d.getTime())) throw new ErroDeValidacao(`Data inválida em "${folha.caminho}".`, folha.caminho);
      return d;
    }
    case 'json':
      return v;
    default:
      return v;
  }
}

function validar(folha, v, { exigirObrigatorio }) {
  if ((v === null || v === undefined || v === '') && folha.required && exigirObrigatorio) {
    throw new ErroDeValidacao(`O campo "${folha.caminho}" é obrigatório.`, folha.caminho);
  }
  if (v === null || v === undefined) return;
  if (folha.enum && !folha.enum.includes(v)) {
    throw new ErroDeValidacao(`Valor inválido em "${folha.caminho}".`, folha.caminho);
  }
  if (typeof v === 'number') {
    if (folha.min !== undefined && v < folha.min) throw new ErroDeValidacao(`"${folha.caminho}" abaixo do mínimo.`, folha.caminho);
    if (folha.max !== undefined && v > folha.max) throw new ErroDeValidacao(`"${folha.caminho}" acima do máximo.`, folha.caminho);
  }
  if (folha.validate && !folha.validate(v)) throw new ErroDeValidacao(`Valor inválido em "${folha.caminho}".`, folha.caminho);
}

class Parametros {
  constructor() { this.valores = []; }
  add(valor, cast) {
    this.valores.push(valor);
    return `$${this.valores.length}${cast ? `::${cast}` : ''}`;
  }
}

function paraParametro(folha, v) {
  if (v === null || v === undefined) return null;
  if (folha.type === 'json') return JSON.stringify(v);
  return v;
}

function serializar(folha, v) {
  if (v === undefined) v = null;
  if (v instanceof Date) return `D:${v.getTime()}`;
  try { return JSON.stringify(v); } catch (e) { return String(v); }
}

/* ------------------------------------------------------------------ */
/* Definição do modelo                                                 */
/* ------------------------------------------------------------------ */
function definirModelo(nome, definicao) {
  const tabela = definicao.tabela;
  const timestamps = definicao.timestamps !== false;
  const folhas = [];
  const grupos = new Map();
  const add = (caminho, spec, coluna) => {
    const folha = { ...spec, caminho, coluna: coluna || snake(caminho) };
    folhas.push(folha);
    return folha;
  };
  add('_id', { type: 'id' }, 'id');
  for (const [nomeCampo, spec] of Object.entries(definicao.campos)) {
    if (spec.type === 'group') {
      const filhos = [];
      for (const [sub, subSpec] of Object.entries(spec.campos)) {
        filhos.push(add(`${nomeCampo}.${sub}`, subSpec, `${snake(nomeCampo)}_${snake(sub)}`));
      }
      grupos.set(nomeCampo, filhos);
    } else {
      add(nomeCampo, spec);
    }
  }
  if (timestamps) {
    add('createdAt', { type: 'date' }, 'created_at');
    add('updatedAt', { type: 'date' }, 'updated_at');
  }
  const porCaminho = new Map(folhas.map((f) => [f.caminho, f]));
  const porColuna = new Map(folhas.map((f) => [f.coluna, f]));
  const editaveis = folhas.filter((f) => !['_id', 'createdAt', 'updatedAt'].includes(f.caminho));

  /* ---------- resolução de caminhos ---------- */
  function resolver(caminho) {
    if (caminho === 'id') caminho = '_id';
    if (porCaminho.has(caminho)) return { folha: porCaminho.get(caminho), expr: `"${porCaminho.get(caminho).coluna}"` };
    // caminho dentro de um campo json: "acaoParams.colunaDestinoId"
    const partes = caminho.split('.');
    for (let i = partes.length - 1; i > 0; i--) {
      const base = partes.slice(0, i).join('.');
      const folha = porCaminho.get(base);
      if (folha && folha.type === 'json') {
        const resto = partes.slice(i).map((p) => p.replace(/[^A-Za-z0-9_]/g, ''));
        return { folha, json: true, resto, expr: `("${folha.coluna}" #> '{${resto.join(',')}}')` };
      }
    }
    throw new Error(`Campo desconhecido "${caminho}" no modelo ${nome}.`);
  }

  /* ---------- filtros ---------- */
  function condicaoJson(r, op, v, p) {
    const lit = (x) => p.add(JSON.stringify(x), 'jsonb');
    if (op === '$eq') return v === null || v === undefined ? `(${r.expr} IS NULL OR ${r.expr} = 'null'::jsonb)` : `${r.expr} = ${lit(v)}`;
    if (op === '$ne') return v === null || v === undefined ? `(${r.expr} IS NOT NULL AND ${r.expr} <> 'null'::jsonb)` : `(${r.expr} IS NULL OR ${r.expr} <> ${lit(v)})`;
    if (op === '$in') return v.length ? `(${v.map((x) => `${r.expr} = ${lit(x)}`).join(' OR ')})` : 'FALSE';
    if (op === '$exists') return v ? `${r.expr} IS NOT NULL` : `${r.expr} IS NULL`;
    throw new Error(`Operador ${op} não suportado em campo json.`);
  }

  function condicao(caminho, op, v, p) {
    const r = resolver(caminho);
    if (r.json) return condicaoJson(r, op, v, p);
    const f = r.folha;
    const col = r.expr;
    const ehArray = TIPOS_ARRAY.has(f.type);
    const tipoBase = ehArray ? CAST[f.type].replace('[]', '') : CAST[f.type];
    const conv = (x) => {
      if (f.type === 'id' || f.type === 'id[]') return normalizarId(x);
      if (f.type === 'date') return x instanceof Date ? x : new Date(x);
      if (f.type === 'json') return JSON.stringify(x);
      if (f.type === 'boolean') return !!x;
      return x;
    };
    if (v instanceof RegExp && op === '$eq') return condicao(caminho, '$regex', v, p);
    switch (op) {
      case '$eq': {
        if (v === null || v === undefined) return `${col} IS NULL`;
        if (Array.isArray(v) && !ehArray) return condicao(caminho, '$in', v, p);
        const c = conv(v);
        if ((f.type === 'id' || f.type === 'id[]') && !c) return 'FALSE';
        if (ehArray) return Array.isArray(v) ? `${col} = ${p.add(v.map(conv), CAST[f.type])}` : `${p.add(c, tipoBase)} = ANY(${col})`;
        return `${col} = ${p.add(c, tipoBase)}`;
      }
      case '$ne': {
        if (v === null || v === undefined) return `${col} IS NOT NULL`;
        const c = conv(v);
        if ((f.type === 'id' || f.type === 'id[]') && !c) return 'TRUE';
        if (ehArray) return `NOT (${p.add(c, tipoBase)} = ANY(COALESCE(${col}, '{}')))`;
        return `${col} IS DISTINCT FROM ${p.add(c, tipoBase)}`;
      }
      case '$in': case '$nin': {
        const lista = Array.isArray(v) ? v : [v];
        const temNulo = lista.some((x) => x === null || x === undefined);
        const valores = lista.filter((x) => x !== null && x !== undefined).map(conv).filter((x) => x !== null && x !== undefined);
        let expr;
        if (ehArray) expr = valores.length ? `${col} && ${p.add(valores, CAST[f.type])}` : 'FALSE';
        else expr = valores.length ? `${col} = ANY(${p.add(valores, `${tipoBase}[]`)})` : 'FALSE';
        if (temNulo) expr = `(${expr} OR ${col} IS NULL)`;
        return op === '$in' ? expr : `NOT COALESCE(${expr}, FALSE)`;
      }
      case '$gt': case '$gte': case '$lt': case '$lte': {
        const sinal = { $gt: '>', $gte: '>=', $lt: '<', $lte: '<=' }[op];
        return `${col} ${sinal} ${p.add(conv(v), tipoBase)}`;
      }
      case '$exists':
        return v ? `${col} IS NOT NULL` : `${col} IS NULL`;
      case '$regex': {
        let padrao = v;
        let flags = '';
        if (v instanceof RegExp) { padrao = v.source; flags = v.flags; }
        return `${col} ${String(flags).includes('i') ? '~*' : '~'} ${p.add(String(padrao), 'text')}`;
      }
      default:
        throw new Error(`Operador ${op} não suportado.`);
    }
  }

  function compilarFiltro(filtro, p) {
    if (!filtro || !Object.keys(filtro).length) return 'TRUE';
    const partes = [];
    for (const [chave, valor] of Object.entries(filtro)) {
      if (valor === undefined) continue;
      if (chave === '$or' || chave === '$and' || chave === '$nor') {
        const subs = (valor || []).map((sub) => `(${compilarFiltro(sub, p)})`);
        if (!subs.length) { partes.push(chave === '$or' ? 'FALSE' : 'TRUE'); continue; }
        if (chave === '$nor') partes.push(`NOT (${subs.join(' OR ')})`);
        else partes.push(`(${subs.join(chave === '$or' ? ' OR ' : ' AND ')})`);
        continue;
      }
      if (ehObjetoSimples(valor) && Object.keys(valor).some((k) => k.startsWith('$'))) {
        const opcoes = valor.$options;
        for (const [op, v] of Object.entries(valor)) {
          if (op === '$options') continue;
          if (op === '$regex') partes.push(condicao(chave, '$regex', opcoes ? new RegExp(String(v), opcoes.replace(/[^imsu]/g, '')) : v, p));
          else partes.push(condicao(chave, op, v, p));
        }
      } else {
        partes.push(condicao(chave, '$eq', valor, p));
      }
    }
    return partes.length ? partes.join(' AND ') : 'TRUE';
  }

  function compilarOrdem(ordem) {
    if (!ordem) return '';
    let pares = [];
    if (typeof ordem === 'string') {
      pares = ordem.split(/\s+/).filter(Boolean).map((s) => (s.startsWith('-') ? [s.slice(1), -1] : [s, 1]));
    } else {
      pares = Object.entries(ordem).map(([k, v]) => [k, v === -1 || v === 'desc' || v === 'descending' ? -1 : 1]);
    }
    if (!pares.length) return '';
    return ` ORDER BY ${pares.map(([k, d]) => `${resolver(k).expr} ${d === -1 ? 'DESC NULLS LAST' : 'ASC NULLS FIRST'}`).join(', ')}`;
  }

  function folhasDaProjecao(projecao) {
    if (!projecao) return null;
    let incluir = [];
    let excluir = [];
    if (typeof projecao === 'string') {
      for (const s of projecao.split(/\s+/).filter(Boolean)) (s.startsWith('-') ? excluir : incluir).push(s.replace(/^[-+]/, ''));
    } else {
      for (const [k, v] of Object.entries(projecao)) (v ? incluir : excluir).push(k);
    }
    const expandir = (lista) => lista.flatMap((c) => (grupos.has(c) ? grupos.get(c) : (porCaminho.has(c) ? [porCaminho.get(c)] : [])));
    if (incluir.length) {
      const set = new Set(expandir(incluir));
      set.add(porCaminho.get('_id'));
      return folhas.filter((f) => set.has(f));
    }
    const fora = new Set(expandir(excluir));
    return folhas.filter((f) => !fora.has(f));
  }

  /* ---------- atualizações ---------- */
  function normalizarAtualizacao(atualizacao) {
    const ops = { $set: {}, $inc: {}, $addToSet: {}, $push: {}, $pull: {}, $unset: {} };
    for (const [k, v] of Object.entries(atualizacao || {})) {
      if (k.startsWith('$')) {
        if (!ops[k]) throw new Error(`Operador de atualização ${k} não suportado.`);
        Object.assign(ops[k], v);
      } else {
        ops.$set[k] = v;
      }
    }
    // grupos inteiros viram os subcampos (os que não vierem voltam ao padrão)
    for (const [k, v] of Object.entries({ ...ops.$set })) {
      if (grupos.has(k)) {
        delete ops.$set[k];
        for (const filho of grupos.get(k)) {
          const sub = filho.caminho.slice(k.length + 1);
          ops.$set[filho.caminho] = v && v[sub] !== undefined ? v[sub] : aplicarPadrao(filho);
        }
      }
    }
    for (const k of Object.keys(ops.$set)) if (ops.$set[k] === undefined) delete ops.$set[k];
    if (definicao.antesDeAtualizar) definicao.antesDeAtualizar(ops.$set);
    return ops;
  }

  function compilarSets(ops, p, alias) {
    const sets = [];
    const q = (col) => (alias ? `${alias}."${col}"` : `"${col}"`);
    const jsonSets = new Map(); // coluna -> expressão acumulada de jsonb_set
    for (const [caminho, valorBruto] of Object.entries(ops.$set)) {
      const r = resolver(caminho);
      if (r.json) {
        const atual = jsonSets.get(r.folha.coluna) || `COALESCE(${q(r.folha.coluna)}, '{}'::jsonb)`;
        jsonSets.set(r.folha.coluna, `jsonb_set(${atual}, '{${r.resto.join(',')}}', ${p.add(JSON.stringify(valorBruto === undefined ? null : valorBruto), 'jsonb')}, true)`);
        continue;
      }
      const f = r.folha;
      if (f.caminho === '_id') continue;
      const v = converter(f, nuloViraPadrao(f, valorBruto));
      validar(f, v, { exigirObrigatorio: false });
      sets.push(`"${f.coluna}" = ${p.add(paraParametro(f, v), CAST[f.type])}`);
    }
    for (const [col, expr] of jsonSets) sets.push(`"${col}" = ${expr}`);
    for (const [caminho, n] of Object.entries(ops.$inc)) {
      const f = resolver(caminho).folha;
      sets.push(`"${f.coluna}" = COALESCE(${q(f.coluna)}, 0) + ${p.add(Number(n) || 0, CAST[f.type])}`);
    }
    for (const [caminho, v] of Object.entries(ops.$addToSet)) {
      const f = resolver(caminho).folha;
      const base = CAST[f.type].replace('[]', '');
      const itens = v && v.$each ? v.$each : [v];
      for (const item of itens) {
        const c = converter({ ...f, type: f.type.replace('[]', '') }, item);
        const ph = p.add(c, base);
        sets.push(`"${f.coluna}" = CASE WHEN ${ph} = ANY(COALESCE(${q(f.coluna)}, '{}')) THEN ${q(f.coluna)} ELSE array_append(COALESCE(${q(f.coluna)}, '{}'), ${ph}) END`);
      }
    }
    for (const [caminho, v] of Object.entries(ops.$push)) {
      const f = resolver(caminho).folha;
      const base = CAST[f.type].replace('[]', '');
      const c = converter({ ...f, type: f.type.replace('[]', '') }, v);
      sets.push(`"${f.coluna}" = array_append(COALESCE(${q(f.coluna)}, '{}'), ${p.add(c, base)})`);
    }
    for (const [caminho, v] of Object.entries(ops.$pull)) {
      const f = resolver(caminho).folha;
      const base = CAST[f.type].replace('[]', '');
      const c = converter({ ...f, type: f.type.replace('[]', '') }, v);
      sets.push(`"${f.coluna}" = array_remove(COALESCE(${q(f.coluna)}, '{}'), ${p.add(c, base)})`);
    }
    for (const caminho of Object.keys(ops.$unset)) {
      const f = resolver(caminho).folha;
      sets.push(`"${f.coluna}" = NULL`);
    }
    if (timestamps && ops.$set.updatedAt === undefined) sets.push('"updated_at" = now()');
    return sets;
  }

  /* ---------- linhas <-> documentos ---------- */
  function linhaParaDados(linha, folhasCarregadas) {
    const dados = {};
    for (const f of folhasCarregadas) {
      if (!(f.coluna in linha)) continue;
      let v = linha[f.coluna];
      if (v === null && f.type === 'json' && f.default !== undefined) v = aplicarPadrao(f);
      if (v === null && TIPOS_ARRAY.has(f.type)) v = [];
      setCaminho(dados, f.caminho, v);
    }
    return dados;
  }

  async function inserir(doc) {
    const p = new Parametros();
    const cols = [];
    const vals = [];
    if (!doc._id) doc._id = novoId();
    for (const f of folhas) {
      if (f.caminho === 'createdAt' || f.caminho === 'updatedAt') continue;
      let v = getCaminho(doc, f.caminho);
      if (v === undefined) { v = aplicarPadrao(f); setCaminho(doc, f.caminho, v); }
      v = converter(f, nuloViraPadrao(f, v));
      validar(f, v, { exigirObrigatorio: true });
      setCaminho(doc, f.caminho, v);
      cols.push(`"${f.coluna}"`);
      vals.push(p.add(paraParametro(f, v), CAST[f.type]));
    }
    if (timestamps) {
      const criado = getCaminho(doc, 'createdAt');
      if (criado) { cols.push('"created_at"'); vals.push(p.add(converter(porCaminho.get('createdAt'), criado), 'timestamptz')); }
      const atualizado = getCaminho(doc, 'updatedAt');
      if (atualizado) { cols.push('"updated_at"'); vals.push(p.add(converter(porCaminho.get('updatedAt'), atualizado), 'timestamptz')); }
    }
    const r = await query(`INSERT INTO "${tabela}" (${cols.join(', ')}) VALUES (${vals.join(', ')}) RETURNING *`, p.valores);
    return r.rows[0];
  }

  /* ---------- classe do documento ---------- */
  class Modelo {
    constructor(dados = {}, interno = null) {
      Object.defineProperty(this, '__novo', { value: !interno, writable: true, enumerable: false });
      Object.defineProperty(this, '__folhas', { value: interno ? interno.folhas : folhas, writable: true, enumerable: false });
      Object.defineProperty(this, '__foto', { value: new Map(), writable: true, enumerable: false });
      if (interno) {
        Object.assign(this, linhaParaDados(interno.linha, interno.folhas));
        this.__tirarFoto();
      } else {
        for (const f of folhas) {
          if (f.caminho === 'createdAt' || f.caminho === 'updatedAt') continue;
          const v = getCaminho(dados, f.caminho);
          setCaminho(this, f.caminho, v === undefined ? aplicarPadrao(f) : v);
        }
        if (dados._id) this._id = normalizarId(dados._id) || dados._id;
        else this._id = novoId();
        if (dados.createdAt) this.createdAt = dados.createdAt;
        if (dados.updatedAt) this.updatedAt = dados.updatedAt;
      }
    }

    get id() { return this._id ? String(this._id) : null; }
    get isNew() { return this.__novo; }

    __tirarFoto() {
      this.__foto = new Map(this.__folhas.map((f) => [f.caminho, serializar(f, getCaminho(this, f.caminho))]));
    }

    __alterados() {
      if (this.__novo) return editaveis.slice();
      return this.__folhas.filter((f) => !['_id', 'createdAt', 'updatedAt'].includes(f.caminho)
        && serializar(f, getCaminho(this, f.caminho)) !== this.__foto.get(f.caminho));
    }

    isModified(caminho) {
      const alterados = this.__alterados();
      if (!caminho) return alterados.length > 0;
      return alterados.some((f) => f.caminho === caminho || f.caminho.startsWith(`${caminho}.`));
    }

    markModified() { /* o diff já compara o valor inteiro */ }
    get(caminho) { return getCaminho(this, caminho); }
    set(caminho, valor) { setCaminho(this, caminho, valor); return this; }

    async save() {
      if (definicao.antesDeSalvar) definicao.antesDeSalvar(this, (c) => this.isModified(c));
      if (this.__novo) {
        const linha = await inserir(this);
        Object.assign(this, linhaParaDados(linha, folhas));
        this.__novo = false;
        this.__folhas = folhas;
        this.__tirarFoto();
        return this;
      }
      const alterados = this.__alterados();
      if (!alterados.length) return this;
      const p = new Parametros();
      const sets = alterados.map((f) => {
        const v = converter(f, nuloViraPadrao(f, getCaminho(this, f.caminho)));
        validar(f, v, { exigirObrigatorio: true });
        return `"${f.coluna}" = ${p.add(paraParametro(f, v), CAST[f.type])}`;
      });
      if (timestamps) sets.push('"updated_at" = now()');
      const r = await query(`UPDATE "${tabela}" SET ${sets.join(', ')} WHERE "id" = ${p.add(this._id, 'uuid')} RETURNING *`, p.valores);
      if (r.rows[0]) Object.assign(this, linhaParaDados(r.rows[0], this.__folhas));
      this.__tirarFoto();
      return this;
    }

    async deleteOne() {
      await query(`DELETE FROM "${tabela}" WHERE "id" = $1::uuid`, [this._id]);
      return { acknowledged: true, deletedCount: 1 };
    }

    toObject() {
      const obj = {};
      for (const f of this.__folhas) {
        const v = getCaminho(this, f.caminho);
        if (v === undefined) continue;
        setCaminho(obj, f.caminho, v instanceof Date ? new Date(v.getTime()) : (v && typeof v === 'object' ? JSON.parse(JSON.stringify(v)) : v));
      }
      // campos populados (objetos de outro modelo) entram como estão
      for (const k of Object.keys(this)) {
        if (this[k] && typeof this[k] === 'object' && typeof this[k].toObject === 'function') obj[k] = this[k].toObject();
      }
      return obj;
    }

    toJSON() {
      const ret = this.toObject();
      if (definicao.transformJSON) definicao.transformJSON(this, ret);
      return ret;
    }

    /* ---------- estáticos ---------- */
    static hidratar(linha, folhasCarregadas = folhas) {
      return new this({}, { linha, folhas: folhasCarregadas });
    }

    static find(filtro = {}, projecao) { return new Consulta(this, filtro, { projecao }); }
    static findOne(filtro = {}, projecao) { return new Consulta(this, filtro, { projecao, um: true }); }
    static findById(id, projecao) { return this.findOne({ _id: id }, projecao); }

    static async countDocuments(filtro = {}) {
      const p = new Parametros();
      const r = await query(`SELECT count(*)::int AS n FROM "${tabela}" WHERE ${compilarFiltro(filtro, p)}`, p.valores);
      return r.rows[0].n;
    }

    static async exists(filtro = {}) {
      const p = new Parametros();
      const r = await query(`SELECT "id" FROM "${tabela}" WHERE ${compilarFiltro(filtro, p)} LIMIT 1`, p.valores);
      return r.rows[0] ? { _id: r.rows[0].id } : null;
    }

    static async create(dados) {
      if (Array.isArray(dados)) {
        const docs = [];
        for (const d of dados) docs.push(await this.create(d));
        return docs;
      }
      const doc = new this(dados);
      await doc.save();
      return doc;
    }

    // vários registros de uma vez (ex.: importação de planilha): um INSERT por lote de 200
    static async insertMany(lista) {
      const docs = (lista || []).map((d) => (d instanceof this ? d : new this(d)));
      const LOTE = 200;
      for (let i = 0; i < docs.length; i += LOTE) {
        const lote = docs.slice(i, i + LOTE);
        const p = new Parametros();
        const colunasIns = folhas.filter((f) => f.caminho !== 'createdAt' && f.caminho !== 'updatedAt');
        const linhasSql = lote.map((doc) => {
          if (definicao.antesDeSalvar) definicao.antesDeSalvar(doc, () => true);
          return `(${colunasIns.map((f) => {
            let v = getCaminho(doc, f.caminho);
            if (v === undefined) v = aplicarPadrao(f);
            v = converter(f, v);
            validar(f, v, { exigirObrigatorio: true });
            return p.add(paraParametro(f, v), CAST[f.type]);
          }).join(', ')})`;
        });
        const r = await query(`INSERT INTO "${tabela}" (${colunasIns.map((f) => `"${f.coluna}"`).join(', ')}) VALUES ${linhasSql.join(', ')} RETURNING *`, p.valores);
        const porId = new Map(lote.map((d) => [String(d._id), d]));
        r.rows.forEach((linha) => {
          const doc = porId.get(String(linha.id));
          if (!doc) return;
          Object.assign(doc, linhaParaDados(linha, folhas));
          doc.__novo = false;
          doc.__tirarFoto();
        });
      }
      return docs;
    }

    static async __atualizar(filtro, atualizacao, opcoes, modo) {
      const ops = normalizarAtualizacao(atualizacao);
      const p = new Parametros();
      const sets = compilarSets(ops, p, '_t');
      const where = compilarFiltro(filtro, p);
      let sql;
      if (modo === 'muitos') {
        sql = `UPDATE "${tabela}" AS _t SET ${sets.join(', ')} WHERE ${where} RETURNING _t.*`;
      } else {
        const ordem = compilarOrdem(opcoes.sort);
        const devolverAntigo = modo === 'documento' && !opcoes.new && !opcoes.returnDocument;
        sql = `WITH alvo AS (SELECT * FROM "${tabela}" WHERE ${where}${ordem} LIMIT 1 FOR UPDATE)
          UPDATE "${tabela}" AS _t SET ${sets.join(', ')} FROM alvo WHERE _t."id" = alvo."id" RETURNING ${devolverAntigo ? 'alvo.*' : '_t.*'}`;
      }
      let r = await query(sql, p.valores);
      if (r.rowCount === 0 && opcoes.upsert) {
        try {
          const linha = await this.__inserirUpsert(filtro, ops);
          return { linhas: [linha], inserido: true, upsertedId: linha.id };
        } catch (err) {
          if (err.code !== '23505') throw err;
          r = await query(sql, p.valores); // outra requisição criou no meio do caminho
        }
      }
      return { linhas: r.rows, inserido: false };
    }

    static async __inserirUpsert(filtro, ops) {
      const dados = {};
      for (const [k, v] of Object.entries(filtro || {})) {
        if (k.startsWith('$') || (ehObjetoSimples(v) && Object.keys(v).some((x) => x.startsWith('$')))) continue;
        setCaminho(dados, k === 'id' ? '_id' : k, v);
      }
      for (const [k, v] of Object.entries(ops.$set)) setCaminho(dados, k, v);
      for (const [k, v] of Object.entries(ops.$inc)) setCaminho(dados, k, Number(v) || 0);
      for (const [k, v] of Object.entries(ops.$addToSet)) setCaminho(dados, k, v && v.$each ? v.$each : [v]);
      for (const [k, v] of Object.entries(ops.$push)) setCaminho(dados, k, [v]);
      const doc = new this(dados);
      if (definicao.antesDeSalvar) definicao.antesDeSalvar(doc, () => true);
      return inserir(doc);
    }

    static async findOneAndUpdate(filtro, atualizacao, opcoes = {}) {
      const { linhas } = await this.__atualizar(filtro, atualizacao, opcoes, 'documento');
      if (!linhas[0]) return null;
      const doc = this.hidratar(linhas[0]);
      if (opcoes.lean) return doc.toObject();
      return doc;
    }
    static findByIdAndUpdate(id, atualizacao, opcoes = {}) { return this.findOneAndUpdate({ _id: id }, atualizacao, opcoes); }

    static async updateOne(filtro, atualizacao, opcoes = {}) {
      const r = await this.__atualizar(filtro, atualizacao, opcoes, 'um');
      return { acknowledged: true, matchedCount: r.inserido ? 0 : r.linhas.length, modifiedCount: r.inserido ? 0 : r.linhas.length, upsertedId: r.upsertedId || null, upsertedCount: r.inserido ? 1 : 0 };
    }
    static async updateMany(filtro, atualizacao, opcoes = {}) {
      const r = await this.__atualizar(filtro, atualizacao, opcoes, 'muitos');
      return { acknowledged: true, matchedCount: r.linhas.length, modifiedCount: r.linhas.length, upsertedId: r.upsertedId || null, upsertedCount: r.inserido ? 1 : 0 };
    }

    static async deleteOne(filtro = {}) {
      const p = new Parametros();
      const r = await query(`DELETE FROM "${tabela}" WHERE "id" = (SELECT "id" FROM "${tabela}" WHERE ${compilarFiltro(filtro, p)} LIMIT 1)`, p.valores);
      return { acknowledged: true, deletedCount: r.rowCount };
    }
    static async deleteMany(filtro = {}) {
      const p = new Parametros();
      const r = await query(`DELETE FROM "${tabela}" WHERE ${compilarFiltro(filtro, p)}`, p.valores);
      return { acknowledged: true, deletedCount: r.rowCount };
    }
    static async findOneAndDelete(filtro = {}) {
      const p = new Parametros();
      const r = await query(`DELETE FROM "${tabela}" WHERE "id" = (SELECT "id" FROM "${tabela}" WHERE ${compilarFiltro(filtro, p)} LIMIT 1) RETURNING *`, p.valores);
      return r.rows[0] ? this.hidratar(r.rows[0]) : null;
    }
    static findByIdAndDelete(id) { return this.findOneAndDelete({ _id: id }); }
  }

  class Consulta {
    constructor(Model, filtro, { projecao, um = false } = {}) {
      this.Model = Model;
      this.filtro = filtro || {};
      this.projecao = projecao || null;
      this.um = um;
      this.ordem = null;
      this.limite = null;
      this.pular = null;
      this.enxuto = false;
      this.populares = [];
    }
    sort(o) { this.ordem = o; return this; }
    select(s) { this.projecao = s; return this; }
    limit(n) { this.limite = n; return this; }
    skip(n) { this.pular = n; return this; }
    lean() { this.enxuto = true; return this; }
    populate(caminho, selecao) {
      if (typeof caminho === 'object') this.populares.push({ caminho: caminho.path, selecao: caminho.select });
      else this.populares.push({ caminho, selecao });
      return this;
    }
    async exec() {
      const p = new Parametros();
      const folhasSel = folhasDaProjecao(this.projecao) || folhas;
      const cols = folhasSel.map((f) => `"${f.coluna}"`).join(', ');
      let sql = `SELECT ${cols} FROM "${tabela}" WHERE ${compilarFiltro(this.filtro, p)}${compilarOrdem(this.ordem)}`;
      const limite = this.um ? 1 : this.limite;
      if (limite) sql += ` LIMIT ${parseInt(limite, 10)}`;
      if (this.pular) sql += ` OFFSET ${parseInt(this.pular, 10)}`;
      const r = await query(sql, p.valores);
      let docs = r.rows.map((linha) => this.Model.hidratar(linha, folhasSel));
      for (const pop of this.populares) await popular(docs, pop);
      if (this.enxuto) docs = docs.map((d) => d.toObject());
      return this.um ? (docs[0] || null) : docs;
    }
    then(resolve, reject) { return this.exec().then(resolve, reject); }
    catch(reject) { return this.exec().catch(reject); }
  }

  async function popular(docs, { caminho, selecao }) {
    const folha = porCaminho.get(caminho);
    if (!folha || !folha.ref) throw new Error(`Não dá pra popular "${caminho}" em ${nome}.`);
    const Ref = registro.get(folha.ref);
    const ids = [...new Set(docs.map((d) => d[caminho]).filter(Boolean).map(String))];
    if (!ids.length) return;
    let consulta = Ref.find({ _id: { $in: ids } });
    if (selecao) consulta = consulta.select(selecao);
    const encontrados = await consulta;
    const mapa = new Map(encontrados.map((d) => [String(d._id), d]));
    for (const d of docs) if (d[caminho]) d[caminho] = mapa.get(String(d[caminho])) || null;
  }

  Object.defineProperty(Modelo, 'name', { value: nome });
  Modelo.modelName = nome;
  Modelo.tabela = tabela;
  Modelo.folhas = folhas;
  Modelo.compilarFiltro = compilarFiltro;
  // usado na importação de backup: ignora campos que este modelo não conhece
  Modelo.temCampo = (caminho) => porCaminho.has(caminho) || grupos.has(caminho);
  // campos de ID que podem ficar vazios (na importação, ligação quebrada vira null)
  Modelo.idsOpcionais = folhas.filter((f) => f.type === 'id' && !f.required && f.caminho !== '_id' && !f.caminho.includes('.')).map((f) => f.caminho);
  Modelo.Parametros = Parametros;
  Object.assign(Modelo, definicao.estaticos || {});
  registro.set(nome, Modelo);
  return Modelo;
}

module.exports = { definirModelo, ErroDeValidacao, registro, snake, CAST };
