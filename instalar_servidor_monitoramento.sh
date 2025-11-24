#!/bin/bash

# Script de configuração automática para aplicação de monitoramento
# Autor: MiniMax Agent

echo "=== CONFIGURANDO SERVIDOR WEB PARA APLICAÇÃO DE MONITORAMENTO ==="

# Atualizar sistema
echo "1. Atualizando sistema..."
sudo apt update && sudo apt upgrade -y

# Instalar Apache
echo "2. Instalando Apache..."
sudo apt install apache2 -y

# Instalar dependências
echo "3. Instalando dependências..."
sudo apt install nodejs npm certbot python3-certbot-apache ufw -y

# Criar estrutura de diretórios
echo "4. Criando estrutura de diretórios..."
sudo mkdir -p /var/www/monitoramento
sudo mkdir -p /etc/monitoramento

# Configurar Apache
echo "5. Configurando Apache..."
sudo tee /etc/apache2/sites-available/monitoramento.conf > /dev/null <<EOF
<VirtualHost *:80>
    ServerName $(hostname -I | awk '{print $1}')
    DocumentRoot /var/www/monitoramento
    
    <Directory /var/www/monitoramento>
        Options -Indexes +FollowSymLinks
        AllowOverride All
        Require all granted
    </Directory>
    
    # Configurações de segurança
    ServerTokens Prod
    Header always set X-Content-Type-Options nosniff
    Header always set X-Frame-Options SAMEORIGIN
    
    # Logs
    ErrorLog \${APACHE_LOG_DIR}/monitoramento_error.log
    CustomLog \${APACHE_LOG_DIR}/monitoramento_access.log combined
</VirtualHost>
EOF

# Habilitar módulos e site
echo "6. Habilitando módulos e site..."
sudo a2enmod rewrite
sudo a2enmod headers
sudo a2enmod ssl
sudo a2dissite 000-default
sudo a2ensite monitoramento.conf

# Configurar firewall
echo "7. Configurando firewall..."
sudo ufw --force reset
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 'Apache Full'
sudo ufw allow ssh
sudo ufw --force enable

# Configurar Node.js backend
echo "8. Configurando backend Node.js..."
sudo mkdir -p /var/www/monitoramento-backend
cd /var/www/monitoramento-backend

# Criar package.json
sudo tee package.json > /dev/null <<EOF
{
  "name": "monitoramento-backend",
  "version": "1.0.0",
  "description": "Backend para aplicação de monitoramento de rede",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "helmet": "^7.0.0",
    "cors": "^2.8.5",
    "dotenv": "^16.3.1",
    "ssh2": "^1.15.0",
    "node-cron": "^3.0.2",
    "multer": "^1.4.5-lts.1"
  },
  "devDependencies": {
    "nodemon": "^3.0.1"
  }
}
EOF

# Criar servidor Node.js
sudo tee server.js > /dev/null <<EOF
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const path = require('path');
const ssh2 = require('ssh2');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../monitoramento')));

// API Routes
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// SSH Commands endpoint
app.post('/api/ssh-execute', async (req, res) => {
    const { host, username, password, command } = req.body;
    
    try {
        const { Client } = require('ssh2');
        const conn = new Client();
        
        conn.on('ready', () => {
            conn.exec(command, (err, stream) => {
                if (err) {
                    res.status(500).json({ error: err.message });
                    return;
                }
                
                let output = '';
                stream.on('close', () => {
                    conn.end();
                    res.json({ output });
                });
                
                stream.on('data', (data) => {
                    output += data.toString();
                });
                
                stream.stderr.on('data', (data) => {
                    output += data.toString();
                });
            });
        });
        
        conn.connect({
            host: host,
            port: 22,
            username: username,
            password: password
        });
        
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Upload Excel file
app.post('/api/upload-excel', (req, res) => {
    const multer = require('multer');
    const upload = multer({ dest: 'uploads/' });
    
    upload.single('excelFile')(req, res, (err) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json({ message: 'File uploaded successfully' });
    });
});

// Servir aplicação web
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../monitoramento/index.html'));
});

// Iniciar servidor
app.listen(PORT, () => {
    console.log(\`Servidor rodando na porta \${PORT}\`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('SIGINT received');
    process.exit(0);
});
EOF

# Instalar dependências Node.js
echo "9. Instalando dependências Node.js..."
sudo npm install

# Criar arquivo de ambiente
sudo tee .env > /dev/null <<EOF
NODE_ENV=production
PORT=3000
LOG_LEVEL=info
MAX_SSH_CONNECTIONS=10
SSH_TIMEOUT=30000
EOF

# Criar script de inicialização
echo "10. Criando serviço systemd..."
sudo tee /etc/systemd/system/monitoramento-backend.service > /dev/null <<EOF
[Unit]
Description=Monitoramento Backend Service
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/var/www/monitoramento-backend
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

# Configurar logs
sudo mkdir -p /var/log/monitoramento
sudo tee /etc/logrotate.d/monitoramento > /dev/null <<EOF
/var/log/monitoramento/*.log {
    daily
    missingok
    rotate 52
    compress
    delaycompress
    notifempty
    create 0644 www-data www-data
}
EOF

# Habilitar e iniciar serviços
echo "11. Iniciando serviços..."
sudo systemctl daemon-reload
sudo systemctl enable monitoramento-backend
sudo systemctl start monitoramento-backend
sudo systemctl restart apache2

echo "=== CONFIGURAÇÃO CONCLUÍDA ==="
echo "Servidor web configurado com sucesso!"
echo ""
echo "Próximos passos:"
echo "1. Copie os arquivos da aplicação para /var/www/monitoramento/"
echo "2. Configure SSL: sudo certbot --apache -d seu-dominio.com"
echo "3. Acesse: http://$(hostname -I | awk '{print $1}')"
echo "4. Verifique status: sudo systemctl status monitoramento-backend"
echo ""
echo "Logs disponíveis em:"
echo "- Apache: /var/log/apache2/"
echo "- Backend: /var/log/monitoramento/"
echo "- Backend status: sudo systemctl status monitoramento-backend"
