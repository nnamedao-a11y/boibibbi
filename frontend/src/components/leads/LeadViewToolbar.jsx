import React, { useState, useRef, useEffect } from 'react';
import {
  Plus, Funnel, ArrowsDownUp, DotsThree, Trash, ArrowsClockwise,
  Tag, CaretDown, MagnifyingGlass, Kanban, Table, X,
} from '@phosphor-icons/react';
import { LEAD_PIPELINE, statusLabel } from './leadConstants';

/**
 * View-toolbar across the top of the Lead Workspace:
 *  - title + total
 *  - sort dropdown
 *  - bulk actions (visible when selectedCount > 0)
 *  - view toggle Table / Kanban
 *  - create-lead split button
 *  - filter pill (mobile-only burger toggle)
 */
const SORT_OPTIONS = [
  { key: 'created_at:desc', label: 'Нові спочатку' },
  { key: 'created_at:asc',  label: 'Старі спочатку' },
  { key: 'updated_at:desc', label: 'Недавня активність' },
  { key: 'budgetEur:desc',  label: 'Бюджет: високий спочатку' },
  { key: 'budgetEur:asc',   label: 'Бюджет: низький спочатку' },
  { key: 'name:asc',        label: 'Імʼя А→Я' },
  { key: 'name:desc',       label: 'Імʼя Я→А' },
];

const LeadViewToolbar = ({
  title, total, view, onViewChange, sort, onSortChange,
  selectedCount, onClearSelection, onBulkReassign, onBulkChangeStatus, onBulkDelete,
  onOpenCreate, onToggleFiltersMobile, lang, canBulkActions,
}) => {
  const [sortOpen, setSortOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const sortRef = useRef(null);
  const bulkRef = useRef(null);
  const statusRef = useRef(null);

  useEffect(() => {
    const onDoc = (e) => {
      if (sortRef.current && !sortRef.current.contains(e.target)) setSortOpen(false);
      if (bulkRef.current && !bulkRef.current.contains(e.target)) setBulkOpen(false);
      if (statusRef.current && !statusRef.current.contains(e.target)) setStatusOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const sortLabel = (SORT_OPTIONS.find(s => s.key === sort) || SORT_OPTIONS[0]).label;

  return (
    <div
      className="flex flex-wrap items-center gap-2 sm:gap-3 mb-4"
      data-testid="leads-toolbar"
    >
      {/* Mobile filters open */}
      <button
        onClick={onToggleFiltersMobile}
        className="lg:hidden inline-flex items-center gap-1.5 px-3 py-2 text-[13px] bg-white border border-[#E4E4E7] rounded-xl hover:bg-[#FAFAFA]"
        data-testid="leads-toolbar-mobile-filters"
      >
        <Funnel size={14} /> Фільтри
      </button>

      <div className="text-[13px] text-[#71717A] hidden sm:block">
        Всього: <span className="font-bold text-[#18181B]">{total}</span>
      </div>

      {/* Bulk actions */}
      {selectedCount > 0 ? (
        <div className="flex items-center gap-2 ml-auto sm:ml-0" data-testid="leads-toolbar-bulkbar">
          <span className="text-[12px] font-semibold text-[#3730A3] bg-[#EEF2FF] px-2 py-1 rounded-lg">
            Вибрано {selectedCount}
          </span>
          <div className="relative" ref={bulkRef}>
            <button
              onClick={() => setBulkOpen(o => !o)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-[13px] bg-[#4F46E5] hover:bg-[#4338CA] text-white rounded-xl font-semibold"
              data-testid="leads-toolbar-bulk-toggle"
            >
              <DotsThree size={16} weight="bold" /> Дії <CaretDown size={12} weight="bold" />
            </button>
            {bulkOpen ? (
              <div className="absolute right-0 mt-1 w-56 bg-white border border-[#E4E4E7] rounded-xl shadow-lg z-50 overflow-hidden">
                {canBulkActions ? (
                  <button
                    onClick={() => { setBulkOpen(false); onBulkReassign && onBulkReassign(); }}
                    className="w-full text-left px-3 py-2 text-[13px] hover:bg-[#F4F4F5] flex items-center gap-2"
                    data-testid="leads-bulk-reassign-action"
                  >
                    <ArrowsClockwise size={14} /> Перевизначити менеджера
                  </button>
                ) : null}
                <div className="relative" ref={statusRef}>
                  <button
                    onClick={() => setStatusOpen(o => !o)}
                    className="w-full text-left px-3 py-2 text-[13px] hover:bg-[#F4F4F5] flex items-center justify-between"
                    data-testid="leads-bulk-status-action"
                  >
                    <span className="flex items-center gap-2"><Tag size={14} /> Змінити статус</span>
                    <CaretDown size={12} />
                  </button>
                  {statusOpen ? (
                    <div className="absolute right-full top-0 mr-1 w-48 bg-white border border-[#E4E4E7] rounded-xl shadow-lg z-50 overflow-hidden">
                      {LEAD_PIPELINE.map(s => (
                        <button
                          key={s}
                          onClick={() => { setStatusOpen(false); setBulkOpen(false); onBulkChangeStatus && onBulkChangeStatus(s); }}
                          className="w-full text-left px-3 py-2 text-[12px] hover:bg-[#F4F4F5]"
                          data-testid={`leads-bulk-status-${s}`}
                        >
                          {statusLabel(lang, s)}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
                <button
                  onClick={() => { setBulkOpen(false); onBulkDelete && onBulkDelete(); }}
                  className="w-full text-left px-3 py-2 text-[13px] hover:bg-[#FEE2E2] text-[#B91C1C] flex items-center gap-2"
                  data-testid="leads-bulk-delete-action"
                >
                  <Trash size={14} /> Видалити
                </button>
              </div>
            ) : null}
          </div>
          <button
            onClick={onClearSelection}
            className="inline-flex items-center gap-1 px-2 py-2 text-[12px] text-[#71717A] hover:bg-[#F4F4F5] rounded-xl"
            data-testid="leads-toolbar-clear-selection"
          >
            <X size={12} /> Скинути
          </button>
        </div>
      ) : null}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Sort */}
      <div className="relative" ref={sortRef}>
        <button
          onClick={() => setSortOpen(o => !o)}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-[13px] bg-white border border-[#E4E4E7] rounded-xl hover:bg-[#FAFAFA]"
          data-testid="leads-toolbar-sort"
        >
          <ArrowsDownUp size={14} />
          <span className="hidden sm:inline truncate max-w-[180px]">{sortLabel}</span>
          <CaretDown size={12} />
        </button>
        {sortOpen ? (
          <div className="absolute right-0 mt-1 w-56 bg-white border border-[#E4E4E7] rounded-xl shadow-lg z-50 overflow-hidden">
            {SORT_OPTIONS.map(opt => (
              <button
                key={opt.key}
                onClick={() => { setSortOpen(false); onSortChange(opt.key); }}
                className={`w-full text-left px-3 py-2 text-[13px] hover:bg-[#F4F4F5] ${sort === opt.key ? 'bg-[#EEF2FF] text-[#3730A3] font-semibold' : ''}`}
                data-testid={`leads-toolbar-sort-${opt.key.replace(':', '-')}`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {/* View toggle */}
      <div className="inline-flex items-center bg-white border border-[#E4E4E7] rounded-xl p-0.5" data-testid="leads-toolbar-view-toggle">
        <button
          onClick={() => onViewChange('kanban')}
          className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-[12px] rounded-lg transition-colors ${view === 'kanban' ? 'bg-[#18181B] text-white font-semibold' : 'text-[#52525B] hover:bg-[#F4F4F5]'}`}
          data-testid="leads-view-kanban"
        >
          <Kanban size={13} weight="bold" /> <span className="hidden sm:inline">Kanban</span>
        </button>
        <button
          onClick={() => onViewChange('table')}
          className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-[12px] rounded-lg transition-colors ${view === 'table' ? 'bg-[#18181B] text-white font-semibold' : 'text-[#52525B] hover:bg-[#F4F4F5]'}`}
          data-testid="leads-view-table"
        >
          <Table size={13} weight="bold" /> <span className="hidden sm:inline">Таблиця</span>
        </button>
      </div>

      {/* Create */}
      <button
        onClick={onOpenCreate}
        className="inline-flex items-center gap-1.5 px-3 py-2 text-[13px] bg-[#18181B] hover:bg-black text-white rounded-xl font-semibold shadow-sm"
        data-testid="leads-toolbar-create"
      >
        <Plus size={14} weight="bold" /> <span className="hidden sm:inline">Створити лід</span>
      </button>
    </div>
  );
};

export default LeadViewToolbar;
