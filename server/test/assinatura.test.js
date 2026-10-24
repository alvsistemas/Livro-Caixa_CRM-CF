const { test } = require('node:test');
const assert = require('node:assert/strict');
const A = require('../utils/assinatura');
const asaasMod = require('../utils/asaas');

const DIA = 86400000;
const agora = new Date('2026-11-10T12:00:00-03:00');
const em = (dias) => new Date(agora.getTime() + dias * DIA);

test('cobrança desligada: todo mundo liberado com tudo', () => {
  const s = A.calcularAcesso(null, { ligada: false });
  assert.equal(s.liberado, true);
  assert.equal(s.status, 'livre');
  assert.equal(s.recursos.ia, true);
});

test('teste grátis libera tudo, mesmo escolhendo o Essencial', () => {
  const s = A.calcularAcesso({ plano: 'essencial', status: 'teste', teste_ate: em(3) }, { agora, ligada: true, tolerancia: 3 });
  assert.equal(s.liberado, true);
  assert.equal(s.emTeste, true);
  assert.equal(s.diasDeTeste, 3);
  assert.equal(s.recursos.ia, true);
});

test('teste acabou sem assinar: bloqueia', () => {
  const s = A.calcularAcesso({ status: 'teste', teste_ate: em(-0.5) }, { agora, ligada: true, tolerancia: 3 });
  assert.equal(s.liberado, false);
  assert.equal(s.motivo, 'teste_acabou');
});

test('assinou no teste: ganha a tolerância pra pagar a 1ª fatura, depois bloqueia', () => {
  const linha = { plano: 'completo', status: 'aguardando', teste_ate: em(-2), asaas_assinatura_id: 'sub_1' };
  assert.equal(A.calcularAcesso(linha, { agora, ligada: true, tolerancia: 3 }).liberado, true);
  const depois = A.calcularAcesso({ ...linha, teste_ate: em(-4) }, { agora, ligada: true, tolerancia: 3 });
  assert.equal(depois.liberado, false);
  assert.equal(depois.motivo, 'aguardando_pagamento');
});

test('plano único: quem assinou o antigo Essencial passa a ter tudo', () => {
  const s = A.calcularAcesso({ plano: 'essencial', status: 'ativa', teste_ate: em(-30), pago_ate: em(10), asaas_assinatura_id: 'sub_1' }, { agora, ligada: true, tolerancia: 3 });
  assert.equal(s.liberado, true);
  assert.equal(s.plano, 'completo');
  assert.deepEqual(s.recursos, { ia: true, googleAgenda: true, restaurante: true, nfce: true, equipe: true, relatorios: true, automacoes: true });
  assert.deepEqual(A.listaDePlanos().map((p) => p.id), ['completo']);
});

test('vencido: libera nos dias de tolerância e bloqueia depois', () => {
  const linha = { plano: 'completo', status: 'atrasada', teste_ate: em(-60), pago_ate: em(-2), asaas_assinatura_id: 'sub_1' };
  const dentro = A.calcularAcesso(linha, { agora, ligada: true, tolerancia: 3 });
  assert.equal(dentro.liberado, true);
  assert.equal(dentro.emTolerancia, true);
  const fora = A.calcularAcesso({ ...linha, pago_ate: em(-4) }, { agora, ligada: true, tolerancia: 3 });
  assert.equal(fora.liberado, false);
  assert.equal(fora.motivo, 'pagamento_atrasado');
});

test('cancelou: o que já pagou continua valendo até o fim', () => {
  const linha = { plano: 'completo', status: 'cancelada', teste_ate: em(-60), pago_ate: em(5), asaas_assinatura_id: 'sub_1' };
  assert.equal(A.calcularAcesso(linha, { agora, ligada: true, tolerancia: 3 }).liberado, true);
  const fim = A.calcularAcesso({ ...linha, pago_ate: em(-10) }, { agora, ligada: true, tolerancia: 3 });
  assert.equal(fim.liberado, false);
  assert.equal(fim.motivo, 'cancelada');
});

test('e-mail liberado e cortesia não pagam', () => {
  process.env.ASSINATURA_LIBERADOS = 'Dono@Empresa.com, outro@x.com';
  try {
    assert.equal(A.calcularAcesso(null, { agora, ligada: true, email: 'dono@empresa.com' }).status, 'cortesia');
  } finally { delete process.env.ASSINATURA_LIBERADOS; }
  assert.equal(A.calcularAcesso({ status: 'cortesia', teste_ate: em(-90) }, { agora, ligada: true }).liberado, true);
});

test('CPF e CNPJ: confere os dígitos verificadores', () => {
  assert.equal(A.cpfCnpjValido('529.982.247-25'), true);
  assert.equal(A.cpfCnpjValido('529.982.247-24'), false);
  assert.equal(A.cpfCnpjValido('111.111.111-11'), false);
  assert.equal(A.cpfCnpjValido('11.222.333/0001-81'), true);
  assert.equal(A.cpfCnpjValido('11.222.333/0001-80'), false);
  assert.equal(A.cpfCnpjValido('123'), false);
});

test('somar um mês não pula o mês curto', () => {
  assert.equal(A.somarUmMes('2026-01-31'), '2026-02-28');
  assert.equal(A.somarUmMes('2028-01-31'), '2028-02-29');
  assert.equal(A.somarUmMes('2026-12-15'), '2027-01-15');
});

test('situação pelas cobranças do Asaas', () => {
  const ativa = { status: 'ACTIVE', nextDueDate: '2026-12-10' };
  // nada pago ainda
  let s = A.situacaoPelasCobrancas(ativa, [{ status: 'PENDING', dueDate: '2026-11-10', invoiceUrl: 'https://f/1' }]);
  assert.equal(s.status, 'aguardando');
  assert.equal(s.pagoAte, null);
  assert.equal(s.link, 'https://f/1');
  // pagou (cartão confirmado conta como pago)
  s = A.situacaoPelasCobrancas(ativa, [{ status: 'CONFIRMED', dueDate: '2026-11-10' }, { status: 'PENDING', dueDate: '2026-12-10', invoiceUrl: 'https://f/2' }]);
  assert.equal(s.status, 'ativa');
  assert.equal(s.pagoAte.toISOString(), new Date('2026-12-10T23:59:59-03:00').toISOString());
  assert.equal(s.proximoVencimento, '2026-12-10');
  // venceu a seguinte
  s = A.situacaoPelasCobrancas(ativa, [{ status: 'RECEIVED', dueDate: '2026-11-10' }, { status: 'OVERDUE', dueDate: '2026-12-10', invoiceUrl: 'https://f/2' }]);
  assert.equal(s.status, 'atrasada');
  // estornou: não conta mais como pago
  s = A.situacaoPelasCobrancas(ativa, [{ status: 'REFUNDED', dueDate: '2026-11-10' }]);
  assert.equal(s.pagoAte, null);
  // apagada no Asaas
  assert.equal(A.situacaoPelasCobrancas(null, []).status, 'cancelada');
  assert.equal(A.situacaoPelasCobrancas({ status: 'INACTIVE' }, []).status, 'cancelada');
});

test('chave do Asaas no ambiente errado desliga a cobrança', () => {
  const antes = { k: process.env.ASAAS_API_KEY, a: process.env.ASAAS_AMBIENTE };
  try {
    process.env.ASAAS_API_KEY = '$aact_prod_abc';
    delete process.env.ASAAS_AMBIENTE;
    assert.match(asaasMod.problemaNaConfiguracao(), /produção/);
    assert.equal(asaasMod.asaasConfigurado(), false);
    process.env.ASAAS_AMBIENTE = 'producao';
    assert.equal(asaasMod.asaasConfigurado(), true);
    process.env.ASAAS_API_KEY = '$aact_hmlg_abc';
    assert.match(asaasMod.problemaNaConfiguracao(), /sandbox/);
  } finally {
    if (antes.k === undefined) delete process.env.ASAAS_API_KEY; else process.env.ASAAS_API_KEY = antes.k;
    if (antes.a === undefined) delete process.env.ASAAS_AMBIENTE; else process.env.ASAAS_AMBIENTE = antes.a;
  }
});

test('preço pode mudar pela variável de ambiente', () => {
  process.env.ASSINATURA_VALOR_COMPLETO = '79,90';
  try { assert.equal(A.valorDoPlano('completo'), 79.9); } finally { delete process.env.ASSINATURA_VALOR_COMPLETO; }
  assert.equal(A.valorDoPlano('completo'), 49.9);
});

test('painel do dono: situação de cada cliente', () => {
  const { situacaoDoCliente } = require('../routes/dono');
  const base = { ligada: true, agora };
  assert.equal(situacaoDoCliente(null, { ...base, dono: true }).chave, 'dono');
  assert.equal(situacaoDoCliente(null, { ...base, ligada: false }).chave, 'livre');
  assert.equal(situacaoDoCliente(null, base).chave, 'sem_acesso');
  assert.equal(situacaoDoCliente({ status: 'teste', teste_ate: em(3) }, base).chave, 'teste');
  assert.equal(situacaoDoCliente({ status: 'aguardando', teste_ate: em(3), asaas_assinatura_id: 's' }, base).chave, 'teste_assinou');
  assert.equal(situacaoDoCliente({ status: 'ativa', plano: 'essencial', teste_ate: em(-30), pago_ate: em(10), asaas_assinatura_id: 's' }, base).chave, 'pagante');
  assert.equal(situacaoDoCliente({ status: 'atrasada', teste_ate: em(-60), pago_ate: em(-1), asaas_assinatura_id: 's' }, base).chave, 'atrasado');
  assert.equal(situacaoDoCliente({ status: 'cancelada', teste_ate: em(-60), pago_ate: em(5), asaas_assinatura_id: 's' }, base).chave, 'cancelou');
  assert.equal(situacaoDoCliente({ status: 'teste', teste_ate: em(-1) }, base).chave, 'bloqueado');
  assert.equal(situacaoDoCliente({ status: 'cortesia', teste_ate: em(-1) }, base).chave, 'cortesia');
});

test('plano anual: preços padrão e acesso de 12 meses por cobrança paga', () => {
  assert.equal(A.valorDoPlano('completo', 'anual'), 499);
  assert.equal(A.somarMeses('2026-10-25', 12), '2027-10-25');
  assert.equal(A.somarMeses('2028-02-29', 12), '2029-02-28');
  const s = A.situacaoPelasCobrancas({ status: 'ACTIVE', cycle: 'YEARLY', nextDueDate: '2027-10-25' }, [{ status: 'RECEIVED', dueDate: '2026-10-25', value: 300 }]);
  assert.equal(s.pagoAte.toISOString(), new Date('2027-10-25T23:59:59-03:00').toISOString());
});

test('desconto: vale até a data, por percentual, sobre o preço contratado', () => {
  const linha = { plano: 'completo', ciclo: 'mensal', valor_contratado: 39.9, desconto_percentual: 25, desconto_ate: '2027-01-10' };
  assert.equal(A.descontoVale(linha, '2026-12-10'), true);
  assert.equal(A.descontoVale(linha, '2027-01-10'), false, 'a cobrança que vence na data já é cheia');
  assert.equal(A.valorDevido(linha, '2026-12-10'), 29.93);
  assert.equal(A.valorDevido(linha, '2027-02-10'), 39.9);
  // para sempre
  assert.equal(A.valorDevido({ ...linha, desconto_ate: null }, '2035-01-01'), 29.93);
  // preço contratado antigo continua valendo mesmo se a tabela mudar
  assert.equal(A.valorDevido({ plano: 'completo', ciclo: 'mensal', valor_contratado: 39.9 }, '2027-01-01'), 39.9);
  assert.equal(A.valorDevido({ plano: 'essencial', ciclo: 'mensal', valor_contratado: 29.9 }, '2027-01-01', 'completo', 'mensal'), 29.9, 'do Essencial para o plano único no mesmo ciclo: mantém o valor contratado');
  assert.equal(A.valorDevido({ plano: 'essencial', ciclo: 'mensal', valor_contratado: 29.9 }, '2027-01-01', 'completo', 'anual'), 499, 'mudou o ciclo: preço novo da tabela');
  // nunca abaixo do mínimo do Asaas
  assert.equal(A.valorDevido({ plano: 'essencial', ciclo: 'mensal', desconto_percentual: 90 }, '2027-01-01'), 5);
});

test('promoção para novos: validade e quem ganha', () => {
  const agora = new Date('2026-11-10T12:00:00-03:00');
  assert.equal(A.promocaoValida({ ativa: true, percentual: 20 }, agora), true);
  assert.equal(A.promocaoValida({ ativa: true, percentual: 20, validaAte: '2026-11-09' }, agora), false);
  assert.equal(A.promocaoValida({ ativa: false, percentual: 20 }, agora), false);
  const promo = { ativa: true, percentual: 20 };
  assert.equal(A.ganhaPromocao({}, promo), true);
  assert.equal(A.ganhaPromocao({ asaas_assinatura_id: 'sub' }, promo), false, 'já assinou antes');
  assert.equal(A.ganhaPromocao({ pago_ate_base: '2026-01-01' }, promo), false);
  assert.equal(A.ganhaPromocao({ desconto_percentual: 10 }, promo), false, 'desconto pessoal tem prioridade');
});

test('e-mails da assinatura: textos com valor, data e link', () => {
  const { montarAviso } = require('../utils/avisosAssinatura');
  const f = montarAviso('fatura_proxima', { nome: 'Ana Paula', plano: 'Completo', valor: 39.9, vencimento: '2026-11-25', link: 'https://asaas/i/1', appUrl: 'https://app' });
  assert.match(f.assunto, /25\/11\/2026/);
  assert.match(f.html, /R\$\s?39,90/);
  assert.match(f.html, /Olá, Ana!/);
  assert.match(f.html, /https:\/\/asaas\/i\/1/);
  const t = montarAviso('teste_acabando', { nome: '<b>x</b>', testeAte: '2026-10-25', appUrl: 'https://app' });
  assert.match(t.html, /https:\/\/app\/assinatura\.html/);
  assert.doesNotMatch(t.html, /<b>x<\/b>/, 'nome escapado');
  for (const tipo of ['teste_acabou', 'fatura_vencida', 'pagamento_confirmado']) {
    assert.ok(montarAviso(tipo, { plano: 'Essencial', valor: 29.9, vencimento: '2026-11-01', pagoAte: '2026-12-01', appUrl: 'https://app' }).assunto);
  }
});
