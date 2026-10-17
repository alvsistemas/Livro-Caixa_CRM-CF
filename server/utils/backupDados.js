const User = require('../models/User');
const Card = require('../models/Card');
const Column = require('../models/Column');
const Funil = require('../models/Funil');
const Task = require('../models/Task');
const Contrato = require('../models/Contrato');
const Message = require('../models/Message');
const Automacao = require('../models/Automacao');
const Fluxo = require('../models/Fluxo');
const FluxoExecucao = require('../models/FluxoExecucao');
const CampoPersonalizado = require('../models/CampoPersonalizado');
const MensagemAgendada = require('../models/MensagemAgendada');
const MetaVendas = require('../models/MetaVendas');
const PossivelLead = require('../models/PossivelLead');
const Anexo = require('../models/Anexo');
const RegraComissao = require('../models/RegraComissao');
const { carregarFinanceiro } = require('./financeiro');

// Monta o objeto de backup de um usuário (usado tanto pelo botão "Backup" quanto pelo backup
// automático semanal por e-mail). Tokens e segredos nunca entram. Com incluirAnexos=false o
// arquivo sai bem menor — é o que vai por e-mail, já que os anexos (fotos, PDFs em base64)
// costumam ser a maior parte do tamanho.
async function montarBackup(userId, { incluirAnexos = true } = {}) {
  const [
    usuario, cards, columns, funis, tasks, contratos, messages,
    automacoes, fluxos, fluxoExecucoes, camposPersonalizados,
    mensagensAgendadas, metasVendas, possiveisLeads, regras, anexos, financeiro,
  ] = await Promise.all([
    User.findById(userId).select('-senhaHash -whatsappBusiness.accessToken -whatsappBusiness.webhookSecret -whatsappBusiness.webhookToken -whatsappBusiness.accountSid -googleCalendar.accessToken -googleCalendar.refreshToken -twoFactorSecret -resetSenhaHash -resetSenhaExpira -icsToken'),
    Card.find({ userId }),
    Column.find({ userId }),
    Funil.find({ userId }),
    Task.find({ userId }),
    Contrato.find({ userId }),
    Message.find({ userId }),
    Automacao.find({ userId }),
    Fluxo.find({ userId }),
    FluxoExecucao.find({ userId }),
    CampoPersonalizado.find({ userId }),
    MensagemAgendada.find({ userId }),
    MetaVendas.find({ userId }),
    PossivelLead.find({ userId }),
    RegraComissao.find({ userId }),
    incluirAnexos ? Anexo.find({ userId }) : Promise.resolve([]),
    carregarFinanceiro(userId),
  ]);

  const backup = {
    geradoEm: new Date().toISOString(),
    versao: 2, // 2 = PostgreSQL (IDs em UUID); a importação aceita também os backups da versão 1
    usuario: usuario ? usuario.toJSON() : null,
    clientes: cards.map((d) => d.toJSON()),
    colunas: columns.map((d) => d.toJSON()),
    funis: funis.map((d) => d.toJSON()),
    tarefas: tasks.map((d) => d.toJSON()),
    comissoes: contratos.map((d) => d.toJSON()),
    regrasDeComissao: regras.map((d) => d.toJSON()),
    mensagensWhatsapp: messages.map((d) => d.toJSON()),
    automacoes: automacoes.map((d) => d.toJSON()),
    fluxos: fluxos.map((d) => d.toJSON()),
    execucoesDeFluxo: fluxoExecucoes.map((d) => d.toJSON()),
    camposPersonalizados: camposPersonalizados.map((d) => d.toJSON()),
    mensagensAgendadas: mensagensAgendadas.map((d) => d.toJSON()),
    metasDeVendas: metasVendas.map((d) => d.toJSON()),
    possiveisLeads: possiveisLeads.map((d) => d.toJSON()),
    controleFinanceiro: financeiro, // lançamentos, cartões, investimentos, objetivos, perfil e config
  };
  if (incluirAnexos) backup.anexos = anexos.map((d) => d.toJSON());
  return backup;
}

module.exports = { montarBackup };
