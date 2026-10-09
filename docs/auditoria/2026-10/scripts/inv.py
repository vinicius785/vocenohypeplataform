#!/usr/bin/env python3
"""Auditoria 2026-10 — inventário de código, rotas e server functions (públicas × autenticadas). Somente leitura: lê arquivos do repositório e imprime em stdout; não cria nem altera arquivos, não acessa rede nem banco.
Uso (na raiz do repositório):  python3 docs/auditoria/2026-10/scripts/inv.py
Saída: texto em stdout. Estimativa estática (regex), não substitui consulta ao banco vivo."""
import os
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),"..","..","..",".."))
import os,re,json,collections
os.chdir(ROOT)
def files(root,exts):
    for d,_,fs in os.walk(root):
        if "node_modules" in d: continue
        for f in fs:
            if f.endswith(exts): yield os.path.join(d,f)
def loc(p):
    try: return sum(1 for _ in open(p,encoding="utf8",errors="ignore"))
    except: return 0
src=list(files("src",(".ts",".tsx")))
tests=[f for f in src if re.search(r"\.test\.(ts|tsx)$",f)]
prod=[f for f in src if f not in tests and "routeTree.gen" not in f and "integrations/supabase/types" not in f]
print("src files",len(src),"prod",len(prod),"tests",len(tests))
print("prod LOC",sum(loc(f) for f in prod),"test LOC",sum(loc(f) for f in tests))
by=collections.Counter()
for f in prod: by[f.split("/")[1] if len(f.split("/"))>2 else "."]+=loc(f)
print("LOC by src/ dir:",dict(by.most_common()))
big=sorted(((loc(f),f) for f in prod),reverse=True)[:12]
print("largest:",[(a,b) for a,b in big])
# routes
routes=[f for f in files("src/routes",(".ts",".tsx")) if "routeTree" not in f and not f.endswith("README.md")]
print("route files",len(routes))
api=[f for f in routes if "/api/" in f]
print("api routes",api)
# server fns
sf=[]
for f in files("src",(".ts",".tsx")):
    if f.endswith(".test.ts") or f.endswith(".test.tsx"): continue
    t=open(f,encoding="utf8",errors="ignore").read()
    for m in re.finditer(r"export const (\w+)\s*=\s*createServerFn\(\{\s*method:\s*\"(GET|POST)\"\s*\}\)(.*?)\.handler\(",t,re.S):
        chain=m.group(3)
        sf.append(dict(file=f,name=m.group(1),method=m.group(2),auth="requireSupabaseAuth" in chain,validator="inputValidator" in chain,
                       admin=("supabaseAdmin" in t)))
print("server functions",len(sf),"with auth middleware",sum(s["auth"] for s in sf),"public(no middleware)",sum(not s["auth"] for s in sf),"with validator",sum(s["validator"] for s in sf))
pub=[s for s in sf if not s["auth"]]
print("PUBLIC fns:")
for s in pub: print(" ",s["file"].replace("src/lib/",""),s["name"],s["method"],"validator" if s["validator"] else "NO-VALIDATOR","admin-file" if s["admin"] else "")
print("authenticated w/o validator:",[(s["file"].split("/")[-1],s["name"]) for s in sf if s["auth"] and not s["validator"]])
