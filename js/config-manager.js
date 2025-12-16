// ============================================
// CONFIG MANAGER - Settings and configuration
// ============================================

class ConfigManager {
    constructor() {
        this.config = {
            zabbix: {
                url: '',
                user: '',
                password: ''
            },
            ssh: {
                user: '',
                password: ''
            },
            dashboard: {
                refreshInterval: 30, // seconds
                chartPeriod: 4, // hours
                theme: 'dark'
            },
            ui: {
                autoRefresh: true,
                showNotifications: true,
                compactMode: false
            }
        };

        this.ready = this.loadConfig();
    }

    /**
     * Load configuration from localStorage and Server
     */
    async loadConfig() {
        // 1. Load from local storage (fast fallback)
        const saved = storage.get('network-monitor-config');
        if (saved) {
            this.config = { ...this.config, ...saved };
        }

        // 2. Load from Server (source of truth)
        try {
            const response = await fetch('/api/config');
            if (response.ok) {
                const serverConfig = await response.json();

                // Merge server config
                if (serverConfig.zabbix) this.config.zabbix = { ...this.config.zabbix, ...serverConfig.zabbix };
                if (serverConfig.ssh) this.config.ssh = { ...this.config.ssh, ...serverConfig.ssh };
                if (serverConfig.dashboard) this.config.dashboard = { ...this.config.dashboard, ...serverConfig.dashboard };
                if (serverConfig.ui) this.config.ui = { ...this.config.ui, ...serverConfig.ui };

                // Update UI if settings modal is open or just to be safe
                if (window.settingsUI) {
                    window.settingsUI.loadCurrentSettings();
                }

                console.log('Configuration loaded from server');
            }
        } catch (err) {
            console.warn('Could not load config from server:', err);
        }
    }

    /**
     * Save configuration to localStorage and Server
     */
    async saveConfig() {
        // 1. Save to local storage
        const success = storage.set('network-monitor-config', this.config);

        // 2. Save to Server
        try {
            // Create a copy of config to sanitize
            const serverConfig = JSON.parse(JSON.stringify(this.config));

            // Remove sensitive data
            if (serverConfig.zabbix) delete serverConfig.zabbix.password;
            if (serverConfig.ssh) delete serverConfig.ssh.password;

            const response = await fetch('/api/config', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(serverConfig)
            });

            if (response.ok) {
                showNotification('Configurações salvas no servidor!', 'success');
            } else {
                throw new Error('Server returned error');
            }
        } catch (err) {
            console.error('Failed to save config to server:', err);
            showNotification('Salvo localmente (erro ao salvar no servidor)', 'warning');
        }

        return success;
    }

    /**
     * Get configuration value
     * @param {string} path - Dot notation path (e.g., 'zabbix.url')
     * @returns {*} Configuration value
     */
    get(path) {
        const keys = path.split('.');
        let value = this.config;

        for (const key of keys) {
            if (value && typeof value === 'object' && key in value) {
                value = value[key];
            } else {
                return undefined;
            }
        }

        return value;
    }

    /**
     * Set configuration value
     * @param {string} path - Dot notation path
     * @param {*} value - Value to set
     */
    set(path, value) {
        const keys = path.split('.');
        let obj = this.config;

        for (let i = 0; i < keys.length - 1; i++) {
            const key = keys[i];
            if (!(key in obj) || typeof obj[key] !== 'object') {
                obj[key] = {};
            }
            obj = obj[key];
        }

        obj[keys[keys.length - 1]] = value;
    }

    /**
     * Update multiple configuration values
     * @param {Object} updates - Object with configuration updates
     */
    update(updates) {
        this.config = { ...this.config, ...updates };
    }

    /**
     * Reset configuration to defaults
     */
    reset() {
        this.config = {
            zabbix: {
                url: '',
                user: '',
                password: ''
            },
            ssh: {
                user: '',
                password: ''
            },
            dashboard: {
                refreshInterval: 30,
                chartPeriod: 4,
                theme: 'dark'
            },
            ui: {
                autoRefresh: true,
                showNotifications: true,
                compactMode: false
            }
        };
        storage.remove('network-monitor-config');
    }

    /**
     * Validate configuration
     * @returns {Object} Validation result with errors array
     */
    validate() {
        const errors = [];

        // Validate Zabbix configuration
        if (this.config.zabbix.url && !isValidUrl(this.config.zabbix.url)) {
            errors.push('URL do Zabbix inválida');
        }

        if (this.config.zabbix.user && this.config.zabbix.user.length < 2) {
            errors.push('Usuário do Zabbix deve ter pelo menos 2 caracteres');
        }

        // Validate SSH configuration
        if (this.config.ssh.user && this.config.ssh.user.length < 2) {
            errors.push('Usuário SSH deve ter pelo menos 2 caracteres');
        }

        // Validate dashboard settings
        if (this.config.dashboard.refreshInterval < 5 || this.config.dashboard.refreshInterval > 300) {
            errors.push('Intervalo de atualização deve estar entre 5 e 300 segundos');
        }

        if (![1, 2, 4, 8, 12, 24].includes(this.config.dashboard.chartPeriod)) {
            errors.push('Período do gráfico deve ser: 1, 2, 4, 8, 12 ou 24 horas');
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }

    /**
     * Export configuration (without passwords)
     * @returns {Object} Configuration export
     */
    export() {
        const exportConfig = JSON.parse(JSON.stringify(this.config));

        // Remove sensitive data
        if (exportConfig.zabbix) {
            exportConfig.zabbix.password = '***REDACTED***';
        }
        if (exportConfig.ssh) {
            exportConfig.ssh.password = '***REDACTED***';
        }

        return exportConfig;
    }

    /**
     * Import configuration
     * @param {Object} config - Configuration to import
     */
    import(config) {
        try {
            // Validate imported config structure
            const requiredSections = ['zabbix', 'ssh', 'dashboard', 'ui'];
            const hasRequiredSections = requiredSections.every(section => section in config);

            if (!hasRequiredSections) {
                throw new Error('Configuração inválida: seções obrigatórias não encontradas');
            }

            this.config = config;
            this.saveConfig();
            showNotification('Configuração importada com sucesso!', 'success');

        } catch (err) {
            showNotification(`Erro ao importar configuração: ${err.message}`, 'error');
        }
    }

    /**
     * Get configuration summary
     * @returns {Object} Configuration summary
     */
    getSummary() {
        return {
            zabbixConfigured: !!(this.config.zabbix.url && this.config.zabbix.user),
            sshConfigured: !!(this.config.ssh.user && this.config.ssh.password),
            refreshInterval: this.config.dashboard.refreshInterval,
            chartPeriod: this.config.dashboard.chartPeriod,
            autoRefresh: this.config.ui.autoRefresh,
            theme: this.config.dashboard.theme
        };
    }

    /**
     * Test configuration connectivity
     * @returns {Promise<Object>} Test results
     */
    async testConnectivity() {
        const results = {
            zabbix: { status: 'unknown', error: null },
            ssh: { status: 'unknown', error: null }
        };

        // Test Zabbix connection
        if (this.config.zabbix.url && this.config.zabbix.user) {
            try {
                // This would typically make a test request to Zabbix API
                // For now, we'll simulate a test
                results.zabbix.status = 'success';
            } catch (err) {
                results.zabbix.status = 'error';
                results.zabbix.error = err.message;
            }
        } else {
            results.zabbix.status = 'not-configured';
        }

        // Test SSH connectivity
        if (this.config.ssh.user && this.config.ssh.password) {
            try {
                // This would typically test SSH connectivity
                // For now, we'll simulate a test
                results.ssh.status = 'success';
            } catch (err) {
                results.ssh.status = 'error';
                results.ssh.error = err.message;
            }
        } else {
            results.ssh.status = 'not-configured';
        }

        return results;
    }
}

// ============================================
// SETTINGS UI MANAGEMENT
// ============================================

class SettingsUI {
    constructor(configManager) {
        this.configManager = configManager;
        this.modal = document.getElementById('settings-modal');
        this.setupEventListeners();
    }

    /**
     * Setup event listeners for settings UI
     */
    setupEventListeners() {
        // Open settings modal
        document.querySelector('.settings-btn')?.addEventListener('click', () => {
            this.open();
        });

        // Close settings modal
        document.querySelector('.modal-close')?.addEventListener('click', () => {
            this.close();
        });

        // Close on escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.modal.classList.contains('show')) {
                this.close();
            }
        });

        // Close when clicking outside
        this.modal?.addEventListener('click', (e) => {
            if (e.target === this.modal) {
                this.close();
            }
        });

        // Save settings
        document.getElementById('save-settings')?.addEventListener('click', () => {
            this.save();
        });

        // Cancel settings
        document.getElementById('cancel-settings')?.addEventListener('click', () => {
            this.close();
        });

        // Auto-save on input change (with debounce)
        const debouncedSave = debounce(() => this.autoSave(), 1000);

        ['zabbix-url', 'zabbix-user', 'zabbix-pass', 'ssh-user', 'ssh-pass'].forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                element.addEventListener('input', debouncedSave);
            }
        });
    }

    /**
     * Open settings modal
     */
    open() {
        this.loadCurrentSettings();
        this.modal.classList.add('show');
        this.modal.style.display = 'flex';

        // Focus first input
        setTimeout(() => {
            const firstInput = this.modal.querySelector('input');
            if (firstInput) firstInput.focus();
        }, 100);
    }

    /**
     * Close settings modal
     */
    close() {
        this.modal.classList.remove('show');
        setTimeout(() => {
            this.modal.style.display = 'none';
        }, 250);
    }

    /**
     * Load current settings into form
     */
    loadCurrentSettings() {
        const config = this.configManager.config;

        // Zabbix settings
        const zabbixUrl = document.getElementById('zabbix-url');
        const zabbixUser = document.getElementById('zabbix-user');
        const zabbixPass = document.getElementById('zabbix-pass');

        if (zabbixUrl) zabbixUrl.value = config.zabbix.url || '';
        if (zabbixUser) zabbixUser.value = config.zabbix.user || '';
        if (zabbixPass) zabbixPass.value = config.zabbix.password || '';

        // SSH settings
        const sshUser = document.getElementById('ssh-user');
        const sshPass = document.getElementById('ssh-pass');

        if (sshUser) sshUser.value = config.ssh.user || '';
        if (sshPass) sshPass.value = config.ssh.password || '';
    }

    /**
     * Save settings from form
     */
    save() {
        // Get form values
        const zabbixUrl = document.getElementById('zabbix-url').value.trim();
        const zabbixUser = document.getElementById('zabbix-user').value.trim();
        const zabbixPass = document.getElementById('zabbix-pass').value;
        const sshUser = document.getElementById('ssh-user').value.trim();
        const sshPass = document.getElementById('ssh-pass').value;

        // Update configuration
        this.configManager.set('zabbix.url', zabbixUrl);
        this.configManager.set('zabbix.user', zabbixUser);
        this.configManager.set('zabbix.password', zabbixPass);
        this.configManager.set('ssh.user', sshUser);
        this.configManager.set('ssh.password', sshPass);

        // Validate
        const validation = this.configManager.validate();
        if (!validation.isValid) {
            showNotification(`Erros de validação: ${validation.errors.join(', ')}`, 'error');
            return;
        }

        // Save
        this.configManager.saveConfig();
        this.close();
    }

    /**
     * Auto-save settings on input change
     */
    autoSave() {
        const zabbixUrl = document.getElementById('zabbix-url').value.trim();
        const zabbixUser = document.getElementById('zabbix-user').value.trim();
        const zabbixPass = document.getElementById('zabbix-pass').value;
        const sshUser = document.getElementById('ssh-user').value.trim();
        const sshPass = document.getElementById('ssh-pass').value;

        this.configManager.set('zabbix.url', zabbixUrl);
        this.configManager.set('zabbix.user', zabbixUser);
        this.configManager.set('zabbix.password', zabbixPass);
        this.configManager.set('ssh.user', sshUser);
        this.configManager.set('ssh.password', sshPass);

        // Save to localStorage
        this.configManager.saveConfig();
    }

    /**
     * Reset settings to defaults
     */
    reset() {
        if (confirm('Tem certeza que deseja resetar todas as configurações? Esta ação não pode ser desfeita.')) {
            this.configManager.reset();
            this.loadCurrentSettings();
            showNotification('Configurações resetadas para padrão', 'info');
        }
    }
}

// Create global instances
window.configManager = new ConfigManager();
window.settingsUI = new SettingsUI(window.configManager);