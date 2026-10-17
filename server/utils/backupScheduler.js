const User = require('../models/User');
const { montarBackup } = require('./backupDados');
const { emailConfigurado, enviarEmail, montarEmailBackup } = require('./email');

const SETE_DIAS_MS = 7 * 24 * 60 * 60 * 1000;
const LIMITE_ANEXO_BYTES = 20 * 1024 * 1024; // acima disso o e-mail (com base64) estoura o limite do Resend (40 MB)

// Gera e envia por e-mail o backup de UM usuário. Devolve { anexado, tamanhoMb }.
async function enviarBackupPorEmail(user) {
  const backup = await montarBackup(user._id, { incluirAnexos: false });
  const json = JSON.stringify(backup);
  const bytes = Buffer.byteLength(json, 'utf8');
  const tamanhoMb = (bytes / (1024 * 1024)).toFixed(1);
  const anexado = bytes <= LIMITE_ANEXO_BYTES;
  const msg = montarEmailBackup({ nome: user.nome, geradoEm: backup.geradoEm, anexado, tamanhoMb });
  await enviarEmail({
    para: user.email,
    assunto: msg.assunto,
    html: msg.html,
    texto: msg.texto,
    anexos: anexado
      ? [{ nome: `backup-painel-crm-${backup.geradoEm.slice(0, 10)}.json`, conteudoBase64: Buffer.from(json, 'utf8').toString('base64') }]
      : [],
  });
  await User.updateOne({ _id: user._id }, { 'backupAutomatico.ultimoEnvio': new Date() });
  return { anexado, tamanhoMb };
}

// Roda a cada poucas horas: quem ligou o backup automático e está há 7 dias (ou nunca recebeu) ganha um novo.
async function enviarBackupsSemanais() {
  if (!emailConfigurado()) return;
  try {
    const limite = new Date(Date.now() - SETE_DIAS_MS);
    const usuarios = await User.find({
      'backupAutomatico.ativo': true,
      $or: [{ 'backupAutomatico.ultimoEnvio': null }, { 'backupAutomatico.ultimoEnvio': { $lte: limite } }],
    }).limit(50);
    for (const user of usuarios) {
      try {
        await enviarBackupPorEmail(user);
      } catch (e) {
        console.error('Erro ao enviar backup automático:', e.message);
      }
    }
  } catch (e) {
    console.error('Erro no agendador de backup:', e.message);
  }
}

module.exports = { enviarBackupsSemanais, enviarBackupPorEmail, LIMITE_ANEXO_BYTES };
