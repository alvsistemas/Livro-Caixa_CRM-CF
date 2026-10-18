require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const { migrar } = require('./db/migrar');
const { query: consultaBanco, encerrar: encerrarBanco } = require('./db/pool');

const configRoutes = require('./routes/config');
const authRoutes = require('./routes/auth');
const boardRoutes = require('./routes/board');
const columnRoutes = require('./routes/columns');
const cardRoutes = require('./routes/cards');
const taskRoutes = require('./routes/tasks');
const calendarRoutes = require('./routes/calendar');
const comissoesRoutes = require('./routes/comissoes');
const regrasComissaoRoutes = require('./routes/regrasComissao');
const aiRoutes = require('./routes/ai');
const whatsappRoutes = require('./routes/whatsapp');
const funisRoutes = require('./routes/funis');
const equipeRoutes = require('./routes/equipe');
const automacoesRoutes = require('./routes/automacoes');
const instagramRoutes = require('./routes/instagram');
const fluxosRoutes = require('./routes/fluxos');
const agendamentosRoutes = require('./routes/agendamentos');
const camposPersonalizadosRoutes = require('./routes/camposPersonalizados');
const possiveisLeadsRoutes = require('./routes/possiveisLeads');
const metasRoutes = require('./routes/metas');
const auditoriaRoutes = require('./routes/auditoria');
const backupRoutes = require('./routes/backup');
const monitoramentoRoutes = require('./routes/monitoramento');
const webhooksSaidaRoutes = require('./routes/webhooksSaida');
const agendamentoPublicoRoutes = require('./routes/agendamentoPublico');
const gerotRoutes = require('./routes/gerot');
const financeiroRoutes = require('./routes/financeiro');
const historicoContatoRoutes = require('./routes/historicoContato');
const pushRoutes = require('./routes/push');

const app = express();
// O Render (e a maioria dos serviços de hospedagem) fica atrás de um proxy: o HTTPS
// termina ali, e o que chega no nosso Node por dentro é HTTP puro. Sem isso, req.protocol
// sempre reporta "http", mesmo em produção — o que quebra a URL de retorno do Google Agenda
// (fica "http://..." em vez de "https://...", e o Google bloqueia por não bater com o
// cadastrado no Google Cloud Console).
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3000;

/* ---------- monitoramento de erros ----------
   Intercepta todo console.error do sistema (é o padrão que toda rota já usa antes de
   responder com erro 500) e também guarda no banco, pra aparecer no painel de
   monitoramento — sem mudar nada do jeito que os erros já aparecem no log do Render. */
const { registrarErro } = require('./utils/registrarErro');
const { enviarAlertaTelegram } = require('./utils/telegramAlerta');
const consoleErrorOriginal = console.error.bind(console);
console.error = (...args) => {
  consoleErrorOriginal(...args);
  const erroEncontrado = args.find((a) => a instanceof Error);
  const mensagem = args.map((a) => (a instanceof Error ? a.message : String(a))).join(' ');
  registrarErro({ mensagem, stack: erroEncontrado ? erroEncontrado.stack : '', tipo: 'rota' });
};
process.on('uncaughtException', (err) => {
  console.error('Exceção não tratada (o servidor pode ficar instável):', err);
  registrarErro({ mensagem: err.message, stack: err.stack, tipo: 'excecao_nao_tratada' });
  enviarAlertaTelegram(`Exceção não tratada: ${err.message}`);
});
process.on('unhandledRejection', (motivo) => {
  const err = motivo instanceof Error ? motivo : new Error(String(motivo));
  console.error('Promise rejeitada sem tratamento:', err);
  registrarErro({ mensagem: err.message, stack: err.stack, tipo: 'promise_rejeitada' });
  enviarAlertaTelegram(`Promise rejeitada sem tratamento: ${err.message}`);
});

app.use(cors());
// Guarda o corpo CRU só dos webhooks (Meta e YCloud) — a conferência da assinatura (X-Hub-Signature-256)
// precisa dos bytes exatos que a Meta mandou, e depois do parse do JSON isso se perde.
app.use(express.json({
  limit: '50mb',
  verify: (req, _res, buf) => {
    if (req.originalUrl.startsWith('/api/whatsapp/webhook') || req.originalUrl.startsWith('/api/whatsapp/ycloud-webhook') || req.originalUrl.startsWith('/api/instagram/webhook')) {
      req.rawBody = buf;
    }
  },
}));

// API (auth e config são públicas; as outras exigem login dentro de cada rota)
app.use('/api/config', configRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/board', boardRoutes);
app.use('/api/columns', columnRoutes);
app.use('/api/cards', cardRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/comissoes', comissoesRoutes);
app.use('/api/regras-comissao', regrasComissaoRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/funis', funisRoutes);
app.use('/api/equipe', equipeRoutes);
app.use('/api/automacoes', automacoesRoutes);
app.use('/api/instagram', instagramRoutes);
app.use('/api/fluxos', fluxosRoutes);
app.use('/api/agendamentos', agendamentosRoutes);
app.use('/api/campos-personalizados', camposPersonalizadosRoutes);
app.use('/api/possiveis-leads', possiveisLeadsRoutes);
app.use('/api/metas', metasRoutes);
app.use('/api/auditoria', auditoriaRoutes);
app.use('/api/backup', backupRoutes);
app.use('/api/monitoramento', monitoramentoRoutes);
app.use('/api/webhooks-saida', webhooksSaidaRoutes);
app.use('/api/agendamento-publico', agendamentoPublicoRoutes);
app.use('/api/gerot', gerotRoutes);
app.use('/api/financeiro', financeiroRoutes);
app.use('/api/historico-contato', historicoContatoRoutes);
app.use('/api/push', pushRoutes);

// página pública de agendamento — /agendar/<userId> (sem login, o cliente acessa direto)
app.get('/agendar/:userId', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'agendar.html'));
});

// front-end estático (a pasta public com index.html, css e js)
// A raiz do site abre a escolha de aplicativo (CRM ou Controle financeiro)
app.get('/', (_req, res) => res.redirect('/inicio.html'));
app.use(express.static(path.join(__dirname, '..', 'public')));

const { verificarAutomacoesPorTempo } = require('./utils/automacaoScheduler');
const { processarFluxos } = require('./utils/fluxoScheduler');
const { processarAgendamentos } = require('./utils/agendamentoScheduler');
const { enviarLembretesDeTarefas } = require('./utils/lembreteScheduler');
const { enviarLembretesFinanceiros } = require('./utils/lembreteFinanceiro');
const { enviarBackupsSemanais } = require('./utils/backupScheduler');
const UMA_HORA = 60 * 60 * 1000;
const CINCO_MINUTOS = 5 * 60 * 1000;

// Erros do monitoramento ficam guardados por 30 dias (antes o MongoDB apagava sozinho)
async function limparErrosAntigos() {
  try {
    await consultaBanco("DELETE FROM erros WHERE created_at < now() - interval '30 days'");
  } catch (err) {
    process.stderr.write(`Falha ao limpar erros antigos: ${err.message}\n`);
  }
}

async function start() {
  try {
    if (!process.env.DATABASE_URL) {
      console.log('Aviso: DATABASE_URL não definida — usando o PostgreSQL local (postgres://livro:livro@127.0.0.1:5432/livro_caixa).');
    }
    await migrar(); // cria/atualiza as tabelas do banco sozinho
    console.log('Conectado ao PostgreSQL.');
    const servidor = app.listen(PORT, () => {
      console.log(`Servidor rodando em http://localhost:${PORT}`);
    });
    // desligamento limpo (o Render manda SIGTERM a cada deploy)
    process.on('SIGTERM', () => {
      servidor.close(() => encerrarBanco().finally(() => process.exit(0)));
      setTimeout(() => process.exit(0), 10000).unref();
    });
    setTimeout(limparErrosAntigos, 60 * 1000);
    setInterval(limparErrosAntigos, 24 * UMA_HORA);
    // primeira checagem logo após subir (sem esperar 1h), depois de hora em hora
    setTimeout(verificarAutomacoesPorTempo, 30 * 1000);
    setInterval(verificarAutomacoesPorTempo, UMA_HORA);
    setTimeout(processarFluxos, 45 * 1000);
    setInterval(processarFluxos, UMA_HORA);
    setTimeout(processarAgendamentos, 15 * 1000);
    setInterval(processarAgendamentos, CINCO_MINUTOS);
    // lembretes de tarefa por notificação push (a cada 2 min) e backup semanal por e-mail (confere de 6 em 6 horas)
    setTimeout(enviarLembretesDeTarefas, 20 * 1000);
    setInterval(enviarLembretesDeTarefas, 2 * 60 * 1000);
    // contas a pagar do Controle financeiro: um resumo por dia, a partir das 8h (confere de 30 em 30 min)
    setTimeout(enviarLembretesFinanceiros, 60 * 1000);
    setInterval(enviarLembretesFinanceiros, 30 * 60 * 1000);
    setTimeout(enviarBackupsSemanais, 90 * 1000);
    setInterval(enviarBackupsSemanais, 6 * UMA_HORA);
  } catch (err) {
    console.error('Falha ao conectar no PostgreSQL:', err.message);
    enviarAlertaTelegram(`Não foi possível conectar ao banco de dados (PostgreSQL) — o servidor não vai subir.\n${err.message}`);
    process.exit(1);
  }
}

// "node server.js" sobe o servidor; os testes importam o app sem subir nada
if (require.main === module) start();

module.exports = { app, start };
