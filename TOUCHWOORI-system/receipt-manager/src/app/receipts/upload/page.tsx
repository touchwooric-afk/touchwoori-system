'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@/hooks/useUser';
import { useToast } from '@/components/ui/Toast';
import AppShell from '@/components/layout/AppShell';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import { formatCurrency } from '@/lib/format';
import { parseFilename } from '@/lib/parseFilename';
import { createClient } from '@/lib/supabase';
import {
  Upload, CheckCircle, AlertCircle, Loader2, X,
  ZoomIn, Link, FilePlus,
} from 'lucide-react';
import type { Ledger, Category } from '@/types';

// ─── Types ───────────────────────────────────────────────────────
interface Candidate {
  id: string;
  date: string;
  description: string;
  amount: number;
  category: { name: string; type: string } | null;
  confidence: 'auto' | 'high' | 'low';
}

type MatchMode  = 'link' | 'new';
type SaveStatus = 'idle' | 'saving' | 'saved' | 'failed' | 'error';

interface ReceiptRow {
  localId: string;
  file: File;
  previewUrl: string;
  date: string;
  amount: string;
  categoryId: string;
  description: string;
  memo: string;
  candidates: Candidate[];
  selectedCandidateId: string | null;
  matchMode: MatchMode;
  saveStatus: SaveStatus;
  errorMsg?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────
let idCounter = 0;
const newId = () => `r-${Date.now()}-${idCounter++}`;

const formatAmountInput = (v: string) => {
  const n = v.replace(/[^0-9]/g, '');
  return n ? Number(n).toLocaleString('ko-KR') : '';
};
const parseAmountInput = (v: string) => parseInt(v.replace(/[^0-9]/g, ''), 10) || 0;

const confidenceLabel: Record<Candidate['confidence'], string> = {
  auto: '자동매칭',
  high: '높은일치',
  low:  '금액일치',
};
const confidenceColor: Record<Candidate['confidence'], string> = {
  auto: 'text-emerald-600 bg-emerald-50',
  high: 'text-blue-600 bg-blue-50',
  low:  'text-amber-600 bg-amber-50',
};

// ─── Page ────────────────────────────────────────────────────────
export default function ReceiptUploadPage() {
  const { user } = useUser();
  const router = useRouter();
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [ledgers, setLedgers]               = useState<Ledger[]>([]);
  const [categories, setCategories]         = useState<Category[]>([]);
  const [selectedLedgerId, setSelectedLedgerId] = useState('');
  const [rows, setRows]                     = useState<ReceiptRow[]>([]);
  const [previewModal, setPreviewModal]     = useState<{ open: boolean; url: string; name: string }>({ open: false, url: '', name: '' });
  const [savingAll, setSavingAll]           = useState(false);
  const [teacherLedgerId, setTeacherLedgerId] = useState('');
  const [duplicateQueue, setDuplicateQueue] = useState<{
    row: ReceiptRow;
    existing: { id: string; description: string; date: string; final_amount: number; status: string };
  } | null>(null);

  const isEditor = user?.role === 'accountant' || user?.role === 'master';
  const isTeacher = user?.role === 'teacher';

  useEffect(() => {
    if (user && !isEditor && !isTeacher) router.replace('/');
  }, [user, isEditor, isTeacher, router]);

  // 카테고리 키워드로 카테고리 추천
  const suggestCategoryId = useCallback((keyword: string | null): string => {
    if (!keyword) return '';
    const lower = keyword.toLowerCase();
    for (const cat of categories) {
      const kws: string[] = Array.isArray(cat.keywords)
        ? cat.keywords
        : JSON.parse((cat.keywords as unknown as string) || '[]');
      if (kws.some((kw) => lower.includes(kw.toLowerCase()) || kw.toLowerCase().includes(lower))) {
        return cat.id;
      }
    }
    return '';
  }, [categories]);

  useEffect(() => {
    (async () => {
      const fetches: Promise<Response>[] = [fetch('/api/categories')];
      if (!isTeacher) fetches.unshift(fetch('/api/ledgers'));
      const results = await Promise.all(fetches);
      if (!isTeacher) {
        const lJson = await results[0].json();
        const cJson = await results[1].json();
        const active = (lJson.data as Ledger[]).filter((l: Ledger) => l.is_active);
        setLedgers(active);
        if (active.length > 0) setSelectedLedgerId(active[0].id);
        setCategories((cJson.data as Category[]).filter((c: Category) => c.is_active));
      } else {
        const [cRes, lRes] = await Promise.all([fetch('/api/categories'), fetch('/api/ledgers')]);
        const cJson = await cRes.json();
        const lJson = await lRes.json();
        setCategories((cJson.data as Category[]).filter((c: Category) => c.is_active));
        const mainLedger = (lJson.data as Ledger[]).find((l) => l.type === 'main' && l.is_active);
        if (mainLedger) setTeacherLedgerId(mainLedger.id);
      }
    })();
  }, [isTeacher]);

  // ── 후보 조회 ──────────────────────────────────────────────────
  const fetchCandidates = useCallback(async (
    localId: string,
    ledgerId: string,
    description: string,
    amount: string,
    date?: string,
  ) => {
    const params = new URLSearchParams({ ledgerId });
    const num = parseAmountInput(amount);
    if (num) params.set('amount', String(num));
    if (description.trim()) params.set('description', description.trim());
    if (date) params.set('date', date);

    try {
      const res = await fetch(`/api/receipts/candidates?${params}`);
      const json = await res.json();
      const candidates: Candidate[] = json.data || [];
      const autoMatch = candidates.find((c) => c.confidence === 'auto' || c.confidence === 'high');

      setRows((prev) => prev.map((r) => {
        if (r.localId !== localId) return r;
        const patch: Partial<ReceiptRow> = {
          candidates,
          selectedCandidateId: autoMatch ? autoMatch.id : null,
          matchMode: autoMatch ? 'link' : 'new',
        };
        // 자동매칭 시 후보 항목의 날짜로 덮어쓰기
        if (autoMatch) {
          patch.date = autoMatch.date;
        }
        return { ...r, ...patch };
      }));
    } catch { /* 후보 없어도 계속 */ }
  }, []);

  // ── 파일 선택 ──────────────────────────────────────────────────
  const handleFiles = useCallback(async (files: FileList) => {
    const ledgerIdToUse = isTeacher ? teacherLedgerId : selectedLedgerId;
    if (!isTeacher && !selectedLedgerId) { toast.error('장부를 먼저 선택해주세요'); return; }

    const newRows: ReceiptRow[] = Array.from(files).map((file) => {
      const parsed = parseFilename(file.name);
      return {
        localId: newId(),
        file,
        previewUrl: URL.createObjectURL(file),
        date: parsed.date || new Date().toISOString().split('T')[0],
        amount: parsed.amount ? parsed.amount.toLocaleString('ko-KR') : '',
        categoryId: suggestCategoryId(parsed.keyword),
        description: parsed.keyword || '',
        memo: '',
        candidates: [],
        selectedCandidateId: null,
        matchMode: 'new' as MatchMode,
        saveStatus: 'idle' as SaveStatus,
      };
    });

    setRows((prev) => [...prev, ...newRows]);

    if (ledgerIdToUse) {
      for (const row of newRows) {
        fetchCandidates(row.localId, ledgerIdToUse, row.description, row.amount, row.date);
      }
    }
  }, [isTeacher, teacherLedgerId, selectedLedgerId, suggestCategoryId, fetchCandidates, toast]);

  const updateRow = (localId: string, patch: Partial<ReceiptRow>) => {
    setRows((prev) => prev.map((r) => r.localId === localId ? { ...r, ...patch } : r));
  };

  // ── 저장 (단건) ────────────────────────────────────────────────
  const saveRow = useCallback(async (row: ReceiptRow): Promise<boolean> => {
    const amount = parseAmountInput(row.amount);
    if (!row.date || !amount || !row.categoryId || !row.description.trim()) {
      toast.error(`날짜, 금액, 카테고리, 항목명을 모두 입력해주세요 (${row.file.name})`);
      return false;
    }
    if (row.matchMode === 'link' && !row.selectedCandidateId) {
      toast.error(`장부 항목을 선택하거나 "새 항목"으로 변경해주세요 (${row.file.name})`);
      return false;
    }

    updateRow(row.localId, { saveStatus: 'saving' });

    try {
      // 이미지 → Supabase Storage 업로드 (실패 시 저장 중단)
      let imageUrl: string | null = null;
      if (row.file) {
        const supabase = createClient();
        const receiptId = crypto.randomUUID();
        const ext = row.file.name.split('.').pop() || 'jpg';
        const path = `${user?.id || 'unknown'}/${receiptId}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from('receipts')
          .upload(path, row.file, { contentType: row.file.type || 'image/jpeg' });
        if (uploadError) {
          toast.error(`이미지 업로드 실패: ${uploadError.message} (${row.file.name})`);
          updateRow(row.localId, { saveStatus: 'failed' });
          return false;
        }
        const { data: urlData } = supabase.storage.from('receipts').getPublicUrl(path);
        imageUrl = urlData.publicUrl;
      }

      // 영수증 생성
      // - teacher: pending (승인 대기)
      // - accountant/master: approved + 장부 자동 생성
      const receiptRes = await fetch('/api/receipts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: row.date,
          description: row.description.trim(),
          final_amount: amount,
          category_id: row.categoryId,
          memo: row.memo || null,
          image_url: imageUrl,
          skip_auto_ledger: row.matchMode === 'link',
          skip_duplicate_check: row.matchMode === 'link',
        }),
      });
      const receiptJson = await receiptRes.json();
      if (receiptRes.status === 409 && receiptJson.code === 'DUPLICATE') {
        updateRow(row.localId, { saveStatus: 'idle' });
        setDuplicateQueue({ row, existing: receiptJson.existing });
        return false;
      }
      if (!receiptRes.ok) throw new Error(receiptJson.error);
      const receipt = receiptJson.data;

      // 기존 장부 항목에 receipt_id 연결
      if (row.matchMode === 'link' && row.selectedCandidateId) {
        const ledgerIdToUse = isTeacher ? teacherLedgerId : selectedLedgerId;
        const patchRes = await fetch(`/api/ledgers/${ledgerIdToUse}/entries`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: row.selectedCandidateId, receipt_id: receipt.id }),
        });
        if (!patchRes.ok) {
          const patchJson = await patchRes.json();
          throw new Error(patchJson.error);
        }
      }

      updateRow(row.localId, { saveStatus: 'saved' });
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '저장 실패');
      updateRow(row.localId, { saveStatus: 'failed' });
      return false;
    }
  }, [isTeacher, teacherLedgerId, selectedLedgerId, user, toast]);

  // ── 유효성 검사 (전체 저장용) ──────────────────────────────────
  const validateRow = (row: ReceiptRow): string | null => {
    if (!row.date) return '날짜를 입력해주세요';
    if (!parseAmountInput(row.amount)) return '금액을 입력해주세요';
    if (!row.description.trim()) return '항목명을 입력해주세요';
    if (!row.categoryId) return '카테고리를 선택해주세요';
    if (row.matchMode === 'link' && !row.selectedCandidateId) return '장부 항목을 선택하거나 새 항목으로 변경해주세요';
    return null;
  };

  // ── 전체 저장 ──────────────────────────────────────────────────
  const handleSaveAll = async () => {
    const pending = rows.filter((r) => r.saveStatus !== 'saved' && r.saveStatus !== 'saving');
    if (pending.length === 0) { toast.error('저장할 항목이 없습니다'); return; }

    // 먼저 유효성 검사 — 문제 있는 행은 error 상태로 보류
    const validRows: ReceiptRow[] = [];
    let errorCount = 0;
    for (const row of pending) {
      const err = validateRow(row);
      if (err) {
        updateRow(row.localId, { saveStatus: 'error', errorMsg: err });
        errorCount++;
      } else {
        validRows.push(row);
      }
    }

    if (validRows.length === 0) {
      toast.error(`${errorCount}건에 문제가 있습니다. 내용을 확인하고 다시 시도해주세요`);
      return;
    }

    setSavingAll(true);
    let success = 0;
    for (const row of validRows) {
      if (await saveRow(row)) success++;
    }
    setSavingAll(false);
    if (success > 0) {
      const msg = errorCount > 0
        ? `${success}건 저장 완료 (${errorCount}건 보류 — 내용 확인 필요)`
        : `${success}건의 영수증이 저장되었습니다`;
      toast.success(msg);
    }
  };

  const removeRow = (localId: string) => {
    setRows((prev) => {
      const row = prev.find((r) => r.localId === localId);
      if (row) URL.revokeObjectURL(row.previewUrl);
      return prev.filter((r) => r.localId !== localId);
    });
  };

  const pendingCount = rows.filter((r) => r.saveStatus === 'idle' || r.saveStatus === 'failed' || r.saveStatus === 'error').length;
  const errorCount    = rows.filter((r) => r.saveStatus === 'error').length;
  const savedCount   = rows.filter((r) => r.saveStatus === 'saved').length;

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Header */}
        <div className="bg-gradient-to-r from-primary-600 to-primary-500 rounded-2xl p-6 text-white">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-white/20 p-2.5">
                <Upload className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">영수증 제출</h1>
                <p className="text-sm text-white/80 mt-0.5">
                  파일명에 금액·항목명을 넣으면 자동 매칭됩니다
                </p>
              </div>
            </div>
            {rows.length > 0 && (
              <Button onClick={handleSaveAll} loading={savingAll} disabled={pendingCount === 0}>
                <CheckCircle className="h-4 w-4" />
                {pendingCount}건 전체 저장
              </Button>
            )}
          </div>
        </div>

        {/* 파일명 형식 안내 */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-5 py-3 text-sm text-blue-700 space-y-1.5">
          <p className="font-semibold">파일명 필수 포함 항목: 날짜 · 항목명 · 금액</p>
          <p className="text-xs text-blue-600">예) 26년 4월 3일 70000원 교제비 &nbsp;/&nbsp; 260403 70000 교제비 &nbsp;/&nbsp; 0403-70000-교제비</p>
        </div>

        {/* 안내 배너 (teacher) */}
        {isTeacher && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-3 text-sm text-amber-700">
            저장 시 <span className="font-semibold">승인 대기</span> 상태로 등록됩니다. 장부 항목이 있으면 연결하고, 없으면 회계 담당자가 승인 시 추가합니다.
          </div>
        )}

        {/* 장부 선택 + 파일 선택 */}
        <div className="bg-white rounded-xl shadow-sm p-5 flex flex-wrap items-end gap-4">
          {!isTeacher && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">대상 장부</label>
              <select
                value={selectedLedgerId}
                onChange={(e) => setSelectedLedgerId(e.target.value)}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm
                  focus:ring-2 focus:ring-primary-500 outline-none min-w-[180px]"
              >
                {ledgers.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
          )}
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => e.target.files && handleFiles(e.target.files)}
            />
            <Button variant="secondary" onClick={() => fileInputRef.current?.click()}>
              <Upload className="h-4 w-4" />
              이미지 선택 (다중)
            </Button>
          </div>
        </div>

        {/* 드래그 앤 드롭 */}
        {rows.length === 0 && (
          <div
            className="border-2 border-dashed border-gray-300 rounded-xl p-16 text-center
              hover:border-primary-400 transition-colors cursor-pointer"
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); e.dataTransfer.files && handleFiles(e.dataTransfer.files); }}
          >
            <Upload className="h-10 w-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">클릭하거나 파일을 여기로 드래그하세요</p>
            <p className="text-xs text-gray-400 mt-1">JPG, PNG, HEIC 등 이미지 파일</p>
          </div>
        )}

        {/* 테이블 */}
        {rows.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-4 text-sm text-gray-500">
              <span>총 {rows.length}건</span>
              {savedCount  > 0 && <span className="text-emerald-600">✓ 저장 {savedCount}건</span>}
              {pendingCount > 0 && <span className="text-amber-600">대기 {pendingCount}건</span>}
              {errorCount  > 0 && <span className="text-rose-600">⚠ 보류 {errorCount}건</span>}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500 text-left">
                    <th className="px-3 py-2 w-20">미리보기</th>
                    <th className="px-3 py-2">파일명</th>
                    <th className="px-3 py-2 w-36">날짜</th>
                    <th className="px-3 py-2 w-32 text-right">금액</th>
                    <th className="px-3 py-2 w-36">카테고리</th>
                    <th className="px-3 py-2 w-40">항목명</th>
                    <th className="px-3 py-2 w-64">장부 연결</th>
                    <th className="px-3 py-2 w-16 text-center">저장</th>
                    <th className="px-3 py-2 w-8"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.map((row) => (
                    <ReceiptTableRow
                      key={row.localId}
                      row={row}
                      categories={categories}
                      isTeacher={isTeacher}
                      onUpdate={(patch) => updateRow(row.localId, patch)}
                      onRefreshCandidates={(desc, amount) => {
                        const ledgerIdToUse = isTeacher ? teacherLedgerId : selectedLedgerId;
                        if (ledgerIdToUse) fetchCandidates(row.localId, ledgerIdToUse, desc, amount, row.date);
                      }}
                      onPreview={() => setPreviewModal({ open: true, url: row.previewUrl, name: row.file.name })}
                      onRemove={() => removeRow(row.localId)}
                      onSave={() => saveRow(row)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-5 py-3 border-t border-gray-100">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="text-sm text-primary-600 hover:text-primary-700 font-medium"
              >
                + 파일 추가
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 이미지 미리보기 모달 */}
      <Modal
        isOpen={previewModal.open}
        onClose={() => setPreviewModal({ open: false, url: '', name: '' })}
        title={previewModal.name}
        size="xl"
      >
        <div className="flex justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={previewModal.url} alt={previewModal.name} className="max-h-[70vh] object-contain rounded-lg" />
        </div>
      </Modal>

      {/* 중복 영수증 차단 안내 */}
      {duplicateQueue && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-rose-100 p-2 shrink-0">
                <AlertCircle className="h-5 w-5 text-rose-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">이미 제출된 영수증</h3>
                <p className="text-sm text-gray-500 mt-1">동일한 날짜와 금액의 영수증이 이미 존재합니다</p>
              </div>
            </div>
            <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">날짜</span>
                <span className="font-medium text-gray-900">{duplicateQueue.existing.date}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">항목명</span>
                <span className="font-medium text-gray-900 text-right max-w-[180px] truncate">{duplicateQueue.existing.description}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">금액</span>
                <span className="font-medium text-gray-900">{duplicateQueue.existing.final_amount.toLocaleString()}원</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">상태</span>
                <span className="font-medium text-gray-900">{
                  duplicateQueue.existing.status === 'pending' ? '승인 대기' :
                  duplicateQueue.existing.status === 'approved' ? '승인됨' : duplicateQueue.existing.status
                }</span>
              </div>
            </div>
            <p className="text-xs text-gray-400">중복 제출이 필요하다면 회계 담당자에게 문의하세요</p>
            <div className="flex justify-end">
              <Button onClick={() => setDuplicateQueue(null)}>확인</Button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}

// ─── 행 컴포넌트 ─────────────────────────────────────────────────
interface RowProps {
  row: ReceiptRow;
  categories: Category[];
  isTeacher: boolean;
  onUpdate: (patch: Partial<ReceiptRow>) => void;
  onRefreshCandidates: (description: string, amount: string) => void;
  onPreview: () => void;
  onRemove: () => void;
  onSave: () => Promise<boolean>;
}

function ReceiptTableRow({ row, categories, isTeacher, onUpdate, onRefreshCandidates, onPreview, onRemove, onSave }: RowProps) {
  const isSaved  = row.saveStatus === 'saved';
  const isSaving = row.saveStatus === 'saving';
  const isError  = row.saveStatus === 'error';

  return (
    <tr className={`${isSaved ? 'opacity-50 bg-gray-50' : isError ? 'bg-rose-50 hover:bg-rose-100' : 'hover:bg-gray-50'} transition-colors`}>
      {/* 썸네일 */}
      <td className="px-3 py-2">
        <button onClick={onPreview} className="relative group block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={row.previewUrl} alt="" className="h-14 w-14 object-cover rounded-lg border border-gray-200" />
          <div className="absolute inset-0 rounded-lg bg-black/0 group-hover:bg-black/25 transition-colors
            flex items-center justify-center">
            <ZoomIn className="h-4 w-4 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        </button>
      </td>

      {/* 파일명 */}
      <td className="px-3 py-2">
        <p className="text-xs text-gray-500 truncate max-w-[100px]" title={row.file.name}>{row.file.name}</p>
      </td>

      {/* 날짜 */}
      <td className="px-3 py-2">
        <input
          type="date" value={row.date} disabled={isSaved}
          onChange={(e) => onUpdate({ date: e.target.value, saveStatus: 'idle', errorMsg: undefined })}
          className="w-full rounded border border-gray-300 px-2 py-1 text-xs
            focus:ring-1 focus:ring-primary-500 outline-none disabled:bg-gray-50"
        />
      </td>

      {/* 금액 */}
      <td className="px-3 py-2">
        <input
          type="text" inputMode="numeric" value={row.amount} disabled={isSaved}
          placeholder="0"
          onChange={(e) => {
            const v = formatAmountInput(e.target.value);
            onUpdate({ amount: v, saveStatus: row.saveStatus === 'error' ? 'idle' : row.saveStatus, errorMsg: undefined });
            onRefreshCandidates(row.description, v);
          }}
          className="w-full rounded border border-gray-300 px-2 py-1 text-xs text-right tabular-nums
            focus:ring-1 focus:ring-primary-500 outline-none disabled:bg-gray-50"
        />
      </td>

      {/* 카테고리 */}
      <td className="px-3 py-2">
        <select
          value={row.categoryId} disabled={isSaved}
          onChange={(e) => onUpdate({ categoryId: e.target.value, saveStatus: 'idle', errorMsg: undefined })}
          className="w-full rounded border border-gray-300 px-1.5 py-1 text-xs
            focus:ring-1 focus:ring-primary-500 outline-none disabled:bg-gray-50"
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
      </td>

      {/* 항목명 */}
      <td className="px-3 py-2">
        <input
          type="text" value={row.description} disabled={isSaved}
          placeholder="항목명"
          onChange={(e) => {
            onUpdate({ description: e.target.value, saveStatus: 'idle', errorMsg: undefined });
            onRefreshCandidates(e.target.value, row.amount);
          }}
          className="w-full rounded border border-gray-300 px-2 py-1 text-xs
            focus:ring-1 focus:ring-primary-500 outline-none disabled:bg-gray-50"
        />
      </td>

      {/* 장부 연결 */}
      <td className="px-3 py-2">
        {isSaved ? (
          <span className="text-xs text-emerald-600">저장됨</span>
        ) : (
          <div className="space-y-1.5">
            {/* 모드 토글 */}
            <div className="flex gap-1">
              <button
                onClick={() => onUpdate({ matchMode: 'link', selectedCandidateId: row.candidates[0]?.id ?? null })}
                className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border transition-colors ${
                  row.matchMode === 'link'
                    ? 'bg-primary-50 border-primary-400 text-primary-700'
                    : 'border-gray-300 text-gray-400 hover:border-gray-400'
                }`}
              >
                <Link className="h-2.5 w-2.5" />기존 연결
              </button>
              <button
                onClick={() => onUpdate({ matchMode: 'new', selectedCandidateId: null })}
                className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border transition-colors ${
                  row.matchMode === 'new'
                    ? 'bg-primary-50 border-primary-400 text-primary-700'
                    : 'border-gray-300 text-gray-400 hover:border-gray-400'
                }`}
              >
                <FilePlus className="h-2.5 w-2.5" />새 항목
              </button>
            </div>

            {/* 후보 드롭다운 */}
            {row.matchMode === 'link' && (
              row.candidates.length > 0 ? (
                <div className="space-y-0.5">
                  <select
                    value={row.selectedCandidateId || ''}
                    onChange={(e) => {
                      const candidateId = e.target.value || null;
                      const cand = row.candidates.find((c) => c.id === candidateId);
                      onUpdate({ selectedCandidateId: candidateId, ...(cand ? { date: cand.date } : {}) });
                    }}
                    className="w-full rounded border border-gray-300 px-1.5 py-1 text-[10px]
                      focus:ring-1 focus:ring-primary-500 outline-none"
                  >
                    <option value="">-- 선택 --</option>
                    {row.candidates.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.date} · {c.description} · {formatCurrency(c.amount)}
                      </option>
                    ))}
                  </select>
                  {row.selectedCandidateId && (() => {
                    const cand = row.candidates.find((c) => c.id === row.selectedCandidateId);
                    return cand ? (
                      <span className={`inline-block text-[10px] px-1.5 py-0.5 rounded-full font-medium ${confidenceColor[cand.confidence]}`}>
                        {confidenceLabel[cand.confidence]}
                      </span>
                    ) : null;
                  })()}
                </div>
              ) : (
                <p className="text-[10px] text-gray-400">매칭 후보 없음 — 새 항목으로 저장됩니다</p>
              )
            )}
            {row.matchMode === 'new' && (
              <p className="text-[10px] text-gray-400">장부에 새 항목으로 추가됩니다</p>
            )}
          </div>
        )}
      </td>

      {/* 저장 */}
      <td className="px-3 py-2 text-center">
        {isSaved   ? <CheckCircle className="h-5 w-5 text-emerald-500 mx-auto" /> :
         isSaving  ? <Loader2 className="h-5 w-5 text-primary-500 animate-spin mx-auto" /> :
         isError ? (
           <div className="flex flex-col items-center gap-0.5">
             <button onClick={onSave} title="직접 저장 시도">
               <AlertCircle className="h-5 w-5 text-rose-500 mx-auto" />
             </button>
             <span className="text-[9px] text-rose-400 text-center leading-tight max-w-[60px]">{row.errorMsg}</span>
           </div>
         ) :
         row.saveStatus === 'failed' ? (
           <button onClick={onSave} title="다시 시도">
             <AlertCircle className="h-5 w-5 text-red-500 mx-auto" />
           </button>
         ) : (
           <button onClick={onSave} className="text-xs text-primary-600 hover:text-primary-800 font-medium">
             저장
           </button>
         )}
      </td>

      {/* 제거 */}
      <td className="px-3 py-2">
        {!isSaved && (
          <button onClick={onRemove} className="text-gray-300 hover:text-red-400 transition-colors">
            <X className="h-4 w-4" />
          </button>
        )}
      </td>
    </tr>
  );
}
