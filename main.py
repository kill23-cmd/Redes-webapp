from fastapi import FastAPI, HTTPException, Request
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import List, Optional
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
@app.post("/api/zabbix-proxy")
async def zabbix_proxy(request: Request):
    try:
        body = await request.json()
        # Use configured URL
        target_url = settings.ZABBIX_URL
        
        async with httpx.AsyncClient(verify=False) as client:
            response = await client.post(target_url, json=body, timeout=10.0)
            return response.json()
    except Exception as e:
        print(f"Proxy Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/ssh-execute")
async def ssh_execute(req: SSHCommandRequest):
    # Use provided credentials or fallback to config
    user = req.username or settings.SSH_USER
    pwd = req.password or settings.SSH_PASSWORD
    
    # Simulation Mode (No credentials)
    if not user or not pwd:
        results = []
        for cmd in req.commands:
            results.append({
                "command": cmd,
                "output": f"[SIMULATION] Output for: {cmd}\n> Command executed successfully.",
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
            chan.send(f"{cmd}\n")
            
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
