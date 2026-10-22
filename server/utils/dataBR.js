// Data de hoje no horário de Brasília (AAAA-MM-DD). Não dá pra usar toISOString(): à noite
// (a partir das 21h) o UTC já virou o dia seguinte e o lead ficaria com a data errada.
function hojeBR(agora = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(agora);
}
module.exports = { hojeBR };
