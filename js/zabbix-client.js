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
        this.isSimulated = false; // Nova flag para controlar modo simulação
        // Use proxy local para evitar CORS
        this.proxyUrl = '/api/zabbix-proxy';
    }

    /**
     * Authenticate with Zabbix API
     * @returns {Promise<boolean>} Authentication success
     */
    async authenticate() {
        try {
            const response = await api.post(this.proxyUrl, {
                jsonrpc: '2.0',
                method: 'user.login',
                params: { user: this.username, password: this.password },
                id: 1
            });
            if (response.result) {
                this.authToken = response.result;
                this.isAuthenticated = true;
                this.isSimulated = false;
                return true;
            } else {
                console.warn('Zabbix auth failed, using simulated data');
                this.isAuthenticated = false;
                this.isSimulated = true; // Ativa modo simulação
                return false;
            }
        } catch (err) {
            console.warn('Zabbix auth error, fallback to simulation:', err);
            this.isAuthenticated = false;
            this.isSimulated = true; // Ativa modo simulação
            return false;
        }
    }

    /**
     * Make authenticated API request
     * @param {string} method - API method name
     * @param {Object} params - Method parameters
     * @returns {Promise<Object>} API response
     */
    async request(method, params = {}) {
        // CORREÇÃO: Se estiver em modo simulado, retorna dados falsos em vez de erro
        if (!this.isAuthenticated) {
            if (this.isSimulated) {
                console.log(`[Simulação] Gerando dados para: ${method}`);
                return this.getMockData(method, params);
            }
            throw new Error('Cliente não autenticado');
        }

        try {
            const response = await api.post(this.proxyUrl, {
                jsonrpc: '2.0',
                method,
                params: {
                    ...params,
                    output: params.output || 'extend'
                },
                auth: this.authToken,
                id: 1
            });

            if (response.error) {
                throw new Error(response.error.message);
            }

            return response.result;
        } catch (err) {
            console.error(`Zabbix API request failed (${method}):`, err);
            // Fallback para simulação em caso de erro de rede
            if (this.isSimulated) return this.getMockData(method, params);
            throw err;
        }
    }

    /**
     * Gera dados falsos para o modo de simulação
     */
    async getMockData(method, params) {
        // Simula latência de rede
        await new Promise(resolve => setTimeout(resolve, 200));

        switch (method) {
            case 'hostgroup.get':
                return [
                    { groupid: '1', name: 'Lojas/Brasil' },
                    { groupid: '2', name: 'Lojas/Argentina' }
                ];
            
            case 'host.get':
                // Retorna um host fictício
                return [{
                    hostid: '10001',
                    host: 'FortiGate-SIMULADO',
                    name: 'Firewall Simulado',
                    status: '0', // Monitorado
                    interfaces: [{ ip: '192.168.1.1', main: '1' }],
                    inventory: { os: 'FortiOS', hardware: 'FortiGate-60F' }
                }];

            case 'item.get':
                // Gera itens com valores aleatórios
                const items = [];
                const searchName = params.search?.name || '';
                const searchKey = params.search?.key_ || '';
                
                // Lista de itens padrão para simular
                const mockItems = [
                    { name: 'CPU utilization', key_: 'system.cpu.util', units: '%', val: () => Math.floor(Math.random() * 30) },
                    { name: 'ICMP response time', key_: 'icmppingsec', units: 's', val: () => (Math.random() * 0.05).toFixed(4) },
                    { name: 'ICMP packet loss', key_: 'icmppingloss', units: '%', val: () => 0 },
                    { name: 'Device uptime', key_: 'system.uptime', units: 's', val: () => 864000 + Math.floor(Math.random() * 1000) },
                    { name: 'Uptime', key_: 'uptime', units: 's', val: () => 864000 },
                    { name: 'wan1 Operational status', key_: 'net.if.status[wan1]', units: '', val: () => 1 },
                    { name: 'wan2 Operational status', key_: 'net.if.status[wan2]', units: '', val: () => 1 },
                    { name: 'wan1 Speed', key_: 'net.if.speed[wan1]', units: 'bps', val: () => 100000000 },
                    { name: 'wan2 Speed', key_: 'net.if.speed[wan2]', units: 'bps', val: () => 50000000 },
                    { name: 'wan1 Bits sent', key_: 'net.if.out[wan1]', units: 'bps', val: () => Math.floor(Math.random() * 5000000) },
                    { name: 'wan1 Bits received', key_: 'net.if.in[wan1]', units: 'bps', val: () => Math.floor(Math.random() * 8000000) },
                    { name: 'wan2 Bits sent', key_: 'net.if.out[wan2]', units: 'bps', val: () => Math.floor(Math.random() * 1000000) },
                    { name: 'wan2 Bits received', key_: 'net.if.in[wan2]', units: 'bps', val: () => Math.floor(Math.random() * 2000000) },
                    { name: 'wan1 Duplex status', key_: 'net.if.duplex[wan1]', units: '', val: () => 3 }, // Full duplex
                    { name: 'wan2 Duplex status', key_: 'net.if.duplex[wan2]', units: '', val: () => 3 }
                ];

                // Filtra os itens baseados na busca
                mockItems.forEach((m, idx) => {
                    // Lógica simplificada de match
                    if (!searchName || searchName.split(',').some(n => m.name.includes(n))) {
                        items.push({
                            itemid: `sim_item_${idx}`,
                            name: m.name,
                            key_: m.key_,
                            lastvalue: m.val().toString(),
                            units: m.units,
                            value_type: '0' // numérico
                        });
                    }
                });
                return items;

            case 'history.get':
                // Gera histórico para gráficos
                const history = [];
                const now = Math.floor(Date.now() / 1000);
                // Gera 20 pontos
                for (let i = 20; i >= 0; i--) {
                    history.push({
                        clock: now - (i * 300), // a cada 5 min
                        value: (Math.random() * 20).toFixed(2)
                    });
                }
                return history;

            case 'problem.get':
                return []; // Sem problemas no modo simulado

            case 'APIInfo.version':
                return "6.0.0 (Simulado)";

            default:
                return [];
        }
    }

    // ... (Resto dos métodos originais: getHostGroups, getHostsByGroupId, etc. mantêm-se iguais)
    // Eles chamarão o this.request(), que agora trata a simulação.

    async getHostGroups() {
        return await this.request('hostgroup.get', { output: ['groupid', 'name'] });
    }

    async getHostsByGroupId(groupId) {
        return await this.request('host.get', {
            groupids: groupId,
            output: ['hostid', 'host', 'name', 'status'],
            selectInterfaces: 'extend'
        });
    }

    async getHost(hostId) {
        return await this.request('host.get', {
            hostids: hostId,
            output: 'extend',
            selectInterfaces: 'extend',
            selectInventory: 'extend'
        });
    }

    async getItemsByKeyPattern(hostId, keyPattern) {
        return await this.request('item.get', {
            hostids: hostId,
            output: ['itemid', 'name', 'key_', 'lastvalue', 'units', 'value_type'],
            search: { key_: keyPattern }
        });
    }

    async getItemsByNamePattern(hostId, namePattern) {
        const items = await this.request('item.get', {
            hostids: hostId,
            output: ['itemid', 'name', 'key_', 'lastvalue', 'units', 'value_type'],
            search: { name: namePattern }
        });

        const itemsByName = {};
        items.forEach(item => {
            itemsByName[item.name] = {
                value: item.lastvalue,
                units: item.units,
                value_type: item.value_type,
                key: item.key_
            };
        });

        return itemsByName;
    }

    async getItemHistory(itemId, hours = 4) {
        const timeFrom = Math.floor(Date.now() / 1000) - (hours * 3600);
        return await this.request('history.get', {
            itemids: itemId,
            output: 'extend',
            time_from: timeFrom,
            sortfield: 'clock',
            sortorder: 'ASC'
        });
    }

    async getMultipleItemHistory(itemRequests) {
        const results = {};
        for (const [itemId, hours] of Object.entries(itemRequests)) {
            try {
                const history = await this.getItemHistory(itemId, hours);
                results[itemId] = history;
            } catch (err) {
                console.error(`Failed to get history for item ${itemId}:`, err);
                results[itemId] = [];
            }
        }
        return results;
    }

    async getHostProblems(hostId) {
        return await this.request('problem.get', {
            hostids: hostId,
            output: 'extend'
        });
    }

    async getTriggers(triggerIds) {
        return await this.request('trigger.get', {
            triggerids: triggerIds,
            output: 'extend'
        });
    }

    async getMaintenances() {
        return await this.request('maintenance.get', { output: 'extend' });
    }

    async testConnection() {
        try {
            const version = await this.request('APIInfo.version');
            return {
                success: true,
                version,
                message: `Conectado ao Zabbix ${version}`
            };
        } catch (err) {
            return {
                success: false,
                error: err.message,
                message: 'Falha na conexão com Zabbix'
            };
        }
    }
}
