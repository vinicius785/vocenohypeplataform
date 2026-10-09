#!/usr/bin/env python3
"""Auditoria 2026-10 — inventário de código e testes por módulo (por palavra-chave). Somente leitura: lê arquivos do repositório e imprime em stdout; não cria nem altera arquivos, não acessa rede nem banco.
Uso (na raiz do repositório):  python3 docs/auditoria/2026-10/scripts/mods.py
Saída: texto em stdout. Estimativa estática (regex), não substitui consulta ao banco vivo."""
import os
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),"..","..","..",".."))
import os,glob,re
os.chdir(ROOT)
files=[f for f in glob.glob("src/**/*.ts*",recursive=True) if "routeTree" not in f and "integrations/supabase/types" not in f]
def loc(p):
    return sum(1 for _ in open(p,encoding="utf8",errors="ignore"))
MODS={
 "Autenticação/acesso/MFA":r"mfa|login|auth|password|invite|accept-invite|client-access|permissions|access-guards|session-scope|organization|user-environment|primeiro-acesso|criar-senha|redefinir",
 "Clientes":r"clientes|cliente-|cliente\b",
 "Campanhas":r"campanha|campaign|inscricao",
 "Influenciadores/Banco":r"influenc|influ-|bank-influ|banco-influ|social-profiles",
 "Projetos/Tarefas":r"projeto|task|tarefa|marketing-task|time-entries|timer",
 "Reuniões/Google":r"reunio|meeting|google",
 "Comercial/Leads/Proposta":r"comercial|lead|proposta|pricing",
 "Financeiro":r"financeiro",
 "Time/Score/Desempenho":r"time-v2|score|performance|insights|member-|team|metricas",
 "Metas/AEO":r"metas|aeo",
 "Chat/Chamadas/Notificações":r"chat|call|push|notif|reminder|mention",
 "Portal (token + V2)":r"portal|client-portal-v2",
 "Marketing/Blog/E-mail":r"blog|marketing|email|resend",
 "Contratos/Autentique":r"contrat|signature|autentique",
 "Instagram/Meta/Legal":r"instagram|meta-data|legal|privacy",
 "Demo":r"demo",
 "Cofre/Segurança/Config":r"vault|configura|seguranca|integrac|workspace|audit-log|rate-limit",
 "Problemas/Bugs/Release":r"problema|bugs|release|version|changelog",
}
print("| módulo | arquivos prod | LOC prod | arquivos de teste | testes (it) |")
for m,rx in MODS.items():
    r=re.compile(rx,re.I)
    sel=[f for f in files if r.search(f)]
    t=[f for f in sel if ".test." in f]; p=[f for f in sel if ".test." not in f]
    its=sum(len(re.findall(r"\b(?:it|test)(?:\.each\([^)]*\))?\(",open(f,encoding="utf8",errors="ignore").read())) for f in t)
    print(f"| {m} | {len(p)} | {sum(loc(f) for f in p)} | {len(t)} | {its} |")
