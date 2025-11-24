// ============================================
// CHARTS - Chart.js integration and management
// ============================================

class ChartManager {
    constructor() {
        this.charts = {};
        this.defaultOptions = this.getDefaultChartOptions();
    }
    
    /**
     * Get default chart configuration options
     * @returns {Object} Default chart options
     */
    getDefaultChartOptions() {
        return {
            responsive: true,
            maintainAspectRatio: false,
            animation: {
                duration: 800,
                easing: 'easeOutQuart'
            },
            plugins: {
                legend: {
                    position: 'top',
                    labels: {
                        color: 'var(--neutral-200)',
                        font: {
                            family: 'Inter',
                            size: 12
                        },
                        usePointStyle: true,
                        pointStyle: 'line'
                    }
                },
                tooltip: {
                    backgroundColor: 'var(--neutral-800)',
                    titleColor: 'var(--neutral-200)',
                    bodyColor: 'var(--neutral-200)',
                    borderColor: 'var(--neutral-800)',
                    borderWidth: 1,
                    cornerRadius: 8,
                    displayColors: true,
                    intersect: false,
                    mode: 'index'
                }
            },
            scales: {
                x: {
                    type: 'time',
                    time: {
                        displayFormats: {
                            hour: 'HH:mm',
                            day: 'dd/MM'
                        }
                    },
                    grid: {
                        color: 'var(--neutral-800)',
                        drawBorder: false
                    },
                    ticks: {
                        color: 'var(--neutral-400)',
                        font: {
                            family: 'Inter',
                            size: 11
                        }
                    }
                },
                y: {
                    grid: {
                        color: 'var(--neutral-800)',
                        drawBorder: false
                    },
                    ticks: {
                        color: 'var(--neutral-400)',
                        font: {
                            family: 'Inter',
                            size: 11
                        }
                    }
                }
            },
            interaction: {
                intersect: false,
                mode: 'index'
            }
        };
    }
    
    /**
     * Create CPU/Memory gauge chart
     * @param {string} canvasId - Canvas element ID
     * @param {string} type - Chart type ('cpu' or 'memory')
     */
    createGaugeChart(canvasId, type = 'cpu') {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return null;
        
        const ctx = canvas.getContext('2d');
        
        const data = {
            datasets: [{
                data: [0, 100], // Start with 0% usage
                backgroundColor: ['var(--primary-300)', 'var(--neutral-800)'],
                borderWidth: 0,
                cutout: '75%'
            }]
        };
        
        const config = {
            type: 'doughnut',
            data: data,
            options: {
                ...this.defaultOptions,
                rotation: -90,
                circumference: 180,
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        enabled: false
                    }
                }
            }
        };
        
        const chart = new Chart(ctx, config);
        this.charts[canvasId] = chart;
        
        return chart;
    }
    
    /**
     * Update gauge chart with new value
     * @param {string} canvasId - Canvas element ID
     * @param {number} percentage - Percentage value (0-100)
     */
    updateGaugeChart(canvasId, percentage) {
        const chart = this.charts[canvasId];
        if (!chart) return;
        
        const clampedPercentage = Math.max(0, Math.min(100, percentage));
        chart.data.datasets[0].data = [clampedPercentage, 100 - clampedPercentage];
        
        // Update color based on value
        let color = 'var(--primary-300)'; // Blue for normal
        if (clampedPercentage > 80) {
            color = 'var(--error)'; // Red for high usage
        } else if (clampedPercentage > 60) {
            color = 'var(--warning)'; // Orange for medium usage
        }
        
        chart.data.datasets[0].backgroundColor = [color, 'var(--neutral-800)'];
        chart.update('active');
    }
    
    /**
     * Create traffic chart (line chart for WAN traffic)
     * @param {string} canvasId - Canvas element ID
     * @param {string} title - Chart title
     */
    createTrafficChart(canvasId, title) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return null;
        
        const ctx = canvas.getContext('2d');
        
        const data = {
            datasets: [
                {
                    label: 'Upload',
                    data: [],
                    borderColor: 'var(--primary-300)',
                    backgroundColor: 'rgba(0, 184, 217, 0.1)',
                    tension: 0.4,
                    fill: true
                },
                {
                    label: 'Download',
                    data: [],
                    borderColor: 'var(--success)',
                    backgroundColor: 'rgba(34, 197, 94, 0.1)',
                    tension: 0.4,
                    fill: true
                }
            ]
        };
        
        const options = {
            ...this.defaultOptions,
            plugins: {
                ...this.defaultOptions.plugins,
                title: {
                    display: false
                }
            },
            scales: {
                ...this.defaultOptions.scales,
                y: {
                    ...this.defaultOptions.scales.y,
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Mbps',
                        color: 'var(--neutral-400)',
                        font: {
                            family: 'Inter',
                            size: 11
                        }
                    }
                }
            }
        };
        
        const chart = new Chart(ctx, {
            type: 'line',
            data: data,
            options: options
        });
        
        this.charts[canvasId] = chart;
        return chart;
    }
    
    /**
     * Update traffic chart with new data
     * @param {string} canvasId - Canvas element ID
     * @param {Array} uploadData - Upload data points
     * @param {Array} downloadData - Download data points
     */
    updateTrafficChart(canvasId, uploadData, downloadData) {
        const chart = this.charts[canvasId];
        if (!chart) return;
        
        chart.data.datasets[0].data = uploadData;
        chart.data.datasets[1].data = downloadData;
        chart.update('none');
    }
    
    /**
     * Create CPU/Latency historical chart
     * @param {string} canvasId - Canvas element ID
     */
    createHistoricalChart(canvasId) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return null;
        
        const ctx = canvas.getContext('2d');
        
        const data = {
            datasets: [
                {
                    label: 'CPU %',
                    data: [],
                    borderColor: 'var(--primary-300)',
                    backgroundColor: 'rgba(0, 184, 217, 0.1)',
                    yAxisID: 'y',
                    tension: 0.4,
                    fill: false
                },
                {
                    label: 'Latência (ms)',
                    data: [],
                    borderColor: 'var(--error)',
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    yAxisID: 'y1',
                    tension: 0.4,
                    fill: false
                }
            ]
        };
        
        const options = {
            ...this.defaultOptions,
            plugins: {
                ...this.defaultOptions.plugins,
                title: {
                    display: false
                }
            },
            scales: {
                x: this.defaultOptions.scales.x,
                y: {
                    ...this.defaultOptions.scales.y,
                    type: 'linear',
                    display: true,
                    position: 'left',
                    title: {
                        display: true,
                        text: 'CPU %',
                        color: 'var(--primary-300)'
                    },
                    grid: {
                        color: 'var(--neutral-800)'
                    }
                },
                y1: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    title: {
                        display: true,
                        text: 'Latência (ms)',
                        color: 'var(--error)'
                    },
                    grid: {
                        drawOnChartArea: false
                    }
                }
            }
        };
        
        const chart = new Chart(ctx, {
            type: 'line',
            data: data,
            options: options
        });
        
        this.charts[canvasId] = chart;
        return chart;
    }
    
    /**
     * Update historical chart
     * @param {string} canvasId - Canvas element ID
     * @param {Array} cpuData - CPU data points
     * @param {Array} latencyData - Latency data points
     */
    updateHistoricalChart(canvasId, cpuData, latencyData) {
        const chart = this.charts[canvasId];
        if (!chart) return;
        
        chart.data.datasets[0].data = cpuData;
        chart.data.datasets[1].data = latencyData;
        chart.update('none');
    }
    
    /**
     * Generate mock historical data for demo
     * @param {number} hours - Number of hours of data
     * @returns {Object} Mock data for CPU and latency
     */
    generateMockHistoricalData(hours = 4) {
        const now = Date.now();
        const points = hours * 12; // 12 points per hour (every 5 minutes)
        const dataPoints = [];
        
        for (let i = 0; i < points; i++) {
            const timestamp = now - (points - i) * 5 * 60 * 1000; // 5 minute intervals
            
            // Generate realistic CPU data (mostly low with occasional spikes)
            let cpuValue = Math.random() * 10; // Base load 0-10%
            if (Math.random() > 0.9) {
                cpuValue += Math.random() * 30; // Occasional spike
            }
            cpuValue = Math.min(100, cpuValue);
            
            // Generate realistic latency data
            let latencyValue = Math.random() * 50 + 10; // Base latency 10-60ms
            if (Math.random() > 0.95) {
                latencyValue += Math.random() * 100; // Occasional high latency
            }
            
            dataPoints.push({
                timestamp,
                cpu: cpuValue,
                latency: latencyValue
            });
        }
        
        return {
            cpu: dataPoints.map(point => ({
                x: new Date(point.timestamp),
                y: point.cpu
            })),
            latency: dataPoints.map(point => ({
                x: new Date(point.timestamp),
                y: point.latency
            }))
        };
    }
    
    /**
     * Generate mock WAN traffic data
     * @param {number} hours - Number of hours of data
     * @returns {Object} Mock traffic data
     */
    generateMockTrafficData(hours = 4) {
        const now = Date.now();
        const points = hours * 12; // 12 points per hour
        const uploadData = [];
        const downloadData = [];
        
        for (let i = 0; i < points; i++) {
            const timestamp = now - (points - i) * 5 * 60 * 1000;
            
            // Generate realistic traffic patterns
            const uploadValue = Math.random() * 50 + Math.sin(i / 12 * Math.PI * 2) * 20;
            const downloadValue = Math.random() * 80 + Math.cos(i / 12 * Math.PI * 2) * 30;
            
            uploadData.push({
                x: new Date(timestamp),
                y: Math.max(0, uploadValue)
            });
            
            downloadData.push({
                x: new Date(timestamp),
                y: Math.max(0, downloadValue)
            });
        }
        
        return { upload: uploadData, download: downloadData };
    }
    
    /**
     * Destroy chart
     * @param {string} canvasId - Canvas element ID
     */
    destroyChart(canvasId) {
        const chart = this.charts[canvasId];
        if (chart) {
            chart.destroy();
            delete this.charts[canvasId];
        }
    }
    
    /**
     * Destroy all charts
     */
    destroyAllCharts() {
        Object.keys(this.charts).forEach(canvasId => {
            this.destroyChart(canvasId);
        });
    }
    
    /**
     * Resize all charts (call on window resize)
     */
    resizeAllCharts() {
        Object.values(this.charts).forEach(chart => {
            chart.resize();
        });
    }
}

// ============================================
// CHART INITIALIZATION AND SETUP
// ============================================

class DashboardCharts {
    constructor() {
        this.chartManager = new ChartManager();
        this.setupCharts();
        this.startRealTimeUpdates();
    }
    
    /**
     * Initialize all dashboard charts
     */
    setupCharts() {
        // CPU Gauge
        this.cpuGauge = this.chartManager.createGaugeChart('cpu-gauge', 'cpu');
        
        // Memory Gauge
        this.memoryGauge = this.chartManager.createGaugeChart('memory-gauge', 'memory');
        
        // Traffic Charts
        this.wan1TrafficChart = this.chartManager.createTrafficChart('wan1-traffic-chart');
        this.wan2TrafficChart = this.chartManager.createTrafficChart('wan2-traffic-chart');
        
        // Historical Chart
        this.historicalChart = this.chartManager.createHistoricalChart('historical-chart');
        
        // Load initial mock data
        this.loadMockData();
    }
    
    /**
     * Load mock data for demonstration
     */
    loadMockData() {
        // Update gauges
        this.chartManager.updateGaugeChart('cpu-gauge', 15);
        this.chartManager.updateGaugeChart('memory-gauge', 55);
        
        // Load traffic data
        const trafficData1 = this.chartManager.generateMockTrafficData(4);
        const trafficData2 = this.chartManager.generateMockTrafficData(4);
        
        this.chartManager.updateTrafficChart('wan1-traffic-chart', trafficData1.upload, trafficData1.download);
        this.chartManager.updateTrafficChart('wan2-traffic-chart', trafficData2.upload, trafficData2.download);
        
        // Load historical data
        const historicalData = this.chartManager.generateMockHistoricalData(4);
        this.chartManager.updateHistoricalChart('historical-chart', historicalData.cpu, historicalData.latency);
    }
    
    /**
     * Update charts with real data (to be called from dashboard)
     * @param {Object} realData - Real data from Zabbix
     */
    updateWithRealData(realData) {
        // Update CPU gauge
        if (realData.cpu) {
            const cpuValue = parseFloat(realData.cpu.replace('%', ''));
            this.chartManager.updateGaugeChart('cpu-gauge', cpuValue);
        }
        
        // Update memory gauge (would need real memory data)
        // this.chartManager.updateGaugeChart('memory-gauge', memoryValue);
        
        // Update traffic charts with real data
        if (realData.traffic) {
            this.chartManager.updateTrafficChart('wan1-traffic-chart', 
                realData.traffic.wan1.upload, 
                realData.traffic.wan1.download
            );
            this.chartManager.updateTrafficChart('wan2-traffic-chart', 
                realData.traffic.wan2.upload, 
                realData.traffic.wan2.download
            );
        }
        
        // Update historical chart
        if (realData.historical) {
            this.chartManager.updateHistoricalChart('historical-chart', 
                realData.historical.cpu, 
                realData.historical.latency
            );
        }
    }
    
    /**
     * Start real-time updates (mock implementation)
     */
    startRealTimeUpdates() {
        setInterval(() => {
            // Simulate real-time updates with small random changes
            const currentCpuGauge = this.chartManager.charts['cpu-gauge'];
            if (currentCpuGauge) {
                const currentData = currentCpuGauge.data.datasets[0].data[0];
                const change = (Math.random() - 0.5) * 5; // -2.5 to +2.5
                const newValue = Math.max(0, Math.min(100, currentData + change));
                this.chartManager.updateGaugeChart('cpu-gauge', newValue);
            }
            
            // Update traffic charts with new data points
            const now = new Date();
            
            // Add new points to traffic charts
            const uploadValue = Math.random() * 50;
            const downloadValue = Math.random() * 80;
            
            // WAN1
            const wan1Chart = this.chartManager.charts['wan1-traffic-chart'];
            if (wan1Chart) {
                wan1Chart.data.datasets[0].data.push({ x: now, y: uploadValue });
                wan1Chart.data.datasets[1].data.push({ x: now, y: downloadValue });
                
                // Keep only last 50 points
                if (wan1Chart.data.datasets[0].data.length > 50) {
                    wan1Chart.data.datasets[0].data.shift();
                    wan1Chart.data.datasets[1].data.shift();
                }
                
                wan1Chart.update('none');
            }
            
            // WAN2
            const wan2Chart = this.chartManager.charts['wan2-traffic-chart'];
            if (wan2Chart) {
                wan2Chart.data.datasets[0].data.push({ x: now, y: uploadValue * 0.8 });
                wan2Chart.data.datasets[1].data.push({ x: now, y: downloadValue * 0.6 });
                
                // Keep only last 50 points
                if (wan2Chart.data.datasets[0].data.length > 50) {
                    wan2Chart.data.datasets[0].data.shift();
                    wan2Chart.data.datasets[1].data.shift();
                }
                
                wan2Chart.update('none');
            }
            
        }, 5000); // Update every 5 seconds
    }
    
    /**
     * Handle window resize
     */
    handleResize() {
        this.chartManager.resizeAllCharts();
    }
}

// Initialize charts when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.dashboardCharts = new DashboardCharts();
    
    // Handle window resize
    window.addEventListener('resize', debounce(() => {
        if (window.dashboardCharts) {
            window.dashboardCharts.handleResize();
        }
    }, 300));
});

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        ChartManager,
        DashboardCharts
    };
}