'use client';

export const runtime = 'edge';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AppShell from '@/components/layout/AppShell';
import Button from '@/components/ui/Button';
import EmptyState from '@/components/ui/EmptyState';
import Pagination from '@/components/ui/Pagination';
import StatusBadge from '@/components/ui/StatusBadge';
import { useActiveDept } from '@/contexts/DepartmentContext';
import { useToast } from '@/components/ui/Toast';
import { useUser } from '@/hooks/useUser';
import { createClient } from '@/lib/supabase';
import { compressImage, deleteReceiptImage } from '@/lib/image';
import { formatCurrency, formatDate } from '@/lib/format';
import { AlertTriangle, FileCheck2, Image as ImageIcon, RefreshCw, Search, UploadCloud } from 'lucide-react';
import type { ReceiptWithUser, ReceiptStatus } from '@/types';

type FileFilter = 'all' | 'with-file' | 'missing-file';
type ReceiptListItem = ReceiptWithUser & {
  categories?: { name: string; type: string } | null;
  evidence_entry?: EvidenceEntry | null;
};
type EvidenceEntry = {
  id: string;
  receipt_id: string;
  ledger_id: string;
  date: string;
  description: string;
  income: number;
  expense: number;
  ledgers?: { name: string; type: string } | null;
};
type LedgerOption = {
  id: string;
  name: string;
  type: string;
  is_active?: boolean;
};

const PAGE_SIZE = 20;

export default function EvidenceManagementPage() {
  const { user } = useUser();
  const { activeDept } = useActiveDept();
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [receipts, setReceipts] = useState<ReceiptListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<'all' | ReceiptStatus>('all');
  const [fileFilter, setFileFilter] = useState<FileFilter>('all');
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [ledgerId, setLedgerId] = useState('all');
  const [ledgers, setLedgers] = useState<LedgerOption[]>([]);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [replacing, setReplacing] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const selectedReceipt = receipts.find((receipt) => receipt.id === selectedId) || receipts[0] || null;

  const loadReceipts = useCallback(async () => {
    if (!activeDept) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
        department_id: activeDept,
        startDate: `${year}-01-01`,
        endDate: `${year}-12-31`,
        sort: 'date',
        direction: 'asc',
      });
      if (status !== 'all') params.set('status', status);
      if (ledgerId !== 'all') params.set('ledger_id', ledgerId);

      const res = await fetch(`/api/receipts?${params}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);

      const rows = (json.data || []) as ReceiptListItem[];
      setReceipts(rows);
      setTotal(json.total ?? rows.length);
      setSelectedId((current) => (rows.some((receipt) => receipt.id === current) ? current : rows[0]?.id || ''));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '지출증빙 목록을 불러오지 못했습니다');
    } finally {
      setLoading(false);
    }
  }, [activeDept, ledgerId, page, status, toast, year]);

  useEffect(() => {
    loadReceipts();
  }, [loadReceipts]);

  useEffect(() => {
    if (!activeDept) return;
    fetch(`/api/ledgers?department_id=${encodeURIComponent(activeDept)}`)
      .then((res) => res.json())
      .then((json) => {
        const rows = (json.data || []) as LedgerOption[];
        setLedgers(rows.filter((ledger) => ledger.is_active !== false && ledger.type !== 'main'));
      })
      .catch(() => setLedgers([]));
  }, [activeDept]);

  const filteredReceipts = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return receipts.filter((receipt) => {
      const display = getDisplayValues(receipt);
      if (fileFilter === 'with-file' && !receipt.image_url) return false;
      if (fileFilter === 'missing-file' && receipt.image_url) return false;
      if (!keyword) return true;
      return [
        receipt.description,
        display.description,
        receipt.vendor || '',
        receipt.submitter?.name || '',
        receipt.categories?.name || receipt.category?.name || '',
        String(receipt.final_amount),
        String(display.amount),
      ].some((value) => value.toLowerCase().includes(keyword));
    });
  }, [fileFilter, receipts, search]);

  const handleReplaceClick = () => {
    if (!selectedReceipt) return;
    fileInputRef.current?.click();
  };

  const handleRestorePending = async () => {
    if (!selectedReceipt) return;
    setRestoringId(selectedReceipt.id);
    try {
      const res = await fetch(`/api/receipts/${selectedReceipt.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'pending' }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);

      const restored = json.data as ReceiptListItem;
      setReceipts((prev) => {
        if (status !== 'all' && status !== restored.status) {
          return prev.filter((receipt) => receipt.id !== restored.id);
        }
        return prev.map((receipt) => (
          receipt.id === restored.id ? { ...receipt, ...restored } : receipt
        ));
      });
      setSelectedId((current) => (current === restored.id && status !== 'all' ? '' : current));
      toast.success('반려 상태를 대기중으로 복구했습니다');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '상태 복구에 실패했습니다');
    } finally {
      setRestoringId(null);
    }
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !selectedReceipt || !user) return;
    if (!file.type.startsWith('image/')) {
      toast.error('이미지 파일만 교체할 수 있습니다');
      return;
    }

    setReplacing(true);
    const supabase = createClient();
    const previousImageUrl = selectedReceipt.image_url;
    try {
      const compressed = await compressImage(file);
      const path = `${user.id}/${selectedReceipt.id}_evidence_${Date.now()}.jpg`;
      const { error: uploadError } = await supabase.storage.from('receipts').upload(path, compressed, {
        contentType: 'image/jpeg',
        upsert: false,
      });
      if (uploadError) throw new Error('새 증빙 파일 업로드에 실패했습니다');

      const { data: urlData } = supabase.storage.from('receipts').getPublicUrl(path);
      const nextImageUrl = urlData.publicUrl;

      const res = await fetch(`/api/receipts/${selectedReceipt.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_url: nextImageUrl }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);

      setReceipts((prev) => prev.map((receipt) => (
        receipt.id === selectedReceipt.id ? { ...receipt, image_url: nextImageUrl } : receipt
      )));
      toast.success('지출증빙 파일을 교체했습니다');

      if (previousImageUrl) {
        await deleteReceiptImage(supabase, previousImageUrl);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '파일 교체에 실패했습니다');
    } finally {
      setReplacing(false);
    }
  };

  const summary = useMemo(() => ({
    total: receipts.length,
    missing: receipts.filter((receipt) => !receipt.image_url).length,
    withFile: receipts.filter((receipt) => Boolean(receipt.image_url)).length,
  }), [receipts]);

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="rounded-2xl bg-gradient-to-r from-primary-700 to-primary-500 p-6 text-white shadow-[0_18px_42px_rgba(86,80,207,0.2)]">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-white/20 p-2.5">
                <FileCheck2 className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">지출증빙 관리</h1>
                <p className="mt-0.5 text-sm text-white/80">등록된 영수증 정보는 유지하고 첨부 파일만 빠르게 교체합니다</p>
              </div>
            </div>
            <Button
              variant="secondary"
              onClick={loadReceipts}
              loading={loading}
              className="!border-white/30 !bg-white/20 !text-white hover:!bg-white/30"
            >
              <RefreshCw className="h-4 w-4" />새로고침
            </Button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <SummaryCard label="현재 목록" value={`${summary.total}건`} />
          <SummaryCard label="첨부 있음" value={`${summary.withFile}건`} />
          <SummaryCard label="첨부 없음" value={`${summary.missing}건`} tone={summary.missing > 0 ? 'danger' : 'default'} />
        </div>

        <div className="glass-panel rounded-2xl p-4">
          <div className="grid gap-3 lg:grid-cols-[1fr_auto_auto_auto_auto]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="내용, 제출자, 가맹점, 금액 검색"
                className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
              />
            </div>
            <select
              value={year}
              onChange={(event) => {
                setYear(event.target.value);
                setPage(1);
              }}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
            >
              {Array.from({ length: 6 }, (_, index) => String(new Date().getFullYear() - index)).map((yearOption) => (
                <option key={yearOption} value={yearOption}>{yearOption}년</option>
              ))}
            </select>
            <select
              value={ledgerId}
              onChange={(event) => {
                setLedgerId(event.target.value);
                setPage(1);
              }}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
            >
              <option value="all">전체 장부</option>
              {ledgers.map((ledger) => (
                <option key={ledger.id} value={ledger.id}>{ledger.name}</option>
              ))}
            </select>
            <select
              value={status}
              onChange={(event) => {
                setStatus(event.target.value as 'all' | ReceiptStatus);
                setPage(1);
              }}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
            >
              <option value="all">전체 상태</option>
              <option value="pending">대기중</option>
              <option value="approved">승인됨</option>
              <option value="rejected">반려됨</option>
            </select>
            <select
              value={fileFilter}
              onChange={(event) => setFileFilter(event.target.value as FileFilter)}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
            >
              <option value="all">전체 첨부</option>
              <option value="with-file">첨부 있음</option>
              <option value="missing-file">첨부 없음</option>
            </select>
          </div>
          <p className="mt-3 text-xs text-gray-500">
            사용일 기준 오름차순으로 정렬됩니다. 장부별 조회는 장부 항목과 연결된 영수증만 표시합니다.
          </p>
        </div>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
          <section className="glass-panel overflow-hidden rounded-2xl">
            {loading ? (
              <div className="space-y-3 p-4">
                {[1, 2, 3, 4].map((item) => (
                  <div key={item} className="h-16 animate-pulse rounded-xl bg-gray-100" />
                ))}
              </div>
            ) : filteredReceipts.length === 0 ? (
              <div className="p-10">
                <EmptyState
                  icon={FileCheck2}
                  title="표시할 지출증빙이 없습니다"
                  description="필터를 바꾸거나 새로고침해보세요"
                />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[840px] text-sm">
                  <thead className="bg-gray-50 text-xs font-semibold text-gray-500">
                    <tr>
                      <th className="px-4 py-3 text-left">제출자</th>
                      <th className="px-4 py-3 text-left">사용일</th>
                      <th className="px-4 py-3 text-left">장부 항목</th>
                      <th className="px-4 py-3 text-right">금액</th>
                      <th className="px-4 py-3 text-left">상태</th>
                      <th className="px-4 py-3 text-center">첨부</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white/70">
                    {filteredReceipts.map((receipt) => {
                      const display = getDisplayValues(receipt);
                      const mismatch = hasReceiptLedgerMismatch(receipt);
                      return (
                        <tr
                          key={receipt.id}
                          onClick={() => setSelectedId(receipt.id)}
                          className={`cursor-pointer transition-colors ${
                            selectedReceipt?.id === receipt.id ? 'bg-primary-50/80' : 'hover:bg-gray-50'
                          }`}
                        >
                          <td className="px-4 py-3 font-semibold text-gray-900">{receipt.submitter?.name || '알 수 없음'}</td>
                          <td className="px-4 py-3 whitespace-nowrap text-gray-600">{formatDate(display.date)}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5">
                              <p className="max-w-[260px] truncate font-medium text-gray-900">{display.description}</p>
                              {mismatch && <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-warning-500" />}
                            </div>
                            <p className="mt-0.5 text-xs text-gray-500">
                              {display.ledgerName || receipt.vendor || receipt.categories?.name || receipt.category?.name || '-'}
                            </p>
                          </td>
                          <td className="px-4 py-3 text-right font-bold text-gray-900">{formatCurrency(display.amount)}</td>
                          <td className="px-4 py-3"><StatusBadge status={receipt.status} /></td>
                          <td className="px-4 py-3 text-center">
                            {receipt.image_url ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-success-50 px-2 py-1 text-xs font-semibold text-success-700">
                                <ImageIcon className="h-3 w-3" />있음
                              </span>
                            ) : (
                              <span className="inline-flex items-center rounded-full bg-danger-50 px-2 py-1 text-xs font-semibold text-danger-700">
                                없음
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <aside className="glass-panel rounded-2xl p-4 xl:sticky xl:top-20 xl:self-start">
            {selectedReceipt ? (
              <div className="space-y-4">
                <div>
                  {(() => {
                    const display = getDisplayValues(selectedReceipt);
                    const mismatch = hasReceiptLedgerMismatch(selectedReceipt);
                    return (
                      <>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold text-gray-500">선택된 지출증빙</p>
                      <h2 className="mt-1 text-lg font-bold text-gray-900">{display.description}</h2>
                      {display.ledgerName && (
                        <p className="mt-0.5 text-xs text-gray-500">{display.ledgerName}</p>
                      )}
                    </div>
                    <StatusBadge status={selectedReceipt.status} />
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                    <Info label="제출자" value={selectedReceipt.submitter?.name || '알 수 없음'} />
                    <Info label="사용일" value={formatDate(display.date)} />
                    <Info label="금액" value={formatCurrency(display.amount)} />
                    <Info label="분류" value={selectedReceipt.categories?.name || selectedReceipt.category?.name || '-'} />
                  </div>
                  {mismatch && (
                    <div className="mt-3 rounded-xl border border-warning-100 bg-warning-50 px-3 py-2.5">
                      <div className="flex items-center gap-1.5 text-sm font-semibold text-warning-700">
                        <AlertTriangle className="h-4 w-4" />
                        장부 항목과 제출 영수증 정보가 다릅니다
                      </div>
                      <div className="mt-2 grid gap-2 text-xs text-warning-700 sm:grid-cols-2">
                        <div className="rounded-lg bg-white/70 px-2.5 py-1.5">
                          <p className="font-semibold">장부 기준</p>
                          <p className="mt-0.5 truncate">{display.description}</p>
                          <p>{formatCurrency(display.amount)}</p>
                        </div>
                        <div className="rounded-lg bg-white/70 px-2.5 py-1.5">
                          <p className="font-semibold">제출 원본</p>
                          <p className="mt-0.5 truncate">{selectedReceipt.description}</p>
                          <p>{formatCurrency(selectedReceipt.final_amount)}</p>
                        </div>
                      </div>
                    </div>
                  )}
                      </>
                    );
                  })()}
                  {selectedReceipt.status === 'rejected' && (
                    <div className="mt-3 rounded-xl border border-danger-100 bg-danger-50 px-3 py-2.5">
                      <p className="text-sm font-semibold text-danger-700">현재 상태가 반려됨입니다</p>
                      <p className="mt-1 text-xs leading-relaxed text-danger-600">
                        파일 첨부가 정상이어도, 이전에 반려 처리된 영수증은 반려됨으로 표시됩니다.
                        잘못 반려된 건이면 아래 버튼으로 대기중 상태로 복구하세요.
                      </p>
                      {selectedReceipt.reject_reason && (
                        <p className="mt-2 rounded-lg bg-white/70 px-2.5 py-1.5 text-xs text-danger-700">
                          반려 사유: {selectedReceipt.reject_reason}
                        </p>
                      )}
                    </div>
                  )}
                </div>

                <div className="overflow-hidden rounded-xl border border-gray-200 bg-gray-50">
                  {selectedReceipt.image_url ? (
                    <a href={selectedReceipt.image_url} target="_blank" rel="noreferrer">
                      <img
                        src={selectedReceipt.image_url}
                        alt="현재 지출증빙"
                        className="max-h-[520px] w-full object-contain"
                      />
                    </a>
                  ) : (
                    <div className="flex h-72 flex-col items-center justify-center text-gray-400">
                      <ImageIcon className="h-10 w-10" />
                      <p className="mt-2 text-sm font-medium">첨부된 파일이 없습니다</p>
                    </div>
                  )}
                </div>

                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
                <Button onClick={handleReplaceClick} loading={replacing} className="w-full">
                  <UploadCloud className="h-4 w-4" />
                  {selectedReceipt.image_url ? '파일 교체' : '파일 첨부'}
                </Button>
                {selectedReceipt.status === 'rejected' && (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={handleRestorePending}
                    loading={restoringId === selectedReceipt.id}
                    className="w-full"
                  >
                    반려 상태를 대기중으로 복구
                  </Button>
                )}
                <p className="text-xs leading-relaxed text-gray-500">
                  파일 교체는 금액, 사용일, 카테고리를 변경하지 않습니다. 반려 상태는 필요한 경우 별도 버튼으로 대기중 복구만 가능합니다.
                </p>
              </div>
            ) : (
              <div className="py-16 text-center text-sm text-gray-500">왼쪽 목록에서 지출증빙을 선택하세요.</div>
            )}
          </aside>
        </div>

        <Pagination
          totalItems={total}
          pageSize={PAGE_SIZE}
          currentPage={page}
          onPageChange={setPage}
        />
      </div>
    </AppShell>
  );
}

function SummaryCard({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'danger' }) {
  return (
    <div className="glass-panel rounded-2xl p-5">
      <p className="text-sm font-semibold text-gray-500">{label}</p>
      <p className={`mt-2 text-3xl font-bold ${tone === 'danger' ? 'text-danger-700' : 'text-gray-900'}`}>{value}</p>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-gray-50 px-3 py-2">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="mt-0.5 truncate font-semibold text-gray-900">{value}</p>
    </div>
  );
}

function getDisplayValues(receipt: ReceiptListItem) {
  const entry = receipt.evidence_entry;
  const entryAmount = entry ? (entry.expense || entry.income || 0) : 0;
  return {
    date: entry?.date || receipt.date,
    description: entry?.description || receipt.description,
    amount: entry ? entryAmount : (receipt.approved_amount ?? receipt.final_amount),
    ledgerName: entry?.ledgers?.name || null,
  };
}

function hasReceiptLedgerMismatch(receipt: ReceiptListItem) {
  const entry = receipt.evidence_entry;
  if (!entry) return false;
  const entryAmount = entry.expense || entry.income || 0;
  const receiptAmount = receipt.approved_amount ?? receipt.final_amount;
  return entry.description !== receipt.description || entryAmount !== receiptAmount || entry.date !== receipt.date;
}
