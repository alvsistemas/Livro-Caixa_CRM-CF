/* ---------- Equipe (Chat Interno + Supervisão) ---------- */
async function loadEquipe(){
  try{
    const data = await apiRequest('GET', '/equipe');
    equipe = data.equipe;
    convitesRecebidos = data.convitesRecebidos || [];
  }catch(e){
    equipe = null;
    convitesRecebidos = [];
  }
  equipeLoaded = true;
  renderApp();
  if(equipe && currentPage === 'equipe'){
    if(equipeSubTab==='chat' && !chatLoaded) loadChat();
    if(equipeSubTab==='supervisao' && equipe.souSupervisor && !supervisaoLoaded) loadSupervisao();
    if(equipeSubTab==='monitoramento' && equipe.souSupervisorDeDados && !monitoramentoLoaded) loadMonitoramento();
  }
}
async function loadChat(){
  if(!equipe){ chatLoaded = true; renderApp(); return; }
  try{
    const data = await apiRequest('GET', '/equipe/chat');
    chatMensagens = data.mensagens || [];
  }catch(e){
    chatMensagens = [];
  }
  chatLoaded = true;
  renderApp();
}
async function loadMonitoramento(){
  monitoramentoLoaded = false;
  renderApp();
  try{
    const data = await apiRequest('GET', '/monitoramento/erros');
    monitoramentoErros = data.erros || [];
  }catch(e){
    monitoramentoErros = [];
  }
  monitoramentoLoaded = true;
  renderApp();
}
async function limparMonitoramento(){
  showConfirm({
    message: 'Limpar todo o log de erros registrado? Não afeta o funcionamento do sistema, só apaga o histórico.',
    confirmLabel: 'Limpar',
    onConfirm: async ()=>{
      closeConfirm();
      try{
        await apiRequest('DELETE', '/monitoramento/erros');
        monitoramentoErros = [];
      }catch(e){
        errorMsg = 'Não foi possível limpar o log agora.';
      }
      renderApp();
    },
  });
}
async function loadSupervisao(){
  if(!equipe || !equipe.souSupervisor){ supervisaoLoaded = true; renderApp(); return; }
  try{
    const data = await apiRequest('GET', '/equipe/supervisao');
    supervisaoMembros = data.membros || [];
  }catch(e){
    supervisaoMembros = [];
  }
  supervisaoLoaded = true;
  renderApp();
}
// Troca temporariamente os dados em tela (board, tarefas, meta) pelos de um membro da
// equipe, pro gestor ver o Dashboard dele exatamente como ele vê o próprio — sem
// nenhuma ação de edição disponível. sairDashboardDeMembro() devolve tudo como estava.
async function abrirDashboardDeMembro(userId, nome){
  try{
    const data = await apiRequest('GET', `/equipe/supervisao/${userId}/dashboard`);
    boardBackupGestor = board;
    tasksBackupGestor = tasks;
    metaVendasValorBackupGestor = metaVendasValor;
    board = { columns: data.columns || [], cards: data.cards || [] };
    tasks = data.tasks || [];
    tasksLoaded = true;
    metaVendasValor = data.metaVendasValor || 0;
    visualizandoDashboardDe = { userId, nome: data.nome || nome };
    goToPage('dashboard');
  }catch(e){
    errorMsg = 'Não foi possível carregar o dashboard desse membro.';
    renderApp();
  }
}
function sairDashboardDeMembro(){
  goToPage('equipe'); // a própria goToPage já restaura board/tasks/meta ao sair do dashboard
  equipeSubTab = 'supervisao';
  renderApp();
}

/* ---------- Automações ---------- */
async function loadAutomacoes(){
  try{
    const data = await apiRequest('GET', '/automacoes');
    automacoes = data.automacoes || [];
  }catch(e){
    automacoes = [];
  }
  automacoesLoaded = true;
  renderApp();
}
async function salvarAutomacao(){
  const f = automacaoModalForm;
  if(!f.nome.trim() || !f.colunaGatilhoId) return;
  const dados = { nome: f.nome, colunaGatilhoId: f.colunaGatilhoId, gatilhoTipo: f.gatilhoTipo, acaoTipo: f.acaoTipo, acaoParams: f.acaoParams };
  try{
    if(f.__isNew){
      const nova = await apiRequest('POST', '/automacoes', dados);
      automacoes.unshift(nova);
    } else {
      const atualizada = await apiRequest('PUT', `/automacoes/${f.id}`, dados);
      const idx = automacoes.findIndex(a=>a.id===f.id);
      if(idx>-1) automacoes[idx] = atualizada;
    }
    closeAutomacaoModal();
  }catch(e){
    errorMsg = e.message || 'Não foi possível salvar a automação.';
  }
  renderApp();
}
async function toggleAutomacaoAtiva(id){
  const a = automacoes.find(x=>x.id===id);
  if(!a) return;
  const anterior = a.ativa;
  a.ativa = !a.ativa;
  renderApp();
  try{
    await apiRequest('PUT', `/automacoes/${id}`, { ativa: a.ativa });
  }catch(e){
    a.ativa = anterior;
    errorMsg = 'Não foi possível atualizar a automação.';
    renderApp();
  }
}
async function excluirAutomacao(id){
  const idx = automacoes.findIndex(a=>a.id===id);
  if(idx===-1) return;
  const [removida] = automacoes.splice(idx,1);
  renderApp();
  try{
    await apiRequest('DELETE', `/automacoes/${id}`);
  }catch(e){
    automacoes.splice(idx,0,removida);
    errorMsg = 'Não foi possível excluir a automação.';
    renderApp();
  }
}

/* ---------- Fluxos ---------- */
async function loadFluxos(){
  try{
    const data = await apiRequest('GET', '/fluxos');
    fluxos = data.fluxos || [];
  }catch(e){
    fluxos = [];
  }
  fluxosLoaded = true;
  renderApp();
}
async function salvarFluxo(){
  const f = fluxoModalForm;
  if(!f.nome.trim() || !f.colunaGatilhoId || !f.etapas.length) return;
  const dados = { nome: f.nome, colunaGatilhoId: f.colunaGatilhoId, etapas: f.etapas };
  try{
    if(f.__isNew){
      const novo = await apiRequest('POST', '/fluxos', dados);
      novo.emAndamento = 0;
      fluxos.unshift(novo);
    } else {
      const atualizado = await apiRequest('PUT', `/fluxos/${f.id}`, dados);
      const idx = fluxos.findIndex(x=>x.id===f.id);
      if(idx>-1) fluxos[idx] = { ...fluxos[idx], ...atualizado };
    }
    closeFluxoModal();
  }catch(e){
    errorMsg = e.message || 'Não foi possível salvar o fluxo.';
  }
  renderApp();
}
async function toggleFluxoAtivo(id){
  const f = fluxos.find(x=>x.id===id);
  if(!f) return;
  const anterior = f.ativo;
  f.ativo = !f.ativo;
  renderApp();
  try{
    await apiRequest('PUT', `/fluxos/${id}`, { ativo: f.ativo });
  }catch(e){
    f.ativo = anterior;
    errorMsg = 'Não foi possível atualizar o fluxo.';
    renderApp();
  }
}
async function excluirFluxo(id){
  const idx = fluxos.findIndex(f=>f.id===id);
  if(idx===-1) return;
  const [removido] = fluxos.splice(idx,1);
  renderApp();
  try{
    await apiRequest('DELETE', `/fluxos/${id}`);
  }catch(e){
    fluxos.splice(idx,0,removido);
    errorMsg = 'Não foi possível excluir o fluxo.';
    renderApp();
  }
}

