# EMPOWER OS — Architecture & Product Strategy

**Fase 0 — Auditoria e recomendação arquitetural.** Documento de decisão, não de implementação. Baseado numa auditoria factual do código, schema e políticas RLS da aplicação Big Boss em `2026-09-02`.

**Recomendação em uma frase:** o EMPOWER OS não deve ser um sistema novo do zero — deve nascer *dentro* do mesmo projeto Supabase e do mesmo modelo multi-tenant que a Big Boss já tem, com uma nova camada de backend (Edge Functions) para tudo o que precisa de segredos/webhooks, e uma reorganização do frontend em módulos, apresentada ao cliente como uma única plataforma "Empower".

---

## 1. Análise da aplicação existente

A "aplicação atual" **é a Big Boss** — não existe uma terceira aplicação escondida. É uma SPA React 19 + Vite, com Supabase como único backend (Postgres + Auth + Storage), deployment no Vercel, repositório Git em `empowermarketinggeral-collab/Big-Boos`.

O achado mais importante desta auditoria: **a Big Boss já não é um "software de gestão interna" simples — já é, estruturalmente, um sistema multi-tenant real.** Ela já modela:

- Uma agência raiz (Biamelo, `agencies.is_root = true`) e agências parceiras/revendedoras (`agencia_admin`/`agencia_membro`);
- Clientes finais como `brands`, isolados por `agency_id`;
- 6 papéis de utilizador, incluindo dois papéis de **cliente aprovador** (`aprovador_marca`, `agencia_aprovador`) com acesso restrito só à sua própria marca;
- Isolamento de dados **ao nível da base de dados** via Postgres Row-Level Security — não apenas escondido no frontend.

Isto significa que o "Nível 1 — Empower", "Nível 2 — Conta do Cliente" e "Nível 3 — Utilizadores do Cliente" pedidos na tua visão **já existem, em ~70%**, só que sob os nomes `agency`/`brand`/`profile.role`. Construir isto de novo seria a duplicação exata que querias evitar.

O que falta é tudo o que é "Marketing OS": CRM, WhatsApp, Email, automações, funis, formulários, social media, billing. Nada disto existe hoje (secção 6).

## 2. Stack tecnológico atual

| Camada | Tecnologia |
|---|---|
| Frontend | React 19.2, React Router 7, Vite 8 |
| Data fetching | TanStack React Query 5 |
| UI | Componentes próprios (sem biblioteca de UI), Lucide icons, Recharts para gráficos |
| Backend | Supabase (Postgres + Auth + Storage) — **sem servidor próprio, sem Edge Functions, sem API própria** |
| Deploy | Vercel (SPA, rewrite único para `index.html`) |
| Auth | Supabase Auth, só email/password (sem OAuth, sem magic link) |
| Lint | oxlint |

Não existe hoje **nenhuma camada de backend própria** (nem API routes, nem Vercel Functions, nem Supabase Edge Functions). O frontend fala diretamente com o Postgres via `supabase-js`, protegido por RLS. Isto é adequado para CRUD simples, mas é **estruturalmente incapaz** de suportar WhatsApp, Email ou pagamentos com segurança — essas integrações exigem segredos (tokens, API keys) que nunca podem viver no browser. Isto é o maior "gap" técnico a resolver, independentemente da arquitetura escolhida.

## 3. Estrutura da base de dados

19 migrações (`supabase/01_schema.sql` → `19_link_pages_display_name.sql`), 19+ tabelas. As relevantes para a decisão de arquitetura:

| Tabela | Papel | Isolamento |
|---|---|---|
| `organizations` | registo raiz (Biamelo) | — |
| `agencies` | agência raiz + agências parceiras | `is_root`, `organization_id` |
| `brands` | **cliente final** | `agency_id` (not null) |
| `profiles` | 1:1 com utilizador Supabase Auth | `role`, `agency_id`, `brand_ids[]` |
| `contents`, `scripts`, `action_plans`, `tasks`, `reports`, `story_*` | operação por marca | `brand_id` |
| `proposals`, `presentations`, `knowledge_articles`, `meetings`, `pricing_*` | operação por agência | `agency_id` |
| `growth_maps` | diagnóstico estratégico, partilhável publicamente | `agency_id` |
| `link_pages` | páginas públicas "Link na Bio" — **motor de blocos JSON reutilizável** | `owner_type` + `owner_id` polimórfico (brand/agency/user) |
| `social_accounts` | placeholder para ligação a redes sociais — **existe na tabela, zero lógica associada** | `brand_id` |

`profiles.role` aceita exatamente: `admin_geral`, `membro`, `aprovador_marca`, `agencia_admin`, `agencia_membro`, `agencia_aprovador`.

**Ponto fraco identificado:** o isolamento ao nível de tabelas (RLS) é sólido, mas o isolamento ao nível de **Storage** (ficheiros) é fraco — qualquer utilizador autenticado pode escrever/ler em qualquer um dos 5 buckets, sem verificação de proprietário do ficheiro. Isto é uma dívida de segurança já existente, independente do EMPOWER OS, e recomendo corrigi-la em paralelo (secção 26).

## 4. Sistema de autenticação

Supabase Auth, email/password. Sessão carrega o `profiles` correspondente (nome, role, agency_id, brand_ids). Existe um seletor de papel (`DevRoleSwitcher`) explicitamente rotulado "só no protótipo — simular perfil": **não é impersonação real**, é só uma pré-visualização de UI no lado do cliente — não muda `auth.uid()`, não desbloqueia dados protegidos por RLS. Ou seja: hoje **não existe** a funcionalidade "Empower entra na conta do cliente" — teria de ser construída (com um mecanismo seguro, não um simples troca-de-estado no frontend).

## 5. Modelo de clientes/utilizadores

- **Empower/Biamelo** = agência raiz (`is_root = true`).
- **Agências parceiras/revendedoras** = já suportadas (`agencia_admin`/`agencia_membro`), isoladas entre si.
- **Cliente final** = `brands`, sempre pertencente a uma agência.
- **Utilizador de cliente** = `profiles` com `role = aprovador_marca` (ou `agencia_aprovador` numa agência parceira), `brand_ids` limita a marca(s) a que tem acesso.

Este modelo já responde a "a Empower cria clientes", "cada cliente tem os seus dados isolados", "cada cliente pode ter o seu próprio login". Não responde ainda a "criar múltiplos utilizadores por cliente com permissões configuráveis" — hoje o papel `aprovador_marca` é único e fixo (ver-e-aprovar, nada mais); RBAC configurável por cliente teria de ser adicionado (secção 11).

## 6. Componentes reutilizáveis

Isto é decisivo para não duplicar esforço:

- **Modelo de tenancy inteiro** (`agencies`/`brands`/`profiles`/RLS) — reutilizar tal e qual, estender com as mesmas convenções.
- **Motor de blocos JSON do "Link na Bio"** (`link_pages`, tipo `blocks jsonb`, editor visual, página pública por slug) — é literalmente um construtor de páginas funcional. Deve ser a base para landing pages, páginas de funil e até páginas de formulário, em vez de construir três page-builders diferentes.
- **Padrão de página pública por slug** (já usado 4x: propostas, apresentações, link na bio, mapas de crescimento) — é o mesmo padrão que formulários/funis públicos vão precisar.
- **`notifications`** — sistema de notificações in-app já existe, extensível a eventos de CRM/automações.
- **Sistema de design** (`ChartCard`, `Eyebrow`, tokens de cor `c.*`) — reutilizar para manter consistência visual "Empower".
- **`social_accounts`** — schema já pensado para isto, só falta a lógica.

## 7. Funcionalidades que devem permanecer na "aplicação atual"

Tudo o que é operação interna da agência e não é "marketing operativo do cliente": Reuniões, Propostas, Portfólio, Calculadora de Preços, Centro de Comando, Base de Conhecimento, Equipa, Definições. Isto é gestão da agência sobre si própria e sobre a relação comercial — não deve ir para o EMPOWER OS.

## 8. Funcionalidades que devem entrar no EMPOWER OS

CRM, Pipelines, WhatsApp, Email, Automações, Funis, Landing Pages, Formulários/Questionários, Lead Magnets, Social Media, Analytics de marketing, Billing/planos. Tudo o que é "ferramenta de marketing operacional" que o cliente usa diretamente ou que gera valor vendável como SaaS.

**Zona cinzenta, decidir caso a caso:** `growth_maps` (diagnóstico estratégico) e `link_pages` (Link na Bio) já existem na Big Boss mas são conceptualmente "Marketing OS". Não vale a pena migrá-los agora — continuam a funcionar onde estão; o `link_pages` inclusivamente deve ser a **base técnica** de funis/landing pages do EMPOWER OS (ver secção 6), não uma duplicação.

## 9. Funcionalidades que não devemos duplicar

- **Tenancy/multi-tenant** (agencies/brands) — nunca criar um segundo conceito de "workspace" ou "conta".
- **Autenticação** — um único login Supabase Auth para tudo.
- **RBAC** — estender o enum de `role` e o padrão RLS existente, não inventar um segundo sistema de permissões em paralelo.
- **Page builder** — usar/estender o motor do `link_pages`, não construir 2º e 3º construtores de página para funis e formulários.
- **Notificações, storage, design system** — um só de cada.

## 10. Arquitetura recomendada

**Opção D — Híbrida, mas "leve": um só projeto Supabase, uma só app React, uma nova camada de Edge Functions.** Não Opção A (app separada duplicaria auth+tenancy), não Opção C (duas apps ligadas por API é complexidade acrescida sem benefício, dado que já partilham a mesma base de dados de tenants). Justificação completa na secção 30.

## 11. Arquitetura multi-tenant

Manter `agencies` → `brands` → `profiles` como veio. Toda a tabela nova do EMPOWER OS leva `brand_id` (padrão já dominante no schema) com `agency_id` obtido por join quando necessário — não introduzir um terceiro conceito de tenant.

Duas extensões necessárias:
1. **RBAC configurável por cliente** — hoje `NAV_ACCESS`/`CAN_MANAGE_ROLES` são constantes fixas no código. Para "permissões configuráveis" como pedes, introduzir uma tabela `role_permissions` (ou `brand_user_permissions`) que a Empower e, mais tarde, o próprio cliente possam editar — sem tocar em código a cada cliente novo. Não é MVP, é Fase 2.
2. **Impersonação real e auditada** — RPC `security definer` que, mediante verificação de `role IN ('admin_geral','membro')`, gera uma sessão com contexto do tenant-alvo e grava em `audit_logs`. Nunca um simples "trocar estado no frontend" como o protótipo atual faz.

## 12. Modelo de dados recomendado

Novas tabelas, todas com `brand_id` + RLS desde o primeiro commit (regra inegociável, secção 26):

- **CRM**: `contacts`, `companies`, `contact_tags`, `tags`, `notes`, `activities`, `pipelines`, `pipeline_stages`, `deals`
- **WhatsApp**: `whatsapp_accounts` (segredo referenciado, nunca em claro), `whatsapp_conversations`, `whatsapp_messages`, `whatsapp_templates`
- **Email**: `email_domains`, `email_campaigns`, `email_sends`, `email_events`
- **Automações**: `automations`, `automation_steps`, `automation_runs`
- **Funis/LP**: extensão do `link_pages` existente (renomear conceptualmente para `pages`, generalizar `blocks`), `funnels`, `funnel_steps`, `funnel_events`
- **Forms**: `forms`, `form_fields`, `form_submissions`
- **Social**: extensão de `social_accounts`, `social_posts`, `social_post_metrics`
- **Billing**: `plans`, `subscriptions`, `usage_counters`
- **Analytics**: `events` genérico (event-sourcing leve) + rollups diários por `brand_id`

## 13. Arquitetura de APIs

Continuar a ler/escrever CRUD direto do frontend via `supabase-js` + RLS (como hoje) — funciona bem e não vale a pena substituir. **Introduzir Supabase Edge Functions** só para o que precisa de segredos ou I/O externo: webhook do WhatsApp, envio de WhatsApp/Email, motor de automações (executado por `pg_cron`), publicação social (Meta Graph API), webhooks do Stripe. Chamado do frontend via `supabase.functions.invoke()`. Isto evita montar um servidor Node/infra nova — fica tudo dentro do mesmo projeto Supabase.

## 14. Arquitetura WhatsApp

Meta WhatsApp Cloud API oficial, por cliente:

- `whatsapp_accounts(brand_id, waba_id, phone_number_id, token_ref)` — o token real vive no Supabase Vault (ou variável de ambiente de Edge Function por enquanto), **nunca** numa coluna legível pelo frontend.
- Edge Function `whatsapp-webhook` recebe mensagens da Meta, valida assinatura, grava em `whatsapp_messages`, dispara evento de automação.
- Edge Function `whatsapp-send` envia mensagens/templates usando o token do `brand_id` correto.
- Regras da Meta a respeitar desde o início: janela de 24h para mensagens de sessão livre, templates pré-aprovados fora da janela, opt-in registado por contacto.

## 15. Arquitetura Email

Camada de abstração própria, ex. `sendEmail(brandId, to, templateId, variables)`, implementada inicialmente sobre um fornecedor (Resend é a recomendação — boa DX, verificação de domínio simples, webhooks de bounce/open). Trocar de fornecedor no futuro só implica reescrever a implementação por trás da função, nunca o código que a chama.

## 16. Arquitetura Social Media

Camada de abstração por **capacidade**, não por promessa genérica — cada plataforma tem uma API real diferente:

| Plataforma | Publicação direta oficial | Nota |
|---|---|---|
| Instagram/Facebook | Sim, via Meta Graph API (conta Business ligada a Página FB) | Caminho mais maduro, prioridade 1 |
| YouTube | Sim, via YouTube Data API v3 | Quota a gerir |
| TikTok | Limitada — Content Posting API sujeita a aprovação da TikTok | Pode ficar "preparar + publicar manualmente" até haver acesso aprovado |
| LinkedIn | Restrita ao Marketing Developer Platform (acesso por aprovação) | Idem |

Regra explícita (a tua, e correta): **nunca simular uma funcionalidade que a API não permite.** Quando a API não suporta publicação direta, a UI deve dizer isso claramente e oferecer "preparar conteúdo para publicação manual", não fingir que publicou.

**Agendamento e publicação automática:** posts com data/hora agendada não ficam só "guardados para depois" — a mesma arquitetura do motor de automações (secção 17) aplica-se aqui. Um Edge Function `social-publish`, agendado por `pg_cron` (ex. a cada minuto), procura posts com `status = 'scheduled'` e `scheduled_at` já passado, chama a API oficial da plataforma (Meta Graph API para Instagram/Facebook, YouTube Data API v3), e atualiza o registo para `published` (com o `platform_post_id` devolvido) ou `failed` (com o motivo). Um post só entra em `scheduled` depois de aprovado, quando a marca exigir aprovação do cliente antes de publicar. Nas plataformas sem API de publicação direta (TikTok/LinkedIn hoje), o post nunca passa por `scheduled` — fica `manual_only`, com lembrete para publicação manual, consistente com a regra de nunca simular o que não é real.

## 17. Arquitetura de automações

Não um motor BPMN pesado, nem um emaranhado de if/else — uma máquina de estados simples e orientada a dados:

`automations(trigger_type, trigger_config)` → `automation_steps(order, type: action|condition|wait, config, on_true, on_false)` → `automation_runs(contact_id, current_step, status, next_run_at)`.

Um Edge Function agendado por `pg_cron` (ex. a cada minuto) processa `automation_runs` cujo `next_run_at` já passou, executa o passo, avança. Cobre exatamente o exemplo que deste (esperar, verificar resposta, ramificar) sem hardcoding — cada automação é dados na tabela, não código novo.

## 18. Arquitetura de Funis/Landing Pages

Generalizar o motor do `link_pages` em vez de construir de novo: mesmo modelo de `blocks jsonb` + editor visual + página pública por slug, com vocabulário de blocos alargado (headline, imagem, vídeo, testemunho, preços, FAQ, formulário embutido). Um funil é uma sequência ordenada dessas páginas + `funnel_events` para tracking de conversão/UTM.

## 19. Arquitetura de Forms/Questionários

`forms` + `form_fields` (incluindo lógica condicional em `jsonb`) + `form_submissions`. Cada submissão cria/atualiza um `contacts`, aplica tags configuradas, e dispara um evento de automação — reutiliza o mesmo padrão de página pública por slug/embed já existente.

## 20. Arquitetura de Analytics

Tabela `events` genérica (`brand_id`, `type`, `payload jsonb`, `occurred_at`) alimentada por todos os módulos (email aberto, WhatsApp recebido, formulário submetido, negócio mudou de fase, métricas sociais). Um job agregado diário cria rollups por `brand_id`/dia para dashboards rápidos — usando `recharts`, que já é dependência do projeto. Dashboard da agência agrega entre marcas, exatamente como `PainelGlobal` já faz hoje para estado das marcas.

## 21. MVP recomendado

Pela lógica de "menor sistema robusto e vendável", eu priorizaria assim, ligeiramente diferente da tua ordem original (justificação: o público da Empower — moda, beleza, serviços — comunica primeiro por WhatsApp/Instagram, não por email):

1. **CRM core** — contactos, empresas, um pipeline configurável, tags, notas.
2. **WhatsApp Cloud API** — inbox, envio, templates, atribuição de conversas.
3. **Automações (versão enxuta)** — só os triggers/ações essenciais do teu exemplo.
4. **Formulários** — captação de lead, reutilizando o motor de páginas.
5. Só depois: Email, Funis/Landing Pages (reutilizando `link_pages`), Social, Billing.

Isto já é vendável como "EMPOWER OS Starter" a um cliente de moda/beleza muito antes de existirem website builder ou publicação social automática.

## 22. Funcionalidades que NÃO devemos construir inicialmente

- **Website builder completo** — concorre com Wordpress/Framer, esforço enorme, baixo retorno vs. o resto do roadmap. Adiar.
- **Editor visual de automações estilo BPMN** — começar com uma lista linear + ramificação simples; um editor de fluxograma visual é secção 21+.
- **Publicação nativa em TikTok/LinkedIn** — depende de aprovações externas fora do teu controlo; não bloquear o roadmap à espera disso.
- **Data warehouse / BI avançado** — os rollups da secção 20 chegam para a Fase 11.
- Nota: o schema atual tem um campo `ai_generated` em `proposals`/`presentations`, mas a auditoria **não encontrou nenhuma integração real de IA** (zero referências a OpenAI/Anthropic no código). Vale a pena perguntares à equipa/à Claude Code anterior o que era suposto isto fazer, antes de assumir que já existe geração por IA algures.

## 23. Dependências externas recomendadas

- **WhatsApp**: Meta WhatsApp Cloud API direta (avaliar um BSP como 360dialog/Twilio só se o volume/nº de contas o justificar).
- **Email**: Resend (ou Postmark) atrás da camada de abstração da secção 15.
- **Social**: Meta Graph API (Instagram/Facebook) primeiro; YouTube Data API v3 depois.
- **Billing**: Stripe Billing — subscrições, portal do cliente, upgrades/downgrades nativos.
- **Segredos**: Supabase Vault para tokens (WhatsApp, Meta, Stripe).
- **Automações**: `pg_cron` + Supabase Edge Functions — sem infraestrutura nova.

## 24. Custos potenciais

Estimativas, a confirmar com os planos atuais:

- Supabase: provavelmente necessário subir para o plano Pro (~$25/mês base) à medida que Edge Functions, cron e storage crescem.
- Vercel: já em uso, sem custo adicional relevante previsto no MVP.
- WhatsApp Cloud API: gratuita para as primeiras conversas/mês por número, depois por conversa — varia por país.
- Resend: tem plano gratuito generoso, depois por volume de emails.
- Stripe: sem mensalidade, ~2.9% + custo fixo por transação.
- Domínios/DNS para landing pages/websites de clientes: custo repassável ao cliente.

## 25. Riscos técnicos

- **Ficheiro único de 9 940 linhas sem code-splitting** — já gera um bundle de ~1.19MB. Continuar a acrescentar CRM+WhatsApp+Automações+Funis ao mesmo ficheiro tornaria o projeto insustentável. Recomendo dividir em módulos por ficheiro + `React.lazy` por rota, à medida que se constrói o EMPOWER OS — não é preciso reescrever o que já existe, só não continuar a engordar um único ficheiro.
- **Nenhuma camada de backend hoje** — WhatsApp/Email/Billing exigem segredos que não podem viver no frontend; é trabalho novo, não um ajuste.
- **Motor de automações** é o componente com maior risco de scope creep — manter deliberadamente simples (secção 17).
- **APIs de redes sociais mudam e têm aprovações externas** — não prometer prazos rígidos para TikTok/LinkedIn.

## 26. Riscos de segurança

- **Storage sem isolamento por tenant** (secção 3) — hoje qualquer conta autenticada pode ler/escrever em qualquer ficheiro dos 5 buckets. É uma falha existente, independente do EMPOWER OS, e recomendo corrigi-la em paralelo (políticas de storage por `brand_id`/path).
- **Regra inegociável para tabelas novas**: nenhuma tabela do EMPOWER OS entra em produção sem RLS escrita e testada no mesmo commit — seguir exatamente o padrão já auditado (`can_manage_brand`, `is_approver_of`) em vez de inventar um novo.
- **Segredos de WhatsApp/Email/Stripe**: nunca em colunas legíveis pelo frontend nem em `.env` client-side — só em Edge Functions/Vault.
- **Validação de webhooks** (Meta, Stripe): verificar assinatura sempre, rejeitar payloads não assinados.
- **Impersonação** (secção 11): só via RPC auditado, nunca como está hoje (troca de estado no cliente).

## 27. Estratégia de migração do white label atual

Migração módulo a módulo, não um "big bang":
1. Construir e validar internamente cada módulo (CRM → WhatsApp → Automações → ...) com a própria Empower como primeiro cliente.
2. Migrar os clientes atuais do white label módulo a módulo, começando pelo que causa mais dor/custo hoje (tipicamente CRM+WhatsApp).
3. Correr em paralelo (dados espelhados ou exportação) até haver confiança total antes de desligar o módulo equivalente no white label.
4. Só desligar o white label por completo quando não houver nenhuma funcionalidade crítica sem equivalente no EMPOWER OS.

## 28. Estratégia de integração com a aplicação operacional

Manter **uma só aplicação, um só login**, sem monorepo nem segunda app — pelo menos até isso deixar de bastar. Concretamente:
- Dividir `BigBossPrototype.jsx` em módulos por ficheiro (refactor de organização, não de arquitetura).
- Agrupar a navegação lateral em duas secções visuais: **"Operações"** (o que já existe) e **"Marketing OS"** (EMPOWER OS), sob a mesma marca Empower — o cliente nunca precisa de saber que tecnicamente é tudo a mesma app.
- Só considerar separar em múltiplos pacotes/apps (monorepo) se e quando a equipa ou a complexidade do código o exigirem de facto — não como decisão antecipada.

## 29. Ordem recomendada de desenvolvimento

Endosso a tua estrutura de 15 fases, com um único ajuste: trocar a ordem das Fases 4 e 5 (fazer **WhatsApp antes de Email**, pelas razões da secção 21) e tratar a Fase 2 ("Autenticação + multi-tenancy + permissões") como **extensão**, não construção — já está ~70% feita. Todas as outras fases mantêm-se como as definiste.

## 30. Recomendação final

**Opção D — Arquitetura híbrida integrada:**

- **Um só projeto Supabase** (mesma base de dados, mesma autenticação, mesmo modelo `agencies`/`brands`/`profiles`/RLS) — estendido com as tabelas novas do EMPOWER OS, nunca duplicado.
- **Uma só aplicação React/Vite**, reorganizada em módulos com code-splitting, navegação unificada em "Operações" + "Marketing OS" sob a marca Empower.
- **Uma nova camada de Supabase Edge Functions** — o único componente genuinamente novo em termos de infraestrutura — para tudo o que exige segredos ou I/O externo (WhatsApp, Email, Automações, Social, Billing).

Não escolho Opção A (aplicação separada) porque duplicaria auth e tenancy que já funcionam e já estão auditados. Não escolho Opção C (duas apps ligadas por API) porque a Big Boss e o EMPOWER OS partilham o mesmo conceito de cliente (`brands`) — ligá-los por API introduziria complexidade e latência sem nenhum benefício real, já que podem simplesmente partilhar a mesma tabela. A Opção D, tal como especificada aqui, dá-te uma experiência de plataforma única para o cliente, zero duplicação de sistemas críticos, e isola o risco novo (integrações externas) na única camada que genuinamente falta hoje.

---

## Adenda — Inbox Unificado (2026-09-03)

Ideia proposta depois do módulo de WhatsApp estar construído: um só ecrã onde a marca vê as mensagens de **todos** os canais que ligou — WhatsApp, Instagram, Messenger, Email — sem ter de abrir cada plataforma separadamente. É o padrão "unified inbox" do Front/HubSpot/HighLevel.

**O que é tecnicamente alcançável:**
- **WhatsApp** — já construído (`whatsapp_conversations`/`whatsapp_messages`, secção 14).
- **Instagram Direct e Messenger** — mesma Meta Graph API e o mesmo padrão de webhook que o WhatsApp, só com outro produto/permissão ativado na app Meta. Custo incremental baixo dado o que já existe.
- **Email** — hoje só está desenhado o envio (secção 15). Para entrar no inbox unificado é preciso também **receber** email (webhook de resposta do fornecedor), uma peça nova.
- **TikTok — excluído.** Não tem API oficial de mensagens diretas para apps de terceiros. Segue a mesma regra da secção 16: nunca simular um canal que a API não suporta; no máximo, um link "abrir no TikTok".

**Arquitetura recomendada:** não reescrever o que já existe. Cada canal mantém a sua própria tabela (`whatsapp_messages` fica exatamente como está); por cima constrói-se uma vista "Inbox Unificado" que agrega os contactos de todos os canais ligados num só ecrã — uma camada de leitura, não uma tabela nova a substituir as existentes.

**Onde entra no roadmap:** depois do WhatsApp Cloud API estar a funcionar de ponta a ponta em produção (não em paralelo) — Instagram/Messenger são uma aprovação separada na Meta e mais uma Edge Function cada, e só compensa investir nisso com o primeiro canal já validado.

---

## Adenda 2 — Agendamento/Marcações, Inbox Unificado (construído em 2026-09-23), e construtor de páginas (2026-09-18)

Depois de CRM, WhatsApp, Automações, Formulários, Email e Funis construídos, três pontos novos:

**1. Inbox Unificado — sobe de prioridade.** A Adenda 1 já descrevia isto; a referência trazida (a caixa de entrada partilhada de equipa de uma ferramenta como a HighLevel) confirma que deve ser o próximo passo a sério depois de Social Media, não uma ideia adiada indefinidamente. Arquitetura recomendada mantém-se: uma vista que agrega `whatsapp_messages` + `email_sends`/respostas por contacto, sem reescrever nenhum dos dois módulos.

**2. Novo módulo — Agendamento/Marcações — construído em 2026-09-18/19.** Não estava no desenho original. Algumas marcas (ex: um cabeleireiro) precisam de:
- Catálogo de serviços por marca: nome, preço, duração.
- Disponibilidade configurável (dias/horas em que cada serviço pode ser marcado).
- Ligação a calendários externos (Google Calendar, e possivelmente outros) para evitar sobreposição com compromissos já existentes fora do EMPOWER OS.
- Uma página pública de marcação por marca (mesmo padrão de página pública por slug já usado em todo o resto), onde o cliente final escolhe o serviço e o horário.

Arquitetura recomendada: novas tabelas `booking_services` (nome, preço, duração, brand_id), `booking_availability` (regras de disponibilidade), `booking_appointments` (marcações confirmadas, com `contact_id`), e uma integração OAuth com o Google Calendar (mais complexa que o padrão "cola o token" do WhatsApp/Email — Google Calendar exige OAuth de verdade, com refresh token, não um token estático colado uma vez). Prioridade e faseamento a decidir com o utilizador antes de começar — é um módulo do tamanho do WhatsApp ou do Email, não um extra pequeno.

**3. Construtor de Funis — removido (2026-09-23).** O feedback de que estava "fraquinho" (secção 18) levou a uma decisão diferente da inicialmente prevista: em vez de melhorar o construtor, o módulo de Funis/Landing Pages foi **removido por completo** — tabelas, rota pública e módulo — porque as landing pages passam a ser feitas diretamente na Wix. O motor de blocos por trás (partilhado com o Link na Bio) continua intacto; só esta aplicação concreta saiu.

**4. Módulos agrupados por categoria + visibilidade por cliente (2026-09-23).** Com CRM, WhatsApp, Automações, Formulários, Email, Inbox, Social, Agendamento e SMS todos construídos, a grelha de módulos dentro de cada marca tinha 16 blocos de uma vez. Passou a estar organizada em 4 grupos (Conteúdo, Comunicação, Vendas & Automação, Marca & Estratégia), e a agência pode agora escolher, por marca, quais desses módulos o cliente (papel aprovador) vê — a equipa continua sempre a ver tudo. É um primeiro passo informal na direção do conceito de "planos" (secção 24 do desenho original) — ainda não ligado a preços/Stripe, só a visibilidade.
