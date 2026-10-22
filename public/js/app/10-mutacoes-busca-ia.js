/* ---------- mutações: colunas e cards (cada uma fala com a API) ---------- */
// Anima os cards deslizando pra nova posição em vez de "pularem" — como a página é
// redesenhada por completo a cada ação (o jeito como o app inteiro funciona), o
// elemento antigo é destruído e um novo nasce direto na posição final. Pra dar a
// sensação de movimento mesmo assim, guardamos onde cada card estava ANTES de
// redesenhar; depois, no card novo (já na posição certa), aplicamos um deslocamento
// que o faz parecer que ainda está na posição antiga, e removemos esse deslocamento
// com uma transição suave — o efeito visual é de o card escorregando até o lugar novo.
function capturarPosicoes(seletor){
  const posicoes = new Map();
  document.querySelectorAll(seletor).forEach(el=>{
    posicoes.set(el.dataset.cardId || el.dataset.colId, el.getBoundingClientRect());
  });
  return posicoes;
}
function animarComFlip(seletor, posicoesAntigas, idParaExcluir){
  document.querySelectorAll(seletor).forEach(el=>{
    const chave = el.dataset.cardId || el.dataset.colId;
    if(idParaExcluir && chave===idParaExcluir) return; // esse aqui vai ganhar sua própria animação (fade), não o deslize
    const antiga = posicoesAntigas.get(chave);
    if(!antiga) return; // elemento novo (não existia antes) — nasce direto no lugar, sem animação
    const nova = el.getBoundingClientRect();
    const dx = antiga.left - nova.left;
    const dy = antiga.top - nova.top;
    if(Math.abs(dx) < 1 && Math.abs(dy) < 1) return; // não mudou de lugar de verdade
    el.style.transition = 'none';
    el.style.transform = `translate(${dx}px, ${dy}px)`;
    requestAnimationFrame(()=>{
      el.style.transition = 'transform .28s ease';
      el.style.transform = '';
      setTimeout(()=>{ el.style.transition = ''; }, 300); // devolve o controle pra transição normal do CSS (sombra, opacidade, margem)
    });
  });
}
function capturarPosicoesDosCards(){ return capturarPosicoes('.card[data-card-id]'); }
async function moveCard(cardId, columnId, ordem){
  const card = board.cards.find(c=>c.id===cardId);
  if(!card) return;
  if(card.columnId===columnId && ordem===undefined) return; // mesma coluna e sem posição nova pra aplicar — nada a fazer
  const anterior = { columnId: card.columnId, ordem: card.ordem };

  // guarda a posição vertical de origem, pra comparar com a de chegada depois do
  // redesenho e decidir a direção certa da animação (pra cima, pra baixo, ou parado)
  const elAntigo = document.querySelector(`.card[data-card-id="${cardId}"]`);
  const topAntigo = elAntigo ? elAntigo.getBoundingClientRect().top : null;
  if(elAntigo){
    elAntigo.classList.add('card-saindo'); // fade simples na saída — a direção certa só dá pra saber depois, na chegada
    await new Promise(resolve=> setTimeout(resolve, 150));
  }

  const posicoesAntigas = capturarPosicoesDosCards();
  card.columnId = columnId; // otimista
  if(ordem!==undefined) card.ordem = ordem;
  renderAppPreservandoScroll();
  animarComFlip('.card[data-card-id]', posicoesAntigas, cardId); // desliza os outros cards que abriram espaço; o card movido fica de fora, ganha a animação de chegada abaixo

  const elNovo = document.querySelector(`.card[data-card-id="${cardId}"]`);
  if(elNovo){
    const topNovo = elNovo.getBoundingClientRect().top;
    if(topAntigo==null || Math.abs(topNovo - topAntigo) < 6){
      elNovo.classList.add('card-chegando'); // não mudou de posição vertical de forma perceptível — só fade
    } else if(topNovo < topAntigo){
      elNovo.classList.add('card-chegando-cima'); // subiu — entra vindo de baixo pra cima
    } else {
      elNovo.classList.add('card-chegando-baixo'); // desceu — entra vindo de cima pra baixo
    }
  }

  try{
    const dados = { columnId };
    if(ordem!==undefined) dados.ordem = ordem;
    await apiRequest('PUT', `/cards/${cardId}/move`, dados);
  }catch(e){
    card.columnId = anterior.columnId;
    card.ordem = anterior.ordem;
    errorMsg = 'Não foi possível mover o cliente. Tente novamente.';
    renderAppPreservandoScroll();
  }
}
// Calcula em que posição um card deve entrar dentro de uma coluna, olhando pra qual
// altura (y) o dedo/mouse está — encontra os dois cards vizinhos naquele ponto e usa o
// valor do meio entre as ordens deles, sem precisar reajustar a ordem de mais ninguém.
// Usada tanto pra mostrar o indicador visual (durante o arrastar) quanto pra calcular
// a ordem de verdade (ao soltar) — as duas usam exatamente a mesma lógica, garantindo
// que o que aparece na tela bate com o que realmente vai acontecer ao soltar.
function encontrarIndiceDeInsercao(cardEls, y){
  let indiceInsercao = cardEls.length;
  for(let i=0;i<cardEls.length;i++){
    const rect = cardEls[i].getBoundingClientRect();
    if(y < rect.top + rect.height/2){ indiceInsercao = i; break; }
  }
  return indiceInsercao;
}
function calcularOrdemDeInsercao(colEl, y, cardIdSendoMovido){
  const cardEls = [...colEl.querySelectorAll('.card')].filter(el=> el.dataset.cardId !== cardIdSendoMovido);
  if(!cardEls.length) return 1000;
  // zera qualquer resto de transform/transição de uma animação de deslize anterior
  // que ainda possa estar em andamento — sem isso, a posição lida pode ser a de
  // um quadro intermediário da animação, não a posição final de descanso do card.
  cardEls.forEach(el=>{ el.style.transition = 'none'; el.style.transform = ''; });
  const indiceInsercao = encontrarIndiceDeInsercao(cardEls, y);
  const cardAntes = indiceInsercao > 0 ? board.cards.find(c=>c.id===cardEls[indiceInsercao-1].dataset.cardId) : null;
  const cardDepois = indiceInsercao < cardEls.length ? board.cards.find(c=>c.id===cardEls[indiceInsercao].dataset.cardId) : null;
  const ordemAntes = cardAntes ? (cardAntes.ordem||0) : null;
  const ordemDepois = cardDepois ? (cardDepois.ordem||0) : null;
  if(ordemAntes!=null && ordemDepois!=null) return (ordemAntes + ordemDepois) / 2;
  if(ordemAntes!=null) return ordemAntes + 1000;
  if(ordemDepois!=null) return ordemDepois - 1000;
  return 1000;
}
// Mostra visualmente onde o card vai encaixar — abre um espaço acima do card que ficaria
// logo depois dele (ou embaixo do último, se for pro final da lista), imitando o efeito
// de "os cards se abrem" pedido: um sobe, o espaço aparece, o card entra ali.
function mostrarIndicadorDeInsercao(colEl, y, cardIdSendoMovido){
  limparIndicadorDeInsercao();
  const cardEls = [...colEl.querySelectorAll('.card')].filter(el=> el.dataset.cardId !== cardIdSendoMovido);
  if(!cardEls.length) return;
  const indiceInsercao = encontrarIndiceDeInsercao(cardEls, y);
  if(indiceInsercao < cardEls.length) cardEls[indiceInsercao].classList.add('card-indicador-antes');
  else cardEls[cardEls.length-1].classList.add('card-indicador-depois');
}
function limparIndicadorDeInsercao(){
  document.querySelectorAll('.card-indicador-antes, .card-indicador-depois').forEach(el=>{
    el.classList.remove('card-indicador-antes', 'card-indicador-depois');
  });
}

async function deleteCardById(id){
  const idx = board.cards.findIndex(c=>c.id===id);
  if(idx===-1) return;
  const [removido] = board.cards.splice(idx,1);
  renderApp();
  try{
    await apiRequest('DELETE', `/cards/${id}`);
  }catch(e){
    board.cards.splice(idx,0,removido);
    errorMsg = 'Não foi possível excluir o cliente.';
    renderApp();
  }
}

function toggleSelecaoLead(id){
  if(leadsSelecionados.has(id)) leadsSelecionados.delete(id);
  else leadsSelecionados.add(id);
  renderApp();
}
function toggleSelecionarTodosLeads(idsVisiveis){
  const todosJaSelecionados = idsVisiveis.length>0 && idsVisiveis.every(id=>leadsSelecionados.has(id));
  if(todosJaSelecionados) idsVisiveis.forEach(id=>leadsSelecionados.delete(id));
  else idsVisiveis.forEach(id=>leadsSelecionados.add(id));
  renderApp();
}
async function bulkMoverLeads(columnId){
  if(!columnId || !leadsSelecionados.size) return;
  const ids = [...leadsSelecionados];
  leadsSelecionados.clear();
  renderApp();
  await Promise.all(ids.map(id=> moveCard(id, columnId)));
}
async function bulkTransferirLeads(destinoId){
  const ids = [...leadsSelecionados];
  if(!ids.length) return;
  try{
    const r = await apiRequest('POST', '/cards/transferir-lote', { ids, atribuirParaId: destinoId });
    const feitos = new Set(r.ids || []);
    board.cards = board.cards.filter(c=>!feitos.has(c.id));
    leadsSelecionados.clear();
    equipeMsg = { tipo:'ok', texto: `${r.transferidos} lead(s) enviado(s) para ${r.destinoNome}.` };
    errorMsg = null;
  }catch(e){
    errorMsg = e.message || 'Não foi possível passar os leads.';
  }
  renderApp();
}
async function bulkArquivarLeads(){
  const ids = [...leadsSelecionados];
  leadsSelecionados.clear();
  renderApp();
  await Promise.all(ids.map(async (id)=>{
    try{
      const atualizado = await apiRequest('PUT', `/cards/${id}/arquivar`);
      const idx = board.cards.findIndex(c=>c.id===id);
      if(idx>-1) board.cards[idx] = atualizado;
    }catch(e){ /* segue tentando os outros mesmo se um falhar */ }
  }));
  renderApp();
}
async function bulkExcluirLeads(){
  const ids = [...leadsSelecionados];
  leadsSelecionados.clear();
  for(const id of ids) await deleteCardById(id);
}
function confirmarBulkEtiqueta(){
  const valor = leadsBulkEtiquetaValor;
  leadsBulkEtiquetaAberta = false;
  leadsBulkEtiquetaValor = '';
  bulkEtiquetaLeads(valor);
}
async function bulkEtiquetaLeads(etiqueta){
  if(!etiqueta.trim()) return;
  const ids = [...leadsSelecionados];
  leadsSelecionados.clear();
  renderApp();
  await Promise.all(ids.map(async (id)=>{
    const card = board.cards.find(c=>c.id===id);
    if(!card) return;
    const etiquetasAtuais = card.etiquetas || [];
    if(etiquetasAtuais.includes(etiqueta.trim())) return;
    const novasEtiquetas = [...etiquetasAtuais, etiqueta.trim()];
    try{
      await apiRequest('PUT', `/cards/${id}`, { etiquetas: novasEtiquetas });
      card.etiquetas = novasEtiquetas;
    }catch(e){ /* segue tentando os outros mesmo se um falhar */ }
  }));
  renderApp();
}

async function renameColumn(id, nome){
  const col = board.columns.find(c=>c.id===id);
  if(!col) return;
  const nomeFinal = nome.trim() || col.nome;
  const anterior = col.nome;
  col.nome = nomeFinal;
  renderApp();
  try{
    await apiRequest('PUT', `/columns/${id}`, { nome: nomeFinal });
  }catch(e){
    col.nome = anterior;
    errorMsg = 'Não foi possível renomear a coluna.';
    renderApp();
  }
}

async function changeTipo(id, tipo){
  const col = board.columns.find(c=>c.id===id);
  if(!col) return;
  const anterior = col.tipo;
  col.tipo = tipo;
  openMenuColId = null;
  renderApp();
  try{
    await apiRequest('PUT', `/columns/${id}`, { tipo });
  }catch(e){
    col.tipo = anterior;
    errorMsg = 'Não foi possível alterar o tipo da coluna.';
    renderApp();
  }
}
async function salvarProbabilidadeColuna(id, valor){
  const col = board.columns.find(c=>c.id===id);
  if(!col) return;
  const nova = Math.max(0, Math.min(100, parseInt(valor,10) || 0));
  const anterior = col.probabilidade;
  if(nova === anterior) return;
  col.probabilidade = nova;
  renderApp();
  try{
    await apiRequest('PUT', `/columns/${id}`, { probabilidade: nova });
  }catch(e){
    col.probabilidade = anterior;
    errorMsg = 'Não foi possível salvar a probabilidade.';
    renderApp();
  }
}

async function deleteColumnById(id){
  const colIdx = board.columns.findIndex(c=>c.id===id);
  if(colIdx===-1) return;
  const [colRemovida] = board.columns.splice(colIdx,1);
  const cardsRemovidos = board.cards.filter(c=>c.columnId===id);
  board.cards = board.cards.filter(c=>c.columnId!==id);
  openMenuColId = null;
  renderApp();
  try{
    await apiRequest('DELETE', `/columns/${id}`);
  }catch(e){
    board.columns.splice(colIdx,0,colRemovida);
    board.cards.push(...cardsRemovidos);
    errorMsg = 'Não foi possível excluir a coluna.';
    renderApp();
  }
}

async function reorderColumns(draggedId, targetId){
  if(draggedId === targetId) return;
  const doFunil = board.columns.filter(c=>c.funilId===funilAtualId);
  const outras = board.columns.filter(c=>c.funilId!==funilAtualId);
  const fromIdx = doFunil.findIndex(c=>c.id===draggedId);
  const toIdx = doFunil.findIndex(c=>c.id===targetId);
  if(fromIdx===-1 || toIdx===-1) return;
  const anterior = [...board.columns];
  const posicoesAntigas = capturarPosicoes('.column[data-col-id]');
  const [movida] = doFunil.splice(fromIdx,1);
  doFunil.splice(toIdx,0,movida);
  board.columns = [...outras, ...doFunil];
  renderApp();
  animarComFlip('.column[data-col-id]', posicoesAntigas);
  try{
    await Promise.all(doFunil.map((col,idx)=> apiRequest('PUT', `/columns/${col.id}`, { ordem: idx })));
  }catch(e){
    board.columns = anterior;
    errorMsg = 'Não foi possível reordenar as colunas.';
    renderApp();
  }
}

async function addColumn(){
  const nome = newColNameVal.trim();
  const tipoEl = document.getElementById('new-col-tipo');
  const tipo = tipoEl ? tipoEl.value : 'aberto';
  addingCol = false;
  newColNameVal = '';
  newColTipoVal = 'aberto';
  if(!nome || !funilAtualId){ renderApp(); return; }
  try{
    const novaCol = await apiRequest('POST', '/columns', { nome, tipo, funilId: funilAtualId });
    board.columns.push(novaCol);
    renderApp();
    abrirPickerLeadsParaColuna(novaCol.id);
    return;
  }catch(e){
    errorMsg = 'Não foi possível criar a coluna.';
  }
  renderApp();
}

/* ---------- modo gestor: passar o lead pra outra pessoa da equipe ---------- */
function podeAtribuirLeads(){
  return !!(equipe && equipe.souSupervisor && (equipe.membros||[]).some(m=>!m.souEu));
}

async function saveCardFromModal(){
  if(salvandoCard) return; // já tem um salvamento em andamento — ignora cliques repetidos
  const nomeFinal = (modalForm.tipoPessoa==='juridica' ? modalForm.clienteJuridica : modalForm.clienteFisica) || '';
  if(!nomeFinal.trim()) return;
  const eraNovo = modalForm.__isNew;
  const { __isNew, id, clienteFisica, clienteJuridica, __modoGestor, __atribuirParaId, ...dados } = modalForm;
  dados.cliente = nomeFinal.trim();
  // modo gestor: precisa escolher pra quem vai o lead
  const atribuindo = !!(__modoGestor && podeAtribuirLeads());
  if(atribuindo){
    if(!__atribuirParaId){
      errorMsg = 'Escolha para quem vai o lead.';
      renderModal();
      renderApp();
      return;
    }
    dados.atribuirParaId = __atribuirParaId;
  }
  salvandoCard = true;
  renderModal();
  let nomeDestino = null;
  try{
    if(__isNew){
      const novoCard = await apiRequest('POST', '/cards', dados);
      if(novoCard && novoCard.transferido){
        nomeDestino = novoCard.atribuidoParaNome; // o lead foi pra conta de outra pessoa: não entra no pipeline daqui
      } else {
        board.cards.push(novoCard);
      }
    } else {
      const atualizado = await apiRequest('PUT', `/cards/${id}`, dados);
      const idx = board.cards.findIndex(c=>c.id===id);
      if(atualizado && atualizado.transferido){
        nomeDestino = atualizado.atribuidoParaNome;
        if(idx>-1) board.cards.splice(idx, 1); // saiu do meu pipeline
      } else if(idx>-1){
        board.cards[idx] = atualizado;
      }
    }
    salvandoCard = false;
    if(eraNovo || nomeDestino){
      // mostra "Novo lead adicionado" por cima do botão (fade in, sobe um pouco, fade
      // out) antes de fechar — assim a pessoa vê claramente que salvou, em vez de só
      // sumir a tela de repente sem confirmação nenhuma.
      mensagemSalvoCard = nomeDestino ? `Lead enviado para ${nomeDestino}` : 'Novo lead adicionado';
      renderModal();
      await new Promise(resolve=> setTimeout(resolve, 1300));
      mensagemSalvoCard = null;
    }
    closeModal();
    renderApp();
  }catch(e){
    salvandoCard = false;
    errorMsg = atribuindo && e && e.message ? e.message : 'Não foi possível salvar o cliente.';
    renderModal();
    renderApp();
  }
}

/* ---------- mutações: tarefas ---------- */
async function saveTaskFromModal(){
  if(salvandoTask) return; // já tem um salvamento em andamento — ignora cliques repetidos
  if(!taskModalForm.titulo.trim()) return;
  const { __isNew, id, hora, ...dados } = taskModalForm;
  if(!dados.leadId) dados.leadId = null;
  if(dados.vencimento && hora){
    const combinado = new Date(`${dados.vencimento}T${hora}`);
    if(!isNaN(combinado.getTime())) dados.vencimento = combinado.toISOString();
  }
  salvandoTask = true;
  renderTaskModal();
  try{
    if(__isNew){
      const nova = await apiRequest('POST', '/tasks', dados);
      tasks.push(nova);
      atualizarTarefaNaAgendaLocal(nova);
    } else {
      const atualizada = await apiRequest('PUT', `/tasks/${id}`, dados);
      const idx = tasks.findIndex(t=>t.id===id);
      if(idx>-1) tasks[idx] = atualizada;
      atualizarTarefaNaAgendaLocal(atualizada);
    }
    salvandoTask = false;
    closeTaskModal();
  }catch(e){
    salvandoTask = false;
    errorMsg = 'Não foi possível salvar a tarefa.';
    renderTaskModal();
  }
  renderApp();
}

async function deleteTaskById(id){
  const idx = tasks.findIndex(t=>t.id===id);
  if(idx===-1) return;
  const [removida] = tasks.splice(idx,1);
  removerTarefaDaAgendaLocal(id);
  renderApp();
  try{
    await apiRequest('DELETE', `/tasks/${id}`);
  }catch(e){
    tasks.splice(idx,0,removida);
    atualizarTarefaNaAgendaLocal(removida);
    errorMsg = 'Não foi possível excluir a tarefa.';
    renderApp();
  }
}

async function toggleTaskConcluida(id){
  const task = tasks.find(t=>t.id===id);
  const taskAgenda = agendaTarefas.find(t=>t.id===id);
  if(!task && !taskAgenda) return;
  if(task) task.concluida = !task.concluida; // otimista
  if(taskAgenda) taskAgenda.concluida = task ? task.concluida : !taskAgenda.concluida;
  renderApp();
  try{
    const atualizada = await apiRequest('PUT', `/tasks/${id}/toggle`);
    const idx = tasks.findIndex(t=>t.id===id);
    if(idx>-1) tasks[idx] = atualizada;
    if(taskAgenda) taskAgenda.concluida = atualizada.concluida;
  }catch(e){
    if(task) task.concluida = !task.concluida;
    if(taskAgenda) taskAgenda.concluida = !taskAgenda.concluida;
    errorMsg = 'Não foi possível atualizar a tarefa.';
    renderApp();
  }
}
async function toggleEventoConcluido(id){
  const evento = agendaEventosGoogle.find(e=>e.id===id);
  if(!evento) return;
  evento.concluida = !evento.concluida; // otimista
  renderApp();
  try{
    const atualizado = await apiRequest('PUT', `/calendar/eventos/${id}/toggle`);
    evento.concluida = atualizado.concluida;
  }catch(e){
    evento.concluida = !evento.concluida;
    errorMsg = 'Não foi possível atualizar o evento.';
  }
  renderApp();
}

/* ---------- mutações: comissões ---------- */
async function saveContratoFromModal(){
  const f = contratoModalForm;
  if(!f.desc.trim() || !f.creditoValor) return;
  const dados = { desc: f.desc, scope: f.scope, date: f.date, creditoValor: f.creditoValor, tipoCarta: f.tipoCarta };
  try{
    if(f.__isNew){
      const novo = await apiRequest('POST', '/comissoes', dados);
      contratos.unshift(novo);
    } else {
      const atualizado = await apiRequest('PUT', `/comissoes/${f.id}`, dados);
      const idx = contratos.findIndex(c=>c.id===f.id);
      if(idx>-1) contratos[idx] = atualizado;
    }
    closeContratoModal();
  }catch(e){
    errorMsg = 'Não foi possível salvar o contrato.';
  }
  renderApp();
}
async function deleteContratoById(id){
  const idx = contratos.findIndex(c=>c.id===id);
  if(idx===-1) return;
  const [removido] = contratos.splice(idx,1);
  renderApp();
  try{
    await apiRequest('DELETE', `/comissoes/${id}`);
  }catch(e){
    contratos.splice(idx,0,removido);
    errorMsg = 'Não foi possível excluir o contrato.';
    renderApp();
  }
}
async function cancelarContrato(id){
  const c = contratos.find(x=>x.id===id);
  if(!c) return;
  const anterior = c.canceladoNoMes;
  c.canceladoNoMes = comissoesMonth; // usa o mês que está sendo visto na página como referência
  renderApp();
  try{
    const atualizado = await apiRequest('PUT', `/comissoes/${id}`, { canceladoNoMes: comissoesMonth });
    const idx = contratos.findIndex(x=>x.id===id);
    if(idx>-1) contratos[idx] = atualizado;
  }catch(e){
    c.canceladoNoMes = anterior;
    errorMsg = 'Não foi possível cancelar o contrato.';
  }
  renderApp();
}
async function reativarContrato(id){
  const c = contratos.find(x=>x.id===id);
  if(!c) return;
  const anterior = c.canceladoNoMes;
  c.canceladoNoMes = null;
  renderApp();
  try{
    const atualizado = await apiRequest('PUT', `/comissoes/${id}`, { canceladoNoMes: null });
    const idx = contratos.findIndex(x=>x.id===id);
    if(idx>-1) contratos[idx] = atualizado;
  }catch(e){
    c.canceladoNoMes = anterior;
    errorMsg = 'Não foi possível reativar o contrato.';
  }
  renderApp();
}

/* ---------- 2FA (verificação em duas etapas) ---------- */
function renderSecao2FA(){
  if(twoFactorSetup){
    return `
      <p class="settings-page-note">Escaneie o QR code com seu app autenticador (Google Authenticator, Authy, etc.) e digite o código gerado pra confirmar.</p>
      <div id="qrcode-2fa" style="margin:12px 0;"></div>
      <p class="settings-page-note">Ou digite manualmente: <code>${esc(twoFactorSetup.segredo)}</code></p>
      <div class="field">
        <label>Código de 6 dígitos</label>
        <input type="text" id="twofa-confirmar-codigo" maxlength="6" inputmode="numeric" placeholder="000000" />
      </div>
      ${twoFactorMsg ? `<p class="settings-page-msg ${twoFactorMsg.tipo}">${esc(twoFactorMsg.texto)}</p>` : ''}
      <div class="settings-btn-row">
        <button class="btn-outline" id="twofa-cancelar-setup">Cancelar</button>
        <button class="btn-primary" id="twofa-confirmar" ${twoFactorSalvando?'disabled':''}>${twoFactorSalvando?'Confirmando…':'Confirmar e ativar'}</button>
      </div>
    `;
  }
  if(currentUser && currentUser.twoFactorEnabled){
    return `
      <p class="settings-page-note">✓ Ativada — um código do seu app autenticador é pedido a cada login.</p>
      ${!mostrarDesativar2FA ? `
        <button class="btn-danger" id="twofa-mostrar-desativar">Desativar</button>
      ` : `
        <div class="field">
          <label>Digite o código atual pra confirmar</label>
          <input type="text" id="twofa-desativar-codigo" maxlength="6" inputmode="numeric" placeholder="000000" />
        </div>
        ${twoFactorMsg ? `<p class="settings-page-msg ${twoFactorMsg.tipo}">${esc(twoFactorMsg.texto)}</p>` : ''}
        <div class="settings-btn-row">
          <button class="btn-outline" id="twofa-cancelar-desativar">Cancelar</button>
          <button class="btn-danger" id="twofa-confirmar-desativar" ${twoFactorSalvando?'disabled':''}>${twoFactorSalvando?'Desativando…':'Confirmar desativação'}</button>
        </div>
      `}
    `;
  }
  return `
    <p class="settings-page-note">Desativada — adicione uma camada extra de segurança exigindo um código do celular a cada login.</p>
    <button class="btn-outline" id="twofa-iniciar">Ativar</button>
  `;
}
function renderizarQrCode2FA(){
  const el = document.getElementById('qrcode-2fa');
  if(el && twoFactorSetup && window.QRCode){
    el.innerHTML = '';
    new QRCode(el, { text: twoFactorSetup.otpauthUri, width:180, height:180 });
  }
}
async function iniciar2FA(){
  twoFactorMsg = null;
  try{
    const data = await apiRequest('POST', '/auth/2fa/iniciar');
    twoFactorSetup = { segredo: data.segredo, otpauthUri: data.otpauthUri };
  }catch(e){
    errorMsg = e.message || 'Não foi possível iniciar a configuração do 2FA.';
  }
  renderApp();
  renderizarQrCode2FA();
}
function cancelarSetup2FA(){
  twoFactorSetup = null;
  twoFactorMsg = null;
  renderApp();
}
async function confirmar2FA(){
  const input = document.getElementById('twofa-confirmar-codigo');
  const codigo = input ? input.value.trim() : '';
  twoFactorSalvando = true;
  twoFactorMsg = null;
  renderApp();
  try{
    await apiRequest('POST', '/auth/2fa/confirmar', { codigo });
    await refreshCurrentUser();
    twoFactorSetup = null;
    twoFactorMsg = null;
  }catch(e){
    twoFactorMsg = { tipo:'erro', texto: e.message || 'Código incorreto.' };
  }
  twoFactorSalvando = false;
  renderApp();
  renderizarQrCode2FA();
}
async function desativar2FA(){
  const input = document.getElementById('twofa-desativar-codigo');
  const codigo = input ? input.value.trim() : '';
  twoFactorSalvando = true;
  twoFactorMsg = null;
  renderApp();
  try{
    await apiRequest('POST', '/auth/2fa/desativar', { codigo });
    await refreshCurrentUser();
    mostrarDesativar2FA = false;
    twoFactorMsg = null;
  }catch(e){
    twoFactorMsg = { tipo:'erro', texto: e.message || 'Código incorreto.' };
  }
  twoFactorSalvando = false;
  renderApp();
}
async function loadAuditoria(){
  try{
    const data = await apiRequest('GET', '/auditoria');
    auditoriaEventos = data.eventos || [];
  }catch(e){
    auditoriaEventos = [];
  }
  auditoriaCarregada = true;
  renderApp();
}

/* ---------- mutações: senha e importação de leads ---------- */
async function salvarNome(){
  const nome = nomeNovoVal.trim();
  if(!nome){
    nomeMsg = { tipo:'erro', texto:'Digite um nome.' };
    renderApp();
    if(modalAlterarNomeAberto) renderAlterarNomeModal();
    return;
  }
  nomeSalvando = true;
  nomeMsg = null;
  renderApp();
  if(modalAlterarNomeAberto) renderAlterarNomeModal();
  try{
    await apiRequest('PUT', '/auth/nome', { nome });
    nomeMsg = { tipo:'ok', texto:'Nome atualizado.' };
    await refreshCurrentUser();
  }catch(e){
    nomeMsg = { tipo:'erro', texto: e.message || 'Não foi possível atualizar o nome.' };
  }
  nomeSalvando = false;
  renderApp();
  if(modalAlterarNomeAberto) renderAlterarNomeModal();
}
/* ---------- busca global (Ctrl+K) ---------- */
function abrirBuscaGlobal(){
  buscaGlobalAberta = true;
  buscaGlobalTexto = '';
  renderBuscaGlobalModal();
  setTimeout(()=>{ const el = document.getElementById('busca-global-input'); if(el) el.focus(); }, 0);
}
function closeBuscaGlobal(){
  buscaGlobalAberta = false;
  document.getElementById('modal-root').innerHTML = '';
}
function renderBuscaGlobalModal(){
  const root = document.getElementById('modal-root');
  if(!buscaGlobalAberta){ root.innerHTML=''; return; }
  const termo = buscaGlobalTexto.trim().toLowerCase();
  let leadsResultado = [];
  let tarefasResultado = [];
  if(termo){
    leadsResultado = board.cards.filter(c=>
      (c.cliente||'').toLowerCase().includes(termo) || (c.telefone||'').includes(termo)
    ).slice(0,8);
    tarefasResultado = tasks.filter(t=> (t.titulo||'').toLowerCase().includes(termo)).slice(0,8);
  }
  root.innerHTML = `
    <div class="overlay" id="busca-global-overlay">
      <div class="modal modal-lg busca-global-modal">
        <div class="busca-global-input-row">
          ${ICON_BUSCA}
          <input type="text" id="busca-global-input" placeholder="Buscar cliente ou tarefa..." value="${esc(buscaGlobalTexto)}" />
          <button id="busca-global-close" title="Fechar (Esc)">✕</button>
        </div>
        <div class="busca-global-resultados">
          ${!termo ? `<p class="settings-page-note" style="padding:16px;">Digite pra buscar clientes e tarefas. Atalho: Ctrl+K (ou ⌘K no Mac).</p>` : `
            ${leadsResultado.length ? `
              <div class="busca-global-grupo-titulo">Clientes</div>
              ${leadsResultado.map(c=>`
                <button type="button" class="busca-global-item" data-action="busca-global-abrir-lead" data-card-id="${c.id}">
                  <span class="busca-global-item-nome">${esc(c.cliente)||'Sem nome'}</span>
                  <span class="settings-page-note">${esc(c.telefone||'')}</span>
                </button>
              `).join('')}
            ` : ''}
            ${tarefasResultado.length ? `
              <div class="busca-global-grupo-titulo">Tarefas</div>
              ${tarefasResultado.map(t=>`
                <button type="button" class="busca-global-item" data-action="busca-global-abrir-tarefa" data-task-id="${t.id}">
                  <span class="busca-global-item-nome">${esc(t.titulo)}</span>
                  ${t.vencimento ? `<span class="settings-page-note">${formatDate(t.vencimento)}</span>` : ''}
                </button>
              `).join('')}
            ` : ''}
            ${!leadsResultado.length && !tarefasResultado.length ? `<p class="settings-page-note" style="padding:16px;">Nada encontrado.</p>` : ''}
          `}
        </div>
      </div>
    </div>
  `;
  document.getElementById('busca-global-close').addEventListener('click', closeBuscaGlobal);
  document.getElementById('busca-global-overlay').addEventListener('click', (e)=>{ if(e.target.id==='busca-global-overlay') closeBuscaGlobal(); });
  const inputEl = document.getElementById('busca-global-input');
  inputEl.addEventListener('input', (e)=>{
    buscaGlobalTexto = e.target.value;
    renderBuscaGlobalModal();
    const novo = document.getElementById('busca-global-input');
    if(novo){ novo.focus(); novo.setSelectionRange(novo.value.length, novo.value.length); }
  });
  inputEl.addEventListener('keydown', (e)=>{ if(e.key==='Escape') closeBuscaGlobal(); });
  document.querySelectorAll('[data-action="busca-global-abrir-lead"]').forEach(btn=>{
    btn.addEventListener('click', ()=>{ closeBuscaGlobal(); openEditCard(btn.dataset.cardId); });
  });
  document.querySelectorAll('[data-action="busca-global-abrir-tarefa"]').forEach(btn=>{
    btn.addEventListener('click', ()=>{ closeBuscaGlobal(); goToPage('tarefas'); });
  });
}
document.addEventListener('keydown', (e)=>{
  if((e.ctrlKey || e.metaKey) && e.key.toLowerCase()==='k'){
    e.preventDefault();
    if(getToken() && !buscaGlobalAberta) abrirBuscaGlobal();
  }
});

function iniciaisDoNome(nome){
  const partes = (nome||'').trim().split(/\s+/).filter(Boolean);
  if(!partes.length) return '?';
  if(partes.length === 1) return partes[0][0].toUpperCase();
  return (partes[0][0] + partes[partes.length-1][0]).toUpperCase();
}
function redimensionarImagem(file, tamanho){
  return new Promise((resolve, reject)=>{
    const reader = new FileReader();
    reader.onload = (e)=>{
      const img = new Image();
      img.onload = ()=>{
        const canvas = document.createElement('canvas');
        canvas.width = tamanho;
        canvas.height = tamanho;
        const ctx = canvas.getContext('2d');
        const lado = Math.min(img.width, img.height);
        const sx = (img.width - lado)/2;
        const sy = (img.height - lado)/2;
        ctx.drawImage(img, sx, sy, lado, lado, 0, 0, tamanho, tamanho);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = ()=> reject(new Error('Não foi possível ler a imagem.'));
      img.src = e.target.result;
    };
    reader.onerror = ()=> reject(new Error('Não foi possível ler o arquivo.'));
    reader.readAsDataURL(file);
  });
}
async function handleAvatarFileSelected(file){
  if(!file) return;
  avatarMsg = null;
  try{
    const dataUrl = await redimensionarImagem(file, 128);
    avatarSalvando = true;
    renderApp();
    await apiRequest('PUT', '/auth/avatar', { avatarUrl: dataUrl });
    await refreshCurrentUser();
    avatarMsg = { tipo:'ok', texto:'Foto atualizada.' };
  }catch(e){
    avatarMsg = { tipo:'erro', texto: e.message || 'Não foi possível enviar a foto.' };
  }
  avatarSalvando = false;
  renderApp();
}
async function removerAvatar(){
  avatarSalvando = true;
  avatarMsg = null;
  renderApp();
  try{
    await apiRequest('PUT', '/auth/avatar', { avatarUrl: null });
    await refreshCurrentUser();
    avatarMsg = { tipo:'ok', texto:'Foto removida.' };
  }catch(e){
    avatarMsg = { tipo:'erro', texto: e.message || 'Não foi possível remover a foto.' };
  }
  avatarSalvando = false;
  renderApp();
}
async function desconectarTodosDispositivos(){
  logoutAllEnviando = true;
  logoutAllMsg = null;
  renderApp();
  try{
    await apiRequest('POST', '/auth/logout-all');
    logout(); // esse dispositivo também precisa entrar de novo
  }catch(e){
    logoutAllMsg = { tipo:'erro', texto: e.message || 'Não foi possível desconectar os dispositivos.' };
    logoutAllEnviando = false;
    renderApp();
  }
}
async function salvarSenha(){
  if(!senhaNovaVal || senhaNovaVal.length < 6){
    senhaMsg = { tipo:'erro', texto:'A nova senha precisa ter ao menos 6 caracteres.' };
    renderApp();
    if(modalAlterarSenhaAberto) renderAlterarSenhaModal();
    return;
  }
  senhaSalvando = true;
  senhaMsg = null;
  renderApp();
  if(modalAlterarSenhaAberto) renderAlterarSenhaModal();
  try{
    await apiRequest('PUT', '/auth/password', { senhaAtual: senhaAtualVal, senhaNova: senhaNovaVal });
    senhaMsg = { tipo:'ok', texto:'Senha salva com sucesso.' };
    senhaAtualVal = ''; senhaNovaVal = '';
    await refreshCurrentUser();
  }catch(e){
    senhaMsg = { tipo:'erro', texto: e.message || 'Não foi possível salvar a senha.' };
  }
  senhaSalvando = false;
  renderApp();
  if(modalAlterarSenhaAberto) renderAlterarSenhaModal();
}

// Parser simples de CSV: "Nome,Telefone,Valor", uma linha por lead.
// Não lida com campos entre aspas contendo vírgulas — suficiente pro uso esperado.
function parseCsvLeads(texto){
  const linhas = texto.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
  if(!linhas.length) return [];
  const inicio = /nome/i.test(linhas[0]) ? 1 : 0;
  const out = [];
  for(let i=inicio;i<linhas.length;i++){
    const partes = linhas[i].split(',').map(p=>p.trim().replace(/^"|"$/g,''));
    if(!partes[0]) continue;
    const valorTexto = (partes[2]||'0').replace(/[^\d,.-]/g,'').replace(/\.(?=\d{3})/g,'').replace(',','.');
    out.push({ nome: partes[0], telefone: partes[1]||'', valor: parseFloat(valorTexto) || 0 });
  }
  return out;
}
// Lê uma planilha do Excel e devolve [{ nome, telefone, valor }]: acha as colunas pelo nome do cabeçalho
// (Nome, Telefone/Celular/Whats, Valor) e, se não achar, usa a ordem das três primeiras colunas.
async function lerLeadsDeExcel(file){
  if(typeof XLSX === 'undefined') throw new Error('A biblioteca de planilhas não carregou. Confira a internet e recarregue a página.');
  const workbook = XLSX.read(await file.arrayBuffer(), { type:'array' });
  const aba = workbook.Sheets[workbook.SheetNames[0]];
  const matriz = XLSX.utils.sheet_to_json(aba, { header:1, defval:'', raw:true });
  if(!matriz.length) return [];
  const cab = matriz[0].map(c=> String(c).toLowerCase());
  const achar = (padroes, padrao)=>{
    const i = cab.findIndex(c=> padroes.some(p=> c.includes(p)));
    return i >= 0 ? i : padrao;
  };
  const temCabecalho = cab.some(c=> /nome|cliente/.test(c));
  const iNome = temCabecalho ? achar(['nome','cliente'], 0) : 0;
  const iTel = temCabecalho ? achar(['telefone','celular','fone','whats'], 1) : 1;
  const iValor = temCabecalho ? achar(['valor','crédito','credito'], 2) : 2;
  const out = [];
  for(let i = temCabecalho ? 1 : 0; i < matriz.length; i++){
    const l = matriz[i];
    const nome = String(l[iNome] ?? '').trim();
    if(!nome) continue;
    let valor = l[iValor];
    if(typeof valor !== 'number') valor = parseFloat(String(valor||'0').replace(/[^\d,.-]/g,'').replace(/\.(?=\d{3})/g,'').replace(',','.')) || 0;
    out.push({ nome, telefone: String(l[iTel] ?? '').trim(), valor });
  }
  return out;
}
async function importarLeadsCsv(){
  const fileInput = document.getElementById('import-arquivo');
  const file = fileInput && fileInput.files && fileInput.files[0];
  if(!file){ errorMsg = 'Escolha um arquivo (CSV ou Excel) primeiro.'; renderApp(); return; }
  const columnId = importColumnId || (document.getElementById('import-coluna') || {}).value;
  if(!columnId){ errorMsg = 'Escolha a coluna de destino.'; renderApp(); return; }

  importando = true;
  importResultado = null;
  renderApp();

  let linhas;
  try{
    linhas = /\.(xlsx|xls)$/i.test(file.name) ? await lerLeadsDeExcel(file) : parseCsvLeads(await file.text());
  }catch(e){
    importando = false;
    errorMsg = e.message || 'Não foi possível ler esse arquivo.';
    renderApp();
    return;
  }
  let sucesso = 0, falha = 0;
  for(const linha of linhas){
    try{
      const novo = await apiRequest('POST', '/cards', {
        columnId, cliente: linha.nome, telefone: linha.telefone, valor: linha.valor,
        temperatura: 'morno', obs: '', mes: '', mesInicioContato: hojeLocalISO(),
      });
      board.cards.push(novo);
      sucesso++;
    }catch(e){ falha++; }
  }
  importResultado = { sucesso, falha };
  importando = false;
  renderApp();
}

/* ---------- IA ---------- */
async function gerarInsightsIA(){
  insightsCarregando = true;
  renderApp();
  try{
    const data = await apiRequest('POST', '/ai/insights', { funilId: funilAtualId });
    aiInsights = data.insights || [];
  }catch(e){
    errorMsg = e.message || 'Não foi possível gerar os insights.';
  }
  insightsCarregando = false;
  renderApp();
}

async function sugerirMensagemIA(){
  if(!modalForm || modalForm.__isNew) return;
  const btn = document.getElementById('f-ai-mensagem');
  const resultBox = document.getElementById('f-ai-mensagem-result');
  if(btn){ btn.disabled = true; btn.innerHTML = `${ICON_SPARKLE} Gerando…`; }
  try{
    const data = await apiRequest('POST', '/ai/mensagem', { cardId: modalForm.id });
    if(resultBox){
      resultBox.style.display = 'block';
      resultBox.innerHTML = `
        <p>${esc(data.mensagem)}</p>
        <div class="ai-result-actions">
          <button type="button" class="btn-outline" id="f-ai-copiar">Copiar</button>
          <button type="button" class="wa-btn" id="f-ai-abrir-wa">${WA_ICON} Abrir com essa mensagem</button>
        </div>
      `;
      const copiarBtn = document.getElementById('f-ai-copiar');
      if(copiarBtn) copiarBtn.addEventListener('click', ()=>{
        navigator.clipboard.writeText(data.mensagem).catch(()=>{});
      });
      const abrirBtn = document.getElementById('f-ai-abrir-wa');
      if(abrirBtn) abrirBtn.addEventListener('click', ()=>{
        const link = waLink(modalForm.telefone);
        if(link) window.open(link + '?text=' + encodeURIComponent(data.mensagem), '_blank', 'noopener');
      });
    }
  }catch(e){
    errorMsg = e.message || 'Não foi possível gerar a mensagem.';
    renderApp();
  }
  if(btn){ btn.disabled = false; btn.innerHTML = `${ICON_SPARKLE} Sugerir mensagem`; }
}

async function sugerirTarefaIA(){
  if(!modalForm || modalForm.__isNew) return;
  const btn = document.getElementById('f-ai-tarefa');
  const resultBox = document.getElementById('f-ai-tarefa-result');
  if(btn){ btn.disabled = true; btn.innerHTML = `${ICON_SPARKLE} Pensando…`; }
  try{
    const data = await apiRequest('POST', '/ai/sugerir-tarefa', { cardId: modalForm.id });
    const dataVenc = new Date();
    dataVenc.setDate(dataVenc.getDate() + data.dias);
    const vencISO = dataVenc.toISOString().slice(0,10);
    if(resultBox){
      resultBox.style.display = 'block';
      resultBox.innerHTML = `
        <p><b>${esc(data.titulo)}</b> — vencimento sugerido: ${formatDate(vencISO)}</p>
        <div class="ai-result-actions">
          <button type="button" class="btn-outline" id="f-ai-criar-tarefa">Criar essa tarefa</button>
        </div>
      `;
      const criarBtn = document.getElementById('f-ai-criar-tarefa');
      if(criarBtn) criarBtn.addEventListener('click', async ()=>{
        criarBtn.disabled = true;
        try{
          const nova = await apiRequest('POST', '/tasks', {
            titulo: data.titulo, vencimento: vencISO, prioridade:'media', leadId: modalForm.id, descricao:'',
          });
          tasks.push(nova);
          resultBox.innerHTML = '<p>✓ Tarefa criada.</p>';
        }catch(e){
          errorMsg = 'Não foi possível criar a tarefa.';
          renderApp();
        }
      });
    }
  }catch(e){
    errorMsg = e.message || 'Não foi possível sugerir uma tarefa.';
    renderApp();
  }
  if(btn){ btn.disabled = false; btn.innerHTML = `${ICON_SPARKLE} Sugerir tarefa de acompanhamento`; }
}

