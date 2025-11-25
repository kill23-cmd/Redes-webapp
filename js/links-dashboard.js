class LinksDashboard {
    constructor(zabbixClient) {
        this.zabbixClient = zabbixClient;
        this.modalId = 'links-dashboard-modal';
        this.problems = [];
    }

    async show() {
        this.createModal();
        const modal = document.getElementById(this.modalId);
        modal.style.display = 'flex';
        await this.loadData();
    }

    createModal() {
        if (document.getElementById(this.modalId)) return;

        const modal = document.createElement('div');
        modal.id = this.modalId;
        modal.className = 'modal-overlay';
        modal.style.display = 'none'; // Hidden by default
        modal.innerHTML = `
            <div class="modal-content full-screen">
                <div class="modal-header">
                    <h2>Monitoramento de Links Offline</h2>
                    <button class="close-btn" onclick="document.getElementById('${this.modalId}').style.display='none'">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="toolbar">
                        <button id="refresh-links-btn" class="btn-primary">
                            <i data-lucide="refresh-cw"></i> Atualizar
                        </button>
                        <input type="text" id="links-search" placeholder="Filtrar por host ou problema..." class="form-input">
                    </div>
                    <div class="table-container">
                        <table class="data-table" id="links-table">
                            <thead>
                                <tr>
                                    <th>Hora</th>
                                    <th>Host</th>
                                    <th>Problema</th>
                                    <th>Duração</th>
                                    <th>Tags</th>
                                    <th>Ações</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr><td colspan="6" class="text-center">Carregando...</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        // Initialize icons
        if (window.lucide) window.lucide.createIcons();

        document.getElementById('refresh-links-btn').addEventListener('click', () => this.loadData());
        document.getElementById('links-search').addEventListener('input', (e) => this.filterTable(e.target.value));
    }

    async loadData() {
        const tbody = document.querySelector('#links-table tbody');
        tbody.innerHTML = '<tr><td colspan="6" class="text-center"><div class="spinner"></div> Carregando dados do Zabbix...</td></tr>';

        try {
            // Fetch all problems
            const problems = await this.zabbixClient.getAllProblems();

            // Filter for Link/Interface related issues
            // Keywords: Link, Interface, Down, Ping, ICMP, OSPF, BGP, Tunnel, VPN, Connection
            const keywords = ['link', 'interface', 'down', 'ping', 'icmp', 'ospf', 'bgp', 'tunnel', 'vpn', 'connection', 'loss'];

            this.problems = problems.filter(p => {
                const text = (p.name + (p.tags ? JSON.stringify(p.tags) : '')).toLowerCase();
                return keywords.some(k => text.includes(k));
            });

            this.renderTable(this.problems);
        } catch (error) {
            console.error('Error loading links data:', error);
            tbody.innerHTML = `<tr><td colspan="6" class="text-center error">Erro ao carregar dados: ${error.message}</td></tr>`;
        }
    }

    renderTable(problems) {
        const tbody = document.querySelector('#links-table tbody');
        tbody.innerHTML = '';

        if (!problems || problems.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center">Nenhum link offline encontrado.</td></tr>';
            return;
        }

        problems.forEach(p => {
            const date = new Date(p.clock * 1000).toLocaleString();
            const duration = this.formatDuration(Date.now() / 1000 - p.clock);
            const tags = p.tags ? p.tags.map(t => `<span class="tag">${t.tag}: ${t.value}</span>`).join('') : '';

            // Host name extraction
            const hostName = p.hosts && p.hosts[0] ? p.hosts[0].name : 'Unknown';
            const hostId = p.hosts && p.hosts[0] ? p.hosts[0].hostid : null;

            // Severity class
            const severityClass = `severity-${p.severity}`; // 0-5

            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${date}</td>
                <td class="font-bold">${hostName}</td>
                <td class="${severityClass}">${p.name}</td>
                <td>${duration}</td>
                <td><div class="tags-wrapper">${tags}</div></td>
                <td>
                    <button class="btn-small btn-action" onclick="window.openSSHForHost('${hostName}')">
                        SSH
                    </button>
                </td>
            `;
            tbody.appendChild(row);
        });
    }

    formatDuration(seconds) {
        const d = Math.floor(seconds / (3600 * 24));
        const h = Math.floor((seconds % (3600 * 24)) / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);

        if (d > 0) return `${d}d ${h}h ${m}m`;
        if (h > 0) return `${h}h ${m}m`;
        return `${m}m ${s}s`;
    }

    filterTable(query) {
        if (!this.problems) return;
        const lower = query.toLowerCase();
        const filtered = this.problems.filter(p => {
            const hostName = p.hosts && p.hosts[0] ? p.hosts[0].name : '';
            return p.name.toLowerCase().includes(lower) || hostName.toLowerCase().includes(lower);
        });
        this.renderTable(filtered);
    }
}

// Helper to open SSH from global context
window.openSSHForHost = (hostName) => {
    // We need to find the host object in dashboard data if possible, or just pass name
    // But executeCommands needs host object for IP extraction?
    // If we only have name, we might fail IP extraction if it's not in the dashboard list.
    // Ideally we should fetch host details.
    // For now, let's try to find it in dashboard.storesData
    if (window.dashboard && window.dashboard.storesData) {
        const host = window.dashboard.storesData.find(h => h.name === hostName || h.host === hostName);
        if (host) {
            window.sshCommandManager.openForHost(host);
            return;
        }
    }
    // Fallback: create a minimal host object
    window.sshCommandManager.openForHost({ name: hostName, host: hostName });
};
