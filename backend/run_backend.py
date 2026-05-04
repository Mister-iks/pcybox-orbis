"""
Entry point for PyInstaller  launched by Electron as a child process.
Pass `app` as an object (not a string) so PyInstaller traces the full
import chain and bundles api, capture, classifier, etc. automatically.
"""
import os
import sys

if getattr(sys, 'frozen', False):
    bundle_dir = sys._MEIPASS
    if bundle_dir not in sys.path:
        sys.path.insert(0, bundle_dir)

# Direct import  PyInstaller follows this chain and includes all backend modules
from api.main import app  # noqa: E402
import uvicorn             # noqa: E402

if __name__ == '__main__':
    # Electron bundles freeze the app; bind locally. Docker/dev default to all interfaces.
    default_bind = '127.0.0.1' if getattr(sys, 'frozen', False) else '0.0.0.0'
    uvicorn.run(
        app,
        host=os.environ.get('ORBIS_BIND', default_bind),
        port=int(os.environ.get('ORBIS_PORT', '8000')),
        log_level='warning',
    )
