#!/usr/bin/env python3
"""
Script de teste para verificar conexão com Zabbix API
"""

import urllib.request
import json
import ssl

# Configurar SSL para aceitar certificados corporativos
ssl._create_default_https_context = ssl._create_unverified_context

# Configurações do Zabbix
ZABBIX_URL = "https://zabbixbrasil.cencosud.corp/api_jsonrpc.php"
ZABBIX_USER = "reports"
ZABBIX_PASS = "a#Z2Y0b1c9P#"

def test_zabbix_connection():
    """Testa conexão com Zabbix API"""
    
    print("=" * 60)
    print("🔍 TESTE DE CONEXÃO COM ZABBIX API")
    print("=" * 60)
    print(f"\n📡 URL: {ZABBIX_URL}")
    print(f"👤 Usuário: {ZABBIX_USER}")
    print(f"🔑 Senha: {'*' * len(ZABBIX_PASS)}")
    print("\n" + "-" * 60)
    
    # Preparar requisição de login
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
        
        # Fazer requisição
        req = urllib.request.Request(
            ZABBIX_URL,
            data=json.dumps(login_data).encode('utf-8'),
            headers={
                'Content-Type': 'application/json',
            }
        )
        
        with urllib.request.urlopen(req, timeout=10) as response:
            response_data = response.read().decode('utf-8')
            result = json.loads(response_data)
            
            print("\n📥 Resposta recebida:")
            print(json.dumps(result, indent=2))
            
            if 'result' in result:
                print("\n✅ SUCESSO! Autenticação bem-sucedida!")
                print(f"🎫 Token: {result['result'][:20]}...")
                return True
            elif 'error' in result:
                print("\n❌ ERRO na autenticação:")
                print(f"   Código: {result['error'].get('code')}")
                print(f"   Mensagem: {result['error'].get('message')}")
                print(f"   Dados: {result['error'].get('data')}")
                return False
            else:
                print("\n⚠️  Resposta inesperada (sem 'result' ou 'error')")
                return False
                
    except urllib.error.HTTPError as e:
        print(f"\n❌ ERRO HTTP: {e.code}")
        print(f"   Mensagem: {e.reason}")
        try:
            error_body = e.read().decode('utf-8')
            print(f"   Corpo: {error_body}")
        except:
            pass
        return False
        
    except urllib.error.URLError as e:
        print(f"\n❌ ERRO de URL/Conexão:")
        print(f"   {e.reason}")
        print("\n💡 Possíveis causas:")
        print("   - Servidor Zabbix fora do ar")
        print("   - URL incorreta")
        print("   - Firewall bloqueando")
        print("   - Sem conexão com a rede")
        return False
        
    except Exception as e:
        print(f"\n❌ ERRO inesperado: {type(e).__name__}")
        print(f"   {str(e)}")
        return False

if __name__ == "__main__":
    success = test_zabbix_connection()
    
    print("\n" + "=" * 60)
    if success:
        print("✅ TESTE CONCLUÍDO: Conexão OK")
    else:
        print("❌ TESTE CONCLUÍDO: Falha na conexão")
    print("=" * 60)
    
    input("\nPressione ENTER para sair...")
