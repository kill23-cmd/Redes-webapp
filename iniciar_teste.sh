#!/bin/bash

echo "🚀 INICIANDO SERVIDOR DE TESTE PARA APLICAÇÃO DE MONITORAMENTO"
echo "============================================="

# Verificar se Node.js está instalado
if ! command -v node &> /dev/null; then
    echo "❌ Node.js não está instalado!"
    echo "📦 Instalando Node.js..."
    
    # Ubuntu/Debian
    if command -v apt &> /dev/null; then
        sudo apt update
        sudo apt install nodejs npm -y
    # CentOS/RHEL
    elif command -v yum &> /dev/null; then
        sudo yum install nodejs npm -y
    # macOS
    elif command -v brew &> /dev/null; then
        brew install node
    else
        echo "❌ Instale Node.js manualmente: https://nodejs.org"
        exit 1
    fi
fi

# Verificar se as dependências estão instaladas
if [ ! -f "node_modules/express/package.json" ]; then
    echo "📦 Instalando dependências..."
    npm install express cors
fi

echo "✅ Servidor pronto!"
echo ""
echo "🌐 Iniciando servidor em: http://localhost:8080"
echo "📊 Acesse a aplicação no navegador"
echo ""
echo "🔧 Funcionalidades ativas:"
echo "   ✅ Hosts Zabbix mock (dispositivos simulados)"
echo "   ✅ Métricas CPU/Memory em tempo real"
echo "   ✅ Comandos SSH para FortiGate/Cisco/Mikrotik"
echo "   ✅ Busca de lojas (dados simulados)"
echo "   ✅ Upload Excel simulado"
echo "   ✅ Configurações de demonstração"
echo ""
echo "📱 Para parar o servidor: Ctrl+C"
echo "============================================="
echo ""

# Iniciar servidor
node servidor_teste.js