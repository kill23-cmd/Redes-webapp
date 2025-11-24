# Gerenciador Remoto Zabbix - Versão Web

Uma aplicação web moderna para monitoramento de rede e execução de comandos remotos, inspirada no sistema desktop original mas com interface contemporânea e funcionalidades expandidas.

## 🎯 Características Principais

### Dashboard Moderno
- **Tema escuro profissional** otimizado para monitoramento contínuo
- **Layout responsivo** que se adapta a desktop, tablet e mobile
- **Cards informativos** com métricas em tempo real
- **Seções expansíveis** para melhor organização visual

### Integração com Zabbix
- **Conexão direta** com API do Zabbix
- **Busca inteligente** por lojas e circuitos
- **Carregamento automático** de hosts e métricas
- **Atualização em tempo real** dos dados

### Monitoramento Avançado
- **Gauges circulares** para CPU e Memória
- **Gráficos interativos** de tráfego de rede
- **Indicadores de status** UP/DOWN com cores intuitivas
- **Histórico temporal** de performance

### Comandos SSH
- **Perfis por tipo de dispositivo** (FortiGate, Cisco, Huawei, etc.)
- **Seleção múltipla** de comandos
- **Execução segura** com interface intuitiva
- **Histórico de comandos** para referência

### Interface Intuitiva
- **Busca rápida** por nome da loja ou circuito
- **Seleção visual** de hosts com destaque
- **Informações do link** integradas da planilha Excel
- **Configuração simplificada** com interface moderna

## 🚀 Como Usar

### 1. Configuração Inicial

1. **Abra as configurações** clicando no ícone de engrenagem no header
2. **Configure o Zabbix:**
   - URL do servidor Zabbix (ex: `https://zabbix.empresa.com`)
   - Usuário e senha
3. **Configure o SSH:**
   - Usuário e senha para conexão SSH
4. **Salve as configurações**

### 2. Navegação

1. **Selecione uma loja** no dropdown "Loja"
2. **Escolha um host** na lista que aparece
3. **Visualize as métricas** no dashboard
4. **Execute comandos** SSH conforme necessário

### 3. Funcionalidades Avançadas

#### Busca Rápida
- Digite o nome da loja no campo "Loja"
- Ou busque pelo número do circuito (WAN1/WAN2)
- Use "Limpar Filtro" para mostrar todas as opções

#### Dashboard Interativo
- **Seções expansíveis** (Status FortiGate, WAN/VPN)
- **Gauges de CPU/Memória** com animação
- **Gráficos de tráfego** em tempo real
- **Status indicadores** com cores (Verde=OK, Vermelho=Problema)

#### Comandos SSH
- **Selecionar/Desmarcar Todos** para批量操作
- **Botão "Executar"** para rodar comandos selecionados
- **Configuração Avançada** para comandos personalizados
- **Botões de ação rápida** (PuTTY, Acesso Web)

## 🏗️ Arquitetura Técnica

### Frontend
- **HTML5** com semântica moderna
- **CSS3** com variáveis customizadas e grid layout
- **JavaScript ES6+** com modularização
- **Chart.js** para visualizações de dados
- **Lucide Icons** para interface consistente

### Gerenciamento de Dados
- **API REST** para comunicação com Zabbix
- **Local Storage** para configurações persistentes
- **Debouncing** para otimização de performance
- **Cache inteligente** para reduzir chamadas API

### Responsividade
- **Mobile-first design** com breakpoints otimizados
- **Layout adaptável** que reorganiza em telas menores
- **Touch-friendly** para dispositivos móveis
- **Performance otimizada** para diferentes conexões

## 📁 Estrutura de Arquivos

```
network-monitor/
├── index.html              # Página principal
├── styles/
│   ├── main.css            # Estilos principais
│   └── components.css      # Componentes UI
├── js/
│   ├── utils.js            # Utilitários e helpers
│   ├── config-manager.js   # Gerenciamento de configurações
│   ├── zabbix-client.js    # Cliente Zabbix API
│   ├── dashboard.js        # Lógica do dashboard
│   ├── charts.js           # Gerenciamento de gráficos
│   ├── ssh-commands.js     # Comandos SSH
│   └── main.js             # Inicialização da aplicação
└── README.md               # Este arquivo
```

## ⚙️ Configurações

### Zabbix API
- **URL**: Endereço completo do servidor Zabbix
- **Usuário**: Usuário com permissões de API
- **Senha**: Senha do usuário

### SSH
- **Usuário**: Usuário para conexão SSH
- **Senha**: Senha SSH (armazenada localmente)

### Dashboard
- **Intervalo de Atualização**: Frequência de refresh automático (5-300s)
- **Período do Gráfico**: Duração dos dados históricos (1-24h)
- **Tema**: Modo escuro padrão

## 🔧 Personalização

### Adicionando Novos Perfis de Comandos

Edite o arquivo `zabbix-client.js` e adicione ao objeto `ZABBIX_COMMAND_PROFILES`:

```javascript
meu_dispositivo: [
    { name: 'Comando Personalizado', command: 'comando_a_executar' },
    { name: 'Outro Comando', command: 'outro_comando' }
]
```

### Modificando Cores do Tema

Edite as variáveis CSS no arquivo `main.css`:

```css
:root {
  --primary-500: #00B8D9;    /* Cor principal */
  --success: #22C55E;        /* Status OK */
  --error: #EF4444;          /* Status Erro */
  --warning: #F59E0B;        /* Status Aviso */
}
```

### Configurando Dados das Lojas

Para integrar com sua planilha Excel, modifique a função `loadStoresData()` no arquivo `dashboard.js`:

```javascript
loadStoresData() {
    // Carregue seus dados da planilha aqui
    this.storesData = [
        {
            Loja: 'LOJA001',
            WAN1_Operadora: 'Operadora A',
            WAN1_Circuito: 'CIR12345',
            WAN1_Banda: '100mbps'
            // ... outros campos
        }
        // ... mais lojas
    ];
}
```

## 🐛 Solução de Problemas

### Conexão com Zabbix Falha
1. Verifique se a URL está correta
2. Confirme se o usuário tem permissões de API
3. Teste a conectividade com o servidor
4. Verifique se o Zabbix está acessível via navegador

### Comandos SSH Não Executam
1. Confirme as credenciais SSH nas configurações
2. Verifique se o host está acessível
3. Teste a conexão SSH manualmente
4. Confirme se os comandos são válidos para o tipo de dispositivo

### Dashboard Não Carrega Dados
1. Verifique se o host está monitorado pelo Zabbix
2. Confirme se os itens existem no Zabbix
3. Verifique os nomes dos itens nas configurações
4. Teste a conexão com o Zabbix

### Interface Responsiva
1. Limpe o cache do navegador (Ctrl+F5)
2. Verifique se JavaScript está habilitado
3. Confirme se não há bloqueadores de conteúdo ativo

## 📱 Compatibilidade

### Navegadores Suportados
- **Chrome/Chromium** 90+
- **Firefox** 88+
- **Safari** 14+
- **Edge** 90+

### Dispositivos
- **Desktop**: Windows, macOS, Linux
- **Tablet**: iPad, Android tablets
- **Mobile**: iOS 14+, Android 8+

## 🔒 Segurança

### Configurações Locais
- Todas as configurações são armazenadas localmente (localStorage)
- Senhas são armazenadas em texto plano - use com cautela
- Dados não são enviados para servidores externos

### Zabbix API
- Comunicação via HTTPS apenas
- Tokens de autenticação gerenciados automaticamente
- Timeout configurável para conexões

### SSH
- Credenciais não são transmitidas para terceiros
- Implementação segura com validação de entrada
- Timeout configurável para conexões SSH

## 🚀 Roadmap

### Próximas Versões
- [ ] **Autenticação OAuth** para Zabbix
- [ ] **Exportação de relatórios** em PDF/Excel
- [ ] **Notificações push** para alertas críticos
- [ ] **Múltiplas instâncias** Zabbix
- [ ] **Temas customizáveis**
- [ ] **Plugin system** para extensões

### Melhorias Técnicas
- [ ] **PWA** (Progressive Web App)
- [ ] **Service Worker** para funcionamento offline
- [ ] **WebSocket** para atualizações em tempo real
- [ ] **TypedScript** para melhor type safety
- [ ] **Testes automatizados**

## 🤝 Contribuição

Para contribuir com o projeto:

1. Faça um fork do repositório
2. Crie uma branch para sua feature (`git checkout -b feature/nova-funcionalidade`)
3. Commit suas mudanças (`git commit -am 'Adiciona nova funcionalidade'`)
4. Push para a branch (`git push origin feature/nova-funcionalidade`)
5. Abra um Pull Request

## 📄 Licença

Este projeto está sob a licença MIT. Veja o arquivo `LICENSE` para mais detalhes.

## 🆘 Suporte

Para suporte técnico:

1. **Documentação**: Consulte este README
2. **Issues**: Abra uma issue no repositório
3. **Comunidade**: Participe das discussões
4. **Email**: Entre em contato pelos canais oficiais

---

**Desenvolvido com ❤️ para profissionais de redes e infraestrutura**

*Versão 2.0 - Interface Web Moderna*# Redes-webapp
