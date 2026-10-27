// CRM · 02-api.js — conversa com o servidor e carregamento inicial. Os arquivos js/crm/ são carregados em ordem pelo index.html e
// compartilham as mesmas variáveis globais (é o antigo script.js dividido, como no CRM de consórcio).
/* ---------- comunicação com a API ---------- */
/* ---------- aviso de erro: aparece uma vez só ---------- */
// O mesmo erro não reaparece por 15 s depois de dispensado (clique ou sumiço automático),
// e some sozinho depois de 8 s. Assim uma falha repetida (API fora do ar, por exemplo) não enche a tela.
let erroUltimoTexto = null, erroDispensadoEm = 0, erroTimerAuto = null;
function dispensarErro(){
  erroDispensadoEm = Date.now();
  errorMsg = null;
  if(erroTimerAuto){ clearTimeout(erroTimerAuto); erroTimerAuto = null; }
}
function erroParaMostrar(){
  if(!errorMsg) return null;
  const agora = Date.now();
  if(errorMsg === erroUltimoTexto && erroDispensadoEm && agora - erroDispensadoEm < 15000){
    errorMsg = null; // mesmo erro de novo, logo depois de dispensado: não mostra de novo
    return null;
  }
  if(errorMsg !== erroUltimoTexto || !erroTimerAuto){
    erroUltimoTexto = errorMsg;
    erroDispensadoEm = 0;
    if(erroTimerAuto) clearTimeout(erroTimerAuto);
    erroTimerAuto = setTimeout(()=>{ erroTimerAuto = null; if(errorMsg){ dispensarErro(); renderApp(); } }, 8000);
  }
  return errorMsg;
}

// Servidor acordando (Render/Neon) ou ocupado: tenta de novo sozinho, sem deslogar.
// GET sempre pode repetir; os outros métodos só quando o servidor avisa que a ação nem
// chegou a rodar (resposta 503 com "tentarDeNovo").
async function apiRequest(method, path, body, timeoutMs, tentativa){
  tentativa = tentativa || 0;
  const res = await apiRequestUmaVez(method, path, body, timeoutMs);
  if(res && res.__repetir && tentativa < 2){
    await new Promise(ok=> setTimeout(ok, tentativa ? 2500 : 1000));
    return apiRequest(method, path, body, timeoutMs, tentativa + 1);
  }
  if(res && res.__repetir) throw new Error(res.mensagem);
  return res;
}
async function apiRequestUmaVez(method, path, body, timeoutMs){
  const opts = { method, headers: {} };
  const token = getToken();
  if(token) opts.headers['Authorization'] = 'Bearer ' + token;
  if(window.Acesso) Object.assign(opts.headers, Acesso.cabecalhos()); // aparelho da loja: quem entrou com o PIN
  // gestor no funil de um consultor: só as rotas do funil vão "como" ele (o servidor confere e registra)
  if(atuandoComo && (/^\/(board|columns|cards|tasks|funis|historico-contato|campos-personalizados)(\/|\?|$)/.test(path) || /^\/financeiro\/fechamento\/(modo$|[^/]+\/depois$)/.test(path) || /^\/calendar\/agenda-mes(\?|$)/.test(path))) opts.headers['X-Atuar-Como'] = atuandoComo.userId;
  if(body !== undefined){
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const controller = new AbortController();
  const timeoutId = setTimeout(()=> controller.abort(), timeoutMs || 25000); // 25s por padrão — evita a tela travar pra sempre esperando o servidor
  opts.signal = controller.signal;
  let res;
  try{
    res = await fetch(API_BASE + path, opts);
  }catch(e){
    if(e.name === 'AbortError'){
      throw new Error('O servidor demorou demais pra responder. Tente de novo em alguns segundos.');
    }
    throw new Error('Não foi possível conectar ao servidor. Confira sua internet e tente de novo.');
  }finally{
    clearTimeout(timeoutId);
  }
  if(res.status === 401){
    logout(true);
    throw new Error('Sessão expirada.');
  }
  if(res.status === 402){
    // assinatura vencida ou teste grátis acabou: leva pra tela de planos
    window.location.href = 'assinatura.html?de=crm';
    throw new Error('Sua assinatura não está ativa.');
  }
  if(!res.ok){
    let msg = 'Erro na requisição ao servidor';
    let data = null;
    try{ data = await res.json(); if(data && data.error) msg = data.error; }catch(e){}
    // o gestor perdeu o acesso ao funil (saiu da equipe, deixou de ser gestor, o consultor saiu): volta para o próprio
    if(data && data.sairDoFunil && atuandoComo){ const nome = atuandoComo.nome; setTimeout(()=>{ sairDoFunilDe().then(()=>{ errorMsg = `Você não tem mais acesso ao funil de ${nome}. Voltamos para o seu.`; renderApp(); }); }, 0); }
    const servidorAcordando = res.status === 502 || res.status === 503 || res.status === 504;
    if(servidorAcordando && (method === 'GET' || (data && data.tentarDeNovo))){
      return { __repetir:true, mensagem: msg === 'Erro na requisição ao servidor' ? 'O servidor está acordando. Tente de novo em alguns segundos.' : msg };
    }
    throw new Error(msg);
  }
  if(res.status === 204) return null;
  return res.json();
}

/* ---------- carregamento inicial ---------- */
// link vindo de outro app (ex.: PDV "Abrir no CRM"): index.html?contato=<id> abre a ficha
let contatoDaUrl = (()=>{ try{ return new URLSearchParams(location.search).get('contato'); }catch(e){ return null; } })();
async function loadBoard(){
  try{
    const data = await apiRequest('GET', '/board');
    board = { columns: data.columns, cards: data.cards };
    errorMsg = null;
    if(contatoDaUrl){
      const id = contatoDaUrl; contatoDaUrl = null;
      try{ history.replaceState({}, '', location.pathname); }catch(e){}
      if(board.cards.some(c=> c.id === id)) setTimeout(()=>{ goToPage('leads'); openEditCard(id); }, 0);
    }
  }catch(e){
    board = { columns: [], cards: [] };
    errorMsg = 'Não foi possível carregar os dados do servidor. Verifique se a API e o MongoDB estão rodando.';
  }
  loaded = true;
  renderApp();
}
