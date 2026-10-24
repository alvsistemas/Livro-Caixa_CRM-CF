/* ================================================================
   Livro-Caixa — front-end
   Estrutura com barra lateral (Dashboard / Pipeline / Leads / Tarefas),
   inspirada no CRM Foco, mantendo tudo que já existia (MongoDB via
   API REST, modo noturno, cor de destaque, botão do WhatsApp, arraste de cards).
================================================================ */

const API_BASE = '/api';

/* ---------- PWA: registra o service worker (instalável no celular) ---------- */
if('serviceWorker' in navigator){
  window.addEventListener('load', ()=>{
    navigator.serviceWorker.register('/sw.js').catch(()=>{ /* sem problema, o app funciona normal sem isso */ });
  });
}

/* ---------- helpers ---------- */
const fmtBRL = (n) => new Intl.NumberFormat('pt-BR', { style:'currency', currency:'BRL', minimumFractionDigits:2, maximumFractionDigits:2 }).format(n || 0);
const MESES_ABREV = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
const MESES_CHEIO = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const currentMonthKey = () => { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; };
// Acha a segunda-feira da semana de uma data, no formato "YYYY-MM-DD" — usado como
// identificador de cada semana da Rotina.
function inicioDaSemana(data){
  const d = new Date(data);
  const diaSemana = d.getDay(); // 0=domingo, 1=segunda, ...
  const deslocamento = diaSemana === 0 ? -6 : 1 - diaSemana; // volta até a segunda-feira daquela semana
  d.setDate(d.getDate() + deslocamento);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
const monthLabel = (key, full=false) => {
  if(!key) return '';
  const [y,m] = key.split('-').map(Number);
  const arr = full ? MESES_CHEIO : MESES_ABREV;
  return full ? `${arr[m-1]} de ${y}` : `${arr[m-1]}/${y}`;
};
const maskInteiro = (raw) => {
  const digits = String(raw).replace(/\D/g,'');
  if(!digits) return { numero:0, texto:'' };
  const numero = parseInt(digits,10);
  return { numero, texto: numero.toLocaleString('pt-BR') };
};
const esc = (s='') => String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
function formatDate(iso){
  if(!iso) return '';
  const d = new Date(iso);
  if(isNaN(d.getTime())) return '';
  return d.toLocaleDateString('pt-BR', { timeZone:'UTC' });
}

// Monta o link wa.me a partir do telefone digitado (aceita com ou sem DDI 55)
function waLink(telefone){
  let digitos = String(telefone||'').replace(/\D/g,'');
  if(!digitos) return null;
  if(digitos.length <= 11) digitos = '55' + digitos; // assume Brasil se não veio com DDI
  return `https://wa.me/${digitos}`;
}
function abrirWhatsapp(telefone){
  const link = waLink(telefone);
  if(link) window.open(link, '_blank', 'noopener');
}
const WA_ICON = `<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2C6.48 2 2 6.36 2 11.75c0 1.87.52 3.62 1.42 5.12L2 22l5.3-1.38a10.4 10.4 0 0 0 4.7 1.13c5.52 0 10-4.36 10-9.75S17.52 2 12 2Zm5.3 13.88c-.23.62-1.32 1.2-1.82 1.24-.47.05-.9.22-3.02-.63-2.56-1.03-4.2-3.63-4.33-3.8-.13-.17-1.03-1.34-1.03-2.56 0-1.21.65-1.8.88-2.05.23-.24.5-.3.67-.3.17 0 .33 0 .48.01.16.01.36-.06.56.42.23.55.77 1.9.84 2.04.07.14.11.3.02.48-.09.17-.14.28-.27.43-.13.15-.28.33-.4.45-.13.13-.27.27-.12.53.16.27.7 1.13 1.5 1.83 1.03.9 1.9 1.18 2.17 1.31.27.13.43.11.59-.07.16-.18.68-.77.87-1.03.18-.27.36-.22.6-.13.24.09 1.55.72 1.82.85.27.13.45.2.51.31.07.12.07.65-.16 1.27Z"/></svg>`;

/* ---------- ícones da interface (genéricos, estilo linha) ---------- */
const ICON_DASHBOARD = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>`;
const ICON_PIPELINE = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="4.5" height="16" rx="1"/><rect x="9.75" y="4" width="4.5" height="10" rx="1"/><rect x="16.5" y="4" width="4.5" height="13" rx="1"/></svg>`;
const ICON_LEADS = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`;
const ICON_TASKS = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 11 3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>`;
const ICON_COMISSOES = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="8" r="3"/><circle cx="16" cy="16" r="3"/><line x1="19" y1="5" x2="5" y2="19"/></svg>`;
const ICON_SETTINGS = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/></svg>`;
const ICON_SPARKLE = `<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2l1.6 5.4L19 9l-5.4 1.6L12 16l-1.6-5.4L5 9l5.4-1.6L12 2Z"/><path d="M19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8L19 14Z"/><path d="M5 14l.8 2.2L8 17l-2.2.8L5 20l-.8-2.2L2 17l2.2-.8L5 14Z"/></svg>`;
const ICON_BELL = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>`;
const ICON_BUSCA = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`;
const ICON_RELATORIOS = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>`;
const ICON_SUPORTE = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;
const ICON_CHAT_INTERNO = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>`;
const ICON_SUPERVISAO = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z"/><circle cx="12" cy="12" r="3"/></svg>`;
const ICON_AUTOMACOES = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`;
const ICON_FLUXOS = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="5" cy="6" r="2"/><circle cx="5" cy="18" r="2"/><circle cx="19" cy="12" r="2"/><path d="M5 8v8"/><path d="M7 6h6a4 4 0 0 1 4 4"/><path d="M7 18h6a4 4 0 0 0 4-4"/></svg>`;
const ICON_IMPORT_EXPORT = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 17l-4-4 4-4"/><path d="M4 13h11a4 4 0 0 0 4-4V7"/><path d="M16 7l4 4-4 4"/><path d="M20 11H9a4 4 0 0 0-4 4v2"/></svg>`;
const ICON_LOGOUT = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>`;
const ICON_MAIL = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/></svg>`;
const ICON_EDIT = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4Z"/></svg>`;
const ICON_REORDER = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/></svg>`;
const ICON_FUNNEL = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="4" y1="6" x2="20" y2="6"/><line x1="7" y1="12" x2="17" y2="12"/><line x1="10" y1="18" x2="14" y2="18"/></svg>`;
const ICON_BAU = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="4" rx="1"/><path d="M4 8v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><line x1="10" y1="12" x2="14" y2="12"/></svg>`;
const ICON_CANCELAR = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><line x1="9" y1="9" x2="15" y2="15"/><line x1="15" y1="9" x2="9" y2="15"/></svg>`;
const ICON_REATIVAR = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9.5 12l1.8 1.8L15 10.2"/></svg>`;
const ICON_TRASH = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>`;
const ICON_CHECK = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>`;
const ICON_MOVE = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="7 7 3 11 7 15"/><line x1="3" y1="11" x2="15" y2="11"/><polyline points="17 17 21 13 17 9"/><line x1="21" y1="13" x2="9" y2="13"/></svg>`;
const ICON_USERS = ICON_LEADS;
const ICON_DOLLAR = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`;
const ICON_TROPHY = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 21h8"/><path d="M12 17v4"/><path d="M7 4h10v5a5 5 0 0 1-10 0V4Z"/><path d="M17 6h2a2 2 0 0 1 0 4h-2"/><path d="M7 6H5a2 2 0 0 0 0 4h2"/></svg>`;
const ICON_TREND = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>`;
const ICON_CAMERA = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2Z"/><circle cx="12" cy="13" r="4"/></svg>`;

const TEMPS = {
  quente: { label:'Quente', emoji:'🔥', color:'var(--gold-text)', bg:'var(--gold)' },
  morno:  { label:'Morno',  emoji:'☀️', color:'var(--warm)',      bg:'var(--warm-soft)' },
  frio:   { label:'Frio',   emoji:'❄️', color:'var(--cold)',      bg:'var(--cold-soft)' },
};
const TIPOS = {
  aberto:  { label:'Em aberto', color:'var(--ink-soft)', bg:'var(--badge-neutral-bg)' },
  ganho:   { label:'Ganho',     color:'#FFFFFF',         bg:'var(--accent)' },
  perdido: { label:'Perdido',   color:'var(--ink-soft)', bg:'var(--badge-neutral-bg)', strike:true },
};
const PRIORIDADES = {
  alta:  { label:'Alta',  color:'var(--gold-text)', bg:'var(--gold)' },
  media: { label:'Média', color:'var(--warm)',       bg:'var(--warm-soft)' },
  baixa: { label:'Baixa', color:'var(--cold)',       bg:'var(--cold-soft)' },
};

/* ---------- cor de destaque personalizável ---------- */
const ACCENT_PRESETS = ['#141414', '#1D4E89', '#1F4D3A', '#6E1E2B', '#9C6B12', '#4A2E6F'];
function getAccentColor(){ return localStorage.getItem('accentColor') || ACCENT_PRESETS[0]; }
function setAccentColor(cor){
  localStorage.setItem('accentColor', cor);
  document.documentElement.style.setProperty('--accent', cor);
}
document.documentElement.style.setProperty('--accent', getAccentColor());

/* ---------- modo noturno ---------- */
function getDarkMode(){ return localStorage.getItem('darkMode') === '1'; }
function setDarkMode(ligado){
  localStorage.setItem('darkMode', ligado ? '1' : '0');
  document.documentElement.setAttribute('data-theme', ligado ? 'dark' : 'light');
}
setDarkMode(getDarkMode());

/* ---------- nome do site (fixo) ---------- */
document.title = 'CRM — Livro-Caixa';

/* ---------- sessão / login ---------- */
function getToken(){ return localStorage.getItem('token'); }
function getCurrentUser(){
  try{ return JSON.parse(localStorage.getItem('user') || 'null'); }
  catch(e){ return null; }
}
function logout(completo){
  if(window.Acesso){ Acesso.sair(completo === true); return; }
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  window.location.href = 'login.html';
}

/* Sem token, nem tenta carregar o painel — manda direto pro login */
if(!getToken()){
  window.location.href = 'login.html';
}

/* ---------- estado ---------- */
let currentUser = getCurrentUser();
let board = { columns: [], cards: [] };
let tasks = [];
let loaded = false;
let tasksLoaded = false;
let errorMsg = null;
let currentPage = 'dashboard';   // 'dashboard' | 'pipeline' | 'leads' | 'tarefas'
let filterMonth = currentMonthKey();  // começa no mês atual ao entrar no site — null seria "Geral"
let filtroEsfriando = false;
let dashboardPeriod = 'mes';     // '7dias' | 'mes' | 'trimestre' | 'ano'
let metaVendasValor = 0;
let metaVendasCarregada = false;
let editandoMetaVendas = false;
let metaVendasEquipeValor = 0;
let metaVendasEquipeVendido = 0;
let metaVendasEquipeCarregada = false;
let editandoMetaVendasEquipe = false;
let addingCol = false;
let newColNameVal = '';
let newColTipoVal = 'aberto';
let editingColId = null;
let editingColName = '';
let openMenuColId = null;
let openMoveMenuCardId = null;
let dateMenuOpen = false;
let leadsSearch = '';
let leadsStatusFilter = '';
let leadsOrdenarPor = 'padrao'; // 'padrao' | 'alfabetica' | 'recentes' | 'data-inicio' | 'data-venda'
let pipelineOrdenarPor = 'padrao';
let pipelineOrdenando = false;
let comissoesOrdenarPor = 'padrao';
let ordenarMenuAberto = null; // 'leads' | 'pipeline' | 'comissoes' | null
let mostrarArquivados = false;
let leadsSelecionados = new Set();
let leadsBulkEtiquetaAberta = false;
let leadsBulkEtiquetaValor = '';
let tarefasShowConcluidas = false;
let agendaMesAtual = currentMonthKey();
let agendaLoaded = false;
let agendaTarefas = [];
let agendaEventosGoogle = [];
let agendaDiaSelecionado = null;
let tarefaCopiada = null; // { titulo, prioridade, leadId, descricao } — sem data/hora, que são escolhidas ao colar
let modoSelecaoMultipla = false;
let horariosSelecionados = new Set(); // horas ("09:00" etc.) marcadas pra colar de uma vez, no modo de seleção múltipla
let diaAgendaCopiado = null; // { origemISO, tarefas:[{id,tipo,titulo,prioridade,leadId,descricao,hora}], modo:'copiar'|'mover' } — cópia/corte do dia inteiro
let longPressTimer = null;
let cardTouchDrag = null; // { cardId, cardEl, btn, arrastando, ultimoX, ultimoY, fantasmaEl } — arrastar card no Pipeline por toque, iniciado pela alcinha
let cardTouchLongPressTimer = null; // timer do "segurar pra arrastar" do card no celular (precisa existir antes do 1º toque, senão soltar o mouse no desktop gera erro no console)
let autoScrollDoArrastoInterval = null;
let arrastoRafPendente = false; // limita o trabalho pesado do arrastar a 1x por quadro de tela
// Assistente de IA (bolinha): componente compartilhado com o Controle financeiro, em js/assistente-ia.js
let menuDiaAberto = null; // { diaISO, x, y } — dia com o menu de copiar/mover aberto, ou null
let checklistDiaModal = null; // { diaISO, modo, marcados:Set } — telinha de escolher quais itens do dia entram na cópia/mover
let longPressDisparou = false; // marca que o menu já abriu pelo toque, pra ignorar o "click" fantasma que o touch dispara em seguida
let calendarConnected = false;
let calendarSyncing = false;
// Integrações que dependem de credenciais do servidor (não do usuário) — otimista por
// padrão (tudo true) até a checagem real chegar, pra nunca esconder nada à toa por causa
// de uma resposta lenta. Ver server/routes/config.js.
let assinaturaInfo = null; // situação da assinatura (GET /api/assinatura)
let integracoesConfig = { googleAgenda:true, assistenteIA:true, telegramAlerta:true, emailRecuperacao:false, push:false };
let icsStatus = null; // { ativo, url } — link de agenda (.ics), alternativa ao Google Agenda
let icsCarregando = false;
let icsGerando = false;
let notifOpen = false;
let buscaGlobalAberta = false;
let buscaGlobalTexto = '';
let camposPersonalizados = [];
let camposPersonalizadosCarregados = false;
let novoCampoNome = '';
let novoCampoTipo = 'texto';
let camposPersonalizadosMsg = null;
let webhooksSaida = [];
let webhooksSaidaMsg = null;
let agendamentoPublicoMsg = null;
let agendamentoPublicoForm = {
  ativo: (currentUser && currentUser.agendamentoPublico && currentUser.agendamentoPublico.ativo) || false,
  horaInicio: (currentUser && currentUser.agendamentoPublico && currentUser.agendamentoPublico.horaInicio) || '08:00',
  horaFim: (currentUser && currentUser.agendamentoPublico && currentUser.agendamentoPublico.horaFim) || '18:00',
  duracaoMinutos: (currentUser && currentUser.agendamentoPublico && currentUser.agendamentoPublico.duracaoMinutos) || 30,
  diasSemana: (currentUser && currentUser.agendamentoPublico && currentUser.agendamentoPublico.diasSemana) || [1,2,3,4,5],
  colunaDestinoId: (currentUser && currentUser.agendamentoPublico && currentUser.agendamentoPublico.colunaDestinoId) || '',
};
const ROTULOS_EVENTOS_WEBHOOK = {
  'lead.criado': 'Novo contato criado',
  'lead.movido': 'Contato mudou de coluna',
  'lead.ganho': 'Contato marcado como ganho',
  'tarefa.criada': 'Nova tarefa criada',
};
let anexosDoCard = [];
let historicoContatoCarregado = false;
let historicoContatoItens = [];
let historicoContatoTexto = '';
let historicoContatoEnviando = false;
let tarefasRapidasLista = [{ titulo:'', data:'' }]; // sempre começa com uma linha vazia
let tarefaRapidaCriando = false;
let salvandoCard = false;
let mensagemSalvoCard = null; // texto da mensagem "Novo lead adicionado" enquanto ela anima
let salvandoTask = false;
let extrasTela = null; // null (fechado) | 'menu' | 'etiquetas' | 'anexos' | 'tarefas' | 'tarefas-lista' | 'historico'
let etiquetaInputValor = '';
let etiquetaEditandoOriginal = null; // texto original da etiqueta sendo editada, ou null se for uma nova
let tarefasDoLeadCarregadas = false;
let tarefasDoLead = [];
let agendaDiaDestacado = null; // dia (YYYY-MM-DD) marcado com a cor de destaque, ao vir de um clique numa tarefa
let historicoContatoEditandoId = null;
let anexosCarregados = false;
let anexoEnviando = false;
let anexoMsg = null;
let possiveisLeads = [];
let possiveisLeadsCarregados = false;
let importPlanilhaLinhas = [];
let importPlanilhaColunas = [];
let importPlanilhaNomeArquivo = '';
let importAnimarEntrada = false; // a planilha acabou de ser escolhida: as informações descem
let importMapNome = '';
let importMapTelefone = '';
let importMapServico = '';
let importandoPlanilha = false;
let importPlanilhaMsg = null;
let completarLeadModalForm = null;
let completarLeadSalvando = false;
let completarLeadMsg = null;
let propostaModalForm = null;
let twoFactorSetup = null; // { segredo, otpauthUri } enquanto configurando
let twoFactorMsg = null;
let twoFactorSalvando = false;
let mostrarDesativar2FA = false;
let auditoriaEventos = [];
let auditoriaCarregada = false;
let auditoriaExpandida = false;
let configCategoriaAtiva = 'perfil';
let monitoramentoLoaded = false;
let monitoramentoErros = [];
let funis = [];
let funisLoaded = false;
let funilAtualId = null;
let editingFunilId = null;
let editingFunilName = '';
let relatorioFunilId = '';
let equipe = null;
let equipeLoaded = false;
let equipeNomeNovo = '';
let equipeCodigoEntrar = '';
let equipeMsg = null;
let equipeSubTab = 'chat';
let minhasEquipes = [];          // todas as equipes de que a pessoa faz parte (uma fica aberta)
let limiteEquipes = 10;
// Gestor atuando no funil de um consultor: { userId, nome } enquanto estiver lá dentro
let atuandoComo = null;
let metaBackupAtuandoComo = null;
const PAGINAS_ATUANDO_COMO = ['dashboard','pipeline','leads','equipe'];
let agendaSubTab = 'calendario';
let gerotSemanaAtual = inicioDaSemana(new Date());
let gerotBlocos = [];
let gerotLoaded = false;
let gerotCopiando = false;
let gerotEditor = null; // { diaSemana, horarioInicio, horarioFim, texto, blocoId (se editando um existente) } ou null se fechado
let gerotSalvandoErro = null;
let gerotImportando = false;
let gerotImportMsg = null;
let chatMensagens = [];
let chatLoaded = false;
let chatTexto = '';
let chatEnviando = false;
let dmDestinatarioId = null;
let dmMensagens = [];
let dmLoaded = false;
let dmTexto = '';
let dmEnviando = false;
let supervisaoMembros = [];
let supervisaoLoaded = false;
let visualizandoDashboardDe = null; // { userId, nome } | null — quando setado, o Dashboard mostra os dados desse membro, em modo leitura
let boardBackupGestor = null;
let tasksBackupGestor = null;
let metaVendasValorBackupGestor = null;
let automacoes = [];
let automacoesLoaded = false;
let automacaoModalForm = null;
let fluxos = [];
let fluxosLoaded = false;
let fluxoModalForm = null;
let colunaLeadsPickerColId = null;
let colunaLeadsPickerModo = 'transferir';
let colunaLeadsSelecionados = new Set();
let colunaLeadsMovendo = false;
let contratos = [];
let contratosLoaded = false;
let comissoesMonth = currentMonthKey();
let contratoModalForm = null;
let regrasComissao = [];
let regrasComissaoLoaded = false;
let regrasModalAberto = false; // lista de regras de comissão (abre pela engrenagem em Comissões)
let regraEditForm = null; // editor de uma regra específica, dentro do modal de regras
let nomeNovoVal = '';
let nomeMsg = null;
let verificandoAtualizacao = false;
let backupGerando = false;
let backupImportando = false;
let backupMsg = null;
let backupModalAberto = false;
let atualizacaoMsg = null;
let nomeSalvando = false;
let modalAlterarNomeAberto = false;
let logoutAllMsg = null;
let logoutAllEnviando = false;
let avatarSalvando = false;
let avatarMsg = null;
let modalEditarPerfilAberto = false; // escolha entre "adicionar foto" e "editar nome", em Seu perfil
let avatarLightboxAberto = false; // visualização grande da foto atual (aberta via toque-e-segure)
let avatarPressTimer = null; // controla o toque-e-segure no avatar/ícone de câmera
let avatarPressDisparou = false; // marca que o toque-e-segure já abriu a visualização, pra ignorar o "click" fantasma que o touch dispara em seguida
let senhaAtualVal = '';
let senhaNovaVal = '';
let senhaMsg = null; // { tipo:'ok'|'erro', texto }
let senhaSalvando = false;
let modalAlterarSenhaAberto = false;
let importColumnId = null;
let importResultado = null; // { sucesso, falha }
let importando = false;
let aiInsights = [];
let sidebarOpen = false;
// celular (até 768px): uma etapa por vez nas Negociações, Configurações em lista
let pipelineEtapaMobileId = null;
let configMobileConteudo = false;
let leadsTipoMobile = ''; // filtro dos cartões de contatos no celular: '' | 'aberto' | 'ganho' | 'perdido'
function ehCelular(){ return !!(window.matchMedia && window.matchMedia('(max-width: 768px)').matches); }
let insightsCarregando = false;
let insightsPipelineExpandido = false;
let modalForm = null;            // objeto do cliente sendo editado/criado
let escolhaTipoPessoaColId = null; // coluna escolhida ao criar lead novo, enquanto a telinha de física/jurídica está aberta
let tipoPessoaDropdownAberto = false; // dropdown de física/jurídica, dentro do modal do lead
let taskModalForm = null;        // objeto da tarefa sendo editada/criada
let eventoGoogleModalForm = null; // { eventId, titulo, data, hora } — edita o evento direto na fonte, no Google
let confirmState = null;         // { message, onConfirm }

/* ---------- comunicação com a API ---------- */
/* ---------- aviso de erro: aparece uma vez só ---------- */
// O mesmo erro não reaparece por 15 s depois de dispensado (clique ou sumiço automático),
// e some sozinho depois de 8 s. Assim uma falha repetida (API fora do ar, por exemplo) não enche a tela.
let erroUltimoTexto = null, erroDispensadoEm = 0, erroTimerAuto = null;
function dispensarErro(){
  erroDispensadoEm = Date.now();
  errorMsg = null;
  if(erroTimerAuto){ clearTimeout(erroTimerAuto); erroTimerAuto = null; }
}
function erroParaMostrar(){
  if(!errorMsg) return null;
  const agora = Date.now();
  if(errorMsg === erroUltimoTexto && erroDispensadoEm && agora - erroDispensadoEm < 15000){
    errorMsg = null; // mesmo erro de novo, logo depois de dispensado: não mostra de novo
    return null;
  }
  if(errorMsg !== erroUltimoTexto || !erroTimerAuto){
    erroUltimoTexto = errorMsg;
    erroDispensadoEm = 0;
    if(erroTimerAuto) clearTimeout(erroTimerAuto);
    erroTimerAuto = setTimeout(()=>{ erroTimerAuto = null; if(errorMsg){ dispensarErro(); renderApp(); } }, 8000);
  }
  return errorMsg;
}

// Servidor acordando (Render/Neon) ou ocupado: tenta de novo sozinho, sem deslogar.
// GET sempre pode repetir; os outros métodos só quando o servidor avisa que a ação nem
// chegou a rodar (resposta 503 com "tentarDeNovo").
async function apiRequest(method, path, body, timeoutMs, tentativa){
  tentativa = tentativa || 0;
  const res = await apiRequestUmaVez(method, path, body, timeoutMs);
  if(res && res.__repetir && tentativa < 2){
    await new Promise(ok=> setTimeout(ok, tentativa ? 2500 : 1000));
    return apiRequest(method, path, body, timeoutMs, tentativa + 1);
  }
  if(res && res.__repetir) throw new Error(res.mensagem);
  return res;
}
async function apiRequestUmaVez(method, path, body, timeoutMs){
  const opts = { method, headers: {} };
  const token = getToken();
  if(token) opts.headers['Authorization'] = 'Bearer ' + token;
  if(window.Acesso) Object.assign(opts.headers, Acesso.cabecalhos()); // aparelho da loja: quem entrou com o PIN
  // gestor no funil de um consultor: só as rotas do funil vão "como" ele (o servidor confere e registra)
  if(atuandoComo && /^\/(board|columns|cards|tasks|funis|historico-contato|campos-personalizados)(\/|\?|$)/.test(path)) opts.headers['X-Atuar-Como'] = atuandoComo.userId;
  if(body !== undefined){
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const controller = new AbortController();
  const timeoutId = setTimeout(()=> controller.abort(), timeoutMs || 25000); // 25s por padrão — evita a tela travar pra sempre esperando o servidor
  opts.signal = controller.signal;
  let res;
  try{
    res = await fetch(API_BASE + path, opts);
  }catch(e){
    if(e.name === 'AbortError'){
      throw new Error('O servidor demorou demais pra responder. Tente de novo em alguns segundos.');
    }
    throw new Error('Não foi possível conectar ao servidor. Confira sua internet e tente de novo.');
  }finally{
    clearTimeout(timeoutId);
  }
  if(res.status === 401){
    logout(true);
    throw new Error('Sessão expirada.');
  }
  if(res.status === 402){
    // assinatura vencida ou teste grátis acabou: leva pra tela de planos
    window.location.href = 'assinatura.html?de=crm';
    throw new Error('Sua assinatura não está ativa.');
  }
  if(!res.ok){
    let msg = 'Erro na requisição ao servidor';
    let data = null;
    try{ data = await res.json(); if(data && data.error) msg = data.error; }catch(e){}
    const servidorAcordando = res.status === 502 || res.status === 503 || res.status === 504;
    if(servidorAcordando && (method === 'GET' || (data && data.tentarDeNovo))){
      return { __repetir:true, mensagem: msg === 'Erro na requisição ao servidor' ? 'O servidor está acordando. Tente de novo em alguns segundos.' : msg };
    }
    throw new Error(msg);
  }
  if(res.status === 204) return null;
  return res.json();
}

/* ---------- carregamento inicial ---------- */
async function loadBoard(){
  try{
    const data = await apiRequest('GET', '/board');
    board = { columns: data.columns, cards: data.cards };
    errorMsg = null;
  }catch(e){
    board = { columns: [], cards: [] };
    errorMsg = 'Não foi possível carregar os dados do servidor. Verifique se a API e o MongoDB estão rodando.';
  }
  loaded = true;
  renderApp();
}

/* ---------- funis (múltiplos pipelines) ---------- */
async function loadFunis(){
  try{
    const data = await apiRequest('GET', '/funis');
    funis = data.funis || [];
    if((!funilAtualId || !funis.some(f=>f.id===funilAtualId)) && funis.length){
      funilAtualId = funis[0].id;
    }
  }catch(e){
    funis = [];
  }
  funisLoaded = true;
  renderApp();
}
async function criarNovoFunil(){
  try{
    const novo = await apiRequest('POST', '/funis', { nome: 'Novo funil' });
    funis.push(novo);
    funilAtualId = novo.id;
  }catch(e){
    errorMsg = 'Não foi possível criar o funil.';
  }
  renderApp();
}
async function renomearFunil(id, nome){
  const f = funis.find(x=>x.id===id);
  if(!f) return;
  const nomeFinal = nome.trim() || f.nome;
  const anterior = f.nome;
  f.nome = nomeFinal;
  renderApp();
  try{
    await apiRequest('PUT', `/funis/${id}`, { nome: nomeFinal });
  }catch(e){
    f.nome = anterior;
    errorMsg = 'Não foi possível renomear o funil.';
    renderApp();
  }
}
async function duplicarFunil(id){
  const original = funis.find(f=>f.id===id);
  try{
    const novoFunil = await apiRequest('POST', `/funis/${id}/duplicar`);
    funis.push(novoFunil);
    funilAtualId = novoFunil.id;
    await loadBoard(); // recarrega colunas/cards pra pegar as colunas novas criadas no servidor
  }catch(e){
    errorMsg = `Não foi possível duplicar o funil${original?` "${original.nome}"`:''}.`;
    renderApp();
  }
}
async function excluirFunil(id){
  const idx = funis.findIndex(f=>f.id===id);
  if(idx===-1) return;
  const [removido] = funis.splice(idx,1);
  const colunasRemovidas = board.columns.filter(c=>c.funilId===id);
  const colunaIds = new Set(colunasRemovidas.map(c=>c.id));
  const cardsRemovidos = board.cards.filter(c=>colunaIds.has(c.columnId));
  board.columns = board.columns.filter(c=>c.funilId!==id);
  board.cards = board.cards.filter(c=>!colunaIds.has(c.columnId));
  if(funilAtualId === id) funilAtualId = funis.length ? funis[0].id : null;
  renderApp();
  try{
    await apiRequest('DELETE', `/funis/${id}`);
  }catch(e){
    funis.splice(idx,0,removido);
    board.columns.push(...colunasRemovidas);
    board.cards.push(...cardsRemovidos);
    if(!funis.some(f=>f.id===funilAtualId)) funilAtualId = removido.id;
    errorMsg = 'Não foi possível excluir o funil.';
    renderApp();
  }
}

async function loadTasks(){
  try{
    const data = await apiRequest('GET', '/tasks');
    tasks = data.tasks;
  }catch(e){
    tasks = [];
  }
  tasksLoaded = true;
  renderApp();
}
function copiarTarefa(taskId, elemento){
  const t = tasks.find(x=>x.id===taskId) || agendaTarefas.find(x=>x.id===taskId);
  if(!t) return;
  tarefaCopiada = { titulo: t.titulo, prioridade: t.prioridade, leadId: t.leadId||null, descricao: t.descricao||'', hora: horaLocalDaTarefaOuNull(t.vencimento) };
  if(navigator.vibrate) navigator.vibrate(15);
  if(elemento) mostrarPopupRapido(elemento, 'Copiado');
  renderApp();
  if(agendaDiaSelecionado) renderAgendaDiaModalPreservandoScroll();
}
function copiarEvento(eventoId, elemento){
  const e = agendaEventosGoogle.find(x=>x.id===eventoId);
  if(!e) return;
  const hora = horaLocalDoEventoOuNull(e);
  tarefaCopiada = { titulo: e.titulo, prioridade: e.prioridade||'media', leadId: e.leadId||null, descricao: e.descricao||'', hora };
  if(navigator.vibrate) navigator.vibrate(15);
  if(elemento) mostrarPopupRapido(elemento, 'Copiado');
  renderApp();
  if(agendaDiaSelecionado) renderAgendaDiaModalPreservandoScroll();
}

// Extrai a hora local (HH:MM) de uma tarefa, ou null se ela não tiver horário definido —
// mesma checagem em UTC usada no resto do sistema, pra tarefa sem hora não "ganhar" hora à toa.
function horaLocalDaTarefaOuNull(vencimentoIso){
  const d = new Date(vencimentoIso);
  if(isNaN(d.getTime()) || (d.getUTCHours()===0 && d.getUTCMinutes()===0)) return null;
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}
// Mesma ideia, mas pra evento do Google — que já vem com a flag diaInteiro explícita,
// em vez de precisar inferir pela meia-noite UTC como a tarefa.
function horaLocalDoEventoOuNull(evento){
  if(evento.diaInteiro || !evento.inicio) return null;
  const d = new Date(evento.inicio);
  if(isNaN(d.getTime())) return null;
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}
// Mostra um aviso rápido (1s, some sozinho) colado em cima de um elemento —
// usado pra confirmar "copiado!" sem precisar de uma mensagem fixa na tela.
function mostrarPopupRapido(elemento, texto){
  let root = document.getElementById('popup-rapido-root');
  if(!root){
    root = document.createElement('div');
    root.id = 'popup-rapido-root';
    document.body.appendChild(root);
  }
  const rect = elemento.getBoundingClientRect();
  const el = document.createElement('div');
  el.className = 'popup-rapido';
  el.textContent = texto;
  const z = (window.zoomDaTela ? window.zoomDaTela() : 1); // letra maior (acessibilidade): as medidas da tela são divididas pelo zoom
  el.style.top = `${(rect.top + rect.height/2) / z}px`;
  el.style.left = `${(rect.left + rect.width/2) / z}px`;
  root.appendChild(el);
  requestAnimationFrame(()=> el.classList.add('popup-rapido-visivel'));
  setTimeout(()=>{
    el.classList.remove('popup-rapido-visivel');
    setTimeout(()=> el.remove(), 250);
  }, 1000);
}
// Liga o gesto de copiar (botão direito no computador, apertar e segurar em touch)
// num conjunto de elementos — reaproveitado tanto nas linhas do dia quanto, antes,
// nas células do calendário mensal.
function ligarGestoDeCopiar(elementos, callback){
  elementos.forEach(el=>{
    el.addEventListener('contextmenu', (e)=>{
      e.preventDefault();
      e.stopPropagation();
      callback(el);
    });
    el.addEventListener('touchstart', ()=>{
      clearTimeout(longPressTimer);
      longPressTimer = setTimeout(()=>{
        longPressDisparou = true;
        callback(el);
      }, 550);
    }, { passive:true });
    el.addEventListener('touchend', (e)=>{ e.stopPropagation(); clearTimeout(longPressTimer); });
    el.addEventListener('touchmove', ()=> clearTimeout(longPressTimer));
    el.addEventListener('touchcancel', ()=> clearTimeout(longPressTimer));
  });
}
// Menuzinho de "Copiar" ou "Mover" — abre no clique direito (computador) ou apertar e
// segurar (toque) num dia do calendário. Usa a mesma técnica de raiz flutuante do menu
// "Mover para" do card, pra não ficar preso em nenhum overflow escondido.
function abrirMenuDia(diaISO, x, y){
  const { tarefasDoDia, eventosDoDia } = itensDoDiaAgenda(diaISO);
  if(!tarefasDoDia.length && !eventosDoDia.length) return; // dia vazio, nada pra copiar/mover
  menuDiaAberto = { diaISO, x, y };
  renderFloatingMenuDia();
}
function fecharMenuDia(){
  menuDiaAberto = null;
  renderFloatingMenuDia();
}
function renderFloatingMenuDia(){
  let root = document.getElementById('menu-dia-root');
  if(!root){
    root = document.createElement('div');
    root.id = 'menu-dia-root';
    document.body.appendChild(root);
  }
  if(!menuDiaAberto){ root.innerHTML = ''; return; }
  const { diaISO, x, y } = menuDiaAberto;
  const left = Math.min(x, window.innerWidth - 180);
  const top = Math.min(y, window.innerHeight - 100);
  root.innerHTML = `
    <div class="col-menu" style="position:fixed; top:${Math.max(4,top)}px; left:${Math.max(4,left)}px; min-width:170px;">
      <button class="col-menu-item" data-action="menu-dia-copiar">Copiar</button>
      <button class="col-menu-item" data-action="menu-dia-mover">Mover</button>
    </div>
  `;
  const cel = document.querySelector(`[data-action="abrir-dia-agenda"][data-dia="${diaISO}"]`);
  const copiarBtn = root.querySelector('[data-action="menu-dia-copiar"]');
  if(copiarBtn) copiarBtn.addEventListener('click', ()=>{ abrirChecklistDia(diaISO, 'copiar'); fecharMenuDia(); });
  const moverBtn = root.querySelector('[data-action="menu-dia-mover"]');
  if(moverBtn) moverBtn.addEventListener('click', ()=>{ abrirChecklistDia(diaISO, 'mover'); fecharMenuDia(); });
}
// Telinha de checklist — escolher exatamente quais tarefas/eventos do dia entram na
// cópia/mover, em vez de pegar tudo automaticamente.
function abrirChecklistDia(diaISO, modo){
  const { tarefasDoDia, eventosDoDia } = itensDoDiaAgenda(diaISO);
  const todosIds = [...tarefasDoDia.map(t=>t.id), ...eventosDoDia.map(e=>e.id)];
  if(!todosIds.length) return;
  checklistDiaModal = { diaISO, modo, marcados: new Set(todosIds) }; // começa com tudo marcado — desmarca o que não quiser
  renderChecklistDiaModal();
}
function fecharChecklistDia(){
  checklistDiaModal = null;
  document.getElementById('modal-root').innerHTML = '';
}
function renderChecklistDiaModal(){
  const root = document.getElementById('modal-root');
  if(!checklistDiaModal){ root.innerHTML = ''; return; }
  const { diaISO, modo, marcados } = checklistDiaModal;
  const { tarefasDoDia, eventosDoDia } = itensDoDiaAgenda(diaISO);
  const dataLabel = new Date(diaISO+'T00:00:00').toLocaleDateString('pt-BR', { weekday:'long', day:'2-digit', month:'long' });
  const itens = [
    ...tarefasDoDia.map(t=>({ id:t.id, titulo:t.titulo, hora:horaLocalDaTarefaOuNull(t.vencimento), icone:'✓' })),
    ...eventosDoDia.map(e=>({ id:e.id, titulo:e.titulo, hora:horaLocalDoEventoOuNull(e), icone:'📅' })),
  ];

  root.innerHTML = `
    <div class="overlay" id="checklist-dia-overlay">
      <div class="modal">
        <div class="modal-head">
          <h3 style="text-transform:capitalize;">${modo==='mover'?'Mover':'Copiar'} itens — ${esc(dataLabel)}</h3>
          <button id="checklist-dia-close">✕</button>
        </div>
        <div class="modal-body">
          <div class="settings-btn-row" style="margin-bottom:10px;">
            <button class="btn-outline" id="checklist-marcar-todos">Marcar todos</button>
            <button class="btn-outline" id="checklist-desmarcar-todos">Desmarcar todos</button>
          </div>
          <div class="checklist-dia-lista">
            ${itens.map(it=>`
              <label class="checklist-dia-item">
                <input type="checkbox" class="checklist-dia-checkbox" data-item-id="${it.id}" ${marcados.has(it.id)?'checked':''} />
                <span class="checklist-dia-item-texto">${it.icone} ${esc(it.titulo)}</span>
                ${it.hora ? `<span class="checklist-dia-item-hora">${it.hora}</span>` : ''}
              </label>
            `).join('')}
          </div>
        </div>
        <div class="modal-foot">
          <span></span>
          <div class="modal-foot-actions">
            <button class="btn-outline" id="checklist-dia-cancelar">Cancelar</button>
            <button class="btn-save" id="checklist-dia-confirmar" ${marcados.size===0?'disabled':''}>${modo==='mover'?'Mover':'Copiar'} ${marcados.size} item${marcados.size===1?'':'s'}</button>
          </div>
        </div>
      </div>
    </div>
  `;

  document.getElementById('checklist-dia-close').addEventListener('click', fecharChecklistDia);
  document.getElementById('checklist-dia-cancelar').addEventListener('click', fecharChecklistDia);
  document.getElementById('checklist-dia-overlay').addEventListener('click', (e)=>{ if(e.target.id==='checklist-dia-overlay') fecharChecklistDia(); });
  document.getElementById('checklist-marcar-todos').addEventListener('click', ()=>{
    itens.forEach(it=> checklistDiaModal.marcados.add(it.id));
    renderChecklistDiaModal();
  });
  document.getElementById('checklist-desmarcar-todos').addEventListener('click', ()=>{
    checklistDiaModal.marcados.clear();
    renderChecklistDiaModal();
  });
  root.querySelectorAll('.checklist-dia-checkbox').forEach(chk=>{
    chk.addEventListener('change', ()=>{
      if(chk.checked) checklistDiaModal.marcados.add(chk.dataset.itemId);
      else checklistDiaModal.marcados.delete(chk.dataset.itemId);
      renderChecklistDiaModal();
    });
  });
  const confirmarBtn = document.getElementById('checklist-dia-confirmar');
  if(confirmarBtn) confirmarBtn.addEventListener('click', ()=>{
    const marcadosFinal = new Set(checklistDiaModal.marcados);
    const cel = document.querySelector(`[data-action="abrir-dia-agenda"][data-dia="${diaISO}"]`);
    fecharChecklistDia();
    copiarDiaInteiro(diaISO, cel, modo, marcadosFinal);
  });
}
function copiarDiaInteiro(diaISO, elemento, modo, idsIncluidos){
  modo = modo || 'copiar';
  const { tarefasDoDia, eventosDoDia } = itensDoDiaAgenda(diaISO);
  const tarefasFiltradas = idsIncluidos ? tarefasDoDia.filter(t=>idsIncluidos.has(t.id)) : tarefasDoDia;
  const eventosFiltrados = idsIncluidos ? eventosDoDia.filter(e=>idsIncluidos.has(e.id)) : eventosDoDia;
  const itens = [
    ...tarefasFiltradas.map(t=>({
      id: t.id, tipo: 'tarefa', titulo: t.titulo, prioridade: t.prioridade, leadId: t.leadId||null, descricao: t.descricao||'',
      hora: horaLocalDaTarefaOuNull(t.vencimento),
    })),
    ...eventosFiltrados.map(e=>({
      id: e.id, tipo: 'evento', titulo: e.titulo, prioridade: e.prioridade||'media', leadId: e.leadId||null, descricao: e.descricao||'',
      hora: horaLocalDoEventoOuNull(e),
    })),
  ];
  if(!itens.length) return;
  diaAgendaCopiado = { origemISO: diaISO, tarefas: itens, modo };
  if(navigator.vibrate) navigator.vibrate(15);
  if(elemento) mostrarPopupRapido(elemento, `${itens.length} ${modo==='mover'?'marcado':'copiado'}${itens.length===1?'':'s'}`);
  renderApp();
}
async function colarDiaInteiroEm(diaISO, elemento){
  if(!diaAgendaCopiado || diaISO===diaAgendaCopiado.origemISO) return;
  const qtd = diaAgendaCopiado.tarefas.length;
  const modo = diaAgendaCopiado.modo || 'copiar';
  try{
    for(const t of diaAgendaCopiado.tarefas){
      if(modo==='mover'){
        // move de verdade — atualiza a data do próprio item original, sem criar cópia nem apagar nada
        if(t.tipo==='evento'){
          await apiRequest('PUT', `/calendar/eventos/${t.id}`, { titulo:t.titulo, data:diaISO, hora:t.hora||null, descricao:t.descricao, prioridade:t.prioridade, leadId:t.leadId||null });
          const idx = agendaEventosGoogle.findIndex(x=>x.id===t.id);
          if(idx>-1){
            const novoInicio = t.hora ? new Date(`${diaISO}T${t.hora}`).toISOString() : diaISO;
            agendaEventosGoogle[idx] = { ...agendaEventosGoogle[idx], inicio: novoInicio, diaInteiro: !t.hora };
          }
        } else {
          let vencimento = diaISO;
          if(t.hora){
            const combinado = new Date(`${diaISO}T${t.hora}`);
            if(!isNaN(combinado.getTime())) vencimento = combinado.toISOString();
          }
          const atualizada = await apiRequest('PUT', `/tasks/${t.id}`, { titulo:t.titulo, prioridade:t.prioridade, leadId:t.leadId, descricao:t.descricao, vencimento });
          const idxT = tasks.findIndex(x=>x.id===t.id);
          if(idxT>-1) tasks[idxT] = atualizada;
          atualizarTarefaNaAgendaLocal(atualizada);
        }
      } else {
        // copiar — vira sempre uma tarefa nova (evento copiado também vira cópia como tarefa, não duplica o evento em si)
        const dados = { titulo:t.titulo, prioridade:t.prioridade, leadId:t.leadId, descricao:t.descricao, vencimento: diaISO };
        if(t.hora){
          const combinado = new Date(`${diaISO}T${t.hora}`);
          if(!isNaN(combinado.getTime())) dados.vencimento = combinado.toISOString();
        }
        const nova = await apiRequest('POST', '/tasks', dados);
        tasks.push(nova);
        atualizarTarefaNaAgendaLocal(nova);
      }
    }
    diaAgendaCopiado = null; // colar/mover o dia só acontece uma vez — depois disso, a "área de transferência" se esvazia sozinha
    if(elemento) mostrarPopupRapido(elemento, `${qtd} ${modo==='mover'?'movido':'colado'}${qtd===1?'':'s'}`);
    renderApp();
  }catch(e){
    errorMsg = modo==='mover' ? 'Não foi possível mover pra esse dia.' : 'Não foi possível colar nesse dia.';
    renderApp();
  }
}
function cancelarTarefaCopiada(){
  tarefaCopiada = null;
  modoSelecaoMultipla = false;
  horariosSelecionados.clear();
  renderApp();
  if(agendaDiaSelecionado) renderAgendaDiaModalPreservandoScroll();
}
async function colarTarefaEm(diaISO, hora){
  if(!tarefaCopiada) return;
  const { hora: horaOriginal, ...dadosBase } = tarefaCopiada;
  const horaFinal = hora || horaOriginal; // usa a hora do horário clicado; sem isso, cai pra hora original que foi copiada
  const dados = { ...dadosBase, vencimento: diaISO };
  if(horaFinal){
    const combinado = new Date(`${diaISO}T${horaFinal}`);
    if(!isNaN(combinado.getTime())) dados.vencimento = combinado.toISOString();
  }
  try{
    const nova = await apiRequest('POST', '/tasks', dados);
    tasks.push(nova);
    atualizarTarefaNaAgendaLocal(nova);
    renderApp();
  }catch(e){
    errorMsg = 'Não foi possível colar a tarefa.';
    renderApp();
  }
  if(agendaDiaSelecionado) renderAgendaDiaModalPreservandoScroll();
}
async function colarEmHorariosSelecionados(){
  if(!tarefaCopiada || !horariosSelecionados.size || !agendaDiaSelecionado) return;
  const diaISO = agendaDiaSelecionado;
  const { hora: horaOriginal, ...dadosBase } = tarefaCopiada;
  const horarios = [...horariosSelecionados];
  for(const hora of horarios){
    const dados = { ...dadosBase, vencimento: diaISO };
    const combinado = new Date(`${diaISO}T${hora}`);
    if(!isNaN(combinado.getTime())) dados.vencimento = combinado.toISOString();
    try{
      const nova = await apiRequest('POST', '/tasks', dados);
      tasks.push(nova);
      atualizarTarefaNaAgendaLocal(nova);
    }catch(e){
      errorMsg = 'Não foi possível colar em todos os horários selecionados.';
    }
  }
  modoSelecaoMultipla = false;
  horariosSelecionados.clear();
  renderApp();
  if(agendaDiaSelecionado) renderAgendaDiaModal();
}
async function loadGerot(semana){
  gerotLoaded = false;
  renderApp();
  try{
    const data = await apiRequest('GET', `/gerot/${semana}`);
    gerotBlocos = data.blocos || [];
  }catch(e){
    gerotBlocos = [];
  }
  gerotLoaded = true;
  renderApp();
}
function mudarSemanaGerot(delta){
  const [ano,mes,dia] = gerotSemanaAtual.split('-').map(Number);
  const d = new Date(ano, mes-1, dia + delta*7);
  gerotSemanaAtual = inicioDaSemana(d);
  gerotEditor = null;
  loadGerot(gerotSemanaAtual);
}
function abrirGerotEditor(diaSemana, horario, blocoId){
  gerotSalvandoErro = null;
  if(blocoId){
    const b = gerotBlocos.find(x=>x.id===blocoId);
    if(!b) return;
    gerotEditor = { diaSemana, horarioInicio: b.horarioInicio, horarioFim: b.horarioFim, texto: b.texto, blocoId: b.id };
  } else {
    const idxInicio = GEROT_HORARIOS.indexOf(horario);
    const fimPadrao = GEROT_LIMITES[idxInicio+1] || GEROT_LIMITES[GEROT_LIMITES.length-1];
    gerotEditor = { diaSemana, horarioInicio: horario, horarioFim: fimPadrao, texto: '', blocoId: null };
  }
  renderApp();
  const input = document.getElementById('gerot-editor-texto');
  if(input) input.focus();
}
function fecharGerotEditor(){
  gerotEditor = null;
  gerotSalvandoErro = null;
  renderApp();
}
async function salvarGerotEditor(){
  if(!gerotEditor) return;
  const texto = gerotEditor.texto.trim();
  if(!texto){ gerotSalvandoErro = 'Escreva a atividade desse bloco.'; renderApp(); return; }
  try{
    const resultado = await apiRequest('PUT', '/gerot', {
      semanaInicio: gerotSemanaAtual, diaSemana: gerotEditor.diaSemana,
      horarioInicio: gerotEditor.horarioInicio, horarioFim: gerotEditor.horarioFim,
      texto, blocoId: gerotEditor.blocoId,
    });
    const idx = gerotBlocos.findIndex(b=>b.id===resultado.id);
    if(idx>-1) gerotBlocos[idx] = resultado; else gerotBlocos.push(resultado);
    gerotEditor = null;
    gerotSalvandoErro = null;
  }catch(e){
    gerotSalvandoErro = (e && e.message) || 'Não foi possível salvar esse bloco.';
  }
  renderApp();
}
async function apagarGerotEditorAtual(){
  if(!gerotEditor || !gerotEditor.blocoId) return;
  const blocoId = gerotEditor.blocoId;
  if(!(await confirmarAcao({ mensagem:'Apagar este bloco da rotina?', botao:'Apagar', chave:'bloco-rotina' }))) return;
  try{
    await apiRequest('DELETE', `/gerot/${blocoId}`);
    gerotBlocos = gerotBlocos.filter(b=>b.id!==blocoId);
    gerotEditor = null;
  }catch(e){
    gerotSalvandoErro = 'Não foi possível apagar esse bloco.';
  }
  renderApp();
}
function renderGerotEditorHtml(){
  const ed = gerotEditor;
  const opcoesInicio = GEROT_HORARIOS.map(h=>`<option value="${h}" ${h===ed.horarioInicio?'selected':''}>${h}</option>`).join('');
  const opcoesFim = GEROT_LIMITES.filter(h=>h>ed.horarioInicio).map(h=>`<option value="${h}" ${h===ed.horarioFim?'selected':''}>${h}</option>`).join('');
  return `
    <div class="gerot-editor">
      <p class="settings-page-subtitle">${GEROT_DIAS[ed.diaSemana]} — ${ed.blocoId?'editar bloco':'novo bloco'}</p>
      <div class="field-row-flex">
        <select id="gerot-editor-inicio">${opcoesInicio}</select>
        <span class="settings-page-note">até</span>
        <select id="gerot-editor-fim">${opcoesFim}</select>
      </div>
      <input type="text" id="gerot-editor-texto" value="${esc(ed.texto)}" placeholder="Ex: Prospecção ativa" style="margin-top:10px; width:100%;" />
      ${gerotSalvandoErro ? `<p class="settings-page-note" style="color:var(--danger);">${esc(gerotSalvandoErro)}</p>` : ''}
      <div class="field-row-flex" style="margin-top:12px;">
        <button class="btn-primary" id="gerot-editor-salvar">Salvar</button>
        <button class="btn-outline" id="gerot-editor-cancelar">Cancelar</button>
        ${ed.blocoId ? `<button class="btn-outline" id="gerot-editor-apagar" style="color:var(--danger);">Apagar bloco</button>` : ''}
      </div>
    </div>
  `;
}
/* Bibliotecas grandes (planilha, PDF, QR code): só são baixadas quando a pessoa usa a função,
   em vez de toda vez que o CRM abre (mais de 1 MB a menos na abertura, no celular faz diferença). */
const BIBLIOTECAS = {
  xlsx: { url: 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js', pronta: () => !!window.XLSX },
  jspdf: { url: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js', pronta: () => !!window.jspdf },
  qrcode: { url: 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js', pronta: () => !!window.QRCode },
};
const bibliotecasCarregando = {};
function carregarBiblioteca(nome){
  const b = BIBLIOTECAS[nome];
  if(b.pronta()) return Promise.resolve();
  if(!bibliotecasCarregando[nome]){
    bibliotecasCarregando[nome] = new Promise((ok, falhou)=>{
      const tag = document.createElement('script');
      tag.src = b.url; tag.async = true;
      tag.onload = ()=> ok();
      tag.onerror = ()=>{ delete bibliotecasCarregando[nome]; tag.remove(); falhou(new Error('Não foi possível carregar o recurso agora. Confira sua internet e tente de novo.')); };
      document.head.appendChild(tag);
    });
  }
  return bibliotecasCarregando[nome];
}

async function exportarGerotParaPlanilha(){
  try{ await carregarBiblioteca('xlsx'); }catch(e){ errorMsg = e.message; renderApp(); return; }
  const [ano,mes,dia] = gerotSemanaAtual.split('-').map(Number);
  const segunda = new Date(ano, mes-1, dia);
  const datasDaSemana = GEROT_DIAS.map((_,i)=>{ const d = new Date(segunda); d.setDate(d.getDate()+i); return d; });
  const grade = calcularGradeGerot();

  // monta a matriz: linha 0 é o cabeçalho (dias da semana), as demais são os horários
  const dados = [['', ...GEROT_DIAS.map((d,i)=> `${d} (${datasDaSemana[i].toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})})`)]];
  GEROT_HORARIOS.forEach(h => dados.push([h, '', '', '', '', '']));

  const merges = [];
  GEROT_DIAS.forEach((_, diaIdx)=>{
    GEROT_HORARIOS.forEach((horario, linhaIdx)=>{
      const info = grade[diaIdx][horario];
      if(info.tipo === 'inicio'){
        dados[linhaIdx+1][diaIdx+1] = info.bloco.texto; // +1 na linha pq a 0 é cabeçalho, +1 na coluna pq a 0 é o horário
        if(info.rowspan > 1){
          merges.push({ s:{ r:linhaIdx+1, c:diaIdx+1 }, e:{ r:linhaIdx+1+info.rowspan-1, c:diaIdx+1 } });
        }
      }
    });
  });

  const ws = XLSX.utils.aoa_to_sheet(dados);
  ws['!merges'] = merges;
  ws['!cols'] = [{wch:8}, {wch:24}, {wch:24}, {wch:24}, {wch:24}, {wch:24}];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Rotina');
  XLSX.writeFile(wb, `rotina-semana-${gerotSemanaAtual}.xlsx`);
}
async function importarGerotDePlanilha(file){
  if(!file) return;
  if(gerotBlocos.length && !(await confirmarAcao({ mensagem:`A planilha substitui a rotina desta semana: os ${gerotBlocos.length} bloco(s) de agora são apagados.`, botao:'Substituir', sempre:true }))) return;
  try{ await carregarBiblioteca('xlsx'); }catch(e){ errorMsg = e.message; renderApp(); return; }
  gerotImportando = true;
  gerotImportMsg = null;
  renderApp();
  try{
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type:'array' });
    const ws = workbook.Sheets[workbook.SheetNames[0]];
    const dados = XLSX.utils.sheet_to_json(ws, { header:1, defval:'' });
    const merges = ws['!merges'] || [];

    // limpa os blocos já existentes dessa semana antes de importar, pra não dar
    // conflito de horário com o que já tinha e pra garantir que o resultado bate
    // exatamente com a planilha importada
    await Promise.all(gerotBlocos.map(b=> apiRequest('DELETE', `/gerot/${b.id}`).catch(()=>{})));

    let importados = 0, falhas = 0;
    for(let linhaIdx=1; linhaIdx<dados.length && linhaIdx<=GEROT_HORARIOS.length; linhaIdx++){
      const horarioInicio = GEROT_HORARIOS[linhaIdx-1];
      for(let diaIdx=0; diaIdx<5; diaIdx++){
        const coluna = diaIdx+1;
        const texto = ((dados[linhaIdx]||[])[coluna]||'').toString().trim();
        if(!texto) continue;
        const merge = merges.find(m=> m.s.r===linhaIdx && m.s.c===coluna);
        const horarioFim = merge ? GEROT_LIMITES[merge.e.r] : GEROT_LIMITES[linhaIdx];
        if(!horarioFim) continue; // fora do intervalo de horários válidos (08:00-19:30), ignora
        try{
          await apiRequest('PUT', '/gerot', { semanaInicio: gerotSemanaAtual, diaSemana: diaIdx, horarioInicio, horarioFim, texto });
          importados++;
        }catch(e){ falhas++; }
      }
    }
    await loadGerot(gerotSemanaAtual);
    gerotImportMsg = { tipo: falhas ? 'erro' : 'ok', texto: `${importados} bloco(s) importado(s)${falhas ? `, ${falhas} não puderam ser importados (conflito de horário)` : ''}.` };
  }catch(e){
    gerotImportMsg = { tipo:'erro', texto:'Não foi possível ler essa planilha. Confira se ela segue o mesmo formato exportado pelo sistema.' };
  }
  gerotImportando = false;
  renderApp();
}
async function copiarSemanaAnteriorGerot(){
  const [ano,mes,dia] = gerotSemanaAtual.split('-').map(Number);
  const semanaAnterior = inicioDaSemana(new Date(ano, mes-1, dia - 7));
  gerotCopiando = true;
  renderApp();
  try{
    await apiRequest('POST', '/gerot/copiar', { semanaOrigem: semanaAnterior, semanaDestino: gerotSemanaAtual });
    await loadGerot(gerotSemanaAtual);
  }catch(e){
    errorMsg = 'Não foi possível copiar a semana anterior.';
  }
  gerotCopiando = false;
  renderApp();
}
async function loadAgendaMes(mesKey){
  agendaLoaded = false;
  renderApp();
  try{
    const data = await apiRequest('GET', `/calendar/agenda-mes?mes=${mesKey}`);
    agendaTarefas = data.tarefas || [];
    agendaEventosGoogle = data.eventosGoogle || [];
  }catch(e){
    errorMsg = e.message || 'Não foi possível carregar a agenda.';
    agendaTarefas = [];
    agendaEventosGoogle = [];
  }
  agendaLoaded = true;
  renderApp();
}
function mudarMesAgenda(delta){
  const [ano, mes] = agendaMesAtual.split('-').map(Number);
  const d = new Date(ano, mes - 1 + delta, 1);
  agendaMesAtual = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
  agendaDiaDestacado = null;
  loadAgendaMes(agendaMesAtual);
}
// Extrai a data (YYYY-MM-DD) certa do vencimento de uma tarefa, em horário local —
// mesma lógica usada em openEditTask, pra tarefa com horário não "vazar" pro dia
// seguinte por causa do UTC.
function dataLocalDaTarefa(vencimentoIso){
  if(!vencimentoIso) return null;
  const d = new Date(vencimentoIso);
  if(isNaN(d.getTime())) return null;
  const temHora = d.getUTCHours()!==0 || d.getUTCMinutes()!==0;
  if(temHora) return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  return vencimentoIso.slice(0,10);
}
// Atualiza (ou remove) uma tarefa direto no estado local da Agenda, sem precisar
// buscar tudo de novo no servidor — evita uma ida desnecessária ao Google Agenda
// (que só deveria acontecer quando a pessoa clica em "Sincronizar Agenda" de propósito).
function atualizarTarefaNaAgendaLocal(t){
  if(!t.vencimento || !agendaMesAtual) return;
  const mesDaTarefa = dataLocalDaTarefa(t.vencimento).slice(0,7);
  const idx = agendaTarefas.findIndex(x=>x.id===t.id);
  if(mesDaTarefa !== agendaMesAtual){
    if(idx>-1) agendaTarefas.splice(idx,1); // mudou pra fora do mês em tela — some da visão atual
    return;
  }
  const card = t.leadId ? board.cards.find(c=>c.id===t.leadId) : null;
  const comNome = { ...t, clienteNome: card ? card.cliente : null };
  if(idx>-1) agendaTarefas[idx] = comNome;
  else agendaTarefas.push(comNome);
}
function removerTarefaDaAgendaLocal(id){
  agendaTarefas = agendaTarefas.filter(x=>x.id!==id);
}
function itensDoDiaAgenda(diaISO){
  const tarefasDoDia = agendaTarefas.filter(t=> dataLocalDaTarefa(t.vencimento)===diaISO);
  const eventosDoDia = agendaEventosGoogle.filter(e=> e.inicio && e.inicio.slice(0,10)===diaISO);
  return { tarefasDoDia, eventosDoDia };
}
async function loadContratos(){
  try{
    const data = await apiRequest('GET', '/comissoes');
    contratos = data.contratos;
  }catch(e){
    contratos = [];
  }
  contratosLoaded = true;
  renderApp();
}
// Regras de comissão (engrenagem em Comissões) — na 1ª vez, o servidor já cria uma
// regra "Padrão" (5% numa parcela só), que o usuário pode editar ou trocar por outras.
async function loadRegrasComissao(){
  try{
    const data = await apiRequest('GET', '/regras-comissao');
    regrasComissao = data.regras;
  }catch(e){
    regrasComissao = [];
  }
  regrasComissaoLoaded = true;
  renderApp();
}

/* ---------- Google Agenda ---------- */
async function loadCalendarStatus(){
  try{
    const data = await apiRequest('GET', '/calendar/status');
    calendarConnected = !!data.connected;
  }catch(e){
    calendarConnected = false;
  }
  renderApp();
}
// Quais integrações que dependem do servidor (não do usuário) estão configuradas nesse
// ambiente — chamada 1x no início, pra decidir o que mostrar em Configurações. Pública,
// não exige estar logado (mas não tem problema mandar o token também).
async function loadIntegracoesConfig(){
  try{
    const data = await apiRequest('GET', '/config/integracoes');
    integracoesConfig = { ...integracoesConfig, ...data };
  }catch(e){
    // se não conseguir checar, mantém tudo visível (otimista)
  }
  try{
    assinaturaInfo = await apiRequest('GET', '/assinatura');
    const r = (assinaturaInfo && assinaturaInfo.recursos) || {};
    // recurso fora do plano some da tela (o servidor também recusa, por segurança)
    if(r.ia === false) integracoesConfig.assistenteIA = false;
    if(r.googleAgenda === false) integracoesConfig.planoSemGoogleAgenda = true;
  }catch(e){
    // se não conseguir checar, mantém tudo visível (otimista) — melhor mostrar um botão
    // que às vezes falha do que esconder uma integração que na verdade está configurada
  }
  renderApp();
  if(window.AssistenteIA) AssistenteIA.definirHabilitado(integracoesConfig.assistenteIA); // some se o servidor não tiver chave de IA
}
/* ---------- Agenda por link (.ics) — alternativa ao Google Agenda ---------- */
async function loadIcsStatus(){
  icsCarregando = true;
  try{
    icsStatus = await apiRequest('GET', '/calendar/ics-status');
  }catch(e){
    icsStatus = null;
  }
  icsCarregando = false;
  renderApp();
}
async function gerarLinkIcs(){
  icsGerando = true;
  renderApp();
  try{
    icsStatus = await apiRequest('POST', '/calendar/ics/gerar');
  }catch(e){
    errorMsg = e.message || 'Não foi possível gerar o link de agenda.';
  }
  icsGerando = false;
  renderApp();
}
function revogarLinkIcs(){
  showConfirm({
    message: 'Revogar o link de agenda atual? Quem já assinou esse link (Google, Apple, Outlook…) para de receber atualizações. Você pode gerar um link novo a qualquer momento.',
    confirmLabel: 'Revogar',
    onConfirm: async ()=>{
      closeConfirm();
      try{
        await apiRequest('POST', '/calendar/ics/revogar');
        icsStatus = { ativo:false, url:null };
      }catch(e){
        errorMsg = e.message || 'Não foi possível revogar o link de agenda.';
      }
      renderApp();
    },
  });
}




async function abrirHistoricoCard(){
  const box = document.getElementById('f-historico');
  if(!box || !modalForm || modalForm.__isNew) return;
  box.style.display = 'block';
  box.innerHTML = '<p class="settings-page-note">Carregando histórico…</p>';

  const tarefasDoLead = tasks.filter(t=>t.leadId===modalForm.id);

  const eventos = [];
  if(modalForm.createdAt){
    eventos.push({ texto:'Cliente criado', data: modalForm.createdAt, icone:'✦' });
  }
  tarefasDoLead.forEach(t=>{
    eventos.push({ texto:`Tarefa criada: ${t.titulo}${t.concluida?' (concluída)':''}`, data: t.createdAt || t.vencimento, icone:'✓' });
  });
  eventos.sort((a,b)=> new Date(b.data) - new Date(a.data));

  box.innerHTML = eventos.length ? `
    <div class="historico-lista">
      ${eventos.map(ev=>`
        <div class="historico-item">
          <span class="historico-item-icone">${ev.icone}</span>
          <span class="historico-item-texto">${esc(ev.texto)}</span>
          <span class="historico-item-data">${formatDateHora(ev.data)}</span>
        </div>
      `).join('')}
    </div>
  ` : '<p class="settings-page-note">Nenhum evento registrado ainda.</p>';
}

/* ---------- proposta em PDF (dentro do card do cliente) ---------- */
function abrirPropostaModal(){
  if(!modalForm || modalForm.__isNew) return;
  const daqui7dias = new Date();
  daqui7dias.setDate(daqui7dias.getDate()+7);
  propostaModalForm = {
    cliente: modalForm.cliente || '',
    descricao: '',
    valor: Number(modalForm.valor) || 0,
    parcelas: 1,
    validade: daqui7dias.toISOString().slice(0,10),
  };
  renderPropostaModal();
}
function closePropostaModal(){ propostaModalForm = null; document.getElementById('modal-root').innerHTML=''; }
function renderPropostaModal(){
  const root = document.getElementById('modal-root');
  if(!propostaModalForm){ root.innerHTML=''; return; }
  const f = propostaModalForm;
  root.innerHTML = `
    <div class="overlay" id="proposta-modal-overlay">
      <div class="modal">
        <div class="modal-head">
          <h3>Gerar proposta</h3>
          <button id="proposta-modal-close">✕</button>
        </div>
        <div class="modal-body">
          <div class="field"><label>Cliente</label><input type="text" id="proposta-cliente" value="${esc(f.cliente)}" /></div>
          <div class="field"><label>Produto ou serviço</label><textarea id="proposta-descricao" rows="3" placeholder="Descreva o que está sendo oferecido">${esc(f.descricao||'')}</textarea></div>
          <div class="field-row">
            <div class="field"><label>Valor total (R$)</label><input type="number" id="proposta-valor" value="${f.valor}" min="0" step="0.01" /></div>
            <div class="field"><label>Nº de parcelas</label><input type="number" id="proposta-parcelas" value="${f.parcelas}" min="1" /></div>
          </div>
          <div class="field"><label>Válida até</label><input type="date" id="proposta-validade" value="${f.validade}" /></div>
          <p class="settings-page-note">Parcela estimada: ${fmtBRL((f.valor||0)/(f.parcelas||1))}</p>
        </div>
        <div class="modal-foot">
          <span></span>
          <div class="modal-foot-actions">
            <button class="btn-outline" id="proposta-cancel">Cancelar</button>
            <button class="btn-save" id="proposta-gerar">Gerar PDF</button>
          </div>
        </div>
      </div>
    </div>
  `;
  document.getElementById('proposta-modal-close').addEventListener('click', closePropostaModal);
  document.getElementById('proposta-cancel').addEventListener('click', closePropostaModal);
  document.getElementById('proposta-modal-overlay').addEventListener('click', (e)=>{ if(e.target.id==='proposta-modal-overlay') closePropostaModal(); });
  document.getElementById('proposta-cliente').addEventListener('input', (e)=> propostaModalForm.cliente = e.target.value);
  document.getElementById('proposta-descricao').addEventListener('input', (e)=> propostaModalForm.descricao = e.target.value);
  document.getElementById('proposta-valor').addEventListener('input', (e)=>{ propostaModalForm.valor = parseFloat(e.target.value)||0; renderPropostaModal(); });
  document.getElementById('proposta-parcelas').addEventListener('input', (e)=>{ propostaModalForm.parcelas = parseInt(e.target.value,10)||1; renderPropostaModal(); });
  document.getElementById('proposta-validade').addEventListener('input', (e)=> propostaModalForm.validade = e.target.value);
  document.getElementById('proposta-gerar').addEventListener('click', gerarPropostaPdf);
}
async function gerarPropostaPdf(){
  try{ await carregarBiblioteca('jspdf'); }catch(e){ errorMsg = e.message; renderApp(); return; }
  const f = propostaModalForm;
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  let y = 25;
  doc.setFontSize(20);
  doc.text('Proposta Comercial', 14, y); y += 10;
  doc.setFontSize(11);
  doc.setTextColor(120);
  doc.text(`Responsável: ${(currentUser&&currentUser.nome)||''}`, 14, y); y += 14;
  doc.setTextColor(20);

  doc.setFontSize(12);
  doc.text(`Cliente: ${f.cliente}`, 14, y); y += 8;
  if((f.descricao||'').trim()){
    const linhasDescricao = doc.splitTextToSize(`Produto ou serviço: ${f.descricao.trim()}`, 180);
    doc.text(linhasDescricao, 14, y); y += 6 * linhasDescricao.length + 2;
  }
  doc.text(`Valor total: ${fmtBRL(f.valor)}`, 14, y); y += 8;
  doc.text(`Número de parcelas: ${f.parcelas}`, 14, y); y += 8;
  doc.text(`Parcela estimada: ${fmtBRL(f.valor/(f.parcelas||1))}`, 14, y); y += 8;
  doc.text(`Proposta válida até: ${formatDate(f.validade)}`, 14, y); y += 16;

  doc.setFontSize(9);
  doc.setTextColor(140);
  doc.text('Valores e condições sujeitos a alteração até a confirmação do pedido.', 14, y, { maxWidth: 180 });

  doc.save(`proposta_${(f.cliente||'cliente').replace(/\s+/g,'_')}.pdf`);
  closePropostaModal();
}

function formatDateHora(iso){
  if(!iso) return '';
  const d = new Date(iso);
  if(isNaN(d.getTime())) return '';
  return d.toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
}
function formatHora(iso){
  if(!iso) return '';
  const d = new Date(iso);
  if(isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' });
}


/* ---------- Equipe (Chat Interno + Supervisão) ---------- */
async function loadEquipe(){
  try{
    const data = await apiRequest('GET', '/equipe');
    equipe = data.equipe;
    minhasEquipes = data.minhasEquipes || [];
    limiteEquipes = data.limiteEquipes || 10;
    permForm = null; // tela de permissões recomeça do que está salvo
    if(typeof definirMinhasPermissoes === 'function') definirMinhasPermissoes(data.minhasPermissoes);
  }catch(e){
    equipe = null;
    minhasEquipes = [];
  }
  equipeLoaded = true;
  renderApp();
  if(equipe && currentPage === 'equipe'){
    if(equipeSubTab==='chat' && !chatLoaded) loadChat();
    if(equipeSubTab==='supervisao' && equipe.souSupervisor && !supervisaoLoaded) loadSupervisao();
    if(equipeSubTab==='monitoramento' && equipe.souSupervisorDeDados && !monitoramentoLoaded) loadMonitoramento();
  }
}
async function loadChat(){
  if(!equipe){ chatLoaded = true; renderApp(); return; }
  try{
    const data = await apiRequest('GET', '/equipe/chat');
    chatMensagens = data.mensagens || [];
  }catch(e){
    chatMensagens = [];
  }
  chatLoaded = true;
  renderApp();
}
async function loadMonitoramento(){
  monitoramentoLoaded = false;
  renderApp();
  try{
    const data = await apiRequest('GET', '/monitoramento/erros');
    monitoramentoErros = data.erros || [];
  }catch(e){
    monitoramentoErros = [];
  }
  monitoramentoLoaded = true;
  renderApp();
}
async function limparMonitoramento(){
  showConfirm({ chave:'log-erros',
    message: 'Limpar todo o log de erros registrado? Não afeta o funcionamento do sistema, só apaga o histórico.',
    confirmLabel: 'Limpar',
    onConfirm: async ()=>{
      closeConfirm();
      try{
        await apiRequest('DELETE', '/monitoramento/erros');
        monitoramentoErros = [];
      }catch(e){
        errorMsg = 'Não foi possível limpar o log agora.';
      }
      renderApp();
    },
  });
}
async function loadSupervisao(){
  if(!equipe || !equipe.souSupervisor){ supervisaoLoaded = true; renderApp(); return; }
  try{
    const data = await apiRequest('GET', '/equipe/supervisao');
    supervisaoMembros = data.membros || [];
  }catch(e){
    supervisaoMembros = [];
  }
  supervisaoLoaded = true;
  renderApp();
}
// Troca temporariamente os dados em tela (board, tarefas, meta) pelos de um membro da
// equipe, pro gestor ver o Dashboard dele exatamente como ele vê o próprio — sem
// nenhuma ação de edição disponível. sairDashboardDeMembro() devolve tudo como estava.
async function abrirDashboardDeMembro(userId, nome){
  try{
    const data = await apiRequest('GET', `/equipe/supervisao/${userId}/dashboard`);
    boardBackupGestor = board;
    tasksBackupGestor = tasks;
    metaVendasValorBackupGestor = metaVendasValor;
    board = { columns: data.columns || [], cards: data.cards || [] };
    tasks = data.tasks || [];
    tasksLoaded = true;
    metaVendasValor = data.metaVendasValor || 0;
    visualizandoDashboardDe = { userId, nome: data.nome || nome };
    goToPage('dashboard');
  }catch(e){
    errorMsg = 'Não foi possível carregar a visão geral desse membro.';
    renderApp();
  }
}
function sairDashboardDeMembro(){
  goToPage('equipe'); // a própria goToPage já restaura board/tasks/meta ao sair do dashboard
  equipeSubTab = 'supervisao';
  renderApp();
}

/* ---------- Automações ---------- */
async function loadAutomacoes(){
  try{
    const data = await apiRequest('GET', '/automacoes');
    automacoes = data.automacoes || [];
  }catch(e){
    automacoes = [];
  }
  automacoesLoaded = true;
  renderApp();
}
async function salvarAutomacao(){
  const f = automacaoModalForm;
  if(!f.nome.trim() || !f.colunaGatilhoId) return;
  const dados = { nome: f.nome, colunaGatilhoId: f.colunaGatilhoId, gatilhoTipo: f.gatilhoTipo, acaoTipo: f.acaoTipo, acaoParams: f.acaoParams };
  try{
    if(f.__isNew){
      const nova = await apiRequest('POST', '/automacoes', dados);
      automacoes.unshift(nova);
    } else {
      const atualizada = await apiRequest('PUT', `/automacoes/${f.id}`, dados);
      const idx = automacoes.findIndex(a=>a.id===f.id);
      if(idx>-1) automacoes[idx] = atualizada;
    }
    closeAutomacaoModal();
  }catch(e){
    errorMsg = e.message || 'Não foi possível salvar a ação automática.';
  }
  renderApp();
}
async function toggleAutomacaoAtiva(id){
  const a = automacoes.find(x=>x.id===id);
  if(!a) return;
  const anterior = a.ativa;
  a.ativa = !a.ativa;
  renderApp();
  try{
    await apiRequest('PUT', `/automacoes/${id}`, { ativa: a.ativa });
  }catch(e){
    a.ativa = anterior;
    errorMsg = 'Não foi possível atualizar a ação automática.';
    renderApp();
  }
}
async function excluirAutomacao(id){
  const idx = automacoes.findIndex(a=>a.id===id);
  if(idx===-1) return;
  const [removida] = automacoes.splice(idx,1);
  renderApp();
  try{
    await apiRequest('DELETE', `/automacoes/${id}`);
  }catch(e){
    automacoes.splice(idx,0,removida);
    errorMsg = 'Não foi possível excluir a ação automática.';
    renderApp();
  }
}

/* ---------- Fluxos ---------- */
async function loadFluxos(){
  try{
    const data = await apiRequest('GET', '/fluxos');
    fluxos = data.fluxos || [];
  }catch(e){
    fluxos = [];
  }
  fluxosLoaded = true;
  renderApp();
}
async function salvarFluxo(){
  const f = fluxoModalForm;
  if(!f.nome.trim() || !f.colunaGatilhoId || !f.etapas.length) return;
  const dados = { nome: f.nome, colunaGatilhoId: f.colunaGatilhoId, etapas: f.etapas };
  try{
    if(f.__isNew){
      const novo = await apiRequest('POST', '/fluxos', dados);
      novo.emAndamento = 0;
      fluxos.unshift(novo);
    } else {
      const atualizado = await apiRequest('PUT', `/fluxos/${f.id}`, dados);
      const idx = fluxos.findIndex(x=>x.id===f.id);
      if(idx>-1) fluxos[idx] = { ...fluxos[idx], ...atualizado };
    }
    closeFluxoModal();
  }catch(e){
    errorMsg = e.message || 'Não foi possível salvar a sequência.';
  }
  renderApp();
}
async function toggleFluxoAtivo(id){
  const f = fluxos.find(x=>x.id===id);
  if(!f) return;
  const anterior = f.ativo;
  f.ativo = !f.ativo;
  renderApp();
  try{
    await apiRequest('PUT', `/fluxos/${id}`, { ativo: f.ativo });
  }catch(e){
    f.ativo = anterior;
    errorMsg = 'Não foi possível atualizar a sequência.';
    renderApp();
  }
}
async function excluirFluxo(id){
  const idx = fluxos.findIndex(f=>f.id===id);
  if(idx===-1) return;
  const [removido] = fluxos.splice(idx,1);
  renderApp();
  try{
    await apiRequest('DELETE', `/fluxos/${id}`);
  }catch(e){
    fluxos.splice(idx,0,removido);
    errorMsg = 'Não foi possível excluir a sequência.';
    renderApp();
  }
}

/* ---------- Importar/Exportar (planilha -> possíveis leads) ---------- */
async function handlePlanilhaFileSelected(file){
  if(!file) return;
  try{ await carregarBiblioteca('xlsx'); }catch(e){ errorMsg = e.message; renderApp(); return; }
  importPlanilhaMsg = null;
  importPlanilhaNomeArquivo = file.name;
  const reader = new FileReader();
  reader.onload = (e)=>{
    try{
      const workbook = XLSX.read(e.target.result, { type:'array' });
      const primeiraAba = workbook.SheetNames[0];
      const linhas = XLSX.utils.sheet_to_json(workbook.Sheets[primeiraAba], { defval:'' });
      if(!linhas.length){
        importPlanilhaMsg = { tipo:'erro', texto:'A planilha parece estar vazia.' };
        importPlanilhaLinhas = [];
        importPlanilhaColunas = [];
        renderApp();
        return;
      }
      importPlanilhaLinhas = linhas;
      importPlanilhaColunas = Object.keys(linhas[0]);
      // tenta adivinhar as colunas certas pelo nome, só pra facilitar — usuário confirma/ajusta de qualquer forma
      const achar = (padroes)=> importPlanilhaColunas.find(c=> padroes.some(p=> c.toLowerCase().includes(p))) || '';
      importMapNome = achar(['nome']);
      importMapTelefone = achar(['telefone','celular','fone','whats']);
      importMapServico = achar(['serviço','servico','produto','interesse','tipo']);
      importPlanilhaMsg = null;
    }catch(err){
      importPlanilhaMsg = { tipo:'erro', texto:'Não foi possível ler esse arquivo. Confira se é um .csv ou .xlsx válido.' };
      importPlanilhaLinhas = [];
      importPlanilhaColunas = [];
    }
    importAnimarEntrada = true;
    renderApp();
  };
  reader.readAsArrayBuffer(file);
}
// as informações da planilha descem (ao escolher) e sobem (ao tirar)
function alturaAnimada(el, de, para, ms, fim){
  el.style.overflow = 'hidden'; el.style.maxHeight = de + 'px';
  void el.offsetHeight;
  el.style.transition = `max-height ${ms}ms cubic-bezier(.2,.75,.3,1)`;
  el.style.maxHeight = para + 'px';
  let feito = false;
  const acabar = ()=>{ if(feito) return; feito = true; el.style.transition = el.style.maxHeight = el.style.overflow = ''; if(fim) fim(); };
  el.addEventListener('transitionend', (e)=>{ if(e.target === el) acabar(); }, { once:true });
  setTimeout(acabar, ms + 80);
}
function semMovimento(){
  return document.documentElement.classList.contains('a11y-sem-movimento') || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
}
function animarEntradaPlanilha(){
  const el = document.getElementById('import-detalhe');
  importAnimarEntrada = false;
  if(!el || semMovimento()) return;
  el.classList.add('entrando');
  alturaAnimada(el, 0, el.scrollHeight, 380);
  setTimeout(()=> el.classList.remove('entrando'), 700);
}
function tirarPlanilha(){
  const limpar = ()=>{
    importPlanilhaNomeArquivo = ''; importPlanilhaLinhas = []; importPlanilhaColunas = [];
    importMapNome = importMapTelefone = importMapServico = ''; importPlanilhaMsg = null;
    renderApp();
  };
  const el = document.getElementById('import-detalhe');
  const chip = app.querySelector('.arquivo-escolhido');
  if(semMovimento()) return limpar();
  if(chip) chip.classList.add('saindo');
  if(!el || !el.offsetHeight) return setTimeout(limpar, 180);
  el.classList.add('saindo');
  alturaAnimada(el, el.offsetHeight, 0, 300, limpar);
}
async function confirmarImportPlanilha(){
  if(!importMapNome && !importMapTelefone){
    importPlanilhaMsg = { tipo:'erro', texto:'Escolha ao menos a coluna de nome ou de telefone.' };
    renderApp();
    return;
  }
  const linhas = importPlanilhaLinhas.map(linha=>({
    nome: importMapNome ? linha[importMapNome] : '',
    telefone: importMapTelefone ? linha[importMapTelefone] : '',
    tipoServico: importMapServico ? linha[importMapServico] : '',
  }));
  importandoPlanilha = true;
  importPlanilhaMsg = null;
  renderApp();
  try{
    const data = await apiRequest('POST', '/possiveis-leads/importar', { linhas, origemArquivo: importPlanilhaNomeArquivo });
    importPlanilhaMsg = { tipo:'ok', texto:`${data.total} possível(is) contato(s) importado(s).` };
    importPlanilhaLinhas = [];
    importPlanilhaColunas = [];
    importPlanilhaNomeArquivo = '';
    await loadPossiveisLeads();
  }catch(e){
    importPlanilhaMsg = { tipo:'erro', texto: e.message || 'Não foi possível importar a planilha.' };
  }
  importandoPlanilha = false;
  renderApp();
}
async function loadPossiveisLeads(){
  try{
    const data = await apiRequest('GET', '/possiveis-leads');
    possiveisLeads = data.leads || [];
  }catch(e){
    possiveisLeads = [];
  }
  possiveisLeadsCarregados = true;
  renderApp();
}
async function descartarPossivelLead(id){
  const idx = possiveisLeads.findIndex(l=>l.id===id);
  if(idx===-1) return;
  const [removido] = possiveisLeads.splice(idx,1);
  renderApp();
  try{
    await apiRequest('DELETE', `/possiveis-leads/${id}`);
  }catch(e){
    possiveisLeads.splice(idx,0,removido);
    errorMsg = 'Não foi possível descartar.';
    renderApp();
  }
}
function abrirCompletarLead(id){
  const lead = possiveisLeads.find(l=>l.id===id);
  if(!lead) return;
  completarLeadModalForm = {
    possivelLeadId: lead.id, nome: lead.nome||'', telefone: lead.telefone||'',
    tipoServico: lead.tipoServico||'', columnId: ((board.columns.find(c=>c.tipo==='aberto')||board.columns[0]||{}).id)||'',
    valor: 0, temperatura:'morno',
  };
  completarLeadMsg = null;
  renderCompletarLeadModal();
}
function closeCompletarLeadModal(){ completarLeadModalForm = null; document.getElementById('modal-root').innerHTML=''; }
async function salvarCompletarLead(){
  const f = completarLeadModalForm;
  if(!f.nome.trim()){
    completarLeadMsg = { tipo:'erro', texto:'Informe o nome do cliente.' };
    renderCompletarLeadModal();
    return;
  }
  if(!f.columnId){
    completarLeadMsg = { tipo:'erro', texto:'Escolha a coluna de destino.' };
    renderCompletarLeadModal();
    return;
  }
  completarLeadSalvando = true;
  completarLeadMsg = null;
  renderCompletarLeadModal();
  try{
    const novoCard = await apiRequest('POST', `/possiveis-leads/${f.possivelLeadId}/promover`, {
      nome: f.nome, telefone: f.telefone, columnId: f.columnId, valor: f.valor,
      temperatura: f.temperatura, obs: f.tipoServico ? `Serviço de interesse: ${f.tipoServico}` : '',
      mes: currentMonthKey(),
    });
    board.cards.push(novoCard);
    possiveisLeads = possiveisLeads.filter(l=>l.id!==f.possivelLeadId);
    closeCompletarLeadModal();
    renderApp();
  }catch(e){
    completarLeadMsg = { tipo:'erro', texto: e.message || 'Não foi possível adicionar aos Contatos.' };
    completarLeadSalvando = false;
    renderCompletarLeadModal();
  }
}
function renderCompletarLeadModal(){
  const root = document.getElementById('modal-root');
  if(!completarLeadModalForm){ root.innerHTML=''; return; }
  const f = completarLeadModalForm;
  root.innerHTML = `
    <div class="overlay" id="cl-lead-overlay">
      <div class="modal">
        <div class="modal-head">
          <h3>Completar e adicionar aos Contatos</h3>
          <button id="cl-lead-close">✕</button>
        </div>
        <div class="modal-body">
          <div class="field"><label>Nome</label><input type="text" id="cl-lead-nome" value="${esc(f.nome)}" /></div>
          <div class="field"><label>Telefone</label><input type="text" id="cl-lead-telefone" value="${esc(f.telefone)}" /></div>
          ${f.tipoServico ? `<p class="settings-page-note">Serviço de interesse (da planilha): <b>${esc(f.tipoServico)}</b></p>` : ''}
          <div class="field">
            <label>Coluna de destino</label>
            <select id="cl-lead-coluna">
              ${board.columns.map(c=>`<option value="${c.id}" ${f.columnId===c.id?'selected':''}>${esc(c.nome)}</option>`).join('')}
            </select>
          </div>
          <div class="field-row">
            <div class="field"><label>Valor (opcional)</label><input type="number" id="cl-lead-valor" value="${f.valor}" min="0" step="0.01" /></div>
            <div class="field">
              <label>Temperatura</label>
              <select id="cl-lead-temp">
                <option value="frio" ${f.temperatura==='frio'?'selected':''}>Frio</option>
                <option value="morno" ${f.temperatura==='morno'?'selected':''}>Morno</option>
                <option value="quente" ${f.temperatura==='quente'?'selected':''}>Quente</option>
              </select>
            </div>
          </div>
          ${completarLeadMsg ? `<p class="settings-page-msg ${completarLeadMsg.tipo}">${esc(completarLeadMsg.texto)}</p>` : ''}
        </div>
        <div class="modal-foot">
          <span></span>
          <div class="modal-foot-actions">
            <button class="btn-outline" id="cl-lead-cancel">Cancelar</button>
            <button class="btn-save" id="cl-lead-salvar" ${completarLeadSalvando?'disabled':''}>${completarLeadSalvando?'Adicionando…':'Adicionar aos Contatos'}</button>
          </div>
        </div>
      </div>
    </div>
  `;
  document.getElementById('cl-lead-close').addEventListener('click', closeCompletarLeadModal);
  document.getElementById('cl-lead-cancel').addEventListener('click', closeCompletarLeadModal);
  document.getElementById('cl-lead-overlay').addEventListener('click', (e)=>{ if(e.target.id==='cl-lead-overlay') closeCompletarLeadModal(); });
  document.getElementById('cl-lead-nome').addEventListener('input', (e)=> completarLeadModalForm.nome = e.target.value);
  document.getElementById('cl-lead-telefone').addEventListener('input', (e)=> completarLeadModalForm.telefone = e.target.value);
  document.getElementById('cl-lead-coluna').addEventListener('change', (e)=> completarLeadModalForm.columnId = e.target.value);
  document.getElementById('cl-lead-valor').addEventListener('input', (e)=> completarLeadModalForm.valor = parseFloat(e.target.value)||0);
  document.getElementById('cl-lead-temp').addEventListener('change', (e)=> completarLeadModalForm.temperatura = e.target.value);
  document.getElementById('cl-lead-salvar').addEventListener('click', salvarCompletarLead);
}


async function criarEquipe(){
  const nome = equipeNomeNovo.trim();
  if(!nome){ equipeMsg = { tipo:'erro', texto:'Digite um nome para a equipe.' }; renderApp(); return; }
  try{
    await apiRequest('POST', '/equipe', { nome });
    equipeNomeNovo = '';
    equipeMsg = null;
    limparDadosDaEquipeAberta(); equipeSubTab = 'chat';
    await loadEquipe();
  }catch(e){
    equipeMsg = { tipo:'erro', texto: e.message || 'Não foi possível criar a equipe.' };
    renderApp();
  }
}
async function entrarNaEquipe(){
  const codigo = equipeCodigoEntrar.trim();
  if(!codigo){ equipeMsg = { tipo:'erro', texto:'Digite o código de convite.' }; renderApp(); return; }
  try{
    await apiRequest('POST', '/equipe/entrar', { codigo });
    equipeCodigoEntrar = '';
    equipeMsg = null;
    limparDadosDaEquipeAberta(); equipeSubTab = 'chat';
    await loadEquipe();
  }catch(e){
    equipeMsg = { tipo:'erro', texto: e.message || 'Não foi possível entrar na equipe.' };
    renderApp();
  }
}
function limparDadosDaEquipeAberta(){
  chatMensagens = []; chatLoaded = false;
  supervisaoMembros = []; supervisaoLoaded = false;
  monitoramentoLoaded = false;
  dmDestinatarioId = null; dmMensagens = []; dmLoaded = false;
}
// sem equipeId: sai da equipe aberta
async function sairDaEquipe(equipeId){
  try{
    await apiRequest('POST', '/equipe/sair', equipeId ? { equipeId } : {});
    limparDadosDaEquipeAberta();
    await loadEquipe();
  }catch(e){
    errorMsg = e.message || 'Não foi possível sair da equipe.';
    renderApp();
  }
}
// Troca a equipe aberta (a pessoa continua em todas): chat, gestão e permissões passam a ser os da nova
async function abrirEquipeDaLista(equipeId){
  if(atuandoComo){ errorMsg = 'Saia do funil de ' + atuandoComo.nome + ' antes de trocar de equipe.'; renderApp(); return; }
  try{
    await apiRequest('POST', '/equipe/abrir', { equipeId });
    limparDadosDaEquipeAberta();
    equipeMsg = null;
    equipeSubTab = 'chat';
    await loadEquipe();
  }catch(e){
    errorMsg = e.message || 'Não foi possível abrir a equipe.';
    renderApp();
  }
}

// "Atuar como": o gestor passa a trabalhar no funil de um consultor — vê, cria, edita, exclui e
// move os contatos e tarefas dele. Só gestor da mesma equipe; o servidor confere e registra tudo.
async function entrarNoFunilDe(userId, nome){
  try{
    let meta = 0;
    try{ meta = (await apiRequest('GET', `/equipe/supervisao/${userId}/dashboard`)).metaVendasValor || 0; }catch(e){}
    if(visualizandoDashboardDe) goToPage('equipe'); // devolve os dados do gestor antes
    if(!atuandoComo) metaBackupAtuandoComo = metaVendasValor;
    atuandoComo = { userId, nome };
    metaVendasValor = meta;
    funilAtualId = null; funis = []; board = { columns: [], cards: [] }; tasks = []; loaded = false;
    await Promise.all([loadBoard(), loadFunis(), loadTasks(), loadCamposPersonalizados()]);
    if(currentPage === 'pipeline') renderApp(); else goToPage('pipeline');
  }catch(e){
    atuandoComo = null;
    errorMsg = 'Não foi possível abrir o funil desse consultor.';
    renderApp();
  }
}
async function sairDoFunilDe(){
  atuandoComo = null;
  if(metaBackupAtuandoComo !== null) metaVendasValor = metaBackupAtuandoComo;
  metaBackupAtuandoComo = null;
  funilAtualId = null; funis = []; board = { columns: [], cards: [] }; tasks = [];
  await Promise.all([loadBoard(), loadFunis(), loadTasks(), loadCamposPersonalizados()]);
  equipeSubTab = 'supervisao';
  if(currentPage === 'equipe') renderApp(); else goToPage('equipe');
}
async function regenerarCodigoEquipe(){
  try{
    const data = await apiRequest('POST', '/equipe/regenerar-codigo');
    if(equipe) equipe.codigoConvite = data.codigoConvite;
  }catch(e){
    errorMsg = 'Não foi possível gerar um novo código.';
  }
  renderApp();
}
async function alterarPapelMembro(userId, papel){
  try{
    await apiRequest('PUT', `/equipe/membro/${userId}/papel`, { papel });
    await loadEquipe();
  }catch(e){
    errorMsg = 'Não foi possível alterar o papel do membro.';
    renderApp();
  }
}
async function alterarSupervisorDeDados(userId, ativo){
  try{
    await apiRequest('PUT', `/equipe/membro/${userId}/supervisor-dados`, { ativo });
    await loadEquipe();
  }catch(e){
    errorMsg = 'Não foi possível alterar o acesso de supervisor de dados.';
    renderApp();
  }
}
async function removerMembro(userId){
  try{
    await apiRequest('DELETE', `/equipe/membro/${userId}`);
    await loadEquipe();
  }catch(e){
    errorMsg = 'Não foi possível remover o membro.';
    renderApp();
  }
}
async function enviarMensagemChat(){
  if(!chatTexto.trim()) return;
  chatEnviando = true;
  renderApp();
  try{
    await apiRequest('POST', '/equipe/chat', { texto: chatTexto });
    chatTexto = '';
    await loadChat();
  }catch(e){
    errorMsg = e.message || 'Não foi possível enviar a mensagem.';
  }
  chatEnviando = false;
  renderApp();
}
async function abrirConversaIndividual(userId){
  dmDestinatarioId = userId;
  dmLoaded = false;
  dmMensagens = [];
  renderApp();
  try{
    const data = await apiRequest('GET', `/equipe/chat/${userId}`);
    dmMensagens = data.mensagens || [];
  }catch(e){
    dmMensagens = [];
    errorMsg = e.message || 'Não foi possível carregar a conversa.';
  }
  dmLoaded = true;
  renderApp();
}
async function enviarMensagemIndividual(){
  if(!dmTexto.trim() || !dmDestinatarioId) return;
  dmEnviando = true;
  renderApp();
  try{
    await apiRequest('POST', `/equipe/chat/${dmDestinatarioId}`, { texto: dmTexto });
    dmTexto = '';
    const data = await apiRequest('GET', `/equipe/chat/${dmDestinatarioId}`);
    dmMensagens = data.mensagens || [];
  }catch(e){
    errorMsg = e.message || 'Não foi possível enviar a mensagem.';
  }
  dmEnviando = false;
  renderApp();
}

// Notificações são calculadas na hora, a partir do que já está carregado
// (tarefas e leads) — não existe uma tabela própria pra isso.
function computarNotificacoes(){
  const notifs = [];
  const fimHoje = new Date(); fimHoje.setHours(23,59,59,999);
  tasks.forEach(t=>{
    if(!t.concluida && t.vencimento && new Date(t.vencimento) <= fimHoje){
      notifs.push({ texto:`Tarefa: ${t.titulo}`, timestamp: t.vencimento, cardId: t.leadId || null });
    }
  });
  const ontem = new Date(Date.now() - 24*60*60*1000);
  board.cards.forEach(c=>{
    if(c.createdAt && new Date(c.createdAt) >= ontem){
      notifs.push({ texto:`Novo contato: ${c.cliente}`, timestamp:c.createdAt, cardId:c.id });
    }
  });
  return notifs.sort((a,b)=> new Date(b.timestamp) - new Date(a.timestamp));
}



/* ---------- Campos personalizados ---------- */
async function toggleAgendamentoPublicoAtivo(){
  agendamentoPublicoForm.ativo = !agendamentoPublicoForm.ativo;
  renderApp();
}
async function salvarAgendamentoPublico(){
  agendamentoPublicoForm.horaInicio = document.getElementById('ap-hora-inicio').value || agendamentoPublicoForm.horaInicio;
  agendamentoPublicoForm.horaFim = document.getElementById('ap-hora-fim').value || agendamentoPublicoForm.horaFim;
  agendamentoPublicoForm.duracaoMinutos = Number(document.getElementById('ap-duracao').value);
  agendamentoPublicoForm.diasSemana = [...document.querySelectorAll('.ap-dia-semana:checked')].map(el=>Number(el.value));
  agendamentoPublicoForm.colunaDestinoId = document.getElementById('ap-coluna-destino').value;
  try{
    const data = await apiRequest('PUT', '/auth/agendamento-publico', agendamentoPublicoForm);
    currentUser = data.user;
    localStorage.setItem('user', JSON.stringify(currentUser));
    agendamentoPublicoMsg = { tipo:'ok', texto:'Configuração salva.' };
  }catch(e){
    agendamentoPublicoMsg = { tipo:'erro', texto: e.message || 'Não foi possível salvar.' };
  }
  renderApp();
}
function copiarLinkAgendamento(){
  const link = `${window.location.origin}/agendar/${currentUser.id}`;
  navigator.clipboard.writeText(link).then(()=>{
    agendamentoPublicoMsg = { tipo:'ok', texto:'Link copiado!' };
    renderApp();
  });
}
async function loadWebhooksSaida(){
  try{
    const data = await apiRequest('GET', '/webhooks-saida');
    webhooksSaida = data.webhooks || [];
  }catch(e){
    webhooksSaida = [];
  }
  renderApp();
}
async function criarWebhookSaida(){
  const nome = document.getElementById('novo-webhook-nome').value;
  const url = document.getElementById('novo-webhook-url').value;
  const eventos = [...document.querySelectorAll('.novo-webhook-evento:checked')].map(el=>el.value);
  if(!url.trim() || !eventos.length){
    webhooksSaidaMsg = { tipo:'erro', texto:'Preencha a URL e escolha ao menos um evento.' };
    renderApp();
    return;
  }
  try{
    const novo = await apiRequest('POST', '/webhooks-saida', { nome, url, eventos });
    webhooksSaida.unshift(novo);
    webhooksSaidaMsg = { tipo:'ok', texto:'Webhook criado.' };
  }catch(e){
    webhooksSaidaMsg = { tipo:'erro', texto: e.message || 'Não foi possível criar o webhook.' };
  }
  renderApp();
}
async function toggleWebhookSaida(id, ativo){
  try{
    const atualizado = await apiRequest('PUT', `/webhooks-saida/${id}`, { ativo });
    const idx = webhooksSaida.findIndex(w=>w.id===id);
    if(idx>-1) webhooksSaida[idx] = atualizado;
  }catch(e){
    webhooksSaidaMsg = { tipo:'erro', texto:'Não foi possível alterar o webhook.' };
  }
  renderApp();
}
async function excluirWebhookSaida(id){
  showConfirm({ chave:'webhook',
    message: 'Remover esse webhook? Ele para de disparar imediatamente.',
    confirmLabel: 'Remover',
    onConfirm: async ()=>{
      closeConfirm();
      try{
        await apiRequest('DELETE', `/webhooks-saida/${id}`);
        webhooksSaida = webhooksSaida.filter(w=>w.id!==id);
      }catch(e){
        webhooksSaidaMsg = { tipo:'erro', texto:'Não foi possível remover o webhook.' };
      }
      renderApp();
    },
  });
}
async function testarWebhookSaida(id){
  webhooksSaidaMsg = { tipo:'ok', texto:'Enviando teste…' };
  renderApp();
  try{
    await apiRequest('POST', `/webhooks-saida/${id}/testar`);
    webhooksSaidaMsg = { tipo:'ok', texto:'Teste enviado — confira do outro lado.' };
  }catch(e){
    webhooksSaidaMsg = { tipo:'erro', texto: e.message || 'Não foi possível testar esse webhook agora.' };
  }
  renderApp();
}
async function loadCamposPersonalizados(){
  try{
    const data = await apiRequest('GET', '/campos-personalizados');
    camposPersonalizados = data.campos || [];
  }catch(e){
    camposPersonalizados = [];
  }
  camposPersonalizadosCarregados = true;
  renderApp();
}
async function criarCampoPersonalizado(){
  const nome = novoCampoNome.trim();
  if(!nome){
    camposPersonalizadosMsg = { tipo:'erro', texto:'Digite um nome pro campo.' };
    renderApp();
    return;
  }
  try{
    const novo = await apiRequest('POST', '/campos-personalizados', { nome, tipo: novoCampoTipo });
    camposPersonalizados.push(novo);
    novoCampoNome = '';
    camposPersonalizadosMsg = null;
  }catch(e){
    camposPersonalizadosMsg = { tipo:'erro', texto: e.message || 'Não foi possível criar o campo.' };
  }
  renderApp();
}
async function excluirCampoPersonalizado(id){
  const idx = camposPersonalizados.findIndex(c=>c.id===id);
  if(idx===-1) return;
  const [removido] = camposPersonalizados.splice(idx,1);
  renderApp();
  try{
    await apiRequest('DELETE', `/campos-personalizados/${id}`);
  }catch(e){
    camposPersonalizados.splice(idx,0,removido);
    errorMsg = 'Não foi possível excluir o campo.';
    renderApp();
  }
}

/* ---------- Histórico de contato (dentro do card) ---------- */
async function loadHistoricoContato(cardId){
  try{
    const data = await apiRequest('GET', `/historico-contato/${cardId}`);
    historicoContatoItens = data.itens || [];
  }catch(e){
    historicoContatoItens = [];
  }
  historicoContatoCarregado = true;
  const lista = document.getElementById('f-historico-lista');
  if(lista){
    lista.innerHTML = renderHistoricoContatoListaHtml();
    ligarBindingsHistoricoContato();
  }
}
function renderHistoricoContatoListaHtml(){
  if(!historicoContatoItens.length) return '<p class="dash-empty">Nenhum registro ainda.</p>';
  return `<div class="historico-lista">${historicoContatoItens.map(i=>{
    if(historicoContatoEditandoId === i.id){
      return `
    <div class="historico-item">
      <div class="field-row-flex" style="flex:1;">
        <input type="text" id="historico-edit-input-${i.id}" value="${esc(i.texto)}" />
        <button class="btn-primary" data-action="salvar-edicao-historico" data-id="${i.id}">Salvar</button>
        <button class="btn-outline" data-action="cancelar-edicao-historico">Cancelar</button>
      </div>
    </div>`;
    }
    return `
    <div class="historico-item">
      <div style="flex:1;">
        <span class="historico-item-texto">${esc(i.texto)}</span>
        <span class="historico-item-data">${formatDateHora(i.createdAt)}</span>
      </div>
      <button class="icon-btn" data-action="editar-historico-contato" data-id="${i.id}" title="Editar">✎</button>
      <button class="icon-btn" data-action="excluir-historico-contato" data-id="${i.id}" title="Excluir">${ICON_TRASH}</button>
    </div>`;
  }).join('')}</div>`;
}
function ligarBindingsHistoricoContato(){
  document.querySelectorAll('[data-action="excluir-historico-contato"]').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const id = btn.dataset.id;
      if(historicoContatoItens.findIndex(i=>i.id===id)===-1) return;
      if(!(await confirmarAcao({ mensagem:'Apagar este registro do histórico de contato?', botao:'Apagar', chave:'historico-contato' }))) return;
      const idx = historicoContatoItens.findIndex(i=>i.id===id);
      if(idx===-1) return;
      const [removido] = historicoContatoItens.splice(idx,1);
      const lista = document.getElementById('f-historico-lista');
      if(lista){ lista.innerHTML = renderHistoricoContatoListaHtml(); ligarBindingsHistoricoContato(); }
      try{
        await apiRequest('DELETE', `/historico-contato/${id}`);
      }catch(e){
        historicoContatoItens.splice(idx,0,removido);
        errorMsg = 'Não foi possível excluir o registro.';
        if(lista){ lista.innerHTML = renderHistoricoContatoListaHtml(); ligarBindingsHistoricoContato(); }
      }
    });
  });
  document.querySelectorAll('[data-action="editar-historico-contato"]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      historicoContatoEditandoId = btn.dataset.id;
      const lista = document.getElementById('f-historico-lista');
      if(lista){ lista.innerHTML = renderHistoricoContatoListaHtml(); ligarBindingsHistoricoContato(); }
      const input = document.getElementById(`historico-edit-input-${historicoContatoEditandoId}`);
      if(input){ input.focus(); input.select(); }
    });
  });
  document.querySelectorAll('[data-action="cancelar-edicao-historico"]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      historicoContatoEditandoId = null;
      const lista = document.getElementById('f-historico-lista');
      if(lista){ lista.innerHTML = renderHistoricoContatoListaHtml(); ligarBindingsHistoricoContato(); }
    });
  });
  document.querySelectorAll('[data-action="salvar-edicao-historico"]').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const id = btn.dataset.id;
      const input = document.getElementById(`historico-edit-input-${id}`);
      const novoTexto = input ? input.value.trim() : '';
      if(!novoTexto) return;
      const idx = historicoContatoItens.findIndex(i=>i.id===id);
      if(idx===-1) return;
      const anterior = historicoContatoItens[idx].texto;
      historicoContatoItens[idx].texto = novoTexto;
      historicoContatoEditandoId = null;
      const lista = document.getElementById('f-historico-lista');
      if(lista){ lista.innerHTML = renderHistoricoContatoListaHtml(); ligarBindingsHistoricoContato(); }
      try{
        await apiRequest('PUT', `/historico-contato/${id}`, { texto: novoTexto });
      }catch(e){
        historicoContatoItens[idx].texto = anterior;
        errorMsg = 'Não foi possível editar o registro.';
        if(lista){ lista.innerHTML = renderHistoricoContatoListaHtml(); ligarBindingsHistoricoContato(); }
      }
    });
  });
}
async function adicionarHistoricoContato(){
  const texto = historicoContatoTexto.trim();
  if(!texto || !modalForm || modalForm.__isNew) return;
  historicoContatoEnviando = true;
  const input = document.getElementById('historico-input');
  if(input) input.disabled = true;
  try{
    const novo = await apiRequest('POST', '/historico-contato', { cardId: modalForm.id, texto });
    historicoContatoItens.unshift(novo);
    historicoContatoTexto = '';
    const lista = document.getElementById('f-historico-lista');
    if(lista){ lista.innerHTML = renderHistoricoContatoListaHtml(); ligarBindingsHistoricoContato(); }
    if(input){ input.value = ''; }
  }catch(e){
    errorMsg = 'Não foi possível salvar o registro.';
    renderApp();
  }
  historicoContatoEnviando = false;
  if(input) input.disabled = false;
}
function formatarTamanhoArquivo(bytes){
  if(!bytes) return '0 KB';
  if(bytes < 1024*1024) return `${Math.round(bytes/1024)} KB`;
  return `${(bytes/(1024*1024)).toFixed(1)} MB`;
}
async function loadAnexosDoCard(cardId){
  try{
    const data = await apiRequest('GET', `/cards/${cardId}/anexos`);
    anexosDoCard = data.anexos || [];
  }catch(e){
    anexosDoCard = [];
  }
  anexosCarregados = true;
  const lista = document.getElementById('f-anexos-lista');
  if(lista){
    lista.innerHTML = renderAnexosListaHtml();
    ligarBindingsAnexos();
  }
}
function renderAnexosListaHtml(){
  const msgHtml = anexoMsg ? `<p class="settings-page-msg ${anexoMsg.tipo}">${esc(anexoMsg.texto)}</p>` : '';
  if(!anexosDoCard.length) return `${msgHtml}<p class="settings-page-note">Nenhum anexo ainda.</p>`;
  return `
    ${msgHtml}
    <div class="anexos-lista">
      ${anexosDoCard.map(a=>`
        <div class="anexo-item">
          <a href="${a.dadosBase64}" download="${esc(a.nomeArquivo)}" class="anexo-item-nome">📎 ${esc(a.nomeArquivo)}</a>
          <span class="settings-page-note">${formatarTamanhoArquivo(a.tamanho)}</span>
          <button type="button" class="icon-btn" data-action="excluir-anexo" data-anexo-id="${a.id}" title="Excluir">${ICON_TRASH}</button>
        </div>
      `).join('')}
    </div>
  `;
}
function ligarBindingsAnexos(){
  document.querySelectorAll('[data-action="excluir-anexo"]').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const anexoId = btn.dataset.anexoId;
      if(!(await confirmarAcao({ mensagem:'Excluir este anexo?', chave:'anexo' }))) return;
      btn.disabled = true;
      try{
        await apiRequest('DELETE', `/cards/${modalForm.id}/anexos/${anexoId}`);
        anexosDoCard = anexosDoCard.filter(a=>a.id!==anexoId);
        const lista = document.getElementById('f-anexos-lista');
        if(lista){ lista.innerHTML = renderAnexosListaHtml(); ligarBindingsAnexos(); }
      }catch(e){
        errorMsg = 'Não foi possível excluir o anexo.';
        renderApp();
      }
    });
  });
}
function lerArquivoComoBase64(file){
  return new Promise((resolve, reject)=>{
    const reader = new FileReader();
    reader.onload = (e)=> resolve(e.target.result);
    reader.onerror = ()=> reject(new Error('Não foi possível ler o arquivo.'));
    reader.readAsDataURL(file);
  });
}
async function handleAnexoFileSelected(file){
  if(!file || !modalForm || modalForm.__isNew) return;
  const btn = document.getElementById('anexo-upload-btn');
  const lista = document.getElementById('f-anexos-lista');
  if(file.size > 3.2 * 1024 * 1024){
    anexoMsg = { tipo:'erro', texto:'Arquivo muito grande. O limite é de aproximadamente 3 MB.' };
    if(lista){ lista.innerHTML = renderAnexosListaHtml(); ligarBindingsAnexos(); }
    return;
  }
  anexoEnviando = true;
  anexoMsg = null;
  if(btn){ btn.disabled = true; btn.textContent = 'Enviando…'; }
  if(lista){ lista.innerHTML = renderAnexosListaHtml(); ligarBindingsAnexos(); }
  try{
    const dadosBase64 = await lerArquivoComoBase64(file);
    const novo = await apiRequest('POST', `/cards/${modalForm.id}/anexos`, {
      nomeArquivo: file.name, tipoMime: file.type, dadosBase64,
    });
    anexosDoCard.unshift(novo);
    anexoMsg = { tipo:'ok', texto:'Anexo enviado.' };
  }catch(e){
    anexoMsg = { tipo:'erro', texto: e.message || 'Não foi possível enviar o anexo.' };
  }
  anexoEnviando = false;
  if(btn){ btn.disabled = false; btn.textContent = '+ Adicionar anexo'; }
  const listaAtualizada = document.getElementById('f-anexos-lista');
  if(listaAtualizada){ listaAtualizada.innerHTML = renderAnexosListaHtml(); ligarBindingsAnexos(); }
}


/* ---------- Relatórios ---------- */
function relatoriosDadosMensais(mesesAtras, cardsBase){
  const cards = cardsBase || board.cards;
  const buckets = [];
  const agora = new Date();
  for(let i=mesesAtras-1;i>=0;i--){
    const d = new Date(agora.getFullYear(), agora.getMonth()-i, 1);
    buckets.push({ key:`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`, novos:0, ganhoValor:0, ganhoQtd:0 });
  }
  const porKey = new Map(buckets.map(b=>[b.key,b]));
  cards.forEach(c=>{
    if(c.createdAt){
      const bucket = porKey.get(c.createdAt.slice(0,7));
      if(bucket) bucket.novos++;
    }
    if(c.mes){
      const bucketGanho = porKey.get(c.mes.slice(0,7));
      const col = board.columns.find(k=>k.id===c.columnId);
      if(bucketGanho && col && col.tipo==='ganho'){
        bucketGanho.ganhoValor += valorVendido(c);
        bucketGanho.ganhoQtd++;
      }
    }
  });
  return buckets;
}
// Leads em planilha: Excel (.xlsx, padrão) ou CSV. Valor como número, para somar no Excel.
function linhasDosLeads(cards){
  return cards.map(c=>{
    const col = board.columns.find(k=>k.id===c.columnId);
    return {
      'Nome': c.cliente||'', 'Telefone': c.telefone||'', 'E-mail': c.email||'', 'Valor': Number(c.valor)||0,
      'Valor vendido': col && col.tipo==='ganho' ? valorVendido(c) : '', 'Coluna': col ? col.nome : '',
      'Temperatura': c.temperatura ? ((TEMPS[c.temperatura]||{}).label || c.temperatura) : '', 'Serviço': c.tipoServico||'',
      'Início de contato': c.mesInicioContato||'', 'Mês de venda': c.mes||'', 'Observações': c.obs||'',
    };
  });
}
async function baixarModeloLeads(){
  try{ await carregarBiblioteca('xlsx'); }catch(e){ errorMsg = e.message; renderApp(); return; }
  const ws = XLSX.utils.aoa_to_sheet([['Nome','Telefone','Serviço desejado','E-mail'],['Maria Silva','(11) 98888-7777','Consórcio de imóvel','maria@email.com'],['João Souza','(15) 99999-1234','Carta de crédito','']]);
  ws['!cols'] = [{wch:26},{wch:18},{wch:26},{wch:26}];
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Contatos');
  XLSX.writeFile(wb, 'modelo-importar-contatos.xlsx');
}
async function baixarPlanilhaLeads(cards, nomeBase, formato){
  if(formato === 'csv'){ baixarCsv(cards, `${nomeBase}.csv`); return; }
  try{ await carregarBiblioteca('xlsx'); }catch(e){ errorMsg = e.message; renderApp(); return; }
  const dados = linhasDosLeads(cards);
  const ws = XLSX.utils.json_to_sheet(dados.length ? dados : [{ 'Nome':'' }]);
  ws['!cols'] = [{wch:28},{wch:16},{wch:26},{wch:12},{wch:13},{wch:16},{wch:12},{wch:20},{wch:15},{wch:13},{wch:40}];
  const rng = XLSX.utils.decode_range(ws['!ref']);
  for(let r=1; r<=rng.e.r; r++) for(const c of [3,4]){ const cel = ws[XLSX.utils.encode_cell({r, c})]; if(cel && typeof cel.v === 'number') cel.z = '"R$" #,##0.00'; }
  ws['!autofilter'] = { ref: ws['!ref'] };
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Contatos');
  XLSX.writeFile(wb, `${nomeBase}.xlsx`);
}
function baixarCsv(cards, nomeArquivo){
  const linhas = [['Nome','Telefone','Valor','Coluna','Temperatura','Início de contato','Mês de venda'].join(',')];
  cards.forEach(c=>{
    const col = board.columns.find(k=>k.id===c.columnId);
    linhas.push([
      `"${(c.cliente||'').replace(/"/g,'""')}"`,
      `"${(c.telefone||'').replace(/"/g,'""')}"`,
      c.valor||0,
      `"${col?col.nome.replace(/"/g,'""'):''}"`,
      c.temperatura||'',
      c.mesInicioContato||'',
      c.mes||'',
    ].join(','));
  });
  const blob = new Blob([linhas.join('\n')], { type:'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomeArquivo;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
function exportarCsv(formato){
  baixarPlanilhaLeads(cardsParaRelatorio(), `contatos_${currentMonthKey()}`, formato === 'csv' ? 'csv' : 'xlsx');
}
async function exportarRelatorioPdf(){
  try{ await carregarBiblioteca('jspdf'); }catch(e){ errorMsg = e.message; renderApp(); return; }
  const cardsRel = cardsParaRelatorio();
  const dados = relatoriosDadosMensais(6, cardsRel);
  const totalGanho = cardsRel.reduce((s,c)=>{ const col=board.columns.find(k=>k.id===c.columnId); return col&&col.tipo==='ganho' ? s+valorVendido(c) : s; },0);
  const totalPerdido = cardsRel.reduce((s,c)=>{ const col=board.columns.find(k=>k.id===c.columnId); return col&&col.tipo==='perdido' ? s+(Number(c.valor)||0) : s; },0);
  const porTemp = ['quente','morno','frio'].map(t=>({ temp:t, count: cardsRel.filter(c=>c.temperatura===t).length }));
  const funilNome = relatorioFunilId ? ((funis.find(f=>f.id===relatorioFunilId)||{}).nome || '') : 'Todos os funis';

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  let y = 20;
  doc.setFontSize(18);
  doc.text('Relatório — Livro-Caixa', 14, y); y += 7;
  doc.setFontSize(10);
  doc.setTextColor(120);
  doc.text(`${funilNome} — gerado em ${new Date().toLocaleDateString('pt-BR')}`, 14, y); y += 12;
  doc.setTextColor(20);

  doc.setFontSize(13);
  doc.text('Resumo', 14, y); y += 8;
  doc.setFontSize(11);
  doc.text(`Total ganho: ${fmtBRL(totalGanho)}`, 14, y); y += 6;
  doc.text(`Total perdido: ${fmtBRL(totalPerdido)}`, 14, y); y += 6;
  doc.text(`Total de contatos: ${cardsRel.length}`, 14, y); y += 12;

  doc.setFontSize(13);
  doc.text('Novos contatos por mês', 14, y); y += 8;
  doc.setFontSize(11);
  dados.forEach(d=>{
    doc.text(`${monthLabel(d.key)}: ${d.novos}`, 14, y); y += 6;
  });
  y += 6;

  doc.setFontSize(13);
  doc.text('Contatos por qualificação', 14, y); y += 8;
  doc.setFontSize(11);
  porTemp.forEach(t=>{
    doc.text(`${TEMPS[t.temp].label}: ${t.count}`, 14, y); y += 6;
  });

  doc.save(`relatorio_${currentMonthKey()}.pdf`);
}
function exportarLeads(formato){
  baixarPlanilhaLeads(filteredLeads(), `contatos_${currentMonthKey()}`, formato === 'csv' ? 'csv' : 'xlsx');
}
async function connectGoogleCalendar(){
  try{
    const data = await apiRequest('GET', '/calendar/connect-url');
    window.location.href = data.url;
  }catch(e){
    errorMsg = 'Não foi possível iniciar a conexão com a Google Agenda.';
    renderApp();
  }
}
async function disconnectGoogleCalendar(){
  try{
    await apiRequest('POST', '/calendar/disconnect');
    calendarConnected = false;
  }catch(e){
    errorMsg = 'Não foi possível desconectar da Google Agenda.';
  }
  renderApp();
}
function abrirBackupModal(){
  backupModalAberto = true;
  backupMsg = null;
  renderBackupModal();
}
function closeBackupModal(){
  backupModalAberto = false;
  const root = document.getElementById('modal-root');
  if(root) root.innerHTML = '';
}
function renderBackupModal(){
  const root = document.getElementById('modal-root');
  if(!backupModalAberto){ root.innerHTML=''; return; }
  root.innerHTML = `
    <div class="overlay" id="backup-modal-overlay">
      <div class="modal">
        <div class="modal-head">
          <h3>Backup dos seus dados</h3>
          <button id="backup-modal-close">✕</button>
        </div>
        <div class="modal-body">
          <p class="settings-page-note">Guarda ou restaura uma cópia de todos os seus clientes, tarefas, comissões, mensagens e configurações.</p>
          ${backupMsg ? `<p class="settings-page-msg ${backupMsg.tipo}">${esc(backupMsg.texto)}</p>` : ''}
          <div class="backup-opcoes-row" style="margin-top:14px;">
            <div class="backup-opcao-card">
              <div class="backup-opcao-titulo">⬇ Exportar</div>
              <p class="settings-page-note">Baixa um arquivo .json com tudo, pra guardar num lugar seguro (Google Drive, por exemplo).</p>
              <button class="btn-outline" id="backup-modal-exportar" ${backupGerando?'disabled':''}>${backupGerando?'Gerando…':'Baixar backup completo'}</button>
            </div>
            <div class="backup-opcao-card">
              <div class="backup-opcao-titulo">⬆ Importar</div>
              <p class="settings-page-note">Restaura a partir de um arquivo .json de backup — atualiza o que já existe e cria o que estiver faltando, sem apagar nada.</p>
              <input type="file" id="backup-import-input" accept="application/json" style="display:none;" />
              <button class="btn-outline" id="backup-modal-importar" ${backupImportando?'disabled':''}>${backupImportando?'Importando…':'Escolher arquivo e restaurar'}</button>
            </div>
          </div>
        </div>
        <div class="modal-foot">
          <span></span>
          <div class="modal-foot-actions">
            <button class="btn-outline" id="backup-modal-fechar">Fechar</button>
          </div>
        </div>
      </div>
    </div>
  `;
  document.getElementById('backup-modal-close').addEventListener('click', closeBackupModal);
  document.getElementById('backup-modal-fechar').addEventListener('click', closeBackupModal);
  document.getElementById('backup-modal-overlay').addEventListener('click', (e)=>{ if(e.target.id==='backup-modal-overlay') closeBackupModal(); });
  document.getElementById('backup-modal-exportar').addEventListener('click', baixarBackupCompleto);
  document.getElementById('backup-modal-importar').addEventListener('click', escolherArquivoBackup);
  document.getElementById('backup-import-input').addEventListener('change', (e)=>{
    const file = e.target.files[0];
    e.target.value = '';
    importarArquivoBackup(file);
  });
}
function escolherArquivoBackup(){
  const input = document.getElementById('backup-import-input');
  if(input) input.click();
}
async function importarArquivoBackup(file){
  if(!file) return;
  showConfirm({
    message: 'Restaurar esse backup? Isso atualiza clientes, tarefas e outros dados que já existirem com o mesmo identificador, e cria o que estiver faltando. Nada é apagado.',
    confirmLabel: 'Restaurar',
    danger: false,
    onConfirm: async ()=>{
      closeConfirm();
      backupImportando = true;
      backupMsg = null;
      renderApp();
      if(backupModalAberto) renderBackupModal();
      try{
        const texto = await file.text();
        const dados = JSON.parse(texto);
        const token = getToken();
        const res = await fetch(API_BASE + '/backup/importar-tudo', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
          body: JSON.stringify(dados),
        });
        const resposta = await res.json();
        if(!res.ok) throw new Error(resposta.error || 'Não foi possível importar o backup.');
        const totalOk = Object.values(resposta.resultado||{}).reduce((s,r)=>s+(r.ok||0),0);
        const totalErro = Object.values(resposta.resultado||{}).reduce((s,r)=>s+(r.erro||0),0);
        backupMsg = { tipo:'ok', texto: `Backup restaurado: ${totalOk} registro(s) atualizado(s)${totalErro?`, ${totalErro} com erro`:''}.` };
        // recarrega os dados principais da tela, já que podem ter mudado
        await Promise.all([loadBoard(), loadTasks(), loadContratos()]);
      }catch(e){
        backupMsg = { tipo:'erro', texto: e.message || 'Arquivo inválido ou erro ao importar.' };
      }
      backupImportando = false;
      renderApp();
      if(backupModalAberto) renderBackupModal();
    },
  });
}
async function baixarBackupCompleto(){
  if(backupGerando) return;
  backupGerando = true;
  backupMsg = null;
  renderApp();
  if(backupModalAberto) renderBackupModal();
  try{
    const token = getToken();
    const res = await fetch(API_BASE + '/backup/exportar-tudo', {
      headers: { 'Authorization': 'Bearer ' + token },
    });
    if(!res.ok) throw new Error('Não foi possível gerar o backup agora.');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `backup-painel-crm-${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }catch(e){
    backupMsg = { tipo:'erro', texto: e.message || 'Não foi possível gerar o backup agora.' };
  }
  backupGerando = false;
  renderApp();
  if(backupModalAberto) renderBackupModal();
}
async function verificarAtualizacaoApp(){
  verificandoAtualizacao = true;
  atualizacaoMsg = null;
  renderApp();
  try{
    if('serviceWorker' in navigator){
      const reg = await navigator.serviceWorker.getRegistration();
      if(reg) await reg.update();
    }
    atualizacaoMsg = { tipo:'ok', texto:'Tudo certo! Recarregando a página...' };
    renderApp();
    setTimeout(()=>{ window.location.reload(); }, 700);
  }catch(e){
    atualizacaoMsg = { tipo:'erro', texto:'Não foi possível verificar agora. Tenta fechar e abrir o app de novo.' };
    verificandoAtualizacao = false;
    renderApp();
  }
}
async function syncCalendarNow(){
  if(calendarSyncing) return;
  calendarSyncing = true;
  renderApp();
  try{
    await apiRequest('POST', '/tasks/sync-calendar');
    await loadTasks();
    if(currentPage==='tarefas') await loadAgendaMes(agendaMesAtual); // busca de novo os eventos do Google pro mês em tela
  }catch(e){
    errorMsg = e.message || 'Não foi possível sincronizar com a Google Agenda agora.';
  }
  calendarSyncing = false;
  renderApp();
}
function tratarRetornoDoGoogle(){
  const params = new URLSearchParams(window.location.search);
  const status = params.get('calendar');
  if(!status) return;
  if(status === 'conectado'){ calendarConnected = true; }
  else if(status === 'erro'){ errorMsg = 'Não foi possível conectar com a Google Agenda. Tente novamente.'; }
  window.history.replaceState({}, '', window.location.pathname);
}

/* ---------- derivações (Pipeline) ---------- */
function monthsList(){
  const set = new Set([currentMonthKey(), ...board.cards.map(c=>c.mesInicioContato).filter(Boolean).map(d=>d.slice(0,7))]);
  return Array.from(set).sort((a,b)=> a<b?1:-1);
}
function visibleCards(){
  let cards = filterMonth ? board.cards.filter(c=>c.mesInicioContato && c.mesInicioContato.slice(0,7)===filterMonth) : board.cards;
  cards = cards.filter(c=>!c.arquivado);
  if(filtroEsfriando){
    const limite = Date.now() - 7*24*60*60*1000;
    cards = cards.filter(c=>{
      const col = board.columns.find(k=>k.id===c.columnId);
      if(!col || col.tipo!=='aberto') return false;
      const att = c.updatedAt ? new Date(c.updatedAt).getTime() : 0;
      return att < limite;
    });
  }
  return cards;
}
function cardsOf(colId){ return visibleCards().filter(c=>c.columnId===colId).sort((a,b)=> (a.ordem||0) - (b.ordem||0)); }
// valor de uma venda ganha: o valor final do fechamento (com desconto), se já foi feito
function valorVendido(c){ return c.fechamento && !c.fechamento.cancelado && Number.isFinite(Number(c.fechamento.valorFinal)) ? Number(c.fechamento.valorFinal) : (Number(c.valor)||0); }
// o valor do card mudou depois do fechamento (a venda continua valendo)
function valorMudouDepoisDoFechamento(c){ return !!(c && c.fechamento && !c.fechamento.cancelado && Math.round((Number(c.valor)||0)*100) !== Math.round((Number(c.fechamento.valorOriginal)||0)*100)); }
function sumByTipo(tipo){
  return visibleCards().reduce((s,c)=>{
    const col = board.columns.find(k=>k.id===c.columnId);
    return (col && col.tipo===tipo && col.funilId===funilAtualId) ? s + (tipo==='ganho' ? valorVendido(c) : (Number(c.valor)||0)) : s;
  },0);
}
function countByTipo(tipo){
  return visibleCards().filter(c=>{
    const col = board.columns.find(k=>k.id===c.columnId);
    return col && col.tipo===tipo && col.funilId===funilAtualId;
  }).length;
}
function quentesAtivos(){
  return visibleCards().filter(c=>{
    const col = board.columns.find(k=>k.id===c.columnId);
    return col && col.tipo==='aberto' && col.funilId===funilAtualId && c.temperatura==='quente';
  }).length;
}
function cardsDoFunilAtual(){
  return visibleCards().filter(c=>{
    const col = board.columns.find(k=>k.id===c.columnId);
    return col && col.funilId===funilAtualId;
  });
}
function ticketMedioFunil(){
  const cards = cardsDoFunilAtual();
  if(!cards.length) return 0;
  const total = cards.reduce((s,c)=> s + (c.fechamento ? valorVendido(c) : (Number(c.valor)||0)), 0); // venda fechada conta pelo valor final
  return total / cards.length;
}

/* ---------- derivações (Dashboard) ---------- */
function periodRange(period){
  const end = new Date();
  const start = new Date();
  if(period === '7dias') start.setDate(start.getDate() - 6);
  else if(period === 'mes') start.setDate(start.getDate() - 29);
  else if(period === 'trimestre') start.setDate(start.getDate() - 89);
  else start.setDate(start.getDate() - 364); // ano
  start.setHours(0,0,0,0);
  return { start, end };
}
function cardsInPeriod(){
  const { start, end } = periodRange(dashboardPeriod);
  return board.cards.filter(c=>{
    if(!c.createdAt) return false;
    const d = new Date(c.createdAt);
    return d >= start && d <= end;
  });
}
function vendidoNoMesAtual(){
  const mesAtual = currentMonthKey();
  return board.cards.reduce((s,c)=>{
    const col = board.columns.find(k=>k.id===c.columnId);
    return (col && col.tipo==='ganho' && String(c.mes||'').slice(0,7)===mesAtual) ? s + valorVendido(c) : s;
  }, 0);
}
async function loadMetaVendas(){
  try{
    const data = await apiRequest('GET', `/metas/${currentMonthKey()}`);
    metaVendasValor = data.valorMeta || 0;
  }catch(e){
    metaVendasValor = 0;
  }
  metaVendasCarregada = true;
  renderApp();
}
async function salvarMetaVendas(){
  const input = document.getElementById('meta-vendas-input');
  const valor = input ? (parseFloat(input.value) || 0) : 0;
  try{
    await apiRequest('PUT', `/metas/${currentMonthKey()}`, { valorMeta: valor });
    metaVendasValor = valor;
  }catch(e){
    errorMsg = 'Não foi possível salvar a meta.';
  }
  editandoMetaVendas = false;
  renderApp();
}
async function loadMetaVendasEquipe(){
  try{
    const data = await apiRequest('GET', `/equipe/meta-vendas/${currentMonthKey()}`);
    metaVendasEquipeValor = data.valorMeta || 0;
    metaVendasEquipeVendido = data.vendidoNoMes || 0;
  }catch(e){
    metaVendasEquipeValor = 0;
    metaVendasEquipeVendido = 0;
  }
  metaVendasEquipeCarregada = true;
  renderApp();
}
async function salvarMetaVendasEquipe(){
  const input = document.getElementById('meta-vendas-equipe-input');
  const valor = input ? (parseFloat(input.value) || 0) : 0;
  try{
    await apiRequest('PUT', `/equipe/meta-vendas/${currentMonthKey()}`, { valorMeta: valor });
    metaVendasEquipeValor = valor;
  }catch(e){
    errorMsg = 'Não foi possível salvar a meta da equipe.';
  }
  editandoMetaVendasEquipe = false;
  renderApp();
}
function dashMetrics(){
  const cards = cardsInPeriod();
  let emNegociacaoValor=0, emNegociacaoCount=0, ganhoValor=0, ganhoCount=0, perdidoCount=0;
  cards.forEach(c=>{
    const col = board.columns.find(k=>k.id===c.columnId);
    if(!col) return;
    if(col.tipo === 'aberto'){ emNegociacaoValor += Number(c.valor)||0; emNegociacaoCount++; }
    else if(col.tipo === 'ganho'){ ganhoValor += valorVendido(c); ganhoCount++; }
    else if(col.tipo === 'perdido'){ perdidoCount++; }
  });
  const fechados = ganhoCount + perdidoCount;
  const conversao = fechados > 0 ? Math.round((ganhoCount/fechados)*100) : 0;
  return { novosLeads: cards.length, emNegociacaoValor, emNegociacaoCount, ganhoValor, ganhoCount, conversao };
}
function stageTotals(){
  return board.columns.map(col=>{
    const total = board.cards.filter(c=>c.columnId===col.id).reduce((s,c)=> s+(col.tipo==='ganho' ? valorVendido(c) : (Number(c.valor)||0)), 0);
    return { col, total };
  });
}
function leadsPorPeriodoBuckets(){
  const { start, end } = periodRange(dashboardPeriod);
  const cards = cardsInPeriod();
  const totalDays = Math.max(1, Math.round((end-start)/86400000)+1);
  const bucketDays = totalDays > 40 ? 7 : 1;
  const buckets = [];
  for(let t=new Date(start); t<=end; t.setDate(t.getDate()+bucketDays)){
    buckets.push({ date:new Date(t), count:0 });
  }
  if(!buckets.length) buckets.push({ date:new Date(start), count:0 });
  cards.forEach(c=>{
    const d = new Date(c.createdAt);
    for(let i=buckets.length-1;i>=0;i--){
      if(d >= buckets[i].date){ buckets[i].count++; break; }
    }
  });
  return buckets;
}
function renderLeadsChart(){
  const buckets = leadsPorPeriodoBuckets();
  if(!buckets.some(b=>b.count>0)){
    return `<p class="chart-empty">Nenhum contato novo nesse período ainda.</p>`;
  }
  const w=720, h=220, padL=32, padR=12, padT=12, padB=26;
  const innerW = w-padL-padR, innerH = h-padT-padB;
  const maxCount = Math.max(4, ...buckets.map(b=>b.count));
  const stepX = buckets.length>1 ? innerW/(buckets.length-1) : 0;
  const points = buckets.map((b,i)=>({
    x: padL + stepX*i,
    y: padT + innerH - (b.count/maxCount)*innerH,
    b,
  }));
  const path = points.map((p,i)=> (i===0?'M':'L')+p.x.toFixed(1)+' '+p.y.toFixed(1)).join(' ');
  const yTicks = 4;
  const yLabels = Array.from({length:yTicks+1}, (_,i)=> Math.round(maxCount - (maxCount/yTicks)*i));
  const xLabelEvery = Math.max(1, Math.ceil(buckets.length/8));
  return `
    <div class="chart-wrap">
      <svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
        ${yLabels.map((v,i)=>{
          const y = padT + (innerH/yTicks)*i;
          return `<line x1="${padL}" y1="${y}" x2="${w-padR}" y2="${y}" stroke="var(--line)" stroke-width="1"/><text x="${padL-8}" y="${y+4}" font-size="10" fill="var(--ink-soft)" text-anchor="end">${v}</text>`;
        }).join('')}
        <path d="${path}" fill="none" stroke="var(--accent)" stroke-width="2"/>
        ${points.map(p=>`<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="2.5" fill="var(--accent)"/>`).join('')}
        ${points.map((p,i)=> i % xLabelEvery === 0 ? `<text x="${p.x.toFixed(1)}" y="${h-6}" font-size="9" fill="var(--ink-soft)" text-anchor="middle">${p.b.date.getDate()}/${p.b.date.getMonth()+1}</text>` : '').join('')}
      </svg>
    </div>
  `;
}

/* ---------- comissões: cálculo e derivações ---------- */
const ESCOPOS = {
  Pessoal: { label:'Pessoal', color:'var(--ink-soft)', bg:'var(--badge-neutral-bg)' },
  Empresa: { label:'Empresa', color:'#FFFFFF',         bg:'var(--accent)' },
};
const REGRAS_COMISSAO_FALLBACK_NOMES = { padrao:'Padrão' };
// Gera as <option> de tipo de produto a partir das regras de comissão carregadas — usado
// tanto no formulário do lead quanto no modal de contrato. Enquanto as regras ainda não
// carregaram (ou pra um valor salvo que não bate com nenhuma regra atual, ex: regra
// excluída depois), garante que a opção escolhida sempre apareça, sem sumir do <select>.
// Confere se a regra desse tipo de produto marca o mês como independente do lead — olha
// as regras carregadas do servidor (enquanto não carregaram, considera que não).
function mesIndependenteDoTipo(tipoProduto){
  const regra = regrasComissao.find(r=>r.chave===tipoProduto);
  return !!(regra && regra.mesIndependente);
}
function textoNotaMesContrato(tipoProduto){
  return mesIndependenteDoTipo(tipoProduto)
    ? 'Essa regra marca o mês como independente (pra pagamentos que podem demorar a acontecer) — mudar o mês aqui não altera o mês do contato.'
    : 'Mudar o mês aqui também atualiza o mês do contato (e vice-versa) — a não ser que a regra desse tipo marque o mês como independente.';
}
// Produto/serviço que já vem escolhido num lead ou contrato novo: a 1ª regra de comissão
// do usuário (na ordem da engrenagem) — ou "padrao" enquanto as regras não carregaram.
function tipoProdutoPadrao(){
  return (regrasComissao[0] && regrasComissao[0].chave) || 'padrao';
}
function renderOpcoesTipoProduto(valorAtual){
  const lista = regrasComissao.length
    ? regrasComissao
    : Object.keys(REGRAS_COMISSAO_FALLBACK_NOMES).map(chave=>({ chave, nome: REGRAS_COMISSAO_FALLBACK_NOMES[chave] }));
  const opcoes = (valorAtual && !lista.some(r=>r.chave===valorAtual))
    ? [...lista, { chave: valorAtual, nome: valorAtual }]
    : lista;
  return opcoes.map(r=>`<option value="${esc(r.chave)}" ${r.chave===valorAtual?'selected':''}>${esc(r.nome)}</option>`).join('');
}
// Motor genérico por blocos — espelha exatamente o back-end (comissaoCalc.js:
// calcComissaoPorBlocos). Cada bloco é "N parcelas de X% do valor da venda cada". Serve tanto pra
// pré-visualizar um contrato quanto pra simular uma regra sendo editada na engrenagem.
function calcComissaoPorBlocosPreview(valorVenda, blocos){
  const valor = parseFloat(valorVenda) || 0;
  const lista = Array.isArray(blocos) && blocos.length ? blocos : [{ parcelas:1, percentual:0 }];
  return lista.map(b=>({
    parcelas: Math.max(1, parseInt(b.parcelas,10) || 1),
    value: Math.round(valor * (parseFloat(b.percentual)||0) * 100) / 100,
  }));
}
function resumoDeBlocosPreview(blocosCalculados){
  const total = blocosCalculados.reduce((s,b)=> s + b.value*b.parcelas, 0);
  const parcelas = blocosCalculados.reduce((s,b)=> s + b.parcelas, 0);
  const primeiro = blocosCalculados[0] || { parcelas:0, value:0 };
  const segundo = blocosCalculados[1];
  return { blocos:blocosCalculados, parcelas, parcelas1:primeiro.parcelas, value:primeiro.value, value2: segundo?segundo.value:0, total: Math.round(total*100)/100 };
}
// Regras padrão do sistema, só como fallback enquanto as regras do usuário ainda não
// carregaram do servidor (loadRegrasComissao) — assim que carregam, elas mandam.
const REGRAS_COMISSAO_FALLBACK = {
  padrao: [{ parcelas:1, percentual:0.05 }],
};
function calcComissaoPreviewPorTipo(valorVenda, tipoProduto){
  const regra = regrasComissao.find(r=>r.chave===tipoProduto);
  const blocos = regra ? regra.blocos : (REGRAS_COMISSAO_FALLBACK[tipoProduto] || [{ parcelas:1, percentual:0 }]);
  return resumoDeBlocosPreview(calcComissaoPorBlocosPreview(valorVenda, blocos));
}
function atualizarNotaCicloDeVenda(){
  const nota = document.getElementById('f-ciclo-venda-nota');
  if(!nota || !modalForm || modalForm.__isNew) return;
  const texto = textoCicloDeVenda(modalForm.mesInicioContato, modalForm.mes);
  nota.textContent = texto;
  nota.style.display = texto ? '' : 'none';
}
function monthsBetween(anchorYM, targetYM){
  const [ay,am] = anchorYM.split('-').map(Number);
  const [ty,tm] = targetYM.split('-').map(Number);
  return (ty-ay)*12 + (tm-am);
}
// Descreve o tempo entre o início do contato e o mês de venda, pra dar uma noção
// rápida do ciclo de venda daquele cliente direto no formulário.
// Leads bem antigos podem ter "mes"/"mesInicioContato" guardados como "YYYY-MM" (de
// antes de existir o dia) — um <input type="date"> não consegue exibir isso e mostra
// vazio, mas a string ainda existe e conta como "preenchida" em qualquer checagem
// direta. Isso normaliza pro dia 1 daquele mês, deixando a exibição e os cálculos
// consistentes com o valor de verdade salvo.
function normalizarData(valor){
  if(!valor) return '';
  if(/^\d{4}-\d{2}-\d{2}$/.test(valor)) return valor;
  if(/^\d{4}-\d{2}$/.test(valor)) return `${valor}-01`;
  return valor;
}
function textoCicloDeVenda(mesInicio, mesVenda){
  mesInicio = normalizarData(mesInicio);
  mesVenda = normalizarData(mesVenda);
  if(!mesInicio) return '';
  if(!mesVenda) return '🟡 Ciclo aberto — ainda não fechou.';
  const diferenca = monthsBetween(mesInicio, mesVenda);
  if(diferenca < 0) return '⚠️ A data de venda é anterior ao início do contato — confira as datas.';
  if(diferenca === 0) return '🔵 Ciclo de venda: fechou no mesmo mês do primeiro contato.';
  return `🔵 Ciclo de venda: ${diferenca} ${diferenca===1?'mês':'meses'} até fechar.`;
}
function addMonthsKey(ym, delta){
  const [y,m] = ym.split('-').map(Number);
  const d = new Date(y, m-1+delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}
// Descobre o valor da parcela de índice "idx" (0 = primeira) dentro de um contrato,
// percorrendo os blocos da regra em ordem até achar em qual bloco esse índice cai.
// Contratos criados antes das regras editáveis não têm "blocos" detalhado — pra esses,
// cai no formato antigo de até 2 blocos (parcelas1/value + value2).
function parcelaValue(c, idx){
  if(Array.isArray(c.blocos) && c.blocos.length){
    let acumulado = 0;
    for(const b of c.blocos){
      if(idx < acumulado + b.parcelas) return b.value;
      acumulado += b.parcelas;
    }
    return c.blocos[c.blocos.length-1].value;
  }
  return idx < c.parcelas1 ? c.value : c.value2;
}
// A partir de qual índice de parcela o contrato foi cancelado (Infinity = nunca cancelado)
function contratoIdxCancelamento(c){
  if(!c.canceladoNoMes) return Infinity;
  const anchor = (c.date||'').slice(0,7);
  return monthsBetween(anchor, c.canceladoNoMes);
}
function parcelaAtivaNoMes(c, idx){
  return idx >= 0 && idx < c.parcelas && idx < contratoIdxCancelamento(c);
}
function contratoTotal(c){
  let total = 0;
  const limite = Math.min(c.parcelas, contratoIdxCancelamento(c));
  for(let i=0;i<limite;i++) total += parcelaValue(c,i);
  return total;
}
function contratoRestante(c, fromIdx){
  let total = 0;
  const limite = Math.min(c.parcelas, contratoIdxCancelamento(c));
  for(let i=Math.max(0,fromIdx);i<limite;i++) total += parcelaValue(c,i);
  return total;
}
function comissoesStats(){
  const rowsMes = contratos.map(c=>{
    const anchor = (c.date||'').slice(0,7);
    const idx = monthsBetween(anchor, comissoesMonth);
    return parcelaAtivaNoMes(c, idx) ? { c, idx, value: parcelaValue(c, idx) } : null;
  }).filter(Boolean);
  const previstoMes = rowsMes.reduce((a,r)=> a+r.value, 0);
  const totalAtivo = contratos.reduce((a,c)=>{
    const anchor = (c.date||'').slice(0,7);
    const idx = monthsBetween(anchor, comissoesMonth);
    return a + contratoRestante(c, idx);
  }, 0);
  return { previstoMes, totalAtivo, total: contratos.length };
}

/* ---------- derivações (Leads) ---------- */
// Ordenação compartilhada entre Leads, Pipeline e Comissões. "data-inicio" e
// "data-venda" usam os campos que representam cada uma dessas datas em cada tela —
// leads/pipeline têm as duas (mesInicioContato/mes), comissões só tem uma (date).
const OPCOES_ORDENACAO = [
  ['padrao', 'Ordem padrão'],
  ['alfabetica', 'Ordem alfabética'],
  ['recentes', 'Adicionados recentemente'],
  ['data-inicio', 'Data de início de contato'],
  ['data-venda', 'Data de venda'],
];
// Botão de funil que abre um menu com a ordenação atual marcada e as outras opções —
// usado em Leads, Pipeline e Comissões. "menuId" identifica qual dos três é esse (só
// um fica aberto por vez), "rotuloPadrao" troca o texto da primeira opção conforme
// o contexto (no Pipeline, por exemplo, deixa claro que o padrão é a ordem manual),
// e "ocultarInicio" tira a opção de início de contato pra Comissões, que não tem
// esse campo.
function renderBotaoOrdenar(menuId, valorAtual, rotuloPadrao, ocultarInicio){
  const aberto = ordenarMenuAberto === menuId;
  let opcoes = rotuloPadrao ? [[OPCOES_ORDENACAO[0][0], rotuloPadrao], ...OPCOES_ORDENACAO.slice(1)] : OPCOES_ORDENACAO;
  if(ocultarInicio) opcoes = opcoes.filter(([val])=> val !== 'data-inicio');
  return `
    <div class="ordenar-wrap">
      <button type="button" class="icon-btn ${valorAtual!=='padrao'?'ordenar-ativo':''}" data-action="toggle-ordenar-menu" data-menu-id="${menuId}" title="Ordenar">${ICON_FUNNEL}</button>
      ${aberto ? `
        <div class="date-menu ordenar-menu">
          <div class="date-menu-title">Ordenar por</div>
          <div class="date-menu-list">
            ${opcoes.map(([val,label])=>`<button class="date-menu-item ${valorAtual===val?'active':''}" data-action="escolher-ordenar" data-menu-id="${menuId}" data-valor="${val}">${label}</button>`).join('')}
          </div>
        </div>
      ` : ''}
    </div>
  `;
}
function ordenarPorCriterio(lista, criterio, campoNome, campoInicio, campoVenda){
  if(criterio === 'alfabetica') return [...lista].sort((a,b)=> (a[campoNome]||'').localeCompare(b[campoNome]||'', 'pt-BR'));
  if(criterio === 'recentes') return [...lista].sort((a,b)=> new Date(b.createdAt||0) - new Date(a.createdAt||0));
  if(criterio === 'data-inicio') return [...lista].sort((a,b)=> String(a[campoInicio]||'').localeCompare(String(b[campoInicio]||'')));
  if(criterio === 'data-venda') return [...lista].sort((a,b)=> String(a[campoVenda]||'').localeCompare(String(b[campoVenda]||'')));
  return lista; // 'padrao' — não mexe na ordem
}
// Reordena de verdade (e salva) os cards de cada coluna do funil atual, conforme o
// critério escolhido. Como isso sobrescreve a ordem manual que a pessoa possa ter
// arrastado com cuidado, confirma antes — exceto ao voltar pra "padrao", que não
// mexe em nada, só para de aplicar ordenação automática daqui pra frente.
function aplicarOrdenacaoPipeline(criterio){
  if(criterio === 'padrao'){ pipelineOrdenarPor = 'padrao'; renderApp(); return; }
  showConfirm({ chave:'reordenar-auto',
    message: 'Isso vai reordenar automaticamente os clientes dentro de cada coluna. Se você tiver organizado numa ordem específica que funciona melhor pra você, ela será substituída. Continuar?',
    confirmLabel: 'Reordenar',
    danger: false,
    onConfirm: async ()=>{
      closeConfirm();
      pipelineOrdenarPor = criterio;
      pipelineOrdenando = true;
      renderApp();
      const colunasDoFunil = board.columns.filter(c=>c.funilId===funilAtualId);
      try{
        for(const col of colunasDoFunil){
          const cardsDaColuna = cardsOf(col.id);
          const ordenados = ordenarPorCriterio(cardsDaColuna, criterio, 'cliente', 'mesInicioContato', 'mes');
          await Promise.all(ordenados.map((card, i)=>{
            const novaOrdem = (i+1)*1000;
            card.ordem = novaOrdem; // otimista
            return apiRequest('PUT', `/cards/${card.id}/move`, { columnId: col.id, ordem: novaOrdem });
          }));
        }
      }catch(e){
        errorMsg = 'Não foi possível reordenar todos os clientes. Tenta de novo em instantes.';
      }
      pipelineOrdenando = false;
      renderApp();
    },
  });
}
/* ---------- contatos duplicados (mesmo telefone) ---------- */
// mesma chave do servidor (utils/telefone.js): só dígitos, sem 55, sem o 9 extra do celular
function chaveTelefone(tel){
  let d = String(tel || '').replace(/\D/g, '');
  if((d.length === 12 || d.length === 13) && d.startsWith('55')) d = d.slice(2);
  if(d.length === 11 && d[2] === '9') d = d.slice(0, 2) + d.slice(3);
  return d.length === 10 ? d : null;
}
function gruposDuplicadosLocal(){
  const cont = new Map();
  board.cards.forEach(c=>{ if(c.arquivado) return; const k = chaveTelefone(c.telefone); if(k) cont.set(k, (cont.get(k) || 0) + 1); });
  return [...cont.values()].filter(n=> n > 1).length;
}
let duplicados = null; // { grupos, escolha: {chave: idQueFica}, juntando: chave|null, erro }
async function abrirDuplicadosModal(){
  duplicados = { grupos: null, escolha: {}, juntando: null, erro: '' };
  renderDuplicadosModal();
  try{
    const r = await apiRequest('GET', '/cards/duplicados');
    duplicados.grupos = r.grupos || [];
    duplicados.grupos.forEach(g=>{ duplicados.escolha[g.chave] = g.contatos[0].id; }); // o mais antigo fica, por padrão
  }catch(e){ duplicados.erro = e.message || 'Não foi possível procurar os duplicados.'; }
  renderDuplicadosModal();
}
function fecharDuplicadosModal(){
  duplicados = null;
  const root = document.getElementById('modal-root'); if(root) root.innerHTML = '';
}
function renderDuplicadosModal(){
  const root = document.getElementById('modal-root');
  if(!duplicados){ root.innerHTML = ''; return; }
  const d = duplicados;
  root.innerHTML = `
    <div class="overlay" id="dup-overlay">
      <div class="modal modal-lg" role="dialog" aria-modal="true" aria-labelledby="dup-titulo">
        <div class="modal-head"><h3 id="dup-titulo">Contatos duplicados</h3><button id="dup-fechar" aria-label="Fechar">✕</button></div>
        <div class="modal-body">
          <p class="settings-page-note" style="margin:0;">Contatos com o mesmo telefone. Escolha qual fica: o histórico, os anexos, as tarefas e as etiquetas dos outros passam para ele, e os outros vão para os arquivados.</p>
          ${d.erro ? `<p class="settings-page-msg erro">${esc(d.erro)}</p>` : ''}
          ${!d.grupos ? '<p class="settings-page-note">Procurando…</p>' : !d.grupos.length ? '<p class="dash-empty">Nenhum contato duplicado. Tudo certo!</p>' : d.grupos.map(g=>`
            <fieldset class="dup-grupo">
              <legend>${esc(g.contatos[0].telefone || g.chave)} · ${g.contatos.length} contatos</legend>
              ${g.contatos.map(c=>`
                <label class="dup-opcao">
                  <input type="radio" name="dup-${g.chave}" value="${c.id}" data-dup-chave="${g.chave}" ${d.escolha[g.chave]===c.id?'checked':''} />
                  <span><b>${esc(c.cliente || 'Sem nome')}</b><small>${esc(c.etapa || '—')} · ${fmtBRL(c.valor)} · desde ${new Date(c.criadoEm).toLocaleDateString('pt-BR')}${c.etiquetas.length ? ' · ' + c.etiquetas.map(esc).join(', ') : ''}</small></span>
                </label>`).join('')}
              <button type="button" class="btn-primary" data-dup-juntar="${g.chave}" ${d.juntando ? 'disabled' : ''}>${d.juntando===g.chave ? 'Juntando…' : 'Juntar neste'}</button>
            </fieldset>`).join('')}
        </div>
      </div>
    </div>`;
  document.getElementById('dup-fechar').addEventListener('click', fecharDuplicadosModal);
  document.getElementById('dup-overlay').addEventListener('click', (e)=>{ if(e.target.id === 'dup-overlay') fecharDuplicadosModal(); });
  root.querySelectorAll('[data-dup-chave]').forEach(r=> r.addEventListener('change', ()=>{ d.escolha[r.dataset.dupChave] = r.value; }));
  root.querySelectorAll('[data-dup-juntar]').forEach(b=> b.addEventListener('click', ()=> juntarDuplicados(b.dataset.dupJuntar)));
}
async function juntarDuplicados(chave){
  const d = duplicados; if(!d || d.juntando) return;
  const g = d.grupos.find(x=> x.chave === chave); if(!g) return;
  const manterId = d.escolha[chave];
  const juntarIds = g.contatos.map(c=> c.id).filter(id=> id !== manterId);
  const fica = g.contatos.find(c=> c.id === manterId);
  if(!(await confirmarAcao({ titulo:'Juntar contatos?', mensagem:`${juntarIds.length === 1 ? 'O outro contato vai' : `Os outros ${juntarIds.length} contatos vão`} para os arquivados, e tudo deles passa para "${fica ? fica.cliente : ''}".`, botao:'Juntar', perigo:false, sempre:true }))) return;
  d.juntando = chave; d.erro = ''; renderDuplicadosModal();
  try{
    await apiRequest('POST', '/cards/unificar', { manterId, juntarIds });
    d.grupos = d.grupos.filter(x=> x.chave !== chave);
    await loadBoard();
    renderApp();
  }catch(e){ d.erro = e.message || 'Não foi possível juntar.'; }
  d.juntando = null;
  if(duplicados) renderDuplicadosModal();
}

function filteredLeads(){
  let list = board.cards;
  list = list.filter(c=> mostrarArquivados ? c.arquivado : !c.arquivado);
  if(leadsStatusFilter) list = list.filter(c=>c.columnId===leadsStatusFilter);
  if(leadsSearch.trim()){
    const q = leadsSearch.trim().toLowerCase();
    list = list.filter(c=> (c.cliente||'').toLowerCase().includes(q) || (c.telefone||'').toLowerCase().includes(q));
  }
  list = ordenarPorCriterio(list, leadsOrdenarPor, 'cliente', 'mesInicioContato', 'mes');
  return list;
}

/* ---------- navegação entre páginas ---------- */
function goToPage(page){
  if(currentPage === page) return;
  if(atuandoComo && !PAGINAS_ATUANDO_COMO.includes(page)){
    errorMsg = 'Essa página não está disponível enquanto você atua no funil de ' + atuandoComo.nome + '. Clique em "Sair do funil" para voltar ao seu.';
    sidebarOpen = false;
    renderApp();
    return;
  }
  // se o gestor estiver vendo o dashboard de outro membro e navegar pra qualquer
  // outra página (não só clicando em "Voltar"), restaura os próprios dados antes —
  // sem isso, ele acabaria vendo os leads/tarefas de outra pessoa numa tela como o
  // Pipeline, que permite editar de verdade
  if(visualizandoDashboardDe && page !== 'dashboard'){
    if(boardBackupGestor) board = boardBackupGestor;
    if(tasksBackupGestor) tasks = tasksBackupGestor;
    if(metaVendasValorBackupGestor !== null) metaVendasValor = metaVendasValorBackupGestor;
    boardBackupGestor = null;
    tasksBackupGestor = null;
    metaVendasValorBackupGestor = null;
    visualizandoDashboardDe = null;
  }
  if(page === 'configuracoes' && currentPage !== 'configuracoes') configMobileConteudo = false;
  currentPage = page;
  dateMenuOpen = false;
  openMenuColId = null;
  addingCol = false;
  editingColId = null;
  sidebarOpen = false;
  // fecha qualquer modal que tenha ficado aberto na página anterior — vários modais
  // diferentes (dia da agenda, editar lead, tarefa, contrato, proposta, etc.) usam o
  // mesmo #modal-root; sem isso, um modal esquecido aberto ficava por cima da nova
  // página, escondido mas ainda funcionando, respondendo a cliques que pareciam ser
  // da página nova.
  modalForm = null;
  extrasTela = null;
  agendaDiaSelecionado = null;
  taskModalForm = null;
  propostaModalForm = null;
  completarLeadModalForm = null;
  eventoGoogleModalForm = null;
  contratoModalForm = null;
  regrasModalAberto = false;
  regraEditForm = null;
  automacaoModalForm = null;
  fluxoModalForm = null;
  modalAlterarNomeAberto = false;
  modalAlterarSenhaAberto = false;
  modalEditarPerfilAberto = false;
  avatarLightboxAberto = false;
  document.getElementById('modal-root').innerHTML = '';
  renderApp();
  if(page === 'tarefas'){
    if(!agendaLoaded) loadAgendaMes(agendaMesAtual); // só busca do zero — depois disso, a tela se mantém atualizada sozinha com as próprias ações, e o Google só é consultado de novo no botão "Sincronizar Agenda"
  }
  if(page === 'configuracoes'){
    senhaMsg = null; senhaAtualVal = ''; senhaNovaVal = '';
    nomeMsg = null; nomeNovoVal = (currentUser && currentUser.nome) || '';
    logoutAllMsg = null;
    avatarMsg = null;
    importResultado = null;
    twoFactorSetup = null; twoFactorMsg = null; mostrarDesativar2FA = false;
    auditoriaCarregada = false;
    loadAuditoria();
    refreshCurrentUser();
    loadIcsStatus();
  }
  if(page === 'equipe'){
    equipeMsg = null;
    if(equipe){
      if(equipeSubTab==='chat' && !chatLoaded) loadChat();
      if(equipeSubTab==='supervisao' && equipe.souSupervisor && !supervisaoLoaded) loadSupervisao();
      if(equipeSubTab==='monitoramento' && equipe.souSupervisorDeDados && !monitoramentoLoaded) loadMonitoramento();
    }
  }
  if(page === 'comissoes'){
    loadContratos(); // recarrega sempre, pra pegar comissões que o Pipeline gerou automaticamente
    if(!regrasComissaoLoaded) loadRegrasComissao();
  }
}
async function refreshCurrentUser(){
  try{
    const data = await apiRequest('GET', '/auth/me');
    currentUser = data.user;
    localStorage.setItem('user', JSON.stringify(currentUser));
    renderApp();
  }catch(e){ /* mantém os dados já em cache */ }
}

/* ---------- mutações: colunas e cards (cada uma fala com a API) ---------- */
// Anima os cards deslizando pra nova posição em vez de "pularem" — como a página é
// redesenhada por completo a cada ação (o jeito como o app inteiro funciona), o
// elemento antigo é destruído e um novo nasce direto na posição final. Pra dar a
// sensação de movimento mesmo assim, guardamos onde cada card estava ANTES de
// redesenhar; depois, no card novo (já na posição certa), aplicamos um deslocamento
// que o faz parecer que ainda está na posição antiga, e removemos esse deslocamento
// com uma transição suave — o efeito visual é de o card escorregando até o lugar novo.
function capturarPosicoes(seletor){
  const posicoes = new Map();
  document.querySelectorAll(seletor).forEach(el=>{
    posicoes.set(el.dataset.cardId || el.dataset.colId, el.getBoundingClientRect());
  });
  return posicoes;
}
function animarComFlip(seletor, posicoesAntigas, idParaExcluir){
  document.querySelectorAll(seletor).forEach(el=>{
    const chave = el.dataset.cardId || el.dataset.colId;
    if(idParaExcluir && chave===idParaExcluir) return; // esse aqui vai ganhar sua própria animação (fade), não o deslize
    const antiga = posicoesAntigas.get(chave);
    if(!antiga) return; // elemento novo (não existia antes) — nasce direto no lugar, sem animação
    const nova = el.getBoundingClientRect();
    const z = (window.zoomDaTela ? window.zoomDaTela() : 1);
    const dx = (antiga.left - nova.left) / z;
    const dy = (antiga.top - nova.top) / z;
    if(Math.abs(dx) < 1 && Math.abs(dy) < 1) return; // não mudou de lugar de verdade
    el.style.transition = 'none';
    el.style.transform = `translate(${dx}px, ${dy}px)`;
    requestAnimationFrame(()=>{
      el.style.transition = 'transform .28s ease';
      el.style.transform = '';
      setTimeout(()=>{ el.style.transition = ''; }, 300); // devolve o controle pra transição normal do CSS (sombra, opacidade, margem)
    });
  });
}
function capturarPosicoesDosCards(){ return capturarPosicoes('.card[data-card-id]'); }
async function moveCard(cardId, columnId, ordem, opcoes){
  const card = board.cards.find(c=>c.id===cardId);
  if(!card) return;
  if(card.columnId===columnId && ordem===undefined) return; // mesma coluna e sem posição nova pra aplicar — nada a fazer
  const anterior = { columnId: card.columnId, ordem: card.ordem };

  // guarda a posição vertical de origem, pra comparar com a de chegada depois do
  // redesenho e decidir a direção certa da animação (pra cima, pra baixo, ou parado)
  const elAntigo = document.querySelector(`.card[data-card-id="${cardId}"]`);
  const topAntigo = elAntigo ? elAntigo.getBoundingClientRect().top : null;
  if(elAntigo){
    elAntigo.classList.add('card-saindo'); // fade simples na saída — a direção certa só dá pra saber depois, na chegada
    await new Promise(resolve=> setTimeout(resolve, 150));
  }

  const posicoesAntigas = capturarPosicoesDosCards();
  card.columnId = columnId; // otimista
  if(ordem!==undefined) card.ordem = ordem;
  renderAppPreservandoScroll();
  animarComFlip('.card[data-card-id]', posicoesAntigas, cardId); // desliza os outros cards que abriram espaço; o card movido fica de fora, ganha a animação de chegada abaixo

  const elNovo = document.querySelector(`.card[data-card-id="${cardId}"]`);
  if(elNovo){
    const topNovo = elNovo.getBoundingClientRect().top;
    if(topAntigo==null || Math.abs(topNovo - topAntigo) < 6){
      elNovo.classList.add('card-chegando'); // não mudou de posição vertical de forma perceptível — só fade
    } else if(topNovo < topAntigo){
      elNovo.classList.add('card-chegando-cima'); // subiu — entra vindo de baixo pra cima
    } else {
      elNovo.classList.add('card-chegando-baixo'); // desceu — entra vindo de cima pra baixo
    }
  }

  try{
    const dados = { columnId };
    if(ordem!==undefined) dados.ordem = ordem;
    await apiRequest('PUT', `/cards/${cardId}/move`, dados);
  }catch(e){
    card.columnId = anterior.columnId;
    card.ordem = anterior.ordem;
    errorMsg = 'Não foi possível mover o cliente. Tente novamente.';
    renderAppPreservandoScroll();
    return;
  }
  // entrou numa coluna de ganho: pede o fechamento da venda (valor final e parcelas)
  if(!(opcoes && opcoes.semFechamento) && typeof talvezPedirFechamento === 'function') talvezPedirFechamento(card, anterior.columnId);
}
// Calcula em que posição um card deve entrar dentro de uma coluna, olhando pra qual
// altura (y) o dedo/mouse está — encontra os dois cards vizinhos naquele ponto e usa o
// valor do meio entre as ordens deles, sem precisar reajustar a ordem de mais ninguém.
// Usada tanto pra mostrar o indicador visual (durante o arrastar) quanto pra calcular
// a ordem de verdade (ao soltar) — as duas usam exatamente a mesma lógica, garantindo
// que o que aparece na tela bate com o que realmente vai acontecer ao soltar.
function encontrarIndiceDeInsercao(cardEls, y){
  let indiceInsercao = cardEls.length;
  for(let i=0;i<cardEls.length;i++){
    const rect = cardEls[i].getBoundingClientRect();
    if(y < rect.top + rect.height/2){ indiceInsercao = i; break; }
  }
  return indiceInsercao;
}
function calcularOrdemDeInsercao(colEl, y, cardIdSendoMovido){
  const cardEls = [...colEl.querySelectorAll('.card')].filter(el=> el.dataset.cardId !== cardIdSendoMovido);
  if(!cardEls.length) return 1000;
  // zera qualquer resto de transform/transição de uma animação de deslize anterior
  // que ainda possa estar em andamento — sem isso, a posição lida pode ser a de
  // um quadro intermediário da animação, não a posição final de descanso do card.
  cardEls.forEach(el=>{ el.style.transition = 'none'; el.style.transform = ''; });
  const indiceInsercao = encontrarIndiceDeInsercao(cardEls, y);
  const cardAntes = indiceInsercao > 0 ? board.cards.find(c=>c.id===cardEls[indiceInsercao-1].dataset.cardId) : null;
  const cardDepois = indiceInsercao < cardEls.length ? board.cards.find(c=>c.id===cardEls[indiceInsercao].dataset.cardId) : null;
  const ordemAntes = cardAntes ? (cardAntes.ordem||0) : null;
  const ordemDepois = cardDepois ? (cardDepois.ordem||0) : null;
  if(ordemAntes!=null && ordemDepois!=null) return (ordemAntes + ordemDepois) / 2;
  if(ordemAntes!=null) return ordemAntes + 1000;
  if(ordemDepois!=null) return ordemDepois - 1000;
  return 1000;
}
// Mostra visualmente onde o card vai encaixar — abre um espaço acima do card que ficaria
// logo depois dele (ou embaixo do último, se for pro final da lista), imitando o efeito
// de "os cards se abrem" pedido: um sobe, o espaço aparece, o card entra ali.
function mostrarIndicadorDeInsercao(colEl, y, cardIdSendoMovido){
  limparIndicadorDeInsercao();
  const cardEls = [...colEl.querySelectorAll('.card')].filter(el=> el.dataset.cardId !== cardIdSendoMovido);
  if(!cardEls.length) return;
  const indiceInsercao = encontrarIndiceDeInsercao(cardEls, y);
  if(indiceInsercao < cardEls.length) cardEls[indiceInsercao].classList.add('card-indicador-antes');
  else cardEls[cardEls.length-1].classList.add('card-indicador-depois');
}
function limparIndicadorDeInsercao(){
  document.querySelectorAll('.card-indicador-antes, .card-indicador-depois').forEach(el=>{
    el.classList.remove('card-indicador-antes', 'card-indicador-depois');
  });
}

async function deleteCardById(id){
  const idx = board.cards.findIndex(c=>c.id===id);
  if(idx===-1) return;
  const [removido] = board.cards.splice(idx,1);
  renderApp();
  try{
    await apiRequest('DELETE', `/cards/${id}`);
  }catch(e){
    board.cards.splice(idx,0,removido);
    errorMsg = 'Não foi possível excluir o cliente.';
    renderApp();
  }
}

function toggleSelecaoLead(id){
  if(leadsSelecionados.has(id)) leadsSelecionados.delete(id);
  else leadsSelecionados.add(id);
  renderApp();
}
function toggleSelecionarTodosLeads(idsVisiveis){
  const todosJaSelecionados = idsVisiveis.length>0 && idsVisiveis.every(id=>leadsSelecionados.has(id));
  if(todosJaSelecionados) idsVisiveis.forEach(id=>leadsSelecionados.delete(id));
  else idsVisiveis.forEach(id=>leadsSelecionados.add(id));
  renderApp();
}
async function bulkMoverLeads(columnId){
  if(!columnId || !leadsSelecionados.size) return;
  const ids = [...leadsSelecionados];
  leadsSelecionados.clear();
  renderApp();
  await Promise.all(ids.map(id=> moveCard(id, columnId, undefined, { semFechamento:true }))); // em lote: o selo "falta o fechamento" fica pra cada um
}
async function bulkArquivarLeads(){
  const ids = [...leadsSelecionados];
  leadsSelecionados.clear();
  renderApp();
  await Promise.all(ids.map(async (id)=>{
    try{
      const atualizado = await apiRequest('PUT', `/cards/${id}/arquivar`);
      const idx = board.cards.findIndex(c=>c.id===id);
      if(idx>-1) board.cards[idx] = atualizado;
    }catch(e){ /* segue tentando os outros mesmo se um falhar */ }
  }));
  renderApp();
}
async function bulkExcluirLeads(){
  const ids = [...leadsSelecionados];
  leadsSelecionados.clear();
  for(const id of ids) await deleteCardById(id);
}
function confirmarBulkEtiqueta(){
  const valor = leadsBulkEtiquetaValor;
  leadsBulkEtiquetaAberta = false;
  leadsBulkEtiquetaValor = '';
  bulkEtiquetaLeads(valor);
}
async function bulkEtiquetaLeads(etiqueta){
  if(!etiqueta.trim()) return;
  const ids = [...leadsSelecionados];
  leadsSelecionados.clear();
  renderApp();
  await Promise.all(ids.map(async (id)=>{
    const card = board.cards.find(c=>c.id===id);
    if(!card) return;
    const etiquetasAtuais = card.etiquetas || [];
    if(etiquetasAtuais.includes(etiqueta.trim())) return;
    const novasEtiquetas = [...etiquetasAtuais, etiqueta.trim()];
    try{
      await apiRequest('PUT', `/cards/${id}`, { etiquetas: novasEtiquetas });
      card.etiquetas = novasEtiquetas;
    }catch(e){ /* segue tentando os outros mesmo se um falhar */ }
  }));
  renderApp();
}

async function renameColumn(id, nome){
  const col = board.columns.find(c=>c.id===id);
  if(!col) return;
  const nomeFinal = nome.trim() || col.nome;
  const anterior = col.nome;
  col.nome = nomeFinal;
  renderApp();
  try{
    await apiRequest('PUT', `/columns/${id}`, { nome: nomeFinal });
  }catch(e){
    col.nome = anterior;
    errorMsg = 'Não foi possível renomear a coluna.';
    renderApp();
  }
}

async function changeTipo(id, tipo){
  const col = board.columns.find(c=>c.id===id);
  if(!col) return;
  const anterior = col.tipo;
  col.tipo = tipo;
  openMenuColId = null;
  renderApp();
  try{
    await apiRequest('PUT', `/columns/${id}`, { tipo });
  }catch(e){
    col.tipo = anterior;
    errorMsg = 'Não foi possível alterar o tipo da coluna.';
    renderApp();
  }
}

async function deleteColumnById(id){
  const colIdx = board.columns.findIndex(c=>c.id===id);
  if(colIdx===-1) return;
  const [colRemovida] = board.columns.splice(colIdx,1);
  const cardsRemovidos = board.cards.filter(c=>c.columnId===id);
  board.cards = board.cards.filter(c=>c.columnId!==id);
  openMenuColId = null;
  renderApp();
  try{
    await apiRequest('DELETE', `/columns/${id}`);
  }catch(e){
    board.columns.splice(colIdx,0,colRemovida);
    board.cards.push(...cardsRemovidos);
    errorMsg = 'Não foi possível excluir a coluna.';
    renderApp();
  }
}

async function reorderColumns(draggedId, targetId){
  if(draggedId === targetId) return;
  const doFunil = board.columns.filter(c=>c.funilId===funilAtualId);
  const outras = board.columns.filter(c=>c.funilId!==funilAtualId);
  const fromIdx = doFunil.findIndex(c=>c.id===draggedId);
  const toIdx = doFunil.findIndex(c=>c.id===targetId);
  if(fromIdx===-1 || toIdx===-1) return;
  const anterior = [...board.columns];
  const posicoesAntigas = capturarPosicoes('.column[data-col-id]');
  const [movida] = doFunil.splice(fromIdx,1);
  doFunil.splice(toIdx,0,movida);
  board.columns = [...outras, ...doFunil];
  renderApp();
  animarComFlip('.column[data-col-id]', posicoesAntigas);
  try{
    await Promise.all(doFunil.map((col,idx)=> apiRequest('PUT', `/columns/${col.id}`, { ordem: idx })));
  }catch(e){
    board.columns = anterior;
    errorMsg = 'Não foi possível reordenar as colunas.';
    renderApp();
  }
}

async function addColumn(){
  const nome = newColNameVal.trim();
  const tipoEl = document.getElementById('new-col-tipo');
  const tipo = tipoEl ? tipoEl.value : 'aberto';
  addingCol = false;
  newColNameVal = '';
  newColTipoVal = 'aberto';
  if(!nome || !funilAtualId){ renderApp(); return; }
  try{
    const novaCol = await apiRequest('POST', '/columns', { nome, tipo, funilId: funilAtualId });
    board.columns.push(novaCol);
    renderApp();
    abrirPickerLeadsParaColuna(novaCol.id);
    return;
  }catch(e){
    errorMsg = 'Não foi possível criar a coluna.';
  }
  renderApp();
}

/* ---------- modo gestor: passar o lead pra outra pessoa da equipe ---------- */
function podeAtribuirLeads(){
  return !!(!atuandoComo && equipe && equipe.souSupervisor && (equipe.membros||[]).some(m=>!m.souEu));
}

async function saveCardFromModal(){
  if(salvandoCard) return; // já tem um salvamento em andamento — ignora cliques repetidos
  const nomeFinal = (modalForm.tipoPessoa==='juridica' ? modalForm.clienteJuridica : modalForm.clienteFisica) || '';
  if(!nomeFinal.trim()) return;
  const eraNovo = modalForm.__isNew;
  const colunaAntesDoSalvar = eraNovo ? null : ((board.cards.find(c=>c.id===modalForm.id)||{}).columnId || null);
  let cardSalvoId = eraNovo ? null : modalForm.id;
  const { __isNew, id, clienteFisica, clienteJuridica, __modoGestor, __atribuirParaId, ...dados } = modalForm;
  dados.cliente = nomeFinal.trim();
  // modo gestor: precisa escolher pra quem vai o lead
  const atribuindo = !!(__modoGestor && podeAtribuirLeads());
  if(atribuindo){
    if(!__atribuirParaId){
      errorMsg = 'Escolha para quem vai o contato.';
      renderModal();
      renderApp();
      return;
    }
    dados.atribuirParaId = __atribuirParaId;
  }
  salvandoCard = true;
  renderModal();
  let nomeDestino = null;
  try{
    if(__isNew){
      const novoCard = await apiRequest('POST', '/cards', dados);
      if(novoCard && novoCard.transferido){
        nomeDestino = novoCard.atribuidoParaNome; // o lead foi pra conta de outra pessoa: não entra no pipeline daqui
      } else {
        board.cards.push(novoCard);
        cardSalvoId = novoCard.id;
      }
    } else {
      const atualizado = await apiRequest('PUT', `/cards/${id}`, dados);
      const idx = board.cards.findIndex(c=>c.id===id);
      if(atualizado && atualizado.transferido){
        nomeDestino = atualizado.atribuidoParaNome;
        if(idx>-1) board.cards.splice(idx, 1); // saiu do meu pipeline
      } else if(idx>-1){
        board.cards[idx] = atualizado;
      }
    }
    salvandoCard = false;
    if(eraNovo || nomeDestino){
      // mostra "Novo lead adicionado" por cima do botão (fade in, sobe um pouco, fade
      // out) antes de fechar — assim a pessoa vê claramente que salvou, em vez de só
      // sumir a tela de repente sem confirmação nenhuma.
      mensagemSalvoCard = nomeDestino ? `Contato enviado para ${nomeDestino}` : 'Novo contato adicionado';
      renderModal();
      await new Promise(resolve=> setTimeout(resolve, 1300));
      mensagemSalvoCard = null;
    }
    closeModal();
    renderApp();
    const salvo = !nomeDestino && cardSalvoId ? board.cards.find(c=>c.id===cardSalvoId) : null;
    if(salvo && typeof talvezPedirFechamento === 'function') talvezPedirFechamento(salvo, colunaAntesDoSalvar);
  }catch(e){
    salvandoCard = false;
    errorMsg = atribuindo && e && e.message ? e.message : 'Não foi possível salvar o cliente.';
    renderModal();
    renderApp();
  }
}

/* ---------- mutações: tarefas ---------- */
async function saveTaskFromModal(){
  if(salvandoTask) return; // já tem um salvamento em andamento — ignora cliques repetidos
  if(!taskModalForm.titulo.trim()) return;
  const { __isNew, id, hora, ...dados } = taskModalForm;
  if(!dados.leadId) dados.leadId = null;
  if(dados.vencimento && hora){
    const combinado = new Date(`${dados.vencimento}T${hora}`);
    if(!isNaN(combinado.getTime())) dados.vencimento = combinado.toISOString();
  }
  salvandoTask = true;
  renderTaskModal();
  try{
    if(__isNew){
      const nova = await apiRequest('POST', '/tasks', dados);
      tasks.push(nova);
      atualizarTarefaNaAgendaLocal(nova);
    } else {
      const atualizada = await apiRequest('PUT', `/tasks/${id}`, dados);
      const idx = tasks.findIndex(t=>t.id===id);
      if(idx>-1) tasks[idx] = atualizada;
      atualizarTarefaNaAgendaLocal(atualizada);
    }
    salvandoTask = false;
    closeTaskModal();
  }catch(e){
    salvandoTask = false;
    errorMsg = 'Não foi possível salvar a tarefa.';
    renderTaskModal();
  }
  renderApp();
}

async function deleteTaskById(id){
  const idx = tasks.findIndex(t=>t.id===id);
  if(idx===-1) return;
  const [removida] = tasks.splice(idx,1);
  removerTarefaDaAgendaLocal(id);
  renderApp();
  try{
    await apiRequest('DELETE', `/tasks/${id}`);
  }catch(e){
    tasks.splice(idx,0,removida);
    atualizarTarefaNaAgendaLocal(removida);
    errorMsg = 'Não foi possível excluir a tarefa.';
    renderApp();
  }
}

async function toggleTaskConcluida(id){
  const task = tasks.find(t=>t.id===id);
  const taskAgenda = agendaTarefas.find(t=>t.id===id);
  if(!task && !taskAgenda) return;
  if(task) task.concluida = !task.concluida; // otimista
  if(taskAgenda) taskAgenda.concluida = task ? task.concluida : !taskAgenda.concluida;
  renderApp();
  try{
    const atualizada = await apiRequest('PUT', `/tasks/${id}/toggle`);
    const idx = tasks.findIndex(t=>t.id===id);
    if(idx>-1) tasks[idx] = atualizada;
    if(taskAgenda) taskAgenda.concluida = atualizada.concluida;
  }catch(e){
    if(task) task.concluida = !task.concluida;
    if(taskAgenda) taskAgenda.concluida = !taskAgenda.concluida;
    errorMsg = 'Não foi possível atualizar a tarefa.';
    renderApp();
  }
}
async function toggleEventoConcluido(id){
  const evento = agendaEventosGoogle.find(e=>e.id===id);
  if(!evento) return;
  evento.concluida = !evento.concluida; // otimista
  renderApp();
  try{
    const atualizado = await apiRequest('PUT', `/calendar/eventos/${id}/toggle`);
    evento.concluida = atualizado.concluida;
  }catch(e){
    evento.concluida = !evento.concluida;
    errorMsg = 'Não foi possível atualizar o evento.';
  }
  renderApp();
}

/* ---------- mutações: comissões ---------- */
async function saveContratoFromModal(){
  const f = contratoModalForm;
  if(!f.desc.trim() || !f.valorVenda) return;
  const dados = { desc: f.desc, scope: f.scope, date: f.date, valorVenda: f.valorVenda, tipoProduto: f.tipoProduto };
  try{
    if(f.__isNew){
      const novo = await apiRequest('POST', '/comissoes', dados);
      contratos.unshift(novo);
    } else {
      const atualizado = await apiRequest('PUT', `/comissoes/${f.id}`, dados);
      const idx = contratos.findIndex(c=>c.id===f.id);
      if(idx>-1) contratos[idx] = atualizado;
    }
    closeContratoModal();
  }catch(e){
    errorMsg = 'Não foi possível salvar o contrato.';
  }
  renderApp();
}
async function deleteContratoById(id){
  const idx = contratos.findIndex(c=>c.id===id);
  if(idx===-1) return;
  const [removido] = contratos.splice(idx,1);
  renderApp();
  try{
    await apiRequest('DELETE', `/comissoes/${id}`);
  }catch(e){
    contratos.splice(idx,0,removido);
    errorMsg = 'Não foi possível excluir o contrato.';
    renderApp();
  }
}
async function cancelarContrato(id){
  const c = contratos.find(x=>x.id===id);
  if(!c) return;
  const anterior = c.canceladoNoMes;
  c.canceladoNoMes = comissoesMonth; // usa o mês que está sendo visto na página como referência
  renderApp();
  try{
    const atualizado = await apiRequest('PUT', `/comissoes/${id}`, { canceladoNoMes: comissoesMonth });
    const idx = contratos.findIndex(x=>x.id===id);
    if(idx>-1) contratos[idx] = atualizado;
  }catch(e){
    c.canceladoNoMes = anterior;
    errorMsg = 'Não foi possível cancelar o contrato.';
  }
  renderApp();
}
async function reativarContrato(id){
  const c = contratos.find(x=>x.id===id);
  if(!c) return;
  const anterior = c.canceladoNoMes;
  c.canceladoNoMes = null;
  renderApp();
  try{
    const atualizado = await apiRequest('PUT', `/comissoes/${id}`, { canceladoNoMes: null });
    const idx = contratos.findIndex(x=>x.id===id);
    if(idx>-1) contratos[idx] = atualizado;
  }catch(e){
    c.canceladoNoMes = anterior;
    errorMsg = 'Não foi possível reativar o contrato.';
  }
  renderApp();
}

/* ---------- 2FA (verificação em duas etapas) ---------- */
function renderSecao2FA(){
  if(twoFactorSetup){
    return `
      <p class="settings-page-note">Escaneie o QR code com seu app autenticador (Google Authenticator, Authy, etc.) e digite o código gerado pra confirmar.</p>
      <div id="qrcode-2fa" style="margin:12px 0;"></div>
      <p class="settings-page-note">Ou digite manualmente: <code>${esc(twoFactorSetup.segredo)}</code></p>
      <div class="field">
        <label>Código de 6 dígitos</label>
        <input type="text" id="twofa-confirmar-codigo" maxlength="6" inputmode="numeric" placeholder="000000" />
      </div>
      ${twoFactorMsg ? `<p class="settings-page-msg ${twoFactorMsg.tipo}">${esc(twoFactorMsg.texto)}</p>` : ''}
      <div class="settings-btn-row">
        <button class="btn-outline" id="twofa-cancelar-setup">Cancelar</button>
        <button class="btn-primary" id="twofa-confirmar" ${twoFactorSalvando?'disabled':''}>${twoFactorSalvando?'Confirmando…':'Confirmar e ativar'}</button>
      </div>
    `;
  }
  if(currentUser && currentUser.twoFactorEnabled){
    return `
      <p class="settings-page-note">✓ Ativada — um código do seu app autenticador é pedido a cada login.</p>
      ${!mostrarDesativar2FA ? `
        <button class="btn-danger" id="twofa-mostrar-desativar">Desativar</button>
      ` : `
        <div class="field">
          <label>Digite o código atual pra confirmar</label>
          <input type="text" id="twofa-desativar-codigo" maxlength="6" inputmode="numeric" placeholder="000000" />
        </div>
        ${twoFactorMsg ? `<p class="settings-page-msg ${twoFactorMsg.tipo}">${esc(twoFactorMsg.texto)}</p>` : ''}
        <div class="settings-btn-row">
          <button class="btn-outline" id="twofa-cancelar-desativar">Cancelar</button>
          <button class="btn-danger" id="twofa-confirmar-desativar" ${twoFactorSalvando?'disabled':''}>${twoFactorSalvando?'Desativando…':'Confirmar desativação'}</button>
        </div>
      `}
    `;
  }
  return `
    <p class="settings-page-note">Desativada — adicione uma camada extra de segurança exigindo um código do celular a cada login.</p>
    <button class="btn-outline" id="twofa-iniciar">Ativar</button>
  `;
}
function renderizarQrCode2FA(){
  if(!window.QRCode){ carregarBiblioteca('qrcode').then(renderizarQrCode2FA).catch(()=>{}); return; }
  const el = document.getElementById('qrcode-2fa');
  if(el && twoFactorSetup && window.QRCode){
    el.innerHTML = '';
    new QRCode(el, { text: twoFactorSetup.otpauthUri, width:180, height:180 });
  }
}
async function iniciar2FA(){
  twoFactorMsg = null;
  try{
    const data = await apiRequest('POST', '/auth/2fa/iniciar');
    twoFactorSetup = { segredo: data.segredo, otpauthUri: data.otpauthUri };
  }catch(e){
    errorMsg = e.message || 'Não foi possível iniciar a configuração do 2FA.';
  }
  renderApp();
  renderizarQrCode2FA();
}
function cancelarSetup2FA(){
  twoFactorSetup = null;
  twoFactorMsg = null;
  renderApp();
}
async function confirmar2FA(){
  const input = document.getElementById('twofa-confirmar-codigo');
  const codigo = input ? input.value.trim() : '';
  twoFactorSalvando = true;
  twoFactorMsg = null;
  renderApp();
  try{
    await apiRequest('POST', '/auth/2fa/confirmar', { codigo });
    await refreshCurrentUser();
    twoFactorSetup = null;
    twoFactorMsg = null;
  }catch(e){
    twoFactorMsg = { tipo:'erro', texto: e.message || 'Código incorreto.' };
  }
  twoFactorSalvando = false;
  renderApp();
  renderizarQrCode2FA();
}
async function desativar2FA(){
  const input = document.getElementById('twofa-desativar-codigo');
  const codigo = input ? input.value.trim() : '';
  twoFactorSalvando = true;
  twoFactorMsg = null;
  renderApp();
  try{
    await apiRequest('POST', '/auth/2fa/desativar', { codigo });
    await refreshCurrentUser();
    mostrarDesativar2FA = false;
    twoFactorMsg = null;
  }catch(e){
    twoFactorMsg = { tipo:'erro', texto: e.message || 'Código incorreto.' };
  }
  twoFactorSalvando = false;
  renderApp();
}
async function loadAuditoria(){
  try{
    const data = await apiRequest('GET', '/auditoria');
    auditoriaEventos = data.eventos || [];
  }catch(e){
    auditoriaEventos = [];
  }
  auditoriaCarregada = true;
  renderApp();
}

/* ---------- mutações: senha e importação de leads ---------- */
async function salvarNome(){
  const nome = nomeNovoVal.trim();
  if(!nome){
    nomeMsg = { tipo:'erro', texto:'Digite um nome.' };
    renderApp();
    if(modalAlterarNomeAberto) renderAlterarNomeModal();
    return;
  }
  nomeSalvando = true;
  nomeMsg = null;
  renderApp();
  if(modalAlterarNomeAberto) renderAlterarNomeModal();
  try{
    await apiRequest('PUT', '/auth/nome', { nome });
    nomeMsg = { tipo:'ok', texto:'Nome atualizado.' };
    await refreshCurrentUser();
  }catch(e){
    nomeMsg = { tipo:'erro', texto: e.message || 'Não foi possível atualizar o nome.' };
  }
  nomeSalvando = false;
  renderApp();
  if(modalAlterarNomeAberto) renderAlterarNomeModal();
}
/* ---------- busca global (Ctrl+K) ---------- */
function abrirBuscaGlobal(){
  buscaGlobalAberta = true;
  buscaGlobalTexto = '';
  renderBuscaGlobalModal();
  setTimeout(()=>{ const el = document.getElementById('busca-global-input'); if(el) el.focus(); }, 0);
}
function closeBuscaGlobal(){
  buscaGlobalAberta = false;
  document.getElementById('modal-root').innerHTML = '';
}
function renderBuscaGlobalModal(){
  const root = document.getElementById('modal-root');
  if(!buscaGlobalAberta){ root.innerHTML=''; return; }
  const termo = buscaGlobalTexto.trim().toLowerCase();
  let leadsResultado = [];
  let tarefasResultado = [];
  if(termo){
    leadsResultado = board.cards.filter(c=>
      (c.cliente||'').toLowerCase().includes(termo) || (c.telefone||'').includes(termo)
    ).slice(0,8);
    tarefasResultado = tasks.filter(t=> (t.titulo||'').toLowerCase().includes(termo)).slice(0,8);
  }
  root.innerHTML = `
    <div class="overlay" id="busca-global-overlay">
      <div class="modal modal-lg busca-global-modal">
        <div class="busca-global-input-row">
          ${ICON_BUSCA}
          <input type="text" id="busca-global-input" placeholder="Buscar cliente ou tarefa..." value="${esc(buscaGlobalTexto)}" />
          <button id="busca-global-close" title="Fechar (Esc)">✕</button>
        </div>
        <div class="busca-global-resultados">
          ${!termo ? `<p class="settings-page-note" style="padding:16px;">Digite pra buscar clientes e tarefas. Atalho: Ctrl+K (ou ⌘K no Mac).</p>` : `
            ${leadsResultado.length ? `
              <div class="busca-global-grupo-titulo">Clientes</div>
              ${leadsResultado.map(c=>`
                <button type="button" class="busca-global-item" data-action="busca-global-abrir-lead" data-card-id="${c.id}">
                  <span class="busca-global-item-nome">${esc(c.cliente)||'Sem nome'}</span>
                  <span class="settings-page-note">${esc(c.telefone||'')}</span>
                </button>
              `).join('')}
            ` : ''}
            ${tarefasResultado.length ? `
              <div class="busca-global-grupo-titulo">Tarefas</div>
              ${tarefasResultado.map(t=>`
                <button type="button" class="busca-global-item" data-action="busca-global-abrir-tarefa" data-task-id="${t.id}">
                  <span class="busca-global-item-nome">${esc(t.titulo)}</span>
                  ${t.vencimento ? `<span class="settings-page-note">${formatDate(t.vencimento)}</span>` : ''}
                </button>
              `).join('')}
            ` : ''}
            ${!leadsResultado.length && !tarefasResultado.length ? `<p class="settings-page-note" style="padding:16px;">Nada encontrado.</p>` : ''}
          `}
        </div>
      </div>
    </div>
  `;
  document.getElementById('busca-global-close').addEventListener('click', closeBuscaGlobal);
  document.getElementById('busca-global-overlay').addEventListener('click', (e)=>{ if(e.target.id==='busca-global-overlay') closeBuscaGlobal(); });
  const inputEl = document.getElementById('busca-global-input');
  inputEl.addEventListener('input', (e)=>{
    buscaGlobalTexto = e.target.value;
    renderBuscaGlobalModal();
    const novo = document.getElementById('busca-global-input');
    if(novo){ novo.focus(); novo.setSelectionRange(novo.value.length, novo.value.length); }
  });
  inputEl.addEventListener('keydown', (e)=>{ if(e.key==='Escape') closeBuscaGlobal(); });
  document.querySelectorAll('[data-action="busca-global-abrir-lead"]').forEach(btn=>{
    btn.addEventListener('click', ()=>{ closeBuscaGlobal(); openEditCard(btn.dataset.cardId); });
  });
  document.querySelectorAll('[data-action="busca-global-abrir-tarefa"]').forEach(btn=>{
    btn.addEventListener('click', ()=>{ closeBuscaGlobal(); goToPage('tarefas'); });
  });
}
document.addEventListener('keydown', (e)=>{
  if((e.ctrlKey || e.metaKey) && e.key.toLowerCase()==='k'){
    e.preventDefault();
    if(getToken() && !buscaGlobalAberta) abrirBuscaGlobal();
  }
});

function iniciaisDoNome(nome){
  const partes = (nome||'').trim().split(/\s+/).filter(Boolean);
  if(!partes.length) return '?';
  if(partes.length === 1) return partes[0][0].toUpperCase();
  return (partes[0][0] + partes[partes.length-1][0]).toUpperCase();
}
function redimensionarImagem(file, tamanho){
  return new Promise((resolve, reject)=>{
    const reader = new FileReader();
    reader.onload = (e)=>{
      const img = new Image();
      img.onload = ()=>{
        const canvas = document.createElement('canvas');
        canvas.width = tamanho;
        canvas.height = tamanho;
        const ctx = canvas.getContext('2d');
        const lado = Math.min(img.width, img.height);
        const sx = (img.width - lado)/2;
        const sy = (img.height - lado)/2;
        ctx.drawImage(img, sx, sy, lado, lado, 0, 0, tamanho, tamanho);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = ()=> reject(new Error('Não foi possível ler a imagem.'));
      img.src = e.target.result;
    };
    reader.onerror = ()=> reject(new Error('Não foi possível ler o arquivo.'));
    reader.readAsDataURL(file);
  });
}
async function handleAvatarFileSelected(file){
  if(!file) return;
  avatarMsg = null;
  try{
    const dataUrl = await redimensionarImagem(file, 128);
    avatarSalvando = true;
    renderApp();
    await apiRequest('PUT', '/auth/avatar', { avatarUrl: dataUrl });
    await refreshCurrentUser();
    avatarMsg = { tipo:'ok', texto:'Foto atualizada.' };
  }catch(e){
    avatarMsg = { tipo:'erro', texto: e.message || 'Não foi possível enviar a foto.' };
  }
  avatarSalvando = false;
  renderApp();
}
async function removerAvatar(){
  avatarSalvando = true;
  avatarMsg = null;
  renderApp();
  try{
    await apiRequest('PUT', '/auth/avatar', { avatarUrl: null });
    await refreshCurrentUser();
    avatarMsg = { tipo:'ok', texto:'Foto removida.' };
  }catch(e){
    avatarMsg = { tipo:'erro', texto: e.message || 'Não foi possível remover a foto.' };
  }
  avatarSalvando = false;
  renderApp();
}
async function desconectarTodosDispositivos(){
  logoutAllEnviando = true;
  logoutAllMsg = null;
  renderApp();
  try{
    await apiRequest('POST', '/auth/logout-all');
    logout(true); // esse dispositivo também precisa entrar de novo
  }catch(e){
    logoutAllMsg = { tipo:'erro', texto: e.message || 'Não foi possível desconectar os dispositivos.' };
    logoutAllEnviando = false;
    renderApp();
  }
}
async function salvarSenha(){
  if(!senhaNovaVal || senhaNovaVal.length < 6){
    senhaMsg = { tipo:'erro', texto:'A nova senha precisa ter ao menos 6 caracteres.' };
    renderApp();
    if(modalAlterarSenhaAberto) renderAlterarSenhaModal();
    return;
  }
  senhaSalvando = true;
  senhaMsg = null;
  renderApp();
  if(modalAlterarSenhaAberto) renderAlterarSenhaModal();
  try{
    await apiRequest('PUT', '/auth/password', { senhaAtual: senhaAtualVal, senhaNova: senhaNovaVal });
    senhaMsg = { tipo:'ok', texto:'Senha salva com sucesso.' };
    senhaAtualVal = ''; senhaNovaVal = '';
    await refreshCurrentUser();
  }catch(e){
    senhaMsg = { tipo:'erro', texto: e.message || 'Não foi possível salvar a senha.' };
  }
  senhaSalvando = false;
  renderApp();
  if(modalAlterarSenhaAberto) renderAlterarSenhaModal();
}

// Parser simples de CSV: "Nome,Telefone,Valor", uma linha por lead.
// Não lida com campos entre aspas contendo vírgulas — suficiente pro uso esperado.
function parseCsvLeads(texto){
  const linhas = texto.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
  if(!linhas.length) return [];
  const inicio = /nome/i.test(linhas[0]) ? 1 : 0;
  const out = [];
  for(let i=inicio;i<linhas.length;i++){
    const partes = linhas[i].split(',').map(p=>p.trim().replace(/^"|"$/g,''));
    if(!partes[0]) continue;
    const valorTexto = (partes[2]||'0').replace(/[^\d,.-]/g,'').replace(/\.(?=\d{3})/g,'').replace(',','.');
    out.push({ nome: partes[0], telefone: partes[1]||'', valor: parseFloat(valorTexto) || 0 });
  }
  return out;
}
async function importarLeadsCsv(){
  const fileInput = document.getElementById('import-arquivo');
  const file = fileInput && fileInput.files && fileInput.files[0];
  if(!file){ errorMsg = 'Escolha um arquivo (.xlsx ou .csv) primeiro.'; renderApp(); return; }
  const columnId = importColumnId || (document.getElementById('import-coluna') || {}).value;
  if(!columnId){ errorMsg = 'Escolha a coluna de destino.'; renderApp(); return; }

  importando = true;
  importResultado = null;
  renderApp();

  let linhas;
  if(/\.xlsx?$/i.test(file.name)){
    try{ await carregarBiblioteca('xlsx'); }catch(e){ importando = false; errorMsg = e.message; renderApp(); return; }
    const wb = XLSX.read(await file.arrayBuffer(), { type:'array' });
    const matriz = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header:1, defval:'', raw:false });
    const inicio = matriz.length && /nome/i.test(String(matriz[0][0])) ? 1 : 0;
    linhas = matriz.slice(inicio).filter(l=> String(l[0]||'').trim()).map(l=>{
      const v = String(l[2]||'0').replace(/[^\d,.-]/g,'');
      const valor = /,\d{1,2}$/.test(v) ? parseFloat(v.replace(/\./g,'').replace(',','.')) : parseFloat(v.replace(/,/g,''));
      return { nome: String(l[0]).trim(), telefone: String(l[1]||'').trim(), valor: valor || 0 };
    });
  } else linhas = parseCsvLeads(await file.text());
  let sucesso = 0, falha = 0;
  for(const linha of linhas){
    try{
      const novo = await apiRequest('POST', '/cards', {
        columnId, cliente: linha.nome, telefone: linha.telefone, valor: linha.valor,
        temperatura: 'morno', obs: '', mes: currentMonthKey(),
      });
      board.cards.push(novo);
      sucesso++;
    }catch(e){ falha++; }
  }
  importResultado = { sucesso, falha };
  importando = false;
  renderApp();
}

/* ---------- IA ---------- */
async function gerarInsightsIA(){
  insightsCarregando = true;
  renderApp();
  try{
    const data = await apiRequest('POST', '/ai/insights', { funilId: funilAtualId });
    aiInsights = data.insights || [];
  }catch(e){
    errorMsg = e.message || 'Não foi possível gerar os insights.';
  }
  insightsCarregando = false;
  renderApp();
}

async function sugerirMensagemIA(){
  if(!modalForm || modalForm.__isNew) return;
  const btn = document.getElementById('f-ai-mensagem');
  const resultBox = document.getElementById('f-ai-mensagem-result');
  if(btn){ btn.disabled = true; btn.innerHTML = `${ICON_SPARKLE} Gerando…`; }
  try{
    const data = await apiRequest('POST', '/ai/mensagem', { cardId: modalForm.id });
    if(resultBox){
      resultBox.style.display = 'block';
      resultBox.innerHTML = `
        <p>${esc(data.mensagem)}</p>
        <div class="ai-result-actions">
          <button type="button" class="btn-outline" id="f-ai-copiar">Copiar</button>
          <button type="button" class="wa-btn" id="f-ai-abrir-wa">${WA_ICON} Abrir com essa mensagem</button>
        </div>
      `;
      const copiarBtn = document.getElementById('f-ai-copiar');
      if(copiarBtn) copiarBtn.addEventListener('click', ()=>{
        navigator.clipboard.writeText(data.mensagem).catch(()=>{});
      });
      const abrirBtn = document.getElementById('f-ai-abrir-wa');
      if(abrirBtn) abrirBtn.addEventListener('click', ()=>{
        const link = waLink(modalForm.telefone);
        if(link) window.open(link + '?text=' + encodeURIComponent(data.mensagem), '_blank', 'noopener');
      });
    }
  }catch(e){
    errorMsg = e.message || 'Não foi possível gerar a mensagem.';
    renderApp();
  }
  if(btn){ btn.disabled = false; btn.innerHTML = `${ICON_SPARKLE} Sugerir mensagem`; }
}

async function sugerirTarefaIA(){
  if(!modalForm || modalForm.__isNew) return;
  const btn = document.getElementById('f-ai-tarefa');
  const resultBox = document.getElementById('f-ai-tarefa-result');
  if(btn){ btn.disabled = true; btn.innerHTML = `${ICON_SPARKLE} Pensando…`; }
  try{
    const data = await apiRequest('POST', '/ai/sugerir-tarefa', { cardId: modalForm.id });
    const dataVenc = new Date();
    dataVenc.setDate(dataVenc.getDate() + data.dias);
    const vencISO = dataVenc.toISOString().slice(0,10);
    if(resultBox){
      resultBox.style.display = 'block';
      resultBox.innerHTML = `
        <p><b>${esc(data.titulo)}</b> — vencimento sugerido: ${formatDate(vencISO)}</p>
        <div class="ai-result-actions">
          <button type="button" class="btn-outline" id="f-ai-criar-tarefa">Criar essa tarefa</button>
        </div>
      `;
      const criarBtn = document.getElementById('f-ai-criar-tarefa');
      if(criarBtn) criarBtn.addEventListener('click', async ()=>{
        criarBtn.disabled = true;
        try{
          const nova = await apiRequest('POST', '/tasks', {
            titulo: data.titulo, vencimento: vencISO, prioridade:'media', leadId: modalForm.id, descricao:'',
          });
          tasks.push(nova);
          resultBox.innerHTML = '<p>✓ Tarefa criada.</p>';
        }catch(e){
          errorMsg = 'Não foi possível criar a tarefa.';
          renderApp();
        }
      });
    }
  }catch(e){
    errorMsg = e.message || 'Não foi possível sugerir uma tarefa.';
    renderApp();
  }
  if(btn){ btn.disabled = false; btn.innerHTML = `${ICON_SPARKLE} Sugerir tarefa de acompanhamento`; }
}

/* ---------- render: shell (barra lateral + página atual) ---------- */
// Redesenha a página igual renderApp(), mas guarda e restaura a posição de rolagem
// antes/depois — usado em ações do Pipeline (mover card) que não deveriam "resetar"
// a visão de quem já rolou a tela pra ver um cliente lá embaixo.
function renderAppPreservandoScroll(){
  const mainEl = document.querySelector('main.pipeline-main');
  const scrollHorizontal = mainEl ? mainEl.scrollLeft : null;
  const scrollsColunas = {};
  document.querySelectorAll('.cards[data-col-id]').forEach(el=>{
    scrollsColunas[el.dataset.colId] = el.scrollTop;
  });

  renderApp();

  const mainEl2 = document.querySelector('main.pipeline-main');
  if(mainEl2 && scrollHorizontal!==null) mainEl2.scrollLeft = scrollHorizontal;
  document.querySelectorAll('.cards[data-col-id]').forEach(el=>{
    if(scrollsColunas[el.dataset.colId]!==undefined) el.scrollTop = scrollsColunas[el.dataset.colId];
  });
}

function renderApp(){
  if(window.AssistenteIA && loaded) AssistenteIA.atualizarAlertas();
  const app = document.getElementById('app');
  if(!loaded){ app.innerHTML = '<div class="loading">Carregando painel…</div>'; return; }

  let pageHtml = '';
  // páginas que saíram com a integração do WhatsApp/Instagram: volta pro Dashboard
  if(['conversas', 'disparos', 'agendamentos'].includes(currentPage)) currentPage = 'dashboard';
  // aba que o gestor da equipe não liberou: vai pro Pipeline
  if(typeof paginaBloqueada === 'function' && currentPage !== 'pipeline' && paginaBloqueada(currentPage)) currentPage = 'pipeline';
  if(currentPage === 'dashboard') pageHtml = renderDashboardPage();
  else if(currentPage === 'pipeline') pageHtml = renderPipelinePage();
  else if(currentPage === 'leads') pageHtml = renderLeadsPage();
  else if(currentPage === 'comissoes') pageHtml = renderComissoesPage();
  else if(currentPage === 'relatorios') pageHtml = renderRelatoriosPage();
  else if(currentPage === 'automacoes') pageHtml = renderAutomacoesPage();
  else if(currentPage === 'fluxos') pageHtml = renderFluxosPage();
  else if(currentPage === 'import-export') pageHtml = renderImportExportPage();
  else if(currentPage === 'configuracoes') pageHtml = renderConfiguracoesPage();
  else if(currentPage === 'suporte') pageHtml = renderSuportePage();
  else if(currentPage === 'equipe') pageHtml = renderEquipePage();
  else if(currentPage === 'tarefas') pageHtml = renderTarefasPage();

  const notificacoes = computarNotificacoes();

  app.innerHTML = `
    <div class="app-shell ${sidebarOpen ? 'sidebar-open' : ''}">
      ${renderSidebar()}
      <div class="sidebar-backdrop" data-action="close-sidebar"></div>
      ${renderBarraInferior()}
      <div class="main-area ${currentPage==='pipeline' ? 'main-area-pipeline' : ''}">
        <div class="main-topbar">
          <button class="hamburger-btn" data-action="toggle-sidebar" title="Menu">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
              <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
          </button>
          <div class="topbar-right">
            <button class="notif-btn" data-action="abrir-busca-global" title="Buscar (Ctrl+K)">
              ${ICON_BUSCA}
            </button>
            <div class="notif-wrap">
              <button class="notif-btn" data-action="toggle-notif" title="Notificações">
                ${ICON_BELL}
                ${notificacoes.length ? `<span class="notif-badge">${notificacoes.length > 9 ? '9+' : notificacoes.length}</span>` : ''}
              </button>
              ${notifOpen ? `
                <div class="notif-panel">
                <div class="notif-panel-title">Notificações</div>
                ${notificacoes.length ? notificacoes.slice(0,8).map(n=>`
                  <div class="notif-item" ${n.cardId ? `data-action="open-edit-card" data-card-id="${n.cardId}"` : ''}>
                    <p>${esc(n.texto)}</p>
                    <span>${formatDateHora(n.timestamp)}</span>
                  </div>
                `).join('') : '<p class="settings-page-note" style="padding:12px;">Nenhuma notificação por enquanto.</p>'}
              </div>
            ` : ''}
          </div>
          </div>
        </div>
        ${erroParaMostrar() ? `<div class="error-banner" data-action="dismiss-error" title="Clique para fechar">⚠ ${esc(errorMsg)}</div>` : ''}
        ${renderFaixaTeste()}
        ${atuandoComo ? `
          <div class="atuando-banner" role="status">
            <span>🛠 Você está no funil de <b>${esc(atuandoComo.nome)}</b> — o que você criar, editar, excluir ou mover aqui vale para o funil dele e fica registrado.</span>
            <button type="button" class="btn-outline" data-action="sair-funil-de">Sair do funil</button>
          </div>` : ''}
        ${pageHtml}
      </div>
    </div>
  `;

  bindAppEvents();
}

const NAV_PADRAO = [
  ['dashboard', 'Visão geral', ICON_DASHBOARD],
  ['pipeline', 'Negociações', ICON_PIPELINE],
  ['leads', 'Contatos', ICON_LEADS],
  ['tarefas', 'Agenda/Tarefas', ICON_TASKS],
  ['comissoes', 'Comissões', ICON_COMISSOES],
  ['relatorios', 'Relatórios', ICON_RELATORIOS],
  ['automacoes', 'Ações automáticas', ICON_AUTOMACOES],
  ['fluxos', 'Sequências', ICON_FLUXOS],
  ['import-export', 'Importar/Exportar', ICON_IMPORT_EXPORT],
  ['equipe', 'Equipe', ICON_CHAT_INTERNO],
];
// As do dia a dia ficam sempre à mostra; as outras ficam no grupo "Mais" (abre e fecha)
const NAV_PRINCIPAIS = ['dashboard', 'pipeline', 'leads', 'tarefas', 'comissoes'];
const ICON_MAIS = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/></svg>';
// abre com as abas descendo uma a uma; fecha subindo rapidinho
function animarGrupoMais(grupo, abrir){
  clearTimeout(grupo._t);
  grupo.classList.remove('animar', 'fechando');
  if(abrir){ grupo.classList.add('aberto'); void grupo.offsetWidth; grupo.classList.add('animar'); grupo._t = setTimeout(()=> grupo.classList.remove('animar'), 700); }
  else { grupo.classList.add('fechando'); grupo._t = setTimeout(()=> grupo.classList.remove('aberto', 'fechando'), 170); }
}
// recursos do plano (o Essencial não tem ações automáticas, sequências nem criar equipe)
function temRecurso(r){ const rec = assinaturaInfo && assinaturaInfo.recursos; return !rec || rec[r] !== false; }
function avisoPlanoCompleto(titulo, texto){
  return `<div class="plano-completo-aviso"><span class="selo-completo">Plano Completo</span><b>${esc(titulo)}</b><p>${esc(texto)} O que você já criou fica guardado e volta a funcionar quando mudar de plano.</p><a class="btn-primary" href="assinatura.html?de=crm">Ver planos</a></div>`;
}
function navMaisAberto(){
  if(NAV_PADRAO.some(([k])=> k===currentPage && !NAV_PRINCIPAIS.includes(k))) return true; // está numa aba de "Mais"
  try{ return localStorage.getItem('navMais') === '1'; }catch(e){ return false; }
}
function getOrdemNavSalva(){
  try{ return JSON.parse(localStorage.getItem('navOrdem') || 'null'); }catch(e){ return null; }
}
// Devolve o NAV na ordem escolhida pelo usuário — se ele nunca reordenou, ou se um
// item novo foi adicionado depois (ex: uma página nova), cai no padrão / vai pro fim.
function getNavOrdenado(){
  const ordemSalva = getOrdemNavSalva();
  if(!ordemSalva || !ordemSalva.length) return NAV_PADRAO;
  const porChave = Object.fromEntries(NAV_PADRAO.map(item=>[item[0], item]));
  const resultado = ordemSalva.map(chave=>porChave[chave]).filter(Boolean);
  NAV_PADRAO.forEach(item=>{ if(!ordemSalva.includes(item[0])) resultado.push(item); });
  return resultado;
}
let reordenarNavAberto = false;
let reordenarNavOrdemTemp = null;

function abrirReordenarNav(){
  reordenarNavOrdemTemp = getNavOrdenado().map(item=>item[0]);
  reordenarNavAberto = true;
  renderReordenarNavModal();
}
function closeReordenarNavModal(){
  reordenarNavAberto = false;
  reordenarNavOrdemTemp = null;
  const root = document.getElementById('modal-root');
  if(root) root.innerHTML = '';
}
function moverItemNavOrdem(chave, direcao){
  const idx = reordenarNavOrdemTemp.indexOf(chave);
  const novoIdx = idx + direcao;
  if(idx===-1 || novoIdx < 0 || novoIdx >= reordenarNavOrdemTemp.length) return;
  [reordenarNavOrdemTemp[idx], reordenarNavOrdemTemp[novoIdx]] = [reordenarNavOrdemTemp[novoIdx], reordenarNavOrdemTemp[idx]];
  renderReordenarNavModal();
}
function salvarOrdemNav(){
  localStorage.setItem('navOrdem', JSON.stringify(reordenarNavOrdemTemp));
  closeReordenarNavModal();
  renderApp();
}
function restaurarOrdemNavPadrao(){
  localStorage.removeItem('navOrdem');
  closeReordenarNavModal();
  renderApp();
}
function renderReordenarNavModal(){
  const root = document.getElementById('modal-root');
  if(!reordenarNavAberto){ root.innerHTML=''; return; }
  const porChave = Object.fromEntries(NAV_PADRAO.map(item=>[item[0], item]));
  root.innerHTML = `
    <div class="overlay" id="reordenar-nav-overlay">
      <div class="modal reordenar-nav-modal">
        <div class="modal-head">
          <h3>Reordenar abas</h3>
          <button id="reordenar-nav-close">✕</button>
        </div>
        <div class="modal-body">
          <p class="settings-page-note" style="margin-bottom:12px;">Use as setinhas pra mudar a ordem que as abas aparecem no menu. As do grupo “Mais” continuam dentro dele.</p>
          <div class="reordenar-nav-lista">
            ${reordenarNavOrdemTemp.map((chave, idx)=>{
              const item = porChave[chave];
              if(!item) return '';
              const [key, label, icon] = item;
              return `
                <div class="reordenar-nav-item">
                  ${icon}
                  <span>${esc(label)}</span>
                  <div class="reordenar-nav-setas">
                    <button class="icon-btn" data-mover="${key}" data-dir="-1" ${idx===0?'disabled':''} title="Mover pra cima">↑</button>
                    <button class="icon-btn" data-mover="${key}" data-dir="1" ${idx===reordenarNavOrdemTemp.length-1?'disabled':''} title="Mover pra baixo">↓</button>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
        <div class="modal-foot">
          <button class="delete-link" id="reordenar-nav-restaurar">Restaurar padrão</button>
          <div class="modal-foot-actions">
            <button class="btn-outline" id="reordenar-nav-cancelar">Cancelar</button>
            <button class="btn-save" id="reordenar-nav-salvar">Salvar ordem</button>
          </div>
        </div>
      </div>
    </div>
  `;

  document.getElementById('reordenar-nav-close').addEventListener('click', closeReordenarNavModal);
  document.getElementById('reordenar-nav-cancelar').addEventListener('click', closeReordenarNavModal);
  document.getElementById('reordenar-nav-overlay').addEventListener('click', (e)=>{ if(e.target.id==='reordenar-nav-overlay') closeReordenarNavModal(); });
  document.getElementById('reordenar-nav-salvar').addEventListener('click', salvarOrdemNav);
  document.getElementById('reordenar-nav-restaurar').addEventListener('click', restaurarOrdemNavPadrao);
  root.querySelectorAll('[data-mover]').forEach(btn=>{
    btn.addEventListener('click', ()=> moverItemNavOrdem(btn.dataset.mover, parseInt(btn.dataset.dir,10)));
  });
}

// Ícone do botão "Trocar de aplicativo" (CRM ⇄ Controle financeiro)
const ICON_TROCAR_APP = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>';
// Barra fixa embaixo no celular: as 4 telas mais usadas + "Mais" (abre o menu completo)
function renderBarraInferior(){
  const ICO = {
    dashboard: '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
    pipeline: '<rect x="3" y="3" width="5" height="18" rx="1"/><rect x="10" y="3" width="5" height="11" rx="1"/><rect x="17" y="3" width="4" height="14" rx="1"/>',
    leads: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8"/><path d="M18 14.5c2.2.6 3.5 2.4 3.5 5.5"/>',
    tarefas: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M8 2v4M16 2v4M3 10h18"/><path d="M8.5 15l2 2 4-4"/>',
  };
  const itens = [['dashboard','Início'],['pipeline','Negociações'],['leads','Contatos'],['tarefas','Agenda']].filter(([k])=> !atuandoComo || PAGINAS_ATUANDO_COMO.includes(k));
  return `
    <nav class="bottom-nav" aria-label="Navegação principal">
      ${itens.map(([k,l])=>`
        <button type="button" class="bottom-nav-item ${currentPage===k && !sidebarOpen?'active':''}" data-action="nav" data-page="${k}" ${currentPage===k?'aria-current="page"':''}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICO[k]}</svg>
          <span>${l}</span>
        </button>`).join('')}
      <button type="button" class="bottom-nav-item ${sidebarOpen?'active':''}" data-action="toggle-sidebar" aria-label="Mais opções" aria-expanded="${sidebarOpen}">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>
        <span>Mais</span>
      </button>
    </nav>`;
}
// etapa visível no celular (uma por vez): a escolhida, ou a primeira do funil
function etapaAtivaMobile(columnsDoFunil){
  if(pipelineEtapaMobileId && columnsDoFunil.some(c=>c.id===pipelineEtapaMobileId)) return pipelineEtapaMobileId;
  return columnsDoFunil.length ? columnsDoFunil[0].id : null;
}
// Troca a etapa aberta no celular. Durante o arrasto, só mexe nas classes (sem redesenhar a
// tela), pra não perder o cliente que está na mão.
function trocarEtapaMobile(colId, durante){
  pipelineEtapaMobileId = colId;
  if(!durante){ renderApp(); return; }
  document.querySelectorAll('.column').forEach(c=> c.classList.toggle('col-ativa-mobile', c.dataset.colId === colId));
  document.querySelectorAll('.etapa-chip-mobile').forEach(c=>{
    const ativo = c.dataset.colId === colId;
    c.classList.toggle('active', ativo);
    c.setAttribute('aria-selected', ativo ? 'true' : 'false');
    if(ativo && c.scrollIntoView) c.scrollIntoView({ inline:'center', block:'nearest' });
  });
}
// arrastando um cliente no celular: parado ~0,4 s em cima do chip de outra etapa, abre aquela etapa
let chipHoverTimer = null;
function verificarChipDeEtapaSobDedo(x, y){
  if(!cardTouchDrag || !ehCelular()) return;
  const sob = document.elementFromPoint(x, y);
  const chip = sob && sob.closest ? sob.closest('#etapas-chips-mobile .etapa-chip-mobile') : null;
  document.querySelectorAll('.etapa-chip-mobile.etapa-chip-alvo').forEach(c=>{ if(c!==chip) c.classList.remove('etapa-chip-alvo'); });
  const id = chip ? chip.dataset.colId : null;
  if(id === cardTouchDrag.chipHover) return;
  clearTimeout(chipHoverTimer);
  cardTouchDrag.chipHover = id;
  if(!chip) return;
  chip.classList.add('etapa-chip-alvo');
  chipHoverTimer = setTimeout(()=>{
    if(cardTouchDrag && cardTouchDrag.chipHover === id){
      trocarEtapaMobile(id, true);
      if(navigator.vibrate) navigator.vibrate(10);
    }
  }, 400);
}

function renderSidebar(){
  const NAV = getNavOrdenado().filter(([key])=> !atuandoComo || PAGINAS_ATUANDO_COMO.includes(key));
  return `
    <aside class="sidebar">
      <div class="sidebar-brand">
        <span class="sidebar-avatar">${currentUser && currentUser.avatarUrl ? `<img src="${currentUser.avatarUrl}" alt="" />` : esc(iniciaisDoNome((currentUser&&currentUser.nome)||''))}</span>
        <span class="sidebar-greeting">Olá, <span class="sidebar-brand-name">${esc((currentUser && currentUser.nome) || 'visitante')}</span></span>
      </div>
      <nav class="sidebar-nav">
        ${NAV.filter(([key])=> NAV_PRINCIPAIS.includes(key)).map(([key,label,icon])=>`
          <button class="nav-item ${currentPage===key?'active':''}" data-action="nav" data-page="${key}">${icon}<span>${label}</span></button>
        `).join('')}
        <div class="nav-mais ${navMaisAberto()?'aberto':''}">
          <button type="button" class="nav-item nav-mais-btn" data-action="nav-mais" aria-expanded="${navMaisAberto()}">${ICON_MAIS}<span>Mais</span><span class="nav-mais-seta" aria-hidden="true">▾</span></button>
          <div class="nav-mais-lista">
            ${NAV.filter(([key])=> !NAV_PRINCIPAIS.includes(key)).map(([key,label,icon])=>`
              <button class="nav-item ${currentPage===key?'active':''}" data-action="nav" data-page="${key}">${icon}<span>${label}</span>${(key==='automacoes'||key==='fluxos') && !temRecurso('automacoes') ? '<span class="selo-completo mini">Completo</span>' : ''}</button>
            `).join('')}
          </div>
        </div>
      </nav>
      <div class="nav-reordenar-wrap">
        <button class="nav-item nav-reordenar-btn" data-action="abrir-reordenar-nav" title="Mudar a ordem das abas">${ICON_REORDER}<span>Reordenar abas</span></button>
      </div>
      <div class="sidebar-footer">
        <a class="nav-item trocar-app-item" href="/" title="Abrir o Controle financeiro ou voltar para a escolha de aplicativo">${ICON_TROCAR_APP}<span>Trocar de aplicativo</span></a>
        ${atuandoComo ? '' : `<button class="nav-item ${currentPage==='suporte'?'active':''}" data-action="nav" data-page="suporte">${ICON_SUPORTE}<span>Suporte</span></button>
        <button class="nav-item ${currentPage==='configuracoes'?'active':''}" data-action="nav" data-page="configuracoes">${ICON_SETTINGS}<span>Configurações</span></button>`}
        <button class="nav-item logout-item" data-action="logout">${ICON_LOGOUT}<span>Sair</span></button>
      </div>
    </aside>
  `;
}

/* ---------- página: Dashboard ---------- */
// Painéis recolhíveis do Dashboard — o estado (aberto/fechado) fica salvo no
// localStorage do navegador, então continua do jeito que a pessoa deixou mesmo
// depois de fechar e abrir o CRM de novo.
function painelDashboardAberto(id){
  try{
    const v = localStorage.getItem('dash-painel-'+id);
    return v === null ? true : v === '1'; // aberto por padrão, antes da primeira vez que a pessoa mexe
  }catch(e){ return true; }
}
function renderCabecalhoPainelDashboard(id, titulo, extraHtml){
  const aberto = painelDashboardAberto(id);
  return `
    <div class="dash-panel-title dash-panel-title-recolhivel" style="${aberto?'':'margin-bottom:0;'}">
      <button type="button" class="dash-panel-toggle" data-action="toggle-painel-dashboard" data-painel-id="${id}">
        <span class="dash-panel-seta ${aberto?'':'fechada'}">▾</span> ${titulo}
      </button>
      ${extraHtml||''}
    </div>
  `;
}
// Envolve o conteúdo de um painel numa estrutura que anima o recolher/abrir suavemente
// (usa grid-template-rows 1fr↔0fr, que consegue animar até uma altura "automática"
// sem precisar saber o tamanho do conteúdo de antemão — ao contrário de max-height,
// que precisa de um valor fixo chutado). O conteúdo fica sempre no DOM; é só a altura
// visível que encolhe a zero quando fechado.
function envolverConteudoPainel(id, conteudoHtml){
  const aberto = painelDashboardAberto(id);
  return `
    <div class="dash-panel-collapse" id="dash-collapse-${id}" style="max-height:${aberto ? 'none' : '0px'};">
      <div class="dash-panel-collapse-inner">${conteudoHtml}</div>
    </div>
  `;
}
// Abre/fecha um painel específico do Dashboard sem redesenhar a página inteira — se
// redesenhasse tudo (como o resto do app costuma fazer), o elemento nasceria de novo
// já no estado final, sem um "antes" pra animação partir. Mede a altura real do
// conteúdo em pixels (em vez de usar grid-template-rows com fr, que tem suporte menos
// confiável entre navegadores) e anima o max-height até lá.
function alternarPainelDashboard(id, btn){
  const vaiAbrir = !painelDashboardAberto(id);
  try{ localStorage.setItem('dash-painel-'+id, vaiAbrir ? '1' : '0'); }catch(e){}

  const seta = btn.querySelector('.dash-panel-seta');
  if(seta) seta.classList.toggle('fechada', !vaiAbrir);
  const tituloEl = btn.closest('.dash-panel-title-recolhivel');
  if(tituloEl) tituloEl.style.marginBottom = vaiAbrir ? '' : '0';

  const colapseEl = document.getElementById('dash-collapse-'+id);
  if(!colapseEl) return;
  const innerEl = colapseEl.querySelector('.dash-panel-collapse-inner');

  if(vaiAbrir){
    const alturaFinal = innerEl.scrollHeight;
    colapseEl.style.maxHeight = alturaFinal + 'px';
    colapseEl.addEventListener('transitionend', function liberar(e){
      if(e.propertyName !== 'max-height') return;
      if(painelDashboardAberto(id)) colapseEl.style.maxHeight = 'none'; // libera de vez, pro conteúdo poder crescer depois sem ficar cortado
      colapseEl.removeEventListener('transitionend', liberar);
    });
  } else {
    colapseEl.style.maxHeight = colapseEl.scrollHeight + 'px'; // trava num valor explícito — estava em "none", que não é animável
    colapseEl.offsetHeight; // força o navegador a registrar esse valor antes da próxima mudança
    requestAnimationFrame(()=>{
      colapseEl.style.maxHeight = '0px';
    });
  }
}
function renderDashboardPage(){
  const m = dashMetrics();
  const stages = stageTotals();
  const maxStage = Math.max(1, ...stages.map(s=>s.total));
  const recentes = [...cardsInPeriod()].sort((a,b)=> new Date(b.createdAt||0) - new Date(a.createdAt||0)).slice(0,5);
  const tarefasSemHora = tasksLoaded ? tasks.filter(t=>!t.concluida && !horaLocalDaTarefaOuNull(t.vencimento)).map(t=>({ tipo:'tarefa', id:t.id, titulo:t.titulo, data:t.vencimento })) : [];
  // eventos do Google são pessoais do próprio gestor — não fazem sentido (e vazariam
  // dados privados) quando ele está olhando o dashboard de outra pessoa
  const eventosSemHoraDash = (agendaLoaded && !visualizandoDashboardDe && !atuandoComo) ? agendaEventosGoogle.filter(e=>e.diaInteiro && !e.concluida).map(e=>({ tipo:'evento', id:e.id, titulo:e.titulo, data:e.inicio })) : [];
  const abertas = [...tarefasSemHora, ...eventosSemHoraDash].sort((a,b)=> new Date(a.data||'2999-01-01') - new Date(b.data||'2999-01-01')).slice(0,5);

  return `
    ${visualizandoDashboardDe ? `
      <div class="dashboard-readonly-banner">
        <span>👁️ Você está vendo a visão geral de <b>${esc(visualizandoDashboardDe.nome)}</b> — somente leitura, nada aqui pode ser alterado.</span>
        <button type="button" class="btn-outline" data-action="sair-dashboard-membro">← Voltar</button>
      </div>
    ` : ''}
    <div class="page-head">
      <div>
        <h1>Visão geral</h1>
        <p>Como estão as suas vendas</p>
      </div>
      <div class="period-toggle">
        ${[['7dias','7 dias'],['mes','Mês'],['trimestre','Trimestre'],['ano','Ano']].map(([key,label])=>`
          <button class="tab-btn ${dashboardPeriod===key?'active':''}" data-action="set-dash-period" data-period="${key}">${label}</button>
        `).join('')}
      </div>
    </div>

    <div class="metric-grid">
      <div class="metric-card">
        <div class="metric-card-top"><span>Novos contatos</span><span class="metric-icon">${ICON_USERS}</span></div>
        <div class="metric-value">${m.novosLeads}</div>
        <div class="metric-sub">no período</div>
      </div>
      <div class="metric-card">
        <div class="metric-card-top"><span>Em negociação</span><span class="metric-icon">${ICON_DOLLAR}</span></div>
        <div class="metric-value">${fmtBRL(m.emNegociacaoValor)}</div>
        <div class="metric-sub">${m.emNegociacaoCount} ${m.emNegociacaoCount===1?'negócio':'negócios'}</div>
      </div>
      <div class="metric-card">
        <div class="metric-card-top"><span>Ganho</span><span class="metric-icon">${ICON_TROPHY}</span></div>
        <div class="metric-value">${fmtBRL(m.ganhoValor)}</div>
        <div class="metric-sub">${m.ganhoCount} fechados</div>
      </div>
      <div class="metric-card">
        <div class="metric-card-top"><span>Aproveitamento</span><span class="metric-icon">${ICON_TREND}</span></div>
        <div class="metric-value">${m.conversao}%</div>
        <div class="metric-sub">das negociações encerradas viraram venda</div>
      </div>
    </div>

    <div class="dash-grid" style="margin-bottom:20px;">
      <div class="dash-panel">
        ${renderCabecalhoPainelDashboard('meta-individual', 'Meta de vendas do mês', (!editandoMetaVendas && !visualizandoDashboardDe) ? `<button class="icon-btn" data-action="editar-meta-vendas" title="Editar meta">${ICON_EDIT}</button>` : '')}
        ${envolverConteudoPainel('meta-individual', !metaVendasCarregada ? `<p class="settings-page-note">Carregando…</p>` : (editandoMetaVendas ? `
          <div class="field-row" style="align-items:flex-end;">
            <div class="field"><label>Meta do mês (R$)</label><input type="number" id="meta-vendas-input" value="${metaVendasValor||0}" min="0" step="0.01" /></div>
            <button class="btn-primary" id="meta-vendas-salvar" style="margin-bottom:14px;">Salvar</button>
          </div>
        ` : (metaVendasValor > 0 ? `
          <div class="meta-vendas-track"><div class="meta-vendas-fill" style="width:${Math.min(100, (vendidoNoMesAtual()/metaVendasValor*100))}%"></div></div>
          <p class="settings-page-note">${fmtBRL(vendidoNoMesAtual())} de ${fmtBRL(metaVendasValor)} — ${Math.round(Math.min(999,vendidoNoMesAtual()/metaVendasValor*100))}%</p>
        ` : `<p class="dash-empty">Nenhuma meta definida pra este mês.</p>`)))}
      </div>
      ${equipe ? `
        <div class="dash-panel">
          ${renderCabecalhoPainelDashboard('meta-equipe', 'Meta de vendas da equipe', (equipe.souSupervisor && !editandoMetaVendasEquipe && !visualizandoDashboardDe) ? `<button class="icon-btn" data-action="editar-meta-vendas-equipe" title="Editar meta">${ICON_EDIT}</button>` : '')}
          ${envolverConteudoPainel('meta-equipe', !metaVendasEquipeCarregada ? `<p class="settings-page-note">Carregando…</p>` : (editandoMetaVendasEquipe ? `
            <div class="field-row" style="align-items:flex-end;">
              <div class="field"><label>Meta da equipe no mês (R$)</label><input type="number" id="meta-vendas-equipe-input" value="${metaVendasEquipeValor||0}" min="0" step="0.01" /></div>
              <button class="btn-primary" id="meta-vendas-equipe-salvar" style="margin-bottom:14px;">Salvar</button>
            </div>
          ` : `
            <div class="meta-vendas-track"><div class="meta-vendas-fill" style="width:${metaVendasEquipeValor ? Math.min(100, (metaVendasEquipeVendido/metaVendasEquipeValor*100)) : 0}%"></div></div>
            <p class="settings-page-note">${fmtBRL(metaVendasEquipeVendido)} de ${fmtBRL(metaVendasEquipeValor)} — ${metaVendasEquipeValor ? Math.round(Math.min(999,metaVendasEquipeVendido/metaVendasEquipeValor*100)) : 0}%</p>
          `))}
        </div>
      ` : ''}
    </div>

    <div class="dash-grid">
      <div class="dash-panel">
        ${renderCabecalhoPainelDashboard('leads-captados', 'Novos contatos')}
        ${envolverConteudoPainel('leads-captados', renderLeadsChart())}
      </div>
      <div class="dash-panel">
        ${renderCabecalhoPainelDashboard('pipeline-etapa', 'Negociações por etapa')}
        ${envolverConteudoPainel('pipeline-etapa', `
        <div class="stage-list">
          ${stages.length ? stages.map(s=>`
            <div class="stage-row">
              <div class="stage-row-top"><span>${esc(s.col.nome)}</span><span>${fmtBRL(s.total)}</span></div>
              <div class="stage-bar-track"><div class="stage-bar-fill" style="width:${maxStage ? (s.total/maxStage*100) : 0}%"></div></div>
            </div>
          `).join('') : '<p class="dash-empty">Nenhuma coluna criada ainda.</p>'}
        </div>
        `)}
      </div>
    </div>

    <div class="dash-grid">
      <div class="dash-panel">
        ${renderCabecalhoPainelDashboard('ultimos-leads', 'Últimos contatos')}
        ${envolverConteudoPainel('ultimos-leads', recentes.length ? `<div class="recent-list">${recentes.map(c=>`
          <div class="recent-item"><span class="recent-name">${esc(c.cliente) || 'Sem nome'}</span><span class="recent-value">${fmtBRL(c.valor)}</span></div>
        `).join('')}</div>` : '<p class="dash-empty">Nenhum contato neste período.</p>')}
      </div>
      <div class="dash-panel">
        ${renderCabecalhoPainelDashboard('tarefas-abertas', 'Tarefas abertas')}
        ${envolverConteudoPainel('tarefas-abertas', abertas.length ? `<div class="recent-list">${abertas.map(t=>`
          <div class="task-mini-item">
            ${t.tipo==='evento'
              ? `<span class="check-circle" data-action="toggle-evento" data-evento-id="${t.id}"></span>`
              : (visualizandoDashboardDe ? `<span class="check-circle" style="cursor:default;"></span>` : `<span class="check-circle" data-action="toggle-task" data-task-id="${t.id}"></span>`)
            }
            <span class="task-mini-title">${esc(t.titulo)}</span>
            ${t.data ? `<span class="metric-sub">${formatDate(t.data)}</span>` : ''}
          </div>
        `).join('')}</div>` : '<p class="dash-empty">Tudo em dia por aqui.</p>')}
      </div>
    </div>
  `;
}

/* ---------- página: Pipeline (o quadro kanban, como já era) ---------- */
function renderPipelinePage(){
  if(!funisLoaded){
    return `<div class="page-head"><div><h1>Negociações</h1><p>Carregando…</p></div></div>`;
  }
  const months = monthsList();
  const funilAtual = funis.find(f=>f.id===funilAtualId);
  const columnsDoFunil = board.columns.filter(c=>c.funilId===funilAtualId);
  return `
    <div class="page-head">
      <div>
        <h1>Negociações</h1>
        <p>Arraste os clientes para mudar de coluna</p>
      </div>
    </div>

    <div class="funil-tabs">
      ${funis.map(f=>{
        if(editingFunilId===f.id){
          return `<input class="funil-name-input" id="funil-rename-${f.id}" value="${esc(editingFunilName)}" />`;
        }
        return `<button class="tab-btn ${funilAtualId===f.id?'active':''}" data-action="set-funil" data-funil-id="${f.id}">${esc(f.nome)}</button>`;
      }).join('')}
      ${funilAtual ? `
        <button class="icon-btn" data-action="edit-funil-name" data-funil-id="${funilAtual.id}" title="Renomear funil">${ICON_EDIT}</button>
        <button class="icon-btn" data-action="duplicar-funil" data-funil-id="${funilAtual.id}" title="Duplicar funil (só a estrutura de colunas)">⧉</button>
        ${funis.length > 1 ? `<button class="icon-btn" data-action="delete-funil" data-funil-id="${funilAtual.id}" title="Excluir funil">${ICON_TRASH}</button>` : ''}
      ` : ''}
      <button class="tab-btn" data-action="open-new-funil" title="Criar novo funil">+ Funil</button>
    </div>

    <div class="tabs">
      <button class="tab-btn ${filterMonth===null?'active':''}" data-action="set-month" data-month="">Geral</button>
      <div class="date-wrap">
        <button class="tab-btn ${filterMonth?'active':''}" data-action="toggle-date-menu">
          📅 ${filterMonth ? monthLabel(filterMonth) : 'Escolher data'}
        </button>
        ${dateMenuOpen ? `
          <div class="date-menu">
            <div class="date-menu-title">Meses com dados</div>
            ${months.length ? `
              <div class="date-menu-list">
                ${months.map(m=>`<button class="date-menu-item ${filterMonth===m?'active':''}" data-action="set-month" data-month="${m}">${monthLabel(m, true)}</button>`).join('')}
              </div>
            ` : `<p class="date-menu-empty">Nenhum mês com dados ainda.</p>`}
            <div class="date-menu-sep"></div>
            <label class="date-menu-custom-label">
              Ir para outro mês
              <input type="month" id="goto-month-input" value="${filterMonth||''}" />
            </label>
          </div>
        ` : ''}
      </div>
      <button class="tab-btn ${filtroEsfriando?'active':''}" data-action="toggle-esfriando" title="Contatos em aberto sem atividade há mais de 7 dias">🧊 Esfriando</button>
    </div>

    <div class="stats-wrap-fixo">
      <div class="stats-wrap">
        <div class="stats">
          <div class="stats-label">Resumo · ${filterMonth ? monthLabel(filterMonth, true) : 'Geral (todos os meses)'}</div>
          <div class="stats-row">
            ${renderStatItem('aberto', 'Em negociação', fmtBRL(sumByTipo('aberto')), `${countByTipo('aberto')} ${countByTipo('aberto')===1?'cliente':'clientes'}`)}
            ${renderStatItem('ganho', 'Vendido', fmtBRL(sumByTipo('ganho')), `${countByTipo('ganho')} ${countByTipo('ganho')===1?'cliente':'clientes'}`)}
            ${renderStatItem('perdido', 'Perdido', fmtBRL(sumByTipo('perdido')), `${countByTipo('perdido')} ${countByTipo('perdido')===1?'cliente':'clientes'}`, 'rgba(255,255,255,.45)')}
            ${renderStatItem('quentes', 'Contatos quentes', quentesAtivos())}
            ${renderStatItem('ticket', 'Ticket médio', fmtBRL(ticketMedioFunil()))}
          </div>
        </div>
      </div>
    </div>

    ${integracoesConfig.assistenteIA ? `<div class="pipeline-insights-bar">
      <button class="pipeline-insights-toggle" data-action="toggle-insights-pipeline">
        <span>${ICON_SPARKLE} Insights da IA sobre esse funil</span>
        <span class="auditoria-toggle-seta ${insightsPipelineExpandido?'aberta':''}">▾</span>
      </button>
      ${insightsPipelineExpandido ? `
        <div class="pipeline-insights-conteudo">
          <button class="btn-outline" data-action="gerar-insights" ${insightsCarregando?'disabled':''}>${insightsCarregando?'Gerando…':'Gerar'}</button>
          ${aiInsights.length
            ? `<ul class="ai-insights-list">${aiInsights.map(i=>`<li>${esc(i)}</li>`).join('')}</ul>`
            : `<p class="dash-empty">Clique em "Gerar" para receber alertas sobre esse funil.</p>`
          }
        </div>
      ` : ''}
    </div>` : ''}

    <div class="pipeline-ordenar-row">
      ${renderBotaoOrdenar('pipeline', pipelineOrdenarPor, 'Ordem manual (arrastar)')}
      ${pipelineOrdenando ? `<span class="settings-page-note">Reordenando…</span>` : ''}
    </div>

    ${(()=>{ const ativa = etapaAtivaMobile(columnsDoFunil); return `
    <div class="etapas-chips-mobile" id="etapas-chips-mobile" role="tablist" aria-label="Etapas do funil">
      ${columnsDoFunil.map(col=>`<button type="button" role="tab" class="etapa-chip-mobile ${col.id===ativa?'active':''}" data-action="etapa-mobile" data-col-id="${col.id}" aria-selected="${col.id===ativa}">${esc(col.nome)} <span class="etapa-chip-qtd">${cardsOf(col.id).length}</span></button>`).join('')}
    </div>
    <p class="etapas-dica-mobile">Para mudar um cliente de etapa, segure o cartão e arraste até o nome da etapa, em cima.</p>`; })()}

    <main class="pipeline-main">
      <div class="board">
        ${columnsDoFunil.map(col => renderColumn(col, col.id === etapaAtivaMobile(columnsDoFunil))).join('')}
        <div class="add-col-wrap">
          ${addingCol ? `
            <div class="add-col-form">
              <input type="text" id="new-col-input" placeholder="Nome da coluna" value="${esc(newColNameVal)}" />
              <select id="new-col-tipo" class="add-col-tipo-select">
                ${Object.entries(TIPOS).map(([key,t])=>`<option value="${key}" ${newColTipoVal===key?'selected':''}>${t.label}</option>`).join('')}
              </select>
              <div class="add-col-actions">
                <button class="btn-primary" data-action="confirm-add-col">Adicionar</button>
                <button class="btn-ghost" data-action="cancel-add-col">Cancelar</button>
              </div>
            </div>
          ` : `
            <button class="add-col-btn" data-action="start-add-col">+ Nova coluna</button>
          `}
        </div>
      </div>
    </main>
  `;
}

function renderColumn(col, ativaNoCelular){
  const cards = cardsOf(col.id);
  const tipo = TIPOS[col.tipo] || TIPOS.aberto;
  const total = cards.reduce((s,c)=> s + (col.tipo==='ganho' ? valorVendido(c) : (Number(c.valor)||0)), 0);
  const isEditing = editingColId === col.id;
  const menuOpen = openMenuColId === col.id;

  return `
    <div class="column ${ativaNoCelular ? 'col-ativa-mobile' : ''}" data-col-id="${col.id}">
      <div class="col-head">
        <div class="col-head-top">
          <span class="grip" draggable="true" data-action="drag-col-handle" data-col-id="${col.id}" title="Arraste para reordenar">⠿</span>
          ${isEditing
            ? `<input class="col-name-input" id="col-rename-${col.id}" value="${esc(editingColName)}" />`
            : `<span class="col-name" data-action="edit-col-name" data-col-id="${col.id}" title="Clique para renomear">${esc(col.nome)}</span>`
          }
          <button class="col-add-btn" data-action="open-add-lead-choice" data-col-id="${col.id}" title="Adicionar cliente">+</button>
          <button class="col-menu-btn" data-action="toggle-col-menu" data-col-id="${col.id}">▾</button>
        </div>
        <div class="col-meta">
          <span class="badge" style="color:${tipo.color};background:${tipo.bg};${tipo.strike ? 'text-decoration:line-through;' : ''}">${tipo.label}</span>
          <span class="col-total">${fmtBRL(total)}</span>
        </div>
        ${menuOpen ? `
          <div class="col-menu">
            <div class="col-menu-title">Marcar coluna como</div>
            ${Object.entries(TIPOS).map(([key,t])=>`
              <button class="col-menu-item" data-action="set-col-tipo" data-col-id="${col.id}" data-tipo="${key}">
                <span class="dot" style="background:${t.color}"></span>${t.label} ${col.tipo===key?'✓':''}
              </button>
            `).join('')}
            <div class="col-menu-sep">
              <button class="col-menu-item danger" data-action="delete-col" data-col-id="${col.id}">🗑 Excluir coluna</button>
            </div>
          </div>
        ` : ''}
      </div>

      <div class="cards" data-col-id="${col.id}">
        ${cards.length===0 ? '<p class="empty-col">Nenhum cliente aqui ainda</p>' : cards.map(card=>renderCard(card)).join('')}
      </div>
    </div>
  `;
}

// Deixa o total da coluna (quando o valor é grande demais e fica cortado)
// arrastável com o mouse, além do toque/trackpad que o overflow-x já dá de graça.
// mousemove/mouseup ficam registrados uma única vez (fora do render) pra não
// acumular ouvintes a cada nova renderização — só o mousedown é religado por
// elemento, já que os elementos em si são recriados a cada render.
let arrasteHorizontalState = null;
document.addEventListener('mousemove', (e)=>{
  if(!arrasteHorizontalState) return;
  e.preventDefault();
  arrasteHorizontalState.el.scrollLeft = arrasteHorizontalState.scrollInicial - (e.pageX - arrasteHorizontalState.inicioX);
});
document.addEventListener('mouseup', ()=>{
  if(!arrasteHorizontalState) return;
  arrasteHorizontalState.el.classList.remove('dragging');
  arrasteHorizontalState = null;
});
// Mede a altura de verdade do bloco fixo do resumo (em vez de chutar um valor em
// pixels) e usa isso pra calcular exatamente quanto sobra de tela pra coluna — sem
// esse cálculo, ou a coluna fica curta demais (sobra espaço vazio embaixo) ou alta
// demais (esconde atrás do resumo ao rolar até o fim da página).
/* ---------- resumo do Pipeline: largura de cada número, redimensionável ---------- */
const STAT_KEYS = ['aberto','ganho','perdido','quentes','ticket'];
const STAT_LARGURA_PADRAO = 220;
const STAT_LARGURA_MIN = 130;
function getLargurasStats(){
  let salvo = {};
  try{ salvo = JSON.parse(localStorage.getItem('statsLargura') || '{}'); }catch(e){ salvo = {}; }
  return salvo;
}
let statsLargura = getLargurasStats();
// Só ajusta quem NUNCA foi redimensionado manualmente pelo usuário — distribui o
// espaço da caixa azul igualmente entre eles, sem nunca deixar menor que o padrão
// (pra nenhum número começar cortado) nem deixar espaço vazio sobrando.
function ajustarLargurasStatsPadrao(){
  if(currentPage !== 'pipeline') return;
  const statsEl = document.querySelector('.stats');
  if(!statsEl) return;
  const chavesNaoCustomizadas = STAT_KEYS.filter(k => statsLargura[k] === undefined);
  if(!chavesNaoCustomizadas.length) return; // tudo já foi ajustado manualmente, respeita a escolha do usuário
  const larguraTotalCustomizada = STAT_KEYS.reduce((s,k)=> s + (statsLargura[k] || 0), 0);
  const larguraDisponivel = statsEl.getBoundingClientRect().width / (window.zoomDaTela ? window.zoomDaTela() : 1) - larguraTotalCustomizada;
  const larguraIdeal = Math.max(STAT_LARGURA_PADRAO, Math.floor(larguraDisponivel / chavesNaoCustomizadas.length));
  chavesNaoCustomizadas.forEach(chave=>{
    const statEl = document.querySelector(`.stat[data-stat-key="${chave}"]`);
    if(statEl) statEl.style.width = larguraIdeal + 'px';
  });
}
function renderStatItem(chave, label, valor, contagem, corValor){
  const largura = statsLargura[chave] || STAT_LARGURA_PADRAO;
  return `
    <div class="stat" data-stat-key="${chave}" style="width:${largura}px;">
      <span class="lbl">${esc(label)}</span>
      <span class="val" ${corValor ? `style="color:${corValor}"` : ''}>${valor}</span>
      ${contagem ? `<span class="cnt">${esc(contagem)}</span>` : ''}
      <div class="stat-resize-handle" data-stat-key="${chave}" title="Arraste para redimensionar"></div>
    </div>
  `;
}
let resizeStatState = null;
document.addEventListener('mousemove', (e)=>{
  if(!resizeStatState) return;
  e.preventDefault();
  const delta = (e.pageX - resizeStatState.startX) / (window.zoomDaTela ? window.zoomDaTela() : 1);
  const novaLargura = Math.max(STAT_LARGURA_MIN, Math.round(resizeStatState.startWidth + delta));
  statsLargura[resizeStatState.key] = novaLargura;
  const statEl = document.querySelector(`.stat[data-stat-key="${resizeStatState.key}"]`);
  if(statEl) statEl.style.width = novaLargura + 'px';
});
document.addEventListener('mouseup', ()=>{
  if(!resizeStatState) return;
  resizeStatState = null;
  localStorage.setItem('statsLargura', JSON.stringify(statsLargura));
});
function ativarRedimensionarStats(){
  document.querySelectorAll('.stat-resize-handle').forEach(handle=>{
    handle.addEventListener('mousedown', (e)=>{
      e.preventDefault();
      e.stopPropagation();
      const statEl = handle.closest('.stat');
      resizeStatState = { key: handle.dataset.statKey, startX: e.pageX, startWidth: statEl.getBoundingClientRect().width / (window.zoomDaTela ? window.zoomDaTela() : 1) };
    });
  });
}

function ajustarAlturaColunasPipeline(){
  if(currentPage !== 'pipeline') return;
  const resumoFixo = document.querySelector('.stats-wrap-fixo');
  if(!resumoFixo) return;
  const alturaResumo = resumoFixo.getBoundingClientRect().height;
  const margemExtra = 12; // respiro entre o resumo e o topo das colunas + a barra de rolagem horizontal
  document.documentElement.style.setProperty('--altura-coluna-pipeline', `calc((100vh - ${Math.ceil(alturaResumo + margemExtra)}px) / var(--zoom, 1))`);
}
window.addEventListener('resize', ()=>{ ajustarAlturaColunasPipeline(); ajustarLargurasStatsPadrao(); });

function ativarArrasteHorizontal(){
  document.querySelectorAll('.col-total').forEach(el=>{
    el.addEventListener('mousedown', (e)=>{
      arrasteHorizontalState = { el, inicioX: e.pageX, scrollInicial: el.scrollLeft };
      el.classList.add('dragging');
    });
  });
}
function renderCard(card){
  const temp = TEMPS[card.temperatura] || TEMPS.frio;
  const showMonth = filterMonth === null && card.mesInicioContato;
  return `
    <div class="card" draggable="true" data-card-id="${card.id}">
      <div class="card-drag-handle" title="Arraste para mover">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <circle cx="5" cy="3" r="1.4"/><circle cx="11" cy="3" r="1.4"/>
          <circle cx="5" cy="8" r="1.4"/><circle cx="11" cy="8" r="1.4"/>
          <circle cx="5" cy="13" r="1.4"/><circle cx="11" cy="13" r="1.4"/>
        </svg>
      </div>
      <div class="card-move-wrap">
        <button class="card-move-btn" data-action="toggle-move-menu" data-card-id="${card.id}" title="Mover pra outra coluna">${ICON_MOVE}</button>
      </div>
      <div class="card-main">
        <div class="card-perf"></div>
        <div class="card-body" data-action="open-edit-card" data-card-id="${card.id}">
          <div class="card-top">
            <span class="card-name">${card.tipoPessoa==='juridica' ? '🏢 ' : ''}${esc(card.cliente) || 'Sem nome'}</span>
            <span class="temp-badge" style="color:${temp.color};background:${temp.bg}">${temp.emoji} ${temp.label}</span>
          </div>
          <div class="card-value-row">
            ${card.fechamento && !card.fechamento.cancelado && Number(card.fechamento.valorFinal) !== Number(card.valor)
              ? `<span class="card-value" title="Valor final do fechamento (no card: ${fmtBRL(card.valor)})">${fmtBRL(card.fechamento.valorFinal)}</span>`
              : `<span class="card-value">${fmtBRL(card.valor)}</span>`}
            ${showMonth ? `<span class="month-badge">${monthLabel(card.mesInicioContato)}</span>` : ''}
          </div>
          ${(!card.fechamento || card.fechamento.cancelado) && card.fechamentoPendente && (board.columns.find(c=>c.id===card.columnId)||{}).tipo==='ganho'
            ? `<button type="button" class="fech-selo" data-action="abrir-fechamento" data-card-id="${card.id}" title="Informar o valor final e as parcelas">Falta o fechamento</button>` : ''}
          ${valorMudouDepoisDoFechamento(card) && (board.columns.find(c=>c.id===card.columnId)||{}).tipo==='ganho'
            ? `<button type="button" class="fech-selo" data-action="abrir-fechamento" data-card-id="${card.id}" title="No fechamento, o valor do card era ${fmtBRL(card.fechamento.valorOriginal)}">Valor mudou · refazer fechamento?</button>` : ''}
          ${(card.telefone || card.obs) ? `
            <div class="card-extra">
              ${card.telefone ? `
                <div class="card-phone-row">
                  <span class="phone-text">☎ ${esc(card.telefone)}</span>
                  <button class="wa-btn" data-action="open-whatsapp" data-phone="${esc(card.telefone)}" title="Abrir conversa no WhatsApp">
                    ${WA_ICON} WhatsApp
                  </button>
                </div>
              ` : ''}
              ${card.obs ? `<p>${esc(card.obs)}</p>` : ''}
            </div>
          ` : ''}
          ${(card.etiquetas||[]).length ? `<div class="etiquetas-pills">${card.etiquetas.map(et=>`<span class="etiqueta-pill">${esc(et)}</span>`).join('')}</div>` : ''}
        </div>
      </div>
    </div>
  `;
}

/* ---------- página: Leads ---------- */
function renderLeadsPage(){
  const leads = filteredLeads();
  const idsVisiveis = leads.map(c=>c.id);
  const todosSelecionados = idsVisiveis.length>0 && idsVisiveis.every(id=>leadsSelecionados.has(id));
  return `
    <div class="page-head">
      <div>
        <h1>Contatos</h1>
        <p>${board.cards.length} ${board.cards.length===1?'contato':'contatos'} na sua base</p>
      </div>
      <div class="page-head-actions">
        <button class="btn-outline ${mostrarArquivados?'active':''}" data-action="toggle-mostrar-arquivados" style="display:inline-flex; align-items:center; gap:6px;">${ICON_BAU} ${mostrarArquivados?'Voltar aos ativos':'Ver arquivados'}</button>
        <button class="btn-primary" data-action="open-new-lead">+ Novo contato</button>
      </div>
    </div>

    <div class="leads-toolbar">
      <input type="text" class="leads-search" id="leads-search-input" placeholder="Buscar por nome ou telefone" value="${esc(leadsSearch)}" />
      <select class="leads-filter" id="leads-status-filter" aria-label="Filtrar por situação">
        <option value="">Todos os status</option>
        ${board.columns.map(c=>`<option value="${c.id}" ${leadsStatusFilter===c.id?'selected':''}>${esc(c.nome)}</option>`).join('')}
      </select>
      ${renderBotaoOrdenar('leads', leadsOrdenarPor)}
      <button class="btn-outline" data-action="exportar-leads" title="Baixa a lista em Excel (.xlsx)">Exportar (.xlsx)</button>
      ${(()=>{ const n = gruposDuplicadosLocal(); return n && (!acessoCrm || acessoCrm.gestor) ? `<button class="btn-outline" data-action="abrir-duplicados" title="Contatos com o mesmo telefone">Duplicados (${n})</button>` : ''; })()}
    </div>

    ${leadsSelecionados.size ? `
      <div class="leads-bulk-bar">
        <span>${leadsSelecionados.size} selecionado${leadsSelecionados.size===1?'':'s'}</span>
        <select id="leads-bulk-coluna">
          <option value="">Mover para…</option>
          ${board.columns.map(c=>`<option value="${c.id}">${esc(c.nome)}</option>`).join('')}
        </select>
        <button class="btn-outline" data-action="leads-bulk-etiqueta">+ Etiqueta</button>
        ${leadsBulkEtiquetaAberta ? `
          <input type="text" id="leads-bulk-etiqueta-input" placeholder="Nome da etiqueta" value="${esc(leadsBulkEtiquetaValor)}" style="width:140px;" autofocus />
          <button class="btn-primary" data-action="leads-bulk-etiqueta-confirmar">Aplicar</button>
        ` : ''}
        <button class="btn-outline" data-action="leads-bulk-arquivar">📦 Arquivar</button>
        <button class="delete-link" data-action="leads-bulk-excluir">🗑 Excluir</button>
        <button class="icon-btn" data-action="leads-bulk-limpar" title="Cancelar seleção" style="margin-left:auto;">✕</button>
      </div>
    ` : ''}

    ${(()=>{
      const tipoDe = (c)=>{ const col = board.columns.find(k=>k.id===c.columnId); return col ? col.tipo : 'aberto'; };
      const lista = leadsTipoMobile ? leads.filter(c=> tipoDe(c) === leadsTipoMobile) : leads;
      const chips = [['', 'Todos'], ['aberto', 'Em negociação'], ['ganho', 'Vendidos'], ['perdido', 'Perdidos']];
      return `
    <div class="leads-chips-mobile" role="tablist" aria-label="Filtrar contatos">
      ${chips.map(([k,l])=>`<button type="button" role="tab" class="etapa-chip-mobile ${leadsTipoMobile===k?'active':''}" data-action="leads-tipo-mobile" data-tipo="${k}" aria-selected="${leadsTipoMobile===k}">${l} <span class="etapa-chip-qtd">${k ? leads.filter(c=> tipoDe(c)===k).length : leads.length}</span></button>`).join('')}
    </div>
    <div class="leads-cards-mobile">
      ${lista.length ? lista.map(c=>{
        const col = board.columns.find(k=>k.id===c.columnId);
        const tipo = col ? (TIPOS[col.tipo] || TIPOS.aberto) : TIPOS.aberto;
        const ini = (String(c.cliente||'?').trim().split(/\s+/).slice(0,2).map(p=>p.charAt(0)).join('') || '?').toUpperCase();
        return `
        <div class="lead-card-mobile" data-action="open-edit-card" data-card-id="${c.id}" role="button" tabindex="0">
          <span class="lead-card-avatar" aria-hidden="true">${esc(ini)}</span>
          <span class="lead-card-info">
            <span class="lead-card-top"><span class="lead-card-nome">${c.tipoPessoa==='juridica' ? '🏢 ' : ''}${esc(c.cliente) || 'Sem nome'}</span><span class="lead-card-valor">${fmtBRL(c.valor)}</span></span>
            <span class="lead-card-bot"><span class="lead-card-tel">${c.telefone ? esc(c.telefone) : 'Sem telefone'}</span><span class="badge" style="color:${tipo.color};background:${tipo.bg};${tipo.strike?'text-decoration:line-through;':''}">${col ? esc(col.nome) : '—'}</span></span>
          </span>
          ${c.telefone ? `<button type="button" class="lead-card-wa" data-action="open-whatsapp" data-phone="${esc(c.telefone)}" aria-label="WhatsApp de ${esc(c.cliente||'contato')}">${WA_ICON}</button>` : ''}
        </div>`;
      }).join('') : `<p class="dash-empty" style="padding:24px 4px;">Nenhum contato aqui. Cadastre no botão "Novo contato".</p>`}
    </div>
    <button type="button" class="fab-novo-lead" data-action="open-new-lead">+ Novo contato</button>`;
    })()}

    <div class="leads-table-wrap">
      <table class="leads-table">
        <thead>
          <tr>
            <th style="width:34px;"><span class="check-circle ${todosSelecionados?'checked':''}" data-action="leads-select-all">${todosSelecionados?ICON_CHECK:''}</span></th>
            <th>Nome</th><th>Contato</th><th>Etapa</th><th>Valor</th><th></th>
          </tr>
        </thead>
        <tbody>
          ${leads.length ? leads.map(c=>{
            const col = board.columns.find(k=>k.id===c.columnId);
            const tipo = col ? (TIPOS[col.tipo] || TIPOS.aberto) : TIPOS.aberto;
            const marcado = leadsSelecionados.has(c.id);
            return `
              <tr class="${marcado?'lead-row-selecionada':''}">
                <td><span class="check-circle ${marcado?'checked':''}" data-action="leads-select-um" data-card-id="${c.id}">${marcado?ICON_CHECK:''}</span></td>
                <td class="clickable" data-action="open-edit-card" data-card-id="${c.id}">${c.tipoPessoa==='juridica' ? '🏢 ' : ''}${esc(c.cliente) || 'Sem nome'}</td>
                <td class="clickable" data-action="open-edit-card" data-card-id="${c.id}">${c.telefone ? esc(c.telefone) : '—'}</td>
                <td class="clickable" data-action="open-edit-card" data-card-id="${c.id}"><span class="badge" style="color:${tipo.color};background:${tipo.bg};${tipo.strike?'text-decoration:line-through;':''}">${col ? esc(col.nome) : '—'}</span></td>
                <td class="clickable" data-action="open-edit-card" data-card-id="${c.id}">${fmtBRL(c.valor)}</td>
                <td>
                  <div class="leads-row-actions">
                    ${c.telefone ? `<button class="icon-btn" data-action="open-whatsapp" data-phone="${esc(c.telefone)}" title="WhatsApp">${WA_ICON}</button>` : ''}
                  </div>
                </td>
              </tr>
            `;
          }).join('') : `<tr class="leads-empty-row"><td colspan="6">Nenhum contato encontrado. Cadastre o primeiro no botão "Novo contato".</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}

/* ---------- página: Tarefas ---------- */
function closeAgendaDiaModal(){
  agendaDiaSelecionado = null;
  const root = document.getElementById('modal-root');
  if(root) root.innerHTML = '';
}
// Redesenha o modal do dia preservando a posição de rolagem da linha do tempo —
// usado depois de ações que não deveriam "pular" a visão de volta pro topo
// (colar, copiar, marcar como concluída).
function renderAgendaDiaModalPreservandoScroll(){
  const timelineEl = document.getElementById('agenda-dia-timeline');
  const scrollAnterior = timelineEl ? timelineEl.scrollTop : null;
  renderAgendaDiaModal();
  if(scrollAnterior!==null){
    const timelineEl2 = document.getElementById('agenda-dia-timeline');
    if(timelineEl2) timelineEl2.scrollTop = scrollAnterior;
  }
}
// "Tarefas do dia": cria na hora uma tarefa sem horário (só a data) direto do modal do
// dia, sem abrir o formulário completo. Os horários continuam sendo os detalhes.
let salvandoTarefaRapida = false;
async function adicionarTarefaRapidaDoDia(diaISO){
  const input = document.getElementById('agenda-dia-tarefa-rapida-input');
  const titulo = input ? input.value.trim() : '';
  if(!titulo || salvandoTarefaRapida) return;
  salvandoTarefaRapida = true;
  if(input) input.disabled = true;
  try{
    const nova = await apiRequest('POST', '/tasks', { titulo, vencimento: diaISO, prioridade:'media', leadId:null, descricao:'' });
    tasks.push(nova);
    atualizarTarefaNaAgendaLocal(nova);
    salvandoTarefaRapida = false;
    renderApp();
    if(agendaDiaSelecionado) renderAgendaDiaModalPreservandoScroll();
    const novoInput = document.getElementById('agenda-dia-tarefa-rapida-input');
    if(novoInput) novoInput.focus();
  }catch(e){
    salvandoTarefaRapida = false;
    if(input){ input.disabled = false; input.focus(); }
    errorMsg = 'Não foi possível adicionar a tarefa.';
    renderApp();
  }
}
function renderAgendaDiaModal(){
  const root = document.getElementById('modal-root');
  if(!agendaDiaSelecionado){ root.innerHTML=''; return; }
  const diaISO = agendaDiaSelecionado;
  const { tarefasDoDia, eventosDoDia } = itensDoDiaAgenda(diaISO);
  const dataObj = new Date(diaISO + 'T00:00:00');
  const dataLabel = dataObj.toLocaleDateString('pt-BR', { weekday:'long', day:'2-digit', month:'long' });

  function horaDaTarefa(t){
    const d = new Date(t.vencimento);
    if(isNaN(d.getTime()) || (d.getUTCHours()===0 && d.getUTCMinutes()===0)) return null;
    return d.getHours();
  }
  function horaDoEvento(e){
    if(e.diaInteiro || !e.inicio) return null;
    const d = new Date(e.inicio);
    return isNaN(d.getTime()) ? null : d.getHours();
  }

  const tarefasSemHora = tarefasDoDia.filter(t=>horaDaTarefa(t)===null);
  const eventosSemHora = eventosDoDia.filter(e=>horaDoEvento(e)===null);
  const porHora = Array.from({length:24}, ()=>({ tarefas:[], eventos:[] }));
  tarefasDoDia.forEach(t=>{ const h=horaDaTarefa(t); if(h!==null) porHora[h].tarefas.push(t); });
  eventosDoDia.forEach(e=>{ const h=horaDoEvento(e); if(h!==null) porHora[h].eventos.push(e); });

  function renderTarefaMini(t){
    return `
      <div class="agenda-dia-item" data-copiar-tarefa="${t.id}">
        <span class="check-circle ${t.concluida?'checked':''}" data-task-toggle="${t.id}">${t.concluida?ICON_CHECK:''}</span>
        <div style="flex:1;">
          <div class="agenda-dia-item-titulo ${t.concluida?'concluida':''}">${esc(t.titulo)}</div>
          ${t.clienteNome ? `<div class="agenda-dia-item-hora">👤 ${esc(t.clienteNome)}</div>` : ''}
        </div>
        <button class="icon-btn" data-task-edit="${t.id}" title="Editar">${ICON_EDIT}</button>
      </div>
    `;
  }
  function renderEventoMini(e){
    return `<div class="agenda-hora-evento" data-copiar-evento="${e.id}" data-editar-evento="${e.id}">📅 ${esc(e.titulo)}${e.clienteNome ? ` <span style="opacity:.7;">· 👤 ${esc(e.clienteNome)}</span>` : ''}</div>`;
  }

  const horaAtual = new Date().getHours();

  root.innerHTML = `
    <div class="overlay" id="agenda-dia-overlay">
      <div class="modal agenda-dia-modal">
        <div class="modal-head">
          <h3 style="text-transform:capitalize;">${esc(dataLabel)}</h3>
          <button id="agenda-dia-close">✕</button>
        </div>
        <div class="modal-body">
          ${tarefaCopiada ? `
            <div class="agenda-clipboard-hint">
              <span>Copiado: <b>${esc(tarefaCopiada.titulo)}</b> — ${modoSelecaoMultipla ? `selecione os horários e clique em "Colar" (${horariosSelecionados.size} marcado${horariosSelecionados.size===1?'':'s'})` : 'clique num horário vazio pra colar aqui'}</span>
              <button class="btn-outline" data-action="toggle-selecao-multipla">${modoSelecaoMultipla ? 'Cancelar seleção' : '☑ Selecionar vários'}</button>
              <button class="icon-btn" data-action="cancelar-tarefa-copiada" title="Cancelar cópia">✕</button>
            </div>
          ` : ''}
          <div class="agenda-dia-tarefas">
            <div class="agenda-dia-tarefas-head">
              <div class="settings-page-subtitle" style="margin:0;">Tarefas do dia</div>
              ${(tarefasSemHora.length + eventosSemHora.length) ? `<span class="agenda-dia-tarefas-progresso">${tarefasSemHora.filter(t=>t.concluida).length + eventosSemHora.filter(e=>e.concluida).length} de ${tarefasSemHora.length + eventosSemHora.length} concluída${(tarefasSemHora.length + eventosSemHora.length)===1?'':'s'}</span>` : ''}
            </div>
            ${eventosSemHora.map(e=>`
              <div class="agenda-dia-item" data-copiar-evento="${e.id}" data-editar-evento="${e.id}">
                <span class="check-circle ${e.concluida?'checked':''}" data-evento-toggle="${e.id}">${e.concluida?ICON_CHECK:''}</span>
                <div class="agenda-dia-item-titulo ${e.concluida?'concluida':''}" style="flex:1;">${esc(e.titulo)}</div>
              </div>
            `).join('')}
            ${tarefasSemHora.map(renderTarefaMini).join('')}
            ${(tarefasSemHora.length + eventosSemHora.length) ? '' : `<p class="agenda-dia-tarefas-vazio">Nenhuma tarefa para este dia ainda. Anote abaixo o que precisa ser feito.</p>`}
            <form class="agenda-dia-tarefa-rapida" id="agenda-dia-tarefa-rapida" autocomplete="off">
              <input type="text" id="agenda-dia-tarefa-rapida-input" maxlength="200" placeholder="+ Adicionar tarefa do dia" aria-label="Adicionar tarefa do dia" />
              <button type="submit" class="btn-outline">Adicionar</button>
            </form>
          </div>
          <div class="settings-page-subtitle" style="margin:0 0 8px;">Horários</div>
          <div class="agenda-dia-timeline" id="agenda-dia-timeline">
            ${porHora.map((conteudo, h)=>{
              const horaStr = `${String(h).padStart(2,'0')}:00`;
              const selecionada = horariosSelecionados.has(horaStr);
              return `
              <div class="agenda-hora-row ${h===horaAtual?'agenda-hora-atual':''} ${tarefaCopiada?'agenda-hora-colavel':''} ${selecionada?'agenda-hora-selecionada':''}" id="agenda-hora-${h}" data-action="nova-tarefa-nesta-hora" data-hora="${horaStr}">
                <span class="agenda-hora-label">${horaStr}</span>
                <div class="agenda-hora-conteudo">
                  ${conteudo.eventos.map(renderEventoMini).join('')}
                  ${conteudo.tarefas.map(t=>`
                    <span class="agenda-hora-tarefa ${t.concluida?'concluida':''}" data-task-edit-hora="${t.id}" data-copiar-tarefa="${t.id}">✓ ${esc(t.titulo)}</span>
                  `).join('')}
                  ${tarefaCopiada ? `<span class="agenda-hora-colar-hint">${modoSelecaoMultipla ? (selecionada?'✓ Selecionado':'+ Selecionar') : '+ Colar aqui'}</span>` : ''}
                </div>
              </div>
            `;}).join('')}
          </div>
        </div>
        <div class="modal-foot">
          ${(tarefasDoDia.length || eventosDoDia.length) ? `<button class="delete-link" id="agenda-dia-excluir-tudo">🗑 Excluir tudo desse dia</button>` : '<span></span>'}
          <div class="modal-foot-actions">
            ${modoSelecaoMultipla
              ? `<button class="btn-save" id="agenda-dia-colar-selecionados" ${horariosSelecionados.size===0?'disabled':''}>📥 Colar em ${horariosSelecionados.size} horário${horariosSelecionados.size===1?'':'s'}</button>`
              : `<button class="btn-save" id="agenda-dia-nova-tarefa">${tarefaCopiada ? 'Colar aqui' : '+ Nova tarefa nesse dia'}</button>`
            }
          </div>
        </div>
      </div>
    </div>
  `;

  document.getElementById('agenda-dia-close').addEventListener('click', closeAgendaDiaModal);
  document.getElementById('agenda-dia-overlay').addEventListener('click', (e)=>{ if(e.target.id==='agenda-dia-overlay') closeAgendaDiaModal(); });
  const excluirTudoBtn = document.getElementById('agenda-dia-excluir-tudo');
  if(excluirTudoBtn) excluirTudoBtn.addEventListener('click', ()=> excluirTudoDoDia(diaISO, tarefasDoDia, eventosDoDia));
  const novaTarefaBtn = document.getElementById('agenda-dia-nova-tarefa');
  if(novaTarefaBtn) novaTarefaBtn.addEventListener('click', ()=>{
    if(tarefaCopiada){ colarTarefaEm(diaISO); return; }
    closeAgendaDiaModal();
    openNewTask(diaISO);
  });
  const tarefaRapidaForm = document.getElementById('agenda-dia-tarefa-rapida');
  if(tarefaRapidaForm) tarefaRapidaForm.addEventListener('submit', (ev)=>{
    ev.preventDefault();
    adicionarTarefaRapidaDoDia(diaISO);
  });
  const toggleSelecaoBtn = root.querySelector('[data-action="toggle-selecao-multipla"]');
  if(toggleSelecaoBtn) toggleSelecaoBtn.addEventListener('click', ()=>{
    modoSelecaoMultipla = !modoSelecaoMultipla;
    horariosSelecionados.clear();
    renderAgendaDiaModal();
  });
  const colarSelecionadosBtn = document.getElementById('agenda-dia-colar-selecionados');
  if(colarSelecionadosBtn) colarSelecionadosBtn.addEventListener('click', colarEmHorariosSelecionados);
  root.querySelectorAll('[data-action="nova-tarefa-nesta-hora"]').forEach(row=>{
    row.addEventListener('click', ()=>{
      const hora = row.dataset.hora;
      if(modoSelecaoMultipla){
        if(horariosSelecionados.has(hora)) horariosSelecionados.delete(hora);
        else horariosSelecionados.add(hora);
        renderAgendaDiaModalPreservandoScroll();
        return;
      }
      if(tarefaCopiada){
        colarTarefaEm(diaISO, hora);
        return;
      }
      closeAgendaDiaModal();
      openNewTask(diaISO, hora);
    });
  });
  root.querySelectorAll('[data-task-edit-hora]').forEach(el=>{
    el.addEventListener('click', (e)=>{
      e.stopPropagation(); // não deixa o clique "vazar" pra linha da hora (que abriria nova tarefa)
      openEditTask(el.dataset.taskEditHora);
    });
  });
  root.querySelectorAll('[data-task-toggle]').forEach(el=>{
    el.addEventListener('click', async (e)=>{
      e.stopPropagation();
      await toggleTaskConcluida(el.dataset.taskToggle);
      renderAgendaDiaModalPreservandoScroll();
    });
  });
  root.querySelectorAll('[data-evento-toggle]').forEach(el=>{
    el.addEventListener('click', async (e)=>{
      e.stopPropagation();
      await toggleEventoConcluido(el.dataset.eventoToggle);
      renderAgendaDiaModalPreservandoScroll();
    });
  });
  root.querySelectorAll('[data-task-edit]').forEach(el=>{
    el.addEventListener('click', ()=>{
      openEditTask(el.dataset.taskEdit);
    });
  });
  ligarGestoDeCopiar(root.querySelectorAll('[data-copiar-tarefa]'), (el)=> copiarTarefa(el.dataset.copiarTarefa, el));
  ligarGestoDeCopiar(root.querySelectorAll('[data-copiar-evento]'), (el)=> copiarEvento(el.dataset.copiarEvento, el));
  root.querySelectorAll('[data-editar-evento]').forEach(el=>{
    el.addEventListener('click', (e)=>{
      e.stopPropagation(); // não deixa o clique vazar pra linha da hora (que abriria nova tarefa em branco)
      openEditEventoGoogle(el.dataset.editarEvento);
    });
  });
  const cancelarCopiaBtn = root.querySelector('[data-action="cancelar-tarefa-copiada"]');
  if(cancelarCopiaBtn) cancelarCopiaBtn.addEventListener('click', cancelarTarefaCopiada);

  // Rola a linha do tempo até perto da hora atual (ou a 1ª hora com algo marcado, se for antes)
  const primeiraComItem = porHora.findIndex(c=>c.tarefas.length||c.eventos.length);
  const horaAlvo = primeiraComItem !== -1 && primeiraComItem < horaAtual ? primeiraComItem : horaAtual;
  const linhaAlvo = document.getElementById(`agenda-hora-${Math.max(0, horaAlvo-1)}`);
  if(linhaAlvo) linhaAlvo.scrollIntoView({ block:'start' });
}

function renderTarefasPage(){
  const abas = [['calendario','Calendário'],['gerot','Rotina']];
  return `
    <div class="page-head">
      <div>
        <h1>Agenda/Tarefas</h1>
        <p>Tarefas do CRM, compromissos do Google Agenda e sua rotina semanal</p>
      </div>
      ${agendaSubTab==='calendario' ? `
        <div class="page-head-actions">
          ${calendarConnected ? `<button class="btn-outline" data-action="sync-calendar-now" ${calendarSyncing?'disabled':''}>${calendarSyncing?'Sincronizando…':'📅 Sincronizar Agenda'}</button>` : ''}
          <button class="btn-primary" data-action="open-new-task">+ Nova tarefa</button>
        </div>
      ` : ''}
    </div>
    <div class="funil-tabs" style="margin-bottom:20px;">
      ${abas.map(([key,label])=>`<button class="tab-btn ${agendaSubTab===key?'active':''}" data-action="set-agenda-subtab" data-subtab="${key}">${label}</button>`).join('')}
    </div>
    ${agendaSubTab==='calendario' ? renderCalendarioConteudo() : renderGerotConteudo()}
  `;
}
const GEROT_DIAS = ['Segunda','Terça','Quarta','Quinta','Sexta'];
const GEROT_HORARIOS = (()=>{ const lista=[]; for(let h=8; h<=19; h++){ lista.push(`${String(h).padStart(2,'0')}:00`); if(h<19) lista.push(`${String(h).padStart(2,'0')}:30`); } return lista; })();
const GEROT_LIMITES = [...GEROT_HORARIOS, '19:30']; // 24 limites (23 horários de início + o fim do último bloco) — usado pra calcular quantas linhas um bloco ocupa

// Monta, pra cada dia, um mapa horário -> { tipo: 'inicio'|'coberto'|'vazio', bloco, rowspan }.
// "inicio" é onde a célula mesclada nasce (rowspan cobre o resto); "coberto" são as
// linhas por baixo dela, que não desenham nada (já fazem parte da célula de cima).
function calcularGradeGerot(){
  const grade = {};
  for(let diaIdx=0; diaIdx<5; diaIdx++){
    grade[diaIdx] = {};
    GEROT_HORARIOS.forEach(h => grade[diaIdx][h] = { tipo:'vazio' });
    gerotBlocos.filter(b=>b.diaSemana===diaIdx).forEach(b=>{
      const idxInicio = GEROT_HORARIOS.indexOf(b.horarioInicio);
      const idxFim = GEROT_LIMITES.indexOf(b.horarioFim);
      if(idxInicio===-1 || idxFim===-1 || idxFim<=idxInicio) return;
      const rowspan = idxFim - idxInicio;
      grade[diaIdx][b.horarioInicio] = { tipo:'inicio', bloco:b, rowspan };
      for(let i=1;i<rowspan;i++) grade[diaIdx][GEROT_HORARIOS[idxInicio+i]] = { tipo:'coberto' };
    });
  }
  return grade;
}
function renderGerotConteudo(){
  const [ano,mes,dia] = gerotSemanaAtual.split('-').map(Number);
  const segunda = new Date(ano, mes-1, dia);
  const datasDaSemana = GEROT_DIAS.map((_,i)=>{ const d = new Date(segunda); d.setDate(d.getDate()+i); return d; });
  const labelSemana = `${datasDaSemana[0].toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})} a ${datasDaSemana[4].toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})}`;
  const grade = calcularGradeGerot();

  return `
    <div class="settings-page-section" style="margin-bottom:16px;">
      <p class="settings-page-note">Sua rotina semanal — planeje o que fazer em cada horário, de segunda a sexta. Diferente do calendário, isso não é sobre um dia específico: pense nela como um "molde" da sua semana ideal, que você ajusta quando precisar. Clique num horário livre pra criar um bloco (pode escolher até que horas ele vai), ou num bloco já preenchido pra editar.</p>
    </div>
    <div class="month-step-nav" style="margin-bottom:10px;">
      <button class="icon-btn" data-action="gerot-semana" data-delta="-1" title="Semana anterior">‹</button>
      <span>${labelSemana}</span>
      <button class="icon-btn" data-action="gerot-semana" data-delta="1" title="Próxima semana">›</button>
      <button class="btn-outline" data-action="gerot-hoje" style="margin-left:10px;">Essa semana</button>
      <button class="btn-outline" data-action="gerot-copiar-semana" style="margin-left:auto;" ${gerotCopiando?'disabled':''}>${gerotCopiando?'Copiando…':'📋 Copiar semana anterior'}</button>
    </div>
    <div style="display:flex; gap:8px; justify-content:flex-end; margin-bottom:16px;">
      <button class="btn-outline" data-action="gerot-exportar-planilha">⬇️ Exportar planilha</button>
      <input type="file" id="gerot-importar-input" accept=".xlsx,.xls" style="display:none;" />
      <button class="btn-outline" data-action="gerot-importar-planilha" ${gerotImportando?'disabled':''}>${gerotImportando?'Importando…':'⬆️ Importar planilha'}</button>
    </div>
    ${gerotImportMsg ? `<p class="settings-page-msg ${gerotImportMsg.tipo}" style="margin-bottom:14px;">${esc(gerotImportMsg.texto)}</p>` : ''}
    ${!gerotLoaded ? `<p class="settings-page-note">Carregando…</p>` : `
      <div class="gerot-grid-wrap">
        <table class="gerot-tabela">
          <thead>
            <tr>
              <th class="gerot-col-hora"></th>
              ${GEROT_DIAS.map((d,i)=>`<th>${d}<br><span class="gerot-data-cabecalho">${datasDaSemana[i].toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})}</span></th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${GEROT_HORARIOS.map(horario=>`
              <tr>
                <td class="gerot-col-hora">${horario}</td>
                ${GEROT_DIAS.map((_,diaIdx)=>{
                  const info = grade[diaIdx][horario];
                  if(info.tipo==='coberto') return '';
                  if(info.tipo==='inicio'){
                    const b = info.bloco;
                    return `<td class="gerot-celula gerot-celula-preenchida" rowspan="${info.rowspan}">
                      <button class="gerot-celula-btn" data-action="gerot-abrir-editor" data-dia="${diaIdx}" data-horario="${horario}" data-bloco-id="${b.id}">
                        <span class="gerot-bloco-horario">${b.horarioInicio}–${b.horarioFim}</span>
                        <span class="gerot-bloco-texto">${esc(b.texto)}</span>
                      </button>
                    </td>`;
                  }
                  return `<td class="gerot-celula"><button class="gerot-celula-btn" data-action="gerot-abrir-editor" data-dia="${diaIdx}" data-horario="${horario}"></button></td>`;
                }).join('')}
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      ${gerotEditor ? renderGerotEditorHtml() : ''}
    `}
  `;
}
function renderCalendarioConteudo(){
  if(!agendaLoaded){
    return `<p class="settings-page-note">Carregando…</p>`;
  }
  const [ano, mesNum] = agendaMesAtual.split('-').map(Number);
  const primeiroDia = new Date(ano, mesNum-1, 1);
  const diasNoMes = new Date(ano, mesNum, 0).getDate();
  const offsetInicio = primeiroDia.getDay(); // 0 = domingo
  const hojeISO = new Date().toISOString().slice(0,10);
  const semData = agendaTarefas.filter(t=>!t.vencimento);

  let celulas = [];
  for(let i=0;i<offsetInicio;i++) celulas.push(null);
  for(let d=1; d<=diasNoMes; d++) celulas.push(d);
  while(celulas.length % 7 !== 0) celulas.push(null);

  return `
    ${tarefaCopiada ? `
      <div class="agenda-clipboard-hint" style="margin-bottom:16px;">
        Copiado: <b>${esc(tarefaCopiada.titulo)}</b> — abra qualquer dia e clique num horário vazio pra colar
        <button class="icon-btn" data-action="cancelar-tarefa-copiada" title="Cancelar cópia">✕</button>
      </div>
    ` : ''}

    <div class="month-step-nav" style="margin-bottom:16px;">
      <button class="icon-btn" data-action="agenda-mes" data-delta="-1" title="Mês anterior">‹</button>
      <span>${monthLabel(agendaMesAtual, true)}</span>
      <button class="icon-btn" data-action="agenda-mes" data-delta="1" title="Próximo mês">›</button>
      <button class="btn-outline" data-action="agenda-hoje" style="margin-left:10px;">Hoje</button>
    </div>

    ${semData.length ? `
      <div class="agenda-sem-data">
        <span class="agenda-sem-data-label">Sem data:</span>
        ${semData.map(t=>`<button class="etiqueta-pill" data-action="open-edit-task" data-task-id="${t.id}">${esc(t.titulo)}</button>`).join('')}
      </div>
    ` : ''}

    <div class="agenda-grid">
      ${['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].map(d=>`<div class="agenda-grid-header">${d}</div>`).join('')}
      ${celulas.map(dia=>{
        if(dia===null) return `<div class="agenda-cell agenda-cell-vazia"></div>`;
        const diaISO = `${ano}-${String(mesNum).padStart(2,'0')}-${String(dia).padStart(2,'0')}`;
        const { tarefasDoDia, eventosDoDia } = itensDoDiaAgenda(diaISO);
        const totalItens = tarefasDoDia.length + eventosDoDia.length;
        const itensPreview = [
          ...eventosDoDia.map(e=>({tipo:'evento', texto: e.diaInteiro ? e.titulo : `${e.titulo}${e.inicio ? ' - '+formatHora(e.inicio) : ''}`})),
          ...tarefasDoDia.map(t=>({tipo:'tarefa', texto: t.titulo, concluida: t.concluida})),
        ].slice(0,3);
        const isHoje = diaISO === hojeISO;
        return `
          <div class="agenda-cell ${isHoje?'agenda-cell-hoje':''} ${totalItens?'tem-itens':''} ${diaISO===agendaDiaDestacado?'agenda-cell-destacada':''}" data-action="abrir-dia-agenda" data-dia="${diaISO}">
            <span class="agenda-cell-numero">${dia}</span>
            ${totalItens ? `
              <div class="agenda-cell-itens">
                ${itensPreview.map(it=>`<div class="agenda-item-mini agenda-item-${it.tipo} ${it.concluida?'concluida':''}">${esc(it.texto)}</div>`).join('')}
                ${totalItens > 3 ? `<div class="agenda-item-mais">+${totalItens-3} mais</div>` : ''}
              </div>
            ` : ''}
          </div>
        `;
      }).join('')}
    </div>
  `;
}

/* ---------- página: Comissões ---------- */
function renderComissoesPage(){
  if(!contratosLoaded){
    return `<div class="page-head"><div><h1>Comissões</h1><p>Carregando…</p></div></div>`;
  }
  const stats = comissoesStats();
  return `
    <div class="page-head">
      <div>
        <h1>Comissões</h1>
        <p>Previsão de recebimento por mês · ${monthLabel(comissoesMonth, true)}</p>
      </div>
      <div class="page-head-actions">
        <div class="month-step-nav">
          <button class="icon-btn" data-action="comissoes-mes" data-delta="-1" title="Mês anterior">‹</button>
          <span>${monthLabel(comissoesMonth, true)}</span>
          <button class="icon-btn" data-action="comissoes-mes" data-delta="1" title="Próximo mês">›</button>
        </div>
        ${renderBotaoOrdenar('comissoes', comissoesOrdenarPor, null, true)}
        <button class="icon-btn" data-action="open-regras-comissao" title="Regras de comissão">${ICON_SETTINGS}</button>
        <button class="btn-primary" data-action="open-new-contrato">+ Novo contrato</button>
      </div>
    </div>

    <div class="metric-grid">
      <div class="metric-card">
        <div class="metric-card-top"><span>Previsto este mês</span></div>
        <div class="metric-value">${fmtBRL(stats.previstoMes)}</div>
      </div>
      <div class="metric-card">
        <div class="metric-card-top"><span>Total ativo a receber</span></div>
        <div class="metric-value">${fmtBRL(stats.totalAtivo)}</div>
      </div>
      <div class="metric-card">
        <div class="metric-card-top"><span>Contratos cadastrados</span></div>
        <div class="metric-value">${stats.total}</div>
      </div>
    </div>

    ${contratos.length ? `
      <div class="contratos-list">
        ${ordenarPorCriterio(contratos, comissoesOrdenarPor, 'desc', null, 'date').map(c=>renderContratoCard(c)).join('')}
      </div>
    ` : `<div class="tasks-empty">Nenhum contrato de comissão cadastrado ainda.</div>`}
  `;
}

function renderContratoCard(c){
  const anchor = (c.date||'').slice(0,7);
  const idx = monthsBetween(anchor, comissoesMonth);
  const idxCancelamento = contratoIdxCancelamento(c);
  const parcelaAtual = Math.min(Math.max(idx+1, 0), c.parcelas, idxCancelamento===Infinity?c.parcelas:idxCancelamento);
  const limiteBarra = Math.min(c.parcelas, idxCancelamento);
  const pct = Math.max(0, Math.min(1, idx / limiteBarra));
  const status = c.canceladoNoMes
    ? `Cancelado a partir de ${monthLabel(c.canceladoNoMes, true)}`
    : (idx >= c.parcelas ? 'Contrato quitado' : idx < 0 ? 'Ainda não iniciado' : `Parcela ${parcelaAtual}/${c.parcelas} este mês`);
  const escopo = ESCOPOS[c.scope] || ESCOPOS.Pessoal;
  // contratos novos guardam o detalhe completo em "blocos" (N linhas, da regra usada);
  // contratos criados antes das regras editáveis não têm isso e caem no formato antigo
  const p2 = c.parcelas - c.parcelas1;
  const blocosHtml = (Array.isArray(c.blocos) && c.blocos.length)
    ? c.blocos.map(b=>`<div>🔹 ${b.parcelas} parcela${b.parcelas===1?'':'s'} de ${fmtBRL(b.value)} cada</div>`).join('')
    : (p2 > 0
      ? `<div>🔹 ${c.parcelas1} parcela${c.parcelas1===1?'':'s'} de ${fmtBRL(c.value)} cada</div><div>🔹 ${p2} parcela${p2===1?'':'s'} de ${fmtBRL(c.value2)} cada</div>`
      : `<div>🔹 ${c.parcelas1} parcela${c.parcelas1===1?'':'s'} de ${fmtBRL(c.value)} cada</div>`);
  return `
    <div class="contrato-card ${c.canceladoNoMes?'contrato-card-cancelado':''}">
      <div class="contrato-card-head">
        <div>
          <h3 class="contrato-card-title">${esc(c.desc)}</h3>
          <p class="contrato-card-note">
            <span class="badge" style="color:${escopo.color};background:${escopo.bg}">${escopo.label}</span>
            <span>· ${c.parcelas}x parcelas · Valor da venda: ${fmtBRL(c.valorVenda)}</span>
            ${c.geradoAutomaticamente ? `<span class="badge badge-neutral" title="Criada automaticamente quando o cliente entrou numa coluna de fechamento em Negociações">⚡ Gerada pelas Negociações</span>` : ''}
            ${c.canceladoNoMes ? `<span class="badge" style="color:var(--danger);background:var(--danger-soft)">Cancelado</span>` : ''}
          </p>
        </div>
        <div class="contrato-card-actions">
          <button class="icon-btn" data-action="${c.canceladoNoMes?'reativar-contrato':'cancelar-contrato'}" data-contrato-id="${c.id}" title="${c.canceladoNoMes?'Reativar comissão':'Marcar como cancelada'}">${c.canceladoNoMes?ICON_REATIVAR:ICON_CANCELAR}</button>
          <button class="icon-btn" data-action="open-edit-contrato" data-contrato-id="${c.id}" title="Editar">${ICON_EDIT}</button>
          <button class="icon-btn" data-action="delete-contrato" data-contrato-id="${c.id}" title="Excluir">${ICON_TRASH}</button>
        </div>
      </div>
      <div class="contrato-card-blocks">
        ${blocosHtml}
        <div class="contrato-card-total">Total líquido da comissão: ${fmtBRL(contratoTotal(c))}</div>
      </div>
      <div class="stage-bar-track"><div class="stage-bar-fill" style="width:${pct*100}%"></div></div>
      <div class="contrato-card-status">
        <span>${status}</span>
        <span>Início: ${monthLabel(anchor, true)}</span>
      </div>
    </div>
  `;
}

/* ---------- página: Configurações ---------- */
const CONFIG_CATEGORIAS = [
  { grupo: 'Conta', itens: [
    ['perfil', 'Seu perfil'],
    ['assinatura', 'Assinatura'],
    ['seguranca', 'Login e segurança'],
    ['aparencia', 'Aparência e acessibilidade'],
    ['notificacoes', 'Notificações'],
  ]},
  { grupo: 'Integrações', itens: [
    ['google-agenda', 'Google Agenda'],
    ['email', 'E-mail'],
    ['webhooks', 'Webhooks'],
    ['agendamento', 'Link de agendamento'],
  ]},
  { grupo: 'Dados', itens: [
    ['campos', 'Campos personalizados'],
    ['importar', 'Importar contatos'],
  ]},
  { grupo: 'Sistema', itens: [
    ['manutencao', 'Manutenção'],
  ]},
];

/* Faixa do teste grátis no topo do CRM: avisa quantos dias faltam e que está tudo liberado
   (plano Completo). Some quando a pessoa assina; fechar esconde até o dia seguinte. Quem
   chega da página de divulgação ("Quero uma demonstração") vê a versão de boas-vindas. */
const boasVindasTeste = new URLSearchParams(location.search).get('boasvindas') === '1';
if(boasVindasTeste){ try{ history.replaceState(null, '', location.pathname); }catch(e){} }
function hojeLocalISO(){ const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function renderFaixaTeste(){
  const s = assinaturaInfo;
  if(!s || !s.cobranca || !s.emTeste || s.temAssinatura) return '';
  let fechadaEm = null;
  try{ fechadaEm = localStorage.getItem('faixaTesteFechadaEm'); }catch(e){}
  if(!boasVindasTeste && fechadaEm === hojeLocalISO()) return '';
  const dias = s.diasDeTeste;
  const quanto = dias === 1 ? 'falta 1 dia' : `faltam ${dias} dias`;
  const titulo = boasVindasTeste ? `Bem-vindo ao Livro-Caixa! Você tem ${dias === 1 ? '1 dia' : `${dias} dias`} de teste grátis.` : `Teste grátis: ${quanto}.`;
  return `<div class="faixa-teste" role="status">
    <div><b>${titulo}</b> Está tudo liberado: CRM, Controle financeiro, PDV, equipe e assistente com IA. Não pedimos cartão; você só paga se quiser continuar depois do teste.</div>
    <div class="faixa-teste-acoes">
      <a class="btn-primary" href="assinatura.html?de=crm">Ver planos</a>
      <button type="button" class="faixa-teste-x" data-action="fechar-faixa-teste" aria-label="Fechar aviso do teste grátis">✕</button>
    </div>
  </div>`;
}

function renderConfigAssinatura(){
  const s = assinaturaInfo;
  const dataBR = (v)=> v ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(v) ? v + 'T12:00:00' : v).toLocaleDateString('pt-BR', { timeZone:'America/Sao_Paulo' }) : '—';
  const nomePlano = s && (s.planos||[]).find(p=>p.id===s.plano);
  let status = 'Carregando…';
  let detalhe = '';
  if(s){
    if(!s.cobranca){ status = 'Liberado'; detalhe = 'A cobrança ainda não está ligada neste servidor.'; }
    else if(s.status === 'cortesia'){ status = 'Cortesia'; detalhe = 'Sua conta está liberada sem cobrança.'; }
    else if(s.emTeste){ status = 'Teste grátis'; detalhe = `Tudo liberado até ${dataBR(s.testeAte)}${s.temAssinatura ? `. Plano escolhido: ${esc(nomePlano ? nomePlano.nome : s.plano)}` : '. Escolha um plano para continuar depois do teste'}.`; }
    else{
      const rotulos = { aguardando:'Aguardando pagamento', ativa:'Ativa', atrasada:'Pagamento atrasado', cancelada:'Cancelada' };
      status = `${nomePlano ? 'Plano ' + nomePlano.nome : ''} · ${rotulos[s.status] || s.status}`;
      detalhe = s.pagoAte ? `${s.status === 'cancelada' ? 'Acesso até' : 'Pago até'} ${dataBR(s.pagoAte)}.` : '';
      if(s.proximoVencimento && s.status !== 'cancelada') detalhe += ` Próximo vencimento: ${dataBR(s.proximoVencimento)}.`;
    }
  }
  return `
    <div class="settings-page-section">
      <h3>Assinatura</h3>
      <div class="settings-page-row"><span>Situação</span><span>${esc(status)}</span></div>
      ${detalhe ? `<p class="settings-page-note">${detalhe}</p>` : ''}
      ${s && s.cobranca && s.status !== 'cortesia' ? `<a class="btn-primary" href="assinatura.html?de=crm" style="display:inline-block;text-decoration:none">${s.temAssinatura ? 'Gerenciar assinatura' : 'Ver planos e assinar'}</a>` : ''}
      <p class="settings-page-note">O pagamento é feito pelo Asaas (Pix, boleto ou cartão). O Livro-Caixa nunca vê nem guarda os dados do seu cartão.</p>
    </div>
  `;
}

function renderConfigPerfil(){
  const temFoto = !!(currentUser && currentUser.avatarUrl);
  return `
    <div class="settings-page-section">
      <h3>Seu perfil</h3>
      <div class="avatar-upload-row">
        <div class="avatar-preview avatar-preview-interativo" id="avatar-preview" title="${temFoto?'Segure pra ver a foto · clique pra trocar':'Clique pra adicionar uma foto'}">
          ${temFoto ? `<img src="${currentUser.avatarUrl}" alt="Foto de perfil" />` : esc(iniciaisDoNome((currentUser&&currentUser.nome)||''))}
          <div class="avatar-hover-overlay">${ICON_CAMERA}</div>
        </div>
        <div>
          <input type="file" id="avatar-input" accept="image/png,image/jpeg,image/webp" style="display:none;" />
          <div class="settings-btn-row">
            <button class="btn-outline" data-action="abrir-editar-perfil" ${avatarSalvando?'disabled':''}>${avatarSalvando?'Enviando…':'Editar perfil'}</button>
            ${temFoto ? `<button class="btn-outline" id="avatar-remover-btn" ${avatarSalvando?'disabled':''}>Remover foto</button>` : ''}
          </div>
          <p class="settings-page-note">Clique na foto pra trocar${temFoto?', ou segure pra ver ela maior':''}.</p>
        </div>
      </div>
      ${avatarMsg ? `<p class="settings-page-msg ${avatarMsg.tipo}">${esc(avatarMsg.texto)}</p>` : ''}
      <div class="settings-page-row"><span>Nome</span><span>${esc((currentUser && currentUser.nome) || '—')}</span></div>
      <div class="settings-page-row"><span>E-mail</span><span class="settings-row-valor">${esc((currentUser && currentUser.email) || '—')}${(!acessoCrm || acessoCrm.tipo === 'dono') ? ` <button class="btn-link" data-action="trocar-email">Trocar</button>` : ''}</span></div>

      <div class="settings-sep-line"></div>

      <div class="settings-page-subtitle">Sessões ativas</div>
      <p class="settings-page-note">Desconecte todos os dispositivos onde você está logado — útil se perdeu um aparelho ou compartilhou sua senha. Você vai precisar entrar de novo aqui também.</p>
      ${logoutAllMsg ? `<p class="settings-page-msg ${logoutAllMsg.tipo}">${esc(logoutAllMsg.texto)}</p>` : ''}
      <button class="btn-danger" data-action="desconectar-todos" ${logoutAllEnviando?'disabled':''}>${logoutAllEnviando?'Desconectando…':'Desconectar todos os dispositivos'}</button>
    </div>
  `;
}

function renderConfigSeguranca(){
  return `
    <div class="settings-page-section">
      <h3>Login e segurança</h3>
      <div class="settings-page-row">
        <span>Senha</span>
        <button class="btn-outline" data-action="abrir-alterar-senha">Mudar senha</button>
      </div>

      <div class="settings-sep-line"></div>

      <div class="settings-page-subtitle">Verificação em duas etapas (2FA)</div>
      ${renderSecao2FA()}

      <div class="settings-sep-line"></div>

      <button class="settings-page-row auditoria-toggle" data-action="toggle-auditoria" style="width:100%; border:none; border-bottom:1px solid var(--line); background:none; cursor:pointer; font-family:inherit;">
        <span class="settings-page-subtitle" style="margin:0;">Log de auditoria</span>
        <span class="auditoria-toggle-seta ${auditoriaExpandida?'aberta':''}">▾</span>
      </button>
      ${auditoriaExpandida ? `
        <p class="settings-page-note">Últimos eventos de segurança da sua conta.</p>
        ${!auditoriaCarregada ? `<p class="settings-page-note">Carregando…</p>` : (auditoriaEventos.length ? `
          <div class="historico-lista">
            ${auditoriaEventos.map(e=>`
              <div class="historico-item">
                <span class="historico-item-texto">${esc(e.detalhe || e.acao)}</span>
                <span class="historico-item-data">${formatDateHora(e.createdAt)}</span>
              </div>
            `).join('')}
          </div>
        ` : `<p class="dash-empty">Nenhum evento registrado ainda.</p>`)}
      ` : ''}
    </div>
  `;
}

function renderConfigAparencia(){
  return `
    <div class="settings-page-section">
      <h3>Modo noturno e cor de destaque</h3>
      <label class="settings-toggle-row">
        <span>Modo noturno</span>
        <span class="switch ${getDarkMode()?'on':''}" data-action="toggle-dark-mode">
          <span class="switch-knob"></span>
        </span>
      </label>
      <div class="settings-page-subtitle">Cor de destaque</div>
      <div class="theme-swatches">
        ${ACCENT_PRESETS.map(cor=>`<button class="theme-swatch ${getAccentColor().toLowerCase()===cor.toLowerCase()?'active':''}" data-action="set-accent" data-color="${cor}" style="background:${cor}" title="${cor}"></button>`).join('')}
      </div>
      <label class="theme-custom-label">
        Outra cor
        <input type="color" id="theme-custom-input" value="${getAccentColor()}" />
      </label>
    </div>
    <div class="settings-page-section">
      <h3>Acessibilidade</h3>
      <div data-a11y-painel></div>
    </div>
  `;
}


function renderConfigGoogleAgenda(){
  return `
    <div class="settings-page-section">
      <h3>Google Agenda</h3>
      <div class="settings-page-row">
        <span>Status</span>
        <span>${calendarConnected ? '✓ Conectada' : 'Não conectada'}</span>
      </div>
      ${calendarConnected
        ? `
          <div class="settings-btn-row">
            <button class="btn-outline" data-action="sync-calendar-now" ${calendarSyncing?'disabled':''}>${calendarSyncing?'Sincronizando…':'Sincronizar agora'}</button>
            <button class="btn-outline" data-action="disconnect-calendar">Desconectar</button>
          </div>
        `
        : (integracoesConfig.planoSemGoogleAgenda
          ? `<p class="settings-page-note">A integração com o Google Agenda faz parte do plano Completo. <a href="assinatura.html?de=crm">Ver planos</a>. O link de agenda abaixo funciona em todos os planos.</p>`
          : integracoesConfig.googleAgenda
          ? `<button class="btn-primary" data-action="connect-calendar">Conectar Google Agenda</button>`
          : `<p class="settings-page-note">Essa integração não está configurada neste servidor — use o link de agenda abaixo como alternativa (funciona com Google, Apple, Outlook e outros).</p>`)
      }
    </div>
    <div class="settings-page-section">
      <h3>Agenda por link (.ics)</h3>
      <p class="settings-page-note">Gera um link que qualquer app de calendário (Google, Apple, Outlook…) pode "assinar" pra ver suas tarefas automaticamente — sem precisar conectar conta nenhuma. É a alternativa que não depende de nenhuma configuração especial deste servidor.</p>
      ${icsCarregando ? `<p class="settings-page-note">Carregando…</p>` : (icsStatus && icsStatus.ativo ? `
        <div class="field">
          <label>Seu link de agenda</label>
          <input type="text" id="ics-url" value="${esc(icsStatus.url)}" readonly onclick="this.select()" />
        </div>
        <div class="settings-btn-row">
          <button class="btn-outline" data-action="copiar-link-ics">Copiar link</button>
          <button class="btn-outline" data-action="gerar-link-ics" ${icsGerando?'disabled':''}>${icsGerando?'Gerando…':'Gerar novo link'}</button>
          <button class="btn-outline" data-action="revogar-link-ics">Revogar</button>
        </div>
      ` : `<button class="btn-primary" data-action="gerar-link-ics" ${icsGerando?'disabled':''}>${icsGerando?'Gerando…':'Gerar link de agenda'}</button>`)}
    </div>
  `;
}


function renderConfigWebhooks(){
  return `
    <div class="settings-page-section">
      <h3>Webhooks (Zapier, Make, n8n...)</h3>
      <p class="settings-page-note">Conecte o painel com qualquer outra ferramenta que aceite receber um POST — Zapier ("Webhooks by Zapier"), Make, n8n, ou o que você já usa. Toda vez que o evento escolhido acontecer, mandamos os dados pra sua URL.</p>
      ${webhooksSaidaMsg ? `<p class="settings-page-msg ${webhooksSaidaMsg.tipo}">${esc(webhooksSaidaMsg.texto)}</p>` : ''}
      <div class="disparo-lista-leads" style="max-height:none; margin-bottom:12px;">
        ${webhooksSaida.length ? webhooksSaida.map(w=>`
          <div class="disparo-lead-item" style="cursor:default; flex-direction:column; align-items:stretch; gap:6px;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span><b>${esc(w.nome||'Sem nome')}</b> ${!w.ativo?'<span class="settings-page-note">(pausado)</span>':''}</span>
              <div class="settings-btn-row">
                <button class="btn-outline" data-action="testar-webhook-saida" data-webhook-id="${w.id}">Testar</button>
                <button class="btn-outline" data-action="toggle-webhook-saida" data-webhook-id="${w.id}" data-ativo="${w.ativo?'0':'1'}">${w.ativo?'Pausar':'Ativar'}</button>
                <button class="delete-link" data-action="excluir-webhook-saida" data-webhook-id="${w.id}">🗑</button>
              </div>
            </div>
            <span class="settings-page-note" style="word-break:break-all;">${esc(w.url)}</span>
            <span class="settings-page-note">Eventos: ${w.eventos.map(ev=>ROTULOS_EVENTOS_WEBHOOK[ev]||ev).join(', ')}${w.ultimoEnvioEm?` · Último disparo: ${formatDateHora(w.ultimoEnvioEm)} (${w.ultimoEnvioStatus==='ok'?'✅':'⚠️'})`:''}</span>
          </div>
        `).join('') : '<p class="dash-empty">Nenhum webhook cadastrado ainda.</p>'}
      </div>
      <div class="field">
        <label>Nome (só pra identificar)</label>
        <input type="text" id="novo-webhook-nome" placeholder="Ex: Zapier - novo contato" />
      </div>
      <div class="field">
        <label>URL de destino</label>
        <input type="text" id="novo-webhook-url" placeholder="https://hooks.zapier.com/..." />
      </div>
      <div class="field">
        <label>Quando disparar</label>
        <div class="checkbox-group">
          ${Object.entries(ROTULOS_EVENTOS_WEBHOOK).map(([key,label])=>`
            <label class="checkbox-item"><input type="checkbox" class="novo-webhook-evento" value="${key}" /> ${label}</label>
          `).join('')}
        </div>
      </div>
      <button class="btn-outline" data-action="criar-webhook-saida">+ Adicionar webhook</button>
    </div>
  `;
}

function renderConfigAgendamento(){
  return `
    <div class="settings-page-section">
      <h3>Link de agendamento</h3>
      <p class="settings-page-note">Um link público onde o cliente escolhe um horário livre e marca sozinho — sem precisar trocar mensagem pra combinar dia e hora. Confere disponibilidade nas suas tarefas e, se conectado, no seu Google Agenda também.</p>
      ${agendamentoPublicoMsg ? `<p class="settings-page-msg ${agendamentoPublicoMsg.tipo}">${esc(agendamentoPublicoMsg.texto)}</p>` : ''}
      <div class="settings-page-row">
        <span>Ativar link de agendamento</span>
        <span class="switch ${agendamentoPublicoForm.ativo?'on':''}" data-action="toggle-agendamento-publico-ativo"><span class="switch-knob"></span></span>
      </div>
      ${agendamentoPublicoForm.ativo ? `
        <div class="settings-page-row">
          <span>Seu link</span>
          <span style="display:flex; gap:8px; align-items:center;">
            <span class="settings-page-note" style="font-family:'IBM Plex Mono',monospace;">${window.location.origin}/agendar/${currentUser.id}</span>
            <button class="btn-outline" data-action="copiar-link-agendamento">Copiar</button>
          </span>
        </div>
      ` : ''}
      <div class="field-row" style="margin-top:12px;">
        <div class="field"><label>Início do expediente</label><input type="time" id="ap-hora-inicio" value="${agendamentoPublicoForm.horaInicio}" /></div>
        <div class="field"><label>Fim do expediente</label><input type="time" id="ap-hora-fim" value="${agendamentoPublicoForm.horaFim}" /></div>
        <div class="field">
          <label>Duração de cada horário</label>
          <select id="ap-duracao">
            ${[15,30,45,60].map(min=>`<option value="${min}" ${agendamentoPublicoForm.duracaoMinutos===min?'selected':''}>${min} min</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="field">
        <label>Dias da semana</label>
        <div class="checkbox-group" style="flex-direction:row; flex-wrap:wrap; gap:12px;">
          ${['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].map((label,i)=>`
            <label class="checkbox-item"><input type="checkbox" class="ap-dia-semana" value="${i}" ${agendamentoPublicoForm.diasSemana.includes(i)?'checked':''}/> ${label}</label>
          `).join('')}
        </div>
      </div>
      <div class="field">
        <label>Cliente novo entra em qual coluna do funil?</label>
        <select id="ap-coluna-destino">
          <option value="">Não criar cliente novo automaticamente</option>
          ${board.columns.map(c=>`<option value="${c.id}" ${agendamentoPublicoForm.colunaDestinoId===c.id?'selected':''}>${esc(c.nome)}</option>`).join('')}
        </select>
      </div>
      <button class="btn-outline" data-action="salvar-agendamento-publico">Salvar</button>
    </div>
  `;
}

function renderConfigCampos(){
  return `
    <div class="settings-page-section">
      <h3>Campos personalizados</h3>
      <p class="settings-page-note">Campos extras que aparecem no modal de cada cliente (ex: CPF, data de nascimento).</p>
      ${!camposPersonalizadosCarregados ? `<p class="settings-page-note">Carregando…</p>` : (camposPersonalizados.length ? `
        <div class="campos-lista">
          ${camposPersonalizados.map(c=>`
            <div class="campo-item">
              <span>${esc(c.nome)} <span class="settings-page-note">(${c.tipo})</span></span>
              <button class="icon-btn" data-action="excluir-campo-personalizado" data-campo-id="${c.id}" title="Excluir">${ICON_TRASH}</button>
            </div>
          `).join('')}
        </div>
      ` : `<p class="dash-empty">Nenhum campo personalizado ainda.</p>`)}
      <div class="field-row" style="margin-top:12px;">
        <div class="field"><label>Nome do campo</label><input type="text" id="novo-campo-nome" value="${esc(novoCampoNome)}" placeholder="Ex: CPF" /></div>
        <div class="field">
          <label>Tipo</label>
          <select id="novo-campo-tipo">
            <option value="texto" ${novoCampoTipo==='texto'?'selected':''}>Texto</option>
            <option value="numero" ${novoCampoTipo==='numero'?'selected':''}>Número</option>
            <option value="data" ${novoCampoTipo==='data'?'selected':''}>Data</option>
          </select>
        </div>
      </div>
      ${camposPersonalizadosMsg ? `<p class="settings-page-msg ${camposPersonalizadosMsg.tipo}">${esc(camposPersonalizadosMsg.texto)}</p>` : ''}
      <button class="btn-outline" data-action="criar-campo-personalizado">+ Adicionar campo</button>
    </div>
  `;
}

function renderConfigImportar(){
  return `
    <div class="settings-page-section">
      <h3>Importar contatos</h3>
      <p class="settings-page-note">Envie uma planilha (.xlsx) ou CSV com as colunas <b>Nome, Telefone, Valor</b> (nessa ordem, cabeçalho na primeira linha). Para escolher as colunas de qualquer planilha, use a aba Importar/Exportar.</p>
      <div class="field">
        <label>Coluna de destino</label>
        <select id="import-coluna">
          ${board.columns.map(c=>`<option value="${c.id}" ${importColumnId===c.id?'selected':''}>${esc(c.nome)}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label>Arquivo (.xlsx ou .csv)</label>
        <label class="btn-outline btn-arquivo" style="align-self:flex-start">Escolher arquivo<input type="file" id="import-arquivo" accept=".csv,.xlsx,.xls,text/csv" hidden /></label>
        <span class="arquivo-nome" id="import-arquivo-nome">Nenhum arquivo escolhido</span>
      </div>
      ${importResultado ? `<p class="settings-page-msg ok">${importResultado.sucesso} contato(s) importado(s)${importResultado.falha ? `, ${importResultado.falha} falharam` : ''}.</p>` : ''}
      <button class="btn-primary" id="import-btn" ${importando?'disabled':''}>${importando?'Importando…':'Importar'}</button>
    </div>
  `;
}

/* ---------- Notificações push (neste aparelho) ---------- */
let pushEstado = { carregado:false, suportado:false, permissao:'default', inscrito:false, ocupado:false, msg:null };

function pushSuportado(){
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}
function urlBase64ParaUint8(base64){
  const pad = '='.repeat((4 - base64.length % 4) % 4);
  const b64 = (base64 + pad).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  return Uint8Array.from([...raw].map(c=> c.charCodeAt(0)));
}
async function carregarEstadoPush(){
  pushEstado.suportado = pushSuportado();
  if(pushEstado.suportado){
    pushEstado.permissao = Notification.permission;
    try{
      const reg = await navigator.serviceWorker.ready;
      pushEstado.inscrito = !!(await reg.pushManager.getSubscription());
    }catch(e){ pushEstado.inscrito = false; }
  }
  pushEstado.carregado = true;
  renderApp();
}
async function ativarPush(){
  if(pushEstado.ocupado) return;
  pushEstado.ocupado = true; pushEstado.msg = null; renderApp();
  try{
    const permissao = await Notification.requestPermission();
    pushEstado.permissao = permissao;
    if(permissao !== 'granted') throw new Error('Permissão negada. Libere as notificações deste site nas configurações do navegador e tente de novo.');
    const { publicKey } = await apiRequest('GET', '/push/chave');
    if(!publicKey) throw new Error('O servidor ainda não tem as chaves de notificação configuradas.');
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if(!sub){
      sub = await reg.pushManager.subscribe({ userVisibleOnly:true, applicationServerKey: urlBase64ParaUint8(publicKey) });
    }
    await apiRequest('POST', '/push/inscrever', { subscription: sub.toJSON() });
    pushEstado.inscrito = true;
    pushEstado.msg = { tipo:'ok', texto:'Notificações ativadas neste aparelho. Use "Enviar teste" pra conferir.' };
  }catch(e){
    pushEstado.msg = { tipo:'erro', texto: e.message || 'Não foi possível ativar as notificações.' };
  }
  pushEstado.ocupado = false; renderApp();
}
async function desativarPush(){
  if(pushEstado.ocupado) return;
  pushEstado.ocupado = true; pushEstado.msg = null; renderApp();
  try{
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if(sub){
      try{ await apiRequest('POST', '/push/cancelar', { endpoint: sub.endpoint }); }catch(e){ /* segue e cancela localmente */ }
      await sub.unsubscribe();
    }
    pushEstado.inscrito = false;
    pushEstado.msg = { tipo:'ok', texto:'Notificações desativadas neste aparelho.' };
  }catch(e){
    pushEstado.msg = { tipo:'erro', texto: e.message || 'Não foi possível desativar.' };
  }
  pushEstado.ocupado = false; renderApp();
}
async function testarPush(){
  if(pushEstado.ocupado) return;
  pushEstado.ocupado = true; pushEstado.msg = null; renderApp();
  try{
    const r = await apiRequest('POST', '/push/testar');
    pushEstado.msg = r && r.enviados > 0
      ? { tipo:'ok', texto:'Teste enviado! Em instantes deve aparecer uma notificação.' }
      : { tipo:'erro', texto:'Nenhum aparelho inscrito foi encontrado. Ative as notificações primeiro.' };
  }catch(e){
    pushEstado.msg = { tipo:'erro', texto: e.message || 'Não foi possível enviar o teste.' };
  }
  pushEstado.ocupado = false; renderApp();
}

function renderConfigNotificacoes(){
  if(!pushEstado.carregado){ carregarEstadoPush(); }
  let corpo;
  if(!integracoesConfig.push){
    corpo = `<p class="settings-page-note">As notificações ainda não foram configuradas neste servidor (faltam as chaves VAPID nas variáveis de ambiente). Veja o README.</p>`;
  } else if(!pushEstado.carregado){
    corpo = `<p class="settings-page-note">Verificando este aparelho…</p>`;
  } else if(!pushEstado.suportado){
    corpo = `<p class="settings-page-note">Este navegador não suporta notificações com o app fechado. No iPhone, primeiro adicione o painel à Tela de Início (Compartilhar → Adicionar à Tela de Início) e abra por lá.</p>`;
  } else if(pushEstado.permissao === 'denied'){
    corpo = `<p class="settings-page-note">As notificações estão bloqueadas para este site. Libere nas configurações do navegador (cadeado ao lado do endereço) e volte aqui.</p>`;
  } else {
    corpo = `
      <p class="settings-page-note">Avisa no celular ou computador na hora das suas tarefas, mesmo com o app fechado. A ativação vale só para este aparelho.</p>
      <p class="settings-page-note"><strong>Situação:</strong> ${pushEstado.inscrito ? 'ativadas neste aparelho ✅' : 'desativadas neste aparelho'}</p>
      ${pushEstado.msg ? `<p class="settings-page-msg ${pushEstado.msg.tipo}">${esc(pushEstado.msg.texto)}</p>` : ''}
      ${pushEstado.inscrito
        ? `<button class="btn-outline" data-action="push-testar" ${pushEstado.ocupado?'disabled':''}>Enviar teste</button>
           <button class="btn-outline" data-action="push-desativar" ${pushEstado.ocupado?'disabled':''}>Desativar</button>`
        : `<button class="btn-primary" data-action="push-ativar" ${pushEstado.ocupado?'disabled':''}>${pushEstado.ocupado?'Ativando…':'Ativar neste aparelho'}</button>`}
    `;
  }
  return `
    <div class="settings-page-section">
      <h3>Notificações no aparelho</h3>
      ${corpo}
    </div>
  `;
}

/* ---------- Resumo diário por e-mail ---------- */
let resumoDiario = { carregado:false, disponivel:false, ativo:false, email:'', ocupado:false, msg:null };
async function carregarResumoDiario(){
  resumoDiario.carregado = true;
  try{
    const d = await apiRequest('GET', '/resumo-diario');
    resumoDiario = { ...resumoDiario, ativo: !!d.ativo, disponivel: !!d.emailDisponivel, email: d.email || '' };
  }catch(e){ resumoDiario.disponivel = false; }
  renderApp();
}
async function alternarResumoDiario(){
  if(resumoDiario.ocupado) return;
  resumoDiario.ocupado = true; resumoDiario.msg = null; renderApp();
  try{
    const d = await apiRequest('PUT', '/resumo-diario', { ativo: !resumoDiario.ativo });
    resumoDiario.ativo = !!d.ativo;
    resumoDiario.msg = { tipo:'ok', texto: resumoDiario.ativo ? 'Pronto: você vai receber o resumo todo dia útil de manhã.' : 'Resumo diário desativado.' };
  }catch(e){
    resumoDiario.msg = { tipo:'erro', texto: e.message || 'Não foi possível alterar.' };
  }
  resumoDiario.ocupado = false; renderApp();
}
async function enviarResumoDiarioAgora(){
  if(resumoDiario.ocupado) return;
  resumoDiario.ocupado = true; resumoDiario.msg = null; renderApp();
  try{
    await apiRequest('POST', '/resumo-diario/enviar-agora', undefined, 60000);
    resumoDiario.msg = { tipo:'ok', texto:'Resumo enviado para ' + (resumoDiario.email || 'o seu e-mail') + '.' };
  }catch(e){
    resumoDiario.msg = { tipo:'erro', texto: e.message || 'Não foi possível enviar agora.' };
  }
  resumoDiario.ocupado = false; renderApp();
}
function renderBlocoResumoDiario(){
  if(!resumoDiario.carregado){ carregarResumoDiario(); return ''; }
  if(!resumoDiario.disponivel) return '';
  return `
    <div class="settings-page-section">
      <h3>Resumo diário</h3>
      <p class="settings-page-note">Todo dia útil, a partir das 8h, enviamos para <strong>${esc(resumoDiario.email)}</strong> um resumo: tarefas de hoje e atrasadas, negociações paradas há mais de 7 dias na mesma etapa, contatos novos das últimas 24h e a meta do mês.${equipe && equipe.souSupervisor ? ' Como gestor da equipe, você também recebe um quadro com os números de cada pessoa.' : ''}</p>
      <p class="settings-page-note">Situação: <strong>${resumoDiario.ativo?'ligado':'desligado'}</strong></p>
      ${resumoDiario.msg ? `<p class="settings-page-msg ${resumoDiario.msg.tipo}">${esc(resumoDiario.msg.texto)}</p>` : ''}
      <div class="settings-btn-row">
        <button class="btn-outline" data-action="resumo-diario-alternar" ${resumoDiario.ocupado?'disabled':''}>${resumoDiario.ativo?'Desligar resumo diário':'Ligar resumo diário'}</button>
        <button class="btn-outline" data-action="resumo-diario-agora" ${resumoDiario.ocupado?'disabled':''}>${resumoDiario.ocupado?'Aguarde…':'Enviar um agora (teste)'}</button>
      </div>
    </div>
  `;
}

/* ---------- Tarefas por e-mail ---------- */
let emailTarefas = { carregado:false, disponivel:false, ativo:false, email:'', ocupado:false, msg:null };
async function carregarEmailTarefas(){
  emailTarefas.carregado = true;
  try{
    const d = await apiRequest('GET', '/tasks/config/email');
    emailTarefas = { ...emailTarefas, ativo: !!d.ativo, disponivel: !!d.emailDisponivel, email: d.email || '' };
  }catch(e){ emailTarefas.disponivel = false; }
  renderApp();
}
async function alternarEmailTarefas(){
  if(emailTarefas.ocupado) return;
  emailTarefas.ocupado = true; emailTarefas.msg = null; renderApp();
  try{
    const d = await apiRequest('PUT', '/tasks/config/email', { ativo: !emailTarefas.ativo });
    emailTarefas.ativo = !!d.ativo;
    emailTarefas.msg = { tipo:'ok', texto: emailTarefas.ativo ? 'Pronto: você vai receber as tarefas por e-mail.' : 'E-mails de tarefas desligados.' };
  }catch(e){
    emailTarefas.msg = { tipo:'erro', texto: e.message || 'Não foi possível alterar.' };
  }
  emailTarefas.ocupado = false; renderApp();
}
function renderBlocoEmailTarefas(){
  if(!emailTarefas.carregado){ carregarEmailTarefas(); return ''; }
  if(!emailTarefas.disponivel) return '';
  return `
    <div class="settings-page-section">
      <h3>Tarefas por e-mail</h3>
      <p class="settings-page-note">Ao criar uma tarefa com data, enviamos um e-mail para <strong>${esc(emailTarefas.email)}</strong> com um arquivo que adiciona o compromisso ao seu calendário. No dia da tarefa (ou 15 minutos antes, se ela tiver hora) chega o lembrete, junto com o aviso aqui no CRM.</p>
      <p class="settings-page-note">Situação: <strong>${emailTarefas.ativo?'ligado':'desligado'}</strong></p>
      ${emailTarefas.msg ? `<p class="settings-page-msg ${emailTarefas.msg.tipo}">${esc(emailTarefas.msg.texto)}</p>` : ''}
      <button class="btn-outline" data-action="email-tarefas-alternar" ${emailTarefas.ocupado?'disabled':''}>${emailTarefas.ativo?'Desligar e-mails de tarefas':'Ligar e-mails de tarefas'}</button>
    </div>
  `;
}

// Aba "E-mail" (Integrações): tudo que o Livro-Caixa manda por e-mail e como ligar/desligar.
// (Trocar o e-mail da conta fica em "Seu perfil".)
function renderConfigEmail(){
  const blocos = [renderBlocoResumoDiario(), renderBlocoEmailTarefas(), renderBlocoBackupAuto()]; // carregam o estado sozinhos
  const carregando = !resumoDiario.carregado || !emailTarefas.carregado || !backupAuto.carregado;
  const ligado = resumoDiario.disponivel || emailTarefas.disponivel || backupAuto.disponivel || integracoesConfig.emailRecuperacao;
  return `
    <div class="settings-page-section">
      <h3>E-mail</h3>
      <p class="settings-page-note">Escolha o que o Livro-Caixa envia para <strong>${esc((currentUser && currentUser.email) || 'o seu e-mail')}</strong>. Para trocar o e-mail da conta, vá em <button class="btn-link" data-action="set-config-categoria" data-categoria="perfil">Seu perfil</button>.</p>
      ${carregando ? `<p class="settings-page-note">Carregando…</p>` : (!ligado
        ? `<p class="settings-page-msg erro">O envio de e-mail ainda não está ligado neste servidor. Quem administra o sistema precisa configurar <code>RESEND_API_KEY</code>, <code>EMAIL_FROM</code> e <code>APP_URL</code> no Render.</p>`
        : '')}
    </div>
    ${blocos.join('')}
    ${(!carregando && ligado) ? `
    <div class="settings-page-section">
      <h3>E-mails automáticos</h3>
      <p class="settings-page-note">Estes saem sozinhos, sem precisar ligar: recuperação de senha, aviso de senha alterada, aviso de e-mail da conta alterado e os avisos da assinatura (teste acabando, pagamento).</p>
    </div>` : ''}
  `;
}

/* ---------- Backup automático por e-mail ---------- */
let backupAuto = { carregado:false, disponivel:false, ativo:false, ultimoEnvio:null, email:'', ocupado:false, msg:null };
async function carregarBackupAuto(){
  backupAuto.carregado = true;
  try{
    const d = await apiRequest('GET', '/backup/automatico');
    backupAuto = { ...backupAuto, ...d };
  }catch(e){ backupAuto.disponivel = false; }
  renderApp();
}
async function alternarBackupAuto(){
  if(backupAuto.ocupado) return;
  backupAuto.ocupado = true; backupAuto.msg = null; renderApp();
  try{
    const d = await apiRequest('PUT', '/backup/automatico', { ativo: !backupAuto.ativo });
    backupAuto.ativo = !!d.ativo;
    backupAuto.msg = { tipo:'ok', texto: backupAuto.ativo ? 'Backup semanal ligado.' : 'Backup semanal desligado.' };
  }catch(e){
    backupAuto.msg = { tipo:'erro', texto: e.message || 'Não foi possível alterar.' };
  }
  backupAuto.ocupado = false; renderApp();
}
async function enviarBackupAutoAgora(){
  if(backupAuto.ocupado) return;
  backupAuto.ocupado = true; backupAuto.msg = null; renderApp();
  try{
    const d = await apiRequest('POST', '/backup/automatico/enviar-agora', undefined, 90000);
    backupAuto.ultimoEnvio = (d && d.ultimoEnvio) || new Date().toISOString();
    backupAuto.msg = { tipo:'ok', texto:'Backup enviado para ' + (backupAuto.email || 'o seu e-mail') + '.' };
  }catch(e){
    backupAuto.msg = { tipo:'erro', texto: e.message || 'Não foi possível enviar agora.' };
  }
  backupAuto.ocupado = false; renderApp();
}
function renderBlocoBackupAuto(){
  if(!backupAuto.carregado){ carregarBackupAuto(); return ''; }
  if(!backupAuto.disponivel) return '';
  const ult = backupAuto.ultimoEnvio ? new Date(backupAuto.ultimoEnvio).toLocaleString('pt-BR') : 'nunca';
  return `
    <div class="settings-page-section">
      <h3>Backup semanal</h3>
      <p class="settings-page-note">Toda semana enviamos uma cópia dos seus dados (clientes, tarefas, comissões, mensagens e configurações) para <strong>${esc(backupAuto.email || 'o seu e-mail')}</strong>. Os anexos dos clientes não entram nesse arquivo — para eles use o Backup em Manutenção. Último envio: ${esc(ult)}.</p>
      ${backupAuto.msg ? `<p class="settings-page-msg ${backupAuto.msg.tipo}">${esc(backupAuto.msg.texto)}</p>` : ''}
      <p class="settings-page-note">Situação: <strong>${backupAuto.ativo?'ligado':'desligado'}</strong></p>
      <div class="settings-btn-row">
        <button class="btn-outline" data-action="backup-auto-alternar" ${backupAuto.ocupado?'disabled':''}>${backupAuto.ativo?'Desligar backup semanal':'Ligar backup semanal'}</button>
        <button class="btn-outline" data-action="backup-auto-agora" ${backupAuto.ocupado?'disabled':''}>${backupAuto.ocupado?'Aguarde…':'Enviar um agora'}</button>
      </div>
    </div>
  `;
}

function renderConfigManutencao(){
  return `
    <div class="settings-page-section">
      <h3>Backup dos seus dados</h3>
      <p class="settings-page-note">Guarda ou restaura uma cópia de todos os seus clientes, tarefas, comissões, mensagens e configurações.</p>
      <button class="btn-outline" data-action="abrir-backup-modal">📦 Backup</button>
      <p class="settings-page-note" style="margin-top:10px;">Quer receber uma cópia toda semana por e-mail? Ligue em <button class="btn-link" data-action="set-config-categoria" data-categoria="email">Integrações → E-mail</button>.</p>
    </div>
    <div class="settings-page-section">
      <h3>Atualizações</h3>
      <p class="settings-page-note">Se o painel parecer desatualizado (algo que já mudou e não aparece), use esse botão pra forçar buscar a versão mais nova — principalmente útil no app instalado no celular.</p>
      ${atualizacaoMsg ? `<p class="settings-page-msg ${atualizacaoMsg.tipo}">${esc(atualizacaoMsg.texto)}</p>` : ''}
      <button class="btn-outline" data-action="verificar-atualizacao" ${verificandoAtualizacao?'disabled':''}>${verificandoAtualizacao?'Verificando…':'Verificar atualizações'}</button>
    </div>
  `;
}

function renderConfiguracoesPage(){
  const CONTEUDO_CATEGORIA = {
    'perfil': renderConfigPerfil,
    'assinatura': renderConfigAssinatura,
    'seguranca': renderConfigSeguranca,
    'aparencia': renderConfigAparencia,
    'notificacoes': renderConfigNotificacoes,
    'google-agenda': renderConfigGoogleAgenda,
    'email': renderConfigEmail,
    'webhooks': renderConfigWebhooks,
    'agendamento': renderConfigAgendamento,
    'campos': renderConfigCampos,
    'importar': renderConfigImportar,
    'manutencao': renderConfigManutencao,
  };
  const renderFn = CONTEUDO_CATEGORIA[configCategoriaAtiva] || renderConfigPerfil;
  return `
    <div class="page-head">
      <div>
        <h1>Configurações</h1>
        <p>Sua conta, integrações e dados</p>
      </div>
    </div>

    <div class="config-layout ${configMobileConteudo ? 'mostrando-conteudo' : 'mostrando-lista'}">
      <div class="config-sidebar">
        ${CONFIG_CATEGORIAS.map(g=>{
          const itens = g.itens.filter(([key])=> !acessoCrm || acessoCrm.gestor || key === 'aparencia'); // equipe: só a aparência
          return itens.length ? `
          <div class="config-sidebar-grupo">${g.grupo}</div>
          ${itens.map(([key,label])=>`<button class="config-sidebar-item ${configCategoriaAtiva===key?'active':''}" data-action="set-config-categoria" data-categoria="${key}">${label}</button>`).join('')}
        ` : '';}).join('')}
      </div>
      <div class="config-content">
        <button type="button" class="config-voltar-mobile" data-action="config-voltar-mobile">‹ Configurações</button>
        ${renderFn()}
      </div>
    </div>
  `;
}

/* ---------- eventos ---------- */
function bindAppEvents(){
  const app = document.getElementById('app');

  // o menu abre pelo hambúrguer (tablet) e pelo "Mais" da barra de baixo (celular)
  app.querySelectorAll('[data-action="toggle-sidebar"]').forEach(b=> b.addEventListener('click', ()=>{ sidebarOpen = !sidebarOpen; renderApp(); }));
  app.querySelectorAll('[data-action="etapa-mobile"]').forEach(b=> b.addEventListener('click', ()=> trocarEtapaMobile(b.dataset.colId)));
  app.querySelectorAll('[data-action="leads-tipo-mobile"]').forEach(b=> b.addEventListener('click', ()=>{ leadsTipoMobile = b.dataset.tipo; renderApp(); }));
  const configVoltar = app.querySelector('[data-action="config-voltar-mobile"]');
  if(configVoltar) configVoltar.addEventListener('click', ()=>{ configMobileConteudo = false; renderApp(); window.scrollTo(0, 0); });
  app.querySelectorAll('.lead-card-mobile').forEach(el=> el.addEventListener('keydown', (e)=>{ if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); el.click(); } }));
  app.querySelectorAll('.lead-card-wa').forEach(b=> b.addEventListener('click', (e)=> e.stopPropagation()));
  const closeSidebarEl = app.querySelector('[data-action="close-sidebar"]');
  if(closeSidebarEl) closeSidebarEl.addEventListener('click', ()=>{ sidebarOpen = false; renderApp(); });
  const buscaGlobalBtn = app.querySelector('[data-action="abrir-busca-global"]');
  if(buscaGlobalBtn) buscaGlobalBtn.addEventListener('click', abrirBuscaGlobal);
  const notifBtn = app.querySelector('[data-action="toggle-notif"]');
  if(notifBtn) notifBtn.addEventListener('click', (e)=>{ e.stopPropagation(); notifOpen = !notifOpen; renderApp(); });

  const errorBanner = app.querySelector('[data-action="dismiss-error"]');
  if(errorBanner) errorBanner.addEventListener('click', ()=>{ dispensarErro(); renderApp(); });

  const logoutBtn = app.querySelector('[data-action="logout"]');
  if(logoutBtn) logoutBtn.addEventListener('click', logout);

  const reordenarNavBtn = app.querySelector('[data-action="abrir-reordenar-nav"]');
  if(reordenarNavBtn) reordenarNavBtn.addEventListener('click', abrirReordenarNav);

  app.querySelectorAll('[data-action="nav-mais"]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const grupo = btn.closest('.nav-mais');
      const abrir = !grupo.classList.contains('aberto');
      animarGrupoMais(grupo, abrir);
      btn.setAttribute('aria-expanded', String(abrir));
      try{ localStorage.setItem('navMais', abrir ? '1' : '0'); }catch(e){}
    });
  });
  app.querySelectorAll('[data-action="nav"]').forEach(btn=>{
    btn.addEventListener('click', ()=> goToPage(btn.dataset.page));
  });

  const darkModeSwitch = app.querySelector('[data-action="toggle-dark-mode"]');
  if(darkModeSwitch) darkModeSwitch.addEventListener('click', ()=>{
    setDarkMode(!getDarkMode());
    renderApp();
  });
  const pushAtivarBtn = app.querySelector('[data-action="push-ativar"]');
  if(pushAtivarBtn) pushAtivarBtn.addEventListener('click', ativarPush);
  const pushDesativarBtn = app.querySelector('[data-action="push-desativar"]');
  if(pushDesativarBtn) pushDesativarBtn.addEventListener('click', desativarPush);
  const pushTestarBtn = app.querySelector('[data-action="push-testar"]');
  if(pushTestarBtn) pushTestarBtn.addEventListener('click', testarPush);
  const resumoAlternarBtn = app.querySelector('[data-action="resumo-diario-alternar"]');
  if(resumoAlternarBtn) resumoAlternarBtn.addEventListener('click', alternarResumoDiario);
  const resumoAgoraBtn = app.querySelector('[data-action="resumo-diario-agora"]');
  if(resumoAgoraBtn) resumoAgoraBtn.addEventListener('click', enviarResumoDiarioAgora);
  const emailTarefasBtn = app.querySelector('[data-action="email-tarefas-alternar"]');
  if(emailTarefasBtn) emailTarefasBtn.addEventListener('click', alternarEmailTarefas);
  const trocarEmailBtn = app.querySelector('[data-action="trocar-email"]');
  if(trocarEmailBtn) trocarEmailBtn.addEventListener('click', abrirAlterarEmailModal);
  const backupAutoAlternarBtn = app.querySelector('[data-action="backup-auto-alternar"]');
  if(backupAutoAlternarBtn) backupAutoAlternarBtn.addEventListener('click', alternarBackupAuto);
  const backupAutoAgoraBtn = app.querySelector('[data-action="backup-auto-agora"]');
  if(backupAutoAgoraBtn) backupAutoAgoraBtn.addEventListener('click', enviarBackupAutoAgora);
  const verificarAtualizacaoBtn = app.querySelector('[data-action="verificar-atualizacao"]');
  if(verificarAtualizacaoBtn) verificarAtualizacaoBtn.addEventListener('click', verificarAtualizacaoApp);
  app.querySelectorAll('[data-action="ver-dashboard-membro"]').forEach(btn=>{
    btn.addEventListener('click', ()=> abrirDashboardDeMembro(btn.dataset.userId, btn.dataset.nome));
  });
  app.querySelectorAll('[data-action="atuar-como-membro"]').forEach(btn=>{
    btn.addEventListener('click', ()=> entrarNoFunilDe(btn.dataset.userId, btn.dataset.nome));
  });
  const sairFunilBtn = app.querySelector('[data-action="sair-funil-de"]');
  if(sairFunilBtn) sairFunilBtn.addEventListener('click', sairDoFunilDe);
  app.querySelectorAll('[data-action="abrir-equipe-lista"]').forEach(btn=>{
    btn.addEventListener('click', ()=> abrirEquipeDaLista(btn.dataset.equipeId));
  });
  const trocarEquipeSel = app.querySelector('[data-action="trocar-equipe"]');
  if(trocarEquipeSel) trocarEquipeSel.addEventListener('change', (e)=> abrirEquipeDaLista(e.target.value));
  app.querySelectorAll('[data-action="sair-equipe-lista"]').forEach(btn=>{
    btn.addEventListener('click', ()=> showConfirm({
      message: `Sair da equipe "${btn.dataset.nome}"? Você perde o chat e a gestão dela — seu funil continua intocado e as outras equipes continuam.`,
      confirmLabel: 'Sair da equipe',
      onConfirm: ()=>{ closeConfirm(); sairDaEquipe(btn.dataset.equipeId); },
    }));
  });
  const sairDashboardBtn = app.querySelector('[data-action="sair-dashboard-membro"]');
  if(sairDashboardBtn) sairDashboardBtn.addEventListener('click', sairDashboardDeMembro);
  const abrirBackupModalBtn = app.querySelector('[data-action="abrir-backup-modal"]');
  if(abrirBackupModalBtn) abrirBackupModalBtn.addEventListener('click', abrirBackupModal);

  app.querySelectorAll('[data-action="set-accent"]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      setAccentColor(btn.dataset.color);
      renderApp();
    });
  });
  const themeCustomInput = document.getElementById('theme-custom-input');
  if(themeCustomInput) themeCustomInput.addEventListener('input', (e)=> setAccentColor(e.target.value));

  const connectCalBtn = app.querySelector('[data-action="connect-calendar"]');
  if(connectCalBtn) connectCalBtn.addEventListener('click', connectGoogleCalendar);
  const disconnectCalBtn = app.querySelector('[data-action="disconnect-calendar"]');
  if(disconnectCalBtn) disconnectCalBtn.addEventListener('click', disconnectGoogleCalendar);
  app.querySelectorAll('[data-action="sync-calendar-now"]').forEach(btn=>{
    btn.addEventListener('click', syncCalendarNow);
  });
  const gerarIcsBtn = app.querySelector('[data-action="gerar-link-ics"]');
  if(gerarIcsBtn) gerarIcsBtn.addEventListener('click', gerarLinkIcs);
  const revogarIcsBtn = app.querySelector('[data-action="revogar-link-ics"]');
  if(revogarIcsBtn) revogarIcsBtn.addEventListener('click', revogarLinkIcs);
  const copiarIcsBtn = app.querySelector('[data-action="copiar-link-ics"]');
  if(copiarIcsBtn) copiarIcsBtn.addEventListener('click', ()=>{
    const input = document.getElementById('ics-url');
    if(!input) return;
    input.select();
    navigator.clipboard && navigator.clipboard.writeText(input.value).catch(()=>{
      document.execCommand('copy');
    });
  });

  /* -- Dashboard -- */
  app.querySelectorAll('[data-action="set-dash-period"]').forEach(btn=>{
    btn.addEventListener('click', ()=>{ dashboardPeriod = btn.dataset.period; renderApp(); });
  });
  const gerarInsightsBtn = app.querySelector('[data-action="gerar-insights"]');
  if(gerarInsightsBtn) gerarInsightsBtn.addEventListener('click', gerarInsightsIA);
  const toggleInsightsPipelineBtn = app.querySelector('[data-action="toggle-insights-pipeline"]');
  if(toggleInsightsPipelineBtn) toggleInsightsPipelineBtn.addEventListener('click', ()=>{ insightsPipelineExpandido = !insightsPipelineExpandido; renderApp(); });
  const editarMetaBtn = app.querySelector('[data-action="editar-meta-vendas"]');
  if(editarMetaBtn) editarMetaBtn.addEventListener('click', ()=>{ editandoMetaVendas = true; renderApp(); });
  const salvarMetaBtn = document.getElementById('meta-vendas-salvar');
  if(salvarMetaBtn) salvarMetaBtn.addEventListener('click', salvarMetaVendas);
  const editarMetaEquipeBtn = app.querySelector('[data-action="editar-meta-vendas-equipe"]');
  if(editarMetaEquipeBtn) editarMetaEquipeBtn.addEventListener('click', ()=>{ editandoMetaVendasEquipe = true; renderApp(); });
  const salvarMetaEquipeBtn = document.getElementById('meta-vendas-equipe-salvar');
  if(salvarMetaEquipeBtn) salvarMetaEquipeBtn.addEventListener('click', salvarMetaVendasEquipe);
  app.querySelectorAll('[data-action="toggle-painel-dashboard"]').forEach(btn=>{
    btn.addEventListener('click', ()=> alternarPainelDashboard(btn.dataset.painelId, btn));
  });

  /* -- tarefas (usado no Dashboard e na página Tarefas) -- */
  app.querySelectorAll('[data-action="toggle-task"]').forEach(el=>{
    el.addEventListener('click', ()=> toggleTaskConcluida(el.dataset.taskId));
  });
  app.querySelectorAll('[data-action="toggle-evento"]').forEach(el=>{
    el.addEventListener('click', ()=> toggleEventoConcluido(el.dataset.eventoId));
  });
  const openNewTaskBtn = app.querySelector('[data-action="open-new-task"]');
  if(openNewTaskBtn) openNewTaskBtn.addEventListener('click', ()=> openNewTask());
  app.querySelectorAll('[data-action="open-edit-task"]').forEach(btn=>{
    btn.addEventListener('click', ()=> openEditTask(btn.dataset.taskId));
  });
  app.querySelectorAll('[data-action="delete-task"]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const id = btn.dataset.taskId;
      showConfirm({ chave:'tarefa',
        message: 'Excluir esta tarefa? Essa ação não pode ser desfeita.',
        onConfirm: ()=>{ deleteTaskById(id); closeConfirm(); closeTaskModal(); },
      });
    });
  });
  const toggleConcluidasEl = app.querySelector('[data-action="toggle-show-concluidas"]');
  if(toggleConcluidasEl) toggleConcluidasEl.addEventListener('click', ()=>{ tarefasShowConcluidas = !tarefasShowConcluidas; renderApp(); });

  /* -- Agenda (calendário) -- */
  app.querySelectorAll('[data-action="agenda-mes"]').forEach(btn=>{
    btn.addEventListener('click', ()=> mudarMesAgenda(parseInt(btn.dataset.delta,10)));
  });
  app.querySelectorAll('[data-action="set-agenda-subtab"]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      agendaSubTab = btn.dataset.subtab;
      if(agendaSubTab==='gerot' && !gerotLoaded) loadGerot(gerotSemanaAtual);
      renderApp();
    });
  });
  app.querySelectorAll('[data-action="gerot-semana"]').forEach(btn=>{
    btn.addEventListener('click', ()=> mudarSemanaGerot(parseInt(btn.dataset.delta,10)));
  });
  const gerotHojeBtn = app.querySelector('[data-action="gerot-hoje"]');
  if(gerotHojeBtn) gerotHojeBtn.addEventListener('click', ()=>{
    gerotSemanaAtual = inicioDaSemana(new Date());
    loadGerot(gerotSemanaAtual);
  });
  const gerotCopiarBtn = app.querySelector('[data-action="gerot-copiar-semana"]');
  if(gerotCopiarBtn) gerotCopiarBtn.addEventListener('click', copiarSemanaAnteriorGerot);
  const gerotExportarBtn = app.querySelector('[data-action="gerot-exportar-planilha"]');
  if(gerotExportarBtn) gerotExportarBtn.addEventListener('click', exportarGerotParaPlanilha);
  const gerotImportarBtn = app.querySelector('[data-action="gerot-importar-planilha"]');
  const gerotImportarInput = document.getElementById('gerot-importar-input');
  if(gerotImportarBtn && gerotImportarInput) gerotImportarBtn.addEventListener('click', ()=> gerotImportarInput.click());
  if(gerotImportarInput) gerotImportarInput.addEventListener('change', (e)=>{
    const file = e.target.files && e.target.files[0];
    if(file) importarGerotDePlanilha(file);
    e.target.value = ''; // permite selecionar o mesmo arquivo de novo depois, se precisar
  });
  app.querySelectorAll('[data-action="gerot-abrir-editor"]').forEach(btn=>{
    btn.addEventListener('click', ()=> abrirGerotEditor(Number(btn.dataset.dia), btn.dataset.horario, btn.dataset.blocoId || null));
  });
  const gerotEditorInicio = document.getElementById('gerot-editor-inicio');
  if(gerotEditorInicio) gerotEditorInicio.addEventListener('change', (e)=>{
    gerotEditor.horarioInicio = e.target.value;
    if(gerotEditor.horarioFim <= gerotEditor.horarioInicio){
      const idx = GEROT_HORARIOS.indexOf(gerotEditor.horarioInicio);
      gerotEditor.horarioFim = GEROT_LIMITES[idx+1] || GEROT_LIMITES[GEROT_LIMITES.length-1];
    }
    renderApp();
  });
  const gerotEditorFim = document.getElementById('gerot-editor-fim');
  if(gerotEditorFim) gerotEditorFim.addEventListener('change', (e)=> gerotEditor.horarioFim = e.target.value);
  const gerotEditorTexto = document.getElementById('gerot-editor-texto');
  if(gerotEditorTexto){
    gerotEditorTexto.addEventListener('input', (e)=> gerotEditor.texto = e.target.value);
    gerotEditorTexto.addEventListener('keydown', (e)=>{ if(e.key==='Enter') salvarGerotEditor(); });
  }
  const gerotEditorSalvar = document.getElementById('gerot-editor-salvar');
  if(gerotEditorSalvar) gerotEditorSalvar.addEventListener('click', salvarGerotEditor);
  const gerotEditorCancelar = document.getElementById('gerot-editor-cancelar');
  if(gerotEditorCancelar) gerotEditorCancelar.addEventListener('click', fecharGerotEditor);
  const gerotEditorApagar = document.getElementById('gerot-editor-apagar');
  if(gerotEditorApagar) gerotEditorApagar.addEventListener('click', apagarGerotEditorAtual);
  const cancelarCopiaPrincipalBtn = app.querySelector('[data-action="cancelar-tarefa-copiada"]');
  if(cancelarCopiaPrincipalBtn) cancelarCopiaPrincipalBtn.addEventListener('click', cancelarTarefaCopiada);
  const agendaHojeBtn = app.querySelector('[data-action="agenda-hoje"]');
  if(agendaHojeBtn) agendaHojeBtn.addEventListener('click', ()=>{
    agendaMesAtual = currentMonthKey();
    loadAgendaMes(agendaMesAtual);
  });
  app.querySelectorAll('[data-action="abrir-dia-agenda"]').forEach(cel=>{
    cel.addEventListener('click', ()=>{
      if(longPressDisparou){ longPressDisparou = false; return; } // ignora o clique fantasma que o toque dispara depois de segurar
      const diaISO = cel.dataset.dia;
      if(diaAgendaCopiado && diaISO !== diaAgendaCopiado.origemISO){
        colarDiaInteiroEm(diaISO, cel);
        if(navigator.vibrate) navigator.vibrate(15);
        return;
      }
      agendaDiaSelecionado = diaISO; renderAgendaDiaModal();
    });
    cel.addEventListener('contextmenu', (e)=>{
      e.preventDefault();
      abrirMenuDia(cel.dataset.dia, e.clientX, e.clientY);
    });
    cel.addEventListener('touchstart', (e)=>{
      const touch = e.touches[0];
      const x = touch.clientX, y = touch.clientY;
      clearTimeout(longPressTimer);
      longPressTimer = setTimeout(()=>{
        longPressDisparou = true;
        cel.classList.remove('agenda-cell-pressionando');
        if(navigator.vibrate) navigator.vibrate(15);
        abrirMenuDia(cel.dataset.dia, x, y);
      }, 550);
      cel.classList.add('agenda-cell-pressionando');
    }, { passive:true });
    cel.addEventListener('touchend', ()=>{ clearTimeout(longPressTimer); cel.classList.remove('agenda-cell-pressionando'); });
    cel.addEventListener('touchmove', ()=>{ clearTimeout(longPressTimer); cel.classList.remove('agenda-cell-pressionando'); }); // dedo se moveu = rolando a tela, não é aperta-e-segura
    cel.addEventListener('touchcancel', ()=>{ clearTimeout(longPressTimer); cel.classList.remove('agenda-cell-pressionando'); });
  });

  /* -- Automações -- */
  const openNewAutomacaoBtn = app.querySelector('[data-action="open-new-automacao"]');
  if(openNewAutomacaoBtn) openNewAutomacaoBtn.addEventListener('click', ()=> openNewAutomacao());
  app.querySelectorAll('[data-action="open-edit-automacao"]').forEach(btn=>{
    btn.addEventListener('click', ()=> openEditAutomacao(btn.dataset.automacaoId));
  });
  app.querySelectorAll('[data-action="toggle-automacao"]').forEach(el=>{
    el.addEventListener('click', ()=> toggleAutomacaoAtiva(el.dataset.automacaoId));
  });
  app.querySelectorAll('[data-action="delete-automacao"]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const id = btn.dataset.automacaoId;
      showConfirm({ chave:'acao-automatica',
        message: 'Excluir esta ação automática? Ela para de rodar imediatamente.',
        onConfirm: ()=>{ excluirAutomacao(id); closeConfirm(); },
      });
    });
  });

  /* -- Fluxos -- */
  const openNewFluxoBtn = app.querySelector('[data-action="open-new-fluxo"]');
  if(openNewFluxoBtn) openNewFluxoBtn.addEventListener('click', openNewFluxo);
  app.querySelectorAll('[data-action="open-edit-fluxo"]').forEach(btn=>{
    btn.addEventListener('click', ()=> openEditFluxo(btn.dataset.fluxoId));
  });
  app.querySelectorAll('[data-action="toggle-fluxo"]').forEach(el=>{
    el.addEventListener('click', ()=>{
      const id = el.dataset.fluxoId;
      const f = fluxos.find(x=>x.id===id);
      if(f) toggleFluxoAtivo(id);
    });
  });
  app.querySelectorAll('[data-action="delete-fluxo"]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const id = btn.dataset.fluxoId;
      showConfirm({ chave:'sequencia',
        message: 'Excluir esta sequência? As que estão em andamento para clientes atuais são interrompidas.',
        onConfirm: ()=>{ excluirFluxo(id); closeConfirm(); },
      });
    });
  });

  /* -- Importar/Exportar -- */
  const importArquivoInput = document.getElementById('import-arquivo');
  if(importArquivoInput) importArquivoInput.addEventListener('change', ()=>{ const n = document.getElementById('import-arquivo-nome'); if(n) n.textContent = importArquivoInput.files[0] ? importArquivoInput.files[0].name : 'Nenhum arquivo escolhido'; });
  const modeloLeadsBtn = app.querySelector('[data-action="modelo-planilha-leads"]');
  if(modeloLeadsBtn) modeloLeadsBtn.addEventListener('click', baixarModeloLeads);
  const tirarPlanilhaBtn = app.querySelector('[data-action="tirar-planilha"]');
  if(tirarPlanilhaBtn) tirarPlanilhaBtn.addEventListener('click', tirarPlanilha);
  if(importAnimarEntrada) animarEntradaPlanilha();
  const planilhaInput = document.getElementById('planilha-input');
  if(planilhaInput) planilhaInput.addEventListener('change', (e)=>{
    const file = e.target.files && e.target.files[0];
    if(file) handlePlanilhaFileSelected(file);
  });
  const mapNomeEl = document.getElementById('map-nome');
  if(mapNomeEl) mapNomeEl.addEventListener('change', (e)=> importMapNome = e.target.value);
  const mapTelefoneEl = document.getElementById('map-telefone');
  if(mapTelefoneEl) mapTelefoneEl.addEventListener('change', (e)=> importMapTelefone = e.target.value);
  const mapServicoEl = document.getElementById('map-servico');
  if(mapServicoEl) mapServicoEl.addEventListener('change', (e)=> importMapServico = e.target.value);
  const confirmarImportBtn = document.getElementById('confirmar-import-planilha');
  if(confirmarImportBtn) confirmarImportBtn.addEventListener('click', confirmarImportPlanilha);
  app.querySelectorAll('[data-action="completar-possivel-lead"]').forEach(btn=>{
    btn.addEventListener('click', ()=> abrirCompletarLead(btn.dataset.leadId));
  });
  app.querySelectorAll('[data-action="descartar-possivel-lead"]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const id = btn.dataset.leadId;
      showConfirm({ chave:'possivel-contato',
        message: 'Descartar esse possível contato? Ele não vira cliente.',
        confirmLabel: 'Descartar',
        onConfirm: ()=>{ descartarPossivelLead(id); closeConfirm(); },
      });
    });
  });

  /* -- Relatórios -- */
  const relatorioFunilSelect = document.getElementById('relatorio-funil-select');
  if(relatorioFunilSelect) relatorioFunilSelect.addEventListener('change', (e)=>{ relatorioFunilId = e.target.value; renderApp(); });
  app.querySelectorAll('[data-action="exportar-csv"]').forEach(b=> b.addEventListener('click', ()=> exportarCsv(b.dataset.formato)));
  const exportarPdfBtn = app.querySelector('[data-action="exportar-relatorio-pdf"]');
  if(exportarPdfBtn) exportarPdfBtn.addEventListener('click', exportarRelatorioPdf);

  /* -- Equipe / Chat Interno / Supervisão -- */
  const equipeNomeInput = document.getElementById('equipe-nome-novo');
  if(equipeNomeInput) equipeNomeInput.addEventListener('input', (e)=> equipeNomeNovo = e.target.value);
  const criarEquipeBtn = app.querySelector('[data-action="criar-equipe"]');
  if(criarEquipeBtn) criarEquipeBtn.addEventListener('click', criarEquipe);
  const equipeCodigoInput = document.getElementById('equipe-codigo-entrar');
  if(equipeCodigoInput) equipeCodigoInput.addEventListener('input', (e)=> equipeCodigoEntrar = e.target.value);
  const entrarEquipeBtn = app.querySelector('[data-action="entrar-equipe"]');
  if(entrarEquipeBtn) entrarEquipeBtn.addEventListener('click', entrarNaEquipe);
  const sairEquipeBtn = app.querySelector('[data-action="sair-equipe"]');
  if(sairEquipeBtn) sairEquipeBtn.addEventListener('click', ()=>{
    showConfirm({
      message: 'Sair dessa equipe? Você perde acesso ao chat interno e à supervisão dela — seu funil continua intocado.',
      confirmLabel: 'Sair da equipe',
      onConfirm: ()=>{ sairDaEquipe(); closeConfirm(); },
    });
  });
  const regenerarCodigoBtn = app.querySelector('[data-action="regenerar-codigo-equipe"]');
  if(regenerarCodigoBtn) regenerarCodigoBtn.addEventListener('click', regenerarCodigoEquipe);
  app.querySelectorAll('[data-action="alterar-papel-membro"]').forEach(btn=>{
    btn.addEventListener('click', ()=> alterarPapelMembro(btn.dataset.userId, btn.dataset.papel));
  });
  app.querySelectorAll('[data-action="toggle-supervisor-dados"]').forEach(btn=>{
    btn.addEventListener('click', ()=> alterarSupervisorDeDados(btn.dataset.userId, btn.dataset.ativo==='1'));
  });
  app.querySelectorAll('[data-action="remover-membro"]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      showConfirm({
        message: 'Remover esse membro da equipe? O funil dele continua intocado, só perde acesso ao chat e à supervisão.',
        onConfirm: ()=>{ removerMembro(btn.dataset.userId); closeConfirm(); },
      });
    });
  });
  const chatInternoInput = document.getElementById('chat-interno-input');
  if(chatInternoInput){
    chatInternoInput.addEventListener('input', (e)=> chatTexto = e.target.value);
    chatInternoInput.addEventListener('keydown', (e)=>{ if(e.key==='Enter') enviarMensagemChat(); });
  }
  const enviarChatBtn = app.querySelector('[data-action="enviar-chat-interno"]');
  if(enviarChatBtn) enviarChatBtn.addEventListener('click', enviarMensagemChat);
  const chatMsgsEl = document.getElementById('chat-interno-mensagens');
  if(chatMsgsEl) chatMsgsEl.scrollTop = chatMsgsEl.scrollHeight;

  app.querySelectorAll('[data-action="set-equipe-subtab"]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      equipeSubTab = btn.dataset.subtab;
      if(equipeSubTab==='chat' && !chatLoaded) loadChat();
      if(equipeSubTab==='supervisao' && equipe && equipe.souSupervisor && !supervisaoLoaded) loadSupervisao();
      if(equipeSubTab==='monitoramento' && equipe && equipe.souSupervisorDeDados && !monitoramentoLoaded) loadMonitoramento();
      renderApp();
    });
  });
  app.querySelectorAll('[data-action="abrir-conversa-individual"]').forEach(btn=>{
    btn.addEventListener('click', ()=> abrirConversaIndividual(btn.dataset.userId));
  });
  const fecharDmBtn = app.querySelector('[data-action="fechar-conversa-individual"]');
  if(fecharDmBtn) fecharDmBtn.addEventListener('click', ()=>{ dmDestinatarioId = null; renderApp(); });
  const chatIndividualInput = document.getElementById('chat-individual-input');
  if(chatIndividualInput){
    chatIndividualInput.addEventListener('input', (e)=> dmTexto = e.target.value);
    chatIndividualInput.addEventListener('keydown', (e)=>{ if(e.key==='Enter') enviarMensagemIndividual(); });
  }
  const enviarDmBtn = app.querySelector('[data-action="enviar-chat-individual"]');
  if(enviarDmBtn) enviarDmBtn.addEventListener('click', enviarMensagemIndividual);
  const dmMsgsEl = document.getElementById('chat-individual-mensagens');
  if(dmMsgsEl) dmMsgsEl.scrollTop = dmMsgsEl.scrollHeight;

  /* -- Comissões -- */
  app.querySelectorAll('[data-action="comissoes-mes"]').forEach(btn=>{
    btn.addEventListener('click', ()=>{ comissoesMonth = addMonthsKey(comissoesMonth, parseInt(btn.dataset.delta,10)); renderApp(); });
  });
  const openNewContratoBtn = app.querySelector('[data-action="open-new-contrato"]');
  if(openNewContratoBtn) openNewContratoBtn.addEventListener('click', openNewContrato);
  const openRegrasBtn = app.querySelector('[data-action="open-regras-comissao"]');
  if(openRegrasBtn) openRegrasBtn.addEventListener('click', openRegrasComissaoModal);
  app.querySelectorAll('[data-action="open-edit-contrato"]').forEach(btn=>{
    btn.addEventListener('click', ()=> openEditContrato(btn.dataset.contratoId));
  });
  app.querySelectorAll('[data-action="delete-contrato"]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const id = btn.dataset.contratoId;
      showConfirm({
        message: 'Excluir este contrato de comissão? Essa ação não pode ser desfeita.',
        onConfirm: ()=>{ deleteContratoById(id); closeConfirm(); },
      });
    });
  });
  app.querySelectorAll('[data-action="cancelar-contrato"]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const id = btn.dataset.contratoId;
      showConfirm({
        message: `Marcar esse contrato como cancelado a partir de ${monthLabel(comissoesMonth, true)}? As parcelas desse mês em diante param de contar — os meses anteriores continuam valendo.`,
        confirmLabel: 'Cancelar comissão',
        onConfirm: ()=>{ cancelarContrato(id); closeConfirm(); },
      });
    });
  });
  app.querySelectorAll('[data-action="reativar-contrato"]').forEach(btn=>{
    btn.addEventListener('click', ()=> reativarContrato(btn.dataset.contratoId));
  });

  /* -- Configurações -- */
  app.querySelectorAll('[data-action="set-config-categoria"]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      configCategoriaAtiva = btn.dataset.categoria;
      configMobileConteudo = true;
      renderApp();
      if(ehCelular()) window.scrollTo(0, 0);
    });
  });
  const avatarInput = document.getElementById('avatar-input');
  if(avatarInput) avatarInput.addEventListener('change', (e)=>{
    const file = e.target.files && e.target.files[0];
    if(file) handleAvatarFileSelected(file);
  });
  const avatarRemoverBtn = document.getElementById('avatar-remover-btn');
  if(avatarRemoverBtn) avatarRemoverBtn.addEventListener('click', removerAvatar);
  const abrirEditarPerfilBtn = app.querySelector('[data-action="abrir-editar-perfil"]');
  if(abrirEditarPerfilBtn) abrirEditarPerfilBtn.addEventListener('click', abrirEditarPerfilModal);
  // A bolinha da foto: clique rápido abre o seletor de arquivo (trocar/adicionar foto);
  // clique e segure (ou toque e segure, no celular) abre a foto atual em tamanho maior.
  const avatarPreview = document.getElementById('avatar-preview');
  if(avatarPreview){
    const iniciarPress = ()=>{
      clearTimeout(avatarPressTimer);
      avatarPressTimer = setTimeout(()=>{
        avatarPressDisparou = true;
        abrirAvatarLightbox();
      }, 550);
    };
    const cancelarPress = ()=> clearTimeout(avatarPressTimer);
    avatarPreview.addEventListener('mousedown', iniciarPress);
    avatarPreview.addEventListener('mouseup', cancelarPress);
    avatarPreview.addEventListener('mouseleave', cancelarPress);
    avatarPreview.addEventListener('touchstart', iniciarPress, { passive:true });
    avatarPreview.addEventListener('touchend', cancelarPress);
    avatarPreview.addEventListener('touchmove', cancelarPress);
    avatarPreview.addEventListener('touchcancel', cancelarPress);
    avatarPreview.addEventListener('contextmenu', (e)=> e.preventDefault());
    avatarPreview.addEventListener('click', ()=>{
      if(avatarPressDisparou){ avatarPressDisparou = false; return; } // ignora o clique fantasma depois de segurar
      if(avatarInput) avatarInput.click();
    });
  }
  const logoutAllBtn = app.querySelector('[data-action="desconectar-todos"]');
  if(logoutAllBtn) logoutAllBtn.addEventListener('click', ()=>{
    showConfirm({
      message: 'Desconectar todos os dispositivos, incluindo este? Você vai precisar fazer login de novo.',
      confirmLabel: 'Desconectar',
      onConfirm: ()=>{ desconectarTodosDispositivos(); closeConfirm(); },
    });
  });
  const abrirSenhaBtn = app.querySelector('[data-action="abrir-alterar-senha"]');
  if(abrirSenhaBtn) abrirSenhaBtn.addEventListener('click', abrirAlterarSenhaModal);
  const toggleAuditoriaBtn = app.querySelector('[data-action="toggle-auditoria"]');
  if(toggleAuditoriaBtn) toggleAuditoriaBtn.addEventListener('click', ()=>{ auditoriaExpandida = !auditoriaExpandida; renderApp(); });
  const atualizarMonitoramentoBtn = app.querySelector('[data-action="atualizar-monitoramento"]');
  if(atualizarMonitoramentoBtn) atualizarMonitoramentoBtn.addEventListener('click', loadMonitoramento);
  const limparMonitoramentoBtn = app.querySelector('[data-action="limpar-monitoramento"]');
  if(limparMonitoramentoBtn) limparMonitoramentoBtn.addEventListener('click', limparMonitoramento);
  const importColunaSelect = document.getElementById('import-coluna');
  if(importColunaSelect) importColunaSelect.addEventListener('change', (e)=> importColumnId = e.target.value);
  const importBtn = document.getElementById('import-btn');
  if(importBtn) importBtn.addEventListener('click', importarLeadsCsv);

  const novoCampoNomeEl = document.getElementById('novo-campo-nome');
  if(novoCampoNomeEl) novoCampoNomeEl.addEventListener('input', (e)=> novoCampoNome = e.target.value);
  const novoCampoTipoEl = document.getElementById('novo-campo-tipo');
  if(novoCampoTipoEl) novoCampoTipoEl.addEventListener('change', (e)=> novoCampoTipo = e.target.value);
  const criarCampoBtn = app.querySelector('[data-action="criar-campo-personalizado"]');
  if(criarCampoBtn) criarCampoBtn.addEventListener('click', criarCampoPersonalizado);

  const criarWebhookBtn = app.querySelector('[data-action="criar-webhook-saida"]');
  if(criarWebhookBtn) criarWebhookBtn.addEventListener('click', criarWebhookSaida);
  app.querySelectorAll('[data-action="testar-webhook-saida"]').forEach(btn=>{
    btn.addEventListener('click', ()=> testarWebhookSaida(btn.dataset.webhookId));
  });
  app.querySelectorAll('[data-action="toggle-webhook-saida"]').forEach(btn=>{
    btn.addEventListener('click', ()=> toggleWebhookSaida(btn.dataset.webhookId, btn.dataset.ativo==='1'));
  });
  app.querySelectorAll('[data-action="excluir-webhook-saida"]').forEach(btn=>{
    btn.addEventListener('click', ()=> excluirWebhookSaida(btn.dataset.webhookId));
  });
  const toggleAgendamentoPublicoBtn = app.querySelector('[data-action="toggle-agendamento-publico-ativo"]');
  if(toggleAgendamentoPublicoBtn) toggleAgendamentoPublicoBtn.addEventListener('click', toggleAgendamentoPublicoAtivo);
  const salvarAgendamentoPublicoBtn = app.querySelector('[data-action="salvar-agendamento-publico"]');
  if(salvarAgendamentoPublicoBtn) salvarAgendamentoPublicoBtn.addEventListener('click', salvarAgendamentoPublico);
  const copiarLinkBtn = app.querySelector('[data-action="copiar-link-agendamento"]');
  if(copiarLinkBtn) copiarLinkBtn.addEventListener('click', copiarLinkAgendamento);
  app.querySelectorAll('[data-action="excluir-campo-personalizado"]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const id = btn.dataset.campoId;
      showConfirm({
        message: 'Excluir esse campo personalizado? Ele para de aparecer nos clientes.',
        onConfirm: ()=>{ excluirCampoPersonalizado(id); closeConfirm(); },
      });
    });
  });

  const twofaIniciarBtn = document.getElementById('twofa-iniciar');
  if(twofaIniciarBtn) twofaIniciarBtn.addEventListener('click', iniciar2FA);
  const twofaCancelarSetupBtn = document.getElementById('twofa-cancelar-setup');
  if(twofaCancelarSetupBtn) twofaCancelarSetupBtn.addEventListener('click', cancelarSetup2FA);
  const twofaConfirmarBtn = document.getElementById('twofa-confirmar');
  if(twofaConfirmarBtn) twofaConfirmarBtn.addEventListener('click', confirmar2FA);
  const twofaMostrarDesativarBtn = document.getElementById('twofa-mostrar-desativar');
  if(twofaMostrarDesativarBtn) twofaMostrarDesativarBtn.addEventListener('click', ()=>{ mostrarDesativar2FA = true; renderApp(); });
  const twofaCancelarDesativarBtn = document.getElementById('twofa-cancelar-desativar');
  if(twofaCancelarDesativarBtn) twofaCancelarDesativarBtn.addEventListener('click', ()=>{ mostrarDesativar2FA = false; twoFactorMsg = null; renderApp(); });
  const twofaConfirmarDesativarBtn = document.getElementById('twofa-confirmar-desativar');
  if(twofaConfirmarDesativarBtn) twofaConfirmarDesativarBtn.addEventListener('click', desativar2FA);
  if(twoFactorSetup) renderizarQrCode2FA();

  /* -- Leads -- */
  app.querySelectorAll('[data-action="open-new-lead"]').forEach(b=> b.addEventListener('click', ()=> openNewCard()));
  const dupBtn = app.querySelector('[data-action="abrir-duplicados"]');
  if(dupBtn) dupBtn.addEventListener('click', abrirDuplicadosModal);
  app.querySelectorAll('[data-action="exportar-leads"]').forEach(b=> b.addEventListener('click', ()=> exportarLeads(b.dataset.formato)));
  const toggleArquivadosBtn = app.querySelector('[data-action="toggle-mostrar-arquivados"]');
  if(toggleArquivadosBtn) toggleArquivadosBtn.addEventListener('click', ()=>{ mostrarArquivados = !mostrarArquivados; renderApp(); });

  /* -- Leads: seleção e ações em massa -- */
  const selectAllEl = app.querySelector('[data-action="leads-select-all"]');
  if(selectAllEl){
    selectAllEl.addEventListener('click', ()=>{
      const idsVisiveis = filteredLeads().map(c=>c.id);
      toggleSelecionarTodosLeads(idsVisiveis);
    });
  }
  app.querySelectorAll('[data-action="leads-select-um"]').forEach(el=>{
    el.addEventListener('click', ()=> toggleSelecaoLead(el.dataset.cardId));
  });
  const bulkColunaSelect = document.getElementById('leads-bulk-coluna');
  if(bulkColunaSelect) bulkColunaSelect.addEventListener('change', (e)=> bulkMoverLeads(e.target.value));
  const bulkArquivarBtn = app.querySelector('[data-action="leads-bulk-arquivar"]');
  if(bulkArquivarBtn) bulkArquivarBtn.addEventListener('click', bulkArquivarLeads);
  const bulkExcluirBtn = app.querySelector('[data-action="leads-bulk-excluir"]');
  if(bulkExcluirBtn) bulkExcluirBtn.addEventListener('click', ()=>{
    const qtd = leadsSelecionados.size;
    showConfirm({
      message: `Excluir ${qtd} cliente${qtd===1?'':'s'} selecionado${qtd===1?'':'s'}? Essa ação não pode ser desfeita.`,
      onConfirm: ()=>{ bulkExcluirLeads(); closeConfirm(); },
    });
  });
  const bulkLimparBtn = app.querySelector('[data-action="leads-bulk-limpar"]');
  if(bulkLimparBtn) bulkLimparBtn.addEventListener('click', ()=>{ leadsSelecionados.clear(); renderApp(); });
  const bulkEtiquetaBtn = app.querySelector('[data-action="leads-bulk-etiqueta"]');
  if(bulkEtiquetaBtn) bulkEtiquetaBtn.addEventListener('click', ()=>{ leadsBulkEtiquetaAberta = true; renderApp(); });
  const bulkEtiquetaInput = document.getElementById('leads-bulk-etiqueta-input');
  if(bulkEtiquetaInput){
    bulkEtiquetaInput.addEventListener('input', (e)=> leadsBulkEtiquetaValor = e.target.value);
    bulkEtiquetaInput.addEventListener('keydown', (e)=>{ if(e.key==='Enter') confirmarBulkEtiqueta(); });
  }
  const bulkEtiquetaConfirmarBtn = app.querySelector('[data-action="leads-bulk-etiqueta-confirmar"]');
  if(bulkEtiquetaConfirmarBtn) bulkEtiquetaConfirmarBtn.addEventListener('click', confirmarBulkEtiqueta);

  const leadsSearchInput = document.getElementById('leads-search-input');
  if(leadsSearchInput) leadsSearchInput.addEventListener('input', (e)=>{
    const cursorPos = e.target.selectionStart;
    leadsSearch = e.target.value;
    renderApp();
    const novoInput = document.getElementById('leads-search-input');
    if(novoInput){ novoInput.focus(); novoInput.setSelectionRange(cursorPos, cursorPos); }
  });
  const leadsFilterSelect = document.getElementById('leads-status-filter');
  if(leadsFilterSelect) leadsFilterSelect.addEventListener('change', (e)=>{ leadsStatusFilter = e.target.value; renderApp(); });

  /* -- botão de funil de ordenação, compartilhado entre Leads, Pipeline e Comissões -- */
  app.querySelectorAll('[data-action="toggle-ordenar-menu"]').forEach(btn=>{
    btn.addEventListener('click', (e)=>{
      e.stopPropagation();
      ordenarMenuAberto = ordenarMenuAberto === btn.dataset.menuId ? null : btn.dataset.menuId;
      renderApp();
    });
  });
  app.querySelectorAll('[data-action="escolher-ordenar"]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const menuId = btn.dataset.menuId;
      const valor = btn.dataset.valor;
      ordenarMenuAberto = null;
      if(menuId === 'leads'){ leadsOrdenarPor = valor; renderApp(); }
      else if(menuId === 'comissoes'){ comissoesOrdenarPor = valor; renderApp(); }
      else if(menuId === 'pipeline'){ aplicarOrdenacaoPipeline(valor); }
    });
  });

  /* -- Pipeline: funis -- */
  app.querySelectorAll('[data-action="set-funil"]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      funilAtualId = btn.dataset.funilId;
      aiInsights = []; // insights são específicos do funil — limpa pra não mostrar dado desatualizado de outro
      renderApp();
    });
  });
  const novoFunilBtn = app.querySelector('[data-action="open-new-funil"]');
  if(novoFunilBtn) novoFunilBtn.addEventListener('click', criarNovoFunil);
  const editFunilBtn = app.querySelector('[data-action="edit-funil-name"]');
  if(editFunilBtn) editFunilBtn.addEventListener('click', ()=>{
    editingFunilId = editFunilBtn.dataset.funilId;
    const f = funis.find(x=>x.id===editingFunilId);
    editingFunilName = f ? f.nome : '';
    renderApp();
    const input = document.getElementById('funil-rename-'+editingFunilId);
    if(input){ input.focus(); input.select(); }
  });
  document.querySelectorAll('[id^="funil-rename-"]').forEach(input=>{
    input.addEventListener('input', (e)=>{ editingFunilName = e.target.value; });
    const commitFunil = ()=>{ const id = editingFunilId; editingFunilId = null; renomearFunil(id, editingFunilName); };
    input.addEventListener('blur', commitFunil);
    input.addEventListener('keydown', (e)=>{ if(e.key==='Enter') e.target.blur(); });
  });
  const deleteFunilBtn = app.querySelector('[data-action="delete-funil"]');
  if(deleteFunilBtn) deleteFunilBtn.addEventListener('click', ()=>{
    const id = deleteFunilBtn.dataset.funilId;
    const f = funis.find(x=>x.id===id);
    showConfirm({
      message: `Excluir o funil "${f.nome}"? Todas as colunas e clientes dele também serão excluídos.`,
      onConfirm: ()=>{ excluirFunil(id); closeConfirm(); },
    });
  });
  const duplicarFunilBtn = app.querySelector('[data-action="duplicar-funil"]');
  if(duplicarFunilBtn) duplicarFunilBtn.addEventListener('click', ()=> duplicarFunil(duplicarFunilBtn.dataset.funilId));
  ativarArrasteHorizontal();
  ajustarAlturaColunasPipeline();
  ativarRedimensionarStats();
  ajustarLargurasStatsPadrao();

  /* -- Pipeline: filtro de data -- */
  const dateMenuBtn = app.querySelector('[data-action="toggle-date-menu"]');
  if(dateMenuBtn) dateMenuBtn.addEventListener('click', (e)=>{
    e.stopPropagation();
    dateMenuOpen = !dateMenuOpen;
    renderApp();
  });
  app.querySelectorAll('[data-action="set-month"]').forEach(btn=>{
    btn.addEventListener('click', ()=>{ filterMonth = btn.dataset.month || null; dateMenuOpen = false; renderApp(); });
  });
  const gotoInput = document.getElementById('goto-month-input');
  if(gotoInput) gotoInput.addEventListener('change', (e)=>{ if(e.target.value){ filterMonth = e.target.value; dateMenuOpen = false; renderApp(); } });
  const esfriandoBtn = app.querySelector('[data-action="toggle-esfriando"]');
  if(esfriandoBtn) esfriandoBtn.addEventListener('click', ()=>{ filtroEsfriando = !filtroEsfriando; renderApp(); });

  /* -- Pipeline: colunas -- */
  app.querySelectorAll('[data-action="edit-col-name"]').forEach(el=>{
    el.addEventListener('click', ()=>{
      editingColId = el.dataset.colId;
      const col = board.columns.find(c=>c.id===editingColId);
      editingColName = col ? col.nome : '';
      renderApp();
      const input = document.getElementById('col-rename-'+editingColId);
      if(input){ input.focus(); input.select(); }
    });
  });
  app.querySelectorAll('[id^="col-rename-"]').forEach(input=>{
    input.addEventListener('input', (e)=>{ editingColName = e.target.value; });
    const commit = ()=>{ const id = editingColId; editingColId=null; renameColumn(id, editingColName); };
    input.addEventListener('blur', commit);
    input.addEventListener('keydown', (e)=>{ if(e.key==='Enter') e.target.blur(); });
  });

  app.querySelectorAll('[data-action="toggle-col-menu"]').forEach(btn=>{
    btn.addEventListener('click', (e)=>{
      e.stopPropagation();
      openMenuColId = (openMenuColId===btn.dataset.colId) ? null : btn.dataset.colId;
      renderApp();
    });
  });
  app.querySelectorAll('[data-action="toggle-move-menu"]').forEach(btn=>{
    btn.addEventListener('click', (e)=>{
      e.stopPropagation();
      openMoveMenuCardId = (openMoveMenuCardId===btn.dataset.cardId) ? null : btn.dataset.cardId;
      renderFloatingMoveMenu(); // só o menu flutuante — não precisa redesenhar a página toda (isso resetava a rolagem)
    });
  });
  app.querySelectorAll('[data-action="set-col-tipo"]').forEach(btn=>{
    btn.addEventListener('click', ()=> changeTipo(btn.dataset.colId, btn.dataset.tipo));
  });
  app.querySelectorAll('[data-action="delete-col"]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const id = btn.dataset.colId;
      const col = board.columns.find(c=>c.id===id);
      const n = cardsOf(id).length;
      openMenuColId = null;
      renderApp();
      showConfirm({ chave: n ? null : 'coluna-vazia',
        message: n ? `Excluir a coluna "${col.nome}"? Os ${n} cliente(s) dela também serão removidos.` : `Excluir a coluna "${col.nome}"?`,
        onConfirm: ()=>{ deleteColumnById(id); closeConfirm(); },
      });
    });
  });

  /* -- Pipeline / Leads: cards -- */
  app.querySelectorAll('[data-action="open-add-lead-choice"]').forEach(btn=>{
    btn.addEventListener('click', ()=> abrirEscolhaAdicionarLead(btn.dataset.colId));
  });
  app.querySelectorAll('[data-action="open-new-card"]').forEach(btn=>{
    btn.addEventListener('click', ()=> openNewCard(btn.dataset.colId));
  });
  app.querySelectorAll('[data-action="open-edit-card"]').forEach(el=>{
    el.addEventListener('click', ()=> openEditCard(el.dataset.cardId));
  });
  app.querySelectorAll('[data-action="fechar-faixa-teste"]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      try{ localStorage.setItem('faixaTesteFechadaEm', hojeLocalISO()); }catch(err){}
      const el = btn.closest('.faixa-teste');
      if(el) el.remove();
    });
  });
  app.querySelectorAll('[data-action="abrir-fechamento"]').forEach(btn=>{
    btn.addEventListener('click', (e)=>{ e.stopPropagation(); abrirFechamento(btn.dataset.cardId); });
  });
  app.querySelectorAll('[data-action="open-whatsapp"]').forEach(btn=>{
    btn.addEventListener('click', (e)=>{
      e.stopPropagation();
      abrirWhatsapp(btn.dataset.phone);
    });
  });

  app.querySelectorAll('[data-action="start-add-col"]').forEach(btn=>{
    btn.addEventListener('click', ()=>{ addingCol=true; newColNameVal=''; renderApp();
      const inp = document.getElementById('new-col-input'); if(inp) inp.focus();
    });
  });
  const newColInput = document.getElementById('new-col-input');
  if(newColInput){
    newColInput.addEventListener('input', (e)=>{ newColNameVal = e.target.value; });
    newColInput.addEventListener('keydown', (e)=>{ if(e.key==='Enter') addColumn(); });
  }
  app.querySelectorAll('[data-action="confirm-add-col"]').forEach(btn=> btn.addEventListener('click', addColumn));
  app.querySelectorAll('[data-action="cancel-add-col"]').forEach(btn=> btn.addEventListener('click', ()=>{ addingCol=false; newColNameVal=''; renderApp(); }));

  /* drag and drop */
  app.querySelectorAll('.card').forEach(cardEl=>{
    cardEl.addEventListener('dragstart', (e)=>{
      e.dataTransfer.setData('text/x-crm-card', cardEl.dataset.cardId);
      cardEl.classList.add('dragging');
    });
    cardEl.addEventListener('dragend', ()=>{ cardEl.classList.remove('dragging'); clearInterval(autoScrollDoArrastoInterval); limparIndicadorDeInsercao(); document.querySelectorAll('.column.coluna-drag-alvo').forEach(c=> c.classList.remove('coluna-drag-alvo')); });

    // Arrastar por toque no card inteiro — usa Pointer Events com setPointerCapture.
    // O CSS do .card já trava touch-action:none desde o início (precisa ser assim,
    // travar depois que o toque já começou não tem efeito — é por isso que antes
    // tocar e segurar acabava selecionando texto: o navegador assumia esse gesto
    // por conta própria). Só que travar touch-action:none tira a rolagem nativa da
    // lista também — por isso, aqui embaixo, quando o gesto claramente é rolar (dedo
    // se move rápido, sem pausa) em vez de arrastar (segura parado um instante), a
    // gente rola a lista na mão, imitando o que o navegador faria sozinho.
    cardEl.addEventListener('pointerdown', (e)=>{
      if(e.pointerType === 'mouse') return;
      if(e.target.closest('.card-move-wrap') || e.target.closest('[data-action="toggle-move-menu"]') || e.target.closest('.wa-btn')) return; // não conflita com os botões
      const cardsContainer = cardEl.closest('.cards');
      cardTouchDrag = {
        cardId: cardEl.dataset.cardId, cardEl, arrastando:false, modoRolagem:false,
        startX:e.clientX, startY:e.clientY, ultimoX:e.clientX, ultimoY:e.clientY,
        pointerId:e.pointerId, cardsContainer, scrollInicial: cardsContainer ? cardsContainer.scrollTop : 0, scrollJanelaInicial: window.scrollY,
      };
      cardTouchLongPressTimer = setTimeout(()=>{
        if(!cardTouchDrag || cardTouchDrag.modoRolagem) return; // já virou rolagem, não inicia arrastar
        try{ cardEl.setPointerCapture(cardTouchDrag.pointerId); }catch(err){ /* aparelho sem suporte — segue sem capturar */ }
        iniciarArrastoDeCard(cardTouchDrag.ultimoX, cardTouchDrag.ultimoY);
      }, 280);
    });

    cardEl.addEventListener('pointermove', (e)=>{
      if(!cardTouchDrag || cardTouchDrag.cardEl !== cardEl || cardTouchDrag.pointerId !== e.pointerId) return;
      const dxTotal = e.clientX - cardTouchDrag.startX;
      const dyTotal = e.clientY - cardTouchDrag.startY;
      cardTouchDrag.ultimoX = e.clientX;
      cardTouchDrag.ultimoY = e.clientY;

      if(!cardTouchDrag.arrastando && !cardTouchDrag.modoRolagem){
        if(Math.sqrt(dxTotal*dxTotal + dyTotal*dyTotal) > 10){
          // se moveu antes do temporizador confirmar o arrastar, é rolagem, não segurar-parado
          clearTimeout(cardTouchLongPressTimer);
          cardTouchDrag.modoRolagem = true;
        } else {
          return; // ainda não decidiu — pode virar arrastar (temporizador) ou rolagem (mais movimento)
        }
      }

      if(cardTouchDrag.modoRolagem){
        e.preventDefault();
        // no celular a lista de uma etapa rola junto com a página
        if(ehCelular()) window.scrollTo(0, cardTouchDrag.scrollJanelaInicial - dyTotal);
        else if(cardTouchDrag.cardsContainer) cardTouchDrag.cardsContainer.scrollTop = cardTouchDrag.scrollInicial - dyTotal;
        return;
      }

      if(!cardTouchDrag.arrastando) return; // ainda esperando o temporizador decidir
      e.preventDefault();
      atualizarArrastoDeCard(e.clientX, e.clientY);
    }, { passive:false });

    cardEl.addEventListener('pointerup', (e)=>{
      clearTimeout(cardTouchLongPressTimer);
      if(!cardTouchDrag || cardTouchDrag.cardEl !== cardEl || cardTouchDrag.pointerId !== e.pointerId) return;
      if(cardTouchDrag.arrastando){
        e.preventDefault(); // evita o clique fantasma que abriria o card logo depois de soltar
        finalizarArrastoDeCard(e.clientX, e.clientY);
      }
      cardTouchDrag = null;
    });
    cardEl.addEventListener('pointercancel', ()=>{
      clearTimeout(cardTouchLongPressTimer);
      if(cardTouchDrag && cardTouchDrag.cardEl === cardEl && cardTouchDrag.arrastando) cancelarArrastoDeCard();
      cardTouchDrag = null;
    });
  });
  app.querySelectorAll('[data-action="drag-col-handle"]').forEach(gripEl=>{
    gripEl.addEventListener('dragstart', (e)=>{
      e.stopPropagation();
      e.dataTransfer.setData('text/x-crm-column', gripEl.dataset.colId);
      const colEl = gripEl.closest('.column');
      if(colEl) colEl.classList.add('dragging-col');
    });
    gripEl.addEventListener('dragend', (e)=>{
      e.stopPropagation();
      const colEl = gripEl.closest('.column');
      if(colEl) colEl.classList.remove('dragging-col');
    });
  });
  app.querySelectorAll('.column').forEach(colEl=>{
    colEl.addEventListener('dragenter', (e)=> e.preventDefault());
    colEl.addEventListener('dragover', (e)=>{
      e.preventDefault();
      atualizarAutoScrollDoArrasto(e.clientX, e.clientY, colEl);
      const cardArrastandoEl = document.querySelector('.card.dragging');
      if(cardArrastandoEl){
        mostrarIndicadorDeInsercao(colEl, e.clientY, cardArrastandoEl.dataset.cardId);
        // mesmo destaque cinza que já existia no arrastar por toque — dá a mesma
        // confirmação visual clara de "aqui vai soltar" também no mouse
        document.querySelectorAll('.column.coluna-drag-alvo').forEach(c=>{ if(c!==colEl) c.classList.remove('coluna-drag-alvo'); });
        colEl.classList.add('coluna-drag-alvo');
      }
    });
    colEl.addEventListener('dragleave', (e)=>{
      clearInterval(autoScrollDoArrastoInterval);
      // só tira o destaque se o mouse realmente saiu da coluna (não só passou por cima
      // de um card filho dentro dela, o que também dispara dragleave por engano)
      if(!colEl.contains(e.relatedTarget)) colEl.classList.remove('coluna-drag-alvo');
    });
    colEl.addEventListener('drop', (e)=>{
      e.preventDefault();
      clearInterval(autoScrollDoArrastoInterval);
      limparIndicadorDeInsercao();
      colEl.classList.remove('coluna-drag-alvo');
      const colId = e.dataTransfer.getData('text/x-crm-column');
      const cardId = e.dataTransfer.getData('text/x-crm-card');
      if(colId) reorderColumns(colId, colEl.dataset.colId);
      else if(cardId){
        const ordem = calcularOrdemDeInsercao(colEl, e.clientY, cardId);
        moveCard(cardId, colEl.dataset.colId, ordem);
      }
    });
  });

  document.addEventListener('click', closeMenusOnOutsideClick);
  document.addEventListener('dragover', permitirDropForaDasColunas);
  document.addEventListener('dragenter', permitirDropForaDasColunas);
  renderFloatingMoveMenu();
}
// Renderiza o menu "Mover para" fora do card (que tem overflow:hidden e cortava as
// opções de baixo) — usa uma raiz própria, colada no fim do <body>, posicionada via
// JS com as coordenadas reais do botão que foi clicado.
// Arrastar card por toque — cria um "fantasma" fixo que segue o dedo, deixando bem
// visível o que está sendo movido. O fantasma tem pointer-events:none de propósito,
// senão ele mesmo apareceria como "o que está embaixo do dedo" ao consultar
// elementFromPoint, escondendo a coluna real por trás dele.
function iniciarArrastoDeCard(x, y){
  if(!cardTouchDrag) return;
  cardTouchDrag.arrastando = true;
  const rect = cardTouchDrag.cardEl.getBoundingClientRect();
  cardTouchDrag.cardEl.classList.add('card-touch-arrastando');
  const fantasma = document.createElement('div');
  fantasma.id = 'card-touch-fantasma';
  fantasma.className = 'card-touch-fantasma';
  const z = (window.zoomDaTela ? window.zoomDaTela() : 1);
  fantasma.style.width = rect.width / z + 'px';
  fantasma.style.left = (x - rect.width/2) / z + 'px';
  fantasma.style.top = (y - 24) / z + 'px';
  fantasma.innerHTML = cardTouchDrag.cardEl.querySelector('.card-body') ? cardTouchDrag.cardEl.querySelector('.card-body').innerHTML : cardTouchDrag.cardEl.innerHTML;
  document.body.appendChild(fantasma);
  cardTouchDrag.fantasmaEl = fantasma;
  if(navigator.vibrate) navigator.vibrate(15);
  atualizarArrastoDeCard(x, y);
}
function atualizarArrastoDeCard(x, y){
  if(!cardTouchDrag || !cardTouchDrag.fantasmaEl) return;
  // isso aqui é barato — atualiza sempre na hora, o fantasma nunca fica atrasado atrás do dedo
  const z = (window.zoomDaTela ? window.zoomDaTela() : 1);
  cardTouchDrag.fantasmaEl.style.left = (x / z - cardTouchDrag.fantasmaEl.offsetWidth/2) + 'px';
  cardTouchDrag.fantasmaEl.style.top = (y - 24) / z + 'px';
  cardTouchDrag.ultimoXCalculo = x;
  cardTouchDrag.ultimoYCalculo = y;
  // isso aqui é caro (olha a posição de TODOS os cards da coluna, toda vez) — segurando
  // por muito tempo, o dedo dispara centenas de eventos de movimento, e refazer essa
  // conta pesada em cada um deles ia acumulando trabalho e deixando tudo mais lento
  // (parecendo "parar de reconhecer" depois de um tempo). Por isso, no máximo uma vez
  // por quadro de tela (~60x por segundo), nunca mais que isso.
  if(arrastoRafPendente) return;
  arrastoRafPendente = true;
  requestAnimationFrame(()=>{
    arrastoRafPendente = false;
    if(!cardTouchDrag) return;
    const xAtual = cardTouchDrag.ultimoXCalculo, yAtual = cardTouchDrag.ultimoYCalculo;
    verificarChipDeEtapaSobDedo(xAtual, yAtual);
    const colAlvo = encontrarColunaMaisProxima(xAtual);
    document.querySelectorAll('.column.coluna-drag-alvo').forEach(c=> c.classList.remove('coluna-drag-alvo'));
    if(colAlvo){
      colAlvo.classList.add('coluna-drag-alvo');
      mostrarIndicadorDeInsercao(colAlvo, yAtual, cardTouchDrag.cardId);
    }
    atualizarAutoScrollDoArrasto(xAtual, yAtual, colAlvo);
  });
}
// Acha a coluna sob o dedo — e se não achar nenhuma exatamente ali (dedo soltou bem
// na borda entre duas colunas, ou num pixel qualquer fora delas), pega a mais próxima
// pela posição horizontal, em vez de simplesmente desistir. É bem mais tolerante que
// depender de acertar o pixel exato num aparelho de toque.
function encontrarColunaMaisProxima(x){
  // só as colunas à vista (no celular, a etapa aberta)
  const colunas = [...document.querySelectorAll('.column')].filter(c=> c.offsetParent !== null);
  if(!colunas.length) return null;
  const dentro = colunas.find(c=>{
    const r = c.getBoundingClientRect();
    return x >= r.left && x <= r.right;
  });
  if(dentro) return dentro;
  let maisProxima = null, menorDist = Infinity;
  colunas.forEach(c=>{
    const r = c.getBoundingClientRect();
    const centro = (r.left + r.right) / 2;
    const dist = Math.abs(x - centro);
    if(dist < menorDist){ menorDist = dist; maisProxima = c; }
  });
  return maisProxima;
}
// Rola a tela sozinha quando o dedo (arrastando um card) chega perto da borda —
// horizontal pra passar de uma coluna pra outra que não estava visível, vertical
// pra descer/subir dentro de uma coluna comprida. Fica repetindo a cada quadro
// enquanto o dedo continuar perto da borda; some assim que ele se afasta.
// Sem isso, o navegador mostra o símbolo de "proibido" sempre que o mouse passa por
// fora de uma coluna durante o arrastar (a barra lateral, por exemplo) — mesmo que a
// intenção seja só passar por cima pra rolar até uma coluna escondida. Isso libera
// soltar em qualquer lugar da tela, mas só quando é de fato um card/coluna nosso
// sendo arrastado (não mexe em outros tipos de arrastar, tipo um arquivo do sistema).
function permitirDropForaDasColunas(e){
  const tipos = e.dataTransfer && e.dataTransfer.types;
  if(!tipos || (!tipos.includes('text/x-crm-card') && !tipos.includes('text/x-crm-column'))) return;
  if(e.target.closest('.column')) return; // já tratado pelo listener da própria coluna
  e.preventDefault();
  atualizarAutoScrollDoArrasto(e.clientX, e.clientY, null);
}
function atualizarAutoScrollDoArrasto(x, y, colAlvo){
  clearInterval(autoScrollDoArrastoInterval);
  // celular: a página rola para cima (rumo aos chips de etapa) ou para baixo
  if(ehCelular() && cardTouchDrag){
    let dy = 0;
    if(!cardTouchDrag.chipHover && y < 130) dy = -12;
    else if(y > window.innerHeight - 150) dy = 12;
    if(dy) autoScrollDoArrastoInterval = setInterval(()=> window.scrollBy(0, dy), 16);
    return;
  }
  const margemHorizontal = 260; // cobre a largura da barra lateral — passar por cima dela já conta como "quero rolar pra lá"
  const margemVertical = 110;
  const mainEl = document.querySelector('main.pipeline-main');
  let dxScroll = 0;
  if(mainEl){
    if(x < margemHorizontal) dxScroll = -16;
    else if(x > window.innerWidth - margemHorizontal) dxScroll = 16;
  }
  const colunaCardsEl = colAlvo ? colAlvo.querySelector('.cards') : null;
  let dyScroll = 0;
  if(colunaCardsEl){
    if(y < margemVertical) dyScroll = -12;
    else if(y > window.innerHeight - margemVertical) dyScroll = 12;
  }
  if(dxScroll===0 && dyScroll===0) return;
  autoScrollDoArrastoInterval = setInterval(()=>{
    if(mainEl && dxScroll) mainEl.scrollLeft += dxScroll;
    if(colunaCardsEl && dyScroll) colunaCardsEl.scrollTop += dyScroll;
  }, 16);
}
function finalizarArrastoDeCard(x, y){
  if(!cardTouchDrag) return;
  const colAlvo = encontrarColunaMaisProxima(x);
  const cardId = cardTouchDrag.cardId;
  limparVisualDoArrasto();
  if(colAlvo && colAlvo.dataset.colId){
    const ordem = calcularOrdemDeInsercao(colAlvo, y, cardId);
    moveCard(cardId, colAlvo.dataset.colId, ordem);
  }
}
function cancelarArrastoDeCard(){
  limparVisualDoArrasto();
}
function limparVisualDoArrasto(){
  if(!cardTouchDrag) return;
  clearInterval(autoScrollDoArrastoInterval);
  clearTimeout(chipHoverTimer);
  document.querySelectorAll('.etapa-chip-mobile.etapa-chip-alvo').forEach(c=> c.classList.remove('etapa-chip-alvo'));
  cardTouchDrag.cardEl.classList.remove('card-touch-arrastando');
  if(cardTouchDrag.fantasmaEl) cardTouchDrag.fantasmaEl.remove();
  document.querySelectorAll('.column.coluna-drag-alvo').forEach(c=> c.classList.remove('coluna-drag-alvo'));
  limparIndicadorDeInsercao();
}
function renderFloatingMoveMenu(){
  let root = document.getElementById('floating-menu-root');
  if(!root){
    root = document.createElement('div');
    root.id = 'floating-menu-root';
    document.body.appendChild(root);
  }
  if(!openMoveMenuCardId){ root.innerHTML = ''; return; }
  const btn = document.querySelector(`[data-action="toggle-move-menu"][data-card-id="${openMoveMenuCardId}"]`);
  const card = board.cards.find(c=>c.id===openMoveMenuCardId);
  if(!btn || !card){ root.innerHTML = ''; openMoveMenuCardId = null; return; }

  const colunasDoMesmoFunil = board.columns.filter(c=>c.funilId===funilAtualId);
  const rect = btn.getBoundingClientRect();
  const alturaEstimada = Math.min(260, colunasDoMesmoFunil.length * 40 + 40);
  const cabeDeBaixo = rect.bottom + alturaEstimada < window.innerHeight;
  const top = cabeDeBaixo ? rect.bottom + 4 : rect.top - alturaEstimada - 4;
  const left = Math.min(rect.left, window.innerWidth - 200); // não deixa vazar pela direita da tela

  root.innerHTML = `
    <div class="col-menu card-move-menu" style="position:fixed; top:${Math.max(4,top) / (window.zoomDaTela ? window.zoomDaTela() : 1)}px; left:${Math.max(4,left) / (window.zoomDaTela ? window.zoomDaTela() : 1)}px;">
      <div class="col-menu-title">Mover para</div>
      ${colunasDoMesmoFunil.map(c=>`
        <button class="col-menu-item" data-action="mover-para-coluna" data-card-id="${card.id}" data-col-id="${c.id}" ${c.id===card.columnId?'disabled':''}>
          ${esc(c.nome)} ${c.id===card.columnId?'✓':''}
        </button>
      `).join('')}
    </div>
  `;
  root.querySelectorAll('[data-action="mover-para-coluna"]').forEach(b=>{
    b.addEventListener('click', (e)=>{
      e.stopPropagation();
      if(b.disabled) return;
      openMoveMenuCardId = null;
      moveCard(b.dataset.cardId, b.dataset.colId);
    });
  });
}
function closeMenusOnOutsideClick(e){
  if(openMenuColId && !e.target.closest('.col-menu') && !e.target.closest('[data-action="toggle-col-menu"]')){
    openMenuColId = null; renderApp();
  }
  if(openMoveMenuCardId && !e.target.closest('.card-move-menu') && !e.target.closest('[data-action="toggle-move-menu"]')){
    openMoveMenuCardId = null; renderFloatingMoveMenu();
  }
  if(menuDiaAberto && !e.target.closest('#menu-dia-root')){
    fecharMenuDia();
  }
  if(dateMenuOpen && !e.target.closest('.date-menu') && !e.target.closest('[data-action="toggle-date-menu"]')){
    dateMenuOpen = false; renderApp();
  }
  if(notifOpen && !e.target.closest('.notif-panel') && !e.target.closest('[data-action="toggle-notif"]')){
    notifOpen = false; renderApp();
  }
  if(ordenarMenuAberto && !e.target.closest('.ordenar-wrap')){
    ordenarMenuAberto = null; renderApp();
  }
}

/* ---------- modal do cliente ---------- */
function openNewCard(columnId){
  const colId = columnId || ((board.columns.find(c=>c.tipo==='aberto') || board.columns[0] || {}).id);
  escolhaTipoPessoaColId = colId;
  renderEscolhaTipoPessoaModal();
}
function fecharEscolhaTipoPessoa(){
  escolhaTipoPessoaColId = null;
  document.getElementById('modal-root').innerHTML = '';
}
function renderEscolhaTipoPessoaModal(){
  const root = document.getElementById('modal-root');
  root.innerHTML = `
    <div class="overlay" id="escolha-tipo-overlay">
      <div class="modal" style="max-width:380px;">
        <div class="modal-head">
          <h3>Novo contato</h3>
          <button id="escolha-tipo-close">✕</button>
        </div>
        <div class="modal-body" style="display:flex; flex-direction:column; gap:10px;">
          <button type="button" class="tipo-pessoa-escolha-btn" data-tipo="fisica">👤 Pessoa física</button>
          <button type="button" class="tipo-pessoa-escolha-btn" data-tipo="juridica">🏢 Pessoa jurídica</button>
        </div>
      </div>
    </div>
  `;
  document.getElementById('escolha-tipo-close').addEventListener('click', fecharEscolhaTipoPessoa);
  document.getElementById('escolha-tipo-overlay').addEventListener('click', (e)=>{ if(e.target.id==='escolha-tipo-overlay') fecharEscolhaTipoPessoa(); });
  root.querySelectorAll('.tipo-pessoa-escolha-btn').forEach(btn=>{
    btn.addEventListener('click', ()=> abrirNovoCardComTipo(escolhaTipoPessoaColId, btn.dataset.tipo));
  });
}
function abrirNovoCardComTipo(columnId, tipoPessoa){
  // início de contato = hoje (data de Brasília). Vendo outro mês nas Negociações, usa o mesmo dia
  // naquele mês (senão o cliente novo sumiria da tela que a pessoa está olhando)
  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
  let dataInicial = hoje;
  if(filterMonth && filterMonth !== hoje.slice(0,7)){
    const [a, m] = filterMonth.split('-').map(Number);
    const ultimoDia = new Date(a, m, 0).getDate();
    dataInicial = `${filterMonth}-${String(Math.min(Number(hoje.slice(8,10)), ultimoDia)).padStart(2,'0')}`;
  }
  modalForm = {
    __isNew: true, id:null, columnId,
    cliente:'', valor:0, temperatura:'morno', telefone:'', obs:'',
    mes: '', mesInicioContato: dataInicial, // início de contato já vem preenchido (é agora); mês de venda fica em branco até a venda acontecer de verdade
    etiquetas: [], camposPersonalizados: {}, tipoProduto: tipoProdutoPadrao(),
    tipoPessoa, clienteFisica:'', clienteJuridica:'',
    cnpj:'', razaoSocial:'', inscricaoEstadual:'', ramoAtividade:'', contatoNome:'', contatoCargo:'',
  };
  tipoPessoaDropdownAberto = false;
  extrasTela = null; // sem isso, se a última coisa vista tivesse sido a tela de Extras
                      // de outro cliente, o formulário de novo lead nascia mostrando
                      // aquela tela por engano, em vez do formulário de verdade
  renderModal();
}
async function toggleArquivarCard(){
  if(!modalForm || modalForm.__isNew) return;
  const arquivarAgora = !modalForm.arquivado;
  try{
    const atualizado = await apiRequest('PUT', `/cards/${modalForm.id}/${arquivarAgora?'arquivar':'desarquivar'}`);
    const idx = board.cards.findIndex(c=>c.id===modalForm.id);
    if(idx>-1) board.cards[idx] = atualizado;
    if(arquivarAgora){
      closeModal();
      renderApp();
    } else {
      modalForm.arquivado = atualizado.arquivado;
      renderModal();
      renderApp();
    }
  }catch(e){
    errorMsg = 'Não foi possível atualizar o arquivamento.';
    renderApp();
  }
}
function openEditCard(id){
  const card = board.cards.find(c=>c.id===id);
  if(!card) return;
  modalForm = {
    ...card, __isNew:false,
    clienteFisica: card.tipoPessoa==='juridica' ? '' : (card.cliente||''),
    clienteJuridica: card.tipoPessoa==='juridica' ? (card.cliente||'') : '',
  };
  tipoPessoaDropdownAberto = false;
  notifOpen = false;
  extrasTela = null;
  etiquetaInputValor = '';
  etiquetaEditandoOriginal = null;
  anexosCarregados = false;
  anexosDoCard = [];
  anexoMsg = null;
  historicoContatoCarregado = false;
  historicoContatoItens = [];
  historicoContatoTexto = '';
  tarefasRapidasLista = [{ titulo:'', data:'' }];
  tarefaRapidaCriando = false;
  renderModal();
  loadAnexosDoCard(id);
  loadHistoricoContato(id);
}
function abrirMaisUmaLinhaDeTarefa(){
  tarefasRapidasLista.push({ titulo:'', data:'' });
  renderModal();
  const novoInput = document.querySelector(`.tarefa-rapida-titulo-input[data-idx="${tarefasRapidasLista.length-1}"]`);
  if(novoInput) novoInput.focus();
}
function removerLinhaDeTarefa(idx){
  if(tarefasRapidasLista.length <= 1) return; // sempre sobra pelo menos uma linha
  tarefasRapidasLista.splice(idx, 1);
  renderModal();
}
async function criarTarefaRapidaDoCard(){
  if(!modalForm || modalForm.__isNew) return;
  const validas = tarefasRapidasLista
    .map(t=> ({ titulo: t.titulo.trim(), data: t.data || new Date().toISOString().slice(0,10) }))
    .filter(t=> t.titulo);
  if(!validas.length) return;

  showConfirm({
    message: validas.length===1
      ? `Confirmar a criação da tarefa "${validas[0].titulo}"?`
      : `Confirmar a criação dessas ${validas.length} tarefas?`,
    confirmLabel: 'Confirmar',
    danger: false,
    onConfirm: async ()=>{
      closeConfirm();
      tarefaRapidaCriando = true;
      renderModal();
      try{
        for(const t of validas){
          const nova = await apiRequest('POST', '/tasks', { titulo: t.titulo, vencimento: t.data, prioridade:'media', leadId: modalForm.id, descricao:'' });
          tasks.push(nova);
          atualizarTarefaNaAgendaLocal(nova);
        }
        tarefaRapidaCriando = false;
        tarefasRapidasLista = [{ titulo:'', data:'' }]; // volta pro estado inicial — "segmento acima"
        renderModal();
        const dataMaisCedo = validas.map(t=>t.data).sort()[0];
        showConfirm({
          message: validas.length===1 ? 'Tarefa criada! Quer ir pra Agenda ver ela?' : 'Tarefas criadas! Quer ir pra Agenda ver elas?',
          confirmLabel: 'Ir pra Agenda',
          cancelLabel: 'Continuar aqui',
          danger: false,
          onConfirm: async ()=>{
            closeConfirm();
            closeModal();
            agendaMesAtual = dataMaisCedo.slice(0,7);
            goToPage('tarefas');
            await loadAgendaMes(agendaMesAtual);
            agendaDiaSelecionado = dataMaisCedo;
            agendaDiaDestacado = dataMaisCedo;
            renderAgendaDiaModal();
          },
        });
      }catch(e){
        errorMsg = 'Não foi possível criar as tarefas.';
        tarefaRapidaCriando = false;
        renderModal();
      }
    },
  });
}
function closeModal(){ modalForm = null; document.getElementById('modal-root').innerHTML=''; }

function renderExtrasOverlayHtml(f){
  let titulo = 'Extras';
  let voltarPara = null; // pra onde o botão de voltar leva — null fecha os Extras de vez
  let corpo = '';

  if(extrasTela === 'menu'){
    corpo = `
      <div class="extras-menu">
        <button type="button" class="extras-menu-btn" data-action="extras-ir" data-tela="etiquetas">🏷️<span>Etiquetas</span></button>
        <button type="button" class="extras-menu-btn" data-action="extras-ir" data-tela="anexos">📎<span>Anexos</span></button>
        <button type="button" class="extras-menu-btn" data-action="extras-ir" data-tela="tarefas">✅<span>Tarefas</span></button>
        <button type="button" class="extras-menu-btn" data-action="extras-ir" data-tela="historico">📞<span>Histórico</span></button>
      </div>
    `;
  } else if(extrasTela === 'etiquetas'){
    titulo = 'Etiquetas';
    voltarPara = 'menu';
    const etiquetas = f.etiquetas || [];
    corpo = `
      <div class="field-row-flex">
        <input type="text" id="etiqueta-input" value="${esc(etiquetaInputValor)}" placeholder="Nome da etiqueta" />
        <button type="button" class="btn-primary" id="etiqueta-salvar-btn">${etiquetaEditandoOriginal ? 'Salvar' : '+ Adicionar'}</button>
        ${etiquetaEditandoOriginal ? `<button type="button" class="btn-outline" id="etiqueta-cancelar-btn">Cancelar</button>` : ''}
      </div>
      ${etiquetas.length ? `
        <div class="etiquetas-pills" style="margin-top:14px;">
          ${etiquetas.map(et=>`
            <span class="etiqueta-pill etiqueta-pill-editavel">
              ${esc(et)}
              <button type="button" data-action="etiqueta-editar" data-etiqueta="${esc(et)}" title="Editar">✎</button>
              <button type="button" data-action="etiqueta-apagar" data-etiqueta="${esc(et)}" title="Apagar">✕</button>
            </span>
          `).join('')}
        </div>
      ` : '<p class="dash-empty">Nenhuma etiqueta ainda.</p>'}
    `;
  } else if(extrasTela === 'anexos'){
    titulo = 'Anexos';
    voltarPara = 'menu';
    corpo = `
      <input type="file" id="anexo-input" style="display:none;" accept="image/*,application/pdf" />
      <button type="button" class="btn-outline" id="anexo-upload-btn" ${anexoEnviando?'disabled':''}>${anexoEnviando?'Enviando…':'+ Adicionar anexo'}</button>
      <p class="settings-page-note">Imagens ou PDF, até ~3 MB por arquivo.</p>
      <div id="f-anexos-lista">${!anexosCarregados ? '<p class="settings-page-note">Carregando…</p>' : renderAnexosListaHtml()}</div>
    `;
  } else if(extrasTela === 'tarefas'){
    titulo = 'Tarefas';
    voltarPara = 'menu';
    const qtd = tasks.filter(t=>t.leadId===f.id).length;
    corpo = `
      <div class="field">
        <label>Nova(s) tarefa(s)</label>
        ${tarefasRapidasLista.map((t,i)=>`
          <div class="field-row-flex tarefa-rapida-linha">
            <input type="text" class="tarefa-rapida-titulo-input" data-idx="${i}" value="${esc(t.titulo)}" placeholder="Ex: Ligar amanhã de manhã" />
            <input type="date" class="tarefa-rapida-data-input" data-idx="${i}" value="${t.data || new Date().toISOString().slice(0,10)}" style="max-width:160px;" />
            ${i === tarefasRapidasLista.length-1
              ? `<button type="button" class="icon-btn" data-action="tarefa-rapida-add-linha" title="Adicionar outra tarefa">+</button>`
              : `<button type="button" class="icon-btn" data-action="tarefa-rapida-remover-linha" data-idx="${i}" title="Remover essa tarefa">✕</button>`
            }
          </div>
        `).join('')}
        <button type="button" class="btn-primary" style="width:100%; margin-top:8px;" id="tarefa-rapida-criar-btn" ${tarefaRapidaCriando?'disabled':''}>${tarefaRapidaCriando?'Criando…':'Confirmar'}</button>
      </div>
      <button type="button" class="btn-outline" style="width:100%;" data-action="extras-ir" data-tela="tarefas-lista">Ver tarefas existentes (${qtd})</button>
    `;
  } else if(extrasTela === 'tarefas-lista'){
    titulo = 'Tarefas existentes';
    voltarPara = 'tarefas';
    const tarefasDoLead = tasks.filter(t=>t.leadId===f.id).slice().sort((a,b)=> (a.vencimento||'').localeCompare(b.vencimento||''));
    corpo = tarefasDoLead.length ? `
      <div class="historico-lista">
        ${tarefasDoLead.map(t=>`
          <button type="button" class="historico-item historico-item-clicavel" data-action="extras-perguntar-conclusao-tarefa" data-task-id="${t.id}">
            <div style="flex:1; text-align:left;">
              <span class="historico-item-texto">${t.concluida?'✓ ':''}${esc(t.titulo)}</span>
              <span class="historico-item-data">${t.vencimento ? formatDate(t.vencimento) : 'Sem data'}</span>
            </div>
          </button>
        `).join('')}
      </div>
    ` : '<p class="dash-empty">Nenhuma tarefa ainda pra esse contato.</p>';
  } else if(extrasTela === 'historico'){
    titulo = 'Histórico de contato';
    voltarPara = 'menu';
    corpo = `
      <div class="field-row-flex">
        <input type="text" id="historico-input" value="${esc(historicoContatoTexto)}" placeholder="Ex: Tentei contato 3x hoje, cliente não atendeu" />
        <button type="button" class="btn-primary" id="historico-add-btn" ${historicoContatoEnviando?'disabled':''}>${historicoContatoEnviando?'Salvando…':'Adicionar'}</button>
      </div>
      <div id="f-historico-lista" style="margin-top:12px;">${!historicoContatoCarregado ? '<p class="settings-page-note">Carregando…</p>' : renderHistoricoContatoListaHtml()}</div>
    `;
  }

  return `
    <div class="overlay" id="modal-overlay">
      <div class="modal">
        <div class="modal-head">
          <button id="extras-voltar" class="icon-btn" title="Voltar" data-voltar-para="${voltarPara||''}">←</button>
          <h3>${titulo}</h3>
          <button id="modal-close">✕</button>
        </div>
        <div class="modal-body">${corpo}</div>
      </div>
    </div>
  `;
}
function ligarBindingsExtras(){
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('modal-overlay').addEventListener('click', (e)=>{ if(e.target.id==='modal-overlay') closeModal(); });
  const voltarBtn = document.getElementById('extras-voltar');
  if(voltarBtn) voltarBtn.addEventListener('click', ()=>{
    const para = voltarBtn.dataset.voltarPara;
    extrasTela = para || null; // sem "voltarPara" = fecha os Extras de vez, volta pro formulário
    etiquetaEditandoOriginal = null;
    etiquetaInputValor = '';
    renderModal();
  });
  app.querySelectorAll ? null : null; // (sem uso — mantém o padrão dos outros bindings do arquivo)

  document.querySelectorAll('[data-action="extras-ir"]').forEach(btn=>{
    btn.addEventListener('click', ()=>{ extrasTela = btn.dataset.tela; renderModal(); });
  });

  // Etiquetas
  const etiquetaInput = document.getElementById('etiqueta-input');
  if(etiquetaInput) etiquetaInput.addEventListener('input', (e)=> etiquetaInputValor = e.target.value);
  const etiquetaSalvarBtn = document.getElementById('etiqueta-salvar-btn');
  if(etiquetaSalvarBtn) etiquetaSalvarBtn.addEventListener('click', salvarEtiquetaExtras);
  const etiquetaCancelarBtn = document.getElementById('etiqueta-cancelar-btn');
  if(etiquetaCancelarBtn) etiquetaCancelarBtn.addEventListener('click', ()=>{
    etiquetaEditandoOriginal = null; etiquetaInputValor = ''; renderModal();
  });
  document.querySelectorAll('[data-action="etiqueta-editar"]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      etiquetaEditandoOriginal = btn.dataset.etiqueta;
      etiquetaInputValor = btn.dataset.etiqueta;
      renderModal();
      const input = document.getElementById('etiqueta-input');
      if(input){ input.focus(); input.select(); }
    });
  });
  document.querySelectorAll('[data-action="etiqueta-apagar"]').forEach(btn=>{
    btn.addEventListener('click', ()=> apagarEtiquetaExtras(btn.dataset.etiqueta));
  });

  // Anexos (mesmo comportamento de antes, só que agora dentro dos Extras)
  const anexoInput = document.getElementById('anexo-input');
  const anexoUploadBtn = document.getElementById('anexo-upload-btn');
  if(anexoUploadBtn && anexoInput) anexoUploadBtn.addEventListener('click', ()=> anexoInput.click());
  if(anexoInput) anexoInput.addEventListener('change', (e)=>{
    const file = e.target.files && e.target.files[0];
    if(file) handleAnexoFileSelected(file);
  });

  // Tarefas
  document.querySelectorAll('.tarefa-rapida-titulo-input').forEach(input=>{
    input.addEventListener('input', (e)=>{ tarefasRapidasLista[Number(input.dataset.idx)].titulo = e.target.value; });
  });
  document.querySelectorAll('.tarefa-rapida-data-input').forEach(input=>{
    input.addEventListener('input', (e)=>{ tarefasRapidasLista[Number(input.dataset.idx)].data = e.target.value; });
  });
  const tarefaRapidaAddBtn = document.querySelector('[data-action="tarefa-rapida-add-linha"]');
  if(tarefaRapidaAddBtn) tarefaRapidaAddBtn.addEventListener('click', abrirMaisUmaLinhaDeTarefa);
  document.querySelectorAll('[data-action="tarefa-rapida-remover-linha"]').forEach(btn=>{
    btn.addEventListener('click', ()=> removerLinhaDeTarefa(Number(btn.dataset.idx)));
  });
  const tarefaRapidaCriarBtn = document.getElementById('tarefa-rapida-criar-btn');
  if(tarefaRapidaCriarBtn) tarefaRapidaCriarBtn.addEventListener('click', criarTarefaRapidaDoCard);
  document.querySelectorAll('[data-action="extras-perguntar-conclusao-tarefa"]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const taskId = btn.dataset.taskId;
      const task = tasks.find(t=>t.id===taskId);
      if(!task) return;
      const mensagem = task.concluida
        ? `Marcar "${task.titulo}" como não concluída de novo?`
        : `A tarefa "${task.titulo}" foi concluída?`;
      showConfirm({
        message: mensagem,
        confirmLabel: task.concluida ? 'Desmarcar' : 'Concluída',
        danger: false,
        onConfirm: async ()=>{
          closeConfirm();
          await toggleTaskConcluida(taskId);
          if(extrasTela==='tarefas-lista') renderModal(); // atualiza a marcação (✓) na lista, já que renderApp() não mexe no modal
        },
      });
    });
  });

  // Histórico de contato
  const historicoInput = document.getElementById('historico-input');
  if(historicoInput){
    historicoInput.addEventListener('input', (e)=> historicoContatoTexto = e.target.value);
    historicoInput.addEventListener('keydown', (e)=>{ if(e.key==='Enter'){ e.preventDefault(); adicionarHistoricoContato(); } });
  }
  const historicoAddBtn = document.getElementById('historico-add-btn');
  if(historicoAddBtn) historicoAddBtn.addEventListener('click', adicionarHistoricoContato);
  ligarBindingsHistoricoContato();
}
async function salvarEtiquetaExtras(){
  const novoValor = etiquetaInputValor.trim();
  if(!novoValor || !modalForm) return;
  const atuais = modalForm.etiquetas || [];
  let novasEtiquetas;
  if(etiquetaEditandoOriginal){
    novasEtiquetas = atuais.map(et=> et===etiquetaEditandoOriginal ? novoValor : et);
  } else {
    if(atuais.includes(novoValor)){ etiquetaInputValor=''; renderModal(); return; } // já existe, não duplica
    novasEtiquetas = [...atuais, novoValor];
  }
  await salvarEtiquetasNoCard(novasEtiquetas);
  etiquetaEditandoOriginal = null;
  etiquetaInputValor = '';
  renderModal();
}
async function apagarEtiquetaExtras(etiqueta){
  if(!modalForm) return;
  const novasEtiquetas = (modalForm.etiquetas||[]).filter(et=> et!==etiqueta);
  await salvarEtiquetasNoCard(novasEtiquetas);
  renderModal();
}
async function salvarEtiquetasNoCard(novasEtiquetas){
  const anteriores = modalForm.etiquetas || [];
  modalForm.etiquetas = novasEtiquetas; // otimista
  try{
    await apiRequest('PUT', `/cards/${modalForm.id}`, { etiquetas: novasEtiquetas });
    const card = board.cards.find(c=>c.id===modalForm.id);
    if(card) card.etiquetas = novasEtiquetas;
  }catch(e){
    modalForm.etiquetas = anteriores;
    errorMsg = 'Não foi possível salvar as etiquetas.';
  }
}

function renderModal(){
  const root = document.getElementById('modal-root');
  if(!modalForm){ root.innerHTML=''; return; }
  const f = modalForm;

  // Extras (etiquetas/anexos/tarefas/histórico) só faz sentido pra um card que já
  // existe de verdade — um card novo não tem id ainda pra buscar nada disso. Essa
  // checagem extra evita mostrar a tela de Extras por engano caso extrasTela tenha
  // ficado "grudado" de uma interação anterior com outro cliente.
  if(extrasTela && !f.__isNew){
    root.innerHTML = renderExtrasOverlayHtml(f);
    ligarBindingsExtras();
    return;
  }

  root.innerHTML = `
    <div class="overlay" id="modal-overlay">
      <div class="modal">
        <div class="modal-head">
          <h3>${f.__isNew ? 'Novo cliente' : 'Editar cliente'}</h3>
          <button id="modal-close">✕</button>
        </div>
        <div class="modal-body">
          ${podeAtribuirLeads() ? `
          <div class="field">
            <label>Modo</label>
            <div class="modo-gestor-toggle">
              <button type="button" class="modo-gestor-btn ${!f.__modoGestor?'ativo':''}" data-modo-gestor="0">Padrão</button>
              <button type="button" class="modo-gestor-btn ${f.__modoGestor?'ativo':''}" data-modo-gestor="1">⭐ Gestor</button>
            </div>
            ${f.__modoGestor ? `
              <label style="margin-top:10px">${f.__isNew ? 'Adicionar este contato para' : 'Passar este contato para'}</label>
              <select id="f-atribuir-para">
                <option value="">Selecione uma pessoa…</option>
                ${equipe.membros.filter(m=>!m.souEu).map(m=>`<option value="${m.id}" ${f.__atribuirParaId===m.id?'selected':''}>${esc(m.nome||m.email)}${m.papel==='supervisor'?' ⭐':''}</option>`).join('')}
              </select>
              <p class="settings-page-note" style="margin:6px 0 0">${f.__isNew ? 'O contato vai direto para as negociações da pessoa escolhida, na coluna de mesmo nome (ou na primeira em aberto).' : 'O contato sai das suas negociações e vai para o da pessoa escolhida, junto com conversas, anexos, tarefas e histórico.'}</p>
            ` : ''}
          </div>` : ''}
          <div class="field">
            <button type="button" class="tipo-pessoa-select-btn" id="f-tipo-pessoa-select">
              <span>${f.tipoPessoa==='juridica' ? '🏢 Pessoa jurídica' : '👤 Pessoa física'}</span>
              <span class="tipo-pessoa-select-seta ${tipoPessoaDropdownAberto?'aberta':''}">▾</span>
            </button>
            ${tipoPessoaDropdownAberto ? `
              <div class="tipo-pessoa-dropdown">
                <button type="button" class="tipo-pessoa-dropdown-item" data-tipo-pessoa="fisica">👤 Pessoa física ${f.tipoPessoa!=='juridica'?'✓':''}</button>
                <button type="button" class="tipo-pessoa-dropdown-item" data-tipo-pessoa="juridica">🏢 Pessoa jurídica ${f.tipoPessoa==='juridica'?'✓':''}</button>
              </div>
            ` : ''}
          </div>
          <div class="field">
            <label>${f.tipoPessoa==='juridica' ? 'Nome fantasia' : 'Nome do cliente'}</label>
            <input type="text" id="f-cliente" value="${esc(f.tipoPessoa==='juridica' ? (f.clienteJuridica||'') : (f.clienteFisica||''))}" placeholder="${f.tipoPessoa==='juridica' ? 'Ex: Padaria do João' : 'Ex: Ana Souza'}" />
          </div>
          ${f.tipoPessoa==='juridica' ? `
            <div class="field-row">
              <div class="field">
                <label>CNPJ</label>
                <input type="text" id="f-cnpj" value="${esc(f.cnpj||'')}" placeholder="00.000.000/0000-00" />
              </div>
              <div class="field">
                <label>Inscrição estadual (opcional)</label>
                <input type="text" id="f-inscricao-estadual" value="${esc(f.inscricaoEstadual||'')}" placeholder="Isento ou número" />
              </div>
            </div>
            <div class="field">
              <label>Razão social</label>
              <input type="text" id="f-razao-social" value="${esc(f.razaoSocial||'')}" placeholder="Ex: Padaria do João Ltda" />
            </div>
            <div class="field">
              <label>Ramo de atividade</label>
              <input type="text" id="f-ramo-atividade" value="${esc(f.ramoAtividade||'')}" placeholder="Ex: Alimentação, Transporte, Varejo..." />
            </div>
            <div class="field-row">
              <div class="field">
                <label>Contato responsável</label>
                <input type="text" id="f-contato-nome" value="${esc(f.contatoNome||'')}" placeholder="Quem você fala na empresa" />
              </div>
              <div class="field">
                <label>Cargo do contato</label>
                <input type="text" id="f-contato-cargo" value="${esc(f.contatoCargo||'')}" placeholder="Ex: Sócio, Financeiro..." />
              </div>
            </div>
          ` : ''}
          <div class="field-row">
            <div class="field">
              <label>Valor da negociação</label>
              <div class="money-wrap">
                <span>R$</span>
                <input type="text" inputmode="numeric" id="f-valor" value="${f.valor ? Number(f.valor).toLocaleString('pt-BR') : ''}" placeholder="0" />
              </div>
            </div>
            <div class="field">
              <label>Coluna</label>
              <select id="f-coluna">
                ${board.columns.map(c=>`<option value="${c.id}" ${c.id===f.columnId?'selected':''}>${esc(c.nome)}</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="field">
            <label>Produto / serviço</label>
            <select id="f-tipo-produto">
              ${renderOpcoesTipoProduto(f.tipoProduto||'padrao')}
            </select>
          </div>
          <div class="field-row">
            <div class="field">
              <label>Mês de início de contato</label>
              <input type="date" id="f-mes-inicio-contato" value="${normalizarData(f.mesInicioContato)}" />
            </div>
            <div class="field">
              <label>Mês de venda</label>
              <input type="date" id="f-mes" value="${normalizarData(f.mes)}" />
            </div>
          </div>
          <p class="settings-page-note">O início de contato é opcional — ajuda a documentar quanto tempo leva até fechar.</p>
          <p class="settings-page-note" id="f-ciclo-venda-nota" style="${(f.mesInicioContato && !f.__isNew)?'':'display:none;'}">${textoCicloDeVenda(f.mesInicioContato, f.mes)}</p>
          <div class="field">
            <label>Qualificação</label>
            <div class="temp-toggle" id="f-temp-toggle">
              ${Object.entries(TEMPS).map(([key,t])=>`
                <div class="temp-btn ${f.temperatura===key ? 'active-'+key : ''}" data-temp="${key}">${t.emoji} ${t.label}</div>
              `).join('')}
            </div>
          </div>
          <div class="field">
            <label>Telefone (opcional)</label>
            <input type="text" id="f-telefone" value="${esc(f.telefone||'')}" placeholder="(11) 90000-0000" />
            <div class="wa-actions-row">
              <button type="button" class="wa-btn wa-btn-modal" id="f-whatsapp" style="${f.telefone ? '' : 'display:none;'}">
                ${WA_ICON} Abrir WhatsApp
              </button>
              ${!f.__isNew && integracoesConfig.assistenteIA ? `<button type="button" class="ai-btn" id="f-ai-mensagem">${ICON_SPARKLE} Sugerir mensagem</button>` : ''}
              ${!f.__isNew ? `<button type="button" class="ai-btn" id="f-ver-historico">🕘 Ver histórico</button>` : ''}
              ${!f.__isNew ? `<button type="button" class="ai-btn" id="f-gerar-proposta">📄 Gerar proposta</button>` : ''}
              ${!f.__isNew && (board.columns.find(c=>c.id===((board.cards.find(k=>k.id===f.id)||{}).columnId))||{}).tipo==='ganho' && typeof abrirFechamento === 'function'
                ? `<button type="button" class="ai-btn" id="f-fechamento">💰 ${f.fechamento && !f.fechamento.cancelado ? 'Fechamento: ' + fmtBRL(f.fechamento.valorFinal) : 'Fechamento da venda'}</button>` : ''}
              ${!f.__isNew && f.fechamento && !f.fechamento.cancelado && typeof abrirDevolucao === 'function'
                ? `<button type="button" class="ai-btn" id="f-devolucao">↩ Devolução</button>` : ''}
              ${!f.__isNew ? `<button type="button" class="ai-btn" id="f-toggle-arquivar">${f.arquivado?'📦 Desarquivar':'📦 Arquivar'}</button>` : ''}
            </div>
            ${!f.__isNew && valorMudouDepoisDoFechamento(board.cards.find(k=>k.id===f.id))
              ? `<p class="settings-page-note fech-aviso-valor">O valor do card mudou depois do fechamento (era ${fmtBRL(f.fechamento.valorOriginal)}). Os lançamentos no financeiro não mudam sozinhos. <button type="button" class="fech-link" id="f-refazer-fechamento" style="display:inline">Refazer o fechamento?</button></p>` : ''}
            <div class="ai-result" id="f-ai-mensagem-result" style="display:none;"></div>
            <div class="wa-conversa" id="f-historico" style="display:none;"></div>
          </div>
          <div class="field">
            <label>Observações (opcional)</label>
            <textarea id="f-obs" rows="3" placeholder="Detalhes da negociação...">${esc(f.obs||'')}</textarea>
            ${!f.__isNew && integracoesConfig.assistenteIA ? `<button type="button" class="ai-btn" id="f-ai-tarefa">${ICON_SPARKLE} Sugerir tarefa de acompanhamento</button>` : ''}
            <div class="ai-result" id="f-ai-tarefa-result" style="display:none;"></div>
          </div>
          ${camposPersonalizados.map(campo=>`
            <div class="field">
              <label>${esc(campo.nome)}</label>
              <input type="${campo.tipo==='numero'?'number':(campo.tipo==='data'?'date':'text')}" class="f-campo-personalizado" data-campo-id="${campo.id}" value="${esc(((f.camposPersonalizados||{})[campo.id])||'')}" />
            </div>
          `).join('')}
          ${!f.__isNew ? `
            <div class="field">
              <button type="button" class="btn-outline" id="f-abrir-extras" style="width:100%;">⋯ Extras (etiquetas, anexos, tarefas, histórico)</button>
            </div>
          ` : ''}
        </div>
        <div class="modal-foot">
          ${!f.__isNew ? `<button class="delete-link" id="f-delete">🗑 Excluir</button>` : '<span></span>'}
          <div class="modal-foot-actions">
            ${mensagemSalvoCard ? `<span class="mensagem-salvo-toast">${esc(mensagemSalvoCard)}</span>` : ''}
            <button class="btn-outline" id="f-cancel" ${salvandoCard?'disabled':''}>Cancelar</button>
            <button class="btn-save" id="f-save" ${salvandoCard?'disabled':''}>${salvandoCard?'Salvando…':'Salvar'}</button>
          </div>
        </div>
      </div>
    </div>
  `;

  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('f-cancel').addEventListener('click', closeModal);
  document.getElementById('modal-overlay').addEventListener('click', (e)=>{ if(e.target.id==='modal-overlay') closeModal(); });

  document.getElementById('f-cliente').addEventListener('input', (e)=>{
    if(modalForm.tipoPessoa==='juridica') modalForm.clienteJuridica = e.target.value;
    else modalForm.clienteFisica = e.target.value;
  });
  const telefoneInput = document.getElementById('f-telefone');
  const waModalBtn = document.getElementById('f-whatsapp');
  telefoneInput.addEventListener('input', (e)=>{
    modalForm.telefone = e.target.value;
    waModalBtn.style.display = e.target.value.trim() ? 'inline-flex' : 'none';
  });
  waModalBtn.addEventListener('click', ()=> abrirWhatsapp(modalForm.telefone));
  document.getElementById('f-obs').addEventListener('input', (e)=> modalForm.obs = e.target.value);
  document.querySelectorAll('.f-campo-personalizado').forEach(el=>{
    el.addEventListener('input', (e)=>{
      if(!modalForm.camposPersonalizados) modalForm.camposPersonalizados = {};
      modalForm.camposPersonalizados[el.dataset.campoId] = e.target.value;
    });
  });
  const abrirExtrasBtn = document.getElementById('f-abrir-extras');
  if(abrirExtrasBtn) abrirExtrasBtn.addEventListener('click', ()=>{ extrasTela = 'menu'; renderModal(); });
  const aiMensagemBtn = document.getElementById('f-ai-mensagem');
  if(aiMensagemBtn) aiMensagemBtn.addEventListener('click', sugerirMensagemIA);
  const aiTarefaBtn = document.getElementById('f-ai-tarefa');
  if(aiTarefaBtn) aiTarefaBtn.addEventListener('click', sugerirTarefaIA);
  const verHistoricoBtn = document.getElementById('f-ver-historico');
  if(verHistoricoBtn) verHistoricoBtn.addEventListener('click', abrirHistoricoCard);
  const fechamentoBtn = document.getElementById('f-fechamento');
  if(fechamentoBtn) fechamentoBtn.addEventListener('click', ()=>{ const id = modalForm.id; closeModal(); abrirFechamento(id); });
  const refazerFechBtn = document.getElementById('f-refazer-fechamento');
  if(refazerFechBtn) refazerFechBtn.addEventListener('click', ()=>{ const id = modalForm.id; closeModal(); abrirFechamento(id); });
  const devolucaoBtn = document.getElementById('f-devolucao');
  if(devolucaoBtn) devolucaoBtn.addEventListener('click', ()=>{ const id = modalForm.id; closeModal(); abrirDevolucao(id); });
  const gerarPropostaBtn = document.getElementById('f-gerar-proposta');
  if(gerarPropostaBtn) gerarPropostaBtn.addEventListener('click', abrirPropostaModal);
  const toggleArquivarBtn = document.getElementById('f-toggle-arquivar');
  if(toggleArquivarBtn) toggleArquivarBtn.addEventListener('click', toggleArquivarCard);
  document.getElementById('f-coluna').addEventListener('change', (e)=> modalForm.columnId = e.target.value);
  const tipoProdutoEl = document.getElementById('f-tipo-produto');
  if(tipoProdutoEl) tipoProdutoEl.addEventListener('change', (e)=> modalForm.tipoProduto = e.target.value);
  document.getElementById('f-mes').addEventListener('change', (e)=>{
    modalForm.mes = e.target.value;
    atualizarNotaCicloDeVenda();
  });
  const mesInicioContatoInput = document.getElementById('f-mes-inicio-contato');
  if(mesInicioContatoInput) mesInicioContatoInput.addEventListener('change', (e)=>{
    modalForm.mesInicioContato = e.target.value;
    atualizarNotaCicloDeVenda();
  });

  const valorInput = document.getElementById('f-valor');
  valorInput.addEventListener('input', (e)=>{
    const { numero, texto } = maskInteiro(e.target.value);
    modalForm.valor = numero;
    e.target.value = texto;
  });

  document.querySelectorAll('#f-temp-toggle .temp-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      modalForm.temperatura = btn.dataset.temp;
      document.querySelectorAll('#f-temp-toggle .temp-btn').forEach(b=>{
        b.className = 'temp-btn' + (b.dataset.temp===modalForm.temperatura ? ' active-'+b.dataset.temp : '');
      });
    });
  });

  document.getElementById('f-tipo-pessoa-select').addEventListener('click', ()=>{
    tipoPessoaDropdownAberto = !tipoPessoaDropdownAberto;
    renderModal();
  });
  document.querySelectorAll('.tipo-pessoa-dropdown-item').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      modalForm.tipoPessoa = btn.dataset.tipoPessoa;
      tipoPessoaDropdownAberto = false;
      renderModal(); // precisa redesenhar pra mostrar/esconder os campos de empresa
    });
  });
  const cnpjInput = document.getElementById('f-cnpj');
  if(cnpjInput) cnpjInput.addEventListener('input', (e)=> modalForm.cnpj = e.target.value);
  const razaoSocialInput = document.getElementById('f-razao-social');
  if(razaoSocialInput) razaoSocialInput.addEventListener('input', (e)=> modalForm.razaoSocial = e.target.value);
  const inscricaoEstadualInput = document.getElementById('f-inscricao-estadual');
  if(inscricaoEstadualInput) inscricaoEstadualInput.addEventListener('input', (e)=> modalForm.inscricaoEstadual = e.target.value);
  const ramoAtividadeInput = document.getElementById('f-ramo-atividade');
  if(ramoAtividadeInput) ramoAtividadeInput.addEventListener('input', (e)=> modalForm.ramoAtividade = e.target.value);
  const contatoNomeInput = document.getElementById('f-contato-nome');
  if(contatoNomeInput) contatoNomeInput.addEventListener('input', (e)=> modalForm.contatoNome = e.target.value);
  const contatoCargoInput = document.getElementById('f-contato-cargo');
  if(contatoCargoInput) contatoCargoInput.addEventListener('input', (e)=> modalForm.contatoCargo = e.target.value);

  root.querySelectorAll('[data-modo-gestor]').forEach(btn=>{
    btn.addEventListener('click', ()=>{ modalForm.__modoGestor = btn.dataset.modoGestor==='1'; if(!modalForm.__modoGestor) modalForm.__atribuirParaId = ''; renderModal(); });
  });
  const atribuirParaSel = document.getElementById('f-atribuir-para');
  if(atribuirParaSel) atribuirParaSel.addEventListener('change', (e)=> modalForm.__atribuirParaId = e.target.value);
  document.getElementById('f-save').addEventListener('click', saveCardFromModal);
  if(!f.__isNew){
    document.getElementById('f-delete').addEventListener('click', ()=>{
      showConfirm({
        message: 'Excluir este cliente do funil? Essa ação não pode ser desfeita.',
        onConfirm: ()=>{ deleteCardById(f.id); closeModal(); closeConfirm(); },
      });
    });
  }
}

/* ---------- modal da tarefa ---------- */
function openNewTask(dataPreenchida, horaPreenchida){
  taskModalForm = { __isNew:true, id:null, titulo:'', vencimento: dataPreenchida||'', hora: horaPreenchida||'', prioridade:'media', leadId:'', descricao:'' };
  renderTaskModal();
}
function openEditTask(id){
  const t = tasks.find(x=>x.id===id);
  if(!t) return;
  let hora = '';
  let dataStr = '';
  if(t.vencimento){
    const d = new Date(t.vencimento);
    if(!isNaN(d.getTime())){
      // Usa hora em UTC (não local) pra checar se tem horário definido: tarefa sem hora
      // é salva como meia-noite UTC — em horário local (Brasil, UTC-3) isso apareceria
      // como "21:00 do dia anterior" se checássemos em hora local, o que é errado.
      const temHora = d.getUTCHours()!==0 || d.getUTCMinutes()!==0;
      if(temHora){
        // Tem horário de verdade: usa data E hora em horário LOCAL, já que foi isso
        // que a pessoa digitou (senão uma tarefa de 23h vira o dia seguinte por causa do UTC).
        hora = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
        dataStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      } else {
        // Sem horário (só data) — o valor já é meia-noite UTC, pega a data direto da string.
        dataStr = t.vencimento.slice(0,10);
      }
    }
  }
  taskModalForm = { ...t, __isNew:false, vencimento: dataStr, hora, leadId: t.leadId || '' };
  renderTaskModal();
}
function closeTaskModal(){
  taskModalForm = null;
  if(agendaDiaSelecionado){ renderAgendaDiaModal(); return; }
  document.getElementById('modal-root').innerHTML='';
}

/* ---------- modal: Editar perfil (escolha entre adicionar foto / editar nome) ---------- */
function abrirEditarPerfilModal(){
  modalEditarPerfilAberto = true;
  renderEditarPerfilModal();
}
function closeEditarPerfilModal(){
  modalEditarPerfilAberto = false;
  const root = document.getElementById('modal-root');
  if(root) root.innerHTML = '';
}
function renderEditarPerfilModal(){
  const root = document.getElementById('modal-root');
  if(!modalEditarPerfilAberto){ root.innerHTML=''; return; }
  const temFoto = !!(currentUser && currentUser.avatarUrl);
  root.innerHTML = `
    <div class="overlay" id="editar-perfil-overlay">
      <div class="modal">
        <div class="modal-head">
          <h3>Editar perfil</h3>
          <button id="editar-perfil-close">✕</button>
        </div>
        <div class="modal-body">
          <button type="button" class="opcao-perfil-btn" data-action="editar-perfil-foto">
            <span class="opcao-perfil-icon">${ICON_CAMERA}</span>
            <span>
              <strong>${temFoto?'Trocar foto':'Adicionar foto'}</strong>
              <span class="opcao-perfil-nota">PNG, JPG ou WebP — redimensionamos automaticamente.</span>
            </span>
          </button>
          <button type="button" class="opcao-perfil-btn" data-action="editar-perfil-nome">
            <span class="opcao-perfil-icon">${ICON_EDIT}</span>
            <span>
              <strong>Editar nome</strong>
              <span class="opcao-perfil-nota">Como seu nome aparece pro resto da equipe.</span>
            </span>
          </button>
          ${(!acessoCrm || acessoCrm.tipo === 'dono') ? `<button type="button" class="opcao-perfil-btn" data-action="editar-perfil-email">
            <span class="opcao-perfil-icon">${ICON_MAIL}</span>
            <span>
              <strong>Trocar e-mail</strong>
              <span class="opcao-perfil-nota">O e-mail com que você entra e recebe os avisos.</span>
            </span>
          </button>` : ''}
        </div>
      </div>
    </div>
  `;
  document.getElementById('editar-perfil-close').addEventListener('click', closeEditarPerfilModal);
  document.getElementById('editar-perfil-overlay').addEventListener('click', (e)=>{ if(e.target.id==='editar-perfil-overlay') closeEditarPerfilModal(); });
  document.querySelector('[data-action="editar-perfil-foto"]').addEventListener('click', ()=>{
    closeEditarPerfilModal();
    const input = document.getElementById('avatar-input');
    if(input) input.click();
  });
  document.querySelector('[data-action="editar-perfil-nome"]').addEventListener('click', ()=>{
    closeEditarPerfilModal();
    abrirAlterarNomeModal();
  });
  const emailOpcao = document.querySelector('[data-action="editar-perfil-email"]');
  if(emailOpcao) emailOpcao.addEventListener('click', ()=>{ closeEditarPerfilModal(); abrirAlterarEmailModal(); });
}

/* ---------- trocar o e-mail da conta (pede a senha; o e-mail antigo recebe um aviso) ---------- */
let modalAlterarEmailAberto = false;
let emailTroca = { novo:'', senha:'', salvando:false, msg:null };
function abrirAlterarEmailModal(){
  emailTroca = { novo:'', senha:'', salvando:false, msg:null };
  modalAlterarEmailAberto = true;
  renderAlterarEmailModal();
  const el = document.getElementById('s-email-novo'); if(el) el.focus();
}
function closeAlterarEmailModal(){
  modalAlterarEmailAberto = false;
  const root = document.getElementById('modal-root');
  if(root) root.innerHTML = '';
}
function renderAlterarEmailModal(){
  const root = document.getElementById('modal-root');
  if(!modalAlterarEmailAberto){ root.innerHTML=''; return; }
  const semSenha = currentUser && currentUser.temSenha === false;
  root.innerHTML = `
    <div class="overlay" id="alterar-email-overlay">
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="alterar-email-titulo">
        <div class="modal-head">
          <h3 id="alterar-email-titulo">Trocar e-mail</h3>
          <button id="alterar-email-close" aria-label="Fechar">✕</button>
        </div>
        <div class="modal-body">
          <p class="settings-page-note" style="margin-top:0;">Hoje você entra com <strong>${esc((currentUser && currentUser.email) || '')}</strong>. Depois da troca, o login, a recuperação de senha e todos os avisos passam a usar o e-mail novo, e o antigo recebe um aviso de que a troca foi feita.</p>
          ${semSenha ? `<p class="settings-page-msg erro">Sua conta entra com o Google e ainda não tem senha. Crie uma senha em Login e segurança para poder trocar o e-mail.</p>` : `
          <div class="field">
            <label for="s-email-novo">E-mail novo</label>
            <input type="email" id="s-email-novo" value="${esc(emailTroca.novo)}" placeholder="voce@exemplo.com" autocomplete="email" />
          </div>
          <div class="field">
            <label for="s-email-senha">Sua senha atual</label>
            <input type="password" id="s-email-senha" value="${esc(emailTroca.senha)}" autocomplete="current-password" />
          </div>`}
          ${emailTroca.msg ? `<p class="settings-page-msg ${emailTroca.msg.tipo}" role="alert">${esc(emailTroca.msg.texto)}</p>` : ''}
        </div>
        <div class="modal-foot">
          <span></span>
          <div class="modal-foot-actions">
            <button class="btn-outline" id="alterar-email-cancelar">${semSenha ? 'Fechar' : 'Cancelar'}</button>
            ${semSenha ? '' : `<button class="btn-save" id="s-email-salvar" ${emailTroca.salvando?'disabled':''}>${emailTroca.salvando?'Salvando…':'Trocar e-mail'}</button>`}
          </div>
        </div>
      </div>
    </div>
  `;
  document.getElementById('alterar-email-close').addEventListener('click', closeAlterarEmailModal);
  document.getElementById('alterar-email-cancelar').addEventListener('click', closeAlterarEmailModal);
  document.getElementById('alterar-email-overlay').addEventListener('click', (e)=>{ if(e.target.id==='alterar-email-overlay') closeAlterarEmailModal(); });
  const novo = document.getElementById('s-email-novo'); const senha = document.getElementById('s-email-senha');
  if(novo) novo.addEventListener('input', (e)=> emailTroca.novo = e.target.value);
  if(senha){ senha.addEventListener('input', (e)=> emailTroca.senha = e.target.value); senha.addEventListener('keydown', (e)=>{ if(e.key === 'Enter') salvarEmailNovo(); }); }
  const salvar = document.getElementById('s-email-salvar'); if(salvar) salvar.addEventListener('click', salvarEmailNovo);
}
async function salvarEmailNovo(){
  const novo = emailTroca.novo.trim();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(novo)){ emailTroca.msg = { tipo:'erro', texto:'Digite um e-mail válido.' }; renderAlterarEmailModal(); return; }
  if(!emailTroca.senha){ emailTroca.msg = { tipo:'erro', texto:'Digite a sua senha atual.' }; renderAlterarEmailModal(); return; }
  emailTroca.salvando = true; emailTroca.msg = null; renderAlterarEmailModal();
  try{
    await apiRequest('PUT', '/auth/email', { email: novo, senha: emailTroca.senha });
    await refreshCurrentUser();
    // as opções da aba E-mail mostram o endereço: carrega de novo
    resumoDiario.carregado = false; emailTarefas.carregado = false; backupAuto.carregado = false;
    closeAlterarEmailModal();
    avatarMsg = { tipo:'ok', texto:'E-mail trocado. Daqui em diante, entre com ' + novo.toLowerCase() + '.' };
    renderApp();
  }catch(e){
    emailTroca.salvando = false;
    emailTroca.msg = { tipo:'erro', texto: e.message || 'Não foi possível trocar o e-mail.' };
    renderAlterarEmailModal();
  }
}

/* ---------- visualização grande da foto (toque-e-segure no avatar) ---------- */
function abrirAvatarLightbox(){
  if(!(currentUser && currentUser.avatarUrl)) return;
  avatarLightboxAberto = true;
  renderAvatarLightbox();
}
function closeAvatarLightbox(){
  avatarLightboxAberto = false;
  const root = document.getElementById('modal-root');
  if(root) root.innerHTML = '';
}
function renderAvatarLightbox(){
  const root = document.getElementById('modal-root');
  if(!avatarLightboxAberto){ root.innerHTML=''; return; }
  root.innerHTML = `
    <div class="overlay avatar-lightbox-overlay" id="avatar-lightbox-overlay">
      <img src="${currentUser.avatarUrl}" alt="Foto de perfil" class="avatar-lightbox-img" />
      <button id="avatar-lightbox-close" class="avatar-lightbox-close" title="Fechar">✕</button>
    </div>
  `;
  document.getElementById('avatar-lightbox-close').addEventListener('click', closeAvatarLightbox);
  document.getElementById('avatar-lightbox-overlay').addEventListener('click', (e)=>{ if(e.target.id==='avatar-lightbox-overlay') closeAvatarLightbox(); });
}

function abrirAlterarNomeModal(){
  nomeNovoVal = (currentUser && currentUser.nome) || '';
  nomeMsg = null;
  modalAlterarNomeAberto = true;
  renderAlterarNomeModal();
}
function closeAlterarNomeModal(){
  modalAlterarNomeAberto = false;
  const root = document.getElementById('modal-root');
  if(root) root.innerHTML = '';
}
function renderAlterarNomeModal(){
  const root = document.getElementById('modal-root');
  if(!modalAlterarNomeAberto){ root.innerHTML=''; return; }
  root.innerHTML = `
    <div class="overlay" id="alterar-nome-overlay">
      <div class="modal">
        <div class="modal-head">
          <h3>Alterar nome</h3>
          <button id="alterar-nome-close">✕</button>
        </div>
        <div class="modal-body">
          <div class="field">
            <label>Nome</label>
            <input type="text" id="s-nome" value="${esc(nomeNovoVal)}" placeholder="Seu nome" />
          </div>
          ${nomeMsg ? `<p class="settings-page-msg ${nomeMsg.tipo}">${esc(nomeMsg.texto)}</p>` : ''}
        </div>
        <div class="modal-foot">
          <span></span>
          <div class="modal-foot-actions">
            <button class="btn-outline" id="alterar-nome-cancelar">Cancelar</button>
            <button class="btn-save" id="s-nome-salvar" ${nomeSalvando?'disabled':''}>${nomeSalvando?'Salvando…':'Salvar'}</button>
          </div>
        </div>
      </div>
    </div>
  `;
  document.getElementById('alterar-nome-close').addEventListener('click', closeAlterarNomeModal);
  document.getElementById('alterar-nome-cancelar').addEventListener('click', closeAlterarNomeModal);
  document.getElementById('alterar-nome-overlay').addEventListener('click', (e)=>{ if(e.target.id==='alterar-nome-overlay') closeAlterarNomeModal(); });
  document.getElementById('s-nome').addEventListener('input', (e)=> nomeNovoVal = e.target.value);
  document.getElementById('s-nome-salvar').addEventListener('click', salvarNome);
}

function abrirAlterarSenhaModal(){
  senhaAtualVal = '';
  senhaNovaVal = '';
  senhaMsg = null;
  modalAlterarSenhaAberto = true;
  renderAlterarSenhaModal();
}
function closeAlterarSenhaModal(){
  modalAlterarSenhaAberto = false;
  const root = document.getElementById('modal-root');
  if(root) root.innerHTML = '';
}
function renderAlterarSenhaModal(){
  const root = document.getElementById('modal-root');
  if(!modalAlterarSenhaAberto){ root.innerHTML=''; return; }
  root.innerHTML = `
    <div class="overlay" id="alterar-senha-overlay">
      <div class="modal">
        <div class="modal-head">
          <h3>Mudar senha</h3>
          <button id="alterar-senha-close">✕</button>
        </div>
        <div class="modal-body">
          ${currentUser && !currentUser.temSenha ? `
            <p class="settings-page-note">Esta conta ainda não tem senha (entra só com o Google). Você pode definir uma agora, se quiser.</p>
          ` : ''}
          <div class="field">
            <label>Senha atual</label>
            <input type="password" id="s-senha-atual" value="${esc(senhaAtualVal)}" placeholder="Deixe em branco se ainda não tem senha" />
          </div>
          <div class="field">
            <label>Nova senha</label>
            <input type="password" id="s-senha-nova" value="${esc(senhaNovaVal)}" placeholder="Mínimo 6 caracteres" />
          </div>
          ${senhaMsg ? `<p class="settings-page-msg ${senhaMsg.tipo}">${esc(senhaMsg.texto)}</p>` : ''}
        </div>
        <div class="modal-foot">
          <span></span>
          <div class="modal-foot-actions">
            <button class="btn-outline" id="alterar-senha-cancelar">Cancelar</button>
            <button class="btn-save" id="s-senha-salvar" ${senhaSalvando?'disabled':''}>${senhaSalvando?'Salvando…':'Salvar'}</button>
          </div>
        </div>
      </div>
    </div>
  `;
  document.getElementById('alterar-senha-close').addEventListener('click', closeAlterarSenhaModal);
  document.getElementById('alterar-senha-cancelar').addEventListener('click', closeAlterarSenhaModal);
  document.getElementById('alterar-senha-overlay').addEventListener('click', (e)=>{ if(e.target.id==='alterar-senha-overlay') closeAlterarSenhaModal(); });
  document.getElementById('s-senha-atual').addEventListener('input', (e)=> senhaAtualVal = e.target.value);
  document.getElementById('s-senha-nova').addEventListener('input', (e)=> senhaNovaVal = e.target.value);
  document.getElementById('s-senha-salvar').addEventListener('click', salvarSenha);
}

// Abre a edição de um evento do Google Agenda — diferente de editar uma tarefa,
// isso muda o evento de verdade, direto na fonte (no seu Google Agenda).
function excluirTudoDoDia(diaISO, tarefasDoDia, eventosDoDia){
  const total = tarefasDoDia.length + eventosDoDia.length;
  if(!total) return;
  const temEventos = eventosDoDia.length > 0;
  showConfirm({
    message: `Excluir ${total} item${total===1?'':'s'} desse dia?${temEventos ? ' Isso inclui excluir evento(s) direto do seu Google Agenda de verdade, não só daqui.' : ''} Essa ação não pode ser desfeita.`,
    onConfirm: async ()=>{
      closeConfirm();
      closeAgendaDiaModal();
      for(const t of tarefasDoDia){
        try{
          await apiRequest('DELETE', `/tasks/${t.id}`);
          const idx = tasks.findIndex(x=>x.id===t.id);
          if(idx>-1) tasks.splice(idx,1);
        }catch(e){ /* segue tentando os outros mesmo se um falhar */ }
      }
      agendaTarefas = agendaTarefas.filter(x => !tarefasDoDia.some(t=>t.id===x.id));
      for(const e of eventosDoDia){
        try{
          await apiRequest('DELETE', `/calendar/eventos/${e.id}`);
        }catch(err){ /* segue tentando os outros mesmo se um falhar */ }
      }
      agendaEventosGoogle = agendaEventosGoogle.filter(x => !eventosDoDia.some(e=>e.id===x.id));
      renderApp();
    },
  });
}
function openEditEventoGoogle(eventId){
  const e = agendaEventosGoogle.find(x=>x.id===eventId);
  if(!e) return;
  let data = '', hora = '';
  if(e.inicio){
    if(e.diaInteiro){
      data = e.inicio.slice(0,10);
    } else {
      const d = new Date(e.inicio);
      data = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      hora = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
    }
  }
  eventoGoogleModalForm = { eventId, titulo: e.titulo, data, hora, descricao: e.descricao||'', prioridade: e.prioridade||'media', leadId: e.leadId||'' };
  renderEventoGoogleModal();
}
function closeEventoGoogleModal(){ eventoGoogleModalForm = null; document.getElementById('modal-root').innerHTML=''; }
async function salvarEventoGoogle(){
  const f = eventoGoogleModalForm;
  if(!f || !f.titulo.trim()) return;
  try{
    await apiRequest('PUT', `/calendar/eventos/${f.eventId}`, { titulo: f.titulo, data: f.data, hora: f.hora || null, descricao: f.descricao, prioridade: f.prioridade, leadId: f.leadId || null });
    const idx = agendaEventosGoogle.findIndex(x=>x.id===f.eventId);
    if(idx>-1){
      const novoInicio = f.hora ? new Date(`${f.data}T${f.hora}`).toISOString() : f.data;
      const card = f.leadId ? board.cards.find(c=>c.id===f.leadId) : null;
      agendaEventosGoogle[idx] = { ...agendaEventosGoogle[idx], titulo:f.titulo, inicio:novoInicio, diaInteiro: !f.hora, descricao:f.descricao, prioridade:f.prioridade, leadId:f.leadId||null, clienteNome: card ? card.cliente : null };
    }
    closeEventoGoogleModal();
    renderApp();
  }catch(e){
    errorMsg = e.message || 'Não foi possível salvar o evento no Google Agenda.';
    renderApp();
  }
}
function excluirEventoGoogle(){
  const f = eventoGoogleModalForm;
  if(!f) return;
  showConfirm({
    message: 'Excluir este evento do Google Agenda? Ele será removido de verdade, na sua conta do Google — não só daqui.',
    onConfirm: async ()=>{
      closeConfirm();
      try{
        await apiRequest('DELETE', `/calendar/eventos/${f.eventId}`);
        agendaEventosGoogle = agendaEventosGoogle.filter(x=>x.id!==f.eventId);
        closeEventoGoogleModal();
        renderApp();
      }catch(e){
        errorMsg = e.message || 'Não foi possível excluir o evento.';
        renderApp();
      }
    },
  });
}
function renderEventoGoogleModal(){
  const root = document.getElementById('modal-root');
  if(!eventoGoogleModalForm){ root.innerHTML=''; return; }
  const f = eventoGoogleModalForm;

  root.innerHTML = `
    <div class="overlay" id="evento-google-modal-overlay">
      <div class="modal">
        <div class="modal-head">
          <h3>📅 Editar evento do Google Agenda</h3>
          <button id="evento-google-modal-close">✕</button>
        </div>
        <div class="modal-body">
          <div class="field">
            <label>Título</label>
            <input type="text" id="eg-titulo" value="${esc(f.titulo)}" placeholder="Ex: Ligar para cliente" />
          </div>
          <div class="field-row">
            <div class="field">
              <label>Data</label>
              <input type="date" id="eg-data" value="${f.data}" />
            </div>
            <div class="field">
              <label>Hora (opcional)</label>
              <input type="time" id="eg-hora" value="${f.hora}" />
            </div>
            <div class="field">
              <label>Prioridade</label>
              <select id="eg-prioridade">
                ${Object.entries(PRIORIDADES).map(([key,p])=>`<option value="${key}" ${f.prioridade===key?'selected':''}>${p.label}</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="field">
            <label>Contato relacionado</label>
            <select id="eg-lead">
              <option value="">Sem contato</option>
              ${board.cards.map(c=>`<option value="${c.id}" ${f.leadId===c.id?'selected':''}>${esc(c.cliente) || 'Sem nome'}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label>Descrição</label>
            <textarea id="eg-descricao" rows="3" placeholder="Detalhes do evento...">${esc(f.descricao||'')}</textarea>
          </div>
          <p class="settings-page-note">Título, data, hora e descrição mudam o evento de verdade, direto no seu Google Agenda. Prioridade e contato relacionado são exclusivos daqui do CRM — o Google não tem esses campos, então ficam guardados só aqui, amarrados a esse evento.</p>
        </div>
        <div class="modal-foot">
          <button class="delete-link" id="eg-delete">🗑 Excluir</button>
          <div class="modal-foot-actions">
            <button class="btn-outline" id="eg-cancel">Cancelar</button>
            <button class="btn-save" id="eg-save">Salvar evento</button>
          </div>
        </div>
      </div>
    </div>
  `;

  document.getElementById('evento-google-modal-close').addEventListener('click', closeEventoGoogleModal);
  document.getElementById('eg-cancel').addEventListener('click', closeEventoGoogleModal);
  document.getElementById('evento-google-modal-overlay').addEventListener('click', (e)=>{ if(e.target.id==='evento-google-modal-overlay') closeEventoGoogleModal(); });
  document.getElementById('eg-titulo').addEventListener('input', (e)=> eventoGoogleModalForm.titulo = e.target.value);
  document.getElementById('eg-data').addEventListener('change', (e)=> eventoGoogleModalForm.data = e.target.value);
  document.getElementById('eg-hora').addEventListener('change', (e)=> eventoGoogleModalForm.hora = e.target.value);
  document.getElementById('eg-prioridade').addEventListener('change', (e)=> eventoGoogleModalForm.prioridade = e.target.value);
  document.getElementById('eg-lead').addEventListener('change', (e)=> eventoGoogleModalForm.leadId = e.target.value);
  document.getElementById('eg-descricao').addEventListener('input', (e)=> eventoGoogleModalForm.descricao = e.target.value);
  document.getElementById('eg-save').addEventListener('click', salvarEventoGoogle);
  document.getElementById('eg-delete').addEventListener('click', excluirEventoGoogle);
}
function renderTaskModal(){
  const root = document.getElementById('modal-root');
  if(!taskModalForm){ root.innerHTML=''; return; }
  const f = taskModalForm;

  root.innerHTML = `
    <div class="overlay" id="task-modal-overlay">
      <div class="modal">
        <div class="modal-head">
          <h3>${f.__isNew ? 'Nova tarefa' : 'Editar tarefa'}</h3>
          <button id="task-modal-close">✕</button>
        </div>
        <div class="modal-body">
          <div class="field">
            <label>Título</label>
            <input type="text" id="t-titulo" value="${esc(f.titulo)}" placeholder="Ex: Ligar para cliente" />
          </div>
          <div class="field-row">
            <div class="field">
              <label>Vencimento</label>
              <input type="date" id="t-vencimento" value="${f.vencimento||''}" />
            </div>
            <div class="field">
              <label>Hora (opcional)</label>
              <input type="time" id="t-hora" value="${f.hora||''}" />
            </div>
            <div class="field">
              <label>Prioridade</label>
              <select id="t-prioridade">
                ${Object.entries(PRIORIDADES).map(([key,p])=>`<option value="${key}" ${f.prioridade===key?'selected':''}>${p.label}</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="field">
            <label>Contato relacionado</label>
            <select id="t-lead">
              <option value="">Sem contato</option>
              ${board.cards.map(c=>`<option value="${c.id}" ${f.leadId===c.id?'selected':''}>${esc(c.cliente) || 'Sem nome'}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label>Descrição</label>
            <textarea id="t-descricao" rows="3" placeholder="Detalhes da tarefa...">${esc(f.descricao||'')}</textarea>
          </div>
        </div>
        <div class="modal-foot">
          ${!f.__isNew ? `<button class="delete-link" id="t-delete">🗑 Excluir</button>` : '<span></span>'}
          <div class="modal-foot-actions">
            <button class="btn-outline" id="t-cancel" ${salvandoTask?'disabled':''}>Cancelar</button>
            <button class="btn-save" id="t-save" ${salvandoTask?'disabled':''}>${salvandoTask?'Salvando…':'Salvar tarefa'}</button>
          </div>
        </div>
      </div>
    </div>
  `;

  document.getElementById('task-modal-close').addEventListener('click', closeTaskModal);
  document.getElementById('t-cancel').addEventListener('click', closeTaskModal);
  document.getElementById('task-modal-overlay').addEventListener('click', (e)=>{ if(e.target.id==='task-modal-overlay') closeTaskModal(); });

  document.getElementById('t-titulo').addEventListener('input', (e)=> taskModalForm.titulo = e.target.value);
  document.getElementById('t-vencimento').addEventListener('change', (e)=> taskModalForm.vencimento = e.target.value);
  document.getElementById('t-hora').addEventListener('change', (e)=> taskModalForm.hora = e.target.value);
  document.getElementById('t-prioridade').addEventListener('change', (e)=> taskModalForm.prioridade = e.target.value);
  document.getElementById('t-lead').addEventListener('change', (e)=> taskModalForm.leadId = e.target.value);
  document.getElementById('t-descricao').addEventListener('input', (e)=> taskModalForm.descricao = e.target.value);

  document.getElementById('t-save').addEventListener('click', saveTaskFromModal);
  if(!f.__isNew){
    document.getElementById('t-delete').addEventListener('click', ()=>{
      showConfirm({ chave:'tarefa',
        message: 'Excluir esta tarefa? Essa ação não pode ser desfeita.',
        onConfirm: ()=>{ deleteTaskById(f.id); closeTaskModal(); closeConfirm(); },
      });
    });
  }
}



/* ---------- página: Relatórios ---------- */
function cardsParaRelatorio(){
  if(!relatorioFunilId) return board.cards;
  const colunaIds = new Set(board.columns.filter(c=>c.funilId===relatorioFunilId).map(c=>c.id));
  return board.cards.filter(c=>colunaIds.has(c.columnId));
}
function renderRelatoriosPage(){
  const cardsRel = cardsParaRelatorio();
  const dados = relatoriosDadosMensais(12, cardsRel);
  const maxNovos = Math.max(1, ...dados.map(d=>d.novos));
  const maxGanhoValor = Math.max(1, ...dados.map(d=>d.ganhoValor));
  const totalGanho = cardsRel.reduce((s,c)=>{ const col=board.columns.find(k=>k.id===c.columnId); return col&&col.tipo==='ganho' ? s+valorVendido(c) : s; },0);
  const totalPerdido = cardsRel.reduce((s,c)=>{ const col=board.columns.find(k=>k.id===c.columnId); return col&&col.tipo==='perdido' ? s+(Number(c.valor)||0) : s; },0);
  const porTemp = ['quente','morno','frio'].map(t=>({ temp:t, count: cardsRel.filter(c=>c.temperatura===t).length }));

  return `
    <div class="page-head">
      <div>
        <h1>Relatórios</h1>
        <p>Visão consolidada dos últimos 12 meses</p>
      </div>
      <div class="page-head-actions">
        <select id="relatorio-funil-select" class="leads-filter">
          <option value="">Todos os funis</option>
          ${funis.map(f=>`<option value="${f.id}" ${relatorioFunilId===f.id?'selected':''}>${esc(f.nome)}</option>`).join('')}
        </select>
        <button class="btn-outline" data-action="exportar-csv">Exportar Excel (.xlsx)</button>
        <button class="btn-outline" data-action="exportar-csv" data-formato="csv">CSV</button>
        <button class="btn-outline" data-action="exportar-relatorio-pdf">Exportar PDF</button>
      </div>
    </div>

    <div class="metric-grid">
      <div class="metric-card"><div class="metric-card-top"><span>Total ganho</span></div><div class="metric-value">${fmtBRL(totalGanho)}</div></div>
      <div class="metric-card"><div class="metric-card-top"><span>Total perdido</span></div><div class="metric-value">${fmtBRL(totalPerdido)}</div></div>
      <div class="metric-card"><div class="metric-card-top"><span>Total de contatos</span></div><div class="metric-value">${cardsRel.length}</div></div>
    </div>

    <div class="dash-panel">
      <div class="dash-panel-title">Valor ganho por mês (histórico)</div>
      <div class="stage-list">
        ${dados.map(d=>`
          <div class="stage-row">
            <div class="stage-row-top"><span>${monthLabel(d.key)}</span><span>${fmtBRL(d.ganhoValor)} ${d.ganhoQtd?`· ${d.ganhoQtd} venda${d.ganhoQtd===1?'':'s'}`:''}</span></div>
            <div class="stage-bar-track"><div class="stage-bar-fill" style="width:${d.ganhoValor/maxGanhoValor*100}%"></div></div>
          </div>
        `).join('')}
      </div>
    </div>

    <div class="dash-panel">
      <div class="dash-panel-title">Novos contatos por mês</div>
      <div class="stage-list">
        ${dados.map(d=>`
          <div class="stage-row">
            <div class="stage-row-top"><span>${monthLabel(d.key)}</span><span>${d.novos}</span></div>
            <div class="stage-bar-track"><div class="stage-bar-fill" style="width:${d.novos/maxNovos*100}%"></div></div>
          </div>
        `).join('')}
      </div>
    </div>

    <div class="dash-panel">
      <div class="dash-panel-title">Contatos por qualificação</div>
      <div class="stage-list">
        ${porTemp.map(t=>`
          <div class="stage-row">
            <div class="stage-row-top"><span>${TEMPS[t.temp].label}</span><span>${t.count}</span></div>
            <div class="stage-bar-track"><div class="stage-bar-fill" style="width:${cardsRel.length ? (t.count/cardsRel.length*100) : 0}%"></div></div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

/* ---------- tela compartilhada: criar/entrar numa equipe ---------- */
function renderEquipeSetup(tituloPagina, subtitulo){
  return `
    <div class="page-head">
      <div>
        <h1>${tituloPagina}</h1>
        <p>${subtitulo}</p>
      </div>
    </div>
    ${renderCriarEntrarEquipe()}
  `;
}
function renderCriarEntrarEquipe(){
  const outra = !!equipe;
  return `
    <div class="settings-page-grid">
      <div class="settings-page-section">
        <h3>${outra ? 'Criar outra equipe' : 'Criar uma equipe'}</h3>
        ${temRecurso('equipe') ? `<p class="settings-page-note">Você vira supervisor(a) automaticamente e ganha um código pra convidar outras pessoas. O funil de cada um continua separado — só o chat e a supervisão são compartilhados.</p>
        <div class="field">
          <input type="text" id="equipe-nome-novo" placeholder="Nome da equipe" value="${esc(equipeNomeNovo)}" />
        </div>
        <button class="btn-primary" data-action="criar-equipe">Criar equipe</button>` : avisoPlanoCompleto('Criar e supervisionar uma equipe é do plano Completo', 'Convide pessoas, acompanhe o desempenho de cada uma e converse pelo chat interno.')}
      </div>
      <div class="settings-page-section">
        <h3>${outra ? 'Entrar em mais uma equipe' : 'Entrar numa equipe existente'}</h3>
        <p class="settings-page-note">Peça o código de convite pra quem já criou a equipe.</p>
        <div class="field">
          <input type="text" id="equipe-codigo-entrar" placeholder="Código de convite" value="${esc(equipeCodigoEntrar)}" />
        </div>
        <button class="btn-outline" data-action="entrar-equipe">Entrar</button>
      </div>
    </div>
    ${equipeMsg ? `<p class="settings-page-msg ${equipeMsg.tipo}" style="margin-top:14px;">${esc(equipeMsg.texto)}</p>` : ''}
  `;
}

/* ---------- página: Chat Interno ---------- */
function renderMensagensEInput(mensagens, carregado, inputId, enviarAction, valorInput, enviando, vazioTexto){
  return `
    ${!carregado ? `<p class="settings-page-note">Carregando conversa…</p>` : `
      <div class="chat-interno-mensagens" id="${inputId}-mensagens">
        ${mensagens.length ? mensagens.map(m=>`
          <div class="wa-msg ${m.remetenteId===(currentUser&&currentUser.id)?'wa-msg-out':'wa-msg-in'}">
            <p><b>${m.remetenteId===(currentUser&&currentUser.id)?'Você':esc(m.remetenteNome)}:</b> ${esc(m.texto)}</p>
            <span>${formatDateHora(m.timestamp)}</span>
          </div>
        `).join('') : `<p class="settings-page-note">${vazioTexto}</p>`}
      </div>
      <div class="wa-conversa-input-row">
        <input type="text" id="${inputId}" placeholder="Escreva uma mensagem..." value="${esc(valorInput)}" />
        <button class="btn-primary" data-action="${enviarAction}" ${enviando?'disabled':''}>Enviar</button>
      </div>
    `}
  `;
}
function renderChatInternoConteudo(){
  const conversandoComOutro = !!dmDestinatarioId;
  const outro = conversandoComOutro ? equipe.membros.find(m=>m.id===dmDestinatarioId) : null;
  return `
    <div class="chat-interno-wrap">
      <div class="chat-interno-membros">
        <div class="settings-page-subtitle">Conversas</div>
        <button class="chat-membro-item chat-membro-btn ${!conversandoComOutro?'chat-membro-ativo':''}" data-action="fechar-conversa-individual">💬 Chat da equipe</button>
        ${equipe.membros.filter(m=>!m.souEu).map(m=>`
          <button class="chat-membro-item chat-membro-btn ${dmDestinatarioId===m.id?'chat-membro-ativo':''}" data-action="abrir-conversa-individual" data-user-id="${m.id}">${esc(m.nome||m.email)}${m.papel==='supervisor'?' ⭐':''}</button>
        `).join('')}
        ${equipe.membros.filter(m=>m.souEu).map(m=>`<div class="chat-membro-item chat-membro-eu">${esc(m.nome||m.email)} (você)</div>`).join('')}
      </div>
      <div class="chat-interno-main">
        <div class="settings-page-subtitle">${conversandoComOutro ? `Conversa com ${esc(outro ? (outro.nome||outro.email) : '')}` : 'Chat da equipe'}</div>
        ${conversandoComOutro
          ? renderMensagensEInput(dmMensagens, dmLoaded, 'chat-individual-input', 'enviar-chat-individual', dmTexto, dmEnviando, 'Nenhuma mensagem ainda.')
          : renderMensagensEInput(chatMensagens, chatLoaded, 'chat-interno-input', 'enviar-chat-interno', chatTexto, chatEnviando, 'Nenhuma mensagem ainda. Diga oi pra equipe!')
        }
      </div>
    </div>
  `;
}
function renderEquipePage(){
  if(!equipeLoaded){
    return `<div class="page-head"><div><h1>Equipe</h1><p>Carregando…</p></div></div>`;
  }
  if(!equipe){
    return renderEquipeSetup('Equipe', 'Você ainda não faz parte de uma equipe');
  }
  const abas = [['chat','Chat']];
  if(equipe.souSupervisor) abas.push(['supervisao','Gestão']);
  if(equipe.souSupervisor && typeof renderPermissoesEquipe === 'function') abas.push(['permissoes','Permissões']);
  if(equipe.souSupervisorDeDados) abas.push(['monitoramento','Monitoramento']);
  abas.push(['equipes', minhasEquipes.length > 1 ? `Minhas equipes (${minhasEquipes.length})` : 'Minhas equipes']);
  return `
    <div class="page-head">
      <div>
        <h1>Equipe</h1>
        <p>${minhasEquipes.length > 1 ? `
          <label class="equipe-troca">
            <span class="sr-only">Equipe aberta</span>
            <select data-action="trocar-equipe" aria-label="Equipe aberta">
              ${minhasEquipes.map(e=>`<option value="${e.id}" ${e.ativa?'selected':''}>${esc(e.nome)}${e.papel==='supervisor'?' ⭐':''}</option>`).join('')}
            </select>
          </label>` : esc(equipe.nome)} · ${equipe.membros.length} membro${equipe.membros.length===1?'':'s'}</p>
      </div>
    </div>
    ${abas.length > 1 ? `
      <div class="funil-tabs" style="margin-bottom:20px;">
        ${abas.map(([key,label])=>`<button class="tab-btn ${equipeSubTab===key?'active':''}" data-action="set-equipe-subtab" data-subtab="${key}">${label}</button>`).join('')}
      </div>
    ` : ''}
    ${equipeSubTab==='chat' ? renderChatInternoConteudo() : ''}
    ${equipeSubTab==='supervisao' && equipe.souSupervisor ? renderSupervisaoConteudo() : ''}
    ${equipeSubTab==='permissoes' && equipe.souSupervisor && typeof renderPermissoesEquipe === 'function' ? renderPermissoesEquipe() : ''}
    ${equipeSubTab==='monitoramento' && equipe.souSupervisorDeDados ? renderMonitoramentoConteudo() : ''}
    ${equipeSubTab==='equipes' ? renderMinhasEquipes() : ''}
  `;
}

// Todas as equipes da pessoa (uma fica aberta) + criar/entrar em mais uma
function renderMinhasEquipes(){
  const cheio = minhasEquipes.length >= limiteEquipes;
  return `
    <div class="settings-page-section" style="margin-bottom:20px;">
      <h3>Minhas equipes</h3>
      <p class="settings-page-note">Você pode fazer parte de até ${limiteEquipes} equipes, com um papel diferente em cada uma. Seu funil é um só e continua seu; o que muda ao trocar é o chat, a gestão e as permissões da equipe aberta.</p>
      <div class="minhas-equipes-lista">
        ${minhasEquipes.map(e=>`
          <div class="minha-equipe-item ${e.ativa?'ativa':''}">
            <div class="minha-equipe-info">
              <b>${esc(e.nome)}</b>
              <span>${e.papel==='supervisor'?'⭐ Gestor':'Membro'} · ${e.membros} pessoa${e.membros===1?'':'s'}${e.ativa?' · <span class="minha-equipe-aberta">Aberta</span>':''}</span>
            </div>
            <div class="settings-btn-row">
              ${e.ativa ? '' : `<button class="btn-primary" data-action="abrir-equipe-lista" data-equipe-id="${e.id}">Abrir</button>`}
              <button class="btn-outline" data-action="sair-equipe-lista" data-equipe-id="${e.id}" data-nome="${esc(e.nome)}">Sair</button>
            </div>
          </div>`).join('')}
      </div>
    </div>
    ${cheio ? `<p class="settings-page-note">Você chegou ao limite de ${limiteEquipes} equipes. Saia de alguma para criar ou entrar em outra.</p>` : renderCriarEntrarEquipe()}
  `;
}

/* ---------- página: Supervisão ---------- */
// Supervisor sempre primeiro, os demais em ordem alfabética por nome
function membrosOrdenados(membros){
  return [...membros].sort((a,b)=>{
    if(a.papel==='supervisor' && b.papel!=='supervisor') return -1;
    if(b.papel==='supervisor' && a.papel!=='supervisor') return 1;
    return (a.nome||'').localeCompare(b.nome||'', 'pt-BR');
  });
}
// Ranking de vendas: supervisor(es) destacado(s) à parte, fora da disputa por valor
// (o papel dele é apoiar a equipe, não vender — não é justo rankeá-lo pelo mesmo critério).
// Os demais membros continuam ordenados por valor ganho entre si.
function renderRankingSupervisao(membros){
  const supervisores = membros.filter(m=>m.papel==='supervisor');
  const resto = membros.filter(m=>m.papel!=='supervisor').sort((a,b)=>b.ganhoValor-a.ganhoValor);
  const maxGanho = Math.max(1, ...membros.map(x=>x.ganhoValor));
  let html = '';
  if(supervisores.length){
    html += supervisores.map(m=>`
      <div class="ranking-supervisor-card">
        <div class="stage-row-top"><span>⭐ ${esc(m.nome)} <span class="settings-page-note">— Gestor, fora do ranking de vendas</span></span><span>${fmtBRL(m.ganhoValor)}</span></div>
        <div class="stage-bar-track"><div class="stage-bar-fill" style="width:${(m.ganhoValor/maxGanho*100)}%"></div></div>
      </div>
    `).join('');
  }
  if(resto.length){
    html += `
      <div class="stage-list" style="margin-top:${supervisores.length?'14px':'0'};">
        ${resto.map((m,idx)=>`
          <div class="stage-row">
            <div class="stage-row-top">
              <span>${idx+1}º — ${esc(m.nome)}</span>
              <span style="display:flex; align-items:center; gap:10px;">
                ${fmtBRL(m.ganhoValor)}
                <button type="button" class="btn-outline" style="padding:4px 10px; font-size:11px;" data-action="ver-dashboard-membro" data-user-id="${m.userId}" data-nome="${esc(m.nome)}">Ver Dashboard</button>
                <button type="button" class="btn-primary" style="padding:4px 10px; font-size:11px;" data-action="atuar-como-membro" data-user-id="${m.userId}" data-nome="${esc(m.nome)}" title="Trabalhar no funil dessa pessoa (fica registrado)">Abrir funil</button>
              </span>
            </div>
            <div class="stage-bar-track"><div class="stage-bar-fill" style="width:${(m.ganhoValor/maxGanho*100)}%"></div></div>
          </div>
        `).join('')}
      </div>
    `;
  }
  return html || '<p class="dash-empty">Nenhum membro ainda.</p>';
}
function renderSupervisaoConteudo(){
  return `
    <div class="settings-page-section" style="margin-bottom:20px;">
      <h3>Convidar pessoas</h3>
      <p class="settings-page-note">Compartilhe esse código — quem entrar com ele vira membro da equipe, mantendo o funil próprio dele:</p>
      <div class="settings-page-row"><span>Código de convite</span><span style="font-family:'IBM Plex Mono',monospace; font-weight:700; letter-spacing:.05em;">${esc(equipe.codigoConvite||'')}</span></div>
      <button class="btn-outline" data-action="regenerar-codigo-equipe">Gerar novo código</button>
    </div>

    <div class="settings-page-section" style="margin-bottom:20px;">
      <h3>Membros</h3>
      <div class="disparo-lista-leads" style="max-height:none;">
        ${membrosOrdenados(equipe.membros).map(m=>`
          <div class="disparo-lead-item ${m.papel==='supervisor'?'membro-supervisor-destaque':''}" style="cursor:default; flex-direction:column; align-items:stretch; gap:8px;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span>${esc(m.nome||m.email)} — ${m.papel==='supervisor'?'⭐ Gestor':'Membro'}${m.supervisorDeDados?' · 🛠 Supervisor de dados':''}${m.souEu?' (você)':''}</span>
              ${!m.souEu ? `
                <div class="settings-btn-row">
                  <button class="btn-outline" data-action="alterar-papel-membro" data-user-id="${m.id}" data-papel="${m.papel==='supervisor'?'membro':'supervisor'}">${m.papel==='supervisor'?'Rebaixar':'Promover'}</button>
                  <button class="btn-outline" data-action="toggle-supervisor-dados" data-user-id="${m.id}" data-ativo="${m.supervisorDeDados?'0':'1'}">${m.supervisorDeDados?'Remover supervisor de dados':'Tornar supervisor de dados'}</button>
                  <button class="btn-outline" data-action="remover-membro" data-user-id="${m.id}">Remover</button>
                </div>
              ` : ''}
            </div>
          </div>
        `).join('')}
      </div>
      <button class="btn-outline" data-action="sair-equipe" style="margin-top:10px;">Sair da equipe</button>
    </div>

    <div class="settings-page-section" style="margin-bottom:20px;">
      <h3>Ranking de desempenho (por valor ganho)</h3>
      ${!supervisaoLoaded ? `<p class="settings-page-note">Carregando…</p>` : (supervisaoMembros.length ? renderRankingSupervisao(supervisaoMembros) : `<p class="dash-empty">Nenhum membro ainda.</p>`)}
    </div>

    <div class="settings-page-section">
      <h3>Desempenho por membro</h3>
      ${!supervisaoLoaded ? `<p class="settings-page-note">Carregando…</p>` : `
        <div class="leads-table-wrap" style="border:none;">
          <table class="leads-table">
            <thead><tr><th>Nome</th><th>Contatos</th><th>Em negociação</th><th>Ganho</th><th>Perdido</th></tr></thead>
            <tbody>
              ${membrosOrdenados(supervisaoMembros).map(m=>`
                <tr class="${m.papel==='supervisor'?'membro-supervisor-destaque':''}">
                  <td>${esc(m.nome)} ${m.papel==='supervisor'?'⭐':''}</td>
                  <td>${m.totalLeads}</td>
                  <td>${fmtBRL(m.abertoValor)}</td>
                  <td>${fmtBRL(m.ganhoValor)}</td>
                  <td>${fmtBRL(m.perdidoValor)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `}
    </div>
  `;
}
function renderMonitoramentoConteudo(){
  return `
    <div class="settings-page-section">
      <h3>Monitoramento de erros do sistema</h3>
      <p class="settings-page-note">Erros técnicos registrados automaticamente nos últimos 30 dias — útil pra perceber se algo quebrou sem precisar esperar alguém reclamar.</p>
      <div class="settings-btn-row" style="margin-bottom:14px;">
        <button class="btn-outline" data-action="atualizar-monitoramento">Atualizar</button>
        <button class="delete-link" data-action="limpar-monitoramento">🗑 Limpar log</button>
      </div>
      ${!monitoramentoLoaded ? `<p class="settings-page-note">Carregando…</p>` : (monitoramentoErros.length ? `
        <div class="historico-lista">
          ${monitoramentoErros.map(e=>`
            <div class="historico-item" style="align-items:flex-start; flex-direction:column; gap:4px;">
              <div style="display:flex; justify-content:space-between; width:100%;">
                <span class="badge" style="background:${e.tipo==='rota'?'var(--badge-neutral-bg)':'var(--danger-soft)'};color:${e.tipo==='rota'?'var(--ink-soft)':'var(--danger)'};">${e.tipo==='excecao_nao_tratada'?'Exceção crítica':e.tipo==='promise_rejeitada'?'Promise sem tratamento':'Erro de rota'}</span>
                <span class="historico-item-data">${formatDateHora(e.createdAt)}</span>
              </div>
              <span class="historico-item-texto">${esc(e.mensagem)}</span>
            </div>
          `).join('')}
        </div>
      ` : `<p class="dash-empty">Nenhum erro registrado — tudo tranquilo por aqui.</p>`)}
    </div>
  `;
}

/* ---------- página: Automações ---------- */
function renderAutomacoesPage(){
  if(!automacoesLoaded){
    return `<div class="page-head"><div><h1>Ações automáticas</h1><p>Carregando…</p></div></div>`;
  }
  return `
    <div class="page-head">
      <div>
        <h1>Ações automáticas</h1>
        <p>Tarefas e movimentos que acontecem sozinhos quando um cliente entra numa coluna</p>
      </div>
      ${temRecurso('automacoes') ? `<button class="btn-primary" data-action="open-new-automacao">+ Nova ação automática</button>` : ''}
    </div>
    ${temRecurso('automacoes') ? '' : avisoPlanoCompleto('Ações automáticas fazem parte do plano Completo', 'Crie tarefas e mova clientes sozinho quando eles entram numa coluna ou ficam parados.')}
    ${automacoes.length ? `
      <div class="automacoes-list">
        ${automacoes.map(a=>{
          const coluna = board.columns.find(c=>c.id===a.colunaGatilhoId);
          const gatilhoTexto = a.gatilhoTipo === 'tempo_parado'
            ? `fica <b>${(a.acaoParams&&a.acaoParams.diasParado)||5}+ dias parado</b> em`
            : `entra em`;
          const acaoTexto = a.acaoTipo === 'criar_tarefa'
            ? `cria a tarefa "${esc((a.acaoParams&&a.acaoParams.titulo)||'Follow-up automático')}"`
            : `move pra "${esc((board.columns.find(c=>c.id===(a.acaoParams&&a.acaoParams.colunaDestinoId))||{}).nome || '—')}"`;
          return `
            <div class="automacao-card ${a.ativa?'':'automacao-inativa'}">
              <div class="contrato-card-head">
                <div>
                  <h3 class="contrato-card-title">${esc(a.nome)}</h3>
                  <p class="contrato-card-note">Quando o cliente ${gatilhoTexto} <b>${esc(coluna?coluna.nome:'coluna removida')}</b> → ${acaoTexto}</p>
                </div>
                <div class="contrato-card-actions">
                  <span class="switch ${a.ativa?'on':''}" data-action="toggle-automacao" data-automacao-id="${a.id}" title="${a.ativa?'Ativa':'Inativa'}"><span class="switch-knob"></span></span>
                  <button class="icon-btn" data-action="open-edit-automacao" data-automacao-id="${a.id}" title="Editar">${ICON_EDIT}</button>
                  <button class="icon-btn" data-action="delete-automacao" data-automacao-id="${a.id}" title="Excluir">${ICON_TRASH}</button>
                </div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    ` : `<div class="tasks-empty">Nenhuma ação automática criada ainda.</div>`}
  `;
}

/* ---------- página: Fluxos ---------- */
function renderFluxosPage(){
  if(!fluxosLoaded){
    return `<div class="page-head"><div><h1>Sequências</h1><p>Carregando…</p></div></div>`;
  }
  return `
    <div class="page-head">
      <div>
        <h1>Sequências</h1>
        <p>Passos que acontecem ao longo dos dias, a partir de quando o cliente entra numa coluna</p>
      </div>
      ${temRecurso('automacoes') ? `<button class="btn-primary" data-action="open-new-fluxo">+ Nova sequência</button>` : ''}
    </div>
    ${temRecurso('automacoes') ? '' : avisoPlanoCompleto('Sequências fazem parte do plano Completo', 'Programe tarefas e movimentos para acontecerem ao longo dos dias depois que o cliente entra numa coluna.')}
    ${fluxos.length ? `
      <div class="automacoes-list">
        ${fluxos.map(f=>{
          const coluna = board.columns.find(c=>c.id===f.colunaGatilhoId);
          return `
            <div class="automacao-card ${f.ativo?'':'automacao-inativa'}">
              <div class="contrato-card-head">
                <div>
                  <h3 class="contrato-card-title">${esc(f.nome)}</h3>
                  <p class="contrato-card-note">
                    Começa quando entra em <b>${esc(coluna?coluna.nome:'coluna removida')}</b> ·
                    ${(f.etapas||[]).length} etapa${(f.etapas||[]).length===1?'':'s'} ·
                    ${f.emAndamento||0} cliente${(f.emAndamento||0)===1?'':'s'} em andamento
                  </p>
                </div>
                <div class="contrato-card-actions">
                  <span class="switch ${f.ativo?'on':''}" data-action="toggle-fluxo" data-fluxo-id="${f.id}" title="${f.ativo?'Ativo':'Inativo'}"><span class="switch-knob"></span></span>
                  <button class="icon-btn" data-action="open-edit-fluxo" data-fluxo-id="${f.id}" title="Editar">${ICON_EDIT}</button>
                  <button class="icon-btn" data-action="delete-fluxo" data-fluxo-id="${f.id}" title="Excluir">${ICON_TRASH}</button>
                </div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    ` : `<div class="tasks-empty">Nenhuma sequência criada ainda.</div>`}
  `;
}


/* ---------- página: Importar/Exportar ---------- */
function renderImportExportPage(){
  return `
    <div class="page-head">
      <div>
        <h1>Importar/Exportar</h1>
        <p>Importe uma planilha (.csv ou .xlsx) — os dados viram "possíveis contatos" até você completar e confirmar cada um.</p>
      </div>
    </div>

    <div class="settings-page-section">
      <h3>1. Importar planilha</h3>
      <div class="arquivo-linha">
        <label class="btn-outline btn-arquivo">Escolher planilha (.xlsx ou .csv)<input type="file" id="planilha-input" accept=".csv,.xlsx,.xls" hidden /></label>
        ${importPlanilhaNomeArquivo
          ? `<span class="arquivo-escolhido ${importAnimarEntrada?'entrando':''}"><span class="arquivo-escolhido-nome" title="${esc(importPlanilhaNomeArquivo)}">${esc(importPlanilhaNomeArquivo)}</span><button type="button" class="arquivo-tirar" data-action="tirar-planilha" aria-label="Tirar a planilha ${esc(importPlanilhaNomeArquivo)}" title="Tirar a planilha">×</button></span>`
          : `<span class="arquivo-nome">Nenhum arquivo escolhido</span>`}
        <button class="btn-link arquivo-modelo" data-action="modelo-planilha-leads">Baixar planilha modelo</button>
      </div>
      ${importPlanilhaNomeArquivo ? `<div class="import-detalhe" id="import-detalhe">` : ''}
      ${importPlanilhaColunas.length ? `
        <p class="settings-page-note" style="margin-top:10px;">${importPlanilhaLinhas.length} linha(s) encontrada(s) em "${esc(importPlanilhaNomeArquivo)}". Escolha qual coluna da planilha é qual campo:</p>
        <div class="field-row">
          <div class="field">
            <label>Coluna do nome</label>
            <select id="map-nome">
              <option value="">(nenhuma)</option>
              ${importPlanilhaColunas.map(c=>`<option value="${esc(c)}" ${importMapNome===c?'selected':''}>${esc(c)}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label>Coluna do telefone</label>
            <select id="map-telefone">
              <option value="">(nenhuma)</option>
              ${importPlanilhaColunas.map(c=>`<option value="${esc(c)}" ${importMapTelefone===c?'selected':''}>${esc(c)}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label>Coluna do serviço desejado</label>
            <select id="map-servico">
              <option value="">(nenhuma)</option>
              ${importPlanilhaColunas.map(c=>`<option value="${esc(c)}" ${importMapServico===c?'selected':''}>${esc(c)}</option>`).join('')}
            </select>
          </div>
        </div>
        ${importPlanilhaMsg ? `<p class="settings-page-msg ${importPlanilhaMsg.tipo}">${esc(importPlanilhaMsg.texto)}</p>` : ''}
        <button class="btn-primary" id="confirmar-import-planilha" ${importandoPlanilha?'disabled':''}>${importandoPlanilha?'Importando…':'Importar planilha'}</button>
      ` : (importPlanilhaMsg ? `<p class="settings-page-msg ${importPlanilhaMsg.tipo}">${esc(importPlanilhaMsg.texto)}</p>` : '')}
      ${importPlanilhaNomeArquivo ? `</div>` : ''}
    </div>

    <div class="settings-page-section">
      <h3>2. Possíveis contatos (${possiveisLeads.length})</h3>
      <p class="settings-page-note">Complete as informações de cada um pra adicioná-lo de vez aos Contatos.</p>
      ${!possiveisLeadsCarregados ? `<p class="settings-page-note">Carregando…</p>` : (possiveisLeads.length ? `
        <div class="leads-table-wrap">
          <table class="leads-table">
            <thead><tr><th>Nome</th><th>Telefone</th><th>Serviço desejado</th><th>Ações</th></tr></thead>
            <tbody>
              ${possiveisLeads.map(l=>`
                <tr>
                  <td>${esc(l.nome)||'—'}</td>
                  <td>${esc(l.telefone)||'—'}</td>
                  <td>${esc(l.tipoServico)||'—'}</td>
                  <td>
                    <button class="btn-outline" data-action="completar-possivel-lead" data-lead-id="${l.id}">Completar</button>
                    <button class="icon-btn" data-action="descartar-possivel-lead" data-lead-id="${l.id}" title="Descartar">${ICON_TRASH}</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      ` : `<div class="tasks-empty">Nenhum possível contato pendente.</div>`)}
    </div>

    <div class="settings-page-section">
      <h3>3. Exportar</h3>
      <p class="settings-page-note">Baixa todos os clientes já confirmados (que estão na aba Contatos) em Excel (.xlsx) ou CSV.</p>
      <div class="arquivo-linha">
        <button class="btn-outline" data-action="exportar-leads">Exportar contatos (.xlsx)</button>
        <button class="btn-outline" data-action="exportar-leads" data-formato="csv">Exportar contatos (CSV)</button>
      </div>
    </div>
  `;
}

/* ---------- página: Suporte ---------- */
function renderSuportePage(){
  return `
    <div class="page-head">
      <div>
        <h1>Suporte</h1>
        <p>Dúvidas e contato</p>
      </div>
    </div>
    <div class="settings-page-grid">
      <div class="settings-page-section">
        <h3>Perguntas frequentes</h3>
        <p class="settings-page-note"><b>Como mudo a cor do painel?</b><br/>Configurações → Aparência e acessibilidade.</p>
        <p class="settings-page-note"><b>Como deixo a letra maior?</b><br/>Configurações → Aparência e acessibilidade → Tamanho da letra. Lá também tem alto contraste e menos animação.</p>
        <p class="settings-page-note"><b>Como conecto a Google Agenda?</b><br/>Configurações → Integrações → Google Agenda.</p>
      </div>
      <div class="settings-page-section">
        <h3>Contato</h3>
        <p class="settings-page-note">Encontrou um problema ou tem uma sugestão pro painel? Fale com quem administra esse CRM.</p>
        <a class="btn-primary" href="mailto:?subject=Painel%20CRM%20-%20Suporte" style="display:inline-block; text-decoration:none; text-align:center;">Enviar e-mail</a>
      </div>
    </div>
  `;
}

/* ---------- modal do contrato de comissão ---------- */
function openNewContrato(){
  contratoModalForm = { __isNew:true, id:null, desc:'', scope:'Pessoal', valorVenda:0, tipoProduto: tipoProdutoPadrao(), date: comissoesMonth + '-01' };
  renderContratoModal();
}
function openEditContrato(id){
  const c = contratos.find(x=>x.id===id);
  if(!c) return;
  contratoModalForm = { __isNew:false, id:c.id, desc:c.desc, scope:c.scope, valorVenda:c.valorVenda, tipoProduto:c.tipoProduto||'padrao', date:c.date };
  renderContratoModal();
}
function closeContratoModal(){ contratoModalForm = null; document.getElementById('modal-root').innerHTML=''; }

// Genérico pra N blocos — funciona pra qualquer regra, inclusive as que o usuário criar
// na engrenagem (2 blocos, 1 bloco, 5 blocos, o que for).
function previewComissaoHtml(prev){
  const linhas = prev.blocos.map(b=>
    b.parcelas === 1
      ? `🔹 Parcela única: <b>${fmtBRL(b.value)}</b>`
      : `🔹 ${b.parcelas} parcelas: <b>${fmtBRL(b.value)}</b> cada`
  ).join('<br/>');
  return `
    ${linhas}<br/>
    Total: ${prev.parcelas}x parcela${prev.parcelas===1?'':'s'} · Total líquido da comissão: <b>${fmtBRL(prev.total)}</b>
  `;
}
function renderContratoModal(){
  const root = document.getElementById('modal-root');
  if(!contratoModalForm){ root.innerHTML=''; return; }
  const f = contratoModalForm;
  const preview = calcComissaoPreviewPorTipo(f.valorVenda, f.tipoProduto);

  root.innerHTML = `
    <div class="overlay" id="contrato-modal-overlay">
      <div class="modal">
        <div class="modal-head">
          <h3>${f.__isNew ? 'Novo contrato de comissão' : 'Editar contrato'}</h3>
          <button id="contrato-modal-close">✕</button>
        </div>
        <div class="modal-body">
          <div class="field">
            <label>Cliente / contrato</label>
            <input type="text" id="c-desc" value="${esc(f.desc)}" placeholder="Ex: Maria Silva — Projeto do site" />
          </div>
          <div class="field">
            <label>Escopo</label>
            <div class="scope-toggle" id="c-scope-toggle">
              <div class="scope-btn ${f.scope==='Pessoal'?'active':''}" data-scope="Pessoal">Pessoal</div>
              <div class="scope-btn ${f.scope==='Empresa'?'active':''}" data-scope="Empresa">Empresa</div>
            </div>
          </div>
          <div class="field">
            <label>Produto / serviço</label>
            <select id="c-tipo-produto">
              ${renderOpcoesTipoProduto(f.tipoProduto)}
            </select>
          </div>
          <div class="field">
            <label>Valor da venda</label>
            <div class="money-wrap">
              <span>R$</span>
              <input type="text" inputmode="numeric" id="c-valor-venda" value="${f.valorVenda ? Number(f.valorVenda).toLocaleString('pt-BR') : ''}" placeholder="0" />
            </div>
          </div>
          <div class="field">
            <label>Mês da 1ª parcela</label>
            <input type="month" id="c-mes" value="${(f.date||'').slice(0,7)}" />
            <p class="settings-page-note" id="c-mes-nota">${textoNotaMesContrato(f.tipoProduto)}</p>
          </div>
          <div class="calc-preview" id="c-preview">
            ${previewComissaoHtml(preview)}
          </div>
          <p class="calc-preview-note">O valor de cada parcela é calculado automaticamente a partir do valor da venda e da regra de comissão escolhida.</p>
        </div>
        <div class="modal-foot">
          ${!f.__isNew ? `<button class="delete-link" id="c-delete">🗑 Excluir</button>` : '<span></span>'}
          <div class="modal-foot-actions">
            <button class="btn-outline" id="c-cancel">Cancelar</button>
            <button class="btn-save" id="c-save">${f.__isNew ? 'Criar contrato' : 'Salvar alterações'}</button>
          </div>
        </div>
      </div>
    </div>
  `;

  document.getElementById('contrato-modal-close').addEventListener('click', closeContratoModal);
  document.getElementById('c-cancel').addEventListener('click', closeContratoModal);
  document.getElementById('contrato-modal-overlay').addEventListener('click', (e)=>{ if(e.target.id==='contrato-modal-overlay') closeContratoModal(); });

  document.getElementById('c-desc').addEventListener('input', (e)=> contratoModalForm.desc = e.target.value);
  document.getElementById('c-mes').addEventListener('change', (e)=> contratoModalForm.date = e.target.value + '-01');

  document.querySelectorAll('#c-scope-toggle .scope-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      contratoModalForm.scope = btn.dataset.scope;
      document.querySelectorAll('#c-scope-toggle .scope-btn').forEach(b=>{
        b.classList.toggle('active', b.dataset.scope===contratoModalForm.scope);
      });
    });
  });

  document.getElementById('c-tipo-produto').addEventListener('change', (e)=>{
    contratoModalForm.tipoProduto = e.target.value;
    const prev = calcComissaoPreviewPorTipo(contratoModalForm.valorVenda, contratoModalForm.tipoProduto);
    const previewEl = document.getElementById('c-preview');
    if(previewEl) previewEl.innerHTML = previewComissaoHtml(prev);
    const notaMes = document.getElementById('c-mes-nota');
    if(notaMes) notaMes.textContent = textoNotaMesContrato(contratoModalForm.tipoProduto);
  });

  const valorVendaInput = document.getElementById('c-valor-venda');
  valorVendaInput.addEventListener('input', (e)=>{
    const { numero, texto } = maskInteiro(e.target.value);
    contratoModalForm.valorVenda = numero;
    e.target.value = texto;
    const prev = calcComissaoPreviewPorTipo(numero, contratoModalForm.tipoProduto);
    const previewEl = document.getElementById('c-preview');
    if(previewEl) previewEl.innerHTML = previewComissaoHtml(prev);
  });

  document.getElementById('c-save').addEventListener('click', saveContratoFromModal);
  if(!f.__isNew){
    document.getElementById('c-delete').addEventListener('click', ()=>{
      showConfirm({
        message: 'Excluir este contrato de comissão? Essa ação não pode ser desfeita.',
        onConfirm: ()=>{ deleteContratoById(f.id); closeContratoModal(); closeConfirm(); },
      });
    });
  }
}

/* ---------- modal: Regras de Comissão (engrenagem em Comissões) ----------
   Duas telas dentro do mesmo modal: lista (todas as regras do usuário) e editor
   (uma regra por vez — nome, mês independente e os blocos de parcelas, como uma
   planilha: cada linha é "N parcelas de X% do valor da venda"). */
function openRegrasComissaoModal(){
  regrasModalAberto = true;
  regraEditForm = null;
  renderRegrasModal();
  if(!regrasComissaoLoaded) loadRegrasComissao();
}
function closeRegrasComissaoModal(){
  regrasModalAberto = false;
  regraEditForm = null;
  document.getElementById('modal-root').innerHTML = '';
  renderApp(); // a lista de contratos usa as regras pra mostrar nome/blocos — garante que reflita qualquer alteração
}
function abrirNovaRegra(){
  regraEditForm = { __isNew:true, id:null, nome:'', mesIndependente:false, base:'final', blocos:[{ parcelas:1, percentual:0 }] };
  renderRegrasModal();
}
function abrirEditarRegra(id){
  const r = regrasComissao.find(x=>x.id===id);
  if(!r) return;
  regraEditForm = {
    __isNew:false, id:r.id, nome:r.nome, mesIndependente:!!r.mesIndependente, base: r.base==='negociado' ? 'negociado' : 'final',
    // o back-end guarda percentual como fração (0.016); no formulário mostramos "humano" (1.6)
    blocos: (r.blocos||[]).map(b=>({ parcelas:b.parcelas, percentual: Math.round(b.percentual*100*1000000)/1000000 })),
  };
  renderRegrasModal();
}
function renderRegraLinhaBloco(b, idx, podeRemover){
  return `
    <div class="regra-bloco-row">
      <div class="field">
        <label>Parcelas</label>
        <input type="number" min="1" step="1" class="regra-bloco-parcelas" data-idx="${idx}" value="${b.parcelas}" />
      </div>
      <div class="field">
        <label>% da venda (por parcela)</label>
        <input type="number" min="0" step="any" class="regra-bloco-percentual" data-idx="${idx}" value="${b.percentual}" />
      </div>
      <button type="button" class="icon-btn" data-action="remover-bloco-regra" data-idx="${idx}" title="Remover linha" ${podeRemover?'':'disabled'}>${ICON_TRASH}</button>
    </div>
  `;
}
function htmlPreviewRegraEditor(f){
  const REF = 100000; // venda de referência só pra simular — o valor real usa o valor de cada contrato
  const blocos = f.blocos.map(b=>({
    parcelas: Math.max(1, parseInt(b.parcelas,10)||1),
    value: Math.round(REF * ((parseFloat(b.percentual)||0)/100) * 100) / 100,
  }));
  const total = Math.round(blocos.reduce((s,b)=>s+b.value*b.parcelas,0)*100)/100;
  const totalParcelas = blocos.reduce((s,b)=>s+b.parcelas,0);
  const linhas = blocos.map(b=> b.parcelas===1
    ? `🔹 Parcela única: <b>${fmtBRL(b.value)}</b>`
    : `🔹 ${b.parcelas} parcelas: <b>${fmtBRL(b.value)}</b> cada`
  ).join('<br/>');
  return `${linhas}<br/>Total: ${totalParcelas}x parcela${totalParcelas===1?'':'s'} · Total líquido: <b>${fmtBRL(total)}</b>`;
}
function atualizarPreviewRegraEditor(){
  const el = document.getElementById('re-preview');
  if(el && regraEditForm) el.innerHTML = htmlPreviewRegraEditor(regraEditForm);
}
function htmlRegrasLista(){
  return `
    <div class="overlay" id="regras-modal-overlay">
      <div class="modal modal-lg">
        <div class="modal-head">
          <h3>Regras de comissão</h3>
          <button id="regras-modal-close">✕</button>
        </div>
        <div class="modal-body">
          <p class="settings-page-note">Cada regra define como uma comissão é calculada, em blocos de parcelas — como uma planilha. Crie, renomeie, edite ou exclua regras à vontade: comissões já lançadas guardam o cálculo da época e não mudam retroativamente.</p>
          ${!regrasComissaoLoaded ? `<div class="tasks-empty">Carregando…</div>` : (regrasComissao.length ? `
            <div class="regras-lista">
              ${regrasComissao.map(r=>`
                <div class="regra-row">
                  <div class="regra-row-info">
                    <div class="regra-row-nome">${esc(r.nome)} ${r.mesIndependente?'<span class="badge badge-neutral" title="O mês da comissão pode ser editado sem alterar o mês do contato">Mês independente</span>':''}</div>
                    <div class="regra-row-blocos">${(r.blocos||[]).map(b=>`${b.parcelas}x ${(b.percentual*100).toLocaleString('pt-BR',{maximumFractionDigits:6})}%`).join(' · ')}</div>
                  </div>
                  <div class="regra-row-actions">
                    <button class="icon-btn" data-action="editar-regra" data-regra-id="${r.id}" title="Editar">${ICON_EDIT}</button>
                    <button class="icon-btn" data-action="excluir-regra" data-regra-id="${r.id}" title="Excluir">${ICON_TRASH}</button>
                  </div>
                </div>
              `).join('')}
            </div>
          ` : `<div class="tasks-empty">Nenhuma regra cadastrada ainda.</div>`)}
        </div>
        <div class="modal-foot">
          <span></span>
          <div class="modal-foot-actions">
            <button class="btn-outline" id="regras-modal-close-2">Fechar</button>
            <button class="btn-save" data-action="nova-regra">+ Nova regra</button>
          </div>
        </div>
      </div>
    </div>
  `;
}
function htmlRegraEditor(){
  const f = regraEditForm;
  return `
    <div class="overlay" id="regras-modal-overlay">
      <div class="modal modal-lg">
        <div class="modal-head">
          <h3>${f.__isNew ? 'Nova regra de comissão' : 'Editar regra'}</h3>
          <button id="regras-modal-close">✕</button>
        </div>
        <div class="modal-body">
          <div class="field">
            <label>Nome</label>
            <input type="text" id="re-nome" value="${esc(f.nome)}" placeholder="Ex: Plano mensal" />
          </div>
          <div class="field">
            <label class="checkbox-item"><input type="checkbox" id="re-mes-independente" ${f.mesIndependente?'checked':''} /> Mês da comissão independente do mês do contato (pra pagamentos que demoram a acontecer de verdade)</label>
          </div>
          <div class="field">
            <label for="re-base">Calcular sobre</label>
            <select id="re-base">
              <option value="final" ${f.base!=='negociado'?'selected':''}>Valor final da venda (com desconto) — recomendado</option>
              <option value="negociado" ${f.base==='negociado'?'selected':''}>Valor do card (antes do desconto)</option>
            </select>
            <p class="settings-page-note">O valor final é o que você informa no fechamento da venda. Sem fechamento, vale o valor do card.</p>
          </div>
          <div class="field">
            <label>Blocos de parcelas</label>
            <div class="regra-blocos-cabecalho">
              <span>Parcelas</span><span>% da venda (por parcela)</span><span></span>
            </div>
            <div id="re-blocos-lista">
              ${f.blocos.map((b,idx)=>renderRegraLinhaBloco(b,idx,f.blocos.length>1)).join('')}
            </div>
            <button type="button" class="btn-outline" id="re-add-bloco">+ Adicionar linha</button>
          </div>
          <div class="calc-preview" id="re-preview">${htmlPreviewRegraEditor(f)}</div>
          <p class="calc-preview-note">Simulação com uma venda de R$ 100.000 — o valor real usa o valor de cada contrato.</p>
        </div>
        <div class="modal-foot">
          ${!f.__isNew ? `<button class="delete-link" id="re-delete">🗑 Excluir</button>` : '<span></span>'}
          <div class="modal-foot-actions">
            <button class="btn-outline" id="re-cancel">‹ Voltar</button>
            <button class="btn-save" id="re-save">${f.__isNew ? 'Criar regra' : 'Salvar alterações'}</button>
          </div>
        </div>
      </div>
    </div>
  `;
}
function renderRegrasModal(){
  const root = document.getElementById('modal-root');
  if(!regrasModalAberto){ root.innerHTML=''; return; }
  root.innerHTML = regraEditForm ? htmlRegraEditor() : htmlRegrasLista();
  ligarBindingsRegrasModal();
}
function ligarBindingsRegrasModal(){
  const closeBtn = document.getElementById('regras-modal-close');
  if(closeBtn) closeBtn.addEventListener('click', closeRegrasComissaoModal);
  const overlay = document.getElementById('regras-modal-overlay');
  if(overlay) overlay.addEventListener('click', (e)=>{ if(e.target.id==='regras-modal-overlay') closeRegrasComissaoModal(); });

  if(!regraEditForm){
    const closeBtn2 = document.getElementById('regras-modal-close-2');
    if(closeBtn2) closeBtn2.addEventListener('click', closeRegrasComissaoModal);
    document.querySelectorAll('[data-action="editar-regra"]').forEach(btn=>{
      btn.addEventListener('click', ()=> abrirEditarRegra(btn.dataset.regraId));
    });
    document.querySelectorAll('[data-action="excluir-regra"]').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const id = btn.dataset.regraId;
        const r = regrasComissao.find(x=>x.id===id);
        showConfirm({
          message: `Excluir a regra "${r?r.nome:''}"? Comissões já lançadas com ela continuam iguais, mas ela deixa de aparecer como opção pra novos contratos e contatos.`,
          confirmLabel: 'Excluir',
          onConfirm: async ()=>{
            closeConfirm();
            try{
              await apiRequest('DELETE', `/regras-comissao/${id}`);
              regrasComissao = regrasComissao.filter(x=>x.id!==id);
              renderRegrasModal();
            }catch(e){
              errorMsg = e.message || 'Não foi possível excluir essa regra.';
              renderApp();
            }
          },
        });
      });
    });
    const novaBtn = document.querySelector('[data-action="nova-regra"]');
    if(novaBtn) novaBtn.addEventListener('click', abrirNovaRegra);
    return;
  }

  document.getElementById('re-nome').addEventListener('input', (e)=> regraEditForm.nome = e.target.value);
  document.getElementById('re-mes-independente').addEventListener('change', (e)=> regraEditForm.mesIndependente = e.target.checked);
  document.getElementById('re-base').addEventListener('change', (e)=> regraEditForm.base = e.target.value);
  document.querySelectorAll('.regra-bloco-parcelas').forEach(inp=>{
    inp.addEventListener('input', (e)=>{
      regraEditForm.blocos[parseInt(e.target.dataset.idx,10)].parcelas = e.target.value;
      atualizarPreviewRegraEditor();
    });
  });
  document.querySelectorAll('.regra-bloco-percentual').forEach(inp=>{
    inp.addEventListener('input', (e)=>{
      regraEditForm.blocos[parseInt(e.target.dataset.idx,10)].percentual = e.target.value;
      atualizarPreviewRegraEditor();
    });
  });
  document.querySelectorAll('[data-action="remover-bloco-regra"]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      if(regraEditForm.blocos.length<=1) return; // sempre precisa de ao menos 1 bloco
      regraEditForm.blocos.splice(parseInt(btn.dataset.idx,10),1);
      renderRegrasModal();
    });
  });
  const addBtn = document.getElementById('re-add-bloco');
  if(addBtn) addBtn.addEventListener('click', ()=>{
    regraEditForm.blocos.push({ parcelas:1, percentual:0 });
    renderRegrasModal();
  });
  document.getElementById('re-cancel').addEventListener('click', ()=>{ regraEditForm=null; renderRegrasModal(); });
  if(!regraEditForm.__isNew){
    document.getElementById('re-delete').addEventListener('click', ()=>{
      const f = regraEditForm;
      showConfirm({
        message: `Excluir a regra "${f.nome}"? Comissões já lançadas com ela continuam iguais, mas ela deixa de aparecer como opção pra novos contratos e contatos.`,
        confirmLabel: 'Excluir',
        onConfirm: async ()=>{
          closeConfirm();
          try{
            await apiRequest('DELETE', `/regras-comissao/${f.id}`);
            regrasComissao = regrasComissao.filter(x=>x.id!==f.id);
            regraEditForm = null;
            renderRegrasModal();
          }catch(e){
            errorMsg = e.message || 'Não foi possível excluir essa regra.';
            renderApp();
          }
        },
      });
    });
  }
  document.getElementById('re-save').addEventListener('click', salvarRegraComissao);
}
async function salvarRegraComissao(){
  const f = regraEditForm;
  if(!f.nome || !f.nome.trim()){
    errorMsg = 'Dê um nome pra essa regra de comissão.';
    renderApp();
    return;
  }
  const blocos = f.blocos.map(b=>({ parcelas: parseInt(b.parcelas,10)||1, percentual: parseFloat(b.percentual)||0 }));
  const payload = { nome: f.nome.trim(), mesIndependente: !!f.mesIndependente, base: f.base==='negociado' ? 'negociado' : 'final', blocos };
  const saveBtn = document.getElementById('re-save');
  if(saveBtn){ saveBtn.disabled = true; saveBtn.textContent = 'Salvando…'; }
  try{
    let regra;
    if(f.__isNew){
      regra = await apiRequest('POST', '/regras-comissao', payload);
      regrasComissao = [...regrasComissao, regra].sort((a,b)=>a.ordem-b.ordem);
    }else{
      regra = await apiRequest('PUT', `/regras-comissao/${f.id}`, payload);
      regrasComissao = regrasComissao.map(r=> r.id===regra.id ? regra : r).sort((a,b)=>a.ordem-b.ordem);
    }
    regraEditForm = null;
    renderRegrasModal();
  }catch(e){
    errorMsg = e.message || 'Não foi possível salvar essa regra.';
    renderApp();
    if(saveBtn){ saveBtn.disabled=false; saveBtn.textContent = f.__isNew?'Criar regra':'Salvar alterações'; }
  }
}

/* ---------- modal de automação ---------- */
function openNewAutomacao(colunaPreSelecionada){
  automacaoModalForm = {
    __isNew:true, id:null, nome:'',
    colunaGatilhoId: colunaPreSelecionada || (board.columns[0]||{}).id || '',
    gatilhoTipo:'entrada_coluna',
    acaoTipo:'criar_tarefa',
    acaoParams:{ titulo:'', diasParaVencimento:3, diasParado:5, colunaDestinoId:(board.columns[0]||{}).id || '' },
  };
  renderAutomacaoModal();
}
function openEditAutomacao(id){
  const a = automacoes.find(x=>x.id===id);
  if(!a) return;
  automacaoModalForm = {
    __isNew:false, id:a.id, nome:a.nome, colunaGatilhoId:a.colunaGatilhoId,
    gatilhoTipo: a.gatilhoTipo || 'entrada_coluna', acaoTipo:a.acaoTipo,
    acaoParams:{ titulo:'', diasParaVencimento:3, diasParado:5, colunaDestinoId:'', ...(a.acaoParams||{}) },
  };
  renderAutomacaoModal();
}
function closeAutomacaoModal(){ automacaoModalForm = null; document.getElementById('modal-root').innerHTML=''; }

function renderAutomacaoAcaoParams(f){
  if(f.acaoTipo === 'criar_tarefa'){
    return `
      <div class="field">
        <label>Título da tarefa</label>
        <input type="text" id="am-tarefa-titulo" value="${esc(f.acaoParams.titulo||'')}" placeholder="Ex: Ligar pra confirmar interesse" />
      </div>
      <div class="field">
        <label>Vencimento (dias a partir de quando a tarefa é criada)</label>
        <input type="number" id="am-tarefa-dias" value="${f.acaoParams.diasParaVencimento||3}" min="1" />
      </div>
    `;
  }
  return `
    <div class="field">
      <label>Coluna de destino</label>
      <select id="am-coluna-destino">
        ${board.columns.map(c=>`<option value="${c.id}" ${f.acaoParams.colunaDestinoId===c.id?'selected':''}>${esc(c.nome)}</option>`).join('')}
      </select>
    </div>
  `;
}
function bindAutomacaoAcaoParams(){
  const tituloEl = document.getElementById('am-tarefa-titulo');
  if(tituloEl) tituloEl.addEventListener('input', (e)=> automacaoModalForm.acaoParams.titulo = e.target.value);
  const diasEl = document.getElementById('am-tarefa-dias');
  if(diasEl) diasEl.addEventListener('input', (e)=> automacaoModalForm.acaoParams.diasParaVencimento = parseInt(e.target.value,10)||3);
  const destinoEl = document.getElementById('am-coluna-destino');
  if(destinoEl) destinoEl.addEventListener('change', (e)=> automacaoModalForm.acaoParams.colunaDestinoId = e.target.value);
}

function renderAutomacaoModal(){
  const root = document.getElementById('modal-root');
  if(!automacaoModalForm){ root.innerHTML=''; return; }
  const f = automacaoModalForm;

  root.innerHTML = `
    <div class="overlay" id="automacao-modal-overlay">
      <div class="modal">
        <div class="modal-head">
          <h3>${f.__isNew ? 'Nova ação automática' : 'Editar ação automática'}</h3>
          <button id="automacao-modal-close">✕</button>
        </div>
        <div class="modal-body">
          <div class="field">
            <label>Nome</label>
            <input type="text" id="am-nome" value="${esc(f.nome)}" placeholder="Ex: Agendar follow-up de propostas" />
          </div>
          <div class="field">
            <label>Coluna</label>
            <select id="am-coluna-gatilho">
              ${board.columns.map(c=>`<option value="${c.id}" ${f.colunaGatilhoId===c.id?'selected':''}>${esc(c.nome)}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label>Disparar quando</label>
            <select id="am-gatilho-tipo">
              <option value="entrada_coluna" ${f.gatilhoTipo==='entrada_coluna'?'selected':''}>O cliente entrar nessa coluna</option>
              <option value="tempo_parado" ${f.gatilhoTipo==='tempo_parado'?'selected':''}>O cliente ficar parado nessa coluna por X dias</option>
            </select>
          </div>
          <div id="am-dias-parado-wrap" style="${f.gatilhoTipo==='tempo_parado'?'':'display:none;'}">
            <div class="field">
              <label>Depois de quantos dias parado</label>
              <input type="number" id="am-dias-parado" value="${f.acaoParams.diasParado||5}" min="1" />
            </div>
            <p class="settings-page-note">Checado a cada hora pelo servidor — não é em tempo real.</p>
          </div>
          <div class="field">
            <label>Ação</label>
            <select id="am-acao-tipo">
              <option value="criar_tarefa" ${f.acaoTipo==='criar_tarefa'?'selected':''}>Criar uma tarefa</option>
              <option value="mover_coluna" ${f.acaoTipo==='mover_coluna'?'selected':''}>Mover pra outra coluna</option>
            </select>
          </div>
          <div id="am-acao-params">${renderAutomacaoAcaoParams(f)}</div>
        </div>
        <div class="modal-foot">
          ${!f.__isNew ? `<button class="delete-link" id="am-delete">🗑 Excluir</button>` : '<span></span>'}
          <div class="modal-foot-actions">
            <button class="btn-outline" id="am-cancel">Cancelar</button>
            <button class="btn-save" id="am-save">Salvar</button>
          </div>
        </div>
      </div>
    </div>
  `;

  document.getElementById('automacao-modal-close').addEventListener('click', closeAutomacaoModal);
  document.getElementById('am-cancel').addEventListener('click', closeAutomacaoModal);
  document.getElementById('automacao-modal-overlay').addEventListener('click', (e)=>{ if(e.target.id==='automacao-modal-overlay') closeAutomacaoModal(); });

  document.getElementById('am-nome').addEventListener('input', (e)=> automacaoModalForm.nome = e.target.value);
  document.getElementById('am-coluna-gatilho').addEventListener('change', (e)=> automacaoModalForm.colunaGatilhoId = e.target.value);
  document.getElementById('am-gatilho-tipo').addEventListener('change', (e)=>{
    automacaoModalForm.gatilhoTipo = e.target.value;
    const wrap = document.getElementById('am-dias-parado-wrap');
    if(wrap) wrap.style.display = e.target.value === 'tempo_parado' ? '' : 'none';
  });
  const diasParadoEl = document.getElementById('am-dias-parado');
  if(diasParadoEl) diasParadoEl.addEventListener('input', (e)=> automacaoModalForm.acaoParams.diasParado = parseInt(e.target.value,10)||5);
  document.getElementById('am-acao-tipo').addEventListener('change', (e)=>{
    automacaoModalForm.acaoTipo = e.target.value;
    document.getElementById('am-acao-params').innerHTML = renderAutomacaoAcaoParams(automacaoModalForm);
    bindAutomacaoAcaoParams();
  });
  bindAutomacaoAcaoParams();

  document.getElementById('am-save').addEventListener('click', salvarAutomacao);
  if(!f.__isNew){
    document.getElementById('am-delete').addEventListener('click', ()=>{
      showConfirm({ chave:'acao-automatica',
        message: 'Excluir esta ação automática? Ela para de rodar imediatamente.',
        onConfirm: ()=>{ excluirAutomacao(f.id); closeAutomacaoModal(); closeConfirm(); },
      });
    });
  }
}

/* ---------- modal de fluxo ---------- */
function openNewFluxo(){
  fluxoModalForm = {
    __isNew:true, id:null, nome:'',
    colunaGatilhoId: (board.columns[0]||{}).id || '',
    etapas: [{ diasAposInicio:0, tipo:'tarefa', params:{ titulo:'', diasParaVencimento:1 } }],
  };
  renderFluxoModal();
}
function openEditFluxo(id){
  const f = fluxos.find(x=>x.id===id);
  if(!f) return;
  fluxoModalForm = {
    __isNew:false, id:f.id, nome:f.nome, colunaGatilhoId:f.colunaGatilhoId,
    etapas: (f.etapas||[]).map(e=>({ diasAposInicio:e.diasAposInicio, tipo:e.tipo, params:{...(e.params||{})} })),
  };
  renderFluxoModal();
}
function closeFluxoModal(){ fluxoModalForm = null; document.getElementById('modal-root').innerHTML=''; }

/* ---------- modal: escolher entre novo cliente ou transferir existente ---------- */
function abrirEscolhaAdicionarLead(colId){
  const root = document.getElementById('modal-root');
  const coluna = board.columns.find(c=>c.id===colId);
  root.innerHTML = `
    <div class="overlay" id="add-lead-choice-overlay">
      <div class="modal">
        <div class="modal-head">
          <h3>Adicionar cliente em "${esc(coluna?coluna.nome:'')}"</h3>
          <button id="add-lead-choice-close">✕</button>
        </div>
        <div class="modal-body">
          <button type="button" class="add-lead-choice-btn" id="add-lead-choice-novo">
            <span class="add-lead-choice-title">+ Novo cliente</span>
            <span class="add-lead-choice-desc">Cadastrar um cliente que ainda não existe no CRM</span>
          </button>
          <button type="button" class="add-lead-choice-btn" id="add-lead-choice-transferir">
            <span class="add-lead-choice-title">Transferir cliente existente</span>
            <span class="add-lead-choice-desc">Mover pra cá quem já está cadastrado em outra coluna ou funil</span>
          </button>
          <button type="button" class="add-lead-choice-btn" id="add-lead-choice-copiar">
            <span class="add-lead-choice-title">Copiar cliente existente</span>
            <span class="add-lead-choice-desc">Cria uma cópia aqui, mantendo o original intacto no outro lugar</span>
          </button>
        </div>
      </div>
    </div>
  `;
  document.getElementById('add-lead-choice-close').addEventListener('click', ()=>{ root.innerHTML=''; });
  document.getElementById('add-lead-choice-overlay').addEventListener('click', (e)=>{ if(e.target.id==='add-lead-choice-overlay') root.innerHTML=''; });
  document.getElementById('add-lead-choice-novo').addEventListener('click', ()=> openNewCard(colId));
  document.getElementById('add-lead-choice-transferir').addEventListener('click', ()=> abrirPickerLeadsParaColuna(colId, 'transferir'));
  document.getElementById('add-lead-choice-copiar').addEventListener('click', ()=> abrirPickerLeadsParaColuna(colId, 'copiar'));
}

/* ---------- modal: puxar leads existentes pra uma coluna (transferir ou copiar) ---------- */
function abrirPickerLeadsParaColuna(colId, modo){
  colunaLeadsPickerColId = colId;
  colunaLeadsPickerModo = modo || 'transferir';
  colunaLeadsSelecionados = new Set();
  renderColunaLeadsPickerModal();
}
function closeColunaLeadsPickerModal(){
  colunaLeadsPickerColId = null;
  document.getElementById('modal-root').innerHTML = '';
}
async function confirmarMoverLeadsParaColuna(){
  if(colunaLeadsSelecionados.size === 0){ closeColunaLeadsPickerModal(); return; }
  const colId = colunaLeadsPickerColId;
  const copiando = colunaLeadsPickerModo === 'copiar';
  colunaLeadsMovendo = true;
  renderColunaLeadsPickerModal();
  for(const cardId of Array.from(colunaLeadsSelecionados)){
    try{
      if(copiando){
        const original = board.cards.find(c=>c.id===cardId);
        if(!original) continue;
        const copia = await apiRequest('POST', '/cards', {
          columnId: colId, cliente: original.cliente, valor: original.valor,
          temperatura: original.temperatura, telefone: original.telefone,
          obs: original.obs, mes: original.mes, mesInicioContato: original.mesInicioContato,
        });
        board.cards.push(copia);
      } else {
        const atualizado = await apiRequest('PUT', `/cards/${cardId}/move`, { columnId: colId });
        const idx = board.cards.findIndex(c=>c.id===cardId);
        if(idx>-1) board.cards[idx] = atualizado;
      }
    }catch(e){ /* segue tentando os demais selecionados */ }
  }
  colunaLeadsMovendo = false;
  closeColunaLeadsPickerModal();
  renderApp();
}
function renderColunaLeadsPickerModal(){
  const root = document.getElementById('modal-root');
  if(!colunaLeadsPickerColId){ root.innerHTML=''; return; }
  const coluna = board.columns.find(c=>c.id===colunaLeadsPickerColId);
  const copiando = colunaLeadsPickerModo === 'copiar';
  const candidatos = copiando ? board.cards.slice() : board.cards.filter(c=>c.columnId !== colunaLeadsPickerColId);

  root.innerHTML = `
    <div class="overlay" id="cl-picker-overlay">
      <div class="modal modal-lg">
        <div class="modal-head">
          <h3>${copiando ? 'Copiar' : 'Transferir'} contatos pra "${esc(coluna?coluna.nome:'')}"</h3>
          <button id="cl-picker-close">✕</button>
        </div>
        <div class="modal-body">
          <p class="settings-page-note">${copiando
            ? 'Escolha quem você quer copiar pra essa coluna. O original continua intacto onde já está.'
            : 'Escolha quem você quer mover pra essa coluna agora. Dá pra pular e arrastar manualmente depois, se preferir.'}</p>
          <div class="settings-btn-row" style="margin-bottom:10px;">
            <button class="btn-outline" id="cl-selecionar-todos">Selecionar todos</button>
            <button class="btn-outline" id="cl-limpar-selecao">Limpar seleção</button>
          </div>
          <div class="disparo-lista-leads" style="max-height:320px;">
            ${candidatos.length ? candidatos.map(c=>{
              const colAtual = board.columns.find(k=>k.id===c.columnId);
              return `
                <label class="disparo-lead-item">
                  <input type="checkbox" class="cl-lead-checkbox" data-card-id="${c.id}" ${colunaLeadsSelecionados.has(c.id)?'checked':''} />
                  <span>${esc(c.cliente)||'Sem nome'} <span class="settings-page-note">${colAtual?esc(colAtual.nome):''}</span></span>
                </label>
              `;
            }).join('') : '<p class="dash-empty">Nenhum outro contato cadastrado ainda.</p>'}
          </div>
        </div>
        <div class="modal-foot">
          <span></span>
          <div class="modal-foot-actions">
            <button class="btn-outline" id="cl-pular">Pular por agora</button>
            <button class="btn-save" id="cl-confirmar" ${colunaLeadsMovendo?'disabled':''}>${colunaLeadsMovendo ? (copiando?'Copiando…':'Movendo…') : `${copiando?'Copiar':'Mover'} ${colunaLeadsSelecionados.size} contato(s)`}</button>
          </div>
        </div>
      </div>
    </div>
  `;

  document.getElementById('cl-picker-close').addEventListener('click', closeColunaLeadsPickerModal);
  document.getElementById('cl-pular').addEventListener('click', closeColunaLeadsPickerModal);
  document.getElementById('cl-picker-overlay').addEventListener('click', (e)=>{ if(e.target.id==='cl-picker-overlay') closeColunaLeadsPickerModal(); });
  document.getElementById('cl-selecionar-todos').addEventListener('click', ()=>{
    candidatos.forEach(c=>colunaLeadsSelecionados.add(c.id));
    renderColunaLeadsPickerModal();
  });
  document.getElementById('cl-limpar-selecao').addEventListener('click', ()=>{
    colunaLeadsSelecionados.clear();
    renderColunaLeadsPickerModal();
  });
  document.querySelectorAll('.cl-lead-checkbox').forEach(cb=>{
    cb.addEventListener('change', ()=>{
      if(cb.checked) colunaLeadsSelecionados.add(cb.dataset.cardId);
      else colunaLeadsSelecionados.delete(cb.dataset.cardId);
      renderColunaLeadsPickerModal();
    });
  });
  document.getElementById('cl-confirmar').addEventListener('click', confirmarMoverLeadsParaColuna);
}

function renderFluxoEtapaParams(etapa, idx){
  if(etapa.tipo === 'mensagem'){
    return `<p class="settings-page-note">Etapa de envio de WhatsApp: não está mais disponível e é pulada. Troque o tipo ou remova a etapa.</p>`;
  }
  if(etapa.tipo === 'tarefa'){
    return `
      <div class="field-row">
        <div class="field"><label>Título da tarefa</label><input type="text" class="fx-etapa-titulo" data-idx="${idx}" value="${esc((etapa.params&&etapa.params.titulo)||'')}" placeholder="Ex: Ligar pra confirmar" /></div>
        <div class="field"><label>Vencimento (dias)</label><input type="number" class="fx-etapa-dias-venc" data-idx="${idx}" value="${(etapa.params&&etapa.params.diasParaVencimento)||1}" min="1" /></div>
      </div>
    `;
  }
  return `
    <div class="field">
      <label>Coluna de destino</label>
      <select class="fx-etapa-coluna-destino" data-idx="${idx}">
        ${board.columns.map(c=>`<option value="${c.id}" ${(etapa.params&&etapa.params.colunaDestinoId)===c.id?'selected':''}>${esc(c.nome)}</option>`).join('')}
      </select>
    </div>
  `;
}
function renderFluxoEtapa(etapa, idx){
  return `
    <div class="fluxo-etapa-card">
      <div class="fluxo-etapa-head">
        <span class="fluxo-etapa-numero">${idx+1}</span>
        <div class="field fluxo-etapa-dias-field">
          <label>Dias após o início</label>
          <input type="number" class="fx-etapa-dias" data-idx="${idx}" value="${etapa.diasAposInicio}" min="0" />
        </div>
        <div class="field" style="flex:1;">
          <label>O que fazer</label>
          <select class="fx-etapa-tipo" data-idx="${idx}">
            ${etapa.tipo==='mensagem' ? `<option value="mensagem" selected disabled>Enviar WhatsApp (indisponível)</option>` : ''}
            <option value="tarefa" ${etapa.tipo==='tarefa'?'selected':''}>Criar tarefa</option>
            <option value="mover_coluna" ${etapa.tipo==='mover_coluna'?'selected':''}>Mover pra outra coluna</option>
          </select>
        </div>
        <button type="button" class="icon-btn fx-etapa-remover" data-idx="${idx}" title="Remover etapa">${ICON_TRASH}</button>
      </div>
      ${renderFluxoEtapaParams(etapa, idx)}
    </div>
  `;
}

function bindFluxoModalEvents(){
  document.getElementById('fluxo-modal-close').addEventListener('click', closeFluxoModal);
  document.getElementById('fx-cancel').addEventListener('click', closeFluxoModal);
  document.getElementById('fluxo-modal-overlay').addEventListener('click', (e)=>{ if(e.target.id==='fluxo-modal-overlay') closeFluxoModal(); });

  document.getElementById('fx-nome').addEventListener('input', (e)=> fluxoModalForm.nome = e.target.value);
  document.getElementById('fx-coluna-gatilho').addEventListener('change', (e)=> fluxoModalForm.colunaGatilhoId = e.target.value);

  document.getElementById('fx-add-etapa').addEventListener('click', ()=>{
    fluxoModalForm.etapas.push({ diasAposInicio:1, tipo:'tarefa', params:{ titulo:'', diasParaVencimento:1 } });
    renderFluxoModal();
  });
  document.querySelectorAll('.fx-etapa-remover').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      fluxoModalForm.etapas.splice(parseInt(btn.dataset.idx,10),1);
      renderFluxoModal();
    });
  });
  document.querySelectorAll('.fx-etapa-dias').forEach(el=>{
    el.addEventListener('input', (e)=>{ fluxoModalForm.etapas[parseInt(el.dataset.idx,10)].diasAposInicio = parseInt(e.target.value,10)||0; });
  });
  document.querySelectorAll('.fx-etapa-tipo').forEach(el=>{
    el.addEventListener('change', (e)=>{
      const idx = parseInt(el.dataset.idx,10);
      fluxoModalForm.etapas[idx].tipo = e.target.value;
      fluxoModalForm.etapas[idx].params = {};
      renderFluxoModal();
    });
  });
  document.querySelectorAll('.fx-etapa-texto').forEach(el=>{
    el.addEventListener('input', (e)=>{
      const idx = parseInt(el.dataset.idx,10);
      fluxoModalForm.etapas[idx].params.texto = e.target.value;
    });
  });
  document.querySelectorAll('.fx-etapa-titulo').forEach(el=>{
    el.addEventListener('input', (e)=>{
      const idx = parseInt(el.dataset.idx,10);
      fluxoModalForm.etapas[idx].params.titulo = e.target.value;
    });
  });
  document.querySelectorAll('.fx-etapa-dias-venc').forEach(el=>{
    el.addEventListener('input', (e)=>{
      const idx = parseInt(el.dataset.idx,10);
      fluxoModalForm.etapas[idx].params.diasParaVencimento = parseInt(e.target.value,10)||1;
    });
  });
  document.querySelectorAll('.fx-etapa-coluna-destino').forEach(el=>{
    el.addEventListener('change', (e)=>{
      const idx = parseInt(el.dataset.idx,10);
      fluxoModalForm.etapas[idx].params.colunaDestinoId = e.target.value;
    });
  });

  document.getElementById('fx-save').addEventListener('click', ()=>{
    salvarFluxo();
  });
  if(!fluxoModalForm.__isNew){
    document.getElementById('fx-delete').addEventListener('click', ()=>{
      showConfirm({ chave:'sequencia',
        message: 'Excluir esta sequência? As que estão em andamento para clientes atuais são interrompidas.',
        onConfirm: ()=>{ excluirFluxo(fluxoModalForm.id); closeFluxoModal(); closeConfirm(); },
      });
    });
  }
}

function renderFluxoModal(){
  const root = document.getElementById('modal-root');
  if(!fluxoModalForm){ root.innerHTML=''; return; }
  const f = fluxoModalForm;

  root.innerHTML = `
    <div class="overlay" id="fluxo-modal-overlay">
      <div class="modal modal-lg">
        <div class="modal-head">
          <h3>${f.__isNew ? 'Nova sequência' : 'Editar sequência'}</h3>
          <button id="fluxo-modal-close">✕</button>
        </div>
        <div class="modal-body">
          <div class="field">
            <label>Nome</label>
            <input type="text" id="fx-nome" value="${esc(f.nome)}" placeholder="Ex: Sequência de boas-vindas" />
          </div>
          <div class="field">
            <label>Começa quando o cliente entra nesta coluna</label>
            <select id="fx-coluna-gatilho">
              ${board.columns.map(c=>`<option value="${c.id}" ${f.colunaGatilhoId===c.id?'selected':''}>${esc(c.nome)}</option>`).join('')}
            </select>
          </div>
          <div class="fluxo-etapas-lista">
            ${f.etapas.map((etapa, idx)=>renderFluxoEtapa(etapa, idx)).join('')}
          </div>
          <button type="button" class="btn-outline" id="fx-add-etapa">+ Adicionar etapa</button>
        </div>
        <div class="modal-foot">
          ${!f.__isNew ? `<button class="delete-link" id="fx-delete">🗑 Excluir</button>` : '<span></span>'}
          <div class="modal-foot-actions">
            <button class="btn-outline" id="fx-cancel">Cancelar</button>
            <button class="btn-save" id="fx-save">Salvar</button>
          </div>
        </div>
      </div>
    </div>
  `;
  bindFluxoModalEvents();
}

/* ---------- confirmação genérica ---------- */
function showConfirm({ message, onConfirm, confirmLabel, cancelLabel, danger, chave }){
  // chave = dá pra marcar "Não perguntar de novo" (só nas coisas que não são importantes; sem chave, pergunta sempre)
  if(chave && window.Confirmacao && Confirmacao.pulada(chave)){ onConfirm(); return; }
  confirmState = { message, onConfirm };
  const root = document.getElementById('confirm-root');
  const anterior = document.activeElement;
  const rotuloConfirmar = confirmLabel || 'Excluir'; // "Excluir" continua sendo o padrão, pra não quebrar quem já chama sem passar isso
  const rotuloCancelar = cancelLabel || 'Cancelar';
  const classeConfirmar = danger===false ? 'btn-primary' : 'btn-danger';
  root.innerHTML = `
    <div class="overlay" id="confirm-overlay" style="z-index:90">
      <div class="confirm-box" role="alertdialog" aria-modal="true" aria-describedby="confirm-msg">
        <p id="confirm-msg">${esc(message)}</p>
        ${chave && window.Confirmacao ? `<label class="confirm-pular"><input type="checkbox" id="confirm-pular" /> <span>Não perguntar de novo para isto</span></label>` : ''}
        <div class="confirm-actions">
          <button class="btn-outline" id="confirm-cancel">${esc(rotuloCancelar)}</button>
          <button class="${classeConfirmar}" id="confirm-ok">${esc(rotuloConfirmar)}</button>
        </div>
      </div>
    </div>
  `;
  const fecharComTecla = (e)=>{ if(e.key==='Escape'){ e.stopPropagation(); closeConfirm(); } };
  document.addEventListener('keydown', fecharComTecla, true);
  confirmState.soltar = ()=>{ document.removeEventListener('keydown', fecharComTecla, true); if(anterior && anterior.focus && document.contains(anterior)) try{ anterior.focus(); }catch(e){} };
  document.getElementById('confirm-cancel').addEventListener('click', closeConfirm);
  document.getElementById('confirm-overlay').addEventListener('click', (e)=>{ if(e.target.id==='confirm-overlay') closeConfirm(); });
  document.getElementById('confirm-ok').addEventListener('click', ()=>{
    const pular = document.getElementById('confirm-pular');
    if(chave && pular && pular.checked) Confirmacao.pular(chave);
    const st = confirmState; if(st && st.soltar) st.soltar();
    st.onConfirm();
  });
  document.getElementById('confirm-cancel').focus(); // o padrão é não apagar
}
function closeConfirm(){ if(confirmState && confirmState.soltar) confirmState.soltar(); confirmState = null; document.getElementById('confirm-root').innerHTML=''; }

/* ---------- start ---------- */
/* Equipe: o que cada função vê no CRM (o servidor confere tudo; aqui só some da tela) */
// var: as telas podem desenhar antes desta linha rodar. Começa com o acesso guardado neste aparelho
// (equipe), para o menu já abrir só com o que a função permite; o servidor confere de novo logo depois.
var acessoCrm = (function(){ const g = window.Acesso && Acesso.guardada && Acesso.guardada(); return g ? { tipo:g.tipo, permissoes:g.permissoes || {}, gestor:!!g.gestor } : { tipo:'dono', permissoes:{}, gestor:true }; })();
const PERM_DA_PAGINA = { comissoes:'comissoes', automacoes:'config', fluxos:'config', 'import-export':'config', equipe:'config' };
function podeNaPagina(pg){ if(!acessoCrm || acessoCrm.tipo === 'dono') return true; const k = PERM_DA_PAGINA[pg] || 'crm'; return !!acessoCrm.permissoes[k]; }
function aplicarFuncaoNaTela(){
  if(!acessoCrm || acessoCrm.tipo === 'dono') return;
  document.querySelectorAll('[data-action="nav"][data-page]').forEach((el)=>{ const pg = el.dataset.page; if(pg !== 'configuracoes' && pg !== 'suporte' && !podeNaPagina(pg)) el.remove(); });
  document.querySelectorAll('.nav-mais').forEach((g)=>{ if(!g.querySelector('[data-page]')) g.remove(); });
  const r = document.querySelector('[data-action="abrir-reordenar-nav"]'); if(r) r.remove();
}
new MutationObserver(()=> aplicarFuncaoNaTela()).observe(document.body, { childList:true, subtree:true });
aplicarFuncaoNaTela();

async function iniciarCrm(){
  if(window.Acesso){
    if(!(await Acesso.exigirApp('crm', 'o CRM'))) return;
    const i = await Acesso.info();
    acessoCrm = { tipo:i.tipo, permissoes:i.permissoes || {}, gestor:!!i.gestor };
    if(i.tipo !== 'dono'){
      if(!podeNaPagina(currentPage)) currentPage = 'pipeline';
      if(!acessoCrm.gestor && configCategoriaAtiva !== 'aparencia') configCategoriaAtiva = 'aparencia';
    }
  }
  const p = acessoCrm.tipo === 'dono' ? null : acessoCrm.permissoes;
  const pode = (k)=> !p || !!p[k];
  if(window.AssistenteIA && pode('financeiro')) AssistenteIA.iniciar({
    contexto:'crm',
    // carrossel de perguntas prontas, embaixo da conversa
    sugestoes: [
      { texto:'Como está meu funil?', pergunta:'Como está meu funil de vendas agora?' },
      { texto:'Tarefas atrasadas', pergunta:'Quais tarefas estão atrasadas ou vencem hoje?' },
      { texto:'Comissões do mês', pergunta:'Quanto vou receber de comissão este mês?' },
      { texto:'Buscar um cliente', preencher:'Me mostra os dados do cliente ' },
      { texto:'Criar uma sequência', pergunta:'Como eu crio uma sequência automática?' },
      { texto:'Importar planilha', pergunta:'Como importo meus contatos de uma planilha?' },
      { texto:'Ver meu lucro', pergunta:'Qual foi meu lucro este mês no Controle financeiro?' },
    ],
    // sininho do painel: as mesmas notificações do sino do topo
    alertas: ()=> computarNotificacoes().slice(0, 20).map(n=>({
      tipo:'info',
      texto:n.texto,
      acao: n.cardId ? ()=> openEditCard(n.cardId) : null,
    })),
  });
  tratarRetornoDoGoogle();
  loadBoard();
  loadFunis();
  loadTasks();
  if(pode('config')) loadCalendarStatus();
  if(pode('comissoes')){ loadContratos(); loadRegrasComissao(); }
  loadIntegracoesConfig();
  loadCamposPersonalizados();
  loadPossiveisLeads();
  loadMetaVendas();
  loadMetaVendasEquipe();
  if(!agendaLoaded) loadAgendaMes(agendaMesAtual); // carrega em segundo plano — o Dashboard também usa eventos do Google em "Tarefas abertas"
  if(pode('config')){ loadEquipe(); loadWebhooksSaida(); }
  loadAutomacoes();
  loadFluxos();
}
if(getToken()) iniciarCrm();
