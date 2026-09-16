# Guia — Ligar o Email (Resend)

Este guia é para quem não programa — segue os passos por ordem. No final vais ter 3 valores para me dares: o **domínio verificado**, o **email de envio** e a **API key**.

---

## 1. Criar a conta Resend

1. Vai a **resend.com** e cria uma conta gratuita (o plano grátis já chega para começar).
2. Confirma o teu email de registo.

---

## 2. Adicionar e verificar o domínio

1. No painel, vai a **Domains → Add Domain**.
2. Escreve o domínio de onde queres enviar emails (ex: `empowermarketing.pt`, ou o domínio de um cliente específico — cada marca pode ter o seu próprio).
3. O Resend mostra-te uma lista de registos DNS (normalmente TXT, DKIM e um MX) para adicionares.
4. Vai ao painel onde geres o domínio (ex: GoDaddy, Namecheap, Cloudflare, ou quem quer que tenhas comprado o domínio) e adiciona esses registos exatamente como aparecem.
5. Volta ao Resend e clica em **"Verify"**. Pode demorar de minutos a algumas horas a confirmar (às vezes até 48h, conforme o fornecedor de DNS).

Se não tiveres a certeza de como mexer no DNS do domínio, diz-me qual é o fornecedor (GoDaddy, Cloudflare, etc.) que ajudo com os passos específicos.

---

## 3. Criar a API Key

1. No painel do Resend, vai a **API Keys → Create API Key**.
2. Dá-lhe um nome (ex: `Empower OS`) e permissão **"Sending access"**.
3. Copia a key já — só é mostrada uma vez.

---

## 4. O que me trazeres

Quando tiveres os 3 valores, envia-mos (nunca os publiques em lado nenhum público):

- **Domínio verificado** (ex: `empowermarketing.pt`)
- **Email de envio** que queres usar (ex: `contacto@empowermarketing.pt`)
- **API key**

Eu ligo isto ao EMPOWER OS através de uma Edge Function no Supabase — a key nunca fica visível no frontend nem na base de dados em texto simples, tal como fizemos com o token do WhatsApp.

---

## Nota — não precisas de esperar por isto para começar

Consigo construir toda a parte de criação de campanhas e escolha de destinatários já, enquanto tratas da conta Resend em paralelo — só o envio em si fica à espera destes 3 valores.
