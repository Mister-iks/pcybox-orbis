import asyncio
import json
import threading
from datetime import datetime
from typing import Any

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from capture.sniffer import Packet, PacketSniffer
from classifier.traffic import classify
from resolver.dns_geo import enrich_ip
from scanner.arp_scanner import ARPScanner, Device

app = FastAPI(title="NetGraph API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory state
nodes: dict[str, dict] = {}
edges: dict[str, dict] = {}
lan_devices: dict[str, dict] = {}
connected_clients: list[WebSocket] = []
enrichment_cache: dict[str, dict] = {}
_loop: asyncio.AbstractEventLoop | None = None
_scanner: ARPScanner | None = None


async def broadcast(message: dict) -> None:
    dead = []
    for ws in connected_clients:
        try:
            await ws.send_text(json.dumps(message))
        except Exception:
            dead.append(ws)
    for ws in dead:
        connected_clients.remove(ws)


# ── Packet handling ──────────────────────────────────────────────────────────

def on_packet(pkt: Packet) -> None:
    if _loop is None:
        return
    asyncio.run_coroutine_threadsafe(_handle_packet(pkt), _loop)


async def _handle_packet(pkt: Packet) -> None:
    remote_ip = pkt.dst_ip if pkt.direction == "out" else pkt.src_ip

    if remote_ip not in enrichment_cache:
        enrichment_cache[remote_ip] = await enrich_ip(remote_ip)

    geo = enrichment_cache[remote_ip]

    # Skip if the remote IP is a known LAN device (internal traffic)
    lan_key = f"lan:{remote_ip}"
    if lan_key in lan_devices:
        return

    category = classify(geo.get("hostname"), pkt.dst_port, pkt.protocol)

    node_id = remote_ip
    if node_id not in nodes:
        nodes[node_id] = {
            "id": node_id,
            "label": geo.get("hostname") or remote_ip,
            "ip": remote_ip,
            "country": geo.get("country"),
            "country_code": geo.get("country_code"),
            "city": geo.get("city"),
            "lat": geo.get("lat"),
            "lon": geo.get("lon"),
            "org": geo.get("org"),
            "category": category.category,
            "color": category.color,
            "bytes": 0,
            "packets": 0,
        }

    nodes[node_id]["bytes"] += pkt.size
    nodes[node_id]["packets"] += 1

    edge_id = f"local-{node_id}-{pkt.protocol}"
    if edge_id not in edges:
        edges[edge_id] = {
            "id": edge_id,
            "source": "local",
            "target": node_id,
            "protocol": pkt.protocol,
            "label": category.label,
            "color": category.color,
            "bytes": 0,
            "packets": 0,
        }

    edges[edge_id]["bytes"] += pkt.size
    edges[edge_id]["packets"] += 1

    await broadcast({
        "type": "update",
        "node": nodes[node_id],
        "edge": edges[edge_id],
        "packet": {
            "src": pkt.src_ip,
            "dst": pkt.dst_ip,
            "protocol": pkt.protocol,
            "size": pkt.size,
            "direction": pkt.direction,
            "process": pkt.process_name,
            "timestamp": pkt.timestamp,
        },
    })


# ── LAN device handling ──────────────────────────────────────────────────────

def on_device(device: Device, is_new: bool) -> None:
    if _loop is None:
        return
    asyncio.run_coroutine_threadsafe(_handle_device(device, is_new), _loop)


async def _handle_device(device: Device, is_new: bool) -> None:
    node = device.to_dict()
    lan_devices[node["id"]] = node

    # LAN edge: local ↔ device (dashed, same-network link)
    edge_id = f"lan-edge-{device.ip}"
    edges[edge_id] = {
        "id": edge_id,
        "source": "local",
        "target": node["id"],
        "protocol": "LAN",
        "label": "LAN",
        "color": node["color"],
        "bytes": 0,
        "packets": 0,
        "dashed": True,
    }

    await broadcast({
        "type": "device_update",
        "device": node,
        "edge": edges[edge_id],
        "is_new": is_new,
    })


# ── Startup ──────────────────────────────────────────────────────────────────

@app.on_event("startup")
async def startup() -> None:
    global _loop, _scanner

    _loop = asyncio.get_event_loop()

    nodes["local"] = {
        "id": "local",
        "label": "This Device",
        "ip": "local",
        "category": "local",
        "color": "#3b82f6",
        "bytes": 0,
        "packets": 0,
    }

    # Start packet sniffer
    sniffer = PacketSniffer(callback=on_packet)
    threading.Thread(target=sniffer.start, daemon=True).start()

    # Start ARP scanner (first scan immediately, then every 30s)
    _scanner = ARPScanner(callback=on_device, interval=30)
    threading.Thread(target=_scanner.start, daemon=True).start()


# ── REST endpoints ───────────────────────────────────────────────────────────

@app.get("/graph")
async def get_graph() -> dict:
    return {
        "nodes": list(nodes.values()) + list(lan_devices.values()),
        "edges": list(edges.values()),
    }


@app.get("/devices")
async def get_devices() -> dict:
    return {"devices": list(lan_devices.values())}


# ── WebSocket ────────────────────────────────────────────────────────────────

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
    await websocket.accept()
    connected_clients.append(websocket)

    await websocket.send_text(json.dumps({
        "type": "init",
        "nodes": list(nodes.values()) + list(lan_devices.values()),
        "edges": list(edges.values()),
    }))

    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        if websocket in connected_clients:
            connected_clients.remove(websocket)
