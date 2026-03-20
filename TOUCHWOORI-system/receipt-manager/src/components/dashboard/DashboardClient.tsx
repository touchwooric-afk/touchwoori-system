'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@/hooks/useUser';
import { createClient } from '@/lib/supabase';
import { formatCurrency } from '@/lib/format';
import {
  Users,
  ClipboardList,
  Receipt,
  BookOpen,
  TrendingDown,
  ArrowRight,
} from 'lucide-react';
import { CardSkeleton } from '@/components/ui/Skeleton';
import AppShell from '@/components/layout/AppShell';

interface DashboardStats {
  pendingUsers?: number;
  pendingReceipts?: number;
  totalBalance?: number;
  myRecentReceipts?: number;
}

function StatCard({
  icon: Icon,
  label,
  value,
  gradient,
  href,
  onClick,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  gradient?: boolean;
  href?: string;
  onClick?: () => void;
}) {
  const router = useRouter();
  return (
    <button
      onClick={() => {
        if (href) router.push(href);
        if (onClick) onClick();
      }}
      className={`
        rounded-xl p-6 text-left transition-all duration-200
        hover:-translate-y-1 hover:shadow-md
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

export default function DashboardClient() {
  const { user } = useUser();
  const [stats, setStats] = useState<DashboardStats>({});
  const [loading, setLoading] = useState(true);
  const router = useRouter();

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
      } else {
        const { count } = await supabase
          .from('receipts')
          .select('id', { count: 'exact', head: true })
          .eq('submitted_by', user.id);

        setStats({ myRecentReceipts: count ?? 0 });
      }

      setLoading(false);
    };
    fetchStats();
  }, [user]);

  if (!user) return null;

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            안녕하세요, {user.name}님
          </h1>
          <p className="text-sm text-gray-500 mt-1">{user.department_id} · {user.position}</p>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Master 대시보드 */}
            {user.role === 'master' && (
              <>
                <StatCard
                  icon={Users}
                  label="신청 대기"
                  value={stats.pendingUsers ?? 0}
                  gradient={!!stats.pendingUsers}
                  href="/master/users"
                />
                <StatCard
                  icon={ClipboardList}
                  label="미승인 영수증"
                  value={stats.pendingReceipts ?? 0}
                  href="/receipts/pending"
                />
                <StatCard
                  icon={BookOpen}
                  label="장부 보기"
                  value="바로가기"
                  href="/ledger"
                />
              </>
            )}

            {/* Accountant 대시보드 */}
            {user.role === 'accountant' && (
              <>
                <StatCard
                  icon={ClipboardList}
                  label="미승인 영수증"
                  value={stats.pendingReceipts ?? 0}
                  gradient={!!stats.pendingReceipts}
                  href="/receipts/pending"
                />
                <StatCard
                  icon={BookOpen}
                  label="장부 보기"
                  value="바로가기"
                  href="/ledger"
                />
                <StatCard
                  icon={TrendingDown}
                  label="결산"
                  value="바로가기"
                  href="/settlements"
                />
              </>
            )}

            {/* Teacher 대시보드 */}
            {user.role === 'teacher' && (
              <>
                <StatCard
                  icon={Receipt}
                  label="영수증 제출"
                  value="바로 제출"
                  gradient
                  href="/receipts/submit"
                />
                <StatCard
                  icon={ClipboardList}
                  label="내 제출 내역"
                  value={`${stats.myRecentReceipts ?? 0}건`}
                  href="/receipts/my"
                />
                <StatCard
                  icon={BookOpen}
                  label="장부 열람"
                  value="바로가기"
                  href="/ledger"
                />
              </>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}
