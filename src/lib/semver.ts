/** Comparação real de SemVer (`MAJOR.MINOR.PATCH`) — usada em vez de
 * igualdade/ordem de string (`"1.9.0" < "1.10.0"` como texto dá errado)
 * pra decidir se uma release publicada é realmente mais nova que a versão
 * da sessão atual. Sem dependência nova — é só aritmética de 3 inteiros. */
export type Semver = { major: number; minor: number; patch: number };

export function parseSemver(v: string): Semver | null {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(v.trim());
  if (!m) return null;
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) };
}

export function isValidSemver(v: string): boolean {
  return parseSemver(v) !== null;
}

/** `-1` se `a < b`, `0` se iguais, `1` se `a > b`. Lança se algum dos dois
 * não for um SemVer válido — chamar só depois de `isValidSemver`. */
export function compareSemver(a: string, b: string): -1 | 0 | 1 {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  if (!pa || !pb) throw new Error(`Versão inválida: "${!pa ? a : b}" (esperado MAJOR.MINOR.PATCH)`);
  if (pa.major !== pb.major) return pa.major > pb.major ? 1 : -1;
  if (pa.minor !== pb.minor) return pa.minor > pb.minor ? 1 : -1;
  if (pa.patch !== pb.patch) return pa.patch > pb.patch ? 1 : -1;
  return 0;
}

export function bumpSemver(current: string, kind: "patch" | "minor" | "major"): string {
  const p = parseSemver(current);
  if (!p) throw new Error(`Versão atual inválida: "${current}"`);
  if (kind === "major") return `${p.major + 1}.0.0`;
  if (kind === "minor") return `${p.major}.${p.minor + 1}.0`;
  return `${p.major}.${p.minor}.${p.patch + 1}`;
}
