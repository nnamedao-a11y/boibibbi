"""
File Manager service - Sprint 2 (Customer Documents with folders).

Owns 2 collections:
  * `client_folders` - hierarchical folder tree per customer
  * `client_files`   - file metadata (binary stored via object_storage)

System folders (auto-created on customer create):
  Contracts, Invoices, Registration, Adaptation, Photos, Delivery, Other

File ACL:
  * manager / team_lead / admin / master_admin can read all
  * manager can write files in folders of their assigned customers
  * customer (cabinet) sees only their own customer_id files, read-only
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from app.core.db_runtime import get_db
from app.services.object_storage import get_storage

SYSTEM_FOLDERS: list[str] = [
    "Contracts",
    "Invoices",
    "Registration",
    "Adaptation",
    "Photos",
    "Delivery",
    "Other",
]

ALLOWED_MIME_PREFIXES = (
    "image/",
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument",
    "application/vnd.ms-excel",
    "application/vnd.ms-powerpoint",
    "text/",
)
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50 MB


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _folder_id() -> str:
    return f"fld_{uuid.uuid4().hex[:12]}"


def _file_id() -> str:
    return f"file_{uuid.uuid4().hex[:12]}"


async def ensure_system_folders(customer_id: str, created_by: Optional[str] = None) -> List[Dict[str, Any]]:
    """Ensure all 7 system folders exist for a customer. Idempotent.

    Returns the full list of system folders (existing + newly created).
    """
    db = get_db()
    existing = await db.client_folders.find(
        {"customer_id": customer_id, "is_system": True},
        {"_id": 0},
    ).to_list(length=50)
    existing_names = {f.get("name") for f in existing}

    to_create = []
    for name in SYSTEM_FOLDERS:
        if name in existing_names:
            continue
        to_create.append({
            "id":          _folder_id(),
            "customer_id": customer_id,
            "name":        name,
            "is_system":   True,
            "parent_id":   None,
            "order":       SYSTEM_FOLDERS.index(name),
            "created_by":  created_by,
            "created_at":  _now(),
        })
    if to_create:
        await db.client_folders.insert_many(to_create)
        for f in to_create:
            f.pop("_id", None)
        existing.extend(to_create)
    return sorted(existing, key=lambda f: (f.get("order", 999), f.get("name", "")))


async def list_folders(customer_id: str) -> List[Dict[str, Any]]:
    """Return all folders for a customer with file counts attached.

    Will auto-seed the 7 system folders if none exist yet.
    """
    db = get_db()
    folders = await db.client_folders.find(
        {"customer_id": customer_id},
        {"_id": 0},
    ).to_list(length=500)

    if not folders:
        folders = await ensure_system_folders(customer_id)

    # Attach file counts in a single aggregation
    counts: Dict[str, int] = {}
    if folders:
        try:
            pipeline = [
                {"$match": {
                    "customer_id": customer_id,
                    "deleted": {"$ne": True},
                }},
                {"$group": {"_id": "$folder_id", "count": {"$sum": 1}}},
            ]
            async for row in db.client_files.aggregate(pipeline):
                counts[row["_id"]] = row["count"]
        except Exception:
            pass

    for f in folders:
        f["file_count"] = counts.get(f["id"], 0)

    return sorted(
        folders,
        key=lambda f: (
            0 if f.get("is_system") else 1,
            f.get("order", 999),
            (f.get("name") or "").lower(),
        ),
    )


async def create_folder(
    customer_id: str,
    name: str,
    *,
    parent_id: Optional[str] = None,
    created_by: Optional[str] = None,
) -> Dict[str, Any]:
    db = get_db()
    name = (name or "").strip()
    if not name:
        raise ValueError("folder name is required")
    if len(name) > 80:
        raise ValueError("folder name too long (max 80 chars)")

    # Reject duplicates within same parent
    dup = await db.client_folders.find_one({
        "customer_id": customer_id,
        "parent_id":   parent_id,
        "name":        name,
    })
    if dup:
        raise ValueError("folder with this name already exists in this location")

    doc = {
        "id":          _folder_id(),
        "customer_id": customer_id,
        "name":        name,
        "is_system":   False,
        "parent_id":   parent_id,
        "order":       1000,
        "created_by":  created_by,
        "created_at":  _now(),
    }
    await db.client_folders.insert_one(doc)
    doc.pop("_id", None)
    doc["file_count"] = 0
    return doc


async def rename_folder(folder_id: str, new_name: str) -> Dict[str, Any]:
    db = get_db()
    folder = await db.client_folders.find_one({"id": folder_id}, {"_id": 0})
    if not folder:
        raise FileNotFoundError("folder not found")
    if folder.get("is_system"):
        raise PermissionError("system folders cannot be renamed")
    new_name = (new_name or "").strip()
    if not new_name:
        raise ValueError("name is required")
    await db.client_folders.update_one(
        {"id": folder_id},
        {"$set": {"name": new_name, "updated_at": _now()}},
    )
    folder["name"] = new_name
    folder["updated_at"] = _now()
    return folder


async def delete_folder(folder_id: str) -> Dict[str, Any]:
    """Delete a non-system, EMPTY folder."""
    db = get_db()
    folder = await db.client_folders.find_one({"id": folder_id}, {"_id": 0})
    if not folder:
        raise FileNotFoundError("folder not found")
    if folder.get("is_system"):
        raise PermissionError("system folders cannot be deleted")
    file_count = await db.client_files.count_documents({
        "folder_id": folder_id,
        "deleted": {"$ne": True},
    })
    if file_count > 0:
        raise ValueError(f"folder is not empty ({file_count} files)")
    await db.client_folders.delete_one({"id": folder_id})
    return {"id": folder_id, "deleted": True}


async def upload_file(
    *,
    customer_id: str,
    folder_id: str,
    original_name: str,
    content_type: str,
    data: bytes,
    comment: Optional[str] = None,
    uploaded_by: Optional[str] = None,
    uploaded_by_email: Optional[str] = None,
) -> Dict[str, Any]:
    """Persist a file: store binary via object_storage + metadata in mongo."""
    if len(data) > MAX_FILE_SIZE:
        raise ValueError(f"file exceeds {MAX_FILE_SIZE // (1024*1024)} MB limit")
    if not any((content_type or "").startswith(p) for p in ALLOWED_MIME_PREFIXES):
        raise ValueError(f"file type not allowed: {content_type}")

    db = get_db()
    folder = await db.client_folders.find_one({"id": folder_id, "customer_id": customer_id})
    if not folder:
        raise FileNotFoundError("folder not found for this customer")

    storage = get_storage()
    info = await storage.put(
        prefix=f"customers/{customer_id}/{folder_id}",
        filename=original_name,
        data=data,
        content_type=content_type,
    )

    doc = {
        "id":                _file_id(),
        "customer_id":       customer_id,
        "folder_id":         folder_id,
        "folder_name":       folder.get("name"),
        "original_name":     original_name,
        "storage_key":       info["key"],
        "url":               info["url"],
        "mime_type":         info["content_type"],
        "size":              info["size"],
        "backend":           info["backend"],
        "comment":           (comment or "").strip() or None,
        "uploaded_by":       uploaded_by,
        "uploaded_by_email": uploaded_by_email,
        "created_at":        _now(),
        "deleted":           False,
    }
    await db.client_files.insert_one(doc)
    doc.pop("_id", None)
    return doc


async def list_files(customer_id: str, folder_id: Optional[str] = None) -> List[Dict[str, Any]]:
    db = get_db()
    q: Dict[str, Any] = {
        "customer_id": customer_id,
        "deleted":     {"$ne": True},
    }
    if folder_id:
        q["folder_id"] = folder_id
    cursor = db.client_files.find(q, {"_id": 0}).sort("created_at", -1)
    return await cursor.to_list(length=500)


async def get_file(file_id: str) -> Optional[Dict[str, Any]]:
    db = get_db()
    return await db.client_files.find_one({"id": file_id, "deleted": {"$ne": True}}, {"_id": 0})


async def move_file(file_id: str, new_folder_id: str) -> Dict[str, Any]:
    db = get_db()
    file = await db.client_files.find_one({"id": file_id}, {"_id": 0})
    if not file:
        raise FileNotFoundError("file not found")
    folder = await db.client_folders.find_one({"id": new_folder_id, "customer_id": file["customer_id"]})
    if not folder:
        raise FileNotFoundError("target folder not found for this customer")
    await db.client_files.update_one(
        {"id": file_id},
        {"$set": {
            "folder_id":   new_folder_id,
            "folder_name": folder.get("name"),
            "updated_at":  _now(),
        }},
    )
    file["folder_id"]   = new_folder_id
    file["folder_name"] = folder.get("name")
    return file


async def update_file(file_id: str, *,
                     comment: Optional[str] = None,
                     name: Optional[str] = None) -> Dict[str, Any]:
    db = get_db()
    upd: Dict[str, Any] = {"updated_at": _now()}
    if comment is not None:
        upd["comment"] = (comment or "").strip() or None
    if name:
        upd["original_name"] = name.strip()
    if len(upd) == 1:
        raise ValueError("nothing to update")
    res = await db.client_files.update_one({"id": file_id}, {"$set": upd})
    if res.matched_count == 0:
        raise FileNotFoundError("file not found")
    return await db.client_files.find_one({"id": file_id}, {"_id": 0})


async def delete_file(file_id: str, hard: bool = False) -> Dict[str, Any]:
    db = get_db()
    file = await db.client_files.find_one({"id": file_id}, {"_id": 0})
    if not file:
        raise FileNotFoundError("file not found")
    if hard:
        try:
            get_storage().delete(file["storage_key"])
        except Exception:
            pass
        await db.client_files.delete_one({"id": file_id})
    else:
        await db.client_files.update_one(
            {"id": file_id},
            {"$set": {"deleted": True, "deleted_at": _now()}},
        )
    return {"id": file_id, "deleted": True, "hard": hard}


__all__ = [
    "SYSTEM_FOLDERS",
    "MAX_FILE_SIZE",
    "ALLOWED_MIME_PREFIXES",
    "ensure_system_folders",
    "list_folders",
    "create_folder",
    "rename_folder",
    "delete_folder",
    "upload_file",
    "list_files",
    "get_file",
    "move_file",
    "update_file",
    "delete_file",
]
