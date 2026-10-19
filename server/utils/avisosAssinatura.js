/* E-mails da assinatura, enviados pelo Livro-Caixa (precisa do e-mail configurado: Resend).

   Sempre (o Asaas não sabe do teste grátis):
     - teste_acabando ...... 2 dias antes do fim do teste, para quem ainda não assinou
     - teste_acabou ........ no dia seguinte ao fim do teste, para quem não assinou
   Quando o Livro-Caixa é quem avisa as cobranças (e-mail configurado e ASSINATURA_AVISOS != "asaas";
   aí os avisos do próprio Asaas ficam desligados):
     - fatura_proxima ...... 3 dias antes do vencimento de uma fatura em aberto
     - fatura_vencida ...... depois do vencimento, se continuar em aberto
     - pagamento_confirmado  quando o Asaas confirma um pagamento

   Cada aviso sai uma vez só (tabela assinatura_avisos). Roda de hora em hora, das 9h às 20h. */
const { query } = require('../db/pool');
const { emailConfigurado, enviarEmail, moldeEmail, escaparHtml, urlBaseDoApp } = require('./email');
const A = require('./assinatura');
const D = require('./donos');

const DIA = 86400000;
const brl = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dataBR = (d) => { const t = d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10); const [a, m, dd] = t.split('-'); return `${dd}/${m}/${a}`; };
const horaEmBrasilia = (agora) => Number(new Date(agora.getTime() - 3 * 3600000).toISOString().slice(11, 13));

function botao(link, texto) {
  return `<p style="margin:24px 0;"><a href="${escaparHtml(link)}" style="background:#141414;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;display:inline-block;">${escaparHtml(texto)}</a></p>`;
}
const p = (t) => `<p style="line-height:1.55;">${t}</p>`;
const pMiudo = (t) => `<p style="line-height:1.55;font-size:14px;color:#555;">${t}</p>`;

// Monta o e-mail de cada tipo (função pura, testada à parte)
function montarAviso(tipo, { nome, plano, valor, vencimento, link, testeAte, pagoAte, appUrl }) {
  const ola = nome ? `Olá, ${escaparHtml(String(nome).split(/\s+/)[0])}!` : 'Olá!';
  const telaAssinatura = `${appUrl}/assinatura.html`;
  switch (tipo) {
    case 'teste_acabando':
      return {
        assunto: 'Seu teste grátis do Livro-Caixa acaba em 2 dias',
        html: moldeEmail('Seu teste grátis está acabando', p(`${ola} Seu teste grátis do Livro-Caixa vai até <b>${dataBR(testeAte)}</b>.`) + p('Para continuar usando sem interrupção, escolha um plano. Seus dados continuam todos guardados.') + botao(telaAssinatura, 'Ver planos') + pMiudo('Você paga por Pix, boleto ou cartão e cancela quando quiser.')),
        texto: `${ola} Seu teste grátis do Livro-Caixa vai até ${dataBR(testeAte)}. Para continuar, escolha um plano: ${telaAssinatura}`,
      };
    case 'teste_acabou':
      return {
        assunto: 'Seu teste grátis do Livro-Caixa terminou',
        html: moldeEmail('Seu teste grátis terminou', p(`${ola} O período de teste terminou, e o acesso fica pausado até você escolher um plano.`) + p('Nada foi apagado: assim que você assinar, tudo volta como estava.') + botao(telaAssinatura, 'Escolher um plano')),
        texto: `${ola} Seu teste grátis do Livro-Caixa terminou. Nada foi apagado. Para voltar a usar, escolha um plano: ${telaAssinatura}`,
      };
    case 'fatura_proxima':
      return {
        assunto: `Sua fatura do Livro-Caixa vence em ${dataBR(vencimento)}`,
        html: moldeEmail('Sua fatura vence em breve', p(`${ola} A fatura do plano <b>${escaparHtml(plano)}</b>, de <b>${brl(valor)}</b>, vence em <b>${dataBR(vencimento)}</b>.`) + botao(link || telaAssinatura, 'Pagar a fatura') + pMiudo('Na fatura você escolhe Pix, boleto ou cartão. Se já pagou, pode ignorar este e-mail.')),
        texto: `${ola} A fatura do plano ${plano}, de ${brl(valor)}, vence em ${dataBR(vencimento)}. Pague aqui: ${link || telaAssinatura}`,
      };
    case 'fatura_vencida':
      return {
        assunto: 'Sua fatura do Livro-Caixa venceu',
        html: moldeEmail('Sua fatura venceu', p(`${ola} A fatura do plano <b>${escaparHtml(plano)}</b>, de <b>${brl(valor)}</b>, venceu em <b>${dataBR(vencimento)}</b> e ainda está em aberto.`) + p('Pague nos próximos dias para não perder o acesso. Seus dados continuam guardados.') + botao(link || telaAssinatura, 'Pagar agora') + pMiudo('Se você já pagou, a confirmação pode levar alguns instantes (boleto: até 2 dias úteis).')),
        texto: `${ola} A fatura do plano ${plano}, de ${brl(valor)}, venceu em ${dataBR(vencimento)}. Pague aqui: ${link || telaAssinatura}`,
      };
    case 'pagamento_confirmado':
      return {
        assunto: 'Pagamento confirmado — Livro-Caixa',
        html: moldeEmail('Pagamento confirmado', p(`${ola} Recebemos o pagamento do plano <b>${escaparHtml(plano)}</b>. Seu acesso está garantido até <b>${dataBR(pagoAte)}</b>.`) + pMiudo('O comprovante fica disponível na fatura do Asaas. Obrigado por usar o Livro-Caixa!')),
        texto: `${ola} Recebemos o pagamento do plano ${plano}. Acesso garantido até ${dataBR(pagoAte)}.`,
      };
    default:
      return null;
  }
}

// Reserva o aviso (pra não sair duas vezes) e envia; se o envio falhar, libera pra tentar depois
async function enviarUmaVez(pessoa, tipo, referencia, dados) {
  const { rows } = await query(
    'INSERT INTO assinatura_avisos (user_id, tipo, referencia) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING RETURNING user_id',
    [pessoa.user_id, tipo, String(referencia)]
  );
  if (!rows.length) return false;
  const email = montarAviso(tipo, { ...dados, nome: pessoa.nome, appUrl: urlBaseDoApp() });
  try {
    await enviarEmail({ para: pessoa.email, assunto: email.assunto, html: email.html, texto: email.texto });
    return true;
  } catch (err) {
    await query('DELETE FROM assinatura_avisos WHERE user_id = $1 AND tipo = $2 AND referencia = $3', [pessoa.user_id, tipo, String(referencia)]).catch(() => {});
    console.error(`Falha ao enviar aviso de assinatura (${tipo}):`, err.message);
    return false;
  }
}

async function semCobranca(email) {
  const e = String(email || '').toLowerCase();
  return A.emailsLiberados().includes(e) || (await D.ehDono(e));
}

async function enviarAvisosAssinatura(agora = new Date()) {
  if (!emailConfigurado() || !A.cobrancaLigada()) return 0;
  const hora = horaEmBrasilia(agora);
  if (hora < 9 || hora >= 20) return 0;
  const hoje = A.hojeEmBrasilia(agora);
  const { rows } = await query(
    `SELECT a.*, u.email, u.nome FROM assinaturas a JOIN usuarios u ON u.id = a.user_id
      WHERE a.status <> 'cortesia' AND (
        (a.teste_ate BETWEEN $1::timestamptz - interval '3 days' AND $1::timestamptz + interval '2 days')
        OR a.ultimo_link_pagamento IS NOT NULL)`,
    [agora.toISOString()]
  );
  const proprios = A.avisosProprios();
  let enviados = 0;
  for (const r of rows) {
    if (await semCobranca(r.email)) continue;
    const nomePlano = (A.PLANOS[r.plano] || A.PLANOS.completo).nome;
    const assinou = !!r.asaas_assinatura_id && r.status !== 'cancelada';
    const jaPagou = !!(r.pago_ate || r.pago_ate_base);
    const testeAte = r.teste_ate ? new Date(r.teste_ate) : null;
    const testeData = testeAte ? A.hojeEmBrasilia(testeAte) : null;
    if (testeAte && !assinou && !jaPagou) {
      const falta = testeAte.getTime() - agora.getTime();
      if (falta > 0 && falta <= 2 * DIA) {
        if (await enviarUmaVez(r, 'teste_acabando', testeData, { testeAte: testeData })) enviados++;
      } else if (falta <= 0 && falta > -3 * DIA) {
        if (await enviarUmaVez(r, 'teste_acabou', testeData, {})) enviados++;
      }
    }
    if (proprios && r.ultimo_link_pagamento && r.proximo_vencimento && r.status !== 'cancelada') {
      const venc = r.proximo_vencimento instanceof Date ? r.proximo_vencimento.toISOString().slice(0, 10) : String(r.proximo_vencimento).slice(0, 10);
      const dados = { plano: nomePlano, valor: A.valorDevido(r, venc), vencimento: venc, link: r.ultimo_link_pagamento };
      const dias = Math.round((Date.parse(venc) - Date.parse(hoje)) / DIA);
      if (dias >= 0 && dias <= 3) {
        if (await enviarUmaVez(r, 'fatura_proxima', venc, dados)) enviados++;
      } else if (dias < 0 && dias >= -10) {
        if (await enviarUmaVez(r, 'fatura_vencida', venc, dados)) enviados++;
      }
    }
  }
  return enviados;
}

// Chamado pela sincronização quando o Asaas confirma um pagamento novo
async function avisarPagamentoConfirmado(userId, pagoAte) {
  if (!emailConfigurado() || !A.avisosProprios() || !pagoAte) return false;
  const { rows } = await query('SELECT a.*, u.email, u.nome FROM assinaturas a JOIN usuarios u ON u.id = a.user_id WHERE a.user_id = $1', [userId]);
  if (!rows.length || (await semCobranca(rows[0].email))) return false;
  const r = rows[0];
  const ate = A.hojeEmBrasilia(new Date(pagoAte));
  return enviarUmaVez(r, 'pagamento_confirmado', ate, { plano: (A.PLANOS[r.plano] || A.PLANOS.completo).nome, pagoAte: ate });
}

module.exports = { enviarAvisosAssinatura, avisarPagamentoConfirmado, montarAviso };
