// ============================================
// CONFIG TEMPLATES - Vendor specific configuration snippets
// ============================================

const VENDOR_CONFIG_SNIPPETS = {
    huawei_switch: {
        "Interface: PC (VLAN 80)":
            "system-view\n" +
            "interface {INTERFACE}\n" +
            "description PC\n" +
            "port default vlan 80\n" +
            "quit",
        "Interface: PC (VLAN 81)":
            "system-view\n" +
            "interface {INTERFACE}\n" +
            "description PC\n" +
            "port default vlan 81\n" +
            "quit",
        "Interface: CFTV (VLAN 75)":
            "system-view\n" +
            "interface {INTERFACE}\n" +
            "description CFTV\n" +
            "port default vlan 75\n" +
            "quit",
        "Interface: AP (Trunk VLAN 100)":
            "system-view\n" +
            "interface {INTERFACE}\n" +
            "description AP_BRSPOGG902AP034\n" +
            "port link-type trunk\n" +
            "port trunk pvid vlan 100\n" +
            "port trunk allow-pass vlan all\n" +
            "quit",
        "Criar VLANs (Padrão)":
            "system-view\n" +
            "vlan 9\n name WIFI-Temporario\n" +
            "vlan 10\n name WiFiGer\n" +
            "vlan 11\n name CSWLAN11\n" +
            "vlan 12\n name CSWLAN12\n" +
            "vlan 15\n name CSWLAN15\n" +
            "vlan 16\n name Clientes_Cencosud\n" +
            "vlan 50\n name VOIP\n" +
            "vlan 75\n name CFTV\n" +
            "vlan 80\n name PC\n" +
            "vlan 81\n name PC_2\n" +
            "vlan 95\n name PDV\n" +
            "vlan 100\n name Management\n" +
            "quit"
    },
    cisco_switch: {
        "Configurar SNMP":
            "conf t\n" +
            "snmp-server community e28a7a3e RO\n" +
            "snmp ifmib ifindex persist\n" +
            "end",
        "Configurar TACACS":
            "conf t\n" +
            "aaa new-model\n" +
            "aaa authentication login default group tacacs+ local\n" +
            "aaa authorization exec default group tacacs+ local\n" +
            "aaa authorization commands 15 default group tacacs+ local\n" +
            "aaa authorization configuration default group tacacs+\n" +
            "aaa accounting nested\n" +
            "aaa accounting auth-proxy default start-stop group tacacs+\n" +
            "aaa accounting exec default start-stop group tacacs+\n" +
            "aaa accounting commands 15 default start-stop group tacacs+\n" +
            "aaa accounting network acct_methods start-stop group rad_acct\n" +
            "aaa accounting connection default start-stop group tacacs+\n" +
            "aaa accounting system default start-stop group tacacs+\n" +
            "tacacs-server directed-request\n" +
            "tacacs server 172.18.144.92\n" +
            " address ipv4 172.18.144.92\n" +
            " key 7 06125707461A00400E1D4541\n" +
            "tacacs server 172.17.16.93\n" +
            " address ipv4 172.17.16.93\n" +
            " key 7 01075E22515F0F562A461943\n" +
            "end",
        "Interface: PC (VLAN 81+50)":
            "conf t\n" +
            "interface {INTERFACE}\n" +
            " switchport access vlan 81\n" +
            " switchport voice vlan 50\n" +
            " spanning-tree portfast\n" +
            "end",
        "Interface: PDV (VLAN 95)":
            "conf t\n" +
            "interface {INTERFACE}\n" +
            " switchport access vlan 95\n" +
            " spanning-tree portfast\n" +
            "end",
        "Interface: AP (Trunk Native 100)":
            "conf t\n" +
            "interface {INTERFACE}\n" +
            " switchport trunk native vlan 100\n" +
            " switchport mode trunk\n" +
            "end",
        "Interface: DMZ (VLAN 15,16)":
            "conf t\n" +
            "interface {INTERFACE}\n" +
            " description DMZ - FGT\n" +
            " switchport trunk allowed vlan 15,16\n" +
            " switchport mode trunk\n" +
            "end",
        "Criar VLANs (Padrão)":
            "conf t\n" +
            "vlan 11\n name VLAN0011\n" +
            "vlan 12\n name VLAN0012\n" +
            "vlan 15\n name cswlan15\n" +
            "vlan 16\n name clientes\n" +
            "vlan 21\n name cswlan11-flex\n" +
            "vlan 22\n name cswlan12-flex\n" +
            "vlan 50\n name VOIp\n" +
            "vlan 70\n name Midia\n" +
            "vlan 75\n name Cofres\n" +
            "vlan 80\n name PC\n" +
            "vlan 81\n name PC2\n" +
            "vlan 95\n name PDV\n" +
            "vlan 100\n name MGMT\n" +
            "end"
    },
    cisco_router: {
        "Configurar SNMP":
            "conf t\n" +
            "snmp-server community e28a7a3e RO\n" +
            "snmp ifmib ifindex persist\n" +
            "end"
    },
    fortiswitch: {
        "Interface: PC (VLAN 81+50)":
            "config switch interface\n" +
            " edit {INTERFACE}\n" +
            "  set native-vlan 81\n" +
            "  set allowed-vlans 50\n" +
            " next\n" +
            "end",
        "Interface: PDV (VLAN 95+50)":
            "config switch interface\n" +
            " edit {INTERFACE}\n" +
            "  set native-vlan 95\n" +
            "  set allowed-vlans 50\n" +
            " next\n" +
            "end",
        "Interface: AP (Native + Allowed)":
            "config switch interface\n" +
            " edit {INTERFACE}\n" +
            "  set native-vlan {NATIVE_VLAN}\n" +
            "  set allowed-vlans 15-22\n" +
            " next\n" +
            "end",
        "Criar VLANs (Padrão)":
            "config switch vlan\n" +
            " edit 100\n  set description \"VLAN_MGMT\"\n next\n" +
            " edit 81\n  set description \"VLAN_PC\"\n next\n" +
            " edit 95\n  set description \"VLAN_PDV\"\n next\n" +
            " edit 50\n  set description \"VLAN_VOIP\"\n next\n" +
            " edit 11\n  set description \"VLAN_WLAN11\"\n next\n" +
            " edit 12\n  set description \"VLAN_WLAN12\"\n next\n" +
            " edit 21\n  set description \"VLAN_WLAN21\"\n next\n" +
            " edit 22\n  set description \"VLAN_WLAN22\"\n next\n" +
            " edit 70\n  set description \"VLAN_PROVEDORES\"\n next\n" +
            " edit 75\n  set description \"VLAN_COFRES\"\n next\n" +
            " edit 1\n  set description \"default\"\n next\n" +
            " edit 4089\n  set description \"onboarding\"\n  set access-vlan enable\n next\n" +
            " edit 4093\n  set description \"quarantine\"\n  set access-vlan enable\n next\n" +
            " edit 4092\n  set description \"rspan\"\n next\n" +
            " edit 4090\n  set description \"video\"\n next\n" +
            " edit 4091\n  set description \"voice\"\n next\n" +
            "end",
        "Configurar TACACS":
            "config user tacacs+\n" +
            " edit \"ISE013-14\"\n" +
            "  set key t8Fj4i9kj7*\n" +
            "  set server \"172.18.144.92\"\n" +
            " next\n" +
            "end\n" +
            "config user group\n" +
            " edit \"SSO_Guest_Users\"\n next\n" +
            " edit \"Guest-group\"\n next\n" +
            " edit \"GG_Tier2_Identities_Adm\"\n" +
            "  set member \"ISE013-14\"\n" +
            " next\n" +
            "end\n" +
            "config system admin\n" +
            " edit \"TACACS_admin\"\n" +
            "  set remote-auth enable\n" +
            "  set accprofile \"prof_admin\"\n" +
            "  set wildcard enable\n" +
            "  set remote-group \"GG_Tier2_Identities_Adm\"\n" +
            " next\n" +
            "end"
    },
    fortinet_firewall: {},
    access_point: {},
    default: {}
};

class ConfigTemplateManager {
    constructor() {
        this.currentDeviceType = 'default';
        this.initializeUI();
    }

    initializeUI() {
        // Create modal if not exists
        if (!document.getElementById('advanced-config-modal')) {
            this.createModal();
        }

        // Bind events
        const btn = document.getElementById('btn-advanced-config');
        if (btn) {
            btn.addEventListener('click', () => this.openModal());
        }

        document.getElementById('template-select').addEventListener('change', (e) => this.onTemplateSelect(e.target.value));
        document.getElementById('apply-config-btn').addEventListener('click', () => this.applyConfiguration());

        // Close modal events
        document.querySelectorAll('.modal-close, .close-modal-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.getElementById('advanced-config-modal').classList.remove('show');
            });
        });
    }

    createModal() {
        const modal = document.createElement('div');
        modal.id = 'advanced-config-modal';
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 600px;">
                <div class="modal-header">
                    <h3>Configuração Avançada</h3>
                    <button class="modal-close"><i data-lucide="x"></i></button>
                </div>
                <div class="modal-body">
                    <div class="form-group">
                        <label>Selecionar Template:</label>
                        <select id="template-select" class="form-input">
                            <option value="">-- Selecione um template --</option>
                        </select>
                    </div>

                    <div id="template-variables" class="form-group" style="display:none;">
                        <label>Variáveis:</label>
                        <div id="variables-container"></div>
                    </div>

                    <div class="form-group">
                        <label>Preview da Configuração:</label>
                        <textarea id="config-preview" class="form-input" rows="8" style="font-family: monospace; background: #111; color: #0f0;"></textarea>
                    </div>
                </div>
                <div class="modal-footer">
                    <button id="apply-config-btn" class="btn-primary"><i data-lucide="play"></i> Aplicar Configuração</button>
                    <button class="btn-ghost close-modal-btn">Cancelar</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        lucide.createIcons();
    }

    openModal() {
        // Get current device type from dashboard
        if (window.dashboard) {
            this.currentDeviceType = window.dashboard.deviceType || 'default';
        }

        this.populateTemplates();
        document.getElementById('advanced-config-modal').classList.add('show');
        document.getElementById('config-preview').value = '';
        document.getElementById('template-variables').style.display = 'none';
    }

    populateTemplates() {
        const select = document.getElementById('template-select');
        select.innerHTML = '<option value="">-- Selecione um template --</option>';

        const templates = VENDOR_CONFIG_SNIPPETS[this.currentDeviceType] || {};

        if (Object.keys(templates).length === 0) {
            const opt = document.createElement('option');
            opt.disabled = true;
            opt.textContent = "Nenhum template disponível para este dispositivo";
            select.appendChild(opt);
            return;
        }

        for (const [name, content] of Object.entries(templates)) {
            const opt = document.createElement('option');
            opt.value = name;
            opt.textContent = name;
            select.appendChild(opt);
        }
    }

    onTemplateSelect(templateName) {
        if (!templateName) return;

        const templates = VENDOR_CONFIG_SNIPPETS[this.currentDeviceType] || {};
        const content = templates[templateName];

        if (!content) return;

        // Check for variables like {INTERFACE}
        const variables = content.match(/\{([A-Z0-9_]+)\}/g);
        const container = document.getElementById('variables-container');
        container.innerHTML = '';

        if (variables) {
            document.getElementById('template-variables').style.display = 'block';
            const uniqueVars = [...new Set(variables)]; // Remove duplicates

            uniqueVars.forEach(v => {
                const varName = v.replace(/[\{\}]/g, '');
                const div = document.createElement('div');
                div.className = 'variable-input';
                div.style.marginBottom = '10px';
                div.innerHTML = `
                    <label style="font-size: 0.85rem; color: #aaa;">${varName}:</label>
                    <input type="text" class="form-input template-var" data-var="${v}" placeholder="Valor para ${varName}">
                `;
                container.appendChild(div);

                // Add listener to update preview in real-time
                div.querySelector('input').addEventListener('input', () => this.updatePreview(content));
            });
        } else {
            document.getElementById('template-variables').style.display = 'none';
        }

        this.updatePreview(content);
    }

    updatePreview(content) {
        let finalConfig = content;
        const inputs = document.querySelectorAll('.template-var');

        inputs.forEach(input => {
            const variable = input.dataset.var;
            const value = input.value;
            // Replace all occurrences
            finalConfig = finalConfig.split(variable).join(value || variable);
        });

        document.getElementById('config-preview').value = finalConfig;
    }

    async applyConfiguration() {
        const config = document.getElementById('config-preview').value;
        if (!config) return;

        if (!confirm("Tem certeza que deseja aplicar esta configuração?")) return;

        // Use existing SSH execution logic
        if (window.dashboard && window.dashboard.currentSelectedHost) {
            const host = window.dashboard.currentSelectedHost;

            // Split config into lines as separate commands
            const commands = config.split('\n').filter(line => line.trim() !== '');

            try {
                // Close config modal
                document.getElementById('advanced-config-modal').classList.remove('show');

                // Execute using SSHCommandManager
                if (window.sshCommandManager) {
                    await window.sshCommandManager.executeSelectedCommands(host, commands); // We need to adapt this
                    // Or call API directly if manager expects UI selection
                } else {
                    // Fallback to direct API call similar to dashboard.runSelectedCommands
                    const ip = (host.interfaces && host.interfaces[0]) ? host.interfaces[0].ip : host.host;
                    const appConfig = configManager.config;

                    const res = await fetch('/api/ssh-execute', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            host: ip,
                            username: appConfig.ssh.user,
                            password: appConfig.ssh.password,
                            commands: commands
                        })
                    });
                    const result = await res.json();

                    // Show results using the new nice window
                    if (window.sshCommandManager) {
                        window.sshCommandManager.showExecutionResults({
                            host: host.name,
                            commands: commands.map((cmd, i) => ({
                                command: cmd,
                                output: result.output, // Note: output might be combined, this is a simplification
                                exitCode: 0
                            })),
                            timestamp: new Date()
                        });
                    }
                }
            } catch (e) {
                alert("Erro ao aplicar configuração: " + e);
            }
        } else {
            alert("Nenhum dispositivo selecionado!");
        }
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    window.configTemplateManager = new ConfigTemplateManager();
});
