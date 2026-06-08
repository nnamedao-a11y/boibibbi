import React, { useEffect, useRef, useState } from 'react';
import { Truck, UploadSimple, Trash, FileText, FileImage, File as FileIcon, DownloadSimple } from '@phosphor-icons/react';
import axios from 'axios';
import { toast } from 'sonner';
import { API_URL } from '../../App';

const DOC_KINDS = [
  { id: 'bill_of_sale',       label: 'Bill of Sale' },
  { id: 'cmr',                label: 'CMR' },
  { id: 'invoice',            label: 'Invoice' },
  { id: 'export',             label: 'Export' },
  { id: 'customs',            label: 'Customs' },
  { id: 'transport_contract', label: 'Transport Contract' },
  { id: 'photos',             label: 'Photos' },
  { id: 'other',              label: 'Other' },
];

const KIND_LABEL = Object.fromEntries(DOC_KINDS.map((k) => [k.id, k.label]));

const kindIcon = (kind, mime) => {
  if (kind === 'photos' || (mime || '').startsWith('image/')) return FileImage;
  if ((mime || '').includes('pdf') || ['bill_of_sale','cmr','invoice','export','customs','transport_contract'].includes(kind)) return FileText;
  return FileIcon;
};

const fmtSize = (n) => {
  if (!n) return '';
  const kb = n / 1024;
  return kb < 1024 ? `${kb.toFixed(0)} KB` : `${(kb/1024).toFixed(1)} MB`;
};

const DeliveryDocuments = ({ shipmentId, documents = [], onChanged, missing = [] }) => {
  const inputRef = useRef(null);
  const [kind, setKind] = useState('cmr');
  const [busy, setBusy] = useState(false);

  const handlePick = () => inputRef.current?.click();

  const handleFile = async (file) => {
    if (!file || !shipmentId) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('kind', kind);
      await axios.post(`${API_URL}/api/delivery/${shipmentId}/documents/upload`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast.success(`Uploaded ${file.name}`);
      onChanged?.();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Upload failed');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const handleDelete = async (id) => {
    if (!shipmentId) return;
    try {
      await axios.delete(`${API_URL}/api/delivery/${shipmentId}/documents/${id}`);
      toast.success('Document deleted');
      onChanged?.();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to delete');
    }
  };

  const downloadHref = (url) => {
    if (!url) return '#';
    if (url.startsWith('http')) return url;
    const backend = API_URL || '';
    return `${backend}${url}`;
  };

  return (
    <div className="bg-white border border-[#E4E4E7] rounded-2xl p-4" data-testid="delivery-documents">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="text-[11px] uppercase tracking-wider font-bold text-[#71717A]">Delivery documents</div>
        <div className="flex items-center gap-2">
          <select
            value={kind} onChange={(e) => setKind(e.target.value)}
            className="px-2 py-1 border border-[#E4E4E7] rounded-lg text-[12px] bg-white"
            data-testid="doc-kind-select"
          >
            {DOC_KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
          </select>
          <button
            onClick={handlePick}
            disabled={busy}
            className="inline-flex items-center gap-1.5 text-[12px] font-semibold rounded-full bg-[#18181B] text-white px-3 py-1 hover:bg-[#27272A] disabled:opacity-60"
            data-testid="doc-upload-btn"
          >
            <UploadSimple size={12} weight="bold" /> {busy ? 'Uploading…' : 'Upload'}
          </button>
          <input
            type="file" ref={inputRef} className="hidden"
            data-testid="doc-file-input"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
        </div>
      </div>

      {missing && missing.length > 0 ? (
        <div className="mb-3 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-[12px] text-amber-800">
          <span className="font-semibold">Missing for delivery: </span>
          {missing.map((k) => KIND_LABEL[k] || k).join(', ')}
        </div>
      ) : null}

      {documents.length === 0 ? (
        <div className="py-8 text-center text-[#71717A] text-sm">No documents yet — upload Bill of Sale, CMR, Invoice, etc.</div>
      ) : (
        <div className="divide-y divide-[#F4F4F5]">
          {documents.map((d) => {
            const Icon = kindIcon(d.kind, d.content_type);
            return (
              <div key={d.id} className="flex items-center gap-3 py-2.5" data-testid={`doc-row-${d.id}`}>
                <Icon size={20} className="text-[#52525B] shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium text-[#18181B] truncate">{d.name}</div>
                  <div className="text-[11px] text-[#71717A]">
                    {KIND_LABEL[d.kind] || 'Other'} · {fmtSize(d.size)}{d.uploaded_by ? ` · ${d.uploaded_by}` : ''}
                  </div>
                </div>
                <a
                  href={downloadHref(d.url)} target="_blank" rel="noopener noreferrer"
                  className="text-[#52525B] hover:text-[#18181B] p-1"
                  title="Download"
                  data-testid={`doc-download-${d.id}`}
                >
                  <DownloadSimple size={14} weight="bold" />
                </a>
                <button
                  onClick={() => handleDelete(d.id)}
                  className="text-[#A1A1AA] hover:text-red-700 p-1"
                  title="Delete"
                  data-testid={`doc-delete-${d.id}`}
                >
                  <Trash size={14} weight="bold" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default DeliveryDocuments;
