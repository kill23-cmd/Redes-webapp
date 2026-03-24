/**
 * topology-map.js — Mapa de Topologia com Descoberta Automática via CDP/LLDP
 * Suporta: Switches, APs, Firewalls, Roteadores
 */

class TopologyMap {
    constructor() {
        this.network = null;
        this.nodes = new vis.DataSet([]);
        this.edges = new vis.DataSet([]);
        this.container = document.getElementById('topology-network');
        this.currentStoreId = null;
        this._retryCount = 0;

        // ── Opções vis.js ──────────────────────────────────────────────────
        this.options = {
            nodes: {
                font: { size: 13, color: '#ffffff', face: 'Inter, sans-serif' },
                borderWidth: 2,
                shadow: true,
            },
            edges: {
                width: 2,
                color: { color: '#4b5563', highlight: '#60a5fa', hover: '#93c5fd' },
                smooth: { type: 'continuous' },
                font: { size: 10, color: '#9ca3af', align: 'middle' },
                shadow: false,
            },
            groups: {
                switch: {
                    shape: 'box',
                    color: { background: '#10b981', border: '#059669', highlight: { background: '#34d399', border: '#059669' } },
                    font: { color: '#fff', bold: true },
                },
                ap: {
                    shape: 'ellipse',
                    color: { background: '#a855f7', border: '#7c3aed', highlight: { background: '#c084fc', border: '#7c3aed' } },
                    font: { color: '#fff' },
                },
                firewall: {
                    shape: 'diamond',
                    color: { background: '#ef4444', border: '#b91c1c', highlight: { background: '#f87171', border: '#b91c1c' } },
                    font: { color: '#fff', bold: true },
                    size: 30,
                },
                router: {
                    shape: 'dot',
                    color: { background: '#3b82f6', border: '#1d4ed8', highlight: { background: '#60a5fa', border: '#1d4ed8' } },
                    font: { color: '#fff' },
                    size: 25,
                },
                unknown: {
                    shape: 'dot',
                    color: { background: '#6b7280', border: '#4b5563', highlight: { background: '#9ca3af', border: '#4b5563' } },
                    font: { color: '#fff' },
                    size: 18,
                },
                cloud: {
                    shape: 'dot',
                    color: { background: '#374151', border: '#6b7280' },
                    font: { color: '#9ca3af' },
                    size: 20,
                },
            },
            physics: {
                enabled: true,
                solver: 'forceAtlas2Based',
                forceAtlas2Based: {
                    gravitationalConstant: -60,
                    centralGravity: 0.005,
                    springLength: 120,
                    springConstant: 0.08,
                    damping: 0.4,
                },
                stabilization: { iterations: 200, updateInterval: 25 },
            },
            interaction: {
                hover: true,
                tooltipDelay: 150,
                zoomView: true,
                dragView: true,
            },
        };

        this._buildScanPanel();
        this._buildLegend();
        this.initEvents();
    }

    // ── Painel de Scan por IP ──────────────────────────────────────────────
    _buildScanPanel() {
        const container = document.getElementById('topology-scan-panel');
        if (!container) return;

        container.innerHTML = `
            <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap; padding:10px 0;">
                <input id="topo-seed-ip" type="text" placeholder="IP do seed (ex: 192.168.1.1)"
                    style="flex:1; min-width:160px; padding:6px 10px; border-radius:6px;
                           background:#1f2937; border:1px solid #374151; color:#e5e7eb; font-size:13px;">

                <select id="topo-hops" title="Profundidade de busca"
                    style="padding:6px 8px; border-radius:6px; background:#1f2937;
                           border:1px solid #374151; color:#e5e7eb; font-size:13px;">
                    <option value="0">Só seed</option>
                    <option value="1" selected>1 hop</option>
                    <option value="2">2 hops</option>
                    <option value="3">3 hops</option>
                </select>

                <div style="display:flex; gap:4px; flex-wrap:wrap;">
                    <label style="font-size:12px; color:#9ca3af; display:flex; align-items:center; gap:3px; cursor:pointer;">
                        <input type="checkbox" id="filter-switch" checked> Switch
                    </label>
                    <label style="font-size:12px; color:#9ca3af; display:flex; align-items:center; gap:3px; cursor:pointer;">
                        <input type="checkbox" id="filter-ap" checked> AP
                    </label>
                    <label style="font-size:12px; color:#9ca3af; display:flex; align-items:center; gap:3px; cursor:pointer;">
                        <input type="checkbox" id="filter-firewall" checked> Firewall
                    </label>
                    <label style="font-size:12px; color:#9ca3af; display:flex; align-items:center; gap:3px; cursor:pointer;">
                        <input type="checkbox" id="filter-router"> Router
                    </label>
                </div>

                <button id="btn-auto-discover" style="padding:6px 14px; border-radius:6px;
                    background:#3b82f6; color:#fff; border:none; cursor:pointer; font-size:13px;
                    display:flex; align-items:center; gap:5px; white-space:nowrap;">
                    🔍 Descobrir
                </button>

                <button id="btn-topo-fit" title="Ajustar visualização"
                    style="padding:6px 10px; border-radius:6px; background:#374151;
                           color:#9ca3af; border:none; cursor:pointer; font-size:13px;">
                    ⊞ Fit
                </button>
            </div>
            <div id="topo-status" style="font-size:12px; color:#6b7280; margin-bottom:4px; min-height:18px;"></div>
        `;

        document.getElementById('btn-auto-discover')?.addEventListener('click', () => this._startAutoDiscover());
        document.getElementById('btn-topo-fit')?.addEventListener('click', () => this.network?.fit());
    }

    _buildLegend() {
        const el = document.getElementById('topology-legend');
        if (!el) return;
        el.innerHTML = `
            <div style="display:flex; gap:12px; flex-wrap:wrap; font-size:12px; color:#9ca3af; padding:6px 0;">
                <span>Legenda:</span>
                <span><span style="display:inline-block;width:12px;height:12px;background:#10b981;border-radius:2px;vertical-align:middle;margin-right:3px;"></span>Switch</span>
                <span><span style="display:inline-block;width:12px;height:12px;background:#a855f7;border-radius:50%;vertical-align:middle;margin-right:3px;"></span>AP</span>
                <span><span style="display:inline-block;width:12px;height:12px;background:#ef4444;border-radius:2px;transform:rotate(45deg);vertical-align:middle;margin-right:3px;"></span>Firewall</span>
                <span><span style="display:inline-block;width:12px;height:12px;background:#3b82f6;border-radius:50%;vertical-align:middle;margin-right:3px;"></span>Router</span>
                <span><span style="display:inline-block;width:12px;height:12px;background:#6b7280;border-radius:50%;vertical-align:middle;margin-right:3px;"></span>Desconhecido</span>
            </div>
        `;
    }

    _setStatus(msg, color = '#6b7280') {
        const el = document.getElementById('topo-status');
        if (el) el.innerHTML = `<span style="color:${color}">${msg}</span>`;
    }

    // ── Descoberta Automática ──────────────────────────────────────────────
    async _startAutoDiscover() {
        const seedIp = document.getElementById('topo-seed-ip')?.value?.trim();
        if (!seedIp) {
            this._setStatus('⚠ Informe o IP do dispositivo seed.', '#f59e0b');
            return;
        }

        const hops = parseInt(document.getElementById('topo-hops')?.value || '1', 10);
        const types = [];
        if (document.getElementById('filter-switch')?.checked) types.push('switch');
        if (document.getElementById('filter-ap')?.checked) types.push('ap');
        if (document.getElementById('filter-firewall')?.checked) types.push('firewall');
        if (document.getElementById('filter-router')?.checked) types.push('router');

        const btn = document.getElementById('btn-auto-discover');
        if (btn) { btn.disabled = true; btn.textContent = '⏳ Escaneando...'; }
        this._setStatus(`Conectando a ${seedIp}... aguarde.`, '#60a5fa');

        try {
            const resp = await fetch('/api/topology/discover', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    seed_ip: seedIp,
                    max_hops: hops,
                    include_types: types.length > 0 ? types : null,
                }),
            });

            const data = await resp.json();

            if (!resp.ok) {
                this._setStatus(`❌ Erro: ${data.detail || resp.statusText}`, '#ef4444');
                return;
            }

            const nodeCount = (data.nodes || []).length;
            const edgeCount = (data.edges || []).length;

            if (nodeCount === 0) {
                this._setStatus('Nenhum dispositivo encontrado. Verifique IP e credenciais SSH no .env.', '#f59e0b');
                return;
            }

            this.render(data);

            const errMsg = data.error ? ` (aviso: ${data.error})` : '';
            this._setStatus(
                `✅ ${nodeCount} dispositivo(s), ${edgeCount} link(s) descoberto(s)${errMsg}`,
                data.error ? '#f59e0b' : '#10b981'
            );

        } catch (err) {
            console.error('[TopologyMap] Discover error:', err);
            this._setStatus(`❌ Erro de rede: ${err.message}`, '#ef4444');
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = '🔍 Descobrir'; }
        }
    }

    // ── Eventos do modal e nós ─────────────────────────────────────────────
    initEvents() {
        const modal = document.getElementById('topology-modal');
        const btnOpen = document.getElementById('btn-topology-map');
        const btnClose = document.getElementById('close-topology');
        const btnRefresh = document.getElementById('refresh-topology');
        const btnScan = document.getElementById('scan-topology');

        btnOpen?.addEventListener('click', () => this.open(this.currentStoreId));

        btnClose?.addEventListener('click', () => {
            modal?.classList.add('hidden');
            modal?.classList.remove('flex');
        });

        btnRefresh?.addEventListener('click', () => this.loadTopology(this.currentStoreId));

        btnScan?.addEventListener('click', () => {
            if (confirm('Scan em tempo real via CDP/LLDP. Continuar?')) {
                this._startAutoDiscover();
            }
        });

        modal?.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.add('hidden');
                modal.classList.remove('flex');
            }
        });

        // Node Details Modal
        const detailsModal = document.getElementById('node-details-modal');
        const closeDetails = document.getElementById('close-node-details');
        closeDetails?.addEventListener('click', () => {
            detailsModal?.classList.add('hidden');
            detailsModal?.classList.remove('flex');
        });
        detailsModal?.addEventListener('click', (e) => {
            if (e.target === detailsModal) {
                detailsModal.classList.add('hidden');
                detailsModal.classList.remove('flex');
            }
        });
    }

    showNodeDetails(node) {
        const modal = document.getElementById('node-details-modal');
        if (!modal || !node) return;

        document.getElementById('node-detail-name').textContent = node.label || node.id;
        const data = node.data || {};
        document.getElementById('node-detail-ip').textContent = data.ip || '--';
        document.getElementById('node-detail-model').textContent = data.model || '--';
        document.getElementById('node-detail-uptime').textContent = data.uptime || '--';

        const statusEl = document.getElementById('node-detail-status');
        const status = data.status || 'Unknown';
        if (statusEl) {
            statusEl.textContent = status;
            statusEl.className = status === 'UP'
                ? 'text-green-400 font-medium text-right'
                : status === 'DOWN'
                    ? 'text-red-400 font-medium text-right'
                    : 'text-gray-400 font-medium text-right';
        }

        // Tipo de dispositivo (bonus info)
        const typeEl = document.getElementById('node-detail-type');
        if (typeEl) {
            typeEl.textContent = data.type || node.group || '--';
        }

        // Interfaces da aresta
        const ifaceEl = document.getElementById('node-detail-interface');
        if (ifaceEl) {
            ifaceEl.textContent = data.local_interface
                ? `${data.local_interface} → ${data.remote_interface || '?'}`
                : '--';
        }

        const btnSSH = document.getElementById('btn-node-ssh');
        if (btnSSH && data.ip) {
            btnSSH.onclick = () => {
                // Preencher host no painel SSH e mudar para aba SSH se possível
                if (window.dashboard && data.ip) {
                    window.dashboard.selectHostByIp?.(data.ip);
                }
                modal.classList.add('hidden');
                modal.classList.remove('flex');
            };
        }

        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }

    // ── Carregamento de topologia mock ──────────────────────────────────────
    open(storeId = null) {
        const modal = document.getElementById('topology-modal');
        if (modal) {
            modal.classList.remove('hidden');
            modal.classList.add('flex');
            // Apenas renderizar mock se não houver dados ainda
            if (this.nodes.length === 0) {
                this.loadTopology(storeId);
            } else {
                // Refitar se já houver dados
                setTimeout(() => this.network?.fit(), 200);
            }
        }
    }

    async loadTopology(storeId = null, mode = 'mock') {
        this.currentStoreId = storeId;
        this._setStatus('Carregando topologia de exemplo...', '#60a5fa');

        try {
            let url = '/api/topology';
            const params = new URLSearchParams();
            if (storeId) params.append('store_id', storeId);
            if (mode) params.append('mode', mode);
            if ([...params].length > 0) url += `?${params.toString()}`;

            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const data = await response.json();
            if (!data.nodes || data.nodes.length === 0) {
                this._setStatus('Nenhum nó retornado. Use "Descobrir" para scan real.', '#f59e0b');
                return;
            }

            this.render(data);
            this._setStatus(`Topologia de exemplo — ${data.nodes.length} nós. Use "Descobrir" para dados reais.`, '#6b7280');
        } catch (error) {
            console.error('[TopologyMap] Load error:', error);
            this._setStatus(`Erro ao carregar: ${error.message}`, '#ef4444');
        }
    }

    // ── Renderizador vis.js ────────────────────────────────────────────────
    render(data) {
        if (this.container.offsetWidth < 10 && this._retryCount < 4) {
            this._retryCount++;
            setTimeout(() => this.render(data), 150);
            return;
        }
        this._retryCount = 0;

        // Normalizar nós: garantir que group seja um dos grupos definidos
        const validGroups = new Set(['switch', 'ap', 'firewall', 'router', 'cloud', 'unknown']);
        const normalized = (data.nodes || []).map(n => ({
            ...n,
            group: validGroups.has(n.group) ? n.group : 'unknown',
        }));

        this.nodes.clear();
        this.edges.clear();
        this.nodes.add(normalized);
        this.edges.add(data.edges || []);

        if (!this.network) {
            this.network = new vis.Network(
                this.container,
                { nodes: this.nodes, edges: this.edges },
                this.options
            );

            this.network.on('click', (params) => {
                if (params.nodes.length > 0) {
                    const node = this.nodes.get(params.nodes[0]);
                    this.showNodeDetails(node);
                }
            });

            this.network.on('stabilizationIterationsDone', () => {
                this.network.fit({ animation: { duration: 600, easingFunction: 'easeInOutQuad' } });
                this.network.setOptions({ physics: { enabled: false } });
            });

        } else {
            this.network.setOptions({ physics: { enabled: true } });
            this.network.setData({ nodes: this.nodes, edges: this.edges });
            this.network.once('stabilizationIterationsDone', () => {
                this.network.fit({ animation: { duration: 600, easingFunction: 'easeInOutQuad' } });
                this.network.setOptions({ physics: { enabled: false } });
            });
        }
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.topologyMap = new TopologyMap();
});
