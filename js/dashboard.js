class NetworkDashboard {
    constructor() {
        this.zabbixClient = null;
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

        // Atualiza dados da planilha (Banda)
        this.updateLinkInfo(storeId);

        let hosts = [];
        if (this.zabbixClient && this.zabbixClient.isAuthenticated) {
            try {
                const groups = await this.zabbixClient.getHostGroups();
                const group = groups.find(g => g.name.toLowerCase().includes(storeId.toLowerCase()));
                if (group) hosts = await this.zabbixClient.getHostsByGroupId(group.groupid);
            } catch (e) { console.warn(e); }
        }

        if (hosts.length === 0) {
            // Fallback simulado para testar UI
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
        this.deviceType = this.determineDeviceType(host);

        // Atualiza Header
        document.getElementById('device-name').textContent = host.name;
        const ip = (host.interfaces && host.interfaces[0]) ? host.interfaces[0].ip : host.host;
        document.getElementById('device-ip').textContent = ip;
        document.getElementById('device-type-badge').textContent = this.deviceType.replace('_', ' ').toUpperCase();

        // Layout Dinâmico
        this.updateLayoutByDeviceType(this.deviceType);
        this.loadCommandsForDevice();

        this.showLoading('Atualizando...');
        try {
            // Busca itens (nome mais genérico possível)
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
        // KPIs
        this.updateElement('card-uptime', data.uptime);
        this.updateElement('sidebar-uptime', data.uptime);
        this.updateElement('card-latency', data.latency);
        this.updateElement('sidebar-latency', data.latency);
        this.updateElement('card-loss', data.loss);
        this.updateElement('sidebar-loss', data.loss);

        // Status
        const isUp = data.uptime !== '--' && data.uptime !== 'N/A';
        const dot = document.getElementById('card-status-indicator');
        if (dot) dot.className = `status-dot ${isUp ? 'up' : 'down'}`;

        // Gauges
        if (data.cpu !== '--') window.dashboardCharts.chartManager.updateGaugeChart('cpu-gauge', parseFloat(data.cpu));
        if (data.memory !== '--') window.dashboardCharts.chartManager.updateGaugeChart('memory-gauge', parseFloat(data.memory));
        document.getElementById('cpu-gauge-value').textContent = data.cpu !== '--' ? data.cpu + '%' : '--';
        document.getElementById('memory-gauge-value').textContent = data.memory !== '--' ? data.memory + '%' : '--';

        // Switch / AP
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

        // Firewall
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
        // Mapeamento dos dados do Excel (servidor_final.py retorna em lowercase keys)
        this.updateElement('wan1-banda', data.banda_wan1);
        this.updateElement('wan1-op', data.operador_wan1);
        this.updateElement('wan1-circ', data.circuito_wan1);
        this.updateElement('wan2-banda', data.banda_wan2);
        this.updateElement('wan2-op', data.operador_wan2);
        this.updateElement('wan2-circ', data.circuito_wan2);
    }

    // Função que encontra gráficos de tráfego
    async updateCharts(hostId, itemsData) {
        if (!window.dashboardCharts || !this.zabbixClient) return;
        // Lógica simplificada de busca de IDs para o gráfico
        const findId = (t) => {
            for (const [name, item] of Object.entries(itemsData)) {
                if (t.every(k => name.toLowerCase().includes(k))) return item.itemid;
            }
            return null;
        };
        // Tenta achar IDs de tráfego
        const w1In = findId(['wan1', 'in']) || findId(['wan1', 'received']);
        const w1Out = findId(['wan1', 'out']) || findId(['wan1', 'sent']);
        const w2In = findId(['wan2', 'in']) || findId(['wan2', 'received']);
        const w2Out = findId(['wan2', 'out']) || findId(['wan2', 'sent']);

        if (w1In && w1Out) {
            const histIn = await this.zabbixClient.getItemHistory(w1In, 1);
            const histOut = await this.zabbixClient.getItemHistory(w1Out, 1);
            // Formata: divide por 1000000 para Mbps
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
        list.innerHTML = '';
        const profiles = window.ZABBIX_COMMAND_PROFILES || {};
        const cmds = profiles[this.deviceType] || profiles['default'] || [];

        if (cmds.length === 0) {
            list.innerHTML = '<div style="color:#666; padding:10px">Sem comandos disponíveis</div>';
            return;
        }

        cmds.forEach((c, i) => {
            const div = document.createElement('div');
            div.className = 'command-item';
            div.innerHTML = `<input type="checkbox" id="cmd-${i}" class="cmd-chk" data-cmd="${c.command}"> <label for="cmd-${i}">${c.name}</label>`;
            list.appendChild(div);
        });
    }

    // Helpers
    updateElement(id, val) { const el = document.getElementById(id); if (el) el.textContent = val || '--'; }
    showLoading(msg) { document.getElementById('loading-overlay')?.classList.add('show'); }
    hideLoading() { document.getElementById('loading-overlay')?.classList.remove('show'); }
    selectAllCommands() { document.querySelectorAll('.cmd-chk').forEach(c => c.checked = true); }
    deselectAllCommands() { document.querySelectorAll('.cmd-chk').forEach(c => c.checked = false); }

    // CORREÇÃO: Abrir HTTPS com IP
    openWebAccess() {
        const host = this.currentSelectedHost;
        if (!host) return;
        const ip = (host.interfaces && host.interfaces[0]) ? host.interfaces[0].ip : host.host;
        window.open(`https://${ip}`, '_blank');
    }

    // Correção: Executar Comandos
    async runSelectedCommands() {
        const cmds = [];
        document.querySelectorAll('.cmd-chk:checked').forEach(c => cmds.push(c.dataset.cmd));
        if (cmds.length === 0) return alert("Selecione comandos!");

        const host = this.currentSelectedHost;
        const ip = (host.interfaces && host.interfaces[0]) ? host.interfaces[0].ip : host.host;
        const config = configManager.config;

        try {
            const res = await fetch('/api/ssh-execute', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    host: ip,
                    username: config.ssh.user,
                    password: config.ssh.password,
                    commands: cmds
                })
            });
            const result = await res.json();
            const win = window.open('', '_blank', 'width=800,height=600');
            win.document.write(`<body style="background:#111;color:#0f0;font-family:monospace;white-space:pre-wrap">${result.output}</body>`);
        } catch (e) { alert("Erro SSH: " + e); }
    }

    determineDeviceType(host) {
        const os = (host.inventory?.os || '').toLowerCase();
        const name = host.name.toLowerCase();
        if (os.includes('fort') || name.includes('fw')) return 'fortinet_firewall';
        if (os.includes('cisco') && name.includes('sw')) return 'cisco_switch';
        if (name.includes('ap')) return 'access_point';
        if (os.includes('cisco') || name.includes('rt')) return 'cisco_router';
        return 'default';
    }
}

document.addEventListener('DOMContentLoaded', () => { window.dashboard = new NetworkDashboard(); });