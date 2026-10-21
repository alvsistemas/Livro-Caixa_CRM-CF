/* Acessibilidade — vale para o CRM, o Controle financeiro, o PDV e a tela de escolha.
   Fica guardada neste aparelho (localStorage "acessibilidade") e vale nos três aplicativos.

   - Tamanho da letra: aumenta a tela inteira (CSS zoom no <html>). As medidas em vh/vw dos CSS
     são divididas por --zoom, e o código que posiciona coisas pela posição na tela usa
     window.zoomDaTela() para converter.
   - Alto contraste: textos secundários e bordas mais escuros (ou mais claros, no modo noturno).
   - Menos animação: desliga transições e animações (também segue a preferência do sistema).
   - Destacar links e botões: sublinha links e mostra um contorno forte em quem está com o foco.

   Para pôr o painel numa tela de configurações: <div data-a11y-painel></div>. Este arquivo
   preenche e liga sozinho, mesmo que a tela seja redesenhada depois. Carregar no <head>,
   antes dos outros scripts (assim a tela já nasce no tamanho certo). */
(function () {
  const CHAVE = 'acessibilidade';
  const LETRAS = [
    { z: 1, nome: 'Normal' },
    { z: 1.15, nome: 'Grande' },
    { z: 1.3, nome: 'Muito grande' },
  ];
  const OPCOES = [
    { id: 'contraste', nome: 'Alto contraste', dica: 'Textos e bordas mais fortes, mais fáceis de ler.' },
    { id: 'movimento', nome: 'Menos animação', dica: 'Desliga os efeitos de movimento e transição.' },
    { id: 'links', nome: 'Destacar links e botões', dica: 'Sublinha os links e mostra um contorno forte em quem está selecionado pelo teclado.' },
  ];
  const temZoom = !!(window.CSS && CSS.supports && CSS.supports('zoom', '1.1'));

  function ler() {
    let c = {};
    try { c = JSON.parse(localStorage.getItem(CHAVE) || '{}') || {}; } catch (e) { c = {}; }
    const letra = Math.min(LETRAS.length - 1, Math.max(0, parseInt(c.letra, 10) || 0));
    return { letra, contraste: !!c.contraste, movimento: !!c.movimento, links: !!c.links };
  }
  function gravar(c) { try { localStorage.setItem(CHAVE, JSON.stringify(c)); } catch (e) { /* sem armazenamento: vale só agora */ } }

  let atual = ler();
  function zoom() { return temZoom ? LETRAS[atual.letra].z : 1; }
  window.zoomDaTela = zoom;

  function aplicar() {
    const h = document.documentElement;
    if (temZoom && atual.letra) h.style.setProperty('--zoom', String(LETRAS[atual.letra].z));
    else h.style.removeProperty('--zoom');
    h.classList.toggle('a11y-zoom', temZoom && atual.letra > 0);
    h.classList.toggle('a11y-contraste', atual.contraste);
    h.classList.toggle('a11y-sem-movimento', atual.movimento);
    h.classList.toggle('a11y-links', atual.links);
  }
  aplicar();

  function painelHtml() {
    return `<div class="a11y-painel">
      <div class="a11y-rotulo" id="a11y-letra-rotulo">Tamanho da letra</div>
      <div class="a11y-letras" role="group" aria-labelledby="a11y-letra-rotulo">
        ${LETRAS.map((l, i) => `<button type="button" class="a11y-letra ${atual.letra === i ? 'ativo' : ''}" data-a11y-letra="${i}" aria-pressed="${atual.letra === i}"><span class="a11y-aa" style="font-size:${13 + i * 4}px">Aa</span>${l.nome}</button>`).join('')}
      </div>
      ${temZoom ? '' : '<p class="a11y-nota">Este navegador não permite aumentar a letra por aqui. Use o zoom do navegador (Ctrl e +).</p>'}
      ${OPCOES.map((o) => `<button type="button" class="a11y-opcao" data-a11y-opcao="${o.id}" role="switch" aria-checked="${atual[o.id]}">
        <span class="a11y-texto"><b>${o.nome}</b><small>${o.dica}</small></span>
        <span class="a11y-chave ${atual[o.id] ? 'ligada' : ''}" aria-hidden="true"><i></i></span>
      </button>`).join('')}
      <p class="a11y-nota">Vale para o CRM, o Controle financeiro e o PDV, neste aparelho.</p>
    </div>`;
  }
  function preencher(raiz) {
    (raiz || document).querySelectorAll('[data-a11y-painel]').forEach((el) => {
      if (el.dataset.a11yVersao === JSON.stringify(atual)) return;
      el.dataset.a11yVersao = JSON.stringify(atual);
      el.innerHTML = painelHtml();
    });
  }
  function mudar(novo) {
    atual = { ...atual, ...novo };
    gravar(atual); aplicar(); preencher();
    // as telas que medem a altura disponível (ex.: colunas das Negociações) refazem a conta
    window.dispatchEvent(new Event('resize'));
  }

  document.addEventListener('click', (ev) => {
    const l = ev.target.closest && ev.target.closest('[data-a11y-letra]');
    if (l) { ev.preventDefault(); mudar({ letra: parseInt(l.dataset.a11yLetra, 10) || 0 }); return; }
    const o = ev.target.closest && ev.target.closest('[data-a11y-opcao]');
    if (o) { ev.preventDefault(); const id = o.dataset.a11yOpcao; mudar({ [id]: !atual[id] }); }
  });
  // outra aba (outro aplicativo) mudou: acompanha
  window.addEventListener('storage', (ev) => { if (ev.key === CHAVE) { atual = ler(); aplicar(); preencher(); window.dispatchEvent(new Event('resize')); } });

  function observar() {
    preencher();
    new MutationObserver(() => preencher()).observe(document.body, { childList: true, subtree: true });
  }
  if (document.body) observar(); else document.addEventListener('DOMContentLoaded', observar);

  window.Acessibilidade = { ler: () => ({ ...atual }), mudar, painelHtml };
})();
