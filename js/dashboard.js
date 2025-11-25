class NetworkDashboard {
    constructor() {
        this.zabbixClient = null;
        this.currentStore = null;
        this.currentHosts = [];
        this.currentSelectedHost = null;
        this.deviceType = 'default';
        this.storesData = [];
        this.initializeEventListeners();
        this.initializeDashboard();
    }

    initializeEventListeners() {
        const storeSearch = document.getElementById('store-search');
        const circuitSearch = document.getElementById('circuit-search');
        if (storeSearch) storeSearch.addEventListener('input', debounce(() => this.performSearch(), 300));
        if (circuitSearch) circuitSearch.addEventListener('input', debounce(() => this.performSearch(), 300));
        document.getElementById('clear-search')?.addEventListener('click', () => this.clearSearch());
        document.getElementById('store-select')?.addEventListener('change', (e) => this.onStoreSelect(e.target.value));

        document.getElementById('run-commands')?.addEventListener('click', () => this.runSelectedCommands());
        document.getElementById('select-all')?.addEventListener('click', () => this.selectAllCommands());
        document.getElementById('deselect-all')?.addEventListener('click', () => this.deselectAllCommands());
        document.getElementById('connect-putty')?.addEventListener('click', () => this.connectPuTTY());
        document.getElementById('web-access')?.addEventListener('click', () => this.openWebAccess());
    }

    initializeDashboard() {
        this.showLoading('Iniciando...');
        if (configManager.getSummary().zabbixConfigured) {
            this.initializeZabbixClient();
        } else {
            this.showNotification('Configure o Zabbix para começar.', 'warning');
            this.loadStoresData();
            this.hideLoading();
        }
    }

    async initializeZabbixClient() {
        try {
            const config = configManager.config;
            this.zabbixClient = new ZabbixClient(config.zabbix.url, config.zabbix.user, config.zabbix.password);
            await this.zabbixClient.authenticate();
            await this.loadStoresData();
        } catch (err) {
            console.error('Init failed:', err);
            this.hideLoading();
        }
    }

    async loadStoresData() {
        try {
            const response = await fetch('/api/stores/search?limit=1000');
            const data = await response.json();
            this.storesData = data.stores || [];
            this.populateStoreSelect(this.storesData);
            this.hideLoading();
        } catch (err) {
            console.error('Erro carregando lojas:', err);
            this.hideLoading();
        }
    }

    populateStoreSelect(stores) {
        const select = document.getElementById('store-select');
        if (!select) return;
        select.innerHTML = '<option value="">-- Selecione uma loja --</option>';
        stores.sort((a, b) => a.id.localeCompare(b.id));
        stores.forEach(s => {
            const opt = document.createElement('option');
            opt.value = s.id;
            opt.textContent = `${s.id} - ${s.nome || 'Loja ' + s.id}`;
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

    clearSearch() {
        document.getElementById('store-search').value = '';
        document.getElementById('circuit-search').value = '';
        this.performSearch();
    }

    async onStoreSelect(storeId) {
        if (!storeId) return;
        this.showLoading('Buscando hosts...');
        this.updateLinkInfo(storeId);

        let hosts = [];
        if (this.zabbixClient && this.zabbixClient.isAuthenticated) {
            try {
                const groups = await this.zabbixClient.getHostGroups();
                const group = groups.find(g => g.name.toLowerCase().includes(storeId.toLowerCase()));
                if (group) {
                    hosts = await this.zabbixClient.getHostsByGroupId(group.groupid);
                }
            } catch (e) { console.warn('Erro Zabbix:', e); }
        }

        if (hosts.length === 0) {
            console.log('Usando host simulado para:', storeId);
            hosts = [{
                hostid: `sim-${storeId}`,
                host: `FortiGate-${storeId}`,
                name: `Firewall ${storeId} (Simulado)`,
                status: '0',
                inventory: { os: 'FortiOS', hardware: 'FortiGate' }
            }];
        }

        this.populateHostsList(hosts);
        if (hosts.length > 0) this.onHostSelect(hosts[0]);
        this.hideLoading();
    }

    populateHostsList(hosts) {
        const list = document.getElementById('hosts-list');
        if (!list) return;
        list.innerHTML = '';
        hosts.forEach(h => {
            const div = document.createElement('div');
            div.className = 'host-item';
            div.textContent = h.name;
            div.onclick = () => this.onHostSelect(h);
            list.appendChild(div);
        });
    }

    async onHostSelect(host) {
        this.currentSelectedHost = host;
        this.deviceType = this.determineDeviceType(host);
        this.loadCommandsForDevice();

        this.showLoading('Atualizando dados...');
        try {
            const searchNames = [
                'CPU utilization', 'ICMP response time', 'ICMP packet loss', 'Device uptime', 'Uptime',
                'wan1', 'wan2', 'bits sent', 'bits received', 'operational status', 'duplex', 'speed',
                'memory', 'available'
            ];

            const itemsData = await this.zabbixClient.getItemsByNamePattern(host.hostid, searchNames.join(','));
            const problems = await this.zabbixClient.getHostProblems(host.hostid);
            const dashboardData = ZabbixDataProcessor.processDashboardData(itemsData, problems, this.deviceType);

            this.updateDashboardUI(dashboardData);
        } catch (e) {
            console.error('Erro no update:', e);
        } finally {
            this.hideLoading();
        }
    }

    updateDashboardUI(data) {
        // 1. Atualiza Sidebar (IDs: sidebar-*)
        this.updateElement('sidebar-uptime', data.uptime);
        this.updateElement('sidebar-cpu', data.cpu);
        this.updateElement('sidebar-latency', data.latency);
        this.updateElement('sidebar-loss', data.loss);

        // 2. Atualiza Cards Principais (IDs: card-*)
        this.updateElement('card-uptime', data.uptime);
        this.updateElement('card-latency', data.latency);

        // Status indicador
        const statusEl = document.getElementById('card-status-text');
        const indEl = document.getElementById('card-status-indicator');
        if (statusEl && indEl) {
            const isUp = data.uptime !== '--';
            statusEl.textContent = isUp ? 'UP' : 'DOWN';
            indEl.className = `status-indicator ${isUp ? 'up' : 'down'}`;
        }

        // Loss com cor
        const lossEl = document.getElementById('card-loss');
        if (lossEl) {
            lossEl.textContent = data.loss;
            const val = parseFloat(data.loss);
            lossEl.className = `metric-value ${val > 0 ? 'text-error' : 'text-success'}`;
        }

        // 3. Seções Dinâmicas e WAN
        if (this.deviceType === 'fortinet_firewall') {
            this.updateFirewallUI(data.dynamic);
        }

        // 4. Gauges
        if (data.cpu && data.cpu !== '--') {
            this.updateGauge('cpu-gauge', parseFloat(data.cpu));
        }
        this.updateGauge('memory-gauge', 55);
    }

    updateFirewallUI(data) {
        // Sidebar Dinâmica
        this.updateSidebarDynamic(1, 'WAN1 Status:', data.wan1Status);
        this.updateSidebarDynamic(2, 'WAN2 Status:', data.wan2Status);

        // Cards WAN1
        this.updateElement('card-wan1-status', data.wan1Status);
        this.updateElement('card-wan1-speed', data.wan1Speed);
        this.updateElement('card-wan1-duplex', data.wan1Duplex);
        this.updateElement('card-wan1-upload', data.wan1Upload);
        this.updateElement('card-wan1-download', data.wan1Download);

        const ind1 = document.getElementById('card-wan1-indicator');
        if (ind1) ind1.className = `status-indicator ${data.wan1Status === 'UP' ? 'up' : 'down'}`;

        // Cards WAN2
        this.updateElement('card-wan2-status', data.wan2Status);
        this.updateElement('card-wan2-speed', data.wan2Speed);
        this.updateElement('card-wan2-duplex', data.wan2Duplex);
        this.updateElement('card-wan2-upload', data.wan2Upload);
        this.updateElement('card-wan2-download', data.wan2Download);

        const ind2 = document.getElementById('card-wan2-indicator');
        if (ind2) ind2.className = `status-indicator ${data.wan2Status === 'UP' ? 'up' : 'down'}`;
    }

    updateSidebarDynamic(index, label, value) {
        const el = document.getElementById(`sidebar-dynamic-${index}`);
        if (el) {
            el.style.display = 'flex';
            el.querySelector('label').textContent = label;
            const span = el.querySelector('span');
            span.textContent = value || '--';
            span.className = value === 'UP' ? 'text-success' : (value === 'DOWN' ? 'text-error' : '');
        }
    }

    updateElement(id, val) {
        const el = document.getElementById(id);
        if (el) el.textContent = val || '--';
    }

    updateGauge(id, val) {
        if (window.dashboardCharts && window.dashboardCharts.chartManager) {
            window.dashboardCharts.chartManager.updateGaugeChart(id, val);
            const textEl = document.getElementById(`${id}-value`);
            if (textEl) textEl.textContent = `${val.toFixed(1)}%`;
        }
    }

    updateLinkInfo(storeId) {
        const data = this.storesData.find(s => s.id === storeId);
        if (!data) return;
        ['wan1-op', 'wan1-circ', 'wan1-banda', 'wan2-op', 'wan2-circ', 'wan2-banda'].forEach(key => {
            const apiMap = {
                'wan1-op': 'operador_wan1', 'wan1-circ': 'circuito_wan1', 'wan1-banda': 'banda_wan1',
                'wan2-op': 'operador_wan2', 'wan2-circ': 'circuito_wan2', 'wan2-banda': 'banda_wan2'
            };
            this.updateElement(key, data[apiMap[key]] || 'N/A');
        });
    }

    determineDeviceType(host) {
        const os = (host.inventory?.os || '').toLowerCase();
        const name = host.name.toLowerCase();
        if (os.includes('fort') || name.includes('fw')) return 'fortinet_firewall';
        if (os.includes('cisco') || name.includes('rt')) return 'cisco_router';
        return 'default';
    }

    loadCommandsForDevice() {
        const list = document.getElementById('commands-list');
        if (!list) return;
        list.innerHTML = '';
        const cmds = (window.ZABBIX_COMMAND_PROFILES && window.ZABBIX_COMMAND_PROFILES[this.deviceType]) || [];
        cmds.forEach(c => {
            const div = document.createElement('div');
            div.className = 'command-item';
            div.innerHTML = `<input type="checkbox" class="command-checkbox"><label>${c.name}</label>`;
            list.appendChild(div);
        });
    }

    showLoading(msg) {
        const el = document.getElementById('loading-overlay');
        if (el) { el.classList.add('show'); el.querySelector('.loading-text').textContent = msg; }
    }
    hideLoading() { document.getElementById('loading-overlay')?.classList.remove('show'); }
    showNotification(msg, type) {
        if (window.showNotification) window.showNotification(msg, type);
        else console.log(msg);
    }

    selectAllCommands() { document.querySelectorAll('.command-checkbox').forEach(c => c.checked = true); }
    deselectAllCommands() { document.querySelectorAll('.command-checkbox').forEach(c => c.checked = false); }

    async runSelectedCommands() {
        const selectedCommands = [];
        const checks = document.querySelectorAll('.command-checkbox:checked');
        checks.forEach(chk => {
            const label = chk.nextElementSibling.textContent;
            const profile = window.ZABBIX_COMMAND_PROFILES[this.deviceType];
            const cmdObj = profile.find(c => c.name === label);
            if (cmdObj) selectedCommands.push(cmdObj.command);
        });

        if (selectedCommands.length === 0) {
            this.showNotification('Selecione comandos.', 'warning');
            return;
        }

        const host = this.currentSelectedHost;
        if (!host) return;

        this.showNotification(`Enviando para ${host.host}...`, 'info');

        const config = configManager.config;
        const targetHost = (host.interfaces && host.interfaces[0]) ? host.interfaces[0].ip : host.host;

        try {
            const response = await fetch('/api/ssh-execute', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    host: targetHost,
                    username: config.ssh.user,
                    password: config.ssh.password,
                    commands: selectedCommands
                })
            });
            const result = await response.json();
            const win = window.open('', '_blank', 'width=800,height=600');
            win.document.write(`<html><body style="background:#111;color:#0f0;font-family:monospace;white-space:pre-wrap;">${result.output || result.error}</body></html>`);
        } catch (err) {
            this.showNotification('Erro SSH: ' + err.message, 'error');
        }
    }

    connectPuTTY() { this.showNotification('Abrindo PuTTY...', 'info'); }
    openWebAccess() { window.open(`https://${this.currentSelectedHost?.host || ''}`, '_blank'); }
}

document.addEventListener('DOMContentLoaded', () => { window.dashboard = new NetworkDashboard(); });