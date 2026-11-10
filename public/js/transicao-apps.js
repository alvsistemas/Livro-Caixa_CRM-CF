/* =======================================================================
   Animação de abrir e fechar aplicativo (tela de escolha ⇄ CRM / Controle financeiro / PDV).

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
  const raiz = document.documentElement;
  // lido na hora: "Menos animação" pode ser ligado com o aplicativo aberto
  const reduzMovimento = () => (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) || raiz.classList.contains('a11y-sem-movimento');
  // a tela de escolha abre na raiz do site (/); /inicio.html é o endereço antigo
  const naTelaDeEscolha = location.pathname === '/' || /\/inicio\.html$/.test(location.pathname);
  const appDaPagina = /\/financeiro\//.test(location.pathname) ? 'fin'
    : /\/estoque\//.test(location.pathname) ? 'pdv'
      : (/\/index\.html$/.test(location.pathname) ? 'crm' : null);
  // cartão de cada aplicativo na tela de escolha
  const CARTAO = { crm: '.inicio-app-crm', fin: '.inicio-app-fin', pdv: '.inicio-app-est' };
  const appDoCartao = (c) => (c.classList.contains('inicio-app-fin') ? 'fin' : c.classList.contains('inicio-app-est') ? 'pdv' : 'crm');

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
    pdv: {
      nome: 'PDV',
      cor: '#9A5B1E',
      fundo: () => (escuro() ? '#14100C' : '#F7F1EA'),
      texto: () => (escuro() ? '#F0E6DA' : '#2B1A0B'),
      icone: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/></svg>',
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
  const zt = () => (window.zoomDaTela ? window.zoomDaTela() : 1); // letra maior (acessibilidade): medidas da tela ÷ zoom
  const telaCheia = () => ({ top: '0px', left: '0px', width: window.innerWidth / zt() + 'px', height: window.innerHeight / zt() + 'px', borderRadius: '0px' });
  const doRetangulo = (r, raio) => ({ top: r.top / zt() + 'px', left: r.left / zt() + 'px', width: r.width / zt() + 'px', height: r.height / zt() + 'px', borderRadius: raio });

  /* ---------- 1) Cobre a tela já no <head>, se viemos de uma transição ---------- */
  const chegada = (() => { const t = lerTransicao(); return reduzMovimento() ? null : t; })();
  if (chegada) {
    const a = APPS[chegada.app];
    raiz.style.setProperty('--transicao-fundo', a.fundo());
    raiz.classList.add('transicao-cobrindo');
  }


  function descobrir() {
    raiz.classList.add('transicao-revelando');
    setTimeout(() => raiz.classList.remove('transicao-cobrindo', 'transicao-revelando'), 360);
  }

  // voltou para a escolha: a caixa encolhe até o cartão do aplicativo
  function chegarFechando(app) {
    const cartao = document.querySelector(CARTAO[app]);
    raiz.classList.remove('transicao-cobrindo');
    if (!cartao) return;
    const caixa = criarCaixa(app);
    Object.assign(caixa.style, telaCheia());
    const r = cartao.getBoundingClientRect();
    const fundoCartao = getComputedStyle(cartao).backgroundColor;
    caixa.animate([
      { ...telaCheia(), background: APPS[app].fundo(), opacity: 1 },
      { ...doRetangulo(r, '16px'), background: fundoCartao, opacity: 1, offset: 0.85 },
      { ...doRetangulo(r, '16px'), background: fundoCartao, opacity: 0 },
    ], { duration: DURACAO_FECHAR, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' })
      .finished.then(() => caixa.remove()).catch(() => caixa.remove());
    caixa.querySelector('.transicao-conteudo').animate([{ opacity: 1 }, { opacity: 0 }], { duration: DURACAO_FECHAR * 0.6, easing: 'ease-in', fill: 'forwards' });
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
      chegarFechando(chegada.app);
    } else if (chegada) {
      descobrir();
    }

    /* ---------- 2) Abrir: clique num cartão da tela de escolha ---------- */
    if (naTelaDeEscolha) {
      document.querySelectorAll('.inicio-app').forEach((cartao) => {
        cartao.addEventListener('click', (e) => {
          if (reduzMovimento()) return; // sem animação: o link abre normal
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return; // abrir em outra aba: normal
          e.preventDefault();
          const app = appDoCartao(cartao);
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
        const link = e.target.closest && e.target.closest('a[href="/"], a[href$="inicio.html"]');
        if (!link || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        if (rodarGanchos()) return; // o aplicativo pergunta antes (ex.: mudança sem salvar)
        sairDoApp();
      }, true);
    }
  });

  /* =======================================================================
     4) Botão/gesto "voltar" do celular (e do navegador)

     Logo no primeiro toque, a página ganha uma entrada a mais no histórico
     (a "guarda"). Assim o voltar não sai direto: ele cai no "fundo" desta
     mesma página e aqui decidimos o que fazer:
       - tem janela, menu ou painel aberto → fecha só ele;
       - dentro de um aplicativo → animação de fechar e volta para a escolha;
       - na tela de escolha (celular) → "Toque de novo em voltar para sair";
         o segundo voltar, em até 2 s, sai de verdade.
     O Chrome só respeita a guarda depois que a pessoa tocou na tela, por isso
     ela é armada no primeiro toque (e de novo depois de cada voltar).
     ======================================================================= */
  const H = window.history;
  const pushOrig = H.pushState.bind(H);
  const replOrig = H.replaceState.bind(H);
  const marca = (s) => (s && typeof s === 'object' && s.lc) || null;
  const comMarca = (s, lc) => (s === null || s === undefined ? { lc } : typeof s === 'object' ? { ...s, lc } : s);
  const naBase = (s) => { const m = marca(s); return !!m && m.n === 0; };
  const celular = () => !!(window.matchMedia && window.matchMedia('(max-width: 760px), (pointer: coarse)').matches);
  const voltarAtivo = () => (appDaPagina ? true : naTelaDeEscolha ? celular() : false);
  let ultimaUrl = location.href;

  // os aplicativos continuam usando pushState/replaceState normalmente; aqui só
  // guardamos a "altura" de cada entrada (base = 0, guarda = 1, telas por cima = 2…)
  H.pushState = function (s, t, url) {
    const m = marca(H.state);
    const r = pushOrig(m ? comMarca(s, { n: m.n + 1 }) : s, t, url);
    ultimaUrl = location.href;
    return r;
  };
  H.replaceState = function (s, t, url) {
    const m = marca(H.state);
    const r = replOrig(m ? comMarca(s, m) : s, t, url);
    ultimaUrl = location.href;
    return r;
  };
  function pushGuarda() {
    const s = H.state;
    if (s !== null && s !== undefined && typeof s !== 'object') return;
    pushOrig(comMarca(s, { n: 1 }), '', location.href);
    ultimaUrl = location.href;
  }
  function armar() {
    if (!voltarAtivo()) return;
    const s = H.state;
    const m = marca(s);
    if (m && m.n > 0) return; // já tem a guarda (ou uma tela por cima dela)
    if (s !== null && s !== undefined && typeof s !== 'object') return;
    if (!m) replOrig(comMarca(s, { n: 0 }), '', location.href);
    pushGuarda();
    esconderAviso();
  }
  ['pointerdown', 'keydown'].forEach((ev) => window.addEventListener(ev, armar, true));

  /* ----- fechar o que estiver aberto por cima ----- */
  const ganchos = [];
  function rodarGanchos() { for (const fn of ganchos) { try { if (fn()) return true; } catch (e) { /* segue */ } } return false; }
  const visivel = (el) => {
    if (!el || !el.isConnected || el.hidden) return false;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const CAMADAS = '.cf-fundo, .mais-fundo, .overlay, .modal-overlay, #modal .modal-fundo, .ass-modal-fundo, dialog[open], .ferr-menu';
  const BOTAO_FECHAR = '.modal-fechar, [data-a="fechar-modal"], #modal-close, [id$="-close"], [id$="-x"], [aria-label="Fechar"], [title="Fechar"], [title="Fechar (Esc)"], [data-a11y-fechar]';
  const zIndice = (el) => { const z = parseInt(getComputedStyle(el).zIndex, 10); return Number.isFinite(z) ? z : 0; };
  function teclaEsc() {
    const alvo = document.activeElement && document.activeElement !== document.body ? document.activeElement : document;
    alvo.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }));
  }
  function fecharCamada(el) {
    if (el.matches('.cf-fundo')) { const n = el.querySelector('.cf-nao'); if (n) n.click(); else teclaEsc(); return; }
    if (el.matches('.mais-fundo')) { el.click(); return; }
    if (el.matches('.ferr-menu')) { document.body.click(); return; }
    // janela com telas por dentro (ex.: Extras do CRM): volta uma tela antes de fechar
    const voltar = [...el.querySelectorAll('.modal-head [title="Voltar"]')].find(visivel);
    if (voltar) { voltar.click(); return; }
    const botao = [...el.querySelectorAll(BOTAO_FECHAR)].find(visivel);
    if (botao) { botao.click(); return; }
    teclaEsc();
    if (el.isConnected && visivel(el)) {
      if (el.tagName === 'DIALOG') el.close();
      else el.dispatchEvent(new MouseEvent('click', { bubbles: true })); // clique no fundo escuro
    }
  }
  function fecharAberto() {
    const camadas = [...document.querySelectorAll(CAMADAS)].filter(visivel);
    if (camadas.length) {
      // a de cima: maior z-index; empate, a última na página
      const topo = camadas.reduce((a, b) => (zIndice(b) >= zIndice(a) ? b : a));
      fecharCamada(topo);
      return true;
    }
    if (rodarGanchos()) return true;
    const bolha = document.querySelector('#assistente-bolha.aberta');
    if (bolha) { bolha.click(); return true; }
    const gaveta = [...document.querySelectorAll('.sidebar-backdrop, #menu-fundo')].find(visivel);
    if (gaveta) { gaveta.click(); return true; }
    return false;
  }

  /* ----- sair do aplicativo para a tela de escolha ----- */
  const veioDaEscolha = (() => {
    try { const r = new URL(document.referrer); return r.origin === location.origin && (r.pathname === '/' || /\/inicio\.html$/.test(r.pathname)); } catch (e) { return false; }
  })();
  let saindo = false;
  let reserva = null;
  window.addEventListener('pagehide', () => { clearTimeout(reserva); saindo = false; });
  function irParaEscolha() {
    // veio da escolha: volta até ela no histórico (sem empilhar páginas a cada troca)
    const m = marca(H.state);
    const n = m ? m.n : 0;
    if (veioDaEscolha && H.length > n + 1) {
      H.go(-(n + 1));
      reserva = setTimeout(() => location.replace('/'), 900); // não voltou (ex.: aba nova): abre a escolha
    } else {
      location.replace('/');
    }
  }
  function sairDoApp() {
    if (saindo || !appDaPagina) return;
    saindo = true;
    gravarTransicao('fechar', appDaPagina);
    if (reduzMovimento()) { irParaEscolha(); return; }
    const caixa = criarCaixa(appDaPagina);
    Object.assign(caixa.style, telaCheia());
    caixa.animate([{ opacity: 0, transform: 'scale(1.03)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 220, easing: 'ease-out', fill: 'forwards' })
      .finished.then(irParaEscolha).catch(irParaEscolha);
  }

  /* ----- "Toque de novo em voltar para sair" (tela de escolha, celular) ----- */
  let aviso = null;
  let avisoTimer = null;
  function esconderAviso() { if (aviso) aviso.classList.remove('visivel'); clearTimeout(avisoTimer); }
  function avisarSaida() {
    if (!aviso) {
      aviso = document.createElement('div');
      aviso.className = 'voltar-aviso';
      aviso.setAttribute('role', 'status');
      aviso.setAttribute('aria-live', 'polite');
      document.body.appendChild(aviso);
    }
    aviso.textContent = 'Toque de novo em voltar para sair';
    void aviso.offsetWidth;
    aviso.classList.add('visivel');
    clearTimeout(avisoTimer);
    // passou o tempo sem o segundo voltar: some e a guarda volta
    avisoTimer = setTimeout(() => { aviso.classList.remove('visivel'); if (naBase(H.state)) pushGuarda(); }, 2000);
  }

  window.addEventListener('popstate', (e) => {
    if (!naBase(e.state) || !voltarAtivo()) { ultimaUrl = location.href; return; }
    // caiu no fundo: deixa o endereço como estava, para o aplicativo não trocar de aba
    if (location.href !== ultimaUrl) replOrig(e.state, '', ultimaUrl);
    if (fecharAberto()) { pushGuarda(); return; }
    if (appDaPagina) { sairDoApp(); return; }
    if (naTelaDeEscolha) avisarSaida();
  });

  // para os aplicativos: "antes de sair, deixa eu perguntar" e "agora pode sair"
  window.LCVoltar = {
    aoVoltar(fn) { if (typeof fn === 'function') ganchos.push(fn); },
    sairDoApp() { saindo = false; sairDoApp(); },
  };

  // Voltar pelo botão do navegador pode restaurar a página com a caixa ainda na tela
  window.addEventListener('pageshow', (e) => {
    if (!e.persisted) return;
    document.querySelectorAll('.transicao-caixa').forEach((c) => c.remove());
    document.querySelectorAll('.inicio-app').forEach((c) => { c.style.visibility = ''; });
    raiz.classList.remove('transicao-cobrindo', 'transicao-revelando');
    saindo = false;
    ultimaUrl = location.href;
    // voltou de um aplicativo pela memória do navegador: a caixa encolhe do mesmo jeito
    const t = lerTransicao();
    if (t && t.tipo === 'fechar' && naTelaDeEscolha && !reduzMovimento()) chegarFechando(t.app);
  });
})();
