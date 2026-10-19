/* Assinatura paga: planos, quem tem acesso e a ligação com o Asaas.

   Regra de ouro: quem diz o que foi pago é o Asaas. O servidor nunca marca nada como pago
   por conta própria nem confia no conteúdo do aviso (webhook): ao receber qualquer aviso,
   ele CONSULTA o Asaas e recalcula a situação a partir das cobranças que o Asaas devolveu.

   Variáveis de ambiente opcionais (além das do utils/asaas.js):
     ASSINATURA_DIAS_TESTE ......... dias grátis a partir do primeiro acesso (padrão 7)
     ASSINATURA_TOLERANCIA_DIAS .... dias depois do vencimento antes de bloquear (padrão 3)
     ASSINATURA_LIBERADOS .......... e-mails sem cobrança, separados por vírgula (o seu, por ex.)
     ASSINATURA_VALOR_ESSENCIAL .... preço do Essencial (padrão 29.90)
     ASSINATURA_VALOR_COMPLETO ..... preço do Completo (padrão 39.90)
     ASSINATURA_URL_RETORNO ........ pra onde o Asaas manda a pessoa depois de pagar
                                     (precisa ser do domínio cadastrado na sua conta Asaas)
     ASSINATURA_DESLIGADA=1 ........ desliga a cobrança na hora (todo mundo liberado), sem apagar nada */

const { query } = require('../db/pool');
const { asaas, asaasConfigurado, ErroAsaas } = require('./asaas');
const { ehDono } = require('./donos');

const DIA = 24 * 60 * 60 * 1000;

const PLANOS = {
  essencial: {
    nome: 'Essencial',
    valorPadrao: 29.9,
    itens: ['CRM completo: leads, funil em Kanban, clientes e histórico', 'Controle financeiro', 'Celular e computador'],
    recursos: { ia: false, whatsapp: false, googleAgenda: false },
  },
  completo: {
    nome: 'Completo',
    valorPadrao: 39.9,
    itens: ['Tudo do Essencial', 'Assistente com IA (CRM e financeiro)', 'Integração com a API do WhatsApp', 'Integração com o Google Agenda'],
    recursos: { ia: true, whatsapp: true, googleAgenda: true },
  },
};
const TODOS_OS_RECURSOS = { ia: true, whatsapp: true, googleAgenda: true };

const numeroDoAmbiente = (nome, padrao) => {
  const v = parseFloat(String(process.env[nome] || '').replace(',', '.'));
  return Number.isFinite(v) && v >= 0 ? v : padrao;
};
const valorDoPlano = (plano) => Math.round(numeroDoAmbiente(`ASSINATURA_VALOR_${plano.toUpperCase()}`, PLANOS[plano].valorPadrao) * 100) / 100;
const diasDeTeste = () => numeroDoAmbiente('ASSINATURA_DIAS_TESTE', 7);
const diasDeTolerancia = () => numeroDoAmbiente('ASSINATURA_TOLERANCIA_DIAS', 3);
const emailsLiberados = () => String(process.env.ASSINATURA_LIBERADOS || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
const cobrancaLigada = () => asaasConfigurado() && process.env.ASSINATURA_DESLIGADA !== '1';

function listaDePlanos() {
  return Object.entries(PLANOS).map(([id, p]) => ({ id, nome: p.nome, valor: valorDoPlano(id), itens: p.itens, recursos: p.recursos }));
}

/* ---------- datas (sempre no fuso de Brasília) ---------- */
function hojeEmBrasilia(agora = new Date()) {
  return new Date(agora.getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
function dataDeBrasilia(ts) { return ts ? hojeEmBrasilia(new Date(ts)) : null; }
// "2026-01-31" + 1 mês = "2026-02-28" (não pula pra março)
function somarUmMes(data) {
  const [a, m, d] = data.split('-').map(Number);
  const ultimoDia = new Date(Date.UTC(a, m + 1, 0)).getUTCDate();
  const alvo = new Date(Date.UTC(a, m, Math.min(d, ultimoDia)));
  return alvo.toISOString().slice(0, 10);
}
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

/* ---------- quem tem acesso (função pura, testada à parte) ---------- */
function calcularAcesso(linha, { agora = new Date(), email = '', ligada = cobrancaLigada(), tolerancia = diasDeTolerancia(), cortesia = false } = {}) {
  const base = { cobranca: ligada, planos: listaDePlanos() };
  if (!ligada) return { ...base, liberado: true, plano: 'completo', status: 'livre', recursos: TODOS_OS_RECURSOS };
  if (cortesia || (email && emailsLiberados().includes(String(email).toLowerCase()))) {
    return { ...base, liberado: true, plano: 'completo', status: 'cortesia', recursos: TODOS_OS_RECURSOS };
  }
  const l = linha || {};
  const plano = PLANOS[l.plano] ? l.plano : 'completo';
  const info = {
    ...base,
    plano,
    status: l.status || 'teste',
    testeAte: l.teste_ate ? new Date(l.teste_ate).toISOString() : null,
    pagoAte: l.pago_ate ? new Date(l.pago_ate).toISOString() : null,
    proximoVencimento: l.proximo_vencimento ? String(l.proximo_vencimento instanceof Date ? l.proximo_vencimento.toISOString().slice(0, 10) : l.proximo_vencimento).slice(0, 10) : null,
    temAssinatura: !!l.asaas_assinatura_id && l.status !== 'cancelada',
    linkPagamento: l.ultimo_link_pagamento || null,
  };
  if (l.status === 'cortesia') return { ...info, liberado: true, recursos: TODOS_OS_RECURSOS };
  const pagoAte = l.pago_ate ? new Date(l.pago_ate).getTime() : 0;
  if (pagoAte && agora.getTime() <= pagoAte + tolerancia * DIA) {
    return { ...info, liberado: true, recursos: PLANOS[plano].recursos, emTolerancia: agora.getTime() > pagoAte };
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
  const motivo = l.status === 'cancelada' ? 'cancelada' : pagoAte ? 'pagamento_atrasado' : l.asaas_assinatura_id ? 'aguardando_pagamento' : 'teste_acabou';
  return { ...info, liberado: false, motivo, recursos: { ia: false, whatsapp: false, googleAgenda: false } };
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

// Recebe a assinatura e as cobranças como o Asaas devolveu e diz como a linha deve ficar
function situacaoPelasCobrancas(assinatura, cobrancas) {
  const pagas = cobrancas.filter((c) => PAGAS.has(c.status) && c.dueDate);
  const abertas = cobrancas.filter((c) => EM_ABERTO.has(c.status) && !c.deleted).sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)));
  let pagoAteData = null;
  for (const c of pagas) {
    const fim = somarUmMes(String(c.dueDate).slice(0, 10));
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
  };
}

async function sincronizar(userId) {
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
  const novo = situacaoPelasCobrancas(assinatura, cobrancas);
  // Cancelou: o mês já pago continua valendo. Se o Asaas não devolver mais as cobranças de uma
  // assinatura apagada, mantém o "pago até" que já estava gravado (em vez de zerar).
  if (apagada && !cobrancas.length) novo.pagoAte = linha.pago_ate;
  // Com as cobranças em mãos, o "pago até" é sempre o que elas dizem: um estorno ou chargeback
  // tira a cobrança da lista de pagas e o acesso pago some junto.
  const { rows } = await query(
    `UPDATE assinaturas SET status = $2, pago_ate = $3, proximo_vencimento = $4,
       ultimo_link_pagamento = $5, updated_at = now()
     WHERE user_id = $1 AND status <> 'cortesia' RETURNING *`,
    [userId, novo.status, novo.pagoAte, novo.proximoVencimento, novo.link]
  );
  esquecer(userId);
  return rows[0] || linha;
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

async function assinar(userId, { plano, nome, cpfCnpj, email }) {
  if (!cobrancaLigada()) throw new ErroAsaas('A cobrança não está ligada neste servidor.', 400);
  if (!PLANOS[plano]) throw new ErroAsaas('Escolha um plano válido.', 400);
  const documento = String(cpfCnpj || '').replace(/\D/g, '');
  if (!cpfCnpjValido(documento)) throw new ErroAsaas('CPF ou CNPJ inválido. Confira os números.', 400);
  const nomeLimpo = String(nome || '').trim().slice(0, 120);
  if (nomeLimpo.length < 3) throw new ErroAsaas('Informe o nome completo (ou a razão social).', 400);
  return comTrava(userId, async () => {
    let linha = await garantirLinha(userId);
    if (linha.status === 'cortesia') throw new ErroAsaas('Sua conta já está liberada sem cobrança.', 400);
    if (linha.asaas_assinatura_id && linha.status !== 'cancelada') {
      linha = await sincronizar(userId);
      if (linha.status !== 'cancelada') throw new ErroAsaas('Você já tem uma assinatura. Para mudar, use "Trocar de plano".', 409);
    }
    let clienteId = linha.asaas_cliente_id;
    if (clienteId) {
      await asaas.atualizarCliente(clienteId, { name: nomeLimpo, cpfCnpj: documento, email });
    } else {
      const cliente = await asaas.criarCliente({ name: nomeLimpo, cpfCnpj: documento, email, externalReference: String(userId) });
      clienteId = cliente.id;
      await query('UPDATE assinaturas SET asaas_cliente_id = $2, updated_at = now() WHERE user_id = $1', [userId, clienteId]);
    }
    // 1º vencimento: hoje, ou o fim do teste / do período já pago, o que vier depois
    const hoje = hojeEmBrasilia();
    const candidatas = [hoje, dataDeBrasilia(linha.teste_ate), dataDeBrasilia(linha.pago_ate)].filter(Boolean);
    const vencimento = candidatas.sort().pop();
    const pedido = {
      customer: clienteId,
      billingType: 'UNDEFINED', // a pessoa escolhe na fatura: Pix, boleto ou cartão
      value: valorDoPlano(plano),
      nextDueDate: vencimento,
      cycle: 'MONTHLY',
      description: `Livro-Caixa — plano ${PLANOS[plano].nome}`,
      externalReference: `${userId}:${plano}`,
    };
    let assinatura;
    try {
      assinatura = await asaas.criarAssinatura({ ...pedido, ...retorno() });
    } catch (err) {
      // URL de retorno fora do domínio cadastrado no Asaas: assina sem ela em vez de falhar
      if (retorno().callback && err.status === 400 && /callback|successUrl|dom[ií]nio/i.test(err.message)) {
        console.warn('Asaas recusou ASSINATURA_URL_RETORNO (confira o domínio cadastrado na conta):', err.message);
        assinatura = await asaas.criarAssinatura(pedido);
      } else throw err;
    }
    await query(
      `UPDATE assinaturas SET plano = $2, status = 'aguardando', asaas_assinatura_id = $3,
         proximo_vencimento = $4, updated_at = now() WHERE user_id = $1`,
      [userId, plano, assinatura.id, vencimento]
    );
    const atualizada = await sincronizar(userId);
    return { link: atualizada && atualizada.ultimo_link_pagamento, vencimento };
  });
}

async function trocarPlano(userId, plano) {
  if (!PLANOS[plano]) throw new ErroAsaas('Escolha um plano válido.', 400);
  return comTrava(userId, async () => {
    const linha = await garantirLinha(userId);
    if (!linha.asaas_assinatura_id || linha.status === 'cancelada') {
      throw new ErroAsaas('Você ainda não tem assinatura ativa. Escolha um plano para assinar.', 400);
    }
    if (linha.plano === plano) return { plano };
    // muda o valor das próximas cobranças, inclusive a que já está em aberto
    await asaas.atualizarAssinatura(linha.asaas_assinatura_id, {
      value: valorDoPlano(plano),
      description: `Livro-Caixa — plano ${PLANOS[plano].nome}`,
      externalReference: `${userId}:${plano}`,
      updatePendingPayments: true,
    });
    await query('UPDATE assinaturas SET plano = $2, updated_at = now() WHERE user_id = $1', [userId, plano]);
    await sincronizar(userId);
    return { plano };
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
  if (!rows.length) return null;
  const userId = rows[0].user_id;
  await query('UPDATE assinatura_eventos SET user_id = $2 WHERE id = $1', [String(evento.id), userId]);
  await sincronizar(userId);
  return userId;
}

/* ---------- rede de segurança: confere quem pode ter mudado ---------- */
// Se algum aviso se perder, isto corrige sozinho. Roda de hora em hora pelo server.js.
const conferencia = { ultima: null, conferidas: 0, falhas: 0 };
async function sincronizarPendentes() {
  if (!cobrancaLigada()) return 0;
  conferencia.ultima = new Date();
  const { rows } = await query(
    `SELECT user_id FROM assinaturas WHERE asaas_assinatura_id IS NOT NULL AND (
       status IN ('aguardando', 'atrasada')
       OR (status = 'ativa' AND (pago_ate IS NULL OR pago_ate < now() + interval '2 days'))
     ) ORDER BY updated_at LIMIT 200`
  );
  let n = 0;
  for (const r of rows) {
    try { await sincronizar(r.user_id); n++; } catch (err) { conferencia.falhas++; console.error('Falha ao sincronizar assinatura:', err.message); }
  }
  conferencia.conferidas = n;
  // avisos guardados por 90 dias bastam pra conferir qualquer coisa
  await query("DELETE FROM assinatura_eventos WHERE recebido_em < now() - interval '90 days'").catch(() => {});
  return n;
}

module.exports = {
  PLANOS, listaDePlanos, valorDoPlano, cobrancaLigada, calcularAcesso, situacaoDe, esquecer,
  cpfCnpjValido, somarUmMes, hojeEmBrasilia, situacaoPelasCobrancas,
  sincronizar, assinar, trocarPlano, cancelar, registrarEvento, processarEvento, sincronizarPendentes,
  conferencia, emailsLiberados, diasDeTolerancia,
};
