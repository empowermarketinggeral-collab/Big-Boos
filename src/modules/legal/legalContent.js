// Texto das páginas públicas /privacidade e /termos (PT e EN).
// Os dados do responsável ficam aqui, num só sítio.
export const LEGAL = {
  product: "Big Boss",
  company: "Empower Marketing",
  contactEmail: "empowermarketing.geral@gmail.com",
  updated: { pt: "6 de outubro de 2026", en: "6 October 2026" },
};

const L = LEGAL;

export const PRIVACY = {
  pt: {
    title: "Política de Privacidade",
    intro: `Esta política explica que dados pessoais o ${L.product} trata, porquê, e que direitos tem sobre eles. O ${L.product} é uma plataforma de gestão para agências de marketing e para os seus clientes, operada pela ${L.company}.`,
    sections: [
      { title: "1. Quem é o responsável", body: [`A ${L.company} é responsável pelo tratamento dos dados da conta de quem usa o ${L.product}. Quando uma agência ou uma marca coloca na plataforma dados dos seus próprios clientes (contactos, marcações, mensagens), essa agência ou marca é a responsável por esses dados e a ${L.company} trata-os por sua conta, como subcontratante.`, `Contacto para qualquer questão de privacidade: ${L.contactEmail}.`] },
      { title: "2. Dados que tratamos", body: [
        { list: [
          "Conta: nome, email, função e marcas a que tem acesso.",
          "Conteúdo que a agência e as marcas inserem: contactos, marcações, mensagens, formulários, contratos, imagens e ficheiros.",
          "Pagamentos: são processados pelo Stripe. Não guardamos números de cartão.",
          "Técnicos: endereço IP e dispositivo quando assina um contrato, registos de segurança e de erros.",
        ] },
      ] },
      { title: "3. Google Agenda (profissionais que ligam o seu calendário)", body: [
        "Uma profissional de uma marca pode ligar o seu Google Agenda ao Big Boss, a convite da equipa e através de um link pessoal. A ligação serve para evitar marcações em cima de compromissos que ela já tem.",
        { list: [
          "Acesso pedido: ver apenas se está ocupada ou livre (calendar.freebusy), sem aceder ao título nem aos detalhes dos seus eventos; e criar, atualizar e apagar os eventos que o próprio Big Boss cria para as marcações (calendar.events). Também lemos o email da conta Google para mostrar qual conta está ligada.",
          "O que guardamos: o email da conta, um token de renovação do acesso (cifrado no cofre do nosso fornecedor de base de dados e nunca visível no browser), os períodos em que está ocupada nos próximos 60 dias (apenas início e fim, sem descrição), e a ligação entre cada marcação e o evento criado. Os períodos antigos são apagados automaticamente.",
          "Para que usamos: apenas para mostrar horários livres corretos e, se a opção estiver ligada, para colocar as marcações confirmadas no seu calendário. Não usamos estes dados para publicidade, nem para treinar modelos de inteligência artificial, e não os vendemos nem partilhamos com terceiros.",
          "Os eventos criados pelo Big Boss incluem o nome, o telemóvel e o email da cliente da marcação, para a profissional saber quem vem. A equipa pode desligar a escrita de eventos a qualquer momento.",
          "Como desligar e apagar: na área da profissional no Big Boss (Desligar), ou em myaccount.google.com/permissions. Ao desligar, revogamos o acesso na Google, apagamos o token, os períodos ocupados guardados e os eventos futuros que criámos.",
        ] },
        "A utilização e a transferência para qualquer outra aplicação de informação recebida das APIs da Google respeitará a Política de Dados de Utilizador dos Serviços API da Google, incluindo os requisitos de Utilização Limitada.",
      ] },
      { title: "4. Para que usamos os dados e com que fundamento", body: [
        { list: [
          "Prestar o serviço contratado (execução do contrato).",
          "Segurança, prevenção de abusos e resolução de problemas (interesse legítimo).",
          "Cumprir obrigações legais, incluindo faturação.",
          "Enviar comunicações que pediu ou que a agência configurou, quando existe consentimento ou outro fundamento válido.",
        ] },
      ] },
      { title: "5. Com quem partilhamos", body: [
        "Usamos fornecedores que tratam dados por nossa conta e só para prestar o serviço: Supabase (base de dados, autenticação e ficheiros), Vercel (alojamento da aplicação), Stripe (pagamentos), Twilio e Meta (SMS e WhatsApp, quando a marca os liga), Resend (email), Google (Agenda e redes sociais, quando ligados). Alguns fornecedores estão fora do Espaço Económico Europeu e a transferência apoia-se em cláusulas contratuais-tipo ou decisões de adequação.",
        "Não vendemos dados pessoais.",
      ] },
      { title: "6. Quanto tempo guardamos", body: ["Enquanto a conta estiver ativa e o necessário para cumprir obrigações legais. Quando uma marca ou conta é eliminada, apagamos os respetivos dados num prazo razoável, salvo o que a lei nos obrigue a conservar."] },
      { title: "7. Segurança", body: ["Acesso por conta e permissões por marca, comunicação cifrada (HTTPS), segredos de integrações no cofre da base de dados, ficheiros em armazenamento privado com ligações temporárias. Nenhum sistema é infalível; se ocorrer uma violação que o afete, comunicamos como a lei exige."] },
      { title: "8. Os seus direitos", body: [`Pode pedir acesso, retificação, apagamento, limitação, oposição e portabilidade dos seus dados, e retirar um consentimento a qualquer momento, escrevendo para ${L.contactEmail}. Pode também apresentar reclamação à Comissão Nacional de Proteção de Dados (www.cnpd.pt).`] },
      { title: "9. Cookies e armazenamento local", body: ["Usamos apenas o armazenamento estritamente necessário: manter a sessão iniciada e lembrar a escolha de tema claro ou escuro. Não usamos cookies de publicidade."] },
      { title: "10. Alterações", body: ["Podemos atualizar esta política. A data da última atualização está no topo e, em mudanças importantes, avisamos na plataforma."] },
    ],
  },
  en: {
    title: "Privacy Policy",
    intro: `This policy explains which personal data ${L.product} processes, why, and what rights you have. ${L.product} is a management platform for marketing agencies and their clients, operated by ${L.company}.`,
    sections: [
      { title: "1. Who is responsible", body: [`${L.company} is the controller of the account data of people who use ${L.product}. When an agency or brand stores data about its own customers (contacts, bookings, messages), that agency or brand is the controller and ${L.company} processes the data on its behalf as a processor.`, `Contact for any privacy question: ${L.contactEmail}.`] },
      { title: "2. Data we process", body: [
        { list: [
          "Account: name, email, role and the brands you can access.",
          "Content entered by agencies and brands: contacts, bookings, messages, forms, contracts, images and files.",
          "Payments: processed by Stripe. We do not store card numbers.",
          "Technical: IP address and device when you sign a contract, security and error logs.",
        ] },
      ] },
      { title: "3. Google Calendar (professionals who connect their calendar)", body: [
        "A professional working for a brand can connect their Google Calendar to Big Boss, when invited by the team through a personal link. The connection exists to avoid bookings that overlap commitments they already have.",
        { list: [
          "Access requested: seeing only whether you are busy or free (calendar.freebusy), without access to the titles or details of your events; and creating, updating and deleting the events that Big Boss itself creates for bookings (calendar.events). We also read the email of the Google account to show which account is connected.",
          "What we store: the account email, a refresh token (encrypted in our database provider's vault and never exposed to the browser), the time ranges in which you are busy over the next 60 days (start and end only, no description), and the link between each booking and the event we created. Old ranges are deleted automatically.",
          "What we use it for: only to show correct available times and, if the option is on, to place confirmed bookings in your calendar. We do not use this data for advertising, we do not use it to train artificial intelligence or machine learning models, and we do not sell it or share it with third parties.",
          "Events created by Big Boss include the customer's name, phone and email so the professional knows who is coming. The team can switch event writing off at any time.",
          "How to disconnect and delete: in the professional's area in Big Boss (Disconnect), or at myaccount.google.com/permissions. On disconnect we revoke the access at Google and delete the token, the stored busy ranges and the future events we created.",
        ] },
        "Big Boss's use and transfer to any other app of information received from Google APIs will adhere to the Google API Services User Data Policy, including the Limited Use requirements.",
      ] },
      { title: "4. Why we use data and on what basis", body: [
        { list: [
          "To provide the contracted service (performance of a contract).",
          "Security, abuse prevention and troubleshooting (legitimate interest).",
          "Legal obligations, including invoicing.",
          "Communications you requested or that the agency configured, where there is consent or another valid basis.",
        ] },
      ] },
      { title: "5. Who we share it with", body: [
        "We use providers that process data on our behalf and only to deliver the service: Supabase (database, authentication and files), Vercel (application hosting), Stripe (payments), Twilio and Meta (SMS and WhatsApp, when a brand connects them), Resend (email), Google (Calendar and social networks, when connected). Some providers are outside the European Economic Area; transfers rely on standard contractual clauses or adequacy decisions.",
        "We do not sell personal data.",
      ] },
      { title: "6. How long we keep it", body: ["While the account is active and as needed to meet legal obligations. When a brand or account is deleted we delete its data within a reasonable period, except what the law requires us to keep."] },
      { title: "7. Security", body: ["Account-based access and per-brand permissions, encrypted transport (HTTPS), integration secrets in the database vault, files in private storage with temporary links. No system is infallible; if a breach affects you, we will notify as the law requires."] },
      { title: "8. Your rights", body: [`You may request access, rectification, erasure, restriction, objection and portability of your data, and withdraw consent at any time, by writing to ${L.contactEmail}. You may also lodge a complaint with the Portuguese data protection authority (CNPD, www.cnpd.pt).`] },
      { title: "9. Cookies and local storage", body: ["We only use strictly necessary storage: keeping you signed in and remembering your light or dark theme choice. We do not use advertising cookies."] },
      { title: "10. Changes", body: ["We may update this policy. The date of the last update is at the top and, for important changes, we will notify you on the platform."] },
    ],
  },
};

export const TERMS = {
  pt: {
    title: "Termos de Serviço",
    intro: `Estes termos regem a utilização do ${L.product}, operado pela ${L.company}. Ao criar uma conta ou usar a plataforma, aceita estes termos.`,
    sections: [
      { title: "1. O serviço", body: [`O ${L.product} é uma plataforma para agências de marketing gerirem marcas e clientes: conteúdos, redes sociais, CRM, comunicação, agendamento, contratos e faturação. As funcionalidades disponíveis dependem do plano contratado.`] },
      { title: "2. Contas", body: ["É responsável por manter a confidencialidade das suas credenciais e pela atividade na sua conta. Deve fornecer informação verdadeira e comunicar-nos de imediato qualquer uso não autorizado."] },
      { title: "3. Utilização aceitável", body: [{ list: [
        "Não use a plataforma para fins ilegais, para enviar spam ou mensagens sem o consentimento exigido por lei.",
        "Não tente aceder a dados de outras agências ou marcas, nem comprometer a segurança do serviço.",
        "Respeite os termos dos serviços de terceiros que ligar (Google, Meta, Twilio, Stripe e outros).",
      ] }] },
      { title: "4. Subscrição e pagamentos", body: ["Alguns planos são pagos e cobrados através do Stripe, nos valores e periodicidade indicados na contratação. A falta de pagamento pode levar à suspensão do acesso depois de aviso prévio. Os valores podem ser atualizados com aviso antecipado."] },
      { title: "5. Dados e conteúdo", body: [`Os dados e conteúdos que insere continuam a ser seus (ou da sua agência ou marca). Concede-nos apenas a licença necessária para os tratar e mostrar no âmbito do serviço. As agências e marcas são responsáveis por terem fundamento legal e consentimento para os dados pessoais dos seus clientes que carregam. O tratamento de dados pessoais descreve-se na Política de Privacidade.`] },
      { title: "6. Integrações de terceiros", body: ["Pode ligar serviços como o Google Agenda, Meta, Twilio ou Stripe. Essas ligações dependem dos termos e da disponibilidade desses serviços e podem ser desligadas por si a qualquer momento."] },
      { title: "7. Disponibilidade e responsabilidade", body: ["Esforçamo-nos por manter o serviço disponível e seguro, mas não garantimos funcionamento ininterrupto nem ausência de erros. Na medida permitida pela lei, não respondemos por danos indiretos nem por perdas de lucros, e a nossa responsabilidade total limita-se ao valor pago nos 12 meses anteriores ao facto."] },
      { title: "8. Cessação", body: ["Pode deixar de usar o serviço e pedir a eliminação da conta quando quiser. Podemos suspender ou encerrar contas que violem estes termos."] },
      { title: "9. Lei aplicável", body: ["Estes termos regem-se pela lei portuguesa. Os litígios são submetidos aos tribunais portugueses competentes, sem prejuízo dos direitos que a lei reconhece aos consumidores."] },
      { title: "10. Contacto", body: [`Questões sobre estes termos: ${L.contactEmail}.`] },
    ],
  },
  en: {
    title: "Terms of Service",
    intro: `These terms govern the use of ${L.product}, operated by ${L.company}. By creating an account or using the platform you accept these terms.`,
    sections: [
      { title: "1. The service", body: [`${L.product} is a platform for marketing agencies to manage brands and clients: content, social media, CRM, communication, booking, contracts and invoicing. Available features depend on the plan.`] },
      { title: "2. Accounts", body: ["You are responsible for keeping your credentials confidential and for activity on your account. Provide accurate information and tell us immediately about any unauthorised use."] },
      { title: "3. Acceptable use", body: [{ list: [
        "Do not use the platform for unlawful purposes, spam, or messages without the consent required by law.",
        "Do not try to access data of other agencies or brands, or compromise the security of the service.",
        "Respect the terms of third-party services you connect (Google, Meta, Twilio, Stripe and others).",
      ] }] },
      { title: "4. Subscription and payments", body: ["Some plans are paid and charged through Stripe, at the prices and frequency stated at purchase. Non-payment may lead to suspension of access after prior notice. Prices may be updated with advance notice."] },
      { title: "5. Data and content", body: ["The data and content you enter remain yours (or your agency's or brand's). You grant us only the licence needed to process and display them as part of the service. Agencies and brands are responsible for having a legal basis and consent for the personal data of their customers they upload. Personal data processing is described in the Privacy Policy."] },
      { title: "6. Third-party integrations", body: ["You may connect services such as Google Calendar, Meta, Twilio or Stripe. These connections depend on those services' terms and availability and you can disconnect them at any time."] },
      { title: "7. Availability and liability", body: ["We work to keep the service available and secure but do not guarantee uninterrupted operation or freedom from errors. To the extent permitted by law, we are not liable for indirect damages or lost profits, and our total liability is limited to the amount paid in the 12 months before the event."] },
      { title: "8. Termination", body: ["You may stop using the service and request deletion of your account at any time. We may suspend or close accounts that breach these terms."] },
      { title: "9. Governing law", body: ["These terms are governed by Portuguese law. Disputes are submitted to the competent Portuguese courts, without prejudice to consumers' statutory rights."] },
      { title: "10. Contact", body: [`Questions about these terms: ${L.contactEmail}.`] },
    ],
  },
};
