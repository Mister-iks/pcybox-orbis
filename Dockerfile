# ── Stage 1: Build React frontend ─────────────────────────────────────────────
FROM node:20-alpine AS frontend-builder
WORKDIR /build
COPY frontend/package*.json ./
RUN npm ci --prefer-offline
COPY frontend/ ./
RUN npm run build

# ── Stage 2: Python runtime ───────────────────────────────────────────────────
FROM python:3.11-slim-bookworm
WORKDIR /app

# libpcap is required by Scapy for raw packet capture on Linux
RUN apt-get update \
 && apt-get install -y --no-install-recommends libpcap-dev \
 && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Backend source
COPY backend/ ./backend/

# Compiled React app  served as static files by FastAPI
COPY --from=frontend-builder /build/dist ./frontend_dist/

EXPOSE 8000
WORKDIR /app/backend
CMD ["python", "run_backend.py"]
