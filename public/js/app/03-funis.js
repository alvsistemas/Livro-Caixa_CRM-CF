/* ---------- funis (múltiplos pipelines) ---------- */
async function loadFunis(){
  try{
    const data = await apiRequest('GET', '/funis');
    funis = data.funis || [];
    if((!funilAtualId || !funis.some(f=>f.id===funilAtualId)) && funis.length){
      funilAtualId = funis[0].id;
    }
  }catch(e){
    funis = [];
  }
  funisLoaded = true;
  renderApp();
}
async function criarNovoFunil(){
  try{
    const novo = await apiRequest('POST', '/funis', { nome: 'Novo funil' });
    funis.push(novo);
    funilAtualId = novo.id;
  }catch(e){
    errorMsg = 'Não foi possível criar o funil.';
  }
  renderApp();
}
async function renomearFunil(id, nome){
  const f = funis.find(x=>x.id===id);
  if(!f) return;
  const nomeFinal = nome.trim() || f.nome;
  const anterior = f.nome;
  f.nome = nomeFinal;
  renderApp();
  try{
    await apiRequest('PUT', `/funis/${id}`, { nome: nomeFinal });
  }catch(e){
    f.nome = anterior;
    errorMsg = 'Não foi possível renomear o funil.';
    renderApp();
  }
}
async function duplicarFunil(id){
  const original = funis.find(f=>f.id===id);
  try{
    const novoFunil = await apiRequest('POST', `/funis/${id}/duplicar`);
    funis.push(novoFunil);
    funilAtualId = novoFunil.id;
    await loadBoard(); // recarrega colunas/cards pra pegar as colunas novas criadas no servidor
  }catch(e){
    errorMsg = `Não foi possível duplicar o funil${original?` "${original.nome}"`:''}.`;
    renderApp();
  }
}
async function excluirFunil(id){
  const idx = funis.findIndex(f=>f.id===id);
  if(idx===-1) return;
  const [removido] = funis.splice(idx,1);
  const colunasRemovidas = board.columns.filter(c=>c.funilId===id);
  const colunaIds = new Set(colunasRemovidas.map(c=>c.id));
  const cardsRemovidos = board.cards.filter(c=>colunaIds.has(c.columnId));
  board.columns = board.columns.filter(c=>c.funilId!==id);
  board.cards = board.cards.filter(c=>!colunaIds.has(c.columnId));
  if(funilAtualId === id) funilAtualId = funis.length ? funis[0].id : null;
  renderApp();
  try{
    await apiRequest('DELETE', `/funis/${id}`);
  }catch(e){
    funis.splice(idx,0,removido);
    board.columns.push(...colunasRemovidas);
    board.cards.push(...cardsRemovidos);
    if(!funis.some(f=>f.id===funilAtualId)) funilAtualId = removido.id;
    errorMsg = 'Não foi possível excluir o funil.';
    renderApp();
  }
}

async function loadTasks(){
  try{
    const data = await apiRequest('GET', '/tasks');
    tasks = data.tasks;
  }catch(e){
    tasks = [];
  }
  tasksLoaded = true;
  renderApp();
}
function copiarTarefa(taskId, elemento){
  const t = tasks.find(x=>x.id===taskId) || agendaTarefas.find(x=>x.id===taskId);
  if(!t) return;
  tarefaCopiada = { titulo: t.titulo, prioridade: t.prioridade, leadId: t.leadId||null, descricao: t.descricao||'', hora: horaLocalDaTarefaOuNull(t.vencimento) };
  if(navigator.vibrate) navigator.vibrate(15);
  if(elemento) mostrarPopupRapido(elemento, 'Copiado');
  renderApp();
  if(agendaDiaSelecionado) renderAgendaDiaModalPreservandoScroll();
}
function copiarEvento(eventoId, elemento){
  const e = agendaEventosGoogle.find(x=>x.id===eventoId);
  if(!e) return;
  const hora = horaLocalDoEventoOuNull(e);
  tarefaCopiada = { titulo: e.titulo, prioridade: e.prioridade||'media', leadId: e.leadId||null, descricao: e.descricao||'', hora };
  if(navigator.vibrate) navigator.vibrate(15);
  if(elemento) mostrarPopupRapido(elemento, 'Copiado');
  renderApp();
  if(agendaDiaSelecionado) renderAgendaDiaModalPreservandoScroll();
}

// Extrai a hora local (HH:MM) de uma tarefa, ou null se ela não tiver horário definido —
// mesma checagem em UTC usada no resto do sistema, pra tarefa sem hora não "ganhar" hora à toa.
function horaLocalDaTarefaOuNull(vencimentoIso){
  const d = new Date(vencimentoIso);
  if(isNaN(d.getTime()) || (d.getUTCHours()===0 && d.getUTCMinutes()===0)) return null;
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}
// Mesma ideia, mas pra evento do Google — que já vem com a flag diaInteiro explícita,
// em vez de precisar inferir pela meia-noite UTC como a tarefa.
function horaLocalDoEventoOuNull(evento){
  if(evento.diaInteiro || !evento.inicio) return null;
  const d = new Date(evento.inicio);
  if(isNaN(d.getTime())) return null;
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}
// Mostra um aviso rápido (1s, some sozinho) colado em cima de um elemento —
// usado pra confirmar "copiado!" sem precisar de uma mensagem fixa na tela.
function mostrarPopupRapido(elemento, texto){
  let root = document.getElementById('popup-rapido-root');
  if(!root){
    root = document.createElement('div');
    root.id = 'popup-rapido-root';
    document.body.appendChild(root);
  }
  const rect = elemento.getBoundingClientRect();
  const el = document.createElement('div');
  el.className = 'popup-rapido';
  el.textContent = texto;
  el.style.top = `${rect.top + rect.height/2}px`;
  el.style.left = `${rect.left + rect.width/2}px`;
  root.appendChild(el);
  requestAnimationFrame(()=> el.classList.add('popup-rapido-visivel'));
  setTimeout(()=>{
    el.classList.remove('popup-rapido-visivel');
    setTimeout(()=> el.remove(), 250);
  }, 1000);
}
// Liga o gesto de copiar (botão direito no computador, apertar e segurar em touch)
// num conjunto de elementos — reaproveitado tanto nas linhas do dia quanto, antes,
// nas células do calendário mensal.
function ligarGestoDeCopiar(elementos, callback){
  elementos.forEach(el=>{
    el.addEventListener('contextmenu', (e)=>{
      e.preventDefault();
      e.stopPropagation();
      callback(el);
    });
    el.addEventListener('touchstart', ()=>{
      clearTimeout(longPressTimer);
      longPressTimer = setTimeout(()=>{
        longPressDisparou = true;
        callback(el);
      }, 550);
    }, { passive:true });
    el.addEventListener('touchend', (e)=>{ e.stopPropagation(); clearTimeout(longPressTimer); });
    el.addEventListener('touchmove', ()=> clearTimeout(longPressTimer));
    el.addEventListener('touchcancel', ()=> clearTimeout(longPressTimer));
  });
}
// Menuzinho de "Copiar" ou "Mover" — abre no clique direito (computador) ou apertar e
// segurar (toque) num dia do calendário. Usa a mesma técnica de raiz flutuante do menu
// "Mover para" do card, pra não ficar preso em nenhum overflow escondido.
function abrirMenuDia(diaISO, x, y){
  const { tarefasDoDia, eventosDoDia } = itensDoDiaAgenda(diaISO);
  if(!tarefasDoDia.length && !eventosDoDia.length) return; // dia vazio, nada pra copiar/mover
  menuDiaAberto = { diaISO, x, y };
  renderFloatingMenuDia();
}
function fecharMenuDia(){
  menuDiaAberto = null;
  renderFloatingMenuDia();
}
function renderFloatingMenuDia(){
  let root = document.getElementById('menu-dia-root');
  if(!root){
    root = document.createElement('div');
    root.id = 'menu-dia-root';
    document.body.appendChild(root);
  }
  if(!menuDiaAberto){ root.innerHTML = ''; return; }
  const { diaISO, x, y } = menuDiaAberto;
  const left = Math.min(x, window.innerWidth - 180);
  const top = Math.min(y, window.innerHeight - 100);
  root.innerHTML = `
    <div class="col-menu" style="position:fixed; top:${Math.max(4,top)}px; left:${Math.max(4,left)}px; min-width:170px;">
      <button class="col-menu-item" data-action="menu-dia-copiar">Copiar</button>
      <button class="col-menu-item" data-action="menu-dia-mover">Mover</button>
    </div>
  `;
  const cel = document.querySelector(`[data-action="abrir-dia-agenda"][data-dia="${diaISO}"]`);
  const copiarBtn = root.querySelector('[data-action="menu-dia-copiar"]');
  if(copiarBtn) copiarBtn.addEventListener('click', ()=>{ abrirChecklistDia(diaISO, 'copiar'); fecharMenuDia(); });
  const moverBtn = root.querySelector('[data-action="menu-dia-mover"]');
  if(moverBtn) moverBtn.addEventListener('click', ()=>{ abrirChecklistDia(diaISO, 'mover'); fecharMenuDia(); });
}
// Telinha de checklist — escolher exatamente quais tarefas/eventos do dia entram na
// cópia/mover, em vez de pegar tudo automaticamente.
function abrirChecklistDia(diaISO, modo){
  const { tarefasDoDia, eventosDoDia } = itensDoDiaAgenda(diaISO);
  const todosIds = [...tarefasDoDia.map(t=>t.id), ...eventosDoDia.map(e=>e.id)];
  if(!todosIds.length) return;
  checklistDiaModal = { diaISO, modo, marcados: new Set(todosIds) }; // começa com tudo marcado — desmarca o que não quiser
  renderChecklistDiaModal();
}
function fecharChecklistDia(){
  checklistDiaModal = null;
  document.getElementById('modal-root').innerHTML = '';
}
function renderChecklistDiaModal(){
  const root = document.getElementById('modal-root');
  if(!checklistDiaModal){ root.innerHTML = ''; return; }
  const { diaISO, modo, marcados } = checklistDiaModal;
  const { tarefasDoDia, eventosDoDia } = itensDoDiaAgenda(diaISO);
  const dataLabel = new Date(diaISO+'T00:00:00').toLocaleDateString('pt-BR', { weekday:'long', day:'2-digit', month:'long' });
  const itens = [
    ...tarefasDoDia.map(t=>({ id:t.id, titulo:t.titulo, hora:horaLocalDaTarefaOuNull(t.vencimento), icone:'✓' })),
    ...eventosDoDia.map(e=>({ id:e.id, titulo:e.titulo, hora:horaLocalDoEventoOuNull(e), icone:'📅' })),
  ];

  root.innerHTML = `
    <div class="overlay" id="checklist-dia-overlay">
      <div class="modal">
        <div class="modal-head">
          <h3 style="text-transform:capitalize;">${modo==='mover'?'Mover':'Copiar'} itens — ${esc(dataLabel)}</h3>
          <button id="checklist-dia-close">✕</button>
        </div>
        <div class="modal-body">
          <div class="settings-btn-row" style="margin-bottom:10px;">
            <button class="btn-outline" id="checklist-marcar-todos">Marcar todos</button>
            <button class="btn-outline" id="checklist-desmarcar-todos">Desmarcar todos</button>
          </div>
          <div class="checklist-dia-lista">
            ${itens.map(it=>`
              <label class="checklist-dia-item">
                <input type="checkbox" class="checklist-dia-checkbox" data-item-id="${it.id}" ${marcados.has(it.id)?'checked':''} />
                <span class="checklist-dia-item-texto">${it.icone} ${esc(it.titulo)}</span>
                ${it.hora ? `<span class="checklist-dia-item-hora">${it.hora}</span>` : ''}
              </label>
            `).join('')}
          </div>
        </div>
        <div class="modal-foot">
          <span></span>
          <div class="modal-foot-actions">
            <button class="btn-outline" id="checklist-dia-cancelar">Cancelar</button>
            <button class="btn-save" id="checklist-dia-confirmar" ${marcados.size===0?'disabled':''}>${modo==='mover'?'Mover':'Copiar'} ${marcados.size} item${marcados.size===1?'':'s'}</button>
          </div>
        </div>
      </div>
    </div>
  `;

  document.getElementById('checklist-dia-close').addEventListener('click', fecharChecklistDia);
  document.getElementById('checklist-dia-cancelar').addEventListener('click', fecharChecklistDia);
  document.getElementById('checklist-dia-overlay').addEventListener('click', (e)=>{ if(e.target.id==='checklist-dia-overlay') fecharChecklistDia(); });
  document.getElementById('checklist-marcar-todos').addEventListener('click', ()=>{
    itens.forEach(it=> checklistDiaModal.marcados.add(it.id));
    renderChecklistDiaModal();
  });
  document.getElementById('checklist-desmarcar-todos').addEventListener('click', ()=>{
    checklistDiaModal.marcados.clear();
    renderChecklistDiaModal();
  });
  root.querySelectorAll('.checklist-dia-checkbox').forEach(chk=>{
    chk.addEventListener('change', ()=>{
      if(chk.checked) checklistDiaModal.marcados.add(chk.dataset.itemId);
      else checklistDiaModal.marcados.delete(chk.dataset.itemId);
      renderChecklistDiaModal();
    });
  });
  const confirmarBtn = document.getElementById('checklist-dia-confirmar');
  if(confirmarBtn) confirmarBtn.addEventListener('click', ()=>{
    const marcadosFinal = new Set(checklistDiaModal.marcados);
    const cel = document.querySelector(`[data-action="abrir-dia-agenda"][data-dia="${diaISO}"]`);
    fecharChecklistDia();
    copiarDiaInteiro(diaISO, cel, modo, marcadosFinal);
  });
}
function copiarDiaInteiro(diaISO, elemento, modo, idsIncluidos){
  modo = modo || 'copiar';
  const { tarefasDoDia, eventosDoDia } = itensDoDiaAgenda(diaISO);
  const tarefasFiltradas = idsIncluidos ? tarefasDoDia.filter(t=>idsIncluidos.has(t.id)) : tarefasDoDia;
  const eventosFiltrados = idsIncluidos ? eventosDoDia.filter(e=>idsIncluidos.has(e.id)) : eventosDoDia;
  const itens = [
    ...tarefasFiltradas.map(t=>({
      id: t.id, tipo: 'tarefa', titulo: t.titulo, prioridade: t.prioridade, leadId: t.leadId||null, descricao: t.descricao||'',
      hora: horaLocalDaTarefaOuNull(t.vencimento),
    })),
    ...eventosFiltrados.map(e=>({
      id: e.id, tipo: 'evento', titulo: e.titulo, prioridade: e.prioridade||'media', leadId: e.leadId||null, descricao: e.descricao||'',
      hora: horaLocalDoEventoOuNull(e),
    })),
  ];
  if(!itens.length) return;
  diaAgendaCopiado = { origemISO: diaISO, tarefas: itens, modo };
  if(navigator.vibrate) navigator.vibrate(15);
  if(elemento) mostrarPopupRapido(elemento, `${itens.length} ${modo==='mover'?'marcado':'copiado'}${itens.length===1?'':'s'}`);
  renderApp();
}
async function colarDiaInteiroEm(diaISO, elemento){
  if(!diaAgendaCopiado || diaISO===diaAgendaCopiado.origemISO) return;
  const qtd = diaAgendaCopiado.tarefas.length;
  const modo = diaAgendaCopiado.modo || 'copiar';
  try{
    for(const t of diaAgendaCopiado.tarefas){
      if(modo==='mover'){
        // move de verdade — atualiza a data do próprio item original, sem criar cópia nem apagar nada
        if(t.tipo==='evento'){
          await apiRequest('PUT', `/calendar/eventos/${t.id}`, { titulo:t.titulo, data:diaISO, hora:t.hora||null, descricao:t.descricao, prioridade:t.prioridade, leadId:t.leadId||null });
          const idx = agendaEventosGoogle.findIndex(x=>x.id===t.id);
          if(idx>-1){
            const novoInicio = t.hora ? new Date(`${diaISO}T${t.hora}`).toISOString() : diaISO;
            agendaEventosGoogle[idx] = { ...agendaEventosGoogle[idx], inicio: novoInicio, diaInteiro: !t.hora };
          }
        } else {
          let vencimento = diaISO;
          if(t.hora){
            const combinado = new Date(`${diaISO}T${t.hora}`);
            if(!isNaN(combinado.getTime())) vencimento = combinado.toISOString();
          }
          const atualizada = await apiRequest('PUT', `/tasks/${t.id}`, { titulo:t.titulo, prioridade:t.prioridade, leadId:t.leadId, descricao:t.descricao, vencimento });
          const idxT = tasks.findIndex(x=>x.id===t.id);
          if(idxT>-1) tasks[idxT] = atualizada;
          atualizarTarefaNaAgendaLocal(atualizada);
        }
      } else {
        // copiar — vira sempre uma tarefa nova (evento copiado também vira cópia como tarefa, não duplica o evento em si)
        const dados = { titulo:t.titulo, prioridade:t.prioridade, leadId:t.leadId, descricao:t.descricao, vencimento: diaISO };
        if(t.hora){
          const combinado = new Date(`${diaISO}T${t.hora}`);
          if(!isNaN(combinado.getTime())) dados.vencimento = combinado.toISOString();
        }
        const nova = await apiRequest('POST', '/tasks', dados);
        tasks.push(nova);
        atualizarTarefaNaAgendaLocal(nova);
      }
    }
    diaAgendaCopiado = null; // colar/mover o dia só acontece uma vez — depois disso, a "área de transferência" se esvazia sozinha
    if(elemento) mostrarPopupRapido(elemento, `${qtd} ${modo==='mover'?'movido':'colado'}${qtd===1?'':'s'}`);
    renderApp();
  }catch(e){
    errorMsg = modo==='mover' ? 'Não foi possível mover pra esse dia.' : 'Não foi possível colar nesse dia.';
    renderApp();
  }
}
function cancelarTarefaCopiada(){
  tarefaCopiada = null;
  modoSelecaoMultipla = false;
  horariosSelecionados.clear();
  renderApp();
  if(agendaDiaSelecionado) renderAgendaDiaModalPreservandoScroll();
}
async function colarTarefaEm(diaISO, hora){
  if(!tarefaCopiada) return;
  const { hora: horaOriginal, ...dadosBase } = tarefaCopiada;
  const horaFinal = hora || horaOriginal; // usa a hora do horário clicado; sem isso, cai pra hora original que foi copiada
  const dados = { ...dadosBase, vencimento: diaISO };
  if(horaFinal){
    const combinado = new Date(`${diaISO}T${horaFinal}`);
    if(!isNaN(combinado.getTime())) dados.vencimento = combinado.toISOString();
  }
  try{
    const nova = await apiRequest('POST', '/tasks', dados);
    tasks.push(nova);
    atualizarTarefaNaAgendaLocal(nova);
    renderApp();
  }catch(e){
    errorMsg = 'Não foi possível colar a tarefa.';
    renderApp();
  }
  if(agendaDiaSelecionado) renderAgendaDiaModalPreservandoScroll();
}
async function colarEmHorariosSelecionados(){
  if(!tarefaCopiada || !horariosSelecionados.size || !agendaDiaSelecionado) return;
  const diaISO = agendaDiaSelecionado;
  const { hora: horaOriginal, ...dadosBase } = tarefaCopiada;
  const horarios = [...horariosSelecionados];
  for(const hora of horarios){
    const dados = { ...dadosBase, vencimento: diaISO };
    const combinado = new Date(`${diaISO}T${hora}`);
    if(!isNaN(combinado.getTime())) dados.vencimento = combinado.toISOString();
    try{
      const nova = await apiRequest('POST', '/tasks', dados);
      tasks.push(nova);
      atualizarTarefaNaAgendaLocal(nova);
    }catch(e){
      errorMsg = 'Não foi possível colar em todos os horários selecionados.';
    }
  }
  modoSelecaoMultipla = false;
  horariosSelecionados.clear();
  renderApp();
  if(agendaDiaSelecionado) renderAgendaDiaModal();
}
async function loadGerot(semana){
  gerotLoaded = false;
  renderApp();
  try{
    const data = await apiRequest('GET', `/gerot/${semana}`);
    gerotBlocos = data.blocos || [];
  }catch(e){
    gerotBlocos = [];
  }
  gerotLoaded = true;
  renderApp();
}
function mudarSemanaGerot(delta){
  const [ano,mes,dia] = gerotSemanaAtual.split('-').map(Number);
  const d = new Date(ano, mes-1, dia + delta*7);
  gerotSemanaAtual = inicioDaSemana(d);
  gerotEditor = null;
  loadGerot(gerotSemanaAtual);
}
function abrirGerotEditor(diaSemana, horario, blocoId){
  gerotSalvandoErro = null;
  if(blocoId){
    const b = gerotBlocos.find(x=>x.id===blocoId);
    if(!b) return;
    gerotEditor = { diaSemana, horarioInicio: b.horarioInicio, horarioFim: b.horarioFim, texto: b.texto, blocoId: b.id };
  } else {
    const idxInicio = GEROT_HORARIOS.indexOf(horario);
    const fimPadrao = GEROT_LIMITES[idxInicio+1] || GEROT_LIMITES[GEROT_LIMITES.length-1];
    gerotEditor = { diaSemana, horarioInicio: horario, horarioFim: fimPadrao, texto: '', blocoId: null };
  }
  renderApp();
  const input = document.getElementById('gerot-editor-texto');
  if(input) input.focus();
}
function fecharGerotEditor(){
  gerotEditor = null;
  gerotSalvandoErro = null;
  renderApp();
}
async function salvarGerotEditor(){
  if(!gerotEditor) return;
  const texto = gerotEditor.texto.trim();
  if(!texto){ gerotSalvandoErro = 'Escreva a atividade desse bloco.'; renderApp(); return; }
  try{
    const resultado = await apiRequest('PUT', '/gerot', {
      semanaInicio: gerotSemanaAtual, diaSemana: gerotEditor.diaSemana,
      horarioInicio: gerotEditor.horarioInicio, horarioFim: gerotEditor.horarioFim,
      texto, blocoId: gerotEditor.blocoId,
    });
    const idx = gerotBlocos.findIndex(b=>b.id===resultado.id);
    if(idx>-1) gerotBlocos[idx] = resultado; else gerotBlocos.push(resultado);
    gerotEditor = null;
    gerotSalvandoErro = null;
  }catch(e){
    gerotSalvandoErro = (e && e.message) || 'Não foi possível salvar esse bloco.';
  }
  renderApp();
}
async function apagarGerotEditorAtual(){
  if(!gerotEditor || !gerotEditor.blocoId) return;
  const blocoId = gerotEditor.blocoId;
  try{
    await apiRequest('DELETE', `/gerot/${blocoId}`);
    gerotBlocos = gerotBlocos.filter(b=>b.id!==blocoId);
    gerotEditor = null;
  }catch(e){
    gerotSalvandoErro = 'Não foi possível apagar esse bloco.';
  }
  renderApp();
}
function renderGerotEditorHtml(){
  const ed = gerotEditor;
  const opcoesInicio = GEROT_HORARIOS.map(h=>`<option value="${h}" ${h===ed.horarioInicio?'selected':''}>${h}</option>`).join('');
  const opcoesFim = GEROT_LIMITES.filter(h=>h>ed.horarioInicio).map(h=>`<option value="${h}" ${h===ed.horarioFim?'selected':''}>${h}</option>`).join('');
  return `
    <div class="gerot-editor">
      <p class="settings-page-subtitle">${GEROT_DIAS[ed.diaSemana]} — ${ed.blocoId?'editar bloco':'novo bloco'}</p>
      <div class="field-row-flex">
        <select id="gerot-editor-inicio">${opcoesInicio}</select>
        <span class="settings-page-note">até</span>
        <select id="gerot-editor-fim">${opcoesFim}</select>
      </div>
      <input type="text" id="gerot-editor-texto" value="${esc(ed.texto)}" placeholder="Ex: Prospecção ativa" style="margin-top:10px; width:100%;" />
      ${gerotSalvandoErro ? `<p class="settings-page-note" style="color:var(--danger);">${esc(gerotSalvandoErro)}</p>` : ''}
      <div class="field-row-flex" style="margin-top:12px;">
        <button class="btn-primary" id="gerot-editor-salvar">Salvar</button>
        <button class="btn-outline" id="gerot-editor-cancelar">Cancelar</button>
        ${ed.blocoId ? `<button class="btn-outline" id="gerot-editor-apagar" style="color:var(--danger);">Apagar bloco</button>` : ''}
      </div>
    </div>
  `;
}
function exportarGerotParaPlanilha(){
  const [ano,mes,dia] = gerotSemanaAtual.split('-').map(Number);
  const segunda = new Date(ano, mes-1, dia);
  const datasDaSemana = GEROT_DIAS.map((_,i)=>{ const d = new Date(segunda); d.setDate(d.getDate()+i); return d; });
  const grade = calcularGradeGerot();

  // monta a matriz: linha 0 é o cabeçalho (dias da semana), as demais são os horários
  const dados = [['', ...GEROT_DIAS.map((d,i)=> `${d} (${datasDaSemana[i].toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})})`)]];
  GEROT_HORARIOS.forEach(h => dados.push([h, '', '', '', '', '']));

  const merges = [];
  GEROT_DIAS.forEach((_, diaIdx)=>{
    GEROT_HORARIOS.forEach((horario, linhaIdx)=>{
      const info = grade[diaIdx][horario];
      if(info.tipo === 'inicio'){
        dados[linhaIdx+1][diaIdx+1] = info.bloco.texto; // +1 na linha pq a 0 é cabeçalho, +1 na coluna pq a 0 é o horário
        if(info.rowspan > 1){
          merges.push({ s:{ r:linhaIdx+1, c:diaIdx+1 }, e:{ r:linhaIdx+1+info.rowspan-1, c:diaIdx+1 } });
        }
      }
    });
  });

  const ws = XLSX.utils.aoa_to_sheet(dados);
  ws['!merges'] = merges;
  ws['!cols'] = [{wch:8}, {wch:24}, {wch:24}, {wch:24}, {wch:24}, {wch:24}];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'GEROT');
  XLSX.writeFile(wb, `gerot-semana-${gerotSemanaAtual}.xlsx`);
}
async function importarGerotDePlanilha(file){
  if(!file) return;
  gerotImportando = true;
  gerotImportMsg = null;
  renderApp();
  try{
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type:'array' });
    const ws = workbook.Sheets[workbook.SheetNames[0]];
    const dados = XLSX.utils.sheet_to_json(ws, { header:1, defval:'' });
    const merges = ws['!merges'] || [];

    // limpa os blocos já existentes dessa semana antes de importar, pra não dar
    // conflito de horário com o que já tinha e pra garantir que o resultado bate
    // exatamente com a planilha importada
    await Promise.all(gerotBlocos.map(b=> apiRequest('DELETE', `/gerot/${b.id}`).catch(()=>{})));

    let importados = 0, falhas = 0;
    for(let linhaIdx=1; linhaIdx<dados.length && linhaIdx<=GEROT_HORARIOS.length; linhaIdx++){
      const horarioInicio = GEROT_HORARIOS[linhaIdx-1];
      for(let diaIdx=0; diaIdx<5; diaIdx++){
        const coluna = diaIdx+1;
        const texto = ((dados[linhaIdx]||[])[coluna]||'').toString().trim();
        if(!texto) continue;
        const merge = merges.find(m=> m.s.r===linhaIdx && m.s.c===coluna);
        const horarioFim = merge ? GEROT_LIMITES[merge.e.r] : GEROT_LIMITES[linhaIdx];
        if(!horarioFim) continue; // fora do intervalo de horários válidos (08:00-19:30), ignora
        try{
          await apiRequest('PUT', '/gerot', { semanaInicio: gerotSemanaAtual, diaSemana: diaIdx, horarioInicio, horarioFim, texto });
          importados++;
        }catch(e){ falhas++; }
      }
    }
    await loadGerot(gerotSemanaAtual);
    gerotImportMsg = { tipo: falhas ? 'erro' : 'ok', texto: `${importados} bloco(s) importado(s)${falhas ? `, ${falhas} não puderam ser importados (conflito de horário)` : ''}.` };
  }catch(e){
    gerotImportMsg = { tipo:'erro', texto:'Não foi possível ler essa planilha. Confira se ela segue o mesmo formato exportado pelo sistema.' };
  }
  gerotImportando = false;
  renderApp();
}
async function copiarSemanaAnteriorGerot(){
  const [ano,mes,dia] = gerotSemanaAtual.split('-').map(Number);
  const semanaAnterior = inicioDaSemana(new Date(ano, mes-1, dia - 7));
  gerotCopiando = true;
  renderApp();
  try{
    await apiRequest('POST', '/gerot/copiar', { semanaOrigem: semanaAnterior, semanaDestino: gerotSemanaAtual });
    await loadGerot(gerotSemanaAtual);
  }catch(e){
    errorMsg = 'Não foi possível copiar a semana anterior.';
  }
  gerotCopiando = false;
  renderApp();
}
async function loadAgendaMes(mesKey){
  agendaLoaded = false;
  renderApp();
  try{
    const data = await apiRequest('GET', `/calendar/agenda-mes?mes=${mesKey}`);
    agendaTarefas = data.tarefas || [];
    agendaEventosGoogle = data.eventosGoogle || [];
  }catch(e){
    errorMsg = e.message || 'Não foi possível carregar a agenda.';
    agendaTarefas = [];
    agendaEventosGoogle = [];
  }
  agendaLoaded = true;
  renderApp();
}
function mudarMesAgenda(delta){
  const [ano, mes] = agendaMesAtual.split('-').map(Number);
  const d = new Date(ano, mes - 1 + delta, 1);
  agendaMesAtual = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
  agendaDiaDestacado = null;
  loadAgendaMes(agendaMesAtual);
}
// Extrai a data (YYYY-MM-DD) certa do vencimento de uma tarefa, em horário local —
// mesma lógica usada em openEditTask, pra tarefa com horário não "vazar" pro dia
// seguinte por causa do UTC.
function dataLocalDaTarefa(vencimentoIso){
  if(!vencimentoIso) return null;
  const d = new Date(vencimentoIso);
  if(isNaN(d.getTime())) return null;
  const temHora = d.getUTCHours()!==0 || d.getUTCMinutes()!==0;
  if(temHora) return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  return vencimentoIso.slice(0,10);
}
// Atualiza (ou remove) uma tarefa direto no estado local da Agenda, sem precisar
// buscar tudo de novo no servidor — evita uma ida desnecessária ao Google Agenda
// (que só deveria acontecer quando a pessoa clica em "Sincronizar Agenda" de propósito).
function atualizarTarefaNaAgendaLocal(t){
  if(!t.vencimento || !agendaMesAtual) return;
  const mesDaTarefa = dataLocalDaTarefa(t.vencimento).slice(0,7);
  const idx = agendaTarefas.findIndex(x=>x.id===t.id);
  if(mesDaTarefa !== agendaMesAtual){
    if(idx>-1) agendaTarefas.splice(idx,1); // mudou pra fora do mês em tela — some da visão atual
    return;
  }
  const card = t.leadId ? board.cards.find(c=>c.id===t.leadId) : null;
  const comNome = { ...t, clienteNome: card ? card.cliente : null };
  if(idx>-1) agendaTarefas[idx] = comNome;
  else agendaTarefas.push(comNome);
}
function removerTarefaDaAgendaLocal(id){
  agendaTarefas = agendaTarefas.filter(x=>x.id!==id);
}
function itensDoDiaAgenda(diaISO){
  const tarefasDoDia = agendaTarefas.filter(t=> dataLocalDaTarefa(t.vencimento)===diaISO);
  const eventosDoDia = agendaEventosGoogle.filter(e=> e.inicio && e.inicio.slice(0,10)===diaISO);
  return { tarefasDoDia, eventosDoDia };
}
async function loadContratos(){
  try{
    const data = await apiRequest('GET', '/comissoes');
    contratos = data.contratos;
  }catch(e){
    contratos = [];
  }
  contratosLoaded = true;
  renderApp();
}
// Regras de comissão (engrenagem em Comissões) — na 1ª vez, o servidor já cria as
// regras padrão (Imóvel, Veículo, Investimento, Serviços, Home Equity, Car Equity)
// com a mesma matemática que sempre existiu, então nada muda pra quem nunca mexer nisso.
async function loadRegrasComissao(){
  try{
    const data = await apiRequest('GET', '/regras-comissao');
    regrasComissao = data.regras;
  }catch(e){
    regrasComissao = [];
  }
  regrasComissaoLoaded = true;
  renderApp();
}

