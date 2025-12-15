from fastapi import FastAPI, HTTPException, Request
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
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

app = FastAPI(title="Network Monitor API")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify domains
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Models
class SSHCommandRequest(BaseModel):
    host: str
    username: Optional[str] = None
    password: Optional[str] = None
    commands: List[str]

class ConfigUpdate(BaseModel):
    zabbix: Optional[dict] = None
    ssh: Optional[dict] = None

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
@app.get("/api/zabbix-map-image")
async def zabbix_map_image(sysmapid: str):
    try:
        # Construct URLs
        base_url = settings.ZABBIX_URL.replace("api_jsonrpc.php", "")
        login_url = f"{base_url}index.php"
        map_url = f"{base_url}map.php?sysmapid={sysmapid}"
        
        async with httpx.AsyncClient(verify=False) as client:
            # 1. Login to get session cookie
            login_data = {
                "name": settings.ZABBIX_USER,
                "password": settings.ZABBIX_PASSWORD,
                "enter": "Sign in",
                "autologin": "1"
            }
            
            # First GET to get any cookies/tokens if needed (optional but good practice)
            await client.get(login_url)
            
            # POST to login
            login_response = await client.post(login_url, data=login_data)
            
            if "zbx_session" not in login_response.cookies and "zbx_sessionid" not in login_response.cookies:
                 # Try JSON RPC login if form login fails (fallback, but map.php needs cookie)
                 # Actually map.php usually requires the PHP session cookie, not just API token.
                 # If this fails, we might need to debug the login form fields.
                 print("Warning: No session cookie found after login attempt.")

            # 2. Fetch Map Image
            # map.php returns the image directly
            map_response = await client.get(map_url)
            
            if map_response.status_code != 200:
                raise HTTPException(status_code=map_response.status_code, detail="Failed to fetch map image")
                
            # Return image
            from fastapi.responses import Response
            return Response(content=map_response.content, media_type="image/png")

    except Exception as e:
        print(f"Error fetching map image: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/zabbix-proxy")
async def zabbix_proxy(request: Request):
    try:
        body = await request.json()
        # Use configured URL
        target_url = settings.ZABBIX_URL
        
        async with httpx.AsyncClient(verify=False) as client:
            response = await client.post(target_url, json=body, timeout=10.0)
            return response.json()
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
async def ssh_execute(req: SSHCommandRequest):
    # Use provided credentials or fallback to config
    user = req.username or settings.SSH_USER
    pwd = req.password or settings.SSH_PASSWORD
    
    # Simulation Mode (No credentials)
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
        return {"success": True, "results": results}

    # Real Execution using Shell (Faster & More Reliable)
    results = []
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    
    try:
        print(f"Connecting to {req.host} (Shell Mode)...")
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
        return {"success": True, "results": results}
        
    except Exception as e:
        print(f"Connection Error: {repr(e)}")
        if results:
            return {"success": False, "error": f"Connection lost: {str(e)}", "results": results}
        return {"success": False, "error": f"Connection failed: {str(e)}", "results": []}

class AIAnalysisRequest(BaseModel):
    host: str
    commands: List[Dict[str, str]]
    messages: Optional[List[Dict[str, str]]] = None
    context_alerts: Optional[List[str]] = None
    context_ports_down: Optional[str] = None
    available_commands: Optional[List[str]] = None
    config_templates: Optional[Dict[str, str]] = None
    knowledge_base: Optional[Dict[str, Any]] = None

@app.post("/api/ai-analyze")
async def ai_analyze(req: AIAnalysisRequest):
    if not settings.OPENAI_API_KEY:
        raise HTTPException(status_code=400, detail="OpenAI API Key not configured")

    try:
        import httpx
        
        # Construct System Context with Persona and Data
        system_context = (
            "Você é um engenheiro de redes sênior, muito amigável e prestativo. "
            "Sua personalidade é colaborativa, evitando termos robóticos. "
            "Você adora ajudar a resolver problemas e sugerir melhorias.\n\n"
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
            "1. Responda SEMPRE em Português do Brasil.\n"
            "2. Seja direto mas muito educado.\n"
            "3. Se houver portas down ou alertas, mencione-os como possíveis causas.\n"
            "4. Se o usuário pedir para configurar algo OU para verificar algo (show commands), forneça os comandos dentro de um bloco de execução.\n"
            "5. Use o formato :::EXECUTION ... ::: para comandos que devem ser rodados.\n"
            "   Exemplo:\n"
            "   Para verificar as interfaces, rode:\n"
            "   :::EXECUTION\n"
            "   show ip int brief\n"
            "   :::\n"
            "   Ou para configurar:\n"
            "   :::EXECUTION\n"
            "   conf t\n"
            "   interface Gi1/0/1\n"
            "   desc PC\n"
            "   end\n"
            "   :::\n"
            "6. Use formatação Markdown para deixar a resposta bonita.\n"
            "7. CRÍTICO: NÃO sugira comandos como 'show logging' ou 'show spanning-tree' se eles não estiverem na lista de COMANDOS DISPONÍVEIS.\n"
        )

        # Prepare messages for OpenAI
        api_messages = [{"role": "system", "content": system_context}]
        
        if req.messages:
            api_messages.extend(req.messages)
        else:
            api_messages.append({"role": "user", "content": "Por favor, analise esses logs e me diga se está tudo bem."})

        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {settings.OPENAI_API_KEY}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": "gpt-4o-mini",
                    "messages": api_messages,
                    "max_tokens": 1000,
                    "temperature": 0.7 
                },
                timeout=60.0
            )
            
            if response.status_code != 200:
                raise HTTPException(status_code=response.status_code, detail=f"OpenAI API Error: {response.text}")
                
            data = response.json()
            analysis = data['choices'][0]['message']['content']
            
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
    return {
        "zabbix": {
            "url": settings.ZABBIX_URL,
            "user": settings.ZABBIX_USER,
            "password": settings.ZABBIX_PASSWORD # In a real app, don't return this!
        },
        "ssh": {
            "user": settings.SSH_USER,
            "password": settings.SSH_PASSWORD # In a real app, don't return this!
        }
    }

@app.post("/api/config")
async def save_config(config: ConfigUpdate):
    # This is tricky. We want to save to .env or config.json.
    # For now, let's save to config.json to maintain compatibility with existing logic
    # But also warn or try to update .env if we could.
    
    data = {}
    if os.path.exists("config.json"):
        with open("config.json", "r") as f:
            try:
                data = json.load(f)
            except: pass
            
    if config.zabbix:
        data["zabbix"] = config.zabbix
    if config.ssh:
        data["ssh"] = config.ssh
        
    with open("config.json", "w") as f:
        json.dump(data, f, indent=2)
        
    return {"status": "ok", "message": "Configuration saved to config.json"}

# Static Files - Mount LAST to avoid conflicts
app.mount("/", StaticFiles(directory=".", html=True), name="static")

if __name__ == "__main__":
    print("Starting FastAPI Server on port 3020")
    carregar_lojas_excel()
    uvicorn.run(app, host="0.0.0.0", port=3020)
