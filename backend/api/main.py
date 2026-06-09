import asyncio
import json
import threading
import time
from contextlib import asynccontextmanager
from datetime import datetime

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from capture.sniffer import Packet, PacketSniffer
from capture.media_monitor import MediaMonitor, MediaState
from classifier.traffic import classify
from resolver.dns_geo import enrich_ip
from scanner.arp_scanner import ARPScanner, Device
from detection.anomaly import AnomalyDetector
import storage.db as db

# ── State ─────────────────────────────────────────────────────────────────────
nodes: dict[str, dict] = {}
edges: dict[str, dict] = {}
lan_devices: dict[str, dict] = {}
connected_clients: list[WebSocket] = []
enrichment_cache: dict[str, dict] = {}
detector = AnomalyDetector()
_loop: asyncio.AbstractEventLoop | None = None
_sniffer: PacketSniffer | None = None
_scanner: ARPScanner | None = None
_capturing: bool = True
_port_filter: list[int] = []
_media_state: dict = {"mic": [], "camera": []}


# ── Broadcast ────────────────────────────────────────────────────────────────

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

    if f"lan:{remote_ip}" in lan_devices:
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
            "alerted": False,
        }

    nodes[node_id]["bytes"] += pkt.size
    nodes[node_id]["packets"] += 1

    if pkt.process_name:
        procs = nodes[node_id].setdefault("processes", {})
        if pkt.process_name not in procs:
            procs[pkt.process_name] = {"bytes": 0, "packets": 0}
        procs[pkt.process_name]["bytes"] += pkt.size
        procs[pkt.process_name]["packets"] += 1

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

    # Storage: accumulate (non-blocking, batched)
    minute = datetime.utcnow().strftime("%Y-%m-%dT%H:%M")
    db.accumulate(minute, category.category, pkt.size)

    # Anomaly detection
    loop = asyncio.get_running_loop()
    alerts = await loop.run_in_executor(None, detector.analyze_packet, pkt, geo)
    for alert in alerts:
        if alert.node_id and alert.node_id in nodes:
            nodes[alert.node_id]["alerted"] = True
        alert_dict = alert.to_dict()
        await loop.run_in_executor(None, db.log_alert, alert_dict)
        await broadcast({"type": "alert", "alert": alert_dict})

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
    node["alerted"] = False
    lan_devices[node["id"]] = node

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

    loop = asyncio.get_running_loop()
    alerts = await loop.run_in_executor(None, detector.analyze_device, device, is_new)
    for alert in alerts:
        if alert.node_id and alert.node_id in lan_devices:
            lan_devices[alert.node_id]["alerted"] = True
        alert_dict = alert.to_dict()
        await loop.run_in_executor(None, db.log_alert, alert_dict)
        await broadcast({"type": "alert", "alert": alert_dict})

    await broadcast({
        "type": "device_update",
        "device": node,
        "edge": edges[edge_id],
        "is_new": is_new,
    })


# ── Background flush thread ──────────────────────────────────────────────────

def _on_media_change(state: MediaState) -> None:
    global _media_state
    _media_state = {"mic": state.mic, "camera": state.camera}
    detector.update_media_state(state.mic, state.camera)
    if _loop:
        asyncio.run_coroutine_threadsafe(
            broadcast({"type": "media", "mic": state.mic, "camera": state.camera}),
            _loop,
        )


def _flush_loop() -> None:
    while True:
        time.sleep(10)
        try:
            db.flush()
        except Exception:
            pass


def _cleanup_loop() -> None:
    while True:
        time.sleep(3600)
        try:
            db.cleanup_old_data(hours=24)
        except Exception:
            pass


# ── Startup ──────────────────────────────────────────────────────────────────

def _on_sniffer_status(active: bool, error: str | None) -> None:
    global _capturing
    _capturing = active
    if _loop is None:
        return
    payload = {
        "type": "capture_status",
        "capturing": active,
        "ports": _port_filter,
        "error": error,
        "iface": _sniffer.iface if _sniffer else None,
    }
    asyncio.run_coroutine_threadsafe(broadcast(payload), _loop)


def _start_capture() -> None:
    global _sniffer, _scanner, _capturing
    _sniffer = PacketSniffer(
        callback=on_packet,
        ports=_port_filter,
        on_status=_on_sniffer_status,
    )
    threading.Thread(target=_sniffer.start, daemon=True).start()
    _scanner = ARPScanner(callback=on_device, interval=30)
    threading.Thread(target=_scanner.start, daemon=True).start()
    _capturing = True


def _stop_capture() -> None:
    global _capturing
    if _sniffer:
        _sniffer.stop()
    if _scanner:
        _scanner.stop()
    _capturing = False


async def _startup() -> None:
    global _loop
    _loop = asyncio.get_running_loop()

    nodes["local"] = {
        "id": "local", "label": "This Device", "ip": "local",
        "category": "local", "color": "#3b82f6",
        "bytes": 0, "packets": 0, "alerted": False,
    }

    _start_capture()
    threading.Thread(target=_flush_loop, daemon=True).start()
    threading.Thread(target=_cleanup_loop, daemon=True).start()

    media = MediaMonitor(callback=_on_media_change, interval=3)
    threading.Thread(target=media.start, daemon=True).start()


@asynccontextmanager
async def lifespan(app: FastAPI):
    await _startup()
    yield


app = FastAPI(title="PCYBOX Orbis API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── REST endpoints ────────────────────────────────────────────────────────────

@app.get("/graph")
async def get_graph() -> dict:
    return {
        "nodes": list(nodes.values()) + list(lan_devices.values()),
        "edges": list(edges.values()),
    }

@app.get("/devices")
async def get_devices() -> dict:
    return {"devices": list(lan_devices.values())}

@app.get("/alerts")
async def get_alerts() -> dict:
    return {"alerts": detector.history[-100:]}

@app.get("/media")
async def get_media() -> dict:
    return _media_state

@app.get("/capture/status")
async def get_capture_status() -> dict:
    return {
        "capturing": _capturing and (_sniffer is None or _sniffer.active),
        "ports": _port_filter,
        "error": _sniffer.error if _sniffer else None,
        "iface": _sniffer.iface if _sniffer else None,
    }

@app.post("/capture/stop")
async def stop_capture() -> dict:
    _stop_capture()
    await broadcast({
        "type": "capture_status",
        "capturing": False,
        "ports": _port_filter,
        "error": None,
        "iface": _sniffer.iface if _sniffer else None,
    })
    return {"capturing": False}

@app.post("/capture/ports")
async def set_port_filter(body: dict) -> dict:
    global _port_filter
    ports = [int(p) for p in body.get("ports", []) if str(p).isdigit() and 1 <= int(p) <= 65535]
    _port_filter = ports

    # Clear graph state so the UI reflects only the new filter
    local = nodes.get("local")
    nodes.clear()
    edges.clear()
    lan_devices.clear()
    if local:
        nodes["local"] = local

    if _capturing:
        _stop_capture()
        _start_capture()

    await broadcast({
        "type": "reset",
        "ports": _port_filter,
        "nodes": list(nodes.values()) + list(lan_devices.values()),
        "edges": list(edges.values()),
    })
    return {"ports": _port_filter}

@app.post("/capture/start")
async def start_capture() -> dict:
    if not _capturing:
        _start_capture()
        await broadcast({
            "type": "capture_status",
            "capturing": True,
            "ports": _port_filter,
            "error": _sniffer.error if _sniffer else None,
            "iface": _sniffer.iface if _sniffer else None,
        })
    return {"capturing": True}

@app.get("/timeline")
async def get_timeline(minutes: int = 60) -> dict:
    loop = asyncio.get_running_loop()
    data = await loop.run_in_executor(None, db.get_timeline, minutes)
    return {"timeline": data}


# ── WebSocket ─────────────────────────────────────────────────────────────────

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
    await websocket.accept()
    connected_clients.append(websocket)

    await websocket.send_text(json.dumps({
        "type": "init",
        "nodes": list(nodes.values()) + list(lan_devices.values()),
        "edges": list(edges.values()),
        "alerts": detector.history[-50:],
        "media": _media_state,
    }))

    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        if websocket in connected_clients:
            connected_clients.remove(websocket)


# ── Serve React build (Docker / non-Electron)  must be last ─────────────────
from pathlib import Path
from fastapi.staticfiles import StaticFiles

_frontend_dist = Path(__file__).parent.parent.parent / 'frontend_dist'
if _frontend_dist.exists():
    app.mount('/', StaticFiles(directory=str(_frontend_dist), html=True), name='frontend')
