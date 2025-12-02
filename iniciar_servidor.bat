@echo off
echo [INFO] INICIANDO SERVIDOR...
echo.

python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERRO] Python nao encontrado.
    pause
    exit /b 1
)

echo [OK] Python encontrado.
echo.
echo [INFO] Iniciando servidor em: http://localhost:3020
echo [INFO] (A porta mudou de 3001 para 3020)
echo.

python main.py

if %errorlevel% neq 0 (
    echo.
    echo [ERRO] O servidor parou com erro.
)

pause
