/* PDV — nota fiscal ao consumidor (NFC-e) por um parceiro emissor (Focus NFe).

   Como funciona
   - O comerciante contrata o parceiro (ex.: plano de varejo da Focus NFe), cadastra lá a empresa,
     o certificado digital A1 e o CSC da SEFAZ, e cola aqui o token da API. O token fica cifrado
     no banco (AES-256-GCM, chave derivada do FISCAL_KEY ou do JWT_SECRET) e nunca volta para a tela.
   - Por padrão começa em HOMOLOGAÇÃO (nota de teste, sem valor fiscal). Produção é escolha explícita.
   - Por enquanto: emitente do Simples Nacional / MEI (CSOSN). Regime normal (CST e alíquotas de
     ICMS) fica para depois.
   - Venda → NFC-e: itens com NCM/CFOP/CSOSN do produto (ou o padrão da configuração), desconto
     e acréscimo rateados pelos itens, pagamentos com os códigos da SEFAZ e o troco.
   - Emitir, consultar (quando a SEFAZ demora) e cancelar (com justificativa; a SEFAZ só aceita
     dentro do prazo do estado, em geral 30 minutos).

   Para testar sem internet/sem conta, FOCUS_NFE_URL aponta para outro endereço (os testes usam
   um servidor falso). */
const crypto = require('crypto');
const { query } = require('../db/pool');

class ErroFiscal extends Error {}
const erro = (m) => new ErroFiscal(m);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ehUuid = (v) => typeof v === 'string' && UUID_RE.test(v);
const texto = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
const digitos = (v) => String(v == null ? '' : v).replace(/\D/g, '');
const c2 = (n) => Math.round(Number(n) * 100);

/* ------------------------------ token cifrado ------------------------------ */
const chave = () => crypto.createHash('sha256').update(`${process.env.FISCAL_KEY || process.env.JWT_SECRET || 'troque-este-segredo-no-env'}:fiscal`).digest();
function cifrar(t) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', chave(), iv);
  const dados = Buffer.concat([c.update(String(t), 'utf8'), c.final()]);
  return `v1:${iv.toString('base64')}:${c.getAuthTag().toString('base64')}:${dados.toString('base64')}`;
}
function decifrar(s) {
  try {
    const [v, iv, tag, dados] = String(s || '').split(':');
    if (v !== 'v1') return null;
    const d = crypto.createDecipheriv('aes-256-gcm', chave(), Buffer.from(iv, 'base64'));
    d.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([d.update(Buffer.from(dados, 'base64')), d.final()]).toString('utf8');
  } catch (e) { return null; }
}

/* ------------------------------ configuração ------------------------------ */
const PADRAO = { ativo: false, provedor: 'focus', ambiente: 'homologacao', cnpj: '', regime: 'simples', csosn: '102', cfop: '5102', ncm: '', origem: '0', pisCofins: '49', emitir: 'perguntar', infoAdicional: '' };
function cnpjValido(c) {
  const d = digitos(c);
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
  const calc = (n) => { const pesos = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]; const s = pesos.reduce((a, p, i) => a + Number(d[i]) * p, 0) % 11; return s < 2 ? 0 : 11 - s; };
  return calc(12) === Number(d[12]) && calc(13) === Number(d[13]);
}
function cpfValido(c) {
  const d = digitos(c);
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  const dv = (n) => { let s = 0; for (let i = 0; i < n; i++) s += Number(d[i]) * (n + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
}
async function lerConfig(userId, comToken = false) {
  const { rows } = await query('SELECT fiscal, fiscal_token FROM estoque_negocio WHERE user_id = $1::uuid', [userId]);
  const r = rows[0] || {};
  const cfg = { ...PADRAO, ...(r.fiscal || {}), temToken: !!r.fiscal_token };
  if (comToken) cfg.token = r.fiscal_token ? decifrar(r.fiscal_token) : null;
  return cfg;
}
async function salvarConfig(userId, d = {}) {
  const atual = await lerConfig(userId);
  const n = { ...atual };
  delete n.temToken;
  if (d.ambiente !== undefined) { if (!['homologacao', 'producao'].includes(d.ambiente)) throw erro('Ambiente inválido.'); n.ambiente = d.ambiente; }
  if (d.cnpj !== undefined) { const c = digitos(d.cnpj); if (c && !cnpjValido(c)) throw erro('CNPJ inválido. Confira os números.'); n.cnpj = c; }
  if (d.csosn !== undefined) { if (!/^(101|102|103|201|202|203|300|400|500|900)$/.test(String(d.csosn))) throw erro('CSOSN inválido (ex.: 102).'); n.csosn = String(d.csosn); }
  if (d.cfop !== undefined) { if (!/^[56]\d{3}$/.test(String(d.cfop))) throw erro('CFOP inválido (ex.: 5102).'); n.cfop = String(d.cfop); }
  if (d.ncm !== undefined) { const v = digitos(d.ncm); if (v && v.length !== 8) throw erro('O NCM padrão tem 8 números.'); n.ncm = v; }
  if (d.origem !== undefined) { if (!/^[0-8]$/.test(String(d.origem))) throw erro('Origem inválida.'); n.origem = String(d.origem); }
  if (d.pisCofins !== undefined) { if (!/^\d{2}$/.test(String(d.pisCofins))) throw erro('CST de PIS/COFINS inválido (ex.: 49).'); n.pisCofins = String(d.pisCofins); }
  if (d.emitir !== undefined) n.emitir = d.emitir === 'sempre' ? 'sempre' : 'perguntar';
  if (d.infoAdicional !== undefined) n.infoAdicional = texto(d.infoAdicional, 300);
  if (d.ativo !== undefined) n.ativo = !!d.ativo;
  const token = d.token === undefined || d.token === null ? undefined : String(d.token).trim();
  if (token !== undefined && token !== '' && !/^[A-Za-z0-9_-]{10,200}$/.test(token)) throw erro('Token inválido. Copie o token da API do painel do parceiro.');
  if (n.ativo) {
    if (!n.cnpj) throw erro('Informe o CNPJ do emitente para ligar a NFC-e.');
    if (!atual.temToken && !token) throw erro('Cole o token da API do parceiro emissor para ligar a NFC-e.');
  }
  await query('INSERT INTO estoque_negocio (user_id) VALUES ($1::uuid) ON CONFLICT (user_id) DO NOTHING', [userId]);
  if (token === '') await query('UPDATE estoque_negocio SET fiscal = $2::jsonb, fiscal_token = NULL WHERE user_id = $1::uuid', [userId, JSON.stringify({ ...n, ativo: false })]);
  else if (token) await query('UPDATE estoque_negocio SET fiscal = $2::jsonb, fiscal_token = $3 WHERE user_id = $1::uuid', [userId, JSON.stringify(n), cifrar(token)]);
  else await query('UPDATE estoque_negocio SET fiscal = $2::jsonb WHERE user_id = $1::uuid', [userId, JSON.stringify(n)]);
  return lerConfig(userId);
}

/* ------------------------------ parceiro: Focus NFe ------------------------------ */
const baseFocus = (ambiente) => process.env.FOCUS_NFE_URL || (ambiente === 'producao' ? 'https://api.focusnfe.com.br' : 'https://homologacao.focusnfe.com.br');
async function chamarFocus(cfg, metodo, caminho, corpo) {
  if (!cfg.token) throw erro('Token do parceiro emissor não configurado.');
  let res;
  try {
    res = await fetch(baseFocus(cfg.ambiente) + caminho, {
      method: metodo,
      headers: { Authorization: `Basic ${Buffer.from(`${cfg.token}:`).toString('base64')}`, 'Content-Type': 'application/json' },
      body: corpo ? JSON.stringify(corpo) : undefined,
      signal: AbortSignal.timeout(40000),
    });
  } catch (e) { throw erro('Não deu para falar com o emissor de notas agora. Tente de novo em instantes.'); }
  let dados = null;
  try { dados = await res.json(); } catch (e) { /* sem corpo */ }
  if (res.status === 401 || res.status === 403) throw erro('O parceiro recusou o token (confira o token e o ambiente em Configurações → Nota fiscal).');
  return { status: res.status, dados: dados || {} };
}
const absoluto = (cfg, caminho) => (!caminho ? '' : /^https?:/.test(caminho) ? caminho : baseFocus(cfg.ambiente) + caminho);
function mensagemDe(d) {
  if (!d) return '';
  if (Array.isArray(d.erros) && d.erros.length) return d.erros.map((e) => e.mensagem || e.campo || '').filter(Boolean).join(' · ');
  return d.mensagem_sefaz || d.mensagem || '';
}
function situacao(d) {
  const s = String(d.status || '');
  if (s === 'autorizado') return 'autorizada';
  if (s === 'cancelado') return 'cancelada';
  if (s.startsWith('processando')) return 'processando';
  return 'erro';
}

/* ------------------------------ montar a nota ------------------------------ */
// a SEFAZ quer a hora com o fuso (AAAA-MM-DDThh:mm:ss-03:00), não em UTC com "Z"
function horaDeBrasilia(d) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
    .formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}-03:00`;
}
// códigos de forma de pagamento da SEFAZ
const TPAG = { dinheiro: '01', credito: '03', debito: '04', fiado: '05', boleto: '15', pix: '17', transferencia: '18', outro: '99' };
// divide um valor (centavos) pelos itens, proporcional ao valor de cada um; o último leva o resto
function ratear(totalC, pesos) {
  const soma = pesos.reduce((a, p) => a + p, 0);
  if (!totalC || !soma) return pesos.map(() => 0);
  let usado = 0;
  return pesos.map((p, i) => { if (i === pesos.length - 1) return totalC - usado; const v = Math.floor((totalC * p) / soma); usado += v; return v; });
}
function montarNFCe(venda, produtos, cfg, cpf) {
  const itens = venda.itens || [];
  if (!itens.length) throw erro('Venda sem itens.');
  const brutos = itens.map((i) => c2(Number(i.qtd) * Number(i.unit)));
  const descC = c2(venda.desconto) + c2(venda.cashbackUsado) + c2(venda.premioValor);
  const descs = ratear(descC, brutos);
  const acrs = ratear(c2(venda.acrescimo), brutos);
  const faltaNcm = [];
  const items = itens.map((i, k) => {
    const p = i.produtoId ? produtos.get(i.produtoId) : null;
    const f = (p && p.fiscal) || {};
    const ncm = f.ncm || cfg.ncm;
    if (!ncm) faltaNcm.push(i.nome);
    const un = (p && p.unidade ? p.unidade : 'un').toUpperCase();
    const unit = Number(i.unit);
    const it = {
      numero_item: k + 1, codigo_produto: texto((p && (p.codigo || '')) || (i.produtoId ? i.produtoId.slice(0, 8) : `AV${k + 1}`), 60) || `P${k + 1}`,
      descricao: texto(`${i.nome}${(i.opcoes || []).length ? ` (${i.opcoes.join(', ')})` : ''}`, 120),
      codigo_ncm: ncm, cfop: f.cfop || cfg.cfop, unidade_comercial: un, quantidade_comercial: Number(i.qtd), valor_unitario_comercial: unit,
      unidade_tributavel: un, quantidade_tributavel: Number(i.qtd), valor_unitario_tributavel: unit, valor_bruto: brutos[k] / 100,
      codigo_barras_comercial: p && /^\d{8,14}$/.test(p.codigo || '') ? p.codigo : 'SEM GTIN', codigo_barras_tributavel: p && /^\d{8,14}$/.test(p.codigo || '') ? p.codigo : 'SEM GTIN',
      icms_origem: f.origem || cfg.origem, icms_situacao_tributaria: f.csosn || cfg.csosn,
      pis_situacao_tributaria: cfg.pisCofins, cofins_situacao_tributaria: cfg.pisCofins,
    };
    if (f.cest) it.cest = f.cest;
    if (descs[k]) it.valor_desconto = descs[k] / 100;
    if (acrs[k]) it.valor_outras_despesas = acrs[k] / 100;
    return it;
  });
  if (faltaNcm.length) throw erro(`Falta o NCM de: ${faltaNcm.slice(0, 4).join(', ')}${faltaNcm.length > 4 ? '…' : ''}. Cadastre no produto (Dados fiscais) ou um NCM padrão em Configurações → Nota fiscal.`);
  // pagamentos: o dinheiro vai pelo que o cliente entregou e o troco vai à parte
  const pags = (venda.pagamentos && venda.pagamentos.length ? venda.pagamentos : [{ meio: venda.meio, valor: venda.total }]);
  const formas = pags.map((p) => ({ forma_pagamento: TPAG[p.meio] || '99', valor_pagamento: p.meio === 'dinheiro' && venda.troco ? Number(venda.recebido || (Number(p.valor) + Number(venda.troco))) : Number(p.valor) }));
  if (!formas.length || venda.total === 0) formas.splice(0, formas.length, { forma_pagamento: '90', valor_pagamento: 0 });
  const nota = {
    natureza_operacao: 'Venda ao consumidor', data_emissao: horaDeBrasilia(new Date()), tipo_documento: 1, presenca_comprador: venda.pedidoId ? 4 : 1,
    consumidor_final: 1, finalidade_emissao: 1, modalidade_frete: 9, local_destino: 1, cnpj_emitente: cfg.cnpj,
    valor_produtos: brutos.reduce((a, b) => a + b, 0) / 100, valor_desconto: descC / 100, valor_total: Number(venda.total),
    items, formas_pagamento: formas,
  };
  if (c2(venda.acrescimo)) nota.valor_outras_despesas = Number(venda.acrescimo);
  if (venda.troco) nota.valor_troco = Number(venda.troco);
  const doc = digitos(cpf);
  if (doc) {
    if (doc.length === 11 && cpfValido(doc)) nota.cpf_destinatario = doc;
    else if (doc.length === 14 && cnpjValido(doc)) nota.cnpj_destinatario = doc;
    else throw erro('CPF/CNPJ do cliente inválido.');
  }
  const info = [cfg.infoAdicional, `Venda #${venda.numero}`].filter(Boolean).join(' · ');
  if (info) nota.informacoes_adicionais_contribuinte = texto(info, 500);
  return nota;
}

/* ------------------------------ emitir, consultar, cancelar ------------------------------ */
async function vendaRow(userId, vendaId) {
  if (!ehUuid(vendaId)) throw erro('Venda não encontrada.');
  const { rows } = await query('SELECT * FROM estoque_vendas WHERE user_id = $1::uuid AND id = $2::uuid', [userId, vendaId]);
  if (!rows[0]) throw erro('Venda não encontrada.');
  return rows[0];
}
async function gravar(userId, vendaId, nfce) {
  await query('UPDATE estoque_vendas SET nfce = $3::jsonb WHERE user_id = $1::uuid AND id = $2::uuid', [userId, vendaId, JSON.stringify(nfce)]);
  return nfce;
}
function resultado(cfg, base, d) {
  return {
    ...base, status: situacao(d), chave: d.chave_nfe || base.chave || '', numero: d.numero ? String(d.numero) : (base.numero || ''), serie: d.serie ? String(d.serie) : (base.serie || ''),
    danfe: absoluto(cfg, d.caminho_danfe) || base.danfe || '', xml: absoluto(cfg, d.caminho_xml_nota_fiscal) || base.xml || '',
    qrcode: d.qrcode_url || base.qrcode || '', mensagem: mensagemDe(d), statusSefaz: d.status_sefaz || '', atualizadaEm: new Date().toISOString(),
  };
}
// vendaObjFn: transforma a linha do banco no objeto da venda (vem de estoque.js, sem dependência circular)
async function emitir(userId, vendaId, d = {}, vendaObjFn) {
  const cfg = await lerConfig(userId, true);
  if (!cfg.ativo) throw erro('A emissão de NFC-e está desligada. Ligue em Configurações → Nota fiscal.');
  const row = await vendaRow(userId, vendaId);
  if (row.cancelada) throw erro('Essa venda foi cancelada.');
  const atual = row.nfce || {};
  if (atual.status === 'autorizada') throw erro('Essa venda já tem NFC-e autorizada.');
  if (atual.status === 'processando') return consultar(userId, vendaId);
  const venda = vendaObjFn(row);
  const ids = [...new Set(venda.itens.map((i) => i.produtoId).filter(ehUuid))];
  const prods = ids.length ? (await query('SELECT id, codigo, unidade, fiscal FROM estoque_produtos WHERE user_id = $1::uuid AND id = ANY($2::uuid[])', [userId, ids])).rows : [];
  const nota = montarNFCe(venda, new Map(prods.map((p) => [p.id, p])), cfg, d.cpf);
  const ref = `lc${venda.numero}-${crypto.randomBytes(3).toString('hex')}`;
  const base = { ref, ambiente: cfg.ambiente, cpf: nota.cpf_destinatario || nota.cnpj_destinatario || '', emitidaEm: new Date().toISOString() };
  // marca "processando" só se ninguém marcou antes (dois toques, ou o automático junto com o manual):
  // assim a mesma venda nunca vira duas notas
  const marcou = await query(`UPDATE estoque_vendas SET nfce = $3::jsonb WHERE user_id = $1::uuid AND id = $2::uuid
    AND (nfce IS NULL OR nfce->>'status' IS NULL OR nfce->>'status' NOT IN ('processando', 'autorizada')) RETURNING id`, [userId, vendaId, JSON.stringify({ ...base, status: 'processando' })]);
  if (!marcou.rows.length) { const agora = (await vendaRow(userId, vendaId)).nfce || {}; if (agora.status === 'autorizada') return agora; return consultar(userId, vendaId); }
  let r;
  try { r = await chamarFocus(cfg, 'POST', `/v2/nfce?ref=${encodeURIComponent(ref)}`, nota); }
  catch (e) { await gravar(userId, vendaId, { ...base, status: 'erro', mensagem: e.message }); throw e; }
  if (r.status >= 400 && !r.dados.status) return gravar(userId, vendaId, { ...base, status: 'erro', mensagem: mensagemDe(r.dados) || `Recusada pelo emissor (${r.status}).` });
  return gravar(userId, vendaId, resultado(cfg, base, r.dados));
}
async function consultar(userId, vendaId) {
  const cfg = await lerConfig(userId, true);
  const row = await vendaRow(userId, vendaId);
  const atual = row.nfce || {};
  if (!atual.ref) throw erro('Essa venda não tem NFC-e.');
  const r = await chamarFocus({ ...cfg, ambiente: atual.ambiente || cfg.ambiente }, 'GET', `/v2/nfce/${encodeURIComponent(atual.ref)}?completo=0`);
  if (r.status === 404) return gravar(userId, vendaId, { ...atual, status: 'erro', mensagem: 'O emissor não encontrou essa nota. Emita de novo.' });
  return gravar(userId, vendaId, resultado({ ...cfg, ambiente: atual.ambiente || cfg.ambiente }, atual, r.dados));
}
async function cancelar(userId, vendaId, d = {}) {
  const cfg = await lerConfig(userId, true);
  const row = await vendaRow(userId, vendaId);
  const atual = row.nfce || {};
  if (atual.status !== 'autorizada') throw erro('Só dá para cancelar uma NFC-e autorizada.');
  const justificativa = texto(d.justificativa, 255);
  if (justificativa.length < 15) throw erro('Escreva o motivo do cancelamento (no mínimo 15 letras), por exemplo: "Cliente desistiu da compra".');
  const c = { ...cfg, ambiente: atual.ambiente || cfg.ambiente };
  const r = await chamarFocus(c, 'DELETE', `/v2/nfce/${encodeURIComponent(atual.ref)}`, { justificativa });
  if (String(r.dados.status) === 'cancelado') return gravar(userId, vendaId, { ...atual, status: 'cancelada', mensagem: mensagemDe(r.dados) || 'Cancelada', canceladaEm: new Date().toISOString(), xmlCancelamento: absoluto(c, r.dados.caminho_xml_cancelamento) });
  throw erro(mensagemDe(r.dados) || 'A SEFAZ não aceitou o cancelamento (o prazo para cancelar NFC-e costuma ser de 30 minutos).');
}
// confere se o token funciona (consulta uma nota que não existe: 404 = token bom)
async function testar(userId) {
  const cfg = await lerConfig(userId, true);
  if (!cfg.token) throw erro('Cole o token da API antes de testar.');
  const r = await chamarFocus(cfg, 'GET', '/v2/nfce/teste-de-conexao-livro-caixa');
  return { ok: true, ambiente: cfg.ambiente, mensagem: r.status === 404 || r.status === 200 ? `Conectado ao emissor (${cfg.ambiente === 'producao' ? 'produção' : 'homologação'}).` : `O emissor respondeu ${r.status}.` };
}

module.exports = { ErroFiscal, lerConfig, salvarConfig, montarNFCe, emitir, consultar, cancelar, testar, cifrar, decifrar, cnpjValido, cpfValido };
