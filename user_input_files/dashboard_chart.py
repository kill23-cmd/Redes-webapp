# dashboard_chart.py
import tkinter as tk
from tkinter import ttk
from matplotlib.backends.backend_tkagg import FigureCanvasTkAgg
from matplotlib.figure import Figure
import matplotlib.dates as mdates

class DashboardChart(ttk.Frame):
    def __init__(self, parent, **kwargs):
        super().__init__(parent, **kwargs)
        
        self.fig = Figure(figsize=(6, 3), dpi=100)
        self.ax = self.fig.add_subplot(111)
        self.canvas = FigureCanvasTkAgg(self.fig, master=self)
        self.canvas.get_tk_widget().pack(fill=tk.BOTH, expand=True)
        
        self.hours_var = tk.StringVar(value="4")
        self.create_controls()
        
    def create_controls(self):
        control_frame = ttk.Frame(self)
        control_frame.pack(fill=tk.X, padx=5, pady=5)
        
        ttk.Label(control_frame, text="Período:").pack(side=tk.LEFT)
        ttk.Radiobutton(control_frame, text="4h", variable=self.hours_var, value="4", 
                       command=self.on_hours_change).pack(side=tk.LEFT, padx=5)
        ttk.Radiobutton(control_frame, text="8h", variable=self.hours_var, value="8", 
                       command=self.on_hours_change).pack(side=tk.LEFT)
    
    def plot_data(self, cpu_data, latency_data):
        """Recebe listas de {'time', 'value'} e desenha os gráficos."""
        self.ax.clear()
        
        # CPU (eixo esquerdo)
        if cpu_data:
            times = [d['time'] for d in cpu_data]
            cpu_vals = [d['value'] for d in cpu_data]
            self.ax.plot(times, cpu_vals, 'b-', label='CPU %', linewidth=2)
            self.ax.set_ylabel('CPU %', color='blue')
        
        # Latência (eixo direito)
        if latency_data:
            ax2 = self.ax.twinx()
            times = [d['time'] for d in latency_data]
            lat_vals = [d['value'] for d in latency_data]
            ax2.plot(times, lat_vals, 'r-', label='Latência (ms)', linewidth=2)
            ax2.set_ylabel('Latência ms', color='red')
        
        # Formatação
        self.ax.set_title('CPU e Latência - Últimas Horas')
        self.ax.xaxis.set_major_formatter(mdates.DateFormatter('%H:%M'))
        self.ax.grid(True, alpha=0.3)
        self.fig.autofmt_xdate()
        
        self.canvas.draw()
    
    def on_hours_change(self):
        """Callback quando muda de 4h para 8h."""
        # Esta função será sobrescrita pelo main_app
        pass