// ============================================
// ZABBIX CLIENT - API communication and data management
// ============================================

class ZabbixClient {
    constructor(baseUrl, username, password) {
        this.baseUrl = baseUrl.replace(/\/$/, '');
        this.username = username;
        this.password = password;
        this.authToken = null;
        this.isAuthenticated = false;
        this.isSimulated = false;
        this.proxyUrl = '/api/zabbix-proxy';
    }

    async authenticate() {
        try {
            const response = await api.post(this.proxyUrl, {
                jsonrpc: '2.0', method: 'user.login',
                params: { username: this.username, password: this.password }, id: 1
            });
            if (response.result) {
                this.authToken = response.result;
                this.isAuthenticated = true;
                this.isSimulated = false;
                return true;
            }
            this.isSimulated = true; return false;
        } catch (err) {
            this.isSimulated = true; return false;
        }
    }

    async request(method, params = {}) {
        if (!this.isAuthenticated && method !== 'user.login') {
            if (this.isSimulated) return this.getMockData(method, params);
            throw new Error('Not authenticated');
        }
        try {
            const payload = {
                jsonrpc: '2.0', method,
                params: { ...params, output: params.output || 'extend' },
                auth: this.authToken, id: 1
            };
            if (method.toLowerCase() === 'apiinfo.version') { delete payload.auth; payload.params = []; }

            const response = await api.post(this.proxyUrl, payload);
            if (response.error) throw new Error(response.error.message);
            return response.result;
        } catch (err) {
            if (this.isSimulated) return this.getMockData(method, params);
            throw err;
        }
    }

    async getHostGroups() { return this.request('hostgroup.get', { output: ['groupid', 'name'] }); }
    async getHostsByGroupId(gid) { return this.request('host.get', { groupids: gid, output: ['hostid', 'host', 'name'], selectInterfaces: 'extend', selectInventory: 'extend' }); }

    async getItemsByNamePattern(hostId, namePattern) {
        const items = await this.request('item.get', {
            hostids: hostId,
            output: ['itemid', 'name', 'key_', 'lastvalue', 'units']
        });
        const map = {};
        if (Array.isArray(items)) {
            items.forEach(i => map[i.name] = { value: i.lastvalue, units: i.units, key: i.key_ });
        }
        return map;
    }

    async getHostProblems(hostId) { return this.request('problem.get', { hostids: hostId, output: 'extend' }); }

    async getMockData(method, params) {
        await new Promise(r => setTimeout(r, 100));
        if (method === 'hostgroup.get') return [{ groupid: '1', name: 'Lojas/Brasil' }];
        if (method === 'host.get') return [{ hostid: '100', name: 'Firewall Simulado', inventory: { os: 'FortiOS' } }];
        if (method === 'item.get') {
            return [
                { name: 'CPU utilization', lastvalue: '25', units: '%' },
                { name: 'ICMP response time', lastvalue: '0.045', units: 's' },
                { name: 'ICMP packet loss', lastvalue: '0', units: '%' },
                { name: 'Uptime', lastvalue: '123456', units: 's' },
                { name: 'Device uptime', lastvalue: '123456', units: 's' },
                { name: 'wan1 Operational status', lastvalue: '1', units: '' },
                { name: 'wan1 Speed', lastvalue: '100000000', units: 'bps' },
                { name: 'wan1 Bits sent', lastvalue: '500000', units: 'bps' },
                { name: 'wan1 Bits received', lastvalue: '800000', units: 'bps' },
                { name: 'wan1 Duplex status', lastvalue: '3', units: '' },
                { name: 'wan2 Operational status', lastvalue: '1', units: '' },
                { name: 'wan2 Speed', lastvalue: '50000000', units: 'bps' },
                { name: 'wan2 Bits sent', lastvalue: '100000', units: 'bps' },
                { name: 'wan2 Bits received', lastvalue: '200000', units: 'bps' },
                { name: 'wan2 Duplex status', lastvalue: '3', units: '' }
            ];
        }
        return [];
    }

    async testConnection() {
        try {
            const version = await this.request('apiinfo.version');
            return { success: true, version, message: `Conectado ao Zabbix ${version}` };
        } catch (err) {
            return { success: false, error: err.message, message: 'Falha na conexão com Zabbix' };
        }
    }
}

class ZabbixDataProcessor {
    static processDashboardData(itemsData, problems, deviceType) {
        const dash = { uptime: '--', cpu: '--', latency: '--', loss: '--', dynamic: {} };

        const find = (parts) => {
            if (!itemsData) return null;
            let source = itemsData;
            if (Array.isArray(itemsData)) { source = {}; itemsData.forEach(i => source[i.name] = i); }
            for (const [name, item] of Object.entries(source)) {
                if (parts.every(p => name.toLowerCase().includes(p.toLowerCase()))) return item;
            }
            return null;
        };

        const upItem = find(['uptime']);
        if (upItem) dash.uptime = formatUptime(parseInt(upItem.value));
        const cpuItem = find(['cpu']);
        if (cpuItem) dash.cpu = parseFloat(cpuItem.value).toFixed(1);
        const latItem = find(['icmp', 'time']) || find(['response', 'time']);
        if (latItem) dash.latency = (parseFloat(latItem.value) * 1000).toFixed(1) + ' ms';
        const lossItem = find(['loss']);
        if (lossItem) dash.loss = parseFloat(lossItem.value).toFixed(1) + '%';

        if (deviceType === 'fortinet_firewall') {
            const getVal = (k) => { const i = find(k); return i ? i.value : null; };
            dash.dynamic.wan1Status = getVal(['wan1', 'status']) == '1' ? 'UP' : 'DOWN';
            dash.dynamic.wan1Speed = formatBandwidth(getVal(['wan1', 'speed']));
            dash.dynamic.wan1Duplex = getVal(['wan1', 'duplex']) == '3' ? 'Full' : 'Half';
            dash.dynamic.wan1Upload = formatBandwidth(getVal(['wan1', 'sent']));
            dash.dynamic.wan1Download = formatBandwidth(getVal(['wan1', 'received']));
            dash.dynamic.wan2Status = getVal(['wan2', 'status']) == '1' ? 'UP' : 'DOWN';
            dash.dynamic.wan2Speed = formatBandwidth(getVal(['wan2', 'speed']));
            dash.dynamic.wan2Duplex = getVal(['wan2', 'duplex']) == '3' ? 'Full' : 'Half';
            dash.dynamic.wan2Upload = formatBandwidth(getVal(['wan2', 'sent']));
            dash.dynamic.wan2Download = formatBandwidth(getVal(['wan2', 'received']));
        }
        return dash;
    }
}

// PERFIS DE COMANDO - DEFINIÇÃO GLOBAL
const ZABBIX_COMMAND_PROFILES = {
    default: [],
    fortinet_firewall: [
        { name: 'Mostrar Status', command: 'get system status' },
        { name: 'Tabela ARP', command: 'get sys arp' },
        { name: 'Rotas', command: 'get router info routing-table all' },
        { name: 'Interfaces', command: 'get system interface physical' }
    ],
    cisco_router: [
        { name: 'Show IP Int Brief', command: 'show ip interface brief' },
        { name: 'Show Run', command: 'show running-config' },
        { name: 'Show ARP', command: 'show ip arp' }
    ],
    cisco_switch: [
        { name: 'Show Int Status', command: 'show interfaces status' },
        { name: 'Show Mac Address', command: 'show mac address-table' }
    ]
};

// EXPOR PARA O WINDOW (Correção Crucial)
window.ZabbixClient = ZabbixClient;
window.ZabbixDataProcessor = ZabbixDataProcessor;
window.ZABBIX_COMMAND_PROFILES = ZABBIX_COMMAND_PROFILES;