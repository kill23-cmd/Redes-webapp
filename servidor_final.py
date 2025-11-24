#!/usr/bin/env python3
"""
Servidor Python CORRIGIDO para Dashboard de Monitoramento
- Correção do bug de persistência de dados
- Carrega 273 lojas do Excel uma única vez na inicialização
- API otimizada com cache global funcional
- Execute: python servidor_final.py
"""

import http.server
import socketserver
import json
import urllib.parse
import os
from datetime import datetime
import pandas as pd
import ssl

# Configurar SSL para aceitar certificados corporativos/autoassinados
# IMPORTANTE: Isso é necessário para ambientes corporativos com certificados internos
ssl._create_default_https_context = ssl._create_unverified_context

PORT = 3020

# =================================================================
# VARIÁVEIS GLOBAIS PARA CACHE (RESOLVE BUG DE PERSISTÊNCIA)
# =================================================================

# Cache global das lojas (resolves data persistence issue)
LOJAS_CACHE = None
LOJAS_TIMESTAMP = None
EXCEL_LOADED = False

def carregar_lojas_excel():
    """Carrega dados das lojas do arquivo Excel (FUNÇÃO GLOBAL)"""
    global LOJAS_CACHE, LOJAS_TIMESTAMP, EXCEL_LOADED
    
    print("🔄 CARREGANDO LOJAS DO EXCEL...")
    
    # Verificar se já temos cache válido
    if LOJAS_CACHE is not None:
        print(f"✅ Usando cache existente: {len(LOJAS_CACHE)} lojas")
        return LOJAS_CACHE
    
    # Verificar se arquivo existe
    excel_path = 'user_input_files/info_lojas.xlsx'
    if not os.path.exists(excel_path):
        print(f"❌ Arquivo {excel_path} não encontrado!")
        return get_lojas_fallback()
        
    try:
        # Ler Excel
        print(f"📂 Lendo arquivo: {excel_path}")
        df = pd.read_excel(excel_path)
        print(f"✅ Excel lido com sucesso! {len(df)} registros encontrados")
        
        # Processar dados
        lojas = []
        linhas_processadas = 0
        
        for index, row in df.iterrows():
            # Extrair ID da loja
            loja_id_raw = row.get('Loja', '')
            if pd.isna(loja_id_raw):
                continue
                
            loja_id = str(loja_id_raw).strip()
            if not loja_id or loja_id.lower() == 'nan':
                continue
            
            # Extrair dados WAN
            wan1_operadora = str(row.get('WAN1_Operadora', 'N/A')).strip()
            wan1_circuito = str(row.get('WAN1_Circuito', 'N/A')).strip()
            wan1_banda = str(row.get('WAN1_Banda', 'N/A')).strip()
            
            wan2_operadora = str(row.get('WAN2_Operadora', 'N/A')).strip()
            wan2_circuito = str(row.get('WAN2_Circuito', 'N/A')).strip()
            wan2_banda = str(row.get('WAN2_Banda', 'N/A')).strip()
            
            # Determinar status da loja
            status = 'offline'
            if wan1_operadora != 'N/A' and wan1_circuito != 'N/A':
                status = 'online'
            elif wan2_operadora != 'N/A' and wan2_circuito != 'N/A':
                status = 'online'
            
            # Criar objeto da loja
            loja = {
                'id': loja_id,
                'nome': f'Loja {loja_id}',
                'endereco': f'Rede Cencosud - {loja_id}',
                'status': status,
                'operador': wan1_operadora if wan1_operadora != 'N/A' else wan2_operadora,
                'circuito_wan1': wan1_circuito,
                'operador_wan1': wan1_operadora,
                'banda_wan1': wan1_banda,
                'circuito_wan2': wan2_circuito,
                'operador_wan2': wan2_operadora,
                'banda_wan2': wan2_banda
            }
            lojas.append(loja)
            linhas_processadas += 1
            
            # Log das primeiras lojas
            if linhas_processadas <= 5:
                print(f"   🏪 {loja_id}: {status} - {loja['operador']}")
        
        print(f"✅ Processadas {len(lojas)} lojas válidas de {linhas_processadas} linhas")
        
        if len(lojas) == 0:
            print("⚠️  Nenhuma loja válida encontrada. Usando fallback.")
            return get_lojas_fallback()
        
        # SALVAR NO CACHE GLOBAL
        LOJAS_CACHE = lojas
        LOJAS_TIMESTAMP = datetime.now()
        EXCEL_LOADED = True
        
        return lojas
        
    except Exception as e:
        print(f"❌ Erro ao ler Excel: {e}")
        print("⚠️  Usando dados de fallback...")
        return get_lojas_fallback()

def get_lojas():
    """Obtém lista de lojas (USA CACHE GLOBAL)"""
    global LOJAS_CACHE
    
    if LOJAS_CACHE is None:
        print("⚠️  Cache vazio, recarregando...")
        return carregar_lojas_excel()
    
    return LOJAS_CACHE

def get_lojas_fallback():
    """Dados de fallback se Excel não puder ser lido"""
    return [
        {'id': 'GG900', 'nome': 'Loja GG900', 'status': 'online', 'operador': 'Claro', 'endereco': 'São Paulo'},
        {'id': 'GG904', 'nome': 'Loja GG904', 'status': 'online', 'operador': 'BRDigital', 'endereco': 'Rio de Janeiro'},
        {'id': 'GG902', 'nome': 'Loja GG902', 'status': 'offline', 'operador': 'WCS', 'endereco': 'Belo Horizonte'},
        {'id': 'GG906', 'nome': 'Loja GG906', 'status': 'online', 'operador': 'BRDigital', 'endereco': 'Salvador'},
        {'id': 'GG913', 'nome': 'Loja GG913', 'status': 'online', 'operador': 'WCS', 'endereco': 'Brasília'}
    ]

def servir_arquivo_estatico(caminho):
    """Serve arquivos estáticos do dashboard"""
    # Mapeamento de URLs para arquivos
    mapeamento = {
        '/': 'index.html',
        '/index.html': 'index.html',
        '/styles/main.css': 'styles/main.css',
        '/styles/components.css': 'styles/components.css',
        '/js/main.js': 'js/main.js',
        '/js/dashboard.js': 'js/dashboard.js',
        '/js/zabbix-client.js': 'js/zabbix-client.js',
        '/js/ssh-commands.js': 'js/ssh-commands.js'
    }
    
    arquivo = mapeamento.get(caminho)
    if not arquivo:
        return None
    
    try:
        if os.path.exists(arquivo):
            with open(arquivo, 'r', encoding='utf-8') as f:
                return f.read()
        else:
            # Se arquivo não existe, criar conteúdo básico
            if caminho == '/' or caminho == '/index.html':
                return criar_index_html_basico()
            elif caminho.endswith('.css'):
                return criar_css_basico()
            elif caminho.endswith('.js'):
                return criar_js_basico()
    except Exception as e:
        print(f"❌ Erro ao ler arquivo {arquivo}: {e}")
    
    return None

def criar_index_html_basico():
    """Cria um index.html básico se o original não existir"""
    return """
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Dashboard de Monitoramento - Cencosud</title>
    <link rel="stylesheet" href="styles/main.css">
</head>
<body>
    <div class="dashboard-container">
        <header class="dashboard-header">
            <h1>Dashboard de Monitoramento - Cencosud</h1>
            <div class="status-indicator" id="statusIndicator">
                <span class="status-dot"></span>
                <span id="statusText">Conectando...</span>
            </div>
        </header>
        
        <div class="dashboard-content">
            <section class="config-section">
                <h2>Configurações</h2>
                <div class="config-form">
                    <div class="form-group">
                        <label>URL Zabbix:</label>
                        <input type="url" id="zabbixUrl" placeholder="https://zabbix.cencosud.corp/api_jsonrpc.php">
                    </div>
                    <div class="form-group">
                        <label>Usuário Zabbix:</label>
                        <input type="text" id="zabbixUser" placeholder="reports">
                    </div>
                    <div class="form-group">
                        <label>Senha Zabbix:</label>
                        <input type="password" id="zabbixPassword" placeholder="••••••••">
                    </div>
                    <div class="form-group">
                        <label>Usuário SSH:</label>
                        <input type="text" id="sshUser" placeholder="rfmelojr">
                    </div>
                    <button onclick="testConnection()" class="btn-primary">Testar Conexão</button>
                </div>
            </section>
            
            <section class="stores-section">
                <h2>Busca de Lojas</h2>
                <div class="search-controls">
                    <input type="text" id="searchInput" placeholder="Buscar lojas (GG900, GG904...)">
                    <select id="statusFilter">
                        <option value="">Todos os status</option>
                        <option value="online">Online</option>
                        <option value="offline">Offline</option>
                    </select>
                    <button onclick="searchStores()" class="btn-secondary">Buscar</button>
                </div>
                
                <div id="storesResults" class="stores-grid">
                    <p>Use a busca para encontrar lojas...</p>
                </div>
            </section>
            
            <section class="devices-section">
                <h2>Dispositivos das Lojas</h2>
                <div id="devicesList" class="devices-list">
                    <p>Configure o Zabbix para ver os dispositivos...</p>
                </div>
            </section>
        </div>
    </div>
    
    <script src="js/main.js"></script>
</body>
</html>
"""

def criar_css_basico():
    """Cria CSS básico se o original não existir"""
    return """
* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background-color: #1a1a1a;
    color: #ffffff;
    line-height: 1.6;
}

.dashboard-container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 20px;
}

.dashboard-header {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    padding: 20px;
    border-radius: 10px;
    margin-bottom: 30px;
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.status-indicator {
    display: flex;
    align-items: center;
    gap: 10px;
}

.status-dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: #00ff88;
    animation: pulse 2s infinite;
}

@keyframes pulse {
    0% { opacity: 1; }
    50% { opacity: 0.5; }
    100% { opacity: 1; }
}

.config-form, .search-controls {
    background: #2a2a2a;
    padding: 20px;
    border-radius: 8px;
    margin-bottom: 20px;
}

.form-group {
    margin-bottom: 15px;
}

.form-group label {
    display: block;
    margin-bottom: 5px;
    color: #cccccc;
}

.form-group input, .search-controls input, .search-controls select {
    width: 100%;
    padding: 10px;
    background: #333;
    border: 1px solid #555;
    border-radius: 4px;
    color: #fff;
}

.btn-primary, .btn-secondary {
    padding: 10px 20px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-weight: bold;
    transition: background 0.3s;
}

.btn-primary {
    background: #667eea;
    color: white;
}

.btn-primary:hover {
    background: #5a6fd8;
}

.btn-secondary {
    background: #555;
    color: white;
}

.btn-secondary:hover {
    background: #666;
}
"""

def criar_js_basico():
    """Cria JavaScript básico se o original não existir"""
    return """
// Dashboard JavaScript Básico

const API_BASE = window.location.origin;

async function testConnection() {
    console.log('Testando conexão...');
    try {
        const response = await fetch(`${API_BASE}/api/health`);
        const data = await response.json();
        console.log('Status da API:', data);
        alert(`Conexão OK! ${data.lojas_total} lojas carregadas`);
    } catch (error) {
        console.error('Erro na conexão:', error);
        alert('Erro ao conectar com a API');
    }
}

async function searchStores() {
    const query = document.getElementById('searchInput').value;
    const status = document.getElementById('statusFilter').value;
    
    try {
        let url = `${API_BASE}/api/stores/search?limit=20`;
        if (query) url += `&q=${encodeURIComponent(query)}`;
        
        const response = await fetch(url);
        const data = await response.json();
        
        displayStores(data.stores);
        console.log('Resultado da busca:', data);
    } catch (error) {
        console.error('Erro na busca:', error);
        alert('Erro ao buscar lojas');
    }
}

function displayStores(stores) {
    const container = document.getElementById('storesResults');
    
    if (stores.length === 0) {
        container.innerHTML = '<p>Nenhuma loja encontrada</p>';
        return;
    }
    
    const html = stores.map(loja => `
        <div class="store-card">
            <h3>${loja.nome}</h3>
            <p><strong>ID:</strong> ${loja.id}</p>
            <p><strong>Operador:</strong> ${loja.operador}</p>
            <p><strong>Status:</strong> <span class="status-${loja.status}">${loja.status}</span></p>
            <p><strong>WAN1:</strong> ${loja.operador_wan1} - ${loja.circuito_wan1}</p>
            ${loja.circuito_wan2 !== 'N/A' ? `<p><strong>WAN2:</strong> ${loja.operador_wan2} - ${loja.circuito_wan2}</p>` : ''}
        </div>
    `).join('');
    
    container.innerHTML = html;
}

// Testar conexão automaticamente
window.addEventListener('load', () => {
    testConnection();
});
"""

# =================================================================
# FUNÇÕES AUXILIARES GLOBAIS
# =================================================================

def servir_arquivo_estatico(caminho):
    """Serve arquivos estáticos (HTML, CSS, JS)"""
    try:
        # Remover barra inicial e tratar caminho raiz
        if caminho == '/' or caminho == '':
            caminho = 'index.html'
        else:
            caminho = caminho.lstrip('/')
        
        # Caminho completo do arquivo
        arquivo_path = os.path.join(os.getcwd(), caminho)
        
        # Verificar se arquivo existe
        if not os.path.exists(arquivo_path):
            print(f"❌ Arquivo não encontrado: {arquivo_path}")
            return None
        
        # Ler e retornar conteúdo
        with open(arquivo_path, 'r', encoding='utf-8') as f:
            conteudo = f.read()
            print(f"✅ Arquivo servido: {caminho} ({len(conteudo)} bytes)")
            return conteudo
            
    except Exception as e:
        print(f"❌ Erro ao servir arquivo {caminho}: {e}")
        return None

# =================================================================
# CONFIGURAÇÃO E PERSISTÊNCIA
# =================================================================

CONFIG_FILE = 'config.json'
DEFAULT_CONFIG = {
    'zabbix': {
        'url': 'https://zabbixbrasil.cencosud.corp/api_jsonrpc.php',
        'user': 'reports',
        'password': 'a#Z2Y0b1c9P#',
        'enabled': False
    },
    'ssh': {
        'user': 'rfmelojr',
        'password': '',
        'enabled': False
    },
    'dashboard': {
        'refreshInterval': 30,
        'chartPeriod': 4,
        'theme': 'dark'
    },
    'ui': {
        'autoRefresh': True,
        'showNotifications': True
    }
}

def load_config_from_file():
    """Carrega configuração do arquivo JSON"""
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            print(f"❌ Erro ao carregar config: {e}")
            return DEFAULT_CONFIG.copy()
    return DEFAULT_CONFIG.copy()

def save_config_to_file(config):
    """Salva configuração no arquivo JSON"""
    try:
        with open(CONFIG_FILE, 'w', encoding='utf-8') as f:
            json.dump(config, f, indent=2)
        return True
    except Exception as e:
        print(f"❌ Erro ao salvar config: {e}")
        return False

class APIHandler(http.server.BaseHTTPRequestHandler):
    """Handler para as requisições da API"""
    
    def do_OPTIONS(self):
        """CORS preflight"""
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.send_header('Access-Control-Max-Age', '86400')
        self.end_headers()
    
    def do_POST(self):
        """Handle POST requests"""
        try:
            if self.path == '/api/config':
                content_length = int(self.headers['Content-Length'])
                post_data = self.rfile.read(content_length).decode('utf-8')
                
                try:
                    new_config = json.loads(post_data)
                    
                    # Carregar config atual e atualizar
                    current_config = load_config_from_file()
                    
                    # Merge cuidadoso
                    if 'zabbix' in new_config:
                        current_config['zabbix'].update(new_config['zabbix'])
                    if 'ssh' in new_config:
                        current_config['ssh'].update(new_config['ssh'])
                    if 'dashboard' in new_config:
                        current_config['dashboard'].update(new_config['dashboard'])
                    if 'ui' in new_config:
                        current_config['ui'].update(new_config['ui'])
                        
                    if save_config_to_file(current_config):
                        self.send_json_response({'status': 'success', 'message': 'Configuração salva'})
                    else:
                        self.send_json_error('Erro ao salvar arquivo de configuração', 500)
                        
                except json.JSONDecodeError:
                    self.send_json_error('JSON inválido', 400)
                    
            elif self.path == '/api/zabbix-proxy':
                # Proxy para Zabbix API (resolve CORS)
                content_length = int(self.headers['Content-Length'])
                post_data = self.rfile.read(content_length).decode('utf-8')
                
                try:
                    # Carregar configuração do Zabbix
                    config = load_config_from_file()
                    zabbix_url = config.get('zabbix', {}).get('url', '')
                    
                    if not zabbix_url:
                        self.send_json_error('URL do Zabbix não configurada', 400)
                        return
                    
                    # Fazer requisição ao Zabbix
                    import urllib.request
                    
                    req = urllib.request.Request(
                        zabbix_url,
                        data=post_data.encode('utf-8'),
                        headers={
                            'Content-Type': 'application/json',
                        }
                    )
                    
                    with urllib.request.urlopen(req, timeout=30) as response:
                        zabbix_response = response.read().decode('utf-8')
                        zabbix_data = json.loads(zabbix_response)
                        self.send_json_response(zabbix_data)
                        
                except urllib.error.HTTPError as e:
                    error_body = e.read().decode('utf-8')
                    print(f"❌ Erro HTTP do Zabbix: {e.code} - {error_body}")
                    self.send_json_error(f'Erro ao conectar com Zabbix: {e.code}', 502)
                except urllib.error.URLError as e:
                    print(f"❌ Erro de URL do Zabbix: {e}")
                    self.send_json_error(f'Erro de conexão com Zabbix: {str(e)}', 502)
                except Exception as e:
                    print(f"❌ Erro ao fazer proxy Zabbix: {e}")
                    self.send_json_error(f'Erro interno no proxy: {str(e)}', 500)
                    
            else:
                self.send_json_error('Endpoint não encontrado', 404)
                
        except Exception as e:
            print(f"❌ Erro no POST: {e}")
            self.send_json_error(f"Erro interno: {e}", 500)

    def do_GET(self):
        """Handle GET requests"""
        try:
            print(f"🔍 GET: {self.path}")
            
            if self.path == '/api/health':
                self.handle_health()
            elif self.path == '/api/zabbix/hosts':
                self.handle_zabbix_hosts()
            elif self.path.startswith('/api/zabbix/metrics/'):
                self.handle_zabbix_metrics()
            elif self.path == '/api/config':
                self.handle_config()
            elif self.path.startswith('/api/stores/search'):
                self.handle_stores_search()
            elif self.path.startswith('/api/stores/'):
                # Endpoint para loja específica
                loja_id = self.path.split('/')[-1]
                self.handle_single_store(loja_id)
            else:
                # Servir arquivos estáticos
                self.serve_static_file()
                
        except Exception as e:
            print(f"❌ Erro na requisição GET {self.path}: {e}")
            self.send_json_error(f"Erro interno: {str(e)}", 500)
    
    def handle_health(self):
        """Health check endpoint"""
        lojas = get_lojas()
        self.send_json_response({
            'status': 'OK',
            'timestamp': datetime.now().isoformat(),
            'lojas_total': len(lojas),
            'excel_loaded': EXCEL_LOADED,
            'source': 'Excel file' if len(lojas) > 5 else 'Fallback data',
            'server': 'Monitoramento Dashboard CORRIGIDO v3.0'
        })
    
    def handle_zabbix_hosts(self):
        """Retorna hosts Zabbix simulados"""
        # Criar hosts baseados nas lojas carregadas
        lojas = get_lojas()[:20]  # Primeiras 20 lojas para demonstração
        
        hosts = []
        for i, loja in enumerate(lojas, 1):
            hosts.append({
                'hostid': f'100{i:02d}',
                'host': f'FortiGate-{loja["id"]}',
                'name': f'Firewall Loja {loja["id"]}',
                'status': '0' if loja['status'] == 'online' else '1',
                'available': '1',
                'loja_id': loja['id'],
                'operador': loja['operador'],
                'description': f'FortiGate da loja {loja["id"]}'
            })
        
        self.send_json_response({
            'hosts': hosts,
            'total': len(hosts),
            'source': f'Generated from {len(get_lojas())} Excel stores'
        })
    
    def handle_zabbix_metrics(self):
        """Retorna métricas simuladas"""
        hostid = self.path.split('/')[-1]
        
        import random
        
        # Métricas baseadas no host
        if hostid == '10001':  # Primeiro host
            cpu = random.randint(30, 70)
            mem = random.randint(40, 80)
            latency = random.uniform(10, 30)
        else:  # Outros dispositivos
            cpu = random.randint(20, 60)
            mem = random.randint(30, 70)
            latency = random.uniform(5, 25)
        
        metrics = {
            'uptime': random.randint(1000000, 3000000),
            'ping': round(latency, 1),
            'cpu_percent': cpu,
            'memory_percent': mem,
            'timestamp': datetime.now().isoformat()
        }
        
        self.send_json_response({
            'hostid': hostid,
            'metrics': metrics
        })
    
    def handle_single_store(self, loja_id):
        """Retorna dados de uma loja específica"""
        lojas = get_lojas()
        loja = next((l for l in lojas if l['id'] == loja_id), None)
        
        if loja:
            self.send_json_response({
                'store': loja,
                'found': True
            })
        else:
            self.send_json_error('Loja não encontrada', 404)
    
    def handle_config(self):
        """Configurações do sistema"""
        config = load_config_from_file()
        lojas = get_lojas()
        
        # Adicionar metadados
        config['lojas'] = {
            'source': 'Excel file',
            'total': len(lojas),
            'excel_loaded': EXCEL_LOADED
        }
        
        self.send_json_response(config)
    
    def handle_stores_search(self):
        """Busca de lojas com filtros (ENDPOINT PRINCIPAL CORRIGIDO)"""
        # Parse query parameters
        query_params = {}
        if '?' in self.path:
            query_string = self.path.split('?', 1)[1]
            for param in query_string.split('&'):
                if '=' in param:
                    key, value = param.split('=', 1)
                    query_params[key] = urllib.parse.unquote(value)
        
        query = query_params.get('q', '').strip()
        limit = int(query_params.get('limit', '50'))
        status_filter = query_params.get('status', '').strip()
        
        print(f"🔍 Busca: query='{query}', limit={limit}, status={status_filter}")
        
        # OBTER TODAS AS LOJAS (USA CACHE GLOBAL)
        todas_lojas = get_lojas()
        print(f"📊 Total de lojas carregadas: {len(todas_lojas)}")
        
        # Filtrar lojas
        lojas_filtradas = todas_lojas.copy()
        
        # Filtro por texto
        if query:
            query_lower = query.lower()
            lojas_filtradas = []
            
            for loja in todas_lojas:
                # Buscar em múltiplos campos
                campos_busca = [
                    loja['id'].lower(),
                    loja['nome'].lower(),
                    loja['operador'].lower(),
                    loja['endereco'].lower(),
                    loja['circuito_wan1'].lower(),
                    loja['circuito_wan2'].lower(),
                    loja['operador_wan1'].lower(),
                    loja['operador_wan2'].lower()
                ]
                
                if any(query_lower in campo for campo in campos_busca):
                    lojas_filtradas.append(loja)
        
        # Filtro por status
        if status_filter:
            lojas_filtradas = [l for l in lojas_filtradas if l['status'] == status_filter]
        
        # Aplicar limite
        resultado = lojas_filtradas[:limit]
        
        print(f"✅ Encontradas {len(resultado)} lojas de {len(todas_lojas)} total")
        
        self.send_json_response({
            'stores': resultado,
            'total': len(todas_lojas),
            'filtered': len(lojas_filtradas),
            'query': query,
            'status_filter': status_filter,
            'limit': limit,
            'source': 'Excel real' if len(todas_lojas) > 5 else 'Fallback',
            'excel_loaded': EXCEL_LOADED
        })
    
    def serve_static_file(self):
        """Serve arquivos estáticos"""
        caminho = self.path.split('?')[0]  # Remove query params
        
        print(f"📁 Servindo arquivo: {caminho}")
        
        # Determinar tipo de conteúdo
        if caminho == '/' or caminho.endswith('.html'):
            content_type = 'text/html'
            content = servir_arquivo_estatico(caminho)
        elif caminho.endswith('.css'):
            content_type = 'text/css'
            content = servir_arquivo_estatico(caminho)
        elif caminho.endswith('.js'):
            content_type = 'application/javascript'
            content = servir_arquivo_estatico(caminho)
        else:
            # Arquivo não encontrado
            self.send_json_error('Arquivo não encontrado', 404)
            return
        
        if content:
            self.send_response(200)
            self.send_header('Content-Type', content_type)
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(content.encode('utf-8'))
        else:
            self.send_json_error('Arquivo não encontrado', 404)
    
    def send_json_response(self, data, status_code=200):
        """Envia resposta JSON"""
        try:
            self.send_response(status_code)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Access-Control-Allow-Credentials', 'true')
            self.end_headers()
            
            json_str = json.dumps(data, ensure_ascii=False, indent=2)
            self.wfile.write(json_str.encode('utf-8'))
            
        except Exception as e:
            print(f"❌ Erro ao enviar JSON: {e}")
    
    def send_json_error(self, message, status_code=500):
        """Envia erro JSON"""
        self.send_json_response({
            'error': message, 
            'timestamp': datetime.now().isoformat()
        }, status_code)
    
    def log_message(self, format, *args):
        """Custom log format"""
        print(f"📡 {self.address_string()} - {format % args}")

def main():
    print("=" * 70)
    print("🚀 SERVIDOR DASHBOARD MONITORAMENTO - VERSÃO FINAL (ATUALIZADA)")
    print("=" * 70)
    
    # INICIALIZAÇÃO ÚNICA DOS DADOS
    print("🔧 Inicializando cache global...")
    lojas = carregar_lojas_excel()  # CARREGAR UMA ÚNICA VEZ
    
    print(f"📊 Sistema inicializado com {len(lojas)} lojas")
    print(f"🏪 Primeiras lojas: {', '.join([l['id'] for l in lojas[:3]])}")
    
    if len(lojas) > 5:
        print("✅ Dados carregados do Excel com sucesso!")
        print(f"🔧 Cache global configurado para persistência entre requisições")
    else:
        print("⚠️  Usando dados de fallback (Excel pode não estar acessível)")
    
    print(f"\\n🌐 Servidor rodando em: http://localhost:{PORT}")
    print("🔗 Endpoints disponíveis:")
    print(f"   GET  /api/health                    - Status do servidor")
    print(f"   GET  /api/zabbix/hosts              - Hosts Zabbix")
    print(f"   GET  /api/zabbix/metrics/<hostid>   - Métricas")
    print(f"   GET  /api/stores/search?q=<query>   - Buscar lojas")
    print(f"   GET  /api/stores/<loja_id>          - Loja específica")
    print(f"   GET  /api/config                    - Configurações (GET/POST)")
    print(f"   GET  /                              - Dashboard web")
    print("\\n📋 Para parar o servidor: Ctrl+C")
    print("=" * 70)
    
    try:
        # Configurar servidor com handler customizado
        with socketserver.TCPServer(("", PORT), APIHandler) as httpd:
            httpd.allow_reuse_address = True
            print(f"✅ Servidor ativo na porta {PORT}")
            httpd.serve_forever()
    except KeyboardInterrupt:
        print("\\n👋 Servidor encerrado pelo usuário")
    except Exception as e:
        print(f"\\n❌ Erro crítico: {e}")

if __name__ == "__main__":
    main()