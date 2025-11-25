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