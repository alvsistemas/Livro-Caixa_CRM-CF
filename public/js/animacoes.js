/* Animações de transição — CRM, Controle financeiro, PDV e a tela de escolha.

   As telas são redesenhadas inteiras (innerHTML) a cada mudança, então um elemento que "continua
   aberto" é, na verdade, apagado e criado de novo. Este arquivo observa o que entra e sai do
   documento em cada redesenho (MutationObserver) e compara: se um menu/janela/bloco apareceu sem
   ter existido no desenho anterior, ele ENTRA com animação; se sumiu sem ser recriado, um
   "fantasma" (cópia sem cliques) faz a SAÍDA. Assim nenhum código das telas precisa saber disso.

   Tipos (lista REGRAS abaixo):
   - janela: fundo escuro + caixa (modais, confirmações). Entra com fade + caixa subindo; sai ao contrário.
   - menu:   listas que abrem por cima (datas, ordenar, coluna, notificações…). Entra/sai com fade + leve deslize.
   - abre:   blocos que abrem no meio da página (insights, novo funil…). Cresce/encolhe de altura.
   - aviso:  avisos e toasts. Entra/sai com fade.
   - estado: botões/abas/setas que mudam de classe (ativo, aberta…). A classe antiga é aplicada por um
             instante para o CSS fazer a transição (cor, giro da seta, gaveta lateral).
   - item:   item novo numa lista (tarefa, mensagem, lançamento). Entra com fade (só quando são poucos).
   - troca:  qualquer elemento com data-anim-troca="valor" (página, mês, etapa, seção). Quando o valor
             muda, o conteúdo novo entra; com data-anim-ordem="n" desliza para o lado certo (n maior =
             vem da direita). Grupo: data-anim-grupo (padrão: "pagina").

   "Menos animação" (Acessibilidade) ou o aparelho pedindo menos movimento: nada disso roda.
   Para acrescentar um elemento: ponha o seletor numa das listas abaixo, ou use data-anim-troca. */
(function () {
  'use strict';
  if (window.Animar) return;
  const html = document.documentElement;
  const semMov = () => html.classList.contains('a11y-sem-movimento') || !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

  const REGRAS = [
    // ---- janelas (fundo + caixa)
    { tipo: 'janela', sel: '.overlay, .modal-overlay, .modal-fundo, .cf-fundo, .ac-fundo, .instalar-fundo, .ass-modal-fundo, .conversas-overlay-backdrop' },
    // ---- menus que abrem por cima
    { tipo: 'menu', sel: '.date-menu, .col-menu, .extras-menu, .notif-panel, .tipo-pessoa-dropdown, .busca-global-resultados, .sugestoes, .menu-flutuante, .filtros-menu, .acoes-menu' },
    // ---- blocos que abrem no meio da página
    { tipo: 'abre', sel: '.pipeline-insights-conteudo, .equipes-nova, .anim-abre, .leads-bulk-bar, .integ-detalhe' },
    // ---- avisos
    { tipo: 'aviso', sel: '.mensagem-salvo-toast, .error-banner, .settings-page-msg, .aviso-flutuante' },
    // ---- estados que mudam de classe
    { tipo: 'estado', sel: '.app-shell', classes: ['sidebar-open'], alvos: ['.sidebar', '.sidebar-backdrop'], props: ['transform', 'opacity'], dur: 260 },
    { tipo: 'estado', sel: '.tab-btn, .chip, .etapa-chip-mobile, .nav-item, .config-sidebar-item, .tipo-pessoa-select-btn, .tab, .aba, .filtro, .auth-tab, .quiz-opcao, .opcao, .temp-btn, .pill, .mais-item, .menu-btn',
      classes: ['active', 'ativo', 'ativa', 'selected', 'selecionado', 'escolhida', 'on', 'active-quente', 'active-morno', 'active-frio'] },
    { tipo: 'estado', sel: '.dash-panel-seta, .auditoria-toggle-seta, .nav-mais-seta, .seta-abre, .acordeao-seta, .a11y-chave, .switch, .toggle-switch',
      classes: ['aberta', 'aberto', 'ligada', 'ligado', 'on', 'active', 'checked'] },
    // ---- itens novos em listas
    { tipo: 'item', sel: '.task-item, .tarefa-item, .chat-msg, .chat-interno-msg, .notif-item, .comentario-item, .timeline-item, .tx-row, .lanc-card, .carrinho-item, .item-carrinho, .pedido-card, .membro-card, .equipe-card' },
  ];
  const DUR = { janela: 220, menu: 160, abre: 220, aviso: 200, troca: 260, item: 260 };

  const chave = (el) => el.id || (el.dataset && (el.dataset.animId || el.dataset.cardId || el.dataset.colId || el.dataset.menuId || el.dataset.id
    || el.dataset.page || el.dataset.secao || el.dataset.tab || el.dataset.mode || el.dataset.subtab || el.dataset.a || el.dataset.action)) || '';

  // encontra, dentro de uma lista de nós, os elementos que casam com o seletor (incluindo o próprio nó)
  function achar(nos, sel) {
    const out = [];
    nos.forEach((n) => {
      if (n.nodeType !== 1 || n.dataset.animFantasma) return;
      if (n.matches(sel)) out.push(n);
      n.querySelectorAll(sel).forEach((x) => { if (!x.closest('[data-anim-fantasma]')) out.push(x); });
    });
    return out;
  }
  // identidade estável entre um desenho e o próximo: regra + chave + ordem de aparição
  function indexar(lista, regraId) {
    const conta = {}; const mapa = new Map();
    lista.forEach((el) => {
      const k = regraId + '|' + (el.dataset.animGrupo || '') + '|' + chave(el) + '|' + (el.className && el.className.baseVal === undefined ? String(el.className).split(' ')[0] : '');
      conta[k] = (conta[k] || 0) + 1;
      mapa.set(k + '#' + conta[k], el);
    });
    return mapa;
  }

  // posição e aparência dos menus/avisos abertos, guardadas para o fantasma da saída
  const ultimo = new Map(); // elemento -> { rect, estilo, z }
  const PROPS = ['background-color', 'background-image', 'color', 'border-top', 'border-right', 'border-bottom', 'border-left', 'border-radius', 'box-shadow',
    'padding', 'font-family', 'font-size', 'font-weight', 'line-height', 'display', 'flex-direction', 'gap', 'align-items', 'justify-content', 'text-align', 'overflow'];
  function guardar(el) {
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) return;
    const cs = getComputedStyle(el);
    ultimo.set(el, { rect: r, estilo: PROPS.map((p) => p + ':' + cs.getPropertyValue(p)).join(';'), z: cs.zIndex });
  }
  function guardarAbertos() {
    REGRAS.forEach((rg) => {
      if (rg.tipo !== 'menu' && rg.tipo !== 'aviso' && rg.tipo !== 'abre') return;
      document.querySelectorAll(rg.sel).forEach((el) => { if (!el.closest('[data-anim-fantasma]')) guardar(el); });
    });
  }
  let rafRolagem = 0;
  window.addEventListener('scroll', () => { if (!rafRolagem) rafRolagem = requestAnimationFrame(() => { rafRolagem = 0; guardarAbertos(); }); }, true);
  window.addEventListener('resize', () => guardarAbertos());

  const z = () => (window.zoomDaTela ? window.zoomDaTela() : 1);
  function fantasmaBase(el) {
    const f = el.cloneNode(true);
    f.dataset.animFantasma = '1';
    f.setAttribute('aria-hidden', 'true');
    f.inert = true;
    f.querySelectorAll('[id]').forEach((x) => x.removeAttribute('id'));
    return f;
  }
  function tirarDepois(f, ms) { setTimeout(() => f.remove(), ms + 40); }

  function sairJanela(el) {
    const f = fantasmaBase(el);
    f.style.pointerEvents = 'none';
    f.classList.add('anim-janela-sai');
    document.body.appendChild(f);
    tirarDepois(f, DUR.janela);
  }
  function sairFlutuante(el, tipo) {
    const g = ultimo.get(el); if (!g) return;
    const f = fantasmaBase(el);
    const k = z();
    f.style.cssText = g.estilo + `;position:fixed;margin:0;left:${g.rect.left / k}px;top:${g.rect.top / k}px;width:${g.rect.width / k}px;height:${g.rect.height / k}px;` +
      `z-index:${g.z === 'auto' ? 300 : g.z};pointer-events:none;max-height:none;box-sizing:border-box;transform:none;right:auto;bottom:auto;`;
    f.classList.add(tipo === 'aviso' ? 'anim-aviso-sai' : 'anim-menu-sai');
    document.body.appendChild(f);
    tirarDepois(f, DUR[tipo]);
  }
  // bloco no meio da página que fechou: um fantasma no mesmo lugar encolhe até sumir
  const ancoras = new WeakMap(); // bloco -> { acao, sobe }
  function guardarAncora(el) {
    // o botão que abriu este bloco costuma estar logo antes dele (ou antes de um dos 3 pais)
    let p = el;
    for (let sobe = 0; p && p !== document.body && sobe <= 3; p = p.parentElement, sobe++) {
      for (let ant = p.previousElementSibling; ant; ant = ant.previousElementSibling) {
        const b = ant.matches('[data-action],[data-a]') ? ant : ant.querySelector('[data-action],[data-a]');
        if (!b) continue;
        const acao = b.getAttribute('data-action') ? `[data-action="${b.getAttribute('data-action')}"]` : `[data-a="${b.getAttribute('data-a')}"]`;
        let n = 0; for (let x = b; x && x !== ant; x = x.parentElement) n++;
        ancoras.set(el, { acao, n });
        return;
      }
    }
  }
  function sairAbre(el) {
    const g = ultimo.get(el); const a = ancoras.get(el);
    if (!g || !a) return;
    let b = document.querySelector(a.acao); if (!b) return;
    for (let i = 0; i < a.n && b; i++) b = b.parentElement;
    if (!b || !b.parentNode || b.closest('[data-anim-fantasma]')) return;
    const h = g.rect.height / z();
    const f = fantasmaBase(el);
    f.style.pointerEvents = 'none';
    f.style.overflow = 'hidden';
    f.style.height = h + 'px';
    b.after(f);
    const anim = f.animate([{ height: h + 'px', opacity: 1 }, { height: '0px', opacity: 0, marginTop: '0px', marginBottom: '0px', paddingTop: '0px', paddingBottom: '0px' }],
      { duration: DUR.abre, easing: 'cubic-bezier(.4,0,.2,1)' });
    anim.onfinish = () => f.remove();
    setTimeout(() => f.remove(), DUR.abre + 80);
  }

  // animações em andamento, para continuar do mesmo ponto se a tela for redesenhada no meio delas
  const corridas = new Map(); // identidade -> { classe | quadros, inicio, dur }
  function entrar(el, classe, ms, id, atraso = 0) {
    el.classList.add(classe);
    if (atraso) el.style.setProperty('--anim-atraso', -atraso + 'ms');
    if (id && !atraso) corridas.set(id, { classe, inicio: Date.now(), dur: ms });
    const tirar = () => { el.classList.remove(classe); el.style.removeProperty('--anim-atraso'); };
    el.addEventListener('animationend', function fim(ev) { if (ev.target === el) { tirar(); el.removeEventListener('animationend', fim); } });
    setTimeout(tirar, ms - atraso + 120);
  }
  function animarQuadros(alvos, quadros, dur, id, atraso = 0) {
    alvos.forEach((a, i) => {
      if (!a || !quadros[i]) return;
      const an = a.animate(quadros[i], { duration: dur, easing: 'cubic-bezier(.2,.8,.2,1)' });
      if (atraso) an.currentTime = atraso;
    });
    if (id && !atraso) corridas.set(id, { quadros, inicio: Date.now(), dur });
  }
  // o elemento foi redesenhado no meio de uma animação: continua de onde estava
  function continuar(el, id, alvosDe) {
    const c = corridas.get(id); if (!c) return false;
    const passou = Date.now() - c.inicio;
    if (passou >= c.dur) { corridas.delete(id); return false; }
    if (c.classe) entrar(el, c.classe, c.dur, null, passou);
    else animarQuadros(alvosDe(el), c.quadros, c.dur, null, passou);
    return true;
  }
  function entrarAbre(el, id) {
    const h = el.offsetHeight; if (!h) return;
    animarQuadros([el], [[{ height: '0px', opacity: 0, overflow: 'hidden' }, { height: h + 'px', opacity: 1, overflow: 'hidden' }]], DUR.abre, id);
  }

  const vistos = {}; // grupo de troca -> último { k, o }
  let comecou = Date.now();
  let pausa = 0;
  function processar(registros) {
    if (semMov() || Date.now() < pausa) { guardarAbertos(); return; }
    const add = [], rem = [];
    registros.forEach((r) => { r.addedNodes.forEach((n) => add.push(n)); r.removedNodes.forEach((n) => rem.push(n)); });
    if (!add.length && !rem.length) return;
    const inicio = Date.now() - comecou < 900;

    // ---- trocas (página, mês, etapa…): compara com o último valor visto de cada grupo
    // (e não só com o desenho anterior: assim um "Carregando…" no meio não atrapalha)
    let houveTroca = false;
    achar(add, '[data-anim-troca]').forEach((el) => {
      const g = el.dataset.animGrupo || 'pagina';
      const ant = vistos[g];
      vistos[g] = { k: el.dataset.animTroca, o: parseFloat(el.dataset.animOrdem) };
      if (!ant || ant.k === el.dataset.animTroca) { continuar(el, 't|' + g, (x) => [x]); return; }
      houveTroca = true;
      const o0 = ant.o, o1 = vistos[g].o;
      const classe = Number.isFinite(o0) && Number.isFinite(o1) && o0 !== o1 ? (o1 > o0 ? 'anim-vem-direita' : 'anim-vem-esquerda')
        : g === 'pagina' ? 'anim-pagina' : 'anim-troca';
      entrar(el, classe, DUR.troca, 't|' + g);
    });

    REGRAS.forEach((rg, i) => {
      const novos = achar(add, rg.sel), velhos = achar(rem, rg.sel);
      if (!novos.length && !velhos.length) return;
      const mN = indexar(novos, i), mV = indexar(velhos, i);
      if (rg.tipo === 'estado') {
        const alvosDe = (el) => (rg.alvos ? rg.alvos.map((a) => el.querySelector(a)) : [el]);
        const props = rg.props || ['transform', 'translate', 'rotate', 'background-color', 'color', 'border-color', 'box-shadow', 'opacity'];
        const ler = (alvos) => alvos.map((a) => { if (!a) return null; const cs = getComputedStyle(a); const o = {}; props.forEach((p) => { o[p.replace(/-([a-z])/g, (m, l) => l.toUpperCase())] = cs.getPropertyValue(p); }); return o; });
        mN.forEach((el, k) => {
          const id = 'e' + i + '|' + k;
          const v = mV.get(k); if (!v) return;
          const muda = rg.classes.filter((c) => v.classList.contains(c) !== el.classList.contains(c));
          if (!muda.length) { continuar(el, id, alvosDe); return; }
          const alvos = alvosDe(el);
          // lê os dois estados sem a transição do CSS (senão o valor lido ainda seria o antigo)
          alvos.forEach((a) => a && a.style.setProperty('transition', 'none', 'important'));
          muda.forEach((c) => el.classList.toggle(c));
          const de = ler(alvos);
          muda.forEach((c) => el.classList.toggle(c));
          const para = ler(alvos);
          alvos.forEach((a) => a && a.style.removeProperty('transition'));
          const quadros = alvos.map((a, j) => (a && de[j] && JSON.stringify(de[j]) !== JSON.stringify(para[j]) ? [de[j], para[j]] : null));
          if (quadros.some(Boolean)) animarQuadros(alvos, quadros, rg.dur || 240, id);
        });
        return;
      }
      if (rg.tipo === 'item') {
        if (inicio || houveTroca) return;
        const soNovos = [...mN].filter(([k]) => !mV.has(k)).map(([, el]) => el);
        if (soNovos.length && soNovos.length <= 3 && mV.size) soNovos.forEach((el) => entrar(el, 'anim-item-entra', DUR.item));
        return;
      }
      if (rg.tipo === 'janela') {
        const entram = [...mN].filter(([k]) => !mV.has(k)).map(([, el]) => el);
        const saem = [...mV].filter(([k]) => !mN.has(k)).map(([, el]) => el);
        if (entram.length && saem.length) {
          // uma janela virou outra (ex.: escolher o tipo -> formulário): só a caixa nova entra, o fundo fica
          entram.forEach((el) => { if (el.firstElementChild) entrar(el.firstElementChild, 'anim-troca', DUR.troca); });
          return;
        }
      }
      // janela / menu / abre / aviso
      mN.forEach((el, k) => {
        const id = 'r' + i + '|' + k;
        if (mV.has(k)) { continuar(el, id, (x) => [x]); return; } // já estava aberto: só foi redesenhado
        if (rg.tipo === 'abre') { if (!inicio && !houveTroca) entrarAbre(el, id); }
        else if (!(inicio && rg.tipo !== 'janela')) entrar(el, 'anim-' + rg.tipo + '-entra', DUR[rg.tipo], id);
      });
      if (houveTroca && rg.tipo !== 'janela') return; // trocou de página: o que estava aberto some junto
      mV.forEach((el, k) => {
        if (mN.has(k)) return;
        if (rg.tipo === 'janela') sairJanela(el);
        else if (rg.tipo === 'abre') sairAbre(el);
        else sairFlutuante(el, rg.tipo);
      });
    });
    guardarAbertos();
    REGRAS.forEach((rg) => { if (rg.tipo === 'abre') document.querySelectorAll(rg.sel).forEach((el) => { if (!ancoras.has(el)) guardarAncora(el); }); });
  }

  const obs = new MutationObserver(processar);
  function ligar() { obs.observe(document.body, { childList: true, subtree: true }); comecou = Date.now(); }
  if (document.body) ligar(); else document.addEventListener('DOMContentLoaded', ligar);

  // Para um contêiner que fica na tela e só tem o conteúdo trocado (ex.: <main> do financeiro e do PDV):
  // chame depois de redesenhar. Mesmo grupo e ordem diferente = desliza; grupo diferente = fade.
  function trocar(el, chaveNova, op = {}) {
    if (!el) return;
    const ant = el.__animUltima;
    el.__animUltima = { k: chaveNova, g: op.grupo, o: op.ordem };
    if (!ant || ant.k === chaveNova || semMov() || Date.now() < pausa) return;
    const desliza = ant.g === op.grupo && Number.isFinite(ant.o) && Number.isFinite(op.ordem) && ant.o !== op.ordem;
    ['anim-pagina', 'anim-troca', 'anim-vem-direita', 'anim-vem-esquerda'].forEach((c) => el.classList.remove(c));
    void el.offsetWidth;
    entrar(el, desliza ? (op.ordem > ant.o ? 'anim-vem-direita' : 'anim-vem-esquerda') : (op.fade || 'anim-pagina'), DUR.troca);
  }

  window.Animar = {
    trocar,
    // avisa que o grupo já está mostrando este valor (mudou sem redesenhar), para não animar depois
    marcar(grupo, chave, ordem) { vistos[grupo] = { k: String(chave), o: parseFloat(ordem) }; },
    // pausa as animações por um instante (ex.: um redesenho grande que não deve animar)
    pausar(ms = 300) { pausa = Date.now() + ms; },
    semMovimento: semMov,
  };
})();
