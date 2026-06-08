import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Truck, Plus } from '@phosphor-icons/react';
import { API_URL } from '../../App';

const CarrierAssign = ({ shipmentId, currentCarrierId, currentCarrierName, onChanged }) => {
  const [carriers, setCarriers] = useState([]);
  const [selected, setSelected] = useState(currentCarrierId || '');
  const [busy, setBusy] = useState(false);
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);

  useEffect(() => { setSelected(currentCarrierId || ''); }, [currentCarrierId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await axios.get(`${API_URL}/api/delivery/carriers`);
        if (!cancelled) setCarriers(r.data?.items || []);
      } catch { /* non-fatal */ }
    })();
    return () => { cancelled = true; };
  }, []);

  const refreshCarriers = async () => {
    try {
      const r = await axios.get(`${API_URL}/api/delivery/carriers`);
      setCarriers(r.data?.items || []);
    } catch { /* */ }
  };

  const assign = async () => {
    if (!shipmentId || !selected) return;
    setBusy(true);
    try {
      await axios.post(`${API_URL}/api/delivery/${shipmentId}/carrier`, { carrier_id: selected });
      toast.success('Carrier assigned');
      onChanged?.();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to assign carrier');
    } finally { setBusy(false); }
  };

  const createCarrier = async () => {
    if (!newName.trim()) return;
    setAdding(true);
    try {
      const r = await axios.post(`${API_URL}/api/delivery/carriers`, { name: newName.trim() });
      toast.success('Carrier created');
      const newId = r.data?.data?.id;
      setNewName('');
      await refreshCarriers();
      if (newId) setSelected(newId);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to create carrier');
    } finally { setAdding(false); }
  };

  return (
    <div className="bg-white border border-[#E4E4E7] rounded-2xl p-4" data-testid="carrier-assign">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider font-bold text-[#71717A] mb-2">
        <Truck size={14} weight="bold" /> Carrier
      </div>
      <div className="flex items-center gap-2 mb-2">
        <select
          value={selected} onChange={(e) => setSelected(e.target.value)}
          className="flex-1 px-2 py-1.5 border border-[#E4E4E7] rounded-lg text-sm bg-white"
          data-testid="carrier-select"
        >
          <option value="">— select carrier —</option>
          {carriers.map((c) => (
            <option key={c.carrier_id || c.carrier_name} value={c.carrier_id || ''}>
              {c.carrier_name}{c.loads ? ` (${c.loads} loads, rating ${c.rating ?? '–'})` : ''}
            </option>
          ))}
        </select>
        <button
          onClick={assign}
          disabled={busy || !selected || selected === currentCarrierId}
          className="inline-flex items-center gap-1 text-[12px] font-semibold rounded-full bg-[#18181B] text-white px-3 py-1.5 hover:bg-[#27272A] disabled:opacity-50"
          data-testid="carrier-assign-btn"
        >
          Assign
        </button>
      </div>
      {currentCarrierName ? (
        <div className="text-[12px] text-[#52525B]">Currently: <span className="font-semibold text-[#18181B]">{currentCarrierName}</span></div>
      ) : (
        <div className="text-[12px] text-amber-700">No carrier assigned yet — this hurts delivery health.</div>
      )}

      <div className="mt-3 pt-3 border-t border-[#F4F4F5] flex items-center gap-2">
        <input
          type="text" value={newName} onChange={(e) => setNewName(e.target.value)}
          placeholder="+ add new carrier…"
          className="flex-1 px-2 py-1.5 border border-[#E4E4E7] rounded-lg text-sm bg-white"
          data-testid="carrier-new-name"
        />
        <button
          onClick={createCarrier}
          disabled={adding || !newName.trim()}
          className="inline-flex items-center gap-1 text-[12px] font-semibold rounded-full bg-white text-[#18181B] border border-[#E4E4E7] px-3 py-1.5 hover:bg-[#F4F4F5] disabled:opacity-50"
          data-testid="carrier-new-btn"
        >
          <Plus size={12} weight="bold" /> Create
        </button>
      </div>
    </div>
  );
};

export default CarrierAssign;
