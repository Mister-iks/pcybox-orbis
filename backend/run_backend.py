"""
Entry point for PyInstaller — launched by Electron as a child process.
Pass `app` as an object (not a string) so PyInstaller traces the full
import chain and bundles api, capture, classifier, etc. automatically.
"""
import sys
import os

if getattr(sys, 'frozen', False):
    bundle_dir = sys._MEIPASS
    if bundle_dir not in sys.path:
        sys.path.insert(0, bundle_dir)

# Direct import — PyInstaller follows this chain and includes all backend modules
from api.main import app  # noqa: E402
import uvicorn             # noqa: E402

if __name__ == '__main__':
    uvicorn.run(
        app,
        host='127.0.0.1',
        port=8000,
        log_level='warning',
    )
