import random
from config import settings
from services.discovery import discovery_service

class TopologyService:
    def __init__(self):
        pass

    def get_topology_data(self, store_id=None, mode="mock"):
        """
        Generates the network topology graph (Nodes and Edges).
        If store_id is provided, generates a topology specific to that store.
        """
        if mode == "realtime" and store_id:
            return self.get_realtime_topology(store_id)

        nodes = []
        edges = []

        # 1. Core Network (Always present)
        core_router = {"id": "core-router-01", "label": "Core Router", "group": "router", "level": 0}
        nodes.append(core_router)

        internet = {"id": "internet", "label": "Internet", "group": "cloud", "level": 0}
        nodes.append(internet)
        edges.append({"from": "internet", "to": "core-router-01"})

        # 2. Distribution Switches
        dist_switches = ["dist-sw-01", "dist-sw-02"]
        for sw in dist_switches:
            nodes.append({"id": sw, "label": sw.upper(), "group": "switch", "level": 1})
            edges.append({"from": "core-router-01", "to": sw})

        # 3. Store Specific Topology
        if store_id:
            # Generate topology for the specific store
            self._add_store_nodes(nodes, edges, store_id, dist_switches)
        else:
            # Default demo: generate 5 random stores
            for i in range(1, 6):
                self._add_store_nodes(nodes, edges, f"loja-{i:03d}", dist_switches)

        return {"nodes": nodes, "edges": edges}

    def get_realtime_topology(self, store_id):
        """
        Performs real-time discovery using SSH.
        """
        # In a real app, we'd resolve the store's IP from Zabbix or DB
        # For now, we'll use a placeholder IP or the one from settings if available
        # Assuming the store_id maps to a specific gateway/switch IP
        
        # Mocking IP resolution for demo purposes
        target_ip = "192.168.10.2" 
        
        # Get credentials from settings
        username = settings.SSH_USER or "admin"
        password = settings.SSH_PASSWORD or "password"
        
        result = discovery_service.discover(target_ip, username, password)
        
        nodes = []
        edges = []
        
        # Add the seed node (The Switch we connected to)
        seed_id = f"sw-{store_id.lower()}"
        nodes.append({
            "id": seed_id,
            "label": f"Switch {store_id}",
            "group": "switch",
            "level": 1,
            "data": {
                "ip": target_ip,
                "status": "UP",
                "model": "Detected via SSH"
            }
        })
        
        if result["success"]:
            neighbors = result["neighbors"]
            for i, neighbor in enumerate(neighbors):
                n_id = neighbor.get("id", f"dev-{i}")
                n_label = neighbor.get("id", "Unknown Device")
                n_ip = neighbor.get("ip", "0.0.0.0")
                n_model = neighbor.get("model", "Unknown")
                
                # Determine group based on model/id
                group = "switch"
                if "AIR" in n_model or "AP" in n_id:
                    group = "ap"
                elif "Phone" in n_model:
                    group = "phone"
                elif "Router" in n_model:
                    group = "router"
                
                nodes.append({
                    "id": n_id,
                    "label": n_label,
                    "group": group,
                    "level": 2,
                    "data": {
                        "ip": n_ip,
                        "model": n_model,
                        "status": "UP"
                    }
                })
                
                edges.append({"from": seed_id, "to": n_id})
        else:
            # Fallback or Error Node
            nodes.append({
                "id": "error-node",
                "label": f"Discovery Failed: {result.get('error')}",
                "group": "cloud",
                "level": 2,
                "color": "red"
            })
            edges.append({"from": seed_id, "to": "error-node"})

        return {"nodes": nodes, "edges": edges}

    def _add_store_nodes(self, nodes, edges, store_id, uplinks):
        clean_id = store_id.lower().replace(" ", "-")
        switch_id = f"sw-{clean_id}"
        
        # Switch Node
        nodes.append({
            "id": switch_id, 
            "label": f"Switch {store_id.upper()}", 
            "group": "switch", 
            "level": 2,
            "data": {
                "ip": "192.168.10.2",
                "model": "Cisco C2960",
                "status": "UP",
                "uptime": "45 days, 12:30:00"
            }
        })
        
        # Connect to a random distribution switch
        uplink_idx = hash(store_id) % len(uplinks)
        uplink = uplinks[uplink_idx]
        edges.append({"from": uplink, "to": switch_id})

        # PC
        nodes.append({
            "id": f"pc-{clean_id}", 
            "label": "PC Caixa", 
            "group": "pc", 
            "level": 3,
            "data": {
                "ip": "192.168.10.101",
                "model": "Dell Optiplex",
                "status": "UP",
                "uptime": "2 days, 04:15:00"
            }
        })
        edges.append({"from": switch_id, "to": f"pc-{clean_id}"})
        
        # AP
        nodes.append({
            "id": f"ap-{clean_id}", 
            "label": "AP WiFi", 
            "group": "ap", 
            "level": 3,
            "data": {
                "ip": "192.168.10.5",
                "model": "Ubiquiti UAP-AC-Pro",
                "status": "UP",
                "uptime": "15 days, 08:20:00"
            }
        })
        edges.append({"from": switch_id, "to": f"ap-{clean_id}"})

topology_service = TopologyService()
