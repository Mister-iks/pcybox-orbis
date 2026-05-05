import sys
import time
import threading
from dataclasses import dataclass, field
from typing import Callable

import psutil


@dataclass
class MediaState:
    mic: list[str] = field(default_factory=list)    # process names using mic
    camera: list[str] = field(default_factory=list) # process names using camera


def _detect_windows() -> MediaState:
    import winreg
    state = MediaState()

    def _read_consent(device: str) -> list[str]:
        procs = []
        key_path = rf"SOFTWARE\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\{device}"
        try:
            key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, key_path)
            i = 0
            while True:
                try:
                    sub = winreg.EnumKey(key, i)
                    i += 1
                    if sub == "NonPackaged":
                        np_key = winreg.OpenKey(key, sub)
                        j = 0
                        while True:
                            try:
                                app = winreg.EnumKey(np_key, j)
                                j += 1
                                app_key = winreg.OpenKey(np_key, app)
                                try:
                                    val, _ = winreg.QueryValueEx(app_key, "LastUsedTimeStop")
                                    if val == 0:
                                        # LastUsedTimeStop == 0 means currently in use
                                        procs.append(app.split("#")[-1])
                                except FileNotFoundError:
                                    pass
                            except OSError:
                                break
                except OSError:
                    break
        except OSError:
            pass
        return procs

    state.mic = _read_consent("microphone")
    state.camera = _read_consent("webcam")
    return state


def _detect_linux() -> MediaState:
    state = MediaState()
    try:
        for proc in psutil.process_iter(['name', 'open_files']):
            try:
                files = proc.open_files()
                for f in files:
                    if '/dev/snd' in f.path or '/dev/audio' in f.path:
                        if proc.name() not in state.mic:
                            state.mic.append(proc.name())
                    if '/dev/video' in f.path:
                        if proc.name() not in state.camera:
                            state.camera.append(proc.name())
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                pass
    except Exception:
        pass
    return state


def detect_media_usage() -> MediaState:
    if sys.platform == "win32":
        return _detect_windows()
    return _detect_linux()


class MediaMonitor:
    def __init__(self, callback: Callable[[MediaState], None], interval: int = 3):
        self.callback = callback
        self.interval = interval
        self._running = False
        self._last: MediaState | None = None

    def start(self) -> None:
        self._running = True
        while self._running:
            try:
                state = detect_media_usage()
                if self._last is None or state.mic != self._last.mic or state.camera != self._last.camera:
                    self._last = state
                    self.callback(state)
            except Exception:
                pass
            time.sleep(self.interval)

    def stop(self) -> None:
        self._running = False
