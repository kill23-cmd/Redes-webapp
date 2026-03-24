import paramiko
import re
import time
import logging
from typing import List, Dict, Any, Optional, Set

logger = logging.getLogger(__name__)

# ─── Classificação de dispositivos por palavras-chave ─────────────────────────
DEVICE_PATTERNS = {
    "firewall": [
        "FortiGate", "Fortinet", "ASA", "Cisco ASA", "Palo Alto", "PA-", "PAN-",
        "FGT", "FG-", "pfSense", "checkpoint"
    ],
    "ap": [
        "AIR-", "Aironet", "AP-", "WAP", "UAP", "Unifi", "Aruba AP", "IAP-",
        "C9120", "C9130", "C9115", "LAP", "WLC", "Air-",
        "Huawei AP", "AirEngine", "AP6", "AP7",
    ],
    "router": [
        "ISR", "ASR", "C8", "7500", "7200", "C1111", "C1100", "C2900",
        "MX", "SRX", "EX-Router",
    ],
    "switch": [
        "C2960", "C3750", "C3850", "C9200", "C9300", "C9400", "WS-C", "CAT",
        "S5700", "S6700", "S3700", "S2700", "CE6800", "CloudEngine",
        "FortiSwitch", "FSW", "FS-",
    ],
}


def classify_device(device_id: str, platform: str, capabilities: str = "") -> str:
    """
    Determina o tipo do dispositivo com base no ID, plataforma e capabilities CDP/LLDP.
    Retorna: 'switch' | 'ap' | 'firewall' | 'router' | 'unknown'
    """
    text = f"{device_id} {platform} {capabilities}".upper()

    # Capabilities CDP são a forma mais confiável
    caps_lower = capabilities.lower()
    if "trans-bridge" in caps_lower or "wlan-access-point" in caps_lower or "access point" in caps_lower:
        return "ap"
    if "router" in caps_lower and "switch" not in caps_lower:
        return "router"
    if "switch" in caps_lower and "router" not in caps_lower:
        return "switch"

    # Fallback por palavras-chave no modelo/hostname
    for device_type, patterns in DEVICE_PATTERNS.items():
        for pattern in patterns:
            if pattern.upper() in text:
                return device_type

    # FortiGate pelo hostname (FG*)
    if re.search(r'\bFG[T\-]', device_id, re.IGNORECASE):
        return "firewall"

    return "unknown"


def color_for_type(device_type: str) -> dict:
    """Retorna cores vis.js para cada tipo de dispositivo."""
    palette = {
        "switch":   {"background": "#10b981", "border": "#059669", "highlight": {"background": "#34d399", "border": "#059669"}},
        "ap":       {"background": "#a855f7", "border": "#7c3aed", "highlight": {"background": "#c084fc", "border": "#7c3aed"}},
        "firewall": {"background": "#ef4444", "border": "#b91c1c", "highlight": {"background": "#f87171", "border": "#b91c1c"}},
        "router":   {"background": "#3b82f6", "border": "#1d4ed8", "highlight": {"background": "#60a5fa", "border": "#1d4ed8"}},
        "unknown":  {"background": "#6b7280", "border": "#4b5563", "highlight": {"background": "#9ca3af", "border": "#4b5563"}},
    }
    return palette.get(device_type, palette["unknown"])


class DiscoveryService:

    INCLUDE_TYPES = {"switch", "ap", "firewall", "router"}  # Filtra somente estes

    def __init__(self):
        pass  # Cada chamada cria seu próprio client para ser thread-safe

    # ──────────────────────────────────────────────────────────────────────────
    # Ponto de entrada principal: descoberta recursiva a partir de um seed IP
    # ──────────────────────────────────────────────────────────────────────────
    def discover(
        self,
        host: str,
        username: str,
        password: str,
        max_hops: int = 1,           # 0 = só o seed; 1 = seed + vizinhos diretos
        include_types: Optional[Set[str]] = None,
    ) -> Dict[str, Any]:
        """
        Conecta ao dispositivo seed e descobre vizinhos via CDP/LLDP.
        Retorna grafo de nós e arestas prontos para vis.js.
        """
        include_types = include_types or self.INCLUDE_TYPES
        visited_ips: Set[str] = set()
        nodes: List[Dict] = []
        edges: List[Dict] = []

        try:
            self._discover_recursive(
                host=host,
                username=username,
                password=password,
                parent_id=None,
                visited=visited_ips,
                nodes=nodes,
                edges=edges,
                current_hop=0,
                max_hops=max_hops,
                include_types=include_types,
            )
            return {"success": True, "nodes": nodes, "edges": edges}
        except Exception as e:
            logger.error(f"[Discovery] Falha geral: {e}")
            return {"success": False, "error": str(e), "nodes": nodes, "edges": edges}

    def _discover_recursive(
        self,
        host: str,
        username: str,
        password: str,
        parent_id: Optional[str],
        visited: Set[str],
        nodes: List,
        edges: List,
        current_hop: int,
        max_hops: int,
        include_types: Set[str],
    ):
        if host in visited:
            return
        visited.add(host)

        # ── Conectar e rodar CDP/LLDP ──────────────────────────────────────
        output, seed_id, seed_model, seed_caps = self._run_neighbors_command(host, username, password)
        
        seed_type = classify_device(seed_id or host, seed_model or "", seed_caps or "")
        
        # Adicionar o próprio nó seed (sempre, independente de filtro)
        node_id = seed_id or host
        if not any(n["id"] == node_id for n in nodes):
            color = color_for_type(seed_type)
            nodes.append({
                "id": node_id,
                "label": self._short_name(node_id),
                "group": seed_type,
                "color": color,
                "font": {"color": "#ffffff"},
                "title": f"IP: {host}\nModelo: {seed_model or '?'}\nTipo: {seed_type}",
                "data": {
                    "ip": host,
                    "model": seed_model or "Desconhecido",
                    "type": seed_type,
                    "status": "UP",
                }
            })

        if parent_id and parent_id != node_id:
            edges.append({"from": parent_id, "to": node_id, "id": f"{parent_id}--{node_id}"})

        if not output or current_hop >= max_hops:
            return

        # ── Parsear vizinhos ───────────────────────────────────────────────
        neighbors = self._parse_neighbors(output)
        logger.info(f"[Discovery] {host} → {len(neighbors)} vizinhos encontrados")

        for neighbor in neighbors:
            n_id = neighbor.get("id", "")
            n_ip = neighbor.get("ip", "")
            n_model = neighbor.get("model", "")
            n_caps = neighbor.get("capabilities", "")
            n_type = classify_device(n_id, n_model, n_caps)

            # Filtrar por tipo de dispositivo desejado
            if n_type not in include_types:
                logger.debug(f"[Discovery] Ignorando {n_id} (tipo={n_type})")
                continue

            # Adicionar nó vizinho se ainda não existe
            if not any(n["id"] == n_id for n in nodes):
                color = color_for_type(n_type)
                nodes.append({
                    "id": n_id,
                    "label": self._short_name(n_id),
                    "group": n_type,
                    "color": color,
                    "font": {"color": "#ffffff"},
                    "title": f"IP: {n_ip or '?'}\nModelo: {n_model or '?'}\nInterface: {neighbor.get('local_interface', '?')}\nTipo: {n_type}",
                    "data": {
                        "ip": n_ip,
                        "model": n_model or "Desconhecido",
                        "type": n_type,
                        "status": "UP",
                        "local_interface": neighbor.get("local_interface", ""),
                        "remote_interface": neighbor.get("remote_interface", ""),
                    }
                })

            edge_id = f"{node_id}--{n_id}"
            rev_edge_id = f"{n_id}--{node_id}"
            if not any(e["id"] in [edge_id, rev_edge_id] for e in edges):
                label = neighbor.get("local_interface", "")
                edges.append({
                    "id": edge_id,
                    "from": node_id,
                    "to": n_id,
                    "label": label,
                    "font": {"size": 10, "color": "#9ca3af"},
                })

            # Recursão nos vizinhos que têm IP
            if n_ip and n_ip not in visited and current_hop + 1 < max_hops:
                self._discover_recursive(
                    host=n_ip,
                    username=username,
                    password=password,
                    parent_id=n_id,
                    visited=visited,
                    nodes=nodes,
                    edges=edges,
                    current_hop=current_hop + 1,
                    max_hops=max_hops,
                    include_types=include_types,
                )

    # ──────────────────────────────────────────────────────────────────────────
    # SSH helpers
    # ──────────────────────────────────────────────────────────────────────────
    def _run_neighbors_command(self, host: str, username: str, password: str):
        """
        Conecta via SSH e tenta: show cdp neighbors detail → show lldp neighbors detail
        Retorna (output, seed_hostname, seed_model, seed_capabilities)
        """
        ssh = paramiko.SSHClient()
        ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        output = ""
        seed_id = host
        seed_model = ""
        seed_caps = ""

        try:
            ssh.connect(host, username=username, password=password,
                        timeout=15, look_for_keys=False, allow_agent=False,
                        banner_timeout=15)

            # Tentar obter hostname do dispositivo
            try:
                _, stdout, _ = ssh.exec_command("show version | include cisco|Cisco|Huawei|hostname", timeout=5)
                version_out = stdout.read().decode("utf-8", errors="replace")
                h_match = re.search(r"hostname\s+(\S+)", version_out, re.IGNORECASE)
                if h_match:
                    seed_id = h_match.group(1)
                m_match = re.search(r"(Cisco|Huawei)\s+([\w\-]+)", version_out, re.IGNORECASE)
                if m_match:
                    seed_model = f"{m_match.group(1)} {m_match.group(2)}"
            except Exception:
                pass

            # CDP
            try:
                _, stdout, _ = ssh.exec_command("show cdp neighbors detail", timeout=15)
                cdp_out = stdout.read().decode("utf-8", errors="replace")
                if cdp_out and "Invalid input" not in cdp_out and len(cdp_out) > 20:
                    output = cdp_out
            except Exception:
                pass

            # LLDP como fallback (Huawei, FortiSwitch, etc.)
            if not output or len(output) < 30:
                try:
                    _, stdout, _ = ssh.exec_command("display lldp neighbor detail", timeout=15)
                    lldp_out = stdout.read().decode("utf-8", errors="replace")
                    if lldp_out and len(lldp_out) > 20:
                        output = lldp_out
                except Exception:
                    pass

            # LLDP Cisco como último fallback
            if not output or len(output) < 30:
                try:
                    _, stdout, _ = ssh.exec_command("show lldp neighbors detail", timeout=15)
                    lldp_cisco = stdout.read().decode("utf-8", errors="replace")
                    if lldp_cisco and len(lldp_cisco) > 20:
                        output = lldp_cisco
                except Exception:
                    pass

        except Exception as e:
            logger.warning(f"[Discovery] SSH failed for {host}: {e}")
        finally:
            try:
                ssh.close()
            except Exception:
                pass

        return output, seed_id, seed_model, seed_caps

    def _parse_neighbors(self, output: str) -> List[Dict[str, Any]]:
        """
        Parseia saídas de 'show cdp neighbors detail' ou 'display lldp neighbor detail'.
        Retorna lista de dicts com id, ip, model, capabilities, local_interface, remote_interface.
        """
        neighbors = []

        # ── CDP Cisco ──────────────────────────────────────────────────────
        # Separa por bloco (Device ID: ...)
        cdp_blocks = re.split(r'[-]{5,}', output)
        for block in cdp_blocks:
            if not block.strip():
                continue
            device = {}

            m = re.search(r'Device ID:\s*(.+)', block)
            if m:
                device["id"] = m.group(1).strip().split("(")[0].strip()

            for pat in [r'IP(?:v4)? address:\s*(\d[\d.]+)', r'IP Address:\s*(\d[\d.]+)']:
                m = re.search(pat, block, re.IGNORECASE)
                if m:
                    device["ip"] = m.group(1).strip()
                    break

            m = re.search(r'Platform:\s*(.*?),', block)
            if m:
                device["model"] = m.group(1).strip()

            m = re.search(r'Capabilities:\s*(.+)', block)
            if m:
                device["capabilities"] = m.group(1).strip()

            m = re.search(r'Interface:\s*([^,]+)', block)
            if m:
                device["local_interface"] = m.group(1).strip()

            m = re.search(r'Port ID \(outgoing port\):\s*(.+)', block)
            if m:
                device["remote_interface"] = m.group(1).strip()

            if "id" in device:
                neighbors.append(device)

        # ── LLDP Huawei (display lldp neighbor detail) ────────────────────
        # Só processar se não encontrou nada via CDP
        if not neighbors:
            huawei_blocks = re.split(r'(?=Port\s+\w+\s+has\s+\d+|Peer\s+information|System name)', output)
            for block in huawei_blocks:
                if not block.strip():
                    continue
                device = {}
                m = re.search(r'System name\s*:\s*(.+)', block)
                if m:
                    device["id"] = m.group(1).strip()
                m = re.search(r'System capability\s*:\s*(.+)', block)
                if m:
                    device["capabilities"] = m.group(1).strip()
                m = re.search(r'(?:Management address|IP address)\s*:\s*(\d[\d.]+)', block, re.IGNORECASE)
                if m:
                    device["ip"] = m.group(1).strip()
                m = re.search(r'System description\s*:\s*(.+)', block)
                if m:
                    device["model"] = m.group(1).strip()[:50]
                m = re.search(r'Neighbor interface\s*:\s*(.+)', block)
                if m:
                    device["remote_interface"] = m.group(1).strip()
                m = re.search(r'Local interface\s*:\s*(.+)', block)
                if m:
                    device["local_interface"] = m.group(1).strip()
                if "id" in device:
                    neighbors.append(device)

        return neighbors

    @staticmethod
    def _short_name(name: str) -> str:
        """Reduz hostname longo para exibição no nó: remove domínio e sufixos."""
        # Remove domínio (.cencosud.corp, .local, etc.)
        name = name.split(".")[0]
        # Trunca nomes muito longos
        return name[:20] if len(name) > 20 else name


discovery_service = DiscoveryService()
