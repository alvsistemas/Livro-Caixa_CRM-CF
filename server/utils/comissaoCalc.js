/* ---- Motor de comissão, usado pelas Regras de Comissão editáveis (botão de engrenagem) ----
   Cada regra tem uma lista de "blocos": N parcelas, cada uma valendo um percentual do
   valor da venda. Serve pra qualquer modelo de comissão: parcela única, várias parcelas
   iguais ou blocos diferentes. Fórmula: value = round(valorVenda * percentual, 2). */
function calcComissaoPorBlocos(valorVenda, blocos) {
  const valor = parseFloat(valorVenda) || 0;
  const lista = Array.isArray(blocos) && blocos.length ? blocos : [{ parcelas: 1, percentual: 0 }];
  return lista.map((b) => ({
    parcelas: Math.max(1, parseInt(b.parcelas, 10) || 1),
    percentual: parseFloat(b.percentual) || 0,
    value: Math.round(valor * (parseFloat(b.percentual) || 0) * 100) / 100,
  }));
}

// Resume uma lista de blocos calculados nos campos "legados" (parcelas/parcelas1/value/value2)
// que o restante do sistema (contratos antigos, exportações, etc.) já sabe ler — assim
// contratos com só 1 ou 2 blocos continuam se comportando exatamente como antes. Regras
// com 3+ blocos guardam o detalhe completo à parte, em Contrato.blocos.
function resumoLegadoDeBlocos(blocosCalculados) {
  const total = blocosCalculados.reduce((soma, b) => soma + b.value * b.parcelas, 0);
  const parcelas = blocosCalculados.reduce((soma, b) => soma + b.parcelas, 0);
  const primeiro = blocosCalculados[0] || { parcelas: 0, value: 0 };
  const segundo = blocosCalculados[1];
  return {
    parcelas,
    parcelas1: primeiro.parcelas,
    value: primeiro.value,
    value2: segundo ? segundo.value : 0,
    total: Math.round(total * 100) / 100,
  };
}

// Calcula a comissão de uma regra (do banco, com userId/chave/nome/blocos/mesIndependente)
// pra um valor de venda — devolve tanto o detalhe completo (blocos) quanto o
// resumo legado, prontos pra salvar num Contrato.
function calcComissaoPorRegra(valorVenda, regra) {
  const blocosCalculados = calcComissaoPorBlocos(valorVenda, regra && regra.blocos);
  const legado = resumoLegadoDeBlocos(blocosCalculados);
  return { blocos: blocosCalculados, ...legado };
}

module.exports = {
  calcComissaoPorBlocos,
  resumoLegadoDeBlocos,
  calcComissaoPorRegra,
};
