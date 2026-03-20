'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@/hooks/useUser';
import { useToast } from '@/components/ui/Toast';
import AppShell from '@/components/layout/AppShell';
import Button from '@/components/ui/Button';
import StatusBadge from '@/components/ui/StatusBadge';
import EmptyState from '@/components/ui/EmptyState';
import Pagination from '@/components/ui/Pagination';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { formatCurrency, formatDate } from '@/lib/format';
import { Receipt as ReceiptIcon, Plus, Trash2 } from 'lucide-react';
import type { ReceiptWithUser } from '@/types';

type FilterTab = 'all' | 'pending' | 'approved' | 'rejected';

const PAGE_SIZE = 10;

export default function MyReceiptsPage() {
  const { user } = useUser();
  const router = useRouter();
  const toast = useToast();

  const [receipts, setReceipts] = useState<ReceiptWithUser[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterTab>('all');
  const [page, setPage] = useState(1);

  // 선택 상태
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const fetchReceipts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
      if (filter !== 'all') params.set('status', filter);
      const res = await fetch(`/api/receipts?${params}`);
      const json = await res.json();
      if (json.data) {
        setReceipts(json.data);
        setTotal(json.total ?? json.data.length);
      }
    } catch {
      toast.error('영수증 목록을 불러오지 못했습니다');
    } finally {
      setLoading(false);
    }
  }, [filter, page, toast]);

  useEffect(() => { fetchReceipts(); }, [fetchReceipts]);

  const handleFilterChange = (tab: FilterTab) => {
    setFilter(tab);
    setPage(1);
    setSelectedIds(new Set());
  };

  const toggleSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelectedIds(prev =>
      prev.size === receipts.length ? new Set() : new Set(receipts.map(r => r.id))
    );
  };

  const handleDelete = async () => {
    if (selectedIds.size === 0) return;
    setDeleting(true);
    try {
      const ids = Array.from(selectedIds).join(',');
      const res = await fetch(`/api/receipts?ids=${ids}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      toast.success(json.data.message);
      setSelectedIds(new Set());
      setDeleteConfirm(false);
      fetchReceipts();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '삭제에 실패했습니다');
    } finally {
      setDeleting(false);
    }
  };

  const tabs: { key: FilterTab; label: string }[] = [
    { key: 'all', label: '전체' },
    { key: 'pending', label: '대기중' },
    { key: 'approved', label: '승인됨' },
    { key: 'rejected', label: '반려됨' },
  ];

  const allSelected = receipts.length > 0 && selectedIds.size === receipts.length;

  return (
    <AppShell>
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold text-gray-900">내 제출 내역</h1>
          <div className="flex items-center gap-2">
            {selectedIds.size > 0 && (
              <Button size="sm" variant="danger" onClick={() => setDeleteConfirm(true)}>
                <Trash2 className="h-4 w-4" />
                선택 삭제 ({selectedIds.size})
              </Button>
            )}
            <Button size="sm" onClick={() => router.push('/receipts/submit')}>
              <Plus className="h-4 w-4" />
              새 영수증
            </Button>
          </div>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-4">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => handleFilterChange(tab.key)}
              className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                filter === tab.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* 전체선택 바 */}
        {!loading && receipts.length > 0 && (
          <div className="flex items-center gap-3 px-1 mb-2">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleSelectAll}
              className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            />
            <span className="text-xs text-gray-500">
              {allSelected ? '전체 해제' : `전체 선택 (${receipts.length}건)`}
            </span>
            {selectedIds.size > 0 && (
              <span className="text-xs text-primary-600 font-medium">{selectedIds.size}건 선택됨</span>
            )}
          </div>
        )}

        {/* Receipt list */}
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-white rounded-xl shadow-sm p-4 animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-1/3 mb-2" />
                <div className="h-3 bg-gray-200 rounded w-2/3 mb-2" />
                <div className="h-3 bg-gray-200 rounded w-1/4" />
              </div>
            ))}
          </div>
        ) : receipts.length === 0 ? (
          <EmptyState
            icon={ReceiptIcon}
            title="제출 내역이 없습니다"
            description="영수증을 제출하면 이곳에서 확인할 수 있습니다"
            actionLabel="첫 영수증 제출하기"
            onAction={() => router.push('/receipts/submit')}
          />
        ) : (
          <div className="space-y-3">
            {receipts.map(receipt => (
              <div
                key={receipt.id}
                className={`bg-white rounded-xl shadow-sm p-4 cursor-pointer hover:shadow-md transition-shadow active:bg-gray-50 flex items-start gap-3 ${
                  selectedIds.has(receipt.id) ? 'ring-2 ring-primary-400' : ''
                }`}
                onClick={() => router.push(`/receipts/${receipt.id}`)}
              >
                <input
                  type="checkbox"
                  checked={selectedIds.has(receipt.id)}
                  onChange={() => {}}
                  onClick={(e) => toggleSelect(receipt.id, e)}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs text-gray-500">{formatDate(receipt.date)}</span>
                        <StatusBadge status={receipt.status} />
                      </div>
                      <p className="text-sm font-medium text-gray-900 truncate">{receipt.description}</p>
                      {receipt.category && (
                        <span className="text-xs text-gray-500">{receipt.category.name}</span>
                      )}
                    </div>
                    <p className="text-sm font-semibold text-gray-900 ml-3 whitespace-nowrap">
                      {formatCurrency(receipt.final_amount)}
                    </p>
                  </div>
                  {receipt.status === 'rejected' && receipt.reject_reason && (
                    <div className="mt-2 text-xs text-danger-600 bg-danger-50 rounded-lg px-3 py-2">
                      반려 사유: {receipt.reject_reason}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <Pagination totalItems={total} pageSize={PAGE_SIZE} currentPage={page} onPageChange={setPage} />
      </div>

      <ConfirmDialog
        isOpen={deleteConfirm}
        title="영수증 삭제"
        message={`선택한 ${selectedIds.size}건의 영수증을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`}
        confirmText="삭제"
        variant="danger"
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteConfirm(false)}
      />
    </AppShell>
  );
}
