'use client';

export const runtime = 'edge';


import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import { useUser } from '@/hooks/useUser';
import { useToast } from '@/components/ui/Toast';
import AppShell from '@/components/layout/AppShell';
import Button from '@/components/ui/Button';
import DatePicker from '@/components/ui/DatePicker';
import CurrencyInput from '@/components/ui/CurrencyInput';
import { today } from '@/lib/format';
import { Upload, X, AlertTriangle } from 'lucide-react';
import type { Category } from '@/types';

export default function NewReceiptPage() {
  const { user } = useUser();
  const router = useRouter();
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    date: today(),
    description: '',
    final_amount: 0,
    category_id: '',
    vendor: '',
    memo: '',
  });

  const [categories, setCategories] = useState<Category[]>([]);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [duplicateConfirm, setDuplicateConfirm] = useState<{ existing: { description: string; date: string; final_amount: number; status: string } } | null>(null);

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const res = await fetch('/api/categories');
        const json = await res.json();
        if (json.data) setCategories(json.data.filter((c: Category) => c.is_active));
      } catch {
        // ignore
      }
    };
    fetchCategories();
  }, []);

  const updateForm = (field: string, value: string | number) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
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
      setImageFile(compressed);
      setImagePreview(URL.createObjectURL(compressed));
    } catch {
      toast.error('이미지 처리에 실패했습니다');
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeImage = () => {
    setImageFile(null);
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImagePreview(null);
  };

  const handleSubmit = async (e: React.FormEvent, skipDupeCheck = false) => {
    e.preventDefault();
    if (!user) return;

    if (!form.date || !form.description || !form.final_amount || !form.category_id) {
      toast.error('필수 항목을 모두 입력해주세요');
      return;
    }

    setSubmitting(true);
    try {
      const supabase = createClient();
      let imageUrl: string | null = null;

      if (imageFile) {
        const receiptId = crypto.randomUUID();
        const timestamp = Date.now();
        const path = `receipts/${user.department_id}/${user.id}/${receiptId}_${timestamp}.jpg`;

        const { error: uploadError } = await supabase.storage
          .from('receipts')
          .upload(path, imageFile, { contentType: 'image/jpeg' });

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
          .from('receipts')
          .getPublicUrl(path);

        imageUrl = urlData.publicUrl;
      }

      // Create receipt
      const createRes = await fetch('/api/receipts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: form.date,
          description: form.description,
          final_amount: form.final_amount,
          category_id: form.category_id,
          vendor: form.vendor || null,
          memo: form.memo || null,
          image_url: imageUrl,
          skip_duplicate_check: skipDupeCheck,
          has_duplicate_warning: skipDupeCheck,
        }),
      });

      if (createRes.status === 409) {
        const json = await createRes.json();
        if (json.can_override) {
          setDuplicateConfirm({ existing: json.existing });
          setSubmitting(false);
          return;
        }
        throw new Error(json.error || '중복 영수증입니다');
      }
      if (!createRes.ok) {
        const json = await createRes.json();
        throw new Error(json.error || '등록에 실패했습니다');
      }

      const { data: receipt } = await createRes.json();

      // Auto-approve (accountant direct input)
      if (receipt?.id) {
        const approveRes = await fetch(`/api/receipts/${receipt.id}/approve`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });
        if (!approveRes.ok) {
          toast.info('영수증이 등록되었지만 자동 승인에 실패했습니다');
        }
      }

      toast.success('영수증이 등록되었습니다');
      router.push('/receipts/my');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '등록에 실패했습니다');
    } finally {
      setSubmitting(false);
    }
  };

  const incomeCategories = categories.filter(c => c.type === 'income');
  const expenseCategories = categories.filter(c => c.type === 'expense');

  return (
    <AppShell>
      {duplicateConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-amber-100 p-2 shrink-0">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">중복 영수증 확인</h3>
                <p className="text-sm text-gray-500 mt-1">동일한 금액의 영수증이 이미 존재합니다.</p>
              </div>
            </div>
            <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">항목명</span>
                <span className="font-medium text-gray-900 truncate max-w-[180px]">{duplicateConfirm.existing.description}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">날짜</span>
                <span className="font-medium text-gray-900">{duplicateConfirm.existing.date}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">금액</span>
                <span className="font-medium text-gray-900">{duplicateConfirm.existing.final_amount.toLocaleString()}원</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">상태</span>
                <span className="font-medium text-gray-900">
                  {duplicateConfirm.existing.status === 'pending' ? '승인 대기' : duplicateConfirm.existing.status === 'approved' ? '승인됨' : duplicateConfirm.existing.status}
                </span>
              </div>
            </div>
            <p className="text-xs text-amber-600 font-medium">⚠️ 그래도 제출 시 회계 담당자에게 중복 경고로 표시됩니다.</p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setDuplicateConfirm(null)}>취소</Button>
              <Button variant="danger" onClick={async () => {
                setDuplicateConfirm(null);
                await handleSubmit(new Event('submit') as unknown as React.FormEvent, true);
              }}>그래도 제출</Button>
            </div>
          </div>
        </div>
      )}
      <div className="max-w-lg mx-auto">
        <h1 className="text-xl font-bold text-gray-900 mb-6">영수증 직접 등록</h1>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Date */}
          <DatePicker
            value={form.date}
            onChange={(v) => updateForm('date', v)}
            label="날짜"
            required
          />

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              내용 <span className="text-danger-600 ml-0.5">*</span>
            </label>
            <input
              type="text"
              value={form.description}
              onChange={(e) => updateForm('description', e.target.value)}
              placeholder="내용을 입력하세요"
              required
              className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm
                focus:ring-2 focus:ring-primary-500 focus:border-primary-500
                outline-none transition-shadow"
            />
          </div>

          {/* Amount */}
          <CurrencyInput
            value={form.final_amount}
            onChange={(v) => updateForm('final_amount', v)}
            label="금액"
            required
          />

          {/* Category */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              카테고리 <span className="text-danger-600 ml-0.5">*</span>
            </label>
            <select
              value={form.category_id}
              onChange={(e) => updateForm('category_id', e.target.value)}
              required
              className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm bg-white
                focus:ring-2 focus:ring-primary-500 focus:border-primary-500
                outline-none transition-shadow appearance-none"
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

          {/* Vendor */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              거래처 <span className="text-xs text-gray-400">(선택)</span>
            </label>
            <input
              type="text"
              value={form.vendor}
              onChange={(e) => updateForm('vendor', e.target.value)}
              placeholder="거래처명"
              className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm
                focus:ring-2 focus:ring-primary-500 focus:border-primary-500
                outline-none transition-shadow"
            />
          </div>

          {/* Memo */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              메모 <span className="text-xs text-gray-400">(선택)</span>
            </label>
            <textarea
              value={form.memo}
              onChange={(e) => updateForm('memo', e.target.value)}
              placeholder="추가 메모"
              rows={3}
              className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm
                focus:ring-2 focus:ring-primary-500 focus:border-primary-500
                outline-none transition-shadow resize-none"
            />
          </div>

          {/* Optional image upload */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              영수증 이미지 <span className="text-xs text-gray-400">(선택)</span>
            </label>
            {imagePreview ? (
              <div className="relative">
                <img
                  src={imagePreview}
                  alt="영수증 미리보기"
                  className="w-full rounded-xl border border-gray-200 object-contain max-h-48"
                />
                <button
                  type="button"
                  onClick={removeImage}
                  className="absolute top-2 right-2 bg-black/60 text-white rounded-full p-1.5 hover:bg-black/80 transition-colors"
                  aria-label="이미지 삭제"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-gray-300 rounded-xl p-4 text-sm text-gray-500 hover:border-primary-400 hover:bg-primary-50/50 transition-colors"
              >
                <Upload className="h-4 w-4" />
                이미지 추가
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/heic"
              onChange={handleFileSelect}
              className="hidden"
            />
          </div>

          {/* Submit */}
          <div className="pt-2 pb-4">
            <Button
              type="submit"
              size="lg"
              loading={submitting}
              className="w-full"
            >
              영수증 등록
            </Button>
          </div>
        </form>
      </div>
    </AppShell>
  );
}
