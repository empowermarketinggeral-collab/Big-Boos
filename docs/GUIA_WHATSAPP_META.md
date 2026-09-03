# Guia — Ligar o WhatsApp Business (Meta Cloud API)

Este guia é para quem não programa — segue os passos por ordem. No final vais ter 3 valores para me dares: **WABA ID**, **Phone Number ID** e um **token de acesso**.

Não uses nenhum serviço de WhatsApp "não oficial" (QR code tipo WhatsApp Web) — é contra os termos da Meta e a conta pode ser banida. Isto usa sempre a API oficial.

---

## 1. Criar/confirmar a conta Meta Business

1. Vai a **business.facebook.com** e entra com uma conta Facebook (cria uma dedicada ao negócio, se ainda não tiveres).
2. Cria uma "Business Portfolio" (Portefólio Empresarial) com o nome da Empower (ou do cliente, se for o WhatsApp de um cliente específico).

---

## 2. Criar a App no Meta for Developers

1. Vai a **developers.facebook.com/apps** e clica em **"Create App"**.
2. Tipo de app: escolhe **"Business"**.
3. Dá-lhe um nome (ex: `Empower OS WhatsApp`) e associa-o ao Business Portfolio do passo 1.
4. Dentro da app, no menu lateral, adiciona o produto **"WhatsApp"** (clica em "Set up" no cartão do WhatsApp).

---

## 3. Configurar o número

A Meta dá-te automaticamente um **número de teste grátis** — usa-o primeiro para testarmos tudo sem risco.

1. Em **WhatsApp → API Setup**, vais ver um número de teste já pronto.
2. Nessa mesma página, aparecem dois valores que precisas de guardar:
   - **Phone number ID**
   - **WhatsApp Business Account ID** (também chamado WABA ID)
3. Para testares o envio, podes adicionar até 5 números pessoais como "recipients" de teste (o teu telemóvel, por exemplo) — a página tem um botão para isso.

Quando quiseres usar um número de telefone real do negócio (não o de teste), o mesmo ecrã tem a opção **"Add phone number"** — aí é preciso verificar o número por SMS/chamada.

---

## 4. Gerar um token de acesso permanente

O token que aparece por defeito na página de API Setup expira em 24h — só serve para testar na hora. Para o EMPOWER OS precisamos de um **token permanente**:

1. Vai a **business.facebook.com → Definições do Negócio → Utilizadores → Utilizadores do Sistema (System Users)**.
2. Clica em **"Add"**, cria um utilizador de sistema com papel **Admin**.
3. Clica em **"Add Assets"** e associa a tua App do passo 2 a este utilizador de sistema, com permissão de gestão total.
4. Clica em **"Generate New Token"**, escolhe a App, e marca as permissões:
   - `whatsapp_business_messaging`
   - `whatsapp_business_management`
5. Gera o token e **copia-o já** — só é mostrado uma vez.

---

## 5. O que me trazeres

Quando tiveres os 3 valores, envia-mos (não os publiques em lado nenhum público):

- **WABA ID**
- **Phone Number ID**
- **Token de acesso permanente**

Eu ligo isto ao EMPOWER OS através de uma Edge Function no Supabase — o token nunca fica visível no frontend nem na base de dados em texto simples.

---

## 6. Mais à frente — verificação do negócio e templates

- Para enviar mensagens a qualquer número (não só aos 5 de teste), a Meta pede **verificação do negócio** (Business Verification) — pode demorar de horas a alguns dias, e pede documentos da empresa (NIF, morada).
- Para iniciar conversa com um cliente que não te escreveu primeiro (fora da janela de 24h), a mensagem tem de usar um **template pré-aprovado pela Meta** — isso configura-se depois, dentro do EMPOWER OS, e a aprovação demora normalmente minutos a poucas horas.

Não precisas de resolver a verificação do negócio já — podemos testar tudo com o número de teste e os 5 contactos autorizados primeiro.
