/* ---------- modal do cliente ---------- */
function openNewCard(columnId){
  const colId = columnId || ((board.columns.find(c=>c.tipo==='aberto') || board.columns[0] || {}).id);
  escolhaTipoPessoaColId = colId;
  renderEscolhaTipoPessoaModal();
}
function fecharEscolhaTipoPessoa(){
  escolhaTipoPessoaColId = null;
  document.getElementById('modal-root').innerHTML = '';
}
function renderEscolhaTipoPessoaModal(){
  const root = document.getElementById('modal-root');
  root.innerHTML = `
    <div class="overlay" id="escolha-tipo-overlay">
      <div class="modal" style="max-width:380px;">
        <div class="modal-head">
          <h3>Novo lead</h3>
          <button id="escolha-tipo-close">✕</button>
        </div>
        <div class="modal-body" style="display:flex; flex-direction:column; gap:10px;">
          <button type="button" class="tipo-pessoa-escolha-btn" data-tipo="fisica">👤 Pessoa física</button>
          <button type="button" class="tipo-pessoa-escolha-btn" data-tipo="juridica">🏢 Pessoa jurídica</button>
        </div>
      </div>
    </div>
  `;
  document.getElementById('escolha-tipo-close').addEventListener('click', fecharEscolhaTipoPessoa);
  document.getElementById('escolha-tipo-overlay').addEventListener('click', (e)=>{ if(e.target.id==='escolha-tipo-overlay') fecharEscolhaTipoPessoa(); });
  root.querySelectorAll('.tipo-pessoa-escolha-btn').forEach(btn=>{
    btn.addEventListener('click', ()=> abrirNovoCardComTipo(escolhaTipoPessoaColId, btn.dataset.tipo));
  });
}
function abrirNovoCardComTipo(columnId, tipoPessoa){
  // se a pessoa estiver vendo um mês específico no Pipeline, começa nesse mês (dia 1);
  // no mês atual ou em "Geral", usa a data de hoje, com o dia certinho
  const dataInicial = (filterMonth && filterMonth !== hojeLocalISO().slice(0,7)) ? `${filterMonth}-01` : hojeLocalISO();
  modalForm = {
    __isNew: true, id:null, columnId,
    cliente:'', valor:0, temperatura:'morno', telefone:'', obs:'',
    mes: '', mesInicioContato: dataInicial, // início de contato já vem preenchido (é agora); mês de venda fica em branco até a venda acontecer de verdade
    etiquetas: [], camposPersonalizados: {}, tipoCarta: 'imovel',
    tipoPessoa, clienteFisica:'', clienteJuridica:'',
    cnpj:'', razaoSocial:'', inscricaoEstadual:'', ramoAtividade:'', contatoNome:'', contatoCargo:'',
  };
  tipoPessoaDropdownAberto = false;
  extrasTela = null; // sem isso, se a última coisa vista tivesse sido a tela de Extras
                      // de outro cliente, o formulário de novo lead nascia mostrando
                      // aquela tela por engano, em vez do formulário de verdade
  renderModal();
}
async function toggleArquivarCard(){
  if(!modalForm || modalForm.__isNew) return;
  const arquivarAgora = !modalForm.arquivado;
  try{
    const atualizado = await apiRequest('PUT', `/cards/${modalForm.id}/${arquivarAgora?'arquivar':'desarquivar'}`);
    const idx = board.cards.findIndex(c=>c.id===modalForm.id);
    if(idx>-1) board.cards[idx] = atualizado;
    if(arquivarAgora){
      closeModal();
      renderApp();
    } else {
      modalForm.arquivado = atualizado.arquivado;
      renderModal();
      renderApp();
    }
  }catch(e){
    errorMsg = 'Não foi possível atualizar o arquivamento.';
    renderApp();
  }
}
function openEditCard(id){
  const card = board.cards.find(c=>c.id===id);
  if(!card) return;
  modalForm = {
    ...card, __isNew:false,
    clienteFisica: card.tipoPessoa==='juridica' ? '' : (card.cliente||''),
    clienteJuridica: card.tipoPessoa==='juridica' ? (card.cliente||'') : '',
  };
  tipoPessoaDropdownAberto = false;
  notifOpen = false;
  extrasTela = null;
  etiquetaInputValor = '';
  etiquetaEditandoOriginal = null;
  anexosCarregados = false;
  anexosDoCard = [];
  anexoMsg = null;
  historicoContatoCarregado = false;
  historicoContatoItens = [];
  historicoContatoTexto = '';
  tarefasRapidasLista = [{ titulo:'', data:'' }];
  tarefaRapidaCriando = false;
  renderModal();
  loadAnexosDoCard(id);
  loadHistoricoContato(id);
}
function abrirMaisUmaLinhaDeTarefa(){
  tarefasRapidasLista.push({ titulo:'', data:'' });
  renderModal();
  const novoInput = document.querySelector(`.tarefa-rapida-titulo-input[data-idx="${tarefasRapidasLista.length-1}"]`);
  if(novoInput) novoInput.focus();
}
function removerLinhaDeTarefa(idx){
  if(tarefasRapidasLista.length <= 1) return; // sempre sobra pelo menos uma linha
  tarefasRapidasLista.splice(idx, 1);
  renderModal();
}
async function criarTarefaRapidaDoCard(){
  if(!modalForm || modalForm.__isNew) return;
  const validas = tarefasRapidasLista
    .map(t=> ({ titulo: t.titulo.trim(), data: t.data || hojeLocalISO() }))
    .filter(t=> t.titulo);
  if(!validas.length) return;

  showConfirm({
    message: validas.length===1
      ? `Confirmar a criação da tarefa "${validas[0].titulo}"?`
      : `Confirmar a criação dessas ${validas.length} tarefas?`,
    confirmLabel: 'Confirmar',
    danger: false,
    onConfirm: async ()=>{
      closeConfirm();
      tarefaRapidaCriando = true;
      renderModal();
      try{
        for(const t of validas){
          const nova = await apiRequest('POST', '/tasks', { titulo: t.titulo, vencimento: t.data, prioridade:'media', leadId: modalForm.id, descricao:'' });
          tasks.push(nova);
          atualizarTarefaNaAgendaLocal(nova);
        }
        tarefaRapidaCriando = false;
        tarefasRapidasLista = [{ titulo:'', data:'' }]; // volta pro estado inicial — "segmento acima"
        renderModal();
        const dataMaisCedo = validas.map(t=>t.data).sort()[0];
        showConfirm({
          message: validas.length===1 ? 'Tarefa criada! Quer ir pra Agenda ver ela?' : 'Tarefas criadas! Quer ir pra Agenda ver elas?',
          confirmLabel: 'Ir pra Agenda',
          cancelLabel: 'Continuar aqui',
          danger: false,
          onConfirm: async ()=>{
            closeConfirm();
            closeModal();
            agendaMesAtual = dataMaisCedo.slice(0,7);
            goToPage('tarefas');
            await loadAgendaMes(agendaMesAtual);
            agendaDiaSelecionado = dataMaisCedo;
            agendaDiaDestacado = dataMaisCedo;
            renderAgendaDiaModal();
          },
        });
      }catch(e){
        errorMsg = 'Não foi possível criar as tarefas.';
        tarefaRapidaCriando = false;
        renderModal();
      }
    },
  });
}
function closeModal(){ modalForm = null; document.getElementById('modal-root').innerHTML=''; }

function renderExtrasOverlayHtml(f){
  let titulo = 'Extras';
  let voltarPara = null; // pra onde o botão de voltar leva — null fecha os Extras de vez
  let corpo = '';

  if(extrasTela === 'menu'){
    corpo = `
      <div class="extras-menu">
        <button type="button" class="extras-menu-btn" data-action="extras-ir" data-tela="etiquetas">🏷️<span>Etiquetas</span></button>
        <button type="button" class="extras-menu-btn" data-action="extras-ir" data-tela="anexos">📎<span>Anexos</span></button>
        <button type="button" class="extras-menu-btn" data-action="extras-ir" data-tela="tarefas">✅<span>Tarefas</span></button>
        <button type="button" class="extras-menu-btn" data-action="extras-ir" data-tela="historico">📞<span>Histórico</span></button>
      </div>
    `;
  } else if(extrasTela === 'etiquetas'){
    titulo = 'Etiquetas';
    voltarPara = 'menu';
    const etiquetas = f.etiquetas || [];
    corpo = `
      <div class="field-row-flex">
        <input type="text" id="etiqueta-input" value="${esc(etiquetaInputValor)}" placeholder="Nome da etiqueta" />
        <button type="button" class="btn-primary" id="etiqueta-salvar-btn">${etiquetaEditandoOriginal ? 'Salvar' : '+ Adicionar'}</button>
        ${etiquetaEditandoOriginal ? `<button type="button" class="btn-outline" id="etiqueta-cancelar-btn">Cancelar</button>` : ''}
      </div>
      ${etiquetas.length ? `
        <div class="etiquetas-pills" style="margin-top:14px;">
          ${etiquetas.map(et=>`
            <span class="etiqueta-pill etiqueta-pill-editavel">
              ${esc(et)}
              <button type="button" data-action="etiqueta-editar" data-etiqueta="${esc(et)}" title="Editar">✎</button>
              <button type="button" data-action="etiqueta-apagar" data-etiqueta="${esc(et)}" title="Apagar">✕</button>
            </span>
          `).join('')}
        </div>
      ` : '<p class="dash-empty">Nenhuma etiqueta ainda.</p>'}
    `;
  } else if(extrasTela === 'anexos'){
    titulo = 'Anexos';
    voltarPara = 'menu';
    corpo = `
      <input type="file" id="anexo-input" style="display:none;" accept="image/*,application/pdf" />
      <button type="button" class="btn-outline" id="anexo-upload-btn" ${anexoEnviando?'disabled':''}>${anexoEnviando?'Enviando…':'+ Adicionar anexo'}</button>
      <p class="settings-page-note">Imagens ou PDF, até ~3 MB por arquivo.</p>
      <div id="f-anexos-lista">${!anexosCarregados ? '<p class="settings-page-note">Carregando…</p>' : renderAnexosListaHtml()}</div>
    `;
  } else if(extrasTela === 'tarefas'){
    titulo = 'Tarefas';
    voltarPara = 'menu';
    const qtd = tasks.filter(t=>t.leadId===f.id).length;
    corpo = `
      <div class="field">
        <label>Nova(s) tarefa(s)</label>
        ${tarefasRapidasLista.map((t,i)=>`
          <div class="field-row-flex tarefa-rapida-linha">
            <input type="text" class="tarefa-rapida-titulo-input" data-idx="${i}" value="${esc(t.titulo)}" placeholder="Ex: Ligar amanhã de manhã" />
            <input type="date" class="tarefa-rapida-data-input" data-idx="${i}" value="${t.data || new Date().toISOString().slice(0,10)}" style="max-width:160px;" />
            ${i === tarefasRapidasLista.length-1
              ? `<button type="button" class="icon-btn" data-action="tarefa-rapida-add-linha" title="Adicionar outra tarefa">+</button>`
              : `<button type="button" class="icon-btn" data-action="tarefa-rapida-remover-linha" data-idx="${i}" title="Remover essa tarefa">✕</button>`
            }
          </div>
        `).join('')}
        <button type="button" class="btn-primary" style="width:100%; margin-top:8px;" id="tarefa-rapida-criar-btn" ${tarefaRapidaCriando?'disabled':''}>${tarefaRapidaCriando?'Criando…':'Confirmar'}</button>
      </div>
      <button type="button" class="btn-outline" style="width:100%;" data-action="extras-ir" data-tela="tarefas-lista">Ver tarefas existentes (${qtd})</button>
    `;
  } else if(extrasTela === 'tarefas-lista'){
    titulo = 'Tarefas existentes';
    voltarPara = 'tarefas';
    const tarefasDoLead = tasks.filter(t=>t.leadId===f.id).slice().sort((a,b)=> (a.vencimento||'').localeCompare(b.vencimento||''));
    corpo = tarefasDoLead.length ? `
      <div class="historico-lista">
        ${tarefasDoLead.map(t=>`
          <button type="button" class="historico-item historico-item-clicavel" data-action="extras-perguntar-conclusao-tarefa" data-task-id="${t.id}">
            <div style="flex:1; text-align:left;">
              <span class="historico-item-texto">${t.concluida?'✓ ':''}${esc(t.titulo)}</span>
              <span class="historico-item-data">${t.vencimento ? formatDate(t.vencimento) : 'Sem data'}</span>
            </div>
          </button>
        `).join('')}
      </div>
    ` : '<p class="dash-empty">Nenhuma tarefa ainda pra esse lead.</p>';
  } else if(extrasTela === 'historico'){
    titulo = 'Histórico de contato';
    voltarPara = 'menu';
    corpo = `
      <div class="field-row-flex">
        <input type="text" id="historico-input" value="${esc(historicoContatoTexto)}" placeholder="Ex: Tentei contato 3x hoje, cliente não atendeu" />
        <button type="button" class="btn-primary" id="historico-add-btn" ${historicoContatoEnviando?'disabled':''}>${historicoContatoEnviando?'Salvando…':'Adicionar'}</button>
      </div>
      <div id="f-historico-lista" style="margin-top:12px;">${!historicoContatoCarregado ? '<p class="settings-page-note">Carregando…</p>' : renderHistoricoContatoListaHtml()}</div>
    `;
  }

  return `
    <div class="overlay" id="modal-overlay">
      <div class="modal">
        <div class="modal-head">
          <button id="extras-voltar" class="icon-btn" title="Voltar" data-voltar-para="${voltarPara||''}">←</button>
          <h3>${titulo}</h3>
          <button id="modal-close">✕</button>
        </div>
        <div class="modal-body">${corpo}</div>
      </div>
    </div>
  `;
}
function ligarBindingsExtras(){
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('modal-overlay').addEventListener('click', (e)=>{ if(e.target.id==='modal-overlay') closeModal(); });
  const voltarBtn = document.getElementById('extras-voltar');
  if(voltarBtn) voltarBtn.addEventListener('click', ()=>{
    const para = voltarBtn.dataset.voltarPara;
    extrasTela = para || null; // sem "voltarPara" = fecha os Extras de vez, volta pro formulário
    etiquetaEditandoOriginal = null;
    etiquetaInputValor = '';
    renderModal();
  });
  app.querySelectorAll ? null : null; // (sem uso — mantém o padrão dos outros bindings do arquivo)

  document.querySelectorAll('[data-action="extras-ir"]').forEach(btn=>{
    btn.addEventListener('click', ()=>{ extrasTela = btn.dataset.tela; renderModal(); });
  });

  // Etiquetas
  const etiquetaInput = document.getElementById('etiqueta-input');
  if(etiquetaInput) etiquetaInput.addEventListener('input', (e)=> etiquetaInputValor = e.target.value);
  const etiquetaSalvarBtn = document.getElementById('etiqueta-salvar-btn');
  if(etiquetaSalvarBtn) etiquetaSalvarBtn.addEventListener('click', salvarEtiquetaExtras);
  const etiquetaCancelarBtn = document.getElementById('etiqueta-cancelar-btn');
  if(etiquetaCancelarBtn) etiquetaCancelarBtn.addEventListener('click', ()=>{
    etiquetaEditandoOriginal = null; etiquetaInputValor = ''; renderModal();
  });
  document.querySelectorAll('[data-action="etiqueta-editar"]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      etiquetaEditandoOriginal = btn.dataset.etiqueta;
      etiquetaInputValor = btn.dataset.etiqueta;
      renderModal();
      const input = document.getElementById('etiqueta-input');
      if(input){ input.focus(); input.select(); }
    });
  });
  document.querySelectorAll('[data-action="etiqueta-apagar"]').forEach(btn=>{
    btn.addEventListener('click', ()=> apagarEtiquetaExtras(btn.dataset.etiqueta));
  });

  // Anexos (mesmo comportamento de antes, só que agora dentro dos Extras)
  const anexoInput = document.getElementById('anexo-input');
  const anexoUploadBtn = document.getElementById('anexo-upload-btn');
  if(anexoUploadBtn && anexoInput) anexoUploadBtn.addEventListener('click', ()=> anexoInput.click());
  if(anexoInput) anexoInput.addEventListener('change', (e)=>{
    const file = e.target.files && e.target.files[0];
    if(file) handleAnexoFileSelected(file);
  });

  // Tarefas
  document.querySelectorAll('.tarefa-rapida-titulo-input').forEach(input=>{
    input.addEventListener('input', (e)=>{ tarefasRapidasLista[Number(input.dataset.idx)].titulo = e.target.value; });
  });
  document.querySelectorAll('.tarefa-rapida-data-input').forEach(input=>{
    input.addEventListener('input', (e)=>{ tarefasRapidasLista[Number(input.dataset.idx)].data = e.target.value; });
  });
  const tarefaRapidaAddBtn = document.querySelector('[data-action="tarefa-rapida-add-linha"]');
  if(tarefaRapidaAddBtn) tarefaRapidaAddBtn.addEventListener('click', abrirMaisUmaLinhaDeTarefa);
  document.querySelectorAll('[data-action="tarefa-rapida-remover-linha"]').forEach(btn=>{
    btn.addEventListener('click', ()=> removerLinhaDeTarefa(Number(btn.dataset.idx)));
  });
  const tarefaRapidaCriarBtn = document.getElementById('tarefa-rapida-criar-btn');
  if(tarefaRapidaCriarBtn) tarefaRapidaCriarBtn.addEventListener('click', criarTarefaRapidaDoCard);
  document.querySelectorAll('[data-action="extras-perguntar-conclusao-tarefa"]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const taskId = btn.dataset.taskId;
      const task = tasks.find(t=>t.id===taskId);
      if(!task) return;
      const mensagem = task.concluida
        ? `Marcar "${task.titulo}" como não concluída de novo?`
        : `A tarefa "${task.titulo}" foi concluída?`;
      showConfirm({
        message: mensagem,
        confirmLabel: task.concluida ? 'Desmarcar' : 'Concluída',
        danger: false,
        onConfirm: async ()=>{
          closeConfirm();
          await toggleTaskConcluida(taskId);
          if(extrasTela==='tarefas-lista') renderModal(); // atualiza a marcação (✓) na lista, já que renderApp() não mexe no modal
        },
      });
    });
  });

  // Histórico de contato
  const historicoInput = document.getElementById('historico-input');
  if(historicoInput){
    historicoInput.addEventListener('input', (e)=> historicoContatoTexto = e.target.value);
    historicoInput.addEventListener('keydown', (e)=>{ if(e.key==='Enter'){ e.preventDefault(); adicionarHistoricoContato(); } });
  }
  const historicoAddBtn = document.getElementById('historico-add-btn');
  if(historicoAddBtn) historicoAddBtn.addEventListener('click', adicionarHistoricoContato);
  ligarBindingsHistoricoContato();
}
async function salvarEtiquetaExtras(){
  const novoValor = etiquetaInputValor.trim();
  if(!novoValor || !modalForm) return;
  const atuais = modalForm.etiquetas || [];
  let novasEtiquetas;
  if(etiquetaEditandoOriginal){
    novasEtiquetas = atuais.map(et=> et===etiquetaEditandoOriginal ? novoValor : et);
  } else {
    if(atuais.includes(novoValor)){ etiquetaInputValor=''; renderModal(); return; } // já existe, não duplica
    novasEtiquetas = [...atuais, novoValor];
  }
  await salvarEtiquetasNoCard(novasEtiquetas);
  etiquetaEditandoOriginal = null;
  etiquetaInputValor = '';
  renderModal();
}
async function apagarEtiquetaExtras(etiqueta){
  if(!modalForm) return;
  const novasEtiquetas = (modalForm.etiquetas||[]).filter(et=> et!==etiqueta);
  await salvarEtiquetasNoCard(novasEtiquetas);
  renderModal();
}
async function salvarEtiquetasNoCard(novasEtiquetas){
  const anteriores = modalForm.etiquetas || [];
  modalForm.etiquetas = novasEtiquetas; // otimista
  try{
    await apiRequest('PUT', `/cards/${modalForm.id}`, { etiquetas: novasEtiquetas });
    const card = board.cards.find(c=>c.id===modalForm.id);
    if(card) card.etiquetas = novasEtiquetas;
  }catch(e){
    modalForm.etiquetas = anteriores;
    errorMsg = 'Não foi possível salvar as etiquetas.';
  }
}

function renderModal(){
  const root = document.getElementById('modal-root');
  if(!modalForm){ root.innerHTML=''; return; }
  const f = modalForm;

  // Extras (etiquetas/anexos/tarefas/histórico) só faz sentido pra um card que já
  // existe de verdade — um card novo não tem id ainda pra buscar nada disso. Essa
  // checagem extra evita mostrar a tela de Extras por engano caso extrasTela tenha
  // ficado "grudado" de uma interação anterior com outro cliente.
  if(extrasTela && !f.__isNew){
    root.innerHTML = renderExtrasOverlayHtml(f);
    ligarBindingsExtras();
    return;
  }

  root.innerHTML = `
    <div class="overlay" id="modal-overlay">
      <div class="modal">
        <div class="modal-head">
          <h3>${f.__isNew ? 'Novo cliente' : 'Editar cliente'}</h3>
          <button id="modal-close">✕</button>
        </div>
        <div class="modal-body">
          ${podeAtribuirLeads() ? `
          <div class="field">
            <label>Modo</label>
            <div class="modo-gestor-toggle">
              <button type="button" class="modo-gestor-btn ${!f.__modoGestor?'ativo':''}" data-modo-gestor="0">Padrão</button>
              <button type="button" class="modo-gestor-btn ${f.__modoGestor?'ativo':''}" data-modo-gestor="1">⭐ Gestor</button>
            </div>
            ${f.__modoGestor ? `
              <label style="margin-top:10px">${f.__isNew ? 'Adicionar este lead para' : 'Passar este lead para'}</label>
              <select id="f-atribuir-para">
                <option value="">Selecione uma pessoa…</option>
                ${equipe.membros.filter(m=>!m.souEu).map(m=>`<option value="${m.id}" ${f.__atribuirParaId===m.id?'selected':''}>${esc(m.nome||m.email)}${m.papel==='supervisor'?' ⭐':''}</option>`).join('')}
              </select>
              <p class="settings-page-note" style="margin:6px 0 0">${f.__isNew ? 'O lead vai direto para o pipeline da pessoa escolhida, na coluna de mesmo nome (ou na primeira em aberto).' : 'O lead sai do seu pipeline e vai para o da pessoa escolhida, junto com conversas, anexos, tarefas e histórico.'}</p>
            ` : ''}
          </div>` : ''}
          <div class="field">
            <button type="button" class="tipo-pessoa-select-btn" id="f-tipo-pessoa-select">
              <span>${f.tipoPessoa==='juridica' ? '🏢 Pessoa jurídica' : '👤 Pessoa física'}</span>
              <span class="tipo-pessoa-select-seta ${tipoPessoaDropdownAberto?'aberta':''}">▾</span>
            </button>
            ${tipoPessoaDropdownAberto ? `
              <div class="tipo-pessoa-dropdown">
                <button type="button" class="tipo-pessoa-dropdown-item" data-tipo-pessoa="fisica">👤 Pessoa física ${f.tipoPessoa!=='juridica'?'✓':''}</button>
                <button type="button" class="tipo-pessoa-dropdown-item" data-tipo-pessoa="juridica">🏢 Pessoa jurídica ${f.tipoPessoa==='juridica'?'✓':''}</button>
              </div>
            ` : ''}
          </div>
          <div class="field">
            <label>${f.tipoPessoa==='juridica' ? 'Nome fantasia' : 'Nome do cliente'}</label>
            <input type="text" id="f-cliente" value="${esc(f.tipoPessoa==='juridica' ? (f.clienteJuridica||'') : (f.clienteFisica||''))}" placeholder="${f.tipoPessoa==='juridica' ? 'Ex: Padaria do João' : 'Ex: Ana Souza'}" />
          </div>
          ${f.tipoPessoa==='juridica' ? `
            <div class="field-row">
              <div class="field">
                <label>CNPJ</label>
                <input type="text" id="f-cnpj" value="${esc(f.cnpj||'')}" placeholder="00.000.000/0000-00" />
              </div>
              <div class="field">
                <label>Inscrição estadual (opcional)</label>
                <input type="text" id="f-inscricao-estadual" value="${esc(f.inscricaoEstadual||'')}" placeholder="Isento ou número" />
              </div>
            </div>
            <div class="field">
              <label>Razão social</label>
              <input type="text" id="f-razao-social" value="${esc(f.razaoSocial||'')}" placeholder="Ex: Padaria do João Ltda" />
            </div>
            <div class="field">
              <label>Ramo de atividade</label>
              <input type="text" id="f-ramo-atividade" value="${esc(f.ramoAtividade||'')}" placeholder="Ex: Alimentação, Transporte, Varejo..." />
            </div>
            <div class="field-row">
              <div class="field">
                <label>Contato responsável</label>
                <input type="text" id="f-contato-nome" value="${esc(f.contatoNome||'')}" placeholder="Quem você fala na empresa" />
              </div>
              <div class="field">
                <label>Cargo do contato</label>
                <input type="text" id="f-contato-cargo" value="${esc(f.contatoCargo||'')}" placeholder="Ex: Sócio, Financeiro..." />
              </div>
            </div>
          ` : ''}
          <div class="field-row">
            <div class="field">
              <label>Valor de crédito</label>
              <div class="money-wrap">
                <span>R$</span>
                <input type="text" inputmode="numeric" id="f-valor" value="${f.valor ? Number(f.valor).toLocaleString('pt-BR') : ''}" placeholder="0" />
              </div>
            </div>
            <div class="field">
              <label>Coluna</label>
              <select id="f-coluna">
                ${board.columns.map(c=>`<option value="${c.id}" ${c.id===f.columnId?'selected':''}>${esc(c.nome)}</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="field" ${perfilRH()?'style="display:none;"':''}>
            <label>Tipo de carta de crédito</label>
            <select id="f-tipo-carta">
              ${renderOpcoesTipoCarta(f.tipoCarta||'imovel')}
            </select>
          </div>
          <div class="field-row">
            <div class="field">
              <label>Mês de início de contato</label>
              <input type="date" id="f-mes-inicio-contato" value="${normalizarData(f.mesInicioContato)}" />
            </div>
            <div class="field">
              <label>Mês de venda</label>
              <input type="date" id="f-mes" value="${normalizarData(f.mes)}" />
            </div>
          </div>
          <p class="settings-page-note">O início de contato é opcional — ajuda a documentar quanto tempo leva até fechar.</p>
          <p class="settings-page-note" id="f-ciclo-venda-nota" style="${(f.mesInicioContato && !f.__isNew)?'':'display:none;'}">${textoCicloDeVenda(f.mesInicioContato, f.mes)}</p>
          <div class="field">
            <label>Qualificação</label>
            <div class="temp-toggle" id="f-temp-toggle">
              ${Object.entries(TEMPS).map(([key,t])=>`
                <div class="temp-btn ${f.temperatura===key ? 'active-'+key : ''}" data-temp="${key}">${t.emoji} ${t.label}</div>
              `).join('')}
            </div>
          </div>
          <div class="field">
            <label>Telefone (opcional)</label>
            <input type="text" id="f-telefone" value="${esc(f.telefone||'')}" placeholder="(11) 90000-0000" />
            <div class="wa-actions-row">
              <button type="button" class="wa-btn wa-btn-modal" id="f-whatsapp" style="${f.telefone ? '' : 'display:none;'}">
                ${WA_ICON} Abrir WhatsApp
              </button>
              ${!f.__isNew && integracoesConfig.assistenteIA ? `<button type="button" class="ai-btn" id="f-ai-mensagem">${ICON_SPARKLE} Sugerir mensagem</button>` : ''}
              ${!f.__isNew && whatsappConnected ? `<button type="button" class="ai-btn" id="f-ver-conversa">${WA_ICON} Ver conversa</button>` : ''}
              ${!f.__isNew ? `<button type="button" class="ai-btn" id="f-ver-historico">🕘 Ver histórico</button>` : ''}
              ${(!f.__isNew && !perfilRH()) ? `<button type="button" class="ai-btn" id="f-gerar-proposta">📄 Gerar proposta</button>` : ''}
              ${!f.__isNew ? `<button type="button" class="ai-btn" id="f-toggle-arquivar">${f.arquivado?'📦 Desarquivar':'📦 Arquivar'}</button>` : ''}
            </div>
            <div class="ai-result" id="f-ai-mensagem-result" style="display:none;"></div>
            <div class="wa-conversa" id="f-wa-conversa" style="display:none;"></div>
            <div class="wa-conversa" id="f-historico" style="display:none;"></div>
          </div>
          <div class="field">
            <label>Observações (opcional)</label>
            <textarea id="f-obs" rows="3" placeholder="Detalhes da negociação...">${esc(f.obs||'')}</textarea>
            ${!f.__isNew && integracoesConfig.assistenteIA ? `<button type="button" class="ai-btn" id="f-ai-tarefa">${ICON_SPARKLE} Sugerir tarefa de acompanhamento</button>` : ''}
            <div class="ai-result" id="f-ai-tarefa-result" style="display:none;"></div>
          </div>
          ${camposPersonalizados.map(campo=>`
            <div class="field">
              <label>${esc(campo.nome)}</label>
              <input type="${campo.tipo==='numero'?'number':(campo.tipo==='data'?'date':'text')}" class="f-campo-personalizado" data-campo-id="${campo.id}" value="${esc(((f.camposPersonalizados||{})[campo.id])||'')}" />
            </div>
          `).join('')}
          ${!f.__isNew ? `
            <div class="field">
              <button type="button" class="btn-outline" id="f-abrir-extras" style="width:100%;">⋯ Extras (etiquetas, anexos, tarefas, histórico)</button>
            </div>
          ` : ''}
          ${!f.__isNew && f.sugestaoIA && f.sugestaoIA.texto ? `
            <div class="field">
              <div class="ai-result" style="display:block;">
                <p class="settings-page-subtitle">✨ Sugestão da IA proativa</p>
                <p>${esc(f.sugestaoIA.texto)}</p>
                ${f.sugestaoIA.tarefaTitulo ? `<p class="settings-page-note">Tarefa sugerida: <b>${esc(f.sugestaoIA.tarefaTitulo)}</b> (${f.sugestaoIA.tarefaDias||3} dia(s))</p>` : ''}
                <div class="ai-result-actions">
                  <button type="button" class="btn-outline" id="f-sugestao-copiar">Copiar mensagem</button>
                  ${f.sugestaoIA.tarefaTitulo ? `<button type="button" class="btn-outline" id="f-sugestao-criar-tarefa">Criar tarefa sugerida</button>` : ''}
                  <button type="button" class="btn-outline" id="f-sugestao-descartar">Descartar</button>
                </div>
              </div>
            </div>
          ` : ''}
        </div>
        <div class="modal-foot">
          ${(!f.__isNew && podeExcluirLeads()) ? `<button class="delete-link" id="f-delete">🗑 Excluir</button>` : '<span></span>'}
          <div class="modal-foot-actions">
            ${mensagemSalvoCard ? `<span class="mensagem-salvo-toast">${esc(mensagemSalvoCard)}</span>` : ''}
            <button class="btn-outline" id="f-cancel" ${salvandoCard?'disabled':''}>Cancelar</button>
            <button class="btn-save" id="f-save" ${salvandoCard?'disabled':''}>${salvandoCard?'Salvando…':'Salvar'}</button>
          </div>
        </div>
      </div>
    </div>
  `;

  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('f-cancel').addEventListener('click', closeModal);
  document.getElementById('modal-overlay').addEventListener('click', (e)=>{ if(e.target.id==='modal-overlay') closeModal(); });

  document.getElementById('f-cliente').addEventListener('input', (e)=>{
    if(modalForm.tipoPessoa==='juridica') modalForm.clienteJuridica = e.target.value;
    else modalForm.clienteFisica = e.target.value;
  });
  const telefoneInput = document.getElementById('f-telefone');
  const waModalBtn = document.getElementById('f-whatsapp');
  telefoneInput.addEventListener('input', (e)=>{
    modalForm.telefone = e.target.value;
    waModalBtn.style.display = e.target.value.trim() ? 'inline-flex' : 'none';
  });
  waModalBtn.addEventListener('click', ()=> abrirWhatsapp(modalForm.telefone));
  document.getElementById('f-obs').addEventListener('input', (e)=> modalForm.obs = e.target.value);
  document.querySelectorAll('.f-campo-personalizado').forEach(el=>{
    el.addEventListener('input', (e)=>{
      if(!modalForm.camposPersonalizados) modalForm.camposPersonalizados = {};
      modalForm.camposPersonalizados[el.dataset.campoId] = e.target.value;
    });
  });
  const abrirExtrasBtn = document.getElementById('f-abrir-extras');
  if(abrirExtrasBtn) abrirExtrasBtn.addEventListener('click', ()=>{ extrasTela = 'menu'; renderModal(); });
  const aiMensagemBtn = document.getElementById('f-ai-mensagem');
  if(aiMensagemBtn) aiMensagemBtn.addEventListener('click', sugerirMensagemIA);
  const aiTarefaBtn = document.getElementById('f-ai-tarefa');
  if(aiTarefaBtn) aiTarefaBtn.addEventListener('click', sugerirTarefaIA);
  const sugestaoCopiarBtn = document.getElementById('f-sugestao-copiar');
  if(sugestaoCopiarBtn) sugestaoCopiarBtn.addEventListener('click', ()=>{
    navigator.clipboard.writeText(modalForm.sugestaoIA.texto).catch(()=>{});
  });
  const sugestaoCriarTarefaBtn = document.getElementById('f-sugestao-criar-tarefa');
  if(sugestaoCriarTarefaBtn) sugestaoCriarTarefaBtn.addEventListener('click', async ()=>{
    sugestaoCriarTarefaBtn.disabled = true;
    try{
      const venc = new Date();
      venc.setDate(venc.getDate() + (modalForm.sugestaoIA.tarefaDias||3));
      const nova = await apiRequest('POST', '/tasks', {
        titulo: modalForm.sugestaoIA.tarefaTitulo, vencimento: venc.toISOString().slice(0,10),
        prioridade:'media', leadId: modalForm.id, descricao:'',
      });
      tasks.push(nova);
      sugestaoCriarTarefaBtn.textContent = '✓ Tarefa criada';
    }catch(e){
      errorMsg = 'Não foi possível criar a tarefa.';
      renderApp();
    }
  });
  const sugestaoDescartarBtn = document.getElementById('f-sugestao-descartar');
  if(sugestaoDescartarBtn) sugestaoDescartarBtn.addEventListener('click', async ()=>{
    try{
      const atualizado = await apiRequest('DELETE', `/cards/${modalForm.id}/sugestao-ia`);
      const idx = board.cards.findIndex(c=>c.id===modalForm.id);
      if(idx>-1) board.cards[idx] = atualizado;
      modalForm.sugestaoIA = atualizado.sugestaoIA;
      renderModal();
    }catch(e){
      errorMsg = 'Não foi possível descartar a sugestão.';
      renderApp();
    }
  });
  const verConversaBtn = document.getElementById('f-ver-conversa');
  if(verConversaBtn) verConversaBtn.addEventListener('click', abrirConversaWhatsapp);
  const verHistoricoBtn = document.getElementById('f-ver-historico');
  if(verHistoricoBtn) verHistoricoBtn.addEventListener('click', abrirHistoricoCard);
  const gerarPropostaBtn = document.getElementById('f-gerar-proposta');
  if(gerarPropostaBtn) gerarPropostaBtn.addEventListener('click', abrirPropostaModal);
  const toggleArquivarBtn = document.getElementById('f-toggle-arquivar');
  if(toggleArquivarBtn) toggleArquivarBtn.addEventListener('click', toggleArquivarCard);
  document.getElementById('f-coluna').addEventListener('change', (e)=> modalForm.columnId = e.target.value);
  const tipoCartaEl = document.getElementById('f-tipo-carta');
  if(tipoCartaEl) tipoCartaEl.addEventListener('change', (e)=> modalForm.tipoCarta = e.target.value);
  document.getElementById('f-mes').addEventListener('change', (e)=>{
    modalForm.mes = e.target.value;
    atualizarNotaCicloDeVenda();
  });
  const mesInicioContatoInput = document.getElementById('f-mes-inicio-contato');
  if(mesInicioContatoInput) mesInicioContatoInput.addEventListener('change', (e)=>{
    modalForm.mesInicioContato = e.target.value;
    atualizarNotaCicloDeVenda();
  });

  const valorInput = document.getElementById('f-valor');
  valorInput.addEventListener('input', (e)=>{
    const { numero, texto } = maskInteiro(e.target.value);
    modalForm.valor = numero;
    e.target.value = texto;
  });

  document.querySelectorAll('#f-temp-toggle .temp-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      modalForm.temperatura = btn.dataset.temp;
      document.querySelectorAll('#f-temp-toggle .temp-btn').forEach(b=>{
        b.className = 'temp-btn' + (b.dataset.temp===modalForm.temperatura ? ' active-'+b.dataset.temp : '');
      });
    });
  });

  document.getElementById('f-tipo-pessoa-select').addEventListener('click', ()=>{
    tipoPessoaDropdownAberto = !tipoPessoaDropdownAberto;
    renderModal();
  });
  document.querySelectorAll('.tipo-pessoa-dropdown-item').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      modalForm.tipoPessoa = btn.dataset.tipoPessoa;
      tipoPessoaDropdownAberto = false;
      renderModal(); // precisa redesenhar pra mostrar/esconder os campos de empresa
    });
  });
  const cnpjInput = document.getElementById('f-cnpj');
  if(cnpjInput) cnpjInput.addEventListener('input', (e)=> modalForm.cnpj = e.target.value);
  const razaoSocialInput = document.getElementById('f-razao-social');
  if(razaoSocialInput) razaoSocialInput.addEventListener('input', (e)=> modalForm.razaoSocial = e.target.value);
  const inscricaoEstadualInput = document.getElementById('f-inscricao-estadual');
  if(inscricaoEstadualInput) inscricaoEstadualInput.addEventListener('input', (e)=> modalForm.inscricaoEstadual = e.target.value);
  const ramoAtividadeInput = document.getElementById('f-ramo-atividade');
  if(ramoAtividadeInput) ramoAtividadeInput.addEventListener('input', (e)=> modalForm.ramoAtividade = e.target.value);
  const contatoNomeInput = document.getElementById('f-contato-nome');
  if(contatoNomeInput) contatoNomeInput.addEventListener('input', (e)=> modalForm.contatoNome = e.target.value);
  const contatoCargoInput = document.getElementById('f-contato-cargo');
  if(contatoCargoInput) contatoCargoInput.addEventListener('input', (e)=> modalForm.contatoCargo = e.target.value);

  root.querySelectorAll('[data-modo-gestor]').forEach(btn=>{
    btn.addEventListener('click', ()=>{ modalForm.__modoGestor = btn.dataset.modoGestor==='1'; if(!modalForm.__modoGestor) modalForm.__atribuirParaId = ''; renderModal(); });
  });
  const atribuirParaSel = document.getElementById('f-atribuir-para');
  if(atribuirParaSel) atribuirParaSel.addEventListener('change', (e)=> modalForm.__atribuirParaId = e.target.value);
  document.getElementById('f-save').addEventListener('click', saveCardFromModal);
  if(!f.__isNew && document.getElementById('f-delete')){
    document.getElementById('f-delete').addEventListener('click', ()=>{
      showConfirm({
        message: 'Excluir este cliente do funil? Essa ação não pode ser desfeita.',
        onConfirm: ()=>{ deleteCardById(f.id); closeModal(); closeConfirm(); },
      });
    });
  }
}

/* ---------- modal da tarefa ---------- */
function openNewTask(dataPreenchida, horaPreenchida){
  taskModalForm = { __isNew:true, id:null, titulo:'', vencimento: dataPreenchida||'', hora: horaPreenchida||'', prioridade:'media', leadId:'', descricao:'' };
  renderTaskModal();
}
function openEditTask(id){
  const t = tasks.find(x=>x.id===id);
  if(!t) return;
  let hora = '';
  let dataStr = '';
  if(t.vencimento){
    const d = new Date(t.vencimento);
    if(!isNaN(d.getTime())){
      // Usa hora em UTC (não local) pra checar se tem horário definido: tarefa sem hora
      // é salva como meia-noite UTC — em horário local (Brasil, UTC-3) isso apareceria
      // como "21:00 do dia anterior" se checássemos em hora local, o que é errado.
      const temHora = d.getUTCHours()!==0 || d.getUTCMinutes()!==0;
      if(temHora){
        // Tem horário de verdade: usa data E hora em horário LOCAL, já que foi isso
        // que a pessoa digitou (senão uma tarefa de 23h vira o dia seguinte por causa do UTC).
        hora = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
        dataStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      } else {
        // Sem horário (só data) — o valor já é meia-noite UTC, pega a data direto da string.
        dataStr = t.vencimento.slice(0,10);
      }
    }
  }
  taskModalForm = { ...t, __isNew:false, vencimento: dataStr, hora, leadId: t.leadId || '' };
  renderTaskModal();
}
function closeTaskModal(){
  taskModalForm = null;
  if(agendaDiaSelecionado){ renderAgendaDiaModal(); return; }
  document.getElementById('modal-root').innerHTML='';
}

/* ---------- modal: Editar perfil (escolha entre adicionar foto / editar nome) ---------- */
function abrirEditarPerfilModal(){
  modalEditarPerfilAberto = true;
  renderEditarPerfilModal();
}
function closeEditarPerfilModal(){
  modalEditarPerfilAberto = false;
  const root = document.getElementById('modal-root');
  if(root) root.innerHTML = '';
}
function renderEditarPerfilModal(){
  const root = document.getElementById('modal-root');
  if(!modalEditarPerfilAberto){ root.innerHTML=''; return; }
  const temFoto = !!(currentUser && currentUser.avatarUrl);
  root.innerHTML = `
    <div class="overlay" id="editar-perfil-overlay">
      <div class="modal">
        <div class="modal-head">
          <h3>Editar perfil</h3>
          <button id="editar-perfil-close">✕</button>
        </div>
        <div class="modal-body">
          <button type="button" class="opcao-perfil-btn" data-action="editar-perfil-foto">
            <span class="opcao-perfil-icon">${ICON_CAMERA}</span>
            <span>
              <strong>${temFoto?'Trocar foto':'Adicionar foto'}</strong>
              <span class="opcao-perfil-nota">PNG, JPG ou WebP — redimensionamos automaticamente.</span>
            </span>
          </button>
          <button type="button" class="opcao-perfil-btn" data-action="editar-perfil-nome">
            <span class="opcao-perfil-icon">${ICON_EDIT}</span>
            <span>
              <strong>Editar nome</strong>
              <span class="opcao-perfil-nota">Como seu nome aparece pro resto da equipe.</span>
            </span>
          </button>
        </div>
      </div>
    </div>
  `;
  document.getElementById('editar-perfil-close').addEventListener('click', closeEditarPerfilModal);
  document.getElementById('editar-perfil-overlay').addEventListener('click', (e)=>{ if(e.target.id==='editar-perfil-overlay') closeEditarPerfilModal(); });
  document.querySelector('[data-action="editar-perfil-foto"]').addEventListener('click', ()=>{
    closeEditarPerfilModal();
    const input = document.getElementById('avatar-input');
    if(input) input.click();
  });
  document.querySelector('[data-action="editar-perfil-nome"]').addEventListener('click', ()=>{
    closeEditarPerfilModal();
    abrirAlterarNomeModal();
  });
}

/* ---------- visualização grande da foto (toque-e-segure no avatar) ---------- */
function abrirAvatarLightbox(){
  if(!(currentUser && currentUser.avatarUrl)) return;
  avatarLightboxAberto = true;
  renderAvatarLightbox();
}
function closeAvatarLightbox(){
  avatarLightboxAberto = false;
  const root = document.getElementById('modal-root');
  if(root) root.innerHTML = '';
}
function renderAvatarLightbox(){
  const root = document.getElementById('modal-root');
  if(!avatarLightboxAberto){ root.innerHTML=''; return; }
  root.innerHTML = `
    <div class="overlay avatar-lightbox-overlay" id="avatar-lightbox-overlay">
      <img src="${currentUser.avatarUrl}" alt="Foto de perfil" class="avatar-lightbox-img" />
      <button id="avatar-lightbox-close" class="avatar-lightbox-close" title="Fechar">✕</button>
    </div>
  `;
  document.getElementById('avatar-lightbox-close').addEventListener('click', closeAvatarLightbox);
  document.getElementById('avatar-lightbox-overlay').addEventListener('click', (e)=>{ if(e.target.id==='avatar-lightbox-overlay') closeAvatarLightbox(); });
}

function abrirAlterarNomeModal(){
  nomeNovoVal = (currentUser && currentUser.nome) || '';
  nomeMsg = null;
  modalAlterarNomeAberto = true;
  renderAlterarNomeModal();
}
function closeAlterarNomeModal(){
  modalAlterarNomeAberto = false;
  const root = document.getElementById('modal-root');
  if(root) root.innerHTML = '';
}
function renderAlterarNomeModal(){
  const root = document.getElementById('modal-root');
  if(!modalAlterarNomeAberto){ root.innerHTML=''; return; }
  root.innerHTML = `
    <div class="overlay" id="alterar-nome-overlay">
      <div class="modal">
        <div class="modal-head">
          <h3>Alterar nome</h3>
          <button id="alterar-nome-close">✕</button>
        </div>
        <div class="modal-body">
          <div class="field">
            <label>Nome</label>
            <input type="text" id="s-nome" value="${esc(nomeNovoVal)}" placeholder="Seu nome" />
          </div>
          ${nomeMsg ? `<p class="settings-page-msg ${nomeMsg.tipo}">${esc(nomeMsg.texto)}</p>` : ''}
        </div>
        <div class="modal-foot">
          <span></span>
          <div class="modal-foot-actions">
            <button class="btn-outline" id="alterar-nome-cancelar">Cancelar</button>
            <button class="btn-save" id="s-nome-salvar" ${nomeSalvando?'disabled':''}>${nomeSalvando?'Salvando…':'Salvar'}</button>
          </div>
        </div>
      </div>
    </div>
  `;
  document.getElementById('alterar-nome-close').addEventListener('click', closeAlterarNomeModal);
  document.getElementById('alterar-nome-cancelar').addEventListener('click', closeAlterarNomeModal);
  document.getElementById('alterar-nome-overlay').addEventListener('click', (e)=>{ if(e.target.id==='alterar-nome-overlay') closeAlterarNomeModal(); });
  document.getElementById('s-nome').addEventListener('input', (e)=> nomeNovoVal = e.target.value);
  document.getElementById('s-nome-salvar').addEventListener('click', salvarNome);
}

function abrirAlterarSenhaModal(){
  senhaAtualVal = '';
  senhaNovaVal = '';
  senhaMsg = null;
  modalAlterarSenhaAberto = true;
  renderAlterarSenhaModal();
}
function closeAlterarSenhaModal(){
  modalAlterarSenhaAberto = false;
  const root = document.getElementById('modal-root');
  if(root) root.innerHTML = '';
}
function renderAlterarSenhaModal(){
  const root = document.getElementById('modal-root');
  if(!modalAlterarSenhaAberto){ root.innerHTML=''; return; }
  root.innerHTML = `
    <div class="overlay" id="alterar-senha-overlay">
      <div class="modal">
        <div class="modal-head">
          <h3>Mudar senha</h3>
          <button id="alterar-senha-close">✕</button>
        </div>
        <div class="modal-body">
          ${currentUser && !currentUser.temSenha ? `
            <p class="settings-page-note">Esta conta ainda não tem senha (entra só com o Google). Você pode definir uma agora, se quiser.</p>
          ` : ''}
          <div class="field">
            <label>Senha atual</label>
            <input type="password" id="s-senha-atual" value="${esc(senhaAtualVal)}" placeholder="Deixe em branco se ainda não tem senha" />
          </div>
          <div class="field">
            <label>Nova senha</label>
            <input type="password" id="s-senha-nova" value="${esc(senhaNovaVal)}" placeholder="Mínimo 6 caracteres" />
          </div>
          ${senhaMsg ? `<p class="settings-page-msg ${senhaMsg.tipo}">${esc(senhaMsg.texto)}</p>` : ''}
        </div>
        <div class="modal-foot">
          <span></span>
          <div class="modal-foot-actions">
            <button class="btn-outline" id="alterar-senha-cancelar">Cancelar</button>
            <button class="btn-save" id="s-senha-salvar" ${senhaSalvando?'disabled':''}>${senhaSalvando?'Salvando…':'Salvar'}</button>
          </div>
        </div>
      </div>
    </div>
  `;
  document.getElementById('alterar-senha-close').addEventListener('click', closeAlterarSenhaModal);
  document.getElementById('alterar-senha-cancelar').addEventListener('click', closeAlterarSenhaModal);
  document.getElementById('alterar-senha-overlay').addEventListener('click', (e)=>{ if(e.target.id==='alterar-senha-overlay') closeAlterarSenhaModal(); });
  document.getElementById('s-senha-atual').addEventListener('input', (e)=> senhaAtualVal = e.target.value);
  document.getElementById('s-senha-nova').addEventListener('input', (e)=> senhaNovaVal = e.target.value);
  document.getElementById('s-senha-salvar').addEventListener('click', salvarSenha);
}

// Abre a edição de um evento do Google Agenda — diferente de editar uma tarefa,
// isso muda o evento de verdade, direto na fonte (no seu Google Agenda).
function excluirTudoDoDia(diaISO, tarefasDoDia, eventosDoDia){
  const total = tarefasDoDia.length + eventosDoDia.length;
  if(!total) return;
  const temEventos = eventosDoDia.length > 0;
  showConfirm({
    message: `Excluir ${total} item${total===1?'':'s'} desse dia?${temEventos ? ' Isso inclui excluir evento(s) direto do seu Google Agenda de verdade, não só daqui.' : ''} Essa ação não pode ser desfeita.`,
    onConfirm: async ()=>{
      closeConfirm();
      closeAgendaDiaModal();
      for(const t of tarefasDoDia){
        try{
          await apiRequest('DELETE', `/tasks/${t.id}`);
          const idx = tasks.findIndex(x=>x.id===t.id);
          if(idx>-1) tasks.splice(idx,1);
        }catch(e){ /* segue tentando os outros mesmo se um falhar */ }
      }
      agendaTarefas = agendaTarefas.filter(x => !tarefasDoDia.some(t=>t.id===x.id));
      for(const e of eventosDoDia){
        try{
          await apiRequest('DELETE', `/calendar/eventos/${e.id}`);
        }catch(err){ /* segue tentando os outros mesmo se um falhar */ }
      }
      agendaEventosGoogle = agendaEventosGoogle.filter(x => !eventosDoDia.some(e=>e.id===x.id));
      renderApp();
    },
  });
}
function openEditEventoGoogle(eventId){
  const e = agendaEventosGoogle.find(x=>x.id===eventId);
  if(!e) return;
  let data = '', hora = '';
  if(e.inicio){
    if(e.diaInteiro){
      data = e.inicio.slice(0,10);
    } else {
      const d = new Date(e.inicio);
      data = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      hora = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
    }
  }
  eventoGoogleModalForm = { eventId, titulo: e.titulo, data, hora, descricao: e.descricao||'', prioridade: e.prioridade||'media', leadId: e.leadId||'' };
  renderEventoGoogleModal();
}
function closeEventoGoogleModal(){ eventoGoogleModalForm = null; document.getElementById('modal-root').innerHTML=''; }
async function salvarEventoGoogle(){
  const f = eventoGoogleModalForm;
  if(!f || !f.titulo.trim()) return;
  try{
    await apiRequest('PUT', `/calendar/eventos/${f.eventId}`, { titulo: f.titulo, data: f.data, hora: f.hora || null, descricao: f.descricao, prioridade: f.prioridade, leadId: f.leadId || null });
    const idx = agendaEventosGoogle.findIndex(x=>x.id===f.eventId);
    if(idx>-1){
      const novoInicio = f.hora ? new Date(`${f.data}T${f.hora}`).toISOString() : f.data;
      const card = f.leadId ? board.cards.find(c=>c.id===f.leadId) : null;
      agendaEventosGoogle[idx] = { ...agendaEventosGoogle[idx], titulo:f.titulo, inicio:novoInicio, diaInteiro: !f.hora, descricao:f.descricao, prioridade:f.prioridade, leadId:f.leadId||null, clienteNome: card ? card.cliente : null };
    }
    closeEventoGoogleModal();
    renderApp();
  }catch(e){
    errorMsg = e.message || 'Não foi possível salvar o evento no Google Agenda.';
    renderApp();
  }
}
function excluirEventoGoogle(){
  const f = eventoGoogleModalForm;
  if(!f) return;
  showConfirm({
    message: 'Excluir este evento do Google Agenda? Ele será removido de verdade, na sua conta do Google — não só daqui.',
    onConfirm: async ()=>{
      closeConfirm();
      try{
        await apiRequest('DELETE', `/calendar/eventos/${f.eventId}`);
        agendaEventosGoogle = agendaEventosGoogle.filter(x=>x.id!==f.eventId);
        closeEventoGoogleModal();
        renderApp();
      }catch(e){
        errorMsg = e.message || 'Não foi possível excluir o evento.';
        renderApp();
      }
    },
  });
}
function renderEventoGoogleModal(){
  const root = document.getElementById('modal-root');
  if(!eventoGoogleModalForm){ root.innerHTML=''; return; }
  const f = eventoGoogleModalForm;

  root.innerHTML = `
    <div class="overlay" id="evento-google-modal-overlay">
      <div class="modal">
        <div class="modal-head">
          <h3>📅 Editar evento do Google Agenda</h3>
          <button id="evento-google-modal-close">✕</button>
        </div>
        <div class="modal-body">
          <div class="field">
            <label>Título</label>
            <input type="text" id="eg-titulo" value="${esc(f.titulo)}" placeholder="Ex: Ligar para cliente" />
          </div>
          <div class="field-row">
            <div class="field">
              <label>Data</label>
              <input type="date" id="eg-data" value="${f.data}" />
            </div>
            <div class="field">
              <label>Hora (opcional)</label>
              <input type="time" id="eg-hora" value="${f.hora}" />
            </div>
            <div class="field">
              <label>Prioridade</label>
              <select id="eg-prioridade">
                ${Object.entries(PRIORIDADES).map(([key,p])=>`<option value="${key}" ${f.prioridade===key?'selected':''}>${p.label}</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="field">
            <label>Lead relacionado</label>
            <select id="eg-lead">
              <option value="">Sem lead</option>
              ${board.cards.map(c=>`<option value="${c.id}" ${f.leadId===c.id?'selected':''}>${esc(c.cliente) || 'Sem nome'}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label>Descrição</label>
            <textarea id="eg-descricao" rows="3" placeholder="Detalhes do evento...">${esc(f.descricao||'')}</textarea>
          </div>
          <p class="settings-page-note">Título, data, hora e descrição mudam o evento de verdade, direto no seu Google Agenda. Prioridade e lead relacionado são exclusivos daqui do CRM — o Google não tem esses campos, então ficam guardados só aqui, amarrados a esse evento.</p>
        </div>
        <div class="modal-foot">
          <button class="delete-link" id="eg-delete">🗑 Excluir</button>
          <div class="modal-foot-actions">
            <button class="btn-outline" id="eg-cancel">Cancelar</button>
            <button class="btn-save" id="eg-save">Salvar evento</button>
          </div>
        </div>
      </div>
    </div>
  `;

  document.getElementById('evento-google-modal-close').addEventListener('click', closeEventoGoogleModal);
  document.getElementById('eg-cancel').addEventListener('click', closeEventoGoogleModal);
  document.getElementById('evento-google-modal-overlay').addEventListener('click', (e)=>{ if(e.target.id==='evento-google-modal-overlay') closeEventoGoogleModal(); });
  document.getElementById('eg-titulo').addEventListener('input', (e)=> eventoGoogleModalForm.titulo = e.target.value);
  document.getElementById('eg-data').addEventListener('change', (e)=> eventoGoogleModalForm.data = e.target.value);
  document.getElementById('eg-hora').addEventListener('change', (e)=> eventoGoogleModalForm.hora = e.target.value);
  document.getElementById('eg-prioridade').addEventListener('change', (e)=> eventoGoogleModalForm.prioridade = e.target.value);
  document.getElementById('eg-lead').addEventListener('change', (e)=> eventoGoogleModalForm.leadId = e.target.value);
  document.getElementById('eg-descricao').addEventListener('input', (e)=> eventoGoogleModalForm.descricao = e.target.value);
  document.getElementById('eg-save').addEventListener('click', salvarEventoGoogle);
  document.getElementById('eg-delete').addEventListener('click', excluirEventoGoogle);
}
function renderTaskModal(){
  const root = document.getElementById('modal-root');
  if(!taskModalForm){ root.innerHTML=''; return; }
  const f = taskModalForm;

  root.innerHTML = `
    <div class="overlay" id="task-modal-overlay">
      <div class="modal">
        <div class="modal-head">
          <h3>${f.__isNew ? 'Nova tarefa' : 'Editar tarefa'}</h3>
          <button id="task-modal-close">✕</button>
        </div>
        <div class="modal-body">
          <div class="field">
            <label>Título</label>
            <input type="text" id="t-titulo" value="${esc(f.titulo)}" placeholder="Ex: Ligar para cliente" />
          </div>
          <div class="field-row">
            <div class="field">
              <label>Vencimento</label>
              <input type="date" id="t-vencimento" value="${f.vencimento||''}" />
            </div>
            <div class="field">
              <label>Hora (opcional)</label>
              <input type="time" id="t-hora" value="${f.hora||''}" />
            </div>
            <div class="field">
              <label>Prioridade</label>
              <select id="t-prioridade">
                ${Object.entries(PRIORIDADES).map(([key,p])=>`<option value="${key}" ${f.prioridade===key?'selected':''}>${p.label}</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="field">
            <label>Lead relacionado</label>
            <select id="t-lead">
              <option value="">Sem lead</option>
              ${board.cards.map(c=>`<option value="${c.id}" ${f.leadId===c.id?'selected':''}>${esc(c.cliente) || 'Sem nome'}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label>Descrição</label>
            <textarea id="t-descricao" rows="3" placeholder="Detalhes da tarefa...">${esc(f.descricao||'')}</textarea>
          </div>
        </div>
        <div class="modal-foot">
          ${!f.__isNew ? `<button class="delete-link" id="t-delete">🗑 Excluir</button>` : '<span></span>'}
          <div class="modal-foot-actions">
            <button class="btn-outline" id="t-cancel" ${salvandoTask?'disabled':''}>Cancelar</button>
            <button class="btn-save" id="t-save" ${salvandoTask?'disabled':''}>${salvandoTask?'Salvando…':'Salvar tarefa'}</button>
          </div>
        </div>
      </div>
    </div>
  `;

  document.getElementById('task-modal-close').addEventListener('click', closeTaskModal);
  document.getElementById('t-cancel').addEventListener('click', closeTaskModal);
  document.getElementById('task-modal-overlay').addEventListener('click', (e)=>{ if(e.target.id==='task-modal-overlay') closeTaskModal(); });

  document.getElementById('t-titulo').addEventListener('input', (e)=> taskModalForm.titulo = e.target.value);
  document.getElementById('t-vencimento').addEventListener('change', (e)=> taskModalForm.vencimento = e.target.value);
  document.getElementById('t-hora').addEventListener('change', (e)=> taskModalForm.hora = e.target.value);
  document.getElementById('t-prioridade').addEventListener('change', (e)=> taskModalForm.prioridade = e.target.value);
  document.getElementById('t-lead').addEventListener('change', (e)=> taskModalForm.leadId = e.target.value);
  document.getElementById('t-descricao').addEventListener('input', (e)=> taskModalForm.descricao = e.target.value);

  document.getElementById('t-save').addEventListener('click', saveTaskFromModal);
  if(!f.__isNew){
    document.getElementById('t-delete').addEventListener('click', ()=>{
      showConfirm({
        message: 'Excluir esta tarefa? Essa ação não pode ser desfeita.',
        onConfirm: ()=>{ deleteTaskById(f.id); closeTaskModal(); closeConfirm(); },
      });
    });
  }
}

