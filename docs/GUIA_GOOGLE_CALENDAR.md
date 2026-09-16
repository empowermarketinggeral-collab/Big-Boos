# Guia — Ligar o Google Calendar

Este é OAuth a sério (diferente do WhatsApp/Resend, onde colavas um token) — precisas de criar um projeto na Google e configurar um ecrã de consentimento. Demora uns 15-20 minutos, uma vez só.

---

## 1. Criar o projeto no Google Cloud

1. Vai a **console.cloud.google.com** e cria uma conta/projeto novo (nome sugerido: `Empower OS`).
2. No menu, vai a **APIs & Services → Library**, procura **"Google Calendar API"** e clica **Enable**.

---

## 2. Configurar o ecrã de consentimento OAuth

1. **APIs & Services → OAuth consent screen**.
2. Tipo: **External** (a menos que tenhas Google Workspace e queiras restringir à tua organização).
3. Preenche nome da app (`Empower OS`), email de suporte, e o teu email como developer contact.
4. Em **Scopes**, adiciona: `https://www.googleapis.com/auth/calendar` (acesso de leitura/escrita ao calendário).
5. Em **Test users** (enquanto a app não é publicada/verificada pela Google), adiciona os emails Google que vão ligar o calendário (o teu, e o de cada marca que precise).

---

## 3. Criar as credenciais OAuth

1. **APIs & Services → Credentials → Create Credentials → OAuth client ID**.
2. Tipo de aplicação: **Web application**.
3. Em **Authorized redirect URIs**, adiciona:
   `https://phfhhricqtttinploffo.supabase.co/functions/v1/google-calendar-callback`
4. Cria — vais receber um **Client ID** e um **Client Secret**.

---

## 4. O que me trazeres

- **Client ID**
- **Client Secret**

Como sempre, não os publiques em lado nenhum — traz-mos e eu ligo-os através de uma Edge Function, guardados no Vault.

---

## Nota

Enquanto a app estiver em modo "Testing" (não publicada/verificada pela Google), só os emails que adicionares em "Test users" conseguem autorizar a ligação — perfeito para começar, sem esperar pela verificação da Google. Publicar/verificar a app só é preciso mais tarde, se quiseres que qualquer cliente ligue o próprio Google Calendar sem estar na lista de testers.
