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
} from 'lucide-react';
import type { Role } from '@/types';

interface BottomTabsProps {
  role: Role;
}

interface TabItem {
  label: string;
  href: string;
  icon: React.ElementType;
}

function getTabs(role: Role): TabItem[] {
  switch (role) {
    case 'master':
      return [
        { label: '홈', href: '/', icon: LayoutDashboard },
        { label: '관리', href: '/master/users', icon: Users },
        { label: '장부', href: '/ledger', icon: BookOpen },
        { label: '결산', href: '/settlements', icon: FileText },
      ];
    case 'accountant':
      return [
        { label: '홈', href: '/', icon: LayoutDashboard },
        { label: '미승인', href: '/receipts/pending', icon: ClipboardList },
        { label: '장부', href: '/ledger', icon: BookOpen },
        { label: '결산', href: '/settlements', icon: FileText },
      ];
    case 'teacher':
    default:
      return [
        { label: '홈', href: '/', icon: LayoutDashboard },
        { label: '제출', href: '/receipts/upload', icon: Receipt },
        { label: '내역', href: '/receipts/my', icon: ClipboardList },
        { label: '장부', href: '/ledger', icon: BookOpen },
      ];
  }
}

export default function BottomTabs({ role }: BottomTabsProps) {
  const pathname = usePathname();
  const tabs = getTabs(role);

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
                flex flex-col items-center gap-0.5 px-3 py-1.5
                transition-colors duration-150
                ${isActive ? 'text-primary-600' : 'text-gray-400'}
              `}
            >
              <tab.icon className="h-5 w-5" />
              <span className="text-[10px] font-medium">{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
