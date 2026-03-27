'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@/hooks/useUser';
import { useToast } from '@/components/ui/Toast';
import AppShell from '@/components/layout/AppShell';
import Button from '@/components/ui/Button';
import { formatCurrency } from '@/lib/format';
import { FileSpreadsheet, Upload, Download, CheckCircle, AlertCircle, XCircle, RotateCcw } from 'lucide-react';
import type { Ledger, Category } from '@/types';

interface LastSync {
  id: string;
  created_at: string;
  row_count: number;
  filename: string;
}

interface PreviewRow {
  rowIndex: number;
  date: string;
  description: string;
  income: number;
  expense: number;
  categoryName: string | null;
  categoryId: string | null;
  isValid: boolean;
  isDuplicate: boolean;
  isSimilar: boolean;
}

interface ImportPreview {
  filename: string;
  totalRows: number;
  validRows: number;
  duplicateRows: number;
  ledgerId: string;
  preview: PreviewRow[];
}

export default function ExcelPage() {
  const { user } = useUser();
  const router = useRouter();
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [ledgers, setLedgers] = useState<Ledger[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  // Import state
  const [importLedger, setImportLedger] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [lastSync, setLastSync] = useState<LastSync | null>(null);
  const [rollingBack, setRollingBack] = useState(false);
  const [rollbackConfirm, setRollbackConfirm] = useState(false);

  // 사용자가 수동으로 수정한 categoryId — rowIndex → categoryId
  const [overrides, setOverrides] = useState<Record<number, string>>({});
  // 가져오기에서 제외할 행 — rowIndex
  const [excluded, setExcluded] = useState<Set<number>>(new Set());

  // Export state
  const [exportLedger, setExportLedger] = useState('');
  const [exportStartDate, setExportStartDate] = useState('');
  const [exportEndDate, setExportEndDate] = useState('');
  const [exporting, setExporting] = useState(false);

  const isEditor = user?.role === 'accountant' || user?.role === 'master';

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
      const active = (json.data as Ledger[]).filter((l) => l.is_active);
      setLedgers(active);
      if (active.length > 0) {
        setImportLedger(active[0].id);
        setExportLedger(active[0].id);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '장부 목록을 불러올 수 없습니다');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const fetchCategories = useCallback(async () => {
    try {
      const res = await fetch('/api/categories');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setCategories((json.data as Category[]).filter((c) => c.is_active));
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    fetchLedgers();
    fetchCategories();
  }, [fetchLedgers, fetchCategories]);

  // 장부 변경 시 마지막 import 이력 조회
  useEffect(() => {
    if (!importLedger) return;
    setLastSync(null);
    setRollbackConfirm(false);
    fetch(`/api/excel/rollback?ledgerId=${importLedger}`)
      .then((r) => r.json())
      .then((j) => setLastSync(j.data ?? null))
      .catch(() => {});
  }, [importLedger]);

  // ─── Import ───
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setPreview(null);
      setOverrides({});
      setExcluded(new Set());
    }
  };

  const handleUpload = async () => {
    if (!selectedFile || !importLedger) {
      toast.error('파일과 장부를 선택해주세요');
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('ledgerId', importLedger);

      const res = await fetch('/api/excel/import', {
        method: 'POST',
        body: formData,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setPreview(json.data);
      setOverrides({});
      setExcluded(new Set());
      const unmatchedCount = json.data.preview.filter((r: PreviewRow) => r.isValid && !r.isDuplicate && !r.categoryId).length;
      const dupCount = json.data.duplicateRows ?? 0;
      const parts = [];
      if (json.data.validRows > 0) parts.push(`신규 ${json.data.validRows}건`);
      if (dupCount > 0) parts.push(`이미 있음 ${dupCount}건`);
      const suffix = unmatchedCount > 0 ? ` — 카테고리 미매칭 ${unmatchedCount}건 직접 선택 필요` : '';
      toast.info(`${json.data.totalRows}행 파싱 완료 (${parts.join(', ')})${suffix}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '파일 업로드에 실패했습니다');
    } finally {
      setUploading(false);
    }
  };

  // 미리보기 행의 최종 categoryId (override 우선, 없으면 파싱 결과)
  const getEffectiveCategoryId = (row: PreviewRow): string | null => {
    if (overrides[row.rowIndex] !== undefined) return overrides[row.rowIndex] || null;
    return row.categoryId;
  };

  // 가져오기 대상 행 목록 (중복 제외)
  const importableRows = preview
    ? preview.preview.filter((r) => r.isValid && !r.isDuplicate && !excluded.has(r.rowIndex) && getEffectiveCategoryId(r))
    : [];

  // 미매칭이면서 제외도 안 된 행 (경고)
  const unmatchedRows = preview
    ? preview.preview.filter((r) => r.isValid && !r.isDuplicate && !excluded.has(r.rowIndex) && !getEffectiveCategoryId(r))
    : [];

  const handleConfirmImport = async () => {
    if (!preview) return;

    if (unmatchedRows.length > 0) {
      toast.error(`카테고리가 없는 항목이 ${unmatchedRows.length}건 있습니다. 카테고리를 선택하거나 제외하세요.`);
      return;
    }

    if (importableRows.length === 0) {
      toast.error('가져올 항목이 없습니다.');
      return;
    }

    setConfirming(true);
    try {
      const validEntries = importableRows.map((r) => ({
        date: r.date,
        description: r.description,
        income: r.income,
        expense: r.expense,
        category_id: getEffectiveCategoryId(r)!,
      }));

      const res = await fetch('/api/excel/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          confirm: true,
          ledgerId: preview.ledgerId,
          entries: validEntries,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      const { insertedCount, skippedCount } = json.data;
      if (insertedCount === 0) {
        toast.info(json.data.message);
      } else if (skippedCount > 0) {
        toast.success(`${insertedCount}건 추가됨 — ${skippedCount}건은 이미 있어서 스킵`);
      } else {
        toast.success(`${insertedCount}건 추가됨`);
      }
      setPreview(null);
      setSelectedFile(null);
      setOverrides({});
      setExcluded(new Set());
      if (fileInputRef.current) fileInputRef.current.value = '';
      // 마지막 sync 이력 갱신
      if (insertedCount > 0) {
        fetch(`/api/excel/rollback?ledgerId=${preview.ledgerId}`)
          .then((r) => r.json())
          .then((j) => setLastSync(j.data ?? null))
          .catch(() => {});
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '가져오기에 실패했습니다');
    } finally {
      setConfirming(false);
    }
  };

  const handleRollback = async () => {
    if (!lastSync || !importLedger) return;
    setRollingBack(true);
    try {
      const res = await fetch(
        `/api/excel/rollback?ledgerId=${importLedger}&syncId=${lastSync.id}`,
        { method: 'DELETE' }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      toast.success(json.data.message);
      setLastSync(null);
      setRollbackConfirm(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '롤백에 실패했습니다');
    } finally {
      setRollingBack(false);
    }
  };

  // ─── Export ───
  const handleExport = async () => {
    if (!exportLedger) {
      toast.error('장부를 선택해주세요');
      return;
    }
    setExporting(true);
    try {
      const body: Record<string, string> = { ledgerId: exportLedger };
      if (exportStartDate) body.startDate = exportStartDate;
      if (exportEndDate) body.endDate = exportEndDate;

      const res = await fetch('/api/excel/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error);
      }

      const blob = await res.blob();
      const disposition = res.headers.get('Content-Disposition') || '';
      let filename = '장부.xlsx';
      const match = disposition.match(/filename\*?=(?:UTF-8'')?(.+)/);
      if (match) filename = decodeURIComponent(match[1]);

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success('엑셀 파일이 다운로드되었습니다');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '내보내기에 실패했습니다');
    } finally {
      setExporting(false);
    }
  };

  if (loading) return null;

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Header */}
        <div className="bg-gradient-to-r from-primary-600 to-primary-500 rounded-2xl p-6 text-white">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-white/20 p-2.5">
              <FileSpreadsheet className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">엑셀 연동</h1>
              <p className="text-sm text-white/80 mt-0.5">엑셀 파일로 장부 데이터를 가져오거나 내보냅니다</p>
            </div>
          </div>
        </div>

        <div className={`grid gap-6 ${preview ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-2'}`}>
          {/* ─── Import Section ─── */}
          <div className="bg-white rounded-xl shadow-sm p-5 space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b border-gray-200">
              <Upload className="h-5 w-5 text-primary-600" />
              <h2 className="text-lg font-semibold text-gray-900">가져오기</h2>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">대상 장부</label>
              <select
                value={importLedger}
                onChange={(e) => setImportLedger(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm
                  focus:ring-2 focus:ring-primary-500 focus:border-primary-500
                  outline-none transition-shadow"
              >
                {ledgers.map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            </div>

            {/* 마지막 가져오기 이력 + 롤백 */}
            {lastSync && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-amber-800">마지막 가져오기</p>
                    <p className="text-xs text-amber-700 mt-0.5">
                      {new Date(lastSync.created_at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      &nbsp;·&nbsp;{lastSync.row_count}건 추가됨
                    </p>
                  </div>
                  {!rollbackConfirm ? (
                    <button
                      onClick={() => setRollbackConfirm(true)}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700
                        border border-amber-300 bg-white rounded-lg px-3 py-1.5 hover:bg-amber-100 transition-colors"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      취소 (롤백)
                    </button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-amber-800 font-medium">{lastSync.row_count}건 삭제됩니다. 진행?</span>
                      <button
                        onClick={handleRollback}
                        disabled={rollingBack}
                        className="text-xs font-semibold text-white bg-red-500 hover:bg-red-600
                          rounded-lg px-3 py-1.5 transition-colors disabled:opacity-50"
                      >
                        {rollingBack ? '처리 중...' : '확인'}
                      </button>
                      <button
                        onClick={() => setRollbackConfirm(false)}
                        disabled={rollingBack}
                        className="text-xs text-gray-500 hover:text-gray-700 px-2"
                      >
                        취소
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">엑셀 파일</label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileChange}
                className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4
                  file:rounded-lg file:border-0 file:text-sm file:font-medium
                  file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100
                  file:cursor-pointer cursor-pointer"
              />
              <p className="mt-1 text-xs text-gray-400">
                인식 컬럼: 날짜 / 항목·설명·내용 / 입금액·수입액·수입 / 출금액·지출액·지출
              </p>
            </div>

            <Button
              onClick={handleUpload}
              loading={uploading}
              disabled={!selectedFile || !importLedger}
            >
              <Upload className="h-4 w-4" />
              업로드 및 미리보기
            </Button>

            {/* Preview table */}
            {preview && (
              <div className="space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <span className="text-sm text-gray-600">
                    총 {preview.totalRows}행 &nbsp;|&nbsp;
                    <span className="text-emerald-600 font-medium">신규 {importableRows.length}건</span>
                    {(preview.duplicateRows ?? 0) > 0 && (
                      <span className="text-gray-400"> &nbsp;|&nbsp; 중복 {preview.duplicateRows}건</span>
                    )}
                    {preview.preview.filter(r => r.isSimilar && !excluded.has(r.rowIndex)).length > 0 && (
                      <span className="text-yellow-600 font-medium"> &nbsp;|&nbsp; 유사 경고 {preview.preview.filter(r => r.isSimilar && !excluded.has(r.rowIndex)).length}건</span>
                    )}
                    {unmatchedRows.length > 0 && (
                      <span className="text-amber-600 font-medium"> &nbsp;|&nbsp; 카테고리 미선택 {unmatchedRows.length}건</span>
                    )}
                    {excluded.size > 0 && (
                      <span className="text-gray-400"> &nbsp;|&nbsp; 제외 {excluded.size}건</span>
                    )}
                  </span>
                  <span className="text-xs text-gray-400">{preview.filename}</span>
                </div>

                <div className="border rounded-lg overflow-x-auto max-h-[400px] overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 z-10">
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <th className="px-2 py-2 text-left font-medium text-gray-600 w-6">#</th>
                        <th className="px-2 py-2 text-left font-medium text-gray-600">날짜</th>
                        <th className="px-2 py-2 text-left font-medium text-gray-600">항목</th>
                        <th className="px-2 py-2 text-right font-medium text-gray-600">수입</th>
                        <th className="px-2 py-2 text-right font-medium text-gray-600">지출</th>
                        <th className="px-2 py-2 text-left font-medium text-gray-600 min-w-[120px]">카테고리</th>
                        <th className="px-2 py-2 text-center font-medium text-gray-600 w-8">제외</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {preview.preview.map((row) => {
                        const isExcluded = excluded.has(row.rowIndex);
                        const effectiveCatId = getEffectiveCategoryId(row);
                        const isUnmatched = row.isValid && !row.isDuplicate && !row.isSimilar && !effectiveCatId && !isExcluded;

                        return (
                          <tr
                            key={row.rowIndex}
                            className={`${
                              row.isDuplicate ? 'opacity-40 bg-gray-50' :
                              isExcluded ? 'opacity-40 bg-gray-50' :
                              !row.isValid ? 'bg-red-50' :
                              row.isSimilar ? 'bg-yellow-50' :
                              isUnmatched ? 'bg-amber-50' : ''
                            }`}
                          >
                            <td className="px-2 py-1.5 text-gray-400">{row.rowIndex}</td>
                            <td className="px-2 py-1.5 text-gray-600 whitespace-nowrap">
                              {row.date || <span className="text-red-400">날짜없음</span>}
                            </td>
                            <td className="px-2 py-1.5 text-gray-900 max-w-[150px] truncate">
                              {row.description || '-'}
                            </td>
                            <td className="px-2 py-1.5 text-right tabular-nums text-emerald-600">
                              {row.income > 0 ? formatCurrency(row.income) : '-'}
                            </td>
                            <td className="px-2 py-1.5 text-right tabular-nums text-rose-600">
                              {row.expense > 0 ? formatCurrency(row.expense) : '-'}
                            </td>
                            <td className="px-2 py-1.5">
                              {row.isDuplicate ? (
                                <span className="text-gray-400 text-xs">이미 있음</span>
                              ) : row.isSimilar ? (
                                <div className="space-y-1">
                                  <span className="inline-block text-[10px] font-medium text-yellow-700 bg-yellow-100 border border-yellow-300 rounded px-1.5 py-0.5">
                                    날짜·금액 동일 항목 있음
                                  </span>
                                  <select
                                    value={effectiveCatId || ''}
                                    onChange={(e) => setOverrides((prev) => ({ ...prev, [row.rowIndex]: e.target.value }))}
                                    disabled={isExcluded}
                                    className="w-full rounded border border-gray-300 bg-white text-xs px-1.5 py-1 outline-none focus:ring-1 focus:ring-primary-500"
                                  >
                                    <option value="">-- 선택 --</option>
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
                              ) : row.isValid ? (
                                <select
                                  value={effectiveCatId || ''}
                                  onChange={(e) => setOverrides((prev) => ({ ...prev, [row.rowIndex]: e.target.value }))}
                                  disabled={isExcluded}
                                  className={`w-full rounded border text-xs px-1.5 py-1 outline-none
                                    focus:ring-1 focus:ring-primary-500
                                    ${isUnmatched ? 'border-amber-400 bg-amber-50' : 'border-gray-300 bg-white'}
                                    ${isExcluded ? 'cursor-not-allowed' : ''}`}
                                >
                                  <option value="">-- 선택 --</option>
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
                              ) : (
                                <span className="text-red-400">유효하지 않음</span>
                              )}
                            </td>
                            <td className="px-2 py-1.5 text-center">
                              {row.isDuplicate ? null : row.isValid ? (
                                <button
                                  onClick={() =>
                                    setExcluded((prev) => {
                                      const next = new Set(prev);
                                      if (next.has(row.rowIndex)) next.delete(row.rowIndex);
                                      else next.add(row.rowIndex);
                                      return next;
                                    })
                                  }
                                  title={isExcluded ? '제외 해제' : '이 행 제외'}
                                  className={`rounded p-0.5 transition-colors ${
                                    isExcluded
                                      ? 'text-gray-400 hover:text-gray-600'
                                      : 'text-gray-300 hover:text-red-500'
                                  }`}
                                >
                                  <XCircle className="h-4 w-4" />
                                </button>
                              ) : (
                                <AlertCircle className="h-4 w-4 text-red-400 inline" />
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {unmatchedRows.length > 0 && (
                  <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
                    ⚠ 카테고리가 선택되지 않은 항목이 있습니다. 각 행의 카테고리를 선택하거나 X로 제외하세요.
                  </p>
                )}

                <div className="flex gap-3 justify-end">
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setPreview(null);
                      setSelectedFile(null);
                      setOverrides({});
                      setExcluded(new Set());
                      if (fileInputRef.current) fileInputRef.current.value = '';
                    }}
                    disabled={confirming}
                    shortcut="Esc"
                  >
                    취소
                  </Button>
                  <Button
                    onClick={handleConfirmImport}
                    loading={confirming}
                    disabled={unmatchedRows.length > 0 || importableRows.length === 0}
                    shortcut="↵"
                  >
                    <CheckCircle className="h-4 w-4" />
                    {importableRows.length}건 가져오기
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* ─── Export Section ─── */}
          {preview ? (
            // 미리보기 중: 한 줄 compact 형태
            <div className="bg-white rounded-xl shadow-sm px-5 py-4">
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2 shrink-0">
                  <Download className="h-4 w-4 text-primary-600" />
                  <span className="text-sm font-semibold text-gray-700">내보내기</span>
                </div>
                <select
                  value={exportLedger}
                  onChange={(e) => setExportLedger(e.target.value)}
                  className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm
                    focus:ring-2 focus:ring-primary-500 outline-none"
                >
                  {ledgers.map((l) => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
                <input
                  type="date" value={exportStartDate}
                  onChange={(e) => setExportStartDate(e.target.value)}
                  className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm
                    focus:ring-2 focus:ring-primary-500 outline-none"
                />
                <span className="text-gray-400 text-sm">~</span>
                <input
                  type="date" value={exportEndDate}
                  onChange={(e) => setExportEndDate(e.target.value)}
                  className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm
                    focus:ring-2 focus:ring-primary-500 outline-none"
                />
                <Button onClick={handleExport} loading={exporting} disabled={!exportLedger}>
                  <Download className="h-4 w-4" />
                  내보내기
                </Button>
              </div>
            </div>
          ) : (
            // 기본 상태: 풀 카드
            <div className="bg-white rounded-xl shadow-sm p-5 space-y-4">
              <div className="flex items-center gap-2 pb-3 border-b border-gray-200">
                <Download className="h-5 w-5 text-primary-600" />
                <h2 className="text-lg font-semibold text-gray-900">내보내기</h2>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">장부</label>
                <select
                  value={exportLedger}
                  onChange={(e) => setExportLedger(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm
                    focus:ring-2 focus:ring-primary-500 focus:border-primary-500
                    outline-none transition-shadow"
                >
                  {ledgers.map((l) => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    시작일 <span className="text-gray-400">(선택)</span>
                  </label>
                  <input
                    type="date"
                    value={exportStartDate}
                    onChange={(e) => setExportStartDate(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm
                      focus:ring-2 focus:ring-primary-500 focus:border-primary-500
                      outline-none transition-shadow"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    종료일 <span className="text-gray-400">(선택)</span>
                  </label>
                  <input
                    type="date"
                    value={exportEndDate}
                    onChange={(e) => setExportEndDate(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm
                      focus:ring-2 focus:ring-primary-500 focus:border-primary-500
                      outline-none transition-shadow"
                  />
                </div>
              </div>

              <Button
                onClick={handleExport}
                loading={exporting}
                disabled={!exportLedger}
              >
                <Download className="h-4 w-4" />
                엑셀 내보내기
              </Button>

              <p className="text-xs text-gray-400">
                날짜 범위를 지정하지 않으면 전체 기간의 데이터를 내보냅니다.
              </p>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
