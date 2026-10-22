/* ================================================================
   Painel do Consórcio — front-end
   Estrutura com barra lateral (Dashboard / Pipeline / Leads / Tarefas),
   inspirada no CRM Foco, mantendo tudo que já existia (MongoDB via
   API REST, modo noturno, cor de destaque, WhatsApp, arraste de cards).
================================================================ */

const API_BASE = '/api';

/* ---------- PWA: registra o service worker (instalável no celular) ---------- */
if('serviceWorker' in navigator){
  window.addEventListener('load', ()=>{
    navigator.serviceWorker.register('/sw.js').catch(()=>{ /* sem problema, o app funciona normal sem isso */ });
  });
}

/* ---------- helpers ---------- */
// data de hoje no fuso do aparelho (AAAA-MM-DD); toISOString() usaria UTC e viraria o dia à noite
// em equipe, só o gestor exclui leads (o servidor também confere)
function podeExcluirLeads(){ return !(typeof equipe !== 'undefined' && equipe && !equipe.souSupervisor); }
// versão administrativa (recrutamento), aberta em /adm: mesmo painel, com vocabulário e funil de contratação
function perfilRH(){ try{ return !!(currentUser && currentUser.perfil === 'rh'); }catch(e){ return false; } }
function hojeLocalISO(){
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
const fmtBRL = (n) => new Intl.NumberFormat('pt-BR', { style:'currency', currency:'BRL', minimumFractionDigits:2, maximumFractionDigits:2 }).format(n || 0);
const MESES_ABREV = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
const MESES_CHEIO = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const currentMonthKey = () => { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; };
// Acha a segunda-feira da semana de uma data, no formato "YYYY-MM-DD" — usado como
// identificador de cada semana do GEROT.
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
const ICON_CONVERSAS = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`;
const ICON_DISPAROS = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`;
const ICON_RELATORIOS = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>`;
const ICON_SUPORTE = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;
const ICON_CHAT_INTERNO = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>`;
const ICON_SUPERVISAO = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z"/><circle cx="12" cy="12" r="3"/></svg>`;
const ICON_AUTOMACOES = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`;
const ICON_FLUXOS = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="5" cy="6" r="2"/><circle cx="5" cy="18" r="2"/><circle cx="19" cy="12" r="2"/><path d="M5 8v8"/><path d="M7 6h6a4 4 0 0 1 4 4"/><path d="M7 18h6a4 4 0 0 0 4-4"/></svg>`;
const ICON_AGENDAMENTOS = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M12 14v3l2 1"/></svg>`;
const ICON_IMPORT_EXPORT = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 17l-4-4 4-4"/><path d="M4 13h11a4 4 0 0 0 4-4V7"/><path d="M16 7l4 4-4 4"/><path d="M20 11H9a4 4 0 0 0-4 4v2"/></svg>`;
const ICON_LOGOUT = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>`;
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
document.title = 'Painel CRM';

/* ---------- sessão / login ---------- */
function getToken(){ return localStorage.getItem('token'); }
function getCurrentUser(){
  try{ return JSON.parse(localStorage.getItem('user') || 'null'); }
  catch(e){ return null; }
}
function logout(){
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
let assistenteBolhaX = null; // null = fica na posição padrão (canto inferior direito) até a pessoa arrastar
let assistenteBolhaY = null;
let assistenteAberto = false;
let assistenteMensagens = [];
let assistenteEnviando = false;
let assistenteAnimando = null; // 'abrindo' | 'fechando' | null — só anima na abertura/fechamento, não a cada re-render
let assistenteEditandoNome = false;
const ASSISTENTE_NOME_PADRAO = 'Assistente do CRM';
let assistenteNome = ASSISTENTE_NOME_PADRAO;
try{ assistenteNome = (localStorage.getItem('assistente-nome')||'').trim().slice(0,30) || ASSISTENTE_NOME_PADRAO; }catch(err){}
let assistenteDrag = null; // { startX, startY, bolhaXInicial, bolhaYInicial, moveu, pointerId }
try{
  const posSalva = JSON.parse(localStorage.getItem('assistente-bolha-pos')||'null');
  if(posSalva && typeof posSalva.x==='number' && typeof posSalva.y==='number'){
    assistenteBolhaX = posSalva.x; assistenteBolhaY = posSalva.y;
  }
}catch(e){}
let menuDiaAberto = null; // { diaISO, x, y } — dia com o menu de copiar/mover aberto, ou null
let checklistDiaModal = null; // { diaISO, modo, marcados:Set } — telinha de escolher quais itens do dia entram na cópia/mover
let longPressDisparou = false; // marca que o menu já abriu pelo toque, pra ignorar o "click" fantasma que o touch dispara em seguida
let calendarConnected = false;
let calendarSyncing = false;
// Integrações que dependem de credenciais do servidor (não do usuário) — otimista por
// padrão (tudo true) até a checagem real chegar, pra nunca esconder nada à toa por causa
// de uma resposta lenta. Ver server/routes/config.js.
let integracoesConfig = { googleAgenda:true, assistenteIA:true, whatsappWebhook:true, instagramWebhook:true, telegramAlerta:true, emailRecuperacao:false, push:false };
let icsStatus = null; // { ativo, url } — link de agenda (.ics), alternativa ao Google Agenda
let icsCarregando = false;
let icsGerando = false;
let whatsappConnected = false;
let whatsappSalvando = false;
let whatsappConfigMsg = null;
let whatsappProvedor = 'meta'; // provedor ativo do usuário (vem do servidor)
let whatsappProvedorEscolhido = 'meta'; // escolha no formulário de conexão
let whatsappYcloudWebhookPath = null;
let whatsappYcloudSecretOk = false;
let agenteIaAtivo = false;
let iaProativaAtiva = false;
let agendamentos = [];
let agendamentosContagem = { pendente:0, enviada:0, cancelada:0, falhou:0 };
let agendamentosLoaded = false;
let agendamentoModalForm = null;
let agendamentoSalvando = false;
let agendamentoMsg = null;
let menuTriagem = { ativo:false, mensagemInicial:'', opcoes:[] };
let menuTriagemCarregado = false;
let menuTriagemSalvando = false;
let menuTriagemMsg = null;
let instagramConnected = false;
let instagramSalvando = false;
let instagramConfigMsg = null;
let conversas = [];
let conversasLoaded = false;
let conversaSelecionadaCardId = null;
let conversaMensagens = [];
let conversaMensagensLoaded = false;
let conversaTexto = '';
let conversaEnviando = false;
let conversaBusca = '';
let conversasOverlay = null; // null | 'automacoes' | 'disparos' | 'agendamentos'
let conversaPollingTimer = null;
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
  'lead.criado': 'Novo lead criado',
  'lead.movido': 'Lead mudou de coluna',
  'lead.ganho': 'Lead marcado como ganho',
  'mensagem.recebida': 'Mensagem recebida no WhatsApp',
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
let possiveisSelecionados = new Set(); // ids marcados na lista de possíveis leads
let possiveisDestinoId = ''; // gestor: pra quem vão os leads ('' = pra mim)
let possiveisPassandoLote = false;
let possiveisLoteMsg = null;
let importPlanilhaLinhas = [];
let importPlanilhaColunas = [];
let importPlanilhaNomeArquivo = '';
let importPainelAbrindo = false; // true só no render em que o painel da planilha ainda está fechado, pra animar a descida
let importPainelFechando = false;
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
let disparoFiltroColuna = '';
let disparoFiltroTemp = '';
let disparoSelecionados = new Set();
let disparoTexto = '';
let disparoEnviando = false;
let disparoResultado = null;
let disparoUsarTemplate = false;
let disparoTemplateNome = '';
let disparoTemplateIdioma = 'pt_BR';
let disparoTemplateVariaveis = '';
let disparoTemplatesDisponiveis = [];
let templatesList = [];
let templatesCarregados = false;
let templatesSincronizando = false;
let templatesMsg = null;
let templateModalForm = null;
let templateSalvando = false;
let templateMsg = null;
let funis = [];
let funisLoaded = false;
let funilAtualId = null;
let editingFunilId = null;
let editingFunilName = '';
let relatorioFunilId = '';
let equipe = null;
let equipeLoaded = false;
let convitesRecebidos = []; // convites que chegaram pro e-mail de quem ainda não tem equipe
let conviteEmailNovo = '';
let equipeNomeNovo = '';
let equipeCodigoEntrar = '';
let equipeMsg = null;
let equipeSubTab = 'chat';
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
let preenchendoMesInicioContato = false;
let mesInicioContatoMsg = null;
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
let insightsCarregando = false;
let insightsPipelineExpandido = false;
let modalForm = null;            // objeto do cliente sendo editado/criado
let escolhaTipoPessoaColId = null; // coluna escolhida ao criar lead novo, enquanto a telinha de física/jurídica está aberta
let tipoPessoaDropdownAberto = false; // dropdown de física/jurídica, dentro do modal do lead
let taskModalForm = null;        // objeto da tarefa sendo editada/criada
let eventoGoogleModalForm = null; // { eventId, titulo, data, hora } — edita o evento direto na fonte, no Google
let confirmState = null;         // { message, onConfirm }

