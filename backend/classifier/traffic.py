from dataclasses import dataclass
from typing import Optional

KNOWN_TRACKERS = {
    "doubleclick.net", "googlesyndication.com", "facebook.com",
    "fbcdn.net", "amazon-adsystem.com", "scorecardresearch.com",
    "quantserve.com", "hotjar.com", "mixpanel.com", "segment.io",
}

KNOWN_CDN = {
    "cloudflare.com", "akamaiedge.net", "fastly.net",
    "cloudfront.net", "edgekey.net",
}

PORT_LABELS: dict[int, str] = {
    80: "HTTP",
    443: "HTTPS",
    53: "DNS",
    22: "SSH",
    21: "FTP",
    25: "SMTP",
    3306: "MySQL",
    5432: "PostgreSQL",
    6379: "Redis",
    27017: "MongoDB",
}

RISK_LEVELS = ("safe", "tracking", "cdn", "unknown", "suspicious")


@dataclass
class TrafficCategory:
    label: str        # "HTTPS", "DNS", "SSH", etc.
    category: str     # "tracking", "cdn", "safe", "unknown"
    risk: str         # "low", "medium", "high"
    color: str        # hex color for the UI


def classify(
    hostname: Optional[str],
    dst_port: Optional[int],
    protocol: str,
) -> TrafficCategory:
    label = PORT_LABELS.get(dst_port or 0, protocol)

    if hostname:
        h = hostname.lower()
        for tracker in KNOWN_TRACKERS:
            if tracker in h:
                return TrafficCategory(label, "tracking", "medium", "#f59e0b")
        for cdn in KNOWN_CDN:
            if cdn in h:
                return TrafficCategory(label, "cdn", "low", "#6366f1")

    if dst_port == 443:
        return TrafficCategory(label, "safe", "low", "#22c55e")
    if dst_port == 80:
        return TrafficCategory(label, "safe", "low", "#84cc16")
    if dst_port == 53:
        return TrafficCategory(label, "dns", "low", "#38bdf8")
    if dst_port == 22:
        return TrafficCategory(label, "admin", "medium", "#fb923c")

    return TrafficCategory(label, "unknown", "low", "#94a3b8")
