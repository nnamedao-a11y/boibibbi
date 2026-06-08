"""
file_manager - HTTP surface for Sprint 2 Customer File Manager.

Endpoints (all prefixed by /api):

  GET    /customers/{customer_id}/folders                 - list folders
  POST   /customers/{customer_id}/folders                 - create custom folder
  PATCH  /folders/{folder_id}                             - rename folder
  DELETE /folders/{folder_id}                             - delete empty non-system folder

  GET    /customers/{customer_id}/files                   - list files (filter by ?folder_id=)
  POST   /customers/{customer_id}/folders/{folder_id}/upload - upload (multipart)
  GET    /files/{file_id}                                 - file metadata
  PATCH  /files/{file_id}                                 - update comment/name
  PATCH  /files/{file_id}/move                            - move to another folder
  DELETE /files/{file_id}                                 - soft-delete
  GET    /files/{file_id}/download                        - serve binary inline

The /api/files/{key} streaming route stays in server.py so it keeps
the full pre-existing access-control middleware (cabinet auth, etc.).
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Body, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse

from security import require_user, require_manager_or_admin
from app.core.db_runtime import get_db
from app.services import file_manager as fm
from app.services.object_storage import get_storage

logger = logging.getLogger("bibi.file_manager")

router = APIRouter(tags=["file-manager"])


# ─────────────────────────────────────────────────────────────────────
# Folders
# ─────────────────────────────────────────────────────────────────────

@router.get("/api/customers/{customer_id}/folders")
async def list_folders(customer_id: str, user: dict = Depends(require_user)):
    """List all folders for a customer (auto-seeds system folders on first call)."""
    db = get_db()
    cust = await db.customers.find_one({"id": customer_id}, {"_id": 0})
    if not cust:
        raise HTTPException(404, "Customer not found")
    folders = await fm.list_folders(customer_id)
    return {"success": True, "items": folders, "system_folders": fm.SYSTEM_FOLDERS}


@router.post("/api/customers/{customer_id}/folders",
             dependencies=[Depends(require_manager_or_admin)])
async def create_folder(
    customer_id: str,
    data: Dict[str, Any] = Body(...),
    user: dict = Depends(require_manager_or_admin),
):
    """Create a custom (non-system) folder under a customer."""
    db = get_db()
    if not await db.customers.find_one({"id": customer_id}, {"_id": 1}):
        raise HTTPException(404, "Customer not found")
    try:
        folder = await fm.create_folder(
            customer_id,
            name=(data.get("name") or "").strip(),
            parent_id=data.get("parent_id"),
            created_by=user.get("email") or user.get("id"),
        )
    except ValueError as e:
        raise HTTPException(400, str(e))
    return {"success": True, "folder": folder}


@router.patch("/api/folders/{folder_id}",
              dependencies=[Depends(require_manager_or_admin)])
async def rename_folder(folder_id: str, data: Dict[str, Any] = Body(...)):
    try:
        folder = await fm.rename_folder(folder_id, (data.get("name") or "").strip())
    except FileNotFoundError:
        raise HTTPException(404, "Folder not found")
    except PermissionError as e:
        raise HTTPException(403, str(e))
    except ValueError as e:
        raise HTTPException(400, str(e))
    return {"success": True, "folder": folder}


@router.delete("/api/folders/{folder_id}",
               dependencies=[Depends(require_manager_or_admin)])
async def delete_folder(folder_id: str):
    try:
        out = await fm.delete_folder(folder_id)
    except FileNotFoundError:
        raise HTTPException(404, "Folder not found")
    except PermissionError as e:
        raise HTTPException(403, str(e))
    except ValueError as e:
        raise HTTPException(400, str(e))
    return {"success": True, **out}


# ─────────────────────────────────────────────────────────────────────
# Files
# ─────────────────────────────────────────────────────────────────────

@router.get("/api/customers/{customer_id}/files")
async def list_customer_files(
    customer_id: str,
    folder_id: Optional[str] = None,
    user: dict = Depends(require_user),
):
    files = await fm.list_files(customer_id, folder_id=folder_id)
    return {"success": True, "items": files, "total": len(files)}


@router.post("/api/customers/{customer_id}/folders/{folder_id}/upload",
             dependencies=[Depends(require_manager_or_admin)])
async def upload_to_folder(
    customer_id: str,
    folder_id: str,
    file: UploadFile = File(...),
    comment: Optional[str] = Form(None),
    user: dict = Depends(require_manager_or_admin),
):
    """Upload a single file into a customer folder (multipart/form-data)."""
    db = get_db()
    if not await db.customers.find_one({"id": customer_id}, {"_id": 1}):
        raise HTTPException(404, "Customer not found")
    data = await file.read()
    if not data:
        raise HTTPException(400, "empty file")
    try:
        doc = await fm.upload_file(
            customer_id=customer_id,
            folder_id=folder_id,
            original_name=file.filename or "file",
            content_type=file.content_type or "application/octet-stream",
            data=data,
            comment=comment,
            uploaded_by=user.get("id"),
            uploaded_by_email=user.get("email"),
        )
    except FileNotFoundError as e:
        raise HTTPException(404, str(e))
    except ValueError as e:
        raise HTTPException(400, str(e))

    # Sprint 4 / Customer Timeline — surface the upload in Customer360.
    try:
        from app.services import customer_timeline
        await customer_timeline.record_event(
            customer_id=customer_id,
            kind="file_uploaded",
            title=f"File uploaded: {doc.get('name') or file.filename}",
            body=comment,
            ref={"collection": "files", "id": doc.get("id")},
            actor={"id": user.get("id"), "email": user.get("email"), "name": user.get("name") or user.get("email"), "role": (user.get("role") or "").lower()},
            meta={"size": doc.get("size"), "mime": doc.get("mime") or doc.get("content_type"), "folder_id": folder_id},
        )
    except Exception:
        pass

    return {"success": True, "file": doc}


@router.get("/api/file-manager/files/{file_id}")
async def file_metadata(file_id: str, user: dict = Depends(require_user)):
    f = await fm.get_file(file_id)
    if not f:
        raise HTTPException(404, "File not found")
    return {"success": True, "file": f}


@router.patch("/api/file-manager/files/{file_id}",
              dependencies=[Depends(require_manager_or_admin)])
async def update_file_meta(file_id: str, data: Dict[str, Any] = Body(...)):
    try:
        f = await fm.update_file(
            file_id,
            comment=data.get("comment") if "comment" in data else None,
            name=data.get("name") if "name" in data else None,
        )
    except FileNotFoundError:
        raise HTTPException(404, "File not found")
    except ValueError as e:
        raise HTTPException(400, str(e))
    return {"success": True, "file": f}


@router.patch("/api/file-manager/files/{file_id}/move",
              dependencies=[Depends(require_manager_or_admin)])
async def move_file(file_id: str, data: Dict[str, Any] = Body(...)):
    target = (data.get("folder_id") or "").strip()
    if not target:
        raise HTTPException(400, "folder_id is required")
    try:
        f = await fm.move_file(file_id, target)
    except FileNotFoundError as e:
        raise HTTPException(404, str(e))
    return {"success": True, "file": f}


@router.delete("/api/file-manager/files/{file_id}",
               dependencies=[Depends(require_manager_or_admin)])
async def delete_file(file_id: str, hard: bool = False):
    try:
        out = await fm.delete_file(file_id, hard=hard)
    except FileNotFoundError:
        raise HTTPException(404, "File not found")
    return {"success": True, **out}


@router.get("/api/file-manager/files/{file_id}/download")
async def download_file(file_id: str, user: dict = Depends(require_user)):
    """Stream the binary back to the caller with Content-Disposition inline."""
    f = await fm.get_file(file_id)
    if not f:
        raise HTTPException(404, "File not found")
    storage = get_storage()
    try:
        stream = storage.open(f["storage_key"])
    except FileNotFoundError:
        raise HTTPException(410, "Binary missing on storage backend")

    def _iter():
        try:
            while True:
                chunk = stream.read(65536)
                if not chunk:
                    break
                yield chunk
        finally:
            try:
                stream.close()
            except Exception:
                pass

    return StreamingResponse(
        _iter(),
        media_type=f.get("mime_type") or "application/octet-stream",
        headers={
            "Content-Disposition": f'inline; filename="{f.get("original_name","file")}"',
            "Cache-Control":       "private, max-age=300",
        },
    )
