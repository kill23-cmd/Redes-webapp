// ============================================
// AI KNOWLEDGE BASE
// ============================================
// This file contains advanced knowledge for the AI to consult.

const AI_KNOWLEDGE_BASE = {
    cisco_switch: {
        advanced_commands: [
            {
                category: "Diagnostics",
                description: "Verificar erros na interface",
                command: "show interfaces {INTERFACE} counters errors"
            },
            {
                category: "Diagnostics",
                description: "Verificar status do transceptor óptico",
                command: "show interfaces {INTERFACE} transceiver detail"
            },
            {
                category: "Diagnostics",
                description: "Verificar utilização de CPU por processo",
                command: "show processes cpu sorted | exclude 0.00"
            },
            {
                category: "Diagnostics",
                description: "Verificar logs de sistema (últimas 50 linhas)",
                command: "show logging | last 50"
            },
            {
                category: "Spanning Tree",
                description: "Verificar estado do Spanning Tree por VLAN",
                command: "show spanning-tree vlan {VLAN}"
            },
            {
                category: "Security",
                description: "Verificar Port Security na interface",
                command: "show port-security interface {INTERFACE}"
            },
            {
                category: "General",
                description: "Mostrar configuração atual (running-config)",
                command: "show running-config"
            },
            {
                category: "General",
                description: "Mostrar interfaces (resumo)",
                command: "show ip interface brief"
            },
            {
                category: "General",
                description: "Mostrar vizinhos CDP",
                command: "show cdp neighbors detail"
            },
            {
                category: "General",
                description: "Mostrar tabela MAC",
                command: "show mac address-table"
            },
            {
                category: "General",
                description: "Mostrar status das interfaces",
                command: "show interfaces status"
            }
        ],
        troubleshooting_guides: {
            "Interface Down": "1. Check cable connection. 2. Check if administratively down (show int status). 3. Check for error-disabled state (show int status err-disabled).",
            "Slow Network": "1. Check interface errors (CRC, collisions). 2. Check CPU utilization. 3. Check for duplex mismatch.",
            "VLAN Issues": "1. Verify VLAN exists (show vlan brief). 2. Verify port assignment. 3. Check trunk configuration."
        }
    },
    huawei_switch: {
        advanced_commands: [
            {
                category: "Diagnostics",
                description: "Verificar logs de diagnóstico",
                command: "display diagnostic-information"
            },
            {
                category: "Diagnostics",
                description: "Verificar potência óptica",
                command: "display transceiver interface {INTERFACE} verbose"
            }
        ]
    },
    fortinet_firewall: {
        advanced_commands: [
            {
                category: "VPN",
                description: "Debugar negociação IKE (VPN)",
                command: "diagnose debug application ike -1"
            },
            {
                category: "Session",
                description: "Filtrar sessões por IP",
                command: "diagnose sys session filter src {IP}"
            }
        ]
    }
};

// Expose to window
if (typeof window !== 'undefined') {
    window.AI_KNOWLEDGE_BASE = AI_KNOWLEDGE_BASE;
}

if (typeof module !== 'undefined') {
    module.exports = { AI_KNOWLEDGE_BASE };
}
