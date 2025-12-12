class LinksDashboard {
    constructor(zabbixClient) {
        console.log('LinksDashboard initialized with client:', zabbixClient);
        console.log('Has getLinkProblems?', typeof zabbixClient.getLinkProblems);
        this.zabbixClient = zabbixClient;
        this.modalId = 'links-dashboard-modal';
        this.problems = [];
        this.refreshInterval = null;
        window.linksDashboard = this; // Ensure global access for onclick handlers
    }

    async show() {
        window.linksDashboard = this; // Re-enforce global access
        this.createModal();
        const modal = document.getElementById(this.modalId);
        modal.style.display = 'flex';

        // Start auto-refresh (10s)
        if (this.refreshInterval) clearInterval(this.refreshInterval);
        this.refreshInterval = setInterval(() => this.loadData(), 10000);

        await this.loadData();
    }

    hide() {
        const modal = document.getElementById(this.modalId);
        if (modal) modal.style.display = 'none';
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
            this.refreshInterval = null;
        }
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
                    <button class="close-btn" onclick="window.linksDashboard.hide()">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="toolbar">
                        <button id="refresh-links-btn" class="btn-primary">
                            <i data-lucide="refresh-cw"></i> Atualizar
                        </button>
                        <button id="backlog-btn" class="btn-secondary" onclick="window.linksDashboard.generateBacklog()">
                            <i data-lucide="file-text"></i> Gerar Backlog
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
            // 1. Try to find "Links" host group
            let groupId = null;
            try {
                const groups = await this.zabbixClient.getHostGroups();
                if (groups && Array.isArray(groups)) {
                    // Prioritize "Incidentes Links" over generic "Links"
                    const specificGroup = groups.find(g => g.name.toLowerCase().includes('incidentes links'));
                    const genericGroup = groups.find(g => g.name.toLowerCase().includes('links'));

                    const linkGroup = specificGroup || genericGroup;

                    if (linkGroup) {
                        console.log('Filtering by Host Group:', linkGroup.name);
                        groupId = linkGroup.groupid;
                    }
                }
            } catch (err) {
                console.warn('Failed to fetch host groups, proceeding without group filter:', err);
            }

            // 2. Fetch problems (filtered by group if found) using the new adapted query
            let problems = await this.zabbixClient.getLinkProblems(groupId);
            console.log('Raw Problems Response:', problems);

            if (problems && (Array.isArray(problems) ? problems.length > 0 : Object.keys(problems).length > 0)) {
                const first = Array.isArray(problems) ? problems[0] : Object.values(problems)[0];
                console.log('First Problem Detail:', JSON.stringify(first, null, 2));
            }

            // Handle if problems is an object (preservekeys: true) or array
            let problemsList = [];
            if (Array.isArray(problems)) {
                problemsList = problems;
            } else if (problems && typeof problems === 'object') {
                problemsList = Object.values(problems);
            }

            // Filter out resolved problems (just in case) and apply keyword filter
            this.problems = problemsList.filter(p => {
                // Ensure it is NOT resolved
                if (p.r_eventid && p.r_eventid !== '0') return false;

                // Filter for Link/Interface related issues
                // Keywords: Link, Interface, Down, Ping, ICMP, OSPF, BGP, Tunnel, VPN, Connection
                const keywords = ['link', 'interface', 'down', 'ping', 'icmp', 'ospf', 'bgp', 'tunnel', 'vpn', 'connection', 'loss'];
                const text = (p.name + (p.tags ? JSON.stringify(p.tags) : '')).toLowerCase();
                return keywords.some(k => text.includes(k));
            }).sort((a, b) => b.clock - a.clock); // Client-side sort by date DESC

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
            let hostName = 'Unknown';
            if (p.hosts && p.hosts.length > 0) {
                hostName = p.hosts[0].name || p.hosts[0].host || 'Unknown';
            } else {
                console.warn('Problem with missing hosts:', p);
            }
            const hostId = p.hosts && p.hosts[0] ? p.hosts[0].hostid : null;

            // Severity class
            const severityClass = `severity-${p.severity}`; // 0-5

            // Acknowledge Logic
            // problem.get returns 'acknowledged' as "0" or "1"
            const isAck = (p.acknowledged === "1");
            const eventId = p.eventid;

            let actionBtn = '';
            // Always show button, but style it differently if acked
            // This allows adding more comments even if already acked
            const btnClass = isAck ? 'btn-small btn-success' : 'btn-small btn-warning';
            const btnIcon = isAck ? 'check-circle' : 'check-square';
            const btnTitle = isAck ? 'Adicionar comentário / Já reconhecido' : 'Reconhecer';

            if (eventId) {
                actionBtn = `
                    <button class="${btnClass}" onclick="window.linksDashboard.acknowledgeProblem('${eventId}')" title="${btnTitle}">
                        <i data-lucide="${btnIcon}"></i> Ack
                    </button>
                `;
            }

            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${date}</td>
                <td class="font-bold">${hostName}</td>
                <td class="${severityClass}">
                    ${p.name}
                    ${isAck ? '<span class="ml-2 text-xs text-gray-500">(Ack)</span>' : ''}
                </td>
                <td>${duration}</td>
                <td><div class="tags-wrapper">${tags}</div></td>
                <td>
                    <div class="flex gap-2">
                        ${actionBtn}
                    </div>
                </td>
            `;
            tbody.appendChild(row);
        });

        // Re-initialize icons for new elements
        if (window.lucide) window.lucide.createIcons();
    }

    async acknowledgeProblem(eventId) {
        const message = prompt("Digite um comentário para o reconhecimento (opcional):", "Investigando");
        if (message === null) return; // Cancelled

        try {
            await this.zabbixClient.acknowledgeEvent(eventId, message);
            alert("Evento reconhecido com sucesso!");
            this.loadData(); // Reload to show updated status
        } catch (error) {
            console.error("Erro ao reconhecer evento:", error);
            alert("Erro ao reconhecer evento: " + error.message);
        }
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

    generateBacklog() {
        if (!this.problems || this.problems.length === 0) {
            alert("Não há problemas para gerar backlog.");
            return;
        }

        let content = "__Backlog__\n\n";
        let count = 0;

        this.problems.forEach(p => {
            // Only include acknowledged problems
            if (p.acknowledged === "1") {
                let hostName = 'Unknown';
                if (p.hosts && p.hosts.length > 0) {
                    hostName = p.hosts[0].name || p.hosts[0].host || 'Unknown';
                }

                // Get latest ack message
                let message = "Sem comentário";
                if (p.acknowledges && p.acknowledges.length > 0) {
                    // Sort by clock desc just in case, though usually API returns sorted
                    const sortedAcks = p.acknowledges.sort((a, b) => b.clock - a.clock);
                    message = sortedAcks[0].message;
                }

                content += `${hostName} - ${message}\n\n`;
                count++;
            }
        });

        if (count === 0) {
            alert("Nenhum problema reconhecido (ack) encontrado para o backlog.");
            return;
        }

        // Download file
        const blob = new Blob([content], { type: 'text/plain' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `backlog_${new Date().toISOString().slice(0, 10)}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
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
