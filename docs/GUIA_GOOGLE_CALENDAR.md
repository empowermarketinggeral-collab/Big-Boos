# Guia — Google Agenda das profissionais (evitar conflitos nas marcações)

Cada profissional liga o **seu** Google Agenda ao Big Boss. A partir daí:

- **Google → Big Boss:** o que ela tem ocupado no Google Agenda (reuniões, consultas, férias, eventos pessoais) deixa de aparecer como horário livre na página de marcação e na app das clientes. A leitura é feita de 5 em 5 minutos e, por cima disso, no momento exato da marcação a função confirma ao vivo no Google (se a Google não responder, a marcação segue — nunca trava por causa dela).
- **Big Boss → Google:** as marcações confirmadas passam a aparecer como eventos no Google Agenda dela (opcional, ela ou a equipa podem desligar).

A profissional **não precisa de conta no Big Boss**: a equipa gera um link pessoal, ela abre-o, escolhe a conta Google e autoriza. Só isso.

Fazes isto uma vez (cerca de 15–20 minutos) e serve para todas as marcas e profissionais.

---

## 1. Criar o projeto na Google Cloud

1. Vai a **console.cloud.google.com** e cria um projeto (ex: `Big Boss`).
2. **APIs & Services → Library** → procura **Google Calendar API** → **Enable**.

## 2. Ecrã de consentimento OAuth

1. **APIs & Services → OAuth consent screen** (ou "Google Auth Platform"). Tipo **External**.
2. Nome da app (o que a profissional vê ao autorizar — ex: `Big Boss`), email de suporte, email de contacto.
3. **Scopes** — adiciona exatamente estes:
   - `https://www.googleapis.com/auth/calendar.freebusy` (ver só ocupado/livre, sem ver os títulos dos eventos)
   - `https://www.googleapis.com/auth/calendar.events` (criar/atualizar/apagar os eventos das marcações)
   - `openid` e `.../auth/userinfo.email` (mostrar qual conta está ligada)
4. **Publicar a app (muito importante):** em **Publishing status** muda de *Testing* para **In production**.
   Em *Testing* a Google **expira a autorização ao fim de 7 dias** e as profissionais teriam de voltar a ligar todas as semanas. Só aguenta bem em *In production*.

### O que esperar da Google (honestamente)

- Estes scopes são "sensíveis". Enquanto a app **não for verificada pela Google**, ao autorizar a profissional vê o aviso *"A Google não validou esta aplicação"* (ela clica em **Avançadas → Ir para Big Boss**) e há um **limite de 100 utilizadoras**.
- Para tirar o aviso e o limite, pede a **verificação** no mesmo ecrã (precisa de política de privacidade, domínio e um vídeo curto a mostrar o uso dos scopes). Demora de dias a algumas semanas. Para começar com poucas profissionais, funciona sem verificação.
- Para a ligação funcionar só com `calendar.freebusy` (sem escrever eventos), a profissional pode desmarcar a caixa dos eventos no ecrã da Google — o Big Boss aceita e desliga automaticamente o "escrever no Google".

## 3. Credenciais OAuth

1. **APIs & Services → Credentials → Create credentials → OAuth client ID**.
2. Tipo: **Web application**.
3. **Authorized redirect URIs** — adiciona exatamente:
   `https://<o-teu-projeto>.supabase.co/functions/v1/google-calendar-oauth`
   (o `<o-teu-projeto>` é o mesmo que aparece nos outros endereços das funções.)
4. Guarda o **Client ID** e o **Client Secret**.

## 4. Segredos no Supabase

**Edge Functions → Secrets**:

| Nome | Valor |
|---|---|
| `GOOGLE_CLIENT_ID` | o Client ID |
| `GOOGLE_CLIENT_SECRET` | o Client Secret |
| `GOOGLE_STATE_SECRET` | (opcional) um texto longo aleatório; sem ele usa o Client Secret |

## 5. Instalar no Supabase (por esta ordem)

1. **SQL Editor:** corre `supabase/84_google_calendar.sql` (tabelas, políticas, cron de 5 em 5 minutos).
2. **Edge Functions** (colar o `index.ts` de cada uma):
   - `google-calendar-connect` — **Verify JWT: ligado**
   - `google-calendar-oauth` — **Verify JWT: desligado**
   - `google-calendar-sync` — **Verify JWT: desligado** (só aceita a chave service role; é o cron que a chama)
3. **Voltar a colar** (alteradas) `booking-availability` e `booking-create` — **Verify JWT: desligado**, como antes.
4. A app (frontend) sai com o `git push`.

---

## Como a equipa usa

1. **Agendamento → Profissionais → Editar** a profissional → secção **Google Agenda** → **Gerar link para ligar**.
2. Copia o link e envia-o à profissional (WhatsApp, por exemplo). O link é pessoal, de uso único e dura 7 dias.
3. Ela abre o link → **Continuar com a Google** → escolhe a conta e autoriza → vê "Google Agenda ligado".
4. No painel da profissional aparece a conta ligada, a última sincronização e o interruptor **Escrever as marcações no Google Agenda**.
5. **Desligar** remove a ligação, apaga os eventos futuros que o Big Boss criou e revoga o acesso na Google.

Se a profissional revogar o acesso na conta Google (ou a Google o expirar), o estado passa a **"precisa de voltar a ligar"**, a agência recebe **uma** notificação e basta gerar um link novo. Até lá, o que já estava sincronizado deixa de ser atualizado, mas as marcações continuam a funcionar.

## Limites a ter em conta

- Só o calendário **principal** (`primary`) da conta é lido e escrito.
- Atraso de até ~5 minutos entre algo mudar no Google e o Big Boss saber — a confirmação ao vivo no momento de marcar cobre esse intervalo.
- Mudar ou apagar à mão, no Google, um evento criado pelo Big Boss **não altera** a marcação; a marcação manda. Se a mudares no Big Boss, o evento acompanha.
- Os eventos incluem nome, telemóvel e email da cliente (aparecem no calendário da profissional). Se não quiseres isso, desliga **Escrever as marcações**.
- O token de acesso fica no Vault do Supabase; o browser nunca o vê.
