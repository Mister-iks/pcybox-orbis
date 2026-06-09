import os
import socket
import sys
import time
from dataclasses import dataclass
from datetime import datetime
from typing import Callable, Optional

try:
    from scapy.all import IP, TCP, UDP, AsyncSniffer, conf, get_if_addr, get_if_list, sniff
    SCAPY_AVAILABLE = True
except ImportError:
    SCAPY_AVAILABLE = False
    conf = None

import psutil

MACOS_ROOT_MSG = (
    "Capture impossible : accès BPF refusé. Sur macOS, l'application doit tourner en root.\n"
    "N'utilise pas « sudo open » (l'app reste en utilisateur normal).\n"
    "Lance plutôt depuis le Terminal :\n"
    'sudo "/Applications/PCYBOX Orbis.app/Contents/MacOS/PCYBOX Orbis"'
)


@dataclass
class Packet:
    src_ip: str
    dst_ip: str
    src_port: Optional[int]
    dst_port: Optional[int]
    protocol: str
    size: int
    timestamp: str
    direction: str  # "out" | "in"
    pid: Optional[int] = None
    process_name: Optional[str] = None


def get_local_ips() -> set[str]:
    ips = set()
    for iface_addrs in psutil.net_if_addrs().values():
        for addr in iface_addrs:
            if addr.family == socket.AF_INET:
                ips.add(addr.address)
    return ips


def get_default_iface() -> str | None:
    if not SCAPY_AVAILABLE:
        return None

    skip_prefixes = ("lo", "awdl", "llw", "utun", "gif", "stf", "bridge", "ap")
    candidates: list[tuple[int, str]] = []

    for iface in get_if_list():
        if iface.startswith(skip_prefixes):
            continue
        try:
            addr = get_if_addr(iface)
        except Exception:
            continue
        if not addr or addr == "0.0.0.0" or addr.startswith("127."):
            continue
        # Prefer primary interfaces (en0, en1, …) over virtual ones.
        priority = 0 if iface.startswith("en") else 1
        candidates.append((priority, iface))

    if candidates:
        candidates.sort()
        return candidates[0][1]

    return getattr(conf, "iface", None)


def _ensure_capture_permissions() -> None:
    if sys.platform == "darwin" and os.geteuid() != 0:
        raise PermissionError(MACOS_ROOT_MSG)


def get_process_for_port(port: int, proto: str) -> tuple[Optional[int], Optional[str]]:
    kind = "tcp" if proto == "TCP" else "udp"
    try:
        for conn in psutil.net_connections(kind=kind):
            if conn.laddr and conn.laddr.port == port and conn.pid:
                try:
                    return conn.pid, psutil.Process(conn.pid).name()
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    return conn.pid, None
    except Exception:
        pass
    return None, None


class PacketSniffer:
    def __init__(
        self,
        callback: Callable[[Packet], None],
        ports: list[int] | None = None,
        on_status: Callable[[bool, str | None], None] | None = None,
    ):
        self.callback = callback
        self.on_status = on_status
        self.ports = ports or []
        self.local_ips = get_local_ips()
        self.iface: str | None = get_default_iface()
        self._sniffer: Optional[AsyncSniffer] = None
        self._running = False
        self.active = False
        self.error: str | None = None

    @property
    def _bpf_filter(self) -> str:
        if not self.ports:
            return "ip"
        port_expr = " or ".join(f"port {p}" for p in self.ports)
        return f"ip and ({port_expr})"

    def _notify_status(self, active: bool, error: str | None) -> None:
        self.active = active
        self.error = error
        if self.on_status:
            self.on_status(active, error)

    def _process_packet(self, pkt) -> None:
        if not pkt.haslayer(IP):
            return

        ip = pkt[IP]
        src, dst = ip.src, ip.dst

        if src not in self.local_ips and dst not in self.local_ips:
            return

        proto = "OTHER"
        src_port = dst_port = None

        if pkt.haslayer(TCP):
            proto = "TCP"
            src_port = pkt[TCP].sport
            dst_port = pkt[TCP].dport
        elif pkt.haslayer(UDP):
            proto = "UDP"
            src_port = pkt[UDP].sport
            dst_port = pkt[UDP].dport

        direction = "out" if src in self.local_ips else "in"
        local_port = src_port if direction == "out" else dst_port

        pid, process_name = None, None
        if local_port and proto in ("TCP", "UDP"):
            pid, process_name = get_process_for_port(local_port, proto)

        packet = Packet(
            src_ip=src,
            dst_ip=dst,
            src_port=src_port,
            dst_port=dst_port,
            protocol=proto,
            size=len(pkt),
            timestamp=datetime.utcnow().isoformat(),
            direction=direction,
            pid=pid,
            process_name=process_name,
        )
        self.callback(packet)

    def start(self) -> None:
        if not SCAPY_AVAILABLE:
            msg = "Scapy indisponible — capture désactivée"
            print(f"[sniffer] {msg}", flush=True)
            self._notify_status(False, msg)
            return

        self._running = True
        try:
            _ensure_capture_permissions()
            self.iface = get_default_iface()
            if not self.iface:
                raise RuntimeError("Aucune interface réseau active détectée")

            # Fail fast with a clear message before starting the async sniffer.
            sniff(filter=self._bpf_filter, store=False, timeout=0, count=0, iface=self.iface)

            self._sniffer = AsyncSniffer(
                filter=self._bpf_filter,
                prn=self._process_packet,
                store=False,
                iface=self.iface,
            )
            self._sniffer.start()
            self._notify_status(True, None)
            print(f"[sniffer] capture started on {self.iface}", flush=True)

            while self._running:
                self.local_ips = get_local_ips()
                time.sleep(1)
        except Exception as exc:
            msg = str(exc)
            if sys.platform == "darwin" and ("Permission denied" in msg or "bpf" in msg.lower()):
                msg = MACOS_ROOT_MSG
            print(f"[sniffer] failed to start: {msg}", flush=True)
            self._notify_status(False, msg)

    def stop(self) -> None:
        self._running = False
        if self._sniffer:
            try:
                self._sniffer.stop()
            except Exception:
                pass
        self._notify_status(False, None)
