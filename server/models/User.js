const { definirModelo } = require('../db/modelo');
const { jsonPadrao, str } = require('./_comum');

module.exports = definirModelo('User', {
  tabela: 'usuarios',
  campos: {
    nome: { type: 'string', trim: true, default: '' },
    email: { type: 'string', required: true, lowercase: true, trim: true },
    senhaHash: { type: 'string', default: null }, // null quando a conta usa só login com Google
    googleId: { type: 'string', default: null },
    googleCalendar: {
      type: 'group',
      campos: {
        accessToken: { type: 'string', default: null },
        refreshToken: { type: 'string', default: null },
        expiryDate: { type: 'number', default: null },
        calendarId: { type: 'string', default: null },
      },
    },
    whatsappBusiness: {
      type: 'group',
      campos: {
        phoneNumberId: { type: 'string', default: null },
        accessToken: { type: 'string', default: null },
        wabaId: { type: 'string', default: null },
        provedor: { type: 'string', enum: ['meta', 'ycloud', 'twilio'], default: 'meta' }, // quem entrega o WhatsApp
        accountSid: { type: 'string', default: null }, // Twilio: Account SID (o Auth Token fica em accessToken)
        webhookToken: { type: 'string', default: null }, // YCloud/Twilio: identifica o usuário no endereço do webhook
        webhookSecret: { type: 'string', default: null }, // YCloud: secret whsec_... pra conferir a assinatura
        agenteIaAtivo: { type: 'boolean', default: false }, // responde clientes sozinho, sem revisão humana
        iaProativaAtiva: { type: 'boolean', default: false }, // só sugere no card, nunca envia nada sozinha
      },
    },
    instagramLeads: {
      type: 'group',
      campos: {
        pageId: { type: 'string', default: null },
        pageAccessToken: { type: 'string', default: null },
        igBusinessId: { type: 'string', default: null }, // conta comercial do Instagram (mensagens diretas)
      },
    },
    menuTriagem: {
      type: 'group',
      campos: {
        ativo: { type: 'boolean', default: false },
        mensagemInicial: { type: 'string', default: '' },
        opcoes: { type: 'json', default: () => [] }, // [{ numero, colunaDestinoId, respostaConfirmacao }]
      },
    },
    equipeId: { type: 'id', ref: 'Equipe', default: null },
    papelEquipe: { type: 'string', enum: ['supervisor', 'membro'], default: 'membro' },
    supervisorDeDados: { type: 'boolean', default: false }, // acesso ao monitoramento de erros
    agendamentoPublico: {
      type: 'group',
      campos: {
        ativo: { type: 'boolean', default: false },
        horaInicio: { type: 'string', default: '08:00' },
        horaFim: { type: 'string', default: '18:00' },
        duracaoMinutos: { type: 'int', default: 30 },
        diasSemana: { type: 'int[]', default: () => [1, 2, 3, 4, 5] }, // 0=domingo ... 6=sábado
        colunaDestinoId: { type: 'id', default: null }, // onde o lead novo entra no funil
      },
    },
    resetSenhaHash: { type: 'string', default: null }, // hash do token do "esqueci minha senha" (nunca o token em si)
    resetSenhaExpira: { type: 'date', default: null },
    backupAutomatico: {
      type: 'group',
      campos: {
        ativo: { type: 'boolean', default: false }, // backup semanal por e-mail
        ultimoEnvio: { type: 'date', default: null },
      },
    },
    tokenVersion: { type: 'int', default: 0 }, // incrementar invalida todos os tokens já emitidos (logout geral)
    icsToken: { type: 'string', default: null }, // segredo do link de agenda (.ics)
    avatarUrl: { type: 'string', default: null }, // imagem pequena em base64 (data URL)
    twoFactorSecret: { type: 'string', default: null }, // segredo TOTP
    twoFactorEnabled: { type: 'boolean', default: false },
  },
  transformJSON: jsonPadrao((ret) => {
    ret.temSenha = !!ret.senhaHash;
    delete ret.senhaHash; // nunca devolver o hash da senha pro front-end
    delete ret.tokenVersion;
    delete ret.twoFactorSecret;
    delete ret.resetSenhaHash;
    delete ret.resetSenhaExpira;
    ret.googleCalendarConnected = !!(ret.googleCalendar && ret.googleCalendar.refreshToken);
    delete ret.googleCalendar; // tokens nunca saem do servidor
    ret.whatsappConnected = !!(ret.whatsappBusiness && ret.whatsappBusiness.accessToken && ret.whatsappBusiness.phoneNumberId);
    delete ret.whatsappBusiness;
    ret.instagramConnected = !!(ret.instagramLeads && ret.instagramLeads.pageAccessToken && ret.instagramLeads.pageId);
    delete ret.instagramLeads;
    ret.icsAtivo = !!ret.icsToken;
    delete ret.icsToken; // só sai pela rota dedicada (GET /api/calendar/ics-status)
    ret.equipeId = str(ret.equipeId);
    if (ret.menuTriagem && Array.isArray(ret.menuTriagem.opcoes)) {
      ret.menuTriagem.opcoes.forEach((op) => { if (op.colunaDestinoId) op.colunaDestinoId = String(op.colunaDestinoId); });
    }
  }),
});
