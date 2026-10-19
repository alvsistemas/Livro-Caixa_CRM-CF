# Livro-Caixa — como publicar do zero (GitHub → Neon → Render)

Passo a passo para colocar o Livro-Caixa no ar usando um **e-mail novo**. Siga na ordem: cada etapa usa algo da anterior. O banco de dados é PostgreSQL, no Neon.

Tempo estimado: 40 a 60 minutos na primeira vez.

## Antes de começar

Tenha em mãos:

- O **e-mail novo**, já criado e aberto em outra aba (vários serviços mandam código de confirmação).
- O arquivo **`livro-caixa.zip`**, descompactado numa pasta do computador (ex.: `Documentos/livro-caixa`).
- O **VS Code** e o **Git** instalados. Para conferir se o Git existe, abra o terminal do VS Code (menu *Terminal → Novo terminal*) e digite `git --version`. Se der erro, instale em https://git-scm.com.
- Um bloco de notas para ir guardando senhas e endereços. **Não** salve esse bloco dentro da pasta do projeto.

> Importante: o arquivo `.env` (com senhas) **nunca** vai para o GitHub. No servidor, as senhas ficam nas *variáveis de ambiente* do Render (passo 4).

---

## 1. GitHub — onde o código fica guardado

1. Acesse https://github.com/signup e crie a conta com o e-mail novo. Confirme o código que chega no e-mail.
2. Ative a verificação em duas etapas quando o GitHub pedir (é obrigatória). Guarde os códigos de recuperação.
3. Clique no **+** (canto superior direito) → **New repository**.
   - **Repository name:** `livro-caixa`
   - Marque **Private** (assim ninguém vê seu código).
   - **Não** marque "Add a README", nem .gitignore, nem licença (o projeto já tem).
   - Clique em **Create repository** e deixe essa página aberta.

## 2. Enviar o código para o GitHub

No VS Code, abra a pasta do projeto descompactado (*Arquivo → Abrir pasta*). Ela precisa ter dentro as pastas `public`, `server`, `scripts` e o arquivo `README.md`.

Abra o terminal (*Terminal → Novo terminal*) e rode, **um comando por vez**, trocando os dados pelos seus:

```bash
git config --global user.name "Seu Nome"
git config --global user.email "seu-email-novo@exemplo.com"

git init
git add .
git commit -m "Primeira versão do Livro-Caixa"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO-NOVO/livro-caixa.git
git push -u origin main
```

No `git push`, vai abrir uma janela pedindo login no GitHub: entre com a **conta nova**.

**Se aparecer erro 403 ou "Permission denied"**, o computador está usando a conta antiga que ficou salva:

- **Windows:** abra o *Gerenciador de Credenciais* (pesquise no menu Iniciar) → *Credenciais do Windows* → apague a que começa com `git:https://github.com`. Rode o `git push -u origin main` de novo.
- **Mac:** abra o *Acesso às Chaves*, procure `github.com`, apague e tente de novo.

Atualize a página do repositório no GitHub: as pastas `public`, `server` etc. devem aparecer. Confira que **não** existe nenhum arquivo `.env` na lista, só o `.env.example`.

## 3. Neon — o banco de dados (PostgreSQL)

O resultado desta etapa é o endereço de conexão do banco, o **DATABASE_URL**. As tabelas não precisam ser criadas à mão: o servidor cria tudo sozinho na primeira vez que sobe.

1. Acesse https://console.neon.tech/signup e crie a conta com o e-mail novo (dá pra entrar com a conta nova do GitHub).
2. Crie o projeto:
   - **Project name:** `livro-caixa`
   - **Postgres version:** a mais nova oferecida (17)
   - **Region:** **AWS US East 1 (N. Virginia)** — a mesma região do servidor no Render. Banco e servidor perto um do outro deixam o sistema bem mais rápido do que um banco em São Paulo com o servidor nos EUA.
   - **Database name:** pode deixar `neondb`.
   - Clique em **Create project**.
3. No painel do projeto, clique em **Connect**. Na janela:
   - **Branch:** `production` (ou `main`), **Database:** `neondb`, **Role:** `neondb_owner`;
   - deixe **Connection pooling** ligado;
   - clique em **Show password** e copie o texto que começa com `postgresql://`.
4. Guarde no bloco de notas. Fica parecido com:

   ```
   postgresql://neondb_owner:AbC123xyz@ep-nome-123456-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require
   ```

   Esse é o seu **DATABASE_URL**.

Não precisa liberar IP nem criar usuário: o Neon já aceita conexões com SSL de qualquer lugar, protegidas pela senha. No plano grátis, o banco "dorme" depois de 5 minutos sem uso e acorda sozinho na próxima consulta (leva menos de 1 segundo).

**Se quiser testar a conexão antes do Render** (opcional, precisa do Node instalado): na pasta `server`, crie um arquivo `.env` com a linha `DATABASE_URL=...` e rode `npm install` e depois `node db/migrar.js`. Deve aparecer `Migração aplicada: 001_inicial.sql`, `002_papel_da_aplicacao.sql` e `Banco atualizado.`.

## 4. Render — o servidor

1. Acesse https://dashboard.render.com/register e clique em **GitHub** para entrar com a **conta nova do GitHub**.
2. Clique em **+ New** → **Web Service**.
3. Em *Git Provider*, clique em **GitHub** → **Configure account**. Na tela do GitHub, escolha **Only select repositories**, selecione `livro-caixa` e clique em **Install**. De volta ao Render, clique no repositório `livro-caixa`.
4. Preencha a configuração:

   | Campo | O que colocar |
   |---|---|
   | **Name** | `livro-caixa` (vira o endereço `livro-caixa.onrender.com`; se o nome já existir, o Render acrescenta letras no final) |
   | **Language** | Node |
   | **Branch** | `main` |
   | **Region** | Virginia (US East), a mais próxima do Brasil |
   | **Root Directory** | **deixe em branco** |
   | **Build Command** | `cd server && npm install` |
   | **Start Command** | `cd server && npm start` |
   | **Instance Type** | Free |

5. Ainda nessa tela, em **Environment Variables**, adicione as duas obrigatórias:

   | Nome | Valor |
   |---|---|
   | `DATABASE_URL` | o endereço copiado na etapa 3 |
   | `JWT_SECRET` | clique em **Generate** (o Render cria um texto aleatório) |

6. Clique em **Deploy Web Service**. Acompanhe os *Logs*: em 2 a 5 minutos devem aparecer as linhas `Migração aplicada: ...`, `Conectado ao PostgreSQL.` e `Servidor rodando…`.
7. Copie o endereço que aparece no topo da página (ex.: `https://livro-caixa.onrender.com`). Vá em **Environment** → **Add Environment Variable** e crie:

   | Nome | Valor |
   |---|---|
   | `APP_URL` | o endereço do seu site, **sem barra no final** |

   Clique em **Save, rebuild, and deploy**.
8. Teste: abra o endereço, clique em **Criar conta**, entre e escolha **CRM** ou **Controle financeiro**.

> Plano grátis: o servidor "dorme" depois de 15 minutos sem acesso, e o primeiro acesso seguinte demora até 1 minuto. Para clientes pagantes, troque para o plano **Starter** em *Settings → Instance Type*.

## 5. Recursos opcionais (ligue quando quiser)

O sistema funciona sem nenhum destes itens: o que não estiver configurado some da tela. Cada um é uma variável nova em **Render → Environment**. Depois de salvar, o Render publica de novo sozinho.

### 5.1 Entrar com Google + Google Agenda

1. Acesse https://console.cloud.google.com com o e-mail novo e crie um projeto chamado `Livro-Caixa`.
2. Ative a API: **APIs e serviços → Biblioteca** → procure **Google Calendar API** → **Ativar**.
3. Configure a tela de consentimento: **APIs e serviços → Tela de permissão OAuth** (ou *Google Auth Platform*). Tipo **Externo**, nome `Livro-Caixa`, seu e-mail de suporte. Em **Usuários de teste**, adicione os e-mails que vão usar enquanto o app estiver em teste.
4. Crie a credencial: **Credenciais → Criar credenciais → ID do cliente OAuth** → tipo **Aplicativo da Web**.
   - **Origens JavaScript autorizadas:** `https://livro-caixa.onrender.com` (o seu endereço)
   - **URIs de redirecionamento autorizados:** `https://livro-caixa.onrender.com/api/calendar/callback`
5. Copie os dois códigos para o Render:
   - `GOOGLE_CLIENT_ID` (termina em `.apps.googleusercontent.com`)
   - `GOOGLE_CLIENT_SECRET`

Enquanto o projeto estiver em modo "Teste", só os usuários de teste conseguem entrar com Google, e a conexão com a Agenda expira a cada 7 dias. Para liberar a todos, publique o app na mesma tela (o Google pode pedir uma verificação).

### 5.2 Inteligência artificial (grátis com o Gemini)

1. Acesse https://aistudio.google.com/apikey e clique em **Create API key**.
2. No Render, crie `GEMINI_API_KEY` com essa chave.

### 5.3 E-mail ("Esqueci minha senha" e backup semanal)

1. Crie a conta em https://resend.com com o e-mail novo.
2. Para mandar e-mail a qualquer pessoa, o Resend exige um **domínio próprio** verificado (ex.: `livrocaixa.com.br`, comprado no Registro.br). Em **Domains → Add Domain**, siga as instruções de DNS.
3. Em **API Keys → Create API Key**, copie a chave.
4. No Render, crie:
   - `RESEND_API_KEY` = a chave
   - `EMAIL_FROM` = `Livro-Caixa <nao-responda@seudominio.com.br>`

### 5.4 Notificações no celular (push)

1. No terminal do VS Code, rode: `npx web-push generate-vapid-keys`
2. No Render, crie:
   - `VAPID_PUBLIC_KEY` e `VAPID_PRIVATE_KEY`, com as duas chaves geradas
   - `VAPID_SUBJECT` = `mailto:seu-email-novo@exemplo.com`

### 5.5 Alerta de queda do servidor no Telegram

Siga o passo a passo no início do arquivo `server/utils/telegramAlerta.js` e crie `TELEGRAM_BOT_TOKEN` e `TELEGRAM_CHAT_ID`.

### 5.6 WhatsApp (YCloud, Twilio ou Meta)

Não tem variável no Render: cada usuário conecta o próprio WhatsApp dentro do CRM, em **Configurações → Integrações**. Como o endereço do site mudou, cadastre na YCloud o **endereço de webhook novo** que o CRM mostra nessa tela.

### 5.7 Assinatura paga (Asaas)
Siga o tutorial "Assinatura com o Asaas": primeiro no sandbox (dinheiro de mentira), depois em
produção. Resumo das variáveis no Render: `ASAAS_API_KEY`, `ASAAS_AMBIENTE`, `ASAAS_WEBHOOK_TOKEN`,
`ASSINATURA_LIBERADOS` (seu e-mail). Sem `ASAAS_API_KEY`, tudo continua liberado.

### 5.8 Painel do dono
No Render, crie `DONOS_EMAILS` com o e-mail que você usa para entrar no Livro-Caixa. Depois disso,
aparece "Painel do dono" na tela inicial. Outros donos você adiciona no próprio painel.

## 6. Depois que estiver no ar

- **Página de divulgação:** no `index.html` da pasta `pagina-divulgacao`, troque `SEU-APP.onrender.com` pelo seu endereço (links de Privacidade e Termos no rodapé).
- **Privacidade e Termos:** em `public/privacidade.html` e `public/termos.html`, troque `SEU-EMAIL-DE-CONTATO-AQUI` pelo seu e-mail de contato.
- **Trazer os dados do CRM antigo (opcional):** no CRM antigo, vá em *Configurações → Manutenção → Backup → Exportar*. No Livro-Caixa, use *Importar* na mesma tela. Os clientes, comissões e regras antigas entram na conta nova.

## 7. Como publicar atualizações

Sempre que alterar o código:

```bash
bash scripts/gerar-pacote.sh   # opcional: roda as checagens e atualiza o ?v= (cache)
git add .
git commit -m "Descreva a mudança"
git push
```

O Render percebe o `git push` e publica sozinho em poucos minutos (acompanhe em *Events* e *Logs*).

## Checklist final

- [ ] Repositório `livro-caixa` privado no GitHub, sem arquivo `.env`
- [ ] Projeto no Neon na região US East 1, com o `DATABASE_URL` copiado
- [ ] Web Service no Render com `DATABASE_URL`, `JWT_SECRET` e `APP_URL`
- [ ] Conta criada no site e os dois aplicativos abrindo
- [ ] (Opcional) Google, Gemini, Resend, push e Telegram configurados
- [ ] Endereço novo trocado na página de divulgação e e-mail nos Termos e na Privacidade
