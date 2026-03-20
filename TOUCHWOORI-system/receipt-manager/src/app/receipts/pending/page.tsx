'use client';

import { useState, useEffect } from 'react';
import { useUser } from '@/hooks/useUser';
import { useToast } from '@/components/ui/Toast';
import AppShell from '@/components/layout/AppShell';
import Button from '@/components/ui/Button';
import EmptyState from '@/components/ui/EmptyState';
import Pagination from '@/components/ui/Pagination';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import Modal from '@/components/ui/Modal';
import { formatCurrency, formatDate } from '@/lib/format';
import { CheckCircle, XCircle, Image as ImageIcon, Trash2, X, Link2, PlusCircle } from 'lucide-react';
import type { ReceiptWithUser, Category } from '@/types';

type LedgerEntry = {
  id: string;
  date: string;
  description: string;
  income: number;
  expense: number;
  receipt_id: string | null;
};

const PAGE_SIZE = 20;

export default function PendingReceiptsPage() {
  const { user } = useUser();
  const toast = useToast();

  const [receipts, setReceipts] = useState<ReceiptWithUser[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Image viewer
  const [viewingImage, setViewingImage] = useState<string | null>(null);

  // Reject modal
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectLoading, setRejectLoading] = useState(false);

  // Batch approve confirm
  const [batchConfirmOpen, setBatchConfirmOpen] = useState(false);
  const [batchLoading, setBatchLoading] = useState(false);

  // Batch delete
  const [batchDeleteOpen, setBatchDeleteOpen] = useState(false);
  const [batchDeleteLoading, setBatchDeleteLoading] = useState(false);

  // Individual approve loading
  const [approvingId, setApprovingId] = useState<string | null>(null);

  // Approve modal
  const [approveModal, setApproveModal] = useState<{ open: boolean; receipt: ReceiptWithUser | null }>({ open: false, receipt: null });
  const [linkMode, setLinkMode] = useState<'new' | 'existing'>('new');
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>([]);
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [loadingEntries, setLoadingEntries] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  // 이미 연동된 항목 정보
  const [alreadyLinkedEntry, setAlreadyLinkedEntry] = useState<LedgerEntry | null>(null);
  const [checkingLink, setCheckingLink] = useState(false);
  // Editable fields for "새 항목 추가"
  const [entryDate, setEntryDate] = useState('');
  const [entryDesc, setEntryDesc] = useState('');
  const [entryAmount, setEntryAmount] = useState('');
  const [entryCategoryId, setEntryCategoryId] = useState('');

  const fetchReceipts = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        status: 'pending',
        page: String(page),
        pageSize: String(PAGE_SIZE),
      });
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
  };

  useEffect(() => {
    fetchReceipts();
  }, [page]);

  useEffect(() => {
    fetch('/api/categories')
      .then((r) => r.json())
      .then((j) => { if (j.data) setCategories((j.data as Category[]).filter((c) => c.is_active)); })
      .catch(() => {});
  }, []);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === receipts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(receipts.map(r => r.id)));
    }
  };

  const formatAmount = (v: string) => {
    const n = v.replace(/[^0-9]/g, '');
    return n ? Number(n).toLocaleString('ko-KR') : '';
  };
  const parseAmount = (v: string) => Number(v.replace(/[^0-9]/g, '')) || 0;

  // Open approve modal
  const openApproveModal = async (receipt: ReceiptWithUser) => {
    setApproveModal({ open: true, receipt });
    setLinkMode('new');
    setSelectedEntryId(null);
    setLedgerEntries([]);
    setAlreadyLinkedEntry(null);
    setEntryDate(receipt.date);
    setEntryDesc(receipt.description);
    setEntryAmount(receipt.final_amount.toLocaleString('ko-KR'));
    setEntryCategoryId(receipt.category_id || '');

    // 이미 연동된 장부 항목이 있는지 확인
    setCheckingLink(true);
    try {
      const ledgerRes = await fetch('/api/ledgers');
      const ledgerJson = await ledgerRes.json();
      const mainLedger = (ledgerJson.data as { id: string; type: string }[])?.find(l => l.type === 'main');
      if (mainLedger) {
        const entriesRes = await fetch(`/api/ledgers/${mainLedger.id}/entries?pageSize=200`);
        const entriesJson = await entriesRes.json();
        const linked = (entriesJson.data as LedgerEntry[])?.find(e => e.receipt_id === receipt.id);
        if (linked) setAlreadyLinkedEntry(linked);
      }
    } catch { /* ignore */ }
    setCheckingLink(false);
  };

  // Load existing ledger entries when link mode selected
  const loadLedgerEntries = async () => {
    setLoadingEntries(true);
    try {
      const ledgerRes = await fetch('/api/ledgers');
      const ledgerJson = await ledgerRes.json();
      if (!ledgerRes.ok) throw new Error(ledgerJson.error);
      const mainLedger = (ledgerJson.data as { id: string; type: string }[]).find(l => l.type === 'main');
      if (!mainLedger) throw new Error('본 장부를 찾을 수 없습니다');

      const entriesRes = await fetch(`/api/ledgers/${mainLedger.id}/entries?pageSize=100`);
      const entriesJson = await entriesRes.json();
      if (!entriesRes.ok) throw new Error(entriesJson.error);
      setLedgerEntries(entriesJson.data || []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '장부 항목을 불러오지 못했습니다');
      setLinkMode('new');
    } finally {
      setLoadingEntries(false);
    }
  };

  // Individual approve
  const handleApprove = async () => {
    const receipt = approveModal.receipt;
    if (!receipt) return;
    setApprovingId(receipt.id);
    try {
      const body: Record<string, unknown> = {};
      if (linkMode === 'existing' && selectedEntryId) {
        body.ledgerEntryId = selectedEntryId;
      } else if (linkMode === 'new') {
        const cat = categories.find((c) => c.id === entryCategoryId);
        const amount = parseAmount(entryAmount);
        body.entryOverrides = {
          date: entryDate,
          description: entryDesc,
          income: cat?.type === 'income' ? amount : 0,
          expense: cat?.type === 'expense' ? amount : 0,
          category_id: entryCategoryId,
        };
      }
      const res = await fetch(`/api/receipts/${receipt.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || '승인에 실패했습니다');
      }
      toast.success('승인되었습니다');
      setReceipts(prev => prev.filter(r => r.id !== receipt.id));
      setTotal(prev => prev - 1);
      selectedIds.delete(receipt.id);
      setSelectedIds(new Set(selectedIds));
      setApproveModal({ open: false, receipt: null });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '승인에 실패했습니다');
    } finally {
      setApprovingId(null);
    }
  };

  // Reject
  const handleReject = async () => {
    if (!rejectingId) return;
    setRejectLoading(true);
    try {
      const res = await fetch(`/api/receipts/${rejectingId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reject_reason: rejectReason || null }),
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || '반려에 실패했습니다');
      }
      toast.success('반려되었습니다');
      setReceipts(prev => prev.filter(r => r.id !== rejectingId));
      setTotal(prev => prev - 1);
      selectedIds.delete(rejectingId);
      setSelectedIds(new Set(selectedIds));
      setRejectingId(null);
      setRejectReason('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '반려에 실패했습니다');
    } finally {
      setRejectLoading(false);
    }
  };

  // Batch delete
  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return;
    setBatchDeleteLoading(true);
    try {
      const ids = Array.from(selectedIds).join(',');
      const res = await fetch(`/api/receipts?ids=${ids}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      toast.success(json.data.message);
      setReceipts(prev => prev.filter(r => !selectedIds.has(r.id)));
      setTotal(prev => prev - selectedIds.size);
      setSelectedIds(new Set());
      setBatchDeleteOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '삭제에 실패했습니다');
    } finally {
      setBatchDeleteLoading(false);
    }
  };

  // Batch approve
  const handleBatchApprove = async () => {
    if (selectedIds.size === 0) return;
    setBatchLoading(true);
    try {
      const ids = Array.from(selectedIds);
      const firstId = ids[0];
      const res = await fetch(`/api/receipts/${firstId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receiptIds: ids }),
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || '일괄 승인에 실패했습니다');
      }
      toast.success(`${ids.length}건이 승인되었습니다`);
      setReceipts(prev => prev.filter(r => !selectedIds.has(r.id)));
      setTotal(prev => prev - ids.length);
      setSelectedIds(new Set());
      setBatchConfirmOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '일괄 승인에 실패했습니다');
    } finally {
      setBatchLoading(false);
    }
  };

  return (
    <AppShell>
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold text-gray-900">승인 대기 영수증</h1>
          {selectedIds.size > 0 && (
            <div className="flex gap-2">
              <Button size="sm" onClick={() => setBatchConfirmOpen(true)}>
                <CheckCircle className="h-4 w-4" />
                선택 승인 ({selectedIds.size}건)
              </Button>
              <Button size="sm" variant="danger" onClick={() => setBatchDeleteOpen(true)}>
                <Trash2 className="h-4 w-4" />
                선택 삭제 ({selectedIds.size}건)
              </Button>
            </div>
          )}
        </div>

        {loading ? (
          <div className="bg-white rounded-xl shadow-sm p-6 animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-full mb-4" />
            <div className="h-4 bg-gray-200 rounded w-full mb-4" />
            <div className="h-4 bg-gray-200 rounded w-2/3" />
          </div>
        ) : receipts.length === 0 ? (
          <EmptyState
            icon={CheckCircle}
            title="모든 영수증이 처리되었습니다"
            description="승인 대기 중인 영수증이 없습니다"
          />
        ) : (
          <>
            {/* Mobile card view */}
            <div className="md:hidden space-y-3">
              {receipts.map(receipt => (
                <div key={receipt.id} className="bg-white rounded-xl shadow-sm p-4">
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(receipt.id)}
                      onChange={() => toggleSelect(receipt.id)}
                      className="mt-1 h-5 w-5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs text-gray-500">
                          {receipt.submitter?.name ?? '알 수 없음'}
                        </span>
                        <span className="text-xs text-gray-400">
                          {formatDate(receipt.date)}
                        </span>
                      </div>
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {receipt.description}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-sm font-semibold">
                          {formatCurrency(receipt.final_amount)}
                        </span>
                        {receipt.category && (
                          <span className="text-xs text-gray-500">{receipt.category.name}</span>
                        )}
                      </div>
                      {receipt.image_url && (
                        <button
                          type="button"
                          onClick={() => setViewingImage(receipt.image_url)}
                          className="mt-2 text-xs text-primary-600 flex items-center gap-1"
                        >
                          <ImageIcon className="h-3 w-3" /> 이미지 보기
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2 mt-3 ml-8">
                    <Button
                      size="sm"
                      onClick={() => openApproveModal(receipt)}
                      loading={approvingId === receipt.id}
                      className="flex-1"
                    >
                      승인
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => setRejectingId(receipt.id)}
                      className="flex-1"
                    >
                      반려
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop table view */}
            <div className="hidden md:block bg-white rounded-xl shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="px-4 py-3 text-left">
                        <input
                          type="checkbox"
                          checked={selectedIds.size === receipts.length && receipts.length > 0}
                          onChange={toggleSelectAll}
                          className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                        />
                      </th>
                      <th className="px-4 py-3 text-left font-medium text-gray-600">제출자</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-600">날짜</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-600">내용</th>
                      <th className="px-4 py-3 text-right font-medium text-gray-600">금액</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-600">카테고리</th>
                      <th className="px-4 py-3 text-center font-medium text-gray-600">이미지</th>
                      <th className="px-4 py-3 text-center font-medium text-gray-600">액션</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {receipts.map(receipt => (
                      <tr key={receipt.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(receipt.id)}
                            onChange={() => toggleSelect(receipt.id)}
                            className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                          />
                        </td>
                        <td className="px-4 py-3 text-gray-900">
                          {receipt.submitter?.name ?? '알 수 없음'}
                        </td>
                        <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                          {formatDate(receipt.date)}
                        </td>
                        <td className="px-4 py-3 text-gray-900 max-w-[200px] truncate">
                          {receipt.description}
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-gray-900 whitespace-nowrap">
                          {formatCurrency(receipt.final_amount)}
                        </td>
                        <td className="px-4 py-3 text-gray-600">
                          {receipt.category?.name ?? '-'}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {receipt.image_url ? (
                            <button
                              type="button"
                              onClick={() => setViewingImage(receipt.image_url)}
                              className="inline-flex items-center justify-center"
                            >
                              <img
                                src={receipt.image_url}
                                alt="영수증"
                                className="h-10 w-10 rounded object-cover border border-gray-200 hover:ring-2 hover:ring-primary-400 transition-shadow cursor-pointer"
                              />
                            </button>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => openApproveModal(receipt)}
                              disabled={approvingId === receipt.id}
                              className="rounded-lg p-1.5 text-success-600 hover:bg-success-50 transition-colors disabled:opacity-50"
                              title="승인"
                            >
                              <CheckCircle className="h-5 w-5" />
                            </button>
                            <button
                              onClick={() => setRejectingId(receipt.id)}
                              className="rounded-lg p-1.5 text-danger-600 hover:bg-danger-50 transition-colors"
                              title="반려"
                            >
                              <XCircle className="h-5 w-5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        <Pagination
          totalItems={total}
          pageSize={PAGE_SIZE}
          currentPage={page}
          onPageChange={setPage}
        />
      </div>

      {/* Image viewer overlay */}
      {viewingImage && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setViewingImage(null)}
        >
          <button
            onClick={() => setViewingImage(null)}
            className="absolute top-4 right-4 bg-white/20 rounded-full p-2 text-white hover:bg-white/40 transition-colors"
            aria-label="닫기"
          >
            <X className="h-6 w-6" />
          </button>
          <img
            src={viewingImage}
            alt="영수증 이미지"
            className="max-w-full max-h-[85vh] object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {/* Reject modal */}
      <Modal
        isOpen={!!rejectingId}
        onClose={() => { setRejectingId(null); setRejectReason(''); }}
        title="영수증 반려"
        size="sm"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              반려 사유 <span className="text-xs text-gray-400">(선택)</span>
            </label>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="반려 사유를 입력해주세요"
              rows={3}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm
                focus:ring-2 focus:ring-primary-500 focus:border-primary-500
                outline-none transition-shadow resize-none"
            />
          </div>
          <div className="flex gap-2 justify-end">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => { setRejectingId(null); setRejectReason(''); }}
              disabled={rejectLoading}
            >
              취소
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={handleReject}
              loading={rejectLoading}
            >
              반려하기
            </Button>
          </div>
        </div>
      </Modal>

      {/* Batch approve confirm */}
      <ConfirmDialog
        isOpen={batchConfirmOpen}
        title="일괄 승인"
        message={`${selectedIds.size}건을 승인하시겠습니까?`}
        confirmText="승인"
        variant="primary"
        loading={batchLoading}
        onConfirm={handleBatchApprove}
        onCancel={() => setBatchConfirmOpen(false)}
      />

      {/* Batch delete confirm */}
      <ConfirmDialog
        isOpen={batchDeleteOpen}
        title="영수증 일괄 삭제"
        message={`선택한 ${selectedIds.size}건의 영수증을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`}
        confirmText="삭제"
        variant="danger"
        loading={batchDeleteLoading}
        onConfirm={handleBatchDelete}
        onCancel={() => setBatchDeleteOpen(false)}
      />

      {/* Approve modal */}
      <Modal
        isOpen={approveModal.open}
        onClose={() => setApproveModal({ open: false, receipt: null })}
        title="영수증 승인"
      >
        {approveModal.receipt && (
          <div className="space-y-5">
            {/* 영수증 정보 */}
            <div className="bg-gray-50 rounded-xl p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">제출자</span>
                <span className="font-medium text-gray-900">{approveModal.receipt.submitter?.name ?? '-'}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">날짜</span>
                <span className="font-medium text-gray-900">{formatDate(approveModal.receipt.date)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">내용</span>
                <span className="font-medium text-gray-900">{approveModal.receipt.description}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">금액</span>
                <span className="font-semibold text-gray-900">{formatCurrency(approveModal.receipt.final_amount)}</span>
              </div>
            </div>

            {/* 이미 연동 확인 중 */}
            {checkingLink && (
              <div className="flex items-center justify-center py-4">
                <div className="h-5 w-5 border-2 border-primary-400 border-t-transparent rounded-full animate-spin mr-2" />
                <span className="text-sm text-gray-500">연동 상태 확인 중...</span>
              </div>
            )}

            {/* 이미 연동된 경우 */}
            {!checkingLink && alreadyLinkedEntry && (
              <div className="bg-success-50 border border-success-200 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Link2 className="h-4 w-4 text-success-600" />
                  <p className="text-sm font-medium text-success-700">이미 장부 항목에 연동되어 있습니다</p>
                </div>
                <div className="space-y-1 text-sm text-success-800">
                  <div className="flex justify-between">
                    <span>날짜</span>
                    <span className="font-medium">{formatDate(alreadyLinkedEntry.date)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>항목명</span>
                    <span className="font-medium">{alreadyLinkedEntry.description}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>금액</span>
                    <span className="font-medium">{formatCurrency(alreadyLinkedEntry.expense || alreadyLinkedEntry.income)}</span>
                  </div>
                </div>
                <p className="text-xs text-success-600 mt-2">승인하면 영수증 상태만 변경됩니다.</p>
              </div>
            )}

            {/* 연동되지 않은 경우: 처리 방식 선택 */}
            {!checkingLink && !alreadyLinkedEntry && (
              <>
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-3">장부 처리 방식</p>
                  <div className="flex gap-3">
                    <label className={`flex-1 flex items-center gap-2 rounded-xl border-2 p-3 cursor-pointer transition-all
                      ${linkMode === 'new' ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-gray-200 hover:border-gray-300 text-gray-600'}`}>
                      <input type="radio" className="sr-only" checked={linkMode === 'new'} onChange={() => setLinkMode('new')} />
                      <PlusCircle className="h-4 w-4 shrink-0" />
                      <span className="text-sm font-medium">새 항목 추가</span>
                    </label>
                    <label className={`flex-1 flex items-center gap-2 rounded-xl border-2 p-3 cursor-pointer transition-all
                      ${linkMode === 'existing' ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-gray-200 hover:border-gray-300 text-gray-600'}`}
                      onClick={() => { if (linkMode !== 'existing') { setLinkMode('existing'); loadLedgerEntries(); } }}
                    >
                      <input type="radio" className="sr-only" checked={linkMode === 'existing'} onChange={() => {}} />
                      <Link2 className="h-4 w-4 shrink-0" />
                      <span className="text-sm font-medium">기존 항목 연동</span>
                    </label>
                  </div>
                </div>

                {/* 새 항목 추가 편집 필드 */}
                {linkMode === 'new' && (
                  <div className="space-y-3 bg-gray-50 rounded-xl p-4">
                    <p className="text-xs font-medium text-gray-500">장부에 추가될 내용을 확인·수정하세요</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">날짜</label>
                        <input
                          type="date"
                          value={entryDate}
                          onChange={(e) => setEntryDate(e.target.value)}
                          className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm
                            focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">금액</label>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={entryAmount}
                          onChange={(e) => setEntryAmount(formatAmount(e.target.value))}
                          className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm text-right tabular-nums
                            focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">항목명</label>
                      <input
                        type="text"
                        value={entryDesc}
                        onChange={(e) => setEntryDesc(e.target.value)}
                        className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm
                          focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">카테고리</label>
                      <select
                        value={entryCategoryId}
                        onChange={(e) => setEntryCategoryId(e.target.value)}
                        className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm
                          focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
                      >
                        <option value="">선택</option>
                        <optgroup label="수입">
                          {categories.filter((c) => c.type === 'income').map((c) => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </optgroup>
                        <optgroup label="지출">
                          {categories.filter((c) => c.type === 'expense').map((c) => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </optgroup>
                      </select>
                    </div>
                  </div>
                )}

                {/* 기존 항목 목록 */}
                {linkMode === 'existing' && (
                  <div>
                    <p className="text-xs text-gray-500 mb-2">연동할 장부 항목을 선택하세요</p>
                    {loadingEntries ? (
                      <div className="space-y-2">
                        {[...Array(3)].map((_, i) => (
                          <div key={i} className="h-10 bg-gray-100 rounded-lg animate-pulse" />
                        ))}
                      </div>
                    ) : ledgerEntries.length === 0 ? (
                      <p className="text-sm text-gray-400 text-center py-4">장부 항목이 없습니다</p>
                    ) : (
                      <div className="max-h-52 overflow-y-auto space-y-1 border border-gray-200 rounded-xl p-2">
                        {ledgerEntries.map(entry => (
                          <label
                            key={entry.id}
                            className={`flex items-center gap-3 rounded-lg px-3 py-2 cursor-pointer transition-colors
                              ${selectedEntryId === entry.id ? 'bg-primary-50 text-primary-700' : 'hover:bg-gray-50 text-gray-700'}`}
                          >
                            <input
                              type="radio"
                              name="entry"
                              className="h-4 w-4 text-primary-600"
                              checked={selectedEntryId === entry.id}
                              onChange={() => setSelectedEntryId(entry.id)}
                            />
                            <span className="text-xs text-gray-400 shrink-0">{formatDate(entry.date)}</span>
                            <span className="text-sm flex-1 truncate">{entry.description}</span>
                            <span className="text-sm font-medium shrink-0">{formatCurrency(entry.expense || entry.income)}</span>
                            {entry.receipt_id && (
                              <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">연동됨</span>
                            )}
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            <div className="flex gap-3 justify-end pt-1">
              <Button variant="secondary" onClick={() => setApproveModal({ open: false, receipt: null })} disabled={!!approvingId}>
                취소
              </Button>
              <Button
                onClick={handleApprove}
                loading={!!approvingId}
                disabled={checkingLink || (!alreadyLinkedEntry && linkMode === 'existing' && !selectedEntryId)}
              >
                승인하기
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </AppShell>
  );
}
