/* Lembrete de contas a pagar do Controle financeiro, por notificação no celular (push).
   Uma vez por dia, a partir das 8h (horário de Brasília), cada pessoa que ativou as
   notificações recebe um resumo do que vence hoje e amanhã (e do que está atrasado).
   Pode ser desligado em Meu perfil (config.lembretesVencimento = false). */
const { query } = require('../db/pool');
const { pushConfigurado, enviarPush } = require('./push');
const { carregarFinanceiro } = require('./financeiro');
const Calc = require('../../public/financeiro/calculos');

const FUSO = 'America/Sao_Paulo';
const dataEmBrasilia = (d = new Date()) => d.toLocaleDateString('en-CA', { timeZone: FUSO }); // AAAA-MM-DD
const horaEmBrasilia = (d = new Date()) => parseInt(d.toLocaleString('en-US', { timeZone: FUSO, hour: 'numeric', hour12: false }), 10) % 24;
const fmtBRL = (n) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n || 0);

// Monta o texto do lembrete (ou null se não há nada pra avisar)
function montarLembrete(dados, hoje) {
  const amanha = (() => { const d = new Date(hoje + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); })();
  const itens = Calc.aPagarEReceber(dados, { hoje, dias: 1, mesesAtras: 3 }).filter((i) => i.tipo === 'pagar');
  const deHoje = itens.filter((i) => i.data === hoje);
  const deAmanha = itens.filter((i) => i.data === amanha);
  const atrasadas = itens.filter((i) => i.atrasado);
  if (!deHoje.length && !deAmanha.length && !atrasadas.length) return null;
  const soma = (l) => fmtBRL(l.reduce((a, i) => a + i.valor, 0));
  const nomes = (l) => l.slice(0, 3).map((i) => i.descricao).join(', ') + (l.length > 3 ? ` e mais ${l.length - 3}` : '');
  const partes = [];
  if (deHoje.length) partes.push(`Hoje: ${nomes(deHoje)} (${soma(deHoje)})`);
  if (deAmanha.length) partes.push(`Amanhã: ${nomes(deAmanha)} (${soma(deAmanha)})`);
  if (atrasadas.length) partes.push(`${atrasadas.length} em atraso (${soma(atrasadas)})`);
  const titulo = deHoje.length ? `${deHoje.length} conta${deHoje.length > 1 ? 's vencem' : ' vence'} hoje` : deAmanha.length ? `${deAmanha.length} conta${deAmanha.length > 1 ? 's vencem' : ' vence'} amanhã` : 'Contas em atraso';
  return { titulo, corpo: partes.join(' · '), url: '/financeiro/', tag: `financeiro-${hoje}`, tipo: 'financeiro' };
}

async function enviarLembretesFinanceiros(agora = new Date()) {
  if (!pushConfigurado() || horaEmBrasilia(agora) < 8) return;
  const hoje = dataEmBrasilia(agora);
  try {
    const { rows } = await query(
      `SELECT DISTINCT i.user_id::text AS id FROM inscricoes_push i
         LEFT JOIN financeiro_perfis p ON p.user_id = i.user_id
        WHERE COALESCE(p.config->>'lembretesVencimento', 'true') <> 'false'
          AND COALESCE(p.config->>'lembreteEnviadoEm', '') <> $1`, [hoje]);
    for (const { id } of rows) {
      // marca o dia ANTES de enviar: se duas execuções se cruzarem, só uma envia
      const marca = await query(
        `INSERT INTO financeiro_perfis (user_id, config) VALUES ($1::uuid, jsonb_build_object('lembreteEnviadoEm', $2::text))
         ON CONFLICT (user_id) DO UPDATE SET config = COALESCE(financeiro_perfis.config, '{}'::jsonb) || jsonb_build_object('lembreteEnviadoEm', $2::text)
         WHERE COALESCE(financeiro_perfis.config->>'lembreteEnviadoEm', '') <> $2
         RETURNING user_id`, [id, hoje]);
      if (!marca.rows.length) continue;
      const dados = await carregarFinanceiro(id);
      const lembrete = montarLembrete(dados, hoje);
      if (lembrete) await enviarPush(id, lembrete);
    }
  } catch (e) {
    console.error('Erro ao enviar lembretes do financeiro:', e.message);
  }
}

module.exports = { enviarLembretesFinanceiros, montarLembrete };
