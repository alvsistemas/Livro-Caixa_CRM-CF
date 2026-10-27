/* Ajudantes comuns aos três aplicativos (CRM, Controle financeiro, PDV) e às telas de equipe.
   Antes cada um tinha a sua cópia, e elas já tinham começado a divergir (a data de "hoje" em
   UTC num lugar e no horário local noutro; telefone formatado só no PDV). Carregue este arquivo
   ANTES dos scripts de cada página. Fica em window.Comum. */
(function (raiz) {
  // texto vindo do usuário dentro do HTML: nunca vira código
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const formatoReal = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 });
  // R$ 1.234,56
  const dinheiro = (n) => formatoReal.format(Number(n) || 0);
  // AAAA-MM-DD de hoje (ou da data dada) no horário de quem usa — não em UTC, que depois das 21h no
  // Brasil já seria o dia seguinte
  const hojeISO = (d) => { d = d || new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const mesISO = (d) => hojeISO(d).slice(0, 7);
  // AAAA-MM-DD -> DD/MM/AAAA
  const dataBR = (iso) => { if (!iso) return ''; const [a, m, d] = String(iso).slice(0, 10).split('-'); return a && m && d ? `${d}/${m}/${a}` : String(iso); };
  // (11) 98888-7777, sem o 55 do Brasil; o que não for telefone brasileiro volta como veio
  const telefone = (t) => {
    let d = String(t || '').replace(/\D/g, '');
    if ((d.length === 12 || d.length === 13) && d.startsWith('55')) d = d.slice(2);
    if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
    if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return String(t || '');
  };
  raiz.Comum = { esc, dinheiro, hojeISO, mesISO, dataBR, telefone };
})(typeof window !== 'undefined' ? window : globalThis);
