/* Tela de escolha de aplicativo — aparece logo depois do login */
(function(){
  try{ document.documentElement.setAttribute('data-theme', localStorage.getItem('darkMode') === '1' ? 'dark' : 'light'); }catch(e){}

  const token = localStorage.getItem('token');
  if(!token){ window.location.href = 'login.html'; return; }

  function sair(completo){
    if(window.Acesso){ Acesso.sair(completo === true); return; }
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
      if(res.status === 401){ sair(true); return null; }
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

  // Equipe: aparelho da loja pede quem vai usar; funcionário vê só os aplicativos da função dele
  if(window.Acesso){
    const aplicar = (i)=>{
      const esc = (t)=> String(t == null ? '' : t).replace(/[&<>"']/g, (c)=>({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
      const cartoes = { crm:'.inicio-app-crm', financeiro:'.inicio-app-fin', pdv:'.inicio-app-est' };
      Object.entries(cartoes).forEach(([app, sel])=>{ if(i.apps && i.apps[app] === false){ const el = document.querySelector(sel); if(el) el.remove(); } });
      if(i.gestor) document.getElementById('inicio-painel').hidden = false;
      if(i.tipo !== 'dono'){
        ['inicio-assinatura', 'inicio-dono'].forEach((id)=>{ const el = document.getElementById(id); if(el) el.remove(); });
        const q = document.getElementById('inicio-quem');
        if(i.operador){
          q.innerHTML = `Você está como <b>${esc(i.operador.nome)}</b> · ${esc(i.operador.funcao)}${i.tipo === 'loja' ? ' · <button type="button" class="inicio-trocar" id="inicio-trocar">Trocar pessoa</button>' : ''}`;
          q.hidden = false;
          const t = document.getElementById('inicio-trocar'); if(t) t.addEventListener('click', ()=> Acesso.trocarPessoa());
          document.getElementById('inicio-nome').textContent = `, ${String(i.operador.nome).trim().split(/\s+/)[0]}`;
        }
        if(i.tipo === 'loja'){ const s = document.getElementById('inicio-sair'); if(s) s.textContent = 'Encerrar minha vez'; }
        if(!document.querySelector('.inicio-app')){
          document.querySelector('.inicio-apps').innerHTML = '<p class="inicio-sub">A sua função ainda não tem nenhum aplicativo liberado. Fale com o gestor.</p>';
        }
      }
    };
    // o acesso guardado neste aparelho já arruma a tela; o servidor confere logo em seguida
    const guardada = Acesso.guardada && Acesso.guardada();
    if(guardada && guardada.tipo !== 'dono') aplicar(guardada);
    Acesso.garantirPessoa().then(()=> Acesso.info(true)).then(aplicar).catch(()=>{});
  }

  // Acessibilidade: abre numa janela por cima (a tela de trás não mexe)
  const janela = document.getElementById('a11y-janela');
  const abrirA11y = document.getElementById('a11y-abrir');
  if(janela && abrirA11y){
    abrirA11y.addEventListener('click', ()=>{ if(janela.showModal) janela.showModal(); else janela.setAttribute('open', ''); });
    janela.addEventListener('click', (e)=>{
      if(e.target.closest('[data-a11y-fechar]') || e.target === janela){ if(janela.close) janela.close(); else janela.removeAttribute('open'); }
    });
    janela.addEventListener('close', ()=> abrirA11y.focus());
  }
})();
