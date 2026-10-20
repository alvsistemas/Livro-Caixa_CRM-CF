/* Livro-Caixa como aplicativo (PWA): registra o service worker em todas as telas e, na tela
   inicial, mostra o convite "Instalar o aplicativo" (computador e Android: janela do próprio
   navegador; iPhone/iPad: passo a passo do Safari, que não tem botão automático).
   Some quando o app já está instalado ou quando a pessoa pede "Agora não" (volta em 14 dias). */
(function () {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => { /* o site funciona sem */ }); });
  }
  const CHAVE = 'instalar-adiado-ate';
  const instalado = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const adiado = () => { try { return Number(localStorage.getItem(CHAVE) || 0) > Date.now(); } catch (e) { return false; } };
  let pedido = null; // o evento do navegador que abre a janela de instalação

  function caixa() { return document.getElementById('instalar-app'); }
  function mostrar() {
    const el = caixa();
    if (!el || instalado() || adiado()) return;
    if (!pedido && !ios) return;
    el.hidden = false;
  }
  function esconder() { const el = caixa(); if (el) el.hidden = true; }

  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); pedido = e; mostrar(); });
  window.addEventListener('appinstalled', () => { pedido = null; esconder(); });

  function passoAPassoIos() {
    const fundo = document.createElement('div');
    fundo.className = 'instalar-fundo';
    fundo.innerHTML = `<div class="instalar-janela" role="dialog" aria-modal="true" aria-label="Instalar no iPhone">
      <h2>Instalar no iPhone ou iPad</h2>
      <ol>
        <li>Abra este site no <b>Safari</b>.</li>
        <li>Toque em <b>Compartilhar</b> <span aria-hidden="true">(o quadrado com a seta para cima)</span>.</li>
        <li>Escolha <b>Adicionar à Tela de Início</b> e toque em <b>Adicionar</b>.</li>
      </ol>
      <p>O Livro-Caixa aparece como um aplicativo, com ícone próprio e tela cheia.</p>
      <button type="button" class="instalar-ok">Entendi</button>
    </div>`;
    document.body.appendChild(fundo);
    const fechar = () => fundo.remove();
    fundo.addEventListener('click', (e) => { if (e.target === fundo || e.target.closest('.instalar-ok')) fechar(); });
  }

  document.addEventListener('DOMContentLoaded', () => {
    const el = caixa();
    if (!el) return;
    el.querySelector('[data-instalar]').addEventListener('click', async () => {
      if (pedido) {
        const e = pedido; pedido = null;
        try { e.prompt(); const r = await e.userChoice; if (r && r.outcome === 'accepted') esconder(); } catch (err) { /* o navegador recusou */ }
      } else if (ios) passoAPassoIos();
    });
    el.querySelector('[data-instalar-depois]').addEventListener('click', () => {
      try { localStorage.setItem(CHAVE, String(Date.now() + 14 * 86400000)); } catch (e) { /* sem armazenamento */ }
      esconder();
    });
    mostrar();
  });
})();
