import requests
import json
import os
from datetime import datetime

class NotificationService:
    def __init__(self):
        self.config_path = "config.json"
        self.webhook_url = self._load_webhook_url()

    def _load_webhook_url(self):
        if os.path.exists(self.config_path):
            try:
                with open(self.config_path, "r") as f:
                    data = json.load(f)
                    return data.get("notifications", {}).get("webhook_url", "")
            except:
                return ""
        return ""

    def reload_config(self):
        self.webhook_url = self._load_webhook_url()

    def send_notification(self, title, message, level="info"):
        """
        Sends a notification via Webhook (Slack/Teams compatible format).
        Level: info, warning, error, critical
        """
        if not self.webhook_url:
            print("[Notification] No Webhook URL configured.")
            return False

        color = "#36a64f" # Green
        if level == "warning": color = "#ecb22e"
        elif level == "error": color = "#e01e5a"
        elif level == "critical": color = "#ff0000"

        try:
            # Detect Microsoft Teams Webhook (Workflows / Power Automate)
            if "office.com" in self.webhook_url or "webhook.office" in self.webhook_url:
                # Modern Adaptive Card Format
                payload = {
                    "type": "message",
                    "attachments": [
                        {
                            "contentType": "application/vnd.microsoft.card.adaptive",
                            "contentUrl": None,
                            "content": {
                                "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
                                "type": "AdaptiveCard",
                                "version": "1.4",
                                "body": [
                                    {
                                        "type": "TextBlock",
                                        "text": title,
                                        "size": "Large",
                                        "weight": "Bolder",
                                        "color": "Attention" if level in ["error", "critical"] else "Good"
                                    },
                                    {
                                        "type": "TextBlock",
                                        "text": message,
                                        "wrap": True
                                    },
                                    {
                                        "type": "FactSet",
                                        "facts": [
                                            {"title": "Level", "value": level.upper()},
                                            {"title": "Time", "value": datetime.now().strftime("%H:%M:%S")}
                                        ]
                                    }
                                ]
                            }
                        }
                    ]
                }
            # Discord
            elif "discord" in self.webhook_url:
                 payload = {"content": f"**{title}**\n{message}"}
            # Slack / Generic
            else:
                payload = {
                    "attachments": [
                        {
                            "color": color,
                            "title": title,
                            "text": message,
                            "footer": "Network Monitor",
                            "ts": datetime.now().timestamp()
                        }
                    ]
                }

            response = requests.post(self.webhook_url, json=payload, timeout=5)
            
            # 200=OK, 201=Created, 202=Accepted (Common for Workflows), 204=No Content
            if response.status_code in [200, 201, 202, 204]:
                print(f"[Notification] Sent: {title}")
                return True
            else:
                print(f"[Notification] Failed: {response.status_code} - {response.text}")
                return False
        except Exception as e:
            print(f"[Notification] Error: {e}")
            return False

notification_service = NotificationService()
