// CRM · 06-navegacao.js — troca de página (goToPage). Os arquivos js/crm/ são carregados em ordem pelo index.html e
// compartilham as mesmas variáveis globais (é o antigo script.js dividido, como no CRM de consórcio).
/* ---------- navegação entre páginas ---------- */
function goToPage(page){
  // já na Equipe e clicou em Equipe de novo: volta para a lista de equipes
  if(currentPage === page && page === 'equipe' && equipeTela === 'equipe' && !atuandoComo){ equipeTela = 'lista'; equipeNovaAberta = false; sidebarOpen = false; renderApp(); window.scrollTo(0, 0); loadEquipe(); return; }
  if(currentPage === page) return;
  if(atuandoComo && !PAGINAS_ATUANDO_COMO.includes(page)){
    errorMsg = 'Essa página não está disponível enquanto você atua no funil de ' + atuandoComo.nome + '. Clique em "Sair do funil" para voltar ao seu.';
    sidebarOpen = false;
    renderApp();
    return;
  }
  // se o gestor estiver vendo o dashboard de outro membro e navegar pra qualquer
  // outra página (não só clicando em "Voltar"), restaura os próprios dados antes —
  // sem isso, ele acabaria vendo os leads/tarefas de outra pessoa numa tela como o
  // Pipeline, que permite editar de verdade
  if(visualizandoDashboardDe && page !== 'dashboard'){
    if(boardBackupGestor) board = boardBackupGestor;
    if(tasksBackupGestor) tasks = tasksBackupGestor;
    if(metaVendasValorBackupGestor !== null) metaVendasValor = metaVendasValorBackupGestor;
    boardBackupGestor = null;
    tasksBackupGestor = null;
    metaVendasValorBackupGestor = null;
    visualizandoDashboardDe = null;
  }
  if(page === 'configuracoes' && currentPage !== 'configuracoes') configMobileConteudo = false;
  // Equipe sempre começa na lista (zerado ANTES de desenhar; senão a tela pisca dentro da equipe antiga)
  if(page === 'equipe'){ equipeTela = atuandoComo && equipe ? 'equipe' : 'lista'; equipeNovaAberta = false; }
  currentPage = page;
  dateMenuOpen = false;
  openMenuColId = null;
  addingCol = false;
  editingColId = null;
  sidebarOpen = false;
  // fecha qualquer modal que tenha ficado aberto na página anterior — vários modais
  // diferentes (dia da agenda, editar lead, tarefa, contrato, proposta, etc.) usam o
  // mesmo #modal-root; sem isso, um modal esquecido aberto ficava por cima da nova
  // página, escondido mas ainda funcionando, respondendo a cliques que pareciam ser
  // da página nova.
  modalForm = null;
  extrasTela = null;
  agendaDiaSelecionado = null;
  taskModalForm = null;
  propostaModalForm = null;
  completarLeadModalForm = null;
  eventoGoogleModalForm = null;
  contratoModalForm = null;
  regrasModalAberto = false;
  regraEditForm = null;
  automacaoModalForm = null;
  fluxoModalForm = null;
  modalAlterarNomeAberto = false;
  modalAlterarSenhaAberto = false;
  modalEditarPerfilAberto = false;
  avatarLightboxAberto = false;
  document.getElementById('modal-root').innerHTML = '';
  renderApp();
  if(page === 'tarefas'){
    if(!agendaLoaded) loadAgendaMes(agendaMesAtual); // só busca do zero — depois disso, a tela se mantém atualizada sozinha com as próprias ações, e o Google só é consultado de novo no botão "Sincronizar Agenda"
  }
  if(page === 'configuracoes'){
    senhaMsg = null; senhaAtualVal = ''; senhaNovaVal = '';
    nomeMsg = null; nomeNovoVal = (currentUser && currentUser.nome) || '';
    logoutAllMsg = null;
    avatarMsg = null;
    importResultado = null;
    twoFactorSetup = null; twoFactorMsg = null; mostrarDesativar2FA = false;
    auditoriaCarregada = false;
    loadAuditoria();
    refreshCurrentUser();
    loadIcsStatus();
  }
  if(page === 'equipe'){
    equipeMsg = null;
    if(equipeTela === 'equipe') carregarAbaDaEquipe(); else loadEquipe();
  }
  if(page === 'comissoes'){
    loadContratos(); // recarrega sempre, pra pegar comissões que o Pipeline gerou automaticamente
    if(!regrasComissaoLoaded) loadRegrasComissao();
  }
}
async function refreshCurrentUser(){
  try{
    const data = await apiRequest('GET', '/auth/me');
    currentUser = data.user;
    localStorage.setItem('user', JSON.stringify(currentUser));
    renderApp();
  }catch(e){ /* mantém os dados já em cache */ }
}
