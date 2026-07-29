# Big Boss — Backend (Supabase)

Este é o backend real da plataforma: base de dados, autenticação e
armazenamento de ficheiros. Foi pensado para quem não programa —
segue os passos por ordem.

No final, vais ter um link e uma "chave" que entregas ao Claude Code
para ligar isto ao protótipo visual que já construímos.

---

## 1. Criar a conta e o projeto

1. Vai a **supabase.com** e cria uma conta gratuita (podes entrar com o GitHub ou com email).
2. Clica em **"New project"**.
3. Dá-lhe o nome `big-boss`, escolhe uma password forte para a base de dados (guarda-a num sítio seguro) e a região mais próxima (ex: `eu-west` — Europa).
4. Espera 1-2 minutos até o projeto ficar pronto.

---

## 2. Criar as tabelas (a base de dados)

1. No menu da esquerda, abre **SQL Editor**.
2. Clica em **"New query"**.
3. Abre o ficheiro `01_schema.sql` (neste pacote), copia todo o conteúdo, cola no editor e clica em **Run**.
4. Repete exatamente o mesmo para, por esta ordem:
   - `02_rls_policies.sql`
   - `03_public_access.sql`
   - `04_seed.sql`

Se algum passo der erro, não avances — copia a mensagem de erro e mostra-me ou ao Claude Code, é normalmente qualquer coisa pequena (ex: correu duas vezes o mesmo ficheiro).

Ao fim disto já tens: todas as tabelas criadas, as regras de quem pode ver/editar o quê, e a Biamelo + 3 marcas de exemplo já lá dentro.

---

## 3. Criar os "espaços" para ficheiros (logos, imagens, vídeos)

1. No menu da esquerda, abre **Storage**.
2. Cria estes 4 "buckets" (clica em "New bucket" para cada um), todos como **público**:
   - `brand-logos`
   - `content-media` (imagens/vídeos de posts, reels, stories)
   - `portfolio-media` (imagens do portfólio)
   - `link-media` (fotos/vídeos da Link na Bio)

Não precisas de configurar mais nada aqui — o Claude Code trata do resto quando ligar o upload de ficheiros.

---

## 4. Criar os primeiros utilizadores (para testares os perfis)

1. No menu da esquerda, abre **Authentication → Users**.
2. Clica em **"Add user"** e cria, por exemplo, estes 2 para começar:
   - `admin@biamelo.com` — a tua conta principal
   - `cliente@harmoniae.com` — para testares como fica a vista de um cliente aprovador
3. Depois de criares cada um, volta ao **SQL Editor**, e corre isto (troca o email pelo que usaste, e troca o `role` conforme o utilizador):

```sql
insert into profiles (id, name, email, role, agency_id, brand_ids)
select id, 'Admin Biamelo', email, 'admin_geral', null, '{}'
from auth.users where email = 'admin@biamelo.com';

insert into profiles (id, name, email, role, agency_id, brand_ids)
select id, 'Cliente Harmoniae', email, 'aprovador_marca', null,
       array['00000000-0000-0000-0000-000000000101']::uuid[]
from auth.users where email = 'cliente@harmoniae.com';
```

Os perfis possíveis são: `admin_geral`, `membro`, `aprovador_marca`, `agencia_admin`, `agencia_membro`, `agencia_aprovador` (estão todos explicados no documento técnico que já tínhamos feito).

---

## 5. Ir buscar as "chaves" para ligar ao protótipo

1. No menu da esquerda, abre **Project Settings → API**.
2. Vais precisar de guardar 2 valores desta página:
   - **Project URL**
   - **anon public key**

Entrega estes 2 valores ao Claude Code (nunca os partilhes publicamente num repositório — mas para ligares o frontend, são precisos).

---

## O que falta depois disto (trabalho do Claude Code)

Este pacote dá-te a base de dados pronta e funcional, mas ainda falta:

- Instalar o cliente do Supabase no projeto React e trocar os dados mock (`useState(BRANDS)`, etc.) por chamadas reais à base de dados.
- Ligar o formulário de login real (já temos o ecrã, falta ligá-lo à autenticação do Supabase).
- Ligar os uploads de ficheiros (logo, imagens, vídeos) aos "buckets" de Storage criados no passo 3.
- Substituir as funções de aprovar/reprovar por chamadas RPC mais seguras (há uma nota técnica sobre isto no fim do ficheiro `02_rls_policies.sql`).
- Publicar a aplicação nalgum lado (ex: Vercel) para teres um link real.

Quando fores para o Claude Code, mostra-lhe esta pasta toda (os 4 ficheiros `.sql` + este README) e o ficheiro `BigBossPrototype.jsx` — ele vai perceber exatamente o que já existe e o que falta ligar.
