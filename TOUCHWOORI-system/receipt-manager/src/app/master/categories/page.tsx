'use client';

import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/components/ui/Toast';
import AppShell from '@/components/layout/AppShell';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import EmptyState from '@/components/ui/EmptyState';
import StatusBadge from '@/components/ui/StatusBadge';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { Tags, Plus, Pencil, Power } from 'lucide-react';
import type { Category, CategoryType } from '@/types';

interface CategoryForm {
  name: string;
  type: CategoryType;
  keywords: string;
  color: string;
  sort_order: number;
}

const INITIAL_FORM: CategoryForm = {
  name: '',
  type: 'expense',
  keywords: '',
  color: '#6366f1',
  sort_order: 0,
};

export default function CategoriesPage() {
  const toast = useToast();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CategoryForm>(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);

  // Confirm
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    category: Category | null;
  }>({ open: false, category: null });

  const fetchCategories = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/categories');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setCategories(json.data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '카테고리 목록을 불러올 수 없습니다');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  const incomeCategories = categories.filter((c) => c.type === 'income');
  const expenseCategories = categories.filter((c) => c.type === 'expense');

  const openAddModal = () => {
    setEditingId(null);
    setForm(INITIAL_FORM);
    setModalOpen(true);
  };

  const openEditModal = (cat: Category) => {
    setEditingId(cat.id);
    setForm({
      name: cat.name,
      type: cat.type,
      keywords: cat.keywords.join(', '),
      color: cat.color || '#6366f1',
      sort_order: cat.sort_order,
    });
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error('카테고리 이름을 입력해주세요');
      return;
    }
    setSubmitting(true);
    try {
      const keywords = form.keywords
        .split(',')
        .map((k) => k.trim())
        .filter(Boolean);

      const body = {
        ...(editingId ? { id: editingId } : {}),
        name: form.name.trim(),
        type: form.type,
        keywords,
        color: form.color || null,
        sort_order: form.sort_order,
      };

      const res = await fetch('/api/categories', {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);

      toast.success(editingId ? '카테고리가 수정되었습니다' : '카테고리가 추가되었습니다');
      setModalOpen(false);
      fetchCategories();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '저장에 실패했습니다');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActive = async () => {
    const cat = confirmDialog.category;
    if (!cat) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/categories', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: cat.id, is_active: !cat.is_active }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      toast.success(cat.is_active ? '카테고리가 비활성화되었습니다' : '카테고리가 활성화되었습니다');
      setConfirmDialog({ open: false, category: null });
      fetchCategories();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '상태 변경에 실패했습니다');
    } finally {
      setSubmitting(false);
    }
  };

  const renderCategorySection = (title: string, items: Category[], type: CategoryType) => (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">
          {title}
          <span className="ml-2 text-sm font-normal text-gray-400">{items.length}개</span>
        </h2>
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={Tags}
          title={`${title} 카테고리가 없습니다`}
          description="카테고리를 추가해주세요"
          actionLabel="추가"
          onAction={openAddModal}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {items.map((cat) => (
            <div
              key={cat.id}
              className={`
                bg-white rounded-xl shadow-sm border border-gray-100 p-4
                hover:shadow-md transition-all duration-200 cursor-pointer
                ${!cat.is_active ? 'opacity-60' : ''}
              `}
              onClick={() => openEditModal(cat)}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className="w-4 h-4 rounded-full shrink-0 ring-2 ring-offset-1 ring-gray-200"
                    style={{ backgroundColor: cat.color || '#6366f1' }}
                  />
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-gray-900 truncate">{cat.name}</h3>
                    {cat.keywords.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {cat.keywords.slice(0, 4).map((kw, i) => (
                          <span
                            key={i}
                            className="inline-block rounded-md bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600"
                          >
                            {kw}
                          </span>
                        ))}
                        {cat.keywords.length > 4 && (
                          <span className="text-xs text-gray-400">
                            +{cat.keywords.length - 4}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-gray-400">#{cat.sort_order}</span>
                  <StatusBadge status={cat.is_active ? 'active' : 'inactive'} />
                </div>
              </div>

              <div className="flex gap-2 mt-3 pt-3 border-t border-gray-100">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={(e) => {
                    e.stopPropagation();
                    openEditModal(cat);
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  수정
                </Button>
                <Button
                  size="sm"
                  variant={cat.is_active ? 'danger' : 'secondary'}
                  onClick={(e) => {
                    e.stopPropagation();
                    setConfirmDialog({ open: true, category: cat });
                  }}
                >
                  <Power className="h-3.5 w-3.5" />
                  {cat.is_active ? '비활성화' : '활성화'}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <AppShell>
      <div className="space-y-6">
        {/* 페이지 헤더 */}
        <div className="bg-gradient-to-r from-primary-600 to-primary-500 rounded-2xl p-6 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-white/20 p-2.5">
                <Tags className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">카테고리 관리</h1>
                <p className="text-sm text-white/80 mt-0.5">수입/지출 카테고리를 관리합니다</p>
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

        {loading ? (
          <TableSkeleton rows={4} cols={5} />
        ) : (
          <div className="space-y-8">
            {renderCategorySection('수입', incomeCategories, 'income')}
            {renderCategorySection('지출', expenseCategories, 'expense')}
          </div>
        )}
      </div>

      {/* 추가/수정 모달 */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? '카테고리 수정' : '카테고리 추가'}
      >
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* 이름 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              카테고리명 <span className="text-danger-600">*</span>
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="예: 교재비"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm
                focus:ring-2 focus:ring-primary-500 focus:border-primary-500
                outline-none transition-shadow"
            />
          </div>

          {/* 유형 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              유형 <span className="text-danger-600">*</span>
            </label>
            <div className="flex gap-3">
              <label
                className={`
                  flex-1 flex items-center justify-center gap-2 rounded-xl border-2 p-3 cursor-pointer transition-all
                  ${form.type === 'income'
                    ? 'border-primary-500 bg-primary-50 text-primary-700'
                    : 'border-gray-200 hover:border-gray-300 text-gray-600'
                  }
                `}
              >
                <input
                  type="radio"
                  name="type"
                  value="income"
                  checked={form.type === 'income'}
                  onChange={() => setForm({ ...form, type: 'income' })}
                  className="sr-only"
                />
                <span className="text-sm font-medium">수입</span>
              </label>
              <label
                className={`
                  flex-1 flex items-center justify-center gap-2 rounded-xl border-2 p-3 cursor-pointer transition-all
                  ${form.type === 'expense'
                    ? 'border-primary-500 bg-primary-50 text-primary-700'
                    : 'border-gray-200 hover:border-gray-300 text-gray-600'
                  }
                `}
              >
                <input
                  type="radio"
                  name="type"
                  value="expense"
                  checked={form.type === 'expense'}
                  onChange={() => setForm({ ...form, type: 'expense' })}
                  className="sr-only"
                />
                <span className="text-sm font-medium">지출</span>
              </label>
            </div>
          </div>

          {/* 키워드 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              키워드
            </label>
            <input
              type="text"
              value={form.keywords}
              onChange={(e) => setForm({ ...form, keywords: e.target.value })}
              placeholder="쉼표로 구분 (예: 교재, 교육자료, 학습)"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm
                focus:ring-2 focus:ring-primary-500 focus:border-primary-500
                outline-none transition-shadow"
            />
            <p className="mt-1 text-xs text-gray-400">
              OCR 자동 분류에 사용되는 키워드를 쉼표로 구분하여 입력하세요
            </p>
          </div>

          {/* 색상 & 정렬 */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">색상</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={form.color}
                  onChange={(e) => setForm({ ...form, color: e.target.value })}
                  className="w-10 h-10 rounded-lg border border-gray-300 cursor-pointer p-0.5"
                />
                <input
                  type="text"
                  value={form.color}
                  onChange={(e) => setForm({ ...form, color: e.target.value })}
                  className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm
                    focus:ring-2 focus:ring-primary-500 focus:border-primary-500
                    outline-none transition-shadow font-mono"
                />
              </div>
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
            </div>
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

      {/* 활성/비활성 확인 */}
      <ConfirmDialog
        isOpen={confirmDialog.open}
        title={confirmDialog.category?.is_active ? '카테고리 비활성화' : '카테고리 활성화'}
        message={
          confirmDialog.category?.is_active
            ? `"${confirmDialog.category?.name}" 카테고리를 비활성화하시겠습니까? 영수증 제출 시 선택할 수 없게 됩니다.`
            : `"${confirmDialog.category?.name}" 카테고리를 다시 활성화하시겠습니까?`
        }
        confirmText={confirmDialog.category?.is_active ? '비활성화' : '활성화'}
        variant={confirmDialog.category?.is_active ? 'danger' : 'primary'}
        loading={submitting}
        onConfirm={handleToggleActive}
        onCancel={() => setConfirmDialog({ open: false, category: null })}
      />
    </AppShell>
  );
}
