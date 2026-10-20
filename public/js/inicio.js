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

  // assinatura: avisa do teste grátis / fatura vencida, e leva pros planos se estiver bloqueado
  fetch('/api/assinatura', { headers:{ Authorization:'Bearer ' + token } })
    .then((res)=> res.ok ? res.json() : null)
    .then((s)=>{
      if(!s || !s.cobranca || s.status === 'cortesia') return;
      if(!s.liberado){ window.location.href = 'assinatura.html'; return; }
      const el = document.getElementById('inicio-assinatura');
      const plano = (s.planos || []).find((p)=> p.id === s.plano);
      if(s.emTolerancia){ el.textContent = 'Sua fatura venceu · pagar agora'; el.classList.add('alerta'); }
      else if(s.emTeste){ el.textContent = `Teste grátis: ${s.diasDeTeste === 1 ? 'falta 1 dia' : `faltam ${s.diasDeTeste} dias`} · ver planos`; }
      else if(plano){ el.textContent = `Plano ${plano.nome}`; }
      else return;
      el.hidden = false;
    })
    .catch(()=>{});

  // Membro de equipe: some o aplicativo que o gestor não liberou (o servidor também bloqueia)
  fetch('/api/equipe', { headers:{ Authorization:'Bearer ' + token } })
    .then((res)=> res.ok ? res.json() : null)
    .then((r)=>{
      const p = r && r.minhasPermissoes;
      if(!p || !p.restrito) return;
      document.querySelectorAll('.inicio-app[data-aba]').forEach((el)=>{
        if(p.abas && p.abas[el.dataset.aba] === false) el.remove();
      });
    })
    .catch(()=>{});

  // Painel do dono: o link só aparece para os donos do sistema
  fetch('/api/dono/sou', { headers:{ Authorization:'Bearer ' + token } })
    .then((res)=> res.ok ? res.json() : null)
    .then((r)=>{ if(r && r.dono) document.getElementById('inicio-dono').hidden = false; })
    .catch(()=>{});
})();
