// CRM · 07-mutacoes.js — salvar colunas, contatos, tarefas, comissões, 2FA e senha. Os arquivos js/crm/ são carregados em ordem pelo index.html e
// compartilham as mesmas variáveis globais (é o antigo script.js dividido, como no CRM de consórcio).
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
    const z = (window.zoomDaTela ? window.zoomDaTela() : 1);
    const dx = (antiga.left - nova.left) / z;
    const dy = (antiga.top - nova.top) / z;
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
async function moveCard(cardId, columnId, ordem, opcoes){
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
    return;
  }
  // entrou numa coluna de ganho: pede o fechamento da venda (valor final e parcelas)
  if(!(opcoes && opcoes.semFechamento) && typeof talvezPedirFechamento === 'function') talvezPedirFechamento(card, anterior.columnId);
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
  await Promise.all(ids.map(id=> moveCard(id, columnId, undefined, { semFechamento:true }))); // em lote: o selo "falta o fechamento" fica pra cada um
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
  return !!(!atuandoComo && equipe && equipe.souSupervisor && (equipe.membros||[]).some(m=>!m.souEu));
}

async function saveCardFromModal(){
  if(salvandoCard) return; // já tem um salvamento em andamento — ignora cliques repetidos
  const nomeFinal = (modalForm.tipoPessoa==='juridica' ? modalForm.clienteJuridica : modalForm.clienteFisica) || '';
  if(!nomeFinal.trim()) return;
  const eraNovo = modalForm.__isNew;
  const colunaAntesDoSalvar = eraNovo ? null : ((board.cards.find(c=>c.id===modalForm.id)||{}).columnId || null);
  let cardSalvoId = eraNovo ? null : modalForm.id;
  const { __isNew, id, clienteFisica, clienteJuridica, __modoGestor, __atribuirParaId, ...dados } = modalForm;
  dados.cliente = nomeFinal.trim();
  // modo gestor: precisa escolher pra quem vai o lead
  const atribuindo = !!(__modoGestor && podeAtribuirLeads());
  if(atribuindo){
    if(!__atribuirParaId){
      errorMsg = 'Escolha para quem vai o contato.';
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
        cardSalvoId = novoCard.id;
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
      mensagemSalvoCard = nomeDestino ? `Contato enviado para ${nomeDestino}` : 'Novo contato adicionado';
      renderModal();
      await new Promise(resolve=> setTimeout(resolve, 1300));
      mensagemSalvoCard = null;
    }
    closeModal();
    renderApp();
    const salvo = !nomeDestino && cardSalvoId ? board.cards.find(c=>c.id===cardSalvoId) : null;
    if(salvo && typeof talvezPedirFechamento === 'function') talvezPedirFechamento(salvo, colunaAntesDoSalvar);
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
  if(!f.desc.trim() || !f.valorVenda) return;
  if(!f.tipoProduto){ errorMsg = 'Escolha o produto ou serviço: é ele que define a comissão.'; renderApp(); return; }
  const dados = { desc: f.desc, scope: f.scope, date: f.date, valorVenda: f.valorVenda, tipoProduto: f.tipoProduto };
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
  if(!window.QRCode){ carregarBiblioteca('qrcode').then(renderizarQrCode2FA).catch(()=>{}); return; }
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
