'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/Toast';
import AppShell from '@/components/layout/AppShell';
import Button from '@/components/ui/Button';
import EmptyState from '@/components/ui/EmptyState';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { formatDateShort } from '@/lib/format';
import { History, FileText, Plus } from 'lucide-react';
import type { Settlement } from '@/types';

export default function SettlementHistoryPage() {
  const router = useRouter();
  const toast = useToast();

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
      toast.error(err instanceof Error ? err.message : '결산 이력을 불러올 수 없습니다');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchSettlements();
  }, [fetchSettlements]);

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Header */}
        <div className="bg-gradient-to-r from-primary-600 to-primary-500 rounded-2xl p-6 text-white">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-white/20 p-2.5">
              <History className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">과거 결산 이력</h1>
              <p className="text-sm text-white/80 mt-0.5">이전 결산 기간을 확인하고 PDF를 재출력합니다</p>
            </div>
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <TableSkeleton rows={5} cols={4} />
        ) : settlements.length === 0 ? (
          <EmptyState
            icon={History}
            title="아직 결산 이력이 없습니다"
            description="마스터 관리에서 결산 기간을 생성하세요"
            actionLabel="결산 기간 관리"
            onAction={() => router.push('/master/settlements')}
          />
        ) : (
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="px-4 py-3 text-left font-medium text-gray-600">제목</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">기간</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">생성일</th>
                    <th className="px-4 py-3 text-center font-medium text-gray-600">액션</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {settlements.map((s) => (
                    <tr key={s.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 text-gray-900 font-medium">{s.title}</td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                        {formatDateShort(s.start_date)} ~ {formatDateShort(s.end_date)}
                      </td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                        {formatDateShort(s.created_at)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() =>
                            router.push(`/settlements?settlement=${s.id}`)
                          }
                        >
                          <FileText className="h-3.5 w-3.5" />
                          PDF 재출력
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
