# Guia — Ligar o LinkedIn (Página de Empresa)

Diferente da Meta: o LinkedIn exige um pedido de acesso ao **Community Management API**, que a própria LinkedIn revê e pode demorar dias a aprovar (ou recusar). Não há forma de acelerar isto por fora. No final vais ter 2 valores para me dares: **Organization URN** e um **token de acesso**.

---

## 1. Criar a App no LinkedIn Developers

1. Vai a **www.linkedin.com/developers/apps** e clica em **"Create App"**.
2. Preenche o nome, associa à **Página de Empresa** da Empower (ou do cliente) — tens de ser administrador dessa página no LinkedIn.
3. Sobe um logótipo (obrigatório) e aceita os termos.

---

## 2. Pedir acesso ao Community Management API

1. Dentro da App criada, vai ao separador **"Products"**.
2. Procura **"Community Management API"** e clica em **"Request access"**.
3. O LinkedIn vai pedir-te para explicares o caso de uso (escreve algo como: *"Agência de marketing a publicar conteúdo agendado na página da nossa empresa e de clientes."*).
4. Este pedido é revisto manualmente pela LinkedIn — não é aprovação automática. Pode demorar de alguns dias a algumas semanas, e pode ser recusado se acharem o caso de uso pouco claro.

**Nota importante**: sem esta aprovação, não é possível publicar automaticamente na página — fica bloqueado até a LinkedIn aprovar. Não há alternativa "não oficial" seguro para contornar isto.

---

## 3. Ir buscar o Organization URN

1. Vai à página de empresa no LinkedIn → **Admin tools → Manage admins** (ou similar) para confirmares que és admin.
2. O URN da organização segue o formato `urn:li:organization:12345678` — o número é o ID da página, visível no URL da página de admin ou via a API `GET /organizationAcls`.

---

## 4. Gerar o token de acesso (OAuth)

Depois de aprovado o acesso ao Community Management API:

1. Na App, vai a **Auth** e configura um **Authorized redirect URL** (podes usar um temporário tipo `https://www.linkedin.com/developers/tools/oauth/redirect` para testar).
2. Segue o fluxo OAuth 2.0 da LinkedIn (login → autorização → troca do código por um token) com os scopes:
   - `w_organization_social`
   - `r_organization_social`
3. O token de acesso dura tipicamente 60 dias.

---

## 5. O que me trazeres

- **Organization URN**
- **Token de acesso**

Aviso: como o token expira ao fim de 60 dias, se isto passar a ser usado a sério digo-te e construímos a renovação automática (via refresh token).
