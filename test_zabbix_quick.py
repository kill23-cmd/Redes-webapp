#!/usr/bin/env python3
"""
Teste rápido de conexão Zabbix com timeout curto
"""

import urllib.request
import json
import ssl
import socket

# Configurar SSL
ssl._create_default_https_context = ssl._create_unverified_context

# Configurar timeout global
socket.setdefaulttimeout(5)  # 5 segundos

ZABBIX_URL = "https://zabbixbrasil.cencosud.corp/api_jsonrpc.php"
ZABBIX_USER = "reports"
ZABBIX_PASS = "a#Z2Y0b1c9P#"

print("=" * 60)
print("🔍 TESTE RÁPIDO DE CONEXÃO ZABBIX")
print("=" * 60)
print(f"\nURL: {ZABBIX_URL}")
print(f"Timeout: 5 segundos")
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
    print("\n🔄 Tentando conectar...")
    
    req = urllib.request.Request(
        ZABBIX_URL,
        data=json.dumps(login_data).encode('utf-8'),
        headers={'Content-Type': 'application/json'}
    )
    
    with urllib.request.urlopen(req, timeout=5) as response:
        result = json.loads(response.read().decode('utf-8'))
        
        if 'result' in result:
            print("\n✅ SUCESSO! Conectado ao Zabbix!")
            print(f"Token: {result['result'][:30]}...")
        elif 'error' in result:
            print("\n❌ ERRO de autenticação:")
            print(f"Código: {result['error'].get('code')}")
            print(f"Mensagem: {result['error'].get('message')}")
        else:
            print("\n⚠️ Resposta inesperada:")
            print(json.dumps(result, indent=2))
            
except socket.timeout:
    print("\n❌ TIMEOUT! Conexão demorou mais de 5 segundos")
    print("\n💡 Possíveis causas:")
    print("   - Firewall bloqueando")
    print("   - Proxy não configurado")
    print("   - Servidor Zabbix lento")
    
except urllib.error.HTTPError as e:
    print(f"\n❌ ERRO HTTP: {e.code} - {e.reason}")
    try:
        error_body = e.read().decode('utf-8')
        print(f"Detalhes: {error_body[:200]}")
    except:
        pass
    
except urllib.error.URLError as e:
    print(f"\n❌ ERRO de URL/Conexão:")
    print(f"   {e.reason}")
    
except Exception as e:
    print(f"\n❌ ERRO: {type(e).__name__}")
    print(f"   {str(e)}")

print("\n" + "=" * 60)
