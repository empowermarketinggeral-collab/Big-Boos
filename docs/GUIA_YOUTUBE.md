# Guia — Ligar o YouTube

Passa pela Google Cloud, não pelo YouTube diretamente. Só serve para publicar **vídeo** (o YouTube não tem posts de imagem/texto). No final vais ter 2 valores para me dares: **YouTube Channel ID** e um **token de acesso**.

---

## 1. Criar um projeto na Google Cloud

1. Vai a **console.cloud.google.com** e cria um projeto novo (ex: `Empower OS`).
2. No menu, vai a **APIs & Services → Library**, procura **"YouTube Data API v3"** e clica em **"Enable"**.

---

## 2. Configurar o ecrã de consentimento OAuth

1. Em **APIs & Services → OAuth consent screen**, escolhe **"External"**.
2. Preenche nome da app, email de contacto.
3. Em **Scopes**, adiciona: `https://www.googleapis.com/auth/youtube.upload`.
4. Enquanto o app estiver em modo **"Testing"** (não publicado/verificado), só as contas Google que adicionares como **"Test users"** conseguem autorizar — adiciona aí a conta Google dona do canal do YouTube.

**Nota importante**: para usar isto com canais de clientes (não só o teu), o Google exige uma **auditoria/verificação** ("YouTube API Services" audit) antes de sair do modo de teste — processo à parte, pode demorar semanas e não depende de nós. Em modo de teste já dá para publicar no(s) canal(is) que adicionares como test user.

---

## 3. Criar as credenciais OAuth

1. Em **APIs & Services → Credentials → Create Credentials → OAuth client ID**.
2. Tipo de aplicação: **"Web application"**.
3. Adiciona um Authorized redirect URI (podes usar uma ferramenta como o [OAuth Playground da Google](https://developers.google.com/oauthplayground) para testar sem construir um ecrã próprio).
4. Guarda o **Client ID** e o **Client Secret**.

---

## 4. Gerar o token de acesso

Forma mais rápida para testar (sem construir nada):

1. Vai a **developers.google.com/oauthplayground**.
2. No canto superior direito, nas definições (ícone de engrenagem), marca **"Use your own OAuth credentials"** e cola o Client ID/Secret do passo 3.
3. À esquerda, no campo de scopes, escreve `https://www.googleapis.com/auth/youtube.upload` e clica **"Authorize APIs"**.
4. Entra com a conta Google dona do canal (a mesma que adicionaste como test user).
5. Clica **"Exchange authorization code for tokens"** — copia o **Access token**.

O YouTube Channel ID encontra-se em **YouTube Studio → Definições → Canal → Informações básicas do canal**.

---

## 5. O que me trazeres

- **YouTube Channel ID**
- **Token de acesso**

Aviso importante: este token expira em cerca de **1 hora** — só serve para testarmos já. Para produção a sério precisamos de um **refresh token** (dura mais tempo e renova o acesso automaticamente) — o OAuth Playground também o mostra; se quiseres, traz-mo também e ligo a renovação automática.
