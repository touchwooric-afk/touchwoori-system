'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  LayoutDashboard,
  Receipt,
  ClipboardList,
  BookOpen,
  FileText,
  Users,
  FileCheck,
} from 'lucide-react';
import { createClient } from '@/lib/supabase';
import { useUser } from '@/hooks/useUser';
import type { Role } from '@/types';

interface BottomTabsProps {
  role: Role;
}

interface TabItem {
  label: string;
  href: string;
  icon: React.ElementType;
  badge?: number;
}

function getTabs(role: Role, pendingUserCount?: number, rejectedCount?: number): TabItem[] {
  switch (role) {
    case 'master':
      return [
        { label: '홈', href: '/', icon: LayoutDashboard },
        { label: '영수증', href: '/receipts/pending', icon: FileCheck },
        { label: '관리', href: '/master/users', icon: Users, badge: pendingUserCount },
        { label: '장부', href: '/ledger', icon: BookOpen },
        { label: '결산', href: '/settlements', icon: FileText },
      ];
    case 'accountant':
      return [
        { label: '홈', href: '/', icon: LayoutDashboard },
        { label: '미승인', href: '/receipts/pending', icon: ClipboardList },
        { label: '제출', href: '/receipts/upload', icon: Receipt },
        { label: '장부', href: '/ledger', icon: BookOpen },
        { label: '결산', href: '/settlements', icon: FileText },
      ];
    case 'sub_master':
      return [
        { label: '홈', href: '/', icon: LayoutDashboard },
        { label: '관리', href: '/master/users', icon: Users, badge: pendingUserCount },
        { label: '장부', href: '/ledger', icon: BookOpen },
        { label: '결산', href: '/settlements', icon: FileText },
      ];
    case 'auditor':
    case 'overseer':
    case 'admin_viewer':
      return [
        { label: '홈', href: '/', icon: LayoutDashboard },
        { label: '장부', href: '/ledger', icon: BookOpen },
        { label: '결산', href: '/settlements', icon: FileText },
      ];
    case 'teacher':
    default:
      return [
        { label: '홈', href: '/', icon: LayoutDashboard },
        { label: '제출', href: '/receipts/upload', icon: Receipt },
        { label: '내역', href: '/receipts/my', icon: ClipboardList, badge: rejectedCount },
        { label: '장부', href: '/ledger', icon: BookOpen },
      ];
  }
}

export default function BottomTabs({ role }: BottomTabsProps) {
  const pathname = usePathname();
  const { user } = useUser();
  const [pendingUserCount, setPendingUserCount] = useState(0);
  const [rejectedCount, setRejectedCount] = useState(0);

  useEffect(() => {
    if (role !== 'master' && role !== 'sub_master') return;
    const supabase = createClient();
    supabase
      .from('users')
      .select('id')
      .eq('status', 'pending')
      .then(({ data, error }) => {
        setPendingUserCount(error ? 0 : (data?.length ?? 0));
      });
  }, [role]);

  // 반려된 내 영수증 수
  useEffect(() => {
    if (!user) return;
    const supabase = createClient();
    supabase
      .from('receipts')
      .select('id')
      .eq('submitted_by', user.id)
      .eq('status', 'rejected')
      .then(({ data, error }) => {
        setRejectedCount(error ? 0 : (data?.length ?? 0));
      });
  }, [user]);

  const tabs = getTabs(role, pendingUserCount, rejectedCount);

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-gray-200 safe-area-inset-bottom">
      <div className="flex items-center justify-around h-14">
        {tabs.map((tab) => {
          const isActive =
            tab.href === '/'
              ? pathname === '/'
              : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`
                relative flex flex-col items-center gap-0.5 px-3 py-1.5
                transition-colors duration-150
                ${isActive ? 'text-primary-600' : 'text-gray-400'}
              `}
            >
              <div className="relative">
                <tab.icon className="h-5 w-5" />
                {tab.badge != null && tab.badge > 0 && (
                  <span className="absolute -top-1.5 -right-2.5 bg-red-500 text-white text-[9px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1">
                    {tab.badge > 99 ? '99+' : tab.badge}
                  </span>
                )}
              </div>
              <span className="text-[10px] font-medium">{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
