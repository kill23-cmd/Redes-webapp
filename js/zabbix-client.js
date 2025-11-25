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
        // Busca items reais
        const items = await this.request('item.get', {
            hostids: hostId,
            output: ['itemid', 'name', 'key_', 'lastvalue', 'units']
        });
        // Retorna mapa para facil acesso
        const map = {};
        if (Array.isArray(items)) {
            items.forEach(i => map[i.name] = { value: i.lastvalue, units: i.units, key: i.key_, itemid: i.itemid });
        }
        return map;
    }

    async getItemHistory(itemId, hours = 1) {
        const timeFrom = Math.floor(Date.now() / 1000) - (hours * 3600);
        return await this.request('history.get', {
            itemids: itemId, output: 'extend', time_from: timeFrom, sortfield: 'clock', sortorder: 'ASC'
        });
    }

    async getHostProblems(hostId) {
        return this.request('problem.get', {
            hostids: hostId,
            output: 'extend',
            sortfield: ['eventid'],
            sortorder: 'DESC'
        });
    }

    // Mock
    async getMockData(method, params) {
        await new Promise(r => setTimeout(r, 100));
        if (method === 'hostgroup.get') return [{ groupid: '1', name: 'Lojas/Brasil' }];
        if (method === 'host.get') return [{ hostid: '100', name: 'FW-MOCK', inventory: { os: 'FortiOS' } }];
        return [];
    }
    async testConnection() { return { success: true, version: '7.0', message: 'OK' }; }
}

class ZabbixDataProcessor {
    static processDashboardData(itemsData, problems, deviceType) {
        const dash = { uptime: '--', cpu: '--', latency: '--', loss: '--', memory: '--', dynamic: { problems: [] } };

        // Função de busca ultra-flexível
        const find = (terms) => {
            if (!itemsData) return null;
            // Normaliza
            let source = itemsData;
            if (Array.isArray(itemsData)) { source = {}; itemsData.forEach(i => source[i.name] = i); }

            for (const [name, item] of Object.entries(source)) {
                const nameLow = name.toLowerCase();
                // Verifica se TODOS os termos estão no nome
                if (terms.every(term => nameLow.includes(term.toLowerCase()))) return item;
            }
            return null;
        };

        // 1. CPU (Tenta várias combinações comuns)
        const cpuItem = find(['cpu', 'util']) || find(['cpu', 'load']) || find(['cpu', 'usage']) || find(['processor', 'load']);
        if (cpuItem) dash.cpu = parseFloat(cpuItem.value).toFixed(1);

        // 2. Uptime
        const upItem = find(['uptime']);
        if (upItem) dash.uptime = formatUptime(parseInt(upItem.value));

        // 3. Latência/Perda (ICMP Ping)
        const latItem = find(['icmp', 'time']) || find(['ping', 'time']) || find(['response', 'time']);
        if (latItem) dash.latency = (parseFloat(latItem.value) * 1000).toFixed(1) + ' ms';

        const lossItem = find(['icmp', 'loss']) || find(['ping', 'loss']) || find(['packet', 'loss']);
        if (lossItem) dash.loss = parseFloat(lossItem.value).toFixed(1) + '%';

        // 4. Memória (Cálculo inteligente)
        const memUtil = find(['memory', 'util']) || find(['memory', 'usage']);
        if (memUtil && memUtil.units.includes('%')) {
            dash.memory = parseFloat(memUtil.value).toFixed(1);
        } else {
            // Tenta calcular se tiver usado/total
            const memUsed = find(['memory', 'used']);
            const memTotal = find(['memory', 'total']);
            if (memUsed && memTotal && parseFloat(memTotal.value) > 0) {
                dash.memory = ((parseFloat(memUsed.value) / parseFloat(memTotal.value)) * 100).toFixed(1);
            }
        }

        // 5. Lógica Específica por Dispositivo
        if (deviceType === 'fortinet_firewall') {
            const getVal = (keys) => {
                // Tenta encontrar com 'wan1' e depois com as chaves
                const i = find(['wan1', ...keys]);
                return i ? i.value : null;
            };

            const mapStatus = (v) => v == '1' ? 'UP' : 'DOWN';

            // WAN 1
            dash.dynamic.wan1Status = mapStatus(find(['wan1', 'status'])?.value);
            dash.dynamic.wan1Speed = formatBandwidth(find(['wan1', 'speed'])?.value);
            // Tráfego: Tenta 'sent', 'out', 'upload'
            dash.dynamic.wan1Upload = formatBandwidth(find(['wan1', 'sent'])?.value || find(['wan1', 'out'])?.value);
            dash.dynamic.wan1Download = formatBandwidth(find(['wan1', 'received'])?.value || find(['wan1', 'in'])?.value);

            // WAN 2
            dash.dynamic.wan2Status = mapStatus(find(['wan2', 'status'])?.value);
            dash.dynamic.wan2Speed = formatBandwidth(find(['wan2', 'speed'])?.value);
            dash.dynamic.wan2Upload = formatBandwidth(find(['wan2', 'sent'])?.value || find(['wan2', 'out'])?.value);
            dash.dynamic.wan2Download = formatBandwidth(find(['wan2', 'received'])?.value || find(['wan2', 'in'])?.value);
        }
        else if (deviceType.includes('switch')) {
            // Para switches, contamos problemas de interface
            if (problems && Array.isArray(problems)) {
                // Filtra problemas que contêm "Interface" ou "Link" ou "Down"
                const ifProblems = problems.filter(p =>
                    p.name.toLowerCase().includes('interface') ||
                    p.name.toLowerCase().includes('link') ||
                    p.name.toLowerCase().includes('port')
                );
                dash.dynamic.interfacesDown = ifProblems.length;
                dash.dynamic.problems = ifProblems.map(p => p.name);
            } else {
                dash.dynamic.interfacesDown = 0;
            }
        }

        return dash;
    }
}

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
        { name: 'Show Mac Address', command: 'show mac address-table' },
        { name: 'Show VLANs', command: 'show vlan brief' }
    ],
    access_point: [
        { name: 'Show CDP Neighbors', command: 'show cdp neighbors' },
        { name: 'Show IP Int Brief', command: 'show ip interface brief' }
    ]
};

if (typeof module !== 'undefined') {
    module.exports = { ZabbixClient, ZabbixDataProcessor, ZABBIX_COMMAND_PROFILES };
}