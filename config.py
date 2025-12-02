from pydantic_settings import BaseSettings
from typing import Optional
import json
import os

class Settings(BaseSettings):
    ZABBIX_URL: str = "https://zabbixbrasil.cencosud.corp/api_jsonrpc.php"
    ZABBIX_USER: Optional[str] = None
    ZABBIX_PASSWORD: Optional[str] = None
    SSH_USER: Optional[str] = None
    SSH_PASSWORD: Optional[str] = None

    class Config:
        env_file = ".env"
        extra = "ignore"

def load_config():
    # Load from .env first (via Pydantic)
    settings = Settings()
    
    # Fallback/Merge with config.json if it exists (for backward compatibility or non-sensitive data)
    if os.path.exists("config.json"):
        try:
            with open("config.json", "r") as f:
                data = json.load(f)
                # Map JSON keys to Env vars if not already set
                if not settings.ZABBIX_USER and data.get("zabbix", {}).get("user"):
                    settings.ZABBIX_USER = data["zabbix"]["user"]
                if not settings.ZABBIX_PASSWORD and data.get("zabbix", {}).get("password"):
                    settings.ZABBIX_PASSWORD = data["zabbix"]["password"]
                if not settings.SSH_USER and data.get("ssh", {}).get("user"):
                    settings.SSH_USER = data["ssh"]["user"]
                if not settings.SSH_PASSWORD and data.get("ssh", {}).get("password"):
                    settings.SSH_PASSWORD = data["ssh"]["password"]
                if not settings.ZABBIX_URL and data.get("zabbix", {}).get("url"):
                    settings.ZABBIX_URL = data["zabbix"]["url"]
        except Exception as e:
            print(f"Error loading config.json: {e}")
            
    return settings

settings = load_config()
