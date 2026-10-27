// CRM · 05-derivacoes.js — relatórios, contas do pipeline/dashboard/comissões/contatos e duplicados. Os arquivos js/crm/ são carregados em ordem pelo index.html e
// compartilham as mesmas variáveis globais (é o antigo script.js dividido, como no CRM de consórcio).
/* ---------- Relatórios ---------- */
function relatoriosDadosMensais(mesesAtras, cardsBase){
  const cards = cardsBase || board.cards;
  const buckets = [];
  const agora = new Date();
  for(let i=mesesAtras-1;i>=0;i--){
    const d = new Date(agora.getFullYear(), agora.getMonth()-i, 1);
    buckets.push({ key:`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`, novos:0, ganhoValor:0, ganhoQtd:0 });
  }
  const porKey = new Map(buckets.map(b=>[b.key,b]));
  cards.forEach(c=>{
    if(c.createdAt){
      const bucket = porKey.get(c.createdAt.slice(0,7));
      if(bucket) bucket.novos++;
    }
    if(c.mes){
      const bucketGanho = porKey.get(c.mes.slice(0,7));
      const col = board.columns.find(k=>k.id===c.columnId);
      if(bucketGanho && col && col.tipo==='ganho'){
        bucketGanho.ganhoValor += valorVendido(c);
        bucketGanho.ganhoQtd++;
      }
    }
  });
  return buckets;
}
// Leads em planilha: Excel (.xlsx, padrão) ou CSV. Valor como número, para somar no Excel.
function linhasDosLeads(cards){
  return cards.map(c=>{
    const col = board.columns.find(k=>k.id===c.columnId);
    return {
      'Nome': c.cliente||'', 'Telefone': c.telefone||'', 'E-mail': c.email||'', 'Valor': Number(c.valor)||0,
      'Valor vendido': col && col.tipo==='ganho' ? valorVendido(c) : '', 'Coluna': col ? col.nome : '',
      'Temperatura': c.temperatura ? ((TEMPS[c.temperatura]||{}).label || c.temperatura) : '', 'Serviço': c.tipoServico||'',
      'Início de contato': c.mesInicioContato||'', 'Mês de venda': c.mes||'', 'Observações': c.obs||'',
    };
  });
}
async function baixarModeloLeads(){
  try{ await carregarBiblioteca('xlsx'); }catch(e){ errorMsg = e.message; renderApp(); return; }
  const ws = XLSX.utils.aoa_to_sheet([['Nome','Telefone','Serviço desejado','E-mail'],['Maria Silva','(11) 98888-7777','Consórcio de imóvel','maria@email.com'],['João Souza','(15) 99999-1234','Carta de crédito','']]);
  ws['!cols'] = [{wch:26},{wch:18},{wch:26},{wch:26}];
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Contatos');
  XLSX.writeFile(wb, 'modelo-importar-contatos.xlsx');
}
async function baixarPlanilhaLeads(cards, nomeBase, formato){
  if(formato === 'csv'){ baixarCsv(cards, `${nomeBase}.csv`); return; }
  try{ await carregarBiblioteca('xlsx'); }catch(e){ errorMsg = e.message; renderApp(); return; }
  const dados = linhasDosLeads(cards);
  const ws = XLSX.utils.json_to_sheet(dados.length ? dados : [{ 'Nome':'' }]);
  ws['!cols'] = [{wch:28},{wch:16},{wch:26},{wch:12},{wch:13},{wch:16},{wch:12},{wch:20},{wch:15},{wch:13},{wch:40}];
  const rng = XLSX.utils.decode_range(ws['!ref']);
  for(let r=1; r<=rng.e.r; r++) for(const c of [3,4]){ const cel = ws[XLSX.utils.encode_cell({r, c})]; if(cel && typeof cel.v === 'number') cel.z = '"R$" #,##0.00'; }
  ws['!autofilter'] = { ref: ws['!ref'] };
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Contatos');
  XLSX.writeFile(wb, `${nomeBase}.xlsx`);
}
function baixarCsv(cards, nomeArquivo){
  const linhas = [['Nome','Telefone','Valor','Coluna','Temperatura','Início de contato','Mês de venda'].join(',')];
  cards.forEach(c=>{
    const col = board.columns.find(k=>k.id===c.columnId);
    linhas.push([
      `"${(c.cliente||'').replace(/"/g,'""')}"`,
      `"${(c.telefone||'').replace(/"/g,'""')}"`,
      c.valor||0,
      `"${col?col.nome.replace(/"/g,'""'):''}"`,
      c.temperatura||'',
      c.mesInicioContato||'',
      c.mes||'',
    ].join(','));
  });
  const blob = new Blob([linhas.join('\n')], { type:'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomeArquivo;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
function exportarCsv(formato){
  baixarPlanilhaLeads(cardsParaRelatorio(), `contatos_${currentMonthKey()}`, formato === 'csv' ? 'csv' : 'xlsx');
}
async function exportarRelatorioPdf(){
  try{ await carregarBiblioteca('jspdf'); }catch(e){ errorMsg = e.message; renderApp(); return; }
  const cardsRel = cardsParaRelatorio();
  const dados = relatoriosDadosMensais(6, cardsRel);
  const totalGanho = cardsRel.reduce((s,c)=>{ const col=board.columns.find(k=>k.id===c.columnId); return col&&col.tipo==='ganho' ? s+valorVendido(c) : s; },0);
  const totalPerdido = cardsRel.reduce((s,c)=>{ const col=board.columns.find(k=>k.id===c.columnId); return col&&col.tipo==='perdido' ? s+(Number(c.valor)||0) : s; },0);
  const porTemp = ['quente','morno','frio'].map(t=>({ temp:t, count: cardsRel.filter(c=>c.temperatura===t).length }));
  const funilNome = relatorioFunilId ? ((funis.find(f=>f.id===relatorioFunilId)||{}).nome || '') : 'Todos os funis';

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  let y = 20;
  doc.setFontSize(18);
  doc.text('Relatório — Livro-Caixa', 14, y); y += 7;
  doc.setFontSize(10);
  doc.setTextColor(120);
  doc.text(`${funilNome} — gerado em ${new Date().toLocaleDateString('pt-BR')}`, 14, y); y += 12;
  doc.setTextColor(20);

  doc.setFontSize(13);
  doc.text('Resumo', 14, y); y += 8;
  doc.setFontSize(11);
  doc.text(`Total ganho: ${fmtBRL(totalGanho)}`, 14, y); y += 6;
  doc.text(`Total perdido: ${fmtBRL(totalPerdido)}`, 14, y); y += 6;
  doc.text(`Total de contatos: ${cardsRel.length}`, 14, y); y += 12;

  doc.setFontSize(13);
  doc.text('Novos contatos por mês', 14, y); y += 8;
  doc.setFontSize(11);
  dados.forEach(d=>{
    doc.text(`${monthLabel(d.key)}: ${d.novos}`, 14, y); y += 6;
  });
  y += 6;

  doc.setFontSize(13);
  doc.text('Contatos por qualificação', 14, y); y += 8;
  doc.setFontSize(11);
  porTemp.forEach(t=>{
    doc.text(`${TEMPS[t.temp].label}: ${t.count}`, 14, y); y += 6;
  });

  doc.save(`relatorio_${currentMonthKey()}.pdf`);
}
function exportarLeads(formato){
  baixarPlanilhaLeads(filteredLeads(), `contatos_${currentMonthKey()}`, formato === 'csv' ? 'csv' : 'xlsx');
}
async function connectGoogleCalendar(){
  try{
    const data = await apiRequest('GET', '/calendar/connect-url');
    window.location.href = data.url;
  }catch(e){
    errorMsg = 'Não foi possível iniciar a conexão com a Google Agenda.';
    renderApp();
  }
}
async function disconnectGoogleCalendar(){
  try{
    await apiRequest('POST', '/calendar/disconnect');
    calendarConnected = false;
  }catch(e){
    errorMsg = 'Não foi possível desconectar da Google Agenda.';
  }
  renderApp();
}
function abrirBackupModal(){
  backupModalAberto = true;
  backupMsg = null;
  renderBackupModal();
}
function closeBackupModal(){
  backupModalAberto = false;
  const root = document.getElementById('modal-root');
  if(root) root.innerHTML = '';
}
function renderBackupModal(){
  const root = document.getElementById('modal-root');
  if(!backupModalAberto){ root.innerHTML=''; return; }
  root.innerHTML = `
    <div class="overlay" id="backup-modal-overlay">
      <div class="modal">
        <div class="modal-head">
          <h3>Backup dos seus dados</h3>
          <button id="backup-modal-close">✕</button>
        </div>
        <div class="modal-body">
          <p class="settings-page-note">Guarda ou restaura uma cópia de todos os seus clientes, tarefas, comissões, mensagens e configurações.</p>
          ${backupMsg ? `<p class="settings-page-msg ${backupMsg.tipo}">${esc(backupMsg.texto)}</p>` : ''}
          <div class="backup-opcoes-row" style="margin-top:14px;">
            <div class="backup-opcao-card">
              <div class="backup-opcao-titulo">⬇ Exportar</div>
              <p class="settings-page-note">Baixa um arquivo .json com tudo, pra guardar num lugar seguro (Google Drive, por exemplo).</p>
              <button class="btn-outline" id="backup-modal-exportar" ${backupGerando?'disabled':''}>${backupGerando?'Gerando…':'Baixar backup completo'}</button>
            </div>
            <div class="backup-opcao-card">
              <div class="backup-opcao-titulo">⬆ Importar</div>
              <p class="settings-page-note">Restaura a partir de um arquivo .json de backup — atualiza o que já existe e cria o que estiver faltando, sem apagar nada.</p>
              <input type="file" id="backup-import-input" accept="application/json" style="display:none;" />
              <button class="btn-outline" id="backup-modal-importar" ${backupImportando?'disabled':''}>${backupImportando?'Importando…':'Escolher arquivo e restaurar'}</button>
            </div>
          </div>
        </div>
        <div class="modal-foot">
          <span></span>
          <div class="modal-foot-actions">
            <button class="btn-outline" id="backup-modal-fechar">Fechar</button>
          </div>
        </div>
      </div>
    </div>
  `;
  document.getElementById('backup-modal-close').addEventListener('click', closeBackupModal);
  document.getElementById('backup-modal-fechar').addEventListener('click', closeBackupModal);
  document.getElementById('backup-modal-overlay').addEventListener('click', (e)=>{ if(e.target.id==='backup-modal-overlay') closeBackupModal(); });
  document.getElementById('backup-modal-exportar').addEventListener('click', baixarBackupCompleto);
  document.getElementById('backup-modal-importar').addEventListener('click', escolherArquivoBackup);
  document.getElementById('backup-import-input').addEventListener('change', (e)=>{
    const file = e.target.files[0];
    e.target.value = '';
    importarArquivoBackup(file);
  });
}
function escolherArquivoBackup(){
  const input = document.getElementById('backup-import-input');
  if(input) input.click();
}
async function importarArquivoBackup(file){
  if(!file) return;
  showConfirm({
    message: 'Restaurar esse backup? Isso atualiza clientes, tarefas e outros dados que já existirem com o mesmo identificador, e cria o que estiver faltando. Nada é apagado.',
    confirmLabel: 'Restaurar',
    danger: false,
    onConfirm: async ()=>{
      closeConfirm();
      backupImportando = true;
      backupMsg = null;
      renderApp();
      if(backupModalAberto) renderBackupModal();
      try{
        const texto = await file.text();
        const dados = JSON.parse(texto);
        const token = getToken();
        const res = await fetch(API_BASE + '/backup/importar-tudo', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
          body: JSON.stringify(dados),
        });
        const resposta = await res.json();
        if(!res.ok) throw new Error(resposta.error || 'Não foi possível importar o backup.');
        // o PDV volta com as suas tabelas dentro de resultado.pdv (ou só um aviso, em backups antigos)
        const res0 = { ...(resposta.resultado||{}) }; const pdv = res0.pdv; delete res0.pdv;
        const partes = [...Object.values(res0), ...(pdv && !pdv.aviso ? Object.values(pdv) : [])];
        const totalOk = partes.reduce((s,r)=>s+(r.ok||0),0);
        const totalErro = partes.reduce((s,r)=>s+(r.erro||0),0);
        backupMsg = { tipo:'ok', texto: `Backup restaurado: ${totalOk} registro(s) atualizado(s)${totalErro?`, ${totalErro} com erro`:''}.${pdv && !pdv.aviso ? ' O PDV também foi restaurado (as fotos dos produtos e a equipe com PIN não vão no backup).' : ''}${pdv && pdv.aviso ? ' ' + pdv.aviso : ''}` };
        // recarrega os dados principais da tela, já que podem ter mudado
        await Promise.all([loadBoard(), loadTasks(), loadContratos()]);
      }catch(e){
        backupMsg = { tipo:'erro', texto: e.message || 'Arquivo inválido ou erro ao importar.' };
      }
      backupImportando = false;
      renderApp();
      if(backupModalAberto) renderBackupModal();
    },
  });
}
async function baixarBackupCompleto(){
  if(backupGerando) return;
  backupGerando = true;
  backupMsg = null;
  renderApp();
  if(backupModalAberto) renderBackupModal();
  try{
    const token = getToken();
    const res = await fetch(API_BASE + '/backup/exportar-tudo', {
      headers: { 'Authorization': 'Bearer ' + token },
    });
    if(!res.ok) throw new Error('Não foi possível gerar o backup agora.');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `backup-painel-crm-${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }catch(e){
    backupMsg = { tipo:'erro', texto: e.message || 'Não foi possível gerar o backup agora.' };
  }
  backupGerando = false;
  renderApp();
  if(backupModalAberto) renderBackupModal();
}
async function verificarAtualizacaoApp(){
  verificandoAtualizacao = true;
  atualizacaoMsg = null;
  renderApp();
  try{
    if('serviceWorker' in navigator){
      const reg = await navigator.serviceWorker.getRegistration();
      if(reg) await reg.update();
    }
    atualizacaoMsg = { tipo:'ok', texto:'Tudo certo! Recarregando a página...' };
    renderApp();
    setTimeout(()=>{ window.location.reload(); }, 700);
  }catch(e){
    atualizacaoMsg = { tipo:'erro', texto:'Não foi possível verificar agora. Tenta fechar e abrir o app de novo.' };
    verificandoAtualizacao = false;
    renderApp();
  }
}
async function syncCalendarNow(){
  if(calendarSyncing) return;
  calendarSyncing = true;
  renderApp();
  try{
    await apiRequest('POST', '/tasks/sync-calendar');
    await loadTasks();
    if(currentPage==='tarefas') await loadAgendaMes(agendaMesAtual); // busca de novo os eventos do Google pro mês em tela
  }catch(e){
    errorMsg = e.message || 'Não foi possível sincronizar com a Google Agenda agora.';
  }
  calendarSyncing = false;
  renderApp();
}
function tratarRetornoDoGoogle(){
  const params = new URLSearchParams(window.location.search);
  const status = params.get('calendar');
  if(!status) return;
  if(status === 'conectado'){ calendarConnected = true; }
  else if(status === 'erro'){ errorMsg = 'Não foi possível conectar com a Google Agenda. Tente novamente.'; }
  window.history.replaceState({}, '', window.location.pathname);
}

// Telefone para mostrar na tela: (11) 98888-7777, sem o 55 do Brasil. O que foi digitado continua
// guardado como está (o WhatsApp usa o número inteiro).
function telefoneBonito(t){ return Comum.telefone(t); }
// data de hoje no horário local (toISOString é UTC e, à noite no Brasil, já seria o dia seguinte)
function hojeLocalISO(d){ return Comum.hojeISO(d); }
/* ---------- derivações (Pipeline) ---------- */
// mês de início do contato; contatos antigos (ou de backups antigos) sem ele usam a data de criação
function mesInicioDoContato(c){
  if(c.mesInicioContato) return c.mesInicioContato.slice(0,7);
  if(!c.createdAt) return '';
  const d = new Date(c.createdAt);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}
// dia do início do contato (o mesmo campo que o filtro do mês do Pipeline usa), à meia-noite local;
// sem ele, o dia em que o contato foi cadastrado. Assim a Visão geral e o Pipeline contam igual.
function dataInicioDoContato(c){
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?/.exec(c.mesInicioContato || '');
  if(m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3] || 1));
  return c.createdAt ? new Date(c.createdAt) : null;
}
function monthsList(){
  const set = new Set([currentMonthKey(), ...board.cards.map(mesInicioDoContato).filter(Boolean)]);
  return Array.from(set).sort((a,b)=> a<b?1:-1);
}
function visibleCards(){
  let cards = filterMonth ? board.cards.filter(c=> mesInicioDoContato(c)===filterMonth) : board.cards;
  cards = cards.filter(c=>!c.arquivado);
  if(filtroEsfriando){
    const limite = Date.now() - 7*24*60*60*1000;
    cards = cards.filter(c=>{
      const col = board.columns.find(k=>k.id===c.columnId);
      if(!col || col.tipo!=='aberto') return false;
      const att = c.updatedAt ? new Date(c.updatedAt).getTime() : 0;
      return att < limite;
    });
  }
  return cards;
}
function cardsOf(colId){ return visibleCards().filter(c=>c.columnId===colId).sort((a,b)=> (a.ordem||0) - (b.ordem||0)); }
// valor de uma venda ganha: o valor final do fechamento (com desconto), se já foi feito
function valorVendido(c){ return c.fechamento && !c.fechamento.cancelado && Number.isFinite(Number(c.fechamento.valorFinal)) ? Number(c.fechamento.valorFinal) : (Number(c.valor)||0); }
// o valor do card mudou depois do fechamento (a venda continua valendo)
function valorMudouDepoisDoFechamento(c){ return !!(c && c.fechamento && !c.fechamento.cancelado && Math.round((Number(c.valor)||0)*100) !== Math.round((Number(c.fechamento.valorOriginal)||0)*100)); }
function sumByTipo(tipo){
  return visibleCards().reduce((s,c)=>{
    const col = board.columns.find(k=>k.id===c.columnId);
    return (col && col.tipo===tipo && col.funilId===funilAtualId) ? s + (tipo==='ganho' ? valorVendido(c) : (Number(c.valor)||0)) : s;
  },0);
}
function countByTipo(tipo){
  return visibleCards().filter(c=>{
    const col = board.columns.find(k=>k.id===c.columnId);
    return col && col.tipo===tipo && col.funilId===funilAtualId;
  }).length;
}
function quentesAtivos(){
  return visibleCards().filter(c=>{
    const col = board.columns.find(k=>k.id===c.columnId);
    return col && col.tipo==='aberto' && col.funilId===funilAtualId && c.temperatura==='quente';
  }).length;
}
function cardsDoFunilAtual(){
  return visibleCards().filter(c=>{
    const col = board.columns.find(k=>k.id===c.columnId);
    return col && col.funilId===funilAtualId;
  });
}
function ticketMedioFunil(){
  const cards = cardsDoFunilAtual();
  if(!cards.length) return 0;
  const total = cards.reduce((s,c)=> s + (c.fechamento ? valorVendido(c) : (Number(c.valor)||0)), 0); // venda fechada conta pelo valor final
  return total / cards.length;
}

/* ---------- derivações (Dashboard) ---------- */
function periodRange(period){
  const end = new Date();
  const start = new Date();
  if(period === '7dias') start.setDate(start.getDate() - 6);
  else if(period === 'mes') start.setDate(start.getDate() - 29);
  else if(period === 'trimestre') start.setDate(start.getDate() - 89);
  else start.setDate(start.getDate() - 364); // ano
  start.setHours(0,0,0,0);
  return { start, end };
}
function cardsInPeriod(){
  const { start, end } = periodRange(dashboardPeriod);
  return board.cards.filter(c=>{
    const d = dataInicioDoContato(c);
    return !!d && d >= start && d <= end;
  });
}
function vendidoNoMesAtual(){
  const mesAtual = currentMonthKey();
  return board.cards.reduce((s,c)=>{
    const col = board.columns.find(k=>k.id===c.columnId);
    return (col && col.tipo==='ganho' && String(c.mes||'').slice(0,7)===mesAtual) ? s + valorVendido(c) : s;
  }, 0);
}
async function loadMetaVendas(){
  try{
    const data = await apiRequest('GET', `/metas/${currentMonthKey()}`);
    metaVendasValor = data.valorMeta || 0;
  }catch(e){
    metaVendasValor = 0;
  }
  metaVendasCarregada = true;
  renderApp();
}
async function salvarMetaVendas(){
  const input = document.getElementById('meta-vendas-input');
  const valor = input ? (parseFloat(input.value) || 0) : 0;
  try{
    await apiRequest('PUT', `/metas/${currentMonthKey()}`, { valorMeta: valor });
    metaVendasValor = valor;
  }catch(e){
    errorMsg = 'Não foi possível salvar a meta.';
  }
  editandoMetaVendas = false;
  renderApp();
}
let metaEquipeDeQual = null; // de qual equipe é a meta carregada (trocou de equipe: recarrega)
async function loadMetaVendasEquipe(){
  if(acessoCrm && acessoCrm.tipo !== 'dono'){ metaVendasEquipeCarregada = true; return; } // equipe do CRM: só com login próprio
  metaEquipeDeQual = equipe ? equipe.id : null;
  try{
    const data = await apiRequest('GET', `/equipe/meta-vendas/${currentMonthKey()}`);
    metaVendasEquipeValor = data.valorMeta || 0;
    metaVendasEquipeVendido = data.vendidoNoMes || 0;
  }catch(e){
    metaVendasEquipeValor = 0;
    metaVendasEquipeVendido = 0;
  }
  metaVendasEquipeCarregada = true;
  renderApp();
}
async function salvarMetaVendasEquipe(){
  const input = document.getElementById('meta-vendas-equipe-input');
  const valor = input ? (parseFloat(input.value) || 0) : 0;
  try{
    await apiRequest('PUT', `/equipe/meta-vendas/${currentMonthKey()}`, { valorMeta: valor });
    metaVendasEquipeValor = valor;
  }catch(e){
    errorMsg = 'Não foi possível salvar a meta da equipe.';
  }
  editandoMetaVendasEquipe = false;
  renderApp();
}
function dashMetrics(){
  const cards = cardsInPeriod();
  let emNegociacaoValor=0, emNegociacaoCount=0, ganhoValor=0, ganhoCount=0, perdidoCount=0;
  cards.forEach(c=>{
    const col = board.columns.find(k=>k.id===c.columnId);
    if(!col) return;
    if(col.tipo === 'aberto'){ emNegociacaoValor += Number(c.valor)||0; emNegociacaoCount++; }
    else if(col.tipo === 'ganho'){ ganhoValor += valorVendido(c); ganhoCount++; }
    else if(col.tipo === 'perdido'){ perdidoCount++; }
  });
  const fechados = ganhoCount + perdidoCount;
  const conversao = fechados > 0 ? Math.round((ganhoCount/fechados)*100) : 0;
  return { novosLeads: cards.length, emNegociacaoValor, emNegociacaoCount, ganhoValor, ganhoCount, conversao };
}
function stageTotals(){
  return board.columns.map(col=>{
    const total = board.cards.filter(c=>c.columnId===col.id).reduce((s,c)=> s+(col.tipo==='ganho' ? valorVendido(c) : (Number(c.valor)||0)), 0);
    return { col, total };
  });
}
function leadsPorPeriodoBuckets(){
  const { start, end } = periodRange(dashboardPeriod);
  const cards = cardsInPeriod();
  const totalDays = Math.max(1, Math.round((end-start)/86400000)+1);
  const bucketDays = totalDays > 40 ? 7 : 1;
  const buckets = [];
  for(let t=new Date(start); t<=end; t.setDate(t.getDate()+bucketDays)){
    buckets.push({ date:new Date(t), count:0 });
  }
  if(!buckets.length) buckets.push({ date:new Date(start), count:0 });
  cards.forEach(c=>{
    const d = dataInicioDoContato(c);
    for(let i=buckets.length-1;i>=0;i--){
      if(d >= buckets[i].date){ buckets[i].count++; break; }
    }
  });
  return buckets;
}
function renderLeadsChart(){
  const buckets = leadsPorPeriodoBuckets();
  if(!buckets.some(b=>b.count>0)){
    return `<p class="chart-empty">Nenhum contato novo nesse período ainda.</p>`;
  }
  const w=720, h=220, padL=32, padR=12, padT=12, padB=26;
  const innerW = w-padL-padR, innerH = h-padT-padB;
  const maxCount = Math.max(4, ...buckets.map(b=>b.count));
  const stepX = buckets.length>1 ? innerW/(buckets.length-1) : 0;
  const points = buckets.map((b,i)=>({
    x: padL + stepX*i,
    y: padT + innerH - (b.count/maxCount)*innerH,
    b,
  }));
  const path = points.map((p,i)=> (i===0?'M':'L')+p.x.toFixed(1)+' '+p.y.toFixed(1)).join(' ');
  const yTicks = 4;
  const yLabels = Array.from({length:yTicks+1}, (_,i)=> Math.round(maxCount - (maxCount/yTicks)*i));
  const xLabelEvery = Math.max(1, Math.ceil(buckets.length/8));
  return `
    <div class="chart-wrap">
      <svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
        ${yLabels.map((v,i)=>{
          const y = padT + (innerH/yTicks)*i;
          return `<line x1="${padL}" y1="${y}" x2="${w-padR}" y2="${y}" stroke="var(--line)" stroke-width="1"/><text x="${padL-8}" y="${y+4}" font-size="10" fill="var(--ink-soft)" text-anchor="end">${v}</text>`;
        }).join('')}
        <path d="${path}" fill="none" stroke="var(--accent)" stroke-width="2"/>
        ${points.map(p=>`<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="2.5" fill="var(--accent)"/>`).join('')}
        ${points.map((p,i)=> i % xLabelEvery === 0 ? `<text x="${p.x.toFixed(1)}" y="${h-6}" font-size="9" fill="var(--ink-soft)" text-anchor="middle">${p.b.date.getDate()}/${p.b.date.getMonth()+1}</text>` : '').join('')}
      </svg>
    </div>
  `;
}

/* ---------- comissões: cálculo e derivações ---------- */
const ESCOPOS = {
  Pessoal: { label:'Pessoal', color:'var(--ink-soft)', bg:'var(--badge-neutral-bg)' },
  Empresa: { label:'Empresa', color:'#FFFFFF',         bg:'var(--accent)' },
};
const REGRAS_COMISSAO_FALLBACK_NOMES = { padrao:'Padrão' };
// Gera as <option> de tipo de produto a partir das regras de comissão carregadas — usado
// tanto no formulário do lead quanto no modal de contrato. Enquanto as regras ainda não
// carregaram (ou pra um valor salvo que não bate com nenhuma regra atual, ex: regra
// excluída depois), garante que a opção escolhida sempre apareça, sem sumir do <select>.
// Confere se a regra desse tipo de produto marca o mês como independente do lead — olha
// as regras carregadas do servidor (enquanto não carregaram, considera que não).
function mesIndependenteDoTipo(tipoProduto){
  const regra = regrasComissao.find(r=>r.chave===tipoProduto);
  return !!(regra && regra.mesIndependente);
}
function textoNotaMesContrato(tipoProduto){
  return mesIndependenteDoTipo(tipoProduto)
    ? 'Essa regra marca o mês como independente (pra pagamentos que podem demorar a acontecer) — mudar o mês aqui não altera o mês do contato.'
    : 'Mudar o mês aqui também atualiza o mês do contato (e vice-versa) — a não ser que a regra desse tipo marque o mês como independente.';
}
// Produto/serviço que já vem escolhido num lead ou contrato novo: a 1ª regra de comissão
// do usuário (na ordem da engrenagem) — ou "padrao" enquanto as regras não carregaram.
function tipoProdutoPadrao(){
  return (regrasComissao[0] && regrasComissao[0].chave) || 'padrao';
}
function renderOpcoesTipoProduto(valorAtual){
  const lista = regrasComissao.length
    ? regrasComissao
    : Object.keys(REGRAS_COMISSAO_FALLBACK_NOMES).map(chave=>({ chave, nome: REGRAS_COMISSAO_FALLBACK_NOMES[chave] }));
  const opcoes = (valorAtual && !lista.some(r=>r.chave===valorAtual))
    ? [...lista, { chave: valorAtual, nome: valorAtual }]
    : lista;
  return opcoes.map(r=>`<option value="${esc(r.chave)}" ${r.chave===valorAtual?'selected':''}>${esc(r.nome)}</option>`).join('');
}
// Motor genérico por blocos — espelha exatamente o back-end (comissaoCalc.js:
// calcComissaoPorBlocos). Cada bloco é "N parcelas de X% do valor da venda cada". Serve tanto pra
// pré-visualizar um contrato quanto pra simular uma regra sendo editada na engrenagem.
function calcComissaoPorBlocosPreview(valorVenda, blocos){
  const valor = parseFloat(valorVenda) || 0;
  const lista = Array.isArray(blocos) && blocos.length ? blocos : [{ parcelas:1, percentual:0 }];
  return lista.map(b=>({
    parcelas: Math.max(1, parseInt(b.parcelas,10) || 1),
    value: Math.round(valor * (parseFloat(b.percentual)||0) * 100) / 100,
  }));
}
function resumoDeBlocosPreview(blocosCalculados){
  const total = blocosCalculados.reduce((s,b)=> s + b.value*b.parcelas, 0);
  const parcelas = blocosCalculados.reduce((s,b)=> s + b.parcelas, 0);
  const primeiro = blocosCalculados[0] || { parcelas:0, value:0 };
  const segundo = blocosCalculados[1];
  return { blocos:blocosCalculados, parcelas, parcelas1:primeiro.parcelas, value:primeiro.value, value2: segundo?segundo.value:0, total: Math.round(total*100)/100 };
}
// Regras padrão do sistema, só como fallback enquanto as regras do usuário ainda não
// carregaram do servidor (loadRegrasComissao) — assim que carregam, elas mandam.
const REGRAS_COMISSAO_FALLBACK = {
  padrao: [{ parcelas:1, percentual:0.05 }],
};
function calcComissaoPreviewPorTipo(valorVenda, tipoProduto){
  const regra = regrasComissao.find(r=>r.chave===tipoProduto);
  const blocos = regra ? regra.blocos : (REGRAS_COMISSAO_FALLBACK[tipoProduto] || [{ parcelas:1, percentual:0 }]);
  return resumoDeBlocosPreview(calcComissaoPorBlocosPreview(valorVenda, blocos));
}
function atualizarNotaCicloDeVenda(){
  const nota = document.getElementById('f-ciclo-venda-nota');
  if(!nota || !modalForm || modalForm.__isNew) return;
  const texto = textoCicloDeVenda(modalForm.mesInicioContato, modalForm.mes);
  nota.textContent = texto;
  nota.style.display = texto ? '' : 'none';
}
function monthsBetween(anchorYM, targetYM){
  const [ay,am] = anchorYM.split('-').map(Number);
  const [ty,tm] = targetYM.split('-').map(Number);
  return (ty-ay)*12 + (tm-am);
}
// Descreve o tempo entre o início do contato e o mês de venda, pra dar uma noção
// rápida do ciclo de venda daquele cliente direto no formulário.
// Leads bem antigos podem ter "mes"/"mesInicioContato" guardados como "YYYY-MM" (de
// antes de existir o dia) — um <input type="date"> não consegue exibir isso e mostra
// vazio, mas a string ainda existe e conta como "preenchida" em qualquer checagem
// direta. Isso normaliza pro dia 1 daquele mês, deixando a exibição e os cálculos
// consistentes com o valor de verdade salvo.
function normalizarData(valor){
  if(!valor) return '';
  if(/^\d{4}-\d{2}-\d{2}$/.test(valor)) return valor;
  if(/^\d{4}-\d{2}$/.test(valor)) return `${valor}-01`;
  return valor;
}
function textoCicloDeVenda(mesInicio, mesVenda){
  mesInicio = normalizarData(mesInicio);
  mesVenda = normalizarData(mesVenda);
  if(!mesInicio) return '';
  if(!mesVenda) return '🟡 Ciclo aberto — ainda não fechou.';
  const diferenca = monthsBetween(mesInicio, mesVenda);
  if(diferenca < 0) return '⚠️ A data de venda é anterior ao início do contato — confira as datas.';
  if(diferenca === 0) return '🔵 Ciclo de venda: fechou no mesmo mês do primeiro contato.';
  return `🔵 Ciclo de venda: ${diferenca} ${diferenca===1?'mês':'meses'} até fechar.`;
}
function addMonthsKey(ym, delta){
  const [y,m] = ym.split('-').map(Number);
  const d = new Date(y, m-1+delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}
// Descobre o valor da parcela de índice "idx" (0 = primeira) dentro de um contrato,
// percorrendo os blocos da regra em ordem até achar em qual bloco esse índice cai.
// Contratos criados antes das regras editáveis não têm "blocos" detalhado — pra esses,
// cai no formato antigo de até 2 blocos (parcelas1/value + value2).
function parcelaValue(c, idx){
  if(Array.isArray(c.blocos) && c.blocos.length){
    let acumulado = 0;
    for(const b of c.blocos){
      if(idx < acumulado + b.parcelas) return b.value;
      acumulado += b.parcelas;
    }
    return c.blocos[c.blocos.length-1].value;
  }
  return idx < c.parcelas1 ? c.value : c.value2;
}
// A partir de qual índice de parcela o contrato foi cancelado (Infinity = nunca cancelado)
function contratoIdxCancelamento(c){
  if(!c.canceladoNoMes) return Infinity;
  const anchor = (c.date||'').slice(0,7);
  return monthsBetween(anchor, c.canceladoNoMes);
}
function parcelaAtivaNoMes(c, idx){
  return idx >= 0 && idx < c.parcelas && idx < contratoIdxCancelamento(c);
}
function contratoTotal(c){
  let total = 0;
  const limite = Math.min(c.parcelas, contratoIdxCancelamento(c));
  for(let i=0;i<limite;i++) total += parcelaValue(c,i);
  return total;
}
function contratoRestante(c, fromIdx){
  let total = 0;
  const limite = Math.min(c.parcelas, contratoIdxCancelamento(c));
  for(let i=Math.max(0,fromIdx);i<limite;i++) total += parcelaValue(c,i);
  return total;
}
function comissoesStats(){
  const rowsMes = contratos.map(c=>{
    const anchor = (c.date||'').slice(0,7);
    const idx = monthsBetween(anchor, comissoesMonth);
    return parcelaAtivaNoMes(c, idx) ? { c, idx, value: parcelaValue(c, idx) } : null;
  }).filter(Boolean);
  const previstoMes = rowsMes.reduce((a,r)=> a+r.value, 0);
  const totalAtivo = contratos.reduce((a,c)=>{
    const anchor = (c.date||'').slice(0,7);
    const idx = monthsBetween(anchor, comissoesMonth);
    return a + contratoRestante(c, idx);
  }, 0);
  return { previstoMes, totalAtivo, total: contratos.length };
}

/* ---------- derivações (Leads) ---------- */
// Ordenação compartilhada entre Leads, Pipeline e Comissões. "data-inicio" e
// "data-venda" usam os campos que representam cada uma dessas datas em cada tela —
// leads/pipeline têm as duas (mesInicioContato/mes), comissões só tem uma (date).
const OPCOES_ORDENACAO = [
  ['padrao', 'Ordem padrão'],
  ['alfabetica', 'Ordem alfabética'],
  ['recentes', 'Adicionados recentemente'],
  ['data-inicio', 'Data de início de contato'],
  ['data-venda', 'Data de venda'],
];
// Botão de funil que abre um menu com a ordenação atual marcada e as outras opções —
// usado em Leads, Pipeline e Comissões. "menuId" identifica qual dos três é esse (só
// um fica aberto por vez), "rotuloPadrao" troca o texto da primeira opção conforme
// o contexto (no Pipeline, por exemplo, deixa claro que o padrão é a ordem manual),
// e "ocultarInicio" tira a opção de início de contato pra Comissões, que não tem
// esse campo.
function renderBotaoOrdenar(menuId, valorAtual, rotuloPadrao, ocultarInicio){
  const aberto = ordenarMenuAberto === menuId;
  let opcoes = rotuloPadrao ? [[OPCOES_ORDENACAO[0][0], rotuloPadrao], ...OPCOES_ORDENACAO.slice(1)] : OPCOES_ORDENACAO;
  if(ocultarInicio) opcoes = opcoes.filter(([val])=> val !== 'data-inicio');
  return `
    <div class="ordenar-wrap">
      <button type="button" class="icon-btn ${valorAtual!=='padrao'?'ordenar-ativo':''}" data-action="toggle-ordenar-menu" data-menu-id="${menuId}" title="Ordenar">${ICON_FUNNEL}</button>
      ${aberto ? `
        <div class="date-menu ordenar-menu">
          <div class="date-menu-title">Ordenar por</div>
          <div class="date-menu-list">
            ${opcoes.map(([val,label])=>`<button class="date-menu-item ${valorAtual===val?'active':''}" data-action="escolher-ordenar" data-menu-id="${menuId}" data-valor="${val}">${label}</button>`).join('')}
          </div>
        </div>
      ` : ''}
    </div>
  `;
}
function ordenarPorCriterio(lista, criterio, campoNome, campoInicio, campoVenda){
  if(criterio === 'alfabetica') return [...lista].sort((a,b)=> (a[campoNome]||'').localeCompare(b[campoNome]||'', 'pt-BR'));
  if(criterio === 'recentes') return [...lista].sort((a,b)=> new Date(b.createdAt||0) - new Date(a.createdAt||0));
  if(criterio === 'data-inicio') return [...lista].sort((a,b)=> String(a[campoInicio]||'').localeCompare(String(b[campoInicio]||'')));
  if(criterio === 'data-venda') return [...lista].sort((a,b)=> String(a[campoVenda]||'').localeCompare(String(b[campoVenda]||'')));
  return lista; // 'padrao' — não mexe na ordem
}
// Reordena de verdade (e salva) os cards de cada coluna do funil atual, conforme o
// critério escolhido. Como isso sobrescreve a ordem manual que a pessoa possa ter
// arrastado com cuidado, confirma antes — exceto ao voltar pra "padrao", que não
// mexe em nada, só para de aplicar ordenação automática daqui pra frente.
function aplicarOrdenacaoPipeline(criterio){
  if(criterio === 'padrao'){ pipelineOrdenarPor = 'padrao'; renderApp(); return; }
  showConfirm({ chave:'reordenar-auto',
    message: 'Isso vai reordenar automaticamente os clientes dentro de cada coluna. Se você tiver organizado numa ordem específica que funciona melhor pra você, ela será substituída. Continuar?',
    confirmLabel: 'Reordenar',
    danger: false,
    onConfirm: async ()=>{
      closeConfirm();
      pipelineOrdenarPor = criterio;
      pipelineOrdenando = true;
      renderApp();
      const colunasDoFunil = board.columns.filter(c=>c.funilId===funilAtualId);
      try{
        for(const col of colunasDoFunil){
          const cardsDaColuna = cardsOf(col.id);
          const ordenados = ordenarPorCriterio(cardsDaColuna, criterio, 'cliente', 'mesInicioContato', 'mes');
          await Promise.all(ordenados.map((card, i)=>{
            const novaOrdem = (i+1)*1000;
            card.ordem = novaOrdem; // otimista
            return apiRequest('PUT', `/cards/${card.id}/move`, { columnId: col.id, ordem: novaOrdem });
          }));
        }
      }catch(e){
        errorMsg = 'Não foi possível reordenar todos os clientes. Tenta de novo em instantes.';
      }
      pipelineOrdenando = false;
      renderApp();
    },
  });
}
/* ---------- contatos duplicados (mesmo telefone) ---------- */
// mesma chave do servidor (utils/telefone.js): só dígitos, sem 55, sem o 9 extra do celular
function chaveTelefone(tel){
  let d = String(tel || '').replace(/\D/g, '');
  if((d.length === 12 || d.length === 13) && d.startsWith('55')) d = d.slice(2);
  if(d.length === 11 && d[2] === '9') d = d.slice(0, 2) + d.slice(3);
  return d.length === 10 ? d : null;
}
function gruposDuplicadosLocal(){
  const cont = new Map();
  board.cards.forEach(c=>{ if(c.arquivado) return; const k = chaveTelefone(c.telefone); if(k) cont.set(k, (cont.get(k) || 0) + 1); });
  return [...cont.values()].filter(n=> n > 1).length;
}
let duplicados = null; // { grupos, escolha: {chave: idQueFica}, juntando: chave|null, erro }
async function abrirDuplicadosModal(){
  duplicados = { grupos: null, escolha: {}, juntando: null, erro: '' };
  renderDuplicadosModal();
  try{
    const r = await apiRequest('GET', '/cards/duplicados');
    duplicados.grupos = r.grupos || [];
    // fica, por padrão, o contato que já tem a venda (em Ganho ou com fechamento); senão o mais antigo
    const temVenda = (c)=>{ const card = board.cards.find(k=> k.id === c.id); const col = card && board.columns.find(k=> k.id === card.columnId); return !!(card && ((col && col.tipo === 'ganho') || (card.fechamento && !card.fechamento.cancelado))); };
    duplicados.grupos.forEach(g=>{ duplicados.escolha[g.chave] = (g.contatos.find(temVenda) || g.contatos[0]).id; });
  }catch(e){ duplicados.erro = e.message || 'Não foi possível procurar os duplicados.'; }
  renderDuplicadosModal();
}
function fecharDuplicadosModal(){
  duplicados = null;
  const root = document.getElementById('modal-root'); if(root) root.innerHTML = '';
}
function renderDuplicadosModal(){
  const root = document.getElementById('modal-root');
  if(!duplicados){ root.innerHTML = ''; return; }
  const d = duplicados;
  root.innerHTML = `
    <div class="overlay" id="dup-overlay">
      <div class="modal modal-lg" role="dialog" aria-modal="true" aria-labelledby="dup-titulo">
        <div class="modal-head"><h3 id="dup-titulo">Contatos duplicados</h3><button id="dup-fechar" aria-label="Fechar">✕</button></div>
        <div class="modal-body">
          <p class="settings-page-note" style="margin:0;">Contatos com o mesmo telefone. Escolha qual fica: o histórico, os anexos, as tarefas e as etiquetas dos outros passam para ele, e os outros vão para os arquivados.</p>
          ${d.erro ? `<p class="settings-page-msg erro">${esc(d.erro)}</p>` : ''}
          ${!d.grupos ? '<p class="settings-page-note">Procurando…</p>' : !d.grupos.length ? '<p class="dash-empty">Nenhum contato duplicado. Tudo certo!</p>' : d.grupos.map(g=>`
            <fieldset class="dup-grupo">
              <legend>${esc(g.contatos[0].telefone || g.chave)} · ${g.contatos.length} contatos</legend>
              ${g.contatos.map(c=>`
                <label class="dup-opcao">
                  <input type="radio" name="dup-${g.chave}" value="${c.id}" data-dup-chave="${g.chave}" ${d.escolha[g.chave]===c.id?'checked':''} />
                  <span><b>${esc(c.cliente || 'Sem nome')}</b><small>${esc(c.etapa || '—')} · ${fmtBRL(c.valor)} · desde ${new Date(c.criadoEm).toLocaleDateString('pt-BR')}${c.etiquetas.length ? ' · ' + c.etiquetas.map(esc).join(', ') : ''}</small></span>
                </label>`).join('')}
              <button type="button" class="btn-primary" data-dup-juntar="${g.chave}" ${d.juntando ? 'disabled' : ''}>${d.juntando===g.chave ? 'Juntando…' : 'Juntar neste'}</button>
            </fieldset>`).join('')}
        </div>
      </div>
    </div>`;
  document.getElementById('dup-fechar').addEventListener('click', fecharDuplicadosModal);
  document.getElementById('dup-overlay').addEventListener('click', (e)=>{ if(e.target.id === 'dup-overlay') fecharDuplicadosModal(); });
  root.querySelectorAll('[data-dup-chave]').forEach(r=> r.addEventListener('change', ()=>{ d.escolha[r.dataset.dupChave] = r.value; }));
  root.querySelectorAll('[data-dup-juntar]').forEach(b=> b.addEventListener('click', ()=> juntarDuplicados(b.dataset.dupJuntar)));
}
async function juntarDuplicados(chave){
  const d = duplicados; if(!d || d.juntando) return;
  const g = d.grupos.find(x=> x.chave === chave); if(!g) return;
  const manterId = d.escolha[chave];
  const juntarIds = g.contatos.map(c=> c.id).filter(id=> id !== manterId);
  const fica = g.contatos.find(c=> c.id === manterId);
  if(!(await confirmarAcao({ titulo:'Juntar contatos?', mensagem:`${juntarIds.length === 1 ? 'O outro contato vai' : `Os outros ${juntarIds.length} contatos vão`} para os arquivados, e tudo deles passa para "${fica ? fica.cliente : ''}".`, botao:'Juntar', perigo:false, sempre:true }))) return;
  d.juntando = chave; d.erro = ''; renderDuplicadosModal();
  try{
    await apiRequest('POST', '/cards/unificar', { manterId, juntarIds });
    d.grupos = d.grupos.filter(x=> x.chave !== chave);
    await loadBoard();
    renderApp();
  }catch(e){ d.erro = e.message || 'Não foi possível juntar.'; }
  d.juntando = null;
  if(duplicados) renderDuplicadosModal();
}

function filteredLeads(){
  let list = board.cards;
  list = list.filter(c=> mostrarArquivados ? c.arquivado : !c.arquivado);
  if(leadsStatusFilter) list = list.filter(c=>c.columnId===leadsStatusFilter);
  if(leadsSearch.trim()){
    const q = leadsSearch.trim().toLowerCase();
    list = list.filter(c=> (c.cliente||'').toLowerCase().includes(q) || (c.telefone||'').toLowerCase().includes(q));
  }
  list = ordenarPorCriterio(list, leadsOrdenarPor, 'cliente', 'mesInicioContato', 'mes');
  return list;
}
