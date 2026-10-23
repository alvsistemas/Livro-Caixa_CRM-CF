/* Livro-Caixa como aplicativo (PWA): registra o service worker em todas as telas e, na tela
   inicial, mostra o convite "Instale o Livro-Caixa".
   - Chrome/Edge (computador) e Android: abre a janela de instalação do próprio navegador.
   - iPhone/iPad: a Apple não deixa site nenhum abrir essa janela; mostramos o passo a passo
     certo para o navegador que a pessoa está usando (Safari, Chrome, Edge, Firefox).
   - Outros navegadores sem o recurso: explica o caminho pelo menu.
   "Agora não" esconde o convite por 14 dias; o link "Instalar o aplicativo" no rodapé continua
   lá para quem mudar de ideia. Já instalado (ou aberto pelo ícone), nada disso aparece.
   Como o site sabe que já foi instalado, mesmo aberto depois pelo navegador:
   - aberto pelo ícone uma vez, fica anotado neste aparelho ("instalar-feito");
   - Chrome/Edge: pergunta ao navegador (getInstalledRelatedApps, "related_applications" no manifest);
   - iPhone: o Safari não conta e não divide a memória com o app instalado, então o convite
     tem o botão "Já instalei", que esconde de vez. */
(function () {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => { /* o site funciona sem */ }); });
  }
  const CHAVE = 'instalar-adiado-ate';
  const CHAVE_OK = 'instalar-feito';
  const ua = navigator.userAgent;
  const abertoComoApp = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  const ios = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const navIos = /CriOS/.test(ua) ? 'chrome' : /EdgiOS/.test(ua) ? 'edge' : /FxiOS/.test(ua) ? 'firefox' : 'safari';
  const ler = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const gravar = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* sem armazenamento */ } };
  const adiado = () => Number(ler(CHAVE) || 0) > Date.now();
  let pedido = null; // o evento do navegador que abre a janela de instalação
  if (abertoComoApp()) gravar(CHAVE_OK, '1'); // aberto pelo ícone: este aparelho tem o app
  // pergunta ao navegador se o app está instalado (Chrome/Edge); null = o navegador não sabe dizer
  async function instaladoNoNavegador() {
    try {
      if (!navigator.getInstalledRelatedApps) return null;
      const apps = await navigator.getInstalledRelatedApps();
      return apps.length > 0;
    } catch (e) { return null; }
  }
  instaladoNoNavegador().then((sim) => { if (sim) { gravar(CHAVE_OK, '1'); atualizar(); } });

  const caixa = () => document.getElementById('instalar-app');
  const semMovimento = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // o convite "fecha como uma gaveta": encolhe e some, e o que está embaixo sobe no lugar
  function recolher(el, depois) {
    if (!el || el.hidden) { if (depois) depois(); return; }
    if (semMovimento() || !el.animate) { el.hidden = true; if (depois) depois(); return; }
    const cs = getComputedStyle(el);
    const de = { height: el.offsetHeight + 'px', opacity: 1, marginTop: cs.marginTop, paddingTop: cs.paddingTop, paddingBottom: cs.paddingBottom, borderTopWidth: cs.borderTopWidth, borderBottomWidth: cs.borderBottomWidth, transform: 'scale(1)' };
    const para = { height: '0px', opacity: 0, marginTop: '0px', paddingTop: '0px', paddingBottom: '0px', borderTopWidth: '0px', borderBottomWidth: '0px', transform: 'scale(.97)' };
    el.style.overflow = 'hidden';
    const a = el.animate([de, { ...de, opacity: 0, transform: 'scale(.97)', offset: 0.35 }, para], { duration: 520, easing: 'cubic-bezier(.4,0,.2,1)' });
    const fim = () => { el.hidden = true; el.style.overflow = ''; if (depois) depois(); };
    a.finished.then(fim).catch(fim);
  }
  // ao aparecer, desce suave (abre a gaveta)
  function abrir(el) {
    const estava = el.hidden;
    el.hidden = false;
    if (!estava || semMovimento() || !el.animate) return;
    const cs = getComputedStyle(el); const h = el.offsetHeight;
    el.style.overflow = 'hidden';
    el.animate([{ height: '0px', opacity: 0, marginTop: '0px', paddingTop: '0px', paddingBottom: '0px' }, { height: h + 'px', opacity: 1, marginTop: cs.marginTop, paddingTop: cs.paddingTop, paddingBottom: cs.paddingBottom }],
      { duration: 420, easing: 'cubic-bezier(.2,.8,.2,1)' }).finished.then(() => { el.style.overflow = ''; }).catch(() => { el.style.overflow = ''; });
  }
  const linkRodape = () => document.getElementById('instalar-link');
  /* Chrome e Edge avisam "dá para instalar" (beforeinstallprompt) toda vez que a página abre, a não
     ser que o app JÁ esteja instalado (é quando aparece "Abrir no app" na barra de endereço). Então:
     o navegador sabe instalar, a página abriu há alguns segundos e o aviso não veio = instalado. */
  const sabeInstalar = 'onbeforeinstallprompt' in window;
  let semAvisoDoNavegador = false;
  setTimeout(() => { semAvisoDoNavegador = sabeInstalar && !pedido && !ios; atualizar(); }, 4000);
  const instalado = () => abertoComoApp() || ler(CHAVE_OK) === '1' || semAvisoDoNavegador;
  function atualizar() {
    const el = caixa(); const link = linkRodape();
    const jaFeito = instalado();
    // não instalado: o link fica na página; instalado: sai da página e fica só em Ferramentas
    // (Chrome/Edge: o link só aparece quando o navegador avisar que dá para instalar, sem piscar)
    if (link) link.hidden = jaFeito || (sabeInstalar && !pedido && !ios);
    const ferr = document.getElementById('instalar-ferr'); if (ferr) ferr.hidden = !jaFeito;
    if (!el) return;
    const esconder = jaFeito || adiado() || (!pedido && !ios);
    if (esconder) { if (!el.hidden && !el.classList.contains('instalar-feito')) recolher(el); }
    else abrir(el);
  }
  function mostrarFeito() {
    gravar(CHAVE_OK, '1');
    const link = linkRodape(); if (link) link.hidden = true;
    const el = caixa(); if (!el || el.classList.contains('instalar-feito')) return;
    el.hidden = false;
    el.classList.add('instalar-feito');
    if (el.animate && !semMovimento()) el.animate([{ transform: 'scale(.98)' }, { transform: 'scale(1)' }], { duration: 260, easing: 'ease-out' });
    el.querySelector('.instalar-texto').innerHTML = '<b>Pronto, o Livro-Caixa está instalado!</b><small>Da próxima vez, abra pelo ícone na tela inicial ou na lista de aplicativos.</small>';
    el.querySelector('.instalar-botoes').innerHTML = '<button type="button" class="instalar-depois" data-instalar-fechar>Fechar</button>';
    setTimeout(() => recolher(el), 2600);
  }

  window.addEventListener('beforeinstallprompt', async (e) => {
    e.preventDefault(); pedido = e;
    // o navegador oferece instalar: só esquece o "já instalado" se ele confirmar que o app saiu
    if (ler(CHAVE_OK) === '1' && (await instaladoNoNavegador()) === false) { try { localStorage.removeItem(CHAVE_OK); } catch (x) { /* nada */ } }
    atualizar();
  });
  window.addEventListener('appinstalled', () => { pedido = null; mostrarFeito(); });

  const ICONE_COMPARTILHAR = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px"><path d="M12 3v12"/><path d="M8 7l4-4 4 4"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg>';
  function janela(titulo, html, aoFechar) {
    const fundo = document.createElement('div');
    fundo.className = 'instalar-fundo';
    fundo.innerHTML = `<div class="instalar-janela" role="dialog" aria-modal="true" aria-label="${titulo}"><h2>${titulo}</h2>${html}<button type="button" class="instalar-ok">Entendi</button></div>`;
    document.body.appendChild(fundo);
    fundo.addEventListener('click', (e) => { if (e.target === fundo || e.target.closest('.instalar-ok')) { fundo.remove(); if (aoFechar) aoFechar(); } });
  }
  function passoAPasso() {
    if (ios) {
      const passos = {
        safari: [`Toque em <b>Compartilhar</b> ${ICONE_COMPARTILHAR} na barra de baixo (no iPad, fica em cima).`, 'Role a lista e toque em <b>Adicionar à Tela de Início</b>.', 'Toque em <b>Adicionar</b>, no canto de cima.'],
        chrome: [`Toque em <b>Compartilhar</b> ${ICONE_COMPARTILHAR}, ao lado do endereço do site, em cima.`, 'Toque em <b>Adicionar à Tela de Início</b> (se não aparecer, toque em "Mais").', 'Toque em <b>Adicionar</b>.'],
        edge: ['Toque no menu <b>…</b> embaixo e depois em <b>Compartilhar</b>.', 'Toque em <b>Adicionar à Tela de Início</b>.', 'Toque em <b>Adicionar</b>.'],
        firefox: ['Toque no menu <b>☰</b> embaixo e depois em <b>Compartilhar</b>.', 'Toque em <b>Adicionar à Tela de Início</b>.', 'Toque em <b>Adicionar</b>.'],
      }[navIos];
      janela('Instalar no iPhone ou iPad', `<ol>${passos.map((p) => `<li>${p}</li>`).join('')}</ol>
        <p>Pronto: o Livro-Caixa aparece na tela de início com o ícone verde e abre em tela cheia, como um aplicativo. Precisa do iOS 16.4 ou mais novo para usar fora do Safari; no Safari funciona em qualquer versão.</p>`,
        () => { gravar(CHAVE, String(Date.now() + 14 * 86400000)); recolher(caixa()); });
      return;
    }
    janela('Instalar o aplicativo', `${instalado() ? '<p><b>Neste aparelho o Livro-Caixa já está instalado.</b> Abra pelo ícone ou pelo botão "Abrir no app", na barra de endereço. Para instalar em outro aparelho, abra o site nele e siga os passos:</p>' : ''}<ol>
      <li>Abra o <b>menu do navegador</b> (os três pontinhos <b>⋮</b> ou <b>…</b>, no canto de cima).</li>
      <li>Procure <b>Instalar Livro-Caixa</b>, <b>Instalar aplicativo</b> ou <b>Adicionar à tela inicial</b>.</li>
      <li>Confirme em <b>Instalar</b>.</li></ol>
      <p>Se a opção não aparecer, abra o site no <b>Google Chrome</b> ou no <b>Microsoft Edge</b>. Se o Livro-Caixa já estiver instalado, é só abrir pelo ícone.</p>`);
  }
  async function instalar() {
    if (pedido) {
      const e = pedido; pedido = null;
      try {
        e.prompt();
        const r = await e.userChoice;
        if (r && r.outcome === 'accepted') mostrarFeito();
        else recolher(caixa()); // recusou: o navegador só oferece de novo depois; o link do rodapé continua
      } catch (err) { passoAPasso(); }
    } else passoAPasso();
  }

  document.addEventListener('click', (ev) => {
    if (ev.target.closest('[data-instalar]')) { ev.preventDefault(); instalar(); }
    else if (ev.target.closest('[data-instalar-depois]')) { gravar(CHAVE, String(Date.now() + 14 * 86400000)); recolher(caixa()); }
    else if (ev.target.closest('[data-instalar-fechar]')) recolher(caixa());
    else if (ev.target.closest('[data-instalar-ja]')) { gravar(CHAVE_OK, '1'); recolher(caixa()); atualizar(); }
  });
  document.addEventListener('DOMContentLoaded', () => {
    // no iPhone não dá para saber se já instalou: a pessoa avisa
    const b = caixa() && caixa().querySelector('.instalar-botoes');
    if (ios && b && !b.querySelector('[data-instalar-ja]')) b.insertAdjacentHTML('beforeend', '<button type="button" class="instalar-depois" data-instalar-ja>Já instalei</button>');
    atualizar();
  });
  // aberto pelo ícone depois de instalar: nunca mostra o convite
  window.matchMedia('(display-mode: standalone)').addEventListener?.('change', atualizar);
})();
