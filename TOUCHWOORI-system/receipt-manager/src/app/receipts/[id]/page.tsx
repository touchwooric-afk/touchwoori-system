'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import { useUser } from '@/hooks/useUser';
import { useToast } from '@/components/ui/Toast';
import AppShell from '@/components/layout/AppShell';
import Button from '@/components/ui/Button';
import StatusBadge from '@/components/ui/StatusBadge';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import DatePicker from '@/components/ui/DatePicker';
import CurrencyInput from '@/components/ui/CurrencyInput';
import { formatCurrency, formatDate } from '@/lib/format';
import {
  ArrowLeft,
  Download,
  Trash2,
  Edit3,
  Save,
  X,
  ZoomIn,
  Upload,
  Link as LinkIcon,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import type { ReceiptWithUser, Category } from '@/types';

export default function ReceiptDetailPage() {
  const { user } = useUser();
  const router = useRouter();
  const params = useParams();
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const id = params.id as string;

  const [receipt, setReceipt] = useState<ReceiptWithUser | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [imageFullscreen, setImageFullscreen] = useState(false);

  // Edit form
  const [editForm, setEditForm] = useState({
    date: '',
    description: '',
    final_amount: 0,
    category_id: '',
    vendor: '',
    memo: '',
  });

  // Image replacement
  const [newImageFile, setNewImageFile] = useState<File | null>(null);
  const [newImagePreview, setNewImagePreview] = useState<string | null>(null);

  // Delete confirm
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Approve/reject
  const [approving, setApproving] = useState(false);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [rejecting, setRejecting] = useState(false);

  // Linked ledger entry
  const [linkedEntry, setLinkedEntry] = useState<{ id: string; ledger_id: string } | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [receiptRes, catRes] = await Promise.all([
          fetch(`/api/receipts/${id}`),
          fetch('/api/categories'),
        ]);

        const receiptJson = await receiptRes.json();
        const catJson = await catRes.json();

        if (receiptJson.data) {
          setReceipt(receiptJson.data);
          setEditForm({
            date: receiptJson.data.date,
            description: receiptJson.data.description,
            final_amount: receiptJson.data.final_amount,
            category_id: receiptJson.data.category_id,
            vendor: receiptJson.data.vendor || '',
            memo: receiptJson.data.memo || '',
          });
        }
        if (catJson.data) {
          setCategories(catJson.data.filter((c: Category) => c.is_active));
        }

        // Check for linked ledger entry
        if (receiptJson.data?.id) {
          const supabase = createClient();
          const { data: entry } = await supabase
            .from('ledger_entries')
            .select('id, ledger_id')
            .eq('receipt_id', receiptJson.data.id)
            .maybeSingle();
          if (entry) setLinkedEntry(entry);
        }
      } catch {
        toast.error('영수증을 불러오지 못했습니다');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [id]);

  const canEdit = () => {
    if (!user || !receipt) return false;
    if (user.role === 'master') return true;
    if (user.role === 'accountant') return true;
    if (user.role === 'teacher' && receipt.submitted_by === user.id && receipt.status === 'pending') return true;
    return false;
  };

  const canApproveReject = () => {
    if (!user || !receipt) return false;
    return (user.role === 'accountant' || user.role === 'master') && receipt.status === 'pending';
  };

  const canDelete = () => {
    if (!user) return false;
    return user.role === 'master';
  };

  const startEditing = () => {
    if (!receipt) return;
    setEditForm({
      date: receipt.date,
      description: receipt.description,
      final_amount: receipt.final_amount,
      category_id: receipt.category_id,
      vendor: receipt.vendor || '',
      memo: receipt.memo || '',
    });
    setEditing(true);
  };

  const cancelEditing = () => {
    setEditing(false);
    setNewImageFile(null);
    if (newImagePreview) URL.revokeObjectURL(newImagePreview);
    setNewImagePreview(null);
  };

  const handleSave = async () => {
    if (!receipt || !user) return;

    if (!editForm.date || !editForm.description || !editForm.final_amount || !editForm.category_id) {
      toast.error('필수 항목을 모두 입력해주세요');
      return;
    }

    setSaving(true);
    try {
      const supabase = createClient();
      let imageUrl = receipt.image_url;

      // Handle image replacement
      if (newImageFile) {
        // Delete old image
        if (receipt.image_url) {
          const oldPath = receipt.image_url.split('/storage/v1/object/public/receipts/')[1];
          if (oldPath) {
            await supabase.storage.from('receipts').remove([oldPath]);
          }
        }

        // Upload new
        const receiptId = crypto.randomUUID();
        const timestamp = Date.now();
        const path = `receipts/${user.department_id}/${user.id}/${receiptId}_${timestamp}.jpg`;

        const { error: uploadError } = await supabase.storage
          .from('receipts')
          .upload(path, newImageFile, { contentType: 'image/jpeg' });

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
          .from('receipts')
          .getPublicUrl(path);

        imageUrl = urlData.publicUrl;
      }

      const res = await fetch(`/api/receipts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: editForm.date,
          description: editForm.description,
          final_amount: editForm.final_amount,
          category_id: editForm.category_id,
          vendor: editForm.vendor || null,
          memo: editForm.memo || null,
          image_url: imageUrl,
        }),
      });

      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || '수정에 실패했습니다');
      }

      const { data: updated } = await res.json();
      if (updated) setReceipt(updated);

      setEditing(false);
      setNewImageFile(null);
      if (newImagePreview) URL.revokeObjectURL(newImagePreview);
      setNewImagePreview(null);
      toast.success('영수증이 수정되었습니다');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '수정에 실패했습니다');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!receipt) return;
    setDeleting(true);
    try {
      // Delete image from storage
      if (receipt.image_url) {
        const supabase = createClient();
        const path = receipt.image_url.split('/storage/v1/object/public/receipts/')[1];
        if (path) {
          await supabase.storage.from('receipts').remove([path]);
        }
      }

      const res = await fetch(`/api/receipts/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || '삭제에 실패했습니다');
      }

      toast.success('영수증이 삭제되었습니다');
      router.push('/receipts/my');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '삭제에 실패했습니다');
    } finally {
      setDeleting(false);
      setDeleteConfirm(false);
    }
  };

  const handleApprove = async () => {
    setApproving(true);
    try {
      const res = await fetch(`/api/receipts/${id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || '승인에 실패했습니다');
      }
      toast.success('승인되었습니다');
      // Refresh receipt
      const refreshRes = await fetch(`/api/receipts/${id}`);
      const refreshJson = await refreshRes.json();
      if (refreshJson.data) setReceipt(refreshJson.data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '승인에 실패했습니다');
    } finally {
      setApproving(false);
    }
  };

  const handleReject = async () => {
    setRejecting(true);
    try {
      const res = await fetch(`/api/receipts/${id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reject_reason: rejectReason || null }),
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || '반려에 실패했습니다');
      }
      toast.success('반려되었습니다');
      setRejectModalOpen(false);
      setRejectReason('');
      // Refresh
      const refreshRes = await fetch(`/api/receipts/${id}`);
      const refreshJson = await refreshRes.json();
      if (refreshJson.data) setReceipt(refreshJson.data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '반려에 실패했습니다');
    } finally {
      setRejecting(false);
    }
  };

  const handleDeleteImage = async () => {
    if (!receipt || !receipt.image_url) return;

    try {
      const supabase = createClient();
      const path = receipt.image_url.split('/storage/v1/object/public/receipts/')[1];
      if (path) {
        await supabase.storage.from('receipts').remove([path]);
      }

      const res = await fetch(`/api/receipts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_url: null }),
      });

      if (res.ok) {
        setReceipt(prev => prev ? { ...prev, image_url: null } : null);
        toast.success('이미지가 삭제되었습니다');
      }
    } catch {
      toast.error('이미지 삭제에 실패했습니다');
    }
  };

  const handleNewImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const imageCompression = (await import('browser-image-compression')).default;
      const compressed = await imageCompression(file, {
        maxWidthOrHeight: 1200,
        maxSizeMB: 1,
        useWebWorker: true,
        fileType: 'image/jpeg',
      });
      setNewImageFile(compressed);
      setNewImagePreview(URL.createObjectURL(compressed));
    } catch {
      toast.error('이미지 처리에 실패했습니다');
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const incomeCategories = categories.filter(c => c.type === 'income');
  const expenseCategories = categories.filter(c => c.type === 'expense');

  if (loading) {
    return (
      <AppShell>
        <div className="max-w-2xl mx-auto">
          <div className="animate-pulse space-y-4">
            <div className="h-6 bg-gray-200 rounded w-1/3" />
            <div className="h-48 bg-gray-200 rounded-xl" />
            <div className="h-4 bg-gray-200 rounded w-2/3" />
            <div className="h-4 bg-gray-200 rounded w-1/2" />
          </div>
        </div>
      </AppShell>
    );
  }

  if (!receipt) {
    return (
      <AppShell>
        <div className="max-w-2xl mx-auto text-center py-16">
          <p className="text-gray-500">영수증을 찾을 수 없습니다</p>
          <Button className="mt-4" variant="secondary" onClick={() => router.back()}>
            돌아가기
          </Button>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.back()}
              className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 transition-colors"
              aria-label="뒤로가기"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <h1 className="text-xl font-bold text-gray-900">영수증 상세</h1>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={receipt.status} />
            {linkedEntry && (
              <button
                onClick={() => router.push(`/ledger?entry=${linkedEntry.id}`)}
                className="text-primary-600 hover:text-primary-700 p-1"
                title="장부 항목으로 이동"
              >
                <LinkIcon className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* Image section */}
        {(receipt.image_url || newImagePreview) && (
          <div className="mb-6">
            <div className="relative">
              <img
                src={newImagePreview || receipt.image_url!}
                alt="영수증 이미지"
                className="w-full rounded-xl border border-gray-200 object-contain max-h-80 cursor-pointer"
                onClick={() => !editing && setImageFullscreen(true)}
              />
              {!editing && receipt.image_url && (
                <div className="absolute bottom-3 right-3 flex gap-2">
                  <button
                    onClick={() => setImageFullscreen(true)}
                    className="bg-white/90 rounded-lg p-2 shadow-sm hover:bg-white transition-colors"
                    title="확대 보기"
                  >
                    <ZoomIn className="h-4 w-4 text-gray-700" />
                  </button>
                  <a
                    href={receipt.image_url}
                    download
                    className="bg-white/90 rounded-lg p-2 shadow-sm hover:bg-white transition-colors"
                    title="다운로드"
                  >
                    <Download className="h-4 w-4 text-gray-700" />
                  </a>
                </div>
              )}
            </div>
            {editing && (
              <div className="flex gap-2 mt-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="h-3 w-3" /> 이미지 교체
                </Button>
                {receipt.image_url && (
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={handleDeleteImage}
                  >
                    <Trash2 className="h-3 w-3" /> 이미지 삭제
                  </Button>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/heic"
                  onChange={handleNewImageSelect}
                  className="hidden"
                />
              </div>
            )}
          </div>
        )}

        {/* Details card */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          {editing ? (
            /* Edit mode */
            <div className="space-y-4">
              <DatePicker
                value={editForm.date}
                onChange={(v) => setEditForm(prev => ({ ...prev, date: v }))}
                label="날짜"
                required
              />

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  내용 <span className="text-danger-600 ml-0.5">*</span>
                </label>
                <input
                  type="text"
                  value={editForm.description}
                  onChange={(e) => setEditForm(prev => ({ ...prev, description: e.target.value }))}
                  required
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm
                    focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
                />
              </div>

              <CurrencyInput
                value={editForm.final_amount}
                onChange={(v) => setEditForm(prev => ({ ...prev, final_amount: v }))}
                label="금액"
                required
              />

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  카테고리 <span className="text-danger-600 ml-0.5">*</span>
                </label>
                <select
                  value={editForm.category_id}
                  onChange={(e) => setEditForm(prev => ({ ...prev, category_id: e.target.value }))}
                  required
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white
                    focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none appearance-none"
                >
                  <option value="">카테고리를 선택하세요</option>
                  {incomeCategories.length > 0 && (
                    <optgroup label="수입">
                      {incomeCategories.map(c => (
                        <option key={c.id} value={c.id}>{c.name} (수입)</option>
                      ))}
                    </optgroup>
                  )}
                  {expenseCategories.length > 0 && (
                    <optgroup label="지출">
                      {expenseCategories.map(c => (
                        <option key={c.id} value={c.id}>{c.name} (지출)</option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  거래처 <span className="text-xs text-gray-400">(선택)</span>
                </label>
                <input
                  type="text"
                  value={editForm.vendor}
                  onChange={(e) => setEditForm(prev => ({ ...prev, vendor: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm
                    focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  메모 <span className="text-xs text-gray-400">(선택)</span>
                </label>
                <textarea
                  value={editForm.memo}
                  onChange={(e) => setEditForm(prev => ({ ...prev, memo: e.target.value }))}
                  rows={3}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm
                    focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none resize-none"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <Button onClick={handleSave} loading={saving}>
                  <Save className="h-4 w-4" /> 저장
                </Button>
                <Button variant="secondary" onClick={cancelEditing} disabled={saving}>
                  취소
                </Button>
              </div>
            </div>
          ) : (
            /* Read mode */
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-gray-500 mb-0.5">날짜</p>
                  <p className="text-sm font-medium text-gray-900">{formatDate(receipt.date)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-0.5">금액</p>
                  <p className="text-sm font-semibold text-gray-900">{formatCurrency(receipt.final_amount)}</p>
                </div>
              </div>

              <div>
                <p className="text-xs text-gray-500 mb-0.5">내용</p>
                <p className="text-sm text-gray-900">{receipt.description}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-gray-500 mb-0.5">카테고리</p>
                  <p className="text-sm text-gray-900">{receipt.category?.name ?? '-'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-0.5">거래처</p>
                  <p className="text-sm text-gray-900">{receipt.vendor || '-'}</p>
                </div>
              </div>

              {receipt.memo && (
                <div>
                  <p className="text-xs text-gray-500 mb-0.5">메모</p>
                  <p className="text-sm text-gray-900">{receipt.memo}</p>
                </div>
              )}

              <div className="border-t border-gray-100 pt-4">
                <div className="grid grid-cols-2 gap-4 text-xs text-gray-500">
                  <div>
                    <p>제출자: {receipt.submitter?.name ?? '-'}</p>
                  </div>
                  <div>
                    <p>제출일: {formatDate(receipt.created_at)}</p>
                  </div>
                  {receipt.reviewed_by && (
                    <>
                      <div>
                        <p>검토자: {receipt.reviewer?.name ?? '-'}</p>
                      </div>
                      <div>
                        <p>검토일: {receipt.reviewed_at ? formatDate(receipt.reviewed_at) : '-'}</p>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {receipt.status === 'rejected' && receipt.reject_reason && (
                <div className="bg-danger-50 rounded-lg px-4 py-3 border border-danger-200">
                  <p className="text-xs font-medium text-danger-700 mb-1">반려 사유</p>
                  <p className="text-sm text-danger-600">{receipt.reject_reason}</p>
                </div>
              )}

              {/* Action buttons */}
              <div className="flex flex-wrap gap-2 pt-2">
                {canEdit() && (
                  <Button size="sm" variant="secondary" onClick={startEditing}>
                    <Edit3 className="h-4 w-4" /> 수정
                  </Button>
                )}
                {canApproveReject() && (
                  <>
                    <Button size="sm" onClick={handleApprove} loading={approving}>
                      <CheckCircle className="h-4 w-4" /> 승인
                    </Button>
                    <Button size="sm" variant="danger" onClick={() => setRejectModalOpen(true)}>
                      <XCircle className="h-4 w-4" /> 반려
                    </Button>
                  </>
                )}
                {canDelete() && (
                  <Button size="sm" variant="danger" onClick={() => setDeleteConfirm(true)}>
                    <Trash2 className="h-4 w-4" /> 삭제
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Fullscreen image overlay */}
      {imageFullscreen && receipt.image_url && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setImageFullscreen(false)}
        >
          <button
            onClick={() => setImageFullscreen(false)}
            className="absolute top-4 right-4 bg-white/20 rounded-full p-2 text-white hover:bg-white/40 transition-colors"
            aria-label="닫기"
          >
            <X className="h-6 w-6" />
          </button>
          <img
            src={receipt.image_url}
            alt="영수증 이미지"
            className="max-w-full max-h-[90vh] object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {/* Delete confirm */}
      <ConfirmDialog
        isOpen={deleteConfirm}
        title="영수증 삭제"
        message="이 영수증을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다."
        confirmText="삭제"
        variant="danger"
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteConfirm(false)}
      />

      {/* Reject modal */}
      {rejectModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">영수증 반려</h3>
            <div className="mb-4">
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
                onClick={() => { setRejectModalOpen(false); setRejectReason(''); }}
                disabled={rejecting}
              >
                취소
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={handleReject}
                loading={rejecting}
              >
                반려하기
              </Button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
