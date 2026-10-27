# CRM em partes

O antigo `js/script.js` (10 mil linhas) foi dividido nestes arquivos, carregados **nesta ordem** pelo `index.html`:

- `01-base.js` — ajudantes, ícones, tema, sessão e todo o estado da tela
- `02-api.js` — conversa com o servidor e carregamento inicial
- `03-funis-agenda.js` — funis, Google Agenda, agenda por link e proposta em PDF
- `04-equipe-modulos.js` — equipe, automações, fluxos, importar/exportar, campos e histórico
- `05-derivacoes.js` — relatórios, contas do pipeline/dashboard/comissões/contatos e duplicados
- `06-navegacao.js` — troca de página (goToPage)
- `07-mutacoes.js` — salvar colunas, contatos, tarefas, comissões, 2FA e senha
- `08-busca-ia.js` — busca global e assistente
- `09-shell.js` — barra lateral, barra de baixo e moldura das páginas
- `10-paginas-crm.js` — Visão geral, Negociações, Contatos, Agenda e Comissões
- `11-configuracoes.js` — Configurações, notificações e e-mails
- `14-eventos.js` — bindAppEvents (todos os cliques e campos)
- `15-modais.js` — ficha do contato, tarefa, perfil e e-mail
- `16-paginas-equipe.js` — Relatórios, Equipes/Gestão, Chat, Automações, Fluxos, Importar, Suporte
- `17-modais-extras.js` — contrato, regras de comissão, automação, fluxo e transferências
- `19-iniciar.js` — confirmação genérica e início (iniciarCrm)

Todos compartilham as mesmas variáveis e funções globais. Regras:

1. Código que roda na hora de carregar (fora de funções) só pode usar o que foi definido no mesmo arquivo ou nos anteriores.
2. Não declare o mesmo nome (`let`, `const`, `function`) em dois arquivos.
3. `bash scripts/verificar.sh` confere as duas coisas.
