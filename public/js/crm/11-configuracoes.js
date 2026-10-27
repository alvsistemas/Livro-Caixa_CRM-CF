// CRM · 11-configuracoes.js — Configurações, notificações e e-mails. Os arquivos js/crm/ são carregados em ordem pelo index.html e
// compartilham as mesmas variáveis globais (é o antigo script.js dividido, como no CRM de consórcio).
/* ---------- página: Configurações ---------- */
const CONFIG_CATEGORIAS = [
  { grupo: 'Conta', itens: [
    ['perfil', 'Seu perfil'],
    ['assinatura', 'Assinatura'],
    ['seguranca', 'Login e segurança'],
    ['aparencia', 'Aparência e acessibilidade'],
    ['notificacoes', 'Notificações'],
  ]},
  { grupo: 'Integrações', itens: [
    ['google-agenda', 'Google Agenda'],
    ['email', 'E-mail'],
    ['webhooks', 'Webhooks'],
    ['agendamento', 'Link de agendamento'],
  ]},
  { grupo: 'Dados', itens: [
    ['campos', 'Campos personalizados'],
    ['importar', 'Importar contatos'],
  ]},
  { grupo: 'Sistema', itens: [
    ['manutencao', 'Manutenção'],
    ['monitoramento', 'Monitoramento de erros'],
  ]},
];

/* Faixa do teste grátis no topo do CRM: avisa quantos dias faltam e que está tudo liberado
   (plano Completo). Some quando a pessoa assina; fechar esconde até o dia seguinte. Quem
   chega da página de divulgação ("Quero uma demonstração") vê a versão de boas-vindas. */
const boasVindasTeste = new URLSearchParams(location.search).get('boasvindas') === '1';
if(boasVindasTeste){ try{ history.replaceState(null, '', location.pathname); }catch(e){} }
function renderFaixaTeste(){
  const s = assinaturaInfo;
  if(!s || !s.cobranca || !s.emTeste || s.temAssinatura) return '';
  let fechadaEm = null;
  try{ fechadaEm = localStorage.getItem('faixaTesteFechadaEm'); }catch(e){}
  if(!boasVindasTeste && fechadaEm === hojeLocalISO()) return '';
  const dias = s.diasDeTeste;
  const quanto = dias === 1 ? 'falta 1 dia' : `faltam ${dias} dias`;
  const titulo = boasVindasTeste ? `Bem-vindo ao Livro-Caixa! Você tem ${dias === 1 ? '1 dia' : `${dias} dias`} de teste grátis.` : `Teste grátis: ${quanto}.`;
  return `<div class="faixa-teste" role="status">
    <div><b>${titulo}</b> Está tudo liberado: CRM, Controle financeiro, PDV, equipe e assistente com IA. Não pedimos cartão; você só paga se quiser continuar depois do teste.</div>
    <div class="faixa-teste-acoes">
      <a class="btn-primary" href="assinatura.html?de=crm">Ver planos</a>
      <button type="button" class="faixa-teste-x" data-action="fechar-faixa-teste" aria-label="Fechar aviso do teste grátis">✕</button>
    </div>
  </div>`;
}

function renderConfigAssinatura(){
  const s = assinaturaInfo;
  const dataBR = (v)=> v ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(v) ? v + 'T12:00:00' : v).toLocaleDateString('pt-BR', { timeZone:'America/Sao_Paulo' }) : '—';
  const nomePlano = s && (s.planos||[]).find(p=>p.id===s.plano);
  let status = 'Carregando…';
  let detalhe = '';
  if(s){
    if(!s.cobranca){ status = 'Liberado'; detalhe = 'A cobrança ainda não está ligada neste servidor.'; }
    else if(s.status === 'cortesia'){ status = 'Cortesia'; detalhe = 'Sua conta está liberada sem cobrança.'; }
    else if(s.emTeste){ status = 'Teste grátis'; detalhe = `Tudo liberado até ${dataBR(s.testeAte)}${s.temAssinatura ? `. Plano escolhido: ${esc(nomePlano ? nomePlano.nome : s.plano)}` : '. Escolha um plano para continuar depois do teste'}.`; }
    else{
      const rotulos = { aguardando:'Aguardando pagamento', ativa:'Ativa', atrasada:'Pagamento atrasado', cancelada:'Cancelada' };
      status = `${nomePlano ? 'Plano ' + nomePlano.nome : ''} · ${rotulos[s.status] || s.status}`;
      detalhe = s.pagoAte ? `${s.status === 'cancelada' ? 'Acesso até' : 'Pago até'} ${dataBR(s.pagoAte)}.` : '';
      if(s.proximoVencimento && s.status !== 'cancelada') detalhe += ` Próximo vencimento: ${dataBR(s.proximoVencimento)}.`;
    }
  }
  return `
    <div class="settings-page-section">
      <h3>Assinatura</h3>
      <div class="settings-page-row"><span>Situação</span><span>${esc(status)}</span></div>
      ${detalhe ? `<p class="settings-page-note">${detalhe}</p>` : ''}
      ${s && s.cobranca && s.status !== 'cortesia' ? `<a class="btn-primary" href="assinatura.html?de=crm" style="display:inline-block;text-decoration:none">${s.temAssinatura ? 'Gerenciar assinatura' : 'Ver planos e assinar'}</a>` : ''}
      <p class="settings-page-note">O pagamento é feito pelo Asaas (Pix, boleto ou cartão). O Livro-Caixa nunca vê nem guarda os dados do seu cartão.</p>
    </div>
  `;
}

function renderConfigPerfil(){
  const temFoto = !!(currentUser && currentUser.avatarUrl);
  return `
    <div class="settings-page-section">
      <h3>Seu perfil</h3>
      <div class="avatar-upload-row">
        <div class="avatar-preview avatar-preview-interativo" id="avatar-preview" title="${temFoto?'Segure pra ver a foto · clique pra trocar':'Clique pra adicionar uma foto'}">
          ${temFoto ? `<img src="${currentUser.avatarUrl}" alt="Foto de perfil" />` : esc(iniciaisDoNome((currentUser&&currentUser.nome)||''))}
          <div class="avatar-hover-overlay">${ICON_CAMERA}</div>
        </div>
        <div>
          <input type="file" id="avatar-input" accept="image/png,image/jpeg,image/webp" style="display:none;" />
          <div class="settings-btn-row">
            <button class="btn-outline" data-action="abrir-editar-perfil" ${avatarSalvando?'disabled':''}>${avatarSalvando?'Enviando…':'Editar perfil'}</button>
            ${temFoto ? `<button class="btn-outline" id="avatar-remover-btn" ${avatarSalvando?'disabled':''}>Remover foto</button>` : ''}
          </div>
          <p class="settings-page-note">Clique na foto pra trocar${temFoto?', ou segure pra ver ela maior':''}.</p>
        </div>
      </div>
      ${avatarMsg ? `<p class="settings-page-msg ${avatarMsg.tipo}">${esc(avatarMsg.texto)}</p>` : ''}
      <div class="settings-page-row"><span>Nome</span><span>${esc((currentUser && currentUser.nome) || '—')}</span></div>
      <div class="settings-page-row"><span>E-mail</span><span class="settings-row-valor">${esc((currentUser && currentUser.email) || '—')}${(!acessoCrm || acessoCrm.tipo === 'dono') ? ` <button class="btn-link" data-action="trocar-email">Trocar</button>` : ''}</span></div>

      <div class="settings-sep-line"></div>

      <div class="settings-page-subtitle">Sessões ativas</div>
      <p class="settings-page-note">Desconecte todos os dispositivos onde você está logado — útil se perdeu um aparelho ou compartilhou sua senha. Você vai precisar entrar de novo aqui também.</p>
      ${logoutAllMsg ? `<p class="settings-page-msg ${logoutAllMsg.tipo}">${esc(logoutAllMsg.texto)}</p>` : ''}
      <button class="btn-danger" data-action="desconectar-todos" ${logoutAllEnviando?'disabled':''}>${logoutAllEnviando?'Desconectando…':'Desconectar todos os dispositivos'}</button>
    </div>
  `;
}

function renderConfigSeguranca(){
  return `
    <div class="settings-page-section">
      <h3>Login e segurança</h3>
      <div class="settings-page-row">
        <span>Senha</span>
        <button class="btn-outline" data-action="abrir-alterar-senha">Mudar senha</button>
      </div>

      <div class="settings-sep-line"></div>

      <div class="settings-page-subtitle">Verificação em duas etapas (2FA)</div>
      ${renderSecao2FA()}

      <div class="settings-sep-line"></div>

      <button class="settings-page-row auditoria-toggle" data-action="toggle-auditoria" style="width:100%; border:none; border-bottom:1px solid var(--line); background:none; cursor:pointer; font-family:inherit;">
        <span class="settings-page-subtitle" style="margin:0;">Log de auditoria</span>
        <span class="auditoria-toggle-seta ${auditoriaExpandida?'aberta':''}">▾</span>
      </button>
      ${auditoriaExpandida ? `
        <p class="settings-page-note">Últimos eventos de segurança da sua conta.</p>
        ${!auditoriaCarregada ? `<p class="settings-page-note">Carregando…</p>` : (auditoriaEventos.length ? `
          <div class="historico-lista">
            ${auditoriaEventos.map(e=>`
              <div class="historico-item">
                <span class="historico-item-texto">${esc(e.detalhe || e.acao)}</span>
                <span class="historico-item-data">${formatDateHora(e.createdAt)}</span>
              </div>
            `).join('')}
          </div>
        ` : `<p class="dash-empty">Nenhum evento registrado ainda.</p>`)}
      ` : ''}
    </div>
  `;
}

function renderConfigAparencia(){
  return `
    <div class="settings-page-section">
      <h3>Modo noturno e cor de destaque</h3>
      <label class="settings-toggle-row">
        <span>Modo noturno</span>
        <span class="switch ${getDarkMode()?'on':''}" data-action="toggle-dark-mode">
          <span class="switch-knob"></span>
        </span>
      </label>
      <div class="settings-page-subtitle">Cor de destaque</div>
      <div class="theme-swatches">
        ${ACCENT_PRESETS.map(cor=>`<button class="theme-swatch ${getAccentColor().toLowerCase()===cor.toLowerCase()?'active':''}" data-action="set-accent" data-color="${cor}" style="background:${cor}" title="${cor}"></button>`).join('')}
      </div>
      <label class="theme-custom-label">
        Outra cor
        <input type="color" id="theme-custom-input" value="${getAccentColor()}" />
      </label>
    </div>
    <div class="settings-page-section">
      <h3>Acessibilidade</h3>
      <div data-a11y-painel></div>
    </div>
  `;
}


function renderConfigGoogleAgenda(){
  return `
    <div class="settings-page-section">
      <h3>Google Agenda</h3>
      <div class="settings-page-row">
        <span>Status</span>
        <span>${calendarConnected ? '✓ Conectada' : 'Não conectada'}</span>
      </div>
      ${calendarConnected
        ? `
          <div class="settings-btn-row">
            <button class="btn-outline" data-action="sync-calendar-now" ${calendarSyncing?'disabled':''}>${calendarSyncing?'Sincronizando…':'Sincronizar agora'}</button>
            <button class="btn-outline" data-action="disconnect-calendar">Desconectar</button>
          </div>
        `
        : (integracoesConfig.planoSemGoogleAgenda
          ? `<p class="settings-page-note">A integração com o Google Agenda faz parte do plano Completo. <a href="assinatura.html?de=crm">Ver planos</a>. O link de agenda abaixo funciona em todos os planos.</p>`
          : integracoesConfig.googleAgenda
          ? `<button class="btn-primary" data-action="connect-calendar">Conectar Google Agenda</button>`
          : `<p class="settings-page-note">Essa integração não está configurada neste servidor — use o link de agenda abaixo como alternativa (funciona com Google, Apple, Outlook e outros).</p>`)
      }
    </div>
    <div class="settings-page-section">
      <h3>Agenda por link (.ics)</h3>
      <p class="settings-page-note">Gera um link que qualquer app de calendário (Google, Apple, Outlook…) pode "assinar" pra ver suas tarefas automaticamente — sem precisar conectar conta nenhuma. É a alternativa que não depende de nenhuma configuração especial deste servidor.</p>
      ${icsCarregando ? `<p class="settings-page-note">Carregando…</p>` : (icsStatus && icsStatus.ativo ? `
        <div class="field">
          <label>Seu link de agenda</label>
          <input type="text" id="ics-url" value="${esc(icsStatus.url)}" readonly onclick="this.select()" />
        </div>
        <div class="settings-btn-row">
          <button class="btn-outline" data-action="copiar-link-ics">Copiar link</button>
          <button class="btn-outline" data-action="gerar-link-ics" ${icsGerando?'disabled':''}>${icsGerando?'Gerando…':'Gerar novo link'}</button>
          <button class="btn-outline" data-action="revogar-link-ics">Revogar</button>
        </div>
      ` : `<button class="btn-primary" data-action="gerar-link-ics" ${icsGerando?'disabled':''}>${icsGerando?'Gerando…':'Gerar link de agenda'}</button>`)}
    </div>
  `;
}


function renderConfigWebhooks(){
  return `
    <div class="settings-page-section">
      <h3>Webhooks (Zapier, Make, n8n...)</h3>
      <p class="settings-page-note">Conecte o painel com qualquer outra ferramenta que aceite receber um POST — Zapier ("Webhooks by Zapier"), Make, n8n, ou o que você já usa. Toda vez que o evento escolhido acontecer, mandamos os dados pra sua URL.</p>
      ${webhooksSaidaMsg ? `<p class="settings-page-msg ${webhooksSaidaMsg.tipo}">${esc(webhooksSaidaMsg.texto)}</p>` : ''}
      <div class="disparo-lista-leads" style="max-height:none; margin-bottom:12px;">
        ${webhooksSaida.length ? webhooksSaida.map(w=>`
          <div class="disparo-lead-item" style="cursor:default; flex-direction:column; align-items:stretch; gap:6px;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span><b>${esc(w.nome||'Sem nome')}</b> ${!w.ativo?'<span class="settings-page-note">(pausado)</span>':''}</span>
              <div class="settings-btn-row">
                <button class="btn-outline" data-action="testar-webhook-saida" data-webhook-id="${w.id}">Testar</button>
                <button class="btn-outline" data-action="toggle-webhook-saida" data-webhook-id="${w.id}" data-ativo="${w.ativo?'0':'1'}">${w.ativo?'Pausar':'Ativar'}</button>
                <button class="delete-link" data-action="excluir-webhook-saida" data-webhook-id="${w.id}">🗑</button>
              </div>
            </div>
            <span class="settings-page-note" style="word-break:break-all;">${esc(w.url)}</span>
            <span class="settings-page-note">Eventos: ${w.eventos.map(ev=>ROTULOS_EVENTOS_WEBHOOK[ev]||ev).join(', ')}${w.ultimoEnvioEm?` · Último disparo: ${formatDateHora(w.ultimoEnvioEm)} (${w.ultimoEnvioStatus==='ok'?'✅':'⚠️'})`:''}</span>
          </div>
        `).join('') : '<p class="dash-empty">Nenhum webhook cadastrado ainda.</p>'}
      </div>
      <div class="field">
        <label>Nome (só pra identificar)</label>
        <input type="text" id="novo-webhook-nome" placeholder="Ex: Zapier - novo contato" />
      </div>
      <div class="field">
        <label>URL de destino</label>
        <input type="text" id="novo-webhook-url" placeholder="https://hooks.zapier.com/..." />
      </div>
      <div class="field">
        <label>Quando disparar</label>
        <div class="checkbox-group">
          ${Object.entries(ROTULOS_EVENTOS_WEBHOOK).map(([key,label])=>`
            <label class="checkbox-item"><input type="checkbox" class="novo-webhook-evento" value="${key}" /> ${label}</label>
          `).join('')}
        </div>
      </div>
      <button class="btn-outline" data-action="criar-webhook-saida">+ Adicionar webhook</button>
    </div>
  `;
}

function renderConfigAgendamento(){
  return `
    <div class="settings-page-section">
      <h3>Link de agendamento</h3>
      <p class="settings-page-note">Um link público onde o cliente escolhe um horário livre e marca sozinho — sem precisar trocar mensagem pra combinar dia e hora. Confere disponibilidade nas suas tarefas e, se conectado, no seu Google Agenda também.</p>
      ${agendamentoPublicoMsg ? `<p class="settings-page-msg ${agendamentoPublicoMsg.tipo}">${esc(agendamentoPublicoMsg.texto)}</p>` : ''}
      <div class="settings-page-row">
        <span>Ativar link de agendamento</span>
        <span class="switch ${agendamentoPublicoForm.ativo?'on':''}" data-action="toggle-agendamento-publico-ativo"><span class="switch-knob"></span></span>
      </div>
      ${agendamentoPublicoForm.ativo ? `
        <div class="settings-page-row">
          <span>Seu link</span>
          <span style="display:flex; gap:8px; align-items:center;">
            <span class="settings-page-note" style="font-family:'IBM Plex Mono',monospace;">${window.location.origin}/agendar/${currentUser.id}</span>
            <button class="btn-outline" data-action="copiar-link-agendamento">Copiar</button>
          </span>
        </div>
      ` : ''}
      <div class="field-row" style="margin-top:12px;">
        <div class="field"><label>Início do expediente</label><input type="time" id="ap-hora-inicio" value="${agendamentoPublicoForm.horaInicio}" /></div>
        <div class="field"><label>Fim do expediente</label><input type="time" id="ap-hora-fim" value="${agendamentoPublicoForm.horaFim}" /></div>
        <div class="field">
          <label>Duração de cada horário</label>
          <select id="ap-duracao">
            ${[15,30,45,60].map(min=>`<option value="${min}" ${agendamentoPublicoForm.duracaoMinutos===min?'selected':''}>${min} min</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="field">
        <label>Dias da semana</label>
        <div class="checkbox-group" style="flex-direction:row; flex-wrap:wrap; gap:12px;">
          ${['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].map((label,i)=>`
            <label class="checkbox-item"><input type="checkbox" class="ap-dia-semana" value="${i}" ${agendamentoPublicoForm.diasSemana.includes(i)?'checked':''}/> ${label}</label>
          `).join('')}
        </div>
      </div>
      <div class="field">
        <label>Cliente novo entra em qual coluna do funil?</label>
        <select id="ap-coluna-destino">
          <option value="">Não criar cliente novo automaticamente</option>
          ${board.columns.map(c=>`<option value="${c.id}" ${agendamentoPublicoForm.colunaDestinoId===c.id?'selected':''}>${esc(c.nome)}</option>`).join('')}
        </select>
      </div>
      <button class="btn-outline" data-action="salvar-agendamento-publico">Salvar</button>
    </div>
  `;
}

function renderConfigCampos(){
  return `
    <div class="settings-page-section">
      <h3>Campos personalizados</h3>
      <p class="settings-page-note">Campos extras que aparecem no modal de cada cliente (ex: CPF, data de nascimento).</p>
      ${!camposPersonalizadosCarregados ? `<p class="settings-page-note">Carregando…</p>` : (camposPersonalizados.length ? `
        <div class="campos-lista">
          ${camposPersonalizados.map(c=>`
            <div class="campo-item">
              <span>${esc(c.nome)} <span class="settings-page-note">(${c.tipo})</span></span>
              <button class="icon-btn" data-action="excluir-campo-personalizado" data-campo-id="${c.id}" title="Excluir">${ICON_TRASH}</button>
            </div>
          `).join('')}
        </div>
      ` : `<p class="dash-empty">Nenhum campo personalizado ainda.</p>`)}
      <div class="field-row" style="margin-top:12px;">
        <div class="field"><label>Nome do campo</label><input type="text" id="novo-campo-nome" value="${esc(novoCampoNome)}" placeholder="Ex: CPF" /></div>
        <div class="field">
          <label>Tipo</label>
          <select id="novo-campo-tipo">
            <option value="texto" ${novoCampoTipo==='texto'?'selected':''}>Texto</option>
            <option value="numero" ${novoCampoTipo==='numero'?'selected':''}>Número</option>
            <option value="data" ${novoCampoTipo==='data'?'selected':''}>Data</option>
          </select>
        </div>
      </div>
      ${camposPersonalizadosMsg ? `<p class="settings-page-msg ${camposPersonalizadosMsg.tipo}">${esc(camposPersonalizadosMsg.texto)}</p>` : ''}
      <button class="btn-outline" data-action="criar-campo-personalizado">+ Adicionar campo</button>
    </div>
  `;
}

function renderConfigImportar(){
  return `
    <div class="settings-page-section">
      <h3>Importar contatos</h3>
      <p class="settings-page-note">Envie uma planilha (.xlsx) ou CSV com as colunas <b>Nome, Telefone, Valor</b> (nessa ordem, cabeçalho na primeira linha). Para escolher as colunas de qualquer planilha, use a aba Importar/Exportar.</p>
      <div class="field">
        <label>Coluna de destino</label>
        <select id="import-coluna">
          ${board.columns.map(c=>`<option value="${c.id}" ${importColumnId===c.id?'selected':''}>${esc(c.nome)}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label>Arquivo (.xlsx ou .csv)</label>
        <label class="btn-outline btn-arquivo" style="align-self:flex-start">Escolher arquivo<input type="file" id="import-arquivo" accept=".csv,.xlsx,.xls,text/csv" hidden /></label>
        <span class="arquivo-nome" id="import-arquivo-nome">Nenhum arquivo escolhido</span>
      </div>
      ${importResultado ? `<p class="settings-page-msg ok">${importResultado.sucesso} contato(s) importado(s)${importResultado.falha ? `, ${importResultado.falha} falharam` : ''}.</p>` : ''}
      <button class="btn-primary" id="import-btn" ${importando?'disabled':''}>${importando?'Importando…':'Importar'}</button>
    </div>
  `;
}

/* ---------- Notificações push (neste aparelho) ---------- */
let pushEstado = { carregado:false, suportado:false, permissao:'default', inscrito:false, ocupado:false, msg:null };

function pushSuportado(){
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}
function urlBase64ParaUint8(base64){
  const pad = '='.repeat((4 - base64.length % 4) % 4);
  const b64 = (base64 + pad).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  return Uint8Array.from([...raw].map(c=> c.charCodeAt(0)));
}
async function carregarEstadoPush(){
  pushEstado.suportado = pushSuportado();
  if(pushEstado.suportado){
    pushEstado.permissao = Notification.permission;
    try{
      const reg = await navigator.serviceWorker.ready;
      pushEstado.inscrito = !!(await reg.pushManager.getSubscription());
    }catch(e){ pushEstado.inscrito = false; }
  }
  pushEstado.carregado = true;
  renderApp();
}
async function ativarPush(){
  if(pushEstado.ocupado) return;
  pushEstado.ocupado = true; pushEstado.msg = null; renderApp();
  try{
    const permissao = await Notification.requestPermission();
    pushEstado.permissao = permissao;
    if(permissao !== 'granted') throw new Error('Permissão negada. Libere as notificações deste site nas configurações do navegador e tente de novo.');
    const { publicKey } = await apiRequest('GET', '/push/chave');
    if(!publicKey) throw new Error('O servidor ainda não tem as chaves de notificação configuradas.');
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if(!sub){
      sub = await reg.pushManager.subscribe({ userVisibleOnly:true, applicationServerKey: urlBase64ParaUint8(publicKey) });
    }
    await apiRequest('POST', '/push/inscrever', { subscription: sub.toJSON() });
    pushEstado.inscrito = true;
    pushEstado.msg = { tipo:'ok', texto:'Notificações ativadas neste aparelho. Use "Enviar teste" pra conferir.' };
  }catch(e){
    pushEstado.msg = { tipo:'erro', texto: e.message || 'Não foi possível ativar as notificações.' };
  }
  pushEstado.ocupado = false; renderApp();
}
async function desativarPush(){
  if(pushEstado.ocupado) return;
  pushEstado.ocupado = true; pushEstado.msg = null; renderApp();
  try{
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if(sub){
      try{ await apiRequest('POST', '/push/cancelar', { endpoint: sub.endpoint }); }catch(e){ /* segue e cancela localmente */ }
      await sub.unsubscribe();
    }
    pushEstado.inscrito = false;
    pushEstado.msg = { tipo:'ok', texto:'Notificações desativadas neste aparelho.' };
  }catch(e){
    pushEstado.msg = { tipo:'erro', texto: e.message || 'Não foi possível desativar.' };
  }
  pushEstado.ocupado = false; renderApp();
}
async function testarPush(){
  if(pushEstado.ocupado) return;
  pushEstado.ocupado = true; pushEstado.msg = null; renderApp();
  try{
    const r = await apiRequest('POST', '/push/testar');
    pushEstado.msg = r && r.enviados > 0
      ? { tipo:'ok', texto:'Teste enviado! Em instantes deve aparecer uma notificação.' }
      : { tipo:'erro', texto:'Nenhum aparelho inscrito foi encontrado. Ative as notificações primeiro.' };
  }catch(e){
    pushEstado.msg = { tipo:'erro', texto: e.message || 'Não foi possível enviar o teste.' };
  }
  pushEstado.ocupado = false; renderApp();
}

function renderConfigNotificacoes(){
  if(!pushEstado.carregado){ carregarEstadoPush(); }
  let corpo;
  if(!integracoesConfig.push){
    corpo = `<p class="settings-page-note">As notificações ainda não foram configuradas neste servidor (faltam as chaves VAPID nas variáveis de ambiente). Veja o README.</p>`;
  } else if(!pushEstado.carregado){
    corpo = `<p class="settings-page-note">Verificando este aparelho…</p>`;
  } else if(!pushEstado.suportado){
    corpo = `<p class="settings-page-note">Este navegador não suporta notificações com o app fechado. No iPhone, primeiro adicione o painel à Tela de Início (Compartilhar → Adicionar à Tela de Início) e abra por lá.</p>`;
  } else if(pushEstado.permissao === 'denied'){
    corpo = `<p class="settings-page-note">As notificações estão bloqueadas para este site. Libere nas configurações do navegador (cadeado ao lado do endereço) e volte aqui.</p>`;
  } else {
    corpo = `
      <p class="settings-page-note">Avisa no celular ou computador na hora das suas tarefas, mesmo com o app fechado. A ativação vale só para este aparelho.</p>
      <p class="settings-page-note"><strong>Situação:</strong> ${pushEstado.inscrito ? 'ativadas neste aparelho ✅' : 'desativadas neste aparelho'}</p>
      ${pushEstado.msg ? `<p class="settings-page-msg ${pushEstado.msg.tipo}">${esc(pushEstado.msg.texto)}</p>` : ''}
      ${pushEstado.inscrito
        ? `<button class="btn-outline" data-action="push-testar" ${pushEstado.ocupado?'disabled':''}>Enviar teste</button>
           <button class="btn-outline" data-action="push-desativar" ${pushEstado.ocupado?'disabled':''}>Desativar</button>`
        : `<button class="btn-primary" data-action="push-ativar" ${pushEstado.ocupado?'disabled':''}>${pushEstado.ocupado?'Ativando…':'Ativar neste aparelho'}</button>`}
    `;
  }
  return `
    <div class="settings-page-section">
      <h3>Notificações no aparelho</h3>
      ${corpo}
    </div>
  `;
}

/* ---------- Resumo diário por e-mail ---------- */
let resumoDiario = { carregado:false, disponivel:false, ativo:false, email:'', ocupado:false, msg:null };
async function carregarResumoDiario(){
  resumoDiario.carregado = true;
  try{
    const d = await apiRequest('GET', '/resumo-diario');
    resumoDiario = { ...resumoDiario, ativo: !!d.ativo, disponivel: !!d.emailDisponivel, email: d.email || '' };
  }catch(e){ resumoDiario.disponivel = false; }
  renderApp();
}
async function alternarResumoDiario(){
  if(resumoDiario.ocupado) return;
  resumoDiario.ocupado = true; resumoDiario.msg = null; renderApp();
  try{
    const d = await apiRequest('PUT', '/resumo-diario', { ativo: !resumoDiario.ativo });
    resumoDiario.ativo = !!d.ativo;
    resumoDiario.msg = { tipo:'ok', texto: resumoDiario.ativo ? 'Pronto: você vai receber o resumo todo dia útil de manhã.' : 'Resumo diário desativado.' };
  }catch(e){
    resumoDiario.msg = { tipo:'erro', texto: e.message || 'Não foi possível alterar.' };
  }
  resumoDiario.ocupado = false; renderApp();
}
async function enviarResumoDiarioAgora(){
  if(resumoDiario.ocupado) return;
  resumoDiario.ocupado = true; resumoDiario.msg = null; renderApp();
  try{
    await apiRequest('POST', '/resumo-diario/enviar-agora', undefined, 60000);
    resumoDiario.msg = { tipo:'ok', texto:'Resumo enviado para ' + (resumoDiario.email || 'o seu e-mail') + '.' };
  }catch(e){
    resumoDiario.msg = { tipo:'erro', texto: e.message || 'Não foi possível enviar agora.' };
  }
  resumoDiario.ocupado = false; renderApp();
}
function renderBlocoResumoDiario(){
  if(!resumoDiario.carregado){ carregarResumoDiario(); return ''; }
  if(!resumoDiario.disponivel) return '';
  return `
    <div class="settings-page-section">
      <h3>Resumo diário</h3>
      <p class="settings-page-note">Todo dia útil, a partir das 8h, enviamos para <strong>${esc(resumoDiario.email)}</strong> um resumo: tarefas de hoje e atrasadas, negociações paradas há mais de 7 dias na mesma etapa, contatos novos das últimas 24h e a meta do mês.${equipe && equipe.souSupervisor ? ' Como gestor da equipe, você também recebe um quadro com os números de cada pessoa.' : ''}</p>
      <p class="settings-page-note">Situação: <strong>${resumoDiario.ativo?'ligado':'desligado'}</strong></p>
      ${resumoDiario.msg ? `<p class="settings-page-msg ${resumoDiario.msg.tipo}">${esc(resumoDiario.msg.texto)}</p>` : ''}
      <div class="settings-btn-row">
        <button class="btn-outline" data-action="resumo-diario-alternar" ${resumoDiario.ocupado?'disabled':''}>${resumoDiario.ativo?'Desligar resumo diário':'Ligar resumo diário'}</button>
        <button class="btn-outline" data-action="resumo-diario-agora" ${resumoDiario.ocupado?'disabled':''}>${resumoDiario.ocupado?'Aguarde…':'Enviar um agora (teste)'}</button>
      </div>
    </div>
  `;
}

/* ---------- Tarefas por e-mail ---------- */
let emailTarefas = { carregado:false, disponivel:false, ativo:false, email:'', ocupado:false, msg:null };
async function carregarEmailTarefas(){
  emailTarefas.carregado = true;
  try{
    const d = await apiRequest('GET', '/tasks/config/email');
    emailTarefas = { ...emailTarefas, ativo: !!d.ativo, disponivel: !!d.emailDisponivel, email: d.email || '' };
  }catch(e){ emailTarefas.disponivel = false; }
  renderApp();
}
async function alternarEmailTarefas(){
  if(emailTarefas.ocupado) return;
  emailTarefas.ocupado = true; emailTarefas.msg = null; renderApp();
  try{
    const d = await apiRequest('PUT', '/tasks/config/email', { ativo: !emailTarefas.ativo });
    emailTarefas.ativo = !!d.ativo;
    emailTarefas.msg = { tipo:'ok', texto: emailTarefas.ativo ? 'Pronto: você vai receber as tarefas por e-mail.' : 'E-mails de tarefas desligados.' };
  }catch(e){
    emailTarefas.msg = { tipo:'erro', texto: e.message || 'Não foi possível alterar.' };
  }
  emailTarefas.ocupado = false; renderApp();
}
function renderBlocoEmailTarefas(){
  if(!emailTarefas.carregado){ carregarEmailTarefas(); return ''; }
  if(!emailTarefas.disponivel) return '';
  return `
    <div class="settings-page-section">
      <h3>Tarefas por e-mail</h3>
      <p class="settings-page-note">Ao criar uma tarefa com data, enviamos um e-mail para <strong>${esc(emailTarefas.email)}</strong> com um arquivo que adiciona o compromisso ao seu calendário. No dia da tarefa (ou 15 minutos antes, se ela tiver hora) chega o lembrete, junto com o aviso aqui no CRM.</p>
      <p class="settings-page-note">Situação: <strong>${emailTarefas.ativo?'ligado':'desligado'}</strong></p>
      ${emailTarefas.msg ? `<p class="settings-page-msg ${emailTarefas.msg.tipo}">${esc(emailTarefas.msg.texto)}</p>` : ''}
      <button class="btn-outline" data-action="email-tarefas-alternar" ${emailTarefas.ocupado?'disabled':''}>${emailTarefas.ativo?'Desligar e-mails de tarefas':'Ligar e-mails de tarefas'}</button>
    </div>
  `;
}

// Aba "E-mail" (Integrações): tudo que o Livro-Caixa manda por e-mail e como ligar/desligar.
// (Trocar o e-mail da conta fica em "Seu perfil".)
function renderConfigEmail(){
  const blocos = [renderBlocoResumoDiario(), renderBlocoEmailTarefas(), renderBlocoBackupAuto()]; // carregam o estado sozinhos
  const carregando = !resumoDiario.carregado || !emailTarefas.carregado || !backupAuto.carregado;
  const ligado = resumoDiario.disponivel || emailTarefas.disponivel || backupAuto.disponivel || integracoesConfig.emailRecuperacao;
  return `
    <div class="settings-page-section">
      <h3>E-mail</h3>
      <p class="settings-page-note">Escolha o que o Livro-Caixa envia para <strong>${esc((currentUser && currentUser.email) || 'o seu e-mail')}</strong>. Para trocar o e-mail da conta, vá em <button class="btn-link" data-action="set-config-categoria" data-categoria="perfil">Seu perfil</button>.</p>
      ${carregando ? `<p class="settings-page-note">Carregando…</p>` : (!ligado
        ? `<p class="settings-page-msg erro">O envio de e-mail ainda não está ligado neste servidor. Quem administra o sistema precisa configurar <code>RESEND_API_KEY</code>, <code>EMAIL_FROM</code> e <code>APP_URL</code> no Render.</p>`
        : '')}
    </div>
    ${blocos.join('')}
    ${(!carregando && ligado) ? `
    <div class="settings-page-section">
      <h3>E-mails automáticos</h3>
      <p class="settings-page-note">Estes saem sozinhos, sem precisar ligar: recuperação de senha, aviso de senha alterada, aviso de e-mail da conta alterado e os avisos da assinatura (teste acabando, pagamento).</p>
    </div>` : ''}
  `;
}

/* ---------- Backup automático por e-mail ---------- */
let backupAuto = { carregado:false, disponivel:false, ativo:false, ultimoEnvio:null, email:'', ocupado:false, msg:null };
async function carregarBackupAuto(){
  backupAuto.carregado = true;
  try{
    const d = await apiRequest('GET', '/backup/automatico');
    backupAuto = { ...backupAuto, ...d };
  }catch(e){ backupAuto.disponivel = false; }
  renderApp();
}
async function alternarBackupAuto(){
  if(backupAuto.ocupado) return;
  backupAuto.ocupado = true; backupAuto.msg = null; renderApp();
  try{
    const d = await apiRequest('PUT', '/backup/automatico', { ativo: !backupAuto.ativo });
    backupAuto.ativo = !!d.ativo;
    backupAuto.msg = { tipo:'ok', texto: backupAuto.ativo ? 'Backup semanal ligado.' : 'Backup semanal desligado.' };
  }catch(e){
    backupAuto.msg = { tipo:'erro', texto: e.message || 'Não foi possível alterar.' };
  }
  backupAuto.ocupado = false; renderApp();
}
async function enviarBackupAutoAgora(){
  if(backupAuto.ocupado) return;
  backupAuto.ocupado = true; backupAuto.msg = null; renderApp();
  try{
    const d = await apiRequest('POST', '/backup/automatico/enviar-agora', undefined, 90000);
    backupAuto.ultimoEnvio = (d && d.ultimoEnvio) || new Date().toISOString();
    backupAuto.msg = { tipo:'ok', texto:'Backup enviado para ' + (backupAuto.email || 'o seu e-mail') + '.' };
  }catch(e){
    backupAuto.msg = { tipo:'erro', texto: e.message || 'Não foi possível enviar agora.' };
  }
  backupAuto.ocupado = false; renderApp();
}
function renderBlocoBackupAuto(){
  if(!backupAuto.carregado){ carregarBackupAuto(); return ''; }
  if(!backupAuto.disponivel) return '';
  const ult = backupAuto.ultimoEnvio ? new Date(backupAuto.ultimoEnvio).toLocaleString('pt-BR') : 'nunca';
  return `
    <div class="settings-page-section">
      <h3>Backup semanal</h3>
      <p class="settings-page-note">Toda semana enviamos uma cópia dos seus dados (clientes, tarefas, comissões, mensagens e configurações) para <strong>${esc(backupAuto.email || 'o seu e-mail')}</strong>. Os anexos dos clientes não entram nesse arquivo — para eles use o Backup em Manutenção. Último envio: ${esc(ult)}.</p>
      ${backupAuto.msg ? `<p class="settings-page-msg ${backupAuto.msg.tipo}">${esc(backupAuto.msg.texto)}</p>` : ''}
      <p class="settings-page-note">Situação: <strong>${backupAuto.ativo?'ligado':'desligado'}</strong></p>
      <div class="settings-btn-row">
        <button class="btn-outline" data-action="backup-auto-alternar" ${backupAuto.ocupado?'disabled':''}>${backupAuto.ativo?'Desligar backup semanal':'Ligar backup semanal'}</button>
        <button class="btn-outline" data-action="backup-auto-agora" ${backupAuto.ocupado?'disabled':''}>${backupAuto.ocupado?'Aguarde…':'Enviar um agora'}</button>
      </div>
    </div>
  `;
}

function renderConfigManutencao(){
  return `
    <div class="settings-page-section">
      <h3>Backup dos seus dados</h3>
      <p class="settings-page-note">Guarda ou restaura uma cópia de todos os seus clientes, tarefas, comissões, mensagens e configurações.</p>
      <button class="btn-outline" data-action="abrir-backup-modal">📦 Backup</button>
      <p class="settings-page-note" style="margin-top:10px;">Quer receber uma cópia toda semana por e-mail? Ligue em <button class="btn-link" data-action="set-config-categoria" data-categoria="email">Integrações → E-mail</button>.</p>
    </div>
    <div class="settings-page-section">
      <h3>Atualizações</h3>
      <p class="settings-page-note">Se o painel parecer desatualizado (algo que já mudou e não aparece), use esse botão pra forçar buscar a versão mais nova — principalmente útil no app instalado no celular.</p>
      ${atualizacaoMsg ? `<p class="settings-page-msg ${atualizacaoMsg.tipo}">${esc(atualizacaoMsg.texto)}</p>` : ''}
      <button class="btn-outline" data-action="verificar-atualizacao" ${verificandoAtualizacao?'disabled':''}>${verificandoAtualizacao?'Verificando…':'Verificar atualizações'}</button>
    </div>
  `;
}

function renderConfiguracoesPage(){
  const CONTEUDO_CATEGORIA = {
    'perfil': renderConfigPerfil,
    'assinatura': renderConfigAssinatura,
    'seguranca': renderConfigSeguranca,
    'aparencia': renderConfigAparencia,
    'notificacoes': renderConfigNotificacoes,
    'google-agenda': renderConfigGoogleAgenda,
    'email': renderConfigEmail,
    'webhooks': renderConfigWebhooks,
    'agendamento': renderConfigAgendamento,
    'campos': renderConfigCampos,
    'importar': renderConfigImportar,
    'manutencao': renderConfigManutencao,
    'monitoramento': ()=> podeVerMonitoramento() ? renderMonitoramentoConteudo() : renderConfigPerfil(),
  };
  const renderFn = CONTEUDO_CATEGORIA[configCategoriaAtiva] || renderConfigPerfil;
  return `
    <div class="page-head">
      <div>
        <h1>Configurações</h1>
        <p>Sua conta, integrações e dados</p>
      </div>
    </div>

    <div class="config-layout ${configMobileConteudo ? 'mostrando-conteudo' : 'mostrando-lista'}">
      <div class="config-sidebar">
        ${CONFIG_CATEGORIAS.map(g=>{
          const itens = g.itens.filter(([key])=> (!acessoCrm || acessoCrm.gestor || key === 'aparencia') && (key !== 'monitoramento' || podeVerMonitoramento())); // equipe: só a aparência
          return itens.length ? `
          <div class="config-sidebar-grupo">${g.grupo}</div>
          ${itens.map(([key,label])=>`<button class="config-sidebar-item ${configCategoriaAtiva===key?'active':''}" data-action="set-config-categoria" data-categoria="${key}">${label}</button>`).join('')}
        ` : '';}).join('')}
      </div>
      <div class="config-content">
        <button type="button" class="config-voltar-mobile" data-action="config-voltar-mobile">‹ Configurações</button>
        ${renderFn()}
      </div>
    </div>
  `;
}
