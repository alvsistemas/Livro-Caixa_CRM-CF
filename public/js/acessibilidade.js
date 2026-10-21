/* Acessibilidade — vale para o CRM, o Controle financeiro, o PDV e a tela de escolha.
   Fica guardada neste aparelho (localStorage "acessibilidade") e vale nos três aplicativos.

   - Tamanho da letra: aumenta a tela inteira (CSS zoom no <html>). As medidas em vh/vw dos CSS
     são divididas por --zoom, e o código que posiciona coisas pela posição na tela usa
     window.zoomDaTela() para converter.
   - Alto contraste: textos secundários e bordas mais escuros (ou mais claros, no modo noturno).
     Liga sozinho quando o aparelho pede mais contraste (prefers-contrast: more), até a pessoa escolher.
   - Menos animação: desliga transições e animações (também segue a preferência do sistema).
   - Destacar links e botões: sublinha links e mostra um contorno forte em quem está com o foco.

   - Leitor de tela (sempre ligado, não muda nada na tela): botões só com ícone ou símbolo ganham nome
     (vem do title ou de uma lista de símbolos), ícones SVG ficam escondidos do leitor, bolinhas e
     chaves que não são <button> viram checkbox/switch acessíveis pelo teclado, e os avisos (toast) são lidos.

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

  const pede = (q) => { try { return !!(window.matchMedia && matchMedia(q).matches); } catch (e) { return false; } };
  let salvo = {};
  function ler() {
    let c = {};
    try { c = JSON.parse(localStorage.getItem(CHAVE) || '{}') || {}; } catch (e) { c = {}; }
    salvo = c;
    const letra = Math.min(LETRAS.length - 1, Math.max(0, parseInt(c.letra, 10) || 0));
    // sem escolha da pessoa, segue o aparelho
    const contraste = c.contraste === undefined ? pede('(prefers-contrast: more)') : !!c.contraste;
    const movimento = c.movimento === undefined ? pede('(prefers-reduced-motion: reduce)') : !!c.movimento;
    return { letra, contraste, movimento, links: !!c.links };
  }
  const doAparelho = (id) => salvo[id] === undefined && (id === 'contraste' || id === 'movimento');
  function gravar(c) { try { localStorage.setItem(CHAVE, JSON.stringify(c)); salvo = { ...c }; } catch (e) { /* sem armazenamento: vale só agora */ } }

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
        <span class="a11y-texto"><b>${o.nome}</b><small>${o.dica}${atual[o.id] && doAparelho(o.id) ? ' Ligado pelo seu aparelho.' : ''}</small></span>
        <span class="a11y-chave ${atual[o.id] ? 'ligada' : ''}" aria-hidden="true"><i></i></span>
      </button>`).join('')}
      ${avisosDesligados() ? `<div class="a11y-avisos"><span class="a11y-texto"><b>Avisos antes de apagar</b><small>Você pediu para não perguntar de novo em ${avisosDesligados() === 1 ? '1 tipo de exclusão' : `${avisosDesligados()} tipos de exclusão`}.</small></span><button type="button" class="a11y-voltar" data-a11y-avisos>Voltar a perguntar</button></div>` : ''}
      <p class="a11y-nota">Vale para o CRM, o Controle financeiro e o PDV, neste aparelho.</p>
    </div>`;
  }
  const avisosDesligados = () => (window.Confirmacao ? Confirmacao.quantasPuladas() : 0);
  function preencher(raiz) {
    const versao = JSON.stringify(atual) + avisosDesligados();
    (raiz || document).querySelectorAll('[data-a11y-painel]').forEach((el) => {
      if (el.dataset.a11yVersao === versao) return;
      el.dataset.a11yVersao = versao;
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
    if (o) { ev.preventDefault(); const id = o.dataset.a11yOpcao; mudar({ [id]: !atual[id] }); return; }
    const av = ev.target.closest && ev.target.closest('[data-a11y-avisos]');
    if (av && window.Confirmacao) { ev.preventDefault(); Confirmacao.voltarTodas(); preencher(); }
  });
  // outra aba (outro aplicativo) mudou: acompanha
  window.addEventListener('storage', (ev) => { if (ev.key === CHAVE) { atual = ler(); aplicar(); preencher(); window.dispatchEvent(new Event('resize')); } });

  /* ---------- leitor de tela ---------- */
  const SIMBOLOS = { '‹': 'Anterior', '›': 'Próximo', '←': 'Voltar', '→': 'Avançar', '✕': 'Fechar', '×': 'Fechar', '✎': 'Editar', '🗑': 'Excluir', '⧉': 'Duplicar', '+': 'Adicionar', '−': 'Diminuir', '-': 'Diminuir', '▾': 'Mais opções', '▼': 'Mais opções', '⋯': 'Mais opções', '…': 'Mais opções', '⋮': 'Mais opções', '⠿': 'Arrastar', '↑': 'Para cima', '↓': 'Para baixo', '⌫': 'Apagar', '✓': 'Confirmar', '🔍': 'Buscar', '🔔': 'Avisos' };
  const temTexto = (t) => /[\p{L}\p{N}]{2,}/u.test(t);
  function nomear() {
    document.querySelectorAll('button, a[href], [role="button"], summary').forEach((el) => {
      el.querySelectorAll('svg:not([aria-hidden])').forEach((sv) => sv.setAttribute('aria-hidden', 'true'));
      if (el.hasAttribute('aria-label') || el.hasAttribute('aria-labelledby')) return;
      const txt = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (temTexto(txt)) return; // já tem um nome legível
      const img = el.querySelector('img[alt]');
      const nome = el.getAttribute('title') || SIMBOLOS[txt] || (img && img.alt) || '';
      if (nome) el.setAttribute('aria-label', nome);
    });
    // bolinhas de marcar e chaves feitas com <span>: viram checkbox / switch de verdade para o leitor e o teclado
    document.querySelectorAll('.check-circle, span.switch, span.a11y-chave-falsa').forEach((el) => {
      const sw = el.classList.contains('switch');
      if (!el.hasAttribute('role')) { el.setAttribute('role', sw ? 'switch' : 'checkbox'); el.tabIndex = 0; }
      el.setAttribute('aria-checked', String(el.classList.contains(sw ? 'on' : 'checked')));
      if (!el.hasAttribute('aria-label')) {
        const rot = el.closest('label, .settings-toggle-row, tr');
        const t = rot ? (rot.querySelector('span:not(.switch):not(.switch-knob), td:nth-child(2)') || rot).textContent.trim() : '';
        el.setAttribute('aria-label', sw ? (t || el.title || 'Ligar ou desligar') : (t ? `Selecionar ${t}` : 'Selecionar todos'));
      }
    });
    // botões feitos com <div> (ex.: temperatura do cliente)
    document.querySelectorAll('.temp-btn:not([role])').forEach((el) => { el.setAttribute('role', 'button'); el.tabIndex = 0; });
    // <label> solto do lado do campo (sem "for"): liga um ao outro
    document.querySelectorAll('label:not([for])').forEach((lb) => {
      if (lb.querySelector('input, select, textarea')) return;
      let alvo = lb.nextElementSibling;
      if (alvo && !alvo.matches('input, select, textarea')) alvo = alvo.querySelector && alvo.querySelector('input, select, textarea');
      if (!alvo || alvo.type === 'hidden') return;
      if (alvo.id) lb.htmlFor = alvo.id;
      else if (!alvo.hasAttribute('aria-label')) alvo.setAttribute('aria-label', lb.textContent.replace(/\s+/g, ' ').trim());
    });
    // áreas que rolam para o lado (gráficos, resumo das Negociações): dá para rolar pelo teclado
    document.querySelectorAll('.chart-wrap, .stats, .table-wrap').forEach((el) => { if (!el.hasAttribute('tabindex') && el.scrollWidth > el.clientWidth + 2) el.tabIndex = 0; });
    // avisos que aparecem e somem: o leitor lê
    document.querySelectorAll('#toast, .toast, #toast-root').forEach((el) => { if (!el.hasAttribute('role')) { el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite'); } });
  }
  // Enter/Espaço nesses elementos que não são <button>
  document.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    const el = ev.target;
    if (!el || !el.matches || !el.matches('[role="button"], [role="checkbox"], [role="switch"]') || el.matches('button, a, input, select, textarea')) return;
    ev.preventDefault(); el.click();
  });

  let pendente = false;
  function aoMudar() {
    if (pendente) return; pendente = true;
    requestAnimationFrame(() => { pendente = false; preencher(); nomear(); });
  }
  function observar() {
    preencher(); nomear();
    new MutationObserver(aoMudar).observe(document.body, { childList: true, subtree: true });
  }
  if (document.body) observar(); else document.addEventListener('DOMContentLoaded', observar);

  window.Acessibilidade = { ler: () => ({ ...atual }), mudar, painelHtml };
})();
