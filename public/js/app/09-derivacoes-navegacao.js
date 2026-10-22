/* ---------- derivações (Pipeline) ---------- */
function monthsList(){
  const set = new Set([currentMonthKey(), ...board.cards.map(c=>c.mesInicioContato).filter(Boolean).map(d=>d.slice(0,7))]);
  return Array.from(set).sort((a,b)=> a<b?1:-1);
}
function visibleCards(){
  let cards = filterMonth ? board.cards.filter(c=>c.mesInicioContato && c.mesInicioContato.slice(0,7)===filterMonth) : board.cards;
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
function sumByTipo(tipo){
  return visibleCards().reduce((s,c)=>{
    const col = board.columns.find(k=>k.id===c.columnId);
    return (col && col.tipo===tipo && col.funilId===funilAtualId) ? s + (Number(c.valor)||0) : s;
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
  const total = cards.reduce((s,c)=> s + (Number(c.valor)||0), 0);
  return total / cards.length;
}
function valorPonderadoFunil(){
  return cardsDoFunilAtual().reduce((s,c)=>{
    const col = board.columns.find(k=>k.id===c.columnId);
    if(!col || col.tipo!=='aberto') return s;
    const prob = (typeof col.probabilidade === 'number') ? col.probabilidade : 50;
    return s + (Number(c.valor)||0) * (prob/100);
  }, 0);
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
    if(!c.createdAt) return false;
    const d = new Date(c.createdAt);
    return d >= start && d <= end;
  });
}
function vendidoNoMesAtual(){
  const mesAtual = currentMonthKey();
  return board.cards.reduce((s,c)=>{
    const col = board.columns.find(k=>k.id===c.columnId);
    return (col && col.tipo==='ganho' && c.mes===mesAtual) ? s + (Number(c.valor)||0) : s;
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
async function loadMetaVendasEquipe(){
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
    else if(col.tipo === 'ganho'){ ganhoValor += Number(c.valor)||0; ganhoCount++; }
    else if(col.tipo === 'perdido'){ perdidoCount++; }
  });
  const fechados = ganhoCount + perdidoCount;
  const conversao = fechados > 0 ? Math.round((ganhoCount/fechados)*100) : 0;
  return { novosLeads: cards.length, emNegociacaoValor, emNegociacaoCount, ganhoValor, ganhoCount, conversao };
}
function stageTotals(){
  return board.columns.map(col=>{
    const total = board.cards.filter(c=>c.columnId===col.id).reduce((s,c)=> s+(Number(c.valor)||0), 0);
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
    const d = new Date(c.createdAt);
    for(let i=buckets.length-1;i>=0;i--){
      if(d >= buckets[i].date){ buckets[i].count++; break; }
    }
  });
  return buckets;
}
function renderLeadsChart(){
  const buckets = leadsPorPeriodoBuckets();
  if(!buckets.some(b=>b.count>0)){
    return `<p class="chart-empty">Nenhum lead captado nesse período ainda.</p>`;
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
const REGRAS_COMISSAO_FALLBACK_NOMES = { imovel:'Imóvel', investimento:'Investimento', servicos:'Serviços', veiculo:'Veículo', home_equity:'Home Equity', car_equity:'Car Equity' };
// Gera as <option> de tipo de carta a partir das regras de comissão carregadas — usado
// tanto no formulário do lead quanto no modal de contrato. Enquanto as regras ainda não
// carregaram (ou pra um valor salvo que não bate com nenhuma regra atual, ex: regra
// excluída depois), garante que a opção escolhida sempre apareça, sem sumir do <select>.
// Confere se a regra desse tipo de carta marca o mês como independente do lead — olha
// as regras carregadas do servidor e, se ainda não carregaram, cai no padrão conhecido
// (só Home Equity e Car Equity, historicamente).
function mesIndependenteDoTipo(tipoCarta){
  const regra = regrasComissao.find(r=>r.chave===tipoCarta);
  if(regra) return !!regra.mesIndependente;
  return tipoCarta==='home_equity' || tipoCarta==='car_equity';
}
function textoNotaMesContrato(tipoCarta){
  return mesIndependenteDoTipo(tipoCarta)
    ? 'Essa regra marca o mês como independente (pra pagamentos que podem demorar a acontecer) — mudar o mês aqui não altera o mês do lead.'
    : 'Mudar o mês aqui também atualiza o mês do lead (e vice-versa) — a não ser que a regra desse tipo marque o mês como independente.';
}
function renderOpcoesTipoCarta(valorAtual){
  const lista = regrasComissao.length
    ? regrasComissao
    : Object.keys(REGRAS_COMISSAO_FALLBACK_NOMES).map(chave=>({ chave, nome: REGRAS_COMISSAO_FALLBACK_NOMES[chave] }));
  const opcoes = (valorAtual && !lista.some(r=>r.chave===valorAtual))
    ? [...lista, { chave: valorAtual, nome: valorAtual }]
    : lista;
  return opcoes.map(r=>`<option value="${esc(r.chave)}" ${r.chave===valorAtual?'selected':''}>${esc(r.nome)}</option>`).join('');
}
// Motor genérico por blocos — espelha exatamente o back-end (comissaoCalc.js:
// calcComissaoPorBlocos). Cada bloco é "N parcelas de X% da carta cada". Serve tanto pra
// pré-visualizar um contrato quanto pra simular uma regra sendo editada na engrenagem.
function calcComissaoPorBlocosPreview(creditoValor, blocos){
  const credito = parseFloat(creditoValor) || 0;
  const lista = Array.isArray(blocos) && blocos.length ? blocos : [{ parcelas:1, percentual:0 }];
  return lista.map(b=>({
    parcelas: Math.max(1, parseInt(b.parcelas,10) || 1),
    value: Math.round(credito * (parseFloat(b.percentual)||0) * 100) / 100,
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
  imovel: [{ parcelas:10, percentual:1033.88/1000000 }, { parcelas:3, percentual:1905.61/1000000 }],
  investimento: [{ parcelas:10, percentual:1033.88/1000000 }, { parcelas:3, percentual:1905.61/1000000 }],
  servicos: [{ parcelas:10, percentual:1033.88/1000000 }, { parcelas:3, percentual:1905.61/1000000 }],
  veiculo: [{ parcelas:11, percentual:0.016/11 }],
  home_equity: [{ parcelas:1, percentual:0.011 }],
  car_equity: [{ parcelas:1, percentual:0.011 }],
};
function calcComissaoPreviewPorTipo(creditoValor, tipoCarta){
  const regra = regrasComissao.find(r=>r.chave===tipoCarta);
  const blocos = regra ? regra.blocos : (REGRAS_COMISSAO_FALLBACK[tipoCarta] || [{ parcelas:1, percentual:0 }]);
  return resumoDeBlocosPreview(calcComissaoPorBlocosPreview(creditoValor, blocos));
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
  showConfirm({
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

/* ---------- navegação entre páginas ---------- */
function goToPage(page){
  if(currentPage === page) return;
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
  if(currentPage === 'conversas') pararPollingConversa();
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
  agendamentoModalForm = null;
  templateModalForm = null;
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
    if(equipe){
      if(equipeSubTab==='chat' && !chatLoaded) loadChat();
      if(equipeSubTab==='supervisao' && equipe.souSupervisor && !supervisaoLoaded) loadSupervisao();
      if(equipeSubTab==='monitoramento' && equipe.souSupervisorDeDados && !monitoramentoLoaded) loadMonitoramento();
    }
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

