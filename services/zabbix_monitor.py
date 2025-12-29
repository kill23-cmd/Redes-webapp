import requests
import json
import urllib3
from config import settings

# Disable SSL warnings
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

class ZabbixMonitor:
    def __init__(self):
        self.url = settings.ZABBIX_URL
        self.user = settings.ZABBIX_USER
        self.password = settings.ZABBIX_PASSWORD
        self.auth_token = None

    def authenticate(self):
        if self.auth_token: return True
        
        try:
            payload = {
                "jsonrpc": "2.0",
                "method": "user.login",
                "params": {"user": self.user, "password": self.password},
                "id": 1
            }
            response = requests.post(self.url, json=payload, timeout=5, verify=False)
            data = response.json()
            if 'result' in data:
                self.auth_token = data['result']
                return True
        except Exception as e:
            print(f"[ZabbixMonitor] Auth Error: {e}")
        return False

    def get_problems(self, severity=4):
        """
        Get active problems with severity >= given level.
        Severity: 4=High, 5=Disaster
        """
        if not self.authenticate(): return []

        try:
            payload = {
                "jsonrpc": "2.0",
                "method": "problem.get",
                "params": {
                    "output": "extend",
                    "selectAcknowledges": "extend",
                    "severity": str(severity),
                    "sortfield": ["eventid"],
                    "sortorder": "DESC",
                    "recent": "true"
                },
                "auth": self.auth_token,
                "id": 2
            }
            response = requests.post(self.url, json=payload, timeout=10, verify=False)
            data = response.json()
            return data.get('result', [])
        except Exception as e:
            print(f"[ZabbixMonitor] Get Problems Error: {e}")
            return []

zabbix_monitor = ZabbixMonitor()
