# 🪟 INSTRUÇÕES PARA WINDOWS - Como Executar Sua Aplicação

## ❌ **PROBLEMA IDENTIFICADO:**
Você está tentando executar `node servidor_simples.js`, mas Node.js não está instalado no Windows.

## ✅ **4 SOLUÇÕES SIMPLES:**

### **🥇 SOLUÇÃO 1: Instalar Node.js (Recomendado)**

1. **Baixar Node.js:**
   - Vá para: https://nodejs.org
   - Baixe a versão LTS (recomendada)
   - Execute o arquivo `.msi`

2. **Reiniciar o terminal**
3. **Executar:**
   ```cmd
   node servidor_simples.js
   ```
4. **Abrir:** http://localhost:3001

---

### **🥈 SOLUÇÃO 2: Usar Python (Se já tiver Python)**

1. **Execute no terminal:**
   ```cmd
   python servidor_python.py
   ```
   OU use o arquivo:
   ```
   duplo-clique em: iniciar_servidor.bat
   ```

2. **Abrir:** http://localhost:3001

---

### **🥉 SOLUÇÃO 3: VS Code Live Server**

1. **Baixar VS Code:** https://code.visualstudio.com
2. **Instalar a extensão "Live Server"**
3. **Abrir pasta do projeto no VS Code**
4. **Clique direito no `index.html` → "Open with Live Server"**

⚠️ **Limitação:** APIs não funcionarão (apenas interface)

---

### **⚡ SOLUÇÃO 4: Teste Rápido (Demonstração)**

1. **Abra o arquivo:** `servidor_local.html`
2. **Isso demonstra o problema e as soluções**
3. **Mas a funcionalidade completa só funciona com servidor**

---

## 🚀 **COMANDO ÚNICO PARA TESTAR:**

### **Se tem Node.js:**
```cmd
node servidor_simples.js
```

### **Se tem Python:**
```cmd
python servidor_python.py
```

### **Se não tem nenhum:**
1. Instale Node.js de https://nodejs.org
2. Execute o comando acima

---

## 📱 **RESULTADO:**
- ✅ Aplicação rodando em: http://localhost:3001
- ✅ Dashboard com métricas em tempo real
- ✅ 4 dispositivos simulados
- ✅ Comandos SSH funcionando
- ✅ Busca de lojas ativa
- ✅ Interface completa

---

## 🔧 **ARQUIVOS NECESSÁRIOS:**
Certifique-se que na pasta estão:
- ✅ `index.html` (interface principal)
- ✅ `servidor_simples.js` (servidor Node.js)
- ✅ `servidor_python.py` (servidor Python)
- ✅ `iniciar_servidor.bat` (atalho para Windows)
- ✅ `js/` (scripts da aplicação)
- ✅ `styles/` (CSS da interface)

---

## 💡 **DICA RÁPIDA:**
O mais simples é **instalar Node.js** de https://nodejs.org e executar:
```cmd
node servidor_simples.js
```

🎉 **Sua aplicação funcionará perfeitamente!**
