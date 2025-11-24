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
                return true;
            } else {
                console.warn('Zabbix auth failed, using simulated data');
                this.isAuthenticated = false;
                return false;
            }
        } catch (err) {
            console.warn('Zabbix auth error, fallback to simulation:', err);
            this.isAuthenticated = false;
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
        if (!this.isAuthenticated) {
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
            throw err;
        }
    }

    /**
     * Get all host groups
     * @returns {Promise<Array>} Array of host groups
     */
    async getHostGroups() {
        return await this.request('hostgroup.get', {
            output: ['groupid', 'name']
        });
    }

    /**
     * Get hosts by group ID
     * @param {string} groupId - Group ID
     * @returns {Promise<Array>} Array of hosts
     */
    async getHostsByGroupId(groupId) {
        return await this.request('host.get', {
            groupids: groupId,
            output: ['hostid', 'host', 'name', 'status'],
            selectInterfaces: 'extend'
        });
    }

    /**
     * Get host information including inventory
     * @param {string} hostId - Host ID
     * @returns {Promise<Object>} Host data
     */
    async getHost(hostId) {
        return await this.request('host.get', {
            hostids: hostId,
            output: 'extend',
            selectInterfaces: 'extend',
            selectInventory: 'extend'
        });
    }

    /**
     * Get items by host ID and key pattern
     * @param {string} hostId - Host ID
     * @param {string} keyPattern - Key pattern to match
     * @returns {Promise<Array>} Array of items
     */
    async getItemsByKeyPattern(hostId, keyPattern) {
        return await this.request('item.get', {
            hostids: hostId,
            output: ['itemid', 'name', 'key_', 'lastvalue', 'units', 'value_type'],
            search: {
                key_: keyPattern
            }
        });
    }

    /**
     * Get items by name pattern
     * @param {string} hostId - Host ID
     * @param {string} namePattern - Name pattern to match
     * @returns {Promise<Object>} Object with item data indexed by name
     */
    async getItemsByNamePattern(hostId, namePattern) {
        const items = await this.request('item.get', {
            hostids: hostId,
            output: ['itemid', 'name', 'key_', 'lastvalue', 'units', 'value_type'],
            search: {
                name: namePattern
            }
        });

        // Convert to object indexed by name for easier lookup
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

    /**
     * Get item history data
     * @param {string} itemId - Item ID
     * @param {number} hours - Hours of history to fetch
     * @returns {Promise<Array>} Array of historical data points
     */
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

    /**
     * Get multiple items history
     * @param {Object} itemRequests - Object with item IDs and hours
     * @returns {Promise<Object>} Object with history data for each item
     */
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

    /**
     * Get host problems
     * @param {string} hostId - Host ID
     * @returns {Promise<Array>} Array of problems
     */
    async getHostProblems(hostId) {
        return await this.request('problem.get', {
            hostids: hostId,
            output: 'extend'
        });
    }

    /**
     * Get trigger information
     * @param {Array} triggerIds - Array of trigger IDs
     * @returns {Promise<Array>} Array of triggers
     */
    async getTriggers(triggerIds) {
        return await this.request('trigger.get', {
            triggerids: triggerIds,
            output: 'extend'
        });
    }

    /**
     * Get maintenance periods
     * @returns {Promise<Array>} Array of maintenance periods
     */
    async getMaintenances() {
        return await this.request('maintenance.get', {
            output: 'extend'
        });
    }

    /**
     * Test connectivity to Zabbix API
     * @returns {Promise<Object>} Test result
     */
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

// ============================================
// ZABBIX DATA PROCESSOR
// ============================================

class ZabbixDataProcessor {
    /**
     * Process dashboard data for UI display
     * @param {Object} itemsData - Items data from API
     * @param {Array} problems - Problems data
     * @param {string} deviceType - Device type (fortinet_firewall, cisco_switch, etc.)
     * @returns {Object} Processed dashboard data
     */
    static processDashboardData(itemsData, problems, deviceType = 'default') {
        const dashboard = {
            uptime: '--',
            cpu: '--',
            latency: '--',
            loss: '--',
            dynamic: {},
            problems: problems || []
        };

        // Process common metrics
        if (itemsData) {
            // Uptime
            const uptimeItem = this.findItemByName(itemsData, ['Device uptime', 'Uptime']);
            if (uptimeItem) {
                dashboard.uptime = formatUptime(parseInt(uptimeItem.value));
            }

            // CPU
            const cpuItem = this.findItemByName(itemsData, ['CPU utilization', 'CPU usage']);
            if (cpuItem) {
                dashboard.cpu = `${parseFloat(cpuItem.value).toFixed(2)}%`;
            }

            // Latency
            const latencyItem = this.findItemByName(itemsData, ['ICMP response time', 'Response time']);
            if (latencyItem) {
                dashboard.latency = `${(parseFloat(latencyItem.value) * 1000).toFixed(2)} ms`;
            }

            // Loss
            const lossItem = this.findItemByName(itemsData, ['ICMP packet loss', 'Packet loss']);
            if (lossItem) {
                dashboard.loss = `${parseFloat(lossItem.value).toFixed(1)}%`;
            }

            // Device-specific processing
            if (deviceType === 'fortinet_firewall') {
                dashboard.dynamic = this.processFirewallData(itemsData);
            } else if (deviceType.includes('switch') || deviceType.includes('router')) {
                dashboard.dynamic = this.processSwitchRouterData(itemsData);
            }
        }

        return dashboard;
    }

    /**
     * Process firewall-specific data
     * @param {Object} itemsData - Items data
     * @returns {Object} Processed firewall data
     */
    static processFirewallData(itemsData) {
        const data = {};

        // WAN1 Status
        const wan1Status = this.findItemByName(itemsData, ['wan1', 'Operational status']);
        data.wan1Status = wan1Status ? (wan1Status.value === '1' ? 'UP' : 'DOWN') : '--';

        // WAN2 Status
        const wan2Status = this.findItemByName(itemsData, ['wan2', 'Operational status']);
        data.wan2Status = wan2Status ? (wan2Status.value === '1' ? 'UP' : 'DOWN') : '--';

        // WAN1 Speed
        const wan1Speed = this.findItemByName(itemsData, ['wan1', 'Speed']);
        data.wan1Speed = wan1Speed ? this.formatSpeed(wan1Speed.value) : '--';

        // WAN2 Speed
        const wan2Speed = this.findItemByName(itemsData, ['wan2', 'Speed']);
        data.wan2Speed = wan2Speed ? this.formatSpeed(wan2Speed.value) : '--';

        // WAN1 Duplex
        const wan1Duplex = this.findItemByName(itemsData, ['wan1', 'Duplex status']);
        data.wan1Duplex = wan1Duplex ? this.formatDuplex(wan1Duplex.value) : '--';

        // WAN2 Duplex
        const wan2Duplex = this.findItemByName(itemsData, ['wan2', 'Duplex status']);
        data.wan2Duplex = wan2Duplex ? this.formatDuplex(wan2Duplex.value) : '--';

        // Traffic data
        const wan1Sent = this.findItemByName(itemsData, ['wan1', 'Bits sent']);
        data.wan1Upload = wan1Sent ? formatBandwidth(parseInt(wan1Sent.value)) : '--';

        const wan1Received = this.findItemByName(itemsData, ['wan1', 'Bits received']);
        data.wan1Download = wan1Received ? formatBandwidth(parseInt(wan1Received.value)) : '--';

        const wan2Sent = this.findItemByName(itemsData, ['wan2', 'Bits sent']);
        data.wan2Upload = wan2Sent ? formatBandwidth(parseInt(wan2Sent.value)) : '--';

        const wan2Received = this.findItemByName(itemsData, ['wan2', 'Bits received']);
        data.wan2Download = wan2Received ? formatBandwidth(parseInt(wan2Received.value)) : '--';

        return data;
    }

    /**
     * Process switch/router-specific data
     * @param {Object} itemsData - Items data
     * @returns {Object} Processed switch/router data
     */
    static processSwitchRouterData(itemsData) {
        const data = {
            activeProblems: 0,
            interfacesDown: 0
        };

        // Count interfaces down
        const interfacesDownItem = this.findItemByName(itemsData, ['interfaces', 'down']);
        if (interfacesDownItem) {
            data.interfacesDown = parseInt(interfacesDownItem.value);
        }

        return data;
    }

    /**
     * Find item by name patterns
     * @param {Object} itemsData - Items data
     * @param {Array} nameParts - Array of name parts to match
     * @returns {Object|null} Found item or null
     */
    static findItemByName(itemsData, nameParts) {
        if (!itemsData) return null;

        const namePartsLower = nameParts.map(part => part.toLowerCase());

        for (const [name, itemData] of Object.entries(itemsData)) {
            const nameLower = name.toLowerCase();
            if (namePartsLower.every(part => nameLower.includes(part))) {
                return itemData;
            }
        }

        return null;
    }

    /**
     * Format speed value
     * @param {string|number} speedValue - Speed value
     * @returns {string} Formatted speed
     */
    static formatSpeed(speedValue) {
        const speed = parseInt(speedValue);

        if (speed >= 1_000_000_000) return '1 Gb/s';
        if (speed >= 100_000_000) return '100 Mb/s';
        if (speed >= 10_000_000) return '10 Mb/s';

        return `${speed} bps`;
    }

    /**
     * Format duplex value
     * @param {string|number} duplexValue - Duplex value
     * @returns {string} Formatted duplex
     */
    static formatDuplex(duplexValue) {
        const duplex = parseInt(duplexValue);

        switch (duplex) {
            case 3: return 'Full-Duplex';
            case 2: return 'Half-Duplex';
            default: return 'Unknown';
        }
    }

    /**
     * Process chart data for display
     * @param {Object} historyData - Historical data
     * @returns {Object} Processed chart data
     */
    static processChartData(historyData) {
        const chartData = {
            cpu: [],
            latency: []
        };

        // Process CPU data
        if (historyData.cpu) {
            chartData.cpu = historyData.cpu.map(point => ({
                x: new Date(point.clock * 1000),
                y: parseFloat(point.value)
            }));
        }

        // Process latency data (convert to milliseconds)
        if (historyData.latency) {
            chartData.latency = historyData.latency.map(point => ({
                x: new Date(point.clock * 1000),
                y: parseFloat(point.value) * 1000
            }));
        }

        return chartData;
    }
}

// ============================================
// ZABBIX COMMAND PROFILES
// ============================================

const ZABBIX_COMMAND_PROFILES = {
    cisco_router: [
        { name: 'Mostrar interfaces (brief)', command: 'show ip interface brief' },
        { name: 'Mostrar vizinhos CDP', command: 'show cdp neighbors' },
        { name: 'Mostrar config (running)', command: 'show running-config' },
        { name: 'Mostrar pools DHCP', command: 'show ip dhcp pool' },
        { name: 'Mostrar Uptime', command: 'show version | include uptime' },
        { name: 'Mostrar tabela ARP', command: 'show ip arp' }
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
        { name: 'Mostrar contadores de erros', command: 'show interfaces counters errors' }
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
        { name: 'Limpar todas as sessões', command: 'diagnose sys session clear' }
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
        { name: 'Mostrar vizinhos CDP', command: 'show cdp neighbors' }
    ]
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        ZabbixClient,
        ZabbixDataProcessor,
        ZABBIX_COMMAND_PROFILES
    };
}