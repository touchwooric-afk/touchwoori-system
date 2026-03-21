'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@/hooks/useUser';
import { useToast } from '@/components/ui/Toast';
import AppShell from '@/components/layout/AppShell';
import Button from '@/components/ui/Button';
import EmptyState from '@/components/ui/EmptyState';
import { CardSkeleton } from '@/components/ui/Skeleton';
import { formatDateShort } from '@/lib/format';
import {
  ClipboardCheck,
  FileText,
  Upload,
  Download,
  Trash2,
  Pencil,
  Check,
  X,
  Paperclip,
} from 'lucide-react';
import type { Settlement } from '@/types';

export default function AuditHistoryPage() {
  const router = useRouter();
  const toast = useToast();
  const { user } = useUser();
  const isEditor = user?.role === 'accountant' || user?.role === 'master';

  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSettlements = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/settlements');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setSettlements(json.data || []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '감사 내역을 불러올 수 없습니다');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { fetchSettlements(); }, [fetchSettlements]);

  const handleUpdate = (updated: Settlement) => {
    setSettlements((prev) => prev.map((s) => s.id === updated.id ? updated : s));
  };

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Header */}
        <div className="bg-gradient-to-r from-primary-600 to-primary-500 rounded-2xl p-6 text-white">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-white/20 p-2.5">
              <ClipboardCheck className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">감사 내역</h1>
              <p className="text-sm text-white/80 mt-0.5">결산기별 감사 문서를 보관합니다</p>
            </div>
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => <CardSkeleton key={i} />)}
          </div>
        ) : settlements.length === 0 ? (
          <EmptyState
            icon={ClipboardCheck}
            title="감사 내역이 없습니다"
            description="마스터 관리에서 결산 기간을 생성하세요"
            actionLabel="결산 기간 관리"
            onAction={() => router.push('/master/settlements')}
          />
        ) : (
          <div className="space-y-4">
            {settlements.map((s) => (
              <AuditCard
                key={s.id}
                settlement={s}
                isEditor={isEditor}
                onUpdate={handleUpdate}
                onViewPdf={() => router.push(`/settlements?settlement=${s.id}`)}
              />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}

// ─── 감사 카드 ────────────────────────────────────────────────────
function AuditCard({
  settlement,
  isEditor,
  onUpdate,
  onViewPdf,
}: {
  settlement: Settlement;
  isEditor: boolean;
  onUpdate: (s: Settlement) => void;
  onViewPdf: () => void;
}) {
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editingNote, setEditingNote] = useState(false);
  const [noteValue, setNoteValue] = useState(settlement.audit_note || '');
  const [savingNote, setSavingNote] = useState(false);

  const hasFile = !!settlement.audit_file_url;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`/api/settlements/${settlement.id}/audit-file`, {
        method: 'POST',
        body: form,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      onUpdate(json.data);
      toast.success('파일이 첨부되었습니다');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '파일 업로드에 실패했습니다');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleFileDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/settlements/${settlement.id}/audit-file`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      onUpdate(json.data);
      toast.success('파일이 삭제되었습니다');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '파일 삭제에 실패했습니다');
    } finally {
      setDeleting(false);
    }
  };

  const handleNoteSave = async () => {
    setSavingNote(true);
    try {
      const res = await fetch(`/api/settlements/${settlement.id}/audit-file`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audit_note: noteValue || null }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      onUpdate(json.data);
      setEditingNote(false);
      toast.success('메모가 저장되었습니다');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '저장에 실패했습니다');
    } finally {
      setSavingNote(false);
    }
  };

  const handleNoteCancel = () => {
    setNoteValue(settlement.audit_note || '');
    setEditingNote(false);
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      {/* 상단: 제목 + 기간 + 배지 */}
      <div className="flex items-start justify-between px-5 pt-5 pb-4">
        <div>
          <h3 className="text-base font-semibold text-gray-900">{settlement.title}</h3>
          <p className="text-sm text-gray-500 mt-0.5">
            {formatDateShort(settlement.start_date)} ~ {formatDateShort(settlement.end_date)}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">
            등록일 {formatDateShort(settlement.created_at)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* 첨부 상태 배지 */}
          <span
            className={`text-xs font-medium px-2.5 py-1 rounded-full border ${
              hasFile
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-gray-50 text-gray-400 border-gray-200'
            }`}
          >
            {hasFile ? (
              <span className="flex items-center gap-1">
                <Paperclip className="h-3 w-3" />
                첨부완료
              </span>
            ) : (
              '미첨부'
            )}
          </span>
        </div>
      </div>

      <div className="border-t border-gray-100 px-5 py-4 space-y-4">
        {/* 감사 파일 섹션 */}
        <div>
          <p className="text-xs font-medium text-gray-500 mb-2">감사 문서</p>
          {hasFile ? (
            <div className="flex items-center gap-2 flex-wrap">
              <a
                href={settlement.audit_file_url!}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-600
                  hover:text-primary-800 bg-primary-50 hover:bg-primary-100
                  px-3 py-1.5 rounded-lg transition-colors"
              >
                <Download className="h-3.5 w-3.5" />
                파일 열기
              </a>
              {isEditor && (
                <>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="inline-flex items-center gap-1.5 text-sm text-gray-500
                      hover:text-gray-700 bg-gray-50 hover:bg-gray-100
                      px-3 py-1.5 rounded-lg transition-colors border border-gray-200"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    교체
                  </button>
                  <button
                    onClick={handleFileDelete}
                    disabled={deleting}
                    className="inline-flex items-center gap-1.5 text-sm text-rose-500
                      hover:text-rose-700 hover:bg-rose-50
                      px-3 py-1.5 rounded-lg transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    삭제
                  </button>
                </>
              )}
            </div>
          ) : isEditor ? (
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500
                border-2 border-dashed border-gray-300 hover:border-primary-400
                hover:text-primary-600 px-4 py-2 rounded-lg transition-colors w-full justify-center"
            >
              <Upload className="h-4 w-4" />
              {uploading ? '업로드 중...' : '감사 문서 첨부 (PDF, 이미지)'}
            </button>
          ) : (
            <p className="text-sm text-gray-400">첨부된 파일이 없습니다</p>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.heic,.webp"
            className="hidden"
            onChange={handleFileUpload}
          />
        </div>

        {/* 메모 섹션 */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-xs font-medium text-gray-500">메모</p>
            {isEditor && !editingNote && (
              <button
                onClick={() => setEditingNote(true)}
                className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-0.5"
              >
                <Pencil className="h-3 w-3" />
                편집
              </button>
            )}
          </div>
          {editingNote ? (
            <div className="space-y-2">
              <textarea
                value={noteValue}
                onChange={(e) => setNoteValue(e.target.value)}
                placeholder="감사 날짜, 담당자 등 메모를 입력하세요"
                rows={3}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm
                  focus:ring-2 focus:ring-primary-500 focus:border-primary-500
                  outline-none transition-shadow resize-none"
              />
              <div className="flex gap-2 justify-end">
                <button
                  onClick={handleNoteCancel}
                  className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700
                    px-2.5 py-1.5 rounded-md border border-gray-200 hover:bg-gray-50"
                >
                  <X className="h-3 w-3" /> 취소
                </button>
                <button
                  onClick={handleNoteSave}
                  disabled={savingNote}
                  className="inline-flex items-center gap-1 text-xs font-medium text-white
                    bg-primary-600 hover:bg-primary-700 px-2.5 py-1.5 rounded-md"
                >
                  <Check className="h-3 w-3" />
                  {savingNote ? '저장 중...' : '저장'}
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-600 min-h-[1.5rem]">
              {settlement.audit_note || <span className="text-gray-300">-</span>}
            </p>
          )}
        </div>
      </div>

      {/* 하단: PDF 재출력 */}
      <div className="border-t border-gray-100 px-5 py-3 bg-gray-50 flex justify-end">
        <Button size="sm" variant="secondary" onClick={onViewPdf}>
          <FileText className="h-3.5 w-3.5" />
          결산 PDF 재출력
        </Button>
      </div>
    </div>
  );
}
