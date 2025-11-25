// ============================================
// SSH COMMANDS - Command execution and management
// ============================================

class SSHCommandManager {
    constructor() {
        this.currentProfile = 'default';
        this.selectedCommands = new Set();
        this.commandHistory = [];
        this.initializeUI();
    }

    /**
     * Initialize SSH commands UI
     */
    initializeUI() {
        this.setupEventListeners();
        this.loadDefaultCommands();
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Command selection checkboxes
        document.addEventListener('change', (e) => {
            if (e.target.classList.contains('command-checkbox')) {
                const commandId = e.target.id.replace('cmd-', '');
                if (e.target.checked) {
                    this.selectedCommands.add(commandId);
                } else {
                    this.selectedCommands.delete(commandId);
                }
            }
        });

        // Load profile button (if exists)
        const loadProfileBtn = document.getElementById('load-profile');
        if (loadProfileBtn) {
            loadProfileBtn.addEventListener('click', () => {
                this.loadProfileCommands();
            });
        }

        // Export commands button (if exists)
        const exportBtn = document.getElementById('export-commands');
        if (exportBtn) {
            exportBtn.addEventListener('click', () => {
                this.exportCommands();
            });
        }
    }

    /**
     * Load commands for device profile
     * @param {string} profile - Device profile name
     */
    loadCommandsForProfile(profile) {
        this.currentProfile = profile;
        this.selectedCommands.clear();
        this.loadCommandsList();
    }

    /**
     * Load commands list based on current profile
     */
    loadCommandsList() {
        const commandsList = document.getElementById('commands-list');
        if (!commandsList) return;

        commandsList.innerHTML = '';

        const commands = ZABBIX_COMMAND_PROFILES[this.currentProfile] || [];

        if (commands.length === 0) {
            commandsList.innerHTML = '<div class="no-commands">Nenhum comando definido para este tipo de dispositivo.</div>';
            return;
        }

        commands.forEach((cmd, index) => {
            const commandItem = this.createCommandItem(cmd, index);
            commandsList.appendChild(commandItem);
        });
    }

    /**
     * Create command item element
     * @param {Object} command - Command object
     * @param {number} index - Command index
     * @returns {HTMLElement} Command item element
     */
    createCommandItem(command, index) {
        const commandId = `cmd-${command.command.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-]/g, '')}-${index}`;

        const commandItem = document.createElement('div');
        commandItem.className = 'command-item';

        commandItem.innerHTML = `
            <input type="checkbox" class="command-checkbox" id="${commandId}">
            <label class="command-label" for="${commandId}">
                <span class="command-name">${command.name}</span>
                <span class="command-text">${command.command}</span>
            </label>
            <button class="command-copy" title="Copiar comando" data-command="${command.command}">
                <i data-lucide="copy"></i>
            </button>
        `;

        // Add copy button functionality
        const copyBtn = commandItem.querySelector('.command-copy');
        copyBtn.addEventListener('click', (e) => {
            e.preventDefault();
            this.copyCommand(command.command);
        });

        return commandItem;
    }

    /**
     * Load default commands
     */
    loadDefaultCommands() {
        this.loadCommandsForProfile('default');
    }

    /**
     * Select all commands
     */
    selectAllCommands() {
        document.querySelectorAll('.command-checkbox').forEach(checkbox => {
            checkbox.checked = true;
            this.selectedCommands.add(checkbox.id.replace('cmd-', ''));
        });
    }

    /**
     * Deselect all commands
     */
    deselectAllCommands() {
        document.querySelectorAll('.command-checkbox').forEach(checkbox => {
            checkbox.checked = false;
        });
        this.selectedCommands.clear();
    }

    /**
     * Get selected commands
     * @returns {Array} Array of selected commands
     */
    getSelectedCommands() {
        const commands = [];
        document.querySelectorAll('.command-checkbox:checked').forEach(checkbox => {
            const commandText = this.getCommandTextFromCheckbox(checkbox);
            if (commandText) {
                commands.push(commandText);
            }
        });
        return commands;
    }

    /**
     * Get command text from checkbox
     * @param {HTMLInputElement} checkbox - Checkbox element
     * @returns {string} Command text
     */
    getCommandTextFromCheckbox(checkbox) {
        const label = checkbox.nextElementSibling;
        const commandSpan = label?.querySelector('.command-text');
        return commandSpan ? commandSpan.textContent : '';
    }

    /**
     * Execute selected commands
     * @param {Object} host - Host information
     * @returns {Promise<Object>} Execution result
     */
    async executeSelectedCommands(host) {
        const selectedCommands = this.getSelectedCommands();

        if (selectedCommands.length === 0) {
            throw new Error('Nenhum comando selecionado');
        }

        const config = configManager.config;
        if (!config.ssh.user || !config.ssh.password) {
            throw new Error('Configurações SSH não encontradas');
        }

        try {
            // Show execution dialog
            const executionDialog = this.createExecutionDialog(host, selectedCommands);
            document.body.appendChild(executionDialog);

            // Execute commands via API
            const results = await this.executeCommands(host, selectedCommands);

            // Remove dialog and show results
            executionDialog.remove();
            this.showExecutionResults(results);

            // Add to history
            this.addToHistory({
                host: host.name,
                commands: selectedCommands,
                timestamp: new Date(),
                results: results
            });

            return results;

        } catch (err) {
            console.error('Command execution failed:', err);
            throw err;
        }
    }

    /**
     * Mock command execution (replace with real SSH implementation)
     * @param {Object} host - Host information
     * @param {Array} commands - Commands to execute
     * @returns {Promise<Object>} Execution results
     */
    /**
     * Execute commands via backend API
     * @param {Object} host - Host information
     * @param {Array} commands - Commands to execute
     * @returns {Promise<Object>} Execution results
     */
    async executeCommands(host, commands) {
        const config = configManager.config;

        try {
            const response = await api.post('/api/ssh-execute', {
                host: host.host, // Ensure we use the IP or hostname
                username: config.ssh.user,
                password: config.ssh.password,
                commands: commands
            });

            return {
                host: host.name,
                commands: commands.map(cmd => ({
                    command: cmd,
                    output: response.output || '',
                    exitCode: response.success ? 0 : 1
                })),
                timestamp: new Date()
            };
        } catch (error) {
            console.error('SSH Execution Error:', error);
            throw error;
        }
    }

    /**
     * Generate mock command output
     * @param {string} command - Command that was executed
     * @returns {string} Mock output
     */
    generateMockOutput(command) {
        const outputs = {
            'show ip interface brief': `Interface              IP-Address      OK? Method Status                Protocol
GigabitEthernet0/0     192.168.1.1    YES manual up                    up      
GigabitEthernet0/1     10.0.0.1       YES manual up                    up      
Serial0/0/0            172.16.0.1     YES manual up                    up      `,

            'show cdp neighbors': `Capability Codes: R - Router, T - Trans Bridge, B - Source Route Bridge
                                  S - Switch, H - Host, I - IGMP, r - Repeater

Device ID        Local Intrfce     Holdtme    Capability  Platform  Port ID
SW1              Gig 0/1            158             S I      WS-C2950  2/1    `,

            'show running-config': `!
! Last configuration change at 15:30:45 UTC Mon Jan 1 2024
!
version 15.2
service timestamps debug datetime msec
service timestamps log datetime msec
no service password-encryption
!
hostname Router1
!
interface GigabitEthernet0/0
 ip address 192.168.1.1 255.255.255.0
 duplex auto
 speed auto
!
interface GigabitEthernet0/1
 ip address 10.0.0.1 255.255.255.0
 duplex auto
 speed auto`,

            'get sys status': `Version: FortiGate-VM64 v7.4.0,build2367,230926
Serial-Number: FGVM02TM21400123
BIOS version: 04000002
Log hard disk: Available
Hostname: BRALAGB247FW254
Operation Mode: NAT
Current user: admin
System time: Thu Jan  1 15:30:45 2024`,

            'show vlan brief': `VLAN Name                             Status    Ports
---- -------------------------------- --------- -------------------------------
1    default                          active    Gi0/1, Gi0/2, Gi0/3, Gi0/4
10   VLAN0010                         active    Gi0/5, Gi0/6
20   VLAN0020                         active    Gi0/7, Gi0/8`,

            'display lldp ne brief': `LLDP neighbor-information of port :GigabitEthernet0/0
-------------------------------------------------------------------------------
Neighbor's interface descriptions : 
IfName : GigabitEthernet0/0
Port   : 000c.2944.8000
PortDesc: GigabitEthernet0/0
SystemDesc: H3C Comware Platform Software, Software Version 5.20.99, 
Release 1808P35, H3C S12504 
```
        };

        // Return specific output if available, otherwise generate generic output
        if (outputs[command]) {
            return outputs[command];
        }

        // Generate generic mock output
        return `% ${command}\n${this.generateGenericMockOutput(command)}`;
    }

    /**
     * Generate generic mock output
     * @param {string} command - Command
     * @returns {string} Generic mock output
     */
    generateGenericMockOutput(command) {
        const variations = [
            'Command executed successfully',
            'Interface status: up',
            'Status: operational',
            'Configuration applied',
            'No issues found',
            'Normal operation',
            'System responsive'
        ];

        return variations[Math.floor(Math.random() * variations.length)];
    }

    /**
     * Create execution dialog
     * @param {Object} host - Host information
     * @param {Array} commands - Commands to execute
     * @returns {HTMLElement} Execution dialog element
     */
    createExecutionDialog(host, commands) {
        const dialog = document.createElement('div');
        dialog.className = 'execution-dialog modal show';
        dialog.style.display = 'flex';

        dialog.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>Executando Comandos</h3>
                </div>
                <div class="modal-body">
                    <div class="execution-info">
                        <p><strong>Host:</strong> ${host.name} (${host.host})</p>
                        <p><strong>Comandos:</strong> ${commands.length}</p>
                    </div>
                    <div class="execution-progress">
                        <div class="progress-bar">
                            <div class="progress-fill"></div>
                        </div>
                        <div class="progress-text">Executando...</div>
                    </div>
                </div>
            </div>
        `;

        return dialog;
    }

    /**
     * Show execution results
     * @param {Object} results - Execution results
     */
    /**
     * Show execution results with Auto-Refresh support
     * @param {Object} results - Execution results
     */
    /**
     * Show execution results with Auto-Refresh support
     * @param {Object} results - Execution results
     */
    showExecutionResults(results) {
        const resultsWindow = window.open('', '_blank', 'width=800,height=600,scrollbars=yes');

        const renderContent = (res) => `
            <html>
                <head>
                    <title>Resultados de Comandos - ${res.host}</title>
                    <style>
                        body { font-family: 'JetBrains Mono', monospace; margin: 20px; background: #141414; color: #e4e4e7; }
                        .header { margin-bottom: 20px; padding: 15px; background: #27272a; border-radius: 8px; display: flex; justify-content: space-between; align-items: start; }
                        .header-info h2 { margin: 0 0 10px 0; color: #38bdf8; }
                        .command-result { margin-bottom: 20px; padding: 15px; background: #27272a; border-radius: 8px; }
                        .command-title { font-weight: bold; color: #00b8d9; margin-bottom: 10px; }
                        .command-output { white-space: pre-wrap; line-height: 1.4; }
                        .execution-time { color: #a1a1aa; font-size: 12px; }
                        .exit-code { float: right; padding: 2px 8px; border-radius: 12px; font-size: 12px; }
                        .exit-code-0 { background: #22c55e20; color: #22c55e; }
                        .exit-code-error { background: #ef444420; color: #ef4444; }
                        .controls { display: flex; align-items: center; gap: 10px; background: #3f3f46; padding: 8px 12px; border-radius: 6px; }
                        .refresh-label { font-size: 14px; user-select: none; cursor: pointer; display: flex; align-items: center; gap: 6px; }
                        .refresh-control { display: flex; align-items: center; gap: 8px; cursor: pointer; }
                        .interval-select { background: #0f172a; color: white; border: 1px solid #334155; padding: 5px; border-radius: 4px; }
                        .interval-select option { background: #0f172a; color: white; }
                        .timestamp-banner { background: #334155; color: #38bdf8; padding: 10px; text-align: center; border-radius: 4px; margin-bottom: 15px; font-weight: bold; border: 1px solid #38bdf8; }
                        select.interval-select { background: #27272a; color: #fff; border: 1px solid #52525b; padding: 2px 5px; border-radius: 4px; }
                        @keyframes spin { to { transform: rotate(360deg); } }
                    </style>
                </head>
                <body>
                    <div class="header">
                        <div class="header-info">
                            <h2>Resultados de Execução</h2>
                            <p><strong>Host:</strong> ${res.host}</p>
                        </div>
                        <div class="controls">
                            <label class="refresh-label">
                                <input type="checkbox" id="auto-refresh"> Auto-Refresh
                            </label>
                            <select id="refresh-interval" class="interval-select">
                                <option value="5000">5s</option>
                                <option value="10000">10s</option>
                                <option value="15000">15s</option>
                                <option value="30000">30s</option>
                                <option value="60000">60s</option>
                            </select>
                            <div id="spinner" class="refresh-spinner"></div>
                        </div>
                    </div>
                    
                    <div id="timestamp-container">
                        <div class="timestamp-banner">--- ATUALIZANDO (${res.timestamp.toLocaleString('pt-BR')}) ---</div>
                    </div>

                    <div id="results-container">
                        ${res.commands.map(cmd => `
                            <div class="command-result">
                                <div class="command-title">$ ${cmd.command}</div>
                                <div class="command-output">${cmd.output}</div>
                                <div class="execution-time">
                                    Tempo: ${cmd.executionTime ? cmd.executionTime.toFixed(0) : 0}ms
                                    <span class="exit-code ${cmd.exitCode === 0 ? 'exit-code-0' : 'exit-code-error'}">
                                        Exit Code: ${cmd.exitCode}
                                    </span>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                    <script>
                        const checkbox = document.getElementById('auto-refresh');
                        const intervalSelect = document.getElementById('refresh-interval');
                        const spinner = document.getElementById('spinner');
                        let intervalId;

                        function startRefresh() {
                            if (intervalId) clearInterval(intervalId);
                            const ms = parseInt(intervalSelect.value);
                            intervalId = setInterval(() => window.opener.sshCommandManager.refreshResults(window, '${res.host}'), ms);
                            spinner.style.display = 'inline-block';
                        }

                        function stopRefresh() {
                            if (intervalId) clearInterval(intervalId);
                            intervalId = null;
                            spinner.style.display = 'none';
                        }

                        checkbox.addEventListener('change', (e) => {
                            if (e.target.checked) {
                                startRefresh();
                            } else {
                                stopRefresh();
                            }
                        });

                        intervalSelect.addEventListener('change', () => {
                            if (checkbox.checked) {
                                startRefresh(); // Restart with new interval
                            }
                        });
                    </script>
                </body>
            </html>
        `;

        resultsWindow.document.write(renderContent(results));
        resultsWindow.document.close();

        // Store commands for refresh
        this.lastExecutedCommands = results.commands.map(c => c.command);
    }

    async executeCommands(host, commands) {
        const config = configManager.config;

        try {
            const response = await api.post('/api/ssh-execute', {
                host: host.host, // Ensure we use the IP or hostname
                username: config.ssh.user,
                password: config.ssh.password,
                commands: commands
            });

            // Handle new structured response or fallback to old string output
            let commandResults = [];
            if (response.results && Array.isArray(response.results)) {
                commandResults = response.results.map(r => ({
                    command: r.command,
                    output: r.output,
                    exitCode: r.success ? 0 : 1
                }));
            } else {
                // Fallback for simulation or old backend
                const fullOutput = response.output || '';
                commandResults = commands.map(cmd => ({
                    command: cmd,
                    output: fullOutput, // This might duplicate if backend sends full log, but it's fallback
                    exitCode: response.success ? 0 : 1
                }));
            }

            return {
                host: host.name,
                commands: commandResults,
                timestamp: new Date()
            };
        } catch (error) {
            console.error('SSH Execution Error:', error);
            throw error;
        }
    }

    /**
     * Refresh results window content
     * @param {Window} win - The results window object
     * @param {string} hostName - Host name for display
     */
    async refreshResults(win, hostName) {
        if (!win || win.closed) return;

        try {
            const currentHost = window.dashboard?.currentSelectedHost;
            if (!currentHost || (currentHost.name !== hostName && currentHost.host !== hostName)) {
                console.warn('Host changed or not found, stopping refresh');
                return;
            }

            const results = await this.executeCommands(currentHost, this.lastExecutedCommands);

            // Update DOM in the popup window
            const container = win.document.getElementById('results-container');
            const timestampContainer = win.document.getElementById('timestamp-container');

            if (container && timestampContainer) {
                timestampContainer.innerHTML = `<div class="timestamp-banner">--- ATUALIZANDO (${results.timestamp.toLocaleString('pt-BR')}) ---</div>`;

                // Explicitly clear container first to avoid any appending issues
                container.innerHTML = '';

                container.innerHTML = results.commands.map(cmd => `
                    <div class="command-result">
                        <div class="command-title">$ ${cmd.command}</div>
                        <div class="command-output">${cmd.output}</div>
                        <div class="execution-time">
                            <span class="exit-code ${cmd.exitCode === 0 ? 'exit-code-0' : 'exit-code-error'}">
                                Exit Code: ${cmd.exitCode}
                            </span>
                        </div>
                    </div>
                `).join('');

                // Ensure scroll is at top to prevent "lines coming from below" effect
                // win.scrollTo(0, 0); // Optional: might be annoying if user wants to scroll down
            }
        } catch (err) {
            console.error('Auto-refresh failed:', err);
        }
    }

    /**
     * Copy command to clipboard
     * @param {string} command - Command to copy
     */
    async copyCommand(command) {
        const success = await copyToClipboard(command);
        if (success) {
            showNotification('Comando copiado para a área de transferência!', 'success');
        } else {
            showNotification('Erro ao copiar comando', 'error');
        }
    }

    /**
     * Add command execution to history
     * @param {Object} entry - History entry
     */
    addToHistory(entry) {
        this.commandHistory.unshift(entry);

        // Keep only last 50 entries
        if (this.commandHistory.length > 50) {
            this.commandHistory = this.commandHistory.slice(0, 50);
        }

        // Save to localStorage
        storage.set('ssh-command-history', this.commandHistory);
    }

    /**
     * Load command history
     */
    loadCommandHistory() {
        const saved = storage.get('ssh-command-history', []);
        this.commandHistory = saved;
    }

    /**
     * Export commands to file
     */
    exportCommands() {
        const commands = this.getSelectedCommands();
        if (commands.length === 0) {
            showNotification('Selecione pelo menos um comando para exportar', 'warning');
            return;
        }

        const exportData = {
            profile: this.currentProfile,
            commands: commands,
            exportedAt: new Date().toISOString()
        };

        const dataStr = JSON.stringify(exportData, null, 2);
        const fileName = `comandos-${this.currentProfile}-${Date.now()}.json`;

        downloadFile(dataStr, fileName, 'application/json');
        showNotification(`Comandos exportados para ${fileName}`, 'success');
    }

    /**
     * Import commands from file
     * @param {File} file - File to import
     */
    async importCommands(file) {
        try {
            const content = await file.text();
            const data = JSON.parse(content);

            if (data.commands && Array.isArray(data.commands)) {
                this.loadCommandsFromArray(data.commands);
                showNotification(`${data.commands.length} comandos importados com sucesso!`, 'success');
            } else {
                throw new Error('Formato de arquivo inválido');
            }
        } catch (err) {
            showNotification(`Erro ao importar comandos: ${err.message}`, 'error');
        }
    }

    /**
     * Load commands from array
     * @param {Array} commands - Array of commands
     */
    loadCommandsFromArray(commands) {
        // Convert to profile format
        const profileCommands = commands.map((cmd, index) => ({
            name: `Comando ${index + 1}`,
            command: cmd
        }));

        ZABBIX_COMMAND_PROFILES['imported'] = profileCommands;
        this.loadCommandsForProfile('imported');
    }

    /**
     * Get command execution statistics
     * @returns {Object} Statistics object
     */
    getStatistics() {
        return {
            totalExecutions: this.commandHistory.length,
            mostUsedCommands: this.getMostUsedCommands(),
            averageExecutionTime: this.getAverageExecutionTime(),
            successRate: this.getSuccessRate()
        };
    }

    /**
     * Get most used commands
     * @returns {Array} Array of most used commands
     */
    getMostUsedCommands() {
        const commandCounts = {};

        this.commandHistory.forEach(entry => {
            entry.commands.forEach(cmd => {
                commandCounts[cmd] = (commandCounts[cmd] || 0) + 1;
            });
        });

        return Object.entries(commandCounts)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 10)
            .map(([command, count]) => ({ command, count }));
    }

    /**
     * Get average execution time
     * @returns {number} Average execution time in ms
     */
    getAverageExecutionTime() {
        if (this.commandHistory.length === 0) return 0;

        const totalTime = this.commandHistory.reduce((sum, entry) => sum + entry.totalExecutionTime, 0);
        return totalTime / this.commandHistory.length;
    }

    /**
     * Get success rate
     * @returns {number} Success rate percentage
     */
    getSuccessRate() {
        if (this.commandHistory.length === 0) return 100;

        const successfulExecutions = this.commandHistory.filter(entry => {
            return entry.results && entry.results.commands.every(cmd => cmd.exitCode === 0);
        });

        return (successfulExecutions.length / this.commandHistory.length) * 100;
    }
}

// Initialize SSH command manager
document.addEventListener('DOMContentLoaded', () => {
    window.sshCommandManager = new SSHCommandManager();
    window.sshCommandManager.loadCommandHistory();
});

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        SSHCommandManager
    };
}