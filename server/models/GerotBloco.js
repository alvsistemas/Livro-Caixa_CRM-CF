const { definirModelo } = require('../db/modelo');
const { jsonPadrao } = require('./_comum');
module.exports = definirModelo('GerotBloco', {
  tabela: 'rotina_blocos',
  campos: {
    userId: { type: 'id', ref: 'User', required: true },
    semanaInicio: { type: 'string', required: true }, // segunda-feira da semana, "YYYY-MM-DD"
    diaSemana: { type: 'int', required: true, min: 0, max: 4 }, // 0=segunda ... 4=sexta
    horarioInicio: { type: 'string', required: true }, // "08:00" ... "19:00"
    horarioFim: { type: 'string', required: true }, // exclusivo
    texto: { type: 'string', required: true },
  },
  transformJSON: jsonPadrao(),
});
