// CRM · 19-iniciar.js — confirmação genérica e início (iniciarCrm). Os arquivos js/crm/ são carregados em ordem pelo index.html e
// compartilham as mesmas variáveis globais (é o antigo script.js dividido, como no CRM de consórcio).
/* ---------- confirmação genérica ---------- */
function showConfirm({ message, onConfirm, confirmLabel, cancelLabel, danger, chave }){
  // chave = dá pra marcar "Não perguntar de novo" (só nas coisas que não são importantes; sem chave, pergunta sempre)
  if(chave && window.Confirmacao && Confirmacao.pulada(chave)){ onConfirm(); return; }
  confirmState = { message, onConfirm };
  const root = document.getElementById('confirm-root');
  const anterior = document.activeElement;
  const rotuloConfirmar = confirmLabel || 'Excluir'; // "Excluir" continua sendo o padrão, pra não quebrar quem já chama sem passar isso
  const rotuloCancelar = cancelLabel || 'Cancelar';
  const classeConfirmar = danger===false ? 'btn-primary' : 'btn-danger';
  root.innerHTML = `
    <div class="overlay" id="confirm-overlay" style="z-index:90">
      <div class="confirm-box" role="alertdialog" aria-modal="true" aria-describedby="confirm-msg">
        <p id="confirm-msg">${esc(message)}</p>
        ${chave && window.Confirmacao ? `<label class="confirm-pular"><input type="checkbox" id="confirm-pular" /> <span>Não perguntar de novo para isto</span></label>` : ''}
        <div class="confirm-actions">
          <button class="btn-outline" id="confirm-cancel">${esc(rotuloCancelar)}</button>
          <button class="${classeConfirmar}" id="confirm-ok">${esc(rotuloConfirmar)}</button>
        </div>
      </div>
    </div>
  `;
  const fecharComTecla = (e)=>{ if(e.key==='Escape'){ e.stopPropagation(); closeConfirm(); } };
  document.addEventListener('keydown', fecharComTecla, true);
  confirmState.soltar = ()=>{ document.removeEventListener('keydown', fecharComTecla, true); if(anterior && anterior.focus && document.contains(anterior)) try{ anterior.focus(); }catch(e){} };
  document.getElementById('confirm-cancel').addEventListener('click', closeConfirm);
  document.getElementById('confirm-overlay').addEventListener('click', (e)=>{ if(e.target.id==='confirm-overlay') closeConfirm(); });
  document.getElementById('confirm-ok').addEventListener('click', ()=>{
    const pular = document.getElementById('confirm-pular');
    if(chave && pular && pular.checked) Confirmacao.pular(chave);
    const st = confirmState; if(st && st.soltar) st.soltar();
    st.onConfirm();
  });
  document.getElementById('confirm-cancel').focus(); // o padrão é não apagar
}
function closeConfirm(){ if(confirmState && confirmState.soltar) confirmState.soltar(); confirmState = null; document.getElementById('confirm-root').innerHTML=''; }

/* ---------- start ---------- */
/* Equipe: o que cada função vê no CRM (o servidor confere tudo; aqui só some da tela) */
// var: as telas podem desenhar antes desta linha rodar. Começa com o acesso guardado neste aparelho
// (equipe), para o menu já abrir só com o que a função permite; o servidor confere de novo logo depois.
var acessoCrm = (function(){ const g = window.Acesso && Acesso.guardada && Acesso.guardada(); return g ? { tipo:g.tipo, permissoes:g.permissoes || {}, gestor:!!g.gestor } : { tipo:'dono', permissoes:{}, gestor:true }; })();
const PERM_DA_PAGINA = { comissoes:'comissoes', automacoes:'config', fluxos:'config', 'import-export':'config', equipe:'config' };
function podeNaPagina(pg){ if(!acessoCrm || acessoCrm.tipo === 'dono') return true; if(pg === 'equipe') return false; /* equipe do CRM: só com login próprio */ const k = PERM_DA_PAGINA[pg] || 'crm'; return !!acessoCrm.permissoes[k]; }
function aplicarFuncaoNaTela(){
  if(!acessoCrm || acessoCrm.tipo === 'dono') return;
  document.querySelectorAll('[data-action="nav"][data-page]').forEach((el)=>{ const pg = el.dataset.page; if(pg !== 'configuracoes' && pg !== 'suporte' && !podeNaPagina(pg)) el.remove(); });
  document.querySelectorAll('.nav-mais').forEach((g)=>{ if(!g.querySelector('[data-page]')) g.remove(); });
  const r = document.querySelector('[data-action="abrir-reordenar-nav"]'); if(r) r.remove();
}
new MutationObserver(()=> aplicarFuncaoNaTela()).observe(document.body, { childList:true, subtree:true });
aplicarFuncaoNaTela();

async function iniciarCrm(){
  if(window.Acesso){
    if(!(await Acesso.exigirApp('crm', 'o CRM'))) return;
    const i = await Acesso.info();
    acessoCrm = { tipo:i.tipo, permissoes:i.permissoes || {}, gestor:!!i.gestor };
    if(i.tipo !== 'dono'){
      if(!podeNaPagina(currentPage)) currentPage = 'pipeline';
      if(!acessoCrm.gestor && configCategoriaAtiva !== 'aparencia') configCategoriaAtiva = 'aparencia';
    }
  }
  const p = acessoCrm.tipo === 'dono' ? null : acessoCrm.permissoes;
  const pode = (k)=> !p || !!p[k];
  if(window.AssistenteIA && pode('financeiro')) AssistenteIA.iniciar({
    contexto:'crm',
    // carrossel de perguntas prontas, embaixo da conversa
    sugestoes: [
      { texto:'Como está meu funil?', pergunta:'Como está meu funil de vendas agora?' },
      { texto:'Tarefas atrasadas', pergunta:'Quais tarefas estão atrasadas ou vencem hoje?' },
      { texto:'Comissões do mês', pergunta:'Quanto vou receber de comissão este mês?' },
      { texto:'Buscar um cliente', preencher:'Me mostra os dados do cliente ' },
      { texto:'Criar uma sequência', pergunta:'Como eu crio uma sequência automática?' },
      { texto:'Importar planilha', pergunta:'Como importo meus contatos de uma planilha?' },
      { texto:'Ver meu lucro', pergunta:'Qual foi meu lucro este mês no Controle financeiro?' },
    ],
    // sininho do painel: as mesmas notificações do sino do topo
    alertas: ()=> computarNotificacoes().slice(0, 20).map(n=>({
      tipo:'info',
      texto:n.texto,
      acao: n.cardId ? ()=> openEditCard(n.cardId) : null,
    })),
  });
  tratarRetornoDoGoogle();
  loadBoard();
  loadFunis();
  loadTasks();
  if(pode('config')) loadCalendarStatus();
  if(pode('comissoes')){ loadContratos(); loadRegrasComissao(); }
  loadIntegracoesConfig();
  loadCamposPersonalizados();
  loadPossiveisLeads();
  loadMetaVendas();
  loadMetaVendasEquipe();
  if(!agendaLoaded) loadAgendaMes(agendaMesAtual); // carrega em segundo plano — o Dashboard também usa eventos do Google em "Tarefas abertas"
  if(acessoCrm.tipo === 'dono') loadEquipe(); // equipe do CRM: só com login próprio
  if(pode('config')) loadWebhooksSaida();
  loadAutomacoes();
  loadFluxos();
}
if(getToken()) iniciarCrm();
