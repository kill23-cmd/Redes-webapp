#!/usr/bin/env python3
"""
Teste de conexão Zabbix COM PROXY
"""

import urllib.request
import json
import ssl
import socket
import os

# Configurar SSL
ssl._create_default_https_context = ssl._create_unverified_context

# Configurar timeout
socket.setdefaulttimeout(10)

# CONFIGURAR PROXY (se necessário)
# Descomente e ajuste se sua empresa usar proxy
# os.environ['HTTP_PROXY'] = 'http://proxy.empresa.com:8080'
# os.environ['HTTPS_PROXY'] = 'http://proxy.empresa.com:8080'

# OU configure proxy handler
# proxy_handler = urllib.request.ProxyHandler({
#     'http': 'http://proxy.empresa.com:8080',
#     'https': 'http://proxy.empresa.com:8080'
# })
# opener = urllib.request.build_opener(proxy_handler)
# urllib.request.install_opener(opener)

ZABBIX_URL = "https://zabbixbrasil.cencosud.corp/api_jsonrpc.php"
ZABBIX_USER = "reports"
ZABBIX_PASS = "a#Z2Y0b1c9P#"

print("=" * 70)
print("🔍 TESTE DE CONEXÃO ZABBIX - DIAGNÓSTICO COMPLETO")
print("=" * 70)

# Teste 1: Verificar variáveis de ambiente de proxy
print("\n📋 1. Verificando configuração de proxy...")
http_proxy = os.environ.get('HTTP_PROXY') or os.environ.get('http_proxy')
https_proxy = os.environ.get('HTTPS_PROXY') or os.environ.get('https_proxy')

if http_proxy or https_proxy:
    print(f"   HTTP_PROXY: {http_proxy or 'Não configurado'}")
    print(f"   HTTPS_PROXY: {https_proxy or 'Não configurado'}")
else:
    print("   ⚠️  Nenhum proxy configurado nas variáveis de ambiente")
    print("   💡 Seu navegador pode estar usando proxy automático")

# Teste 2: Tentar conexão
print("\n🔄 2. Tentando conectar ao Zabbix...")
print(f"   URL: {ZABBIX_URL}")

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
    req = urllib.request.Request(
        ZABBIX_URL,
        data=json.dumps(login_data).encode('utf-8'),
        headers={'Content-Type': 'application/json'}
    )
    
    with urllib.request.urlopen(req, timeout=10) as response:
        result = json.loads(response.read().decode('utf-8'))
        
        if 'result' in result:
            print("\n✅ SUCESSO! Conectado ao Zabbix!")
            print(f"   Token: {result['result'][:30]}...")
        elif 'error' in result:
            print("\n❌ ERRO de autenticação:")
            print(f"   Código: {result['error'].get('code')}")
            print(f"   Mensagem: {result['error'].get('message')}")
            
except socket.timeout:
    print("\n❌ TIMEOUT após 10 segundos!")
    print("\n🔍 DIAGNÓSTICO:")
    print("   O navegador funciona mas Python não = PROBLEMA DE PROXY")
    print("\n💡 SOLUÇÕES:")
    print("\n   Opção 1: Descobrir configurações de proxy do navegador")
    print("   - Abra Chrome/Edge")
    print("   - Vá em Configurações > Proxy")
    print("   - Anote o endereço e porta do proxy")
    print("\n   Opção 2: Usar proxy automático do Windows")
    print("   Execute no PowerShell:")
    print("   netsh winhttp show proxy")
    print("\n   Opção 3: Configurar proxy no código")
    print("   Edite este arquivo e descomente as linhas de proxy")
    
except Exception as e:
    print(f"\n❌ ERRO: {type(e).__name__}")
    print(f"   {str(e)}")

print("\n" + "=" * 70)
print("\n📝 PRÓXIMOS PASSOS:")
print("1. Execute: netsh winhttp show proxy")
print("2. Anote o endereço do proxy")
print("3. Descomente as linhas de proxy neste arquivo")
print("4. Execute novamente")
print("=" * 70)
