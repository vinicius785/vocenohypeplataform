import { todayIsoInBrasilia } from "@/lib/timezone";

/**
 * Banco de palavras do Termo — lista curada, compacta, só palavras comuns
 * de 5 letras SEM acento (decisão explícita: evita toda a ambiguidade de
 * teclado físico x virtual com teclas mortas de acento nesta primeira
 * versão — documentado, não é um bug). Reaproveitada tanto como respostas
 * quanto como tentativas aceitas (mesma lista para as duas coisas nesta
 * entrega — simplificação aceita para não depender de um dicionário maior
 * nem de API externa a cada tentativa).
 */
export const TERMO_WORDS: readonly string[] = [
  "CASAS",
  "LIVRO",
  "CARRO",
  "PRATO",
  "FESTA",
  "MOEDA",
  "NOITE",
  "DENTE",
  "PONTE",
  "FONTE",
  "GENTE",
  "MONTE",
  "CORTE",
  "PARTE",
  "FORTE",
  "NORTE",
  "MORTE",
  "SORTE",
  "VERDE",
  "ARROZ",
  "LEITE",
  "FRUTA",
  "PLANO",
  "CAMPO",
  "TEMPO",
  "GRUPO",
  "MUNDO",
  "FUNDO",
  "JUNTO",
  "PONTO",
  "CANTO",
  "SANTO",
  "MANTO",
  "TANTO",
  "BANCO",
  "PRETO",
  "CLARO",
  "LARGO",
  "CURTO",
  "RASTO",
  "GOSTO",
  "CUSTO",
  "JUSTO",
  "ROSTO",
  "POSTO",
  "RESTO",
  "TESTE",
  "FALHA",
  "LINHA",
  "MINHA",
  "VINHA",
  "GALHO",
  "BOLHA",
  "FOLHA",
  "MOLHO",
  "CARTA",
  "PORTA",
  "HORTA",
  "CORDA",
  "GORDA",
  "CALDA",
  "SALDO",
  "CALMO",
  "FIRME",
  "DOCES",
  "FELIZ",
  "BRAVO",
  "SUAVE",
  "GRAVE",
  "NOIVA",
  "NOIVO",
  "CHUVA",
  "NUVEM",
  "TERRA",
  "PEDRA",
  "AREIA",
  "PRAIA",
  "GRAMA",
  "MATAS",
  "LAGOS",
  "MARES",
  "BARCO",
  "MOTOR",
  "RODAS",
  "FREIO",
  "VOLTA",
  "ANDAR",
  "FALAR",
  "PULAR",
  "NADAR",
  "SUBIR",
  "ABRIR",
  "OLHAR",
  "PODER",
  "SABER",
  "FAZER",
  "LEVAR",
  "FICAR",
  "ESTAR",
  "PARAR",
  "MUDAR",
  "CRIAR",
  "LUTAR",
  "JOGAR",
  "PAPEL",
  "TELHA",
  "CHAVE",
  "FECHO",
  "LETRA",
  "FRASE",
  "TEXTO",
  "LIVRE",
  "CALMA",
  "VELHO",
  "JOVEM",
  "IDOSO",
  "LINDO",
  "CHATO",
  "LEGAL",
  "LENTO",
  "IGUAL",
];

const ACCEPTED_GUESSES: ReadonlySet<string> = new Set(TERMO_WORDS);

export function isAcceptedGuess(word: string): boolean {
  return ACCEPTED_GUESSES.has(normalizeWord(word));
}

/** Remove acentos e força maiúsculas — mesma regra usada tanto pra
 * entrada de teclado físico quanto virtual, nunca comportamentos
 * diferentes entre os dois. */
export function normalizeWord(word: string): string {
  return word.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().trim();
}

function hashStringToSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Palavra do dia — determinística a partir da data (fuso da organização),
 * mesma resposta pra todo mundo no mesmo dia, sem guardar nada em banco. */
export function todayTermoAnswer(dateKey: string = todayIsoInBrasilia()): string {
  const idx = hashStringToSeed(`termo:${dateKey}`) % TERMO_WORDS.length;
  return TERMO_WORDS[idx];
}

export function todayTermoKey(): string {
  return todayIsoInBrasilia();
}
