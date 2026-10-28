// CRM · 14-eventos.js — bindAppEvents (todos os cliques e campos). Os arquivos js/crm/ são carregados em ordem pelo index.html e
// compartilham as mesmas variáveis globais (é o antigo script.js dividido, como no CRM de consórcio).
/* ---------- eventos ---------- */
function bindAppEvents(){
  const app = document.getElementById('app');

  // o menu abre pelo hambúrguer (tablet) e pelo "Mais" da barra de baixo (celular)
  app.querySelectorAll('[data-action="toggle-sidebar"]').forEach(b=> b.addEventListener('click', ()=>{ sidebarOpen = !sidebarOpen; renderApp(); }));
  app.querySelectorAll('[data-action="etapa-mobile"]').forEach(b=> b.addEventListener('click', ()=> trocarEtapaMobile(b.dataset.colId)));
  app.querySelectorAll('[data-action="leads-tipo-mobile"]').forEach(b=> b.addEventListener('click', ()=>{ leadsTipoMobile = b.dataset.tipo; renderApp(); }));
  const configVoltar = app.querySelector('[data-action="config-voltar-mobile"]');
  if(configVoltar) configVoltar.addEventListener('click', ()=>{ configMobileConteudo = false; renderApp(); window.scrollTo(0, 0); });
  app.querySelectorAll('.lead-card-mobile').forEach(el=> el.addEventListener('keydown', (e)=>{ if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); el.click(); } }));
  app.querySelectorAll('.lead-card-wa').forEach(b=> b.addEventListener('click', (e)=> e.stopPropagation()));
  const closeSidebarEl = app.querySelector('[data-action="close-sidebar"]');
  if(closeSidebarEl) closeSidebarEl.addEventListener('click', ()=>{ sidebarOpen = false; renderApp(); });
  const buscaGlobalBtn = app.querySelector('[data-action="abrir-busca-global"]');
  if(buscaGlobalBtn) buscaGlobalBtn.addEventListener('click', abrirBuscaGlobal);
  const notifBtn = app.querySelector('[data-action="toggle-notif"]');
  if(notifBtn) notifBtn.addEventListener('click', (e)=>{ e.stopPropagation(); notifOpen = !notifOpen; renderApp(); });

  const errorBanner = app.querySelector('[data-action="dismiss-error"]');
  if(errorBanner) errorBanner.addEventListener('click', ()=>{ dispensarErro(); renderApp(); });

  const logoutBtn = app.querySelector('[data-action="logout"]');
  if(logoutBtn) logoutBtn.addEventListener('click', logout);

  const reordenarNavBtn = app.querySelector('[data-action="abrir-reordenar-nav"]');
  if(reordenarNavBtn) reordenarNavBtn.addEventListener('click', abrirReordenarNav);

  app.querySelectorAll('[data-action="nav-mais"]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const grupo = btn.closest('.nav-mais');
      const abrir = !grupo.classList.contains('aberto');
      animarGrupoMais(grupo, abrir);
      btn.setAttribute('aria-expanded', String(abrir));
      try{ localStorage.setItem('navMais', abrir ? '1' : '0'); }catch(e){}
    });
  });
  app.querySelectorAll('[data-action="nav"]').forEach(btn=>{
    btn.addEventListener('click', ()=> goToPage(btn.dataset.page));
  });

  const darkModeSwitch = app.querySelector('[data-action="toggle-dark-mode"]');
  if(darkModeSwitch) darkModeSwitch.addEventListener('click', ()=>{
    setDarkMode(!getDarkMode());
    renderApp();
  });
  const pushAtivarBtn = app.querySelector('[data-action="push-ativar"]');
  if(pushAtivarBtn) pushAtivarBtn.addEventListener('click', ativarPush);
  const pushDesativarBtn = app.querySelector('[data-action="push-desativar"]');
  if(pushDesativarBtn) pushDesativarBtn.addEventListener('click', desativarPush);
  const pushTestarBtn = app.querySelector('[data-action="push-testar"]');
  if(pushTestarBtn) pushTestarBtn.addEventListener('click', testarPush);
  const resumoAlternarBtn = app.querySelector('[data-action="resumo-diario-alternar"]');
  if(resumoAlternarBtn) resumoAlternarBtn.addEventListener('click', alternarResumoDiario);
  const resumoAgoraBtn = app.querySelector('[data-action="resumo-diario-agora"]');
  if(resumoAgoraBtn) resumoAgoraBtn.addEventListener('click', enviarResumoDiarioAgora);
  const emailTarefasBtn = app.querySelector('[data-action="email-tarefas-alternar"]');
  if(emailTarefasBtn) emailTarefasBtn.addEventListener('click', alternarEmailTarefas);
  const trocarEmailBtn = app.querySelector('[data-action="trocar-email"]');
  if(trocarEmailBtn) trocarEmailBtn.addEventListener('click', abrirAlterarEmailModal);
  const backupAutoAlternarBtn = app.querySelector('[data-action="backup-auto-alternar"]');
  if(backupAutoAlternarBtn) backupAutoAlternarBtn.addEventListener('click', alternarBackupAuto);
  const backupAutoAgoraBtn = app.querySelector('[data-action="backup-auto-agora"]');
  if(backupAutoAgoraBtn) backupAutoAgoraBtn.addEventListener('click', enviarBackupAutoAgora);
  const verificarAtualizacaoBtn = app.querySelector('[data-action="verificar-atualizacao"]');
  if(verificarAtualizacaoBtn) verificarAtualizacaoBtn.addEventListener('click', verificarAtualizacaoApp);
  app.querySelectorAll('[data-action="ver-dashboard-membro"]').forEach(btn=>{
    btn.addEventListener('click', ()=> abrirDashboardDeMembro(btn.dataset.userId, btn.dataset.nome));
  });
  app.querySelectorAll('[data-action="atuar-como-membro"]').forEach(btn=>{
    btn.addEventListener('click', ()=> entrarNoFunilDe(btn.dataset.userId, btn.dataset.nome));
  });
  const sairFunilBtn = app.querySelector('[data-action="sair-funil-de"]');
  if(sairFunilBtn) sairFunilBtn.addEventListener('click', sairDoFunilDe);
  app.querySelectorAll('[data-action="abrir-equipe-lista"]').forEach(btn=>{
    btn.addEventListener('click', ()=> abrirEquipeDaLista(btn.dataset.equipeId));
  });
  // Gestão da equipe: seções como em Configurações
  app.querySelectorAll('[data-action="set-gestao-secao"]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      gestaoSecao = btn.dataset.secao; gestaoMobileConteudo = true;
      if(gestaoSecao === 'desempenho' && !supervisaoLoaded) loadSupervisao();
      renderApp();
      if(ehCelular()) window.scrollTo(0, 0);
    });
  });
  const gestaoVoltar = app.querySelector('[data-action="gestao-voltar-mobile"]');
  if(gestaoVoltar) gestaoVoltar.addEventListener('click', ()=>{ gestaoMobileConteudo = false; renderApp(); window.scrollTo(0, 0); });
  const nmNome = document.getElementById('nm-nome'); if(nmNome) nmNome.addEventListener('input', (e)=> novoMembroForm.nome = e.target.value);
  const nmEmail = document.getElementById('nm-email'); if(nmEmail) nmEmail.addEventListener('input', (e)=> novoMembroForm.email = e.target.value);
  const criarContaBtn = app.querySelector('[data-action="criar-conta-membro"]');
  if(criarContaBtn) criarContaBtn.addEventListener('click', criarContaMembro);
  const copiarDaGestao = (texto, btn)=>{ try{ navigator.clipboard.writeText(texto); if(btn) mostrarPopupRapido(btn, 'Copiado'); }catch(e){} };
  const copiarLinkMembroBtn = app.querySelector('[data-action="copiar-link-membro"]');
  if(copiarLinkMembroBtn) copiarLinkMembroBtn.addEventListener('click', ()=> copiarDaGestao(novoMembroForm.link || '', copiarLinkMembroBtn));
  const copiarCodigoEquipeBtn = app.querySelector('[data-action="copiar-codigo-equipe"]');
  if(copiarCodigoEquipeBtn) copiarCodigoEquipeBtn.addEventListener('click', ()=> copiarDaGestao((equipe && equipe.codigoConvite) || '', copiarCodigoEquipeBtn));
  const novaEquipeBtn = app.querySelector('[data-action="nova-equipe-toggle"]');
  if(novaEquipeBtn) novaEquipeBtn.addEventListener('click', ()=> alternarNovaEquipe());
  const equipesVoltarBtn = app.querySelector('[data-action="equipes-voltar"]');
  if(equipesVoltarBtn) equipesVoltarBtn.addEventListener('click', ()=>{
    if(atuandoComo){ errorMsg = 'Saia do funil de ' + atuandoComo.nome + ' antes de voltar para as equipes.'; renderApp(); return; }
    equipeTela = 'lista'; equipeNovaAberta = false; renderApp(); window.scrollTo(0, 0); loadEquipe();
  });
  app.querySelectorAll('[data-action="sair-equipe-lista"]').forEach(btn=>{
    btn.addEventListener('click', ()=> showConfirm({
      message: `Sair da equipe "${btn.dataset.nome}"? Você perde o chat e a gestão dela — seu funil continua intocado e as outras equipes continuam.`,
      confirmLabel: 'Sair da equipe',
      onConfirm: ()=>{ closeConfirm(); sairDaEquipe(btn.dataset.equipeId); },
    }));
  });
  const sairDashboardBtn = app.querySelector('[data-action="sair-dashboard-membro"]');
  if(sairDashboardBtn) sairDashboardBtn.addEventListener('click', sairDashboardDeMembro);
  const abrirBackupModalBtn = app.querySelector('[data-action="abrir-backup-modal"]');
  if(abrirBackupModalBtn) abrirBackupModalBtn.addEventListener('click', abrirBackupModal);

  app.querySelectorAll('[data-action="set-accent"]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      setAccentColor(btn.dataset.color);
      renderApp();
    });
  });
  const themeCustomInput = document.getElementById('theme-custom-input');
  if(themeCustomInput) themeCustomInput.addEventListener('input', (e)=> setAccentColor(e.target.value));

  const connectCalBtn = app.querySelector('[data-action="connect-calendar"]');
  if(connectCalBtn) connectCalBtn.addEventListener('click', connectGoogleCalendar);
  const disconnectCalBtn = app.querySelector('[data-action="disconnect-calendar"]');
  if(disconnectCalBtn) disconnectCalBtn.addEventListener('click', disconnectGoogleCalendar);
  app.querySelectorAll('[data-action="sync-calendar-now"]').forEach(btn=>{
    btn.addEventListener('click', syncCalendarNow);
  });
  const gerarIcsBtn = app.querySelector('[data-action="gerar-link-ics"]');
  if(gerarIcsBtn) gerarIcsBtn.addEventListener('click', gerarLinkIcs);
  const revogarIcsBtn = app.querySelector('[data-action="revogar-link-ics"]');
  if(revogarIcsBtn) revogarIcsBtn.addEventListener('click', revogarLinkIcs);
  const copiarIcsBtn = app.querySelector('[data-action="copiar-link-ics"]');
  if(copiarIcsBtn) copiarIcsBtn.addEventListener('click', ()=>{
    const input = document.getElementById('ics-url');
    if(!input) return;
    input.select();
    navigator.clipboard && navigator.clipboard.writeText(input.value).catch(()=>{
      document.execCommand('copy');
    });
  });

  /* -- Dashboard -- */
  app.querySelectorAll('[data-action="set-dash-period"]').forEach(btn=>{
    btn.addEventListener('click', ()=>{ dashboardPeriod = btn.dataset.period; renderApp(); });
  });
  const gerarInsightsBtn = app.querySelector('[data-action="gerar-insights"]');
  if(gerarInsightsBtn) gerarInsightsBtn.addEventListener('click', gerarInsightsIA);
  const toggleInsightsPipelineBtn = app.querySelector('[data-action="toggle-insights-pipeline"]');
  if(toggleInsightsPipelineBtn) toggleInsightsPipelineBtn.addEventListener('click', ()=>{ insightsPipelineExpandido = !insightsPipelineExpandido; renderApp(); });
  const editarMetaBtn = app.querySelector('[data-action="editar-meta-vendas"]');
  if(editarMetaBtn) editarMetaBtn.addEventListener('click', ()=>{ editandoMetaVendas = true; renderApp(); });
  const salvarMetaBtn = document.getElementById('meta-vendas-salvar');
  if(salvarMetaBtn) salvarMetaBtn.addEventListener('click', salvarMetaVendas);
  const editarMetaEquipeBtn = app.querySelector('[data-action="editar-meta-vendas-equipe"]');
  if(editarMetaEquipeBtn) editarMetaEquipeBtn.addEventListener('click', ()=>{ editandoMetaVendasEquipe = true; renderApp(); });
  const salvarMetaEquipeBtn = document.getElementById('meta-vendas-equipe-salvar');
  if(salvarMetaEquipeBtn) salvarMetaEquipeBtn.addEventListener('click', salvarMetaVendasEquipe);
  app.querySelectorAll('[data-action="toggle-painel-dashboard"]').forEach(btn=>{
    btn.addEventListener('click', ()=> alternarPainelDashboard(btn.dataset.painelId, btn));
  });

  /* -- tarefas (usado no Dashboard e na página Tarefas) -- */
  app.querySelectorAll('[data-action="toggle-task"]').forEach(el=>{
    el.addEventListener('click', ()=> toggleTaskConcluida(el.dataset.taskId));
  });
  app.querySelectorAll('[data-action="toggle-evento"]').forEach(el=>{
    el.addEventListener('click', ()=> toggleEventoConcluido(el.dataset.eventoId));
  });
  const openNewTaskBtn = app.querySelector('[data-action="open-new-task"]');
  if(openNewTaskBtn) openNewTaskBtn.addEventListener('click', ()=> openNewTask());
  app.querySelectorAll('[data-action="open-edit-task"]').forEach(btn=>{
    btn.addEventListener('click', ()=> openEditTask(btn.dataset.taskId));
  });
  app.querySelectorAll('[data-action="delete-task"]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const id = btn.dataset.taskId;
      showConfirm({ chave:'tarefa',
        message: 'Excluir esta tarefa? Essa ação não pode ser desfeita.',
        onConfirm: ()=>{ deleteTaskById(id); closeConfirm(); closeTaskModal(); },
      });
    });
  });
  const toggleConcluidasEl = app.querySelector('[data-action="toggle-show-concluidas"]');
  if(toggleConcluidasEl) toggleConcluidasEl.addEventListener('click', ()=>{ tarefasShowConcluidas = !tarefasShowConcluidas; renderApp(); });

  /* -- Agenda (calendário) -- */
  app.querySelectorAll('[data-action="agenda-mes"]').forEach(btn=>{
    btn.addEventListener('click', ()=> mudarMesAgenda(parseInt(btn.dataset.delta,10)));
  });
  app.querySelectorAll('[data-action="set-agenda-subtab"]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      agendaSubTab = btn.dataset.subtab;
      if(agendaSubTab==='gerot' && !gerotLoaded) loadGerot(gerotSemanaAtual);
      renderApp();
    });
  });
  app.querySelectorAll('[data-action="gerot-semana"]').forEach(btn=>{
    btn.addEventListener('click', ()=> mudarSemanaGerot(parseInt(btn.dataset.delta,10)));
  });
  const gerotHojeBtn = app.querySelector('[data-action="gerot-hoje"]');
  if(gerotHojeBtn) gerotHojeBtn.addEventListener('click', ()=>{
    gerotSemanaAtual = inicioDaSemana(new Date());
    loadGerot(gerotSemanaAtual);
  });
  const gerotCopiarBtn = app.querySelector('[data-action="gerot-copiar-semana"]');
  if(gerotCopiarBtn) gerotCopiarBtn.addEventListener('click', copiarSemanaAnteriorGerot);
  const gerotExportarBtn = app.querySelector('[data-action="gerot-exportar-planilha"]');
  if(gerotExportarBtn) gerotExportarBtn.addEventListener('click', exportarGerotParaPlanilha);
  const gerotImportarBtn = app.querySelector('[data-action="gerot-importar-planilha"]');
  const gerotImportarInput = document.getElementById('gerot-importar-input');
  if(gerotImportarBtn && gerotImportarInput) gerotImportarBtn.addEventListener('click', ()=> gerotImportarInput.click());
  if(gerotImportarInput) gerotImportarInput.addEventListener('change', (e)=>{
    const file = e.target.files && e.target.files[0];
    if(file) importarGerotDePlanilha(file);
    e.target.value = ''; // permite selecionar o mesmo arquivo de novo depois, se precisar
  });
  app.querySelectorAll('[data-action="gerot-abrir-editor"]').forEach(btn=>{
    btn.addEventListener('click', ()=> abrirGerotEditor(Number(btn.dataset.dia), btn.dataset.horario, btn.dataset.blocoId || null));
  });
  const gerotEditorInicio = document.getElementById('gerot-editor-inicio');
  if(gerotEditorInicio) gerotEditorInicio.addEventListener('change', (e)=>{
    gerotEditor.horarioInicio = e.target.value;
    if(gerotEditor.horarioFim <= gerotEditor.horarioInicio){
      const idx = GEROT_HORARIOS.indexOf(gerotEditor.horarioInicio);
      gerotEditor.horarioFim = GEROT_LIMITES[idx+1] || GEROT_LIMITES[GEROT_LIMITES.length-1];
    }
    renderApp();
  });
  const gerotEditorFim = document.getElementById('gerot-editor-fim');
  if(gerotEditorFim) gerotEditorFim.addEventListener('change', (e)=> gerotEditor.horarioFim = e.target.value);
  const gerotEditorTexto = document.getElementById('gerot-editor-texto');
  if(gerotEditorTexto){
    gerotEditorTexto.addEventListener('input', (e)=> gerotEditor.texto = e.target.value);
    gerotEditorTexto.addEventListener('keydown', (e)=>{ if(e.key==='Enter') salvarGerotEditor(); });
  }
  const gerotEditorSalvar = document.getElementById('gerot-editor-salvar');
  if(gerotEditorSalvar) gerotEditorSalvar.addEventListener('click', salvarGerotEditor);
  const gerotEditorCancelar = document.getElementById('gerot-editor-cancelar');
  if(gerotEditorCancelar) gerotEditorCancelar.addEventListener('click', fecharGerotEditor);
  const gerotEditorApagar = document.getElementById('gerot-editor-apagar');
  if(gerotEditorApagar) gerotEditorApagar.addEventListener('click', apagarGerotEditorAtual);
  const cancelarCopiaPrincipalBtn = app.querySelector('[data-action="cancelar-tarefa-copiada"]');
  if(cancelarCopiaPrincipalBtn) cancelarCopiaPrincipalBtn.addEventListener('click', cancelarTarefaCopiada);
  const agendaHojeBtn = app.querySelector('[data-action="agenda-hoje"]');
  if(agendaHojeBtn) agendaHojeBtn.addEventListener('click', ()=>{
    agendaMesAtual = currentMonthKey();
    loadAgendaMes(agendaMesAtual);
  });
  app.querySelectorAll('[data-action="abrir-dia-agenda"]').forEach(cel=>{
    cel.addEventListener('click', ()=>{
      if(longPressDisparou){ longPressDisparou = false; return; } // ignora o clique fantasma que o toque dispara depois de segurar
      const diaISO = cel.dataset.dia;
      if(diaAgendaCopiado && diaISO !== diaAgendaCopiado.origemISO){
        colarDiaInteiroEm(diaISO, cel);
        if(navigator.vibrate) navigator.vibrate(15);
        return;
      }
      agendaDiaSelecionado = diaISO; renderAgendaDiaModal();
    });
    cel.addEventListener('contextmenu', (e)=>{
      e.preventDefault();
      abrirMenuDia(cel.dataset.dia, e.clientX, e.clientY);
    });
    cel.addEventListener('touchstart', (e)=>{
      const touch = e.touches[0];
      const x = touch.clientX, y = touch.clientY;
      clearTimeout(longPressTimer);
      longPressTimer = setTimeout(()=>{
        longPressDisparou = true;
        cel.classList.remove('agenda-cell-pressionando');
        if(navigator.vibrate) navigator.vibrate(15);
        abrirMenuDia(cel.dataset.dia, x, y);
      }, 550);
      cel.classList.add('agenda-cell-pressionando');
    }, { passive:true });
    cel.addEventListener('touchend', ()=>{ clearTimeout(longPressTimer); cel.classList.remove('agenda-cell-pressionando'); });
    cel.addEventListener('touchmove', ()=>{ clearTimeout(longPressTimer); cel.classList.remove('agenda-cell-pressionando'); }); // dedo se moveu = rolando a tela, não é aperta-e-segura
    cel.addEventListener('touchcancel', ()=>{ clearTimeout(longPressTimer); cel.classList.remove('agenda-cell-pressionando'); });
  });

  /* -- Automações -- */
  const openNewAutomacaoBtn = app.querySelector('[data-action="open-new-automacao"]');
  if(openNewAutomacaoBtn) openNewAutomacaoBtn.addEventListener('click', ()=> openNewAutomacao());
  app.querySelectorAll('[data-action="open-edit-automacao"]').forEach(btn=>{
    btn.addEventListener('click', ()=> openEditAutomacao(btn.dataset.automacaoId));
  });
  app.querySelectorAll('[data-action="toggle-automacao"]').forEach(el=>{
    el.addEventListener('click', ()=> toggleAutomacaoAtiva(el.dataset.automacaoId));
  });
  app.querySelectorAll('[data-action="delete-automacao"]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const id = btn.dataset.automacaoId;
      showConfirm({ chave:'acao-automatica',
        message: 'Excluir esta ação automática? Ela para de rodar imediatamente.',
        onConfirm: ()=>{ excluirAutomacao(id); closeConfirm(); },
      });
    });
  });

  /* -- Fluxos -- */
  const openNewFluxoBtn = app.querySelector('[data-action="open-new-fluxo"]');
  if(openNewFluxoBtn) openNewFluxoBtn.addEventListener('click', openNewFluxo);
  app.querySelectorAll('[data-action="open-edit-fluxo"]').forEach(btn=>{
    btn.addEventListener('click', ()=> openEditFluxo(btn.dataset.fluxoId));
  });
  app.querySelectorAll('[data-action="toggle-fluxo"]').forEach(el=>{
    el.addEventListener('click', ()=>{
      const id = el.dataset.fluxoId;
      const f = fluxos.find(x=>x.id===id);
      if(f) toggleFluxoAtivo(id);
    });
  });
  app.querySelectorAll('[data-action="delete-fluxo"]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const id = btn.dataset.fluxoId;
      showConfirm({ chave:'sequencia',
        message: 'Excluir esta sequência? As que estão em andamento para clientes atuais são interrompidas.',
        onConfirm: ()=>{ excluirFluxo(id); closeConfirm(); },
      });
    });
  });

  /* -- Importar/Exportar -- */
  const importArquivoInput = document.getElementById('import-arquivo');
  if(importArquivoInput) importArquivoInput.addEventListener('change', ()=>{ const n = document.getElementById('import-arquivo-nome'); if(n) n.textContent = importArquivoInput.files[0] ? importArquivoInput.files[0].name : 'Nenhum arquivo escolhido'; });
  const modeloLeadsBtn = app.querySelector('[data-action="modelo-planilha-leads"]');
  if(modeloLeadsBtn) modeloLeadsBtn.addEventListener('click', baixarModeloLeads);
  const tirarPlanilhaBtn = app.querySelector('[data-action="tirar-planilha"]');
  if(tirarPlanilhaBtn) tirarPlanilhaBtn.addEventListener('click', tirarPlanilha);
  if(importAnimarEntrada) animarEntradaPlanilha();
  const planilhaInput = document.getElementById('planilha-input');
  if(planilhaInput) planilhaInput.addEventListener('change', (e)=>{
    const file = e.target.files && e.target.files[0];
    if(file) handlePlanilhaFileSelected(file);
  });
  const mapNomeEl = document.getElementById('map-nome');
  if(mapNomeEl) mapNomeEl.addEventListener('change', (e)=> importMapNome = e.target.value);
  const mapTelefoneEl = document.getElementById('map-telefone');
  if(mapTelefoneEl) mapTelefoneEl.addEventListener('change', (e)=> importMapTelefone = e.target.value);
  const mapServicoEl = document.getElementById('map-servico');
  if(mapServicoEl) mapServicoEl.addEventListener('change', (e)=> importMapServico = e.target.value);
  const confirmarImportBtn = document.getElementById('confirmar-import-planilha');
  if(confirmarImportBtn) confirmarImportBtn.addEventListener('click', confirmarImportPlanilha);
  app.querySelectorAll('[data-action="completar-possivel-lead"]').forEach(btn=>{
    btn.addEventListener('click', ()=> abrirCompletarLead(btn.dataset.leadId));
  });
  app.querySelectorAll('[data-action="descartar-possivel-lead"]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const id = btn.dataset.leadId;
      showConfirm({ chave:'possivel-contato',
        message: 'Descartar esse possível contato? Ele não vira cliente.',
        confirmLabel: 'Descartar',
        onConfirm: ()=>{ descartarPossivelLead(id); closeConfirm(); },
      });
    });
  });

  /* -- Relatórios -- */
  const relatorioFunilSelect = document.getElementById('relatorio-funil-select');
  if(relatorioFunilSelect) relatorioFunilSelect.addEventListener('change', (e)=>{ relatorioFunilId = e.target.value; renderApp(); });
  app.querySelectorAll('[data-action="exportar-csv"]').forEach(b=> b.addEventListener('click', ()=> exportarCsv(b.dataset.formato)));
  const exportarPdfBtn = app.querySelector('[data-action="exportar-relatorio-pdf"]');
  if(exportarPdfBtn) exportarPdfBtn.addEventListener('click', exportarRelatorioPdf);

  /* -- Equipe / Chat Interno / Supervisão -- */
  const equipeNomeInput = document.getElementById('equipe-nome-novo');
  if(equipeNomeInput) equipeNomeInput.addEventListener('input', (e)=> equipeNomeNovo = e.target.value);
  const criarEquipeBtn = app.querySelector('[data-action="criar-equipe"]');
  if(criarEquipeBtn) criarEquipeBtn.addEventListener('click', criarEquipe);
  const equipeCodigoInput = document.getElementById('equipe-codigo-entrar');
  if(equipeCodigoInput) equipeCodigoInput.addEventListener('input', (e)=> equipeCodigoEntrar = e.target.value);
  const entrarEquipeBtn = app.querySelector('[data-action="entrar-equipe"]');
  if(entrarEquipeBtn) entrarEquipeBtn.addEventListener('click', entrarNaEquipe);
  const sairEquipeBtn = app.querySelector('[data-action="sair-equipe"]');
  if(sairEquipeBtn) sairEquipeBtn.addEventListener('click', ()=>{
    showConfirm({
      message: 'Sair dessa equipe? Você perde acesso ao chat interno e à supervisão dela — seu funil continua intocado.',
      confirmLabel: 'Sair da equipe',
      onConfirm: ()=>{ sairDaEquipe(); closeConfirm(); },
    });
  });
  const regenerarCodigoBtn = app.querySelector('[data-action="regenerar-codigo-equipe"]');
  if(regenerarCodigoBtn) regenerarCodigoBtn.addEventListener('click', regenerarCodigoEquipe);
  app.querySelectorAll('[data-action="abrir-opcoes-membro"]').forEach(btn=>{
    btn.addEventListener('click', ()=> abrirOpcoesMembroModal(btn.dataset.userId));
  });
  const chatInternoInput = document.getElementById('chat-interno-input');
  if(chatInternoInput){
    chatInternoInput.addEventListener('input', (e)=> chatTexto = e.target.value);
    chatInternoInput.addEventListener('keydown', (e)=>{ if(e.key==='Enter') enviarMensagemChat(); });
  }
  const enviarChatBtn = app.querySelector('[data-action="enviar-chat-interno"]');
  if(enviarChatBtn) enviarChatBtn.addEventListener('click', enviarMensagemChat);
  const chatMsgsEl = document.getElementById('chat-interno-mensagens');
  if(chatMsgsEl) chatMsgsEl.scrollTop = chatMsgsEl.scrollHeight;

  app.querySelectorAll('[data-action="set-equipe-subtab"]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      equipeSubTab = btn.dataset.subtab;
      if(equipeSubTab==='chat' && !chatLoaded) loadChat();
      if(equipeSubTab==='supervisao' && equipe && equipe.souSupervisor && !supervisaoLoaded) loadSupervisao();
      renderApp();
    });
  });
  app.querySelectorAll('[data-action="abrir-conversa-individual"]').forEach(btn=>{
    btn.addEventListener('click', ()=> abrirConversaIndividual(btn.dataset.userId));
  });
  const fecharDmBtn = app.querySelector('[data-action="fechar-conversa-individual"]');
  if(fecharDmBtn) fecharDmBtn.addEventListener('click', ()=>{ dmDestinatarioId = null; renderApp(); });
  const chatIndividualInput = document.getElementById('chat-individual-input');
  if(chatIndividualInput){
    chatIndividualInput.addEventListener('input', (e)=> dmTexto = e.target.value);
    chatIndividualInput.addEventListener('keydown', (e)=>{ if(e.key==='Enter') enviarMensagemIndividual(); });
  }
  const enviarDmBtn = app.querySelector('[data-action="enviar-chat-individual"]');
  if(enviarDmBtn) enviarDmBtn.addEventListener('click', enviarMensagemIndividual);
  const dmMsgsEl = document.getElementById('chat-individual-mensagens');
  if(dmMsgsEl) dmMsgsEl.scrollTop = dmMsgsEl.scrollHeight;

  /* -- Comissões -- */
  app.querySelectorAll('[data-action="comissoes-mes"]').forEach(btn=>{
    btn.addEventListener('click', ()=>{ comissoesMonth = addMonthsKey(comissoesMonth, parseInt(btn.dataset.delta,10)); renderApp(); });
  });
  const openNewContratoBtn = app.querySelector('[data-action="open-new-contrato"]');
  if(openNewContratoBtn) openNewContratoBtn.addEventListener('click', openNewContrato);
  const openRegrasBtn = app.querySelector('[data-action="open-regras-comissao"]');
  if(openRegrasBtn) openRegrasBtn.addEventListener('click', openRegrasComissaoModal);
  app.querySelectorAll('[data-action="open-edit-contrato"]').forEach(btn=>{
    btn.addEventListener('click', ()=> openEditContrato(btn.dataset.contratoId));
  });
  app.querySelectorAll('[data-action="delete-contrato"]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const id = btn.dataset.contratoId;
      showConfirm({
        message: 'Excluir este contrato de comissão? Essa ação não pode ser desfeita.',
        onConfirm: ()=>{ deleteContratoById(id); closeConfirm(); },
      });
    });
  });
  app.querySelectorAll('[data-action="cancelar-contrato"]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const id = btn.dataset.contratoId;
      showConfirm({
        message: `Marcar esse contrato como cancelado a partir de ${monthLabel(comissoesMonth, true)}? As parcelas desse mês em diante param de contar — os meses anteriores continuam valendo.`,
        confirmLabel: 'Cancelar comissão',
        onConfirm: ()=>{ cancelarContrato(id); closeConfirm(); },
      });
    });
  });
  app.querySelectorAll('[data-action="reativar-contrato"]').forEach(btn=>{
    btn.addEventListener('click', ()=> reativarContrato(btn.dataset.contratoId));
  });

  /* -- Configurações -- */
  app.querySelectorAll('[data-action="set-config-categoria"]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      configCategoriaAtiva = btn.dataset.categoria;
      configMobileConteudo = true;
      renderApp();
      if(configCategoriaAtiva === 'monitoramento' && !monitoramentoLoaded) loadMonitoramento();
      if(ehCelular()) window.scrollTo(0, 0);
    });
  });
  const avatarInput = document.getElementById('avatar-input');
  if(avatarInput) avatarInput.addEventListener('change', (e)=>{
    const file = e.target.files && e.target.files[0];
    if(file) handleAvatarFileSelected(file);
  });
  const avatarRemoverBtn = document.getElementById('avatar-remover-btn');
  if(avatarRemoverBtn) avatarRemoverBtn.addEventListener('click', removerAvatar);
  const abrirEditarPerfilBtn = app.querySelector('[data-action="abrir-editar-perfil"]');
  if(abrirEditarPerfilBtn) abrirEditarPerfilBtn.addEventListener('click', abrirEditarPerfilModal);
  // A bolinha da foto: clique rápido abre o seletor de arquivo (trocar/adicionar foto);
  // clique e segure (ou toque e segure, no celular) abre a foto atual em tamanho maior.
  const avatarPreview = document.getElementById('avatar-preview');
  if(avatarPreview){
    const iniciarPress = ()=>{
      clearTimeout(avatarPressTimer);
      avatarPressTimer = setTimeout(()=>{
        avatarPressDisparou = true;
        abrirAvatarLightbox();
      }, 550);
    };
    const cancelarPress = ()=> clearTimeout(avatarPressTimer);
    avatarPreview.addEventListener('mousedown', iniciarPress);
    avatarPreview.addEventListener('mouseup', cancelarPress);
    avatarPreview.addEventListener('mouseleave', cancelarPress);
    avatarPreview.addEventListener('touchstart', iniciarPress, { passive:true });
    avatarPreview.addEventListener('touchend', cancelarPress);
    avatarPreview.addEventListener('touchmove', cancelarPress);
    avatarPreview.addEventListener('touchcancel', cancelarPress);
    avatarPreview.addEventListener('contextmenu', (e)=> e.preventDefault());
    avatarPreview.addEventListener('click', ()=>{
      if(avatarPressDisparou){ avatarPressDisparou = false; return; } // ignora o clique fantasma depois de segurar
      if(avatarInput) avatarInput.click();
    });
  }
  const logoutAllBtn = app.querySelector('[data-action="desconectar-todos"]');
  if(logoutAllBtn) logoutAllBtn.addEventListener('click', ()=>{
    showConfirm({
      message: 'Desconectar todos os dispositivos, incluindo este? Você vai precisar fazer login de novo.',
      confirmLabel: 'Desconectar',
      onConfirm: ()=>{ desconectarTodosDispositivos(); closeConfirm(); },
    });
  });
  const abrirSenhaBtn = app.querySelector('[data-action="abrir-alterar-senha"]');
  if(abrirSenhaBtn) abrirSenhaBtn.addEventListener('click', abrirAlterarSenhaModal);
  const toggleAuditoriaBtn = app.querySelector('[data-action="toggle-auditoria"]');
  if(toggleAuditoriaBtn) toggleAuditoriaBtn.addEventListener('click', ()=>{ auditoriaExpandida = !auditoriaExpandida; renderApp(); });
  const atualizarMonitoramentoBtn = app.querySelector('[data-action="atualizar-monitoramento"]');
  if(atualizarMonitoramentoBtn) atualizarMonitoramentoBtn.addEventListener('click', loadMonitoramento);
  const limparMonitoramentoBtn = app.querySelector('[data-action="limpar-monitoramento"]');
  if(limparMonitoramentoBtn) limparMonitoramentoBtn.addEventListener('click', limparMonitoramento);
  const importColunaSelect = document.getElementById('import-coluna');
  if(importColunaSelect) importColunaSelect.addEventListener('change', (e)=> importColumnId = e.target.value);
  const importBtn = document.getElementById('import-btn');
  if(importBtn) importBtn.addEventListener('click', importarLeadsCsv);

  const novoCampoNomeEl = document.getElementById('novo-campo-nome');
  if(novoCampoNomeEl) novoCampoNomeEl.addEventListener('input', (e)=> novoCampoNome = e.target.value);
  const novoCampoTipoEl = document.getElementById('novo-campo-tipo');
  if(novoCampoTipoEl) novoCampoTipoEl.addEventListener('change', (e)=> novoCampoTipo = e.target.value);
  const criarCampoBtn = app.querySelector('[data-action="criar-campo-personalizado"]');
  if(criarCampoBtn) criarCampoBtn.addEventListener('click', criarCampoPersonalizado);

  const criarWebhookBtn = app.querySelector('[data-action="criar-webhook-saida"]');
  if(criarWebhookBtn) criarWebhookBtn.addEventListener('click', criarWebhookSaida);
  app.querySelectorAll('[data-action="testar-webhook-saida"]').forEach(btn=>{
    btn.addEventListener('click', ()=> testarWebhookSaida(btn.dataset.webhookId));
  });
  app.querySelectorAll('[data-action="toggle-webhook-saida"]').forEach(btn=>{
    btn.addEventListener('click', ()=> toggleWebhookSaida(btn.dataset.webhookId, btn.dataset.ativo==='1'));
  });
  app.querySelectorAll('[data-action="excluir-webhook-saida"]').forEach(btn=>{
    btn.addEventListener('click', ()=> excluirWebhookSaida(btn.dataset.webhookId));
  });
  const toggleAgendamentoPublicoBtn = app.querySelector('[data-action="toggle-agendamento-publico-ativo"]');
  if(toggleAgendamentoPublicoBtn) toggleAgendamentoPublicoBtn.addEventListener('click', toggleAgendamentoPublicoAtivo);
  const salvarAgendamentoPublicoBtn = app.querySelector('[data-action="salvar-agendamento-publico"]');
  if(salvarAgendamentoPublicoBtn) salvarAgendamentoPublicoBtn.addEventListener('click', salvarAgendamentoPublico);
  const copiarLinkBtn = app.querySelector('[data-action="copiar-link-agendamento"]');
  if(copiarLinkBtn) copiarLinkBtn.addEventListener('click', copiarLinkAgendamento);
  app.querySelectorAll('[data-action="excluir-campo-personalizado"]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const id = btn.dataset.campoId;
      showConfirm({
        message: 'Excluir esse campo personalizado? Ele para de aparecer nos clientes.',
        onConfirm: ()=>{ excluirCampoPersonalizado(id); closeConfirm(); },
      });
    });
  });

  const twofaIniciarBtn = document.getElementById('twofa-iniciar');
  if(twofaIniciarBtn) twofaIniciarBtn.addEventListener('click', iniciar2FA);
  const twofaCancelarSetupBtn = document.getElementById('twofa-cancelar-setup');
  if(twofaCancelarSetupBtn) twofaCancelarSetupBtn.addEventListener('click', cancelarSetup2FA);
  const twofaConfirmarBtn = document.getElementById('twofa-confirmar');
  if(twofaConfirmarBtn) twofaConfirmarBtn.addEventListener('click', confirmar2FA);
  const twofaMostrarDesativarBtn = document.getElementById('twofa-mostrar-desativar');
  if(twofaMostrarDesativarBtn) twofaMostrarDesativarBtn.addEventListener('click', ()=>{ mostrarDesativar2FA = true; renderApp(); });
  const twofaCancelarDesativarBtn = document.getElementById('twofa-cancelar-desativar');
  if(twofaCancelarDesativarBtn) twofaCancelarDesativarBtn.addEventListener('click', ()=>{ mostrarDesativar2FA = false; twoFactorMsg = null; renderApp(); });
  const twofaConfirmarDesativarBtn = document.getElementById('twofa-confirmar-desativar');
  if(twofaConfirmarDesativarBtn) twofaConfirmarDesativarBtn.addEventListener('click', desativar2FA);
  if(twoFactorSetup) renderizarQrCode2FA();

  /* -- Leads -- */
  app.querySelectorAll('[data-action="open-new-lead"]').forEach(b=> b.addEventListener('click', ()=> openNewCard()));
  const dupBtn = app.querySelector('[data-action="abrir-duplicados"]');
  if(dupBtn) dupBtn.addEventListener('click', abrirDuplicadosModal);
  app.querySelectorAll('[data-action="exportar-leads"]').forEach(b=> b.addEventListener('click', ()=> exportarLeads(b.dataset.formato)));
  const toggleArquivadosBtn = app.querySelector('[data-action="toggle-mostrar-arquivados"]');
  if(toggleArquivadosBtn) toggleArquivadosBtn.addEventListener('click', ()=>{ mostrarArquivados = !mostrarArquivados; renderApp(); });

  /* -- Leads: seleção e ações em massa -- */
  const selectAllEl = app.querySelector('[data-action="leads-select-all"]');
  if(selectAllEl){
    selectAllEl.addEventListener('click', ()=>{
      const idsVisiveis = filteredLeads().map(c=>c.id);
      toggleSelecionarTodosLeads(idsVisiveis);
    });
  }
  app.querySelectorAll('[data-action="leads-select-um"]').forEach(el=>{
    el.addEventListener('click', ()=> toggleSelecaoLead(el.dataset.cardId));
  });
  const bulkColunaSelect = document.getElementById('leads-bulk-coluna');
  if(bulkColunaSelect) bulkColunaSelect.addEventListener('change', (e)=> bulkMoverLeads(e.target.value));
  const bulkArquivarBtn = app.querySelector('[data-action="leads-bulk-arquivar"]');
  if(bulkArquivarBtn) bulkArquivarBtn.addEventListener('click', bulkArquivarLeads);
  const bulkExcluirBtn = app.querySelector('[data-action="leads-bulk-excluir"]');
  if(bulkExcluirBtn) bulkExcluirBtn.addEventListener('click', ()=>{
    const qtd = leadsSelecionados.size;
    showConfirm({
      message: `Excluir ${qtd} cliente${qtd===1?'':'s'} selecionado${qtd===1?'':'s'}? Essa ação não pode ser desfeita.`,
      onConfirm: ()=>{ bulkExcluirLeads(); closeConfirm(); },
    });
  });
  const bulkLimparBtn = app.querySelector('[data-action="leads-bulk-limpar"]');
  if(bulkLimparBtn) bulkLimparBtn.addEventListener('click', ()=>{ leadsSelecionados.clear(); renderApp(); });
  const bulkEtiquetaBtn = app.querySelector('[data-action="leads-bulk-etiqueta"]');
  if(bulkEtiquetaBtn) bulkEtiquetaBtn.addEventListener('click', ()=>{ leadsBulkEtiquetaAberta = true; renderApp(); });
  const bulkEtiquetaInput = document.getElementById('leads-bulk-etiqueta-input');
  if(bulkEtiquetaInput){
    bulkEtiquetaInput.addEventListener('input', (e)=> leadsBulkEtiquetaValor = e.target.value);
    bulkEtiquetaInput.addEventListener('keydown', (e)=>{ if(e.key==='Enter') confirmarBulkEtiqueta(); });
  }
  const bulkEtiquetaConfirmarBtn = app.querySelector('[data-action="leads-bulk-etiqueta-confirmar"]');
  if(bulkEtiquetaConfirmarBtn) bulkEtiquetaConfirmarBtn.addEventListener('click', confirmarBulkEtiqueta);

  const leadsSearchInput = document.getElementById('leads-search-input');
  if(leadsSearchInput) leadsSearchInput.addEventListener('input', (e)=>{
    const cursorPos = e.target.selectionStart;
    leadsSearch = e.target.value;
    renderApp();
    const novoInput = document.getElementById('leads-search-input');
    if(novoInput){ novoInput.focus(); novoInput.setSelectionRange(cursorPos, cursorPos); }
  });
  const leadsFilterSelect = document.getElementById('leads-status-filter');
  if(leadsFilterSelect) leadsFilterSelect.addEventListener('change', (e)=>{ leadsStatusFilter = e.target.value; renderApp(); });

  /* -- botão de funil de ordenação, compartilhado entre Leads, Pipeline e Comissões -- */
  app.querySelectorAll('[data-action="toggle-ordenar-menu"]').forEach(btn=>{
    btn.addEventListener('click', (e)=>{
      e.stopPropagation();
      ordenarMenuAberto = ordenarMenuAberto === btn.dataset.menuId ? null : btn.dataset.menuId;
      renderApp();
    });
  });
  app.querySelectorAll('[data-action="escolher-ordenar"]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const menuId = btn.dataset.menuId;
      const valor = btn.dataset.valor;
      ordenarMenuAberto = null;
      if(menuId === 'leads'){ leadsOrdenarPor = valor; renderApp(); }
      else if(menuId === 'comissoes'){ comissoesOrdenarPor = valor; renderApp(); }
      else if(menuId === 'pipeline'){ aplicarOrdenacaoPipeline(valor); }
    });
  });

  /* -- Pipeline: funis -- */
  app.querySelectorAll('[data-action="set-funil"]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      funilAtualId = btn.dataset.funilId;
      aiInsights = []; // insights são específicos do funil — limpa pra não mostrar dado desatualizado de outro
      renderApp();
    });
  });
  const novoFunilBtn = app.querySelector('[data-action="open-new-funil"]');
  if(novoFunilBtn) novoFunilBtn.addEventListener('click', criarNovoFunil);
  const editFunilBtn = app.querySelector('[data-action="edit-funil-name"]');
  if(editFunilBtn) editFunilBtn.addEventListener('click', ()=>{
    editingFunilId = editFunilBtn.dataset.funilId;
    const f = funis.find(x=>x.id===editingFunilId);
    editingFunilName = f ? f.nome : '';
    renderApp();
    const input = document.getElementById('funil-rename-'+editingFunilId);
    if(input){ input.focus(); input.select(); }
  });
  document.querySelectorAll('[id^="funil-rename-"]').forEach(input=>{
    input.addEventListener('input', (e)=>{ editingFunilName = e.target.value; });
    const commitFunil = ()=>{ const id = editingFunilId; editingFunilId = null; renomearFunil(id, editingFunilName); };
    input.addEventListener('blur', commitFunil);
    input.addEventListener('keydown', (e)=>{ if(e.key==='Enter') e.target.blur(); });
  });
  const deleteFunilBtn = app.querySelector('[data-action="delete-funil"]');
  if(deleteFunilBtn) deleteFunilBtn.addEventListener('click', ()=>{
    const id = deleteFunilBtn.dataset.funilId;
    const f = funis.find(x=>x.id===id);
    showConfirm({
      message: `Excluir o funil "${f.nome}"? Todas as colunas e clientes dele também serão excluídos.`,
      onConfirm: ()=>{ excluirFunil(id); closeConfirm(); },
    });
  });
  const duplicarFunilBtn = app.querySelector('[data-action="duplicar-funil"]');
  if(duplicarFunilBtn) duplicarFunilBtn.addEventListener('click', ()=> duplicarFunil(duplicarFunilBtn.dataset.funilId));
  ativarArrasteHorizontal();
  ajustarAlturaColunasPipeline();
  ativarRedimensionarStats();
  ajustarLargurasStatsPadrao();

  /* -- Pipeline: filtro de data -- */
  const dateMenuBtn = app.querySelector('[data-action="toggle-date-menu"]');
  if(dateMenuBtn) dateMenuBtn.addEventListener('click', (e)=>{
    e.stopPropagation();
    dateMenuOpen = !dateMenuOpen;
    renderApp();
  });
  app.querySelectorAll('[data-action="set-month"]').forEach(btn=>{
    btn.addEventListener('click', ()=>{ filterMonth = btn.dataset.month || null; dateMenuOpen = false; renderApp(); });
  });
  const gotoInput = document.getElementById('goto-month-input');
  if(gotoInput) gotoInput.addEventListener('change', (e)=>{ if(e.target.value){ filterMonth = e.target.value; dateMenuOpen = false; renderApp(); } });
  const esfriandoBtn = app.querySelector('[data-action="toggle-esfriando"]');
  if(esfriandoBtn) esfriandoBtn.addEventListener('click', ()=>{ filtroEsfriando = !filtroEsfriando; renderApp(); });

  /* -- Pipeline: colunas -- */
  app.querySelectorAll('[data-action="edit-col-name"]').forEach(el=>{
    el.addEventListener('click', ()=>{
      editingColId = el.dataset.colId;
      const col = board.columns.find(c=>c.id===editingColId);
      editingColName = col ? col.nome : '';
      renderApp();
      const input = document.getElementById('col-rename-'+editingColId);
      if(input){ input.focus(); input.select(); }
    });
  });
  app.querySelectorAll('[id^="col-rename-"]').forEach(input=>{
    input.addEventListener('input', (e)=>{ editingColName = e.target.value; });
    const commit = ()=>{ const id = editingColId; editingColId=null; renameColumn(id, editingColName); };
    input.addEventListener('blur', commit);
    input.addEventListener('keydown', (e)=>{ if(e.key==='Enter') e.target.blur(); });
  });

  app.querySelectorAll('[data-action="toggle-col-menu"]').forEach(btn=>{
    btn.addEventListener('click', (e)=>{
      e.stopPropagation();
      openMenuColId = (openMenuColId===btn.dataset.colId) ? null : btn.dataset.colId;
      renderApp();
    });
  });
  app.querySelectorAll('[data-action="toggle-move-menu"]').forEach(btn=>{
    btn.addEventListener('click', (e)=>{
      e.stopPropagation();
      openMoveMenuCardId = (openMoveMenuCardId===btn.dataset.cardId) ? null : btn.dataset.cardId;
      renderFloatingMoveMenu(); // só o menu flutuante — não precisa redesenhar a página toda (isso resetava a rolagem)
    });
  });
  app.querySelectorAll('[data-action="set-col-tipo"]').forEach(btn=>{
    btn.addEventListener('click', ()=> changeTipo(btn.dataset.colId, btn.dataset.tipo));
  });
  app.querySelectorAll('[data-action="delete-col"]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const id = btn.dataset.colId;
      const col = board.columns.find(c=>c.id===id);
      const n = cardsOf(id).length;
      openMenuColId = null;
      renderApp();
      showConfirm({ chave: n ? null : 'coluna-vazia',
        message: n ? `Excluir a coluna "${col.nome}"? Os ${n} cliente(s) dela também serão removidos.` : `Excluir a coluna "${col.nome}"?`,
        onConfirm: ()=>{ deleteColumnById(id); closeConfirm(); },
      });
    });
  });

  /* -- Pipeline / Leads: cards -- */
  app.querySelectorAll('[data-action="open-add-lead-choice"]').forEach(btn=>{
    btn.addEventListener('click', ()=> abrirEscolhaAdicionarLead(btn.dataset.colId));
  });
  app.querySelectorAll('[data-action="open-new-card"]').forEach(btn=>{
    btn.addEventListener('click', ()=> openNewCard(btn.dataset.colId));
  });
  app.querySelectorAll('[data-action="open-edit-card"]').forEach(el=>{
    el.addEventListener('click', ()=> openEditCard(el.dataset.cardId));
  });
  app.querySelectorAll('[data-action="fechar-faixa-teste"]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      try{ localStorage.setItem('faixaTesteFechadaEm', hojeLocalISO()); }catch(err){}
      const el = btn.closest('.faixa-teste');
      if(el) el.remove();
    });
  });
  app.querySelectorAll('[data-action="abrir-fechamento"]').forEach(btn=>{
    btn.addEventListener('click', (e)=>{ e.stopPropagation(); abrirFechamento(btn.dataset.cardId); });
  });
  app.querySelectorAll('[data-action="open-whatsapp"]').forEach(btn=>{
    btn.addEventListener('click', (e)=>{
      e.stopPropagation();
      abrirWhatsapp(btn.dataset.phone);
    });
  });

  app.querySelectorAll('[data-action="start-add-col"]').forEach(btn=>{
    btn.addEventListener('click', ()=>{ addingCol=true; newColNameVal=''; renderApp();
      const inp = document.getElementById('new-col-input'); if(inp) inp.focus();
    });
  });
  const newColInput = document.getElementById('new-col-input');
  if(newColInput){
    newColInput.addEventListener('input', (e)=>{ newColNameVal = e.target.value; });
    newColInput.addEventListener('keydown', (e)=>{ if(e.key==='Enter') addColumn(); });
  }
  app.querySelectorAll('[data-action="confirm-add-col"]').forEach(btn=> btn.addEventListener('click', addColumn));
  app.querySelectorAll('[data-action="cancel-add-col"]').forEach(btn=> btn.addEventListener('click', ()=>{ addingCol=false; newColNameVal=''; renderApp(); }));

  /* drag and drop */
  app.querySelectorAll('.card').forEach(cardEl=>{
    cardEl.addEventListener('dragstart', (e)=>{
      e.dataTransfer.setData('text/x-crm-card', cardEl.dataset.cardId);
      cardEl.classList.add('dragging');
    });
    cardEl.addEventListener('dragend', ()=>{ cardEl.classList.remove('dragging'); clearInterval(autoScrollDoArrastoInterval); limparIndicadorDeInsercao(); document.querySelectorAll('.column.coluna-drag-alvo').forEach(c=> c.classList.remove('coluna-drag-alvo')); });

    // Arrastar por toque no card inteiro — usa Pointer Events com setPointerCapture.
    // O CSS do .card já trava touch-action:none desde o início (precisa ser assim,
    // travar depois que o toque já começou não tem efeito — é por isso que antes
    // tocar e segurar acabava selecionando texto: o navegador assumia esse gesto
    // por conta própria). Só que travar touch-action:none tira a rolagem nativa da
    // lista também — por isso, aqui embaixo, quando o gesto claramente é rolar (dedo
    // se move rápido, sem pausa) em vez de arrastar (segura parado um instante), a
    // gente rola a lista na mão, imitando o que o navegador faria sozinho.
    cardEl.addEventListener('pointerdown', (e)=>{
      if(e.pointerType === 'mouse') return;
      if(e.target.closest('.card-move-wrap') || e.target.closest('[data-action="toggle-move-menu"]') || e.target.closest('.wa-btn')) return; // não conflita com os botões
      const cardsContainer = cardEl.closest('.cards');
      cardTouchDrag = {
        cardId: cardEl.dataset.cardId, cardEl, arrastando:false, modoRolagem:false,
        startX:e.clientX, startY:e.clientY, ultimoX:e.clientX, ultimoY:e.clientY,
        pointerId:e.pointerId, cardsContainer, scrollInicial: cardsContainer ? cardsContainer.scrollTop : 0, scrollJanelaInicial: window.scrollY,
      };
      cardTouchLongPressTimer = setTimeout(()=>{
        if(!cardTouchDrag || cardTouchDrag.modoRolagem) return; // já virou rolagem, não inicia arrastar
        try{ cardEl.setPointerCapture(cardTouchDrag.pointerId); }catch(err){ /* aparelho sem suporte — segue sem capturar */ }
        iniciarArrastoDeCard(cardTouchDrag.ultimoX, cardTouchDrag.ultimoY);
      }, 280);
    });

    cardEl.addEventListener('pointermove', (e)=>{
      if(!cardTouchDrag || cardTouchDrag.cardEl !== cardEl || cardTouchDrag.pointerId !== e.pointerId) return;
      const dxTotal = e.clientX - cardTouchDrag.startX;
      const dyTotal = e.clientY - cardTouchDrag.startY;
      cardTouchDrag.ultimoX = e.clientX;
      cardTouchDrag.ultimoY = e.clientY;

      if(!cardTouchDrag.arrastando && !cardTouchDrag.modoRolagem){
        if(Math.sqrt(dxTotal*dxTotal + dyTotal*dyTotal) > 10){
          // se moveu antes do temporizador confirmar o arrastar, é rolagem, não segurar-parado
          clearTimeout(cardTouchLongPressTimer);
          cardTouchDrag.modoRolagem = true;
        } else {
          return; // ainda não decidiu — pode virar arrastar (temporizador) ou rolagem (mais movimento)
        }
      }

      if(cardTouchDrag.modoRolagem){
        e.preventDefault();
        // no celular a lista de uma etapa rola junto com a página
        if(ehCelular()) window.scrollTo(0, cardTouchDrag.scrollJanelaInicial - dyTotal);
        else if(cardTouchDrag.cardsContainer) cardTouchDrag.cardsContainer.scrollTop = cardTouchDrag.scrollInicial - dyTotal;
        return;
      }

      // arrastando: quem cuida é o documento (ver arrastoDeCardNoDocumento), que continua
      // recebendo o dedo mesmo depois que a etapa de origem some ao abrir outra etapa
    }, { passive:false });

    cardEl.addEventListener('pointerup', (e)=>{
      clearTimeout(cardTouchLongPressTimer);
      if(!cardTouchDrag || cardTouchDrag.cardEl !== cardEl || cardTouchDrag.pointerId !== e.pointerId) return;
      if(cardTouchDrag.arrastando) return; // o documento finaliza
      cardTouchDrag = null;
    });
    cardEl.addEventListener('pointercancel', ()=>{
      clearTimeout(cardTouchLongPressTimer);
      if(cardTouchDrag && cardTouchDrag.arrastando) return; // o documento cancela
      cardTouchDrag = null;
    });
  });
  app.querySelectorAll('[data-action="drag-col-handle"]').forEach(gripEl=>{
    gripEl.addEventListener('dragstart', (e)=>{
      e.stopPropagation();
      e.dataTransfer.setData('text/x-crm-column', gripEl.dataset.colId);
      const colEl = gripEl.closest('.column');
      if(colEl) colEl.classList.add('dragging-col');
    });
    gripEl.addEventListener('dragend', (e)=>{
      e.stopPropagation();
      const colEl = gripEl.closest('.column');
      if(colEl) colEl.classList.remove('dragging-col');
    });
  });
  app.querySelectorAll('.column').forEach(colEl=>{
    colEl.addEventListener('dragenter', (e)=> e.preventDefault());
    colEl.addEventListener('dragover', (e)=>{
      e.preventDefault();
      atualizarAutoScrollDoArrasto(e.clientX, e.clientY, colEl);
      const cardArrastandoEl = document.querySelector('.card.dragging');
      if(cardArrastandoEl){
        mostrarIndicadorDeInsercao(colEl, e.clientY, cardArrastandoEl.dataset.cardId);
        // mesmo destaque cinza que já existia no arrastar por toque — dá a mesma
        // confirmação visual clara de "aqui vai soltar" também no mouse
        document.querySelectorAll('.column.coluna-drag-alvo').forEach(c=>{ if(c!==colEl) c.classList.remove('coluna-drag-alvo'); });
        colEl.classList.add('coluna-drag-alvo');
      }
    });
    colEl.addEventListener('dragleave', (e)=>{
      clearInterval(autoScrollDoArrastoInterval);
      // só tira o destaque se o mouse realmente saiu da coluna (não só passou por cima
      // de um card filho dentro dela, o que também dispara dragleave por engano)
      if(!colEl.contains(e.relatedTarget)) colEl.classList.remove('coluna-drag-alvo');
    });
    colEl.addEventListener('drop', (e)=>{
      e.preventDefault();
      clearInterval(autoScrollDoArrastoInterval);
      limparIndicadorDeInsercao();
      colEl.classList.remove('coluna-drag-alvo');
      const colId = e.dataTransfer.getData('text/x-crm-column');
      const cardId = e.dataTransfer.getData('text/x-crm-card');
      if(colId) reorderColumns(colId, colEl.dataset.colId);
      else if(cardId){
        const ordem = calcularOrdemDeInsercao(colEl, e.clientY, cardId);
        moveCard(cardId, colEl.dataset.colId, ordem);
      }
    });
  });

  document.addEventListener('click', closeMenusOnOutsideClick);
  document.addEventListener('dragover', permitirDropForaDasColunas);
  document.addEventListener('dragenter', permitirDropForaDasColunas);
  renderFloatingMoveMenu();
}
// Renderiza o menu "Mover para" fora do card (que tem overflow:hidden e cortava as
// opções de baixo) — usa uma raiz própria, colada no fim do <body>, posicionada via
// JS com as coordenadas reais do botão que foi clicado.
// Arrastar card por toque — cria um "fantasma" fixo que segue o dedo, deixando bem
// visível o que está sendo movido. O fantasma tem pointer-events:none de propósito,
// senão ele mesmo apareceria como "o que está embaixo do dedo" ao consultar
// elementFromPoint, escondendo a coluna real por trás dele.
function iniciarArrastoDeCard(x, y){
  if(!cardTouchDrag) return;
  cardTouchDrag.arrastando = true;
  const rect = cardTouchDrag.cardEl.getBoundingClientRect();
  cardTouchDrag.cardEl.classList.add('card-touch-arrastando');
  const fantasma = document.createElement('div');
  fantasma.id = 'card-touch-fantasma';
  fantasma.className = 'card-touch-fantasma';
  const z = (window.zoomDaTela ? window.zoomDaTela() : 1);
  fantasma.style.width = rect.width / z + 'px';
  fantasma.innerHTML = cardTouchDrag.cardEl.querySelector('.card-body') ? cardTouchDrag.cardEl.querySelector('.card-body').innerHTML : cardTouchDrag.cardEl.innerHTML;
  document.body.appendChild(fantasma);
  cardTouchDrag.fantasmaEl = fantasma;
  if(navigator.vibrate) navigator.vibrate(15);
  atualizarArrastoDeCard(x, y);
}
// O fantasma fica logo ABAIXO do dedo (nunca em cima do que o dedo aponta) e dentro da tela.
// Em cima da fileira de etapas ele encolhe, para os nomes das etapas continuarem à vista.
function posicionarFantasma(x, y){
  const f = cardTouchDrag && cardTouchDrag.fantasmaEl; if(!f) return;
  const z = (window.zoomDaTela ? window.zoomDaTela() : 1);
  const chips = document.getElementById('etapas-chips-mobile');
  let sobreChips = false;
  if(chips && chips.offsetParent !== null){ const r = chips.getBoundingClientRect(); sobreChips = y >= r.top - 12 && y <= r.bottom + 12; }
  f.classList.toggle('compacto', sobreChips);
  const largura = f.offsetWidth * z * (sobreChips ? .55 : 1);
  const esquerda = Math.min(Math.max(8, x - largura/2), window.innerWidth - largura - 8);
  f.style.left = esquerda / z + 'px';
  f.style.top = (y + (sobreChips ? 34 : 22)) / z + 'px';
}
function atualizarArrastoDeCard(x, y){
  if(!cardTouchDrag || !cardTouchDrag.fantasmaEl) return;
  // isso aqui é barato — atualiza sempre na hora, o fantasma nunca fica atrasado atrás do dedo
  posicionarFantasma(x, y);
  cardTouchDrag.ultimoXCalculo = x;
  cardTouchDrag.ultimoYCalculo = y;
  // isso aqui é caro (olha a posição de TODOS os cards da coluna, toda vez) — segurando
  // por muito tempo, o dedo dispara centenas de eventos de movimento, e refazer essa
  // conta pesada em cada um deles ia acumulando trabalho e deixando tudo mais lento
  // (parecendo "parar de reconhecer" depois de um tempo). Por isso, no máximo uma vez
  // por quadro de tela (~60x por segundo), nunca mais que isso.
  if(arrastoRafPendente) return;
  arrastoRafPendente = true;
  requestAnimationFrame(()=>{
    arrastoRafPendente = false;
    if(!cardTouchDrag) return;
    const xAtual = cardTouchDrag.ultimoXCalculo, yAtual = cardTouchDrag.ultimoYCalculo;
    verificarChipDeEtapaSobDedo(xAtual, yAtual);
    const colAlvo = encontrarColunaMaisProxima(xAtual);
    document.querySelectorAll('.column.coluna-drag-alvo').forEach(c=> c.classList.remove('coluna-drag-alvo'));
    if(colAlvo){
      colAlvo.classList.add('coluna-drag-alvo');
      mostrarIndicadorDeInsercao(colAlvo, yAtual, cardTouchDrag.cardId);
    }
    atualizarAutoScrollDoArrasto(xAtual, yAtual, colAlvo);
  });
}
// Acha a coluna sob o dedo — e se não achar nenhuma exatamente ali (dedo soltou bem
// na borda entre duas colunas, ou num pixel qualquer fora delas), pega a mais próxima
// pela posição horizontal, em vez de simplesmente desistir. É bem mais tolerante que
// depender de acertar o pixel exato num aparelho de toque.
function encontrarColunaMaisProxima(x){
  // só as colunas à vista (no celular, a etapa aberta)
  const colunas = [...document.querySelectorAll('.column')].filter(c=> c.offsetParent !== null);
  if(!colunas.length) return null;
  const dentro = colunas.find(c=>{
    const r = c.getBoundingClientRect();
    return x >= r.left && x <= r.right;
  });
  if(dentro) return dentro;
  let maisProxima = null, menorDist = Infinity;
  colunas.forEach(c=>{
    const r = c.getBoundingClientRect();
    const centro = (r.left + r.right) / 2;
    const dist = Math.abs(x - centro);
    if(dist < menorDist){ menorDist = dist; maisProxima = c; }
  });
  return maisProxima;
}
// Rola a tela sozinha quando o dedo (arrastando um card) chega perto da borda —
// horizontal pra passar de uma coluna pra outra que não estava visível, vertical
// pra descer/subir dentro de uma coluna comprida. Fica repetindo a cada quadro
// enquanto o dedo continuar perto da borda; some assim que ele se afasta.
// Sem isso, o navegador mostra o símbolo de "proibido" sempre que o mouse passa por
// fora de uma coluna durante o arrastar (a barra lateral, por exemplo) — mesmo que a
// intenção seja só passar por cima pra rolar até uma coluna escondida. Isso libera
// soltar em qualquer lugar da tela, mas só quando é de fato um card/coluna nosso
// sendo arrastado (não mexe em outros tipos de arrastar, tipo um arquivo do sistema).
function permitirDropForaDasColunas(e){
  const tipos = e.dataTransfer && e.dataTransfer.types;
  if(!tipos || (!tipos.includes('text/x-crm-card') && !tipos.includes('text/x-crm-column'))) return;
  if(e.target.closest('.column')) return; // já tratado pelo listener da própria coluna
  e.preventDefault();
  atualizarAutoScrollDoArrasto(e.clientX, e.clientY, null);
}
function atualizarAutoScrollDoArrasto(x, y, colAlvo){
  clearInterval(autoScrollDoArrastoInterval);
  // celular: a página rola para cima (rumo aos chips de etapa) ou para baixo
  if(ehCelular() && cardTouchDrag){
    // dedo na fileira de etapas, perto da ponta: a fileira desliza e mostra as próximas etapas
    const chips = document.getElementById('etapas-chips-mobile');
    if(chips){
      const r = chips.getBoundingClientRect();
      if(y >= r.top - 12 && y <= r.bottom + 12){
        const borda = 56;
        const dx = x < r.left + borda ? -Math.ceil((r.left + borda - x) / 5) : x > r.right - borda ? Math.ceil((x - (r.right - borda)) / 5) : 0;
        if(dx){
          autoScrollDoArrastoInterval = setInterval(()=>{
            chips.scrollLeft += dx;
            if(cardTouchDrag) verificarChipDeEtapaSobDedo(cardTouchDrag.ultimoX, cardTouchDrag.ultimoY); // o chip embaixo do dedo mudou
          }, 16);
        }
        return; // em cima da fileira não rola a página
      }
    }
    let dy = 0;
    const topoLivreY = (document.querySelector('.main-topbar') || { getBoundingClientRect:()=>({ bottom:0 }) }).getBoundingClientRect().bottom;
    if(!cardTouchDrag.chipHover && y < topoLivreY + 60) dy = -12;
    else if(y > window.innerHeight - 150) dy = 12;
    if(dy) autoScrollDoArrastoInterval = setInterval(()=> window.scrollBy(0, dy), 16);
    return;
  }
  const margemHorizontal = 260; // cobre a largura da barra lateral — passar por cima dela já conta como "quero rolar pra lá"
  const margemVertical = 110;
  const mainEl = document.querySelector('main.pipeline-main');
  let dxScroll = 0;
  if(mainEl){
    if(x < margemHorizontal) dxScroll = -16;
    else if(x > window.innerWidth - margemHorizontal) dxScroll = 16;
  }
  const colunaCardsEl = colAlvo ? colAlvo.querySelector('.cards') : null;
  let dyScroll = 0;
  if(colunaCardsEl){
    if(y < margemVertical) dyScroll = -12;
    else if(y > window.innerHeight - margemVertical) dyScroll = 12;
  }
  if(dxScroll===0 && dyScroll===0) return;
  autoScrollDoArrastoInterval = setInterval(()=>{
    if(mainEl && dxScroll) mainEl.scrollLeft += dxScroll;
    if(colunaCardsEl && dyScroll) colunaCardsEl.scrollTop += dyScroll;
  }, 16);
}
function finalizarArrastoDeCard(x, y){
  if(!cardTouchDrag) return;
  const colAlvo = encontrarColunaMaisProxima(x);
  const cardId = cardTouchDrag.cardId;
  limparVisualDoArrasto();
  if(colAlvo && colAlvo.dataset.colId){
    const ordem = calcularOrdemDeInsercao(colAlvo, y, cardId);
    moveCard(cardId, colAlvo.dataset.colId, ordem);
  }
}
function cancelarArrastoDeCard(){
  limparVisualDoArrasto();
}
function limparVisualDoArrasto(){
  if(!cardTouchDrag) return;
  clearInterval(autoScrollDoArrastoInterval);
  clearTimeout(chipHoverTimer);
  document.querySelectorAll('.etapa-chip-mobile.etapa-chip-alvo').forEach(c=> c.classList.remove('etapa-chip-alvo'));
  cardTouchDrag.cardEl.classList.remove('card-touch-arrastando');
  if(cardTouchDrag.fantasmaEl) cardTouchDrag.fantasmaEl.remove();
  document.querySelectorAll('.column.coluna-drag-alvo').forEach(c=> c.classList.remove('coluna-drag-alvo'));
  limparIndicadorDeInsercao();
}
function renderFloatingMoveMenu(){
  let root = document.getElementById('floating-menu-root');
  if(!root){
    root = document.createElement('div');
    root.id = 'floating-menu-root';
    document.body.appendChild(root);
  }
  if(!openMoveMenuCardId){ root.innerHTML = ''; return; }
  const btn = document.querySelector(`[data-action="toggle-move-menu"][data-card-id="${openMoveMenuCardId}"]`);
  const card = board.cards.find(c=>c.id===openMoveMenuCardId);
  if(!btn || !card){ root.innerHTML = ''; openMoveMenuCardId = null; return; }

  const colunasDoMesmoFunil = board.columns.filter(c=>c.funilId===funilAtualId);
  const rect = btn.getBoundingClientRect();
  const alturaEstimada = Math.min(260, colunasDoMesmoFunil.length * 40 + 40);
  const cabeDeBaixo = rect.bottom + alturaEstimada < window.innerHeight;
  const top = cabeDeBaixo ? rect.bottom + 4 : rect.top - alturaEstimada - 4;
  const left = Math.min(rect.left, window.innerWidth - 200); // não deixa vazar pela direita da tela

  root.innerHTML = `
    <div class="col-menu card-move-menu" style="position:fixed; top:${Math.max(4,top) / (window.zoomDaTela ? window.zoomDaTela() : 1)}px; left:${Math.max(4,left) / (window.zoomDaTela ? window.zoomDaTela() : 1)}px;">
      <div class="col-menu-title">Mover para</div>
      ${colunasDoMesmoFunil.map(c=>`
        <button class="col-menu-item" data-action="mover-para-coluna" data-card-id="${card.id}" data-col-id="${c.id}" ${c.id===card.columnId?'disabled':''}>
          ${esc(c.nome)} ${c.id===card.columnId?'✓':''}
        </button>
      `).join('')}
    </div>
  `;
  root.querySelectorAll('[data-action="mover-para-coluna"]').forEach(b=>{
    b.addEventListener('click', (e)=>{
      e.stopPropagation();
      if(b.disabled) return;
      openMoveMenuCardId = null;
      moveCard(b.dataset.cardId, b.dataset.colId);
    });
  });
}
function closeMenusOnOutsideClick(e){
  if(openMenuColId && !e.target.closest('.col-menu') && !e.target.closest('[data-action="toggle-col-menu"]')){
    openMenuColId = null; renderApp();
  }
  if(openMoveMenuCardId && !e.target.closest('.card-move-menu') && !e.target.closest('[data-action="toggle-move-menu"]')){
    openMoveMenuCardId = null; renderFloatingMoveMenu();
  }
  if(menuDiaAberto && !e.target.closest('#menu-dia-root')){
    fecharMenuDia();
  }
  if(dateMenuOpen && !e.target.closest('.date-menu') && !e.target.closest('[data-action="toggle-date-menu"]')){
    dateMenuOpen = false; renderApp();
  }
  if(notifOpen && !e.target.closest('.notif-panel') && !e.target.closest('[data-action="toggle-notif"]')){
    notifOpen = false; renderApp();
  }
  if(ordenarMenuAberto && !e.target.closest('.ordenar-wrap')){
    ordenarMenuAberto = null; renderApp();
  }
}

// Faixa do resumo do funil no celular: esconde o sinal "continua" quando já chegou ao fim
document.addEventListener('scroll', (e)=>{
  const faixa = e.target && e.target.classList && e.target.classList.contains('stats') ? e.target : null;
  if(!faixa || !faixa.parentElement) return;
  faixa.parentElement.classList.toggle('no-fim', faixa.scrollLeft + faixa.clientWidth >= faixa.scrollWidth - 4);
}, true);

// Arrastar card por toque, depois de confirmado: os eventos do dedo são tratados no documento.
// Ao parar em cima do chip de outra etapa, essa etapa abre e a de origem some — o card
// deixa de receber o dedo, então quem acompanha o arrastar até o fim é o documento.
function arrastoDeCardNoDocumento(e){
  if(!cardTouchDrag || !cardTouchDrag.arrastando || cardTouchDrag.pointerId !== e.pointerId) return;
  if(e.type === 'pointermove'){
    e.preventDefault();
    cardTouchDrag.ultimoX = e.clientX; cardTouchDrag.ultimoY = e.clientY;
    atualizarArrastoDeCard(e.clientX, e.clientY);
  } else if(e.type === 'pointerup'){
    e.preventDefault(); // evita o clique fantasma que abriria o card logo depois de soltar
    finalizarArrastoDeCard(e.clientX, e.clientY);
    cardTouchDrag = null;
  } else {
    cancelarArrastoDeCard();
    cardTouchDrag = null;
  }
}
document.addEventListener('pointermove', arrastoDeCardNoDocumento, { passive:false });
document.addEventListener('pointerup', arrastoDeCardNoDocumento);
document.addEventListener('pointercancel', arrastoDeCardNoDocumento);
