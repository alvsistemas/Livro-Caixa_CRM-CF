// Transforma qualquer formato de telefone digitado (com espaço, parênteses, +55, etc.)
// no formato que a API do WhatsApp espera: só dígitos, com o 55 do Brasil na frente
// quando a pessoa não digitou o código do país.
function normalizarTelefone(tel) {
  let digitos = String(tel || '').replace(/\D/g, '');
  if (!digitos) return null;
  if (digitos.length <= 11) digitos = '55' + digitos; // assume Brasil se não veio com DDI
  return digitos;
}

// Chave para achar o MESMO telefone escrito de jeitos diferentes: só dígitos, sem o 55 do
// Brasil, e sem o 9 extra do celular (o mesmo número com e sem o 9 vira a mesma chave).
// "(15) 99999-1234", "+55 15 99999-1234" e "15 9999-1234" -> "1599991234". null = curto demais.
function chaveTelefone(tel) {
  let d = String(tel || '').replace(/\D/g, '');
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) d = d.slice(2);
  if (d.length === 11 && d[2] === '9') d = d.slice(0, 2) + d.slice(3); // DDD + 9 + 8 dígitos
  return d.length === 10 ? d : null;
}

module.exports = { normalizarTelefone, chaveTelefone };
