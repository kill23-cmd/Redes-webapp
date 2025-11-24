@echo off
echo 🚀 INICIANDO SERVIDOR PYTHON PARA APLICAÇÃO DE MONITORAMENTO
echo ===========================================================
echo.

REM Verificar se Python está instalado
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Python não está instalado!
    echo 📦 Instale Python em: https://python.org
    echo    OU use a Solução 1 (instalar Node.js)
    pause
    exit /b 1
)

echo ✅ Python encontrado!
echo.
echo 🌐 Iniciando servidor em: http://localhost:3001
echo 📊 Acesse a aplicação no navegador
echo.
echo 🔧 Funcionalidades ativas:
echo    ✅ Hosts Zabbix mock (dispositivos simulados)
echo    ✅ Métricas CPU/Memory em tempo real
echo    ✅ Comandos SSH para FortiGate/Cisco/Mikrotik
echo    ✅ Busca de lojas (dados simulados)
echo    ✅ Upload Excel simulado
echo    ✅ Configurações de demonstração
echo.
echo 📱 Para parar o servidor: Ctrl+C
echo ===========================================================
echo.

REM Iniciar servidor Python
python servidor_python.py

pause
