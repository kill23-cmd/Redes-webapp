#!/usr/bin/env python3
"""
Servidor Python FINAL COM SSH e PROXY ZABBIX
Requer: pip install pandas openpyxl paramiko requests
"""

import http.server
import socketserver
import json
import urllib.parse
import os
from datetime import datetime
import pandas as pd
import ssl
import threading
import time

# Tenta importar paramiko para SSH
try:
    import paramiko
    SSH_AVAILABLE = True
except ImportError:
    SSH_AVAILABLE = False
    print("⚠️  AVISO: 'paramiko' não instalado. Comandos SSH serão simulados.")
    print("   Instale com: pip install paramiko")

ssl._create_default_https_context = ssl._create_unverified_context
PORT = 3020

# Cache global
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

class APIHandler(http.server.SimpleHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_POST(self):
        if self.path == '/api/zabbix-proxy':
            self.handle_zabbix_proxy()
        elif self.path == '/api/config':
            self.handle_save_config()
        elif self.path == '/api/ssh-execute':
            self.handle_ssh_execute()
        else:
            self.send_error(404)

    def do_GET(self):
        if self.path.startswith('/api/stores/search'):
            self.handle_store_search()
        elif self.path == '/api/config':
            self.handle_get_config()
        else:
            super().do_GET()

    def handle_zabbix_proxy(self):
        length = int(self.headers['Content-Length'])
        data = self.rfile.read(length)
        
        try:
            import urllib.request
            # URL fixa ou vinda do config local, aqui simplificado para usar o que o front manda se possível,
            # mas como o front manda para o proxy, vamos assumir a URL corporativa padrão
            target_url = "https://zabbixbrasil.cencosud.corp/api_jsonrpc.php"
            
            req = urllib.request.Request(target_url, data=data, headers={'Content-Type': 'application/json'})
            with urllib.request.urlopen(req, timeout=10) as response:
                resp_data = response.read()
                self.send_json(200, json.loads(resp_data))
        except Exception as e:
            print(f"Erro Proxy: {e}")
            self.send_json(500, {"error": str(e)})

    def handle_ssh_execute(self):
        length = int(self.headers['Content-Length'])
        body = json.loads(self.rfile.read(length).decode('utf-8'))
        
        host = body.get('host')
        username = body.get('username')
        password = body.get('password')
        commands = body.get('commands', [])

        print(f"🚀 Iniciando SSH para {host} com usuário {username}")

        if not SSH_AVAILABLE:
            time.sleep(1)
            self.send_json(200, {
                "success": True, 
                "output": "SIMULAÇÃO: Paramiko não instalado no servidor.\n" + "\n".join([f"> {c}\nCommand executed successfully (Simulated)" for c in commands])
            })
            return

        output_log = ""
        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())

        try:
            client.connect(host, username=username, password=password, timeout=10)
            output_log += f"✅ Conectado a {host}\n"
            
            for cmd in commands:
                output_log += f"\n> {cmd}\n"
                stdin, stdout, stderr = client.exec_command(cmd)
                output_log += stdout.read().decode('utf-8')
                err = stderr.read().decode('utf-8')
                if err: output_log += f"ERRO: {err}\n"
            
            client.close()
            self.send_json(200, {"success": True, "output": output_log})
            
        except Exception as e:
            self.send_json(200, {"success": False, "output": f"❌ Erro de conexão SSH: {str(e)}"})

    def handle_store_search(self):
        query = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query).get('q', [''])[0].lower()
        lojas = carregar_lojas_excel()
        results = [l for l in lojas if query in l['id'].lower() or query in l['nome'].lower()]
        self.send_json(200, {"stores": results})

    def handle_save_config(self):
        length = int(self.headers['Content-Length'])
        data = json.loads(self.rfile.read(length))
        with open('config.json', 'w') as f:
            json.dump(data, f, indent=2)
        self.send_json(200, {"status": "ok"})

    def handle_get_config(self):
        if os.path.exists('config.json'):
            with open('config.json', 'r') as f:
                self.send_json(200, json.load(f))
        else:
            self.send_json(200, {})

    def send_json(self, code, data):
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode('utf-8'))

if __name__ == "__main__":
    print(f"🔥 Servidor Backend (Com SSH) rodando em http://localhost:{PORT}")
    print("   Lembre-se de instalar: pip install paramiko")
    carregar_lojas_excel()
    http.server.HTTPServer(("", PORT), APIHandler).serve_forever()