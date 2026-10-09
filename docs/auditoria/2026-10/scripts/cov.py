#!/usr/bin/env python3
"""Auditoria 2026-10 — mapa de testes por módulo (por importação; não é cobertura de linhas). Somente leitura: lê arquivos do repositório e imprime em stdout; não cria nem altera arquivos, não acessa rede nem banco.
Uso (na raiz do repositório):  python3 docs/auditoria/2026-10/scripts/cov.py
Saída: texto em stdout. Estimativa estática (regex), não substitui consulta ao banco vivo."""
import os
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),"..","..","..",".."))
import os,re,glob,collections
os.chdir(ROOT)
tests=[f for f in glob.glob("src/**/*.test.ts*",recursive=True)]
blob="\n".join(open(f,encoding="utf8",errors="ignore").read() for f in tests)
print("test files",len(tests))
byarea=collections.Counter(t.split("/")[1]+("/"+t.split("/")[2] if t.split("/")[1] in("components","features","lib") and len(t.split("/"))>3 else "") for t in tests)
print("tests by area (top):",byarea.most_common(14))
def loc(p): return sum(1 for _ in open(p,encoding="utf8",errors="ignore"))
def has_test(path):
    base=os.path.splitext(os.path.basename(path))[0]
    cand=[path.replace(".tsx",".test.tsx").replace(".ts",".test.ts"),os.path.splitext(path)[0]+".test.ts",os.path.splitext(path)[0]+".test.tsx"]
    if any(os.path.exists(c) for c in cand): return True
    rel=path[len("src/"):]; rel_noext=os.path.splitext(rel)[0]
    pats=['@/'+rel_noext, '/'+base+'"', '/'+base+"'"]
    return any(p in blob for p in pats)
lib=[f for f in glob.glob("src/lib/**/*.ts",recursive=True) if ".test." not in f and not f.endswith("types.ts")]
un=[(loc(f),f) for f in lib if not has_test(f)]
print("lib files",len(lib),"without any importing test",len(un),"LOC untested",sum(a for a,_ in un),"of",sum(loc(f) for f in lib))
print("untested lib (largest):",[(a,b.replace("src/lib/","")) for a,b in sorted(un,reverse=True)[:25]])
fn=[f for f in lib if f.endswith(".functions.ts")]
print("*.functions.ts",len(fn),"untested:",[f.replace("src/lib/","") for f in fn if not has_test(f)])
srv=[f for f in lib if f.endswith(".server.ts")]
print("*.server.ts",len(srv),"untested:",[f.replace("src/lib/","") for f in srv if not has_test(f)])
comp=[f for f in glob.glob("src/components/**/*.tsx",recursive=True) if ".test." not in f]
tc=[f for f in comp if has_test(f)]
print("components .tsx",len(comp),"with importing test",len(tc))
routes=[f for f in glob.glob("src/routes/**/*.ts*",recursive=True) if ".test." not in f and "routeTree" not in f and "README" not in f]
print("route files",len(routes),"with test",sum(1 for f in routes if has_test(f)))
# test titles count
its=len(re.findall(r"\b(?:it|test)(?:\.each\([^)]*\))?\(",blob))
print("approx it()/test() calls",its)
# skipped / todo
print("skipped/todo:",len(re.findall(r"\b(?:it|test|describe)\.(?:skip|todo)\b",blob)),"only:",len(re.findall(r"\b(?:it|test|describe)\.only\b",blob)))
