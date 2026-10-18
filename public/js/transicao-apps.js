/* =======================================================================
   Animação de abrir e fechar aplicativo (tela de escolha ⇄ CRM / Controle financeiro).

   Abrir:  na tela de escolha, a caixa do aplicativo cresce até ocupar a tela,
           e o aplicativo aparece por baixo dela.
   Fechar: em "Trocar de aplicativo", a tela vira a "caixa" do aplicativo e,
           na tela de escolha, ela encolhe de volta para o lugar do cartão.

   As páginas são separadas, então a animação passa de uma para a outra pelo
   sessionStorage. Este arquivo é carregado no <head> das três páginas para
   cobrir a tela antes do primeiro desenho (sem "piscar").
   Quem prefere menos movimento (prefers-reduced-motion) não vê animação.
   ======================================================================= */
(function () {
  const CHAVE = 'transicao-app';
  const DURACAO_ABRIR = 460;
  const DURACAO_FECHAR = 420;
  const reduzMovimento = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const raiz = document.documentElement;
  const naTelaDeEscolha = /\/inicio\.html$/.test(location.pathname);
  const appDaPagina = /\/financeiro\//.test(location.pathname) ? 'fin' : (/\/(index\.html)?$/.test(location.pathname) ? 'crm' : null);

  const escuro = () => { try { return localStorage.getItem('darkMode') === '1'; } catch (e) { return false; } };
  const APPS = {
    crm: {
      nome: 'CRM',
      cor: '#141414',
      fundo: () => (escuro() ? '#0F0F0F' : '#FFFFFF'),
      texto: () => (escuro() ? '#F0F0F0' : '#141414'),
      icone: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="5" height="16" rx="1.2"/><rect x="10" y="4" width="5" height="11" rx="1.2"/><rect x="17" y="4" width="4" height="7" rx="1.2"/></svg>',
    },
    fin: {
      nome: 'Controle financeiro',
      cor: '#2F6F4E',
      fundo: () => (escuro() ? '#0F1311' : '#F1F4EC'),
      texto: () => (escuro() ? '#E6ECE7' : '#1C2B22'),
      icone: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19V5"/><path d="M4 19h16"/><path d="M8 15l3-4 3 2 5-6"/></svg>',
    },
  };

  function lerTransicao() {
    try {
      const t = JSON.parse(sessionStorage.getItem(CHAVE) || 'null');
      sessionStorage.removeItem(CHAVE);
      // só vale se acabou de acontecer (evita animar ao reabrir a aba horas depois)
      return t && APPS[t.app] && Date.now() - t.em < 8000 ? t : null;
    } catch (e) { return null; }
  }
  function gravarTransicao(tipo, app) {
    try { sessionStorage.setItem(CHAVE, JSON.stringify({ tipo, app, em: Date.now() })); } catch (e) { /* sem armazenamento: só não anima */ }
  }

  // "Caixa" do aplicativo: fundo do app com o ícone e o nome no meio
  function criarCaixa(app) {
    const a = APPS[app];
    const el = document.createElement('div');
    el.className = 'transicao-caixa';
    el.setAttribute('aria-hidden', 'true');
    el.style.background = a.fundo();
    el.style.color = a.texto();
    el.innerHTML = `<div class="transicao-conteudo"><span class="transicao-icone" style="background:${a.cor}">${a.icone}</span><span class="transicao-nome">${a.nome}</span></div>`;
    document.body.appendChild(el);
    return el;
  }
  const telaCheia = () => ({ top: '0px', left: '0px', width: window.innerWidth + 'px', height: window.innerHeight + 'px', borderRadius: '0px' });
  const doRetangulo = (r, raio) => ({ top: r.top + 'px', left: r.left + 'px', width: r.width + 'px', height: r.height + 'px', borderRadius: raio });

  /* ---------- 1) Cobre a tela já no <head>, se viemos de uma transição ---------- */
  const chegada = reduzMovimento ? null : lerTransicao();
  if (chegada) {
    const a = APPS[chegada.app];
    raiz.style.setProperty('--transicao-fundo', a.fundo());
    raiz.classList.add('transicao-cobrindo');
  }

  function descobrir() {
    raiz.classList.add('transicao-revelando');
    setTimeout(() => raiz.classList.remove('transicao-cobrindo', 'transicao-revelando'), 360);
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (chegada && chegada.tipo === 'abrir' && !naTelaDeEscolha) {
      // chegou no aplicativo: a "caixa" some aos poucos e mostra o app por baixo
      const caixa = criarCaixa(chegada.app);
      Object.assign(caixa.style, telaCheia());
      raiz.classList.remove('transicao-cobrindo');
      requestAnimationFrame(() => {
        caixa.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 380, delay: 120, easing: 'ease-out', fill: 'forwards' })
          .finished.then(() => caixa.remove()).catch(() => caixa.remove());
      });
    } else if (chegada && chegada.tipo === 'fechar' && naTelaDeEscolha) {
      // voltou para a escolha: a caixa encolhe até o cartão do aplicativo
      const cartao = document.querySelector(chegada.app === 'fin' ? '.inicio-app-fin' : '.inicio-app-crm');
      const caixa = criarCaixa(chegada.app);
      Object.assign(caixa.style, telaCheia());
      raiz.classList.remove('transicao-cobrindo');
      if (!cartao) { caixa.remove(); return; }
      const r = cartao.getBoundingClientRect();
      const fundoCartao = getComputedStyle(cartao).backgroundColor;
      caixa.animate([
        { ...telaCheia(), background: APPS[chegada.app].fundo(), opacity: 1 },
        { ...doRetangulo(r, '16px'), background: fundoCartao, opacity: 1, offset: 0.85 },
        { ...doRetangulo(r, '16px'), background: fundoCartao, opacity: 0 },
      ], { duration: DURACAO_FECHAR, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' })
        .finished.then(() => caixa.remove()).catch(() => caixa.remove());
      caixa.querySelector('.transicao-conteudo').animate([{ opacity: 1 }, { opacity: 0 }], { duration: DURACAO_FECHAR * 0.6, easing: 'ease-in', fill: 'forwards' });
    } else if (chegada) {
      descobrir();
    }

    if (reduzMovimento) return;

    /* ---------- 2) Abrir: clique num cartão da tela de escolha ---------- */
    if (naTelaDeEscolha) {
      document.querySelectorAll('.inicio-app').forEach((cartao) => {
        cartao.addEventListener('click', (e) => {
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return; // abrir em outra aba: normal
          e.preventDefault();
          const app = cartao.classList.contains('inicio-app-fin') ? 'fin' : 'crm';
          const destino = cartao.getAttribute('href');
          const r = cartao.getBoundingClientRect();
          const caixa = criarCaixa(app);
          const fundoCartao = getComputedStyle(cartao).backgroundColor;
          Object.assign(caixa.style, doRetangulo(r, '16px'), { background: fundoCartao });
          cartao.style.visibility = 'hidden';
          gravarTransicao('abrir', app);
          caixa.querySelector('.transicao-conteudo').animate([{ opacity: 0, transform: 'scale(.9)' }, { opacity: 1, transform: 'scale(1)' }], { duration: DURACAO_ABRIR * 0.7, delay: DURACAO_ABRIR * 0.2, easing: 'ease-out', fill: 'both' });
          caixa.animate([
            { ...doRetangulo(r, '16px'), background: fundoCartao },
            { ...telaCheia(), background: APPS[app].fundo() },
          ], { duration: DURACAO_ABRIR, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' })
            .finished.then(() => { location.href = destino; }).catch(() => { location.href = destino; });
        });
      });
    }

    /* ---------- 3) Fechar: "Trocar de aplicativo" dentro de um app ---------- */
    if (appDaPagina) {
      // delegado: a barra lateral do CRM é redesenhada o tempo todo
      document.addEventListener('click', (e) => {
        const link = e.target.closest && e.target.closest('a[href$="inicio.html"]');
        if (!link || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        const destino = link.getAttribute('href');
        const caixa = criarCaixa(appDaPagina);
        Object.assign(caixa.style, telaCheia());
        gravarTransicao('fechar', appDaPagina);
        caixa.animate([{ opacity: 0, transform: 'scale(1.03)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 220, easing: 'ease-out', fill: 'forwards' })
          .finished.then(() => { location.href = destino; }).catch(() => { location.href = destino; });
      }, true);
    }
  });

  // Voltar pelo botão do navegador pode restaurar a página com a caixa ainda na tela
  window.addEventListener('pageshow', (e) => {
    if (!e.persisted) return;
    document.querySelectorAll('.transicao-caixa').forEach((c) => c.remove());
    document.querySelectorAll('.inicio-app').forEach((c) => { c.style.visibility = ''; });
    raiz.classList.remove('transicao-cobrindo', 'transicao-revelando');
  });
})();
