// Versão da Graph API da Meta (WhatsApp, Instagram, Facebook) usada em TODAS as chamadas do painel.
// Fica num lugar só: quando a Meta aposentar uma versão (a cada ~2 anos), basta trocar aqui —
// ou, sem mexer em código, definir META_GRAPH_VERSION no Render (ex: v23.0).
// Importante: a Meta, quando uma versão vence, NÃO dá erro — ela redireciona em silêncio pra
// próxima versão disponível, o que pode mudar o comportamento sem aviso. Por isso vale revisar
// essa versão uma vez por ano (https://developers.facebook.com/docs/graph-api/changelog/versions).
const GRAPH_VERSION = process.env.META_GRAPH_VERSION || 'v22.0';
const GRAPH_API = `https://graph.facebook.com/${GRAPH_VERSION}`;

module.exports = { GRAPH_VERSION, GRAPH_API };
