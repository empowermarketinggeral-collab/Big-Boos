# EMPOWER OS (Big Boss) — contexto do projeto

Plataforma multi-tenant para agências de marketing. React (Vite) + Supabase (Postgres, RLS, Edge Functions em Deno, pg_cron, Vault). Frontend publica via Vercel a partir de `git push` para `main`. O utilizador escreve em português (PT-PT); responde sempre em português, curto e direto.

## Modelo de tenancy
`organizations` (Biamelo, dona da plataforma) → `agencies` (revendedoras; `is_root=true` = Biamelo) → `brands` (clientes de cada agência) → tabelas por marca (`brand_id`).
Papéis em `profiles.role`: `admin_geral` (vê tudo), `membro` (equipa da agência raiz), `agencia_admin`/`agencia_membro` (equipa de uma agência), `aprovador_marca`/`agencia_aprovador` (clientes, só as suas marcas via `brand_ids`).

## Como o utilizador faz deploy (importante)
- **Frontend**: commit + push para `main` → Vercel. Só faz commit/push depois de o utilizador dizer que sim.
- **SQL**: migrações numeradas em `supabase/NN_nome.sql` (a próxima é a 61). O utilizador cola-as à mão no SQL Editor do Supabase, por ordem. Escreve sempre migrações que se possam correr uma vez e diz-lhe o que correr.
- **Edge Functions**: o utilizador cola o código no Dashboard do Supabase, função a função. Por isso **cada `supabase/functions/<nome>/index.ts` tem de ser autossuficiente** — sem imports de pastas partilhadas (`_shared` não funciona). A duplicação de código entre funções é aceite de propósito.
- Ao entregar funções alteradas, dá o código completo (ou envia os ficheiros) e diz se "Verify JWT" fica ligado. Desligado só em: webhooks (`stripe-webhook`, `twilio-whatsapp-webhook`, `whatsapp-webhook`), `agency-signup`, funções chamadas por cron e páginas públicas de marcação.
- Segredos globais (ex: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`) vivem em Edge Function Secrets (`Deno.env.get`). Segredos por marca (tokens Twilio/Meta/Resend/redes sociais) vão para o Vault via `vault_upsert_secret` e guarda-se só a referência na tabela.
- O preview em dev (`big-boss-dev`) não deixa entrar com login: nunca insiras credenciais por ele. Valida com `npx vite build --mode development`. Se o browser mostrar erros "fantasma" (módulo apagado, erro de sintaxe que o build não confirma), fecha o separador e abre outro.

## Segurança — regras que não se quebram
- Toda a tabela nova tem `enable row level security`.
- `is_brand_member(brand)` = equipa **ou** cliente, com leitura **e escrita**. Usa-o só para leitura ou para módulos que o cliente opera de facto. Para dados sensíveis (faturas, custos, subscrições, configuração de faturação) o cliente só lê: escrita com `can_manage_brand(...)` ou só pela service role.
- Funções `security definer` levam sempre `set search_path = public`.
- Edge Functions chamadas pelo browser: primeiro confirmam acesso com um `userClient` (anon key + Authorization do pedido) a `brands`/`agencies`; só depois usam o `adminClient` (service role). Qualquer id vindo do pedido (contactId, templateId, campaignId…) tem de ser confirmado como pertencente à marca já verificada.
- Webhooks verificam assinatura: Stripe (HMAC-SHA256), Meta (`X-Hub-Signature-256`, `META_APP_SECRET`), Twilio (`X-Twilio-Signature` com o Auth Token da marca).
- Upload de ficheiros: o primeiro segmento do caminho tem de ser o id do dono (marca/agência/reunião/deck) — as políticas de storage verificam isso.
- `profiles`: ninguém altera o próprio `role`/`agency_id`/`brand_ids` (trigger). Novos utilizadores criam-se no Supabase Auth + linha em `profiles` à mão, ou pelo registo público de agências.

## Faturação e planos
- Stripe: só pedidos `fetch` diretos (sem SDK). `plans` (scope `agency` ou `brand`) com `stripe_price_id`; `subscriptions` escrita só pelo `stripe-webhook`. Planos: Marca 49€ (brand); Agência Starter 97€ (5 marcas/3 utilizadores), Growth 297€ (20/10), Enterprise (sob consulta, WhatsApp de vendas).
- Limites de marcas/utilizadores impostos por triggers na BD (`58_agency_plan_limits.sql`); agência raiz e agências sem subscrição não têm limite.
- A subscrição de uma marca **não** é autoativada pelo cliente: a equipa gera o link de pagamento e envia-o. Aviso de atraso: `PaymentReminderBanner` (7 dias + 3, sem bloqueio automático — decisão do utilizador).
- Registo público de agências em `/registar` (função `agency-signup`). Faturas de serviços (`service_invoices`) são registo manual, sem Stripe.
- Agendamento: sinal opcional por marca (`booking_payment_settings`), marcações `pending_payment` até o webhook confirmar.

## Comunicação
WhatsApp via Meta direta ou Twilio (`whatsapp_accounts.provider`); o utilizador usa Twilio. Fora da janela de 24h só templates aprovados (`whatsapp_templates`, com Content SID no caso Twilio). SMS via Twilio. Email via Resend. Campanhas de email/WhatsApp/SMS escolhem destinatários por tag + consentimento (`opted_in_*`). Redes sociais publicam via APIs oficiais (Instagram, Facebook, Threads, LinkedIn, YouTube, TikTok) na função `social-publish` (cron a cada minuto).

## UI
- Estilo inline com tokens de `src/shared/theme.jsx` (`c`, `sans`, `serif`, `Modal`, `inputStyle`, `btnPrimary`, `btnGhost`). Cada módulo em `src/modules/<nome>/` com hooks `react-query` locais.
- Mobile-first: grelhas com `var(--bb-grid-N, ...)` / `var(--bb-split, ...)` ou `repeat(auto-fit, minmax(...))`; nunca larguras fixas em colunas divididas.
- Nomes de módulos, marcas e "Big Boss" nunca se traduzem (só o texto de interface, via `t()`); `index.html` está `lang="pt"` com `translate="no"`.

## Ficheiros que não são teus
`nao esquecer.txt` (notas pessoais do utilizador) — nunca incluir em commits.
