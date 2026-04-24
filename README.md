# NetGraph - Live Network Traffic Visualizer

Real-time, interactive graph that shows every network exchange between your device and external/internal IPs - colored by category, enriched with geolocation and DNS, with per-app attribution.

## Stack

| Layer | Tech |
|---|---|
| Packet capture | Python · Scapy |
| Backend API | FastAPI · WebSockets |
| Traffic classification | Custom classifier (ports, hostnames, trackers) |
| Geolocation | MaxMind GeoLite2 |
| Frontend | React 18 · Vite · D3.js v7 |

## Features (v0.1)

- Force-directed live graph - nodes = hosts, edges = connections
- Color-coded by traffic type: HTTPS, DNS, Tracking, CDN, SSH…
- Per-process attribution (which app is talking to which host)
- Sidebar with host details: country, org, bytes, packets
- Live packet feed
- Click a node to inspect it

## Quick Start

### Requirements

- Python 3.11+
- Node 18+
- [Npcap](https://npcap.com/) (Windows) or libpcap (Linux/macOS) - for packet capture
- (Optional) [MaxMind GeoLite2 City DB](https://dev.maxmind.com/geoip/geolite2-free-geolocation-data) → place as `data/GeoLite2-City.mmdb`

### Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate      # Windows
pip install -r requirements.txt
# Must run as Administrator for packet capture
uvicorn api.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

## Roadmap

- [ ] Multi-device support (full LAN scan via ARP)
- [ ] Geographic map view (Leaflet)
- [ ] Timeline / replay mode
- [ ] Anomaly detection (ML)
- [ ] Privacy score per device
- [ ] Alerts & notifications
