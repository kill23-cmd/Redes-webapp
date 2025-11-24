# 🚀 GUIA RÁPIDO: Configurando Servidor Web para Monitoramento

## 📋 **PRÉ-REQUISITOS**

- Servidor Ubuntu 20.04+ ou CentOS 8+
- Acesso root/sudo
- Domínio configurado (opcional para desenvolvimento)

## ⚡ **INSTALAÇÃO RÁPIDA (5 MINUTOS)**

### 1. **Download e execução do script automático**
```bash
# Fazer o script executável
chmod +x instalar_servidor_monitoramento.sh

# Executar (irá instalar tudo automaticamente)
sudo ./instalar_servidor_monitoramento.sh
```

### 2. **Copiar aplicação web**
```bash
# Copiar arquivos da aplicação para o servidor web
sudo cp -r /caminho/para/sua/aplicacao/* /var/www/monitoramento/

# Ou se já tiver os arquivos localmente:
# cd /var/www/monitoramento
# sudo wget -r -np -k https://seu-dominio.com
```

## 🏗️ **CONFIGURAÇÃO MANUAL (SE PREFERIR)**

### Ubuntu/Debian
```bash
# Atualizar sistema
sudo apt update && sudo apt upgrade -y

# Instalar Apache + Node.js
sudo apt install apache2 nodejs npm curl -y

# Instalar Certbot para SSL
sudo apt install certbot python3-certbot-apache -y

# Configurar firewall
sudo ufw allow 'Apache Full'
sudo ufw allow ssh
sudo ufw --force enable
```

### CentOS/RHEL
```bash
# Instalar Apache + Node.js
sudo yum install httpd nodejs npm curl -y

# Instalar EPEL
sudo yum install epel-release -y

# Instalar Certbot
sudo yum install certbot python3-certbot-apache -y

# Configurar firewall
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --permanent --add-service=ssh
sudo firewall-cmd --reload
```

## 🔧 **CONFIGURAÇÃO DO SERVIDOR**

### 1. **Criar estrutura de diretórios**
```bash
sudo mkdir -p /var/www/monitoramento
sudo mkdir -p /var/www/monitoramento-backend
sudo mkdir -p /var/log/monitoramento
sudo chown -R www-data:www-data /var/www/monitoramento*
```

### 2. **Configurar Apache**
```bash
# Criar configuração do site
sudo nano /etc/apache2/sites-available/monitoramento.conf
```

**Conteúdo do arquivo `/etc/apache2/sites-available/monitoramento.conf`:**
```apache
<VirtualHost *:80>
    ServerName SEU-DOMINIO.COM
    ServerAdmin admin@seu-dominio.com
    DocumentRoot /var/www/monitoramento
    
    <Directory /var/www/monitoramento>
        Options -Indexes +FollowSymLinks
        AllowOverride All
        Require all granted
        
        # Cache para arquivos estáticos
        <FilesMatch "\.(css|js|png|jpg|jpeg|gif|ico|svg)$">
            ExpiresActive On
            ExpiresDefault "access plus 1 year"
        </FilesMatch>
    </Directory>
    
    # Proxy para backend Node.js
    ProxyPreserveHost On
    ProxyPass /api/ http://localhost:3000/api/
    ProxyPassReverse /api/ http://localhost:3000/api/
    
    # Configurações de segurança
    ServerTokens Prod
    Header always set X-Content-Type-Options nosniff
    Header always set X-Frame-Options SAMEORIGIN
    Header always set X-XSS-Protection "1; mode=block"
    
    # Logs
    ErrorLog ${APACHE_LOG_DIR}/monitoramento_error.log
    CustomLog ${APACHE_LOG_DIR}/monitoramento_access.log combined
</VirtualHost>
```

### 3. **Habilitar módulos e site**
```bash
sudo a2enmod rewrite
sudo a2enmod headers
sudo a2enmod proxy
sudo a2enmod proxy_http
sudo a2dissite 000-default
sudo a2ensite monitoramento.conf
sudo systemctl restart apache2
```

## 📱 **CONFIGURAÇÃO DO BACKEND**

### 1. **Instalar dependências Node.js**
```bash
cd /var/www/monitoramento-backend

# Criar package.json
cat > package.json << EOF
{
  "name": "monitoramento-backend",
  "version": "1.0.0",
  "description": "Backend para monitoramento de rede",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "helmet": "^7.0.0",
    "cors": "^2.8.5",
    "ssh2": "^1.15.0",
    "node-cron": "^3.0.2",
    "dotenv": "^16.3.1"
  }
}
EOF

# Instalar dependências
sudo npm install
```

### 2. **Copiar servidor**
```bash
# Copiar o arquivo servidor_backend_monitoramento.js criado
sudo cp /workspace/servidor_backend_monitoramento.js /var/www/monitoramento-backend/server.js
```

### 3. **Criar arquivo de ambiente**
```bash
cd /var/www/monitoramento-backend
sudo nano .env
```

**Conteúdo do arquivo `.env`:**
```env
NODE_ENV=production
PORT=3000
ZABBIX_URL=https://seu-zabbix.com
ZABBIX_USER=admin
ZABBIX_PASSWORD=sua-senha-zabbix
SSH_TIMEOUT=30000
LOG_LEVEL=info
ALLOWED_ORIGINS=http://localhost,https://seu-dominio.com
```

### 4. **Criar serviço systemd**
```bash
sudo nano /etc/systemd/system/monitoramento-backend.service
```

**Conteúdo do arquivo:**
```ini
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
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

### 5. **Habilitar e iniciar serviço**
```bash
sudo systemctl daemon-reload
sudo systemctl enable monitoramento-backend
sudo systemctl start monitoramento-backend
sudo systemctl status monitoramento-backend
```

## 🔒 **CONFIGURAÇÃO SSL (HTTPS)**

### Com Let's Encrypt (Gratuito)
```bash
# Substitua SEU-DOMINIO.COM pelo seu domínio real
sudo certbot --apache -d SEU-DOMINIO.COM

# Para renovação automática
sudo crontab -e
# Adicionar linha:
0 12 * * * /usr/bin/certbot renew --quiet
```

### Sem SSL (apenas desenvolvimento)
```bash
# Modificar configuração do Apache para HTTP apenas
sudo nano /etc/apache2/sites-available/monitoramento.conf
# Alterar <VirtualHost *:80> para usar porta 8080 se necessário
```

## ✅ **TESTES E VERIFICAÇÃO**

### 1. **Testar backend**
```bash
# Verificar se está rodando
sudo systemctl status monitoramento-backend

# Testar health check
curl http://localhost:3000/api/health
```

### 2. **Testar Apache**
```bash
# Verificar configuração
sudo apache2ctl configtest
sudo systemctl status apache2

# Testar site
curl http://localhost
```

### 3. **Testar firewall**
```bash
# Verificar portas abertas
sudo ufw status
sudo netstat -tlnp | grep :80
sudo netstat -tlnp | grep :3000
```

## 📊 **ACOMPANHAMENTO E LOGS**

### Logs importantes:
```bash
# Logs do Apache
sudo tail -f /var/log/apache2/monitoramento_access.log
sudo tail -f /var/log/apache2/monitoramento_error.log

# Logs do Backend
sudo tail -f /var/log/syslog | grep monitoramento

# Status dos serviços
sudo systemctl status apache2
sudo systemctl status monitoramento-backend
```

### Monitoramento:
```bash
# Uso de recursos
htop
df -h
free -h

# Conexões de rede
ss -tuln
netstat -an | grep :80
netstat -an | grep :3000
```

## 🚨 **COMANDOS DE MANUTENÇÃO**

### Reiniciar serviços:
```bash
sudo systemctl restart apache2
sudo systemctl restart monitoramento-backend
```

### Verificar configuração:
```bash
# Apache
sudo apache2ctl configtest

# Node.js
cd /var/www/monitoramento-backend && node server.js
```

### Backup:
```bash
# Backup da aplicação
sudo tar -czf backup_monitoramento_$(date +%Y%m%d).tar.gz /var/www/monitoramento*

# Backup das configurações
sudo tar -czf backup_config_$(date +%Y%m%d).tar.gz /etc/apache2/sites-available/monitoramento.conf /etc/systemd/system/monitoramento-backend.service /var/www/monitoramento-backend/.env
```

## 🔧 **SOLUÇÃO DE PROBLEMAS**

### Backend não inicia:
```bash
# Verificar logs
sudo journalctl -u monitoramento-backend -f

# Verificar dependências
cd /var/www/monitoramento-backend && npm list

# Testar manualmente
cd /var/www/monitoramento-backend && node server.js
```

### Apache não serve arquivos:
```bash
# Verificar permissões
sudo chown -R www-data:www-data /var/www/monitoramento
sudo chmod -R 755 /var/www/monitoramento

# Verificar configuração
sudo apache2ctl -S
```

### Problemas de conectividade:
```bash
# Verificar firewall
sudo ufw status verbose

# Verificar se portas estão abertas
sudo netstat -tlnp | grep :80
sudo netstat -tlnp | grep :443
```

## 📞 **SUPORTE**

Para suporte adicional, consulte:
- Logs do sistema: `/var/log/syslog`
- Status dos serviços: `systemctl status`
- Monitoramento de rede: `netstat`, `ss`, `htop`

---

**🎉 Servidor configurado com sucesso!** 

Acesse sua aplicação em: `http://SEU-DOMINIO.COM` ou `http://IP-DO-SERVIDOR`
