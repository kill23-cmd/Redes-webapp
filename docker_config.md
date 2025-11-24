# Configuração Docker para aplicação de monitoramento

## Dockerfile para backend
```dockerfile
# Dockerfile para Node.js backend
FROM node:18-alpine

# Instalar dependências do sistema
RUN apk add --no-cache \
    openssh-client \
    curl \
    bash

# Criar usuário não-root
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -u 1001

# Definir working directory
WORKDIR /app

# Copiar package files
COPY package*.json ./

# Instalar dependências
RUN npm ci --only=production && npm cache clean --force

# Copiar código fonte
COPY server.js ./
COPY .env ./

# Criar diretório para uploads
RUN mkdir -p uploads logs && \
    chown -R nodejs:nodejs /app

# Mudar para usuário não-root
USER nodejs

# Expor porta
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/api/health || exit 1

# Comando inicial
CMD ["node", "server.js"]
```

## Docker Compose
```yaml
version: '3.8'

services:
  # Backend API
  backend:
    build: .
    container_name: monitoramento-backend
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - PORT=3000
    env_file:
      - .env
    volumes:
      - ./uploads:/app/uploads
      - ./logs:/app/logs
    networks:
      - monitoramento
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  # Nginx reverse proxy
  nginx:
    image: nginx:alpine
    container_name: monitoramento-nginx
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./ssl:/etc/nginx/ssl:ro
      - ./monitoramento:/var/www/monitoramento:ro
      - /etc/letsencrypt:/etc/letsencrypt:ro
    depends_on:
      - backend
    networks:
      - monitoramento

  # Database (se necessário no futuro)
  database:
    image: postgres:15-alpine
    container_name: monitoramento-db
    restart: unless-stopped
    environment:
      - POSTGRES_DB=monitoramento
      - POSTGRES_USER=monitoramento
      - POSTGRES_PASSWORD=${DB_PASSWORD:-sua_senha_segura}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    networks:
      - monitoramento

networks:
  monitoramento:
    driver: bridge

volumes:
  postgres_data:
```

## Arquivo .env para Docker
```env
# Ambiente de produção
NODE_ENV=production

# Porta do backend
PORT=3000

# Configurações do Zabbix
ZABBIX_URL=https://seu-zabbix.com/api_jsonrpc.php
ZABBIX_USER=admin
ZABBIX_PASSWORD=sua_senha_zabbix

# Configurações SSH
SSH_TIMEOUT=30000

# Banco de dados (se usar)
DB_HOST=database
DB_PORT=5432
DB_NAME=monitoramento
DB_USER=monitoramento
DB_PASSWORD=sua_senha_segura

# Logs
LOG_LEVEL=info

# Segurança
ALLOWED_ORIGINS=https://seu-dominio.com,https://www.seu-dominio.com

# Configurações de upload
MAX_FILE_SIZE=10MB
UPLOAD_PATH=/app/uploads
```

## Comando Docker Compose completo
```bash
# Construir e executar
docker-compose up -d

# Ver logs
docker-compose logs -f backend
docker-compose logs -f nginx

# Ver status
docker-compose ps

# Parar serviços
docker-compose down

# Rebuild
docker-compose up -d --build

# Logs específicos
docker logs monitoramento-backend
docker logs monitoramento-nginx
```

## Docker com SSL automático
```yaml
version: '3.8'

services:
  certbot:
    image: certbot/certbot
    container_name: monitoramento-certbot
    volumes:
      - /etc/letsencrypt:/etc/letsencrypt
      - ./ssl-challenge:/var/www/certbot
    command: certonly --webroot --webroot-path=/var/www/certbot --email seu-email@dominio.com --agree-tos --no-eff-email -d seu-dominio.com
```

## Script de deploy com Docker
```bash
#!/bin/bash
# deploy-docker.sh

echo "🚀 Deployando aplicação de monitoramento com Docker..."

# Parar serviços existentes
docker-compose down

# Backup dos dados importantes
if [ -f .env ]; then
    cp .env .env.backup.$(date +%Y%m%d_%H%M%S)
fi

if [ -d uploads ]; then
    tar -czf uploads_backup_$(date +%Y%m%d_%H%M%S).tar.gz uploads/
fi

# Construir e iniciar serviços
echo "🔨 Construindo imagens Docker..."
docker-compose build --no-cache

echo "🌟 Iniciando serviços..."
docker-compose up -d

# Aguardar serviços ficarem prontos
echo "⏳ Aguardando serviços ficarem prontos..."
sleep 10

# Verificar status
echo "📊 Status dos serviços:"
docker-compose ps

# Testar backend
echo "🔍 Testando backend..."
if curl -f http://localhost:3000/api/health; then
    echo "✅ Backend OK"
else
    echo "❌ Backend com problemas"
    docker logs monitoramento-backend
fi

# Testar Nginx
echo "🔍 Testando Nginx..."
if curl -f http://localhost/; then
    echo "✅ Nginx OK"
else
    echo "❌ Nginx com problemas"
    docker logs monitoramento-nginx
fi

echo "🎉 Deploy concluído!"
echo "📱 Acesse sua aplicação em: https://seu-dominio.com"
echo "📊 API Health: https://seu-dominio.com/api/health"
```

## Comandos úteis Docker
```bash
# Monitoramento de recursos
docker stats

# Executar comandos no container
docker exec -it monitoramento-backend sh
docker exec -it monitoramento-nginx sh

# Copiar arquivos
docker cp monitoramento-backend:/app/logs ./logs-backup

# Limpar containers não utilizados
docker system prune -f

# Ver logs em tempo real
docker-compose logs -f --tail=100

# Reiniciar container específico
docker-compose restart backend
docker-compose restart nginx

# Backup do banco de dados
docker exec monitoramento-db pg_dump -U monitoramento monitoramento > backup_$(date +%Y%m%d).sql

# Restaurar banco de dados
docker exec -i monitoramento-db psql -U monitoramento monitoramento < backup_20231124.sql
```

## Monitoramento com Docker
```bash
# Script de monitoramento
#!/bin/bash
# monitor-docker.sh

CONTAINERS=("monitoramento-backend" "monitoramento-nginx" "monitoramento-db")

for container in "${CONTAINERS[@]}"; do
    if docker ps | grep -q "$container"; then
        echo "✅ $container: Running"
    else
        echo "❌ $container: Stopped"
        # Tentar reiniciar
        docker start "$container"
    fi
done

# Verificar uso de recursos
echo "📊 Uso de recursos:"
docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}\t{{.BlockIO}}"
```
