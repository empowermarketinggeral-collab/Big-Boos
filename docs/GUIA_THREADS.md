# Guia — Ligar o Threads

Reaproveita a mesma App da Meta que já criaste para o Instagram/WhatsApp (ver `docs/GUIA_WHATSAPP_META.md`) — não precisas de criar nada de raiz, só adicionar o produto Threads a essa App. No final vais ter 2 valores para me dares: **Threads User ID** e um **token de acesso**.

---

## 1. Adicionar o produto Threads à App existente

1. Vai a **developers.facebook.com/apps** e abre a mesma App que já usas para o WhatsApp/Instagram.
2. No menu lateral, clica em **"Add Product"** e adiciona **"Threads"**.
3. Isto pede permissões novas específicas do Threads — vais precisar de:
   - `threads_basic`
   - `threads_content_publish`

---

## 2. Ligar a conta Threads do negócio

1. A conta Threads tem de estar associada à mesma conta Instagram Business que já ligaste (o Threads usa sempre a identidade do Instagram por trás).
2. Em **Threads → Ferramentas de API**, usa o fluxo de login do Threads (Threads Login) para autorizar a tua conta — vai pedir-te para entrares com o Instagram associado.
3. Depois de autorizado, a página mostra o **Threads User ID**.

---

## 3. Gerar o token de acesso

1. Tal como no WhatsApp, o token de curta duração (1h) que aparece primeiro não serve para produção.
2. Troca-o por um **token de longa duração** (60 dias, renovável) — a própria página de Ferramentas de API do Threads tem um botão para isso, ou faz um pedido a:
   `GET https://graph.threads.net/access_token?grant_type=th_exchange_token&client_secret=<APP_SECRET>&access_token=<TOKEN_CURTO>`
3. Copia o token de longa duração.

---

## 4. O que me trazeres

- **Threads User ID**
- **Token de acesso** (longa duração)

Aviso: um token de 60 dias precisa de ser renovado periodicamente — se isto passar a ser usado a sério (não só em teste), digo-te e construímos a renovação automática.
