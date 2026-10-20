/* Painel do dono: clientes, assinaturas, saúde do sistema e lista de donos. */
(function(){
  const token = localStorage.getItem('token');
  if(!token){ window.location.href = 'login.html'; return; }

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const brl = (v) => Number(v || 0).toLocaleString('pt-BR', { style:'currency', currency:'BRL' });
  const data = (v) => { if(!v) return '—'; const s = String(v); const d = /^\d{4}-\d{2}-\d{2}$/.test(s.slice(0, 10)) && s.length <= 10 ? new Date(s + 'T12:00:00') : new Date(s); return d.toLocaleDateString('pt-BR', { timeZone:'America/Sao_Paulo' }); };
  const dataHora = (v) => v ? new Date(v).toLocaleString('pt-BR', { timeZone:'America/Sao_Paulo', day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }) : '—';
  const haQuanto = (v) => {
    if(!v) return 'nunca';
    const min = Math.round((Date.now() - new Date(v).getTime()) / 60000);
    if(min < 1) return 'agora';
    if(min < 60) return `há ${min} min`;
    const h = Math.round(min / 60);
    if(h < 48) return `há ${h} h`;
    return `há ${Math.round(h / 24)} dias`;
  };

  async function api(metodo, caminho, corpo){
    const res = await fetch('/api/dono' + caminho, {
      method: metodo,
      headers: { 'Content-Type':'application/json', Authorization:'Bearer ' + token },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
    if(res.status === 401){ localStorage.removeItem('token'); window.location.href = 'login.html'; throw new Error('Sessão expirada.'); }
    let dados = null;
    try{ dados = await res.json(); }catch(e){}
    if(!res.ok){ const err = new Error((dados && dados.error) || 'Não foi possível carregar.'); err.status = res.status; throw err; }
    return dados;
  }

  function confirmar({ titulo, texto, sim }){
    return new Promise((ok) => {
      $('ass-modal-titulo').textContent = titulo;
      $('ass-modal-texto').textContent = texto;
      $('ass-modal-sim').textContent = sim;
      $('ass-modal').hidden = false;
      const fim = (v) => { $('ass-modal').hidden = true; ok(v); };
      $('ass-modal-sim').onclick = () => fim(true);
      $('ass-modal-nao').onclick = () => fim(false);
    });
  }

  /* ---------- clientes ---------- */
  const SELO = { pagante:'ok', dono:'ok', cortesia:'ok', livre:'ok', teste:'', teste_assinou:'', aguardando:'alerta', atrasado:'perigo', cancelou:'', bloqueado:'perigo', sem_acesso:'' };
  const FILTROS = [
    ['todos', 'Todos', () => true],
    ['teste', 'No teste', (c) => c.situacao === 'teste' || c.situacao === 'teste_assinou'],
    ['pagando', 'Pagando', (c) => c.situacao === 'pagante' || c.situacao === 'atrasado'],
    ['atencao', 'Precisa de atenção', (c) => c.situacao === 'atrasado' || c.situacao === 'aguardando'],
    ['cancelou', 'Cancelaram', (c) => c.situacao === 'cancelou' || (c.situacao === 'bloqueado' && /Cancel/.test(c.rotulo))],
    ['bloqueado', 'Bloqueados', (c) => c.situacao === 'bloqueado'],
    ['cortesia', 'Donos e cortesias', (c) => c.situacao === 'dono' || c.situacao === 'cortesia'],
  ];
  let resumo = null;
  let filtro = 'todos';
  let busca = '';

  function kpi(rotulo, valor, sub, alerta){
    return `<div class="dono-kpi ${alerta ? 'alerta' : ''}"><div class="dono-kpi-rotulo">${esc(rotulo)}</div><div class="dono-kpi-valor">${esc(valor)}</div>${sub ? `<div class="dono-kpi-sub">${esc(sub)}</div>` : ''}</div>`;
  }

  function desenharResumo(){
    const r = resumo, t = r.totais;
    $('dono-sub').textContent = `Atualizado ${dataHora(r.geradoEm)}${r.cobranca ? ` · cobrança ligada (${r.ambiente === 'producao' ? 'produção' : 'sandbox'})` : ' · cobrança desligada'}`;
    const aviso = $('dono-aviso');
    if(!r.cobranca){ aviso.innerHTML = '<b>A cobrança está desligada.</b> Todo mundo usa liberado, então os números de teste, pagantes e receita ficam zerados até você ligar o Asaas.'; aviso.hidden = false; }
    else if(r.ambiente === 'sandbox'){ aviso.innerHTML = '<b>Sandbox:</b> os pagamentos aqui são de mentira.'; aviso.hidden = false; }
    else aviso.hidden = true;
    const atencao = t.atrasados + t.aguardando;
    $('dono-kpis').innerHTML = [
      kpi('Cadastros', t.cadastros, `+${t.cadastros7d} em 7 dias · +${t.cadastros30d} em 30`),
      kpi('No teste grátis', t.emTeste, t.semAcesso ? `${t.semAcesso} ainda não entraram desde que a cobrança foi ligada` : ''),
      kpi('Pagando', t.pagantes, `Essencial ${t.porPlano.essencial} · Completo ${t.porPlano.completo}`),
      kpi('Receita mensal', brl(t.receitaMensal), `estimada, já com descontos${t.anuais ? ` · ${t.anuais} ${t.anuais === 1 ? 'anual entra' : 'anuais entram'} como 1/12` : ''}`),
      kpi('Teste → pagante', t.conversao == null ? '—' : `${String(t.conversao).replace('.', ',')}%`, t.testeAcabou ? `${t.testeAcabouEPagou} de ${t.testeAcabou} que terminaram o teste` : 'ninguém terminou o teste ainda'),
      kpi('Precisa de atenção', atencao, `${t.atrasados} ${t.atrasados === 1 ? 'atrasado' : 'atrasados'} · ${t.aguardando} sem pagar a 1ª fatura · ${t.cancelaram} ${t.cancelaram === 1 ? 'cancelou' : 'cancelaram'}`, atencao > 0),
    ].join('');
    desenharFiltros();
    desenharTabela();
  }

  function desenharFiltros(){
    $('dono-filtros').innerHTML = FILTROS.map(([id, nome, f]) => {
      const n = resumo.clientes.filter(f).length;
      return `<button type="button" class="dono-filtro ${filtro === id ? 'ativo' : ''}" role="tab" aria-selected="${filtro === id}" data-filtro="${id}">${esc(nome)}<span>${n}</span></button>`;
    }).join('');
    document.querySelectorAll('[data-filtro]').forEach((b) => b.addEventListener('click', () => { filtro = b.dataset.filtro; desenharFiltros(); desenharTabela(); }));
  }

  function desenharTabela(){
    const f = (FILTROS.find((x) => x[0] === filtro) || FILTROS[0])[2];
    const q = busca.trim().toLowerCase();
    const nomeDoPlano = (id) => { const p = (resumo.planos || []).find((x) => x.id === id); return p ? p.nome : '—'; };
    const lista = resumo.clientes.filter(f).filter((c) => !q || `${c.nome} ${c.email}`.toLowerCase().includes(q));
    const ate = (c) => {
      if(c.situacao === 'teste' || c.situacao === 'teste_assinou') return `teste até ${data(c.testeAte)}`;
      if(c.pagoAte) return `${c.situacao === 'cancelou' || c.situacao === 'bloqueado' ? 'acesso até' : 'pago até'} ${data(c.pagoAte)}`;
      if(c.testeAte) return `teste até ${data(c.testeAte)}`;
      return '—';
    };
    const podeDesconto = (c) => resumo.cobranca && !['dono', 'cortesia', 'livre'].includes(c.situacao);
    const textoDesc = (d) => d ? `${String(d.percentual).replace('.', ',')}% ${d.ate ? `até ${data(d.ate)}` : d.meses ? `por ${d.meses} ${d.meses === 1 ? 'mês' : 'meses'}` : 'para sempre'}${d.origem === 'promocao' ? ' · promoção' : ''}` : '';
    $('dono-tabela').innerHTML = `<thead><tr><th>Cliente</th><th>Cadastro</th><th>Situação</th><th>Plano</th><th>Período</th><th>Vencimento</th><th><span class="sr-only">Ações</span></th></tr></thead><tbody>${
      lista.length ? lista.map((c) => `<tr>
        <td><div>${esc(c.nome || '(sem nome)')}</div><div class="email">${esc(c.email)}</div></td>
        <td class="num">${data(c.cadastro)}</td>
        <td><span class="ass-selo ${SELO[c.situacao] || ''}">${esc(c.rotulo)}</span></td>
        <td>${c.plano ? `${esc(nomeDoPlano(c.plano))}${c.ciclo === 'anual' ? ' anual' : ''}` : '—'}${c.desconto ? `<br><span class="dono-desc">${esc(textoDesc(c.desconto))}</span>` : ''}</td>
        <td class="num">${esc(ate(c))}</td>
        <td class="num">${c.proximoVencimento && c.situacao !== 'cancelou' ? data(c.proximoVencimento) : '—'}</td>
        <td class="acao"><div class="dono-acoes-linha">${podeDesconto(c) ? `<button type="button" class="ass-btn dono-btn-mini" data-desconto="${esc(c.id)}" aria-label="${c.desconto ? 'Mudar o desconto' : 'Dar desconto'} de ${esc(c.nome || c.email)}">Desconto</button>` : ''}<button type="button" class="ass-btn dono-btn-mini" data-regras="${esc(c.id)}" aria-label="Regras de comissão de ${esc(c.nome || c.email)}">Regras</button></div></td>
      </tr>`).join('') : `<tr><td colspan="7" class="dono-vazio">Nenhum cliente neste filtro.</td></tr>`
    }</tbody>`;
    document.querySelectorAll('[data-desconto]').forEach((b) => b.addEventListener('click', () => abrirDesconto(resumo.clientes.find((c) => c.id === b.dataset.desconto))));
    document.querySelectorAll('[data-regras]').forEach((b) => b.addEventListener('click', () => abrirRegras(resumo.clientes.find((c) => c.id === b.dataset.regras))));
    $('dono-tabela-rodape').textContent = `${lista.length} ${lista.length === 1 ? 'cliente' : 'clientes'}${resumo.clientes.length >= 500 ? ' (mostrando os 500 cadastros mais recentes)' : ''}.`;
  }

  $('dono-busca').addEventListener('input', (e) => { busca = e.target.value; if(resumo) desenharTabela(); });

  /* ---------- desconto pessoal ---------- */
  let clienteDoDesconto = null;
  function mostrarCampoMeses(sel, campo){ $(campo).hidden = $(sel).value !== 'meses'; }
  $('desc-duracao').addEventListener('change', () => { mostrarCampoMeses('desc-duracao', 'desc-meses-campo'); explicarDesconto(); });
  ['desc-pct', 'desc-meses'].forEach((id) => $(id).addEventListener('input', explicarDesconto));
  function explicarDesconto(){
    const c = clienteDoDesconto; if(!c) return;
    const pct = Number($('desc-pct').value) || 0;
    const plano = c.plano || 'completo';
    const p = (resumo.planos || []).find((x) => x.id === plano) || resumo.planos[0];
    const base = c.ciclo === 'anual' ? p.valorAnual : p.valor;
    const fim = $('desc-duracao').value === 'meses' ? `por ${Number($('desc-meses').value) || '?'} meses e depois volta para ${brl(base)}` : 'para sempre';
    const assina = c.plano && ['pagante', 'atrasado', 'aguardando', 'teste_assinou'].includes(c.situacao);
    $('desc-explica').textContent = pct > 0
      ? `${assina ? `Plano ${p.nome}${c.ciclo === 'anual' ? ' anual' : ''}` : `Exemplo no ${p.nome}`}: ${brl(base)} vira ${brl(Math.max(5, Math.round(Math.round(base * 100) * (100 - pct) / 100) / 100))}${c.ciclo === 'anual' ? '/ano' : '/mês'}, ${fim}. ${assina ? 'Vale a partir da próxima fatura.' : 'Vale a partir da primeira fatura, quando a pessoa assinar.'}`
      : '';
  }
  function abrirDesconto(c){
    clienteDoDesconto = c;
    $('desc-quem').textContent = `${c.nome || c.email} · ${c.email}`;
    $('desc-pct').value = c.desconto ? c.desconto.percentual : '';
    $('desc-duracao').value = c.desconto && c.desconto.meses ? 'meses' : 'sempre';
    $('desc-meses').value = c.desconto && c.desconto.meses ? c.desconto.meses : '';
    mostrarCampoMeses('desc-duracao', 'desc-meses-campo');
    $('desc-remover').hidden = !c.desconto;
    $('desc-erro').hidden = true;
    explicarDesconto();
    $('desc-modal').hidden = false;
    $('desc-pct').focus();
  }
  $('desc-fechar').addEventListener('click', () => { $('desc-modal').hidden = true; });
  async function salvarDesconto(corpo, botao){
    const texto = botao.textContent; botao.disabled = true; botao.textContent = 'Salvando…';
    try{
      await api('PUT', `/clientes/${clienteDoDesconto.id}/desconto`, corpo);
      $('desc-modal').hidden = true;
      resumo = await api('GET', '/resumo'); desenharResumo();
    }catch(err){ $('desc-erro').textContent = err.message; $('desc-erro').hidden = false; }
    finally{ botao.disabled = false; botao.textContent = texto; }
  }
  $('desc-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const pct = Number($('desc-pct').value);
    if(!(pct >= 1 && pct <= 99)){ $('desc-erro').textContent = 'Informe um desconto entre 1% e 99%.'; $('desc-erro').hidden = false; return; }
    const meses = $('desc-duracao').value === 'meses' ? Number($('desc-meses').value) : null;
    if($('desc-duracao').value === 'meses' && !(meses >= 1)){ $('desc-erro').textContent = 'Informe por quantos meses.'; $('desc-erro').hidden = false; return; }
    salvarDesconto({ percentual:pct, meses }, $('desc-salvar'));
  });
  $('desc-remover').addEventListener('click', () => salvarDesconto({ percentual:0 }, $('desc-remover')));

  /* ---------- promoção para novos ---------- */
  let promoAtiva = false;
  function desenharPromocao(p){
    promoAtiva = !!(p && p.ativa);
    const sw = $('promo-ativa');
    sw.classList.toggle('on', promoAtiva); sw.setAttribute('aria-checked', String(promoAtiva));
    $('promo-pct').value = p && p.percentual ? p.percentual : '';
    $('promo-duracao').value = p && p.meses ? 'meses' : 'sempre';
    $('promo-meses').value = p && p.meses ? p.meses : '';
    $('promo-ate').value = (p && p.validaAte) || '';
    mostrarCampoMeses('promo-duracao', 'promo-meses-campo');
    const hoje = new Date().toISOString().slice(0, 10);
    const vencida = p && p.validaAte && p.validaAte < hoje;
    $('promo-status').innerHTML = p && p.ativa && !vencida
      ? `<b>Ligada:</b> quem assinar pela primeira vez ganha ${String(p.percentual).replace('.', ',')}% de desconto ${p.meses ? `nos primeiros ${p.meses} meses` : 'para sempre'}${p.validaAte ? `, até ${data(p.validaAte)}` : ''}.`
      : vencida ? `A promoção terminou em ${data(p.validaAte)}.` : 'Nenhuma promoção ligada: novos clientes pagam o preço normal.';
  }
  $('promo-ativa').addEventListener('click', () => { promoAtiva = !promoAtiva; $('promo-ativa').classList.toggle('on', promoAtiva); $('promo-ativa').setAttribute('aria-checked', String(promoAtiva)); });
  $('promo-duracao').addEventListener('change', () => mostrarCampoMeses('promo-duracao', 'promo-meses-campo'));
  $('promo-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const erro = $('promo-erro'); erro.hidden = true;
    const corpo = { ativa:promoAtiva, percentual:Number($('promo-pct').value) || 0, meses:$('promo-duracao').value === 'meses' ? Number($('promo-meses').value) || '' : null, validaAte:$('promo-ate').value || null };
    const botao = e.submitter || $('promo-form').querySelector('button[type=submit]');
    botao.disabled = true;
    try{ const r = await api('PUT', '/promocao', corpo); desenharPromocao(r.promocao); }
    catch(err){ erro.textContent = err.message; erro.hidden = false; }
    finally{ botao.disabled = false; }
  });

  /* ---------- saúde ---------- */
  function linha(rotulo, valor){ return `<div class="dono-linha"><span>${esc(rotulo)}</span><span>${valor}</span></div>`; }
  function cartao(titulo, estado, corpo, largo){
    return `<div class="ass-cartao ${largo ? 'dono-largo' : ''}"><div class="dono-saude-titulo"><span class="dono-ponto ${estado}" aria-hidden="true"></span>${esc(titulo)}</div><div style="margin-top:10px">${corpo}</div></div>`;
  }
  function desenharSaude(s){
    const c = s.cobranca;
    const estadoCobranca = !c.ligada ? (c.problema ? 'ruim' : '') : (!c.tokenWebhook || c.falhasNaConferencia ? 'atencao' : 'ok');
    const estadoErros = s.erros.ultimas24h > 20 ? 'ruim' : s.erros.ultimas24h > 0 ? 'atencao' : 'ok';
    const sim = (v) => v ? 'configurado' : '<span style="color:var(--ink-soft)">não configurado</span>';
    $('dono-saude').innerHTML = [
      cartao('Servidor', 'ok', linha('No ar desde', esc(dataHora(s.servidor.noArDesde))) + linha('Memória em uso', `${s.servidor.memoriaMb} MB`) + linha('Node', esc(s.servidor.node))),
      cartao('Banco de dados', s.banco.ok ? (s.banco.ms > 800 ? 'atencao' : 'ok') : 'ruim', linha('Situação', s.banco.ok ? 'respondendo' : '<b style="color:var(--danger)">sem resposta</b>') + linha('Tempo de resposta', s.banco.ms == null ? '—' : `${s.banco.ms} ms`)),
      cartao('Cobrança (Asaas)', estadoCobranca,
        linha('Situação', c.ligada ? `ligada · ${c.ambiente === 'producao' ? 'produção' : 'sandbox'}` : (c.problema ? `<b style="color:var(--danger)">desligada: ${esc(c.problema)}</b>` : 'desligada')) +
        linha('Token do webhook', c.tokenWebhook ? 'configurado' : '<b style="color:var(--danger)">faltando</b>') +
        linha('Avisos nas últimas 24 h', String(c.avisos24h)) +
        linha('Último aviso', esc(c.ultimosAvisos.length ? haQuanto(c.ultimosAvisos[0].quando) : 'nenhum')) +
        linha('Conferência de hora em hora', esc(c.ultimaConferencia ? `${haQuanto(c.ultimaConferencia)}${c.falhasNaConferencia ? ` · ${c.falhasNaConferencia} falhas` : ''}` : 'ainda não rodou'))),
      cartao('Integrações', '', linha('Assistente com IA', sim(s.integracoes.ia)) + linha('E-mail (Resend)', sim(s.integracoes.email)) + linha('Notificações push', sim(s.integracoes.push)) + linha('Google Agenda', sim(s.integracoes.googleAgenda)) + linha('Alerta no Telegram', sim(s.integracoes.telegram))),
      cartao(`Erros: ${s.erros.ultimas24h} nas últimas 24 h · ${s.erros.ultimos7d} em 7 dias`, estadoErros,
        s.erros.recentes.length
          ? `<ul class="dono-erros">${s.erros.recentes.map((e) => `<li><div class="quando">${esc(dataHora(e.quando))}${e.rota ? ` · ${esc(e.rota)}` : ''}${e.tipo !== 'rota' ? ` · ${esc(e.tipo.replace(/_/g, ' '))}` : ''}</div><div class="msg">${esc(e.mensagem)}</div></li>`).join('')}</ul>`
          : '<p class="ass-texto" style="margin:0">Nenhum erro registrado.</p>', true),
    ].join('');
  }

  /* ---------- donos ---------- */
  function desenharDonos(r){
    $('dono-donos').innerHTML = r.donos.map((d) => `<li>
      <span>${esc(d.email)}${d.email === r.eu ? ' <small>(você)</small>' : ''}<br><small>${d.fixo ? 'fixo no Render' : `adicionado${d.adicionadoPor ? ` por ${esc(d.adicionadoPor)}` : ''} em ${data(d.desde)}`}</small></span>
      ${!d.fixo && d.email !== r.eu ? `<button type="button" class="ass-btn ass-btn-perigo dono-btn-mini" data-remover="${esc(d.email)}">Remover</button>` : ''}
    </li>`).join('');
    document.querySelectorAll('[data-remover]').forEach((b) => b.addEventListener('click', async () => {
      const email = b.dataset.remover;
      if(!(await confirmar({ titulo:'Remover este dono?', texto:`${email} deixa de abrir o painel e passa a seguir as regras normais de assinatura.`, sim:'Remover' }))) return;
      try{ desenharDonos(await api('DELETE', '/donos/' + encodeURIComponent(email))); }
      catch(err){ confirmar({ titulo:'Não deu certo', texto:err.message, sim:'Entendi' }); }
    }));
  }
  $('dono-add-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const erro = $('dono-add-erro'); erro.hidden = true;
    const email = $('dono-add-email').value.trim();
    try{ desenharDonos(await api('POST', '/donos', { email })); $('dono-add-email').value = ''; }
    catch(err){ erro.textContent = err.message; erro.hidden = false; }
  });

  /* ---------- restaurante de exemplo ---------- */
  $('dono-demo-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const erro = $('dono-demo-erro'); const ok = $('dono-demo-ok'); const btn = $('dono-demo-btn');
    erro.hidden = true; ok.hidden = true; btn.disabled = true; btn.textContent = 'Criando… (leva alguns segundos)';
    try{
      const r = await api('POST', '/demo-restaurante', { whatsapp: $('dono-demo-whats').value });
      const link = `${location.origin}/c/${r.slug}`;
      ok.innerHTML = `<div class="ass-cartao" style="margin-top:12px;background:var(--line, #f4f4f4)">
        <p class="ass-texto" style="margin-top:0"><b>Pronto!</b> Guarde este acesso (a senha não aparece de novo):</p>
        <p class="ass-texto">E-mail: <b>${esc(r.email)}</b><br/>Senha: <b>${esc(r.senha)}</b></p>
        <p class="ass-texto">Para entrar, saia da sua conta (ou use uma janela anônima) e faça login com esses dados. Depois abra o <b>PDV</b>.</p>
        <p class="ass-texto">Cardápio digital: ${r.cardapioAtivo ? `<a href="${esc(link)}" target="_blank" rel="noopener">${esc(link)}</a>` : 'desligado (informe um WhatsApp para ligar; dá para fazer depois, na aba Cardápio digital da conta de exemplo)'}</p>
      </div>`;
      ok.hidden = false;
    }catch(err){ erro.textContent = err.message; erro.hidden = false; }
    btn.disabled = false; btn.textContent = 'Criar restaurante de exemplo';
  });

  /* ---------- equipes: permissões ---------- */
  let equipes = null;
  let catalogo = null;
  let equipeAberta = null;
  function desenharEquipes(r){
    equipes = r.equipes; catalogo = r.catalogo;
    const tiradas = (p) => [...catalogo.abas.filter((a) => p.abas[a.chave] === false), ...catalogo.funcoes.filter((f) => p.funcoes[f.chave] === false)].map((x) => x.nome);
    $('dono-equipes').innerHTML = equipes.length ? equipes.map((e) => {
      const t = tiradas(e.permissoes);
      return `<li><div><b>${esc(e.nome)}</b> <span class="ass-miudo">· gestor: ${esc(e.dono || '—')} · ${e.membros} ${e.membros === 1 ? 'pessoa' : 'pessoas'}</span>
        <div class="ass-miudo">${t.length ? `Membros sem: ${esc(t.join(', '))}` : 'Membros com tudo liberado'}</div></div>
        <button type="button" class="ass-btn dono-btn-mini" data-equipe="${esc(e.id)}">Permissões</button></li>`;
    }).join('') : '<li class="ass-miudo">Nenhuma equipe criada ainda.</li>';
    document.querySelectorAll('[data-equipe]').forEach((b) => b.addEventListener('click', () => abrirPermissoes(equipes.find((e) => e.id === b.dataset.equipe))));
  }
  function abrirPermissoes(e){
    equipeAberta = e;
    $('perm-quem').textContent = `${e.nome} · gestor: ${e.dono || '—'}. Vale para os membros; gestores sempre têm tudo.`;
    const grupo = (titulo, g, lista) => `<fieldset class="dono-perm-grupo"><legend>${titulo}</legend>${lista.map((x) => `<label class="dono-check"><input type="checkbox" data-pg="${g}" data-pk="${esc(x.chave)}" ${e.permissoes[g][x.chave] !== false ? 'checked' : ''} /> <span>${esc(x.nome)}${x.dica ? `<small>${esc(x.dica)}</small>` : ''}</span></label>`).join('')}</fieldset>`;
    $('perm-campos').innerHTML = grupo('Abas', 'abas', catalogo.abas) + grupo('Funções', 'funcoes', catalogo.funcoes);
    $('perm-erro').hidden = true;
    $('perm-modal').hidden = false;
  }
  $('perm-fechar').addEventListener('click', () => { $('perm-modal').hidden = true; });
  $('perm-form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const corpo = { abas: {}, funcoes: {} };
    document.querySelectorAll('#perm-campos [data-pg]').forEach((i) => { corpo[i.dataset.pg][i.dataset.pk] = i.checked; });
    $('perm-salvar').disabled = true;
    try{
      await api('PUT', `/equipes/${equipeAberta.id}/permissoes`, corpo);
      $('perm-modal').hidden = true;
      desenharEquipes(await api('GET', '/equipes'));
    }catch(err){ $('perm-erro').textContent = err.message; $('perm-erro').hidden = false; }
    finally{ $('perm-salvar').disabled = false; }
  });

  /* ---------- regras de comissão de um cliente ---------- */
  let clienteDasRegras = null;
  let regras = [];
  let regraEditando = null; // null = nova
  async function abrirRegras(c){
    clienteDasRegras = c;
    $('regras-quem').textContent = `${c.nome || '(sem nome)'} · ${c.email}`;
    $('regras-lista').innerHTML = '<li class="ass-miudo">Carregando…</li>';
    $('regra-form').hidden = true;
    $('regras-modal').hidden = false;
    try{ regras = (await api('GET', `/clientes/${c.id}/regras`)).regras; desenharRegras(); }
    catch(err){ $('regras-lista').innerHTML = `<li class="ass-erro">${esc(err.message)}</li>`; }
  }
  function desenharRegras(){
    $('regras-lista').innerHTML = regras.map((r) => `<li><div><b>${esc(r.nome)}</b><div class="ass-miudo">${esc(r.descricao)}</div></div>
      <button type="button" class="ass-btn dono-btn-mini" data-editar-regra="${esc(r.id)}">Editar</button></li>`).join('');
    document.querySelectorAll('[data-editar-regra]').forEach((b) => b.addEventListener('click', () => editarRegra(regras.find((r) => r.id === b.dataset.editarRegra))));
  }
  function linhaBloco(b){
    return `<div class="dono-bloco"><label class="ass-campo">Parcelas<input type="number" min="1" step="1" class="bl-parcelas" value="${esc(b.parcelas)}" inputmode="numeric" /></label>
      <label class="ass-campo">% de cada parcela<input type="number" min="0" step="0.001" class="bl-pct" value="${esc(b.pct)}" inputmode="decimal" /></label>
      <button type="button" class="ass-link bl-tirar" aria-label="Tirar esta linha">Tirar</button></div>`;
  }
  function ligarBlocos(){
    document.querySelectorAll('.bl-tirar').forEach((b) => b.onclick = () => { if(document.querySelectorAll('.dono-bloco').length > 1) b.closest('.dono-bloco').remove(); });
  }
  function editarRegra(r){
    regraEditando = r || null;
    $('regra-form-titulo').textContent = r ? `Editar "${r.nome}"` : 'Nova regra';
    $('regra-nome').value = r ? r.nome : '';
    const blocos = r ? r.blocos.map((b) => ({ parcelas: b.parcelas, pct: Math.round(b.percentual * 100 * 10000) / 10000 })) : [{ parcelas: 1, pct: 0 }];
    $('regra-blocos').innerHTML = blocos.map(linhaBloco).join('');
    ligarBlocos();
    $('regra-base').value = r && r.base === 'negociado' ? 'negociado' : 'final';
    $('regra-mes').checked = !!(r && r.mesIndependente);
    $('regra-erro').hidden = true;
    $('regra-form').hidden = false;
    $('regra-nome').focus();
  }
  $('regra-add-bloco').addEventListener('click', () => { $('regra-blocos').insertAdjacentHTML('beforeend', linhaBloco({ parcelas: 1, pct: 0 })); ligarBlocos(); });
  $('regra-nova').addEventListener('click', () => editarRegra(null));
  $('regra-cancelar').addEventListener('click', () => { $('regra-form').hidden = true; });
  $('regras-fechar').addEventListener('click', () => { $('regras-modal').hidden = true; });
  $('regra-form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const corpo = {
      nome: $('regra-nome').value,
      blocos: [...document.querySelectorAll('.dono-bloco')].map((d) => ({ parcelas: d.querySelector('.bl-parcelas').value, percentual: d.querySelector('.bl-pct').value })),
      base: $('regra-base').value,
      mesIndependente: $('regra-mes').checked,
    };
    const ok = await confirmar({ titulo: 'Salvar a regra do cliente?', texto: `Isso muda as comissões calculadas a partir de agora na conta de ${clienteDasRegras.email} e fica registrado no histórico dele. Você já combinou com o cliente?`, sim: 'Sim, salvar' });
    if(!ok) return;
    $('regra-salvar').disabled = true;
    try{
      if(regraEditando) await api('PUT', `/clientes/${clienteDasRegras.id}/regras/${regraEditando.id}`, corpo);
      else await api('POST', `/clientes/${clienteDasRegras.id}/regras`, corpo);
      regras = (await api('GET', `/clientes/${clienteDasRegras.id}/regras`)).regras;
      desenharRegras();
      $('regra-form').hidden = true;
    }catch(err){ $('regra-erro').textContent = err.message; $('regra-erro').hidden = false; }
    finally{ $('regra-salvar').disabled = false; }
  });

  /* ---------- carregar ---------- */
  async function carregar(){
    const botao = $('dono-atualizar');
    botao.disabled = true; botao.textContent = 'Atualizando…';
    try{
      const [r, s, d, eq] = await Promise.all([api('GET', '/resumo'), api('GET', '/saude'), api('GET', '/donos'), api('GET', '/equipes')]);
      resumo = r; desenharResumo(); desenharSaude(s); desenharDonos(d); desenharPromocao(r.promocao); desenharEquipes(eq);
    }catch(err){
      if(err.status === 403){ document.querySelector('main').innerHTML = `<a class="ass-voltar" href="/">← Voltar</a><h1 class="ass-titulo">Painel do dono</h1><p class="ass-sub">${esc(err.message)}</p>`; return; }
      $('dono-sub').textContent = err.message;
    }finally{
      botao.disabled = false; botao.textContent = 'Atualizar';
    }
  }
  $('dono-atualizar').addEventListener('click', carregar);
  carregar();
})();
