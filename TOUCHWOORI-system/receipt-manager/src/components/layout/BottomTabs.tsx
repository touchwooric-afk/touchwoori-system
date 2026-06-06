'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Receipt,
  ClipboardList,
  BookOpen,
  FileText,
  Users,
  FileCheck,
  CalendarCheck,
} from 'lucide-react';
import type { Role } from '@/types';

interface BottomTabsProps {
  role: Role;
  pendingUserCount?: number;
  rejectedCount?: number;
  onNavigate?: () => void;
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
        { label: '출석', href: '/attendance', icon: CalendarCheck },
        { label: '결산', href: '/settlements', icon: FileText },
      ];
    case 'accountant':
      return [
        { label: '홈', href: '/', icon: LayoutDashboard },
        { label: '미승인', href: '/receipts/pending', icon: ClipboardList },
        { label: '출석', href: '/attendance', icon: CalendarCheck },
        { label: '장부', href: '/ledger', icon: BookOpen },
        { label: '결산', href: '/settlements', icon: FileText },
      ];
    case 'sub_master':
      return [
        { label: '홈', href: '/', icon: LayoutDashboard },
        { label: '관리', href: '/master/users', icon: Users, badge: pendingUserCount },
        { label: '출석', href: '/attendance', icon: CalendarCheck },
        { label: '장부', href: '/ledger', icon: BookOpen },
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
        { label: '출석', href: '/attendance', icon: CalendarCheck },
      ];
  }
}

export default function BottomTabs({
  role,
  pendingUserCount = 0,
  rejectedCount = 0,
  onNavigate,
}: BottomTabsProps) {
  const pathname = usePathname();

  const tabs = getTabs(role, pendingUserCount, rejectedCount);

  return (
    <nav className="xl:hidden fixed bottom-0 left-0 right-0 z-30 glass-header border-t safe-area-inset-bottom">
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
              onClick={() => {
                if (!isActive) onNavigate?.();
              }}
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
