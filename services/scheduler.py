from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger
import time
from .notifications import notification_service
from .zabbix_monitor import zabbix_monitor

scheduler = BackgroundScheduler()

# Simple in-memory state to avoid spamming alerts
# Format: { event_id: timestamp }
active_problems_cache = {}

def check_device_status():
    """
    Polls Zabbix for high severity problems and sends notifications.
    """
    global active_problems_cache
    print(f"[Scheduler] Checking Zabbix status at {time.strftime('%H:%M:%S')}...")
    
    problems = zabbix_monitor.get_problems(severity=4) # High or Disaster
    
    current_event_ids = set()
    
    for p in problems:
        event_id = p['eventid']
        current_event_ids.add(event_id)
        
        # If this is a NEW problem (not in cache)
        if event_id not in active_problems_cache:
            name = p.get('name', 'Unknown Problem')
            host = "Unknown Host" # In a real app, we'd fetch host info too
            
            # Send Notification
            title = f"🔴 ALERTA CRÍTICO: {name}"
            message = f"Novo problema detectado no Zabbix.\nID: {event_id}\nSeveridade: {p.get('severity')}"
            
            notification_service.send_notification(title, message, "critical")
            
            # Add to cache
            active_problems_cache[event_id] = time.time()
            
    # Cleanup resolved problems from cache
    # If an event ID is in cache but NOT in current problems, it's resolved
    resolved_ids = []
    for cached_id in active_problems_cache:
        if cached_id not in current_event_ids:
            resolved_ids.append(cached_id)
            
    for rid in resolved_ids:
        print(f"[Scheduler] Problem {rid} resolved.")
        notification_service.send_notification(
            "✅ Problema Resolvido", 
            f"O evento {rid} foi normalizado.", 
            "info"
        )
        del active_problems_cache[rid]

def start_scheduler():
    if not scheduler.running:
        # Run every 1 minute
        scheduler.add_job(
            check_device_status,
            trigger=IntervalTrigger(minutes=1),
            id='zabbix_check',
            name='Check Zabbix Status',
            replace_existing=True
        )
        scheduler.start()
        print("[Scheduler] Started background monitoring.")

def stop_scheduler():
    if scheduler.running:
        scheduler.shutdown()
