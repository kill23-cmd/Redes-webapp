// ============================================
// MAIN APPLICATION - Application initialization and coordination
// ============================================

class NetworkMonitorApp {
    constructor() {
        this.isInitialized = false;
        this.components = {};
        // Atraso leve para garantir que outros scripts carregaram
        setTimeout(() => this.initializeApp(), 100);
    }

    async initializeApp() {
        try {
            console.log('Inicializando aplicação...');
            this.initializeComponents();
            this.initializeUI();
            this.startBackgroundServices();
            this.isInitialized = true;
            console.log('Network Monitor App initialized successfully');
        } catch (err) {
            console.error('Failed to initialize app:', err);
        }
    }

    initializeComponents() {
        this.components.utils = { debounce, formatUptime, formatBandwidth, storage, api };
        this.components.config = window.configManager;
        // Garante que pegamos a instância global criada no dashboard.js
        this.components.dashboard = window.dashboard;
        this.components.charts = window.dashboardCharts;
        this.components.settings = window.settingsUI;
    }

    initializeUI() {
        if (typeof lucide !== 'undefined') lucide.createIcons();
        // Setup responsivo e eventos globais
        window.addEventListener('resize', debounce(() => this.handleResize(), 300));
        this.setupEventListeners();
    }

    setupEventListeners() {
        // Sidebar Toggle
        const sidebarToggle = document.getElementById('sidebar-toggle');
        const appContainer = document.querySelector('.app-container');

        if (sidebarToggle && appContainer) {
            sidebarToggle.addEventListener('click', () => {
                appContainer.classList.toggle('sidebar-collapsed');
                // Resize charts if needed
                if (this.components.charts && this.components.charts.chartManager) {
                    setTimeout(() => {
                        Object.values(this.components.charts.chartManager.charts).forEach(chart => chart.resize());
                    }, 300);
                }
            });
        }

        // Settings Modal
        const settingsBtn = document.getElementById('settings-btn');
        const settingsModal = document.getElementById('settings-modal');
        const closeBtn = settingsModal?.querySelector('.modal-close');
        const cancelBtn = document.getElementById('cancel-settings');
        const saveBtn = document.getElementById('save-settings');

        if (settingsBtn && settingsModal) {
            settingsBtn.addEventListener('click', () => {
                this.loadSettingsToModal();
                settingsModal.style.display = 'flex';
            });

            const closeModal = () => { settingsModal.style.display = 'none'; };

            if (closeBtn) closeBtn.addEventListener('click', closeModal);
            if (cancelBtn) cancelBtn.addEventListener('click', closeModal);

            if (saveBtn) {
                saveBtn.addEventListener('click', async () => {
                    await this.saveSettingsFromModal();
                    closeModal();
                });
            }

            // Close on click outside
            settingsModal.addEventListener('click', (e) => {
                if (e.target === settingsModal) closeModal();
            });
        }
    }

    loadSettingsToModal() {
        const config = configManager.config;
        if (!config) return;

        const setVal = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.value = val || '';
        };

        setVal('zabbix-url', config.zabbix?.url);
        setVal('zabbix-user', config.zabbix?.user);
        setVal('zabbix-pass', config.zabbix?.password);
        setVal('ssh-user', config.ssh?.user);
        setVal('ssh-pass', config.ssh?.password);
    }

    async saveSettingsFromModal() {
        const getVal = (id) => {
            const el = document.getElementById(id);
            return el ? el.value : '';
        };

        const newConfig = {
            zabbix: {
                url: getVal('zabbix-url'),
                user: getVal('zabbix-user'),
                password: getVal('zabbix-pass')
            },
            ssh: {
                user: getVal('ssh-user'),
                password: getVal('ssh-pass')
            }
        };

        // Merge with existing config to keep other settings
        const mergedConfig = { ...configManager.config, ...newConfig };

        // Update config manager
        configManager.config = mergedConfig;

        // Save to backend
        try {
            await api.post('/api/config', mergedConfig);
            alert('Configurações salvas com sucesso!');
            // Reload to apply changes
            location.reload();
        } catch (err) {
            console.error('Erro ao salvar configurações:', err);
            alert('Erro ao salvar configurações. Verifique o console.');
        }
    }

    startBackgroundServices() {
        const autoRefresh = configManager.get('ui.autoRefresh');
        if (autoRefresh) this.startAutoRefresh();
        // Health check a cada 60s
        setInterval(() => this.performHealthCheck(), 60000);
    }

    startAutoRefresh() {
        const interval = (configManager.get('dashboard.refreshInterval') || 30) * 1000;
        this.refreshInterval = setInterval(() => this.performAutoRefresh(), interval);
    }

    async performAutoRefresh() {
        if (document.hidden) return;

        // CORREÇÃO: Verifica se o componente dashboard existe e tem o método
        // Às vezes o window.dashboard demora ms a mais para ser atribuído
        if (!this.components.dashboard) {
            this.components.dashboard = window.dashboard; // Tenta pegar de novo
        }

        if (this.components.dashboard && typeof this.components.dashboard.loadDashboardData === 'function') {
            if (this.components.dashboard.currentSelectedHost) {
                try {
                    await this.components.dashboard.loadDashboardData(this.components.dashboard.currentSelectedHost);
                } catch (err) {
                    console.error('Auto-refresh failed:', err);
                }
            }
        }
    }

    performHealthCheck() {
        // Simplificado para evitar erros
        const checks = { network: navigator.onLine };
        this.checkZabbixConnection().then(res => {
            console.log('Health Check Zabbix:', res);
        });
    }

    async checkZabbixConnection() {
        if (!this.components.dashboard || !this.components.dashboard.zabbixClient) return { status: 'not-configured' };
        return await this.components.dashboard.zabbixClient.testConnection();
    }

    handleResize() {
        if (this.components.charts && this.components.charts.handleResize) {
            this.components.charts.handleResize();
        }
        const isMobile = window.innerWidth < 768;
        document.body.classList.toggle('mobile-view', isMobile);
    }
}

// Inicialização segura
document.addEventListener('DOMContentLoaded', () => {
    // Só inicia a App depois que o Dashboard (que também roda no DOMContentLoaded) tiver chance de iniciar
    setTimeout(() => {
        window.app = new NetworkMonitorApp();
    }, 500);
});