/* ---------- Google Agenda ---------- */
async function loadCalendarStatus(){
  try{
    const data = await apiRequest('GET', '/calendar/status');
    calendarConnected = !!data.connected;
  }catch(e){
    calendarConnected = false;
  }
  renderApp();
}
// Quais integrações que dependem do servidor (não do usuário) estão configuradas nesse
// ambiente — chamada 1x no início, pra decidir o que mostrar em Configurações. Pública,
// não exige estar logado (mas não tem problema mandar o token também).
async function loadIntegracoesConfig(){
  try{
    const data = await apiRequest('GET', '/config/integracoes');
    integracoesConfig = { ...integracoesConfig, ...data };
  }catch(e){
    // se não conseguir checar, mantém tudo visível (otimista) — melhor mostrar um botão
    // que às vezes falha do que esconder uma integração que na verdade está configurada
  }
  renderApp();
  renderAssistente();
}
/* ---------- Agenda por link (.ics) — alternativa ao Google Agenda ---------- */
async function loadIcsStatus(){
  icsCarregando = true;
  try{
    icsStatus = await apiRequest('GET', '/calendar/ics-status');
  }catch(e){
    icsStatus = null;
  }
  icsCarregando = false;
  renderApp();
}
async function gerarLinkIcs(){
  icsGerando = true;
  renderApp();
  try{
    icsStatus = await apiRequest('POST', '/calendar/ics/gerar');
  }catch(e){
    errorMsg = e.message || 'Não foi possível gerar o link de agenda.';
  }
  icsGerando = false;
  renderApp();
}
function revogarLinkIcs(){
  showConfirm({
    message: 'Revogar o link de agenda atual? Quem já assinou esse link (Google, Apple, Outlook…) para de receber atualizações. Você pode gerar um link novo a qualquer momento.',
    confirmLabel: 'Revogar',
    onConfirm: async ()=>{
      closeConfirm();
      try{
        await apiRequest('POST', '/calendar/ics/revogar');
        icsStatus = { ativo:false, url:null };
      }catch(e){
        errorMsg = e.message || 'Não foi possível revogar o link de agenda.';
      }
      renderApp();
    },
  });
}

/* ---------- WhatsApp Business API ---------- */
async function loadWhatsappStatus(){
  try{
    const data = await apiRequest('GET', '/whatsapp/status');
    whatsappConnected = !!data.connected;
    agenteIaAtivo = !!data.agenteIaAtivo;
    iaProativaAtiva = !!data.iaProativaAtiva;
    whatsappProvedor = data.provedor === 'ycloud' ? 'ycloud' : 'meta';
    whatsappYcloudWebhookPath = data.ycloudWebhookPath || null;
    whatsappYcloudSecretOk = !!data.ycloudSecretConfigurado;
  }catch(e){
    whatsappConnected = false;
  }
  renderApp();
}
async function definirIaProativa(ativo){
  try{
    await apiRequest('POST', '/whatsapp/ia-proativa', { ativo });
    iaProativaAtiva = ativo;
  }catch(e){
    errorMsg = e.message || 'Não foi possível atualizar a IA proativa.';
  }
  renderApp();
}

/* ---------- Menu de triagem (fluxo de primeiro contato) ---------- */
async function loadMenuTriagem(){
  try{
    const data = await apiRequest('GET', '/whatsapp/menu-triagem');
    menuTriagem = data.menuTriagem || { ativo:false, mensagemInicial:'', opcoes:[] };
  }catch(e){
    menuTriagem = { ativo:false, mensagemInicial:'', opcoes:[] };
  }
  menuTriagemCarregado = true;
  renderApp();
}
async function salvarMenuTriagem(){
  if(menuTriagem.ativo){
    if(!menuTriagem.mensagemInicial.trim() || !menuTriagem.opcoes.length){
      menuTriagemMsg = { tipo:'erro', texto:'Escreva a mensagem inicial e adicione ao menos uma opção antes de ativar.' };
      renderApp();
      return;
    }
  }
  menuTriagemSalvando = true;
  menuTriagemMsg = null;
  renderApp();
  try{
    const data = await apiRequest('PUT', '/whatsapp/menu-triagem', menuTriagem);
    menuTriagem = data.menuTriagem;
    menuTriagemMsg = { tipo:'ok', texto:'Menu salvo.' };
  }catch(e){
    menuTriagemMsg = { tipo:'erro', texto: e.message || 'Não foi possível salvar o menu.' };
  }
  menuTriagemSalvando = false;
  renderApp();
}
async function definirAgenteIa(ativo){
  try{
    await apiRequest('POST', '/whatsapp/agente-ia', { ativo });
    agenteIaAtivo = ativo;
  }catch(e){
    errorMsg = e.message || 'Não foi possível atualizar o agente de IA.';
  }
  renderApp();
}
async function salvarWhatsappConfig(){
  const val = (id)=>{ const el = document.getElementById(id); return el ? el.value.trim() : ''; };
  let payload;
  if(whatsappProvedorEscolhido === 'ycloud'){
    payload = { provedor:'ycloud', numero: val('wa-yc-numero'), apiKey: val('wa-yc-apikey'), webhookSecret: val('wa-yc-secret') };
    if(!payload.numero || !payload.apiKey){
      whatsappConfigMsg = { tipo:'erro', texto:'Preencha o número do WhatsApp e a API Key da YCloud.' };
      renderApp();
      return;
    }
  } else {
    payload = { phoneNumberId: val('wa-phone-id'), accessToken: val('wa-token'), wabaId: val('wa-waba-id') };
    if(!payload.phoneNumberId || !payload.accessToken){
      whatsappConfigMsg = { tipo:'erro', texto:'Preencha o Phone Number ID e o Access Token.' };
      renderApp();
      return;
    }
  }
  whatsappSalvando = true;
  whatsappConfigMsg = null;
  renderApp();
  try{
    const resp = await apiRequest('POST', '/whatsapp/configurar', payload);
    whatsappConnected = true;
    whatsappProvedor = whatsappProvedorEscolhido;
    whatsappYcloudWebhookPath = (resp && resp.ycloudWebhookPath) || null;
    whatsappYcloudSecretOk = !!(resp && resp.ycloudSecretConfigurado);
    whatsappConfigMsg = { tipo:'ok', texto:'Conectado com sucesso.' };
  }catch(e){
    whatsappConfigMsg = { tipo:'erro', texto: e.message || 'Não foi possível salvar a configuração.' };
  }
  whatsappSalvando = false;
  renderApp();
}
function fecharYcloudSecretModal(){ document.getElementById('modal-root').innerHTML=''; }
function abrirYcloudSecretModal(){
  const root = document.getElementById('modal-root');
  root.innerHTML = `
    <div class="overlay" id="yc-secret-overlay">
      <div class="modal">
        <div class="modal-head">
          <h3>Secret do webhook (YCloud)</h3>
          <button id="yc-secret-close">✕</button>
        </div>
        <div class="modal-body">
          <p class="settings-page-note" style="margin:0">O secret é uma senha que a YCloud gera quando você cria o endpoint de webhook. Com ela o CRM confere se cada aviso (mensagem recebida, entregue, lida) veio mesmo da YCloud e não de outra pessoa. Sem o secret, o CRM recusa os avisos e as mensagens não aparecem.</p>
          <ol class="settings-page-note" style="margin:0;padding-left:18px">
            <li>Na YCloud, crie o endpoint com o endereço do webhook mostrado aqui no CRM.</li>
            <li>Copie o secret que ela mostrar (começa com <b>whsec_</b>).</li>
            <li>Cole abaixo e salve.</li>
          </ol>
          <div class="field"><label>Secret (whsec_…)</label><input type="password" id="yc-secret-input" autocomplete="off" placeholder="${whatsappYcloudSecretOk ? 'Já existe um salvo — cole aqui só para trocar' : 'whsec_…'}" /></div>
          <p class="settings-page-msg erro" id="yc-secret-erro" style="display:none"></p>
        </div>
        <div class="modal-foot">
          <span></span>
          <div class="modal-foot-actions">
            <button class="btn-outline" id="yc-secret-cancel">Cancelar</button>
            <button class="btn-save" id="yc-secret-salvar">Salvar secret</button>
          </div>
        </div>
      </div>
    </div>
  `;
  const erro = (t)=>{ const el = document.getElementById('yc-secret-erro'); el.textContent = t; el.style.display = 'block'; };
  document.getElementById('yc-secret-close').addEventListener('click', fecharYcloudSecretModal);
  document.getElementById('yc-secret-cancel').addEventListener('click', fecharYcloudSecretModal);
  document.getElementById('yc-secret-overlay').addEventListener('click', (e)=>{ if(e.target.id==='yc-secret-overlay') fecharYcloudSecretModal(); });
  document.getElementById('yc-secret-input').focus();
  document.getElementById('yc-secret-salvar').addEventListener('click', async ()=>{
    const valor = document.getElementById('yc-secret-input').value.trim();
    if(!valor){ erro('Cole o secret (whsec_…) mostrado pela YCloud.'); return; }
    try{
      await apiRequest('POST', '/whatsapp/ycloud-secret', { webhookSecret: valor });
      whatsappYcloudSecretOk = true;
      fecharYcloudSecretModal();
      renderApp();
    }catch(e){
      erro((e && e.message) || 'Não foi possível salvar o secret.');
    }
  });
}
async function desconectarWhatsapp(){
  try{
    await apiRequest('POST', '/whatsapp/desconectar');
    whatsappConnected = false;
    whatsappProvedor = 'meta';
    whatsappYcloudWebhookPath = null;
    whatsappYcloudSecretOk = false;
  }catch(e){
    errorMsg = 'Não foi possível desconectar o WhatsApp Business.';
  }
  renderApp();
}

/* ---------- Instagram (captação de leads) ---------- */
async function loadInstagramStatus(){
  try{
    const data = await apiRequest('GET', '/instagram/status');
    instagramConnected = !!data.connected;
  }catch(e){
    instagramConnected = false;
  }
  renderApp();
}
async function salvarInstagramConfig(){
  const pageIdEl = document.getElementById('ig-page-id');
  const tokenEl = document.getElementById('ig-page-token');
  const igBusinessIdEl = document.getElementById('ig-business-id');
  const pageId = pageIdEl ? pageIdEl.value.trim() : '';
  const pageAccessToken = tokenEl ? tokenEl.value.trim() : '';
  const igBusinessId = igBusinessIdEl ? igBusinessIdEl.value.trim() : '';
  if(!pageId || !pageAccessToken){
    instagramConfigMsg = { tipo:'erro', texto:'Preencha o Page ID e o Access Token da página.' };
    renderApp();
    return;
  }
  instagramSalvando = true;
  instagramConfigMsg = null;
  renderApp();
  try{
    await apiRequest('POST', '/instagram/configurar', { pageId, pageAccessToken, igBusinessId });
    instagramConnected = true;
    instagramConfigMsg = { tipo:'ok', texto:'Conectado com sucesso.' };
  }catch(e){
    instagramConfigMsg = { tipo:'erro', texto: e.message || 'Não foi possível salvar a configuração.' };
  }
  instagramSalvando = false;
  renderApp();
}
async function desconectarInstagram(){
  try{
    await apiRequest('POST', '/instagram/desconectar');
    instagramConnected = false;
  }catch(e){
    errorMsg = 'Não foi possível desconectar o Instagram.';
  }
  renderApp();
}

async function abrirHistoricoCard(){
  const box = document.getElementById('f-historico');
  if(!box || !modalForm || modalForm.__isNew) return;
  box.style.display = 'block';
  box.innerHTML = '<p class="settings-page-note">Carregando histórico…</p>';

  let mensagens = [];
  try{
    const data = await apiRequest('GET', `/whatsapp/conversas/${modalForm.id}`);
    mensagens = data.mensagens || [];
  }catch(e){ /* sem WhatsApp conectado ou sem conversa — segue sem elas */ }

  const tarefasDoLead = tasks.filter(t=>t.leadId===modalForm.id);

  const eventos = [];
  if(modalForm.createdAt){
    eventos.push({ texto:'Cliente criado', data: modalForm.createdAt, icone:'✦' });
  }
  tarefasDoLead.forEach(t=>{
    eventos.push({ texto:`Tarefa criada: ${t.titulo}${t.concluida?' (concluída)':''}`, data: t.createdAt || t.vencimento, icone:'✓' });
  });
  mensagens.forEach(m=>{
    eventos.push({ texto:`${m.direction==='out'?'Você':'Cliente'}: ${(m.texto||'').slice(0,80)}`, data: m.timestamp, icone:'💬' });
  });
  eventos.sort((a,b)=> new Date(b.data) - new Date(a.data));

  box.innerHTML = eventos.length ? `
    <div class="historico-lista">
      ${eventos.map(ev=>`
        <div class="historico-item">
          <span class="historico-item-icone">${ev.icone}</span>
          <span class="historico-item-texto">${esc(ev.texto)}</span>
          <span class="historico-item-data">${formatDateHora(ev.data)}</span>
        </div>
      `).join('')}
    </div>
  ` : '<p class="settings-page-note">Nenhum evento registrado ainda.</p>';
}

