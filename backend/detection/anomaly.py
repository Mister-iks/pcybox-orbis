import ipaddress
import time
import uuid
from collections import defaultdict, deque
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional

from capture.sniffer import Packet
from scanner.arp_scanner import Device

# ── Constants ────────────────────────────────────────────────────────────────

SUSPICIOUS_PROCESSES = {
    "cmd.exe", "powershell.exe", "wscript.exe", "cscript.exe",
    "mshta.exe", "regsvr32.exe", "certutil.exe", "bitsadmin.exe",
    "rundll32.exe", "msiexec.exe", "schtasks.exe", "at.exe",
}

SUSPICIOUS_PORTS = {
    4444: "Metasploit shell",
    4445: "Metasploit shell",
    1337: "Hacker port",
    31337: "Back Orifice",
    6666: "IRC botnet",
    6667: "IRC botnet",
    5900: "VNC (remote desktop)",
    5901: "VNC (remote desktop)",
    1080: "SOCKS proxy",
    8080: "Alt HTTP / proxy",
    9001: "Tor relay",
    9050: "Tor SOCKS",
}

BEACON_THRESHOLD = 30      # packets/min to same IP → suspicious beacon
VOLUME_SPIKE_FACTOR = 8    # 8x average bytes → spike
COOLDOWN = 60              # seconds before re-alerting the same key

# Known legitimate IPs that contact frequently — never flag as beaconing
BEACON_WHITELIST = {
    # DNS resolvers
    "1.1.1.1",        # Cloudflare
    "1.0.0.1",        # Cloudflare secondary
    "8.8.8.8",        # Google DNS
    "8.8.4.4",        # Google DNS secondary
    "9.9.9.9",        # Quad9
    "149.112.112.112", # Quad9 secondary
    "208.67.222.222", # OpenDNS
    "208.67.220.220", # OpenDNS secondary
    "4.2.2.1",        # Level3
    "4.2.2.2",        # Level3
    # NTP
    "216.239.35.0",   # Google NTP
    "216.239.35.4",   # Google NTP
    "216.239.35.8",   # Google NTP
    "216.239.35.12",  # Google NTP
    "129.6.15.28",    # NIST NTP
    "129.6.15.29",    # NIST NTP
}


# ── Alert model ──────────────────────────────────────────────────────────────

@dataclass
class Alert:
    type: str
    severity: str          # "info" | "warning" | "critical"
    message: str
    node_id: Optional[str] = None
    details: dict = field(default_factory=dict)
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    timestamp: str = field(default_factory=lambda: datetime.utcnow().isoformat())

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "type": self.type,
            "severity": self.severity,
            "message": self.message,
            "node_id": self.node_id,
            "details": self.details,
            "timestamp": self.timestamp,
        }


# ── Detector ─────────────────────────────────────────────────────────────────

class AnomalyDetector:
    def __init__(self):
        self._seen_hosts: set[str] = set()
        self._seen_process_conns: set[str] = set()
        self._pkt_times: dict[str, deque] = defaultdict(lambda: deque(maxlen=200))
        self._host_bytes_window: dict[str, deque] = defaultdict(lambda: deque(maxlen=60))
        self._cooldowns: dict[str, float] = {}
        self.history: list[dict] = []

    # ── Public API ───────────────────────────────────────────────────────────

    def analyze_packet(self, pkt: Packet, geo: dict) -> list[Alert]:
        alerts: list[Alert] = []
        remote_ip = pkt.dst_ip if pkt.direction == "out" else pkt.src_ip

        if _is_private(remote_ip):
            return alerts

        alerts += self._check_new_host(remote_ip, geo)
        alerts += self._check_suspicious_process(pkt, remote_ip, geo)
        alerts += self._check_suspicious_port(pkt, remote_ip, geo)
        alerts += self._check_beacon(remote_ip, geo)
        alerts += self._check_volume_spike(remote_ip, pkt.size, geo)

        self._record(alerts)
        return alerts

    def analyze_device(self, device: Device, is_new: bool) -> list[Alert]:
        alerts: list[Alert] = []

        if is_new:
            key = f"new_device:{device.ip}"
            alert = Alert(
                type="NEW_LAN_DEVICE",
                severity="info",
                message=f"Nouveau device sur le réseau : {device.hostname or device.vendor or device.ip}",
                node_id=f"lan:{device.ip}",
                details={"ip": device.ip, "mac": device.mac, "vendor": device.vendor},
            )
            if self._cooldown_ok(key):
                alerts.append(alert)

        elif not device.online:
            key = f"offline:{device.ip}"
            alert = Alert(
                type="DEVICE_OFFLINE",
                severity="info",
                message=f"Device hors ligne : {device.hostname or device.ip}",
                node_id=f"lan:{device.ip}",
                details={"ip": device.ip},
            )
            if self._cooldown_ok(key):
                alerts.append(alert)

        self._record(alerts)
        return alerts

    # ── Detection rules ──────────────────────────────────────────────────────

    def _check_new_host(self, ip: str, geo: dict) -> list[Alert]:
        if ip in self._seen_hosts:
            return []
        self._seen_hosts.add(ip)
        label = geo.get("hostname") or ip
        org = geo.get("org", "")
        country = geo.get("country", "")
        return [Alert(
            type="NEW_HOST",
            severity="info",
            message=f"Nouvel hôte contacté : {label}",
            node_id=ip,
            details={"ip": ip, "org": org, "country": country},
        )]

    def _check_suspicious_process(self, pkt: Packet, remote_ip: str, geo: dict) -> list[Alert]:
        if not pkt.process_name:
            return []
        proc = pkt.process_name.lower()
        if proc not in SUSPICIOUS_PROCESSES:
            return []
        key = f"proc:{proc}:{remote_ip}"
        if key in self._seen_process_conns:
            return []
        self._seen_process_conns.add(key)
        label = geo.get("hostname") or remote_ip
        return [Alert(
            type="SUSPICIOUS_PROCESS",
            severity="warning",
            message=f"Processus suspect : {pkt.process_name} → {label}",
            node_id=remote_ip,
            details={"process": pkt.process_name, "ip": remote_ip, "port": pkt.dst_port},
        )]

    def _check_suspicious_port(self, pkt: Packet, remote_ip: str, geo: dict) -> list[Alert]:
        port = pkt.dst_port
        if port not in SUSPICIOUS_PORTS:
            return []
        key = f"port:{port}:{remote_ip}"
        if not self._cooldown_ok(key):
            return []
        label = geo.get("hostname") or remote_ip
        reason = SUSPICIOUS_PORTS[port]
        return [Alert(
            type="SUSPICIOUS_PORT",
            severity="warning",
            message=f"Port suspect {port} ({reason}) → {label}",
            node_id=remote_ip,
            details={"port": port, "reason": reason, "ip": remote_ip},
        )]

    def _check_beacon(self, remote_ip: str, geo: dict) -> list[Alert]:
        if remote_ip in BEACON_WHITELIST:
            return []
        now = time.time()
        dq = self._pkt_times[remote_ip]
        dq.append(now)
        recent = sum(1 for t in dq if now - t < 60)
        if recent < BEACON_THRESHOLD:
            return []
        key = f"beacon:{remote_ip}"
        if not self._cooldown_ok(key, cooldown=300):
            return []
        label = geo.get("hostname") or remote_ip
        return [Alert(
            type="BEACON",
            severity="warning",
            message=f"Comportement beacon détecté : {recent} paquets/min vers {label}",
            node_id=remote_ip,
            details={"ip": remote_ip, "rate": recent},
        )]

    def _check_volume_spike(self, remote_ip: str, size: int, geo: dict) -> list[Alert]:
        dq = self._host_bytes_window[remote_ip]
        dq.append(size)
        if len(dq) < 10:
            return []
        avg = sum(dq) / len(dq)
        if size < avg * VOLUME_SPIKE_FACTOR or avg < 100:
            return []
        key = f"spike:{remote_ip}"
        if not self._cooldown_ok(key, cooldown=120):
            return []
        label = geo.get("hostname") or remote_ip
        return [Alert(
            type="VOLUME_SPIKE",
            severity="warning",
            message=f"Pic de trafic vers {label} ({size // 1024} KB en un paquet)",
            node_id=remote_ip,
            details={"ip": remote_ip, "size": size, "avg": int(avg)},
        )]

    # ── Helpers ──────────────────────────────────────────────────────────────

    def _cooldown_ok(self, key: str, cooldown: int = COOLDOWN) -> bool:
        now = time.time()
        if now - self._cooldowns.get(key, 0) < cooldown:
            return False
        self._cooldowns[key] = now
        return True

    def _record(self, alerts: list[Alert]) -> None:
        for a in alerts:
            self.history.append(a.to_dict())
        # Keep last 500 alerts
        if len(self.history) > 500:
            self.history = self.history[-500:]


def _is_private(ip: str) -> bool:
    try:
        return ipaddress.ip_address(ip).is_private
    except ValueError:
        return False
