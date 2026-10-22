/* ---------- proposta em PDF (dentro do card do cliente) ---------- */
function abrirPropostaModal(){
  if(!modalForm || modalForm.__isNew) return;
  const daqui7dias = new Date();
  daqui7dias.setDate(daqui7dias.getDate()+7);
  propostaModalForm = {
    cliente: modalForm.cliente || '',
    valor: Number(modalForm.valor) || 0,
    parcelas: 80,
    validade: daqui7dias.toISOString().slice(0,10),
  };
  renderPropostaModal();
}
function closePropostaModal(){ propostaModalForm = null; document.getElementById('modal-root').innerHTML=''; }
function renderPropostaModal(){
  const root = document.getElementById('modal-root');
  if(!propostaModalForm){ root.innerHTML=''; return; }
  const f = propostaModalForm;
  root.innerHTML = `
    <div class="overlay" id="proposta-modal-overlay">
      <div class="modal">
        <div class="modal-head">
          <h3>Gerar proposta</h3>
          <button id="proposta-modal-close">✕</button>
        </div>
        <div class="modal-body">
          <div class="field"><label>Cliente</label><input type="text" id="proposta-cliente" value="${esc(f.cliente)}" /></div>
          <div class="field-row">
            <div class="field"><label>Valor da carta (R$)</label><input type="number" id="proposta-valor" value="${f.valor}" min="0" step="0.01" /></div>
            <div class="field"><label>Nº de parcelas</label><input type="number" id="proposta-parcelas" value="${f.parcelas}" min="1" /></div>
          </div>
          <div class="field"><label>Válida até</label><input type="date" id="proposta-validade" value="${f.validade}" /></div>
          <p class="settings-page-note">Parcela estimada: ${fmtBRL((f.valor||0)/(f.parcelas||1))}</p>
        </div>
        <div class="modal-foot">
          <span></span>
          <div class="modal-foot-actions">
            <button class="btn-outline" id="proposta-cancel">Cancelar</button>
            <button class="btn-save" id="proposta-gerar">Gerar PDF</button>
          </div>
        </div>
      </div>
    </div>
  `;
  document.getElementById('proposta-modal-close').addEventListener('click', closePropostaModal);
  document.getElementById('proposta-cancel').addEventListener('click', closePropostaModal);
  document.getElementById('proposta-modal-overlay').addEventListener('click', (e)=>{ if(e.target.id==='proposta-modal-overlay') closePropostaModal(); });
  document.getElementById('proposta-cliente').addEventListener('input', (e)=> propostaModalForm.cliente = e.target.value);
  document.getElementById('proposta-valor').addEventListener('input', (e)=>{ propostaModalForm.valor = parseFloat(e.target.value)||0; renderPropostaModal(); });
  document.getElementById('proposta-parcelas').addEventListener('input', (e)=>{ propostaModalForm.parcelas = parseInt(e.target.value,10)||1; renderPropostaModal(); });
  document.getElementById('proposta-validade').addEventListener('input', (e)=> propostaModalForm.validade = e.target.value);
  document.getElementById('proposta-gerar').addEventListener('click', gerarPropostaPdf);
}
function gerarPropostaPdf(){
  const f = propostaModalForm;
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  let y = 25;
  doc.setFontSize(20);
  doc.text('Proposta de Carta de Crédito', 14, y); y += 10;
  doc.setFontSize(11);
  doc.setTextColor(120);
  doc.text(`Consultor: ${(currentUser&&currentUser.nome)||''}`, 14, y); y += 14;
  doc.setTextColor(20);

  doc.setFontSize(12);
  doc.text(`Cliente: ${f.cliente}`, 14, y); y += 8;
  doc.text(`Valor da carta: ${fmtBRL(f.valor)}`, 14, y); y += 8;
  doc.text(`Número de parcelas: ${f.parcelas}`, 14, y); y += 8;
  doc.text(`Parcela estimada: ${fmtBRL(f.valor/(f.parcelas||1))}`, 14, y); y += 8;
  doc.text(`Proposta válida até: ${formatDate(f.validade)}`, 14, y); y += 16;

  doc.setFontSize(9);
  doc.setTextColor(140);
  doc.text('Valores sujeitos a alteração conforme condições da administradora de consórcio no momento da contratação.', 14, y, { maxWidth: 180 });

  doc.save(`proposta_${(f.cliente||'cliente').replace(/\s+/g,'_')}.pdf`);
  closePropostaModal();
}

async function abrirConversaWhatsapp(){
  const box = document.getElementById('f-wa-conversa');
  if(!box || !modalForm || modalForm.__isNew) return;
  box.style.display = 'block';
  box.innerHTML = '<p class="settings-page-note">Carregando conversa…</p>';
  try{
    const data = await apiRequest('GET', `/whatsapp/conversas/${modalForm.id}`);
    renderConversaWhatsapp(data.mensagens || []);
  }catch(e){
    box.innerHTML = `<p class="settings-page-msg erro">${esc(e.message || 'Não foi possível carregar a conversa.')}</p>`;
  }
}
function statusMensagemIcone(status){
  if(status === 'read') return `<span class="wa-status wa-status-read" title="Lida">✓✓</span>`;
  if(status === 'delivered') return `<span class="wa-status" title="Entregue">✓✓</span>`;
  if(status === 'failed') return `<span class="wa-status wa-status-failed" title="Falhou">⚠</span>`;
  if(status === 'sent') return `<span class="wa-status" title="Enviada">✓</span>`;
  return '';
}
// Monta o conteúdo de uma mensagem — texto normal, ou a mídia (foto/áudio/documento/vídeo)
// quando ela tiver um anexo vinculado. Reaproveitado nas duas telas de chat do app.
function renderConteudoMensagem(m){
  const iconeCanal = m.canal==='instagram' ? '📷 ' : '';
  if(!m.anexo) return `<p>${iconeCanal}${esc(m.texto)}</p>`;
  const a = m.anexo;
  if(m.midiaTipo==='image'){
    return `<img src="${a.dadosBase64}" alt="${esc(a.nomeArquivo)}" class="wa-msg-imagem" />`;
  }
  if(m.midiaTipo==='audio'){
    return `<audio controls src="${a.dadosBase64}" class="wa-msg-audio"></audio>`;
  }
  return `<a href="${a.dadosBase64}" download="${esc(a.nomeArquivo)}" class="wa-msg-arquivo">${m.midiaTipo==='video'?'🎥':'📄'} ${esc(a.nomeArquivo)}</a>`;
}
function renderConversaWhatsapp(mensagens){
  const box = document.getElementById('f-wa-conversa');
  if(!box) return;
  box.innerHTML = `
    <div class="wa-conversa-lista">
      ${mensagens.length ? mensagens.map(m=>`
        <div class="wa-msg wa-msg-${m.direction}">
          ${renderConteudoMensagem(m)}
          <span>${new Date(m.timestamp).toLocaleString('pt-BR')} ${m.direction==='out' ? statusMensagemIcone(m.status) : ''}</span>
        </div>
      `).join('') : '<p class="settings-page-note">Nenhuma mensagem ainda.</p>'}
    </div>
    <div class="wa-conversa-input-row">
      <input type="text" id="wa-nova-msg" placeholder="Digite uma mensagem..." />
      <button type="button" class="btn-primary" id="wa-enviar-btn">Enviar</button>
    </div>
  `;
  const lista = box.querySelector('.wa-conversa-lista');
  if(lista) lista.scrollTop = lista.scrollHeight;
  const input = document.getElementById('wa-nova-msg');
  const enviarBtn = document.getElementById('wa-enviar-btn');
  const enviar = async ()=>{
    const texto = input.value.trim();
    if(!texto || !modalForm) return;
    enviarBtn.disabled = true;
    try{
      await apiRequest('POST', '/whatsapp/enviar', { cardId: modalForm.id, texto });
      input.value = '';
      await abrirConversaWhatsapp();
    }catch(e){
      errorMsg = e.message || 'Não foi possível enviar a mensagem.';
      renderApp();
    }
    if(enviarBtn) enviarBtn.disabled = false;
  };
  enviarBtn.addEventListener('click', enviar);
  input.addEventListener('keydown', (e)=>{ if(e.key==='Enter') enviar(); });
}

function formatDateHora(iso){
  if(!iso) return '';
  const d = new Date(iso);
  if(isNaN(d.getTime())) return '';
  return d.toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
}
function formatHora(iso){
  if(!iso) return '';
  const d = new Date(iso);
  if(isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' });
}

async function loadConversas(){
  try{
    const data = await apiRequest('GET', '/whatsapp/conversas');
    conversas = data.conversas || [];
  }catch(e){
    conversas = [];
  }
  conversasLoaded = true;
  renderApp();
}
async function selecionarConversa(cardId){
  if(conversaSelecionadaCardId === cardId) return;
  conversaSelecionadaCardId = cardId;
  conversaMensagensLoaded = false;
  conversaMensagens = [];
  renderApp();
  await carregarMensagensConversa(cardId, true);
  iniciarPollingConversa();
}
async function carregarMensagensConversa(cardId, primeiraVez){
  try{
    const data = await apiRequest('GET', `/whatsapp/conversas/${cardId}`);
    if(conversaSelecionadaCardId === cardId) conversaMensagens = data.mensagens || [];
  }catch(e){
    if(primeiraVez) conversaMensagens = [];
  }
  conversaMensagensLoaded = true;
  renderApp();
}
function iniciarPollingConversa(){
  pararPollingConversa();
  conversaPollingTimer = setInterval(()=>{
    if(conversaSelecionadaCardId && currentPage==='conversas') carregarMensagensConversa(conversaSelecionadaCardId, false);
  }, 6000);
}
function pararPollingConversa(){
  if(conversaPollingTimer){ clearInterval(conversaPollingTimer); conversaPollingTimer = null; }
}
async function enviarMensagemConversa(){
  if(!conversaTexto.trim() || !conversaSelecionadaCardId) return;
  conversaEnviando = true;
  renderApp();
  try{
    await apiRequest('POST', '/whatsapp/enviar', { cardId: conversaSelecionadaCardId, texto: conversaTexto });
    conversaTexto = '';
    await carregarMensagensConversa(conversaSelecionadaCardId, false);
    loadConversas(); // atualiza a prévia na lista da esquerda, sem travar a tela esperando
  }catch(e){
    errorMsg = e.message || 'Não foi possível enviar a mensagem.';
  }
  conversaEnviando = false;
  renderApp();
}
async function salvarCampoClienteConversa(campo, valor){
  const card = board.cards.find(c=>c.id===conversaSelecionadaCardId);
  if(!card) return;
  const anterior = card[campo];
  card[campo] = valor; // otimista
  try{
    await apiRequest('PUT', `/cards/${conversaSelecionadaCardId}`, { [campo]: valor });
    if(campo==='cliente' || campo==='telefone') loadConversas(); // atualiza nome/telefone na lista da esquerda também
  }catch(e){
    card[campo] = anterior;
    errorMsg = 'Não foi possível salvar a alteração.';
    renderApp();
  }
}
async function executarAutomacaoManual(automacaoId){
  if(!conversaSelecionadaCardId) return;
  try{
    await apiRequest('POST', `/automacoes/${automacaoId}/executar-manual`, { cardId: conversaSelecionadaCardId });
    await loadTasks();
  }catch(e){
    errorMsg = e.message || 'Não foi possível executar a automação.';
  }
  renderApp();
}

