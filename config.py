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
    API_TOKEN: Optional[str] = None
    PLAI_API_KEY: Optional[str] = None
    PLAI_AGENT_ID: Optional[str] = None
    # Chaves TACACS — carregadas do .env, nunca hardcoded no código
    TACACS_KEY_PRIMARIO: Optional[str] = None
    TACACS_KEY_SECUNDARIO: Optional[str] = None
    TACACS_KEY_FORTI: Optional[str] = None

    class Config:
        env_file = ".env"
        extra = "ignore"

def load_config():
    # Carrega do .env via Pydantic (fonte única de verdade para credenciais)
    settings = Settings()
    
    # Fallback com config.json apenas para URL do Zabbix e notificações
    if os.path.exists("config.json"):
        try:
            with open("config.json", "r") as f:
                data = json.load(f)
                # Apenas URL — credenciais não são mais salvas no config.json
                if not settings.ZABBIX_URL and data.get("zabbix", {}).get("url"):
                    settings.ZABBIX_URL = data["zabbix"]["url"]
        except Exception as e:
            print(f"Error loading config.json: {e}")
            
    return settings

settings = load_config()
