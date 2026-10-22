/* Entrada da equipe pelo próprio celular: código da loja -> escolher o nome -> PIN.
   O código vem no link que o gestor manda (?c=CODIGO) e fica guardado neste aparelho. */
(function () {
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const guardado = () => { try { return localStorage.getItem('loja-codigo') || ''; } catch (e) { return ''; } };
  const doLink = new URLSearchParams(location.search).get('c') || '';
  const E = { codigo: (doLink || guardado()).toUpperCase(), loja: null, pessoas: [], pessoa: null, erro: '', carregando: false };

  async function chamar(metodo, caminho, corpo) {
    const r = await fetch('/api' + caminho, { method: metodo, headers: { 'Content-Type': 'application/json' }, body: corpo ? JSON.stringify(corpo) : undefined });
    let d = null; try { d = await r.json(); } catch (e) { /* sem corpo */ }
    if (!r.ok) throw new Error((d && d.error) || 'Não foi possível agora. Tente de novo.');
    return d;
  }
  function desenhar() {
    const c = $('#func-corpo');
    const erro = E.erro ? `<div class="error-banner" role="alert">${esc(E.erro)}</div>` : '';
    if (!E.loja) {
      c.innerHTML = `${erro}<form class="auth-form" id="f-codigo"><div class="field"><label for="f-cod">Código da loja</label>
        <input id="f-cod" value="${esc(E.codigo)}" placeholder="Ex.: K7P2QX" maxlength="12" autocapitalize="characters" autocomplete="off" required /></div>
        <p class="settings-page-note">O gestor da loja passa o código (ou o link) pelo WhatsApp.</p>
        <button type="submit" class="btn-save auth-submit" ${E.carregando ? 'disabled' : ''}>${E.carregando ? 'Procurando…' : 'Continuar'}</button></form>`;
      $('#f-codigo').addEventListener('submit', (e) => { e.preventDefault(); E.codigo = $('#f-cod').value.trim().toUpperCase(); buscar(); });
      if (!E.codigo) $('#f-cod').focus();
      return;
    }
    if (!E.pessoa) {
      c.innerHTML = `${erro}<p class="func-loja">${esc(E.loja)}</p><p class="settings-page-note">Quem é você?</p>
        <div class="func-pessoas">${E.pessoas.map((p) => `<button type="button" class="func-pessoa" data-id="${esc(p.id)}"><span class="func-av" aria-hidden="true">${esc(p.nome.charAt(0).toUpperCase())}</span><b>${esc(p.nome)}</b><small>${esc(p.funcao)}</small></button>`).join('')}</div>
        <p style="text-align:center;margin:12px 0 0"><button type="button" class="func-link" id="f-outra">Outra loja</button></p>`;
      c.querySelectorAll('.func-pessoa').forEach((b) => b.addEventListener('click', () => { E.pessoa = E.pessoas.find((p) => p.id === b.dataset.id); E.erro = ''; desenhar(); }));
      $('#f-outra').addEventListener('click', () => { E.loja = null; E.codigo = ''; try { localStorage.removeItem('loja-codigo'); } catch (e) { /* nada */ } desenhar(); });
      return;
    }
    c.innerHTML = `${erro}<p class="func-loja">${esc(E.pessoa.nome)}</p><p class="settings-page-note">${esc(E.pessoa.funcao)} · ${esc(E.loja)}</p>
      <form class="auth-form" id="f-pin"><div class="field"><label for="f-p">Seu PIN</label><input id="f-p" class="func-pin" type="password" inputmode="numeric" maxlength="6" autocomplete="off" required /></div>
      <button type="submit" class="btn-save auth-submit" ${E.carregando ? 'disabled' : ''}>${E.carregando ? 'Entrando…' : 'Entrar'}</button></form>
      <p style="text-align:center;margin:8px 0 0"><button type="button" class="func-link" id="f-trocar">← Não sou ${esc(E.pessoa.nome)}</button></p>`;
    $('#f-p').focus();
    $('#f-pin').addEventListener('submit', (e) => { e.preventDefault(); entrar($('#f-p').value); });
    $('#f-trocar').addEventListener('click', () => { E.pessoa = null; E.erro = ''; desenhar(); });
  }
  async function buscar() {
    if (!E.codigo) return;
    E.carregando = true; E.erro = ''; desenhar();
    try {
      const r = await chamar('GET', `/acesso/loja/${encodeURIComponent(E.codigo)}`);
      E.loja = r.loja; E.pessoas = r.pessoas;
      try { localStorage.setItem('loja-codigo', E.codigo); } catch (e) { /* nada */ }
      if (!E.pessoas.length) E.erro = 'Ninguém cadastrado nesta loja ainda. Fale com o gestor.';
    } catch (e) { E.erro = e.message; }
    E.carregando = false; desenhar();
  }
  async function entrar(pin) {
    E.carregando = true; E.erro = ''; desenhar();
    try {
      const r = await chamar('POST', '/acesso/entrar', { codigo: E.codigo, id: E.pessoa.id, pin });
      localStorage.setItem('token', r.token);
      localStorage.setItem('user', JSON.stringify(r.user));
      localStorage.removeItem('pdv-operador');
      window.location.href = '/';
    } catch (e) { E.carregando = false; E.erro = e.message; desenhar(); }
  }
  desenhar();
  if (E.codigo) buscar();
})();
