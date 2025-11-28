class NetworkDashboard {
    constructor() {
        this.zabbixClient = null;
        this.currentSelectedHost = null;
        this.deviceType = 'default';
        this.storesData = [];
        this.linksDashboard = null;
        this.initializeEventListeners();
        this.initializeDashboard();
    }

    initializeEventListeners() {
        document.getElementById('store-search').addEventListener('input', debounce(() => this.performSearch(), 300));
        document.getElementById('circuit-search').addEventListener('input', debounce(() => this.performSearch(), 300));
        document.getElementById('clear-search').addEventListener('click', () => this.clearSearch());
        document.getElementById('store-select').addEventListener('change', (e) => this.onStoreSelect(e.target.value));
        document.getElementById('btn-backup-config').addEventListener('click', () => this.downloadRunningConfig());

        document.getElementById('run-commands').addEventListener('click', () => this.runSelectedCommands());
        document.getElementById('select-all').addEventListener('click', () => this.selectAllCommands());
        document.getElementById('deselect-all').addEventListener('click', () => this.deselectAllCommands());
        document.getElementById('connect-putty').addEventListener('click', () => this.connectPuTTY());
        document.getElementById('web-access').addEventListener('click', () => this.openWebAccess());
        document.getElementById('btn-links-down').addEventListener('click', () => {
            if (this.linksDashboard) this.linksDashboard.show();
            else alert('Aguarde a conexão com o Zabbix...');
        });
    }

    initializeDashboard() {
        if (configManager.getSummary().zabbixConfigured) {
            this.initializeZabbixClient();
        } else {
            this.loadStoresData();
        }
        lucide.createIcons();
    }

    async initializeZabbixClient() {
        const config = configManager.config;
        this.zabbixClient = new ZabbixClient(config.zabbix.url, config.zabbix.user, config.zabbix.password);
        await this.zabbixClient.authenticate();
        this.linksDashboard = new LinksDashboard(this.zabbixClient);
        await this.loadStoresData();
    }

    async loadStoresData() {
        try {
            const response = await fetch('/api/stores/search?limit=1000');
            const data = await response.json();
            this.storesData = data.stores || [];
            this.populateStoreSelect(this.storesData);
        } catch (e) { console.error(e); }
    }

    populateStoreSelect(stores) {
        const select = document.getElementById('store-select');
        if (!select) return;
        select.innerHTML = '<option value="">-- Selecione uma loja --</option>';
        stores.sort((a, b) => a.id.localeCompare(b.id));
        stores.forEach(s => {
            const opt = document.createElement('option');
            opt.value = s.id;
            opt.textContent = `${s.id} - ${s.nome}`;
            select.appendChild(opt);
        });
    }

    performSearch() {
        const qStore = document.getElementById('store-search').value.toLowerCase();
        const qCirc = document.getElementById('circuit-search').value.toLowerCase();
        const options = Array.from(document.querySelectorAll('#store-select option')).slice(1);

        options.forEach(opt => {
            const storeData = this.storesData.find(s => s.id === opt.value);
            const matchStore = !qStore || opt.textContent.toLowerCase().includes(qStore);
            let matchCirc = true;
            if (qCirc && storeData) {
                const w1 = (storeData.circuito_wan1 || '').toLowerCase();
                const w2 = (storeData.circuito_wan2 || '').toLowerCase();
                matchCirc = w1.includes(qCirc) || w2.includes(qCirc);
            }
            opt.style.display = (matchStore && matchCirc) ? 'block' : 'none';
        });
    }

    async onStoreSelect(storeId) {
        if (!storeId) return;
        this.updateLinkInfo(storeId);

        const btnBackup = document.getElementById('btn-backup-config'); // <-- ADICIONADO
        if (btnBackup) btnBackup.style.display = 'none';                // <-- ADICIONADO

        let hosts = [];
        if (this.zabbixClient && this.zabbixClient.isAuthenticated) {
            try {
                const groups = await this.zabbixClient.getHostGroups();
                const group = groups.find(g => g.name.toLowerCase().includes(storeId.toLowerCase()));
                if (group) hosts = await this.zabbixClient.getHostsByGroupId(group.groupid);
            } catch (e) { console.warn(e); }
        }

        if (hosts.length === 0) {
            hosts = [{ hostid: 'sim', name: `Simulado-${storeId}`, host: '192.168.1.1', inventory: { os: 'FortiOS' } }];
        }

        this.populateHostsList(hosts);
        if (hosts.length > 0) this.onHostSelect(hosts[0]);
    }

    populateHostsList(hosts) {
        const list = document.getElementById('hosts-list');
        if (!list) return;
        list.innerHTML = '';
        hosts.forEach(h => {
            const div = document.createElement('div');
            div.className = 'host-item';
            div.innerHTML = `<i data-lucide="server" style="width:14px"></i> ${h.name}`;
            div.onclick = () => {
                document.querySelectorAll('.host-item').forEach(el => el.classList.remove('selected'));
                div.classList.add('selected');
                this.onHostSelect(h);
            };
            list.appendChild(div);
        });
        lucide.createIcons();
    }

    async onHostSelect(host) {
        this.currentSelectedHost = host;
        
        // 1. Determina o tipo de dispositivo PRIMEIRO
        this.deviceType = this.determineDeviceType(host);

        // 2. Lógica do Botão de Backup
        const btnBackup = document.getElementById('btn-backup-config');
        if (btnBackup) {
            // Se for Access Point, ESCONDE. Caso contrário, MOSTRA.
            if (this.deviceType === 'access_point') {
                btnBackup.style.display = 'none';
            } else {
                btnBackup.style.display = 'inline-flex';
            }
        }

        // 3. Atualiza a UI padrão
        document.getElementById('device-name').textContent = host.name;
        const ip = (host.interfaces && host.interfaces[0]) ? host.interfaces[0].ip : host.host;
        document.getElementById('device-ip').textContent = ip;
        document.getElementById('device-type-badge').textContent = this.deviceType.replace('_', ' ').toUpperCase();

        this.updateLayoutByDeviceType(this.deviceType);
        this.loadCommandsForDevice();

        this.showLoading('Atualizando...');
        try {
            const searchNames = [
                'CPU', 'ICMP', 'Ping', 'Uptime', 'wan1', 'wan2', 'bits', 'sent', 'received',
                'status', 'memory', 'available', 'total', 'utilization', 'out', 'in', 'usage'
            ];

            const items = await this.zabbixClient.getItemsByNamePattern(host.hostid, searchNames.join(','));
            const problems = await this.zabbixClient.getHostProblems(host.hostid);

            const data = ZabbixDataProcessor.processDashboardData(items, problems, this.deviceType);
            this.updateDashboardUI(data);

            if (this.deviceType === 'fortinet_firewall') {
                this.updateCharts(host.hostid, items);
            }
        } catch (e) { console.error(e); }
        finally { this.hideLoading(); }
    }

    updateLayoutByDeviceType(type) {
        document.getElementById('section-wan').style.display = 'none';
        document.getElementById('section-switch').style.display = 'none';
        document.getElementById('section-ap').style.display = 'none';

        if (type === 'fortinet_firewall') document.getElementById('section-wan').style.display = 'block';
        else if (type.includes('switch')) document.getElementById('section-switch').style.display = 'block';
        else if (type === 'access_point') document.getElementById('section-ap').style.display = 'block';
    }

    updateDashboardUI(data) {
        this.updateElement('card-uptime', data.uptime);
        this.updateElement('sidebar-uptime', data.uptime);
        this.updateElement('card-latency', data.latency);
        this.updateElement('sidebar-latency', data.latency);
        this.updateElement('card-loss', data.loss);
        this.updateElement('sidebar-loss', data.loss);

        const isUp = data.uptime !== '--' && data.uptime !== 'N/A';
        const dot = document.getElementById('card-status-indicator');
        if (dot) dot.className = `status-dot ${isUp ? 'up' : 'down'}`;

        if (data.cpu !== '--') window.dashboardCharts.chartManager.updateGaugeChart('cpu-gauge', parseFloat(data.cpu));
        if (data.memory !== '--') window.dashboardCharts.chartManager.updateGaugeChart('memory-gauge', parseFloat(data.memory));
        document.getElementById('cpu-gauge-value').textContent = data.cpu !== '--' ? data.cpu + '%' : '--';
        document.getElementById('memory-gauge-value').textContent = data.memory !== '--' ? data.memory + '%' : '--';

        if (this.deviceType.includes('switch')) {
            this.updateElement('switch-interfaces-down', data.dynamic.interfacesDown || '0');
            const list = document.getElementById('switch-problems-list');
            if (list && data.dynamic.problems) {
                list.innerHTML = data.dynamic.problems.slice(0, 3).map(p => `<div>• ${p}</div>`).join('');
            }
        }
        if (this.deviceType === 'access_point') {
            this.updateElement('ap-latency', data.latency);
            this.updateElement('ap-loss', data.loss);
        }

        if (this.deviceType === 'fortinet_firewall') {
            const dyn = data.dynamic;
            this.updateElement('card-wan1-status', dyn.wan1Status);
            this.updateElement('card-wan1-speed', dyn.wan1Speed);
            this.updateElement('card-wan1-upload', dyn.wan1Upload);
            this.updateElement('card-wan1-download', dyn.wan1Download);
            this.updateElement('card-wan2-status', dyn.wan2Status);
            this.updateElement('card-wan2-speed', dyn.wan2Speed);
            this.updateElement('card-wan2-upload', dyn.wan2Upload);
            this.updateElement('card-wan2-download', dyn.wan2Download);
        }
    }

    updateLinkInfo(storeId) {
        const data = this.storesData.find(s => s.id === storeId);
        if (!data) return;
        this.updateElement('wan1-banda', data.banda_wan1);
        this.updateElement('wan1-op', data.operador_wan1);
        this.updateElement('wan1-circ', data.circuito_wan1);
        this.updateElement('wan2-banda', data.banda_wan2);
        this.updateElement('wan2-op', data.operador_wan2);
        this.updateElement('wan2-circ', data.circuito_wan2);
    }

    async updateCharts(hostId, itemsData) {
        if (!window.dashboardCharts || !this.zabbixClient) return;

        // Função de busca flexível para achar os IDs corretos
        const findId = (terms) => {
            for (const [name, item] of Object.entries(itemsData)) {
                const n = name.toLowerCase();
                if (terms.every(k => n.includes(k))) return item.itemid;
            }
            return null;
        };

        // Tenta achar IDs de tráfego (WAN1)
        // Usando termos mais específicos para evitar 'discarded' ou 'errors'
        const w1In = findId(['wan1', 'bits received']);
        const w1Out = findId(['wan1', 'bits sent']);

        // Tenta achar IDs de tráfego (WAN2)
        const w2In = findId(['wan2', 'bits received']);
        const w2Out = findId(['wan2', 'bits sent']);

        // Atualiza WAN 1
        if (w1In && w1Out) {
            const histIn = await this.zabbixClient.getItemHistory(w1In, 1);
            const histOut = await this.zabbixClient.getItemHistory(w1Out, 1);
            // Divide por 1 milhão para Mbps
            const fmt = (h) => h.map(p => ({ x: new Date(p.clock * 1000), y: (parseFloat(p.value) / 1000000) }));
            window.dashboardCharts.chartManager.updateTrafficChart('wan1-traffic-chart', fmt(histOut), fmt(histIn));
        }

        // Atualiza WAN 2
        if (w2In && w2Out) {
            const histIn = await this.zabbixClient.getItemHistory(w2In, 1);
            const histOut = await this.zabbixClient.getItemHistory(w2Out, 1);
            const fmt = (h) => h.map(p => ({ x: new Date(p.clock * 1000), y: (parseFloat(p.value) / 1000000) }));
            window.dashboardCharts.chartManager.updateTrafficChart('wan2-traffic-chart', fmt(histOut), fmt(histIn));
        }
    }

    loadCommandsForDevice() {
        const list = document.getElementById('commands-list');
        if (!list) return;
        list.innerHTML = '';

        // Garante que os perfis foram carregados do ZabbixClient
        const profiles = window.ZABBIX_COMMAND_PROFILES || {};
        let cmds = profiles[this.deviceType];

        // Fallback se não encontrar exato (ex: 'cisco_switch' vs 'default')
        if (!cmds) cmds = profiles['default'] || [];

        if (cmds.length === 0) {
            list.innerHTML = '<div style="color:#666; padding:10px; text-align:center">Sem comandos disponíveis</div>';
            return;
        }

        cmds.forEach((c, i) => {
            const div = document.createElement('div');
            div.className = 'command-item';
            div.innerHTML = `
                <input type="checkbox" id="cmd-${i}" class="cmd-chk" data-cmd="${c.command}">
                <label for="cmd-${i}">${c.name}</label>
            `;
            list.appendChild(div);
        });
    }

    updateElement(id, val) { const el = document.getElementById(id); if (el) el.textContent = val || '--'; }
    showLoading(msg) { document.getElementById('loading-overlay')?.classList.add('show'); }
    hideLoading() { document.getElementById('loading-overlay')?.classList.remove('show'); }
    selectAllCommands() { document.querySelectorAll('.cmd-chk').forEach(c => c.checked = true); }
    deselectAllCommands() { document.querySelectorAll('.cmd-chk').forEach(c => c.checked = false); }

    openWebAccess() {
        const host = this.currentSelectedHost;
        if (!host) return;
        const ip = (host.interfaces && host.interfaces[0]) ? host.interfaces[0].ip : host.host;
        window.open(`https://${ip}`, '_blank');
    }

    async runSelectedCommands() {
        const cmds = [];
        document.querySelectorAll('.cmd-chk:checked').forEach(c => cmds.push(c.dataset.cmd));
        if (cmds.length === 0) return alert("Selecione comandos!");

        const host = this.currentSelectedHost;

        // Get loop settings
        const loopExecution = document.getElementById('loop-execution')?.checked || false;
        const loopInterval = parseInt(document.getElementById('loop-interval')?.value || 5000);

        try {
            if (!window.sshCommandManager) {
                throw new Error("SSH Command Manager not initialized");
            }

            // Use SSHCommandManager
            const results = await window.sshCommandManager.executeCommands(host, cmds);
            window.sshCommandManager.showExecutionResults(results, {
                autoRefresh: loopExecution,
                interval: loopInterval
            });
        } catch (e) {
            console.error(e);
            alert("Erro SSH: " + (e.message || e));
        }
    }

    clearSearch() {
        document.getElementById('store-search').value = '';
        document.getElementById('circuit-search').value = '';
        this.performSearch();
    }

    connectPuTTY() { alert("Abrindo PuTTY..."); }

    determineDeviceType(host) {
        const os = (host.inventory?.os || '').toLowerCase();
        const name = host.name.toLowerCase();
        if (os.includes('fort') || name.includes('fw')) return 'fortinet_firewall';
        if (os.includes('cisco') && name.includes('sw')) return 'cisco_switch';
        if (name.includes('ap')) return 'access_point';
        if (os.includes('cisco') || name.includes('rt')) return 'cisco_router';
        return 'default';
    }


    async downloadRunningConfig() {
    // 1. Validações iniciais
    if (!this.currentSelectedHost) {
        showNotification('Selecione um dispositivo primeiro', 'warning');
        return;
    }

    if (!confirm(`Deseja baixar a configuração atual de ${this.currentSelectedHost.name}?`)) {
        return;
    }

    this.showLoading('Extraindo configuração via SSH...');

    try {
        // 2. Definir o comando correto baseado no tipo de dispositivo
        let command = '';
        const type = this.deviceType; // Já determinado no onHostSelect

        if (type === 'fortinet_firewall') {
            command = 'show'; // Ou apenas 'show' dependendo da permissão
        } else if (type.includes('cisco')) {
            command = 'show running-config';
        } else if (type === 'huawei_switch') {
            command = 'display current-configuration';
        } else {
            // Fallback padrão
            command = 'show running-config';
        }

        // 3. Executar o comando usando o SSH Manager (reutilizando a lógica existente)
        // Precisamos garantir que o sshCommandManager esteja disponível
        if (!window.sshCommandManager) {
            throw new Error('SSH Manager não inicializado');
        }

        // Executa o comando (retorna um objeto com resultados)
        const result = await window.sshCommandManager.executeCommands(
            this.currentSelectedHost, 
            [command]
        );

        // 4. Processar o resultado
        // O result.commands é um array, pegamos o primeiro (e único) comando
        const cmdResult = result.commands[0];

        if (cmdResult.exitCode !== 0) {
            throw new Error('Falha na execução do comando SSH');
        }

        const configContent = cmdResult.output;
        
        if (!configContent || configContent.length < 50) {
            throw new Error('O dispositivo retornou uma configuração vazia ou inválida.');
        }

        // 5. Gerar o arquivo .txt
        // Usa o nome do host + data para o arquivo
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const filename = `${this.currentSelectedHost.name}_config_${timestamp}.txt`;

        // Usa a função utilitária já existente no seu projeto (js/utils.js)
        downloadFile(configContent, filename, 'text/plain');

        showNotification('Configuração salva com sucesso!', 'success');

    } catch (error) {
        console.error('Erro ao salvar config:', error);
        showNotification(`Erro ao salvar configuração: ${error.message || error}`, 'error');
    } finally {
        this.hideLoading();
    }
}
}

document.addEventListener('DOMContentLoaded', () => { window.dashboard = new NetworkDashboard(); });