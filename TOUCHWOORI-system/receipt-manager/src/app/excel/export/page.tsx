'use client';

import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/components/ui/Toast';
import AppShell from '@/components/layout/AppShell';
import Button from '@/components/ui/Button';
import { formatDateShort } from '@/lib/format';
import { Download, FileSpreadsheet } from 'lucide-react';
import type { Ledger } from '@/types';

export default function ExcelExportPage() {
  const toast = useToast();

  const [ledgers, setLedgers] = useState<Ledger[]>([]);
  const [loading, setLoading] = useState(true);
  const [exportLedger, setExportLedger] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [exporting, setExporting] = useState(false);

  const fetchLedgers = useCallback(async () => {
    try {
      const res = await fetch('/api/ledgers');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      const active = (json.data as Ledger[]).filter((l) => l.is_active);
      setLedgers(active);
      if (active.length > 0) setExportLedger(active[0].id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '장부 목록을 불러올 수 없습니다');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { fetchLedgers(); }, [fetchLedgers]);

  const handleExport = async () => {
    if (!exportLedger) { toast.error('장부를 선택해주세요'); return; }
    setExporting(true);
    try {
      const body: Record<string, string> = { ledgerId: exportLedger };
      if (startDate) body.startDate = startDate;
      if (endDate) body.endDate = endDate;

      const res = await fetch('/api/excel/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) { const j = await res.json(); throw new Error(j.error); }

      const blob = await res.blob();
      const disposition = res.headers.get('Content-Disposition') || '';
      const match = disposition.match(/filename\*?=(?:UTF-8'')?(.+)/);
      const filename = match ? decodeURIComponent(match[1]) : '장부.xlsx';
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a); URL.revokeObjectURL(url);
      toast.success('엑셀 파일이 다운로드되었습니다');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '내보내기에 실패했습니다');
    } finally {
      setExporting(false);
    }
  };

  const selectedLedger = ledgers.find((l) => l.id === exportLedger);

  return (
    <AppShell>
      <div className="space-y-6 max-w-lg">
        {/* Header */}
        <div className="bg-gradient-to-r from-primary-600 to-primary-500 rounded-2xl p-6 text-white">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-white/20 p-2.5">
              <FileSpreadsheet className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">엑셀 내보내기</h1>
              <p className="text-sm text-white/80 mt-0.5">장부 데이터를 엑셀 파일로 다운로드합니다</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-5 space-y-4">
          {/* 장부 선택 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">장부</label>
            <select
              value={exportLedger}
              onChange={(e) => setExportLedger(e.target.value)}
              disabled={loading}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm
                focus:ring-2 focus:ring-primary-500 focus:border-primary-500
                outline-none transition-shadow"
            >
              {ledgers.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </div>

          {/* 기간 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              기간 <span className="text-xs text-gray-400">(미선택 시 전체)</span>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">시작일</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm
                    focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">종료일</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm
                    focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
                />
              </div>
            </div>
          </div>

          {/* 요약 */}
          {selectedLedger && (
            <div className="bg-gray-50 rounded-lg px-4 py-3 text-sm text-gray-600">
              <span className="font-medium text-gray-900">{selectedLedger.name}</span>
              {startDate || endDate ? (
                <span className="ml-2">
                  {startDate ? formatDateShort(startDate) : '전체'} ~{' '}
                  {endDate ? formatDateShort(endDate) : '전체'}
                </span>
              ) : (
                <span className="ml-2 text-gray-400">전체 기간</span>
              )}
            </div>
          )}

          <Button onClick={handleExport} loading={exporting} disabled={!exportLedger}>
            <Download className="h-4 w-4" />
            엑셀 다운로드
          </Button>
        </div>
      </div>
    </AppShell>
  );
}
