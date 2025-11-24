#!/usr/bin/env python3
"""
Teste final com IP do servidor
"""

import urllib.request
import json
import ssl

# Configurar SSL
ssl._create_default_https_context = ssl._create_unverified_context

ZABBIX_URL = "https://100.75.88.121/api_jsonrpc.php"
ZABBIX_USER = "reports"
ZABBIX_PASS = "a#Z2Y0b1c9P#"

print("=" * 60)
print("🔍 TESTE COM IP DO SERVIDOR AWS")
print("=" * 60)
print(f"\nURL: {ZABBIX_URL}")
print(f"Usuário: {ZABBIX_USER}")
print("\n" + "-" * 60)

login_data = {
    "jsonrpc": "2.0",
    "method": "user.login",
    "params": {
        "user": ZABBIX_USER,
        "password": ZABBIX_PASS
    },
    "id": 1
}

try:
    print("\n🔄 Tentando autenticar...")
    
    req = urllib.request.Request(
        ZABBIX_URL,
        data=json.dumps(login_data).encode('utf-8'),
        headers={'Content-Type': 'application/json'}
    )
    
    with urllib.request.urlopen(req, timeout=10) as response:
        result = json.loads(response.read().decode('utf-8'))
        
        if 'result' in result:
            print("\n✅ SUCESSO! Conectado ao Zabbix!")
            print(f"🎫 Token: {result['result'][:40]}...")
            print("\n✅ Proxy do backend vai funcionar agora!")
        elif 'error' in result:
            print("\n❌ ERRO de autenticação:")
            print(f"   Código: {result['error'].get('code')}")
            print(f"   Mensagem: {result['error'].get('message')}")
        else:
            print("\n⚠️ Resposta inesperada:")
            print(json.dumps(result, indent=2))
            
except Exception as e:
    print(f"\n❌ ERRO: {type(e).__name__}")
    print(f"   {str(e)}")

print("\n" + "=" * 60)
