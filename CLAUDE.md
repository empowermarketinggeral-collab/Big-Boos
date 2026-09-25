# EMPOWER OS (Big Boss) — contexto do projeto

Plataforma multi-tenant para agências de marketing. React (Vite) + Supabase (Postgres, RLS, Edge Functions em Deno, pg_cron, Vault). Frontend publica via Vercel a partir de `git push` para `main`. O utilizador escreve em português (PT-PT); responde sempre em português, curto e direto.

## Modelo de tenancy
`organizations` (Biamelo, dona da plataforma) → `agencies` (revendedoras; `is_root=true` = Biamelo) → `brands` (clientes de cada agência) → tabelas por marca (`brand_id`).
Papéis em `profiles.role`: `admin_geral` (vê tudo), `membro` (equipa da agência raiz), `agencia_admin`/`agencia_membro` (equipa de uma agência), `aprovador_marca`/`agencia_aprovador` (clientes, só as suas marcas via `brand_ids`).

## Como o utilizador faz deploy (importante)
- **Frontend**: commit + push para `main` → Vercel. Só faz commit/push depois de o utilizador dizer que sim.
- **SQL**: migrações numeradas em `supabase/NN_nome.sql` (a próxima é a 72). O utilizador cola-as à mão no SQL Editor do Supabase, por ordem. Escreve sempre migrações que se possam correr uma vez e diz-lhe o que correr.
- **Edge Functions**: o utilizador cola o código no Dashboard do Supabase, função a função. Por isso **cada `supabase/functions/<nome>/index.ts` tem de ser autossuficiente** — sem imports de pastas partilhadas (`_shared` não funciona). A duplicação de código entre funções é aceite de propósito.
- Ao entregar funções alteradas, dá o código completo (ou envia os ficheiros) e diz se "Verify JWT" fica ligado. Desligado só em: webhooks (`stripe-webhook`, `twilio-whatsapp-webhook`, `whatsapp-webhook`, `lead-intake` — este autentica com token por marca), `agency-signup`, funções chamadas por cron e páginas públicas de marcação.
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
- Links de faturas (`invoice_links`, migração 71): a equipa cola o link e o nome de cada fatura; o cliente só vê e abre (leitura `is_brand_member`, escrita `can_manage_brand`; só http/https).
- Agendamento: sinal opcional por marca (`booking_payment_settings`), marcações `pending_payment` até o webhook confirmar.

## Comunicação
WhatsApp via Meta direta ou Twilio (`whatsapp_accounts.provider`); o utilizador usa Twilio. Fora da janela de 24h só templates aprovados (`whatsapp_templates`, com Content SID no caso Twilio). SMS via Twilio. Email via Resend. Campanhas de email/WhatsApp/SMS escolhem destinatários por tag + consentimento (`opted_in_*`). Redes sociais publicam via APIs oficiais (Instagram, Facebook, Threads, LinkedIn, YouTube, TikTok) na função `social-publish` (cron a cada minuto).

## Leads e gatilhos por data
- Landing pages externas → `lead-intake` (token por marca em `brand_lead_webhooks`, só a equipa vê; painel em CRM → "Entrada de leads"). Cria/atualiza o contacto e aplica tags; as automações arrancam pelos gatilhos da BD.
- Gatilhos novos (migração 63): `contact_birthday` e `annual_date` (varridos de hora a hora por `fire_date_automations()` via pg_cron, sem Edge Function; hora por automação em `trigger_config.hourLocal`, hora de Lisboa; dedupe em `automation_date_fires`; por omissão só contactos com consentimento) e `contact_referred` (`contacts.referred_by`). `contacts.birth_date` é coluna própria.
- O motor `automations-run` não verifica consentimento nos envios — quem filtra é o gatilho.

## Contratos
- Aba "Contratos" de cada marca (PDFs no bucket privado `contracts`, primeiro segmento = id da marca; cliente só lê) e módulo "Contratos" no menu da agência (editor TipTap, assinatura desenhada, envio por email, PDF gerado no browser com html2pdf.js). Migração 70.
- Fluxo: rascunho → "Assinar e enviar" (`contract-send`, JWT ligado: congela o texto com SHA-256, regista a assinatura da agência, cria o token do outro lado e envia o email) → o outro lado assina em `/assinar/:token` (`contract-sign`, JWT desligado) → `signed`. Contratos enviados/assinados são imutáveis por trigger; só as funções (service role) mudam o estado. O token nunca sai do servidor (coluna revogada em `contract_signers`).
- Emails de contratos usam os segredos globais `RESEND_API_KEY` e `CONTRACTS_FROM_EMAIL` (Edge Function Secrets). É assinatura eletrónica simples, não qualificada (eIDAS).

## UI e identidade visual (Big Boss by Empower Boss)
- Conceito "a mesa do Boss": fundo = mesa, cada área = folha de cantos vivos (3px), menu = régua em roxo profundo. Claro e escuro (segue o sistema; interruptor na barra de topo; escolha em localStorage "bb-theme"; ver `src/design/theme.js`).
- **Nunca escrevas hex nos módulos.** As cores são variáveis CSS em `src/design/tokens.css` e chegam aos módulos por `c` em `src/shared/theme.jsx`: `c.boss` = roxo para FUNDOS (texto branco por cima), `c.bossText` = roxo para texto/ícones; `c.roseSolid`/`c.sageSolid`/`c.amberSolid` = fundos cheios com texto branco, `c.rose`/`c.sage`/`c.amber` = texto e contornos; `c.folha` = conteúdo, `c.paper` = mesa; `c.lineStrong` = contorno de campos. Nada de `${cor}1A` (alfa em hex): usa `color-mix(in srgb, <cor> 14%, transparent)`.
- Tipografia (fontes livres): `display` = títulos (Bodoni Moda, peso 700, opsz baixo), `serif` = subtítulos e títulos de cartões (Marcellus), `sans` = corpo (Quicksand, base 15px; nada abaixo de 12.5px). Sem etiquetas em maiúsculas por cima dos títulos (`Eyebrow` não desenha nada), sem pontos médios nem setas em textos, sem gradientes decorativos, sem sombras suaves.
- Roxo só para ações que decidem (aprovar, assinar, publicar). O selo de aprovado usa o dourado (`c.gold`); logótipos em `public/brand/` via `src/design/BrandLogo.jsx` (versão sobre roxo no escuro).
- Documentos (contratos) são SEMPRE brancos, também no escuro. Páginas públicas das marcas (formulários, agendamento, link na bio, propostas) ficam sempre claras: raiz com `className="bb-force-light"` e personalização por marca mantida.
- Estilo inline com tokens de `src/shared/theme.jsx` (`c`, `display`, `serif`, `sans`, `Modal`, `inputStyle`, `btnPrimary`, `btnGhost`). Cada módulo em `src/modules/<nome>/` com hooks `react-query` locais.
- Mobile-first: grelhas com `var(--bb-grid-N, ...)` / `var(--bb-split, ...)` ou `repeat(auto-fit, minmax(...))`; listas que empilham por container query; nunca larguras fixas em colunas divididas.
- Nomes de módulos, marcas e "Big Boss" nunca se traduzem (só o texto de interface, via `t()`); `index.html` está `lang="pt"` com `translate="no"`.
- Rever o visual sem iniciar sessão: servidor "big-boss-mock" (`VITE_MOCK=1`, ver `src/dev/mockSupabase.js`; `?login=1` mostra o ecrã de entrada) e a rota `/design` (só em desenvolvimento) com o exemplar e o contraste medido.

## Ficheiros que não são teus
`nao esquecer.txt` (notas pessoais do utilizador) — nunca incluir em commits.
