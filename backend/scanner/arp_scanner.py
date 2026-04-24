import ipaddress
import socket
import threading
import time
from dataclasses import dataclass, field
from typing import Callable, Optional

import psutil

from scanner.oui import lookup, DEVICE_TYPE_COLORS

try:
    from scapy.all import ARP, Ether, srp
    SCAPY_AVAILABLE = True
except ImportError:
    SCAPY_AVAILABLE = False


@dataclass
class Device:
    ip: str
    mac: str
    vendor: str
    device_type: str
    hostname: Optional[str]
    online: bool = True
    color: str = "#64748b"
    icon: str = "❓"

    def to_dict(self) -> dict:
        return {
            "id": f"lan:{self.ip}",
            "ip": self.ip,
            "mac": self.mac,
            "vendor": self.vendor,
            "device_type": self.device_type,
            "hostname": self.hostname,
            "label": self.hostname or self.vendor or self.ip,
            "online": self.online,
            "category": "lan_device",
            "color": self.color,
            "icon": self.icon,
            "bytes": 0,
            "packets": 0,
        }


def _get_local_subnets() -> list[str]:
    subnets = []
    for iface, addrs in psutil.net_if_addrs().items():
        for addr in addrs:
            if addr.family != socket.AF_INET:
                continue
            ip = addr.address
            netmask = addr.netmask
            if not netmask or ip.startswith("127."):
                continue
            try:
                network = ipaddress.IPv4Network(f"{ip}/{netmask}", strict=False)
                if network.num_addresses <= 2 or network.num_addresses > 65536:
                    continue
                subnets.append(str(network))
            except ValueError:
                continue
    return subnets


def _resolve_hostname(ip: str) -> Optional[str]:
    try:
        return socket.gethostbyaddr(ip)[0]
    except Exception:
        return None


def _scan_subnet(subnet: str, timeout: int = 2) -> list[Device]:
    if not SCAPY_AVAILABLE:
        return []
    try:
        ans, _ = srp(
            Ether(dst="ff:ff:ff:ff:ff:ff") / ARP(pdst=subnet),
            timeout=timeout,
            verbose=False,
            retry=1,
        )
    except Exception:
        return []

    devices = []
    local_ips = {
        addr.address
        for addrs in psutil.net_if_addrs().values()
        for addr in addrs
        if addr.family == socket.AF_INET
    }

    for sent, received in ans:
        ip = received.psrc
        mac = received.hwsrc

        if ip in local_ips:
            continue

        vendor, device_type = lookup(mac)
        hostname = _resolve_hostname(ip)

        devices.append(Device(
            ip=ip,
            mac=mac,
            vendor=vendor,
            device_type=device_type,
            hostname=hostname,
            online=True,
            color=DEVICE_TYPE_COLORS.get(device_type, "#64748b"),
            icon=DEVICE_TYPE_ICONS.get(device_type, "❓"),
        ))

    return devices


class ARPScanner:
    def __init__(self, callback: Callable[[Device, bool], None], interval: int = 30):
        self.callback = callback
        self.interval = interval
        self._known: dict[str, Device] = {}
        self._running = False
        self._thread: Optional[threading.Thread] = None

    def _run(self) -> None:
        while self._running:
            subnets = _get_local_subnets()
            seen_ips: set[str] = set()

            for subnet in subnets:
                for device in _scan_subnet(subnet):
                    seen_ips.add(device.ip)
                    is_new = device.ip not in self._known
                    self._known[device.ip] = device
                    self.callback(device, is_new)

            # Mark disappeared devices as offline
            for ip, device in list(self._known.items()):
                if ip not in seen_ips and device.online:
                    device.online = False
                    self.callback(device, False)

            time.sleep(self.interval)

    def start(self) -> None:
        self._running = True
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._running = False

    @property
    def devices(self) -> list[dict]:
        return [d.to_dict() for d in self._known.values()]
