class ZabbixClient {
    constructor(baseUrl, username, password) {
        console.log('ZabbixClient v6 Initializing...');
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
            // Only add output: 'extend' if method ends with .get and output is not specified
            const finalParams = { ...params };
            if (method.endsWith('.get') && !finalParams.output) {
                finalParams.output = 'extend';
            }

            const payload = {
                jsonrpc: '2.0', method,
                params: finalParams,
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
    
    async getHostsByGroupId(gid) { 
        return this.request('host.get', { 
            groupids: gid, 
            output: ['hostid', 'host', 'name'], 
            selectInterfaces: 'extend', 
            selectInventory: 'extend',
            selectTags: 'extend' // <--- ADICIONADO PARA LER AS TAGS
        }); 
    }
    async getItemsByNamePattern(hostId, namePattern) {
        const items = await this.request('item.get', {
            hostids: hostId,
            output: ['itemid', 'name', 'key_', 'lastvalue', 'units']
        });
        const map = {};
        if (Array.isArray(items)) {
            items.forEach(i => map[i.name] = { value: i.lastvalue, units: i.units, key: i.key_, itemid: i.itemid });
        }
        return map;
    }

    async getItemHistory(itemId, hours = 1) {
        const timeFrom = Math.floor(Date.now() / 1000) - (hours * 3600);
        return await this.request('history.get', {
            itemids: itemId, output: 'extend', time_from: timeFrom, sortfield: 'clock', sortorder: 'ASC', limit: 100
        });
    }

    async getHostProblems(hostId) {
        return this.request('problem.get', {
            hostids: hostId, output: 'extend', sortfield: 'eventid', sortorder: 'DESC'
        });
    }

    async getAllProblems(groupId = null) {
        console.log('getAllProblems called with groupId:', groupId);

        const getParams = (level) => {
            const p = { output: 'extend' };

            // Only add groupids if not 'desperate' and groupId exists
            if (groupId && level !== 'desperate') {
                p.groupids = Array.isArray(groupId) ? groupId : [groupId];
            }

            if (level === 'full') {
                p.selectTags = 'extend';
                p.selectHosts = 'extend';
                p.sortfield = 'eventid';
                p.sortorder = 'DESC';
            } else if (level === 'safe') {
                p.selectTags = 'extend';
                p.selectHosts = 'extend';
            } else if (level === 'desperate') {
                // Try specific fields instead of 'extend' and NO group filter
                p.output = ['eventid', 'name', 'clock', 'severity', 'r_eventid'];
                p.selectHosts = 'extend'; // We really need hosts
            }
            return p;
        };

        try {
            const params = getParams('full');
            console.log('Attempting fetch: FULL', JSON.stringify(params));
            return await this.request('problem.get', params);
        } catch (err) {
            console.warn('Full fetch failed, retrying SAFE...', err);
            try {
                const params = getParams('safe');
                console.log('Attempting fetch: SAFE', JSON.stringify(params));
                return await this.request('problem.get', params);
            } catch (err2) {
                console.warn('Safe fetch failed, retrying MINIMAL...', err2);
                try {
                    const params = getParams('minimal');
                    console.log('Attempting fetch: MINIMAL', JSON.stringify(params));
                    return await this.request('problem.get', params);
                } catch (err3) {
                    console.warn('Minimal fetch failed, retrying DESPERATE...', err3);
                    const params = getParams('desperate');
                    console.log('Attempting fetch: DESPERATE', JSON.stringify(params));
                    return await this.request('problem.get', params);
                }
            }
        }
    }

    async getMapId(name) {
        try {
            const params = {
                output: ['sysmapid', 'name'],
                search: { name: name },
                limit: 1
            };
            const maps = await this.request('map.get', params);
            return maps && maps.length > 0 ? maps[0].sysmapid : null;
        } catch (e) {
            console.error('Error fetching map:', e);
            return null;
        }
    }

    async getLinkProblems(groupId) {
        console.log('getLinkProblems called', groupId);
        // 1. Get Problems (to get eventid and ack status)
        // problem.get does NOT support selectHosts, so we fetch it later
        const problemParams = {
            output: 'extend',
            selectTags: 'extend',
            selectAcknowledges: 'extend',
            sortfield: 'eventid',
            sortorder: 'DESC'
        };
        if (groupId) {
            problemParams.groupids = Array.isArray(groupId) ? groupId : [groupId];
        }

        const problems = await this.request('problem.get', problemParams);

        if (!problems || problems.length === 0) return [];

        // 2. Get Triggers for these problems to get Hosts
        const triggerIds = problems.map(p => p.objectid);
        // Unique IDs
        const uniqueTriggerIds = [...new Set(triggerIds)];

        const triggerParams = {
            triggerids: uniqueTriggerIds,
            output: ['triggerid'],
            selectHosts: ['name', 'hostid', 'host', 'status']
        };

        const triggers = await this.request('trigger.get', triggerParams);

        // 3. Create a map of triggerId -> host
        const triggerHostMap = {};
        if (triggers) {
            triggers.forEach(t => {
                if (t.hosts && t.hosts.length > 0) {
                    triggerHostMap[t.triggerid] = t.hosts;
                }
            });
        }

        // 4. Attach hosts and filter disabled ones
        return problems.filter(p => {
            if (triggerHostMap[p.objectid]) {
                p.hosts = triggerHostMap[p.objectid];
                // Filter out if all hosts are disabled (status '1')
                // Zabbix host status: 0 - monitored, 1 - unmonitored
                return p.hosts.some(h => h.status !== '1');
            }
            return true; // Keep if no host info (fallback)
        });
    }

    async acknowledgeEvent(eventId, message, action = 6) {
        return this.request('event.acknowledge', {
            eventids: Array.isArray(eventId) ? eventId : [eventId], // Ensure array
            action: action,
            message: message
        });
    }

    async getMockData(method, params) {
        if (method === 'event.acknowledge') {
            console.log('Mock Ack:', params);
            return { eventids: [params.eventids] };
        }
        if (method === 'problem.get') {
            return [
                {
                    eventid: '1001',
                    name: 'Interface Gi1/0/48 down',
                    severity: '4',
                    clock: Math.floor(Date.now() / 1000) - 3600,
                    acknowledged: "0",
                    objectid: "42349",
                    tags: [{ tag: "Service", value: "Link" }]
                },
                {
                    eventid: '1002',
                    name: 'High CPU utilization (90%)',
                    severity: '3',
                    clock: Math.floor(Date.now() / 1000) - 7200,
                    acknowledged: "1",
                    objectid: "108318",
                    tags: [{ tag: "Service", value: "Link" }]
                }
            ];
        }
        if (method === 'item.get') {
            // Return some mock items if needed, or empty
            return [];
        }
        if (method === 'trigger.get') {
            console.log('Returning MOCK data for trigger.get');
            return [
                {
                    triggerid: "42349",
                    description: "Não disponível por Ping ICMP",
                    priority: "4",
                    lastchange: Math.floor(Date.now() / 1000) - 3600,
                    value: "1",
                    comments: "Last value: Down (0).\r\nLast three attempts returned timeout.",
                    hosts: [{ hostid: "11531", name: "BT541 - Link Algar", host: "BT541 - Link Algar", status: "0" }],
                    tags: [{ tag: "Service", value: "Link" }],
                    lastEvent: { eventid: "99901", acknowledged: "0" }
                },
                {
                    triggerid: "108318",
                    description: "Não disponível por Ping ICMP",
                    priority: "4",
                    lastchange: Math.floor(Date.now() / 1000) - 7200,
                    value: "1",
                    comments: "Last value: Down (0).",
                    hosts: [{ hostid: "12194", name: "PZ734 - Link Algar", host: "PZ734 - Link Algar", status: "1" }],
                    tags: [{ tag: "Service", value: "Link" }],
                    lastEvent: { eventid: "99902", acknowledged: "1" }
                }
            ];
        }
        return [];
    }
    async testConnection() { return { success: true, version: '7.0', message: 'OK' }; }
}

class ZabbixDataProcessor {
    static processDashboardData(itemsData, problems, deviceType) {
        const dash = { uptime: '--', cpu: '--', latency: '--', loss: '--', memory: '--', dynamic: { problems: [] } };

        const find = (terms) => {
            if (!itemsData) return null;
            let source = itemsData;
            if (Array.isArray(itemsData)) { source = {}; itemsData.forEach(i => source[i.name] = i); }

            for (const [name, item] of Object.entries(source)) {
                const nameLow = name.toLowerCase();
                if (terms.every(term => nameLow.includes(term.toLowerCase()))) return item;
            }
            return null;
        };

        // 1. CPU
        const cpuItem = find(['cpu', 'util']) || find(['cpu', 'load']) || find(['cpu', 'usage']) || find(['processor', 'load']);
        if (cpuItem) dash.cpu = parseFloat(cpuItem.value).toFixed(1);

        // 2. Uptime
        const upItem = find(['uptime']);
        if (upItem) dash.uptime = formatUptime(parseInt(upItem.value));

        // 3. Latência/Perda
        const latItem = find(['icmp', 'time']) || find(['ping', 'time']) || find(['response', 'time']);
        if (latItem) dash.latency = (parseFloat(latItem.value) * 1000).toFixed(1) + ' ms';

        const lossItem = find(['icmp', 'loss']) || find(['ping', 'loss']) || find(['packet', 'loss']);
        if (lossItem) dash.loss = parseFloat(lossItem.value).toFixed(1) + '%';

        // 4. Memória
        const memUtil = find(['memory', 'util']) || find(['memory', 'usage']);
        if (memUtil && memUtil.units.includes('%')) {
            dash.memory = parseFloat(memUtil.value).toFixed(1);
        } else {
            const memUsed = find(['memory', 'used']);
            const memTotal = find(['memory', 'total']);
            if (memUsed && memTotal && parseFloat(memTotal.value) > 0) {
                dash.memory = ((parseFloat(memUsed.value) / parseFloat(memTotal.value)) * 100).toFixed(1);
            }
        }

        // 5. Lógica Específica
        if (deviceType === 'fortinet_firewall') {
            const getVal = (keys) => { const i = find(keys); return i ? i.value : null; };

            const checkStatus = (val) => {
                if (!val) return 'DOWN';
                return (val == '1' || val.toLowerCase() == 'up') ? 'UP' : 'DOWN';
            };

            dash.dynamic.wan1Status = checkStatus(getVal(['wan1', 'status']));
            dash.dynamic.wan1Speed = formatBandwidth(getVal(['wan1', 'speed']));
            dash.dynamic.wan1Upload = formatBandwidth(getVal(['wan1', 'bits sent']) || getVal(['wan1', 'out']) || getVal(['wan1', 'upload']));
            dash.dynamic.wan1Download = formatBandwidth(getVal(['wan1', 'bits received']) || getVal(['wan1', 'in']) || getVal(['wan1', 'download']));

            dash.dynamic.wan2Status = checkStatus(getVal(['wan2', 'status']));
            dash.dynamic.wan2Speed = formatBandwidth(getVal(['wan2', 'speed']));
            dash.dynamic.wan2Upload = formatBandwidth(getVal(['wan2', 'bits sent']) || getVal(['wan2', 'out']));
            dash.dynamic.wan2Download = formatBandwidth(getVal(['wan2', 'bits received']) || getVal(['wan2', 'in']));
        }
        else if (deviceType.includes('switch')) {
            if (problems && Array.isArray(problems)) {
                const ifProblems = problems.filter(p =>
                    p.name.toLowerCase().includes('interface') || p.name.toLowerCase().includes('link') || p.name.toLowerCase().includes('port')
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

// PERFIS DE COMANDO ATUALIZADOS
const ZABBIX_COMMAND_PROFILES = {
    cisco_router: [
        { name: 'Mostrar interfaces (brief)', command: 'show ip interface brief' },
        { name: 'Mostrar vizinhos CDP', command: 'show cdp neighbors' },
        { name: 'Mostrar config (running)', command: 'show running-config' },
        { name: 'Mostrar pools DHCP', command: 'show ip dhcp pool' },
        { name: 'Mostrar Uptime', command: 'show version | include uptime' },
        { name: 'Mostrar tabela ARP', command: 'show ip arp' },
        { name: 'Mostrar erros nas interfaces', command: 'show interfaces | include line protocol|input errors|output errors'}
    ],
    cisco_switch: [
        { name: 'Mostrar interfaces (brief)', command: 'show ip interface brief' },
        { name: 'Mostrar vizinhos CDP', command: 'show cdp neighbors' },
        { name: 'Mostrar config (running)', command: 'show running-config' },
        { name: 'Mostrar consumo PoE', command: 'show power inline' },
        { name: 'Mostrar descrição interfaces', command: 'show interfaces description' },
        { name: 'Mostrar status interfaces', command: 'show interfaces status' },
        { name: 'Mostrar vizinhos LLDP', command: 'show lldp neighbors' },
        { name: 'Mostrar Uptime', command: 'show version | include uptime' },
        { name: 'Mostrar VLANs', command: 'show vlan brief' },
        { name: 'Mostrar interfaces Trunk', command: 'show interfaces trunk' },
        { name: 'Mostrar tabela MAC', command: 'show mac address-table' },
        { name: 'Mostrar contadores de erros', command: 'show interfaces counters errors' },
        { name: 'Mostrar Logs', command: 'show logging' },
        { name: 'Mostrar Spanning Tree', command: 'show spanning-tree' },
        { name: 'Mostrar Etherchannel', command: 'show etherchannel summary' },
        { name: 'Mostrar Inventário', command: 'show inventory' },
        { name: 'Mostrar Environment', command: 'show env all' }
    ],
    fortinet_firewall: [
        { name: 'Mostrar tabela ARP', command: 'get sys arp' },
        { name: 'Mostrar ARP (WAN)', command: 'get sys arp | grep wan' },
        { name: 'Listar túneis IPsec', command: 'get ipsec tunnel list' },
        { name: 'Sumário túneis IPsec', command: 'get vpn ipsec tunnel summary' },
        { name: 'Sumário BGP', command: 'get router info bgp summary' },
        { name: 'Mostrar DHCP Server', command: 'show sys dhcp server' },
        { name: 'Mostrar status sistema', command: 'get sys status' },
        { name: 'Mostar Uptime', command: 'get system performance status | grep Uptime' },
        { name: 'Mostrar Performance SLA', command: 'diagnose sys sdwan health-check' },
        { name: 'Mostrar interfaces (WAN)', command: 'get sys interface | grep wan' },
        { name: 'Mostrar quantidade de sessões', command: 'get system session status' },
        { name: 'Limpar todas as sessões', command: 'diagnose sys session clear' },
        { name: 'Mostrar status interfaces WAN', command: 'diagnose netlink device list | grep wan' },
        { name: 'Mostrar clientes conectados na rede Clientes', command: 'diagnose wireless-controller wlac -d sta | grep ip=192.168.' },
        { name: 'Diagnosticar interfaces', command: 'diagnose netlink device list' },
        { name: 'Mostrar configuração interface cswlan11 e 12', command: 'show system interface | grep -f VLAN_WLAN2' },
        { name: 'Mostrar configuração de DHCP Server cswlan11 e 12', command: 'show sys dhcp server | grep -f VLAN_WLAN2' },
        { name: 'Mostrar configuração do Radius', command: 'show user radius' },
        { name: 'Mostrar configuração DHCP VLAN16', command: 'show sys dhcp server | grep -f VLAN16' },
        { name: 'Mostrar configuração interface VLAN16', command: 'get system interface | grep -f VLAN16' }
    ],
    fortiswitch: [
        { name: 'Mostrar vizinhos LLDP', command: 'get switch lldp neighbors-summary' },
        { name: 'Mostrar consumo PoE', command: 'get switch poe inline' },
        { name: 'Mostrar configuração das interfaces', command: 'show switch interface' },
        { name: 'Mostar VLANs', command: 'diagnose switch vlan list' },
        { name: 'Mostar Uptime', command: 'get system performance status | grep Uptime' },
        { name: 'Mostrar status interfaces', command: 'diagnose switch physical-ports summary' },
        { name: 'Mostrar contatdores de erros', command: 'diag switch physical-ports port-stats list' }
    ],
    huawei_switch: [
        { name: 'Mostrar vizinhos LLDP', command: 'display lldp ne brief' }
    ],
    access_point: [
    ],
    default: []
};

if (typeof module !== 'undefined') {
    module.exports = { ZabbixClient, ZabbixDataProcessor, ZABBIX_COMMAND_PROFILES };
}
// Expose to window for dashboard.js
window.ZABBIX_COMMAND_PROFILES = ZABBIX_COMMAND_PROFILES;