/* Tela de escolha de aplicativo — aparece logo depois do login */
(function(){
  try{ document.documentElement.setAttribute('data-theme', localStorage.getItem('darkMode') === '1' ? 'dark' : 'light'); }catch(e){}

  const token = localStorage.getItem('token');
  if(!token){ window.location.href = 'login.html'; return; }

  function sair(){
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = 'login.html';
  }
  function mostrarNome(user){
    const primeiro = user && user.nome ? String(user.nome).trim().split(/\s+/)[0] : '';
    document.getElementById('inicio-nome').textContent = primeiro ? `, ${primeiro}` : '';
  }

  try{ mostrarNome(JSON.parse(localStorage.getItem('user') || 'null')); }catch(e){}
  document.getElementById('inicio-sair').addEventListener('click', sair);

  // confere se a sessão ainda vale (e atualiza o nome, se mudou em outro aparelho)
  fetch('/api/auth/me', { headers:{ Authorization:'Bearer ' + token } })
    .then((res)=>{
      if(res.status === 401){ sair(); return null; }
      return res.ok ? res.json() : null;
    })
    .then((data)=>{
      if(data && data.user){
        localStorage.setItem('user', JSON.stringify(data.user));
        mostrarNome(data.user);
      }
    })
    .catch(()=>{ /* sem internet: deixa escolher mesmo assim */ });
})();
