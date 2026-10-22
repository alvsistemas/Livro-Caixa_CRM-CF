/* ---------- Versão administrativa (recrutamento) — vocabulário ----------
   O /adm usa o mesmo painel. Aqui trocamos as palavras de venda pelas de contratação
   direto na tela (texto e dicas), em vez de duplicar cada tela. Só roda quando a conta é perfil "rh". */
const VOCABULARIO_RH = [
  [/Mês de início de contato/g, 'Data de entrada'],
  [/Mês de venda/g, 'Data de contratação'],
  [/Valor da carta de crédito vendida/g, 'Pretensão salarial'],
  [/Valor de crédito/g, 'Pretensão salarial'],
  [/Valor da carta \(R\$\)/g, 'Pretensão salarial (R$)'],
  [/Meta de vendas/g, 'Meta de contratações'],
  [/\bPipeline\b/g, 'Processo seletivo'],
  [/\bEm negociação\b/g, 'Em processo'],
  [/funil de vendas/g, 'processo seletivo'],
  [/\bGanho\b/g, 'Contratados'],
  [/\bVendidos?\b/g, 'Contratados'],
  [/\bTicket médio\b/g, 'Pretensão média'],
  [/\bfechados\b/g, 'contratados'],
  [/\bnegócios\b/g, 'candidatos'],
  [/\bnegócio\b/g, 'candidato'],
  [/\bLeads\b/g, 'Candidatos'],
  [/\bleads\b/g, 'candidatos'],
  [/\bLead\b/g, 'Candidato'],
  [/\blead\b/g, 'candidato'],
  [/\bClientes\b/g, 'Candidatos'],
  [/\bclientes\b/g, 'candidatos'],
  [/\bCliente\b/g, 'Candidato'],
  [/\bcliente\b/g, 'candidato'],
];
function traduzirParaRH(texto){
  let t = texto;
  for(const [re, novo] of VOCABULARIO_RH) t = t.replace(re, novo);
  return t;
}
function aplicarVocabularioRH(raiz){
  if(!perfilRH() || !raiz) return;
  const walker = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT, {
    acceptNode: (n)=>{
      const p = n.parentNode;
      if(!p || /^(SCRIPT|STYLE|TEXTAREA|INPUT)$/.test(p.nodeName)) return NodeFilter.FILTER_REJECT;
      return n.nodeValue && n.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    },
  });
  const nos = [];
  while(walker.nextNode()) nos.push(walker.currentNode);
  nos.forEach(n=>{ const novo = traduzirParaRH(n.nodeValue); if(novo !== n.nodeValue) n.nodeValue = novo; });
  if(raiz.querySelectorAll){
    raiz.querySelectorAll('[placeholder],[title]').forEach(el=>{
      ['placeholder','title'].forEach(a=>{
        const v = el.getAttribute(a);
        if(v){ const novo = traduzirParaRH(v); if(novo !== v) el.setAttribute(a, novo); }
      });
    });
  }
}
function iniciarPerfilRH(){
  if(!perfilRH()) return;
  document.body.classList.add('perfil-rh');
  document.title = 'Painel Administrativo';
  let agendado = false;
  const obs = new MutationObserver(()=>{
    if(agendado) return;
    agendado = true;
    requestAnimationFrame(()=>{ agendado = false; aplicarVocabularioRH(document.body); });
  });
  obs.observe(document.body, { childList:true, subtree:true });
  aplicarVocabularioRH(document.body);
}
iniciarPerfilRH();
// a conta pode virar "rh" depois que o /auth/me responde
document.addEventListener('DOMContentLoaded', iniciarPerfilRH);
