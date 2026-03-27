'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@/hooks/useUser';
import { formatCurrency } from '@/lib/format';
import {
  Users,
  ClipboardList,
  Receipt,
  BookOpen,
  TrendingDown,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { CardSkeleton } from '@/components/ui/Skeleton';
import AppShell from '@/components/layout/AppShell';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  LabelList, ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';
import { createClient } from '@/lib/supabase';

interface DashboardStats {
  pendingUsers?: number;
  pendingReceipts?: number;
  myRecentReceipts?: number;
}

interface MonthlyData {
  key: string;   // YYYY-MM
  month: string; // 표시용 (2026.3)
  income: number;
  expense: number;
}

interface CategoryExpense {
  name: string;
  value: number;
}

interface ChartData {
  monthly: MonthlyData[];
  monthlyCategoryExpense: Record<string, CategoryExpense[]>;
}

const PIE_COLORS = [
  '#6366f1', '#8b5cf6', '#06b6d4', '#10b981',
  '#f59e0b', '#ef4444', '#ec4899', '#64748b',
];

/** 만원 단위 Y축 포맷 */
function formatWon(v: number): string {
  if (v === 0) return '0';
  if (v >= 10000) return `${Math.round(v / 10000)}만`;
  if (v >= 1000) return `${Math.round(v / 1000)}천`;
  return `${v}`;
}

// 부서명 → Storage 파일명 매핑 (한국어 파일명 미지원으로 영문 슬러그 사용)
const DEPARTMENT_BANNER_MAP: Record<string, string> = {
  '고등부': 'godeungbu',
  // 부서 추가 시 여기에 등록: '중등부': 'jungdeungbu'
};

function DepartmentLogo({ departmentId }: { departmentId: string }) {
  const [imgError, setImgError] = useState(false);
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const slug = DEPARTMENT_BANNER_MAP[departmentId];
  const imageUrl = slug
    ? `${supabaseUrl}/storage/v1/object/public/department-banners/${slug}.png`
    : null;

  if (!imageUrl || imgError) return null;

  return (
    <img
      src={imageUrl}
      alt={`${departmentId} 로고`}
      onError={() => setImgError(true)}
      className="h-16 w-auto max-w-[180px] object-contain shrink-0"
    />
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  gradient,
  href,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  gradient?: boolean;
  href?: string;
}) {
  const router = useRouter();
  return (
    <button
      onClick={() => href && router.push(href)}
      className={`
        rounded-xl p-6 text-left transition-all duration-200
        hover:-translate-y-1 hover:shadow-md w-full
        ${gradient
          ? 'bg-gradient-to-r from-primary-600 to-primary-500 text-white shadow-lg'
          : 'bg-white shadow-sm border border-gray-100'
        }
      `}
    >
      <div className="flex items-center justify-between">
        <div className={`rounded-lg p-2 ${gradient ? 'bg-white/20' : 'bg-primary-50'}`}>
          <Icon className={`h-5 w-5 ${gradient ? 'text-white' : 'text-primary-600'}`} />
        </div>
        <ArrowRight className={`h-4 w-4 ${gradient ? 'text-white/60' : 'text-gray-300'}`} />
      </div>
      <div className="mt-4">
        <p className={`text-2xl font-bold tabular-nums ${gradient ? 'text-white' : 'text-gray-900'}`}>
          {value}
        </p>
        <p className={`text-sm mt-1 ${gradient ? 'text-white/80' : 'text-gray-500'}`}>
          {label}
        </p>
      </div>
    </button>
  );
}

function ChartSection({ chartData, chartLoading }: { chartData: ChartData | null; chartLoading: boolean }) {
  const [monthOffset, setMonthOffset] = useState(0);

  if (chartLoading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 h-72 animate-pulse" />
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 h-72 animate-pulse" />
      </div>
    );
  }

  if (!chartData) return null;

  const hasMonthly = chartData.monthly.some((m) => m.income > 0 || m.expense > 0);

  const availableMonths = chartData.monthly.map((m) => m.key);
  const totalMonths = availableMonths.length;
  const selectedIndex = totalMonths - 1 + monthOffset;
  const selectedKey = availableMonths[selectedIndex] ?? availableMonths[totalMonths - 1];
  const selectedLabel = selectedKey ? `${Number(selectedKey.split('-')[1])}월` : '이번 달';

  const pieData = chartData.monthlyCategoryExpense[selectedKey] ?? [];
  const hasPie = pieData.length > 0;
  const pieTotal = pieData.reduce((sum, d) => sum + d.value, 0);

  const canPrev = selectedIndex > 0;
  const canNext = monthOffset < 0;

  // 6개월 합계 + 월별 누적 잔액
  const totalIncome = chartData.monthly.reduce((s, m) => s + m.income, 0);
  const totalExpense = chartData.monthly.reduce((s, m) => s + m.expense, 0);
  const netBalance = totalIncome - totalExpense;

  let running = 0;
  const monthlyWithBalance = chartData.monthly.map((m) => {
    running += m.income - m.expense;
    return { ...m, balance: running };
  });

  if (!hasMonthly && !hasPie) return null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* 월별 수입/지출 막대 */}
      {hasMonthly && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-700">월별 수입 / 지출 (최근 6개월)</h2>
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5 text-[11px] text-gray-500">
                <span className="inline-block w-4 h-0.5 bg-indigo-500 rounded" />
                총수입
              </span>
              <span className="flex items-center gap-1.5 text-[11px] text-gray-500">
                <span className="inline-block w-4 h-0.5 bg-amber-400 rounded" />
                총지출
              </span>
              <span className="flex items-center gap-1.5 text-[11px] text-gray-500">
                <svg width="16" height="6" viewBox="0 0 16 6">
                  <line x1="0" y1="3" x2="16" y2="3" stroke="#10b981" strokeWidth="2" strokeDasharray="4 2" />
                </svg>
                잔액
              </span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={210}>
            <LineChart data={monthlyWithBalance} margin={{ top: 22, right: 16, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} />
              <YAxis
                width={46}
                tick={{ fontSize: 11, fill: '#94a3b8' }}
                tickFormatter={formatWon}
              />
              <Tooltip
                formatter={(value, name) => [
                  formatCurrency(Number(value)),
                  name === 'income' ? '총수입' : name === 'expense' ? '총지출' : '잔액',
                ]}
                labelStyle={{ fontSize: 12 }}
                contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
              />
              {/* 총수입 */}
              <Line
                type="monotone"
                dataKey="income"
                stroke="#6366f1"
                strokeWidth={2}
                dot={{ r: 4, fill: '#6366f1', strokeWidth: 0 }}
                activeDot={{ r: 6 }}
                name="income"
              >
                <LabelList
                  dataKey="income"
                  position="top"
                  formatter={(v) => Number(v) > 0 ? formatWon(Number(v)) : ''}
                  style={{ fontSize: 10, fill: '#6366f1', fontWeight: 600 }}
                />
              </Line>
              {/* 총지출 */}
              <Line
                type="monotone"
                dataKey="expense"
                stroke="#f59e0b"
                strokeWidth={2}
                dot={{ r: 4, fill: '#f59e0b', strokeWidth: 0 }}
                activeDot={{ r: 6 }}
                name="expense"
              >
                <LabelList
                  dataKey="expense"
                  position="bottom"
                  formatter={(v) => Number(v) > 0 ? formatWon(Number(v)) : ''}
                  style={{ fontSize: 10, fill: '#f59e0b', fontWeight: 600 }}
                />
              </Line>
              {/* 잔액 (누적) */}
              <Line
                type="monotone"
                dataKey="balance"
                stroke="#10b981"
                strokeWidth={2}
                strokeDasharray="5 3"
                dot={{ r: 4, fill: '#10b981', strokeWidth: 0 }}
                activeDot={{ r: 6 }}
                name="balance"
              >
                <LabelList
                  dataKey="balance"
                  position="top"
                  formatter={(v) => Number(v) !== 0 ? formatWon(Number(v)) : ''}
                  style={{ fontSize: 10, fill: '#10b981', fontWeight: 600 }}
                />
              </Line>
            </LineChart>
          </ResponsiveContainer>

          {/* 6개월 합계 요약 — 상시 표시 */}
          <div className="mt-3 pt-3 border-t border-gray-100 grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-[10px] text-gray-400 mb-0.5 flex items-center justify-center gap-1">
                <span className="inline-block w-2 h-2 rounded-sm bg-indigo-500" />총수입
              </p>
              <p className="text-xs font-semibold text-indigo-600">{formatCurrency(totalIncome)}</p>
            </div>
            <div>
              <p className="text-[10px] text-gray-400 mb-0.5 flex items-center justify-center gap-1">
                <span className="inline-block w-2 h-2 rounded-sm bg-amber-400" />총지출
              </p>
              <p className="text-xs font-semibold text-amber-600">{formatCurrency(totalExpense)}</p>
            </div>
            <div>
              <p className="text-[10px] text-gray-400 mb-0.5 flex items-center justify-center gap-1">
                <span className="inline-block w-2 h-2 rounded-sm bg-emerald-500" />현재잔액
              </p>
              <p className={`text-xs font-semibold ${netBalance >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                {netBalance >= 0 ? '+' : ''}{formatCurrency(netBalance)}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 카테고리별 지출 도넛 + 월 선택 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-700">
            {selectedLabel} 카테고리별 지출
          </h2>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setMonthOffset((o) => o - 1)}
              disabled={!canPrev}
              className="rounded-lg p-1 text-gray-400 hover:text-gray-700 hover:bg-gray-100
                transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-xs font-medium text-gray-600 w-8 text-center">{selectedLabel}</span>
            <button
              onClick={() => setMonthOffset((o) => o + 1)}
              disabled={!canNext}
              className="rounded-lg p-1 text-gray-400 hover:text-gray-700 hover:bg-gray-100
                transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        {hasPie ? (
          <>
            {/* 도넛 + 중앙 총액 오버레이 */}
            <div className="relative">
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={52}
                    outerRadius={80}
                    paddingAngle={2}
                  >
                    {pieData.map((_, idx) => (
                      <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value) => [formatCurrency(Number(value)), '지출']}
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
                  />
                </PieChart>
              </ResponsiveContainer>
              {/* 중앙 총액 — 상시 표시 */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="text-center">
                  <p className="text-[10px] text-gray-400">총 지출</p>
                  <p className="text-sm font-bold text-gray-900">{formatCurrency(pieTotal)}</p>
                </div>
              </div>
            </div>

            {/* 카테고리 목록 — 상시 표시 (금액 포함) */}
            <div className="mt-2 space-y-1.5">
              {pieData.slice(0, 5).map((item, idx) => (
                <div key={idx} className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span
                      className="inline-block w-2 h-2 rounded-full shrink-0"
                      style={{ background: PIE_COLORS[idx % PIE_COLORS.length] }}
                    />
                    <span className="text-xs text-gray-600 truncate">{item.name}</span>
                  </div>
                  <span className="text-xs font-medium text-gray-800 ml-2 whitespace-nowrap">
                    {formatCurrency(item.value)}
                  </span>
                </div>
              ))}
              {pieData.length > 5 && (
                <p className="text-[10px] text-gray-400 text-right">+{pieData.length - 5}개 더 (호버 시 확인)</p>
              )}
            </div>
          </>
        ) : (
          <div className="h-[220px] flex items-center justify-center">
            <p className="text-sm text-gray-400">{selectedLabel} 지출 내역이 없습니다</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function DashboardClient() {
  const { user } = useUser();
  const [stats, setStats] = useState<DashboardStats>({});
  const [loading, setLoading] = useState(true);
  const [chartData, setChartData] = useState<ChartData | null>(null);
  const [chartLoading, setChartLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const fetchStats = async () => {
      const supabase = createClient();

      if (user.role === 'master' || user.role === 'accountant') {
        const [pendingReceipts, pendingUsers] = await Promise.all([
          supabase.from('receipts').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
          user.role === 'master'
            ? supabase.from('users').select('id', { count: 'exact', head: true }).eq('status', 'pending')
            : Promise.resolve({ count: 0 }),
        ]);
        setStats({
          pendingReceipts: pendingReceipts.count ?? 0,
          pendingUsers: typeof pendingUsers === 'object' && 'count' in pendingUsers ? (pendingUsers.count ?? 0) : 0,
        });
      } else if (user.role === 'teacher') {
        const { count } = await supabase
          .from('receipts')
          .select('id', { count: 'exact', head: true })
          .eq('submitted_by', user.id);
        setStats({ myRecentReceipts: count ?? 0 });
      }
      setLoading(false);
    };

    const fetchCharts = async () => {
      try {
        const res = await fetch('/api/dashboard');
        const json = await res.json();
        if (json.data) setChartData(json.data);
      } catch {
        // 차트 실패는 무시
      } finally {
        setChartLoading(false);
      }
    };

    fetchStats();
    fetchCharts();
  }, [user]);

  if (!user) return null;

  const showCharts = user.role !== 'sub_master' && user.role !== 'auditor';

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              안녕하세요, {user.name}님
            </h1>
            <p className="text-sm text-gray-500 mt-1">{user.department_id} · {user.position}</p>
          </div>
          <DepartmentLogo departmentId={user.department_id} />
        </div>

        {/* 통계 카드 */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {user.role === 'master' && (
              <>
                <StatCard icon={Users} label="신청 대기" value={stats.pendingUsers ?? 0} gradient={!!stats.pendingUsers} href="/master/users" />
                <StatCard icon={ClipboardList} label="미승인 영수증" value={stats.pendingReceipts ?? 0} href="/receipts/pending" />
                <StatCard icon={BookOpen} label="장부 보기" value="바로가기" href="/ledger" />
              </>
            )}
            {user.role === 'accountant' && (
              <>
                <StatCard icon={ClipboardList} label="미승인 영수증" value={stats.pendingReceipts ?? 0} gradient={!!stats.pendingReceipts} href="/receipts/pending" />
                <StatCard icon={BookOpen} label="장부 보기" value="바로가기" href="/ledger" />
                <StatCard icon={TrendingDown} label="결산" value="바로가기" href="/settlements" />
              </>
            )}
            {user.role === 'teacher' && (
              <>
                <StatCard icon={Receipt} label="영수증 제출" value="바로 제출" gradient href="/receipts/submit" />
                <StatCard icon={ClipboardList} label="내 제출 내역" value={`${stats.myRecentReceipts ?? 0}건`} href="/receipts/my" />
                <StatCard icon={BookOpen} label="장부 열람" value="바로가기" href="/ledger" />
              </>
            )}
            {user.role === 'sub_master' && (
              <>
                <StatCard icon={Users} label="사용자 관리" value="바로가기" href="/master/users" />
                <StatCard icon={BookOpen} label="장부 열람" value="바로가기" href="/ledger" />
              </>
            )}
            {user.role === 'auditor' && (
              <>
                <StatCard icon={BookOpen} label="장부 열람" value="바로가기" href="/ledger" />
              </>
            )}
          </div>
        )}

        {/* 차트 */}
        {showCharts && (
          <ChartSection chartData={chartData} chartLoading={chartLoading} />
        )}
      </div>
    </AppShell>
  );
}
