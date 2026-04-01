'use client';

export const runtime = 'edge';


import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase';
import { useToast } from '@/components/ui/Toast';
import AppShell from '@/components/layout/AppShell';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import EmptyState from '@/components/ui/EmptyState';
import StatusBadge from '@/components/ui/StatusBadge';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { BadgeCheck, Plus, Pencil, Power, AlertTriangle } from 'lucide-react';
import type { Position } from '@/types';

interface PositionForm {
  name: string;
  sort_order: number;
}

const INITIAL_FORM: PositionForm = { name: '', sort_order: 0 };

export default function PositionsPage() {
  const toast = useToast();
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<PositionForm>(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);

  // Confirm
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    position: Position | null;
  }>({ open: false, position: null });
  const [hasUsers, setHasUsers] = useState(false);
  const [checkingUsers, setCheckingUsers] = useState(false);

  const fetchPositions = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch all positions including inactive via supabase client directly
      const supabase = createClient();
      const { data, error } = await supabase
        .from('positions')
        .select('*')
        .order('sort_order', { ascending: true });

      if (error) throw new Error(error.message);
      setPositions(data || []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '직분 목록을 불러올 수 없습니다');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchPositions();
  }, [fetchPositions]);

  const openAddModal = () => {
    setEditingId(null);
    setForm(INITIAL_FORM);
    setModalOpen(true);
  };

  const openEditModal = (pos: Position) => {
    setEditingId(pos.id);
    setForm({ name: pos.name, sort_order: pos.sort_order });
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error('직분명을 입력해주세요');
      return;
    }
    setSubmitting(true);
    try {
      const body = {
        ...(editingId ? { id: editingId } : {}),
        name: form.name.trim(),
        sort_order: form.sort_order,
      };

      const res = await fetch('/api/positions', {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);

      toast.success(editingId ? '직분이 수정되었습니다' : '직분이 추가되었습니다');
      setModalOpen(false);
      fetchPositions();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '저장에 실패했습니다');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeactivateClick = async (pos: Position) => {
    if (pos.is_active) {
      // Check if any users have this position
      setCheckingUsers(true);
      setHasUsers(false);
      try {
        const supabase = createClient();
        const { count } = await supabase
          .from('users')
          .select('id', { count: 'exact', head: true })
          .eq('position', pos.name)
          .eq('status', 'active');

        if (count && count > 0) {
          setHasUsers(true);
        }
      } catch {
        // proceed anyway
      } finally {
        setCheckingUsers(false);
      }
    } else {
      setHasUsers(false);
    }
    setConfirmDialog({ open: true, position: pos });
  };

  const handleToggleActive = async () => {
    const pos = confirmDialog.position;
    if (!pos) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/positions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: pos.id, is_active: !pos.is_active }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      toast.success(pos.is_active ? '직분이 비활성화되었습니다' : '직분이 활성화되었습니다');
      setConfirmDialog({ open: false, position: null });
      fetchPositions();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '상태 변경에 실패했습니다');
    } finally {
      setSubmitting(false);
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
                <BadgeCheck className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">직분 관리</h1>
                <p className="text-sm text-white/80 mt-0.5">교회 직분을 관리합니다</p>
              </div>
            </div>
            <Button
              variant="secondary"
              onClick={openAddModal}
              className="!bg-white/20 !border-white/30 !text-white hover:!bg-white/30"
            >
              <Plus className="h-4 w-4" />
              추가
            </Button>
          </div>
        </div>

        {/* 테이블 */}
        {loading ? (
          <TableSkeleton rows={5} cols={4} />
        ) : positions.length === 0 ? (
          <EmptyState
            icon={BadgeCheck}
            title="등록된 직분이 없습니다"
            description="직분을 추가해주세요"
            actionLabel="추가"
            onAction={openAddModal}
          />
        ) : (
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      직분명
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      표시 순서
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      상태
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      액션
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {positions.map((pos) => (
                    <tr
                      key={pos.id}
                      className={`hover:bg-gray-50 transition-colors ${!pos.is_active ? 'opacity-60' : ''}`}
                    >
                      <td className="px-4 py-3 text-sm font-medium text-gray-900 whitespace-nowrap">
                        {pos.name}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                        {pos.sort_order}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <StatusBadge status={pos.is_active ? 'active' : 'inactive'} />
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-2">
                          <Button size="sm" variant="secondary" onClick={() => openEditModal(pos)}>
                            <Pencil className="h-3.5 w-3.5" />
                            수정
                          </Button>
                          <Button
                            size="sm"
                            variant={pos.is_active ? 'danger' : 'secondary'}
                            onClick={() => handleDeactivateClick(pos)}
                          >
                            <Power className="h-3.5 w-3.5" />
                            {pos.is_active ? '비활성화' : '활성화'}
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
        title={editingId ? '직분 수정' : '직분 추가'}
        size="sm"
      >
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              직분명 <span className="text-danger-600">*</span>
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="예: 부장"
              autoFocus
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm
                focus:ring-2 focus:ring-primary-500 focus:border-primary-500
                outline-none transition-shadow"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">표시 순서</label>
            <input
              type="number"
              value={form.sort_order}
              onChange={(e) => setForm({ ...form, sort_order: parseInt(e.target.value) || 0 })}
              min={0}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm
                focus:ring-2 focus:ring-primary-500 focus:border-primary-500
                outline-none transition-shadow"
            />
            <p className="mt-1 text-xs text-gray-400">숫자가 낮을수록 먼저 표시됩니다</p>
          </div>

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

      {/* 활성/비활성 확인 */}
      <ConfirmDialog
        isOpen={confirmDialog.open}
        title={confirmDialog.position?.is_active ? '직분 비활성화' : '직분 활성화'}
        message={
          hasUsers && confirmDialog.position?.is_active
            ? `"${confirmDialog.position?.name}" 직분을 사용 중인 활성 사용자가 있습니다. 비활성화하면 회원가입 시 이 직분을 선택할 수 없게 됩니다. 계속하시겠습니까?`
            : confirmDialog.position?.is_active
              ? `"${confirmDialog.position?.name}" 직분을 비활성화하시겠습니까? 회원가입 시 선택할 수 없게 됩니다.`
              : `"${confirmDialog.position?.name}" 직분을 다시 활성화하시겠습니까?`
        }
        confirmText={confirmDialog.position?.is_active ? '비활성화' : '활성화'}
        variant={confirmDialog.position?.is_active ? 'danger' : 'primary'}
        loading={submitting || checkingUsers}
        onConfirm={handleToggleActive}
        onCancel={() => {
          setConfirmDialog({ open: false, position: null });
          setHasUsers(false);
        }}
      />
    </AppShell>
  );
}
