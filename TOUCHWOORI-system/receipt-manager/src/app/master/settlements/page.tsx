'use client';

import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/components/ui/Toast';
import AppShell from '@/components/layout/AppShell';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import EmptyState from '@/components/ui/EmptyState';
import { TableSkeleton } from '@/components/ui/Skeleton';
import DatePicker from '@/components/ui/DatePicker';
import { formatDate } from '@/lib/format';
import { CalendarRange, Plus, Pencil, Trash2 } from 'lucide-react';
import type { Settlement } from '@/types';

interface SettlementForm {
  title: string;
  start_date: string;
  end_date: string;
  memo: string;
}

const INITIAL_FORM: SettlementForm = {
  title: '',
  start_date: '',
  end_date: '',
  memo: '',
};

export default function SettlementsPage() {
  const toast = useToast();
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<SettlementForm>(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);

  // Delete confirm
  const [deleteDialog, setDeleteDialog] = useState<{
    open: boolean;
    settlement: Settlement | null;
  }>({ open: false, settlement: null });

  // 선택 상태
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchDeleteOpen, setBatchDeleteOpen] = useState(false);
  const [batchDeleteLoading, setBatchDeleteLoading] = useState(false);

  const fetchSettlements = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/settlements');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setSettlements(json.data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '결산기 목록을 불러올 수 없습니다');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchSettlements();
  }, [fetchSettlements]);

  const openAddModal = () => {
    setEditingId(null);
    setForm(INITIAL_FORM);
    setModalOpen(true);
  };

  const openEditModal = (s: Settlement) => {
    setEditingId(s.id);
    setForm({
      title: s.title,
      start_date: s.start_date,
      end_date: s.end_date,
      memo: s.memo || '',
    });
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.title.trim()) {
      toast.error('제목을 입력해주세요');
      return;
    }
    if (!form.start_date || !form.end_date) {
      toast.error('시작일과 종료일을 선택해주세요');
      return;
    }
    if (form.end_date < form.start_date) {
      toast.error('종료일은 시작일 이후여야 합니다');
      return;
    }

    setSubmitting(true);
    try {
      const body = {
        ...(editingId ? { id: editingId } : {}),
        title: form.title.trim(),
        start_date: form.start_date,
        end_date: form.end_date,
        memo: form.memo.trim() || null,
      };

      const res = await fetch('/api/settlements', {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);

      toast.success(editingId ? '결산기가 수정되었습니다' : '결산기가 추가되었습니다');
      setModalOpen(false);
      fetchSettlements();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '저장에 실패했습니다');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelectedIds(prev =>
      prev.size === settlements.length ? new Set() : new Set(settlements.map(s => s.id))
    );
  };

  const handleDelete = async () => {
    const s = deleteDialog.settlement;
    if (!s) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/settlements?id=${s.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      toast.success('결산기가 삭제되었습니다');
      setDeleteDialog({ open: false, settlement: null });
      fetchSettlements();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '삭제에 실패했습니다');
    } finally {
      setSubmitting(false);
    }
  };

  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return;
    setBatchDeleteLoading(true);
    try {
      const ids = Array.from(selectedIds).join(',');
      const res = await fetch(`/api/settlements?ids=${ids}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      toast.success(json.data.message);
      setSelectedIds(new Set());
      setBatchDeleteOpen(false);
      fetchSettlements();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '삭제에 실패했습니다');
    } finally {
      setBatchDeleteLoading(false);
    }
  };

  return (
    <AppShell>
      <div className="space-y-6">
        {/* 페이지 헤더 */}
        <div className="bg-gradient-to-r from-primary-600 to-primary-500 rounded-2xl p-6 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-white/20 p-2.5">
                <CalendarRange className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">결산기 관리</h1>
                <p className="text-sm text-white/80 mt-0.5">정산 기간을 관리합니다</p>
              </div>
            </div>
            <div className="flex gap-2">
              {selectedIds.size > 0 && (
                <Button
                  variant="danger"
                  onClick={() => setBatchDeleteOpen(true)}
                  className="!bg-red-500/80 !border-red-400/50 !text-white hover:!bg-red-600/80"
                >
                  <Trash2 className="h-4 w-4" />
                  선택 삭제 ({selectedIds.size})
                </Button>
              )}
              <Button
                variant="secondary"
                onClick={openAddModal}
                className="!bg-white/20 !border-white/30 !text-white hover:!bg-white/30"
              >
                <Plus className="h-4 w-4" />
                결산기 추가
              </Button>
            </div>
          </div>
        </div>

        {/* 테이블 */}
        {loading ? (
          <TableSkeleton rows={5} cols={6} />
        ) : settlements.length === 0 ? (
          <EmptyState
            icon={CalendarRange}
            title="등록된 결산기가 없습니다"
            description="결산기를 추가하여 정산 기간을 관리하세요"
            actionLabel="결산기 추가"
            onAction={openAddModal}
          />
        ) : (
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="px-4 py-3 w-10">
                      <input
                        type="checkbox"
                        checked={settlements.length > 0 && selectedIds.size === settlements.length}
                        onChange={toggleSelectAll}
                        className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                      />
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      제목
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      시작일
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      종료일
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider hidden md:table-cell">
                      비고
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider hidden lg:table-cell">
                      생성일
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      액션
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {settlements.map((s) => (
                    <tr key={s.id} className={`hover:bg-gray-50 transition-colors ${selectedIds.has(s.id) ? 'bg-primary-50' : ''}`}>
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(s.id)}
                          onChange={() => toggleSelect(s.id)}
                          className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                        />
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900 whitespace-nowrap">
                        {s.title}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                        {formatDate(s.start_date)}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                        {formatDate(s.end_date)}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500 hidden md:table-cell max-w-[200px] truncate">
                        {s.memo || '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-400 whitespace-nowrap hidden lg:table-cell">
                        {formatDate(s.created_at)}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-2">
                          <Button size="sm" variant="secondary" onClick={() => openEditModal(s)}>
                            <Pencil className="h-3.5 w-3.5" />
                            수정
                          </Button>
                          <Button
                            size="sm"
                            variant="danger"
                            onClick={() => setDeleteDialog({ open: true, settlement: s })}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            삭제
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* 추가/수정 모달 */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? '결산기 수정' : '결산기 추가'}
      >
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* 제목 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              제목 <span className="text-danger-600">*</span>
            </label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="예: 2026년 1분기 결산"
              autoFocus
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm
                focus:ring-2 focus:ring-primary-500 focus:border-primary-500
                outline-none transition-shadow"
            />
          </div>

          {/* 날짜 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <DatePicker
              label="시작일"
              value={form.start_date}
              onChange={(v) => setForm({ ...form, start_date: v })}
              required
            />
            <DatePicker
              label="종료일"
              value={form.end_date}
              onChange={(v) => setForm({ ...form, end_date: v })}
              required
            />
          </div>

          {form.end_date && form.start_date && form.end_date < form.start_date && (
            <p className="text-sm text-danger-600 -mt-2">
              종료일은 시작일 이후여야 합니다
            </p>
          )}

          {/* 비고 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">비고</label>
            <textarea
              value={form.memo}
              onChange={(e) => setForm({ ...form, memo: e.target.value })}
              rows={3}
              placeholder="추가 메모를 입력하세요 (선택)"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm resize-none
                focus:ring-2 focus:ring-primary-500 focus:border-primary-500
                outline-none transition-shadow"
            />
          </div>

          {/* 버튼 */}
          <div className="flex gap-3 justify-end pt-2">
            <Button variant="secondary" type="button" onClick={() => setModalOpen(false)} disabled={submitting}>
              취소
            </Button>
            <Button type="submit" loading={submitting}>
              {editingId ? '수정하기' : '추가하기'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* 단건 삭제 확인 */}
      <ConfirmDialog
        isOpen={deleteDialog.open}
        title="결산기 삭제"
        message={`"${deleteDialog.settlement?.title}" 결산기를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`}
        confirmText="삭제"
        variant="danger"
        loading={submitting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteDialog({ open: false, settlement: null })}
      />

      {/* 일괄 삭제 확인 */}
      <ConfirmDialog
        isOpen={batchDeleteOpen}
        title="결산기 일괄 삭제"
        message={`선택한 ${selectedIds.size}건의 결산기를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`}
        confirmText="삭제"
        variant="danger"
        loading={batchDeleteLoading}
        onConfirm={handleBatchDelete}
        onCancel={() => setBatchDeleteOpen(false)}
      />
    </AppShell>
  );
}
