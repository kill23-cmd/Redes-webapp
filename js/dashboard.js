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

        document.getElementById('store-search').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault(); // Evita submit de form se houver
                this.selectAndLoadFirstResult();
            }
        });

        document.getElementById('run-commands').addEventListener('click', () => this.runSelectedCommands());
        document.getElementById('select-all').addEventListener('click', () => this.selectAllCommands());
        document.getElementById('deselect-all').addEventListener('click', () => this.deselectAllCommands());
        document.getElementById('connect-putty').addEventListener('click', () => this.connectPuTTY());
        document.getElementById('web-access').addEventListener('click', () => this.openWebAccess());

        document.getElementById('btn-links-down').addEventListener('click', () => {
            if (this.linksDashboard) {
                this.linksDashboard.show();
            } else {
                alert('Dashboard de links não inicializado. Verifique a conexão com o Zabbix.');
            }
        });

        document.getElementById('btn-open-map').addEventListener('click', () => {
            if (this.currentMapUrl) {
                const modal = document.getElementById('map-modal');
                const iframe = document.getElementById('map-frame');
                iframe.src = this.currentMapUrl;
                modal.classList.add('show');
                modal.style.display = 'flex';
            } else {
                alert("Mapa não disponível para esta loja.");
            }
        });

        document.getElementById('close-map-modal').addEventListener('click', () => {
            const modal = document.getElementById('map-modal');
            const iframe = document.getElementById('map-frame');
            modal.classList.remove('show');
            modal.style.display = 'none';
            iframe.src = '';
        });
    }

    async initializeDashboard() {
        if (window.configManager && window.configManager.ready) await window.configManager.ready;

        if (configManager.getSummary().zabbixConfigured) {
            this.initializeZabbixClient();
        } else {
            this.loadStoresData();
        }
        lucide.createIcons();
    }

    selectAndLoadFirstResult() {
        const select = document.getElementById('store-select');
        const searchInput = document.getElementById('store-search');
        const term = searchInput.value.trim();

        if (!term) return;

        // 1. Regex Específica para as Lojas (GG, GB, PZ, BT, MR, PR + Números)
        const storeIdMatch = term.match(/((?:GG|GB|PZ|BT|MR|PR|SP)\d{3,4})/i);

        let targetStoreId = null;

        // Cenário A: Encontrou um ID de loja dentro do texto
        if (storeIdMatch) {
            targetStoreId = storeIdMatch[1].toUpperCase();
        }
        // Cenário B: O texto digitado JÁ É o ID da loja
        else if (term.length <= 6) {
            targetStoreId = term.toUpperCase();
        }

        // Se identificamos uma loja possível, verificamos se ela existe na base
        if (targetStoreId) {
            const storeExists = this.storesData.find(s => s.id === targetStoreId);

            if (storeExists) {
                this.performSearch();

                setTimeout(() => {
                    select.value = targetStoreId;
                    this.onStoreSelect(targetStoreId, term);
                }, 50);

                return;
            }
        }

        // Cenário C: Fallback
        if (select.options.length > 1) {
            const firstOption = select.options[1];
            select.value = firstOption.value;
            this.onStoreSelect(firstOption.value, term);
            searchInput.blur();
        }
    }

    async initializeZabbixClient() {
        const config = configManager.config;
        this.zabbixClient = new ZabbixClient(config.zabbix.url, config.zabbix.user, config.zabbix.password);
        await this.zabbixClient.authenticate();
        this.linksDashboard = new LinksDashboard(this.zabbixClient);
        window.linksDashboard = this.linksDashboard;
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

        const filteredStores = this.storesData.filter(s => {
            const text = `${s.id} - ${s.nome}`.toLowerCase();
            const matchStore = !qStore || text.includes(qStore);
            let matchCirc = true;
            if (qCirc) {
                const w1 = (s.circuito_wan1 || '').toLowerCase();
                const w2 = (s.circuito_wan2 || '').toLowerCase();
                matchCirc = w1.includes(qCirc) || w2.includes(qCirc);
            }
            return matchStore && matchCirc;
        });

        const selectEl = document.getElementById('store-select');
        const currentVal = selectEl.value;

        this.populateStoreSelect(filteredStores);

        if (currentVal && filteredStores.find(s => s.id === currentVal)) {
            selectEl.value = currentVal;
        }
    }

    async onStoreSelect(storeId, targetHostName = null) {
        console.log('onStoreSelect called for:', storeId);
        if (!storeId) return;
        this.updateLinkInfo(storeId);

        const btnBackup = document.getElementById('btn-backup-config');
        if (btnBackup) btnBackup.style.display = 'none';

        // Reset Map Button
        const btnMap = document.getElementById('btn-open-map');
        if (btnMap) btnMap.style.display = 'none';
        this.currentMapUrl = null;

        let hosts = [];
        if (this.zabbixClient && this.zabbixClient.isAuthenticated) {
            try {
                // 1. Fetch Hosts
                const groups = await this.zabbixClient.getHostGroups();
                let group = groups.find(g => g.name.trim() === storeId.trim());
                if (!group) {
                    const candidates = groups.filter(g => g.name.toLowerCase().includes(storeId.toLowerCase()));
                    candidates.sort((a, b) => a.name.length - b.name.length);
                    group = candidates[0];
                }
                if (group) hosts = await this.zabbixClient.getHostsByGroupId(group.groupid);

                // 2. Fetch Map
                console.log('Fetching map for:', storeId);
                const mapId = await this.zabbixClient.getMapId(storeId);
                if (mapId) {
                    const frontendUrl = this.zabbixClient.baseUrl.replace('/api_jsonrpc.php', '');
                    this.currentMapUrl = `${frontendUrl}/zabbix.php?action=map.view&sysmapid=${mapId}`;
                    if (btnMap) btnMap.style.display = 'inline-flex';
                }
            } catch (e) { console.warn(e); }
        }
        // ------------------------------------

        if (hosts.length === 0) {
            hosts = [{ hostid: 'sim', name: `Simulado-${storeId}`, host: '192.168.1.1', inventory: { os: 'FortiOS' } }];
        }

        this.populateHostsList(hosts);

        // --- CORREÇÃO DA SELEÇÃO DO HOST ---
        if (hosts.length > 0) {
            let hostToSelect = hosts[0];

            if (targetHostName) {
                // Remove espaços e deixa minúsculo para comparar
                const cleanTarget = targetHostName.trim().toLowerCase();

                // Procura um host que CONTENHA o texto digitado
                const found = hosts.find(h => h.name.toLowerCase().includes(cleanTarget));

                if (found) hostToSelect = found;
            }

            this.onHostSelect(hostToSelect);

            // Scroll visual até o item
            setTimeout(() => {
                const listItems = document.querySelectorAll('.host-item');
                listItems.forEach(item => {
                    if (item.textContent.trim().includes(hostToSelect.name)) {
                        item.classList.add('selected');
                        item.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    } else {
                        item.classList.remove('selected');
                    }
                });
            }, 200); // Aumentei o tempo para garantir que a lista renderizou
        }
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
            if (this.deviceType === 'access_point') {
                btnBackup.style.display = 'none';
            } else {
                btnBackup.style.display = 'inline-flex';
            }
        }

        const btnChat = document.getElementById('btn-direct-chat');
        if (btnChat) {
            btnChat.style.display = 'inline-flex';
            btnChat.onclick = () => this.openDirectChat();
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

    async updateCharts(hostId, itemsData) {
        if (!window.dashboardCharts || !this.zabbixClient) return;

        const findId = (terms) => {
            for (const [name, item] of Object.entries(itemsData)) {
                const n = name.toLowerCase();
                if (terms.every(k => n.includes(k))) return item.itemid;
            }
            return null;
        };

        const w1In = findId(['wan1', 'bits received']);
        const w1Out = findId(['wan1', 'bits sent']);
        const w2In = findId(['wan2', 'bits received']);
        const w2Out = findId(['wan2', 'bits sent']);

        if (w1In && w1Out) {
            const histIn = await this.zabbixClient.getItemHistory(w1In, 1);
            const histOut = await this.zabbixClient.getItemHistory(w1Out, 1);
            const fmt = (h) => h.map(p => ({ x: new Date(p.clock * 1000), y: (parseFloat(p.value) / 1000000) }));
            window.dashboardCharts.chartManager.updateTrafficChart('wan1-traffic-chart', fmt(histOut), fmt(histIn));
        }

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

        const profiles = window.ZABBIX_COMMAND_PROFILES || {};
        let cmds = profiles[this.deviceType];

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
    showLoading(msg) { const el = document.getElementById('loading-overlay'); if (el) el.classList.add('show'); }
    hideLoading() { const el = document.getElementById('loading-overlay'); if (el) el.classList.remove('show'); }
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
        const loopExecution = (document.getElementById('loop-execution') ? document.getElementById('loop-execution').checked : false) || false;
        const loopInterval = parseInt((document.getElementById('loop-interval') ? document.getElementById('loop-interval').value : 5000) || 5000);

        try {
            if (!window.sshCommandManager) {
                throw new Error("SSH Command Manager not initialized");
            }

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
        const os = (host.inventory && host.inventory.os ? host.inventory.os : '').toLowerCase();
        const name = host.name.toLowerCase();
        const tags = host.tags || [];
        const isHuawei = tags.some(t => t.tag.toUpperCase() === 'HUAWEI');

        if (os.includes('fort') && (name.includes('sw') || os.includes('switch'))) {
            return 'fortiswitch';
        }

        if (isHuawei) {
            return 'huawei_switch';
        }

        if (os.includes('fort') || name.includes('fw')) return 'fortinet_firewall';
        if (os.includes('cisco') && name.includes('sw')) return 'cisco_switch';
        if (name.includes('ap')) return 'access_point';
        if (os.includes('cisco') || name.includes('rt')) return 'cisco_router';

        return 'default';
    }

    async downloadRunningConfig() {
        if (!this.currentSelectedHost) {
            showNotification('Selecione um dispositivo primeiro', 'warning');
            return;
        }

        if (!confirm(`Deseja baixar a configuração atual de ${this.currentSelectedHost.name}?`)) {
            return;
        }

        this.showLoading('Extraindo configuração via SSH...');

        try {
            let command = '';
            const type = this.deviceType;

            if (type === 'fortinet_firewall') {
                command = 'show';
            } else if (type.includes('cisco')) {
                command = 'show running-config';
            } else if (type === 'huawei_switch') {
                command = 'display current-configuration';
            } else {
                command = 'show running-config';
            }

            if (!window.sshCommandManager) {
                throw new Error('SSH Manager não inicializado');
            }

            const result = await window.sshCommandManager.executeCommands(
                this.currentSelectedHost,
                [command]
            );

            const cmdResult = result.commands[0];

            if (cmdResult.exitCode !== 0) {
                throw new Error('Falha na execução do comando SSH');
            }

            const configContent = cmdResult.output;

            if (!configContent || configContent.length < 50) {
                throw new Error('O dispositivo retornou uma configuração vazia ou inválida.');
            }

            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
            const filename = `${this.currentSelectedHost.name}_config_${timestamp}.txt`;

            downloadFile(configContent, filename, 'text/plain');

            showNotification('Configuração salva com sucesso!', 'success');

        } catch (error) {
            console.error('Erro ao salvar config:', error);
            showNotification(`Erro ao salvar configuração: ${error.message || error}`, 'error');
        } finally {
            this.hideLoading();
        }
    }

    openDirectChat() {
        if (!this.currentSelectedHost) return;

        const host = this.currentSelectedHost;
        const ip = (host.interfaces && host.interfaces[0]) ? host.interfaces[0].ip : host.host;

        const win = window.open('', `chat-${host.name}`, 'width=900,height=700');

        if (win) {
            if (win.document.getElementById('chat-messages')) {
                win.focus();
                return;
            }

            if (window.sshCommandManager) {
                window.sshCommandManager.openDirectChatWindow(host, ip);
            }
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
}

document.addEventListener('DOMContentLoaded', () => { window.dashboard = new NetworkDashboard(); });
