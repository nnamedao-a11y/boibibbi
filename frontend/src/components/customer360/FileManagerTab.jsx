/**
 * Customer360 - File Manager Tab (Sprint 2)
 * ------------------------------------------
 * Single-page File Manager with:
 *   - System + custom folders (left sidebar)
 *   - File grid with previews (right pane)
 *   - Drag-n-drop upload
 *   - Preview / download / move / delete actions
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { useAuth } from '../../App';
import {
  Folder,
  FolderPlus,
  FolderOpen,
  UploadSimple,
  CloudArrowUp,
  FileText,
  FilePdf,
  Image,
  Trash,
  PencilSimple,
  Download as DownloadIcon,
  Eye,
  ArrowRight,
  X,
  CaretRight,
  FileDoc,
  FileXls,
} from '@phosphor-icons/react';
import { useLang } from '../../i18n';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

const SYSTEM_FOLDER_ICON = {
  Contracts:    FileText,
  Invoices:     FileText,
  Registration: FileText,
  Adaptation:   FileText,
  Photos:       Image,
  Delivery:     FileText,
  Other:        Folder,
};

const fileIcon = (mime = '') => {
  if (mime.startsWith('image/')) return Image;
  if (mime === 'application/pdf') return FilePdf;
  if (mime.includes('word') || mime.includes('document')) return FileDoc;
  if (mime.includes('excel') || mime.includes('sheet')) return FileXls;
  return FileText;
};

const humanSize = (n) => {
  if (!n) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0; let v = Number(n);
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${units[i]}`;
};

const authHeaders = () => {
  const tok = localStorage.getItem('token') || localStorage.getItem('access_token');
  return tok ? { Authorization: `Bearer ${tok}` } : {};
};

const FileManagerTab = ({ customerId }) => {
  const { t } = useLang();
  const { user } = useAuth();
  const role = (user?.role || '').toLowerCase();
  const canWrite = ['manager', 'team_lead', 'admin', 'master_admin', 'owner'].includes(role);

  const [folders, setFolders] = useState([]);
  const [activeFolderId, setActiveFolderId] = useState(null);
  const [files, setFiles] = useState([]);
  const [loadingFolders, setLoadingFolders] = useState(true);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [previewFile, setPreviewFile] = useState(null);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [movingFile, setMovingFile] = useState(null);
  const fileInputRef = useRef(null);

  const activeFolder = useMemo(
    () => folders.find((f) => f.id === activeFolderId) || null,
    [folders, activeFolderId]
  );

  const fetchFolders = useCallback(async () => {
    try {
      setLoadingFolders(true);
      const res = await axios.get(`${API_URL}/api/customers/${customerId}/folders`, { headers: authHeaders() });
      const items = res.data?.items || [];
      setFolders(items);
      if (items.length && !activeFolderId) setActiveFolderId(items[0].id);
    } catch (err) {
      toast.error('Failed to load folders');
      console.error(err);
    } finally {
      setLoadingFolders(false);
    }
  }, [customerId, activeFolderId]);

  const fetchFiles = useCallback(async (folderId) => {
    if (!folderId) return;
    try {
      setLoadingFiles(true);
      const res = await axios.get(
        `${API_URL}/api/customers/${customerId}/files?folder_id=${folderId}`,
        { headers: authHeaders() }
      );
      setFiles(res.data?.items || []);
    } catch (err) {
      toast.error('Failed to load files');
    } finally {
      setLoadingFiles(false);
    }
  }, [customerId]);

  useEffect(() => { fetchFolders(); }, [fetchFolders]);
  useEffect(() => { if (activeFolderId) fetchFiles(activeFolderId); }, [activeFolderId, fetchFiles]);

  const uploadFiles = async (filesList) => {
    if (!activeFolderId || !filesList?.length) return;
    setUploading(true);
    let okCount = 0; let failCount = 0;
    for (const file of filesList) {
      const fd = new FormData();
      fd.append('file', file);
      try {
        await axios.post(
          `${API_URL}/api/customers/${customerId}/folders/${activeFolderId}/upload`,
          fd,
          { headers: { ...authHeaders(), 'Content-Type': 'multipart/form-data' } }
        );
        okCount++;
      } catch (err) {
        failCount++;
        const detail = err.response?.data?.detail || err.message;
        toast.error(`${file.name}: ${detail}`);
      }
    }
    setUploading(false);
    if (okCount > 0) {
      toast.success(`Uploaded ${okCount} file${okCount !== 1 ? 's' : ''}`);
      await Promise.all([fetchFiles(activeFolderId), fetchFolders()]);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    if (!canWrite) { toast.error('You do not have permission to upload'); return; }
    const dropped = Array.from(e.dataTransfer.files || []);
    uploadFiles(dropped);
  };

  const handleFileInput = (e) => {
    const list = Array.from(e.target.files || []);
    if (list.length) uploadFiles(list);
    e.target.value = '';
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    try {
      await axios.post(
        `${API_URL}/api/customers/${customerId}/folders`,
        { name: newFolderName.trim() },
        { headers: authHeaders() }
      );
      toast.success(`Folder "${newFolderName.trim()}" created`);
      setNewFolderName('');
      setCreatingFolder(false);
      await fetchFolders();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to create folder');
    }
  };

  const handleDeleteFile = async (fileId) => {
    if (!confirm('Delete this file?')) return;
    try {
      await axios.delete(`${API_URL}/api/file-manager/files/${fileId}`, { headers: authHeaders() });
      toast.success('File deleted');
      await Promise.all([fetchFiles(activeFolderId), fetchFolders()]);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Delete failed');
    }
  };

  const handleMoveFile = async (targetFolderId) => {
    if (!movingFile) return;
    try {
      await axios.patch(
        `${API_URL}/api/file-manager/files/${movingFile.id}/move`,
        { folder_id: targetFolderId },
        { headers: authHeaders() }
      );
      toast.success(`Moved to ${folders.find((f) => f.id === targetFolderId)?.name || 'folder'}`);
      setMovingFile(null);
      await Promise.all([fetchFiles(activeFolderId), fetchFolders()]);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Move failed');
    }
  };

  const handleDeleteFolder = async (folderId) => {
    if (!confirm('Delete this folder? Folder must be empty.')) return;
    try {
      await axios.delete(`${API_URL}/api/folders/${folderId}`, { headers: authHeaders() });
      toast.success('Folder deleted');
      if (activeFolderId === folderId) setActiveFolderId(null);
      await fetchFolders();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Folder delete failed');
    }
  };

  const downloadUrl = (file) => `${API_URL}/api/file-manager/files/${file.id}/download`;

  if (loadingFolders) {
    return (
      <div className="flex items-center justify-center h-40" data-testid="file-manager-loading">
        <div className="animate-spin w-8 h-8 border-2 border-[#4F46E5] border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[260px,1fr] gap-4" data-testid="file-manager-tab">
      {/* Folder sidebar */}
      <div className="section-card !p-3">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[13px] font-bold text-[#18181B] uppercase tracking-wider">Folders</h3>
          {canWrite && (
            <button
              onClick={() => setCreatingFolder((v) => !v)}
              className="p-1.5 hover:bg-[#F4F4F5] rounded-lg transition-colors"
              title="Create custom folder"
              data-testid="create-folder-btn"
            >
              <FolderPlus size={16} className="text-[#4F46E5]" />
            </button>
          )}
        </div>

        {creatingFolder && (
          <div className="mb-3 space-y-2">
            <input
              type="text"
              autoFocus
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()}
              placeholder="Folder name"
              maxLength={80}
              className="w-full px-2.5 py-1.5 text-sm border border-[#E4E4E7] rounded-lg focus:outline-none focus:border-[#4F46E5]"
              data-testid="create-folder-input"
            />
            <div className="flex gap-1">
              <button onClick={handleCreateFolder} className="flex-1 px-2 py-1 text-xs bg-[#18181B] text-white rounded-lg hover:bg-[#3F3F46]" data-testid="create-folder-confirm">Create</button>
              <button onClick={() => { setCreatingFolder(false); setNewFolderName(''); }} className="flex-1 px-2 py-1 text-xs text-[#71717A] hover:bg-[#F4F4F5] rounded-lg">Cancel</button>
            </div>
          </div>
        )}

        <div className="space-y-0.5">
          {folders.map((f) => {
            const Icon = SYSTEM_FOLDER_ICON[f.name] || (f.is_system ? Folder : FolderOpen);
            const isActive = f.id === activeFolderId;
            return (
              <div
                key={f.id}
                className={`group flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-colors ${
                  isActive ? 'bg-[#18181B] text-white' : 'hover:bg-[#F4F4F5] text-[#3F3F46]'
                }`}
                onClick={() => setActiveFolderId(f.id)}
                data-testid={`folder-row-${f.name}`}
              >
                <Icon size={16} className={isActive ? 'text-white' : (f.is_system ? 'text-[#4F46E5]' : 'text-[#71717A]')} />
                <span className="text-sm flex-1 truncate">{f.name}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${isActive ? 'bg-white/20 text-white' : 'bg-[#F4F4F5] text-[#71717A]'}`}>
                  {f.file_count || 0}
                </span>
                {!f.is_system && canWrite && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeleteFolder(f.id); }}
                    className={`opacity-0 group-hover:opacity-100 p-0.5 rounded ${isActive ? 'hover:bg-white/20' : 'hover:bg-red-100'}`}
                    title="Delete folder"
                  >
                    <Trash size={11} className={isActive ? 'text-white' : 'text-red-600'} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Files pane */}
      <div
        className={`section-card relative transition-colors ${dragOver ? 'border-2 border-dashed border-[#4F46E5] bg-[#EEF2FF]' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        data-testid="files-pane"
      >
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div>
            <h3 className="text-lg font-bold text-[#18181B]">
              {activeFolder?.name || 'No folder selected'}
            </h3>
            <p className="text-xs text-[#71717A]">
              {loadingFiles ? 'Loading…' : `${files.length} file${files.length === 1 ? '' : 's'}`}
              {activeFolder?.is_system && ' · System folder'}
            </p>
          </div>
          {canWrite && activeFolderId && (
            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                onChange={handleFileInput}
                className="hidden"
                accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.doc,.docx,.xls,.xlsx"
                data-testid="file-input"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#4F46E5] text-white text-sm rounded-lg hover:bg-[#4338CA] disabled:opacity-50"
                data-testid="upload-btn"
              >
                <UploadSimple size={14} />
                {uploading ? 'Uploading…' : 'Upload'}
              </button>
            </div>
          )}
        </div>

        {dragOver && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center">
              <CloudArrowUp size={48} className="mx-auto text-[#4F46E5]" />
              <p className="text-[#4F46E5] font-medium mt-2">Drop files to upload</p>
            </div>
          </div>
        )}

        {loadingFiles ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin w-6 h-6 border-2 border-[#4F46E5] border-t-transparent rounded-full" />
          </div>
        ) : files.length === 0 ? (
          <div className="text-center py-12">
            <CloudArrowUp size={32} className="mx-auto text-[#A1A1AA] mb-2" />
            <p className="text-[#71717A]">No files yet</p>
            {canWrite && <p className="text-xs text-[#A1A1AA] mt-1">Drag files here or click Upload</p>}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {files.map((f) => {
              const Icon = fileIcon(f.mime_type);
              const isImage = (f.mime_type || '').startsWith('image/');
              return (
                <div
                  key={f.id}
                  className="group relative bg-white border border-[#E4E4E7] rounded-xl overflow-hidden hover:border-[#4F46E5] hover:shadow-md transition-all"
                  data-testid={`file-card-${f.id}`}
                >
                  <div
                    className="h-28 bg-[#F4F4F5] flex items-center justify-center cursor-pointer relative"
                    onClick={() => setPreviewFile(f)}
                  >
                    {isImage ? (
                      <img src={downloadUrl(f)} alt={f.original_name} className="h-full w-full object-cover" loading="lazy" />
                    ) : (
                      <Icon size={36} className="text-[#71717A]" />
                    )}
                  </div>
                  <div className="p-2">
                    <p className="text-xs font-medium text-[#18181B] truncate" title={f.original_name}>
                      {f.original_name}
                    </p>
                    <p className="text-[10px] text-[#A1A1AA] mt-0.5">
                      {humanSize(f.size)} · {new Date(f.created_at).toLocaleDateString()}
                    </p>
                    {f.comment && (
                      <p className="text-[10px] text-[#4F46E5] italic mt-1 truncate" title={f.comment}>
                        {f.comment}
                      </p>
                    )}
                  </div>
                  {/* Hover actions */}
                  <div className="absolute top-1 right-1 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={(e) => { e.stopPropagation(); setPreviewFile(f); }} className="p-1 bg-white/90 rounded-md shadow hover:bg-white" title="Preview">
                      <Eye size={12} className="text-[#18181B]" />
                    </button>
                    <a href={downloadUrl(f)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="p-1 bg-white/90 rounded-md shadow hover:bg-white" title="Download">
                      <DownloadIcon size={12} className="text-[#18181B]" />
                    </a>
                    {canWrite && (
                      <>
                        <button onClick={(e) => { e.stopPropagation(); setMovingFile(f); }} className="p-1 bg-white/90 rounded-md shadow hover:bg-white" title="Move">
                          <ArrowRight size={12} className="text-[#4F46E5]" />
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); handleDeleteFile(f.id); }} className="p-1 bg-white/90 rounded-md shadow hover:bg-red-50" title="Delete">
                          <Trash size={12} className="text-red-600" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Preview Modal */}
      {previewFile && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setPreviewFile(null)}>
          <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-3 border-b border-[#E4E4E7]">
              <div className="min-w-0">
                <p className="font-medium text-[#18181B] truncate">{previewFile.original_name}</p>
                <p className="text-xs text-[#71717A]">{humanSize(previewFile.size)} · {previewFile.mime_type}</p>
              </div>
              <div className="flex items-center gap-2">
                <a href={downloadUrl(previewFile)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs bg-[#4F46E5] text-white rounded-lg hover:bg-[#4338CA]">
                  <DownloadIcon size={12} /> Download
                </a>
                <button onClick={() => setPreviewFile(null)} className="p-1.5 hover:bg-[#F4F4F5] rounded-lg">
                  <X size={16} className="text-[#71717A]" />
                </button>
              </div>
            </div>
            <div className="flex-1 bg-[#F4F4F5] overflow-auto">
              {(previewFile.mime_type || '').startsWith('image/') ? (
                <img src={downloadUrl(previewFile)} alt={previewFile.original_name} className="max-w-full max-h-[80vh] mx-auto block" />
              ) : (previewFile.mime_type === 'application/pdf') ? (
                <iframe src={downloadUrl(previewFile)} title="PDF preview" className="w-full h-[80vh] border-0" />
              ) : (
                <div className="text-center py-12">
                  <FileText size={48} className="mx-auto text-[#A1A1AA] mb-2" />
                  <p className="text-[#71717A]">Preview not available for this file type.</p>
                  <a href={downloadUrl(previewFile)} target="_blank" rel="noreferrer" className="inline-block mt-3 px-3 py-1.5 text-sm bg-[#4F46E5] text-white rounded-lg">Download to view</a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Move dialog */}
      {movingFile && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setMovingFile(null)}>
          <div className="bg-white rounded-2xl max-w-md w-full p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-[#18181B] mb-2">Move file</h3>
            <p className="text-sm text-[#71717A] mb-4 truncate">{movingFile.original_name}</p>
            <div className="space-y-1 max-h-80 overflow-y-auto">
              {folders.filter((f) => f.id !== movingFile.folder_id).map((f) => (
                <button
                  key={f.id}
                  onClick={() => handleMoveFile(f.id)}
                  className="w-full flex items-center gap-2 px-3 py-2 hover:bg-[#F4F4F5] rounded-lg text-left"
                  data-testid={`move-target-${f.name}`}
                >
                  <Folder size={14} className="text-[#4F46E5]" />
                  <span className="text-sm flex-1">{f.name}</span>
                  <CaretRight size={12} className="text-[#A1A1AA]" />
                </button>
              ))}
            </div>
            <button onClick={() => setMovingFile(null)} className="mt-3 w-full px-3 py-2 text-sm text-[#71717A] hover:bg-[#F4F4F5] rounded-lg">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default FileManagerTab;
