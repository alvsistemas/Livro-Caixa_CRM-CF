// CRM · 04-equipe-modulos.js — equipe, automações, fluxos, importar/exportar, campos e histórico. Os arquivos js/crm/ são carregados em ordem pelo index.html e
// compartilham as mesmas variáveis globais (é o antigo script.js dividido, como no CRM de consórcio).
/* ---------- Equipe (Chat Interno + Supervisão) ---------- */
async function loadEquipe(){
  try{
    const data = await apiRequest('GET', '/equipe');
    equipe = data.equipe;
    minhasEquipes = data.minhasEquipes || [];
    limiteEquipes = data.limiteEquipes || 10;
    permForm = null; // tela de permissões recomeça do que está salvo
    if(typeof definirMinhasPermissoes === 'function') definirMinhasPermissoes(data.minhasPermissoes);
  }catch(e){
    equipe = null;
    minhasEquipes = [];
  }
  equipeLoaded = true;
  if(!equipe) equipeTela = 'lista';
  if(metaVendasEquipeCarregada && (equipe ? equipe.id : null) !== metaEquipeDeQual) loadMetaVendasEquipe();
  renderApp();
  if(equipe && currentPage === 'equipe' && equipeTela === 'equipe') carregarAbaDaEquipe();
}
function carregarAbaDaEquipe(){
  if(!['chat','supervisao','permissoes'].includes(equipeSubTab) || (equipeSubTab !== 'chat' && !equipe.souSupervisor)) equipeSubTab = 'chat';
  if(equipeSubTab==='chat' && !chatLoaded) loadChat();
  if(equipeSubTab==='supervisao' && !supervisaoLoaded) loadSupervisao();
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
  showConfirm({ chave:'log-erros',
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
    errorMsg = 'Não foi possível carregar a visão geral desse membro.';
    renderApp();
  }
}
function sairDashboardDeMembro(){
  goToPage('equipe'); // a própria goToPage já restaura board/tasks/meta ao sair do dashboard
  equipeTela = 'equipe';
  equipeSubTab = 'supervisao';
  carregarAbaDaEquipe();
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
    errorMsg = e.message || 'Não foi possível salvar a ação automática.';
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
    errorMsg = 'Não foi possível atualizar a ação automática.';
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
    errorMsg = 'Não foi possível excluir a ação automática.';
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
    errorMsg = e.message || 'Não foi possível salvar a sequência.';
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
    errorMsg = 'Não foi possível atualizar a sequência.';
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
    errorMsg = 'Não foi possível excluir a sequência.';
    renderApp();
  }
}

/* ---------- Importar/Exportar (planilha -> possíveis leads) ---------- */
async function handlePlanilhaFileSelected(file){
  if(!file) return;
  try{ await carregarBiblioteca('xlsx'); }catch(e){ errorMsg = e.message; renderApp(); return; }
  importPlanilhaMsg = null;
  importPlanilhaNomeArquivo = file.name;
  const reader = new FileReader();
  reader.onload = (e)=>{
    try{
      const workbook = XLSX.read(e.target.result, { type:'array' });
      const primeiraAba = workbook.SheetNames[0];
      const linhas = XLSX.utils.sheet_to_json(workbook.Sheets[primeiraAba], { defval:'' });
      if(!linhas.length){
        importPlanilhaMsg = { tipo:'erro', texto:'A planilha parece estar vazia.' };
        importPlanilhaLinhas = [];
        importPlanilhaColunas = [];
        renderApp();
        return;
      }
      importPlanilhaLinhas = linhas;
      importPlanilhaColunas = Object.keys(linhas[0]);
      // tenta adivinhar as colunas certas pelo nome, só pra facilitar — usuário confirma/ajusta de qualquer forma
      const achar = (padroes)=> importPlanilhaColunas.find(c=> padroes.some(p=> c.toLowerCase().includes(p))) || '';
      importMapNome = achar(['nome']);
      importMapTelefone = achar(['telefone','celular','fone','whats']);
      importMapServico = achar(['serviço','servico','produto','interesse','tipo']);
      importPlanilhaMsg = null;
    }catch(err){
      importPlanilhaMsg = { tipo:'erro', texto:'Não foi possível ler esse arquivo. Confira se é um .csv ou .xlsx válido.' };
      importPlanilhaLinhas = [];
      importPlanilhaColunas = [];
    }
    importAnimarEntrada = true;
    renderApp();
  };
  reader.readAsArrayBuffer(file);
}
// as informações da planilha descem (ao escolher) e sobem (ao tirar)
function alturaAnimada(el, de, para, ms, fim){
  el.style.overflow = 'hidden'; el.style.maxHeight = de + 'px';
  void el.offsetHeight;
  el.style.transition = `max-height ${ms}ms cubic-bezier(.2,.75,.3,1)`;
  el.style.maxHeight = para + 'px';
  let feito = false;
  const acabar = ()=>{ if(feito) return; feito = true; el.style.transition = el.style.maxHeight = el.style.overflow = ''; if(fim) fim(); };
  el.addEventListener('transitionend', (e)=>{ if(e.target === el) acabar(); }, { once:true });
  setTimeout(acabar, ms + 80);
}
function semMovimento(){
  return document.documentElement.classList.contains('a11y-sem-movimento') || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
}
function animarEntradaPlanilha(){
  const el = document.getElementById('import-detalhe');
  importAnimarEntrada = false;
  if(!el || semMovimento()) return;
  el.classList.add('entrando');
  alturaAnimada(el, 0, el.scrollHeight, 380);
  setTimeout(()=> el.classList.remove('entrando'), 700);
}
function tirarPlanilha(){
  const limpar = ()=>{
    importPlanilhaNomeArquivo = ''; importPlanilhaLinhas = []; importPlanilhaColunas = [];
    importMapNome = importMapTelefone = importMapServico = ''; importPlanilhaMsg = null;
    renderApp();
  };
  const el = document.getElementById('import-detalhe');
  const chip = app.querySelector('.arquivo-escolhido');
  if(semMovimento()) return limpar();
  if(chip) chip.classList.add('saindo');
  if(!el || !el.offsetHeight) return setTimeout(limpar, 180);
  el.classList.add('saindo');
  alturaAnimada(el, el.offsetHeight, 0, 300, limpar);
}
async function confirmarImportPlanilha(){
  if(!importMapNome && !importMapTelefone){
    importPlanilhaMsg = { tipo:'erro', texto:'Escolha ao menos a coluna de nome ou de telefone.' };
    renderApp();
    return;
  }
  const linhas = importPlanilhaLinhas.map(linha=>({
    nome: importMapNome ? linha[importMapNome] : '',
    telefone: importMapTelefone ? linha[importMapTelefone] : '',
    tipoServico: importMapServico ? linha[importMapServico] : '',
  }));
  importandoPlanilha = true;
  importPlanilhaMsg = null;
  renderApp();
  try{
    const data = await apiRequest('POST', '/possiveis-leads/importar', { linhas, origemArquivo: importPlanilhaNomeArquivo });
    importPlanilhaMsg = { tipo:'ok', texto:`${data.total} possível(is) contato(s) importado(s).` };
    importPlanilhaLinhas = [];
    importPlanilhaColunas = [];
    importPlanilhaNomeArquivo = '';
    await loadPossiveisLeads();
  }catch(e){
    importPlanilhaMsg = { tipo:'erro', texto: e.message || 'Não foi possível importar a planilha.' };
  }
  importandoPlanilha = false;
  renderApp();
}
async function loadPossiveisLeads(){
  try{
    const data = await apiRequest('GET', '/possiveis-leads');
    possiveisLeads = data.leads || [];
  }catch(e){
    possiveisLeads = [];
  }
  possiveisLeadsCarregados = true;
  renderApp();
}
async function descartarPossivelLead(id){
  const idx = possiveisLeads.findIndex(l=>l.id===id);
  if(idx===-1) return;
  const [removido] = possiveisLeads.splice(idx,1);
  renderApp();
  try{
    await apiRequest('DELETE', `/possiveis-leads/${id}`);
  }catch(e){
    possiveisLeads.splice(idx,0,removido);
    errorMsg = 'Não foi possível descartar.';
    renderApp();
  }
}
function abrirCompletarLead(id){
  const lead = possiveisLeads.find(l=>l.id===id);
  if(!lead) return;
  completarLeadModalForm = {
    possivelLeadId: lead.id, nome: lead.nome||'', telefone: lead.telefone||'',
    tipoServico: lead.tipoServico||'', columnId: ((board.columns.find(c=>c.tipo==='aberto')||board.columns[0]||{}).id)||'',
    valor: 0, temperatura:'morno',
  };
  completarLeadMsg = null;
  renderCompletarLeadModal();
}
function closeCompletarLeadModal(){ completarLeadModalForm = null; document.getElementById('modal-root').innerHTML=''; }
async function salvarCompletarLead(){
  const f = completarLeadModalForm;
  if(!f.nome.trim()){
    completarLeadMsg = { tipo:'erro', texto:'Informe o nome do cliente.' };
    renderCompletarLeadModal();
    return;
  }
  if(!f.columnId){
    completarLeadMsg = { tipo:'erro', texto:'Escolha a coluna de destino.' };
    renderCompletarLeadModal();
    return;
  }
  completarLeadSalvando = true;
  completarLeadMsg = null;
  renderCompletarLeadModal();
  try{
    const novoCard = await apiRequest('POST', `/possiveis-leads/${f.possivelLeadId}/promover`, {
      nome: f.nome, telefone: f.telefone, columnId: f.columnId, valor: f.valor,
      temperatura: f.temperatura, obs: f.tipoServico ? `Serviço de interesse: ${f.tipoServico}` : '',
      mes: currentMonthKey(),
    });
    board.cards.push(novoCard);
    possiveisLeads = possiveisLeads.filter(l=>l.id!==f.possivelLeadId);
    closeCompletarLeadModal();
    renderApp();
  }catch(e){
    completarLeadMsg = { tipo:'erro', texto: e.message || 'Não foi possível adicionar aos Contatos.' };
    completarLeadSalvando = false;
    renderCompletarLeadModal();
  }
}
function renderCompletarLeadModal(){
  const root = document.getElementById('modal-root');
  if(!completarLeadModalForm){ root.innerHTML=''; return; }
  const f = completarLeadModalForm;
  root.innerHTML = `
    <div class="overlay" id="cl-lead-overlay">
      <div class="modal">
        <div class="modal-head">
          <h3>Completar e adicionar aos Contatos</h3>
          <button id="cl-lead-close">✕</button>
        </div>
        <div class="modal-body">
          <div class="field"><label>Nome</label><input type="text" id="cl-lead-nome" value="${esc(f.nome)}" /></div>
          <div class="field"><label>Telefone</label><input type="text" id="cl-lead-telefone" value="${esc(f.telefone)}" /></div>
          ${f.tipoServico ? `<p class="settings-page-note">Serviço de interesse (da planilha): <b>${esc(f.tipoServico)}</b></p>` : ''}
          <div class="field">
            <label>Coluna de destino</label>
            <select id="cl-lead-coluna">
              ${board.columns.map(c=>`<option value="${c.id}" ${f.columnId===c.id?'selected':''}>${esc(c.nome)}</option>`).join('')}
            </select>
          </div>
          <div class="field-row">
            <div class="field"><label>Valor (opcional)</label><input type="number" id="cl-lead-valor" value="${f.valor}" min="0" step="0.01" /></div>
            <div class="field">
              <label>Temperatura</label>
              <select id="cl-lead-temp">
                <option value="frio" ${f.temperatura==='frio'?'selected':''}>Frio</option>
                <option value="morno" ${f.temperatura==='morno'?'selected':''}>Morno</option>
                <option value="quente" ${f.temperatura==='quente'?'selected':''}>Quente</option>
              </select>
            </div>
          </div>
          ${completarLeadMsg ? `<p class="settings-page-msg ${completarLeadMsg.tipo}">${esc(completarLeadMsg.texto)}</p>` : ''}
        </div>
        <div class="modal-foot">
          <span></span>
          <div class="modal-foot-actions">
            <button class="btn-outline" id="cl-lead-cancel">Cancelar</button>
            <button class="btn-save" id="cl-lead-salvar" ${completarLeadSalvando?'disabled':''}>${completarLeadSalvando?'Adicionando…':'Adicionar aos Contatos'}</button>
          </div>
        </div>
      </div>
    </div>
  `;
  document.getElementById('cl-lead-close').addEventListener('click', closeCompletarLeadModal);
  document.getElementById('cl-lead-cancel').addEventListener('click', closeCompletarLeadModal);
  document.getElementById('cl-lead-overlay').addEventListener('click', (e)=>{ if(e.target.id==='cl-lead-overlay') closeCompletarLeadModal(); });
  document.getElementById('cl-lead-nome').addEventListener('input', (e)=> completarLeadModalForm.nome = e.target.value);
  document.getElementById('cl-lead-telefone').addEventListener('input', (e)=> completarLeadModalForm.telefone = e.target.value);
  document.getElementById('cl-lead-coluna').addEventListener('change', (e)=> completarLeadModalForm.columnId = e.target.value);
  document.getElementById('cl-lead-valor').addEventListener('input', (e)=> completarLeadModalForm.valor = parseFloat(e.target.value)||0);
  document.getElementById('cl-lead-temp').addEventListener('change', (e)=> completarLeadModalForm.temperatura = e.target.value);
  document.getElementById('cl-lead-salvar').addEventListener('click', salvarCompletarLead);
}


async function criarEquipe(){
  const nome = equipeNomeNovo.trim();
  if(!nome){ equipeMsg = { tipo:'erro', texto:'Digite um nome para a equipe.' }; renderApp(); return; }
  try{
    await apiRequest('POST', '/equipe', { nome });
    equipeNomeNovo = '';
    equipeMsg = null;
    limparDadosDaEquipeAberta(); equipeSubTab = 'chat'; equipeTela = 'equipe'; equipeNovaAberta = false;
    await loadEquipe();
  }catch(e){
    equipeMsg = { tipo:'erro', texto: e.message || 'Não foi possível criar a equipe.' };
    renderApp();
  }
}
async function entrarNaEquipe(){
  const codigo = equipeCodigoEntrar.trim();
  if(!codigo){ equipeMsg = { tipo:'erro', texto:'Digite o código de convite.' }; renderApp(); return; }
  try{
    await apiRequest('POST', '/equipe/entrar', { codigo });
    equipeCodigoEntrar = '';
    equipeMsg = null;
    limparDadosDaEquipeAberta(); equipeSubTab = 'chat'; equipeTela = 'equipe'; equipeNovaAberta = false;
    await loadEquipe();
  }catch(e){
    equipeMsg = { tipo:'erro', texto: e.message || 'Não foi possível entrar na equipe.' };
    renderApp();
  }
}
function limparDadosDaEquipeAberta(){
  chatMensagens = []; chatLoaded = false;
  supervisaoMembros = []; supervisaoLoaded = false;
  monitoramentoLoaded = false;
  dmDestinatarioId = null; dmMensagens = []; dmLoaded = false;
}
// sem equipeId: sai da equipe aberta
async function sairDaEquipe(equipeId){
  try{
    await apiRequest('POST', '/equipe/sair', equipeId ? { equipeId } : {});
    limparDadosDaEquipeAberta();
    equipeTela = 'lista';
    await loadEquipe();
  }catch(e){
    errorMsg = e.message || 'Não foi possível sair da equipe.';
    renderApp();
  }
}
// Troca a equipe aberta (a pessoa continua em todas): chat, gestão e permissões passam a ser os da nova
// Entra numa equipe da lista: ela vira a aberta (chat, gestão e permissões passam a ser os dela)
async function abrirEquipeDaLista(equipeId){
  if(atuandoComo){ errorMsg = 'Saia do funil de ' + atuandoComo.nome + ' antes de trocar de equipe.'; renderApp(); return; }
  const ja = minhasEquipes.find(e=> e.id === equipeId && e.ativa);
  if(ja && equipe){ equipeTela = 'equipe'; equipeSubTab = 'chat'; renderApp(); carregarAbaDaEquipe(); window.scrollTo(0, 0); return; }
  try{
    await apiRequest('POST', '/equipe/abrir', { equipeId });
    limparDadosDaEquipeAberta();
    equipeMsg = null;
    equipeSubTab = 'chat';
    equipeTela = 'equipe';
    await loadEquipe();
    window.scrollTo(0, 0);
  }catch(e){
    errorMsg = e.message || 'Não foi possível abrir a equipe.';
    renderApp();
  }
}

// "Atuar como": o gestor passa a trabalhar no funil de um consultor — vê, cria, edita, exclui e
// move os contatos e tarefas dele. Só gestor da mesma equipe; o servidor confere e registra tudo.
async function entrarNoFunilDe(userId, nome){
  try{
    let meta = 0;
    try{ meta = (await apiRequest('GET', `/equipe/supervisao/${userId}/dashboard`)).metaVendasValor || 0; }catch(e){}
    if(visualizandoDashboardDe) goToPage('equipe'); // devolve os dados do gestor antes
    if(!atuandoComo) metaBackupAtuandoComo = metaVendasValor;
    atuandoComo = { userId, nome };
    metaVendasValor = meta;
    funilAtualId = null; funis = []; board = { columns: [], cards: [] }; tasks = []; loaded = false;
    agendaLoaded = false; agendaTarefas = []; agendaEventosGoogle = [];
    await Promise.all([loadBoard(), loadFunis(), loadTasks(), loadCamposPersonalizados()]);
    if(currentPage === 'pipeline') renderApp(); else goToPage('pipeline');
  }catch(e){
    atuandoComo = null;
    errorMsg = 'Não foi possível abrir o funil desse consultor.';
    renderApp();
  }
}
async function sairDoFunilDe(){
  atuandoComo = null;
  if(metaBackupAtuandoComo !== null) metaVendasValor = metaBackupAtuandoComo;
  metaBackupAtuandoComo = null;
  funilAtualId = null; funis = []; board = { columns: [], cards: [] }; tasks = [];
  agendaLoaded = false; agendaTarefas = []; agendaEventosGoogle = [];
  await Promise.all([loadBoard(), loadFunis(), loadTasks(), loadCamposPersonalizados()]);
  loadAgendaMes(agendaMesAtual);
  equipeSubTab = 'supervisao';
  if(currentPage === 'equipe') renderApp(); else { goToPage('equipe'); }
  equipeTela = 'equipe'; supervisaoLoaded = false; carregarAbaDaEquipe(); renderApp();
}
async function regenerarCodigoEquipe(){
  try{
    const data = await apiRequest('POST', '/equipe/regenerar-codigo');
    if(equipe) equipe.codigoConvite = data.codigoConvite;
  }catch(e){
    errorMsg = 'Não foi possível gerar um novo código.';
  }
  renderApp();
}
async function alterarPapelMembro(userId, papel){
  try{
    await apiRequest('PUT', `/equipe/membro/${userId}/papel`, { papel });
    await loadEquipe();
  }catch(e){
    errorMsg = 'Não foi possível alterar o papel do membro.';
    renderApp();
  }
}
async function alterarSupervisorDeDados(userId, ativo){
  try{
    await apiRequest('PUT', `/equipe/membro/${userId}/supervisor-dados`, { ativo });
    await loadEquipe();
  }catch(e){
    errorMsg = 'Não foi possível alterar o acesso de supervisor de dados.';
    renderApp();
  }
}
async function removerMembro(userId){
  try{
    await apiRequest('DELETE', `/equipe/membro/${userId}`);
    await loadEquipe();
  }catch(e){
    errorMsg = 'Não foi possível remover o membro.';
    renderApp();
  }
}
async function enviarMensagemChat(){
  if(!chatTexto.trim()) return;
  chatEnviando = true;
  renderApp();
  try{
    await apiRequest('POST', '/equipe/chat', { texto: chatTexto });
    chatTexto = '';
    await loadChat();
  }catch(e){
    errorMsg = e.message || 'Não foi possível enviar a mensagem.';
  }
  chatEnviando = false;
  renderApp();
}
async function abrirConversaIndividual(userId){
  dmDestinatarioId = userId;
  dmLoaded = false;
  dmMensagens = [];
  renderApp();
  try{
    const data = await apiRequest('GET', `/equipe/chat/${userId}`);
    dmMensagens = data.mensagens || [];
  }catch(e){
    dmMensagens = [];
    errorMsg = e.message || 'Não foi possível carregar a conversa.';
  }
  dmLoaded = true;
  renderApp();
}
async function enviarMensagemIndividual(){
  if(!dmTexto.trim() || !dmDestinatarioId) return;
  dmEnviando = true;
  renderApp();
  try{
    await apiRequest('POST', `/equipe/chat/${dmDestinatarioId}`, { texto: dmTexto });
    dmTexto = '';
    const data = await apiRequest('GET', `/equipe/chat/${dmDestinatarioId}`);
    dmMensagens = data.mensagens || [];
  }catch(e){
    errorMsg = e.message || 'Não foi possível enviar a mensagem.';
  }
  dmEnviando = false;
  renderApp();
}

// Notificações são calculadas na hora, a partir do que já está carregado
// (tarefas e leads) — não existe uma tabela própria pra isso.
function computarNotificacoes(){
  const notifs = [];
  const fimHoje = new Date(); fimHoje.setHours(23,59,59,999);
  tasks.forEach(t=>{
    if(!t.concluida && t.vencimento && new Date(t.vencimento) <= fimHoje){
      notifs.push({ texto:`Tarefa: ${t.titulo}`, timestamp: t.vencimento, cardId: t.leadId || null });
    }
  });
  const ontem = new Date(Date.now() - 24*60*60*1000);
  board.cards.forEach(c=>{
    if(c.createdAt && new Date(c.createdAt) >= ontem){
      notifs.push({ texto:`Novo contato: ${c.cliente}`, timestamp:c.createdAt, cardId:c.id });
    }
  });
  return notifs.sort((a,b)=> new Date(b.timestamp) - new Date(a.timestamp));
}



/* ---------- Campos personalizados ---------- */
async function toggleAgendamentoPublicoAtivo(){
  agendamentoPublicoForm.ativo = !agendamentoPublicoForm.ativo;
  renderApp();
}
async function salvarAgendamentoPublico(){
  agendamentoPublicoForm.horaInicio = document.getElementById('ap-hora-inicio').value || agendamentoPublicoForm.horaInicio;
  agendamentoPublicoForm.horaFim = document.getElementById('ap-hora-fim').value || agendamentoPublicoForm.horaFim;
  agendamentoPublicoForm.duracaoMinutos = Number(document.getElementById('ap-duracao').value);
  agendamentoPublicoForm.diasSemana = [...document.querySelectorAll('.ap-dia-semana:checked')].map(el=>Number(el.value));
  agendamentoPublicoForm.colunaDestinoId = document.getElementById('ap-coluna-destino').value;
  try{
    const data = await apiRequest('PUT', '/auth/agendamento-publico', agendamentoPublicoForm);
    currentUser = data.user;
    localStorage.setItem('user', JSON.stringify(currentUser));
    agendamentoPublicoMsg = { tipo:'ok', texto:'Configuração salva.' };
  }catch(e){
    agendamentoPublicoMsg = { tipo:'erro', texto: e.message || 'Não foi possível salvar.' };
  }
  renderApp();
}
function copiarLinkAgendamento(){
  const link = `${window.location.origin}/agendar/${currentUser.id}`;
  navigator.clipboard.writeText(link).then(()=>{
    agendamentoPublicoMsg = { tipo:'ok', texto:'Link copiado!' };
    renderApp();
  });
}
async function loadWebhooksSaida(){
  try{
    const data = await apiRequest('GET', '/webhooks-saida');
    webhooksSaida = data.webhooks || [];
  }catch(e){
    webhooksSaida = [];
  }
  renderApp();
}
async function criarWebhookSaida(){
  const nome = document.getElementById('novo-webhook-nome').value;
  const url = document.getElementById('novo-webhook-url').value;
  const eventos = [...document.querySelectorAll('.novo-webhook-evento:checked')].map(el=>el.value);
  if(!url.trim() || !eventos.length){
    webhooksSaidaMsg = { tipo:'erro', texto:'Preencha a URL e escolha ao menos um evento.' };
    renderApp();
    return;
  }
  try{
    const novo = await apiRequest('POST', '/webhooks-saida', { nome, url, eventos });
    webhooksSaida.unshift(novo);
    webhooksSaidaMsg = { tipo:'ok', texto:'Webhook criado.' };
  }catch(e){
    webhooksSaidaMsg = { tipo:'erro', texto: e.message || 'Não foi possível criar o webhook.' };
  }
  renderApp();
}
async function toggleWebhookSaida(id, ativo){
  try{
    const atualizado = await apiRequest('PUT', `/webhooks-saida/${id}`, { ativo });
    const idx = webhooksSaida.findIndex(w=>w.id===id);
    if(idx>-1) webhooksSaida[idx] = atualizado;
  }catch(e){
    webhooksSaidaMsg = { tipo:'erro', texto:'Não foi possível alterar o webhook.' };
  }
  renderApp();
}
async function excluirWebhookSaida(id){
  showConfirm({ chave:'webhook',
    message: 'Remover esse webhook? Ele para de disparar imediatamente.',
    confirmLabel: 'Remover',
    onConfirm: async ()=>{
      closeConfirm();
      try{
        await apiRequest('DELETE', `/webhooks-saida/${id}`);
        webhooksSaida = webhooksSaida.filter(w=>w.id!==id);
      }catch(e){
        webhooksSaidaMsg = { tipo:'erro', texto:'Não foi possível remover o webhook.' };
      }
      renderApp();
    },
  });
}
async function testarWebhookSaida(id){
  webhooksSaidaMsg = { tipo:'ok', texto:'Enviando teste…' };
  renderApp();
  try{
    await apiRequest('POST', `/webhooks-saida/${id}/testar`);
    webhooksSaidaMsg = { tipo:'ok', texto:'Teste enviado — confira do outro lado.' };
  }catch(e){
    webhooksSaidaMsg = { tipo:'erro', texto: e.message || 'Não foi possível testar esse webhook agora.' };
  }
  renderApp();
}
async function loadCamposPersonalizados(){
  try{
    const data = await apiRequest('GET', '/campos-personalizados');
    camposPersonalizados = data.campos || [];
  }catch(e){
    camposPersonalizados = [];
  }
  camposPersonalizadosCarregados = true;
  renderApp();
}
async function criarCampoPersonalizado(){
  const nome = novoCampoNome.trim();
  if(!nome){
    camposPersonalizadosMsg = { tipo:'erro', texto:'Digite um nome pro campo.' };
    renderApp();
    return;
  }
  try{
    const novo = await apiRequest('POST', '/campos-personalizados', { nome, tipo: novoCampoTipo });
    camposPersonalizados.push(novo);
    novoCampoNome = '';
    camposPersonalizadosMsg = null;
  }catch(e){
    camposPersonalizadosMsg = { tipo:'erro', texto: e.message || 'Não foi possível criar o campo.' };
  }
  renderApp();
}
async function excluirCampoPersonalizado(id){
  const idx = camposPersonalizados.findIndex(c=>c.id===id);
  if(idx===-1) return;
  const [removido] = camposPersonalizados.splice(idx,1);
  renderApp();
  try{
    await apiRequest('DELETE', `/campos-personalizados/${id}`);
  }catch(e){
    camposPersonalizados.splice(idx,0,removido);
    errorMsg = 'Não foi possível excluir o campo.';
    renderApp();
  }
}

/* ---------- Histórico de contato (dentro do card) ---------- */
async function loadHistoricoContato(cardId){
  try{
    const data = await apiRequest('GET', `/historico-contato/${cardId}`);
    historicoContatoItens = data.itens || [];
  }catch(e){
    historicoContatoItens = [];
  }
  historicoContatoCarregado = true;
  const lista = document.getElementById('f-historico-lista');
  if(lista){
    lista.innerHTML = renderHistoricoContatoListaHtml();
    ligarBindingsHistoricoContato();
  }
}
function renderHistoricoContatoListaHtml(){
  if(!historicoContatoItens.length) return '<p class="dash-empty">Nenhum registro ainda.</p>';
  return `<div class="historico-lista">${historicoContatoItens.map(i=>{
    if(historicoContatoEditandoId === i.id){
      return `
    <div class="historico-item">
      <div class="field-row-flex" style="flex:1;">
        <input type="text" id="historico-edit-input-${i.id}" value="${esc(i.texto)}" />
        <button class="btn-primary" data-action="salvar-edicao-historico" data-id="${i.id}">Salvar</button>
        <button class="btn-outline" data-action="cancelar-edicao-historico">Cancelar</button>
      </div>
    </div>`;
    }
    return `
    <div class="historico-item">
      <div style="flex:1;">
        <span class="historico-item-texto">${esc(i.texto)}</span>
        <span class="historico-item-data">${formatDateHora(i.createdAt)}</span>
      </div>
      <button class="icon-btn" data-action="editar-historico-contato" data-id="${i.id}" title="Editar">✎</button>
      <button class="icon-btn" data-action="excluir-historico-contato" data-id="${i.id}" title="Excluir">${ICON_TRASH}</button>
    </div>`;
  }).join('')}</div>`;
}
function ligarBindingsHistoricoContato(){
  document.querySelectorAll('[data-action="excluir-historico-contato"]').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const id = btn.dataset.id;
      if(historicoContatoItens.findIndex(i=>i.id===id)===-1) return;
      if(!(await confirmarAcao({ mensagem:'Apagar este registro do histórico de contato?', botao:'Apagar', chave:'historico-contato' }))) return;
      const idx = historicoContatoItens.findIndex(i=>i.id===id);
      if(idx===-1) return;
      const [removido] = historicoContatoItens.splice(idx,1);
      const lista = document.getElementById('f-historico-lista');
      if(lista){ lista.innerHTML = renderHistoricoContatoListaHtml(); ligarBindingsHistoricoContato(); }
      try{
        await apiRequest('DELETE', `/historico-contato/${id}`);
      }catch(e){
        historicoContatoItens.splice(idx,0,removido);
        errorMsg = 'Não foi possível excluir o registro.';
        if(lista){ lista.innerHTML = renderHistoricoContatoListaHtml(); ligarBindingsHistoricoContato(); }
      }
    });
  });
  document.querySelectorAll('[data-action="editar-historico-contato"]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      historicoContatoEditandoId = btn.dataset.id;
      const lista = document.getElementById('f-historico-lista');
      if(lista){ lista.innerHTML = renderHistoricoContatoListaHtml(); ligarBindingsHistoricoContato(); }
      const input = document.getElementById(`historico-edit-input-${historicoContatoEditandoId}`);
      if(input){ input.focus(); input.select(); }
    });
  });
  document.querySelectorAll('[data-action="cancelar-edicao-historico"]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      historicoContatoEditandoId = null;
      const lista = document.getElementById('f-historico-lista');
      if(lista){ lista.innerHTML = renderHistoricoContatoListaHtml(); ligarBindingsHistoricoContato(); }
    });
  });
  document.querySelectorAll('[data-action="salvar-edicao-historico"]').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const id = btn.dataset.id;
      const input = document.getElementById(`historico-edit-input-${id}`);
      const novoTexto = input ? input.value.trim() : '';
      if(!novoTexto) return;
      const idx = historicoContatoItens.findIndex(i=>i.id===id);
      if(idx===-1) return;
      const anterior = historicoContatoItens[idx].texto;
      historicoContatoItens[idx].texto = novoTexto;
      historicoContatoEditandoId = null;
      const lista = document.getElementById('f-historico-lista');
      if(lista){ lista.innerHTML = renderHistoricoContatoListaHtml(); ligarBindingsHistoricoContato(); }
      try{
        await apiRequest('PUT', `/historico-contato/${id}`, { texto: novoTexto });
      }catch(e){
        historicoContatoItens[idx].texto = anterior;
        errorMsg = 'Não foi possível editar o registro.';
        if(lista){ lista.innerHTML = renderHistoricoContatoListaHtml(); ligarBindingsHistoricoContato(); }
      }
    });
  });
}
async function adicionarHistoricoContato(){
  const texto = historicoContatoTexto.trim();
  if(!texto || !modalForm || modalForm.__isNew) return;
  historicoContatoEnviando = true;
  const input = document.getElementById('historico-input');
  if(input) input.disabled = true;
  try{
    const novo = await apiRequest('POST', '/historico-contato', { cardId: modalForm.id, texto });
    historicoContatoItens.unshift(novo);
    historicoContatoTexto = '';
    const lista = document.getElementById('f-historico-lista');
    if(lista){ lista.innerHTML = renderHistoricoContatoListaHtml(); ligarBindingsHistoricoContato(); }
    if(input){ input.value = ''; }
  }catch(e){
    errorMsg = 'Não foi possível salvar o registro.';
    renderApp();
  }
  historicoContatoEnviando = false;
  if(input) input.disabled = false;
}
function formatarTamanhoArquivo(bytes){
  if(!bytes) return '0 KB';
  if(bytes < 1024*1024) return `${Math.round(bytes/1024)} KB`;
  return `${(bytes/(1024*1024)).toFixed(1)} MB`;
}
async function loadAnexosDoCard(cardId){
  try{
    const data = await apiRequest('GET', `/cards/${cardId}/anexos`);
    anexosDoCard = data.anexos || [];
  }catch(e){
    anexosDoCard = [];
  }
  anexosCarregados = true;
  const lista = document.getElementById('f-anexos-lista');
  if(lista){
    lista.innerHTML = renderAnexosListaHtml();
    ligarBindingsAnexos();
  }
}
function renderAnexosListaHtml(){
  const msgHtml = anexoMsg ? `<p class="settings-page-msg ${anexoMsg.tipo}">${esc(anexoMsg.texto)}</p>` : '';
  if(!anexosDoCard.length) return `${msgHtml}<p class="settings-page-note">Nenhum anexo ainda.</p>`;
  return `
    ${msgHtml}
    <div class="anexos-lista">
      ${anexosDoCard.map(a=>`
        <div class="anexo-item">
          <a href="${a.dadosBase64}" download="${esc(a.nomeArquivo)}" class="anexo-item-nome">📎 ${esc(a.nomeArquivo)}</a>
          <span class="settings-page-note">${formatarTamanhoArquivo(a.tamanho)}</span>
          <button type="button" class="icon-btn" data-action="excluir-anexo" data-anexo-id="${a.id}" title="Excluir">${ICON_TRASH}</button>
        </div>
      `).join('')}
    </div>
  `;
}
function ligarBindingsAnexos(){
  document.querySelectorAll('[data-action="excluir-anexo"]').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const anexoId = btn.dataset.anexoId;
      if(!(await confirmarAcao({ mensagem:'Excluir este anexo?', chave:'anexo' }))) return;
      btn.disabled = true;
      try{
        await apiRequest('DELETE', `/cards/${modalForm.id}/anexos/${anexoId}`);
        anexosDoCard = anexosDoCard.filter(a=>a.id!==anexoId);
        const lista = document.getElementById('f-anexos-lista');
        if(lista){ lista.innerHTML = renderAnexosListaHtml(); ligarBindingsAnexos(); }
      }catch(e){
        errorMsg = 'Não foi possível excluir o anexo.';
        renderApp();
      }
    });
  });
}
function lerArquivoComoBase64(file){
  return new Promise((resolve, reject)=>{
    const reader = new FileReader();
    reader.onload = (e)=> resolve(e.target.result);
    reader.onerror = ()=> reject(new Error('Não foi possível ler o arquivo.'));
    reader.readAsDataURL(file);
  });
}
async function handleAnexoFileSelected(file){
  if(!file || !modalForm || modalForm.__isNew) return;
  const btn = document.getElementById('anexo-upload-btn');
  const lista = document.getElementById('f-anexos-lista');
  if(file.size > 3.2 * 1024 * 1024){
    anexoMsg = { tipo:'erro', texto:'Arquivo muito grande. O limite é de aproximadamente 3 MB.' };
    if(lista){ lista.innerHTML = renderAnexosListaHtml(); ligarBindingsAnexos(); }
    return;
  }
  anexoEnviando = true;
  anexoMsg = null;
  if(btn){ btn.disabled = true; btn.textContent = 'Enviando…'; }
  if(lista){ lista.innerHTML = renderAnexosListaHtml(); ligarBindingsAnexos(); }
  try{
    const dadosBase64 = await lerArquivoComoBase64(file);
    const novo = await apiRequest('POST', `/cards/${modalForm.id}/anexos`, {
      nomeArquivo: file.name, tipoMime: file.type, dadosBase64,
    });
    anexosDoCard.unshift(novo);
    anexoMsg = { tipo:'ok', texto:'Anexo enviado.' };
  }catch(e){
    anexoMsg = { tipo:'erro', texto: e.message || 'Não foi possível enviar o anexo.' };
  }
  anexoEnviando = false;
  if(btn){ btn.disabled = false; btn.textContent = '+ Adicionar anexo'; }
  const listaAtualizada = document.getElementById('f-anexos-lista');
  if(listaAtualizada){ listaAtualizada.innerHTML = renderAnexosListaHtml(); ligarBindingsAnexos(); }
}
