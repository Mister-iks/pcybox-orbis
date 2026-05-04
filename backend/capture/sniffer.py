import asyncio
import socket
import time
from dataclasses import dataclass, field
from datetime import datetime
from typing import Callable, Optional

try:
    from scapy.all import sniff, IP, TCP, UDP, DNS, DNSQR, AsyncSniffer
    SCAPY_AVAILABLE = True
except ImportError:
    SCAPY_AVAILABLE = False

import psutil


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
    def __init__(self, callback: Callable[[Packet], None]):
        self.callback = callback
        self.local_ips = get_local_ips()
        self._sniffer: Optional[AsyncSniffer] = None
        self._running = False

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
            print("[sniffer] scapy not available - packet capture disabled", flush=True)
            return
        self._running = True
        try:
            self._sniffer = AsyncSniffer(
                filter="ip",
                prn=self._process_packet,
                store=False,
            )
            self._sniffer.start()
            # Keep thread alive so the daemon thread doesn't exit prematurely
            while self._running:
                time.sleep(1)
        except Exception as exc:
            print(f"[sniffer] failed to start: {exc}", flush=True)

    def stop(self) -> None:
        self._running = False
        if self._sniffer:
            self._sniffer.stop()
