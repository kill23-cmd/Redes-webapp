class ChartManager {
    constructor() {
        this.charts = {};
        this.defaultOptions = {
            responsive: true, maintainAspectRatio: false,
            animation: { duration: 0 },
            plugins: { legend: { labels: { color: 'var(--text-main)' } } },
            scales: {
                x: {
                    type: 'time', time: { unit: 'minute', displayFormats: { minute: 'HH:mm' } },
                    grid: { color: 'var(--border)' }, ticks: { color: 'var(--text-muted)' }
                },
                y: {
                    grid: { color: 'var(--border)' }, ticks: { color: 'var(--text-muted)' },
                    beginAtZero: true
                }
            }
        };
    }

    createGaugeChart(canvasId, type = 'cpu') {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return null;
        if (this.charts[canvasId]) this.charts[canvasId].destroy();

        const ctx = canvas.getContext('2d');
        const config = {
            type: 'doughnut',
            data: { datasets: [{ data: [0, 100], backgroundColor: ['var(--accent)', 'var(--bg-card-hover)'], borderWidth: 0, cutout: '75%' }] },
            options: { rotation: -90, circumference: 180, plugins: { legend: { display: false }, tooltip: { enabled: false } } }
        };
        this.charts[canvasId] = new Chart(ctx, config);
        return this.charts[canvasId];
    }

    updateGaugeChart(canvasId, percentage) {
        const chart = this.charts[canvasId];
        if (!chart) return this.createGaugeChart(canvasId);

        const val = Math.max(0, Math.min(100, percentage));
        chart.data.datasets[0].data = [val, 100 - val];
        let color = 'var(--accent)';
        if (val > 80) color = 'var(--error)'; else if (val > 60) color = '#f59e0b';
        chart.data.datasets[0].backgroundColor = [color, 'var(--bg-card-hover)'];
        chart.update();
    }

    createTrafficChart(canvasId) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return null;
        if (this.charts[canvasId]) this.charts[canvasId].destroy();

        const ctx = canvas.getContext('2d');
        const config = {
            type: 'line',
            data: {
                datasets: [
                    { label: 'Upload (Mbps)', data: [], borderColor: 'var(--accent)', backgroundColor: 'rgba(56, 189, 248, 0.1)', fill: true, borderWidth: 1 },
                    { label: 'Download (Mbps)', data: [], borderColor: 'var(--success)', backgroundColor: 'rgba(34, 197, 94, 0.1)', fill: true, borderWidth: 1 }
                ]
            },
            options: this.defaultOptions
        };
        this.charts[canvasId] = new Chart(ctx, config);
        return this.charts[canvasId];
    }

    updateTrafficChart(canvasId, uploadData, downloadData) {
        let chart = this.charts[canvasId];
        if (!chart) chart = this.createTrafficChart(canvasId);

        chart.data.datasets[0].data = uploadData;
        chart.data.datasets[1].data = downloadData;
        chart.update();
    }

    resizeAllCharts() { Object.values(this.charts).forEach(c => c.resize()); }
}

class DashboardCharts {
    constructor() {
        this.chartManager = new ChartManager();
        this.setupCharts();
    }

    setupCharts() {
        this.chartManager.createGaugeChart('cpu-gauge');
        this.chartManager.createGaugeChart('memory-gauge');
        this.chartManager.createTrafficChart('wan1-traffic-chart');
        this.chartManager.createTrafficChart('wan2-traffic-chart');
    }

    handleResize() { this.chartManager.resizeAllCharts(); }
}

document.addEventListener('DOMContentLoaded', () => { window.dashboardCharts = new DashboardCharts(); });