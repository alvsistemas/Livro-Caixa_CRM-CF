/* =======================================================================
   Assistente de IA do Livro-Caixa — a bolinha no canto inferior direito.
   O mesmo componente roda no CRM e no Controle financeiro: mesma IA
   (rota /api/ai/assistente), mesmo nome e a mesma conversa — ela continua
   quando a pessoa troca de aplicativo (fica guardada na aba do navegador).

   Uso:  AssistenteIA.iniciar({ contexto: 'crm' | 'financeiro', saudacao })
         AssistenteIA.definirHabilitado(true/false)   // servidor sem chave de IA
   ======================================================================= */
(function () {
  const NOME_PADRAO = 'Assistente do Livro-Caixa';
  const NOMES_ANTIGOS = ['Assistente do CRM']; // nome padrão de antes: vira o novo
  const CHAVE_CONVERSA = 'assistente-conversa';
  const ICONE_EDITAR = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';

  const lerLocal = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const gravarLocal = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* navegador sem armazenamento */ } };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const st = {
    contexto: 'crm',
    saudacao: null,
    habilitado: true,
    aberto: false,
    animando: null, // 'abrindo' | 'fechando' | null
    enviando: false,
    editandoNome: false,
    nome: NOME_PADRAO,
    mensagens: [],
    bolhaX: null, // null = posição padrão (canto inferior direito) até a pessoa arrastar
    bolhaY: null,
    drag: null,
  };

  function carregarPreferencias() {
    const nome = (lerLocal('assistente-nome') || '').trim().slice(0, 30);
    st.nome = nome && !NOMES_ANTIGOS.includes(nome) ? nome : NOME_PADRAO;
    try {
      const pos = JSON.parse(lerLocal('assistente-bolha-pos') || 'null');
      if (pos && typeof pos.x === 'number' && typeof pos.y === 'number') {
        // mantém dentro da tela (a janela pode ter mudado de tamanho desde a última vez)
        st.bolhaX = Math.min(Math.max(4, pos.x), window.innerWidth - 60);
        st.bolhaY = Math.min(Math.max(4, pos.y), window.innerHeight - 60);
      }
    } catch (e) { /* posição salva inválida: usa a padrão */ }
    try {
      const salvas = JSON.parse(sessionStorage.getItem(CHAVE_CONVERSA) || '[]');
      if (Array.isArray(salvas)) st.mensagens = salvas.filter((m) => m && typeof m.content === 'string').slice(-40);
    } catch (e) { /* sem conversa salva */ }
  }
  function guardarConversa() {
    try { sessionStorage.setItem(CHAVE_CONVERSA, JSON.stringify(st.mensagens.slice(-40))); } catch (e) { /* ignora */ }
  }

  const token = () => lerLocal('token');

  function root() {
    let el = document.getElementById('assistente-root');
    if (!el) { el = document.createElement('div'); el.id = 'assistente-root'; document.body.appendChild(el); }
    return el;
  }

  function saudacao() {
    if (typeof st.saudacao === 'function') { try { return st.saudacao(st.nome); } catch (e) { /* usa a padrão */ } }
    const quem = st.nome === NOME_PADRAO ? 'o assistente do Livro-Caixa' : st.nome;
    return st.contexto === 'financeiro'
      ? `Oi! Eu sou ${quem}. Pergunte sobre seus gastos, saldo, lucro, cartões e objetivos, ou peça uma dica. Também ajudo com o CRM.`
      : `Oi! Eu sou ${quem}. Pode perguntar qualquer coisa sobre como usar o CRM — Pipeline, Agenda, Rotina, Comissões, Fluxos — e também sobre o Controle financeiro.`;
  }

  function render() {
    const el = root();
    if (!token() || !st.habilitado) { el.innerHTML = ''; return; }
    const posBolha = st.bolhaX != null ? `left:${st.bolhaX}px; top:${st.bolhaY}px; right:auto; bottom:auto;` : '';
    el.innerHTML = `
      <button id="assistente-bolha" class="assistente-bolha" style="${posBolha}" title="${esc(st.nome)}" aria-label="${st.aberto ? 'Fechar' : 'Abrir'} ${esc(st.nome)}">${st.aberto ? '✕' : '💬'}</button>
      ${st.aberto ? `
        <div class="assistente-painel${st.animando ? ' ' + st.animando : ''}" id="assistente-painel" role="dialog" aria-label="${esc(st.nome)}">
          <div class="assistente-painel-head">
            ${st.editandoNome
              ? `<span class="assistente-nome-edit">✨ <input type="text" id="assistente-nome-input" maxlength="30" value="${esc(st.nome)}" aria-label="Nome do assistente" /></span>`
              : `<span class="assistente-nome">✨ <span class="assistente-nome-txt">${esc(st.nome)}</span><button id="assistente-editar-nome" class="assistente-editar-nome" title="Editar nome" aria-label="Editar nome do assistente">${ICONE_EDITAR}</button></span>`}
            <span class="assistente-head-acoes">
              ${st.mensagens.length ? `<button id="assistente-limpar" title="Começar uma conversa nova" aria-label="Começar uma conversa nova">↺</button>` : ''}
              <button id="assistente-fechar" title="Fechar" aria-label="Fechar">✕</button>
            </span>
          </div>
          <div class="assistente-mensagens" id="assistente-mensagens-lista">
            ${!st.mensagens.length ? `<div class="assistente-msg assistente-msg-assistant">${esc(saudacao())}</div>` : ''}
            ${st.mensagens.map((m) => `<div class="assistente-msg assistente-msg-${m.role === 'user' ? 'user' : 'assistant'}">${esc(m.content)}</div>`).join('')}
            ${st.enviando ? '<div class="assistente-msg assistente-msg-assistant assistente-digitando">Digitando…</div>' : ''}
          </div>
          <div class="assistente-input-row">
            <input type="text" id="assistente-input" placeholder="Pergunte algo…" maxlength="2000" ${st.enviando ? 'disabled' : ''} />
            <button id="assistente-enviar" ${st.enviando ? 'disabled' : ''} title="Enviar" aria-label="Enviar">➤</button>
          </div>
        </div>` : ''}`;
    if (st.aberto) posicionarPainel();
    ligarEventos();
    st.animando = null; // a animação roda uma vez; re-renders seguintes não repetem
    if (st.editandoNome) { const ni = document.getElementById('assistente-nome-input'); if (ni) { ni.focus(); ni.select(); } }
    const lista = document.getElementById('assistente-mensagens-lista');
    if (lista) lista.scrollTop = lista.scrollHeight;
    if (st.aberto && !st.enviando && !st.editandoNome) { const inp = document.getElementById('assistente-input'); if (inp && window.matchMedia('(pointer:fine)').matches) inp.focus(); }
  }

  // Abre o painel perto de onde a bolinha estiver (ela pode ter sido arrastada), sempre inteiro na tela.
  function posicionarPainel() {
    const bolha = document.getElementById('assistente-bolha');
    const painel = document.getElementById('assistente-painel');
    if (!bolha || !painel) return;
    const rb = bolha.getBoundingClientRect();
    const largura = painel.offsetWidth || 336;
    const altura = painel.offsetHeight || 460;
    let left = rb.right - largura;
    let top = rb.top - altura - 12;
    if (top < 12) top = rb.bottom + 12; // não cabe em cima: abre embaixo
    left = Math.min(Math.max(12, left), window.innerWidth - largura - 12);
    top = Math.min(Math.max(12, top), window.innerHeight - altura - 12);
    painel.style.left = left + 'px';
    painel.style.top = top + 'px';
    painel.style.transformOrigin = `${rb.left + rb.width / 2 - left}px ${rb.top + rb.height / 2 - top}px`;
  }

  function alternar() {
    if (st.aberto) {
      if (st.animando === 'fechando') return;
      const painel = document.getElementById('assistente-painel');
      const reduz = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (!painel || reduz) { st.aberto = false; st.editandoNome = false; render(); return; }
      st.animando = 'fechando';
      painel.classList.add('fechando');
      const bolha = document.getElementById('assistente-bolha');
      if (bolha) bolha.textContent = '💬';
      setTimeout(() => { st.aberto = false; st.editandoNome = false; st.animando = null; render(); }, 220);
    } else {
      st.aberto = true;
      st.animando = 'abrindo';
      render();
    }
  }

  function salvarNome() {
    const ni = document.getElementById('assistente-nome-input');
    if (ni) {
      st.nome = ni.value.trim().slice(0, 30) || NOME_PADRAO;
      gravarLocal('assistente-nome', st.nome);
    }
    st.editandoNome = false;
    render();
  }

  async function enviar() {
    const input = document.getElementById('assistente-input');
    if (!input) return;
    const texto = input.value.trim();
    if (!texto || st.enviando) return;
    st.mensagens.push({ role: 'user', content: texto });
    guardarConversa();
    st.enviando = true;
    render();
    const controle = new AbortController();
    const limite = setTimeout(() => controle.abort(), 45000);
    try {
      const res = await fetch('/api/ai/assistente', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token() },
        body: JSON.stringify({ mensagens: st.mensagens, contexto: st.contexto }),
        signal: controle.signal,
      });
      let data = null;
      try { data = await res.json(); } catch (e) { /* resposta sem JSON */ }
      if (res.status === 401) throw new Error('sua sessão expirou. Entre de novo.');
      if (!res.ok) throw new Error((data && data.error) || 'tenta de novo em instantes.');
      st.mensagens.push({ role: 'assistant', content: (data && data.resposta) || '(sem resposta)' });
    } catch (e) {
      const msg = e.name === 'AbortError' ? 'demorou demais para responder. Tenta de novo?' : (e.message || 'tenta de novo em instantes.');
      st.mensagens.push({ role: 'assistant', content: 'Não consegui responder agora — ' + msg, erro: true });
    } finally {
      clearTimeout(limite);
    }
    st.enviando = false;
    guardarConversa();
    render();
  }

  function ligarEventos() {
    const bolha = document.getElementById('assistente-bolha');
    if (bolha) {
      bolha.addEventListener('pointerdown', (e) => {
        const r = bolha.getBoundingClientRect();
        st.drag = { x0: e.clientX, y0: e.clientY, bx: r.left, by: r.top, moveu: false, id: e.pointerId };
        try { bolha.setPointerCapture(e.pointerId); } catch (err) { /* ignora */ }
      });
      bolha.addEventListener('pointermove', (e) => {
        const d = st.drag;
        if (!d || d.id !== e.pointerId) return;
        const dx = e.clientX - d.x0, dy = e.clientY - d.y0;
        if (!d.moveu && Math.sqrt(dx * dx + dy * dy) < 5) return; // tremidinha, ainda não é arrastar
        d.moveu = true;
        const x = Math.min(Math.max(4, d.bx + dx), window.innerWidth - bolha.offsetWidth - 4);
        const y = Math.min(Math.max(4, d.by + dy), window.innerHeight - bolha.offsetHeight - 4);
        Object.assign(bolha.style, { left: x + 'px', top: y + 'px', right: 'auto', bottom: 'auto' });
        if (document.getElementById('assistente-painel')) posicionarPainel();
      });
      bolha.addEventListener('pointerup', (e) => {
        const d = st.drag;
        if (!d || d.id !== e.pointerId) return;
        if (d.moveu) {
          st.bolhaX = parseFloat(bolha.style.left);
          st.bolhaY = parseFloat(bolha.style.top);
          gravarLocal('assistente-bolha-pos', JSON.stringify({ x: st.bolhaX, y: st.bolhaY }));
        } else {
          alternar();
        }
        st.drag = null;
      });
      bolha.addEventListener('pointercancel', () => { st.drag = null; });
      bolha.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); alternar(); } });
    }
    const fechar = document.getElementById('assistente-fechar');
    if (fechar) fechar.addEventListener('click', alternar);
    const limpar = document.getElementById('assistente-limpar');
    if (limpar) limpar.addEventListener('click', () => { st.mensagens = []; guardarConversa(); render(); });
    const editar = document.getElementById('assistente-editar-nome');
    if (editar) editar.addEventListener('click', () => { st.editandoNome = true; render(); });
    const ni = document.getElementById('assistente-nome-input');
    if (ni) {
      let cancelado = false;
      ni.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); ni.blur(); }
        else if (e.key === 'Escape') { cancelado = true; st.editandoNome = false; render(); }
      });
      ni.addEventListener('blur', () => { if (!cancelado && st.editandoNome) salvarNome(); });
    }
    const btn = document.getElementById('assistente-enviar');
    if (btn) btn.addEventListener('click', enviar);
    const input = document.getElementById('assistente-input');
    if (input) input.addEventListener('keydown', (e) => { if (e.key === 'Enter') enviar(); });
  }

  window.addEventListener('resize', () => { if (st.aberto) posicionarPainel(); });

  window.AssistenteIA = {
    iniciar(opcoes = {}) {
      st.contexto = opcoes.contexto === 'financeiro' ? 'financeiro' : 'crm';
      st.saudacao = opcoes.saudacao || null;
      carregarPreferencias();
      render();
    },
    definirHabilitado(sim) { st.habilitado = !!sim; render(); },
    render,
    abrir() { if (!st.aberto) alternar(); },
    // Abre a conversa e já manda uma pergunta (ex.: atalhos da aba Assistente do financeiro)
    perguntar(texto) {
      if (!st.habilitado || st.enviando || !String(texto || '').trim()) return;
      if (!st.aberto) { st.aberto = true; st.animando = 'abrindo'; render(); }
      const input = document.getElementById('assistente-input');
      if (input) { input.value = String(texto).slice(0, 2000); enviar(); }
    },
  };
})();
