// Envio de e-mail via Resend (https://resend.com) — API HTTP simples, sem biblioteca extra.
// Usado pra "esqueci minha senha" e pro backup automático. Variáveis no Render:
//   RESEND_API_KEY  chave da API do Resend
//   EMAIL_FROM      remetente, ex: "Livro-Caixa <nao-responda@seudominio.com.br>" (o domínio precisa
//                   estar verificado no Resend; pra testar, "onboarding@resend.dev" só entrega pro
//                   e-mail dono da conta Resend)
//   APP_URL         endereço público do painel, ex: https://SEU-APP.onrender.com
//                   (obrigatório: é o endereço que vai no link do e-mail — nunca é deduzido da
//                   requisição, pra ninguém conseguir forjar um link apontando pra outro site)
const RESEND_URL = 'https://api.resend.com/emails';

function emailConfigurado() {
  return !!(process.env.RESEND_API_KEY && process.env.EMAIL_FROM && process.env.APP_URL);
}

function urlBaseDoApp() {
  return String(process.env.APP_URL || '').replace(/\/+$/, '');
}

function escaparHtml(texto) {
  return String(texto == null ? '' : texto)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// anexos: [{ nome, conteudoBase64 }]
async function enviarEmail({ para, assunto, html, texto, anexos }) {
  if (!emailConfigurado()) throw new Error('Envio de e-mail não está configurado neste servidor.');
  const corpo = {
    from: process.env.EMAIL_FROM,
    to: [para],
    subject: assunto,
    html,
    text: texto,
  };
  if (anexos && anexos.length) {
    corpo.attachments = anexos.map((a) => ({ filename: a.nome, content: a.conteudoBase64 }));
  }
  const resp = await fetch(RESEND_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(corpo),
  });
  if (!resp.ok) {
    const dados = await resp.json().catch(() => ({}));
    throw new Error((dados && dados.message) || `Falha ao enviar e-mail (HTTP ${resp.status}).`);
  }
  return resp.json().catch(() => ({}));
}

function moldeEmail(titulo, paragrafosHtml) {
  return `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f4f4f2;font-family:Arial,Helvetica,sans-serif;color:#141414;">
<div style="max-width:520px;margin:0 auto;padding:28px 20px;">
<div style="background:#ffffff;border:1px solid #e4e4e0;border-radius:12px;padding:28px;">
<h1 style="font-size:20px;margin:0 0 16px;">${escaparHtml(titulo)}</h1>
${paragrafosHtml}
</div>
<p style="font-size:12px;color:#777;text-align:center;margin:16px 0 0;">Livro-Caixa</p>
</div></body></html>`;
}

function montarEmailRecuperacao({ nome, link, validadeMinutos }) {
  const saudacao = nome ? `Olá, ${escaparHtml(nome)}!` : 'Olá!';
  const html = moldeEmail('Redefinir sua senha', `
<p style="line-height:1.55;">${saudacao} Recebemos um pedido para redefinir a senha da sua conta no Livro-Caixa.</p>
<p style="margin:24px 0;"><a href="${escaparHtml(link)}" style="background:#141414;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;display:inline-block;">Criar nova senha</a></p>
<p style="line-height:1.55;font-size:14px;color:#555;">O link vale por ${validadeMinutos} minutos e só pode ser usado uma vez. Se o botão não funcionar, copie e cole este endereço no navegador:<br><span style="word-break:break-all;">${escaparHtml(link)}</span></p>
<p style="line-height:1.55;font-size:14px;color:#555;">Se você não pediu isso, pode ignorar este e-mail — sua senha continua a mesma.</p>`);
  const texto = `${nome ? `Olá, ${nome}!` : 'Olá!'} Recebemos um pedido para redefinir a senha da sua conta no Livro-Caixa.\n\nCrie uma nova senha neste link (vale por ${validadeMinutos} minutos, uso único):\n${link}\n\nSe você não pediu isso, ignore este e-mail — sua senha continua a mesma.`;
  return { assunto: 'Redefinir sua senha — Livro-Caixa', html, texto };
}

function montarEmailSenhaAlterada({ nome }) {
  const html = moldeEmail('Sua senha foi alterada', `
<p style="line-height:1.55;">${nome ? `Olá, ${escaparHtml(nome)}! ` : ''}A senha da sua conta no Livro-Caixa acabou de ser alterada e todos os aparelhos foram desconectados.</p>
<p style="line-height:1.55;font-size:14px;color:#555;">Se foi você, está tudo certo. Se não foi, peça uma nova redefinição de senha imediatamente e, se tiver, ative a verificação em duas etapas.</p>`);
  const texto = 'A senha da sua conta no Livro-Caixa acabou de ser alterada e todos os aparelhos foram desconectados. Se não foi você, peça uma nova redefinição de senha imediatamente.';
  return { assunto: 'Sua senha foi alterada — Livro-Caixa', html, texto };
}

function montarEmailBackup({ nome, geradoEm, anexado, tamanhoMb }) {
  const quando = new Date(geradoEm).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const corpoHtml = anexado
    ? `<p style="line-height:1.55;">${nome ? `Olá, ${escaparHtml(nome)}! ` : ''}Segue a cópia de segurança semanal dos seus dados do Livro-Caixa (gerada em ${escaparHtml(quando)}).</p>
<p style="line-height:1.55;font-size:14px;color:#555;">Guarde este e-mail ou salve o arquivo anexo num lugar seguro (Google Drive, por exemplo). Para restaurar, use Configurações → Manutenção → Backup → Restaurar. Os arquivos anexados aos clientes (fotos, PDFs) não vão neste backup automático por causa do tamanho — eles ficam no backup manual completo.</p>`
    : `<p style="line-height:1.55;">${nome ? `Olá, ${escaparHtml(nome)}! ` : ''}Tentamos gerar o backup semanal dos seus dados (${escaparHtml(quando)}), mas o arquivo ficou com ${tamanhoMb} MB — grande demais para ir por e-mail.</p>
<p style="line-height:1.55;font-size:14px;color:#555;">Faça o backup manual em Configurações → Manutenção → Backup. Vale também limpar dados antigos que não usa mais.</p>`;
  const texto = anexado
    ? `Segue a cópia de segurança semanal dos seus dados do Livro-Caixa (gerada em ${quando}). Guarde o arquivo anexo num lugar seguro.`
    : `O backup semanal ficou com ${tamanhoMb} MB, grande demais para ir por e-mail. Faça o backup manual em Configurações → Manutenção → Backup.`;
  return { assunto: anexado ? 'Seu backup semanal — Livro-Caixa' : 'Backup semanal grande demais para e-mail — Livro-Caixa', html: moldeEmail('Backup semanal', corpoHtml), texto };
}

function montarEmailTarefa({ nome, titulo, descricao, quando, comHora, tipo }) {
  const novo = tipo === 'nova';
  const cab = novo ? 'Nova tarefa no seu CRM' : (comHora ? 'Tarefa chegando' : 'Tarefa para hoje');
  const html = moldeEmail(cab, `
<p style="line-height:1.55;">${nome ? `Olá, ${escaparHtml(nome)}! ` : ''}${novo ? 'Você criou uma tarefa no Livro-Caixa:' : 'Lembrete da sua tarefa no Livro-Caixa:'}</p>
<p style="font-size:17px;font-weight:bold;margin:14px 0 6px;">${escaparHtml(titulo)}</p>
<p style="margin:0 0 6px;color:#555;">${escaparHtml(quando)}</p>
${descricao ? `<p style="line-height:1.55;font-size:14px;color:#555;">${escaparHtml(descricao)}</p>` : ''}
${novo ? '<p style="line-height:1.55;font-size:13px;color:#777;">O arquivo em anexo (.ics) adiciona esse compromisso ao seu calendário, se você abrir.</p>' : ''}
<p style="font-size:12px;color:#888;margin-top:16px;">Para parar de receber, desative em Configurações → Integrações → E-mail.</p>`);
  const texto = `${novo ? 'Nova tarefa' : 'Lembrete de tarefa'}: ${titulo}\n${quando}${descricao ? `\n${descricao}` : ''}`;
  return { assunto: `${novo ? 'Nova tarefa' : (comHora ? 'Tarefa chegando' : 'Tarefa para hoje')}: ${titulo}`.slice(0, 150), html, texto };
}

// Aviso para o e-mail ANTIGO quando a pessoa troca o e-mail da conta
function montarEmailTrocaDeEmail({ nome, novoEmail }) {
  const html = moldeEmail('O e-mail da sua conta mudou', `
<p style="line-height:1.55;">${nome ? `Olá, ${escaparHtml(nome)}! ` : ''}O e-mail de login da sua conta no Livro-Caixa foi trocado para <b>${escaparHtml(novoEmail)}</b>.</p>
<p style="line-height:1.55;font-size:14px;color:#555;">Daqui em diante, entre com o novo e-mail. Se não foi você, responda a este aviso ou fale com o suporte imediatamente.</p>`);
  const texto = `O e-mail de login da sua conta no Livro-Caixa foi trocado para ${novoEmail}. Se não foi você, fale com o suporte imediatamente.`;
  return { assunto: 'O e-mail da sua conta mudou — Livro-Caixa', html, texto };
}

module.exports = {
  montarEmailTarefa,
  montarEmailTrocaDeEmail,
  emailConfigurado,
  urlBaseDoApp,
  enviarEmail,
  montarEmailRecuperacao,
  montarEmailSenhaAlterada,
  montarEmailBackup,
  escaparHtml,
  moldeEmail,
};
