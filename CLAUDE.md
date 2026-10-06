# EMPOWER OS (Big Boss) — contexto do projeto

Plataforma multi-tenant para agências de marketing. React (Vite) + Supabase (Postgres, RLS, Edge Functions em Deno, pg_cron, Vault). Frontend publica via Vercel a partir de `git push` para `main`. O utilizador escreve em português (PT-PT); responde sempre em português, curto e direto.

## Modelo de tenancy
`organizations` (Biamelo, dona da plataforma) → `agencies` (revendedoras; `is_root=true` = Biamelo) → `brands` (clientes de cada agência) → tabelas por marca (`brand_id`).
Papéis em `profiles.role`: `admin_geral` (vê tudo), `membro` (equipa da agência raiz), `agencia_admin`/`agencia_membro` (equipa de uma agência), `aprovador_marca`/`agencia_aprovador` (clientes, só as suas marcas via `brand_ids`).

## Como o utilizador faz deploy (importante)
- **Frontend**: commit + push para `main` → Vercel. Só faz commit/push depois de o utilizador dizer que sim.
- **SQL**: migrações numeradas em `supabase/NN_nome.sql` (a próxima é a 81 — há uma sessão em paralelo a mexer no mesmo repositório; confirma sempre o `ls supabase/*.sql` antes de escrever, porque este número pode já estar desatualizado). O utilizador cola-as à mão no SQL Editor do Supabase, por ordem. Escreve sempre migrações que se possam correr uma vez e diz-lhe o que correr.
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

## App das clientes (ex: Dream Studio)
- `/app/<booking_slug>` (`src/modules/clientapp/ClientApp.jsx`), ligada por marca em Agendamento ("App das clientes", `brands.client_app_enabled`). Migração 72.
- A cliente final entra com email + palavra-passe no Supabase Auth, **sem linha em `profiles`**. `client_portal_link` liga a conta à ficha do CRM pelo email já confirmado (nunca pelo telefone) e cria o contacto se não existir; `client_accounts` guarda a ligação (a equipa pode religar). Tudo o que a cliente vê vem de `client_portal_data`; não lê tabelas.
- Precisa no Supabase Auth: confirmação de email ligada, SMTP próprio (Resend) e `/app/*` nos Redirect URLs.
- Página pública e app leem serviços/profissionais/packs por `booking_public_page(slug)` (anon). O fluxo de marcação é o mesmo componente (`booking/BookingFlow.jsx`); `booking-create` reconhece a sessão da cliente pelo Authorization.
- Packs: `booking_packs` (catálogo) e `client_packs` (comprados ou atribuídos à mão). Cada marcação com pack gasta uma sessão (`client_pack_consume`, só service role); cancelar devolve-a (trigger). Compra pela app em `pack-checkout`.
- Stripe da própria marca: `stripe-brand-connect` guarda a chave no Vault e cria sozinho o webhook `stripe-brand-webhook?brand=<id>` (sinais e packs). Sem Stripe da marca, os sinais usam a chave global e o `stripe-webhook`.
- Tema por marca em `brands.booking_style` (accentColor, accentInk, background, surface, ink, titleFont, font, logoUrl, tagline, contactPhone), editado em Agendamento → Aparência e aplicado como variáveis `--app-*` (`booking/publicBooking.js`). Estas páginas usam tratamento formal ("o seu"). Serviços têm categoria, `price_max` e recomendações de cuidado; notas de cuidado em `contact_care_notes` (equipa escreve `team_text`, cliente `client_text` pela app). Migração 73; serviços e tema do Dreams Studio na 74.
- Serviços por profissional em `booking_service_staff` (sem ninguém = todas); `booking-availability`/`booking-create` aceitam `staffId: "any"` (sem preferência) e só marcam dentro do horário semanal de cada profissional. Contactos com a tag `booking_payment_settings.exempt_tag_id` (Dreams: "Cliente antiga") não pagam sinal (`is_returning_customer`). Sem email igual, a app liga a conta à ficha pelo telemóvel com código por SMS (`client-phone-verify`). Migrações 75 e 76.
- Instalar no telemóvel: a Vercel serve `/app/<slug>` pela função `api/app-page.js`, que põe no HTML o manifesto (`api/app-manifest.js`), o nome e o ícone DA MARCA (ícone próprio em `booking_style.appIconUrl`, PNG quadrado; senão o logótipo; senão `api/app-icon.js` com as iniciais). Assim instala-se a app da marca e não a Big Boss. Estas funções da Vercel leem a marca por `booking_public_page` com a anon key.
- Opcional, app com endereço próprio (fora do domínio do Big Boss): segundo projeto no Vercel a partir deste repositório, com `VITE_CLIENT_APP_SLUG`, `VITE_CLIENT_APP_NAME` e `VITE_CLIENT_APP_COLOR`. Nesse modo `App.jsx` só tem "/" (app) e "/agendar"; `vite.config.js` troca título, ícones e manifesto para `public/apps/<slug>/`. Dreams: `dreams-studio`. O endereço fica em `booking_style.appUrl` (painel "App das clientes").
- Google Agenda por profissional (migração 84, guia `docs/GUIA_GOOGLE_CALENDAR.md`): a equipa gera um link pessoal (Agendamento → Profissionais → Editar), a profissional abre `/ligar-agenda/:token` e autoriza sem conta no Big Boss (`google-calendar-connect` JWT ligado; `google-calendar-oauth` e `google-calendar-sync` JWT desligado). Refresh token no Vault (`booking_staff_google.refresh_token_ref`, coluna escondida do browser). Cron de 5 em 5 min: Google → `booking_external_busy` (que `booking-availability` exclui; `booking-create` confirma ainda ao vivo, falha aberta) e marcações confirmadas → eventos com id determinístico (`booking_google_events`). Segredos: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (opcional `GOOGLE_STATE_SECRET`). Token revogado → `needs_reauth` + 1 notificação (área `agendamento`).
- Horas: disponibilidade e mensagens em hora de Lisboa (as funções convertem; o servidor é UTC). Estado `no_show` = faltou. Importar agenda por CSV em Agendamento → Marcações (passadas ficam concluídas e sem lembretes).

## Comunicação
WhatsApp via Meta direta ou Twilio (`whatsapp_accounts.provider`); o utilizador usa Twilio. Fora da janela de 24h só templates aprovados (`whatsapp_templates`, com Content SID no caso Twilio). SMS via Twilio. Email via Resend. Campanhas de email/WhatsApp/SMS escolhem destinatários por tag + consentimento (`opted_in_*`). Redes sociais publicam via APIs oficiais (Instagram, Facebook, Threads, LinkedIn, YouTube, TikTok) na função `social-publish` (cron a cada minuto).

## Leads e gatilhos por data
- Landing pages externas → `lead-intake` (token por marca em `brand_lead_webhooks`, só a equipa vê; painel em CRM → "Entrada de leads"). Cria/atualiza o contacto e aplica tags; as automações arrancam pelos gatilhos da BD.
- Gatilhos novos (migração 63): `contact_birthday` e `annual_date` (varridos de hora a hora por `fire_date_automations()` via pg_cron, sem Edge Function; hora por automação em `trigger_config.hourLocal`, hora de Lisboa; dedupe em `automation_date_fires`; por omissão só contactos com consentimento) e `contact_referred` (`contacts.referred_by`). `contacts.birth_date` é coluna própria.
- O motor `automations-run` não verifica consentimento nos envios — quem filtra é o gatilho.

## Motor de automações — opções (migração 79)
- Variáveis: `{{campo|reserva}}` (reserva vazia permitida: `{{campo|}}`); um campo cujo valor tem `{{...}}` é preenchido também (variantes de parágrafo definidas por automações "Variante — …" com `update_contact`). Calculadas: `em_mes_reuniao`, `meses_desde_projeto` (de `data_fim_projeto`), `data_limite_integracao` (`data_entrega_mapa` + 30 dias).
- Emails escritos em texto simples seguem com parágrafos e versão `text`; com etiquetas HTML ficam como estão. `config.preheader` = pré-cabeçalho escondido. Nunca sai email com `[AJUSTAR]`, `{{` ou `}}` (o passo falha).
- `trigger_config.sendWindow` (`days` ISO, `start`, `end`, `tz`) e `maxEmailsPerWeek` adiam o envio (o passo repete-se mais tarde); `config.sendNow` num passo ignora os dois.
- `trigger_config.stopIfTaggedAfterStartIds`: para só se a tag for posta depois de a automação arrancar (usa `contact_tags.created_at`). `config.onlyIf` num passo: `{ field }`, `{ field, equals }` ou `{ field, empty: true }` — se não se verificar, o passo é saltado.
- Campanhas (`email-send`) também preenchem variáveis por contacto (sem valor nem reserva → contacto saltado) e nunca enviam a quem tem a tag `rgpd:opt-out`.
- Empower Marketing (marca `empowermarketing`): fluxos do briefing de email nas migrações 78 (Índice de Posição, DIA), 79 (REA, EXC, MAP, REU, regras, variantes, Carta de Posição #1) e 80 (guia "Da Estética à Posição": GUIA-01 e link no DIA-01). Gerados por script, sem `$$`: o SQL Editor/visualizadores estragam blocos com cifrão ao copiar.

## Contratos
- Aba "Contratos" de cada marca (PDFs no bucket privado `contracts`, primeiro segmento = id da marca; cliente só lê) e módulo "Contratos" no menu da agência (editor TipTap, assinatura desenhada, envio por email, PDF gerado no browser com html2pdf.js). Migração 70.
- Fluxo: rascunho → "Assinar e enviar" (`contract-send`, JWT ligado: congela o texto com SHA-256, regista a assinatura da agência, cria o token do outro lado e envia o email) → o outro lado assina em `/assinar/:token` (`contract-sign`, JWT desligado) → `signed`. Contratos enviados/assinados são imutáveis por trigger; só as funções (service role) mudam o estado. O token nunca sai do servidor (coluna revogada em `contract_signers`).
- Emails de contratos usam os segredos globais `RESEND_API_KEY` e `CONTRACTS_FROM_EMAIL` (Edge Function Secrets). É assinatura eletrónica simples, não qualificada (eIDAS).

## Criativos (opções de design por cliente)
- Módulo "Criativos" de cada marca (`src/modules/creatives/`, migração 85): abas por tipo de trabalho (`creative_projects`: cartão de visita, landing page, identidade visual, redes sociais, outro) → opções (`creative_options`: rascunho/enviada/aprovada/rejeitada) → versões (`creative_versions`, conteúdo em jsonb por tipo, número atribuído por `creative_add_version`) + comentários e ficheiros finais (`final_files`, na opção aprovada).
- Ficheiros no bucket privado `creatives` (primeiro segmento = id da marca; sempre por URL assinada, nunca públicos). Equipa escreve (`can_manage_brand`); o cliente com login só lê opções que não sejam rascunho.
- Cliente sem login: link `/criativos/:token` (token em `creative_share_links`, só a equipa o lê; função `creative-share`, JWT desligado) vê só opções enviadas, comenta, aprova ou pede alterações; a equipa recebe notificação (área `criativos`). Os ficheiros finais só saem com a opção aprovada.

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
