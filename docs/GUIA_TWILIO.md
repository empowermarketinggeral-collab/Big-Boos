# Guia — Ligar SMS e/ou WhatsApp via Twilio

Diferente da Meta: não há verificação de negócio bloqueante para começar a testar. Uma conta Twilio dá acesso a ambos — SMS funciona em minutos; WhatsApp via Twilio continua a exigir alguma verificação da Meta por trás, mas com acompanhamento da equipa da Twilio, que costuma ser mais rápido que o suporte direto da Meta.

---

## 1. Criar a conta Twilio

1. Vai a **twilio.com** e cria uma conta gratuita.
2. Confirma o email e o número de telemóvel pedidos no registo.

---

## 2. Comprar um número (para SMS)

1. No painel, vai a **Phone Numbers → Buy a Number**.
2. Escolhe um número com capacidade **SMS** (e **Voice**, se quiseres no futuro).
3. Compra-o — fica associado à tua conta.

---

## 3. Ligar o WhatsApp via Twilio (opcional, para já)

1. No painel, vai a **Messaging → Try it out → Send a WhatsApp message** para usares a **Sandbox** de imediato (grátis, sem verificação — bom para testar já).
2. Para produção a sério, vai a **Messaging → Senders → WhatsApp senders** e segue o assistente — a Twilio liga-se à tua Meta Business Manager e trata da parte de verificação com acompanhamento próprio.

---

## 4. Ir buscar as credenciais

No painel principal (**Account → Account Info**, ou o dashboard inicial):

- **Account SID**
- **Auth Token** (clica em "show" para revelar)
- **Número Twilio** que compraste (formato +351...)

---

## 5. O que me trazeres

- **Account SID**
- **Auth Token**
- **Número de SMS** (e, se ligares, o **número de WhatsApp** da Twilio)

Como sempre, nunca os publiques em lado nenhum — traz-mos e eu ligo-os através de uma Edge Function, guardados no Vault.
