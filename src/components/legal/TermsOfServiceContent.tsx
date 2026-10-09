import {
  PRIVACY_CONTROLLER,
  PRIVACY_POLICY_URL_PATH,
  TERMS_FORO,
  TERMS_UPDATED_AT,
} from "@/lib/privacy-policy-config";
import { A, P, Pending, Section, UL } from "./legal-ui";
import { dataLonga } from "./format-date";

const SECTIONS: { id: string; title: string }[] = [
  { id: "aceitacao", title: "1. Aceitação e quem somos" },
  { id: "servico", title: "2. O que é a Plataforma VNH" },
  { id: "acesso", title: "3. Quem pode usar e como se obtém acesso" },
  { id: "conta", title: "4. Sua conta e a segurança do acesso" },
  { id: "uso", title: "5. Uso permitido e condutas proibidas" },
  { id: "conteudo", title: "6. Conteúdo e dados que você insere" },
  { id: "integracoes", title: "7. Integrações com terceiros" },
  { id: "propriedade", title: "8. Propriedade intelectual" },
  { id: "disponibilidade", title: "9. Disponibilidade e mudanças na plataforma" },
  { id: "contratacao", title: "10. Preços e contratos comerciais" },
  { id: "suspensao", title: "11. Suspensão e encerramento" },
  { id: "responsabilidade", title: "12. Limites de responsabilidade" },
  { id: "privacidade", title: "13. Privacidade e proteção de dados" },
  { id: "alteracoes", title: "14. Alterações destes Termos" },
  { id: "lei", title: "15. Lei aplicável e foro" },
  { id: "contato", title: "16. Contato" },
];

/** Termos de Serviço da Plataforma VNH. Escritos só com o que a auditoria do código confirmou
 * (acesso por convite/cadastro da administração, módulos existentes, integrações reais); o que
 * depende de decisão jurídica (foro) aparece como marcador, nunca como valor inventado. */
export function TermsOfServiceContent() {
  const c = PRIVACY_CONTROLLER;
  return (
    <article lang="pt-BR" className="space-y-10">
      <header className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">Termos de Serviço</h1>
        <p className="text-sm text-text-secondary">
          Última atualização: <time dateTime={TERMS_UPDATED_AT}>{dataLonga(TERMS_UPDATED_AT)}</time>
        </p>
        <P>
          Estes Termos regulam o uso da Plataforma VNH (plataforma.vocenohype.com.br), do portal de
          clientes e das páginas públicas associadas. Ao entrar na plataforma ou usar um link
          público dela, você declara que leu e concorda com estes Termos e com a{" "}
          <a
            href={PRIVACY_POLICY_URL_PATH}
            className="font-medium text-foreground underline underline-offset-2 hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            Política de Privacidade
          </a>
          . Se não concordar, não utilize a plataforma.
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

      <Section id="aceitacao" title="1. Aceitação e quem somos">
        <P>
          A Plataforma VNH é oferecida por {c.razaoSocial ?? <Pending>razão social</Pending>}
          {c.cnpj ? `, CNPJ ${c.cnpj}` : ""} (“{c.nomeComercial}”, “nós”)
          {c.endereco ? `, com sede em ${c.endereco}` : ""}.
        </P>
      </Section>

      <Section id="servico" title="2. O que é a Plataforma VNH">
        <P>
          É um sistema de gestão usado pela {c.nomeComercial} e por seus clientes para organizar a
          operação de campanhas com influenciadores e serviços de marketing. Conforme as permissões
          de cada pessoa, a plataforma reúne módulos como clientes, campanhas, projetos e tarefas,
          reuniões, comercial (leads), financeiro, time, banco de influenciadores, metas, chat e
          portal do cliente para acompanhar aprovações, arquivos e resultados. Algumas páginas são
          acessadas por link, sem login (por exemplo, inscrição de influenciadores, pesquisas de
          satisfação e descadastro de e-mails).
        </P>
        <P>
          Funcionalidades marcadas como em teste ou em desenvolvimento, como a assinatura eletrônica
          de contratos, podem não estar disponíveis ou mudar sem aviso.
        </P>
      </Section>

      <Section id="acesso" title="3. Quem pode usar e como se obtém acesso">
        <UL>
          <li>
            A plataforma não tem cadastro aberto ao público. O acesso é concedido pela{" "}
            {c.nomeComercial}: por convite ou por cadastro feito por um administrador, com
            permissões definidas para cada pessoa.
          </li>
          <li>
            Contas de cliente acessam apenas o portal do cliente; contas da equipe acessam os
            módulos liberados pelas suas permissões.
          </li>
          <li>
            Você precisa ter capacidade legal para aceitar estes Termos e, se usar a plataforma em
            nome de uma empresa, ter poderes para representá-la.
          </li>
          <li>
            Links públicos servem só à finalidade para a qual foram enviados e não devem ser
            compartilhados com quem não for o destinatário.
          </li>
        </UL>
      </Section>

      <Section id="conta" title="4. Sua conta e a segurança do acesso">
        <UL>
          <li>
            A conta é pessoal e intransferível. Guarde suas credenciais, não as compartilhe e troque
            a senha temporária no primeiro acesso.
          </li>
          <li>
            Ative a verificação em duas etapas quando disponível. Você responde pelas ações feitas
            com a sua conta, salvo se comprovar que houve acesso indevido sem culpa sua.
          </li>
          <li>
            Avise-nos imediatamente, pelo canal da seção 16, se suspeitar de uso não autorizado.
          </li>
          <li>
            Credenciais de terceiros guardadas no cofre da plataforma só podem ser usadas para a
            finalidade profissional autorizada.
          </li>
        </UL>
      </Section>

      <Section id="uso" title="5. Uso permitido e condutas proibidas">
        <P>
          Você deve usar a plataforma apenas para fins profissionais lícitos e, em especial, não
          pode:
        </P>
        <UL>
          <li>
            acessar dados, contas, clientes ou campanhas que não estejam liberados para você, nem
            tentar burlar permissões;
          </li>
          <li>
            testar vulnerabilidades, sobrecarregar, copiar em massa ou fazer engenharia reversa da
            plataforma, salvo autorização escrita;
          </li>
          <li>
            inserir conteúdo ilícito, ofensivo, que viole direitos de terceiros ou dados pessoais
            sem base legal;
          </li>
          <li>usar a plataforma para enviar spam ou comunicações sem base legal;</li>
          <li>
            usar dados pessoais obtidos na plataforma para finalidade diferente da que justificou o
            acesso;
          </li>
          <li>inserir código malicioso ou interferir no funcionamento da plataforma.</li>
        </UL>
      </Section>

      <Section id="conteudo" title="6. Conteúdo e dados que você insere">
        <UL>
          <li>
            Você (ou a sua empresa) continua titular do conteúdo e dos dados que insere, e declara
            ter o direito de inseri-los, inclusive dados de terceiros como contatos, influenciadores
            e signatários.
          </li>
          <li>
            Você nos autoriza a armazenar, processar e exibir esse conteúdo apenas na medida
            necessária para operar a plataforma e prestar os serviços contratados, nos termos da
            Política de Privacidade.
          </li>
          <li>
            Você responde pela licitude e exatidão do que insere. Podemos remover conteúdo que viole
            estes Termos ou a lei, ou por ordem de autoridade.
          </li>
          <li>
            Mensagens e arquivos do chat e dos módulos ficam acessíveis conforme as permissões do
            ambiente; não use a plataforma para informações que não devam ser vistas por quem tem
            esse acesso.
          </li>
        </UL>
      </Section>

      <Section id="integracoes" title="7. Integrações com terceiros">
        <P>
          A plataforma pode se conectar a serviços de terceiros, como o Google Agenda, se você optar
          por conectar sua conta. Essas conexões são opcionais, seguem os termos do terceiro
          correspondente e podem ser desfeitas por você a qualquer momento (para o Google, em
          Configurações → Integrações ou nas permissões da sua conta Google). Não nos
          responsabilizamos por indisponibilidade ou mudanças nos serviços de terceiros. O
          tratamento dos dados dessas integrações está descrito na{" "}
          <a
            href={PRIVACY_POLICY_URL_PATH}
            className="font-medium text-foreground underline underline-offset-2 hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            Política de Privacidade
          </a>
          .
        </P>
      </Section>

      <Section id="propriedade" title="8. Propriedade intelectual">
        <P>
          A plataforma, seu código, design, marcas e documentação pertencem à {c.nomeComercial} ou a
          seus licenciantes. Concedemos a você uma licença limitada, revogável, não exclusiva e
          intransferível de uso, apenas enquanto tiver acesso autorizado. Nada nestes Termos
          transfere propriedade intelectual da plataforma. O conteúdo de clientes, influenciadores e
          terceiros continua sujeito aos direitos de seus titulares e aos contratos aplicáveis.
        </P>
      </Section>

      <Section id="disponibilidade" title="9. Disponibilidade e mudanças na plataforma">
        <P>
          Trabalhamos para manter a plataforma disponível, mas não garantimos funcionamento
          ininterrupto ou livre de erros: pode haver manutenção, falhas e indisponibilidade de
          fornecedores. Podemos atualizar, alterar ou descontinuar funcionalidades. Sempre que
          possível, avisaremos mudanças relevantes. Mantenha cópias do que for essencial para você.
        </P>
      </Section>

      <Section id="contratacao" title="10. Preços e contratos comerciais">
        <P>
          Estes Termos não criam, por si, obrigação de pagamento. Os serviços de marketing, as
          condições comerciais, os valores e os prazos são regidos por proposta, contrato ou acordo
          específico entre a {c.nomeComercial} e o cliente, que prevalece sobre estes Termos no que
          tratar de forma diferente de assuntos comerciais.
        </P>
      </Section>

      <Section id="suspensao" title="11. Suspensão e encerramento">
        <UL>
          <li>
            Podemos suspender ou encerrar um acesso, de imediato, em caso de violação destes Termos,
            risco à segurança, ordem de autoridade ou fim da relação que justificava o acesso (por
            exemplo, desligamento da equipe ou encerramento do contrato).
          </li>
          <li>
            Você pode pedir o encerramento da sua conta pelo canal da seção 16. A exclusão de contas
            e de dados segue a Política de Privacidade, respeitados os prazos de guarda legais e
            contratuais.
          </li>
          <li>
            Disposições que, por natureza, devam continuar valendo (propriedade intelectual,
            responsabilidade, lei aplicável) permanecem após o encerramento.
          </li>
        </UL>
      </Section>

      <Section id="responsabilidade" title="12. Limites de responsabilidade">
        <P>
          Na extensão permitida pela lei, a plataforma é fornecida “como está”. Não prometemos que
          ela atenderá a todas as suas necessidades nem garantimos resultados de campanhas, alcance,
          vendas ou desempenho de influenciadores, que dependem de fatores fora do nosso controle.
          Não respondemos por danos indiretos, lucros cessantes ou perdas decorrentes de uso
          indevido da conta, de conteúdo inserido por usuários, de falhas de terceiros ou de caso
          fortuito e força maior. Nada nestes Termos exclui responsabilidades que a lei não permita
          limitar nem direitos assegurados por lei, inclusive os de titulares de dados.
        </P>
      </Section>

      <Section id="privacidade" title="13. Privacidade e proteção de dados">
        <P>
          O tratamento de dados pessoais segue a Lei Geral de Proteção de Dados e está descrito na{" "}
          <a
            href={PRIVACY_POLICY_URL_PATH}
            className="font-medium text-foreground underline underline-offset-2 hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            Política de Privacidade
          </a>
          , que faz parte destes Termos. Quando você inserir dados pessoais de terceiros, é
          responsável por ter base legal para isso; os papéis de controlador e operador em cada caso
          podem ser detalhados no contrato comercial.
        </P>
      </Section>

      <Section id="alteracoes" title="14. Alterações destes Termos">
        <P>
          Podemos atualizar estes Termos para refletir mudanças na plataforma, nas integrações ou na
          lei. A versão vigente é a publicada nesta página, com a data de atualização no topo.
          Mudanças relevantes serão comunicadas por meios adequados; continuar usando a plataforma
          depois da atualização significa concordar com a nova versão.
        </P>
      </Section>

      <Section id="lei" title="15. Lei aplicável e foro">
        <P>
          Estes Termos são regidos pelas leis da República Federativa do Brasil. Fica eleito o foro{" "}
          {TERMS_FORO ?? <Pending>foro (comarca) eleito pela empresa</Pending>} para dirimir
          controvérsias, ressalvadas as hipóteses em que a lei determine foro diverso.
        </P>
      </Section>

      <Section id="contato" title="16. Contato">
        <P>
          Dúvidas sobre estes Termos, pedidos de encerramento de conta e avisos de uso indevido:{" "}
          {c.canalPrivacidade ? (
            <A href={`mailto:${c.canalPrivacidade}`}>{c.canalPrivacidade}</A>
          ) : (
            <Pending>canal de contato</Pending>
          )}
          {c.telefone ? ` · ${c.telefone}` : ""}.
        </P>
      </Section>
    </article>
  );
}
