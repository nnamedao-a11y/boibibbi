"""
admin_chrome_extension — /api/admin/chrome-extension HTTP surface
=================================================================

Wave 2B / Batch 8 / Commit 14 (Bottom singletons, 4/4).

Mechanical 1:1 extraction of the Chrome-extension ZIP download
endpoint.  The original endpoint at server.py:17804 is preserved
byte-for-byte except for the asset-path resolution, which had to
shift from `os.path.dirname(server.py.__file__)` to a stable
backend-rooted path so it keeps working after extraction.

Architectural note — owns asset bundle:
  Owns the `backend/chrome_extension/` directory and the generated
  `backend/bibi-cars-extension.zip`.  Same ownership pattern as
  `admin_vesselfinder` (Batch 4A) and its `chrome_extension_vf/`
  directory.  No Mongo collection involved.

Path-resolution change (the ONLY semantic difference):
  server.py used `os.path.dirname(__file__)` which resolved to
  `/app/backend/`.  After extraction, `__file__` points to
  `/app/backend/app/routers/admin_chrome_extension.py` so the same
  expression would resolve to `/app/backend/app/routers/`.  The
  router uses `Path(__file__).resolve().parents[2]` to obtain the
  backend root (`/app/backend/`) unchanged — identical pattern to
  `admin_vesselfinder.vf_extension_download`.

Auth: `require_admin` (hoisted via APIRouter `dependencies=[]`).
"""
from __future__ import annotations

import os
import zipfile
from pathlib import Path

from fastapi import APIRouter, Depends
from fastapi.responses import FileResponse

from security import require_admin


def _backend_root() -> Path:
    """Resolve the backend/ directory regardless of where this module lives.

    `Path(__file__).resolve().parents[2]` walks up:
        parents[0] = app/routers/
        parents[1] = app/
        parents[2] = backend/
    Identical pattern to admin_vesselfinder.vf_extension_download.
    """
    return Path(__file__).resolve().parents[2]


router = APIRouter(
    prefix="/api/admin/chrome-extension",
    tags=["admin-chrome-extension"],
    dependencies=[Depends(require_admin)],
)


@router.get("/download")
async def download_chrome_extension():
    """Download Chrome Extension ZIP file"""
    backend = _backend_root()
    file_path = backend / "chrome_extension"
    zip_path = backend / "bibi-cars-extension.zip"

    # Check if ZIP exists
    if not zip_path.exists():
        # Create ZIP if doesn't exist
        with zipfile.ZipFile(str(zip_path), 'w', zipfile.ZIP_DEFLATED) as zipf:
            for root, _dirs, files in os.walk(str(file_path)):
                for file in files:
                    file_full_path = os.path.join(root, file)
                    arcname = os.path.relpath(file_full_path, os.path.dirname(str(file_path)))
                    zipf.write(file_full_path, arcname)

    return FileResponse(
        path=str(zip_path),
        media_type='application/zip',
        filename='bibi-cars-extension.zip',
    )
