# backend.spec
# Run from backend/ directory:
#   Windows: ..\.venv\Scripts\pyinstaller.exe backend.spec --distpath ../dist/backend
#   macOS:   python3 -m PyInstaller backend.spec --distpath ../dist/backend --clean

import sys
from PyInstaller.utils.hooks import collect_all, collect_submodules

if sys.platform == 'win32':
    _platform_imports = [
        'psutil._pswindows',
        'psutil._psutil_windows',
        'asyncio.windows_events',
    ]
elif sys.platform == 'darwin':
    _platform_imports = [
        'psutil._psosx',
        'psutil._psutil_osx',
    ]
else:
    _platform_imports = [
        'psutil._pslinux',
        'psutil._psutil_linux',
    ]

# Pull in ALL of scapy (layers, arch, libs, data files)
scapy_datas, scapy_binaries, scapy_hiddenimports = collect_all('scapy')

block_cipher = None

a = Analysis(
    ['run_backend.py'],
    pathex=['.'],           # backend/  so api.*, capture.*, etc. resolve
    binaries=scapy_binaries,
    datas=scapy_datas,
    hiddenimports=(
        scapy_hiddenimports

        # ── uvicorn internals ────────────────────────────────────────────
        + collect_submodules('uvicorn')

        # ── FastAPI / Starlette / Pydantic ───────────────────────────────
        + collect_submodules('starlette')
        + collect_submodules('fastapi')
        + collect_submodules('pydantic')
        + collect_submodules('pydantic_core')

        # ── async / HTTP / WS ────────────────────────────────────────────
        + collect_submodules('anyio')
        + collect_submodules('websockets')
        + [
            'h11',
            'httptools',
            'wsproto',
            'aiofiles',
        ]

        # ── DNS / networking ─────────────────────────────────────────────
        + collect_submodules('dns')
        + ['psutil']
        + _platform_imports

        # ── stdlib extras often missed ───────────────────────────────────
        + [
            'email.mime.text',
            'email.mime.multipart',
            'email.mime.base',
            'logging.handlers',
            'asyncio',
            'sqlite3',
        ]
    ),
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=['tkinter', 'matplotlib', 'numpy', 'PIL', 'PyQt5', 'wx'],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='pcybox-orbis-backend',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=sys.platform == 'win32',
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,           # keep visible for debugging; set False for release
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    uac_admin=False,        # elevation handled by Electron wrapper
)
