/* ================================================================
   Tela de login / cadastro
================================================================ */
const API_BASE = '/api';
let modo = 'login'; // ou 'register'

// mesma cor de destaque escolhida no painel (guardada no navegador)
document.documentElement.style.setProperty('--accent', localStorage.getItem('accentColor') || '#141414');
// mesmo modo noturno escolhido no painel
document.documentElement.setAttribute('data-theme', localStorage.getItem('darkMode') === '1' ? 'dark' : 'light');

const form = document.getElementById('auth-form');
const errorBox = document.getElementById('auth-error');
const submitBtn = document.getElementById('auth-submit');
const fieldNome = document.getElementById('field-nome');
const twofaForm = document.getElementById('twofa-form');
const twofaSubmitBtn = document.getElementById('twofa-submit');
const authDivider = document.getElementById('auth-divider');
const googleBtnContainer = document.getElementById('google-btn-container');
let tempToken2FA = null;

/* se já tem sessão, pula direto pra escolha de aplicativo */
if(localStorage.getItem('token')){
  window.location.href = 'inicio.html';
}

document.querySelectorAll('.auth-tab').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    modo = btn.dataset.mode;
    document.querySelectorAll('.auth-tab').forEach(b=> b.classList.toggle('active', b===btn));
    fieldNome.style.display = modo==='register' ? 'block' : 'none';
    submitBtn.textContent = modo==='register' ? 'Criar conta' : 'Entrar';
    errorBox.style.display = 'none';
  });
});

form.addEventListener('submit', async (e)=>{
  e.preventDefault();
  errorBox.style.display = 'none';
  submitBtn.disabled = true;

  const email = document.getElementById('a-email').value.trim();
  const senha = document.getElementById('a-senha').value;
  const nome = document.getElementById('a-nome').value.trim();

  const path = modo==='register' ? '/auth/register' : '/auth/login';
  const body = modo==='register' ? { nome, email, senha } : { email, senha };

  try{
    const res = await fetch(API_BASE + path, {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if(!res.ok){ throw new Error(data.error || 'Não foi possível concluir. Tente novamente.'); }

    if(data.requiresTwoFactor){
      tempToken2FA = data.tempToken;
      form.style.display = 'none';
      authDivider.style.display = 'none';
      googleBtnContainer.style.display = 'none';
      twofaForm.style.display = 'block';
      const codigoInput = document.getElementById('twofa-codigo');
      codigoInput.focus();
      return;
    }

    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    window.location.href = 'inicio.html';
  }catch(err){
    errorBox.textContent = err.message;
    errorBox.style.display = 'block';
  }finally{
    submitBtn.disabled = false;
  }
});

twofaForm.addEventListener('submit', async (e)=>{
  e.preventDefault();
  errorBox.style.display = 'none';
  twofaSubmitBtn.disabled = true;
  const codigo = document.getElementById('twofa-codigo').value.trim();
  try{
    const res = await fetch(API_BASE + '/auth/2fa/validar-login', {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ tempToken: tempToken2FA, codigo }),
    });
    const data = await res.json();
    if(!res.ok){ throw new Error(data.error || 'Código incorreto.'); }

    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    window.location.href = 'inicio.html';
  }catch(err){
    errorBox.textContent = err.message;
    errorBox.style.display = 'block';
  }finally{
    twofaSubmitBtn.disabled = false;
  }
});

/* ---------- "Continuar com Google" ----------
   O Client ID vem do servidor (GET /api/config/integracoes), não fica fixo aqui — assim,
   cada empresa que instalar esse painel configura o Google dela só com variáveis de
   ambiente (mesmo GOOGLE_CLIENT_ID que a sincronização com a Google Agenda já usa), sem
   precisar editar código. Client ID não é segredo, só o Client Secret é — é normal ele
   rodar no navegador. */
function initGoogleButton(clientId){
  if(!clientId){
    const fallback = document.getElementById('google-btn-fallback');
    if(fallback) fallback.style.display = 'block';
    return;
  }
  if(!window.google || !window.google.accounts){
    setTimeout(()=> initGoogleButton(clientId), 300);
    return;
  }
  google.accounts.id.initialize({
    client_id: clientId,
    callback: handleGoogleCredential,
  });
  google.accounts.id.renderButton(
    document.getElementById('google-btn-container'),
    { theme:'outline', size:'large', width:320, text:'continue_with', locale:'pt-BR' }
  );
}
fetch(API_BASE + '/config/integracoes')
  .then(res=> res.ok ? res.json() : {})
  .then(cfg=>{
    initGoogleButton(cfg.googleClientId || '');
    // "Esqueci minha senha" só aparece se o servidor tiver e-mail configurado
    if(cfg.emailRecuperacao){
      const w = document.getElementById('esqueci-wrap');
      if(w) w.style.display = 'block';
    }
  })
  .catch(()=> initGoogleButton(''));

async function handleGoogleCredential(response){
  errorBox.style.display = 'none';
  try{
    const res = await fetch(API_BASE + '/auth/google', {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ credential: response.credential }),
    });
    const data = await res.json();
    if(!res.ok){ throw new Error(data.error || 'Não foi possível entrar com o Google.'); }

    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    window.location.href = 'inicio.html';
  }catch(err){
    errorBox.textContent = err.message;
    errorBox.style.display = 'block';
  }
}


/* ---------- Recuperação de senha ----------
   1) "Esqueci minha senha" -> pede o e-mail e o servidor manda um link.
   2) O link abre esta página com ?reset=TOKEN -> mostra o formulário de nova senha. */
const esqueciForm = document.getElementById('esqueci-form');
const resetForm = document.getElementById('reset-form');
const infoBox = document.getElementById('auth-info');
const authTabs = document.querySelector('.auth-tabs');

function mostrarSomente(qual){ // 'login' | 'esqueci' | 'reset'
  form.style.display = qual==='login' ? '' : 'none';
  esqueciForm.style.display = qual==='esqueci' ? 'block' : 'none';
  resetForm.style.display = qual==='reset' ? 'block' : 'none';
  const soLogin = qual==='login';
  authTabs.style.display = soLogin ? '' : 'none';
  authDivider.style.display = soLogin ? '' : 'none';
  googleBtnContainer.style.display = soLogin ? '' : 'none';
  errorBox.style.display = 'none';
  if(qual!=='login') infoBox.style.display = 'none';
}
function mostrarInfo(texto){ infoBox.textContent = texto; infoBox.style.display = 'block'; }
function mostrarErro(texto){ errorBox.textContent = texto; errorBox.style.display = 'block'; }

document.getElementById('esqueci-link').addEventListener('click', (e)=>{
  e.preventDefault();
  mostrarSomente('esqueci');
  document.getElementById('esqueci-email').value = document.getElementById('a-email').value.trim();
  document.getElementById('esqueci-email').focus();
});
document.querySelectorAll('.voltar-login').forEach(a=> a.addEventListener('click', (e)=>{
  e.preventDefault();
  history.replaceState(null, '', location.pathname);
  mostrarSomente('login');
}));

esqueciForm.addEventListener('submit', async (e)=>{
  e.preventDefault();
  errorBox.style.display = 'none';
  const btn = document.getElementById('esqueci-submit');
  btn.disabled = true;
  try{
    const res = await fetch(API_BASE + '/auth/esqueci-senha', {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ email: document.getElementById('esqueci-email').value.trim() }),
    });
    const data = await res.json();
    if(!res.ok) throw new Error(data.error || 'Não foi possível enviar agora. Tente novamente.');
    mostrarSomente('login');
    mostrarInfo(data.mensagem || 'Se existir uma conta com esse e-mail, enviamos um link para criar uma nova senha.');
  }catch(err){
    mostrarErro(err.message);
  }finally{
    btn.disabled = false;
  }
});

const tokenReset = new URLSearchParams(location.search).get('reset');
if(tokenReset){
  mostrarSomente('reset');
}

resetForm.addEventListener('submit', async (e)=>{
  e.preventDefault();
  errorBox.style.display = 'none';
  const s1 = document.getElementById('reset-senha').value;
  const s2 = document.getElementById('reset-senha2').value;
  if(s1.length < 6){ mostrarErro('A senha precisa ter ao menos 6 caracteres.'); return; }
  if(s1 !== s2){ mostrarErro('As duas senhas não são iguais.'); return; }
  const btn = document.getElementById('reset-submit');
  btn.disabled = true;
  try{
    const res = await fetch(API_BASE + '/auth/redefinir-senha', {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ token: tokenReset, senhaNova: s1 }),
    });
    const data = await res.json();
    if(!res.ok) throw new Error(data.error || 'Não foi possível redefinir a senha.');
    history.replaceState(null, '', location.pathname); // tira o token da barra de endereço
    resetForm.reset();
    mostrarSomente('login');
    mostrarInfo('Senha alterada! Entre com a nova senha.');
  }catch(err){
    mostrarErro(err.message);
  }finally{
    btn.disabled = false;
  }
});
