# Guia — Ligar o TikTok

O TikTok exige uma app aprovada para publicação automática ("Direct Post") — sem essa aprovação, o vídeo ainda sai pela API, mas cai na caixa de entrada da app do TikTok do dono da conta, para um toque de confirmação manual (não é 100% automático até lá). No final vais ter 2 valores para me dares: **TikTok Open ID** e um **token de acesso**.

---

## 1. Criar a App no TikTok for Developers

1. Vai a **developers.tiktok.com** e cria uma conta de developer.
2. Clica em **"Manage apps" → "Connect an app"**.
3. Preenche nome, descrição, categoria.

---

## 2. Pedir os produtos certos

1. Dentro da App, adiciona o produto **"Content Posting API"**.
2. Pede o scope **`video.publish`**.
3. Para publicação totalmente automática (sem toque de confirmação), pede também o **"Direct Post"** — este pedido é revisto pela TikTok e pode demorar; sem ele, a API funciona na mesma, só que cai na caixa de entrada da app para confirmares no telemóvel.

---

## 3. Ligar a conta TikTok do negócio

1. Em **"Login Kit"**, configura um Redirect URI (usa uma ferramenta de teste OAuth, tal como no YouTube, se não quiseres construir um ecrã próprio).
2. Segue o fluxo OAuth do TikTok: autoriza com a conta TikTok do negócio, escolhe o scope `video.publish`.
3. No fim do fluxo, recebes o **Open ID** (identifica a conta) e o **Access Token**.

---

## 4. O que me trazeres

- **TikTok Open ID**
- **Token de acesso**

Avisos:
- O token de acesso do TikTok expira ao fim de **24h** — só serve para teste imediato. Para produção a sério precisamos do **refresh token** (também devolvido no fluxo OAuth) para renovar sozinho; traz-mo também se quiseres já ligar isto a sério.
- Sem aprovação do "Direct Post", conta com o dono da conta ter de confirmar cada publicação no telemóvel — não é uma limitação nossa, é da própria TikTok.
