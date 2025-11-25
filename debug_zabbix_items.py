#!/usr/bin/env python3
"""
Script de debug para listar itens de um host no Zabbix
"""

import urllib.request
import json
import ssl
import sys

# Configurar SSL para aceitar certificados corporativos
ssl._create_default_https_context = ssl._create_unverified_context

# Configurações do Zabbix (mesmas do test_zabbix.py)
ZABBIX_URL = "https://zabbixbrasil.cencosud.corp/api_jsonrpc.php"
ZABBIX_USER = "reports"
ZABBIX_PASS = "a#Z2Y0b1c9P#"

def get_zabbix_data(method, params, auth=None):
    payload = {
        "jsonrpc": "2.0",
        "method": method,
        "params": params,
        "id": 1
    }
    if auth:
        payload["auth"] = auth

    req = urllib.request.Request(
        ZABBIX_URL,
        data=json.dumps(payload).encode('utf-8'),
        headers={'Content-Type': 'application/json'}
    )
    
    with urllib.request.urlopen(req, timeout=10) as response:
        return json.loads(response.read().decode('utf-8'))

def main():
    print("🔍 Autenticando no Zabbix...")
    auth_resp = get_zabbix_data("user.login", {"username": ZABBIX_USER, "password": ZABBIX_PASS})
    
    if 'error' in auth_resp:
        print(f"❌ Erro de autenticação: {auth_resp['error']}")
        return
        
    token = auth_resp['result']
    print("✅ Autenticado!")

    # 1. Buscar um grupo de host (Ex: Loja 1 ou qualquer um)
    print("\n🔍 Buscando grupos de host...")
    groups_resp = get_zabbix_data("hostgroup.get", {"output": ["groupid", "name"], "limit": 10}, token)
    
    if not groups_resp.get('result'):
        print("❌ Nenhum grupo encontrado.")
        return

    # Pegar o primeiro grupo
    group = groups_resp['result'][0]
    print(f"📂 Grupo encontrado: {group['name']} (ID: {group['groupid']})")

    # 2. Buscar hosts desse grupo
    print(f"\n🔍 Buscando hosts do grupo {group['name']}...")
    hosts_resp = get_zabbix_data("host.get", {"groupids": group['groupid'], "output": ["hostid", "name"]}, token)
    
    if not hosts_resp.get('result'):
        print("❌ Nenhum host encontrado neste grupo.")
        return

    # Pegar o primeiro host (preferencialmente um firewall se tiver)
    host = hosts_resp['result'][0]
    # Tentar achar um firewall
    for h in hosts_resp['result']:
        if 'fw' in h['name'].lower() or 'firewall' in h['name'].lower():
            host = h
            break
            
    with open('debug_result.txt', 'w', encoding='utf-8') as f:
        f.write(f"🖥️ Host selecionado: {host['name']} (ID: {host['hostid']})\n")

        # 3. Listar itens desse host
        print(f"\n🔍 Listando itens do host {host['name']}...")
        items_resp = get_zabbix_data("item.get", {
            "hostids": host['hostid'], 
            "output": ["itemid", "name", "key_", "lastvalue", "units"]
        }, token)
        
        items = items_resp.get('result', [])
        f.write(f"📋 Total de itens encontrados: {len(items)}\n")
        
        f.write("\n--- ITENS RELACIONADOS A WAN/INTERFACE ---\n")
        for item in items:
            name_lower = item['name'].lower()
            if 'wan' in name_lower or 'interface' in name_lower or 'sent' in name_lower or 'received' in name_lower or 'upload' in name_lower or 'download' in name_lower:
                f.write(f"ID: {item['itemid']} | Nome: {item['name']} | Key: {item['key_']} | Valor: {item['lastvalue']} {item['units']}\n")

        f.write("\n--- ITENS RELACIONADOS A STATUS ---\n")
        for item in items:
            name_lower = item['name'].lower()
            if 'status' in name_lower or 'state' in name_lower:
                 f.write(f"ID: {item['itemid']} | Nome: {item['name']} | Key: {item['key_']} | Valor: {item['lastvalue']}\n")
    
    print("✅ Resultado salvo em debug_result.txt")

if __name__ == "__main__":
    main()
