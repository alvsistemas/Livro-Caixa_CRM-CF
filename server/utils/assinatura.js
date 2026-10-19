/* Assinatura paga: planos (mensal e anual), descontos, quem tem acesso e a ligação com o Asaas.

   Regra de ouro: quem diz o que foi pago é o Asaas. O servidor nunca marca nada como pago
   por conta própria nem confia no conteúdo do aviso (webhook): ao receber qualquer aviso,
   ele CONSULTA o Asaas e recalcula a situação a partir das cobranças que o Asaas devolveu.

   Mudança de valor (troca de plano, mensal ↔ anual, desconto que começa ou termina): a API do
   Asaas não garante mudar o valor de uma assinatura existente, então o sistema CRIA uma nova
   assinatura a partir do próximo vencimento e só depois apaga a antiga. O período já pago fica
   guardado (pago_ate_base) e nunca se perde.

   Variáveis de ambiente opcionais (além das do utils/asaas.js):
     ASSINATURA_DIAS_TESTE ............ dias grátis a partir do primeiro acesso (padrão 7)
     ASSINATURA_TOLERANCIA_DIAS ....... dias depois do vencimento antes de bloquear (padrão 3)
     ASSINATURA_LIBERADOS ............. e-mails sem cobrança, separados por vírgula
     ASSINATURA_VALOR_ESSENCIAL ....... preço mensal do Essencial (padrão 29.90)
     ASSINATURA_VALOR_COMPLETO ........ preço mensal do Completo (padrão 39.90)
     ASSINATURA_VALOR_ESSENCIAL_ANUAL . preço anual do Essencial (padrão 300)
     ASSINATURA_VALOR_COMPLETO_ANUAL .. preço anual do Completo (padrão 400)
     ASSINATURA_AVISOS ................ "asaas" = deixa o Asaas avisar as cobranças; sem isso, com o
                                        e-mail (Resend) configurado, quem avisa é o Livro-Caixa
     ASSINATURA_URL_RETORNO ........... pra onde o Asaas manda a pessoa depois de pagar
     ASSINATURA_DESLIGADA=1 ........... desliga a cobrança na hora (todo mundo liberado), sem apagar nada */

const { query } = require('../db/pool');
const { asaas, asaasConfigurado, ErroAsaas } = require('./asaas');
const { ehDono } = require('./donos');
const { emailConfigurado } = require('./email');

const DIA = 24 * 60 * 60 * 1000;

const PLANOS = {
  essencial: {
    nome: 'Essencial',
    valorPadrao: 29.9,
    valorAnualPadrao: 300,
    itens: ['CRM completo: leads, funil em Kanban, clientes e histórico', 'Controle financeiro', 'Celular e computador'],
    recursos: { ia: false, googleAgenda: false },
  },
  completo: {
    nome: 'Completo',
    valorPadrao: 39.9,
    valorAnualPadrao: 400,
    itens: ['Tudo do Essencial', 'Assistente com IA (CRM e financeiro)', 'Integração com o Google Agenda'],
    recursos: { ia: true, googleAgenda: true },
  },
};
const CICLOS = { mensal: { asaas: 'MONTHLY', meses: 1, nome: 'mensal' }, anual: { asaas: 'YEARLY', meses: 12, nome: 'anual' } };
const TODOS_OS_RECURSOS = { ia: true, googleAgenda: true };

const centavos = (v) => Math.round(Number(v) * 100) / 100;
// aplica o desconto em centavos inteiros (39,90 com 25% = 29,93, sem erro de arredondamento)
const comDesconto = (base, pct) => Math.max(5, Math.round((Math.round(base * 100) * (100 - Number(pct))) / 100) / 100); // o Asaas não cobra menos de R$ 5
const numeroDoAmbiente = (nome, padrao) => {
  const v = parseFloat(String(process.env[nome] || '').replace(',', '.'));
  return Number.isFinite(v) && v >= 0 ? v : padrao;
};
function valorDoPlano(plano, ciclo = 'mensal') {
  const p = PLANOS[plano];
  if (ciclo === 'anual') return centavos(numeroDoAmbiente(`ASSINATURA_VALOR_${plano.toUpperCase()}_ANUAL`, p.valorAnualPadrao));
  return centavos(numeroDoAmbiente(`ASSINATURA_VALOR_${plano.toUpperCase()}`, p.valorPadrao));
}
const diasDeTeste = () => numeroDoAmbiente('ASSINATURA_DIAS_TESTE', 7);
const diasDeTolerancia = () => numeroDoAmbiente('ASSINATURA_TOLERANCIA_DIAS', 3);
const emailsLiberados = () => String(process.env.ASSINATURA_LIBERADOS || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
const cobrancaLigada = () => asaasConfigurado() && process.env.ASSINATURA_DESLIGADA !== '1';
// Com o e-mail configurado, o Livro-Caixa avisa as cobranças e o Asaas fica quieto
// (os avisos do Asaas podem custar por cobrança paga).
const avisosProprios = () => emailConfigurado() && String(process.env.ASSINATURA_AVISOS || '').toLowerCase() !== 'asaas';

function listaDePlanos() {
  return Object.entries(PLANOS).map(([id, p]) => ({
    id, nome: p.nome, valor: valorDoPlano(id, 'mensal'), valorAnual: valorDoPlano(id, 'anual'), itens: p.itens, recursos: p.recursos,
  }));
}

/* ---------- datas (sempre no fuso de Brasília) ---------- */
function hojeEmBrasilia(agora = new Date()) {
  return new Date(agora.getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
function dataDeBrasilia(ts) { return ts ? hojeEmBrasilia(new Date(ts)) : null; }
const textoDeData = (d) => (d ? (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10)) : null);
// "2026-01-31" + 1 mês = "2026-02-28" (não pula pra março)
function somarMeses(data, n) {
  const [a, m, d] = data.split('-').map(Number);
  const ultimoDia = new Date(Date.UTC(a, m - 1 + n + 1, 0)).getUTCDate();
  return new Date(Date.UTC(a, m - 1 + n, Math.min(d, ultimoDia))).toISOString().slice(0, 10);
}
const somarUmMes = (data) => somarMeses(data, 1);
const fimDoDia = (data) => new Date(`${data}T23:59:59-03:00`);

/* ---------- CPF / CNPJ ---------- */
function cpfCnpjValido(valor) {
  const n = String(valor || '').replace(/\D/g, '');
  if (n.length === 11) {
    if (/^(\d)\1+$/.test(n)) return false;
    const dv = (len) => { let s = 0; for (let i = 0; i < len; i++) s += Number(n[i]) * (len + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
    return dv(9) === Number(n[9]) && dv(10) === Number(n[10]);
  }
  if (n.length === 14) {
    if (/^(\d)\1+$/.test(n)) return false;
    const dv = (len) => { const pesos = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]; let s = 0; for (let i = 0; i < len; i++) s += Number(n[i]) * pesos[i]; const r = s % 11; return r < 2 ? 0 : 11 - r; };
    return dv(12) === Number(n[12]) && dv(13) === Number(n[13]);
  }
  return false;
}

/* ---------- descontos ---------- */
// O desconto vale para a cobrança que vence em "vencimento"?
function descontoVale(linha, vencimento) {
  const l = linha || {};
  const pct = Number(l.desconto_percentual) || 0;
  if (pct <= 0) return false;
  const ate = textoDeData(l.desconto_ate);
  if (!ate) return true; // para sempre, ou ainda não começou a contar
  return !vencimento || String(vencimento).slice(0, 10) < ate;
}
// Preço de tabela da pessoa: o contratado se for o mesmo plano/ciclo, senão o atual da tabela
function valorBase(linha, plano, ciclo) {
  const l = linha || {};
  if (l.valor_contratado && l.plano === plano && (l.ciclo || 'mensal') === ciclo) return centavos(l.valor_contratado);
  return valorDoPlano(plano, ciclo);
}
// Quanto a cobrança que vence em "vencimento" deve custar
function valorDevido(linha, vencimento, plano, ciclo) {
  const l = linha || {};
  const p = PLANOS[plano] ? plano : (PLANOS[l.plano] ? l.plano : 'completo');
  const c = CICLOS[ciclo] ? ciclo : (CICLOS[l.ciclo] ? l.ciclo : 'mensal');
  const base = valorBase(l, p, c);
  if (!descontoVale(l, vencimento)) return base;
  return comDesconto(base, l.desconto_percentual);
}

/* ---------- configurações do sistema (promoção para novos) ---------- */
let cacheConfig = { ate: 0, valores: {} };
async function lerConfig(chave) {
  if (cacheConfig.ate < Date.now()) {
    const { rows } = await query('SELECT chave, valor FROM configuracoes_sistema');
    cacheConfig = { ate: Date.now() + 60 * 1000, valores: Object.fromEntries(rows.map((r) => [r.chave, r.valor])) };
  }
  return cacheConfig.valores[chave] || null;
}
async function gravarConfig(chave, valor) {
  await query(
    `INSERT INTO configuracoes_sistema (chave, valor, updated_at) VALUES ($1, $2, now())
     ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, updated_at = now()`,
    [chave, JSON.stringify(valor)]
  );
  cacheConfig = { ate: 0, valores: {} };
}
function promocaoValida(p, agora = new Date()) {
  if (!p || !p.ativa || !(Number(p.percentual) > 0)) return false;
  return !p.validaAte || hojeEmBrasilia(agora) <= p.validaAte;
}
async function promocaoAtual() {
  const p = await lerConfig('promocao_novos');
  return promocaoValida(p) ? p : null;
}
async function definirPromocao({ ativa, percentual, meses, validaAte }) {
  const pct = Number(percentual);
  if (ativa && !(pct > 0 && pct <= 90)) throw new ErroAsaas('O desconto da promoção precisa ficar entre 1% e 90%.', 400);
  const m = meses === null || meses === '' || meses === undefined ? null : parseInt(meses, 10);
  if (m !== null && !(m > 0 && m <= 60)) throw new ErroAsaas('A duração precisa ficar entre 1 e 60 meses, ou "para sempre".', 400);
  if (validaAte && !/^\d{4}-\d{2}-\d{2}$/.test(validaAte)) throw new ErroAsaas('Data final da promoção inválida.', 400);
  const valor = { ativa: !!ativa, percentual: ativa ? centavos(pct) : 0, meses: m, validaAte: validaAte || null, atualizadaEm: new Date().toISOString() };
  await gravarConfig('promocao_novos', valor);
  return valor;
}
// Quem ainda nunca assinou ganha a promoção (se não tiver desconto pessoal)
function ganhaPromocao(linha, promo) {
  const l = linha || {};
  return !!promo && !(Number(l.desconto_percentual) > 0) && !l.asaas_assinatura_id && !l.pago_ate && !l.pago_ate_base;
}

/* ---------- quem tem acesso (função pura, testada à parte) ---------- */
function calcularAcesso(linha, { agora = new Date(), email = '', ligada = cobrancaLigada(), tolerancia = diasDeTolerancia(), cortesia = false } = {}) {
  const base = { cobranca: ligada, planos: listaDePlanos() };
  if (!ligada) return { ...base, liberado: true, plano: 'completo', status: 'livre', recursos: TODOS_OS_RECURSOS };
  if (cortesia || (email && emailsLiberados().includes(String(email).toLowerCase()))) {
    return { ...base, liberado: true, plano: 'completo', status: 'cortesia', recursos: TODOS_OS_RECURSOS };
  }
  const l = linha || {};
  const plano = PLANOS[l.plano] ? l.plano : 'completo';
  const ciclo = CICLOS[l.ciclo] ? l.ciclo : 'mensal';
  const pagoAteReal = [l.pago_ate, l.pago_ate_base].filter(Boolean).map((d) => new Date(d).getTime()).sort((a, b) => b - a)[0] || 0;
  const proximo = textoDeData(l.proximo_vencimento);
  const info = {
    ...base,
    plano,
    ciclo,
    status: l.status || 'teste',
    testeAte: l.teste_ate ? new Date(l.teste_ate).toISOString() : null,
    pagoAte: pagoAteReal ? new Date(pagoAteReal).toISOString() : null,
    proximoVencimento: proximo,
    temAssinatura: !!l.asaas_assinatura_id && l.status !== 'cancelada',
    linkPagamento: l.ultimo_link_pagamento || null,
    valorAtual: l.asaas_assinatura_id ? valorDevido(l, proximo, plano, ciclo) : null,
    // o desconto só aparece se ainda vale (pra quem assina: na próxima fatura)
    desconto: Number(l.desconto_percentual) > 0 && (!l.asaas_assinatura_id || descontoVale(l, proximo))
      ? { percentual: Number(l.desconto_percentual), ate: textoDeData(l.desconto_ate), meses: l.desconto_meses == null ? null : Number(l.desconto_meses), origem: l.desconto_origem || '' }
      : null,
  };
  if (l.status === 'cortesia') return { ...info, liberado: true, recursos: TODOS_OS_RECURSOS };
  if (pagoAteReal && agora.getTime() <= pagoAteReal + tolerancia * DIA) {
    return { ...info, liberado: true, recursos: PLANOS[plano].recursos, emTolerancia: agora.getTime() > pagoAteReal };
  }
  const testeAte = l.teste_ate ? new Date(l.teste_ate).getTime() : 0;
  if (testeAte && agora.getTime() <= testeAte) {
    // no período grátis a pessoa experimenta tudo, mesmo que já tenha escolhido o Essencial
    return { ...info, liberado: true, emTeste: true, diasDeTeste: Math.max(0, Math.ceil((testeAte - agora.getTime()) / DIA)), recursos: TODOS_OS_RECURSOS };
  }
  // assinou e a 1ª fatura vence no fim do teste: ganha os mesmos dias de tolerância pra pagar
  if (testeAte && info.temAssinatura && agora.getTime() <= testeAte + tolerancia * DIA) {
    return { ...info, liberado: true, emTolerancia: true, recursos: PLANOS[plano].recursos };
  }
  const motivo = l.status === 'cancelada' ? 'cancelada' : pagoAteReal ? 'pagamento_atrasado' : l.asaas_assinatura_id ? 'aguardando_pagamento' : 'teste_acabou';
  return { ...info, liberado: false, motivo, recursos: { ia: false, googleAgenda: false } };
}

// Preços que ESTA pessoa veria em cada plano e ciclo (com desconto pessoal ou promoção)
async function precosPara(linha) {
  const promo = await promocaoAtual().catch(() => null);
  let l = linha || {};
  let origem = Number(l.desconto_percentual) > 0 ? (l.desconto_origem || 'pessoal') : null;
  if (!origem && ganhaPromocao(l, promo)) {
    l = { ...l, desconto_percentual: promo.percentual, desconto_meses: promo.meses, desconto_ate: null };
    origem = 'promocao';
  }
  const pct = Number(l.desconto_percentual) || 0;
  const meses = l.desconto_meses == null ? null : Number(l.desconto_meses);
  const ate = textoDeData(l.desconto_ate);
  const ofertas = {};
  for (const plano of Object.keys(PLANOS)) {
    ofertas[plano] = {};
    for (const ciclo of Object.keys(CICLOS)) {
      const base = valorBase(l, plano, ciclo);
      const ativo = pct > 0 && (!ate || hojeEmBrasilia() < ate);
      ofertas[plano][ciclo] = { base, final: ativo ? comDesconto(base, pct) : base };
    }
  }
  return { ofertas, desconto: pct > 0 ? { percentual: pct, meses, ate, origem } : null };
}

/* ---------- banco ---------- */
async function linhaDe(userId) {
  const { rows } = await query('SELECT * FROM assinaturas WHERE user_id = $1', [userId]);
  return rows[0] || null;
}
// O período grátis começa no primeiro acesso com a cobrança ligada — assim quem já usava o
// sistema antes de ligar a cobrança também ganha os dias de teste, em vez de ser bloqueado na hora.
async function garantirLinha(userId) {
  const existente = await linhaDe(userId);
  if (existente) return existente;
  const { rows } = await query(
    `INSERT INTO assinaturas (user_id, teste_ate) VALUES ($1, now() + make_interval(secs => $2))
     ON CONFLICT (user_id) DO NOTHING RETURNING *`,
    [userId, Math.round(diasDeTeste() * 86400)]
  );
  return rows[0] || linhaDe(userId);
}

const cache = new Map(); // userId -> { ate, valor }
const CACHE_MS = 30 * 1000;
function esquecer(userId) { cache.delete(String(userId)); }

async function situacaoDe(userId, email) {
  const chave = String(userId);
  const guardado = cache.get(chave);
  if (guardado && guardado.ate > Date.now() && guardado.email === email) return guardado.valor;
  let valor;
  if (!cobrancaLigada()) valor = calcularAcesso(null, { ligada: false });
  else if (email && (emailsLiberados().includes(String(email).toLowerCase()) || await ehDono(email))) valor = calcularAcesso(null, { email, cortesia: true }); // donos nunca pagam
  else valor = calcularAcesso(await garantirLinha(userId), { email });
  cache.set(chave, { ate: Date.now() + CACHE_MS, valor, email });
  return valor;
}

/* ---------- sincronizar com o Asaas (a fonte da verdade) ---------- */
const PAGAS = new Set(['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH']);
const EM_ABERTO = new Set(['PENDING', 'OVERDUE']);

// Recebe a assinatura e as cobranças como o Asaas devolveu e diz como a linha deve ficar.
// mesesPorCobranca: 1 no mensal, 12 no anual (usado quando a assinatura já não existe no Asaas)
function situacaoPelasCobrancas(assinatura, cobrancas, mesesPorCobranca = 1) {
  const meses = assinatura && assinatura.cycle === 'YEARLY' ? 12 : assinatura && assinatura.cycle ? 1 : mesesPorCobranca;
  const pagas = cobrancas.filter((c) => PAGAS.has(c.status) && c.dueDate);
  const abertas = cobrancas.filter((c) => EM_ABERTO.has(c.status) && !c.deleted).sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)));
  let pagoAteData = null;
  for (const c of pagas) {
    const fim = somarMeses(String(c.dueDate).slice(0, 10), meses);
    if (!pagoAteData || fim > pagoAteData) pagoAteData = fim;
  }
  const cancelada = !assinatura || assinatura.deleted || (assinatura.status && assinatura.status !== 'ACTIVE');
  let status;
  if (cancelada) status = 'cancelada';
  else if (abertas.some((c) => c.status === 'OVERDUE')) status = 'atrasada';
  else if (pagas.length) status = 'ativa';
  else status = 'aguardando';
  const proxima = abertas[0] || null;
  return {
    status,
    pagoAte: pagoAteData ? fimDoDia(pagoAteData) : null,
    // sem fatura em aberto, o próximo vencimento é o do Asaas, mas nunca antes do fim do período pago
    proximoVencimento: proxima ? String(proxima.dueDate).slice(0, 10)
      : cancelada ? null
      : [assinatura && assinatura.nextDueDate, pagoAteData].filter(Boolean).sort().pop() || null,
    link: proxima ? proxima.invoiceUrl || null : null,
    valorProxima: proxima ? Number(proxima.value) : (assinatura && !cancelada ? Number(assinatura.value) : null),
  };
}

async function sincronizar(userId, { semAjuste = false } = {}) {
  const linha = await linhaDe(userId);
  if (!linha || !linha.asaas_assinatura_id) return linha;
  let assinatura = null;
  try {
    assinatura = await asaas.buscarAssinatura(linha.asaas_assinatura_id);
  } catch (err) {
    if (err.status !== 404) throw err; // 404 = apagada no Asaas: trata como cancelada
  }
  const apagada = !assinatura || assinatura.deleted;
  let lista = { data: [] };
  try {
    lista = await asaas.cobrancasDaAssinatura(linha.asaas_assinatura_id);
  } catch (err) {
    // assinatura apagada no Asaas pode não listar mais as cobranças: segue com o que já sabia
    if (!(apagada && err.status === 404)) throw err;
  }
  const cobrancas = (lista && lista.data) || [];
  const novo = situacaoPelasCobrancas(assinatura, cobrancas, linha.ciclo === 'anual' ? 12 : 1);
  // Cancelou: o mês já pago continua valendo. Se o Asaas não devolver mais as cobranças de uma
  // assinatura apagada, mantém o "pago até" que já estava gravado (em vez de zerar).
  if (apagada && !cobrancas.length) novo.pagoAte = linha.pago_ate;
  // assinatura nova (troca de plano/ciclo) sem cobrança paga ainda, mas com período pago antes: está em dia
  if (novo.status === 'aguardando' && linha.pago_ate_base && new Date(linha.pago_ate_base).getTime() > Date.now()) novo.status = 'ativa';
  // Com as cobranças em mãos, o "pago até" é o que elas dizem: um estorno ou chargeback tira a
  // cobrança da lista de pagas e o acesso pago some junto. O período pago numa assinatura
  // anterior (pago_ate_base) é somado à parte, em calcularAcesso.
  const { rows } = await query(
    `UPDATE assinaturas SET status = $2, pago_ate = $3, proximo_vencimento = $4,
       ultimo_link_pagamento = $5, updated_at = now()
     WHERE user_id = $1 AND status <> 'cortesia' RETURNING *`,
    [userId, novo.status, novo.pagoAte, novo.proximoVencimento, novo.link]
  );
  esquecer(userId);
  const atual = rows[0] || linha;

  // pagamento novo confirmado: e-mail de confirmação (se o Livro-Caixa é quem avisa)
  const antes = linha.pago_ate ? new Date(linha.pago_ate).getTime() : 0;
  const depois = novo.pagoAte ? new Date(novo.pagoAte).getTime() : 0;
  if (depois > antes) {
    try { require('./avisosAssinatura').avisarPagamentoConfirmado(userId, novo.pagoAte).catch(() => {}); } catch (e) { /* sem e-mail */ }
  }

  // assinatura de antes desta versão: guarda o preço da tabela de agora como o contratado
  if (!apagada && atual.valor_contratado == null && PLANOS[atual.plano]) {
    const contratado = valorDoPlano(atual.plano, atual.ciclo || 'mensal');
    await query('UPDATE assinaturas SET valor_contratado = $2 WHERE user_id = $1 AND valor_contratado IS NULL', [userId, contratado]);
    atual.valor_contratado = contratado;
  }

  if (!semAjuste && !apagada && atual.status !== 'cancelada') {
    // avisos do Asaas ligados/desligados conforme quem avisa as cobranças
    const desligar = avisosProprios();
    if (atual.asaas_cliente_id && !!atual.avisos_asaas_desligados !== desligar) {
      try {
        await asaas.atualizarCliente(atual.asaas_cliente_id, { notificationDisabled: desligar });
        await query('UPDATE assinaturas SET avisos_asaas_desligados = $2 WHERE user_id = $1', [userId, desligar]);
      } catch (err) { console.error('Falha ao ajustar os avisos do Asaas:', err.message); }
    }
    // o valor da próxima cobrança está certo? (desconto que acabou, desconto novo, troca)
    const devido = valorDevido(atual, novo.proximoVencimento);
    if (novo.valorProxima != null && Math.abs(novo.valorProxima - devido) > 0.005) {
      return recriarAssinatura(userId, {});
    }
  }
  return atual;
}

/* ---------- trocar a assinatura por uma nova (quando o valor muda) ---------- */
// Cria a nova primeiro e só apaga a antiga depois: nunca fica sem assinatura, e se apagar a
// antiga falhar, desfaz a nova (pra ninguém receber duas cobranças).
async function recriarAssinatura(userId, { plano, ciclo }) {
  const linha = await linhaDe(userId);
  if (!linha || !linha.asaas_assinatura_id || linha.status === 'cancelada' || !linha.asaas_cliente_id) {
    throw new ErroAsaas('Não há assinatura ativa para alterar.', 400);
  }
  const novoPlano = PLANOS[plano] ? plano : linha.plano;
  const novoCiclo = CICLOS[ciclo] ? ciclo : (linha.ciclo || 'mensal');
  const mudouContrato = novoPlano !== linha.plano || novoCiclo !== (linha.ciclo || 'mensal');
  // começa no vencimento da fatura em aberto, ou no fim do período pago — nunca no passado
  const hoje = hojeEmBrasilia();
  const fimPago = dataDeBrasilia([linha.pago_ate, linha.pago_ate_base].filter(Boolean).sort((a, b) => new Date(b) - new Date(a))[0]);
  const proximo = textoDeData(linha.proximo_vencimento);
  // trocar o ciclo começa no fim do que já foi pago; trocar só o valor, na próxima fatura
  const inicio = [hoje, novoCiclo !== (linha.ciclo || 'mensal') ? (fimPago || proximo) : (proximo || fimPago)].filter(Boolean).sort().pop();
  const contratado = mudouContrato ? valorDoPlano(novoPlano, novoCiclo) : (linha.valor_contratado ? centavos(linha.valor_contratado) : valorDoPlano(novoPlano, novoCiclo));
  const ref = { ...linha, plano: novoPlano, ciclo: novoCiclo, valor_contratado: contratado };
  const valor = valorDevido(ref, inicio, novoPlano, novoCiclo);
  const nova = await criarNoAsaas(linha.asaas_cliente_id, userId, { plano: novoPlano, ciclo: novoCiclo, valor, vencimento: inicio });
  const antiga = linha.asaas_assinatura_id;
  await query(
    `UPDATE assinaturas SET asaas_assinatura_id = $2, plano = $3, ciclo = $4, valor_contratado = $5,
       pago_ate_base = GREATEST(pago_ate, pago_ate_base), pago_ate = NULL, proximo_vencimento = $6, updated_at = now()
     WHERE user_id = $1`,
    [userId, nova.id, novoPlano, novoCiclo, contratado, inicio]
  );
  try {
    await asaas.cancelarAssinatura(antiga);
  } catch (err) {
    if (err.status !== 404) {
      // não deu pra apagar a antiga: desfaz tudo pra não cobrar duas vezes
      await asaas.cancelarAssinatura(nova.id).catch(() => {});
      await query(
        `UPDATE assinaturas SET asaas_assinatura_id = $2, plano = $3, ciclo = $4, valor_contratado = $5,
           pago_ate = $6, pago_ate_base = $7, proximo_vencimento = $8, updated_at = now() WHERE user_id = $1`,
        [userId, antiga, linha.plano, linha.ciclo, linha.valor_contratado, linha.pago_ate, linha.pago_ate_base, linha.proximo_vencimento]
      );
      throw new ErroAsaas('Não foi possível concluir a troca agora. Nada mudou; tente de novo em instantes.', 0);
    }
  }
  return sincronizar(userId, { semAjuste: true });
}

/* ---------- ações da pessoa ---------- */
const travas = new Set(); // evita duplo clique criando duas assinaturas
async function comTrava(userId, fn) {
  if (travas.has(userId)) throw new ErroAsaas('Já estamos processando seu pedido. Aguarde alguns segundos.', 409);
  travas.add(userId);
  try { return await fn(); } finally { travas.delete(userId); }
}

function retorno() {
  const url = process.env.ASSINATURA_URL_RETORNO;
  return url ? { callback: { successUrl: url, autoRedirect: true } } : {};
}

async function criarNoAsaas(clienteId, userId, { plano, ciclo, valor, vencimento }) {
  const pedido = {
    customer: clienteId,
    billingType: 'UNDEFINED', // a pessoa escolhe na fatura: Pix, boleto ou cartão
    value: valor,
    nextDueDate: vencimento,
    cycle: CICLOS[ciclo].asaas,
    description: `Livro-Caixa — plano ${PLANOS[plano].nome} (${CICLOS[ciclo].nome})`,
    externalReference: `${userId}:${plano}:${ciclo}`,
  };
  try {
    return await asaas.criarAssinatura({ ...pedido, ...retorno() });
  } catch (err) {
    // URL de retorno fora do domínio cadastrado no Asaas: assina sem ela em vez de falhar
    if (retorno().callback && err.status === 400 && /callback|successUrl|dom[ií]nio/i.test(err.message)) {
      console.warn('Asaas recusou ASSINATURA_URL_RETORNO (confira o domínio cadastrado na conta):', err.message);
      return asaas.criarAssinatura(pedido);
    }
    throw err;
  }
}

async function assinar(userId, { plano, ciclo = 'mensal', nome, cpfCnpj, email }) {
  if (!cobrancaLigada()) throw new ErroAsaas('A cobrança não está ligada neste servidor.', 400);
  if (!PLANOS[plano]) throw new ErroAsaas('Escolha um plano válido.', 400);
  if (!CICLOS[ciclo]) throw new ErroAsaas('Escolha mensal ou anual.', 400);
  const documento = String(cpfCnpj || '').replace(/\D/g, '');
  if (!cpfCnpjValido(documento)) throw new ErroAsaas('CPF ou CNPJ inválido. Confira os números.', 400);
  const nomeLimpo = String(nome || '').trim().slice(0, 120);
  if (nomeLimpo.length < 3) throw new ErroAsaas('Informe o nome completo (ou a razão social).', 400);
  return comTrava(userId, async () => {
    let linha = await garantirLinha(userId);
    if (linha.status === 'cortesia') throw new ErroAsaas('Sua conta já está liberada sem cobrança.', 400);
    if (linha.asaas_assinatura_id && linha.status !== 'cancelada') {
      linha = await sincronizar(userId, { semAjuste: true });
      if (linha.status !== 'cancelada') throw new ErroAsaas('Você já tem uma assinatura. Para mudar, use "Trocar de plano".', 409);
    }
    const desligarAvisos = avisosProprios();
    let clienteId = linha.asaas_cliente_id;
    if (clienteId) {
      await asaas.atualizarCliente(clienteId, { name: nomeLimpo, cpfCnpj: documento, email, notificationDisabled: desligarAvisos });
    } else {
      const cliente = await asaas.criarCliente({ name: nomeLimpo, cpfCnpj: documento, email, externalReference: String(userId), notificationDisabled: desligarAvisos });
      clienteId = cliente.id;
    }
    await query('UPDATE assinaturas SET asaas_cliente_id = $2, avisos_asaas_desligados = $3, updated_at = now() WHERE user_id = $1', [userId, clienteId, desligarAvisos]);

    // 1º vencimento: hoje, ou o fim do teste / do período já pago, o que vier depois
    const hoje = hojeEmBrasilia();
    const vencimento = [hoje, dataDeBrasilia(linha.teste_ate), dataDeBrasilia(linha.pago_ate), dataDeBrasilia(linha.pago_ate_base)].filter(Boolean).sort().pop();

    // desconto: o pessoal (dado pelo dono) ou a promoção para novos; a contagem dos meses começa agora
    const promo = await promocaoAtual().catch(() => null);
    let desconto = { percentual: Number(linha.desconto_percentual) || 0, meses: linha.desconto_meses, ate: textoDeData(linha.desconto_ate), origem: linha.desconto_origem || '' };
    if (!(desconto.percentual > 0) && ganhaPromocao(linha, promo)) {
      desconto = { percentual: Number(promo.percentual), meses: promo.meses, ate: null, origem: 'promocao' };
    }
    if (desconto.percentual > 0 && !desconto.ate && desconto.meses != null) desconto.ate = somarMeses(vencimento, Number(desconto.meses));

    const contratado = valorDoPlano(plano, ciclo);
    const ref = { ...linha, plano, ciclo, valor_contratado: contratado, desconto_percentual: desconto.percentual, desconto_ate: desconto.ate };
    const valor = valorDevido(ref, vencimento, plano, ciclo);
    const nova = await criarNoAsaas(clienteId, userId, { plano, ciclo, valor, vencimento });
    await query(
      `UPDATE assinaturas SET plano = $2, ciclo = $3, status = 'aguardando', asaas_assinatura_id = $4,
         proximo_vencimento = $5, valor_contratado = $6, desconto_percentual = $7, desconto_meses = $8,
         desconto_ate = $9, desconto_origem = $10, pago_ate_base = GREATEST(pago_ate, pago_ate_base), pago_ate = NULL,
         updated_at = now() WHERE user_id = $1`,
      [userId, plano, ciclo, nova.id, vencimento, contratado, desconto.percentual, desconto.meses == null ? null : desconto.meses,
        desconto.percentual > 0 ? desconto.ate : null, desconto.percentual > 0 ? desconto.origem : '']
    );
    const atualizada = await sincronizar(userId, { semAjuste: true });
    return { link: atualizada && atualizada.ultimo_link_pagamento, vencimento, valor };
  });
}

async function trocarPlano(userId, { plano, ciclo }) {
  return comTrava(userId, async () => {
    const linha = await garantirLinha(userId);
    if (!linha.asaas_assinatura_id || linha.status === 'cancelada') {
      throw new ErroAsaas('Você ainda não tem assinatura ativa. Escolha um plano para assinar.', 400);
    }
    const novoPlano = PLANOS[plano] ? plano : linha.plano;
    const novoCiclo = CICLOS[ciclo] ? ciclo : (linha.ciclo || 'mensal');
    if (!PLANOS[plano] && plano) throw new ErroAsaas('Escolha um plano válido.', 400);
    if (novoPlano === linha.plano && novoCiclo === (linha.ciclo || 'mensal')) return { plano: novoPlano, ciclo: novoCiclo };
    await sincronizar(userId, { semAjuste: true }); // parte do estado mais recente do Asaas
    await recriarAssinatura(userId, { plano: novoPlano, ciclo: novoCiclo });
    return { plano: novoPlano, ciclo: novoCiclo };
  });
}

async function cancelar(userId) {
  return comTrava(userId, async () => {
    const linha = await garantirLinha(userId);
    if (!linha.asaas_assinatura_id || linha.status === 'cancelada') throw new ErroAsaas('Não há assinatura ativa para cancelar.', 400);
    try {
      await asaas.cancelarAssinatura(linha.asaas_assinatura_id);
    } catch (err) {
      if (err.status !== 404) throw err;
    }
    await query(`UPDATE assinaturas SET status = 'cancelada', proximo_vencimento = NULL, ultimo_link_pagamento = NULL, updated_at = now() WHERE user_id = $1`, [userId]);
    esquecer(userId);
    return { pagoAte: linha.pago_ate };
  });
}

/* ---------- desconto pessoal (dado pelo dono) ---------- */
// percentual 0 = tira o desconto. meses null = para sempre.
async function definirDescontoPessoal(userId, { percentual, meses }) {
  const pct = Number(percentual) || 0;
  if (pct < 0 || pct > 100) throw new ErroAsaas('O desconto precisa ficar entre 0% e 100%.', 400);
  const m = meses === null || meses === '' || meses === undefined ? null : parseInt(meses, 10);
  if (m !== null && !(m > 0 && m <= 120)) throw new ErroAsaas('A duração precisa ficar entre 1 e 120 meses, ou "para sempre".', 400);
  if (pct === 100) throw new ErroAsaas('Para liberar de graça, adicione o e-mail em ASSINATURA_LIBERADOS ou como dono.', 400);
  return comTrava(userId, async () => {
    const linha = await garantirLinha(userId);
    const assinando = !!linha.asaas_assinatura_id && linha.status !== 'cancelada';
    // já assina: os meses contam a partir da próxima fatura; ainda não: a partir da 1ª fatura
    const ate = pct > 0 && m !== null && assinando ? somarMeses(textoDeData(linha.proximo_vencimento) || hojeEmBrasilia(), m) : null;
    await query(
      `UPDATE assinaturas SET desconto_percentual = $2, desconto_meses = $3, desconto_ate = $4, desconto_origem = $5, updated_at = now()
       WHERE user_id = $1`,
      [userId, pct, pct > 0 ? m : null, ate, pct > 0 ? 'pessoal' : '']
    );
    esquecer(userId);
    // já assina: ajusta o valor da próxima fatura agora
    if (assinando && cobrancaLigada()) await sincronizar(userId);
    return linhaDe(userId);
  });
}

/* ---------- avisos do Asaas (webhook) ---------- */
// Grava o id do aviso; devolve false se ele já tinha chegado antes (o Asaas pode repetir)
async function registrarEvento(evento) {
  const id = String(evento.id || '');
  if (!id) return false;
  const { rows } = await query(
    `INSERT INTO assinatura_eventos (id, tipo, dados) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING RETURNING id`,
    [id, String(evento.event || ''), JSON.stringify(evento)]
  );
  return rows.length > 0;
}

// Descobre de quem é o aviso e sincroniza essa pessoa com o Asaas
async function processarEvento(evento) {
  const idAssinatura = (evento.payment && evento.payment.subscription) || (evento.subscription && evento.subscription.id) || null;
  if (!idAssinatura) return null; // cobrança avulsa, não é do Livro-Caixa
  const { rows } = await query('SELECT user_id FROM assinaturas WHERE asaas_assinatura_id = $1', [idAssinatura]);
  if (!rows.length) return null; // inclusive avisos de uma assinatura antiga, já trocada
  const userId = rows[0].user_id;
  await query('UPDATE assinatura_eventos SET user_id = $2 WHERE id = $1', [String(evento.id), userId]);
  await sincronizar(userId);
  return userId;
}

/* ---------- rede de segurança: confere quem pode ter mudado ---------- */
// Se algum aviso se perder, isto corrige sozinho. Roda de hora em hora pelo server.js.
const conferencia = { ultima: null, conferidas: 0, falhas: 0, ultimoUsoDaChave: 0 };
async function sincronizarPendentes() {
  if (!cobrancaLigada()) return 0;
  conferencia.ultima = new Date();
  const { rows } = await query(
    `SELECT user_id FROM assinaturas WHERE asaas_assinatura_id IS NOT NULL AND (
       status IN ('aguardando', 'atrasada')
       OR (status = 'ativa' AND (pago_ate IS NULL OR pago_ate < now() + interval '2 days'))
       OR (status = 'ativa' AND desconto_ate IS NOT NULL AND desconto_ate <= proximo_vencimento + 1
           AND updated_at < now() - interval '6 hours')
     ) ORDER BY updated_at LIMIT 200`
  );
  let n = 0;
  for (const r of rows) {
    try { await sincronizar(r.user_id); n++; } catch (err) { conferencia.falhas++; console.error('Falha ao sincronizar assinatura:', err.message); }
  }
  conferencia.conferidas = n;
  // uma chamada por dia ao Asaas: chave sem uso por 3 meses é desativada, e por 6, perdida de vez
  if (!conferencia.ultimoUsoDaChave || Date.now() - conferencia.ultimoUsoDaChave > DIA) {
    try { await asaas.manterChaveAtiva(); conferencia.ultimoUsoDaChave = Date.now(); }
    catch (err) { conferencia.falhas++; console.error('Falha ao usar a chave do Asaas (confira se ela continua ativa):', err.message); }
  }
  // avisos guardados por 90 dias bastam pra conferir qualquer coisa
  await query("DELETE FROM assinatura_eventos WHERE recebido_em < now() - interval '90 days'").catch(() => {});
  return n;
}

module.exports = {
  PLANOS, CICLOS, listaDePlanos, valorDoPlano, valorDevido, descontoVale, cobrancaLigada, avisosProprios,
  calcularAcesso, situacaoDe, esquecer, precosPara,
  cpfCnpjValido, somarUmMes, somarMeses, hojeEmBrasilia, situacaoPelasCobrancas,
  sincronizar, assinar, trocarPlano, cancelar, definirDescontoPessoal,
  lerConfig, definirPromocao, promocaoAtual, promocaoValida, ganhaPromocao,
  registrarEvento, processarEvento, sincronizarPendentes,
  conferencia, emailsLiberados, diasDeTolerancia, diasDeTeste,
};
