# Ligar os anúncios (Meta e Google) ao CRM do Big Boss

Com esta ligação, cada pessoa que preenche um formulário de um anúncio entra sozinha no CRM da marca, com nome, email, telefone e as tags escolhidas. As automações da marca (mensagem de boas-vindas, email, tarefa para a equipa) arrancam logo a seguir, sem ninguém copiar nada à mão.

Demora cerca de 15 minutos para o Google e 20 minutos para a Meta.

---

## Antes de começar: o endereço da marca

A agência envia-lhe um **endereço com token**, parecido com este:

```
https://xxxxxxxx.supabase.co/functions/v1/lead-intake?token=XXXXXXXXXXXX
```

(No Big Boss: marca, CRM, "Entrada de leads", "URL com token".)

- É este endereço que liga os anúncios ao CRM. Guarde-o só para esta configuração e não o publique.
- Se ficar exposto, a agência gera um novo e o antigo deixa de funcionar.
- Para separar as leads por campanha, pode acrescentar tags no fim do endereço:
  `...?token=XXXXXXXXXXXX&tags=Lead Google,Campanha Verão`

---

## 1. Google Ads (formulários de leads)

O Google envia as leads diretamente para o Big Boss. Não precisa de mais nenhuma ferramenta.

1. Entre no **Google Ads** e abra a campanha que tem o formulário de leads.
2. Vá a **Recursos** (Assets), **Formulário de leads** (Lead form) e edite o formulário.
3. Desça até **Entrega de leads** (Lead delivery) e escolha **Integração de webhook** (Webhook integration).
4. Preencha:
   - **URL do webhook**: o endereço com token que a agência lhe enviou.
   - **Chave** (Key): o token, que é só a parte depois de `token=`.
5. Carregue em **Enviar dados de teste** (Send test data). Deve aparecer uma mensagem de sucesso.
6. Guarde o formulário.

**Como confirmar:** no CRM da marca aparece um contacto de teste com o campo `google_teste = sim`. Pode apagá-lo.

**O que fica no CRM:**
- Nome, email e telefone vão para a ficha do contacto.
- As outras perguntas do formulário ficam em campos personalizados, com o nome da pergunta.
- A campanha e o formulário de origem também ficam guardados.

**Leads antigas:** o Google só envia as leads novas, a partir de agora. As anteriores descarregam-se em CSV no próprio formulário e importam-se em CRM, "Importar".

---

## 2. Meta (Facebook e Instagram, formulários instantâneos)

A Meta não envia os dados das leads diretamente para outro sistema. Usamos o **Make** (make.com) como ponte: o plano gratuito chega para cerca de 500 leads por mês.

### 2.1 Dar acesso às leads

1. No **Meta Business Suite**, vá a **Definições da empresa**, **Integrações**, **Acesso a leads**.
2. Escolha a **Página** dos anúncios.
3. Confirme que a pessoa que vai ligar o Make tem acesso às leads. Se houver uma lista de "CRM", deixe o Make autorizado ou sem restrições.

A pessoa tem de ser administradora da Página.

### 2.2 Criar a ligação no Make

1. Crie uma conta gratuita em **make.com** e carregue em **Create a new scenario**.
2. Primeiro módulo: **Facebook Lead Ads**, **Watch New Leads**.
   - Ligue a conta do Facebook (a mesma do passo 2.1).
   - Escolha a **Página** e o **Formulário**, ou todos os formulários.
3. Segundo módulo (botão **+**): **HTTP**, **Make a request**.
   - **URL**: o endereço com token.
   - **Method**: POST
   - **Body type**: Raw
   - **Content type**: JSON (application/json)
   - **Request content**: copie o texto abaixo e troque cada `{{...}}` pelo campo correspondente do formulário, clicando nele na lista que o Make mostra:

```json
{
  "name": "{{Nome completo}}",
  "email": "{{Email}}",
  "phone": "{{Número de telefone}}",
  "source": "meta_ads",
  "tags": "Lead Meta, Nome da campanha",
  "consent": true
}
```

   - Use `"consent": true` só se o formulário tiver o texto de consentimento para receber mensagens. Sem isso, apague essa linha.
   - Outras perguntas do formulário podem ir em campos personalizados com `cf_`, por exemplo: `"cf_servico": "{{Que serviço procura?}}"`.
4. Carregue em **Run once** e faça uma lead de teste no **Lead Ads Testing Tool** da Meta: developers.facebook.com/tools/lead-ads-testing (escolha a Página e o formulário e carregue em "Create lead").
5. Confirme que o contacto apareceu no CRM da marca e depois apague-o.
6. No Make, ligue o cenário (interruptor **ON**) e escolha **Immediately** para correr a cada lead nova.

**Leads antigas:** descarregue-as em CSV no Meta Business Suite (Formulários instantâneos) e importe-as em CRM, "Importar".

---

## 3. Formulários do site ou landing pages

Se o anúncio leva a uma landing page (Webflow, Elementor, WordPress), o formulário dessa página também pode enviar para o mesmo endereço. A agência trata dessa parte. Os campos aceites são `name`, `email`, `phone`, `tags`, `consent` e campos `cf_...`.

---

## Se algo não funcionar

| O que aparece | O que quer dizer |
| --- | --- |
| Erro 401 / "Token inválido" | O token está errado ou foi trocado. Peça o endereço atual à agência. |
| Erro 422 / "Indica um email ou telefone válido" | A lead chegou sem email nem telefone. Confirme o mapeamento dos campos no Make. |
| O teste do Google falha | Confirme que o URL está completo, com `?token=...`, e que a Chave é o token. |
| No Make, o módulo do Facebook não mostra o formulário | Falta o acesso às leads (passo 2.1) ou a pessoa não é administradora da Página. |

Em caso de dúvida, envie uma captura do erro à agência.
