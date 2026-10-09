#!/usr/bin/env python3
"""Auditoria 2026-10 — heurística de autorização em server functions com service-role. Somente leitura: lê arquivos do repositório e imprime em stdout; não cria nem altera arquivos, não acessa rede nem banco.
Uso (na raiz do repositório):  python3 docs/auditoria/2026-10/scripts/authz.py
Saída: texto em stdout. Estimativa estática (regex), não substitui consulta ao banco vivo."""
import os
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),"..","..","..",".."))
import os,re,glob
os.chdir(ROOT)
AUTHZ=re.compile(r"assertAdmin|has_permission|is_admin|requireAdmin|isAdmin|assertMember|assertCan|assertInternal|is_internal_team_member|assertPermission|requirePermission|assert[A-Z]\w+\(",re.I)
rows=[]
for f in sorted(glob.glob("src/lib/**/*.functions.ts",recursive=True)):
    t=open(f,encoding="utf8").read()
    parts=re.split(r"(?=export const \w+\s*=\s*createServerFn)",t)
    for p in parts[1:]:
        name=re.match(r"export const (\w+)",p).group(1)
        auth="requireSupabaseAuth" in p.split(".handler(")[0]
        body=p
        admin="supabaseAdmin" in body or "buildInstagramDeps" in body or "buildDeps" in body
        rows.append((f.replace("src/lib/",""),name,auth,admin,bool(AUTHZ.search(body)),"context.userId" in body or "context.claims" in body))
print("total",len(rows))
print("\nAUTH + service-role + NO authz keyword (manual review candidates):")
for r in rows:
    if r[2] and r[3] and not r[4]: print("  ",r[0],r[1],"(uses userId)" if r[5] else "(NO userId use)")
print("\nAUTH, RLS-scoped only (context.supabase):",sum(1 for r in rows if r[2] and not r[3]))
print("AUTH + service-role:",sum(1 for r in rows if r[2] and r[3]))
