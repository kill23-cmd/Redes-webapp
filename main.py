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

# [Trecho do arquivo main.py]
# ... (imports e config mantidos)

@app.post("/api/ssh-execute")
async def ssh_execute(req: SSHCommandRequest):
    # Use provided credentials or fallback to config
    user = req.username or settings.SSH_USER
    pwd = req.password or settings.SSH_PASSWORD
    
    # ... (Modo Simulação mantido igual) ...

    # Real Execution using Shell
    results = []
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    
    try:
        print(f"Connecting to {req.host} (Shell Mode)...")
        client.connect(req.host, username=user, password=pwd, timeout=20, banner_timeout=20, allow_agent=False, look_for_keys=False)
        
        # Open Shell
        chan = client.invoke_shell()
        chan.settimeout(10.0) # Aumentado timeout global
        
        # Clear initial banner
        time.sleep(1.0) # Espera inicial maior
        while chan.recv_ready():
            chan.recv(9999)
            
        # --- CONFIGURAÇÃO DE PAGINAÇÃO (CRÍTICO) ---
        # 1. Cisco e Padrão
        chan.send("terminal length 0\n")
        time.sleep(0.2)
        
        # 2. Huawei (VRP) - Funciona em User View < >
        chan.send("screen-length 0 temporary\n")
        time.sleep(0.5) # Aumentado delay para Huawei processar
            
        # Limpa o buffer de saída desses comandos de configuração
        # para que não apareçam no resultado final
        while chan.recv_ready():
            chan.recv(9999)

        for i, cmd in enumerate(req.commands):
            print(f"[{i+1}/{len(req.commands)}] Executing: {cmd}")
            
            # Send command
        try:
                chan.send(cmd.encode('latin-1') + b"\n")
        except UnicodeEncodeError:
                chan.send(cmd.encode('utf-8') + b"\n")
            
            # Read output logic (Melhorada)
            
        output_buffer = b""
        start_time = time.time()
            
            # Espera o início da resposta (até 5s)
        while not chan.recv_ready():
                if time.time() - start_time > 5:
                    break
                time.sleep(0.1)
                
            # Lê até o fim (Heurística de silêncio)
        last_data_time = time.time()
        while True:
                if chan.recv_ready():
                    data = chan.recv(8192)
                    output_buffer += data
                    last_data_time = time.time()
                else:
                    # Se não vier dados por 0.5s (aumentado), assume fim
                    if time.time() - last_data_time > 0.5:
                        break
                    if time.time() - start_time > 15: # Timeout total por comando
                        break
                    time.sleep(0.05)
            
            # Decode e Limpeza
        full_output = output_buffer.decode('utf-8', errors='replace')
            
            # Remove o eco do comando
        clean_output = full_output.replace(f"{cmd}\r\n", "").replace(f"{cmd}\n", "").strip()
            
            # Remove comandos de paginação residuais se aparecerem
        lines = clean_output.splitlines()
        clean_lines = []
        for line in lines:
                if "terminal length" in line or "screen-length" in line:
                    continue
                clean_lines.append(line)
        clean_output = "\n".join(clean_lines).strip()

            # Remove o prompt final (Suporte a >, # e ])
        if clean_lines:
                last_line = clean_lines[-1].strip()
                if last_line.endswith('#') or last_line.endswith('>') or last_line.endswith(']'):
                    clean_output = "\n".join(clean_lines[:-1]).strip()
            
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

# ... (resto do arquivo mantido)