'use client';

export const runtime = 'edge';


import { useState } from 'react';
import { useToast } from '@/components/ui/Toast';
import AppShell from '@/components/layout/AppShell';
import Button from '@/components/ui/Button';
import DatePicker from '@/components/ui/DatePicker';
import EmptyState from '@/components/ui/EmptyState';
import { formatCurrency, formatDateShort } from '@/lib/format';
import { BarChart3, Search } from 'lucide-react';

interface SummaryItem {
  category: string;
  total: number;
}

interface SummaryData {
  title: string;
  period: { startDate: string; endDate: string };
  summary: SummaryItem[];
  items: { expense: number }[];
}

export default function SettlementSummaryPage() {
  const toast = useToast();

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<SummaryData | null>(null);

  const handleFetch = async () => {
    if (!startDate || !endDate) {
      toast.error('시작일과 종료일을 선택해주세요');
      return;
    }
    setLoading(true);
    setData(null);
    try {
      const res = await fetch('/api/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startDate, endDate }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setData(json.data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '데이터를 불러올 수 없습니다');
    } finally {
      setLoading(false);
    }
  };

  const totalExpense = data?.summary.reduce((s, c) => s + c.total, 0) ?? 0;
  const maxTotal = data?.summary.length ? Math.max(...data.summary.map((s) => s.total)) : 0;

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Header */}
        <div className="bg-gradient-to-r from-primary-600 to-primary-500 rounded-2xl p-6 text-white">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-white/20 p-2.5">
              <BarChart3 className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">기간별 결산 조회</h1>
              <p className="text-sm text-white/80 mt-0.5">카테고리별 수입/지출 요약</p>
            </div>
          </div>
        </div>

        {/* Date range */}
        <div className="bg-white rounded-xl shadow-sm p-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <DatePicker label="시작일" value={startDate} onChange={setStartDate} required />
            <DatePicker label="종료일" value={endDate} onChange={setEndDate} required />
          </div>
          <Button onClick={handleFetch} loading={loading}>
            <Search className="h-4 w-4" />
            조회
          </Button>
        </div>

        {/* Results */}
        {data && (
          <div className="space-y-6">
            {data.summary.length === 0 ? (
              <EmptyState
                icon={BarChart3}
                title="해당 기간에 지출 항목이 없습니다"
                description="다른 기간을 선택해주세요"
              />
            ) : (
              <>
                {/* Summary table */}
                <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                  <div className="p-4 border-b border-gray-200">
                    <h2 className="text-base font-semibold text-gray-900">
                      {formatDateShort(data.period.startDate)} ~{' '}
                      {formatDateShort(data.period.endDate)} 결산 요약
                    </h2>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-200">
                          <th className="px-4 py-3 text-left font-medium text-gray-600">
                            카테고리
                          </th>
                          <th className="px-4 py-3 text-right font-medium text-gray-600">수입</th>
                          <th className="px-4 py-3 text-right font-medium text-gray-600">지출</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {data.summary.map((s, i) => (
                          <tr key={i} className="hover:bg-gray-50">
                            <td className="px-4 py-3 text-gray-900 font-medium">{s.category}</td>
                            <td className="px-4 py-3 text-right tabular-nums text-gray-400">-</td>
                            <td className="px-4 py-3 text-right tabular-nums text-rose-600 font-medium">
                              {formatCurrency(s.total)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-gray-50 border-t-2 border-gray-300">
                          <td className="px-4 py-3 font-bold text-gray-900">합계</td>
                          <td className="px-4 py-3 text-right tabular-nums text-gray-400">-</td>
                          <td className="px-4 py-3 text-right tabular-nums font-bold text-gray-900">
                            {formatCurrency(totalExpense)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>

                {/* Bar chart */}
                <div className="bg-white rounded-xl shadow-sm p-5">
                  <h2 className="text-base font-semibold text-gray-900 mb-4">
                    카테고리별 지출 비교
                  </h2>
                  <div className="space-y-3">
                    {data.summary.map((s, i) => {
                      const pct = maxTotal > 0 ? (s.total / maxTotal) * 100 : 0;
                      return (
                        <div key={i}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-medium text-gray-700">{s.category}</span>
                            <span className="text-sm tabular-nums text-gray-600">
                              {formatCurrency(s.total)}
                            </span>
                          </div>
                          <div className="w-full bg-gray-100 rounded-full h-5 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-rose-500 to-rose-400 transition-all duration-500"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <div className="text-right mt-0.5">
                            <span className="text-xs text-gray-400">
                              {totalExpense > 0
                                ? ((s.total / totalExpense) * 100).toFixed(1)
                                : 0}
                              %
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}
