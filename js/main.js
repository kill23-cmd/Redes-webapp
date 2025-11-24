// ============================================
// MAIN APPLICATION - Application initialization and coordination
// ============================================

class NetworkMonitorApp {
    constructor() {
        this.isInitialized = false;
        this.components = {};
        this.initializeApp();
    }
    
    /**
     * Initialize the application
     */
    async initializeApp() {
        try {
            this.showLoading('Inicializando aplicação...');
            
            // Initialize components in order
            await this.initializeComponents();
            
            // Setup global event listeners
            this.setupGlobalEventListeners();
            
            // Initialize UI
            this.initializeUI();
            
            // Start application
            await this.startApplication();
            
            this.isInitialized = true;
            this.hideLoading();
            
            console.log('Network Monitor App initialized successfully');
            
        } catch (err) {
            console.error('Failed to initialize app:', err);
            this.hideLoading();
            showNotification(`Erro ao inicializar aplicação: ${err.message}`, 'error');
        }
    }
    
    /**
     * Initialize all application components
     */
    async initializeComponents() {
        // Component initialization order matters for dependencies
        
        // 1. Utilities (already loaded via script includes)
        this.components.utils = {
            debounce,
            formatUptime,
            formatBandwidth,
            formatTimestamp,
            storage,
            api
        };
        
        // 2. Configuration Manager
        this.components.config = window.configManager;
        
        // 3. Zabbix Client (depends on config)
        // This will be initialized when needed by dashboard
        
        // 4. Dashboard (main UI component)
        this.components.dashboard = window.dashboard;
        
        // 5. Charts
        this.components.charts = window.dashboardCharts;
        
        // 6. SSH Commands
        this.components.sshCommands = window.sshCommandManager;
        
        // 7. Settings UI (depends on config)
        this.components.settings = window.settingsUI;
        
        console.log('All components initialized');
    }
    
    /**
     * Setup global event listeners
     */
    setupGlobalEventListeners() {
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            this.handleGlobalKeydown(e);
        });
        
        // Window events
        window.addEventListener('beforeunload', (e) => {
            if (this.hasUnsavedChanges()) {
                e.preventDefault();
                e.returnValue = '';
            }
        });
        
        // Visibility change (tab focus/blur)
        document.addEventListener('visibilitychange', () => {
            this.handleVisibilityChange();
        });
        
        // Online/offline events
        window.addEventListener('online', () => {
            showNotification('Conexão restaurada', 'success');
        });
        
        window.addEventListener('offline', () => {
            showNotification('Conexão perdida', 'warning');
        });
        
        // Error handling
        window.addEventListener('error', (e) => {
            console.error('Global error:', e.error);
            this.handleGlobalError(e.error);
        });
        
        window.addEventListener('unhandledrejection', (e) => {
            console.error('Unhandled promise rejection:', e.reason);
            this.handleGlobalError(e.reason);
        });
    }
    
    /**
     * Initialize UI components
     */
    initializeUI() {
        // Initialize Lucide icons
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
        
        // Setup tooltips
        this.initializeTooltips();
        
        // Setup form validation
        this.initializeFormValidation();
        
        // Setup responsive behavior
        this.initializeResponsiveUI();
        
        // Initialize status indicators
        this.initializeStatusIndicators();
        
        console.log('UI initialized');
    }
    
    /**
     * Initialize tooltips
     */
    initializeTooltips() {
        // Add tooltip functionality to elements with data-tooltip attribute
        document.querySelectorAll('[data-tooltip]').forEach(element => {
            element.classList.add('tooltip');
        });
    }
    
    /**
     * Initialize form validation
     */
    initializeFormValidation() {
        // Real-time validation for configuration inputs
        document.querySelectorAll('.form-input').forEach(input => {
            input.addEventListener('blur', (e) => {
                this.validateFormField(e.target);
            });
            
            input.addEventListener('input', debounce((e) => {
                this.clearFieldError(e.target);
            }, 1000));
        });
    }
    
    /**
     * Initialize responsive UI
     */
    initializeResponsiveUI() {
        // Handle responsive layout changes
        window.addEventListener('resize', debounce(() => {
            this.handleResize();
        }, 300));
        
        // Initial responsive setup
        this.handleResize();
    }
    
    /**
     * Initialize status indicators
     */
    initializeStatusIndicators() {
        // Update status indicators periodically
        setInterval(() => {
            this.updateStatusIndicators();
        }, 30000); // Every 30 seconds
    }
    
    /**
     * Start the application
     */
    async startApplication() {
        // Show welcome message if first time
        if (!storage.get('app-welcome-shown')) {
            this.showWelcomeMessage();
            storage.set('app-welcome-shown', true);
        }
        
        // Start background services
        this.startBackgroundServices();
        
        console.log('Application started');
    }
    
    /**
     * Show welcome message
     */
    showWelcomeMessage() {
        setTimeout(() => {
            showNotification(
                'Bem-vindo ao Gerenciador Remoto Zabbix! Configure suas conexões nas opções para começar.',
                'info',
                8000
            );
        }, 1000);
    }
    
    /**
     * Start background services
     */
    startBackgroundServices() {
        // Auto-refresh service (if enabled in config)
        const autoRefresh = configManager.get('ui.autoRefresh');
        if (autoRefresh) {
            this.startAutoRefresh();
        }
        
        // Health check service
        this.startHealthCheckService();
        
        // Data sync service
        this.startDataSyncService();
    }
    
    /**
     * Start auto-refresh service
     */
    startAutoRefresh() {
        const interval = configManager.get('dashboard.refreshInterval') * 1000;
        
        this.refreshInterval = setInterval(() => {
            if (document.hidden) return; // Don't refresh when tab is not visible
            
            this.performAutoRefresh();
        }, interval);
    }
    
    /**
     * Perform auto-refresh
     */
    async performAutoRefresh() {
        if (this.components.dashboard && this.components.dashboard.currentSelectedHost) {
            try {
                await this.components.dashboard.loadDashboardData(this.components.dashboard.currentSelectedHost);
            } catch (err) {
                console.error('Auto-refresh failed:', err);
            }
        }
    }
    
    /**
     * Start health check service
     */
    startHealthCheckService() {
        setInterval(() => {
            this.performHealthCheck();
        }, 60000); // Every minute
    }
    
    /**
     * Perform health check
     */
    performHealthCheck() {
        const checks = {
            zabbix: this.checkZabbixConnection(),
            storage: this.checkLocalStorage(),
            memory: this.checkMemoryUsage(),
            network: navigator.onLine
        };
        
        // Log health status
        console.log('Health check:', checks);
        
        // Update UI indicators if needed
        this.updateHealthIndicators(checks);
    }
    
    /**
     * Check Zabbix connection
     */
    async checkZabbixConnection() {
        if (!this.components.dashboard || !this.components.dashboard.zabbixClient) {
            return { status: 'not-configured' };
        }
        
        try {
            await this.components.dashboard.zabbixClient.testConnection();
            return { status: 'healthy' };
        } catch (err) {
            return { status: 'error', error: err.message };
        }
    }
    
    /**
     * Check local storage
     */
    checkLocalStorage() {
        try {
            // Test storage operations
            const testKey = 'health-check-test';
            localStorage.setItem(testKey, 'test');
            const value = localStorage.getItem(testKey);
            localStorage.removeItem(testKey);
            
            return { 
                status: value === 'test' ? 'healthy' : 'error',
                usage: this.getStorageUsage()
            };
        } catch (err) {
            return { status: 'error', error: err.message };
        }
    }
    
    /**
     * Get storage usage
     */
    getStorageUsage() {
        let total = 0;
        for (let key in localStorage) {
            if (localStorage.hasOwnProperty(key)) {
                total += localStorage[key].length + key.length;
            }
        }
        return total;
    }
    
    /**
     * Check memory usage
     */
    checkMemoryUsage() {
        if (performance.memory) {
            const used = performance.memory.usedJSHeapSize;
            const total = performance.memory.totalJSHeapSize;
            const limit = performance.memory.jsHeapSizeLimit;
            
            return {
                status: used < limit * 0.9 ? 'healthy' : 'warning',
                used: used,
                total: total,
                limit: limit,
                usage: (used / limit) * 100
            };
        }
        
        return { status: 'unknown' };
    }
    
    /**
     * Start data sync service
     */
    startDataSyncService() {
        // Sync configuration changes across tabs
        window.addEventListener('storage', (e) => {
            if (e.key === 'network-monitor-config') {
                this.handleConfigChange();
            }
        });
    }
    
    /**
     * Handle configuration change
     */
    handleConfigChange() {
        // Reload configuration
        configManager.loadConfig();
        
        // Update UI if needed
        if (this.components.settings) {
            this.components.settings.loadCurrentSettings();
        }
        
        showNotification('Configurações atualizadas em outra aba', 'info');
    }
    
    /**
     * Handle global keyboard shortcuts
     * @param {KeyboardEvent} e - Keyboard event
     */
    handleGlobalKeydown(e) {
        // Ctrl/Cmd + , (comma) - Open settings
        if ((e.ctrlKey || e.metaKey) && e.key === ',') {
            e.preventDefault();
            this.components.settings?.open();
        }
        
        // Ctrl/Cmd + Shift + R - Force refresh
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'R') {
            e.preventDefault();
            this.forceRefresh();
        }
        
        // Ctrl/Cmd + K - Search
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            document.getElementById('store-search')?.focus();
        }
        
        // Escape - Close modals
        if (e.key === 'Escape') {
            this.closeAllModals();
        }
    }
    
    /**
     * Handle visibility change
     */
    handleVisibilityChange() {
        if (document.hidden) {
            // Tab became hidden, pause expensive operations
            this.pauseBackgroundOperations();
        } else {
            // Tab became visible, resume operations
            this.resumeBackgroundOperations();
            this.refreshVisibleContent();
        }
    }
    
    /**
     * Handle global error
     * @param {Error} error - Error object
     */
    handleGlobalError(error) {
        console.error('Application error:', error);
        
        // Don't show error notifications for minor issues
        if (error.message?.includes('Script error')) return;
        if (error.message?.includes('Non-Error promise rejection')) return;
        
        showNotification(`Erro na aplicação: ${error.message}`, 'error', 10000);
    }
    
    /**
     * Handle window resize
     */
    handleResize() {
        // Update charts
        this.components.charts?.handleResize();
        
        // Update responsive elements
        this.updateResponsiveElements();
    }
    
    /**
     * Update responsive elements
     */
    updateResponsiveElements() {
        const isMobile = window.innerWidth < 768;
        const isTablet = window.innerWidth < 1200;
        
        // Update body classes for CSS targeting
        document.body.classList.toggle('mobile-view', isMobile);
        document.body.classList.toggle('tablet-view', isTablet);
        
        // Update collapsible sections for mobile
        if (isMobile) {
            // Auto-collapse sections on mobile for better UX
            document.querySelectorAll('.collapsible-section').forEach(section => {
                const header = section.querySelector('.collapsible-header');
                if (header && !header.classList.contains('collapsed')) {
                    header.classList.add('collapsed');
                    const content = header.nextElementSibling;
                    if (content) content.style.display = 'none';
                }
            });
        }
    }
    
    /**
     * Update status indicators
     */
    updateStatusIndicators() {
        // Update connection status indicator
        this.updateConnectionStatus();
        
        // Update last update time
        this.updateLastUpdateTime();
    }
    
    /**
     * Update connection status indicator
     */
    updateConnectionStatus() {
        const statusElement = document.querySelector('.connection-status');
        if (statusElement) {
            const isOnline = navigator.onLine;
            statusElement.className = `connection-status ${isOnline ? 'online' : 'offline'}`;
            statusElement.textContent = isOnline ? 'Online' : 'Offline';
        }
    }
    
    /**
     * Update last update time
     */
    updateLastUpdateTime() {
        const updateElement = document.querySelector('.last-update');
        if (updateElement) {
            updateElement.textContent = new Date().toLocaleTimeString();
        }
    }
    
    /**
     * Update health indicators
     * @param {Object} checks - Health check results
     */
    updateHealthIndicators(checks) {
        // Update health indicators in UI
        Object.entries(checks).forEach(([service, status]) => {
            const element = document.querySelector(`[data-health="${service}"]`);
            if (element) {
                element.className = `health-indicator ${status.status}`;
            }
        });
    }
    
    /**
     * Pause background operations
     */
    pauseBackgroundOperations() {
        // Clear auto-refresh
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
        }
    }
    
    /**
     * Resume background operations
     */
    resumeBackgroundOperations() {
        // Restart auto-refresh
        const autoRefresh = configManager.get('ui.autoRefresh');
        if (autoRefresh) {
            this.startAutoRefresh();
        }
    }
    
    /**
     * Refresh visible content
     */
    refreshVisibleContent() {
        // Refresh charts and data
        if (this.components.dashboard?.currentSelectedHost) {
            this.components.dashboard.loadDashboardData(this.components.dashboard.currentSelectedHost);
        }
    }
    
    /**
     * Force refresh all content
     */
    async forceRefresh() {
        showNotification('Atualizando dados...', 'info');
        
        try {
            // Reinitialize Zabbix client
            if (this.components.dashboard) {
                await this.components.dashboard.initializeZabbixClient();
            }
            
            // Refresh current view
            if (this.components.dashboard?.currentSelectedHost) {
                await this.components.dashboard.loadDashboardData(this.components.dashboard.currentSelectedHost);
            }
            
            showNotification('Dados atualizados com sucesso!', 'success');
        } catch (err) {
            showNotification('Erro ao atualizar dados', 'error');
        }
    }
    
    /**
     * Close all modals
     */
    closeAllModals() {
        document.querySelectorAll('.modal.show').forEach(modal => {
            modal.classList.remove('show');
            setTimeout(() => {
                modal.style.display = 'none';
            }, 250);
        });
    }
    
    /**
     * Check for unsaved changes
     * @returns {boolean} True if there are unsaved changes
     */
    hasUnsavedChanges() {
        // Check if there are unsaved configuration changes
        const currentConfig = configManager.config;
        const savedConfig = storage.get('network-monitor-config');
        
        return JSON.stringify(currentConfig) !== JSON.stringify(savedConfig);
    }
    
    /**
     * Validate form field
     * @param {HTMLInputElement} field - Form field
     */
    validateFormField(field) {
        const value = field.value.trim();
        const fieldName = field.name || field.id;
        
        // Clear previous errors
        this.clearFieldError(field);
        
        // Required field validation
        if (field.required && !value) {
            this.showFieldError(field, 'Este campo é obrigatório');
            return false;
        }
        
        // Specific validations
        switch (fieldName) {
            case 'email':
                if (value && !isValidEmail(value)) {
                    this.showFieldError(field, 'Email inválido');
                    return false;
                }
                break;
            case 'url':
                if (value && !isValidUrl(value)) {
                    this.showFieldError(field, 'URL inválida');
                    return false;
                }
                break;
        }
        
        return true;
    }
    
    /**
     * Show field error
     * @param {HTMLInputElement} field - Form field
     * @param {string} message - Error message
     */
    showFieldError(field, message) {
        field.classList.add('error');
        
        let errorElement = field.parentNode.querySelector('.field-error');
        if (!errorElement) {
            errorElement = document.createElement('div');
            errorElement.className = 'field-error';
            field.parentNode.appendChild(errorElement);
        }
        
        errorElement.textContent = message;
    }
    
    /**
     * Clear field error
     * @param {HTMLInputElement} field - Form field
     */
    clearFieldError(field) {
        field.classList.remove('error');
        
        const errorElement = field.parentNode.querySelector('.field-error');
        if (errorElement) {
            errorElement.remove();
        }
    }
    
    /**
     * Show loading overlay
     * @param {string} message - Loading message
     */
    showLoading(message = 'Carregando...') {
        const overlay = document.getElementById('loading-overlay');
        if (overlay) {
            const text = overlay.querySelector('.loading-text');
            if (text) text.textContent = message;
            overlay.classList.add('show');
        }
    }
    
    /**
     * Hide loading overlay
     */
    hideLoading() {
        const overlay = document.getElementById('loading-overlay');
        if (overlay) {
            overlay.classList.remove('show');
        }
    }
}

// ============================================
// APPLICATION BOOTSTRAP
// ============================================

// Wait for DOM to be ready
document.addEventListener('DOMContentLoaded', () => {
    // Initialize the application
    window.app = new NetworkMonitorApp();
});

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        NetworkMonitorApp
    };
}