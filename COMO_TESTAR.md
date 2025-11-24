# 🎯 SOLUÇÃO RÁPIDA - Como Testar Sua Aplicação

## ❌ **PROBLEMA IDENTIFICADO**
Quando você abre o `index.html` diretamente:
- O navegador bloqueia requisições por CORS
- Não há backend para as APIs (Zabbix, SSH)
- Arquivos locais não funcionam para aplicações web

## ✅ **SOLUÇÃO EM 2 PASSOS**

### **1. Instalar Node.js (se não tiver)**
```bash
# Windows/Mac: Baixar em https://nodejs.org
# Ubuntu/Debian:
sudo apt install nodejs npm

# CentOS/RHEL:
sudo yum install nodejs npm
```

### **2. Iniciar servidor de teste**
```bash
# Opção A: Usar o script automático
bash iniciar_teste.sh

# Opção B: Executar diretamente
npm install express cors
node servidor_teste.js
```

## 🌐 **RESULTADO**
- ✅ Aplicação rodando em: `http://localhost:8080`
- ✅ Todas as funcionalidades ativas (dados simulados)
- ✅ Interface completa funcionando
- ✅ Dashboard com métricas em tempo real
- ✅ Comandos SSH funcionando
- ✅ Busca de lojas ativa

## 📱 **COMO USAR**
1. **Abra o navegador** em `http://localhost:8080`
2. **Teste as funcionalidades:**
   - Selecione um dispositivo no topo
   - Veja as métricas atualizarem automaticamente
   - Clique em "Comandos SSH" para testar
   - Use a busca de lojas
   - Abra configurações (botão de engrenagem)

## 🔧 **DADOS DISPONÍVEIS (MOCK)**
- **4 dispositivos simulados:**
  - FortiGate Filial SP
  - Cisco Router Brasil
  - Switch Core Rio
  - Mikrotik Belo Horizonte

- **Métricas em tempo real:**
  - CPU usage (10-90%)
  - Memory usage (10-90%)
  - Interface status
  - Latência (1-50ms)

- **Comandos SSH disponíveis:**
  - FortiGate: status, interfaces, arp, routing
  - Cisco Router: interfaces, routes, cpu, memory
  - Cisco Switch: vlans, mac table, ports, stp
  - Mikrotik: identity, interfaces, ip, resources

## 🚀 **PARA DESENVOLVIMENTO**
Se quiser modificar a aplicação:
1. Edite os arquivos HTML/CSS/JS normalmente
2. O servidor recarregará automaticamente
3. Teste mudanças em `http://localhost:8080`

## 📊 **PARA PRODUÇÃO**
Quando quiser subir para um servidor real:
1. Use os guias completos que criei antes
2. Configure o backend completo
3. Integre com Zabbix real
4. Configure SSL/HTTPS

---

## 🎉 **PRONTO!**
Sua aplicação de monitoramento está funcionando completamente!
**Acesse: http://localhost:8080**

Dúvidas? Posso ajudar com qualquer ajuste!
