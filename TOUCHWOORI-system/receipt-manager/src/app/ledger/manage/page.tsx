'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@/hooks/useUser';
import { useToast } from '@/components/ui/Toast';
import AppShell from '@/components/layout/AppShell';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import EmptyState from '@/components/ui/EmptyState';
import StatusBadge from '@/components/ui/StatusBadge';
import { CardSkeleton } from '@/components/ui/Skeleton';
import { formatDateShort } from '@/lib/format';
import { BookOpen, Plus, Settings, Power } from 'lucide-react';
import type { Ledger } from '@/types';

export default function LedgerManagePage() {
  const { user } = useUser();
  const router = useRouter();
  const toast = useToast();

  const [ledgers, setLedgers] = useState<Ledger[]>([]);
  const [loading, setLoading] = useState(true);

  // Create modal
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createForm, setCreateForm] = useState({ name: '', description: '' });
  const [submitting, setSubmitting] = useState(false);

  // Deactivate confirm
  const [deactivateConfirm, setDeactivateConfirm] = useState<{
    open: boolean;
    ledger: Ledger | null;
  }>({ open: false, ledger: null });
  const [deactivateLoading, setDeactivateLoading] = useState(false);

  const isEditor = user?.role === 'accountant' || user?.role === 'master' || user?.role === 'sub_master';

  useEffect(() => {
    if (!isEditor) {
      router.replace('/ledger');
    }
  }, [isEditor, router]);

  const fetchLedgers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/ledgers');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setLedgers(json.data || []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '장부 목록을 불러올 수 없습니다');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchLedgers();
  }, [fetchLedgers]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.name.trim()) {
      toast.error('장부 이름을 입력해주세요');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/ledgers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: createForm.name.trim(),
          type: 'special',
          description: createForm.description.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      toast.success('특수 장부가 생성되었습니다');
      setCreateModalOpen(false);
      setCreateForm({ name: '', description: '' });
      fetchLedgers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '생성에 실패했습니다');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeactivate = async () => {
    const ledger = deactivateConfirm.ledger;
    if (!ledger) return;
    setDeactivateLoading(true);
    try {
      const res = await fetch('/api/ledgers', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: ledger.id, is_active: false }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      toast.success(`"${ledger.name}" 장부가 종료되었습니다`);
      setDeactivateConfirm({ open: false, ledger: null });
      fetchLedgers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '상태 변경에 실패했습니다');
    } finally {
      setDeactivateLoading(false);
    }
  };

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Page header */}
        <div className="bg-gradient-to-r from-primary-600 to-primary-500 rounded-2xl p-6 text-white">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-white/20 p-2.5">
                <Settings className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">장부 관리</h1>
                <p className="text-sm text-white/80 mt-0.5">장부 생성 및 관리</p>
              </div>
            </div>
            <Button
              variant="secondary"
              onClick={() => {
                setCreateForm({ name: '', description: '' });
                setCreateModalOpen(true);
              }}
              className="!bg-white/20 !border-white/30 !text-white hover:!bg-white/30"
            >
              <Plus className="h-4 w-4" />
              특수 장부 생성
            </Button>
          </div>
        </div>

        {/* Ledger cards */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
          </div>
        ) : ledgers.length === 0 ? (
          <EmptyState
            icon={BookOpen}
            title="장부가 없습니다"
            description="특수 장부를 생성해주세요"
            actionLabel="생성하기"
            onAction={() => setCreateModalOpen(true)}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {ledgers.map((ledger) => (
              <div
                key={ledger.id}
                className={`bg-white rounded-xl shadow-sm border border-gray-100 p-5
                  hover:shadow-md transition-all duration-200
                  ${!ledger.is_active ? 'opacity-60' : ''}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-semibold text-gray-900 truncate">
                        {ledger.name}
                      </h3>
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                          ledger.type === 'main'
                            ? 'bg-primary-100 text-primary-700'
                            : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {ledger.type === 'main' ? '본 장부' : '특수 장부'}
                      </span>
                    </div>
                    {ledger.description && (
                      <p className="mt-1 text-sm text-gray-500">{ledger.description}</p>
                    )}
                    <p className="mt-2 text-xs text-gray-400">
                      생성일: {formatDateShort(ledger.created_at)}
                    </p>
                  </div>
                  <StatusBadge status={ledger.is_active ? 'active' : 'inactive'} />
                </div>

                {/* Actions */}
                <div className="mt-4 pt-3 border-t border-gray-100 flex gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => router.push(`/ledger?ledgerId=${ledger.id}`)}
                  >
                    <BookOpen className="h-3.5 w-3.5" />
                    조회
                  </Button>
                  {ledger.type === 'special' && ledger.is_active && (
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => setDeactivateConfirm({ open: true, ledger })}
                    >
                      <Power className="h-3.5 w-3.5" />
                      종료
                    </Button>
                  )}
                  {ledger.type === 'main' && (
                    <span className="text-xs text-gray-400 flex items-center ml-2">
                      본 장부는 비활성화할 수 없습니다
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create special ledger modal */}
      <Modal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        title="특수 장부 생성"
      >
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              장부명 <span className="text-danger-600">*</span>
            </label>
            <input
              type="text"
              value={createForm.name}
              onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
              placeholder="예: 수련회 장부"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm
                focus:ring-2 focus:ring-primary-500 focus:border-primary-500
                outline-none transition-shadow"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">설명</label>
            <textarea
              value={createForm.description}
              onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
              placeholder="장부에 대한 설명 (선택)"
              rows={3}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm
                focus:ring-2 focus:ring-primary-500 focus:border-primary-500
                outline-none transition-shadow resize-none"
            />
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <Button
              variant="secondary"
              type="button"
              onClick={() => setCreateModalOpen(false)}
              disabled={submitting}
            >
              취소
            </Button>
            <Button type="submit" loading={submitting}>
              생성하기
            </Button>
          </div>
        </form>
      </Modal>

      {/* Deactivate confirm */}
      <ConfirmDialog
        isOpen={deactivateConfirm.open}
        title="장부 종료"
        message={`"${deactivateConfirm.ledger?.name}" 장부를 종료하시겠습니까? 종료된 장부는 더 이상 항목을 추가할 수 없습니다.`}
        confirmText="종료"
        variant="danger"
        loading={deactivateLoading}
        onConfirm={handleDeactivate}
        onCancel={() => setDeactivateConfirm({ open: false, ledger: null })}
      />
    </AppShell>
  );
}
