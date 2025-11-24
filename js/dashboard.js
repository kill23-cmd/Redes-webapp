// ============================================
// DASHBOARD - Main dashboard management and UI control
// ============================================

class NetworkDashboard {
    constructor() {
        this.zabbixClient = null;
        this.currentStore = null;
        this.currentHosts = [];
        this.currentSelectedHost = null;
        this.deviceType = 'default';
        this.refreshInterval = null;
        this.storesData = [];

        this.initializeEventListeners();
        this.loadStoresData();
        this.initializeDashboard();
    }

    /**
     * Initialize event listeners
     */
    initializeEventListeners() {
        // Search functionality
        const storeSearch = document.getElementById('store-search');
        const circuitSearch = document.getElementById('circuit-search');

        if (storeSearch) {
            storeSearch.addEventListener('input', debounce(() => {
                this.performSearch();
            }, 300));
        }

        if (circuitSearch) {
            circuitSearch.addEventListener('input', debounce(() => {
                this.performSearch();
            }, 300));
        }

        // Clear search
        const clearSearchBtn = document.getElementById('clear-search');
        if (clearSearchBtn) {
            clearSearchBtn.addEventListener('click', () => {
                this.clearSearch();
            });
        }

        // Store selection
        const storeSelect = document.getElementById('store-select');
        if (storeSelect) {
            storeSelect.addEventListener('change', (e) => {
                this.onStoreSelect(e.target.value);
            });
        }

        // Command buttons
        const runCommandsBtn = document.getElementById('run-commands');
        const advancedConfigBtn = document.getElementById('advanced-config');
        const selectAllBtn = document.getElementById('select-all');
        const deselectAllBtn = document.getElementById('deselect-all');

        if (runCommandsBtn) {
            runCommandsBtn.addEventListener('click', () => {
                this.runSelectedCommands();
            });
        }

        if (advancedConfigBtn) {
            advancedConfigBtn.addEventListener('click', () => {
                this.openAdvancedConfig();
            });
        }

        if (selectAllBtn) {
            selectAllBtn.addEventListener('click', () => {
                this.selectAllCommands();
            });
        }

        if (deselectAllBtn) {
            deselectAllBtn.addEventListener('click', () => {
                this.deselectAllCommands();
            });
        }

        // Action buttons
        const puttyBtn = document.getElementById('connect-putty');
        const webAccessBtn = document.getElementById('web-access');

        if (puttyBtn) {
            puttyBtn.addEventListener('click', () => {
                this.connectPuTTY();
            });
        }

        if (webAccessBtn) {
            webAccessBtn.addEventListener('click', () => {
                this.openWebAccess();
            });
        }
    }

    /**
     * Initialize dashboard
     */
    initializeDashboard() {
        this.showLoading('Inicializando dashboard...');

        // Check if Zabbix is configured
        const configSummary = configManager.getSummary();
        if (!configSummary.zabbixConfigured) {
            this.showNotification('Configure o Zabbix nas opções para continuar', 'warning');
            return;
        }

        // Initialize Zabbix client
        this.initializeZabbixClient();

        this.hideLoading();
    }

    /**
     * Initialize Zabbix client
     */
    async initializeZabbixClient() {
        try {
            const config = configManager.config;

            // Try to connect to Zabbix if configured
            if (config.zabbix.url && config.zabbix.user) {
                this.zabbixClient = new ZabbixClient(
                    config.zabbix.url,
                    config.zabbix.user,
                    config.zabbix.password
                );

                try {
                    await this.zabbixClient.authenticate();
                    showNotification('Conectado ao Zabbix com sucesso!', 'success');
                } catch (authErr) {
                    console.warn('Zabbix authentication failed:', authErr);
                    showNotification('Zabbix offline/não configurado. Usando dados locais.', 'warning');
                }
            }

            // Always load stores from Excel API
            await this.loadStoresData();

        } catch (err) {
            console.error('Failed to initialize:', err);
            showNotification(`Erro na inicialização: ${err.message}`, 'error');
        }
    }

    /**
     * Load stores data from local file
     */
    /**
     * Load stores data from API (Excel)
     */
    async loadStoresData() {
        try {
            this.showLoading('Carregando dados das lojas...');

            const response = await fetch('/api/stores/search?limit=1000');
            if (!response.ok) throw new Error('Falha na resposta da API');

            const data = await response.json();
            this.storesData = data.stores || [];

            console.log(`Carregadas ${this.storesData.length} lojas do Excel`);

            // Populate store select with these stores
            this.populateStoreSelect(this.storesData);

            this.hideLoading();

        } catch (err) {
            console.error('Failed to load stores data:', err);
            this.hideLoading();
            showNotification('Erro ao carregar dados das lojas (Excel)', 'error');
        }
    }

    /**
     * Load stores/host groups from Zabbix
     */
    async loadStores() {
        try {
            const hostgroups = await this.zabbixClient.getHostGroups();
            this.populateStoreSelect(hostgroups);
        } catch (err) {
            console.error('Failed to load stores:', err);
            showNotification('Erro ao carregar lojas do Zabbix', 'error');
        }
    }

    /**
     * Populate store select dropdown
     * @param {Array} hostgroups - Host groups from Zabbix
     */
    /**
     * Populate store select dropdown
     * @param {Array} stores - Stores from API
     */
    populateStoreSelect(stores) {
        const storeSelect = document.getElementById('store-select');
        if (!storeSelect) return;

        // Clear existing options
        storeSelect.innerHTML = '<option value="">-- Selecione uma loja --</option>';

        // Sort stores by ID
        stores.sort((a, b) => a.id.localeCompare(b.id));

        // Add options
        stores.forEach(store => {
            const option = document.createElement('option');
            option.value = store.id;
            option.textContent = `${store.id} - ${store.nome || 'Loja ' + store.id}`;
            storeSelect.appendChild(option);
        });
    }

    /**
     * Perform search across stores
     */
    /**
     * Perform search across stores
     */
    performSearch() {
        const storeQuery = document.getElementById('store-search').value.toLowerCase();
        const circuitQuery = document.getElementById('circuit-search').value.toLowerCase();

        const storeSelect = document.getElementById('store-select');
        if (!storeSelect) return;

        // Get all options except the first one
        const options = Array.from(storeSelect.querySelectorAll('option')).slice(1);

        // Filter options
        options.forEach(option => {
            const storeId = option.value;
            const storeText = option.textContent.toLowerCase();

            // Find store data
            const storeData = this.storesData.find(s => s.id === storeId);

            let circuitMatch = true;
            if (circuitQuery && storeData) {
                const wan1 = (storeData.circuito_wan1 || '').toLowerCase();
                const wan2 = (storeData.circuito_wan2 || '').toLowerCase();
                circuitMatch = wan1.includes(circuitQuery) || wan2.includes(circuitQuery);
            }

            const storeMatch = !storeQuery || storeText.includes(storeQuery);

            option.style.display = (storeMatch && circuitMatch) ? 'block' : 'none';
        });
    }

    /**
     * Clear search filters
     */
    clearSearch() {
        document.getElementById('store-search').value = '';
        document.getElementById('circuit-search').value = '';

        // Show all options
        const options = document.querySelectorAll('#store-select option');
        options.forEach(option => {
            option.style.display = 'block';
        });

        this.showNotification('Filtros de busca limpos', 'info');
    }

    /**
     * Handle store selection
     * @param {string} groupId - Selected group ID
     */
    /**
     * Handle store selection
     * @param {string} storeId - Selected store ID
     */
    async onStoreSelect(storeId) {
        if (!storeId) return;

        this.showLoading('Carregando hosts...');

        try {
            // 1. Update Link Info (from Excel data)
            this.updateLinkInfo(storeId);

            // 2. Load Hosts (from Zabbix or Simulated)
            let hosts = [];

            if (this.zabbixClient && this.zabbixClient.isAuthenticated) {
                // Try to find host group with store ID
                try {
                    const groups = await this.zabbixClient.getHostGroups();
                    const group = groups.find(g => g.name.includes(storeId));
                    if (group) {
                        hosts = await this.zabbixClient.getHostsByGroupId(group.groupid);
                    }
                } catch (zabbixErr) {
                    console.warn('Error fetching Zabbix hosts:', zabbixErr);
                }
            }

            // Fallback: Use simulated host if no Zabbix hosts found
            if (hosts.length === 0) {
                console.log('Using simulated host for store', storeId);
                hosts = [{
                    hostid: `sim-${storeId}`,
                    host: `FortiGate-${storeId}`,
                    name: `Firewall Loja ${storeId}`,
                    status: '0',
                    inventory: { os: 'FortiOS', hardware: 'FortiGate' }
                }];
            }

            this.currentHosts = hosts;
            this.populateHostsList(hosts);

            // Auto-select first host
            if (hosts.length > 0) {
                this.onHostSelect(hosts[0]);
            }

            this.hideLoading();

        } catch (err) {
            console.error('Failed to load store details:', err);
            this.hideLoading();
            showNotification('Erro ao carregar detalhes da loja', 'error');
        }
    }

    /**
     * Get store name from group ID
     * @param {string} groupId - Group ID
     * @returns {string} Store name
     */
    getStoreNameFromGroupId(groupId) {
        const storeSelect = document.getElementById('store-select');
        const selectedOption = storeSelect.querySelector(`option[value="${groupId}"]`);
        return selectedOption ? selectedOption.textContent : '';
    }

    /**
     * Populate hosts list
     * @param {Array} hosts - Array of hosts
     */
    populateHostsList(hosts) {
        const hostsList = document.getElementById('hosts-list');
        if (!hostsList) return;

        hostsList.innerHTML = '';

        hosts.forEach(host => {
            const hostItem = document.createElement('div');
            hostItem.className = 'host-item';
            hostItem.textContent = `${host.name} - ${host.host}`;
            hostItem.dataset.hostId = host.hostid;

            hostItem.addEventListener('click', () => {
                this.onHostSelect(host);
            });

            hostsList.appendChild(hostItem);
        });
    }

    /**
     * Handle host selection
     * @param {Object} host - Selected host object
     */
    async onHostSelect(host) {
        // Update UI selection
        document.querySelectorAll('.host-item').forEach(item => {
            item.classList.remove('selected');
        });

        const hostElement = document.querySelector(`[data-host-id="${host.hostid}"]`);
        if (hostElement) {
            hostElement.classList.add('selected');
        }

        this.currentSelectedHost = host;

        // Determine device type
        this.deviceType = this.determineDeviceType(host);

        // Load commands for device type
        this.loadCommandsForDevice();

        // Load dashboard data
        this.loadDashboardData(host);
    }

    /**
     * Determine device type based on host data
     * @param {Object} host - Host object
     * @returns {string} Device type
     */
    determineDeviceType(host) {
        const inventory = host.inventory || {};
        const os = inventory.os || '';
        const hardware = inventory.hardware || '';
        const hostname = host.name || '';

        const osLower = os.toLowerCase();
        const hardwareLower = hardware.toLowerCase();
        const hostnameLower = hostname.toLowerCase();

        if (osLower.includes('fortiswitch')) return 'fortiswitch';
        if (osLower.includes('fortios')) return 'fortinet_firewall';
        if (osLower.includes('cisco') && (hardwareLower.includes('router') || hardwareLower.includes('isr'))) return 'cisco_router';
        if (osLower.includes('cisco') && hardwareLower.includes('switch')) return 'cisco_switch';
        if (osLower.includes('huawei')) return 'huawei_switch';

        if (hostnameLower.includes('ap')) return 'access_point';
        if (hostnameLower.includes('rt')) return 'cisco_router';
        if (hostnameLower.includes('fw')) return 'fortinet_firewall';
        if (hostnameLower.includes('fsw') || (hostnameLower.includes('forti') && hostnameLower.includes('sw'))) return 'fortiswitch';
        if (hostnameLower.includes('sw')) return 'cisco_switch';

        return 'default';
    }

    /**
     * Load commands for device type
     */
    loadCommandsForDevice() {
        const commandsList = document.getElementById('commands-list');
        if (!commandsList) return;

        commandsList.innerHTML = '';

        const commands = ZABBIX_COMMAND_PROFILES[this.deviceType] || [];

        commands.forEach(cmd => {
            const commandItem = document.createElement('div');
            commandItem.className = 'command-item';

            commandItem.innerHTML = `
                <input type="checkbox" class="command-checkbox" id="cmd-${cmd.command.replace(/\s+/g, '-')}">
                <label class="command-label" for="cmd-${cmd.command.replace(/\s+/g, '-')}">${cmd.name}</label>
            `;

            commandsList.appendChild(commandItem);
        });
    }

    /**
     * Load dashboard data for selected host
     * @param {Object} host - Selected host
     */
    async loadDashboardData(host) {
        this.showLoading('Carregando dados do dashboard...');

        try {
            // Get items by name patterns
            const searchNames = [
                'CPU utilization',
                'ICMP response time',
                'ICMP packet loss',
                'Device uptime',
                'Uptime',
                'Number of interfaces in operational state down',
                'wan1',
                'wan2'
            ];

            const itemsData = await this.zabbixClient.getItemsByNamePattern(host.hostid, searchNames.join(','));
            const problems = await this.zabbixClient.getHostProblems(host.hostid);

            // Process and display data
            const dashboardData = ZabbixDataProcessor.processDashboardData(
                itemsData,
                problems,
                this.deviceType
            );

            this.updateDashboardUI(dashboardData);

            this.hideLoading();

        } catch (err) {
            console.error('Failed to load dashboard data:', err);
            this.hideLoading();
            showNotification('Erro ao carregar dados do dashboard', 'error');
        }
    }

    /**
     * Update dashboard UI with processed data
     * @param {Object} data - Processed dashboard data
     */
    updateDashboardUI(data) {
        // Update basic metrics
        this.updateElement('uptime', data.uptime);
        this.updateElement('cpu', data.cpu);
        this.updateElement('latency', data.latency);
        this.updateElement('loss', data.loss);

        // Update dynamic sections based on device type
        if (this.deviceType === 'fortinet_firewall') {
            this.updateFirewallUI(data.dynamic);
        } else if (this.deviceType.includes('switch') || this.deviceType.includes('router')) {
            this.updateSwitchRouterUI(data.dynamic);
        }

        // Update gauges
        this.updateGauges(data);
    }

    /**
     * Update firewall-specific UI elements
     * @param {Object} data - Firewall data
     */
    updateFirewallUI(data) {
        this.updateElement('wan1-status', data.wan1Status || '--', data.wan1Status === 'UP' ? 'success' : 'error');
        this.updateElement('wan2-status', data.wan2Status || '--', data.wan2Status === 'UP' ? 'success' : 'error');

        // Update dynamic status items
        this.updateDynamicStatusItems([
            { label: 'WAN1 Status:', value: data.wan1Status },
            { label: 'WAN1 Speed:', value: data.wan1Speed },
            { label: 'WAN2 Status:', value: data.wan2Status },
            { label: 'WAN2 Speed:', value: data.wan2Speed }
        ]);
    }

    /**
     * Update switch/router-specific UI elements
     * @param {Object} data - Switch/router data
     */
    updateSwitchRouterUI(data) {
        // Update interface down count
        const interfacesDownElement = this.updateDynamicStatusItems([
            { label: 'Interfaces Down:', value: data.interfacesDown.toString() }
        ]);

        if (interfacesDownElement && data.interfacesDown > 0) {
            interfacesDownElement.classList.add('text-error');
        }
    }

    /**
     * Update dynamic status items
     * @param {Array} items - Array of status items
     * @returns {HTMLElement|null} Last updated element
     */
    updateDynamicStatusItems(items) {
        let lastElement = null;

        items.forEach((item, index) => {
            const element = document.getElementById(`dynamic-status-${index + 1}`);
            if (element) {
                const label = element.querySelector('label');
                const value = element.querySelector('span');

                if (label) label.textContent = item.label;
                if (value) {
                    value.textContent = item.value;
                    lastElement = value;
                }

                element.style.display = 'flex';
            }
        });

        return lastElement;
    }

    /**
     * Update UI gauges
     * @param {Object} data - Dashboard data
     */
    updateGauges(data) {
        // Update CPU gauge
        if (data.cpu && data.cpu !== '--') {
            const cpuValue = parseFloat(data.cpu.replace('%', ''));
            this.updateGauge('cpu-gauge', cpuValue);
        }

        // Update Memory gauge (mock data for now)
        const memoryValue = 55; // This would come from actual data
        this.updateGauge('memory-gauge', memoryValue);
    }

    /**
     * Update circular gauge
     * @param {string} canvasId - Canvas element ID
     * @param {number} percentage - Percentage value (0-100)
     */
    updateGauge(canvasId, percentage) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        const radius = 50;
        const lineWidth = 8;

        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Draw background circle
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
        ctx.strokeStyle = 'var(--neutral-800)';
        ctx.lineWidth = lineWidth;
        ctx.stroke();

        // Draw progress circle
        const startAngle = -Math.PI / 2;
        const endAngle = startAngle + (percentage / 100) * 2 * Math.PI;

        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, startAngle, endAngle);
        ctx.strokeStyle = 'var(--primary-300)';
        ctx.lineWidth = lineWidth;
        ctx.lineCap = 'round';
        ctx.stroke();

        // Update text
        const valueElement = document.getElementById(canvasId.replace('-gauge', '-value'));
        if (valueElement) {
            valueElement.textContent = `${percentage.toFixed(1)}%`;
        }
    }

    /**
     * Update link information panel
     * @param {string} storeName - Store name
     */
    /**
     * Update link information panel
     * @param {string} storeId - Store ID
     */
    updateLinkInfo(storeId) {
        const storeData = this.storesData.find(store => store.id === storeId);

        if (!storeData) {
            // Clear all info if store not found
            ['wan1-op', 'wan1-circ', 'wan1-banda', 'wan2-op', 'wan2-circ', 'wan2-banda'].forEach(id => {
                this.updateElement(id, '--');
            });
            return;
        }

        // Update link information (using API field names)
        this.updateElement('wan1-op', storeData.operador_wan1 || 'N/A');
        this.updateElement('wan1-circ', storeData.circuito_wan1 || 'N/A');
        this.updateElement('wan1-banda', storeData.banda_wan1 || 'N/A');
        this.updateElement('wan2-op', storeData.operador_wan2 || 'N/A');
        this.updateElement('wan2-circ', storeData.circuito_wan2 || 'N/A');
        this.updateElement('wan2-banda', storeData.banda_wan2 || 'N/A');
    }

    /**
     * Update DOM element with value and optional class
     * @param {string} elementId - Element ID
     * @param {string} value - Value to set
     * @param {string} className - Optional class name
     */
    updateElement(elementId, value, className = '') {
        const element = document.getElementById(elementId);
        if (element) {
            element.textContent = value;
            element.className = className ? `metric-value ${className}` : 'metric-value';
        }
    }

    /**
     * Show loading overlay
     * @param {string} message - Loading message
     */
    showLoading(message = 'Carregando...') {
        const overlay = document.getElementById('loading-overlay');
        const text = overlay?.querySelector('.loading-text');

        if (text) text.textContent = message;
        if (overlay) overlay.classList.add('show');
    }

    /**
     * Hide loading overlay
     */
    hideLoading() {
        const overlay = document.getElementById('loading-overlay');
        if (overlay) overlay.classList.remove('show');
    }

    /**
     * Show notification
     * @param {string} message - Notification message
     * @param {string} type - Notification type
     */
    showNotification(message, type) {
        showNotification(message, type);
    }

    // Command execution methods
    selectAllCommands() {
        document.querySelectorAll('.command-checkbox').forEach(cb => {
            cb.checked = true;
        });
    }

    deselectAllCommands() {
        document.querySelectorAll('.command-checkbox').forEach(cb => {
            cb.checked = false;
        });
    }

    runSelectedCommands() {
        const selectedCommands = [];
        document.querySelectorAll('.command-checkbox:checked').forEach(cb => {
            const label = cb.nextElementSibling.textContent;
            selectedCommands.push(label);
        });

        if (selectedCommands.length === 0) {
            this.showNotification('Selecione pelo menos um comando', 'warning');
            return;
        }

        // In a real implementation, this would execute SSH commands
        this.showNotification(`Executando ${selectedCommands.length} comando(s)...`, 'info');
    }

    openAdvancedConfig() {
        this.showNotification('Configuração avançada em desenvolvimento', 'info');
    }

    connectPuTTY() {
        if (!this.currentSelectedHost) {
            this.showNotification('Selecione um host primeiro', 'warning');
            return;
        }

        // In a real implementation, this would launch PuTTY
        this.showNotification('Conectando via PuTTY...', 'info');
    }

    openWebAccess() {
        if (!this.currentSelectedHost) {
            this.showNotification('Selecione um host primeiro', 'warning');
            return;
        }

        // Open web interface
        window.open(`https://${this.currentSelectedHost.host}`, '_blank');
    }
}

// Initialize dashboard when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.dashboard = new NetworkDashboard();
});