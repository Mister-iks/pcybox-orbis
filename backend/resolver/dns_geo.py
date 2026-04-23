import asyncio
import ipaddress
import socket
from functools import lru_cache
from pathlib import Path
from typing import Optional

try:
    import geoip2.database
    import geoip2.errors
    GEOIP_AVAILABLE = True
except ImportError:
    GEOIP_AVAILABLE = False

GEOIP_DB_PATH = Path(__file__).parent.parent.parent / "data" / "GeoLite2-City.mmdb"
_geoip_reader = None


def get_geoip_reader():
    global _geoip_reader
    if _geoip_reader is None and GEOIP_AVAILABLE and GEOIP_DB_PATH.exists():
        _geoip_reader = geoip2.database.Reader(str(GEOIP_DB_PATH))
    return _geoip_reader


def is_private(ip: str) -> bool:
    try:
        return ipaddress.ip_address(ip).is_private
    except ValueError:
        return False


@lru_cache(maxsize=2048)
def resolve_hostname(ip: str) -> Optional[str]:
    try:
        return socket.gethostbyaddr(ip)[0]
    except Exception:
        return None


@lru_cache(maxsize=2048)
def resolve_geo(ip: str) -> dict:
    reader = get_geoip_reader()
    if not reader or is_private(ip):
        return {}
    try:
        resp = reader.city(ip)
        return {
            "country": resp.country.name,
            "country_code": resp.country.iso_code,
            "city": resp.city.name,
            "lat": resp.location.latitude,
            "lon": resp.location.longitude,
            "org": resp.traits.autonomous_system_organization,
        }
    except Exception:
        return {}


async def enrich_ip(ip: str) -> dict:
    loop = asyncio.get_event_loop()
    hostname = await loop.run_in_executor(None, resolve_hostname, ip)
    geo = await loop.run_in_executor(None, resolve_geo, ip)
    return {
        "ip": ip,
        "hostname": hostname,
        "private": is_private(ip),
        **geo,
    }
