from fastapi import FastAPI, HTTPException, Request, BackgroundTasks
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import uvicorn
import httpx
import paramiko
import pandas as pd
import os
import json
import time
from config import settings
from services.scheduler import start_scheduler, stop_scheduler
from services.notifications import notification_service
from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    start_scheduler()
    yield
    # Shutdown
    stop_scheduler()

app = FastAPI(title="Network Monitor API", lifespan=lifespan)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify domains
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API Token Auth Middleware
@app.middleware("http")
async def verify_api_token(request: Request, call_next):
    # Protect only /api/ paths, allow /api/config for frontend initialization
    if request.url.path.startswith("/api/") and request.url.path != "/api/config":
        if settings.API_TOKEN:
            token = request.headers.get("X-API-Token")
            if token != settings.API_TOKEN:
                return JSONResponse(status_code=401, content={"detail": "Unauthorized: Invalid or missing X-API-Token"})
    
    response = await call_next(request)
    return response

# Models
class SSHCommandRequest(BaseModel):
    host: str
    username: Optional[str] = None
    password: Optional[str] = None
    commands: List[str]

class ConfigUpdate(BaseModel):
    zabbix: Optional[dict] = None
    ssh: Optional[dict] = None
    notifications: Optional[dict] = None

# Global Cache
LOJAS_CACHE = None

def carregar_lojas_excel():
    global LOJAS_CACHE
    if LOJAS_CACHE: return LOJAS_CACHE
    
    excel_path = 'user_input_files/info_lojas.xlsx'
    if not os.path.exists(excel_path): return []
    
    try:
        df = pd.read_excel(excel_path).fillna('')
        lojas = []
        for _, row in df.iterrows():
            loja = {
                'id': str(row.get('Loja', '')).strip(),
                'nome': f"Loja {str(row.get('Loja', ''))}",
                'operador_wan1': str(row.get('WAN1_Operadora', '')),
                'circuito_wan1': str(row.get('WAN1_Circuito', '')),
                'banda_wan1': str(row.get('WAN1_Banda', '')),
                'operador_wan2': str(row.get('WAN2_Operadora', '')),
                'circuito_wan2': str(row.get('WAN2_Circuito', '')),
                'banda_wan2': str(row.get('WAN2_Banda', ''))
            }
            if loja['id']: lojas.append(loja)
        LOJAS_CACHE = lojas
        return lojas
    except Exception as e:
        print(f"Erro Excel: {e}")
        return []

# Routes
@app.post("/api/zabbix-proxy")
async def zabbix_proxy(request: Request):
    try:
        body = await request.json()
        target_url = settings.ZABBIX_URL

        # ── Injetar credenciais reais no user.login ──────────────────────
        # O frontend nunca recebe as senhas reais (GET /api/config retorna ***),
        # então o proxy as injeta aqui a partir do .env.
        method = body.get("method", "")
        if method == "user.login":
            if not settings.ZABBIX_USER or not settings.ZABBIX_PASSWORD:
                raise HTTPException(
                    status_code=400,
                    detail="Credenciais Zabbix não configuradas. Preencha ZABBIX_USER e ZABBIX_PASSWORD no .env."
                )
            # Suporta Zabbix 6.0+ (usa "username", não "user")
            body["params"] = {
                "username": settings.ZABBIX_USER,
                "password": settings.ZABBIX_PASSWORD,
            }
            print(f"[Zabbix Proxy] user.login → injetando credenciais do .env para {settings.ZABBIX_USER}")

        async with httpx.AsyncClient(verify=False) as client:
            response = await client.post(target_url, json=body, timeout=30.0)
            return response.json()
    except HTTPException:
        raise
    except httpx.ConnectError as e:
        print(f"Zabbix Connection Error: {e}")
        raise HTTPException(status_code=502, detail=f"Failed to connect to Zabbix: {str(e)}")
    except httpx.TimeoutException as e:
        print(f"Zabbix Timeout: {e}")
        raise HTTPException(status_code=504, detail="Zabbix connection timed out")
    except Exception as e:
        import traceback
        print(f"Proxy Error accessing {target_url}: {repr(e)}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Proxy Error: {str(e)}")

@app.post("/api/ssh-execute")
async def ssh_execute(req: SSHCommandRequest, bg_tasks: BackgroundTasks):
    # Use provided credentials or fallback to config if placeholder is sent
    user = req.username
    if not user or user == "***configurado***":
        user = settings.SSH_USER
        
    pwd = req.password
    if not pwd or pwd == "***configurado***":
        pwd = settings.SSH_PASSWORD
    
    # Simulation Mode (No credentials)
    if not user or not pwd:
        results = []
        for cmd in req.commands:
            output = f"[SIMULATION] Output for: {cmd}\n> Command executed successfully."
            
            # Mock Data for specific commands
            if "running-config" in cmd or "current-configuration" in cmd:
                output = """
!
version 15.2
service timestamps debug datetime msec
service timestamps log datetime msec
no service password-encryption
!
hostname Switch-Loja-001
!
interface GigabitEthernet1/0/1
 description Link_WAN_Vivo
 switchport mode access
 switchport access vlan 10
!
interface GigabitEthernet1/0/2
 description Link_WAN_Claro
 switchport mode access
 switchport access vlan 20
!
interface GigabitEthernet1/0/3
 description PC_Caixa_01
 switchport mode access
 switchport access vlan 80
!
interface GigabitEthernet1/0/4
 description PC_Gerencia
 switchport mode access
 switchport access vlan 80
 shutdown
!
interface GigabitEthernet1/0/48
 description Uplink_Core
 switchport mode trunk
!
interface Vlan1
 no ip address
!
interface Vlan100
 description Management
 ip address 192.168.1.254 255.255.255.0
!
ip default-gateway 192.168.1.1
!
end
"""
            elif "show interfaces status" in cmd:
                output = """
Port      Name               Status       Vlan       Duplex  Speed Type
Gi1/0/1   Link_WAN_Vivo      connected    10         a-full  a-1000 10/100/1000BaseTX
Gi1/0/2   Link_WAN_Claro     connected    20         a-full  a-1000 10/100/1000BaseTX
Gi1/0/3   PC_Caixa_01        connected    80         a-full  a-1000 10/100/1000BaseTX
Gi1/0/4   PC_Gerencia        disabled     80           auto    auto 10/100/1000BaseTX
Gi1/0/5                      notconnect   1            auto    auto 10/100/1000BaseTX
Gi1/0/48  Uplink_Core        connected    trunk      a-full  a-1000 10/100/1000BaseTX
"""
            elif "show ip interface brief" in cmd:
                output = """
Interface              IP-Address      OK? Method Status                Protocol
GigabitEthernet1/0/1   unassigned      YES unset  up                    up      
GigabitEthernet1/0/2   unassigned      YES unset  up                    up      
Vlan1                  unassigned      YES unset  administratively down down    
Vlan100                192.168.1.254   YES manual up                    up      
"""
            
            results.append({
                "command": cmd,
                "output": output,
                "success": True
            })
            
        # Dispatch pro-active AI analysis
        from fastapi import BackgroundTasks
        if results:
            bg_tasks.add_task(run_proactive_ai_analysis, req.host, results, user, pwd)
        
        return {"success": True, "results": results}

    # Real Execution using Shell (Faster & More Reliable)
    results = []
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    
    try:
        # DEBUG: Log credential source (never log the actual password)
        user_source = "request" if (req.username and req.username != "***configurado***") else ".env"
        pwd_source = "request" if (req.password and req.password != "***configurado***") else ".env"
        print(f"Connecting to {req.host} (Shell Mode)...")
        print(f"  [DEBUG] User: '{user}' (from {user_source}), Password length: {len(pwd) if pwd else 0} (from {pwd_source})")
        client.connect(req.host, username=user, password=pwd, timeout=20, banner_timeout=20, allow_agent=False, look_for_keys=False)
        
        # Open Shell
        chan = client.invoke_shell()
        chan.settimeout(5.0)
        
        # Clear initial banner/motd aggressively
        time.sleep(0.5)
        while chan.recv_ready():
            chan.recv(9999)
            
        # Disable paging - Send ONLY 'terminal length 0' as it's standard for Cisco IOS
        chan.send("terminal length 0\n")
        time.sleep(0.2)

        # --- ADICIONADO: Desabilitar paginação para Huawei (VRP) ---
        chan.send("screen-length 0 temporary\n")
        time.sleep(0.2)
            
        # Clear output from paging commands
        while chan.recv_ready():
            chan.recv(9999)

        for i, cmd in enumerate(req.commands):
            print(f"[{i+1}/{len(req.commands)}] Executing: {cmd}")
            
            # Send command
            # Encode to latin-1 to avoid character corruption on legacy devices
            try:
                chan.send(cmd.encode('latin-1') + b"\n")
            except UnicodeEncodeError:
                # Fallback to utf-8 if latin-1 fails (unlikely for standard chars, but possible for emojis etc)
                chan.send(cmd.encode('utf-8') + b"\n")
            
            # Read output
            output_buffer = b""
            start_time = time.time()
            
            # Wait for data to start coming (fast polling)
            while not chan.recv_ready():
                if time.time() - start_time > 3: # 3s timeout for start of output
                    break
                time.sleep(0.01)
                
            # Read until silence (heuristic - optimized)
            last_data_time = time.time()
            while True:
                if chan.recv_ready():
                    data = chan.recv(8192) # Larger buffer
                    output_buffer += data
                    last_data_time = time.time()
                else:
                    # If no data for 0.1s, assume command finished (very aggressive)
                    if time.time() - last_data_time > 0.1:
                        break
                    # Global timeout per command (e.g. 5s)
                    if time.time() - start_time > 5:
                        break
                    time.sleep(0.01) # Fast polling
            
            # Decode and clean output
            full_output = output_buffer.decode('utf-8', errors='replace')
            
            # Remove the echoed command from the output
            clean_output = full_output.replace(f"{cmd}\r\n", "").replace(f"{cmd}\n", "").strip()
            
            # Remove artifacts like 'rminal length 0' or similar if they appear at the start
            if "terminal length 0" in clean_output or "rminal length 0" in clean_output:
                lines = clean_output.splitlines()
                clean_output = "\n".join([l for l in lines if "terminal length 0" not in l and "rminal length 0" not in l]).strip()

            # Remove the trailing prompt if present (heuristic: ends with # or >)
            lines = clean_output.splitlines()
            if lines and (lines[-1].strip().endswith('#') or lines[-1].strip().endswith('>')):
                clean_output = "\n".join(lines[:-1]).strip()
            
            results.append({
                "command": cmd,
                "output": clean_output,
                "success": True
            })
            
        client.close()
        
        # Dispatch pro-active AI analysis
        from fastapi import BackgroundTasks
        if results:
            bg_tasks.add_task(run_proactive_ai_analysis, req.host, results, user, pwd)
            
        return {"success": True, "results": results}
        
    except Exception as e:
        print(f"Connection Error: {repr(e)}")
        if results:
            return {"success": False, "error": f"Connection lost: {str(e)}", "results": results}
        return {"success": False, "error": f"Connection failed: {str(e)}", "results": []}

class AIAnalysisRequest(BaseModel):
    host: str
    commands: list[dict[str, str]]
    messages: list[dict[str, str]] | None = None
    context_alerts: list[str] | None = None
    context_ports_down: str | None = None
    available_commands: list[str] | None = None
    config_templates: dict[str, str] | None = None
    knowledge_base: dict[str, Any] | None = None

# Armazenamento em memória (cache temporal) para Insights da IA
AI_INSIGHTS = {}

def _execute_single_ssh_command(host: str, user: str, pwd: str, cmd: str) -> str:
    import paramiko
    import time
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        client.connect(host, username=user, password=pwd, timeout=15, banner_timeout=15, allow_agent=False, look_for_keys=False)
        chan = client.invoke_shell()
        chan.settimeout(10.0)
        time.sleep(0.5)
        while chan.recv_ready(): chan.recv(9999)
        
        chan.send("terminal length 0\n")
        time.sleep(0.2)
        chan.send("screen-length 0 temporary\n")
        time.sleep(0.2)
        while chan.recv_ready(): chan.recv(9999)
        
        chan.send(cmd + "\n")
        output_buffer = b""
        start_time = time.time()
        
        while True:
            if chan.recv_ready():
                chunk = chan.recv(4096)
                if not chunk: break
                output_buffer += chunk
            else:
                if time.time() - start_time > 15: break
                if chan.exit_status_ready(): break
                time.sleep(0.1)
                
        clean = output_buffer.decode('utf-8', errors='replace')
        lines = clean.splitlines()
        if lines and (lines[-1].strip().endswith('#') or lines[-1].strip().endswith('>')):
            lines = lines[:-1]
        
        return "\n".join(lines).strip()
    except Exception as e:
        return f"Falha ao executar comando secundário: {e}"
    finally:
        client.close()

async def run_proactive_ai_analysis(host: str, results: list, user: str = None, pwd: str = None):
    """
    Background worker that runs right after any SSH command finishes.
    Queries the PLAI API and can execute follow-up queries via <EXECUTE> tags.
    """
    if not settings.PLAI_API_KEY:
        return
        
    try:
        import httpx
        import re
        import asyncio
        
        input_text = (
            f"Você é um bot autônomo de Troubleshooting de Redes analisando o host {host}.\n"
            f"Foram identificados os seguintes logs originais:\n\n"
        )
        for res in results:
            input_text += f"Comando: {res.get('command')}\nSaída:\n{res.get('output')}\n\n"
            
        input_text += (
            "DIRETRIZES IMPORTANTES:\n"
            "1. Analise os resultados silenciosamente se tudo estiver OK.\n"
            "2. Se você desconfiar de um problema real (ex: CRC, Spanning-Tree, loop, BGP down, link flapping), você pode e DEVE pedir mais informações ANTES de dar o parecer final.\n"
            "3. Para rodar um comando para coletar mais dados (ex 'show interfaces', 'show log'), responda APENAS com a seguinte marcação estrita: <EXECUTE>seu_comando_aqui</EXECUTE>\n"
            "4. É expressamente PROIBIDO usar comandos que alterem algo. Só leitura.\n"
            "5. Se eu devolver a saída do seu comando extra e você já tiver o veredito, responda com a conclusão final para o usuário normal, sem a tag <EXECUTE>.\n"
            "Limitação tecnológica: você não deve passar 2 comandos na mesma resposta. Emita apenas 1 <EXECUTE>.\n"
        )
            
        messages = [{"role": "user", "content": input_text}]
        max_iterations = 3
        
        for iteration in range(max_iterations):
            # Montar todo o prompt em string
            prompt = ""
            for msg in messages:
                r = "SISTEMA/REDE: " if msg['role'] == "user" else "SEU RETORNO ANTERIOR: "
                prompt += f"{r}\n{msg['content']}\n\n"
                
            async with httpx.AsyncClient() as client:
                resp = await client.post(
                    "https://plai-api-core.cencosud.ai/api/assistant",
                    headers={
                        "Content-Type": "application/json",
                        "x-api-key": settings.PLAI_API_KEY,
                        "x-agent-id": settings.PLAI_AGENT_ID
                    },
                    json={"input": prompt},
                    timeout=60.0
                )
                
                if 200 <= resp.status_code < 300:
                    data = resp.json()
                    analysis = data.get('response') or data.get('output') or data.get('text') or str(data)
                    
                    match = re.search(r"<EXECUTE>(.*?)</EXECUTE>", analysis, re.IGNORECASE)
                    
                    if match and user and pwd:
                        cmd_to_run = match.group(1).strip()
                        # Validação de segurança simples
                        if any(x in cmd_to_run.lower() for x in ['conf t', 'configure', 'write', 'erase', 'reload', 'clear']):
                            messages.append({"role": "assistant", "content": analysis})
                            messages.append({"role": "user", "content": f"Comando negado por políticas corporativas: {cmd_to_run}. Comandos perigosos bloqueados. Prossiga a análise com o que você tem."})
                            continue
                            
                        print(f"[{host}] Agente IA solicitou: {cmd_to_run}")
                        
                        # Avisar UI que estamos executando
                        AI_INSIGHTS[host] = {
                            "status": "investigating",
                            "message": f"⏳ Solicitando execução de comando extra: `{cmd_to_run}`"
                        }
                        
                        loop = asyncio.get_event_loop()
                        cmd_out = await loop.run_in_executor(None, _execute_single_ssh_command, host, user, pwd, cmd_to_run)
                        print(f"[{host}] Resultado lido (primeiros caracteres):\n{cmd_out[:300]}...\n")
                        
                        # Avisar UI que recebemos resultado
                        AI_INSIGHTS[host] = {
                            "status": "investigating",
                            "message": f"✅ Resultado de `{cmd_to_run}` recebido. Analisando..."
                        }
                        
                        messages.append({"role": "assistant", "content": analysis})
                        messages.append({"role": "user", "content": f"Saída adicional recebida do comando '{cmd_to_run}' executado no equipamento:\n{cmd_out}\nO que você conclui agora? Se achar necessário, você tem mais {max_iterations - iteration - 1} chance(s) de usar <EXECUTE>."})
                    else:
                        # Chegou na conclusão ou não tinha credenciais
                        print(f"[{host}] Agente IA concluiu a análise!")
                        AI_INSIGHTS[host] = {
                            "status": "completed",
                            "timestamp": time.time(),
                            "insight": analysis
                        }
                        break
                else:
                    break

    except Exception as e:
        print(f"Background AI tasks failed: {e}")

@app.get("/api/ai-insights/{host}")
async def get_ai_insights(host: str):
    insight = AI_INSIGHTS.get(host)
    if insight:
        import time
        if insight.get("status") == "investigating":
            msg = insight.get("message")
            if msg:
                # Limpa a mensagem pra não mandar repetido no polling de 2s
                insight["message"] = None 
                return {"has_insight": False, "status": "investigating", "message": msg}
            return {"has_insight": False, "status": "investigating"}
            
        elif insight.get("status") == "completed":
            if time.time() - insight.get("timestamp", time.time()) < 600:
                del AI_INSIGHTS[host]
                return {"has_insight": True, "insight": insight["insight"]}
                
    return {"has_insight": False}

class ZabbixAckIARequest(BaseModel):
    host: str
    event_name: str
    insight_text: Optional[str] = None

@app.post("/api/zabbix-ack-ia")
async def zabbix_ack_ia(req: ZabbixAckIARequest):
    if not settings.PLAI_API_KEY:
        raise HTTPException(status_code=400, detail="PLAI_API_KEY not configured")

    try:
        import httpx
        
        system_context = (
            "Você é um engenheiro de rede resumindo um problema para o Acknowledge do Zabbix.\n"
            "Seja EXTREMAMENTE conciso (máx. 150 caracteres). Use tom técnico."
        )
        
        user_msg = f"Crie um Acknowledge para o host: {req.host}\nProblema: {req.event_name}\n"
        if req.insight_text:
            user_msg += f"Análise recente da IA:\n{req.insight_text}\n"
            
        final_input = f"[INSTRUCTIONS]\n{system_context}\n\n[USER QUERY]\n{user_msg}"

        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://plai-api-core.cencosud.ai/api/assistant",
                headers={
                    "Content-Type": "application/json",
                    "x-api-key": settings.PLAI_API_KEY,
                    "x-agent-id": settings.PLAI_AGENT_ID
                },
                json={"input": final_input},
                timeout=45.0
            )
            
            if not (200 <= response.status_code < 300):
                raise HTTPException(status_code=response.status_code, detail=f"PLAI API Error: {response.text}")
                
            data = response.json()
            ack_msg = data.get('response') or data.get('output') or data.get('text') or str(data)
            
            # Limpar formatações de markdown desnecessárias
            ack_msg = ack_msg.replace('**', '').replace('```', '').replace('\\n', ' ').strip()
            
            return {"success": True, "ack_message": ack_msg}
            
    except Exception as e:
        print(f"Zabbix Ack IA Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/ai-analyze")
async def ai_analyze(req: AIAnalysisRequest):
    if not settings.PLAI_API_KEY:
        raise HTTPException(status_code=400, detail="PLAI_API_KEY not configured")

    try:
        import httpx
        
        # Construct System Context with Persona and Data
        system_context = (
            f"Estou analisando o host: {req.host}\n"
        )

        # Add Context Data if available
        if req.context_ports_down and req.context_ports_down != '0':
            system_context += f"⚠️ ALERTA: Existem {req.context_ports_down} interfaces DOWN neste switch!\n"
        
        if req.context_alerts and len(req.context_alerts) > 0:
            system_context += "⚠️ ALERTAS DO ZABBIX:\n" + "\n".join([f"- {a}" for a in req.context_alerts]) + "\n"

        system_context += "\n--- OUTPUTS DOS COMANDOS ---\n"
        for cmd in req.commands:
            system_context += f"Command: {cmd.get('command')}\nOutput:\n{cmd.get('output')}\n\n"
        system_context += "--- FIM DOS OUTPUTS ---\n\n"

        # Add Knowledge Base (Advanced Commands & Troubleshooting)
        if req.knowledge_base:
            system_context += "BASE DE CONHECIMENTO (COMANDOS AVANÇADOS E DICAS):\n"
            
            if 'advanced_commands' in req.knowledge_base:
                system_context += "Comandos Avançados:\n"
                for cmd in req.knowledge_base['advanced_commands']:
                    system_context += f"- {cmd.get('description')}: {cmd.get('command')}\n"
            
            if 'troubleshooting_guides' in req.knowledge_base:
                system_context += "\nGuias de Troubleshooting:\n"
                for issue, steps in req.knowledge_base['troubleshooting_guides'].items():
                    system_context += f"- {issue}: {steps}\n"
            system_context += "\n"

        # Add Knowledge about Templates and Commands
        if req.config_templates:
            system_context += "TEMPLATES DE CONFIGURAÇÃO DISPONÍVEIS:\n"
            for name, content in req.config_templates.items():
                system_context += f"- {name}:\n{content}\n"
            system_context += "Se o usuário pedir para configurar algo (como PC, CFTV, AP), sugira o template exato, substituindo os placeholders (ex: {INTERFACE}) pelos valores corretos.\n"

        if req.available_commands:
            system_context += f"\nCOMANDOS DISPONÍVEIS NO SISTEMA: {', '.join(req.available_commands[:100])}...\n"
            system_context += "IMPORTANTE: Você SÓ pode sugerir comandos que estejam nesta lista acima OU na Base de Conhecimento. NÃO invente comandos.\n"
            system_context += "Se o usuário pedir algo que não está na lista, explique que o comando não está disponível no perfil do dispositivo.\n"

        system_context += (
            "\nDIRETRIZES:\n"
            "1. Responda SEMPRE em Português do Brasil de forma prestativa.\n"
            "2. Se o usuário pedir para configurar algo OU para verificar algo, forneça os comandos dentro de um bloco :::EXECUTION ... :::.\n"
            "3. Use o formato :::EXECUTION ... ::: EXATAMENTE ASSIM.\n"
            "4. Use formatação Markdown. NÃO sugira comandos fora da lista disponível.\n"
        )
        
        # Prepare the PLAI prompt payload
        user_msg = "Exatamente"
        if req.messages and len(req.messages) > 0:
            user_msg = req.messages[-1].get("content", "")
            
        final_input = f"[INSTRUCTIONS]\n{system_context}\n\n[USER QUERY]\n{user_msg}"

        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://plai-api-core.cencosud.ai/api/assistant",
                headers={
                    "Content-Type": "application/json",
                    "x-api-key": settings.PLAI_API_KEY,
                    "x-agent-id": settings.PLAI_AGENT_ID
                },
                json={
                    "input": final_input
                },
                timeout=60.0
            )
            
            if not (200 <= response.status_code < 300):
                raise HTTPException(status_code=response.status_code, detail=f"PLAI API Error: {response.text}")
                
            data = response.json()
            analysis = data.get('response') or data.get('output') or data.get('text') or str(data)
            
            return {"success": True, "analysis": analysis}
            
    except Exception as e:
        print(f"AI Analysis Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/stores/search")
async def search_stores(q: str = ""):
    lojas = carregar_lojas_excel()
    query = q.lower()
    results = [l for l in lojas if query in l['id'].lower() or query in l['nome'].lower()]
    return {"stores": results}

@app.get("/api/config")
async def get_config():
    # Return config but mask passwords if needed, or just return what we have
    # For now, returning structure compatible with frontend
    
    # Load current config from file to get notifications if not in settings
    notif_config = {}
    if os.path.exists("config.json"):
        try:
            with open("config.json", "r") as f:
                data = json.load(f)
                notif_config = data.get("notifications", {})
        except: pass

    return {
        "zabbix": {
            "url": settings.ZABBIX_URL,
            # Nunca retornar credenciais via API — carregue direto do .env
            "user": "" if not settings.ZABBIX_USER else "***configurado***",
            "password": "" if not settings.ZABBIX_PASSWORD else "***configurado***"
        },
        "ssh": {
            "user": "" if not settings.SSH_USER else "***configurado***",
            "password": ""
        },
        "notifications": notif_config
    }

@app.post("/api/config")
async def save_config(config: ConfigUpdate):
    data = {}
    if os.path.exists("config.json"):
        with open("config.json", "r") as f:
            try:
                data = json.load(f)
            except: pass
            
    if config.zabbix:
        # Salvar apenas a URL no config.json; user/password ficam exclusivamente no .env
        data["zabbix"] = {"url": config.zabbix.get("url", settings.ZABBIX_URL)}
    if config.notifications:
        data["notifications"] = config.notifications
        
    with open("config.json", "w") as f:
        json.dump(data, f, indent=2)
        
    # Reload notification service to pick up new URL
    if config.notifications:
        notification_service.reload_config()
        
    return {"status": "ok", "message": "Configuração salva. Credenciais (user/senha) devem ser definidas no .env"}

@app.post("/api/config/notifications")
async def save_notification_config(config: dict):
    """
    Save notification settings (webhook_url, enabled)
    """
    try:
        current_data = {}
        if os.path.exists("config.json"):
            with open("config.json", "r") as f:
                current_data = json.load(f)
        
        if "notifications" not in current_data:
            current_data["notifications"] = {}
            
        current_data["notifications"].update(config)
        
        with open("config.json", "w") as f:
            json.dump(current_data, f, indent=2)
            
        # Reload service
        notification_service.reload_config()
        
        return {"success": True, "message": "Notification settings saved"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/notifications/test")
async def test_notification():
    """
    Send a test notification
    """
    success = notification_service.send_notification(
        "Teste de Notificação",
        "Se você está vendo isso, o Webhook está funcionando corretamente! 🚀",
        "info"
    )
    if success:
        return {"success": True, "message": "Test notification sent"}
    else:
        raise HTTPException(status_code=500, detail="Failed to send notification. Check logs/URL.")

from services.topology import topology_service
from services.discovery import discovery_service

@app.get("/api/topology")
async def get_topology(store_id: Optional[str] = None, mode: str = "mock"):
    """
    Returns the network topology graph (nodes and edges).
    """
    try:
        data = topology_service.get_topology_data(store_id, mode)
        return data
    except Exception as e:
        print(f"Topology Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class DiscoverRequest(BaseModel):
    seed_ip: str                          # IP do switch/dispositivo raiz
    username: Optional[str] = None        # Sobrescreve SSH_USER do .env
    password: Optional[str] = None        # Sobrescreve SSH_PASSWORD do .env
    max_hops: int = 1                     # 0=só seed, 1=vizinhos diretos, 2=2 níveis
    include_types: Optional[List[str]] = None  # Filtra tipos; None = todos


@app.post("/api/topology/discover")
async def topology_discover(req: DiscoverRequest):
    """
    Realiza descoberta automática de topologia via CDP/LLDP a partir de um IP seed.
    Classifica automaticamente dispositivos em: switch | ap | firewall | router.
    Retorna nós e arestas prontos para renderizar no vis.js.
    """
    user = req.username
    if not user or user == "***configurado***":
        user = settings.SSH_USER
        
    pwd  = req.password
    if not pwd or pwd == "***configurado***":
        pwd = settings.SSH_PASSWORD

    if not user or not pwd:
        raise HTTPException(
            status_code=400,
            detail="Credenciais SSH não configuradas. Preencha SSH_USER e SSH_PASSWORD no .env."
        )

    import asyncio

    include = set(req.include_types) if req.include_types else None

    # Rodamos em thread separada para não bloquear o event loop do FastAPI
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(
        None,
        lambda: discovery_service.discover(
            host=req.seed_ip,
            username=user,
            password=pwd,
            max_hops=max(0, min(req.max_hops, 3)),  # limita a 3 hops
            include_types=include,
        )
    )

    if not result["success"] and not result.get("nodes"):
        raise HTTPException(status_code=502, detail=result.get("error", "Discovery failed"))

    return {
        "success": result["success"],
        "seed_ip": req.seed_ip,
        "nodes": result.get("nodes", []),
        "edges": result.get("edges", []),
        "error": result.get("error"),  # pode ter erro parcial mas nós descobertos
    }


# Static Files - Mount LAST to avoid conflicts
app.mount("/", StaticFiles(directory=".", html=True), name="static")

if __name__ == "__main__":
    print("Starting FastAPI Server on port 3020")
    carregar_lojas_excel()
    uvicorn.run("main:app", host="0.0.0.0", port=3020, reload=True)
