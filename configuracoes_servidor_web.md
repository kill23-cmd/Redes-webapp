# Configuração de Servidores Web

## 1. Apache HTTP Server

### Ubuntu/Debian
```bash
# Instalar Apache
sudo apt update
sudo apt install apache2

# Iniciar e habilitar no boot
sudo systemctl start apache2
sudo systemctl enable apache2

# Verificar status
sudo systemctl status apache2
```

### CentOS/RHEL
```bash
# Instalar Apache
sudo yum install httpd

# Iniciar e habilitar
sudo systemctl start httpd
sudo systemctl enable httpd
```

### Configuração do Virtual Host
```apache
# /etc/apache2/sites-available/monitoramento.conf
<VirtualHost *:80>
    ServerName seu-dominio.com
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
    ErrorLog ${APACHE_LOG_DIR}/monitoramento_error.log
    CustomLog ${APACHE_LOG_DIR}/monitoramento_access.log combined
</VirtualHost>
```

### Habilitar site e módulos
```bash
# Habilitar site
sudo a2ensite monitoramento.conf

# Habilitar módulos necessários
sudo a2enmod rewrite
sudo a2enmod headers
sudo a2enmod ssl

# Recarregar configuração
sudo systemctl reload apache2
```

## 2. Nginx

### Instalação
```bash
# Ubuntu/Debian
sudo apt install nginx

# CentOS/RHEL
sudo yum install nginx

# Iniciar e habilitar
sudo systemctl start nginx
sudo systemctl enable nginx
```

### Configuração Nginx
```nginx
# /etc/nginx/sites-available/monitoramento
server {
    listen 80;
    server_name seu-dominio.com;
    root /var/www/monitoramento;
    index index.html index.htm;
    
    # Configurações de segurança
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;
    add_header Content-Security-Policy "default-src 'self' http: https: data: blob: 'unsafe-inline'" always;
    
    # Otimizações de performance
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_proxied expired no-cache no-store private must-revalidate auth;
    gzip_types
        text/plain
        text/css
        text/xml
        text/javascript
        application/javascript
        application/xml+rss
        application/json;
    
    location / {
        try_files $uri $uri/ =404;
        
        # Cache para arquivos estáticos
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }
    
    # Logs
    access_log /var/log/nginx/monitoramento_access.log;
    error_log /var/log/nginx/monitoramento_error.log;
}
```

### Habilitar site
```bash
# Criar link simbólico
sudo ln -s /etc/nginx/sites-available/monitoramento /etc/nginx/sites-enabled/

# Testar configuração
sudo nginx -t

# Recarregar Nginx
sudo systemctl reload nginx
```

## 3. Configuração com SSL (HTTPS)

### Apache com Let's Encrypt
```bash
# Instalar Certbot
sudo apt install certbot python3-certbot-apache

# Obter certificado SSL gratuito
sudo certbot --apache -d seu-dominio.com

# Auto-renovação
sudo crontab -e
# Adicionar: 0 12 * * * /usr/bin/certbot renew --quiet
```

### Nginx com Let's Encrypt
```bash
# Instalar Certbot
sudo apt install certbot python3-certbot-nginx

# Obter certificado
sudo certbot --nginx -d seu-dominio.com

# Auto-renovação
sudo crontab -e
# Adicionar: 0 12 * * * /usr/bin/certbot renew --quiet
```

## 4. Servidor com Node.js (Para backend)

### Instalação Node.js
```bash
# Instalar via NodeSource
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verificar instalação
node --version
npm --version
```

### Estrutura de projeto Node.js
```bash
mkdir monitoramento-backend
cd monitoramento-backend
npm init -y
npm install express helmet cors dotenv
```

### Servidor básico (server.js)
```javascript
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Segurança
app.use(helmet());
app.use(cors());
app.use(express.json());

// Servir arquivos estáticos
app.use(express.static(path.join(__dirname, 'public')));

// API routes (para SSH commands, etc.)
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Fallback para SPA
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
```

### Pacote Node.js (package.json)
```json
{
  "name": "monitoramento-backend",
  "version": "1.0.0",
  "description": "Backend para aplicação de monitoramento",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js",
    "test": "jest"
  },
  "dependencies": {
    "express": "^4.18.2",
    "helmet": "^7.0.0",
    "cors": "^2.8.5",
    "dotenv": "^16.3.1",
    "ssh2": "^1.15.0",
    "node-cron": "^3.0.2"
  },
  "devDependencies": {
    "nodemon": "^3.0.1",
    "jest": "^29.6.2"
  }
}
```

## 5. Configuração de Firewall

### Ubuntu (UFW)
```bash
# Permitir HTTP e HTTPS
sudo ufw allow 'Apache Full'
# Ou especificamente:
sudo ufw allow 80
sudo ufw allow 443

# Para Nginx
sudo ufw allow 'Nginx Full'
```

### CentOS/RHEL (Firewalld)
```bash
# Permitir serviços
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --reload
```

## 6. Otimizações de Performance

### Apache
```apache
# MPM Prefork para Apache
<IfModule mpm_prefork_module>
    StartServers            8
    MinSpareServers         5
    MaxSpareServers        20
    ServerLimit           256
    MaxRequestWorkers     256
    MaxConnectionsPerChild 10000
</IfModule>

# Cache do navegador
<IfModule mod_expires.c>
    ExpiresActive on
    ExpiresByType text/css "access plus 1 year"
    ExpiresByType application/javascript "access plus 1 year"
    ExpiresByType image/png "access plus 1 year"
    ExpiresByType image/jpg "access plus 1 year"
    ExpiresByType image/jpeg "access plus 1 year"
</IfModule>
```

### Nginx
```nginx
# Worker processes
worker_processes auto;
worker_connections 1024;

# Buffer sizes
client_body_buffer_size 128k;
client_max_body_size 10m;
client_header_buffer_size 1k;
large_client_header_buffers 4 4k;

# Timeouts
client_body_timeout 12;
client_header_timeout 12;
keepalive_timeout 15;
send_timeout 10;
```

## 7. Monitoramento e Logs

### Configuração de logs
```bash
# Apache logs
tail -f /var/log/apache2/access.log
tail -f /var/log/apache2/error.log

# Nginx logs
tail -f /var/log/nginx/access.log
tail -f /var/log/nginx/error.log
```

### Monitoramento com systemd
```bash
# Status do serviço
sudo systemctl status apache2
sudo systemctl status nginx

# Reiniciar serviços
sudo systemctl restart apache2
sudo systemctl restart nginx

# Logs do sistema
sudo journalctl -u apache2 -f
sudo journalctl -u nginx -f
```

## 8. Backup e Manutenção

### Backup automático
```bash
# Script de backup
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
tar -czf /backup/website_$DATE.tar.gz /var/www/html/
find /backup/ -name "website_*.tar.gz" -mtime +30 -delete
```

### Health check
```bash
# Script de verificação
#!/bin/bash
if curl -f http://localhost/ > /dev/null 2>&1; then
    echo "Website OK"
else
    echo "Website DOWN - restarting Apache"
    sudo systemctl restart apache2
fi
```

## 9. Docker (Opção Containerizada)

### Dockerfile para Node.js
```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE 3000

CMD ["node", "server.js"]
```

### Docker Compose
```yaml
version: '3.8'
services:
  web:
    build: .
    ports:
      - "80:3000"
    environment:
      - NODE_ENV=production
    restart: unless-stopped
    
  nginx:
    image: nginx:alpine
    ports:
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - /etc/letsencrypt:/etc/letsencrypt
    depends_on:
      - web
    restart: unless-stopped
```

## Considerações de Segurança

1. **Atualizações regulares**: Mantenha o sistema e servidor atualizados
2. **Fail2ban**: Proteção contra ataques de força bruta
3. **Configurações de firewall**: Restrinja acesso apenas às portas necessárias
4. **Certificados SSL**: Use sempre HTTPS em produção
5. **Logs**: Monitore logs regularmente
6. **Backups**: Faça backups regulares dos dados e configurações
7. **Monitoramento**: Configure alertas para downtime

## Próximos Passos

1. Escolha o servidor web mais adequado para sua necessidade
2. Configure SSL para segurança
3. Configure firewall
4. Implemente monitoramento
5. Configure backups automáticos
6. Teste a configuração antes de colocar em produção
