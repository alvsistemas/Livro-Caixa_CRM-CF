/* Horários do caixa do PDV (sem banco: só contas de data e hora, no horário de Brasília).

   Modos de funcionamento do caixa (configurações do PDV, campo modoCaixa):
   - manual:  a pessoa abre e fecha na mão (um caixa por dia);
   - horario: abre e fecha sozinho no horário escolhido (abre/fecha/dias da semana);
   - turnos:  24 horas, um caixa por turno; não fecha sozinho, mas avisa para conferir;
   - livre:   vende sem caixa (sem conferência da gaveta).

   "Janela" = um período de funcionamento: { inicio: Date, fim: Date, nome }.
   Um horário que passa da meia-noite (ex.: 18:00 às 02:00) termina no dia seguinte.
   "Virada do dia" (modo turnos): uma venda antes desse horário conta no dia anterior. */
const FUSO = 'America/Sao_Paulo';
const MODOS = ['manual', 'horario', 'turnos', 'livre'];
const HORA_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

const minutos = (hhmm) => { const m = HORA_RE.exec(String(hhmm || '')); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };

const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short' });
const DIAS = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
// data (AAAA-MM-DD), minuto do dia e dia da semana (0 = domingo) em Brasília
function partesBR(agora) {
  const p = Object.fromEntries(fmt.formatToParts(agora).map((x) => [x.type, x.value]));
  return { data: `${p.year}-${p.month}-${p.day}`, min: Number(p.hour) * 60 + Number(p.minute), dow: DIAS[p.weekday] };
}
function somaDias(data, n) {
  const d = new Date(`${data}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const diaDaSemana = (data) => new Date(`${data}T12:00:00Z`).getUTCDay();
// o instante (Date) de "data às min" no horário de Brasília
function instanteBR(data, min) {
  const [a, m, d] = data.split('-').map(Number);
  const comoUtc = Date.UTC(a, m - 1, d, 0, min);
  // diferença entre o relógio de Brasília e o UTC nesse momento (−3 h hoje; funciona se voltar o horário de verão)
  const p = partesBR(new Date(comoUtc));
  const [a2, m2, d2] = p.data.split('-').map(Number);
  const desloc = Date.UTC(a2, m2 - 1, d2, 0, p.min) - comoUtc;
  return new Date(comoUtc - desloc);
}
const hhmm = (min) => `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

// janela que começa no dia "data" (ou null se esse dia não abre)
function janelaDoDia(data, ini, fim, nome = '') {
  const inicio = instanteBR(data, ini);
  const fimD = fim > ini ? instanteBR(data, fim) : instanteBR(somaDias(data, 1), fim); // fim <= início: termina no dia seguinte (igual = 24 h)
  return { inicio, fim: fimD, nome };
}

// Horário de funcionamento: a janela em que "agora" está (ou null se está fechado agora)
function janelaHorario(h, agora) {
  const ini = minutos(h && h.abre); const fim = minutos(h && h.fecha);
  if (ini === null || fim === null || ini === fim) return null;
  const hoje = partesBR(agora).data;
  for (const data of [hoje, somaDias(hoje, -1)]) {
    if (!(h.dias || []).includes(diaDaSemana(data))) continue;
    const j = janelaDoDia(data, ini, fim);
    if (j.inicio <= agora && agora < j.fim) return j;
  }
  return null;
}
// Próxima abertura depois de "agora" (para mostrar "abre sozinho amanhã às 08:00")
function proximaAbertura(h, agora) {
  const ini = minutos(h && h.abre); const fim = minutos(h && h.fecha);
  if (ini === null || fim === null || ini === fim || !(h.dias || []).length) return null;
  const hoje = partesBR(agora).data;
  for (let i = 0; i <= 7; i += 1) {
    const data = somaDias(hoje, i);
    if (!(h.dias || []).includes(diaDaSemana(data))) continue;
    const j = janelaDoDia(data, ini, fim);
    if (j.inicio > agora) return j;
  }
  return null;
}
// Turnos (24 horas): o turno em que "instante" está
function turnoEm(turnos, instante) {
  const hoje = partesBR(instante).data;
  for (const data of [hoje, somaDias(hoje, -1)]) {
    for (const t of turnos || []) {
      const ini = minutos(t.inicio); const fim = minutos(t.fim);
      if (ini === null || fim === null) continue;
      const j = janelaDoDia(data, ini, fim, t.nome);
      if (j.inicio <= instante && instante < j.fim) return j;
    }
  }
  return null;
}
// A janela automática do momento, conforme o modo (null = fora do horário ou modo sem automático)
function janelaAtual(pdv, agora) {
  if (pdv.modoCaixa === 'horario') return janelaHorario(pdv.horario, agora);
  if (pdv.modoCaixa === 'turnos') return turnoEm(pdv.turnos, agora);
  return null;
}
// Dia de trabalho: no modo turnos, o que acontece antes da virada conta no dia anterior
function diaDeTrabalho(pdv, agora = new Date()) {
  const p = partesBR(agora);
  const virada = pdv && pdv.modoCaixa === 'turnos' ? minutos(pdv.virada) : null;
  return virada && p.min < virada ? somaDias(p.data, -1) : p.data;
}

// Confere e normaliza o que vem da tela (lança Error com a mensagem para a pessoa)
function validarHorario(h) {
  const abre = minutos(h && h.abre); const fecha = minutos(h && h.fecha);
  if (abre === null || fecha === null) throw new Error('Informe a hora de abrir e de fechar (ex.: 08:00).');
  if (abre === fecha) throw new Error('A hora de fechar precisa ser diferente da hora de abrir. Funciona 24 horas? Escolha "24 horas, em turnos".');
  const dias = [...new Set((Array.isArray(h.dias) ? h.dias : []).map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort();
  if (!dias.length) throw new Error('Escolha pelo menos um dia da semana.');
  return { abre: hhmm(abre), fecha: hhmm(fecha), dias };
}
function validarTurnos(lista) {
  if (!Array.isArray(lista) || !lista.length) throw new Error('Cadastre pelo menos um turno.');
  if (lista.length > 6) throw new Error('No máximo 6 turnos.');
  const turnos = lista.map((t, i) => {
    const ini = minutos(t && t.inicio); const fim = minutos(t && t.fim);
    if (ini === null || fim === null) throw new Error(`Confira os horários do turno ${i + 1} (ex.: 06:00).`);
    const nome = String((t && t.nome) || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 30) || `Turno ${i + 1}`;
    return { nome, inicio: hhmm(ini), fim: hhmm(fim), ini, dur: fim > ini ? fim - ini : fim + 1440 - ini };
  }).sort((a, b) => a.ini - b.ini);
  // os turnos não podem se sobrepor (somados, no máximo 24 horas)
  for (let i = 0; i < turnos.length; i += 1) {
    const t = turnos[i]; const prox = turnos[(i + 1) % turnos.length];
    const iniProx = prox.ini + (i + 1 === turnos.length ? 1440 : 0);
    if (turnos.length > 1 ? t.ini + t.dur > iniProx : t.dur > 1440) throw new Error(`O turno “${t.nome}” passa por cima do turno “${prox.nome}”.`);
  }
  return turnos.map(({ nome, inicio, fim }) => ({ nome, inicio, fim }));
}

module.exports = {
  FUSO, MODOS, minutos, hhmm, partesBR, somaDias, instanteBR,
  janelaHorario, proximaAbertura, turnoEm, janelaAtual, diaDeTrabalho, validarHorario, validarTurnos,
};
