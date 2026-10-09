#!/usr/bin/env python3
"""Auditoria 2026-10 — estado final aproximado de RLS/políticas/funções a partir das migrations. Somente leitura: lê arquivos do repositório e imprime em stdout; não cria nem altera arquivos, não acessa rede nem banco.
Uso (na raiz do repositório):  python3 docs/auditoria/2026-10/scripts/rls.py
Saída: texto em stdout. Estimativa estática (regex), não substitui consulta ao banco vivo."""
import os
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),"..","..","..",".."))
import os,re,glob,collections,json
os.chdir(ROOT)
mig=sorted(glob.glob("supabase/migrations/*.sql"))
print("migrations",len(mig),mig[0].split("/")[-1],mig[-1].split("/")[-1])
tables={}      # name -> created file
rls=set()
pol=collections.defaultdict(dict)   # table -> name -> (cmd, roles, using, check, file)
anon_grants=set()
def norm(s): return re.sub(r"\s+"," ",s).strip()
for f in mig:
    t=open(f,encoding="utf8").read()
    t=re.sub(r"--[^\n]*","",t)
    for m in re.finditer(r"create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?\"?(\w+)\"?\s*\(",t,re.I):
        tables.setdefault(m.group(1),os.path.basename(f))
    for m in re.finditer(r"drop\s+table\s+(?:if\s+exists\s+)?(?:public\.)?\"?(\w+)\"?",t,re.I):
        tables.pop(m.group(1),None); rls.discard(m.group(1)); pol.pop(m.group(1),None)
    for m in re.finditer(r"alter\s+table\s+(?:only\s+)?(?:public\.)?\"?(\w+)\"?\s+enable\s+row\s+level\s+security",t,re.I):
        rls.add(m.group(1))
    for m in re.finditer(r"alter\s+table\s+(?:only\s+)?(?:public\.)?\"?(\w+)\"?\s+disable\s+row\s+level\s+security",t,re.I):
        rls.discard(m.group(1))
    for m in re.finditer(r"drop\s+policy\s+(?:if\s+exists\s+)?\"([^\"]+)\"\s+on\s+(?:public\.)?\"?(\w+)\"?",t,re.I):
        pol[m.group(2)].pop(m.group(1),None)
    for m in re.finditer(r"create\s+policy\s+\"([^\"]+)\"\s+on\s+(?:public\.)?\"?(\w+)\"?(.*?);",t,re.I|re.S):
        body=norm(m.group(3))
        cmd=re.search(r"for\s+(all|select|insert|update|delete)",body,re.I)
        roles=re.search(r"to\s+([\w, ]+?)(?:\s+using|\s+with\s+check|$)",body,re.I)
        using=re.search(r"using\s*\((.*)\)(?:\s+with\s+check|$)",body,re.I)
        chk=re.search(r"with\s+check\s*\((.*)\)\s*$",body,re.I)
        pol[m.group(2)][m.group(1)]=(cmd.group(1).lower() if cmd else "all",roles.group(1).strip() if roles else "public",using.group(1) if using else None,chk.group(1) if chk else None,os.path.basename(f))
    for m in re.finditer(r"grant\s+[^;]*?\s+on\s+(?:table\s+)?(?:public\.)?\"?(\w+)\"?\s+to\s+[^;]*\banon\b",t,re.I):
        anon_grants.add(m.group(1))
    for m in re.finditer(r"revoke\s+all\s+on\s+(?:table\s+)?(?:public\.)?\"?(\w+)\"?\s+from\s+[^;]*\banon\b",t,re.I):
        anon_grants.discard(m.group(1))
no_rls=sorted(t for t in tables if t not in rls)
print("tables created (final, approx):",len(tables),"| with RLS:",len([t for t in tables if t in rls]),"| WITHOUT RLS:",no_rls)
perm=collections.defaultdict(list)
for t,ps in pol.items():
    for n,(cmd,roles,u,c,f) in ps.items():
        if (u and u.strip().lower()=="true") or (c and c.strip().lower()=="true"):
            perm[t].append((n,cmd,roles,f))
print("tables with policy USING/CHECK (true) still present:",{t:[(a,b,c) for a,b,c,_ in v] for t,v in perm.items()})
print("anon table grants (approx):",sorted(anon_grants))
nopol=sorted(t for t in tables if t in rls and not pol.get(t))
print("RLS on but ZERO policies (service-role only):",nopol)
# functions
fn_def=0; no_sp=[]; anon_exec=[]
for f in mig:
    t=re.sub(r"--[^\n]*","",open(f,encoding="utf8").read())
    for m in re.finditer(r"create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?(\w+)\s*\((.*?)\$\$|create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?(\w+)\s*\((.*?)\$[a-z_]*\$",t,re.I|re.S):
        pass
defs=[]
for f in mig:
    t=re.sub(r"--[^\n]*","",open(f,encoding="utf8").read())
    for m in re.finditer(r"create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?(\w+)\s*\(([^)]*)\)(.*?)(?:\$\$|\$[a-z_]+\$)",t,re.I|re.S):
        head=m.group(3).lower()
        defs.append((m.group(1),"security definer" in head,"search_path" in head,os.path.basename(f)))
last={}
for n,sd,sp,f in defs: last[n]=(sd,sp,f)
sdn=[n for n,(sd,sp,f) in last.items() if sd]
print("functions:",len(last),"SECURITY DEFINER:",len(sdn),"SD without search_path:",[ (n,last[n][2]) for n in sdn if not last[n][1]])

print("\n=== guard analysis")
GUARDS=["has_permission","is_admin","is_internal_team_member","client_can_access","portal_","user_can_access","auth.uid()","has_role","shares_internal","can_manage","is_org","is_member"]
unguarded=[];summary={}
for t,ps in sorted(pol.items()):
    used=set()
    for n,(cmd,roles,u,c,f) in ps.items():
        txt=((u or "")+" "+(c or "")).lower()
        for g in GUARDS:
            if g in txt: used.add(g)
        if "anon" in roles.lower(): used.add("ANON")
    summary[t]=sorted(used)
    if not used: unguarded.append(t)
print("tables whose policies use NO guard function/uid:",unguarded)
cnt=collections.Counter(g for v in summary.values() for g in v)
print("guard usage across tables:",dict(cnt))
internal=[t for t,v in summary.items() if "is_internal_team_member" in v]
print("tables explicitly internal-only:",len(internal))
onlyperm=[t for t,v in summary.items() if v==["has_permission"] ]
print("tables guarded ONLY by has_permission (client accounts blocked only if they lack the permission):",len(onlyperm))
