/**
 * Contrato de um provedor de assinatura eletrônica (Autentique hoje; D4Sign ou outro amanhã).
 * O domínio de contratos só conhece ESTA interface — nunca GraphQL, multipart ou nomes do provedor.
 * Tipos puros: nada aqui importa código de servidor.
 */

/** Papéis dos dois signatários do contrato de influenciador (sem testemunhas). */
export type SignerRole = "CONTRATADO" | "CONTRATANTE";

export type SignerSpec = {
  role: SignerRole;
  name: string;
  email: string;
  /** Só dígitos; quando informado, só quem tem esse CPF consegue assinar. */
  cpf?: string;
  /** Telefone com DDI (+55...), usado só se a verificação por SMS for pedida. */
  phone?: string;
  /** Verificação extra (cobrada à parte): por padrão, só o link por e-mail. */
  extraVerification?: "sms";
};

export type CreateSignatureDocumentInput = {
  /** Nome interno do documento (inclui o id do nosso contrato — serve para reconciliar órfãos). */
  name: string;
  file: { bytes: Uint8Array; fileName: string; mimeType: string };
  /** A ordem do array É a ordem de assinatura quando `sequential`. */
  signers: SignerSpec[];
  sequential: boolean;
  /** Documento de teste: não consome crédito e é apagado pelo provedor depois de alguns dias. */
  sandbox?: boolean;
  message?: string;
  /** Posição das assinaturas (percentual, página começando em 1). Sem isso, vale o padrão do provedor. */
  signaturePositions?: Partial<Record<SignerRole, { x: number; y: number; page: number }>>;
};

export type ProviderSigner = {
  /** Identificador do signatário no provedor. */
  externalId: string;
  /** Papel nosso, achado pelo e-mail; `null` = assinatura que NÃO é de nenhum signatário que enviamos. */
  role: SignerRole | null;
  name: string | null;
  email: string | null;
  /** Ação no provedor (ex.: SIGN). */
  action: string | null;
  /** O e-mail já corresponde a uma conta do provedor. */
  hasAccount: boolean;
  /** Link de assinatura, se o provedor o devolveu. */
  link: string | null;
};

export type CreatedSignatureDocument = {
  externalId: string;
  signers: ProviderSigner[];
};

/** Estado NORMALIZADO do documento no provedor (o domínio mapeia isto para seus próprios estados). */
export type SignatureDocumentState =
  | "aguardando" // criado e enviado, ninguém terminou
  | "parcial" // alguém assinou, faltam outros
  | "assinado" // todos assinaram
  | "recusado" // alguém recusou
  | "cancelado"; // apagado/cancelado no provedor

export type SignerProgress = {
  externalId: string;
  email: string | null;
  viewed: boolean;
  signed: boolean;
  rejected: boolean;
  signedAt: string | null;
};

export type SignatureDocumentSnapshot = {
  externalId: string;
  state: SignatureDocumentState;
  signers: SignerProgress[];
  /** URL do arquivo final assinado, quando existir. */
  signedFileUrl: string | null;
};

/** Falhas com código estável, sem texto do provedor, token ou conteúdo do documento. */
export type SignatureErrorCode =
  | "not_configured"
  | "unauthorized"
  | "rate_limited"
  | "unavailable"
  | "timeout"
  | "invalid_signer"
  | "invalid_file"
  | "no_credits"
  | "not_found"
  | "rejected_by_provider";

export class SignatureProviderError extends Error {
  constructor(
    public readonly code: SignatureErrorCode,
    message: string,
    /** Seguro tentar de novo? (rede/limite/indisponível) */
    public readonly retryable = false,
  ) {
    super(message);
    this.name = "SignatureProviderError";
  }
}

export interface SignatureProvider {
  readonly name: string;
  /** Cria o documento com os signatários e já o ENVIA para assinatura (um passo só no Autentique). */
  createAndSend(input: CreateSignatureDocumentInput): Promise<CreatedSignatureDocument>;
  getDocument(externalId: string): Promise<SignatureDocumentSnapshot>;
  /** Cancela/apaga o documento no provedor. */
  cancelDocument(externalId: string): Promise<void>;
}
