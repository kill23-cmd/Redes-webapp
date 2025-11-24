@echo off
echo 🐍 TESTANDO SERVIDOR PYTHON
echo ===========================
echo.

echo 🔍 Verificando se Python está instalado...
python --version
if %errorlevel% equ 0 (
    echo ✅ Python encontrado!
    echo.
    echo 🚀 Iniciando servidor da aplicação...
    echo 📱 Acesse: http://localhost:3001
    echo.
    echo 🔧 Funcionalidades ativas:
    echo    ✅ Dashboard de monitoramento
    echo    ✅ 4 dispositivos simulados
    echo    ✅ Métricas em tempo real
    echo    ✅ Comandos SSH
    echo    ✅ Busca de lojas
    echo.
    echo 💡 Para parar: Ctrl+C
    echo ===========================
    echo.
    python servidor_python.py
) else (
    echo ❌ Python não encontrado!
    echo 📥 Instale Python em: https://python.org
)

pause
