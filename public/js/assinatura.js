/* Tela de assinatura: mostra a situação, os planos, leva pro pagamento no Asaas,
   troca de plano e cancela. Quem decide o que foi pago é o servidor (que consulta o Asaas). */
(function(){
  const token = localStorage.getItem('token');
  if(!token){ window.location.href = 'login.html'; return; }

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const brl = (v) => Number(v || 0).toLocaleString('pt-BR', { style:'currency', currency:'BRL' });
  const data = (v) => { if(!v) return '—'; const d = /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(v + 'T12:00:00') : new Date(v); return d.toLocaleDateString('pt-BR', { timeZone:'America/Sao_Paulo' }); };

  // de onde a pessoa veio (pra voltar pro lugar certo)
  const params = new URLSearchParams(location.search);
  const origem = params.get('de');
  const voltarPara = origem === 'crm' ? 'index.html' : origem === 'financeiro' ? 'financeiro/' : 'inicio.html';
  $('ass-voltar').href = voltarPara;

  let situacao = null;
  let planoEscolhido = params.get('plano');
  let cicloEscolhido = params.get('ciclo') === 'anual' ? 'anual' : 'mensal';

  async function api(metodo, caminho, corpo){
    const res = await fetch('/api/assinatura' + caminho, {
      method: metodo,
      headers: { 'Content-Type':'application/json', Authorization:'Bearer ' + token },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
    if(res.status === 401){ sair(); throw new Error('Sessão expirada.'); }
    let dados = null;
    try{ dados = await res.json(); }catch(e){ /* sem corpo */ }
    if(!res.ok) throw new Error((dados && dados.error) || 'Não foi possível concluir agora. Tente de novo.');
    return dados;
  }

  function sair(){
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = 'login.html';
  }

  function confirmar({ titulo, texto, sim }){
    return new Promise((ok) => {
      $('ass-modal-titulo').textContent = titulo;
      $('ass-modal-texto').textContent = texto;
      $('ass-modal-sim').textContent = sim;
      $('ass-modal').hidden = false;
      $('ass-modal-sim').focus();
      const fim = (v) => { $('ass-modal').hidden = true; $('ass-modal-sim').onclick = null; $('ass-modal-nao').onclick = null; ok(v); };
      $('ass-modal-sim').onclick = () => fim(true);
      $('ass-modal-nao').onclick = () => fim(false);
    });
  }

  const STATUS = {
    livre:      { rotulo:'Liberado', classe:'ok' },
    cortesia:   { rotulo:'Cortesia', classe:'ok' },
    teste:      { rotulo:'Teste grátis', classe:'' },
    aguardando: { rotulo:'Aguardando pagamento', classe:'alerta' },
    ativa:      { rotulo:'Ativa', classe:'ok' },
    atrasada:   { rotulo:'Pagamento atrasado', classe:'perigo' },
    cancelada:  { rotulo:'Cancelada', classe:'' },
  };
  const nomeDoPlano = (id) => { const p = (situacao.planos || []).find((x) => x.id === id); return p ? p.nome : id; };
  const valorDoPlano = (id) => { const p = (situacao.planos || []).find((x) => x.id === id); return p ? p.valor : 0; };
  const porCiclo = (c) => c === 'anual' ? '/ano' : '/mês';
  // preço desta pessoa (com desconto pessoal ou promoção), por plano e ciclo
  const oferta = (id, ciclo) => {
    const o = situacao.ofertas && situacao.ofertas[id] && situacao.ofertas[id][ciclo];
    if(o) return o;
    const p = (situacao.planos || []).find((x) => x.id === id) || {};
    const v = ciclo === 'anual' ? p.valorAnual : p.valor;
    return { base:v, final:v };
  };
  // "nos primeiros 3 meses" / "para sempre" / "até 10/01/2027"
  function textoDoDesconto(d, jaAssina){
    if(!d) return '';
    const quando = d.ate ? `até ${data(d.ate)}` : d.meses ? `nos primeiros ${d.meses} ${d.meses === 1 ? 'mês' : 'meses'}` : 'para sempre';
    return `${String(d.percentual).replace('.', ',')}% de desconto ${quando}${d.origem === 'promocao' && !jaAssina ? ' (promoção para novos clientes)' : ''}`;
  }

  function textoDoTopo(s){
    if(!s.cobranca) return { titulo:'Sua assinatura', sub:'A cobrança ainda não está ligada neste servidor, então tudo está liberado.' };
    if(s.status === 'cortesia') return { titulo:'Sua assinatura', sub:'Sua conta está liberada sem cobrança.' };
    if(!s.liberado){
      const motivos = {
        teste_acabou: 'Seu teste grátis acabou. Escolha um plano para continuar usando — seus dados estão guardados.',
        aguardando_pagamento: 'Falta pagar a primeira fatura para liberar o acesso. Seus dados estão guardados.',
        pagamento_atrasado: 'A fatura venceu e o prazo de tolerância acabou. Pague para liberar o acesso de novo — seus dados estão guardados.',
        cancelada: 'Sua assinatura foi cancelada e o período pago terminou. Assine de novo quando quiser — seus dados estão guardados.',
      };
      return { titulo:'Continue usando o Livro-Caixa', sub: motivos[s.motivo] || 'Sua assinatura não está ativa.' };
    }
    if(s.emTeste) return { titulo:'Sua assinatura', sub:`Você está no teste grátis: ${s.diasDeTeste === 1 ? 'falta 1 dia' : `faltam ${s.diasDeTeste} dias`}. Durante o teste, tudo do plano Completo fica liberado.` };
    return { titulo:'Sua assinatura', sub:'' };
  }

  function desenharSituacao(s){
    const el = $('ass-situacao');
    // sem assinatura e fora do teste, o topo já explica: não precisa do cartão
    const semNada = !s.temAssinatura && s.status !== 'cancelada' && !s.pagoAte && !s.emTeste;
    if(!s.cobranca || s.status === 'cortesia' || semNada){ el.hidden = true; return; }
    const st = s.emTeste && !s.temAssinatura ? { rotulo:'Tudo liberado', classe:'ok' } : (STATUS[s.status] || { rotulo:s.status, classe:'' });
    const linhas = [];
    if(s.temAssinatura || s.status === 'cancelada' || s.pagoAte){
      const valor = s.valorAtual != null ? s.valorAtual : oferta(s.plano, s.ciclo || 'mensal').final;
      linhas.push(`<div class="ass-dado">Valor<b>${brl(valor)}${porCiclo(s.ciclo)}</b></div>`);
    }
    if(s.emTeste && s.testeAte) linhas.push(`<div class="ass-dado">Teste grátis até<b>${data(s.testeAte)}</b></div>`);
    if(s.pagoAte) linhas.push(`<div class="ass-dado">${s.status === 'cancelada' ? 'Acesso até' : 'Pago até'}<b>${data(s.pagoAte)}</b></div>`);
    if(s.proximoVencimento && s.status !== 'cancelada') linhas.push(`<div class="ass-dado">Próximo vencimento<b>${data(s.proximoVencimento)}</b></div>`);
    let aviso = '';
    if(s.emTolerancia) aviso = `<p class="ass-faixa ass-faixa-perigo" style="margin:14px 0 0">Sua fatura venceu. Pague nos próximos dias para não perder o acesso.</p>`;
    const botoes = [];
    if(s.linkPagamento && s.status !== 'cancelada') botoes.push(`<a class="ass-btn ass-btn-forte" href="${esc(s.linkPagamento)}" target="_blank" rel="noopener">Pagar a fatura em aberto</a>`);
    if(s.temAssinatura) botoes.push(`<button type="button" class="ass-btn" id="ass-atualizar">Já paguei — atualizar</button>`);
    if(s.temAssinatura) botoes.push(`<button type="button" class="ass-btn ass-btn-perigo" id="ass-cancelar">Cancelar assinatura</button>`);
    const titulo = s.temAssinatura || s.status === 'cancelada' ? `Plano ${esc(nomeDoPlano(s.plano))} ${s.ciclo === 'anual' ? 'anual' : 'mensal'}` : 'Teste grátis';
    if(s.desconto && (s.temAssinatura || s.status === 'cancelada')) aviso += `<p class="ass-texto">${esc(textoDoDesconto(s.desconto, true))}.</p>`;
    el.innerHTML = `
      <div class="ass-status-linha"><span class="ass-plano-nome">${titulo}</span><span class="ass-selo ${st.classe}">${esc(st.rotulo)}</span></div>
      ${linhas.length ? `<div class="ass-dados">${linhas.join('')}</div>` : ''}
      ${aviso}
      ${s.status === 'aguardando' ? `<p class="ass-texto">Depois de pagar, o acesso libera sozinho em alguns instantes (no Pix e no cartão, quase na hora; no boleto, até 3 dias úteis).</p>` : ''}
      ${botoes.length ? `<div class="ass-acoes">${botoes.join('')}</div>` : ''}`;
    el.hidden = false;
    const at = $('ass-atualizar');
    if(at) at.onclick = () => acao(at, async () => { situacao = (await api('POST', '/atualizar')).situacao; desenhar(); });
    const cc = $('ass-cancelar');
    if(cc) cc.onclick = async () => {
      const ate = s.pagoAte ? ` Você continua com acesso até ${data(s.pagoAte)}, que já está pago.` : '';
      const ok = await confirmar({ titulo:'Cancelar a assinatura?', texto:`As próximas cobranças deixam de ser geradas.${ate} Seus dados continuam guardados e você pode assinar de novo quando quiser.`, sim:'Sim, cancelar' });
      if(ok) acao(cc, async () => { situacao = (await api('POST', '/cancelar')).situacao; desenhar(); });
    };
  }

  function desenharPlanos(s){
    const sec = $('ass-planos-sec');
    if(!s.cobranca || s.status === 'cortesia'){ sec.hidden = true; return; }
    $('ass-planos-titulo').textContent = s.temAssinatura ? 'Trocar de plano' : 'Escolha seu plano';
    if(s.temAssinatura && !params.get('ciclo') && !desenharPlanos.jaEscolheuCiclo) cicloEscolhido = s.ciclo || 'mensal';
    const economia = (s.planos || []).map((p) => 1 - p.valorAnual / (p.valor * 12)).reduce((a, b) => Math.min(a, b), 1);
    $('ass-ciclo').innerHTML = ['mensal', 'anual'].map((c) => `<button type="button" class="ass-ciclo-opcao ${cicloEscolhido === c ? 'ativo' : ''}" data-ciclo="${c}" role="radio" aria-checked="${cicloEscolhido === c}">${c === 'mensal' ? 'Mensal' : `Anual <span>economize ${Math.round(economia * 100)}%</span>`}</button>`).join('');
    document.querySelectorAll('[data-ciclo]').forEach((b) => b.addEventListener('click', () => { cicloEscolhido = b.dataset.ciclo; desenharPlanos.jaEscolheuCiclo = true; desenharPlanos(situacao); if(!$('ass-checkout').hidden) abrirCheckout(); }));
    const notaDesconto = s.desconto && !s.temAssinatura ? `<p class="ass-faixa ass-faixa-desconto">${esc(textoDoDesconto(s.desconto, false))}. O preço abaixo já tem o desconto.</p>` : '';
    $('ass-desconto-nota').innerHTML = notaDesconto;
    $('ass-planos').innerHTML = (s.planos || []).map((p) => {
      const atual = s.temAssinatura && p.id === s.plano && cicloEscolhido === (s.ciclo || 'mensal');
      const texto = atual ? 'Seu plano atual' : s.temAssinatura ? `Mudar para o ${p.nome} ${cicloEscolhido}` : `Assinar o ${p.nome}`;
      const o = oferta(p.id, cicloEscolhido);
      const temDesconto = o.final < o.base;
      const sub = cicloEscolhido === 'anual'
        ? `equivale a ${brl(o.final / 12)}/mês · ${brl(p.valor * 12 - p.valorAnual)} a menos que 12 mensalidades`
        : '';
      return `<div class="ass-plano ${atual ? 'atual' : ''}">
        <div class="ass-plano-topo">${esc(p.nome)}</div>
        ${temDesconto ? `<div class="ass-preco-antigo">${brl(o.base)}${porCiclo(cicloEscolhido)}</div>` : ''}
        <div class="ass-preco">${brl(o.final)}<small>${porCiclo(cicloEscolhido)}</small></div>
        ${sub ? `<div class="ass-preco-sub">${sub}</div>` : ''}
        <ul>${p.itens.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>
        <button type="button" class="ass-btn ${atual ? '' : 'ass-btn-forte'}" data-plano="${esc(p.id)}" ${atual ? 'disabled' : ''}>${esc(texto)}</button>
      </div>`;
    }).join('');
    sec.hidden = false;
    document.querySelectorAll('[data-plano]').forEach((b) => b.addEventListener('click', () => escolherPlano(b.dataset.plano, b)));
  }

  async function escolherPlano(id, botao){
    if(situacao.temAssinatura){
      const o = oferta(id, cicloEscolhido);
      const mudaCiclo = cicloEscolhido !== (situacao.ciclo || 'mensal');
      const quando = mudaCiclo
        ? `A cobrança ${cicloEscolhido} começa quando o período que você já pagou terminar`
        : 'O novo valor vale a partir da próxima fatura';
      const ok = await confirmar({ titulo:`Mudar para o ${nomeDoPlano(id)} ${cicloEscolhido}?`, texto:`${quando}: ${brl(o.final)}${porCiclo(cicloEscolhido)}. O que você já pagou continua valendo, e a mudança no que você pode usar vale na hora.`, sim:'Sim, mudar' });
      if(ok) acao(botao, async () => { situacao = (await api('POST', '/trocar-plano', { plano:id, ciclo:cicloEscolhido })).situacao; desenhar(); });
      return;
    }
    planoEscolhido = id;
    abrirCheckout();
  }

  function abrirCheckout(){
    const s = situacao;
    const p = (s.planos || []).find((x) => x.id === planoEscolhido);
    if(!p) return;
    const hoje = new Date().toISOString().slice(0, 10);
    const venc = s.emTeste && s.testeAte && s.testeAte.slice(0, 10) > hoje ? data(s.testeAte) : 'hoje';
    const o = oferta(p.id, cicloEscolhido);
    const repete = cicloEscolhido === 'anual' ? 'Depois, todo ano na mesma data' : 'Depois, todo mês no mesmo dia';
    const desconto = s.desconto ? ` ${esc(textoDoDesconto(s.desconto, false))}; depois disso, ${brl(o.base)}${porCiclo(cicloEscolhido)}.` : '';
    $('ass-checkout-resumo').innerHTML = `Plano <b>${esc(p.nome)} ${cicloEscolhido}</b>, <b>${brl(o.final)}${porCiclo(cicloEscolhido)}</b>.${s.desconto && s.desconto.meses == null && !s.desconto.ate ? ` ${esc(textoDoDesconto(s.desconto, false))}.` : desconto} A primeira cobrança vence <b>${venc}</b>${venc !== 'hoje' ? ', quando o teste grátis acaba (você pode pagar antes, se preferir)' : ''}. ${repete}. Você pode cancelar quando quiser.`;
    if(!$('ass-nome').value) $('ass-nome').value = s.nome || '';
    $('ass-erro').hidden = true;
    // ainda no teste grátis e sem assinatura: dá pra deixar pra depois
    $('ass-testar-wrap').hidden = !(s.emTeste && !s.temAssinatura);
    $('ass-checkout').hidden = false;
    $('ass-checkout').scrollIntoView({ behavior:'smooth', block:'start' });
    $('ass-nome').focus();
  }

  // máscara do CPF/CNPJ enquanto digita
  $('ass-doc').addEventListener('input', (e) => {
    const n = e.target.value.replace(/\D/g, '').slice(0, 14);
    e.target.value = n.length <= 11
      ? n.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2')
      : n.replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d)/, '$1-$2');
  });

  $('ass-cancelar-checkout').addEventListener('click', () => { $('ass-checkout').hidden = true; });

  $('ass-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const erro = $('ass-erro');
    erro.hidden = true;
    const nome = $('ass-nome').value.trim();
    const doc = $('ass-doc').value.replace(/\D/g, '');
    if(nome.length < 3){ erro.textContent = 'Informe o nome completo ou a razão social.'; erro.hidden = false; return; }
    if(doc.length !== 11 && doc.length !== 14){ erro.textContent = 'O CPF tem 11 números e o CNPJ, 14.'; erro.hidden = false; return; }
    const botao = $('ass-enviar');
    botao.disabled = true; botao.textContent = 'Gerando a fatura…';
    try{
      const r = await api('POST', '/assinar', { plano:planoEscolhido, ciclo:cicloEscolhido, nome, cpfCnpj:doc });
      situacao = r.situacao;
      $('ass-checkout').hidden = true;
      desenhar();
      if(r.link) window.location.href = r.link; // vai pra fatura do Asaas
    }catch(err){
      erro.textContent = err.message; erro.hidden = false;
    }finally{
      botao.disabled = false; botao.textContent = 'Ir para o pagamento';
    }
  });

  async function acao(botao, fn){
    const texto = botao.textContent;
    botao.disabled = true; botao.textContent = 'Aguarde…';
    try{ await fn(); }
    catch(err){ await confirmar({ titulo:'Não deu certo', texto:err.message, sim:'Entendi' }); }
    finally{ if(document.body.contains(botao)){ botao.disabled = false; botao.textContent = texto; } }
  }

  function desenhar(){
    const s = situacao;
    const topo = textoDoTopo(s);
    $('ass-titulo').textContent = topo.titulo;
    $('ass-sub').textContent = topo.sub;
    $('ass-aviso-sandbox').hidden = !(s.cobranca && s.ambiente === 'sandbox');
    $('ass-voltar').hidden = !s.liberado;
    desenharSituacao(s);
    desenharPlanos(s);
  }

  $('ass-sair').addEventListener('click', sair);
  $('ass-exportar').addEventListener('click', async () => {
    try{
      const res = await fetch('/api/backup/exportar-tudo', { headers:{ Authorization:'Bearer ' + token } });
      if(!res.ok) throw new Error();
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `livro-caixa-meus-dados-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }catch(e){ confirmar({ titulo:'Não deu certo', texto:'Não foi possível baixar seus dados agora. Tente de novo em instantes.', sim:'Entendi' }); }
  });

  // ao voltar da aba da fatura, confere de novo (o pagamento pode ter acabado de cair)
  document.addEventListener('visibilitychange', async () => {
    if(document.visibilityState !== 'visible' || !situacao || !situacao.temAssinatura) return;
    try{ situacao = (await api('POST', '/atualizar')).situacao; desenhar(); }catch(e){ /* tenta de novo depois */ }
  });

  (async function iniciar(){
    try{
      // voltando do Asaas, já consulta o pagamento; senão, só lê a situação
      const voltandoDoPagamento = params.get('pago') === '1';
      situacao = voltandoDoPagamento ? (await api('POST', '/atualizar')).situacao : await api('GET', '/');
      desenhar();
      if(planoEscolhido && !situacao.temAssinatura && situacao.cobranca) abrirCheckout();
    }catch(err){
      $('ass-sub').textContent = err.message;
    }
  })();
})();
