import {
  DELETION_PATH,
  PRIVACY_CONTROLLER,
  PRIVACY_POLICY_UPDATED_AT,
} from "@/lib/privacy-policy-config";
import { A, P, Pending, Section, UL } from "./legal-ui";
import { dataLonga } from "./format-date";

const SECTIONS: { id: string; title: string }[] = [
  { id: "controlador", title: "1. Quem somos" },
  { id: "abrangencia", title: "2. A quem e a que esta política se aplica" },
  { id: "dados", title: "3. Dados pessoais que tratamos" },
  { id: "finalidades", title: "4. Para que usamos os dados e em que base legal" },
  { id: "google", title: "5. Integração com Google (Google Agenda)" },
  { id: "meta", title: "6. Meta, Facebook e Instagram" },
  { id: "compartilhamento", title: "7. Com quem os dados são tratados" },
  { id: "transferencia", title: "8. Transferência internacional" },
  { id: "seguranca", title: "9. Segurança" },
  { id: "retencao", title: "10. Retenção e exclusão" },
  { id: "direitos", title: "11. Seus direitos" },
  { id: "exclusao-de-dados", title: "12. Como pedir a exclusão dos seus dados" },
  { id: "cookies", title: "13. Cookies e armazenamento no navegador" },
  { id: "atualizacoes", title: "14. Atualizações desta política" },
];

/** Texto integral da política. Server-rendered (sem depender de JS) e escrito só com o que a
 * auditoria do código confirmou; o que não pôde ser confirmado aparece como pendência ou limitação. */
export function PrivacyPolicyContent() {
  const c = PRIVACY_CONTROLLER;
  return (
    <article lang="pt-BR" className="space-y-10">
      <header className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Política de Privacidade
        </h1>
        <p className="text-sm text-text-secondary">
          Última atualização:{" "}
          <time dateTime={PRIVACY_POLICY_UPDATED_AT}>{dataLonga(PRIVACY_POLICY_UPDATED_AT)}</time>
        </p>
        <P>
          Esta política explica como a {c.nomeComercial} trata dados pessoais no site institucional
          e na Plataforma VNH, em conformidade com a Lei Geral de Proteção de Dados (Lei nº
          13.709/2018, LGPD). Descrevemos o que a plataforma faz hoje; funcionalidades em teste ou
          futuras são identificadas como tal.
        </P>
        <nav aria-label="Índice" className="rounded-lg border border-border p-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-text-secondary">
            Nesta página
          </p>
          <ol className="grid gap-1 text-sm sm:grid-cols-2">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  className="text-text-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                >
                  {s.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>
      </header>

      <Section id="controlador" title="1. Quem somos">
        <P>O controlador dos dados é:</P>
        <UL>
          <li>
            Nome empresarial: {c.razaoSocial ?? <Pending>razão social</Pending>} (nome comercial:{" "}
            {c.nomeComercial})
          </li>
          <li>CNPJ: {c.cnpj ?? <Pending>CNPJ</Pending>}</li>
          {c.endereco && <li>Endereço: {c.endereco}</li>}
          {c.telefone && <li>Telefone: {c.telefone}</li>}
          <li>
            Contato para assuntos de privacidade:{" "}
            {c.canalPrivacidade ? (
              <a
                href={`mailto:${c.canalPrivacidade}`}
                className="font-medium text-foreground underline underline-offset-2 hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                {c.canalPrivacidade}
              </a>
            ) : (
              <Pending>canal de contato para privacidade</Pending>
            )}
          </li>
          <li>
            Atendimento aos titulares:{" "}
            {c.encarregado ?? "pelo canal de contato acima, com resposta dentro do prazo legal"}
          </li>
        </UL>
      </Section>

      <Section id="abrangencia" title="2. A quem e a que esta política se aplica">
        <P>Ela vale para:</P>
        <UL>
          <li>
            o site institucional <strong>vocenohype.com.br</strong>;
          </li>
          <li>
            a <strong>Plataforma VNH</strong> (plataforma.vocenohype.com.br), usada pela equipe
            interna e, no portal, por clientes;
          </li>
          <li>
            as páginas públicas da plataforma acessadas por link (por exemplo, inscrição de
            influenciadores, pesquisas de satisfação, convites e descadastro de e-mails).
          </li>
        </UL>
        <P>
          As pessoas cujos dados tratamos são: integrantes da equipe, usuários do portal de
          clientes, contatos de clientes e de leads comerciais, influenciadores e criadores de
          conteúdo, signatários de contratos e destinatários de e-mails de campanha.
        </P>
      </Section>

      <Section id="dados" title="3. Dados pessoais que tratamos">
        <P>
          <strong>Fornecidos diretamente por você ou pela sua empresa</strong>
        </P>
        <UL>
          <li>
            Conta e acesso: e-mail, senha (tratada pelo serviço de autenticação), nome, foto, status
            de presença e permissões.
          </li>
          <li>
            Leads comerciais, recebidos de formulários integrados à plataforma: nome, telefone,
            e-mail, empresa, cargo, segmento, orçamento mensal, urgência e experiência com agências.
          </li>
          <li>
            Clientes e contatos: dados de empresas e de pessoas de contato, campanhas, projetos,
            tarefas, reuniões, arquivos e anexos, lançamentos financeiros e metas.
          </li>
          <li>
            Influenciadores e criadores: nome, contato, @ e links de redes sociais informados,
            métricas informadas, dados de pagamento (como chave PIX e dados bancários), CPF/CNPJ,
            entregas, respostas a pesquisas de satisfação e dados de contrato.
          </li>
          <li>Mensagens e arquivos trocados no chat e nas conversas por chamada.</li>
          <li>
            Senhas e credenciais que usuários internos guardam no cofre da plataforma (o campo
            sensível é criptografado antes de ser gravado).
          </li>
        </UL>
        <P>
          <strong>Gerados pelo uso da plataforma</strong>
        </P>
        <UL>
          <li>
            Registros de segurança e de administração de acessos (quem fez qual ação e quando, como
            convites, alterações de permissão e tentativas de login) e contadores de tentativas para
            impedir abuso, que usam o e-mail informado.
          </li>
          <li>
            Registro de tempo de trabalho em tarefas, indicadores de desempenho operacional da
            equipe e métricas agregadas de tempo de resposta (sem exibir o conteúdo das mensagens).
          </li>
          <li>Assinatura de notificações push do navegador, quando você ativa esse recurso.</li>
          <li>
            Eventos de e-mails de campanha (entrega, abertura e clique), recebidos do provedor de
            e-mail.
          </li>
        </UL>
        <P>
          <strong>Recebidos de serviços externos autorizados</strong>
        </P>
        <UL>
          <li>
            Google Agenda, somente se você conectar sua conta (seção 5): eventos da sua agenda e o
            e-mail da conta conectada.
          </li>
          <li>
            Assinatura eletrônica (Autentique): estado da assinatura de contratos. Esta integração
            está <strong>em implementação e teste</strong>; ainda não é usada com dados reais de
            contratos.
          </li>
        </UL>
        <P>
          Não coletamos dados pessoais sensíveis (art. 5º, II, da LGPD) como finalidade. Se você os
          inserir em campos livres, trataremos como informação de contexto e o acesso continua
          restrito à equipe autorizada.
        </P>
      </Section>

      <Section id="finalidades" title="4. Para que usamos os dados e em que base legal">
        <UL>
          <li>
            <strong>Prestar a plataforma e os serviços contratados</strong> (autenticar usuários,
            gerir campanhas, projetos, reuniões, chat, financeiro e portal do cliente) — execução de
            contrato ou de procedimentos preliminares a pedido do titular (art. 7º, V).
          </li>
          <li>
            <strong>Relacionamento comercial</strong> (responder leads e propostas) — procedimentos
            preliminares a pedido do titular (art. 7º, V) e legítimo interesse (art. 7º, IX).
          </li>
          <li>
            <strong>Contratar e pagar influenciadores</strong>, emitir e guardar contratos e
            comprovantes — execução de contrato (art. 7º, V), cumprimento de obrigação legal ou
            regulatória (art. 7º, II) e exercício regular de direitos (art. 7º, VI).
          </li>
          <li>
            <strong>Segurança, prevenção a fraudes e abuso, auditoria de acessos</strong> — legítimo
            interesse (art. 7º, IX) e, quando exigido, obrigação legal.
          </li>
          <li>
            <strong>Melhorar a operação</strong> (indicadores internos e pesquisas de satisfação) —
            legítimo interesse (art. 7º, IX).
          </li>
          <li>
            <strong>Notificações push, conexão com o Google Agenda e comunicações opcionais</strong>{" "}
            — consentimento (art. 7º, I), que você pode retirar a qualquer momento.
          </li>
        </UL>
        <P>
          Não usamos seus dados para publicidade comportamental e não os vendemos. Não usamos os
          dados para treinar modelos de inteligência artificial; os insights da plataforma são
          cálculos determinísticos sobre dados da própria operação.
        </P>
      </Section>

      <Section id="google" title="5. Integração com Google (Google Agenda)">
        <P>
          A plataforma oferece, de forma opcional, a conexão da sua conta Google para sincronizar
          reuniões com o Google Agenda. É a única integração com APIs do Google em uso. Não
          acessamos Gmail, Drive, Contatos, YouTube nem outros produtos Google.
        </P>
        <UL>
          <li>
            <strong>Permissões solicitadas:</strong> <code>calendar.events</code> (ver e editar
            eventos na sua agenda), <code>openid</code> e <code>email</code> (identificar qual conta
            Google foi conectada).
          </li>
          <li>
            <strong>Dados acessados:</strong> eventos da agenda principal (título, descrição, local,
            data e hora, participantes com nome, e-mail e resposta de presença, link de videochamada
            e identificadores do evento) e o e-mail da conta conectada. A importação considera uma
            janela de 2 dias anteriores a 45 dias à frente.
          </li>
          <li>
            <strong>Para que servem:</strong> criar, atualizar e cancelar na sua agenda as reuniões
            marcadas na plataforma (os convidados recebem os convites do Google) e trazer para a
            plataforma os eventos da sua agenda dentro da janela acima, refletindo respostas de
            presença e cancelamentos.
          </li>
          <li>
            <strong>Quem vê:</strong> eventos importados da sua agenda só aparecem para você, para
            os participantes do evento e para administradores da plataforma.
          </li>
          <li>
            <strong>Armazenamento:</strong> guardamos os tokens de acesso e renovação da conexão em
            uma tabela acessível apenas pelo servidor da plataforma (nunca pelo navegador). Os
            eventos importados ficam na área de reuniões da plataforma.
          </li>
          <li>
            <strong>Compartilhamento:</strong> não transferimos esses dados a terceiros para
            publicidade ou outros fins. Eles são tratados apenas pelos operadores de infraestrutura
            descritos na seção 7 e pelo próprio Google. Não há leitura humana desses dados, salvo
            para suporte solicitado por você, segurança ou obrigação legal.
          </li>
          <li>
            <strong>Revogação:</strong> em Configurações → Integrações, use “Desconectar”; isso
            revoga o acesso junto ao Google e apaga a conexão. Você também pode revogar em{" "}
            <A href="https://myaccount.google.com/permissions">myaccount.google.com/permissions</A>.
            Reuniões já importadas permanecem na plataforma até serem excluídas (veja a seção 10).
          </li>
        </UL>
        <P>
          O uso e a transferência, para qualquer outro aplicativo, de informações recebidas das APIs
          do Google obedecerão à{" "}
          <A href="https://developers.google.com/terms/api-services-user-data-policy">
            Política de Dados do Usuário dos Serviços de API do Google
          </A>
          , incluindo os requisitos de Uso Limitado (Limited Use).
        </P>
      </Section>

      <Section id="meta" title="6. Meta, Facebook e Instagram">
        <P>
          <strong>Hoje a Plataforma VNH não se conecta às APIs da Meta</strong> (Facebook ou
          Instagram), não pede login com Facebook e não acessa mensagens, comentários, publicações
          ou métricas dessas redes por integração. Os @ e links de perfis do Instagram que aparecem
          na plataforma são informados manualmente pela equipe ou pelos próprios influenciadores, e
          as métricas exibidas são as informadas.
        </P>
        <P>
          Se uma integração com a Meta for habilitada no futuro, esta seção será atualizada antes do
          uso, com as permissões solicitadas, as finalidades, a retenção e o processo de exclusão
          correspondentes. Pedidos de exclusão enviados pela Meta já são recebidos e tratados (seção
          12).
        </P>
      </Section>

      <Section id="compartilhamento" title="7. Com quem os dados são tratados">
        <P>
          Para operar a plataforma usamos fornecedores que tratam dados em nosso nome (operadores)
          e, no caso do Google, o serviço com o qual você escolhe se conectar. Compartilhamos
          somente o necessário para cada finalidade:
        </P>
        <UL>
          <li>Supabase: banco de dados, autenticação, armazenamento de arquivos e tempo real.</li>
          <li>Vercel: hospedagem e execução da aplicação.</li>
          <li>
            Resend: envio de e-mails de campanha e de acesso (como convites) e eventos de entrega.
          </li>
          <li>
            Google: apenas se você conectar o Google Agenda (seção 5). Serviços de notificação push
            dos navegadores: quando você ativa esse recurso.
          </li>
          <li>
            Autentique: assinatura eletrônica de contratos (integração em teste; ainda sem uso com
            dados reais).
          </li>
          <li>
            Serviço de retransmissão de chamadas (TURN) e ferramentas de formulário e automação
            (como Make), que enviam leads à plataforma e recebem os artigos de blog publicados por
            ela.
          </li>
        </UL>
        <P>
          Também podemos compartilhar dados quando a lei exigir, por ordem de autoridade, ou para o
          exercício regular de direitos. Não prometemos que os dados “nunca saem” da{" "}
          {c.nomeComercial}: eles são tratados por esses operadores, sob as finalidades acima.
        </P>
      </Section>

      <Section id="transferencia" title="8. Transferência internacional">
        <P>
          Alguns fornecedores acima (por exemplo, Vercel, Resend, Google e a infraestrutura de banco
          de dados) podem tratar dados em servidores fora do Brasil. Quando isso ocorre, a
          transferência se apoia nas hipóteses do art. 33 da LGPD, em especial a execução de
          contrato e a adoção de cláusulas contratuais e garantias oferecidas pelos fornecedores. As
          regiões exatas de armazenamento e as salvaguardas contratuais de cada fornecedor serão
          detalhadas aqui após confirmação formal; não as declaramos sem comprovação.
        </P>
      </Section>

      <Section id="seguranca" title="9. Segurança">
        <P>Adotamos, entre outras, as seguintes medidas:</P>
        <UL>
          <li>autenticação por e-mail e senha, com verificação em duas etapas disponível;</li>
          <li>
            controle de acesso por permissões e regras de segurança no banco de dados (por pessoa,
            equipe e tipo de conta);
          </li>
          <li>acesso de contas de clientes separado do acesso da equipe interna;</li>
          <li>limitação de tentativas de login e recuperação de senha;</li>
          <li>registro de ações administrativas e de acesso;</li>
          <li>conexão criptografada (HTTPS) com a plataforma;</li>
          <li>
            criptografia do campo sensível do cofre de senhas e acesso temporário controlado a ele;
          </li>
          <li>tokens de integrações mantidos apenas no servidor.</li>
        </UL>
        <P>
          Nenhum sistema é totalmente seguro. Em caso de incidente que possa causar risco ou dano
          relevante, comunicaremos os titulares e a autoridade competente conforme a LGPD.
        </P>
      </Section>

      <Section id="retencao" title="10. Retenção e exclusão">
        <P>
          Guardamos os dados pelo tempo necessário para a finalidade e pelos prazos de guarda legais
          ou contratuais (por exemplo, registros financeiros e contratos), para a segurança e para o
          exercício regular de direitos. Ainda não definimos prazos únicos de retenção por
          categoria; quando definidos, serão publicados aqui.
        </P>
        <UL>
          <li>
            <strong>Exclusão de conta:</strong> a conta de integrante da equipe é removida pela
            administração da plataforma; registros que a lei, um contrato ou a segurança exijam
            manter permanecem pelo prazo aplicável.
          </li>
          <li>
            <strong>Exclusão de dados pessoais:</strong> atendida mediante solicitação (seção 12),
            ressalvadas as hipóteses de conservação do art. 16 da LGPD.
          </li>
          <li>
            <strong>Revogação de permissões de terceiros:</strong> a desconexão do Google Agenda
            revoga o acesso e apaga os tokens; notificações push podem ser desativadas no navegador.
          </li>
          <li>
            <strong>Dados recebidos por integrações:</strong> reuniões importadas do Google não são
            apagadas automaticamente ao desconectar; podem ser excluídas a seu pedido. Eventos muito
            distantes da janela de importação são removidos automaticamente.
          </li>
        </UL>
      </Section>

      <Section id="direitos" title="11. Seus direitos">
        <P>
          Nos termos do art. 18 da LGPD, você pode solicitar: confirmação de que tratamos seus
          dados; acesso; correção; anonimização, bloqueio ou eliminação de dados desnecessários ou
          tratados em desconformidade; portabilidade; informação sobre com quem compartilhamos;
          informação sobre a possibilidade de não consentir e suas consequências; e revogação do
          consentimento. Você também pode peticionar à Autoridade Nacional de Proteção de Dados
          (ANPD).
        </P>
        <P>
          Para exercer esses direitos, use o canal da seção 1:{" "}
          {c.canalPrivacidade ?? <Pending>canal de contato para privacidade</Pending>}. Podemos
          pedir informações para confirmar sua identidade.
        </P>
      </Section>

      <Section id="exclusao-de-dados" title="12. Como pedir a exclusão dos seus dados">
        <P>
          Envie o pedido ao canal de privacidade da seção 1 informando o e-mail da sua conta ou o
          nome do cadastro e quais dados quer excluir (por exemplo, a conta, os dados de uma
          integração ou o conteúdo de uma campanha). Confirmaremos a solicitação, excluiremos o que
          for cabível e informaremos o que precisa ser mantido e por quê. As instruções completas e
          o acompanhamento de pedidos estão em <A href={DELETION_PATH}>{DELETION_PATH}</A>.
        </P>
        <P>
          Pedidos de exclusão enviados pela Meta chegam a um endpoint próprio, que valida a
          assinatura da Meta, registra o pedido com um código de confirmação e procura dados
          vinculados àquela identidade antes de concluir. Como a plataforma não guarda
          identificadores da Meta hoje, a conclusão informa que não havia dados vinculados; se
          houver no futuro, eles serão excluídos sem apagar a conta de uma empresa cliente ou de
          outras pessoas.
        </P>
      </Section>

      <Section id="cookies" title="13. Cookies e armazenamento no navegador">
        <P>
          A Plataforma VNH não usa cookies de publicidade nem ferramentas de análise ou rastreamento
          de terceiros. Para funcionar, usa o armazenamento local do navegador (localStorage e
          IndexedDB) para manter sua sessão, preferências (como tema e menu), cache de dados e a
          instalação como aplicativo (PWA). Esses dados ficam no seu dispositivo e podem ser
          apagados nas configurações do navegador, o que encerra a sessão.
        </P>
        <P>
          Este levantamento cobre a Plataforma VNH. Os cookies do site institucional
          vocenohype.com.br, que é um projeto separado, serão descritos após a verificação desse
          site.
        </P>
      </Section>

      <Section id="atualizacoes" title="14. Atualizações desta política">
        <P>
          Atualizamos esta política quando mudarmos o tratamento de dados, as integrações ou a
          legislação aplicável, e alteramos a data no topo da página. Mudanças relevantes serão
          comunicadas por meios adequados. Dúvidas: use o canal da seção 1.
        </P>
      </Section>
    </article>
  );
}
