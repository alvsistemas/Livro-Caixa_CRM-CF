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

async function apiRequestUmaVez(method, path, body, timeoutMs){
  const opts = { method, headers: {} };
  const token = getToken();
  if(token) opts.headers['Authorization'] = 'Bearer ' + token;
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
    const falha = new Error(e.name === 'AbortError'
      ? 'O servidor demorou demais pra responder. Tente de novo em alguns segundos.'
      : 'Não foi possível conectar ao servidor. Confira sua internet e tente de novo.');
    falha.transitorio = true; // pode ser só o servidor acordando: vale tentar de novo
    throw falha;
  }finally{
    clearTimeout(timeoutId);
  }
  if(!res.ok){
    let msg = 'Erro na requisição ao servidor';
    let dados = null;
    try{ dados = await res.json(); if(dados && dados.error) msg = dados.error; }catch(e){}
    // só vai pro login quando o servidor garante que a sessão acabou de verdade; um 401 qualquer
    // (ou um erro passageiro do servidor) não pode jogar a pessoa pra fora do sistema
    if(res.status === 401 && dados && dados.codigo === 'sessao_invalida'){
      logout();
      throw new Error('Sessão expirada.');
    }
    const falha = new Error(msg);
    if(res.status === 503 || res.status === 502 || res.status === 504) falha.transitorio = true;
    throw falha;
  }
  if(res.status === 204) return null;
  return res.json();
}

// Servidor grátis do Render dorme e leva até ~50 s pra acordar. Pedidos de leitura (GET) que falham
// por isso são repetidos sozinhos (até 3 tentativas), em vez de mostrar erro ou tela vazia na hora.
async function apiRequest(method, path, body, timeoutMs){
  const tentativas = method === 'GET' ? 3 : 1;
  for(let n = 1; ; n++){
    try{
      return await apiRequestUmaVez(method, path, body, timeoutMs);
    }catch(e){
      if(!e.transitorio || n >= tentativas) throw e;
      await new Promise(resolve=> setTimeout(resolve, 2000 * n));
    }
  }
}

/* ---------- carregamento inicial ---------- */
async function loadBoard(){
  try{
    const data = await apiRequest('GET', '/board');
    board = { columns: data.columns, cards: data.cards };
    errorMsg = null;
  }catch(e){
    board = { columns: [], cards: [] };
    errorMsg = 'Não foi possível carregar os dados do servidor. Verifique se a API e o MongoDB estão rodando.';
  }
  loaded = true;
  renderApp();
}

